import type { IncomingEvent } from '../shared/types.ts';
import { createStore } from '../server/core.ts';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const store = createStore(process.env.DB_PATH || 'data/funnel.sqlite');
if (!store.active()) store.publish(JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8')));
const campaigns = ['search', 'social', 'newsletter', 'direct'];
const before = store.analytics().sessions;
let duplicates = 0,
  accepted = 0;
try {
  for (let i = 0; i < 120; i++) {
    // Variant and campaign vary independently: every campaign contains A and B.
    const s = store.start(i % 2 ? 'A' : 'B', {
      utm_campaign: campaigns[Math.floor(i / 2) % 4],
      utm_source: i % 3 ? 'demo' : 'email',
    });
    const queue: IncomingEvent[] = [];
    const event = (type: string, step_id: string, properties: Record<string, unknown> = {}) =>
      queue.push({
        event_id: randomUUID(),
        session_id: s.id,
        client_timestamp: new Date(Date.now() - i * 1000 + queue.length).toISOString(),
        type,
        step_id,
        properties: Object.fromEntries(
          Object.entries(properties).filter(([, value]) => value !== undefined),
        ),
      });
    const stop = 2 + (i % 11);
    let count = 0;
    while (count++ < 20) {
      const step = store.steps(s).find((x) => x.id === s.current)!;
      const props =
        step.type === 'result' ? { result_id: step.resultId } : { step_type: step.type };
      event(step.type === 'result' ? 'result_viewed' : 'step_viewed', step.id, props);
      if (i % 5 === 0)
        event(step.type === 'result' ? 'result_viewed' : 'step_viewed', step.id, props);
      if (step.type === 'result') {
        if (i % 3 !== 0) {
          event('cta_clicked', step.id, { result_id: step.resultId, action: step.action });
          if (
            store
              .config(s.version)
              .eventDefinitions?.some((item) => item.name === 'recommendation_expanded')
          )
            event('recommendation_expanded', step.id, {
              result_id: step.resultId,
              action: step.action,
              source: 'result_cta',
            });
        }
        break;
      }
      if (count >= stop) break;
      let value: unknown = null;
      if (step.type === 'single')
        value =
          step.id === 'work_mode'
            ? ['remote', 'hybrid', 'office'][i % 3]
            : step.options![i % step.options!.length].value;
      if (step.type === 'multi') value = [step.options![i % step.options!.length].value];
      if (step.type === 'number')
        value =
          step.id === 'team_size'
            ? 5 + (i % 18)
            : step.id === 'office_days'
              ? i % 6
              : step.id === 'tool_count'
                ? 2 + (i % 9)
                : 4;
      store.submit(s, value); // Backend records answer/completion and their transition metadata.
      if (i % 7 === 0 && count === 3) {
        store.back(s);
        event('step_viewed', s.current, { step_type: step.type });
        store.submit(s, value);
      }
    }
    if (queue.length) {
      const batch = [...queue, queue[0]].reverse();
      for (const result of store.ingest(batch)) {
        assert.notEqual(result.status, 'rejected', JSON.stringify(result));
        if (result.status === 'duplicate') duplicates++;
        else accepted++;
      }
      if (i % 10 === 0) {
        const replay = store.ingest(batch);
        assert.ok(replay.every((r) => r.status === 'duplicate'));
        duplicates += replay.length;
      }
    }
  }
  const report = store.analytics();
  assert.equal(report.sessions - before, 120);
  console.log(
    JSON.stringify(
      {
        generated: 120,
        version: store.active(),
        sourceVersion: store.config().sourceVersion,
        acceptedEvents: accepted,
        duplicateReceipts: duplicates,
        groups: report.groups.map((g) => ({
          version: g.version,
          variant: g.variant,
          started: g.started,
          result: g.result,
          cta: g.cta,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  store.db.close();
}
