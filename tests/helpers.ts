import type { createStore } from '../server/core.ts';
import type { Session } from '../shared/types.ts';

export function reachResult(
  store: ReturnType<typeof createStore>,
  session: Session,
  answers: Record<string, unknown> = {},
) {
  while (session.current !== 'result') {
    const step = store.steps(session).find((candidate) => candidate.id === session.current)!;
    store.submit(
      session,
      Object.hasOwn(answers, step.id)
        ? answers[step.id]
        : step.type === 'info'
          ? null
          : step.type === 'number'
            ? Math.max(step.min ?? 0, 2)
            : step.type === 'multi'
              ? [step.options![0].value]
              : step.options![0].value,
    );
  }
}
