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
          <dt>Сессии</dt>
          <dd>{total.started}</dd>
        </div>
        <div>
          <dt>Дошли до результата</dt>
          <dd>{total.result}</dd>
        </div>
        <div>
          <dt>Конверсия в результат</dt>
          <dd>{percent(total.result, total.started)}</dd>
        </div>
        <div>
          <dt>CTR кнопки</dt>
          <dd>{percent(total.cta, total.result)}</dd>
        </div>
      </dl>
      {!groups.length ? (
        <section className="empty-state">
          <h2>Пока нет сессий</h2>
          <p>Сессии появятся, когда кто-нибудь откроет воронку.</p>
          <a className="button" href="/">
            Открыть воронку
          </a>
        </section>
      ) : (
        <>
          <section className="section">
            <h2>Версии и варианты</h2>
            <ComparisonTable
              groups={groups}
              selected={selected && groupKey(selected)}
              onSelect={setSelection}
            />
          </section>
          {selected && (
            <section className="section">
              <div className="section-heading">
                <h2>Конверсия по шагам</h2>
                <label className="field compact">
                  <span className="sr-only">Версия и вариант</span>
                  <select
                    aria-label="Версия и вариант"
                    value={groupKey(selected)}
                    onChange={(event) => setSelection(event.target.value)}
                  >
                    {groups.map((group) => (
                      <option key={groupKey(group)} value={groupKey(group)}>
                        Версия {group.version} · {group.variant}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Конверсия по шагам"
              >
                <table className="data-table steps-table">
                  <thead>
                    <tr>
                      <th scope="col">Шаг</th>
                      <th scope="col">Просмотры</th>
                      <th scope="col">Ушли</th>
                      <th scope="col">Перешли дальше</th>
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
                Считаются уникальные сессии. Переход — просмотр следующего шага; повторные посещения
                не увеличивают счётчик.
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
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Сравнение конверсии">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{onSelect ? 'Версия / вариант' : 'Вариант'}</th>
            <th scope="col">Сессии</th>
            <th scope="col">Результаты</th>
            <th scope="col">Конверсия в результат</th>
            <th scope="col">Клики по кнопке</th>
            <th scope="col">CTR кнопки</th>
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
