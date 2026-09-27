import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, restoreSession, createOutbox } from '../src/transport.ts';

test('session recovery only creates on confirmed missing/expired, never transient errors', async () => {
  let creates = 0;
  const create = async () => {
    creates++;
    return 'new';
  };
  for (const error of [new ApiError('Unavailable', 500), new TypeError('Failed to fetch')]) {
    await assert.rejects(
      restoreSession(
        'saved',
        async () => {
          throw error;
        },
        create,
      ),
    );
    assert.equal(creates, 0);
  }
  assert.equal(await restoreSession('saved', async (id) => id, create), 'saved');
  assert.equal(
    await restoreSession(
      'saved',
      async () => {
        throw new ApiError('Missing', 404);
      },
      create,
    ),
    'new',
  );
  assert.equal(
    await restoreSession(
      'saved',
      async () => {
        throw new ApiError('Expired', 410);
      },
      create,
    ),
    'new',
  );
  assert.equal(creates, 2);
});

test('outbox saves before send, survives timeout/restart and preserves new items and rejected receipts', async () => {
  const { storage, data } = memoryStorage();
  const failed = createOutbox(storage, async () => {
    throw Error('timeout');
  });
  failed.enqueue(event('1'));
  assert.equal(failed.pending()[0].event_id, '1');
  await assert.rejects(failed.flush());
  assert.equal(failed.pending().length, 1);
  const restored = createOutbox(storage, async (batch) => {
    assert.equal(batch[0].event_id, '1');
    restored.enqueue(event('2'));
    return { results: [{ index: 0, status: 'duplicate' }] };
  });
  await restored.flush();
  assert.deepEqual(
    restored.pending().map((event) => event.event_id),
    ['2'],
  );
  const rejected = createOutbox(storage, async () => ({
    results: [{ index: 0, status: 'rejected', error: 'Invalid event' }],
  }));
  await rejected.flush();
  assert.deepEqual(rejected.pending(), []);
  assert.equal(JSON.parse(data.get('funnel_rejected:2')!).event.event_id, '2');
});

function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  return { storage, data };
}
const event = (id: string) => ({
  event_id: id,
  session_id: 's',
  client_timestamp: new Date().toISOString(),
  type: 'step_viewed',
  step_id: 'intro',
});

test('outboxes in separate tabs retain concurrent writes and migrate existing pending IDs', async () => {
  const { storage } = memoryStorage();
  storage.setItem('pending_events', JSON.stringify([event('legacy')]));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = createOutbox(storage, async (batch) => {
    assert.deepEqual(
      batch.map((item) => item.event_id),
      ['legacy'],
    );
    await gate;
    return { results: [{ index: 0, status: 'accepted' }] };
  });
  assert.equal(storage.getItem('pending_events'), null);
  const sending = first.flush();
  const second = createOutbox(storage, async (batch) => ({
    results: batch.map((_, index) => ({ index, status: 'duplicate' })),
  }));
  second.enqueue(event('other-tab'));
  release();
  await sending;
  assert.deepEqual(
    second.pending().map((item) => item.event_id),
    ['other-tab'],
  );
  await second.flush();
  assert.deepEqual(first.pending(), []);
});

test('outbox reads one batch at a time and drains a larger backlog without loss', async () => {
  const { storage } = memoryStorage();
  let reads = 0;
  const measured = {
    ...storage,
    get length() {
      return storage.length;
    },
    getItem(key: string) {
      reads++;
      return storage.getItem(key);
    },
  };
  const sent: string[] = [];
  const outbox = createOutbox(measured, async (batch) => {
    assert.ok(batch.length <= 50);
    sent.push(...batch.map((item) => item.event_id));
    return { results: batch.map((_, index) => ({ index, status: 'accepted' as const })) };
  });
  for (let index = 0; index < 120; index++) outbox.enqueue(event(String(index)));
  reads = 0;
  await outbox.flush();
  assert.equal(reads, 50);
  assert.equal(storage.length, 70);
  await outbox.flush();
  await outbox.flush();
  assert.equal(storage.length, 0);
  assert.equal(sent.length, 120);
  assert.equal(new Set(sent).size, 120);
});
