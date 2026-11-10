export * from './types';
export { ALLOWED_CRITERIA_KEYS, isCalendarDate, validateOpportunity } from './evidence';
export { dedupeOpportunities, normalizeName, normalizeSourceUrl } from './dedupe';
export { FRESH_EVIDENCE_DAYS, confidenceFor, evidenceAgeDays, rankOpportunities } from './score';
export { REQUIRED_FACTS, SAMPLE_BANNER, buildPropertyReport, renderReportMarkdown } from './report';
export { FUNNEL_STAGES, NOT_BUYER_EVIDENCE_KINDS, buildFunnel } from './performance';
export type { Funnel, FunnelInput, FunnelStage, FunnelStageResult, NotBuyerEvidenceKind, StageInput } from './performance';
