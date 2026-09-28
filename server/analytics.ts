import type { AnalyticsGroup, AnalyticsReport, Config, Session } from '../shared/types.ts';

export type AnalyticsEvent = {
  session_id: string;
  type: string;
  step_id: string | null;
  properties: string;
};
type SessionEvents = { types: Map<string, Set<string>>; transitions: Map<string, Set<string>> };

export function aggregate(
  sessions: Pick<Session, 'id' | 'version' | 'variant'>[],
  events: AnalyticsEvent[],
  config: (version: number) => Config,
  campaigns: string[],
): AnalyticsReport {
  const bySession = new Map<string, SessionEvents>();
  for (const event of events) {
    let summary = bySession.get(event.session_id);
    if (!summary) {
      summary = { types: new Map(), transitions: new Map() };
      bySession.set(event.session_id, summary);
    }
    const ids = summary.types.get(event.type) || new Set<string>();
    ids.add(event.step_id || '');
    summary.types.set(event.type, ids);
    if (event.type === 'step_completed' && event.step_id) {
      const properties = JSON.parse(event.properties) as { next_step_id?: unknown };
      if (typeof properties.next_step_id === 'string') {
        const targets = summary.transitions.get(event.step_id) || new Set<string>();
        targets.add(properties.next_step_id);
        summary.transitions.set(event.step_id, targets);
      }
    }
  }
  const groups = new Map<string, AnalyticsGroup>();
  for (const session of sessions) {
    const cfg = config(session.version),
      key = `${session.version}:${session.variant}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        version: session.version,
        sourceVersion: cfg.sourceVersion,
        funnelId: cfg.funnelId,
        variant: session.variant,
        started: 0,
        result: 0,
        cta: 0,
        resultWithCta: 0,
        resultRate: 0,
        ctr: 0,
        steps: {},
        stepMetrics: [],
      };
      groups.set(key, group);
    }
    const summary = bySession.get(session.id);
    // session_started is written by the server on creation. A session counts as started only
    // after the client reports something, so API-only creations and retried creates are ignored.
    if ([...(summary?.types.keys() ?? [])].some((type) => type !== 'session_started'))
      group.started++;
    const viewed = summary?.types.get('step_viewed') || new Set<string>();
    const results = summary?.types.get('result_viewed') || new Set<string>();
    if (results.size) group.result++;
    if (summary?.types.get('cta_clicked')?.size) {
      group.cta++;
      if (results.size) group.resultWithCta++;
    }
    const steps = cfg.variants[session.variant].steps,
      seen = new Set([...viewed, ...results]);
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (step.type === 'result' || !viewed.has(step.id)) continue;
      const metric = group.steps[step.id] || { views: 0, advanced: 0 };
      metric.views++;
      let targets = summary?.transitions.get(step.id);
      // Older events may lack targets. Only then derive possible edges from the pinned config.
      if (!targets) {
        targets = new Set((step.rules || []).map((rule) => rule.next));
        if (step.next) targets.add(step.next);
        else
          for (let nextIndex = index + 1; nextIndex < steps.length; nextIndex++) {
            const candidate = steps[nextIndex];
            targets.add(candidate.id);
            if (!candidate.visibleWhen) break;
          }
      }
      for (const target of targets)
        if (seen.has(target)) {
          metric.advanced++;
          break;
        }
      group.steps[step.id] = metric;
    }
  }
  for (const group of groups.values()) {
    group.resultRate = group.started ? group.result / group.started : 0;
    group.ctr = group.result ? group.resultWithCta / group.result : 0;
    group.stepMetrics = config(group.version)
      .variants[group.variant].steps.filter((step) => step.type !== 'result')
      .map((step) => {
        const { views, advanced } = group.steps[step.id] || { views: 0, advanced: 0 };
        return {
          id: step.id,
          title: step.title,
          views,
          dropoff: views - advanced,
          conversion: views ? advanced / views : 0,
        };
      });
  }
  return { sessions: sessions.length, groups: [...groups.values()], campaigns };
}
