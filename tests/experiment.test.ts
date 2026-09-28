import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/core.ts';
import { differenceInterval } from '../shared/stats.ts';
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
  // Created on v2 but never reported an event (bot, retried create): not a started session.
  assert.equal(report.groups.find((g) => g.version === 2)?.started, 0);
  assert.equal(report.sessions, 3);
  const stored = d.db
    .prepare('SELECT version,variant FROM events WHERE event_id=?')
    .get(batch[0].event_id);
  assert.equal(stored?.version, 1);
  assert.equal(stored?.variant, 'A');
  d.db.close();
});

test('rollback returns to the previously active version, not the next lower number', () => {
  const d = createStore(':memory:');
  const v2 = JSON.parse(readFileSync('configs/workstyle-v2.json', 'utf8'));
  d.publish(v1); // 1
  d.publish(v2); // 2
  d.updateExperiment(2, 80, 20); // 3: allocation change on v2
  assert.equal(d.rollback(), 2);
  assert.equal(d.rollback(), 1);
  assert.throws(() => d.rollback(), /No previous version/);
  // A re-publication after a rollback must not bring rolled-back versions back into the stack.
  assert.equal(d.publish(v2), 4);
  assert.equal(d.rollbackTarget(), 1);
  assert.equal(d.rollback(), 1);
  d.db.close();
});
test('A/B interval says when a gap is still noise', () => {
  // 10/20 vs 12/20 is +10 pp but far too small a sample to call.
  const small = differenceInterval({ result: 10, started: 20 }, { result: 12, started: 20 })!;
  assert.ok(Math.abs(small.difference - 10) < 1e-9);
  assert.ok(small.low < 0 && small.high > 0);
  // The same rates on 2000 sessions per variant exclude zero.
  const large = differenceInterval(
    { result: 1000, started: 2000 },
    { result: 1200, started: 2000 },
  )!;
  assert.ok(large.low > 0);
  assert.equal(differenceInterval({ result: 0, started: 0 }, { result: 1, started: 2 }), null);
});
test('databases without an activation log get one on startup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-legacy-')),
    file = join(dir, 'test.sqlite');
  let d = createStore(file);
  try {
    d.publish(v1);
    d.publish(v1);
    d.publish(v1);
    // Simulate a pre-upgrade database whose active version was rolled back from 3 to 2.
    d.db.exec("DROP TABLE activations; UPDATE meta SET value='2' WHERE key='active'");
    d.db.close();
    d = createStore(file);
    assert.equal(d.active(), 2);
    assert.equal(d.rollbackTarget(), 1);
  } finally {
    d.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
