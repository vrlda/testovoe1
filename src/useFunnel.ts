import { errorMessage } from './locale';
import { useEffect, useRef, useState } from 'react';
import type { FunnelState, IncomingEvent, EventReceipt } from '../shared/types';
import { api } from './api';
import { ApiError, requestJson, restoreSession, createOutbox } from './transport';

const outbox = createOutbox(localStorage, (batch) =>
  requestJson<{ results: EventReceipt[] }>('/api/events', {
    method: 'POST',
    body: JSON.stringify(batch),
    keepalive: true,
  }),
);
export function queueEvent(event: IncomingEvent) {
  outbox.enqueue(event);
  void outbox.flush().catch(() => {}); // Saved events retry on the timer, online, or the next visit.
}
export function useFunnel() {
  const [data, setData] = useState<FunnelState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const flush = () => {
      void outbox.flush().catch(() => {});
    };
    flush();
    const timer = setInterval(flush, 5000);
    window.addEventListener('online', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setError('');
    const query = new URLSearchParams(location.search);
    const variant = query.get('variant');
    const override = variant === 'A' || variant === 'B';
    const key = override ? `funnel_session_${variant}` : 'funnel_session';
    const storage = override ? sessionStorage : localStorage;
    const id =
      query.get('new') === '1'
        ? null
        : (override ? query.get('session') : null) ||
          storage.getItem(key) ||
          localStorage.getItem(key);
    const create = async () => {
      const utm = Object.fromEntries(
        [...query.entries()].filter(([key]) => key.startsWith('utm_')),
      );
      const next = await api.createSession(variant, utm);
      storage.setItem(key, next.session.id);
      localStorage.setItem(key, next.session.id);
      const url = new URL(location.href);
      url.searchParams.delete('new');
      if (override) url.searchParams.set('session', next.session.id);
      history.replaceState(null, '', url.pathname + url.search);
      return next;
    };
    restoreSession(id, api.session, create)
      .then((next) => {
        if (!alive) return;
        storage.setItem(key, next.session.id);
        localStorage.setItem(key, next.session.id);
        setData(next);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  async function navigate(action: 'answer' | 'back', value?: unknown) {
    if (!data || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await api.navigate(data, action, value);
      if (action === 'answer') localStorage.removeItem(draftKey(data));
      setData(next);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 410)) {
        setData(null);
        setAttempt((value) => value + 1);
      } else setError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function restart() {
    const url = new URL(location.href);
    url.searchParams.set('new', '1');
    location.assign(url.pathname + url.search);
  }
  return { data, error, busy, navigate, retry: () => setAttempt((value) => value + 1), restart };
}
export const draftKey = (data: FunnelState) =>
  `funnel_draft_${data.session.id}_${data.session.current}`;
