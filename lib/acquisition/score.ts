/**
 * Confidence and ranking.
 *
 * Confidence describes the EVIDENCE: the kind of finding, whether it is verified, and how old the
 * source is. It is not the likelihood of a sale and not a prediction that anyone will buy. There is
 * no numeric score, because a number would read as a probability.
 *
 *   stated_requirement    verified + fresh -> high;  verified or partially verified -> medium;  else low
 *   acquisition_activity  verified + fresh -> medium; else low   (history, never above medium)
 *   expansion_signal      always low                              (says nothing about buying)
 *   distribution_channel  verified live placement, verified + fresh -> high; else low
 *   conflicting           always low
 *
 * FRESH_EVIDENCE_DAYS is a policy constant chosen for this pilot, not a legal or provider figure.
 * Maya can change it; the tests pin its boundary.
 */
import type { ConfidenceLevel, MergedOpportunity, RankedOpportunity, AcquisitionOpportunity } from './types';

export const FRESH_EVIDENCE_DAYS = 180;

const DAY_MS = 86_400_000;
const ORDER: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };

/** Whole days from the evidence date to `now` (UTC dates). */
export function evidenceAgeDays(evidenceDate: string, now: Date): number {
  const evidence = Date.parse(`${evidenceDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - evidence) / DAY_MS);
}

export function confidenceFor(o: AcquisitionOpportunity, now: Date): ConfidenceLevel {
  if (o.verification === 'conflicting') return 'low';
  const fresh = evidenceAgeDays(o.evidence_date, now) <= FRESH_EVIDENCE_DAYS;
  const verified = o.verification === 'verified';
  const partial = o.verification === 'partially_verified';
  switch (o.kind) {
    case 'stated_requirement':
      if (verified && fresh) return 'high';
      return verified || partial ? 'medium' : 'low';
    case 'acquisition_activity':
      return verified && fresh ? 'medium' : 'low';
    case 'expansion_signal':
      return 'low';
    case 'distribution_channel':
      return o.placement_status === 'verified_live' && verified && fresh ? 'high' : 'low';
    default:
      return 'low';
  }
}

export function rankOpportunities(list: Array<AcquisitionOpportunity & Partial<MergedOpportunity>>, now: Date): RankedOpportunity[] {
  const ranked = list.map((o): RankedOpportunity => {
    const age = evidenceAgeDays(o.evidence_date, now);
    return {
      ...o,
      citations: o.citations ?? [{ url: o.source_url, evidence_date: o.evidence_date }],
      confidence: confidenceFor(o, now),
      evidence_age_days: age,
      confidence_reasons: [
        `kind: ${o.kind}`,
        `verification: ${o.verification}`,
        `evidence age: ${age} days (${age <= FRESH_EVIDENCE_DAYS ? 'fresh' : 'older'} against a ${FRESH_EVIDENCE_DAYS}-day limit)`,
        ...(o.kind === 'distribution_channel' ? [`placement: ${o.placement_status ?? 'unknown'}`] : []),
      ],
    };
  });
  return ranked.sort(
    (a, b) =>
      ORDER[a.confidence] - ORDER[b.confidence] ||
      (a.evidence_date < b.evidence_date ? 1 : a.evidence_date > b.evidence_date ? -1 : 0) ||
      (a.name ?? '').localeCompare(b.name ?? '') ||
      a.id.localeCompare(b.id),
  );
}
