import { useState } from 'react';
import type { AdminMeta } from '../../shared/types';
import { api, message } from '../api';
import { Notice } from '../components';

export function Versions({
  meta,
  onPublished,
}: {
  meta: AdminMeta;
  onPublished: (version: number) => void;
}) {
  const [source, setSource] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'publish' | 'rollback' | null>(null);
  const [error, setError] = useState('');
  const previous = meta.versions.find((version) => version.version < meta.active);
  let parsed: unknown;
  let valid = false;
  try {
    parsed = JSON.parse(source);
    valid = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    /* Form shows syntax feedback once content exists. */
  }
  async function mutate(action: 'publish' | 'rollback') {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      const result = await (action === 'publish' ? api.publish(parsed) : api.rollback());
      if (action === 'publish') {
        setSource('');
        setFilename('');
      }
      onPublished(result.version);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      <div className="versions-layout">
        <section className="section">
          <h2>История версий</h2>
          <ul className="release-list">
            {meta.versions.map((version) => (
              <li key={version.version}>
                <div>
                  <strong>Версия {version.version}</strong>
                  <span className="muted">
                    {version.sourceVersion !== undefined
                      ? `JSON v${version.sourceVersion}`
                      : 'Исходный формат'}{' '}
                    ·{' '}
                    {new Intl.DateTimeFormat('ru-RU', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(version.published_at))}
                  </span>
                </div>
                {version.version === meta.active && <span className="active-label">Активна</span>}
              </li>
            ))}
          </ul>
          <button
            className="button"
            disabled={!previous || !!busy}
            onClick={() => mutate('rollback')}
          >
            {busy === 'rollback'
              ? 'Откат…'
              : previous
                ? `Вернуться к версии ${previous.version}`
                : 'Нет предыдущей версии'}
          </button>
          <p className="caption">
            Откат меняет версию для новых сессий. Текущие сессии и аналитика сохраняются.
          </p>
        </section>
        <section className="section">
          <h2>Публикация конфигурации</h2>
          <p className="help">Загрузите JSON-файл или вставьте его содержимое.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate('publish');
            }}
          >
            <label className="file-picker button">
              Выбрать JSON-файл
              <input
                type="file"
                accept=".json,application/json"
                disabled={!!busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    setSource(await file.text());
                    setFilename(file.name);
                    setError('');
                  } catch (error) {
                    setError(message(error));
                  }
                  event.target.value = '';
                }}
              />
            </label>
            {filename && <p className="caption">{filename}</p>}
            <label className="field json-field">
              <span className="sr-only">Конфигурация JSON</span>
              <textarea
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setFilename('');
                }}
                spellCheck={false}
                placeholder="Вставьте конфигурацию в формате JSON"
                disabled={!!busy}
              />
            </label>
            {source.trim() && !valid && (
              <p className="error" role="alert">
                Введите корректный JSON-объект.
              </p>
            )}
            <button className="button primary" disabled={!valid || !!busy}>
              {busy === 'publish' ? 'Публикация…' : 'Опубликовать версию'}
            </button>
            <p className="caption">Перед публикацией конфигурация проходит проверку.</p>
          </form>
        </section>
      </div>
    </>
  );
}
