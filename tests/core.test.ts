import type { Session } from '../shared/types.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../server/core.ts';
const v1 = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));
const event = (s: Session, type: string, id: string, step = 'intro') => ({
  event_id: id,
  session_id: s.id,
  client_timestamp: new Date().toISOString(),
  type,
  step_id: step,
});
test('version is pinned; publication and rollback affect new sessions only', () => {
  const d = createStore(':memory:');
  assert.equal(d.publish(v1), 1);
  const old = d.start('A');
  const updated = structuredClone(v1);
  updated.steps.intro.content.title = 'Updated introduction';
  assert.equal(d.publish(updated), 2);
  const fresh = d.start('B');
  assert.equal(old.version, 1);
  assert.equal(fresh.version, 2);
  assert.equal(d.config(old.version).variants.A.steps[0].title, v1.steps.intro.content.title);
  assert.equal(d.rollback(), 1);
  assert.equal(d.start().version, 1);
});
test('assignment stays stable across session reads and state changes', () => {
  const d = createStore(':memory:');
  d.publish(v1);
  const s = d.start('B');
  d.submit(s, null);
  assert.equal(d.getSession(s.id)?.variant, 'B');
  assert.equal(d.getSession(s.id)?.current, 'work_mode');
});
test('batch deduplicates IDs, isolates invalid events and uses unique sessions', () => {
  const d = createStore(':memory:');
  d.publish(v1);
  const s = d.start('A', { utm_campaign: 'search' });
  const a = event(s, 'step_viewed', 'one'),
    b = event(s, 'step_completed', 'two');
  const result = d.ingest([a, a, { bad: true }, b]);
  assert.deepEqual(
    result.map((x) => x.status),
    ['accepted', 'duplicate', 'rejected', 'accepted'],
  );
  d.ingest([
    b,
    a,
    event(s, 'result_viewed', 'three', 'result'),
    event(s, 'result_viewed', 'four', 'result'),
    event(s, 'cta_clicked', 'five', 'result'),
    event(s, 'step_viewed', 'six', 'team_size'),
  ]);
  const x = d.analytics('search');
  assert.equal(x.sessions, 1);
  assert.equal(x.groups[0].started, 1);
  assert.equal(x.groups[0].result, 1);
  assert.equal(x.groups[0].cta, 1);
  assert.equal(x.groups[0].stepMetrics[0].conversion, 1);
});
