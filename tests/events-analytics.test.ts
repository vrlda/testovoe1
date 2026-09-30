import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/core.ts';
import type { Session } from '../shared/types.ts';
import { reachResult } from './helpers.ts';
const v1 = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));
const ev = (
  s: Session,
  type: string,
  step_id = s.current,
  properties: Record<string, unknown> = {},
) => ({
  event_id: randomUUID(),
  session_id: s.id,
  client_timestamp: new Date().toISOString(),
  type,
  step_id,
  properties,
});

test('Back and changed branch retain historical views, transitions and deduplicated metrics', () => {
  const d = createStore(':memory:');
  try {
    d.publish(v1);
    const s = d.start('B');
    const queue: ReturnType<typeof ev>[] = [];
    const view = () => queue.push(ev(s, s.current === 'result' ? 'result_viewed' : 'step_viewed'));
    const advance = (value: unknown) => {
      d.submit(s, value);
      view();
    };
    view();
    advance(null);
    advance('hybrid');
    advance('same');
    advance(10);
    advance('low');
    advance(['focus']);
    advance(2);
    assert.equal(s.current, 'tool_count');
    d.ingest([...queue].reverse());
    const metric = () => d.analytics().groups[0].stepMetrics.find((m) => m.id === 'office_days');
    const before = metric();
    assert.ok(before);
    assert.equal(before.views, 1);
    assert.equal(before.conversion, 1);
    while (String(s.current) !== 'work_mode') d.back(s);
    advance('remote');
    assert.equal(s.answers.office_days, undefined);
    assert.deepEqual(metric(), before);
    d.ingest([...queue, ...queue].reverse());
    assert.deepEqual(metric(), before);
    // A repeat view with a new event ID is still one session.
    d.ingest([ev(s, 'step_viewed', 'office_days')]);
    assert.deepEqual(metric(), before);
  } finally {
    d.db.close();
  }
});

test('event schemas reject missing steps and raw/nested answers without losing valid batch items', () => {
  const d = createStore(':memory:');
  try {
    d.publish(v1);
    const s = d.start('A');
    const valid = ev(s, 'step_viewed');
    const result = d.ingest([
      { ...valid, event_id: randomUUID(), step_id: undefined },
      ev(s, 'answer_submitted', s.current, { answer: 'FICTIONAL_RAW' }),
      ev(s, 'answer_submitted', s.current, { answer_kind: { response: 'FICTIONAL_RAW' } }),
      ev(s, 'answer_submitted', s.current, { answer_kind: 'FICTIONAL_RAW' }),
      ev(s, 'step_completed', s.current, { next_step_id: 'unknown' }),
      valid,
      valid,
    ]);
    assert.deepEqual(
      result.map((r) => r.status),
      ['rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'accepted', 'duplicate'],
    );
    assert.equal(
      d.db.prepare("SELECT count(*) n FROM events WHERE properties LIKE '%FICTIONAL_RAW%'").get()
        ?.n,
      0,
    );
    const bad = structuredClone(v1);
    bad.events.allowed.at(-1).properties = ['answer'];
    assert.throws(() => d.publish(bad), /Unsupported properties/);
  } finally {
    d.db.close();
  }
});

test('delayed result events cannot inflate CTR and duplicate multi-select values are rejected', () => {
  const d = createStore(':memory:');
  try {
    d.publish(v1);
    const a = d.start('A'),
      b = d.start('A');
    reachResult(d, a);
    reachResult(d, b);
    d.ingest([ev(a, 'result_viewed', 'result'), ev(b, 'cta_clicked', 'result')]);
    assert.equal(d.analytics().groups[0].ctr, 0);
    d.ingest([ev(b, 'result_viewed', 'result')]);
    assert.equal(d.analytics().groups[0].ctr, 0.5);
    while (String(a.current) !== 'priorities') d.back(a);
    assert.equal(a.current, 'priorities');
    assert.throws(() => d.submit(a, ['focus', 'focus']), /valid options/);
  } finally {
    d.db.close();
  }
});
