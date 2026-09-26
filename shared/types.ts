export type Variant = 'A' | 'B';
export const baseEvents = [
  'session_started',
  'step_viewed',
  'answer_submitted',
  'step_completed',
  'back_clicked',
  'result_viewed',
  'cta_clicked',
] as const;
export type BaseEvent = (typeof baseEvents)[number];
export type EventDefinition = {
  name: string;
  properties: string[];
  emitOn?: BaseEvent;
  stepId?: string;
};
export type ResultOverride = Partial<Omit<Result, 'cta'>> & { cta?: Partial<Result['cta']> };
export type Condition = {
  answer?: string;
  operator?: 'eq' | 'in' | 'gte';
  value?: unknown;
  all?: Condition[];
  any?: Condition[];
};
export type Step = {
  id: string;
  type: 'single' | 'multi' | 'number' | 'info' | 'result';
  title: string;
  body?: string;
  eyebrow?: string;
  helperText?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  inputStep?: number;
  unit?: string;
  minSelections?: number;
  maxSelections?: number;
  messages?: Record<string, string>;
  visibleWhen?: Condition;
  cta?: string;
  action?: string;
  recommendations?: string[];
  resultId?: string;
  primaryActionLabel?: string;
  next?: string;
  rules?: {
    when: { step: string; equals?: string; includes?: string; gte?: number };
    next: string;
  }[];
};
export type Result = {
  id: string;
  title: string;
  summary: string;
  recommendations: string[];
  cta: { label: string; action: string };
};
export type Config = {
  name: string;
  hypothesis: string;
  metric: string;
  sourceVersion?: number;
  funnelId?: string;
  experimentId?: string;
  locale?: string;
  progressExcludeTypes?: string[];
  resultRules?: { resultId: string; when: Condition }[];
  defaultResultId?: string;
  results?: Record<string, Result>;
  eventDefinitions?: EventDefinition[];
  ttlHours?: number;
  variants: {
    A: { steps: Step[]; weight?: number; resultOverrides?: Record<string, ResultOverride> };
    B: { steps: Step[]; weight?: number; resultOverrides?: Record<string, ResultOverride> };
  };
};

export type Session = {
  id: string;
  version: number;
  variant: Variant;
  utm: Record<string, string>;
  answers: Record<string, unknown>;
  history: string[];
  current: string;
  createdAt: string;
};
export type IncomingEvent = {
  event_id: string;
  session_id: string;
  client_timestamp: string;
  type: string;
  step_id?: string;
  properties?: Record<string, unknown>;
};
export type EventReceipt = {
  index: number;
  status: 'accepted' | 'duplicate' | 'rejected';
  error?: string;
};
export type FunnelState = { session: Session; config: Config; path: Step[] };
export type VersionSummary = { version: number; published_at: string; sourceVersion?: number };
export type AdminMeta = { active: number; versions: VersionSummary[] };
export type ExperimentState = { version: number; active: number; config: Config };
export type StepMetric = {
  id: string;
  title: string;
  views: number;
  dropoff: number;
  conversion: number;
};
export type AnalyticsGroup = {
  version: number;
  sourceVersion?: number;
  funnelId?: string;
  variant: Variant;
  started: number;
  result: number;
  cta: number;
  resultWithCta: number;
  resultRate: number;
  ctr: number;
  steps: Record<string, { views: number; advanced: number }>;
  stepMetrics: StepMetric[];
};
export type AnalyticsReport = { sessions: number; groups: AnalyticsGroup[]; campaigns: string[] };
