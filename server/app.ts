import express, { type Request, type Response, type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import type { createStore } from './core.ts';
import { rateLimit } from './limits.ts';
import type { Session } from '../shared/types.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp(
  store: ReturnType<typeof createStore>,
  adminToken = process.env.ADMIN_TOKEN,
) {
  if (!adminToken?.trim()) throw Error('ADMIN_TOKEN is required.');
  const app = express();
  if (process.env.TRUST_PROXY)
    app.set(
      'trust proxy',
      process.env.TRUST_PROXY.split(',').map((ip) => ip.trim()),
    );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', rateLimit(300, 3000));
  app.use(express.json({ limit: '1mb' }));
  // Hashing first gives equal-length buffers, so the comparison time does not leak the token.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const expected = digest(adminToken);
  const authorize: express.RequestHandler = (req, res, next) => {
    if (timingSafeEqual(digest(req.get('x-admin-token') ?? ''), expected)) return next();
    res.status(401).json({ error: 'An admin token is required.' });
  };
  app.use('/api/admin', authorize);
  app.use('/api/analytics', authorize);

  const route =
    (handler: (req: Request, res: Response) => unknown): express.RequestHandler =>
    (req, res) => {
      try {
        handler(req, res);
      } catch (error) {
        res
          .status(error instanceof HttpError ? error.status : 400)
          .json({ error: error instanceof Error ? error.message : 'Request failed.' });
      }
    };
  function session(req: Request) {
    const current = store.getSession(String(req.params.id));
    if (!current) throw new HttpError(404, 'Session not found');
    const ttl = store.config(current.version).ttlHours;
    if (ttl !== undefined && Date.now() - Date.parse(current.createdAt) >= ttl * 3600000)
      throw new HttpError(410, 'Session expired');
    return current;
  }
  const state = (session: Session) => ({
    session,
    config: store.presentation(session),
    path: store.pathFor(session),
  });
  function navigate(req: Request, action: 'answer' | 'back') {
    const current = session(req),
      input = body(req);
    if (input.step_id !== undefined && input.step_id !== current.current)
      throw new HttpError(409, 'Session advanced. Reloading current step.');
    const timestamp = optionalString(input.client_timestamp);
    if (action === 'answer') store.submit(current, input.value, timestamp);
    else store.back(current, timestamp);
    return state(current);
  }

  app.get(
    '/api/session/:id',
    route((req, res) => res.json(state(session(req)))),
  );
  app.post(
    '/api/session',
    rateLimit(20, 200),
    route((req, res) => {
      const input = body(req);
      const variant = optionalString(input.variant ?? undefined);
      const utm = input.utm === undefined ? {} : input.utm;
      // Store validates every caller, including CLI imports.
      res.json(state(store.start(variant, utm)));
    }),
  );
  app.post(
    '/api/session/:id/answer',
    route((req, res) => res.json(navigate(req, 'answer'))),
  );
  app.post(
    '/api/session/:id/back',
    route((req, res) => res.json(navigate(req, 'back'))),
  );
  app.post(
    '/api/events',
    rateLimit(600, 6000, (req) => (Array.isArray(req.body) ? Math.max(1, req.body.length) : 1)),
    route((req, res) => res.json({ results: store.ingest(req.body) })),
  );
  app.get(
    '/api/admin',
    route((_req, res) =>
      res.json({
        active: store.active(),
        rollbackTo: store.rollbackTarget(),
        versions: store.versions(),
      }),
    ),
  );
  app.get(
    '/api/admin/experiment',
    route((req, res) =>
      res.json(
        store.experiment(
          req.query.version === undefined ? store.active() : Number(req.query.version),
        ),
      ),
    ),
  );
  app.post(
    '/api/admin/experiment',
    route((req, res) => {
      const input = body(req);
      res.json({
        version: store.updateExperiment(
          number(input.expectedVersion),
          number(input.weightA),
          number(input.weightB),
        ),
      });
    }),
  );
  app.post(
    '/api/admin/publish',
    route((req, res) => res.json({ version: store.publish(req.body) })),
  );
  app.post(
    '/api/admin/rollback',
    route((_req, res) => res.json({ version: store.rollback() })),
  );
  app.get(
    '/api/analytics',
    route((req, res) => res.json(store.analytics(String(req.query.campaign || '')))),
  );
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get(['/', '/admin', '/admin/'], (_req, res) => res.sendFile(resolve(dist, 'index.html')));
    app.get('/{*path}', (_req, res) => res.status(404).sendFile(resolve(dist, 'index.html')));
  }
  const invalidJson: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(400).json({ error: 'Request body must be valid JSON smaller than 1 MB.' });
  };
  app.use(invalidJson);
  return app;
}
function body(req: Request): Record<string, unknown> {
  const input: unknown = req.body ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HttpError(400, 'Expected a JSON object.');
  return input as Record<string, unknown>;
}
function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Expected a string.');
  return value;
}
function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new HttpError(400, 'Expected a finite number.');
  return value;
}
