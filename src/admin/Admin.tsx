import { errorMessage } from '../locale';
import { useEffect, useRef, useState } from 'react';
import type { AdminMeta, AnalyticsReport } from '../../shared/types';
import { api } from '../api';
import { ApiError } from '../transport';
import { Shell, Notice } from '../components';
import { Analytics } from './Analytics';
import { Experiment } from './Experiment';
import { Versions } from './Versions';

const tabs = ['Analytics', 'A/B test', 'Versions'] as const;
type Tab = (typeof tabs)[number];
export function Admin() {
  const [tab, setTab] = useState<Tab>('Analytics');
  const [data, setData] = useState<{ meta: AdminMeta; report: AnalyticsReport } | null>(null);
  const [campaign, setCampaign] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    pendingRequest.current = controller;
    setLoading(true);
    setError('');
    Promise.all([api.admin(controller.signal), api.analytics(campaign, controller.signal)])
      .then(([meta, report]) => {
        if (!controller.signal.aborted) setData({ meta, report });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setData(null);
          if (sessionStorage.getItem('admin_token')) setError('Invalid token. Please try again.');
          sessionStorage.removeItem('admin_token');
        } else setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [campaign, revision]);
  function published(version: number) {
    setNotice(`Version ${version} is active. Existing sessions keep their version.`);
    refresh();
  }
  function signOut() {
    pendingRequest.current?.abort();
    setLoading(false);
    sessionStorage.removeItem('admin_token');
    setData(null);
    setNotice('');
    setError('');
  }
  return (
    <Shell admin onSignOut={data ? signOut : undefined}>
      <main id="main" className={`page ${data ? 'admin-page' : 'auth-page'}`}>
        {!data ? (
          <SignIn
            loading={loading}
            error={error}
            onSubmit={(token) => {
              sessionStorage.setItem('admin_token', token);
              refresh();
            }}
          />
        ) : (
          <>
            <div className="page-heading">
              <h1>{tab}</h1>
              <span className="muted">Active version {data.meta.active}</span>
            </div>
            <nav className="tabs" aria-label="Funnel administration">
              {tabs.map((item) => (
                <button
                  key={item}
                  className={tab === item ? 'active' : ''}
                  aria-current={tab === item ? 'page' : undefined}
                  onClick={() => {
                    setTab(item);
                    setNotice('');
                  }}
                >
                  {item}
                </button>
              ))}
            </nav>
            <div className="toolbar">
              {tab !== 'Versions' && (
                <label className="field compact">
                  Campaign
                  <select
                    aria-label="Campaign"
                    value={campaign}
                    onChange={(event) => setCampaign(event.target.value)}
                  >
                    <option value="">All campaigns</option>
                    {data.report.campaigns.map((campaign) => (
                      <option key={campaign}>{campaign}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="text-button refresh" onClick={refresh} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {error && (
              <Notice error>
                {error}{' '}
                <button className="text-button" onClick={refresh}>
                  Retry
                </button>
              </Notice>
            )}
            {notice && <Notice>{notice}</Notice>}
            <div aria-busy={loading}>
              {tab === 'Analytics' && <Analytics report={data.report} />}
              {tab === 'A/B test' && (
                <Experiment
                  key={data.meta.active}
                  meta={data.meta}
                  report={data.report}
                  onPublished={published}
                />
              )}
              {tab === 'Versions' && <Versions meta={data.meta} onPublished={published} />}
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}
function SignIn({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (token: string) => void;
}) {
  const [token, setToken] = useState('');
  return (
    <>
      <h1>Sign in</h1>
      <p className="intro-copy">Enter the admin token to manage the funnel.</p>
      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(token.trim());
        }}
      >
        <label className="field">
          Admin token
          <input
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            disabled={loading}
          />
        </label>
        {error && <Notice error>{error}</Notice>}
        <button className="button primary" disabled={loading || !token.trim()}>
          {loading ? 'Connecting…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}
