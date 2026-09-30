import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createStore } from '../server/core.ts';
import { createApp } from '../server/app.ts';
import type { Session } from '../shared/types.ts';
import { reachResult } from './helpers.ts';

const v3 = JSON.parse(readFileSync('configs/workstyle-v3.json', 'utf8'));
const event = (session: Session, type: string, step_id = 'result', properties = {}) => ({
  event_id: randomUUID(),
  session_id: session.id,
  client_timestamp: new Date().toISOString(),
  type,
  step_id,
  properties,
});

test('HTTP cannot forge a result, CTA or navigation; valid events survive a hostile batch', async (t) => {
  const store = createStore(':memory:');
  store.publish(v3);
  const server = createApp(store, 'test-token').listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  let state = await post('/api/session', { variant: 'A' });
  const session = state.session as Session;
  const attacks = [
    event(session, 'result_viewed'),
    event(session, 'cta_clicked'),
    event(session, 'result_viewed', 'intro'),
    event(session, 'cta_clicked', 'intro'),
    event(session, 'step_viewed', 'result'),
    event(session, 'step_viewed', 'tool_count'),
    event(session, 'session_started', 'intro'),
    event(session, 'answer_submitted', 'intro', { answer_kind: 'info' }),
    event(session, 'step_completed', 'intro', { next_step_id: 'result' }),
    event(session, 'back_clicked', 'result', { destination_step_id: 'intro' }),
    event(session, 'recommendation_expanded', 'result', { source: 'result_cta' }),
    { ...event(session, 'result_viewed'), origin: 'server', version: 1, variant: 'B' },
  ];
  const valid = event(session, 'step_viewed', 'intro', { step_type: 'info' });
  const result = await post('/api/events', [...attacks, valid, valid]);
  assert.deepEqual(
    result.results.map((r: { status: string }) => r.status),
    [...attacks.map(() => 'rejected'), 'accepted', 'duplicate'],
  );
  assert.equal(store.getSession(session.id)?.current, 'intro');
  assert.equal(
    store.db.prepare("SELECT count(*) n FROM events WHERE type='step_completed'").get()!.n,
    0,
  );
  assert.deepEqual([store.analytics().groups[0].result, store.analytics().groups[0].cta], [0, 0]);
  // Use the same public navigation and ingestion endpoints for the legitimate control.
  while (state.session.current !== 'result') {
    const step = state.config.variants.A.steps.find(
      (s: { id: string }) => s.id === state.session.current,
    );
    const value =
      step.type === 'info'
        ? null
        : step.type === 'number'
          ? Math.max(step.min ?? 0, 2)
          : step.type === 'multi'
            ? [step.options[0].value]
            : step.options[0].value;
    state = await post(`/api/session/${session.id}/answer`, { step_id: step.id, value });
  }
  const batch = [event(session, 'cta_clicked'), event(session, 'result_viewed')];
  assert.deepEqual(
    (await post('/api/events', batch)).results.map((r: { status: string }) => r.status),
    ['accepted', 'accepted'],
  );
  assert.deepEqual(
    (await post('/api/events', batch)).results.map((r: { status: string }) => r.status),
    ['duplicate', 'duplicate'],
  );
  assert.deepEqual(
    [
      store.analytics().groups[0].result,
      store.analytics().groups[0].cta,
      store.analytics().groups[0].ctr,
    ],
    [1, 1, 1],
  );
});

test('result metadata must match an issued snapshot; delayed earlier results and v3 events remain valid', () => {
  const store = createStore(':memory:');
  try {
    const config = structuredClone(v3);
    config.results.regulated_scale.cta.action = 'regulated_details';
    store.publish(config);
    const session = store.start('A');
    reachResult(store, session, { priorities: ['compliance'], security_constraints: 'strict' });
    const oldResult = store.steps(session).at(-1)!;
    assert.equal(oldResult.resultId, 'regulated_scale');
    const old = event(session, 'cta_clicked', 'result', {
      result_id: oldResult.resultId,
      action: oldResult.action,
    });
    assert.equal(
      store.ingest([event(session, 'result_viewed', 'result', { result_id: 'balanced' })])[0]
        .status,
      'rejected',
    );
    assert.equal(
      store.ingest([
        event(session, 'cta_clicked', 'result', {
          result_id: oldResult.resultId,
          action: 'expand_recommendation',
        }),
      ])[0].status,
      'rejected',
    );
    while (String(session.current) !== 'priorities') store.back(session);
    reachResult(store, session, { priorities: ['focus'] });
    assert.notEqual(store.steps(session).at(-1)!.resultId, oldResult.resultId);
    store.back(session);
    store.publish(v3);
    store.rollback();
    // Event delivery can happen after a rebranch, a rollback and session expiry.
    store.db
      .prepare('UPDATE sessions SET created_at=? WHERE id=?')
      .run('2020-01-01T00:00:00Z', session.id);
    assert.deepEqual(
      store
        .ingest([
          old,
          event(session, 'recommendation_expanded', 'result', {
            result_id: oldResult.resultId,
            action: oldResult.action,
            source: 'result_cta',
          }),
          event(session, 'result_viewed', 'result', { result_id: oldResult.resultId }),
          old,
        ])
        .map((r) => r.status),
      ['accepted', 'accepted', 'accepted', 'duplicate'],
    );
    assert.equal(store.analytics().groups[0].ctr, 1);
  } finally {
    store.db.close();
  }
});

test('server-derived custom events cannot be forged or used to establish reach', () => {
  const store = createStore(':memory:');
  try {
    const config = structuredClone(v3);
    config.events.allowed.push({
      name: 'intro_completed',
      emitOn: 'step_completed',
      stepId: 'intro',
      properties: ['next_step_id'],
    });
    config.events.allowed.push({ name: 'intro_read', stepId: 'intro', properties: [] });
    store.publish(config);
    const session = store.start('A');
    assert.equal(store.ingest([event(session, 'intro_read', 'intro')])[0].status, 'accepted');
    assert.equal(store.ingest([event(session, 'intro_read', 'team_size')])[0].status, 'rejected');
    assert.deepEqual(
      store
        .ingest([
          event(session, 'intro_completed', 'intro', { next_step_id: 'result' }),
          event(session, 'step_completed', 'intro', { next_step_id: 'result' }),
          event(session, 'result_viewed'),
        ])
        .map((r) => r.status),
      ['rejected', 'rejected', 'rejected'],
    );
    store.submit(session, null);
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM events WHERE type='intro_completed' AND origin='server'")
        .get()!.n,
      1,
    );
    assert.equal(store.ingest([event(session, 'intro_completed', 'intro')])[0].status, 'rejected');
  } finally {
    store.db.close();
  }
});

test('first Back after upgrade preserves the previously issued screen and result', () => {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-upgrade-back-'));
  const path = join(dir, 'test.sqlite');
  let store = createStore(path);
  try {
    store.publish(v3);
    const question = store.start('A');
    store.submit(question, null);
    const result = store.start('B');
    reachResult(store, result);
    const issued = store.steps(result).find((step) => step.id === result.current)!;
    store.db.exec('DROP TABLE step_contexts; ALTER TABLE events DROP COLUMN origin');
    store.db.close();
    store = createStore(path);
    store.back(store.getSession(question.id)!);
    store.back(store.getSession(result.id)!);
    assert.deepEqual(
      store
        .ingest([
          event(question, 'step_viewed', 'team_size'),
          event(result, 'cta_clicked', 'result', {
            result_id: issued.resultId,
            action: issued.action,
          }),
          event(result, 'result_viewed', 'result', { result_id: issued.resultId }),
        ])
        .map((receipt) => receipt.status),
      ['accepted', 'accepted', 'accepted'],
    );
    assert.equal(store.analytics().groups.find((group) => group.variant === 'B')!.ctr, 1);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy events stay unverified after migration, replay and later legitimate completion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-trust-'));
  const path = join(dir, 'test.sqlite');
  let store = createStore(path);
  try {
    store.publish(v3);
    const session = store.start('A', { utm_campaign: 'legacy' });
    const delayedIntro = event(session, 'step_viewed', 'intro');
    store.submit(session, null);
    const poisoned = event(session, 'result_viewed');
    store.db
      .prepare(
        'INSERT INTO events(event_id,session_id,server_timestamp,client_timestamp,type,version,variant,step_id,utm,properties) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        poisoned.event_id,
        session.id,
        poisoned.client_timestamp,
        poisoned.client_timestamp,
        poisoned.type,
        session.version,
        session.variant,
        'result',
        JSON.stringify(session.utm),
        '{}',
      );
    store.db.exec('DROP TABLE step_contexts; ALTER TABLE events DROP COLUMN origin');
    store.db.close();
    store = createStore(path);
    assert.equal(store.analytics('legacy').unverifiedEvents, 3);
    assert.equal(store.analytics('other').unverifiedEvents, 0);
    assert.equal(store.analytics().groups[0].result, 0);
    assert.equal(store.ingest([delayedIntro])[0].status, 'accepted');
    assert.equal(store.ingest([event(session, 'step_viewed', 'tool_count')])[0].status, 'rejected');
    const resumed = store.getSession(session.id)!;
    reachResult(store, resumed);
    assert.equal(store.ingest([poisoned])[0].status, 'duplicate');
    assert.equal(store.analytics().groups[0].result, 0);
    const legitimate = event(resumed, 'result_viewed');
    assert.equal(store.ingest([legitimate])[0].status, 'accepted');
    store.db.close();
    store = createStore(path);
    store.back(store.getSession(session.id)!);
    assert.equal(store.ingest([legitimate])[0].status, 'duplicate');
    assert.equal(store.ingest([event(resumed, 'cta_clicked')])[0].status, 'accepted');
    assert.equal(store.analytics().groups[0].ctr, 1);
    assert.equal(store.analytics().unverifiedEvents, 3);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
