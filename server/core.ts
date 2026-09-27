import { validateUtm } from './limits.ts';
import { aggregate, type AnalyticsEvent } from './analytics.ts';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeConfig, validateConfig, matches } from './config.ts';
import type {
  Session,
  IncomingEvent,
  EventReceipt,
  VersionSummary,
  Step,
  Config,
} from '../shared/types.ts';
import { definitions, validateProperties } from './events.ts';
export function createStore(path = 'data/funnel.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS configs (
      version INTEGER PRIMARY KEY,
      body TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      variant TEXT NOT NULL,
      utm TEXT NOT NULL,
      answers TEXT NOT NULL,
      history TEXT NOT NULL,
      current TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      server_timestamp TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      version INTEGER NOT NULL,
      variant TEXT NOT NULL,
      step_id TEXT,
      utm TEXT NOT NULL,
      properties TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session ON events(session_id);
  `);
  let transactionDepth = 0;
  const transaction = <T>(fn: () => T): T => {
    if (transactionDepth) return fn();
    db.exec('BEGIN IMMEDIATE');
    transactionDepth++;
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      transactionDepth--;
    }
  };
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  // SQLite's untyped row boundary is confined to these two helpers.
  const one = <T>(sql: string, ...args: SQLInputValue[]) =>
    prepare(sql).get(...args) as T | undefined;
  const all = <T>(sql: string, ...args: SQLInputValue[]) => prepare(sql).all(...args) as T[];
  const configs = new Map<number, Config>();
  const active = () =>
    Number(one<{ value: string }>("SELECT value FROM meta WHERE key='active'")?.value || 0);
  const config = (version = active()): Config => {
    let cached = configs.get(version);
    if (cached) return cached;
    const row = one<{ body: string }>('SELECT body FROM configs WHERE version=?', version);
    if (!row) throw Error('Configuration unavailable');
    cached = normalizeConfig(JSON.parse(row.body));
    configs.set(version, cached);
    return cached;
  };
  const publish = (configuration: unknown) =>
    transaction(() => {
      validateConfig(normalizeConfig(configuration));
      const version =
        Number(one<{ n: number | null }>('SELECT max(version) n FROM configs')?.n || 0) + 1;
      prepare('INSERT INTO configs VALUES(?,?,?)').run(
        version,
        JSON.stringify(configuration),
        new Date().toISOString(),
      );
      prepare(
        "INSERT INTO meta(key,value) VALUES('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(String(version));
      return version;
    });
  const experiment = (version = active()) => ({
    version,
    active: active(),
    config: config(version),
  });
  const updateExperiment = (expectedVersion: number, weightA: number, weightB: number) => {
    if (expectedVersion !== active())
      throw Error('Active version changed. Refresh before publishing.');
    if (
      !Number.isFinite(weightA) ||
      !Number.isFinite(weightB) ||
      weightA < 0 ||
      weightB < 0 ||
      weightA > 100 ||
      weightB > 100 ||
      weightA + weightB !== 100
    )
      throw Error('Weights must be numbers from 0 to 100 and total 100.');
    const raw = JSON.parse(
      one<{ body: string }>('SELECT body FROM configs WHERE version=?', expectedVersion)!.body,
    );
    const variants = raw.experiment?.variants || raw.variants;
    variants.A.weight = weightA;
    variants.B.weight = weightB;
    return publish(raw);
  };
  const rollback = () => {
    const version = active(),
      prior = one<{ n: number | null }>(
        'SELECT max(version) n FROM configs WHERE version<?',
        version,
      )?.n;
    if (!prior) throw Error('No previous version');
    prepare("UPDATE meta SET value=? WHERE key='active'").run(String(prior));
    return Number(prior);
  };
  const getSession = (id: string): Session | undefined => {
    const row = one<SessionRow>('SELECT * FROM sessions WHERE id=?', id);
    return row && readSession(row);
  };
  const save = (session: Session) =>
    prepare('UPDATE sessions SET answers=?,history=?,current=? WHERE id=?').run(
      JSON.stringify(session.answers),
      JSON.stringify(session.history),
      session.current,
      session.id,
    );
  const start = (variant?: string, utm: unknown = {}): Session =>
    transaction(() => {
      validateUtm(utm);
      const version = active();
      const { A, B } = config(version).variants;
      const weightA = A.weight ?? 50;
      const weightB = B.weight ?? 50;
      const assignedVariant =
        variant === 'A' || variant === 'B'
          ? variant
          : Math.random() < weightA / (weightA + weightB)
            ? 'A'
            : 'B';
      const first = config(version).variants[assignedVariant].steps[0].id;
      const session: Session = {
        id: randomUUID(),
        version,
        variant: assignedVariant,
        utm,
        answers: {},
        history: [],
        current: first,
        createdAt: new Date().toISOString(),
      };
      prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(
        session.id,
        session.version,
        session.variant,
        JSON.stringify(session.utm),
        '{}',
        '[]',
        session.current,
        session.createdAt,
      );
      record(session, 'session_started', first);
      return session;
    });
  const resultFor = (session: Session) => {
    const configuration = config(session.version),
      id =
        configuration.resultRules?.find((rule) => matches(rule.when, session.answers))?.resultId ||
        configuration.defaultResultId;
    if (!id || !configuration.results?.[id]) return undefined;
    const base = configuration.results[id],
      override = configuration.variants[session.variant].resultOverrides?.[id] || {};
    return { ...base, ...override, cta: { ...base.cta, ...override.cta } };
  };
  const steps = (session: Session): Step[] =>
    config(session.version).variants[session.variant].steps.map((step) => {
      if (step.type !== 'result') return step;
      const result = resultFor(session);
      return result
        ? {
            ...step,
            title: result.title,
            body: result.summary,
            cta: result.cta.label,
            action: result.cta.action,
            recommendations: result.recommendations,
            resultId: result.id,
          }
        : step;
    });
  const presentation = (session: Session): Config => {
    const configuration = config(session.version);
    return {
      ...configuration,
      variants: {
        ...configuration.variants,
        [session.variant]: { ...configuration.variants[session.variant], steps: steps(session) },
      },
    };
  };
  const visible = (session: Session, step: Step) => matches(step.visibleWhen, session.answers);
  const next = (session: Session, step: Step, sequence: Step[]) => {
    for (const rule of step.rules || []) {
      const answer = session.answers[rule.when.step];
      if (
        (rule.when.equals !== undefined && answer === rule.when.equals) ||
        (rule.when.includes !== undefined &&
          Array.isArray(answer) &&
          answer.includes(rule.when.includes)) ||
        (rule.when.gte !== undefined && typeof answer === 'number' && answer >= rule.when.gte)
      )
        return rule.next;
    }
    if (step.next) return step.next;
    const index = sequence.findIndex((candidate) => candidate.id === step.id);
    for (let nextIndex = index + 1; nextIndex < sequence.length; nextIndex++)
      if (visible(session, sequence[nextIndex])) return sequence[nextIndex].id;
  };
  const pathFor = (session: Session) => {
    const sequence = steps(session);
    if (config(session.version).sourceVersion !== undefined)
      return sequence.filter((x) => visible(session, x));
    const route: Step[] = [];
    let id: string | undefined = sequence[0]?.id;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const step = sequence.find((x) => x.id === id);
      if (!step) break;
      route.push(step);
      id = next(session, step, sequence);
    }
    return route;
  };
  const submit = (session: Session, value: unknown, clientTimestamp = new Date().toISOString()) => {
    if (typeof clientTimestamp !== 'string' || !Number.isFinite(Date.parse(clientTimestamp)))
      throw Error('Invalid client timestamp');
    const sequence = config(session.version).variants[session.variant].steps;
    const step = sequence.find((candidate) => candidate.id === session.current);
    if (!step || step.type === 'result') throw Error('Invalid step');
    validateAnswer(step, value);
    if (step.type !== 'info') session.answers[step.id] = value;
    const target = next(session, step, sequence);
    if (!target || !sequence.some((candidate) => candidate.id === target))
      throw Error('Invalid next step');
    // Answers on a now-hidden branch must not affect future result rules.
    for (const candidate of sequence)
      if (!visible(session, candidate)) delete session.answers[candidate.id];
    session.history.push(step.id);
    session.current = target;
    transaction(() => {
      save(session);
      if (step.type !== 'info')
        record(session, 'answer_submitted', step.id, { answer_kind: step.type }, clientTimestamp);
      record(session, 'step_completed', step.id, { next_step_id: target }, clientTimestamp);
    });
    return session;
  };
  const back = (session: Session, clientTimestamp = new Date().toISOString()) => {
    if (typeof clientTimestamp !== 'string' || !Number.isFinite(Date.parse(clientTimestamp)))
      throw Error('Invalid client timestamp');
    const from = session.current,
      prior = session.history.pop();
    if (prior) {
      session.current = prior;
      transaction(() => {
        save(session);
        record(session, 'back_clicked', from, { destination_step_id: prior }, clientTimestamp);
      });
    }
    return session;
  };
  const ingest = (batch: unknown): EventReceipt[] => {
    if (!Array.isArray(batch)) throw Error('Expected an array');
    if (batch.length > 50) throw Error('Event batch must contain at most 50 items.');
    return batch.map((raw, index) => {
      try {
        return transaction(() => {
          const e = raw as IncomingEvent;
          if (
            !e ||
            typeof e.event_id !== 'string' ||
            !e.event_id ||
            e.event_id.length > 200 ||
            typeof e.session_id !== 'string' ||
            typeof e.client_timestamp !== 'string' ||
            e.client_timestamp.length > 64 ||
            !Number.isFinite(Date.parse(e.client_timestamp)) ||
            typeof e.type !== 'string'
          )
            throw Error('Invalid event');
          const session = getSession(e.session_id);
          if (!session) throw Error('Unknown session');
          // Validate stored metadata too, so pre-existing oversized rows cannot amplify writes.
          validateUtm(session.utm);
          const cfg = config(session.version),
            sequence = cfg.variants[session.variant].steps,
            defs = definitions(cfg),
            definition = defs.find((d) => d.name === e.type);
          if (!definition) throw Error('Event not allowed for this version');
          if (typeof e.step_id !== 'string' || !sequence.some((step) => step.id === e.step_id))
            throw Error('A valid step_id is required');
          const clean = validateProperties(cfg, sequence, definition, e.properties);
          const insert = (id: string, type: string, properties: Record<string, unknown>) => {
            if (one('SELECT 1 FROM events WHERE event_id=?', id)) return 0;
            const count = one<{ n: number }>(
              'SELECT count(*) n FROM events WHERE session_id=?',
              session.id,
            )!.n;
            if (count >= 2000) throw Error('Session event limit reached.');
            if (cfg.funnelId)
              properties = {
                ...properties,
                funnel_id: cfg.funnelId,
                funnel_version: cfg.sourceVersion,
                experiment_id: cfg.experimentId,
              };
            return prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?)').run(
              id,
              session.id,
              new Date().toISOString(),
              e.client_timestamp,
              type,
              session.version,
              session.variant,
              e.step_id!,
              JSON.stringify(session.utm),
              JSON.stringify(properties),
            ).changes;
          };
          // One transaction commits the source event and its declared derivatives together.
          const changes = insert(e.event_id, e.type, clean);
          if (changes)
            for (const derived of defs.filter(
              (d) => d.emitOn === e.type && (!d.stepId || d.stepId === e.step_id),
            )) {
              const properties = Object.fromEntries(
                Object.entries(clean).filter(([key]) => derived.properties.includes(key)),
              );
              const id = createHash('sha256')
                .update(JSON.stringify([e.event_id, derived.name]))
                .digest('hex');
              insert(id, derived.name, validateProperties(cfg, sequence, derived, properties));
            }
          return { index, status: changes ? 'accepted' : 'duplicate' };
        });
      } catch (error) {
        return { index, status: 'rejected', error: (error as Error).message };
      }
    });
  };
  const record = (
    session: Session,
    type: string,
    step_id: string,
    properties: Record<string, unknown> = {},
    clientTimestamp = new Date().toISOString(),
  ) => {
    const result = ingest([
      {
        event_id: randomUUID(),
        session_id: session.id,
        client_timestamp: clientTimestamp,
        type,
        step_id,
        properties,
      },
    ])[0];
    if (result.status === 'rejected' && 'error' in result) throw Error(result.error);
  };
  const analytics = (campaign = '') => {
    const filter = campaign ? " WHERE json_extract(s.utm,'$.utm_campaign')=?" : '';
    const args = campaign ? [campaign] : [];
    const sessions = all<Pick<Session, 'id' | 'version' | 'variant'>>(
      'SELECT s.id,s.version,s.variant FROM sessions s' + filter,
      ...args,
    );
    const events = all<AnalyticsEvent>(
      'SELECT e.session_id,e.type,e.step_id,e.properties FROM events e JOIN sessions s ON s.id=e.session_id' +
        filter,
      ...args,
    );
    const campaigns = all<{ campaign: string }>(
      "SELECT DISTINCT json_extract(utm,'$.utm_campaign') AS campaign FROM sessions WHERE campaign IS NOT NULL AND campaign <> '' ORDER BY campaign",
    ).map((row) => row.campaign);
    return aggregate(sessions, events, config, campaigns);
  };
  const versions = (): VersionSummary[] =>
    all<{ version: number; published_at: string }>(
      'SELECT version,published_at FROM configs ORDER BY version DESC',
    ).map((row) => ({ ...row, sourceVersion: config(row.version).sourceVersion }));
  return {
    db,
    active,
    config,
    publish,
    experiment,
    updateExperiment,
    rollback,
    getSession,
    start,
    steps,
    presentation,
    pathFor,
    submit,
    back,
    ingest,
    analytics,
    versions,
  };
}
type SessionRow = {
  id: string;
  version: number;
  variant: Session['variant'];
  utm: string;
  answers: string;
  history: string;
  current: string;
  created_at: string;
};
function readSession(row: SessionRow): Session {
  return {
    id: row.id,
    version: row.version,
    variant: row.variant,
    utm: JSON.parse(row.utm),
    answers: JSON.parse(row.answers),
    history: JSON.parse(row.history),
    current: row.current,
    createdAt: row.created_at,
  };
}

function validateAnswer(step: Step, value: unknown) {
  if (step.type === 'single' && !step.options?.some((option) => option.value === value))
    throw Error(step.messages?.required || 'Choose an option');
  if (step.type === 'multi') {
    if (
      !Array.isArray(value) ||
      new Set(value).size !== value.length ||
      value.some((selected) => !step.options?.some((option) => option.value === selected))
    )
      throw Error('Choose valid options');
    if (value.length < (step.minSelections ?? (step.required ? 1 : 0)))
      throw Error(step.messages?.minSelections || 'Choose more options');
    if (step.maxSelections !== undefined && value.length > step.maxSelections)
      throw Error(step.messages?.maxSelections || 'Choose fewer options');
  }
  if (step.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw Error(step.messages?.required || 'Enter a number');
    if (step.min !== undefined && value < step.min)
      throw Error(step.messages?.min || 'Number is too small');
    if (step.max !== undefined && value > step.max)
      throw Error(step.messages?.max || 'Number is too large');
    if (
      step.inputStep !== undefined &&
      !Number.isInteger((value - (step.min || 0)) / step.inputStep)
    )
      throw Error('Enter a whole step value');
  }
}
