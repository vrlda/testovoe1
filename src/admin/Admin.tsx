import { useEffect, useRef, useState } from 'react';
import type { AdminMeta, AnalyticsReport } from '../../shared/types';
import { api, message } from '../api';
import { ApiError } from '../transport';
import { Shell, Notice } from '../components';
import { Analytics } from './Analytics';
import { Experiment } from './Experiment';
import { Versions } from './Versions';

const tabs = ['Аналитика', 'A/B-тест', 'Версии'] as const;
type Tab = (typeof tabs)[number];
export function Admin() {
  const [tab, setTab] = useState<Tab>('Аналитика');
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
          if (sessionStorage.getItem('admin_token'))
            setError('Неверный токен. Попробуйте ещё раз.');
          sessionStorage.removeItem('admin_token');
        } else setError(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [campaign, revision]);
  function published(version: number) {
    setNotice(`Версия ${version} активна. Текущие сессии сохранят прежнюю версию.`);
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
              <span className="muted">Активна версия {data.meta.active}</span>
            </div>
            <nav className="tabs" aria-label="Управление воронкой">
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
              {tab !== 'Версии' && (
                <label className="field compact">
                  Кампания
                  <select
                    aria-label="Кампания"
                    value={campaign}
                    onChange={(event) => setCampaign(event.target.value)}
                  >
                    <option value="">Все кампании</option>
                    {data.report.campaigns.map((campaign) => (
                      <option key={campaign}>{campaign}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="text-button refresh" onClick={refresh} disabled={loading}>
                {loading ? 'Обновление…' : 'Обновить'}
              </button>
            </div>
            {error && (
              <Notice error>
                {error}{' '}
                <button className="text-button" onClick={refresh}>
                  Повторить
                </button>
              </Notice>
            )}
            {notice && <Notice>{notice}</Notice>}
            <div aria-busy={loading}>
              {tab === 'Аналитика' && <Analytics report={data.report} />}
              {tab === 'A/B-тест' && (
                <Experiment
                  key={data.meta.active}
                  meta={data.meta}
                  report={data.report}
                  onPublished={published}
                />
              )}
              {tab === 'Версии' && <Versions meta={data.meta} onPublished={published} />}
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
      <h1>Войти</h1>
      <p className="intro-copy">Введите токен администратора для управления воронкой.</p>
      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(token.trim());
        }}
      >
        <label className="field">
          Токен администратора
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
          {loading ? 'Подключение…' : 'Войти'}
        </button>
      </form>
    </>
  );
}
