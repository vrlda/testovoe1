import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createStore } from '../server/core.ts';
import { createApp } from '../server/app.ts';
const v1 = JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8'));

test('HTTP authentication, guarded navigation, session expiry and schema errors', async (t) => {
  const store = createStore(':memory:');
  store.publish(v1);
  const server = createApp(store, 'test-token').listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.db.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(base + '/api/admin/experiment')).status, 401);
  assert.equal(
    (await fetch(base + '/api/admin/experiment', { headers: { 'x-admin-token': 'test-token' } }))
      .status,
    200,
  );
  const unknown = await fetch(base + '/api/unknown');
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type') || '', /application\/json/);
  assert.equal((await post('/api/session', { utm: { utm_campaign: 123 } })).status, 400);
  const malformed = await fetch(base + '/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  const { session } = await (await post('/api/session', { variant: 'A' })).json();
  const path = `/api/session/${session.id}`;
  assert.equal((await post(path + '/answer', { step_id: 'intro', value: null })).status, 200);
  // A replay cannot accidentally answer the next screen, even if values would validate.
  assert.equal((await post(path + '/answer', { step_id: 'intro', value: null })).status, 409);
  assert.equal(store.getSession(session.id)?.current, 'team_size');
  assert.equal((await post(path + '/back', { step_id: 'team_size' })).status, 200);
  assert.equal((await post(path + '/back', { step_id: 'team_size' })).status, 409);
  const batch = await (
    await post('/api/events', [
      {
        event_id: 'missing-step',
        session_id: session.id,
        type: 'step_viewed',
        client_timestamp: new Date().toISOString(),
      },
    ])
  ).json();
  assert.equal(batch.results[0].status, 'rejected');
  store.db
    .prepare('UPDATE sessions SET created_at=? WHERE id=?')
    .run(new Date(Date.now() - 73 * 3600000).toISOString(), session.id);
  assert.equal((await fetch(base + path)).status, 410);
  assert.equal((await post(path + '/answer', { step_id: 'intro', value: null })).status, 410);
  assert.equal((await fetch(base + '/api/session/does-not-exist')).status, 404);
  // Expiration retains historical rows and analytics.
  assert.equal(store.analytics().sessions, 1);
});
