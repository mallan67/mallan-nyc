/**
 * Performance funnel: separate numbers, never one total.
 *
 * The stages are kept apart on purpose. An impression, a click, a sent email or a public directory
 * record is not a buyer, so those go in `not_buyer_evidence` and never into a stage. A stage nobody
 * tracks is `tracked: false` with no count; it is not zero. A stage with a count must say where the
 * count came from, when, and at which SELLER-001 truth level (lib/seller-report/build-report).
 *
 * Nothing here reads a database. The caller passes the counts it has; this module refuses an
 * unsupported one and refuses to add them up.
 */
import { TRUTH_LEVELS, type TruthLevel } from '@/lib/seller-report/build-report';
import { isCalendarDate } from './evidence';
import type { ValidationIssue } from './types';

export const FUNNEL_STAGES = [
  'verified_exposure',
  'tracked_visits',
  'qualified_inquiries',
  'showing_requests',
  'completed_showings',
  'diligence_requests',
  'offers',
  'contracts',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const NOT_BUYER_EVIDENCE_KINDS = ['impressions', 'clicks', 'emails_sent', 'public_directory_records'] as const;
export type NotBuyerEvidenceKind = (typeof NOT_BUYER_EVIDENCE_KINDS)[number];

export interface StageInput {
  count: number;
  source: string;
  as_of: string;
  truth_level: TruthLevel;
}

export interface FunnelInput {
  stages: Partial<Record<FunnelStage, StageInput>>;
  not_buyer_evidence?: Partial<Record<NotBuyerEvidenceKind, number>>;
}

export interface FunnelStageResult {
  stage: FunnelStage;
  tracked: boolean;
  count: number | null;
  source: string | null;
  as_of: string | null;
  truth_level: TruthLevel | null;
}

export interface Funnel {
  stages: FunnelStageResult[];
  not_buyer_evidence: Array<{ kind: NotBuyerEvidenceKind; count: number; label: string }>;
  issues: ValidationIssue[];
}

const validCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const TRUTH_VALUES: readonly string[] = Object.values(TRUTH_LEVELS);

export function buildFunnel(input: FunnelInput): Funnel {
  const issues: ValidationIssue[] = [];
  const stages: FunnelStageResult[] = FUNNEL_STAGES.map((stage) => {
    const untracked: FunnelStageResult = { stage, tracked: false, count: null, source: null, as_of: null, truth_level: null };
    const s = input.stages[stage];
    if (s === undefined) return untracked;

    let ok = true;
    if (!validCount(s.count)) {
      issues.push({ code: 'invalid_count', message: `${stage}: count must be a whole number of zero or more.` });
      ok = false;
    }
    if (typeof s.source !== 'string' || s.source.trim() === '' || !isCalendarDate(s.as_of)) {
      issues.push({ code: 'stage_missing_evidence', message: `${stage}: a count needs its source and the date it was read (YYYY-MM-DD).` });
      ok = false;
    }
    if (!TRUTH_VALUES.includes(s.truth_level)) {
      issues.push({ code: 'invalid_truth_level', message: `${stage}: truth_level must be one of ${TRUTH_VALUES.join(', ')}.` });
      ok = false;
    }
    // A refused stage shows as untracked, so bad data never appears as a number.
    return ok ? { stage, tracked: true, count: s.count, source: s.source, as_of: s.as_of, truth_level: s.truth_level } : untracked;
  });

  for (const key of Object.keys(input.stages)) {
    if (!(FUNNEL_STAGES as readonly string[]).includes(key)) issues.push({ code: 'unknown_stage', message: `"${key}" is not a funnel stage.` });
  }

  const not_buyer_evidence: Funnel['not_buyer_evidence'] = [];
  for (const [kind, count] of Object.entries(input.not_buyer_evidence ?? {})) {
    if (!(NOT_BUYER_EVIDENCE_KINDS as readonly string[]).includes(kind)) {
      issues.push({ code: 'unknown_stage', message: `"${kind}" is not a recognised not-buyer-evidence kind.` });
      continue;
    }
    if (!validCount(count)) {
      issues.push({ code: 'invalid_count', message: `${kind}: count must be a whole number of zero or more.` });
      continue;
    }
    not_buyer_evidence.push({ kind: kind as NotBuyerEvidenceKind, count, label: 'Not buyer evidence' });
  }

  return { stages, not_buyer_evidence, issues };
}
