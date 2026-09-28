import { errorMessage } from '../locale';
import { useState } from 'react';
import type { AdminMeta } from '../../shared/types';
import { api } from '../api';
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
  const previous = meta.versions.find((version) => version.version === meta.rollbackTo);
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
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      <div className="versions-layout">
        <section className="section">
          <h2>Version history</h2>
          <ul className="release-list">
            {meta.versions.map((version) => (
              <li key={version.version}>
                <div>
                  <strong>Version {version.version}</strong>
                  <span className="muted">
                    {version.sourceVersion !== undefined
                      ? `JSON v${version.sourceVersion}`
                      : 'Original format'}{' '}
                    ·{' '}
                    {new Intl.DateTimeFormat('en-AU', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(version.published_at))}
                  </span>
                </div>
                {version.version === meta.active && <span className="active-label">Active</span>}
              </li>
            ))}
          </ul>
          <button
            className="button"
            disabled={!previous || !!busy}
            onClick={() => mutate('rollback')}
          >
            {busy === 'rollback'
              ? 'Rolling back…'
              : previous
                ? `Roll back to version ${previous.version}`
                : 'No previous version'}
          </button>
          <p className="caption">
            Rollback changes the version for new sessions. Existing sessions and analytics are
            preserved.
          </p>
        </section>
        <section className="section">
          <h2>Publish configuration</h2>
          <p className="help">Upload a JSON file or paste its contents.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate('publish');
            }}
          >
            <label className="file-picker button">
              Choose JSON file
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
                    setError(errorMessage(error));
                  }
                  event.target.value = '';
                }}
              />
            </label>
            {filename && <p className="caption">{filename}</p>}
            <label className="field json-field">
              <span className="sr-only">JSON configuration</span>
              <textarea
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setFilename('');
                }}
                spellCheck={false}
                placeholder="Paste a JSON configuration"
                disabled={!!busy}
              />
            </label>
            {source.trim() && !valid && (
              <p className="error" role="alert">
                Enter a valid JSON object.
              </p>
            )}
            <button className="button primary" disabled={!valid || !!busy}>
              {busy === 'publish' ? 'Publishing…' : 'Publish version'}
            </button>
            <p className="caption">The configuration is validated before publication.</p>
          </form>
        </section>
      </div>
    </>
  );
}
