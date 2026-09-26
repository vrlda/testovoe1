import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../server/core.ts';
const v1 = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));
test('provided v1 keeps variant order and skips office days for remote teams', () => {
  const d = createStore(':memory:');
  d.publish(v1);
  const s = d.start('B');
  assert.deepEqual(
    d
      .steps(s)
      .slice(0, 4)
      .map((x) => x.id),
    ['intro', 'work_mode', 'timezone_span', 'team_size'],
  );
  d.submit(s, null);
  d.submit(s, 'remote');
  assert.equal(
    d.pathFor(s).some((x) => x.id === 'office_days'),
    false,
  );
  assert.equal(
    d.pathFor(s).filter((x) => !d.config(s.version).progressExcludeTypes?.includes(x.type)).length,
    6,
  );
  d.submit(s, 'global');
  d.submit(s, 8);
  d.submit(s, 'low');
  d.submit(s, ['focus']);
  assert.equal(s.current, 'tool_count');
  d.submit(s, 7);
  assert.equal(s.current, 'result');
  assert.equal(d.steps(s).at(-1)?.resultId, 'async_native');
  assert.equal(d.steps(s).at(-1)?.title, 'Your team is ready to reduce meetings');
});
test('malformed screen content cannot replace the active release', () => {
  const store = createStore(':memory:');
  try {
    store.publish(v1);
    for (const change of [
      (config: typeof v1) => {
        config.steps.intro.content.title = { invalid: true };
      },
      (config: typeof v1) => {
        config.steps.work_mode.input.options = [];
      },
      (config: typeof v1) => {
        config.steps.team_size.input.min = 10000;
      },
      (config: typeof v1) => {
        config.results.hybrid_structured.summary = { invalid: true };
      },
    ]) {
      const invalid = structuredClone(v1);
      change(invalid);
      assert.throws(() => store.publish(invalid));
      assert.equal(store.active(), 1);
      assert.equal(store.versions().length, 1);
    }
  } finally {
    store.db.close();
  }
});
