import { text, errorMessage } from '../locale';
import { useEffect, useState } from 'react';
import type {
  AdminMeta,
  AnalyticsGroup,
  AnalyticsReport,
  Config,
  Variant,
} from '../../shared/types';
import { api } from '../api';
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
        if (!controller.signal.aborted) setError(errorMessage(error));
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
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label className="field compact version-filter">
        Version
        <select
          aria-label="Version"
          value={version}
          disabled={busy}
          onChange={(event) => setVersion(Number(event.target.value))}
        >
          {meta.versions.map((item) => (
            <option key={item.version} value={item.version}>
              Version {item.version}
              {item.version === meta.active ? ' · active' : ''}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice error>{error}</Notice>}
      {!config ? (
        <p role="status">
          {error
            ? 'Could not load settings. Choose another version or refresh the page.'
            : 'Loading experiment…'}
        </p>
      ) : (
        <>
          <section className="section experiment-settings">
            <div>
              <h2>Traffic allocation</h2>
              <p className="help">
                {active
                  ? 'Changes apply to new sessions. Existing sessions keep their version and variant.'
                  : 'This version is read-only. New sessions use the active version.'}
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
                  Variant A, %
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
                  Variant B, %
                  <output>
                    {valid ? (100 - a).toLocaleString('en-AU', { maximumFractionDigits: 4 }) : '—'}
                  </output>
                </label>
              </div>
              {active && (
                <button className="button" disabled={!valid || busy || a === distribution(config)}>
                  {busy ? 'Publishing…' : 'Publish allocation'}
                </button>
              )}
            </form>
          </section>
          <section className="section">
            <h2>Results</h2>
            <ComparisonTable groups={groups} />
            <p className="caption">
              {difference === null
                ? 'Sessions in both variants are needed for comparison.'
                : `B − A: ${difference >= 0 ? '+' : ''}${difference.toLocaleString('en-AU', { maximumFractionDigits: 1 })} percentage points. Observed difference; statistical significance has not been assessed.`}
            </p>
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>Variants</h2>
              <span className="muted">Assigned by the server</span>
            </div>
            <div className="variant-grid">
              {(['A', 'B'] as const).map((variant) => {
                const details = config.variants[variant];
                return (
                  <article className="variant" key={variant}>
                    <div className="section-heading">
                      <h3>Variant {variant}</h3>
                      {active && (
                        <a
                          className="button small"
                          href={`/?variant=${variant}&new=1&utm_campaign=ab_manual_check`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open {variant}
                        </a>
                      )}
                    </div>
                    <p className="variant-title">{text(details.steps[0].title)}</p>
                    <details>
                      <summary>Steps: {details.steps.length}</summary>
                      <ol className="screen-list">
                        {details.steps.map((step) => (
                          <li key={step.id}>
                            {text(step.title)}
                            {step.visibleWhen && <span className="muted"> · conditional</span>}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <details>
                      <summary>Result content</summary>
                      {Object.values(config.results || {}).map((result) => {
                        const override = details.resultOverrides?.[result.id];
                        return (
                          <div className="result-preview" key={result.id}>
                            <h4>{text(override?.title || result.title)}</h4>
                            <p>{text(override?.summary || result.summary)}</p>
                            <p className="caption">
                              CTA: {text(override?.cta?.label || result.cta.label)}
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
                Test sessions appear in analytics under campaign <code>ab_manual_check</code>.
              </p>
            )}
          </section>
          <details className="experiment-details">
            <summary>Hypothesis and metric</summary>
            <p>{text(config.hypothesis)}</p>
            <p>
              <strong>Primary metric:</strong> {text(config.metric)}
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
