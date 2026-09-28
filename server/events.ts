import {
  baseEvents,
  type BaseEvent,
  type EventDefinition,
  type Config,
  type Step,
} from '../shared/types.ts';
const fields: Record<BaseEvent, string[]> = {
  session_started: [],
  step_viewed: ['step_type', 'visible_step_index', 'visible_step_count'],
  answer_submitted: ['answer_kind'],
  step_completed: ['next_step_id'],
  back_clicked: ['destination_step_id'],
  result_viewed: ['result_id'],
  cta_clicked: ['result_id', 'action'],
};
const safeProperties = new Set([...Object.values(fields).flat(), 'source']);
export function definitions(config: Config): EventDefinition[] {
  return config.eventDefinitions ?? baseEvents.map((name) => ({ name, properties: fields[name] }));
}
export function validateEvents(config: Config) {
  const defs = definitions(config);
  if (!Array.isArray(defs) || new Set(defs.map((d) => d.name)).size !== defs.length)
    throw Error('Invalid event definitions');
  for (const name of baseEvents)
    if (!defs.some((d) => d.name === name)) throw Error(`Missing event ${name}`);
  for (const def of defs) {
    if (typeof def.name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(def.name))
      throw Error('Invalid event name');
    if (!Array.isArray(def.properties) || def.properties.some((p) => !safeProperties.has(p)))
      throw Error(`Unsupported properties for ${def.name}`);
    if (
      baseEvents.includes(def.name as BaseEvent) &&
      fields[def.name as BaseEvent].some((key) => !def.properties.includes(key))
    )
      throw Error(`Missing base event properties for ${def.name}`);
    if (
      def.emitOn &&
      (!baseEvents.includes(def.emitOn) || baseEvents.includes(def.name as BaseEvent))
    )
      throw Error('Custom events must be triggered by a base event');
    if (
      def.stepId &&
      !Object.values(config.variants).some((v) => v.steps.some((s) => s.id === def.stepId))
    )
      throw Error('Unknown event trigger step');
  }
}

// Only identifiers/enums defined by the pinned config and bounded counters are stored.
// Neither arbitrary strings nor nested answer objects are accepted as event properties.
export function validateProperties(
  config: Config,
  steps: Step[],
  definition: EventDefinition,
  raw: unknown,
): Record<string, unknown> {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Invalid properties');
  if (JSON.stringify(raw).length > 4096) throw Error('Properties too large');
  const props = raw as Record<string, unknown>;
  const resultIds = Object.keys(config.results ?? {});
  const actions = Object.values(config.results ?? {}).map((r) => r.cta.action);
  for (const variant of Object.values(config.variants))
    for (const r of Object.values(variant.resultOverrides ?? {}))
      if (r.cta?.action) actions.push(r.cta.action);
  for (const [key, value] of Object.entries(props)) {
    if (!definition.properties.includes(key)) throw Error(`Property not allowed: ${key}`);
    let valid = false;
    if (key === 'step_type' || key === 'answer_kind')
      valid =
        ['single', 'multi', 'number', 'info', 'result'].includes(String(value)) &&
        typeof value === 'string';
    if (key === 'next_step_id' || key === 'destination_step_id')
      valid = typeof value === 'string' && steps.some((s) => s.id === value);
    if (key === 'result_id') valid = typeof value === 'string' && resultIds.includes(value);
    if (key === 'action') valid = typeof value === 'string' && actions.includes(value);
    if (key === 'source') valid = value === 'result_cta';
    if (key === 'visible_step_index' || key === 'visible_step_count')
      valid =
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= steps.length;
    if (!valid) throw Error(`Invalid property: ${key}`);
  }
  return { ...props };
}
