import type { Request, RequestHandler } from 'express';

export function validateUtm(value: unknown): asserts value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('UTM values must be strings.');
  const entries = Object.entries(value);
  if (
    entries.length > 10 ||
    entries.some(
      ([key, item]) =>
        !/^utm_[a-z0-9_]{1,32}$/.test(key) ||
        typeof item !== 'string' ||
        Buffer.byteLength(item, 'utf8') > 256,
    ) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > 2048
  )
    throw Error('UTM fields exceed allowed limits.');
}

// Fixed windows keep both counters and memory bounded. Only explicitly trusted proxies
// may supply client IPs; the application otherwise uses the connection address.
export function rateLimit(
  perIp: number,
  total: number,
  cost: (req: Request) => number = () => 1,
  now = Date.now,
): RequestHandler {
  let until = 0;
  let used = 0;
  const clients = new Map<string, number>();
  return (req, res, next) => {
    const time = now();
    if (time >= until) {
      until = time + 60000;
      used = 0;
      clients.clear();
    }
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const count = clients.get(key) || 0;
    const amount = cost(req);
    if (count + amount > perIp || used + amount > total) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((until - time) / 1000))));
      res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
      return;
    }
    used += amount;
    clients.set(key, count + amount);
    next();
  };
}
