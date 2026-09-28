import { validateEvents } from './events.ts';
import type { Condition, Config, Step, EventDefinition } from '../shared/types.ts';
export function matches(
  condition: Condition | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  if (condition.all) return condition.all.every((x) => matches(x, answers));
  if (condition.any) return condition.any.some((x) => matches(x, answers));
  const actual = answers[condition.answer || ''];
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'in')
    return Array.isArray(condition.value) && condition.value.includes(actual);
  if (condition.operator === 'contains')
    return Array.isArray(actual) && actual.includes(condition.value);
  if (condition.operator === 'gte')
    return (
      typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value
    );
  return false;
}
export function normalizeConfig(input: unknown): Config {
  const normalized = input as Config;
  if (normalized?.variants?.A?.steps && normalized?.variants?.B?.steps) return normalized;
  const raw = input as SourceConfig;
  if (
    raw?.schemaVersion !== '1.0' ||
    !raw?.funnelId ||
    !raw?.steps ||
    !raw?.experiment?.variants ||
    !raw?.results
  )
    throw Error('Invalid funnel config');
  const variants = {} as Config['variants'];
  for (const variant of ['A', 'B'] as const) {
    const source = raw.experiment.variants[variant];
    if (!Array.isArray(source?.stepSequence) || source.stepSequence.length < 6)
      throw Error(`${variant}: at least six steps required`);
    if (new Set(source.stepSequence).size !== source.stepSequence.length)
      throw Error(`${variant}: duplicate step ID`);
    const steps: Step[] = source.stepSequence.map((id: string) => {
      const base = raw.steps[id];
      if (!base || base.id !== id) throw Error(`Unknown step ${id}`);
      const override = source.stepOverrides?.[id] || {};
      const content = { ...base.content, ...override.content };
      const type = (
        base.type === 'single-select'
          ? 'single'
          : base.type === 'multi-select'
            ? 'multi'
            : base.type
      ) as Step['type'];
      if (!['single', 'multi', 'number', 'info', 'result'].includes(type))
        throw Error(`Invalid step type ${type}`);
      return {
        id,
        type,
        title: content.title || content.loadingTitle || 'Result',
        body: content.body,
        eyebrow: content.eyebrow,
        helperText: content.helperText,
        primaryActionLabel: content.primaryActionLabel,
        options: base.input?.options,
        min: base.input?.min,
        max: base.input?.max,
        inputStep: base.input?.step,
        unit: base.input?.unit,
        required: base.validation?.required,
        minSelections: base.validation?.minSelections,
        maxSelections: base.validation?.maxSelections,
        messages: base.validation?.messages,
        visibleWhen: base.visibleWhen,
      };
    });
    if (steps[0]?.type !== 'info' || steps.at(-1)?.type !== 'result')
      throw Error(`${variant}: intro and result required`);
    variants[variant] = {
      steps,
      weight: source.weight ?? 50,
      resultOverrides: source.resultOverrides || {},
    };
  }
  for (const rule of raw.resultRules || [])
    if (!raw.results[rule.resultId]) throw Error(`Unknown result ${rule.resultId}`);
  if (!raw.results[raw.defaultResultId]) throw Error('Unknown default result');
  return {
    name: raw.title,
    hypothesis:
      'Asking about work mode earlier and reframing the result in B will increase the share of sessions reaching a recommendation.',
    metric: 'Sessions reaching a result / sessions started',
    sourceVersion: raw.version,
    funnelId: raw.funnelId,
    experimentId: raw.experiment.id,
    locale: raw.locale,
    progressExcludeTypes: raw.progress?.excludeTypes || [],
    resultRules: raw.resultRules || [],
    defaultResultId: raw.defaultResultId,
    results: raw.results,
    eventDefinitions: raw.events?.allowed?.map((e) => ({
      name: e.name,
      properties: e.properties,
      emitOn: e.emitOn,
      stepId: e.stepId,
    })),
    ttlHours: raw.session?.ttlHours,
    variants,
  };
}

// The supplied JSON uses this source shape. The runtime uses Config after normalization.
type SourceStep = {
  id: string;
  type: string;
  content?: Partial<Step> & { loadingTitle?: string };
  input?: { options?: Step['options']; min?: number; max?: number; step?: number; unit?: string };
  validation?: Pick<Step, 'required' | 'minSelections' | 'maxSelections' | 'messages'>;
  visibleWhen?: Condition;
};
type SourceConfig = {
  schemaVersion: string;
  funnelId: string;
  title: string;
  version: number;
  locale?: string;
  session?: { ttlHours?: number };
  progress?: { excludeTypes?: string[] };
  steps: Record<string, SourceStep>;
  results: NonNullable<Config['results']>;
  resultRules?: Config['resultRules'];
  defaultResultId: string;
  events?: { allowed: EventDefinition[] };
  experiment: {
    id: string;
    variants: Record<
      'A' | 'B',
      {
        stepSequence: string[];
        weight?: number;
        stepOverrides?: Record<string, { content?: SourceStep['content'] }>;
        resultOverrides?: Config['variants']['A']['resultOverrides'];
      }
    >;
  };
};

export function validateConfig(configuration: Config) {
  if (!configuration || !configuration.variants) throw Error('Invalid config');
  validateEvents(configuration);
  if (
    configuration.ttlHours !== undefined &&
    (!Number.isFinite(configuration.ttlHours) || configuration.ttlHours <= 0)
  )
    throw Error('Invalid session TTL');
  const weights = [configuration.variants.A?.weight ?? 50, configuration.variants.B?.weight ?? 50];
  if (
    weights.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0) ||
    weights[0] + weights[1] <= 0
  )
    throw Error('Invalid experiment weights');
  for (const result of Object.values(configuration.results || {})) validateResult(result);
  for (const assignedVariant of ['A', 'B'] as const) {
    for (const [id, override] of Object.entries(
      configuration.variants[assignedVariant]?.resultOverrides || {},
    )) {
      const result = configuration.results?.[id];
      if (!result) throw Error(`Unknown result override ${id}`);
      validateResult({ ...result, ...override, cta: { ...result.cta, ...override.cta } });
    }
    const sequence = configuration.variants[assignedVariant]?.steps;
    if (!Array.isArray(sequence) || sequence.length < 6)
      throw Error(`${assignedVariant}: at least six steps required`);
    const ids = new Set(sequence.map((x) => x.id));
    if (ids.size !== sequence.length) throw Error(`${assignedVariant}: duplicate step ID`);
    if (!sequence.some((x) => x.type === 'result'))
      throw Error(`${assignedVariant}: result required`);
    for (const step of sequence) {
      if (
        typeof step.id !== 'string' ||
        !step.id ||
        typeof step.title !== 'string' ||
        !step.title ||
        !['single', 'multi', 'number', 'info', 'result'].includes(step.type)
      )
        throw Error('Invalid step');
      for (const text of [step.body, step.helperText, step.primaryActionLabel, step.cta, step.unit])
        if (text !== undefined && typeof text !== 'string') throw Error(`${step.id}: invalid text`);
      if (step.type === 'single' || step.type === 'multi') {
        const options = step.options;
        if (
          !Array.isArray(options) ||
          !options.length ||
          options.some(
            (option) =>
              !option || typeof option.value !== 'string' || typeof option.label !== 'string',
          ) ||
          new Set(options.map((option) => option.value)).size !== options.length
        )
          throw Error(`${step.id}: options must have unique values and text labels`);
        if (
          step.type === 'multi' &&
          ([step.minSelections, step.maxSelections].some(
            (count) =>
              count !== undefined &&
              (!Number.isInteger(count) || count < 0 || count > options.length),
          ) ||
            (step.minSelections ?? 0) > (step.maxSelections ?? options.length))
        )
          throw Error(`${step.id}: invalid selection limits`);
      }
      if (
        step.type === 'number' &&
        ([step.min, step.max, step.inputStep].some(
          (value) => value !== undefined && !Number.isFinite(value),
        ) ||
          (step.inputStep !== undefined && step.inputStep <= 0) ||
          (step.min !== undefined && step.max !== undefined && step.min > step.max))
      )
        throw Error(`${step.id}: invalid numeric limits`);
      for (const target of [step.next, ...(step.rules || []).map((rule) => rule.next)].filter(
        Boolean,
      ))
        if (!ids.has(target!)) throw Error(`Unknown target ${target}`);
    }
  }
}

function validateResult(result: NonNullable<Config['results']>[string]) {
  if (
    !result ||
    [result.id, result.title, result.summary, result.cta?.label, result.cta?.action].some(
      (text) => typeof text !== 'string' || !text,
    ) ||
    !Array.isArray(result.recommendations) ||
    result.recommendations.some((text) => typeof text !== 'string')
  )
    throw Error('Invalid result content');
}
