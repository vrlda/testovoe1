import { text, percent } from '../locale';
import { useState } from 'react';
import type { AnalyticsGroup, AnalyticsReport } from '../../shared/types';

export function Analytics({ report }: { report: AnalyticsReport }) {
  const [selection, setSelection] = useState('');
  const groups = [...report.groups].sort(
    (a, b) => b.version - a.version || a.variant.localeCompare(b.variant),
  );
  const selected = groups.find((group) => groupKey(group) === selection) || groups[0];
  const total = groups.reduce(
    (total, group) => ({
      started: total.started + group.started,
      result: total.result + group.result,
      cta: total.cta + group.resultWithCta,
    }),
    { started: 0, result: 0, cta: 0 },
  );
  return (
    <>
      <dl className="metrics">
        <div>
          <dt>Started</dt>
          <dd>{total.started}</dd>
        </div>
        <div>
          <dt>Reached a result</dt>
          <dd>{total.result}</dd>
        </div>
        <div>
          <dt>Result conversion</dt>
          <dd>{percent(total.result, total.started)}</dd>
        </div>
        <div>
          <dt>CTA click rate</dt>
          <dd>{percent(total.cta, total.result)}</dd>
        </div>
      </dl>
      {report.sessions > total.started && (
        <p className="caption">
          {report.sessions} sessions created; {report.sessions - total.started} never reported an
          event and are not counted as started.
        </p>
      )}
      {!groups.length ? (
        <section className="empty-state">
          <h2>No sessions yet</h2>
          <p>Sessions will appear when someone opens the funnel.</p>
          <a className="button" href="/">
            Open funnel
          </a>
        </section>
      ) : (
        <>
          <section className="section">
            <h2>Versions and variants</h2>
            <ComparisonTable
              groups={groups}
              selected={selected && groupKey(selected)}
              onSelect={setSelection}
            />
          </section>
          {selected && (
            <section className="section">
              <div className="section-heading">
                <h2>Step conversion</h2>
                <label className="field compact">
                  <span className="sr-only">Version and variant</span>
                  <select
                    aria-label="Version and variant"
                    value={groupKey(selected)}
                    onChange={(event) => setSelection(event.target.value)}
                  >
                    {groups.map((group) => (
                      <option key={groupKey(group)} value={groupKey(group)}>
                        Version {group.version} · {group.variant}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Step conversion">
                <table className="data-table steps-table">
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col">Views</th>
                      <th scope="col">Drop-offs</th>
                      <th scope="col">Continued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.stepMetrics.map((step) => (
                      <tr key={step.id}>
                        <th scope="row">{text(step.title)}</th>
                        <td>{step.views}</td>
                        <td>{step.dropoff}</td>
                        <td>{step.views ? `${Math.round(step.conversion * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="caption">
                Counts use unique sessions. A session is started once the client reports its first
                event. A transition requires a view of the next step; repeat visits do not increase
                the count.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
const groupKey = (group: AnalyticsGroup) => `${group.version}:${group.variant}`;
export function ComparisonTable({
  groups,
  selected,
  onSelect,
}: {
  groups: AnalyticsGroup[];
  selected?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Conversion comparison">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{onSelect ? 'Version / variant' : 'Variant'}</th>
            <th scope="col">Started</th>
            <th scope="col">Results</th>
            <th scope="col">Result conversion</th>
            <th scope="col">CTA clicks</th>
            <th scope="col">CTA click rate</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr
              key={groupKey(group)}
              className={selected === groupKey(group) ? 'selected-row' : ''}
            >
              <th scope="row">
                {onSelect ? (
                  <button
                    className="table-link"
                    aria-pressed={selected === groupKey(group)}
                    onClick={() => onSelect(groupKey(group))}
                  >
                    {group.version} / {group.variant}
                  </button>
                ) : (
                  group.variant
                )}
              </th>
              <td>{group.started}</td>
              <td>{group.result}</td>
              <td>{percent(group.result, group.started)}</td>
              <td>{group.cta}</td>
              <td>{percent(group.resultWithCta, group.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
