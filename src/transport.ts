import type { IncomingEvent, EventReceipt } from '../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (url.startsWith('/api/admin') || url.startsWith('/api/analytics'))
    headers.set('x-admin-token', sessionStorage.getItem('admin_token') || '');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init?.signal?.aborted) cancel();
  init?.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const data: unknown = await response.json().catch(() => {
      throw new ApiError('Invalid server response. Please retry.', response.status);
    });
    if (!response.ok) {
      const detail =
        data && typeof data === 'object' && 'error' in data
          ? String(data.error)
          : 'Request failed. Please retry.';
      throw new ApiError(detail, response.status);
    }
    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !init?.signal?.aborted)
      throw new Error('Connection timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', cancel);
  }
}
export async function restoreSession<T>(
  id: string | null,
  load: (id: string) => Promise<T>,
  create: () => Promise<T>,
): Promise<T> {
  if (!id) return create();
  try {
    return await load(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410))
      return create();
    throw error;
  }
}

const pendingPrefix = 'funnel_event:';
const rejectedPrefix = 'funnel_rejected:';
type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export function createOutbox(
  storage: StorageLike,
  send: (batch: IncomingEvent[]) => Promise<{ results: EventReceipt[] }>,
) {
  // One key per event prevents simultaneous tabs from overwriting a shared array.
  const enqueue = (event: IncomingEvent) =>
    storage.setItem(pendingPrefix + event.event_id, JSON.stringify(event));
  const legacy = storage.getItem('pending_events');
  if (legacy) {
    try {
      const events: IncomingEvent[] = JSON.parse(legacy);
      if (Array.isArray(events)) {
        events.forEach(enqueue);
        storage.removeItem('pending_events');
      }
    } catch {
      /* Keep legacy data intact if migration is interrupted. */
    }
  }
  let running: Promise<void> | undefined;
  function pending() {
    const events: IncomingEvent[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(pendingPrefix)) continue;
      const raw = storage.getItem(key);
      if (raw) events.push(JSON.parse(raw) as IncomingEvent);
    }
    return events;
  }
  function flush(): Promise<void> {
    if (running) return running;
    running = (async () => {
      const batch = pending().slice(0, 50);
      if (!batch.length) return;
      const { results } = await send(batch);
      if (!Array.isArray(results)) throw Error('Invalid event receipt');
      for (const result of results) {
        const event = batch[result.index];
        if (!event) continue;
        if (result.status === 'rejected')
          storage.setItem(
            rejectedPrefix + event.event_id,
            JSON.stringify({ event, error: result.error }),
          );
        if (['accepted', 'duplicate', 'rejected'].includes(result.status))
          storage.removeItem(pendingPrefix + event.event_id);
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  return { enqueue, flush, pending };
}
