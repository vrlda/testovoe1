import type { AdminMeta, AnalyticsReport, ExperimentState, FunnelState } from '../shared/types';
import { requestJson } from './transport';

export const api = {
  session: (id: string) => requestJson<FunnelState>(`/api/session/${encodeURIComponent(id)}`),
  createSession: (variant: string | null, utm: Record<string, string>) =>
    post<FunnelState>('/api/session', { variant, utm }),
  navigate: (state: FunnelState, action: 'answer' | 'back', value?: unknown) =>
    post<FunnelState>(`/api/session/${state.session.id}/${action}`, {
      value,
      step_id: state.session.current,
      client_timestamp: new Date().toISOString(),
    }),
  admin: (signal?: AbortSignal) => requestJson<AdminMeta>('/api/admin', { signal }),
  analytics: (campaign: string, signal?: AbortSignal) =>
    requestJson<AnalyticsReport>(`/api/analytics?campaign=${encodeURIComponent(campaign)}`, {
      signal,
    }),
  experiment: (version: number, signal?: AbortSignal) =>
    requestJson<ExperimentState>(`/api/admin/experiment?version=${version}`, { signal }),
  publish: (config: unknown) => post<{ version: number }>('/api/admin/publish', config),
  rollback: () => post<{ version: number }>('/api/admin/rollback', {}),
  weights: (expectedVersion: number, weightA: number) =>
    post<{ version: number }>('/api/admin/experiment', {
      expectedVersion,
      weightA,
      weightB: 100 - weightA,
    }),
};

function post<T>(url: string, body: unknown) {
  return requestJson<T>(url, { method: 'POST', body: JSON.stringify(body) });
}
