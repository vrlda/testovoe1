import { text } from '../locale';
import { useEffect, useState } from 'react';
import type {
  AdminMeta,
  AnalyticsGroup,
  AnalyticsReport,
  Config,
  Variant,
} from '../../shared/types';
import { api, message, previewUrl } from '../api';
import { Notice } from '../components';
import { ComparisonTable } from './Analytics';

export function Experiment({
  meta,
  report,
  onPublished,
}: {
  meta: AdminMeta;
  report: AnalyticsReport;
  onPublished: (version: number) => void;
}) {
  const [version, setVersion] = useState(meta.active);
  const [config, setConfig] = useState<Config | null>(null);
  const [weight, setWeight] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setConfig(null);
    setError('');
    api
      .experiment(version, controller.signal)
      .then(({ config }) => {
        if (controller.signal.aborted) return;
        setConfig(config);
        setWeight(String(distribution(config)));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      });
    return () => controller.abort();
  }, [version]);
  const active = version === meta.active;
  const a = Number(weight);
  const valid = weight.trim() !== '' && Number.isFinite(a) && a >= 0 && a <= 100;
  const groups = (['A', 'B'] as const).map(
    (variant) =>
      report.groups.find((group) => group.version === version && group.variant === variant) ||
      emptyGroup(version, variant),
  );
  const difference = groups.every((group) => group.started)
    ? (groups[1].resultRate - groups[0].resultRate) * 100
    : null;
  async function publish() {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.weights(meta.active, a);
      onPublished(result.version);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label className="field compact version-filter">
        Версия
        <select
          aria-label="Версия"
          value={version}
          disabled={busy}
          onChange={(event) => setVersion(Number(event.target.value))}
        >
          {meta.versions.map((item) => (
            <option key={item.version} value={item.version}>
              Версия {item.version}
              {item.version === meta.active ? ' · активна' : ''}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice error>{error}</Notice>}
      {!config ? (
        <p role="status">
          {error
            ? 'Не удалось загрузить настройки. Выберите другую версию или обновите страницу.'
            : 'Загрузка эксперимента…'}
        </p>
      ) : (
        <>
          <section className="section experiment-settings">
            <div>
              <h2>Распределение трафика</h2>
              <p className="help">
                {active
                  ? 'Изменения действуют для новых сессий. Текущие сессии сохранят свою версию и вариант.'
                  : 'Эта версия доступна только для просмотра. Новые сессии используют активную версию.'}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void publish();
              }}
            >
              <div className="weight-fields">
                <label className="field">
                  Вариант A, %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={weight}
                    disabled={!active || busy}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </label>
                <label className="field">
                  Вариант B, %
                  <output>
                    {valid ? (100 - a).toLocaleString('ru-RU', { maximumFractionDigits: 4 }) : '—'}
                  </output>
                </label>
              </div>
              {active && (
                <button className="button" disabled={!valid || busy || a === distribution(config)}>
                  {busy ? 'Публикация…' : 'Опубликовать распределение'}
                </button>
              )}
            </form>
          </section>
          <section className="section">
            <h2>Результаты</h2>
            <ComparisonTable groups={groups} />
            <p className="caption">
              {difference === null
                ? 'Для сравнения нужны сессии в обоих вариантах.'
                : `B − A: ${difference >= 0 ? '+' : ''}${difference.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} п. п. Наблюдаемая разница без оценки статистической значимости.`}
            </p>
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>Варианты</h2>
              <span className="muted">Назначаются сервером</span>
            </div>
            <div className="variant-grid">
              {(['A', 'B'] as const).map((variant) => {
                const details = config.variants[variant];
                return (
                  <article className="variant" key={variant}>
                    <div className="section-heading">
                      <h3>Вариант {variant}</h3>
                      {active && (
                        <a
                          className="button small"
                          href={previewUrl(variant)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть {variant}
                        </a>
                      )}
                    </div>
                    <p className="variant-title">{text(details.steps[0].title)}</p>
                    <details>
                      <summary>Экранов: {details.steps.length}</summary>
                      <ol className="screen-list">
                        {details.steps.map((step) => (
                          <li key={step.id}>
                            {text(step.title)}
                            {step.visibleWhen && <span className="muted"> · по условию</span>}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <details>
                      <summary>Содержание результата</summary>
                      {Object.values(config.results || {}).map((result) => {
                        const override = details.resultOverrides?.[result.id];
                        return (
                          <div className="result-preview" key={result.id}>
                            <h4>{text(override?.title || result.title)}</h4>
                            <p>{text(override?.summary || result.summary)}</p>
                            <p className="caption">
                              Кнопка: {text(override?.cta?.label || result.cta.label)}
                            </p>
                          </div>
                        );
                      })}
                    </details>
                  </article>
                );
              })}
            </div>
            {active && (
              <p className="caption">
                Проверочные сессии попадают в аналитику с кампанией <code>ab_manual_check</code>.
              </p>
            )}
          </section>
          <details className="experiment-details">
            <summary>Гипотеза и метрика</summary>
            <p>{text(config.hypothesis)}</p>
            <p>
              <strong>Основная метрика:</strong> {text(config.metric)}
            </p>
            {config.experimentId && <p className="caption">{config.experimentId}</p>}
          </details>
        </>
      )}
    </>
  );
}
function distribution(config: Config) {
  const a = config.variants.A.weight ?? 50,
    b = config.variants.B.weight ?? 50;
  return (100 * a) / (a + b);
}
function emptyGroup(version: number, variant: Variant): AnalyticsGroup {
  return {
    version,
    variant,
    started: 0,
    result: 0,
    cta: 0,
    resultWithCta: 0,
    resultRate: 0,
    ctr: 0,
    steps: {},
    stepMetrics: [],
  };
}
