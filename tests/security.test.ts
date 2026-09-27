import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import { createStore } from '../server/core.ts';
import { createApp } from '../server/app.ts';
import { rateLimit } from '../server/limits.ts';
const config = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));

test('empty admin credentials cannot start an exposed application', () => {
  const store = createStore(':memory:');
  try {
    for (const token of ['', ' ', '\t\n'])
      assert.throws(() => createApp(store, token), /ADMIN_TOKEN/);
    const prior = process.env.ADMIN_TOKEN;
    try {
      delete process.env.ADMIN_TOKEN;
      assert.throws(() => createApp(store), /ADMIN_TOKEN/);
    } finally {
      if (prior === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = prior;
    }
  } finally {
    store.db.close();
  }
});

test('UTM limits cover Unicode, aggregate size and previously stored metadata', () => {
  const store = createStore(':memory:');
  try {
    store.publish(config);
    for (const utm of [
      null,
      { utm_source: 'x'.repeat(8192) },
      { utm_source: 'я'.repeat(129) },
      { ['utm_' + 'a'.repeat(33)]: 'x' },
      { not_utm: 'x' },
      { utm_source: 1 },
      Object.fromEntries(Array.from({ length: 11 }, (_, i) => ['utm_' + i, 'x'])),
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['utm_' + i, 'x'.repeat(256)])),
    ])
      assert.throws(() => store.start('A', utm), /UTM/);
    assert.equal(store.analytics().sessions, 0);
    const session = store.start('A', { utm_source: 'я'.repeat(128), utm_campaign: 'search' });
    store.db
      .prepare('UPDATE sessions SET utm=? WHERE id=?')
      .run(JSON.stringify({ utm_source: 'x'.repeat(8192) }), session.id);
    const before = store.db.prepare('SELECT count(*) n FROM events').get()!.n;
    const result = store.ingest([event(session.id, 'oversized')]);
    assert.equal(result[0].status, 'rejected');
    assert.match(result[0].error!, /UTM/);
    assert.equal(store.db.prepare('SELECT count(*) n FROM events').get()!.n, before);
    assert.throws(() => store.submit(store.getSession(session.id)!, null), /UTM/);
    assert.equal(store.getSession(session.id)!.current, 'intro');
  } finally {
    store.db.close();
  }
});

test('server bounds batches and persistent event counts while allowing duplicate retries', () => {
  const store = createStore(':memory:');
  try {
    store.publish(config);
    const session = store.start('A');
    assert.throws(
      () => store.ingest(Array.from({ length: 51 }, (_, i) => event(session.id, String(i)))),
      /at most 50/,
    );
    assert.equal(store.db.prepare('SELECT count(*) n FROM events').get()!.n, 1);
    for (let i = 0; i < 1999; i++)
      assert.equal(store.ingest([event(session.id, String(i))])[0].status, 'accepted');
    assert.equal(store.ingest([event(session.id, 'new')])[0].status, 'rejected');
    assert.equal(store.ingest([event(session.id, '0')])[0].status, 'duplicate');
    assert.equal(store.db.prepare('SELECT count(*) n FROM events').get()!.n, 2000);
    assert.equal(
      store.ingest([
        {
          ...event(session.id, 'long-time'),
          client_timestamp: ' '.repeat(1000) + new Date().toISOString(),
        },
      ])[0].status,
      'rejected',
    );
  } finally {
    store.db.close();
  }
});

const event = (session_id: string, event_id: string) => ({
  session_id,
  event_id,
  type: 'step_viewed',
  step_id: 'intro',
  client_timestamp: '2026-01-01T00:00:00Z',
});

test('HTTP throttling rejects spoofed IP rotation and leaves event retries safe', async (t) => {
  const store = createStore(':memory:');
  store.publish(config);
  const server = createApp(store, 'test-secret').listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
  });
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const post = (path: string, body: unknown, ip = '192.0.2.1') =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    });
  for (let i = 0; i < 20; i++)
    assert.equal((await post('/api/session', {}, '192.0.2.' + i)).status, 200);
  const blocked = await post('/api/session', {}, '198.51.100.1');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(store.analytics().sessions, 20);
  const session = store.start('A');
  const batch = Array.from({ length: 50 }, (_, i) => event(session.id, String(i)));
  for (let i = 0; i < 12; i++) assert.equal((await post('/api/events', batch)).status, 200);
  assert.equal((await post('/api/events', batch)).status, 429);
  assert.equal(
    store.db.prepare('SELECT count(*) n FROM events WHERE session_id=?').get(session.id)!.n,
    51,
  );
  for (const path of ['/api/admin', '/api/analytics', '/api/admin/experiment'])
    assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (await fetch(base + '/api/admin', { headers: { 'x-admin-token': 'test-secret' } })).status,
    200,
  );
});

test('rate counters enforce global budget and reset after the window', () => {
  let time = 0,
    accepted = 0,
    status = 0;
  const limit = rateLimit(
    2,
    3,
    () => 1,
    () => time,
  );
  const invoke = (ip: string) => {
    status = 0;
    limit(
      { ip, socket: {} } as Request,
      {
        set: () => {},
        status: (code: number) => {
          status = code;
          return { json: () => {} };
        },
      } as unknown as Response,
      () => {
        accepted++;
      },
    );
  };
  invoke('a');
  invoke('a');
  invoke('a');
  assert.equal(status, 429);
  invoke('b');
  invoke('c');
  assert.equal(status, 429);
  assert.equal(accepted, 3);
  time = 60000;
  invoke('a');
  assert.equal(status, 0);
  assert.equal(accepted, 4);
});
