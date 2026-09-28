import { text } from './locale';
import { useEffect, useRef, useState } from 'react';
import type { FunnelState, Step } from '../shared/types';
import { Shell, Notice } from './components';
import { draftKey, queueEvent, useFunnel } from './useFunnel';

type Answer = string | number | string[];
function readAnswer(data: FunnelState, step: Step): Answer {
  let value: unknown = data.session.answers[step.id];
  try {
    const draft = localStorage.getItem(draftKey(data));
    if (draft !== null) value = JSON.parse(draft);
  } catch {
    /* Ignore an invalid local draft; saved server answers remain intact. */
  }
  if (step.type === 'multi')
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
  return typeof value === 'string' || typeof value === 'number' ? value : '';
}
export function Funnel() {
  const runtime = useFunnel();
  const { data } = runtime;
  const step = data?.config.variants[data.session.variant].steps.find(
    (step) => step.id === data.session.current,
  );
  return (
    <Shell>
      <main id="main" className="page funnel-page">
        {data && step ? (
          <FunnelStep
            key={`${data.session.id}:${step.id}`}
            data={data}
            step={step}
            runtime={runtime}
          />
        ) : (
          <div className="loading-state" aria-busy={!runtime.error}>
            {runtime.error ? (
              <>
                <Notice error>{runtime.error}</Notice>
                <button className="button" onClick={runtime.retry}>
                  Retry
                </button>
              </>
            ) : (
              <p role="status">Loading session…</p>
            )}
          </div>
        )}
      </main>
    </Shell>
  );
}
function FunnelStep({
  data,
  step,
  runtime,
}: {
  data: FunnelState;
  step: Step;
  runtime: ReturnType<typeof useFunnel>;
}) {
  const [value, setValue] = useState<Answer>(() => readAnswer(data, step));
  const [expanded, setExpanded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const visible = data.path.filter(
    (step) => !data.config.progressExcludeTypes?.includes(step.type),
  );
  const index = visible.findIndex((candidate) => candidate.id === step.id);
  const result = step.type === 'result';
  const progress = result
    ? 100
    : index < 0
      ? 0
      : Math.round(((index + 1) / Math.max(1, visible.length)) * 100);
  const send = (type: string, properties: Record<string, unknown>) =>
    queueEvent({
      event_id: crypto.randomUUID(),
      session_id: data.session.id,
      client_timestamp: new Date().toISOString(),
      type,
      step_id: step.id,
      properties,
    });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    send(
      result ? 'result_viewed' : 'step_viewed',
      result
        ? { result_id: step.resultId }
        : {
            step_type: step.type,
            visible_step_index: index + 1,
            visible_step_count: visible.length,
          },
    );
  }, []);
  function change(next: Answer) {
    setValue(next);
    localStorage.setItem(draftKey(data), JSON.stringify(next));
  }
  function toggle(option: string) {
    const selected = Array.isArray(value) ? value : [];
    change(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  }
  return (
    <>
      {step.type !== 'info' && (
        <div className="funnel-progress">
          <span>{result ? 'Complete' : `Question ${index + 1} of ${visible.length}`}</span>
          <progress aria-label="Funnel progress" max={100} value={progress} />
        </div>
      )}
      <h1 id="step-title" ref={heading} tabIndex={-1}>
        {text(step.title)}
      </h1>
      {step.body && <p className="intro-copy">{text(step.body)}</p>}
      {step.helperText && (
        <p className="help" id="step-help">
          {text(step.helperText)}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (result) {
            setExpanded(true);
            send('cta_clicked', { result_id: step.resultId, action: step.action });
            if (
              data.config.eventDefinitions?.some(
                (event) => event.name === 'recommendation_expanded',
              )
            )
              send('recommendation_expanded', {
                result_id: step.resultId,
                action: step.action,
                source: 'result_cta',
              });
            return;
          }
          const answer =
            step.type === 'info'
              ? null
              : step.type === 'number'
                ? value === ''
                  ? null
                  : Number(value)
                : value;
          void runtime.navigate('answer', answer);
        }}
      >
        {(step.type === 'single' || step.type === 'multi') && (
          <fieldset
            className="choices"
            disabled={runtime.busy}
            aria-labelledby="step-title"
            aria-describedby={step.helperText ? 'step-help' : undefined}
          >
            {step.options?.map((option) => {
              const checked =
                step.type === 'multi'
                  ? Array.isArray(value) && value.includes(option.value)
                  : value === option.value;
              return (
                <label key={option.value} className={`choice${checked ? ' selected' : ''}`}>
                  <input
                    type={step.type === 'multi' ? 'checkbox' : 'radio'}
                    name={step.id}
                    value={option.value}
                    checked={checked}
                    onChange={() =>
                      step.type === 'multi' ? toggle(option.value) : change(option.value)
                    }
                  />
                  <span>{text(option.label)}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {step.type === 'number' && (
          <div className="number-field">
            <input
              aria-labelledby="step-title"
              aria-describedby={step.helperText ? 'step-help' : undefined}
              type="number"
              inputMode="numeric"
              min={step.min}
              max={step.max}
              step={step.inputStep}
              value={typeof value === 'string' || typeof value === 'number' ? value : ''}
              onChange={(event) => change(event.target.value)}
              disabled={runtime.busy}
            />
            {step.unit && <span>{text(step.unit)}</span>}
          </div>
        )}
        {runtime.error && <Notice error>{runtime.error}</Notice>}
        <div
          className={`funnel-actions${step.type === 'info' && !data.session.history.length ? ' initial' : ''}`}
        >
          {data.session.history.length > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={runtime.busy}
              onClick={() => runtime.navigate('back')}
            >
              Back
            </button>
          )}
          <button className="button primary" disabled={runtime.busy}>
            {runtime.busy
              ? 'Saving…'
              : result
                ? text(step.cta || 'View recommendations')
                : text(step.primaryActionLabel || 'Continue')}
          </button>
        </div>
      </form>
      {expanded && step.recommendations && (
        <section className="recommendations" aria-live="polite">
          <h2>Action plan</h2>
          <ol>
            {step.recommendations.map((item) => (
              <li key={item}>{text(item)}</li>
            ))}
          </ol>
        </section>
      )}
      {data.session.history.length > 0 && (
        <div className="funnel-bottom">
          <button className="text-button" disabled={runtime.busy} onClick={runtime.restart}>
            Start over
          </button>
        </div>
      )}
    </>
  );
}
