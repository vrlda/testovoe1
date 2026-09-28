import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/core.ts';
import type { Session } from '../shared/types.ts';

const source = (name: string) => JSON.parse(readFileSync(`configs/${name}.json`, 'utf8'));
const event = (session: Session, type: string, properties: Record<string, unknown> = {}) => ({
  event_id: randomUUID(),
  session_id: session.id,
  client_timestamp: new Date().toISOString(),
  type,
  step_id: 'result',
  properties,
});

test('supplied v3 publishes after earlier versions, branches, records event and rolls back', () => {
  const store = createStore(':memory:');
  try {
    const first = store.publish(source('workstyle-v1'));
    const old = store.start('B');
    const second = store.publish(source('workstyle-v2'));
    const middle = store.start('B');
    const schema = store.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    const third = store.publish(source('workstyle-v3'));
    assert.deepEqual([first, second, third], [1, 2, 3]);
    const currentA = store.start('A');
    const currentB = store.start('B');
    assert.equal(store.config(third).sourceVersion, 3);
    assert.equal(
      store.steps(currentB).some((step) => step.id === 'tool_count'),
      false,
    );
    assert.equal(
      store.steps(middle).some((step) => step.id === 'tool_count'),
      true,
    );
    assert.equal(
      store.steps(old).some((step) => step.id === 'meeting_hours'),
      false,
    );
    const answer = (session: Session, value: unknown) => store.submit(session, value);
    answer(old, null);
    answer(middle, null);
    assert.equal(store.getSession(old.id)?.version, first);
    assert.equal(store.getSession(middle.id)?.version, second);
    const toPriorities = (session: Session) => {
      while (session.current !== 'priorities') {
        const step = store.steps(session).find((s) => s.id === session.current)!;
        answer(
          session,
          step.type === 'info'
            ? null
            : step.id === 'work_mode'
              ? 'hybrid'
              : step.type === 'number'
                ? Math.max(step.min ?? 0, 2)
                : step.options![0].value,
        );
      }
    };
    toPriorities(currentA);
    toPriorities(currentB);
    answer(currentA, ['compliance']);
    answer(currentB, ['focus']);
    assert.equal(currentA.current, 'security_constraints');
    assert.equal(
      store.pathFor(currentB).some((step) => step.id === 'security_constraints'),
      false,
    );
    while (String(currentB.current) !== 'result') {
      const step = store.steps(currentB).find((s) => s.id === currentB.current)!;
      answer(
        currentB,
        step.type === 'number'
          ? Math.max(step.min ?? 0, 2)
          : step.type === 'multi'
            ? ['focus']
            : step.options![0].value,
      );
    }
    assert.equal(currentB.current, 'result');
    answer(currentA, 'strict');
    while (String(currentA.current) !== 'result') {
      const step = store.steps(currentA).find((s) => s.id === currentA.current)!;
      answer(
        currentA,
        step.type === 'number'
          ? Math.max(step.min ?? 0, 2)
          : step.type === 'multi'
            ? ['focus']
            : step.options![0].value,
      );
    }
    const result = store.steps(currentA).at(-1)!;
    assert.equal(result.resultId, 'regulated_scale');
    const custom = event(currentA, 'recommendation_expanded', {
      result_id: result.resultId,
      action: result.action,
      source: 'result_cta',
    });
    assert.deepEqual(
      store.ingest([custom, custom]).map((r) => r.status),
      ['accepted', 'duplicate'],
    );
    assert.equal(store.ingest([event(old, 'recommendation_expanded')])[0].status, 'rejected');
    assert.equal(
      store.ingest([event(currentA, 'recommendation_expanded', { source: 'raw_answer' })])[0]
        .status,
      'rejected',
    );
    const before = store.analytics();
    assert.equal(store.rollback(), 2);
    assert.deepEqual(store.analytics(), before);
    assert.equal(store.start().version, 2);
    assert.equal(store.getSession(currentA.id)?.version, 3);
    assert.deepEqual(
      store.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),
      schema,
    );
  } finally {
    store.db.close();
  }
});
