import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/core.ts';
const v1 = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));

test('weights publish immutably; zero weight, override, restart and rollback stay consistent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-ab-')),
    file = join(dir, 'test.sqlite');
  let d = createStore(file);
  try {
    d.publish(v1);
    const old = d.start('A');
    d.submit(old, null);
    const revision = d.updateExperiment(1, 0, 100);
    assert.equal(revision, 2);
    assert.equal(d.config(1).variants.A.weight, 50);
    assert.equal(d.experiment().config.variants.A.weight, 0);
    for (let i = 0; i < 8; i++) assert.equal(d.start().variant, 'B');
    const forced = d.start('A');
    assert.equal(forced.variant, 'A');
    assert.equal(forced.version, 2);
    d.db.close();
    d = createStore(file);
    assert.equal(d.getSession(old.id)?.variant, 'A');
    assert.equal(d.getSession(old.id)?.version, 1);
    assert.equal(d.getSession(old.id)?.current, 'team_size');
    assert.equal(d.getSession(forced.id)?.variant, 'A');
    assert.equal(d.getSession(forced.id)?.version, 2);
    assert.equal(d.rollback(), 1);
    assert.equal(d.active(), 1);
    assert.equal(d.config().variants.A.weight, 50);
  } finally {
    d.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('invalid weights and stale admin publication cannot change active config', () => {
  const d = createStore(':memory:');
  d.publish(v1);
  for (const [a, b] of [
    [-1, 101],
    [0, 0],
    [20, 30],
    [NaN, 100],
    [Infinity, 0],
  ])
    assert.throws(() => d.updateExperiment(1, a, b));
  assert.equal(d.active(), 1);
  assert.equal(d.versions().length, 1);
  d.updateExperiment(1, 100, 0);
  assert.throws(() => d.updateExperiment(1, 50, 50), /Active version changed/);
  assert.equal(d.start().variant, 'A');
  d.db.close();
});
test('A/B metrics count unique sessions and respect version and campaign', () => {
  const d = createStore(':memory:');
  d.publish(v1);
  const a = d.start('A', { utm_campaign: 'search' }),
    b = d.start('B', { utm_campaign: 'search' });
  d.start('A', { utm_campaign: 'other' });
  const ev = (s: typeof a, type: string) => ({
    event_id: randomUUID(),
    session_id: s.id,
    client_timestamp: new Date().toISOString(),
    type,
    step_id: 'result',
  });
  const batch = [
    ev(a, 'cta_clicked'),
    ev(a, 'result_viewed'),
    ev(a, 'result_viewed'),
    ev(b, 'result_viewed'),
  ];
  d.ingest(batch);
  d.ingest(batch);
  d.updateExperiment(1, 0, 100);
  d.start(undefined, { utm_campaign: 'search' });
  const report = d.analytics('search');
  const A = report.groups.find((g) => g.version === 1 && g.variant === 'A'),
    B = report.groups.find((g) => g.version === 1 && g.variant === 'B');
  assert.ok(A);
  assert.ok(B);
  assert.deepEqual([A.started, A.result, A.cta, A.resultRate, A.ctr], [1, 1, 1, 1, 1]);
  assert.deepEqual([B.started, B.result, B.cta, B.resultRate, B.ctr], [1, 1, 0, 1, 0]);
  assert.equal(report.groups.find((g) => g.version === 2)?.started, 1);
  const stored = d.db
    .prepare('SELECT version,variant FROM events WHERE event_id=?')
    .get(batch[0].event_id);
  assert.equal(stored?.version, 1);
  assert.equal(stored?.variant, 'A');
  d.db.close();
});
