export interface SimilarityTarget {
  beds: number;
  price: number;
  postalCode: string;
  neighborhood?: string;
  /** Ownership class of the subject (Condo/Co-op/Condop, raw or mapped). Comps must match it. */
  ownership?: string | null;
}

export interface SimilarityCandidate {
  beds: number | null;
  price: number;
  postalCode?: string | null;
  neighborhood?: string | null;
  /** Candidate ownership class (raw CommonInterest / mapped propertyType). */
  ownership?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

/** Collapse the many ownership spellings to a canonical class. Compare a condo to condos, a co-op to
 *  co-ops — they are different ownership/financing structures and are NOT interchangeable comps. */
export function normalizeOwnership(value: string | null | undefined): '' | 'condo' | 'coop' | 'condop' {
  const v = normalize(value);
  if (!v) return '';
  if (v.includes('condop')) return 'condop';            // must precede 'condo' (condop contains "condo")
  if (v.includes('coop') || v.includes('co-op') || v.includes('cooperative')) return 'coop';
  if (v.includes('condo') || v.includes('condominium')) return 'condo';
  return '';
}

/** True when ownership classes are compatible. Unknown on EITHER side → permissive (never drop a
 *  candidate just because its type is unlabeled); two KNOWN, differing classes → not a match. */
export function isOwnershipMatch(target: string | null | undefined, candidate: string | null | undefined): boolean {
  const t = normalizeOwnership(target);
  const c = normalizeOwnership(candidate);
  if (!t || !c) return true;
  return t === c;
}

export function getSimilarityPriceBand(price: number, isRental: boolean): { min: number; max: number } {
  const lower = isRental ? 0.75 : 0.7;
  const upper = isRental ? 1.25 : 1.3;
  return {
    min: Math.max(1, Math.round(price * lower)),
    max: Math.max(1, Math.round(price * upper)),
  };
}

export function isBedroomMatch(targetBeds: number, candidateBeds: number | null): boolean {
  if (candidateBeds == null) return false;
  if (targetBeds === 0) return candidateBeds === 0 || candidateBeds === 1;
  return Math.abs(candidateBeds - targetBeds) <= 1;
}

export function similarityScore(target: SimilarityTarget, candidate: SimilarityCandidate): number {
  if (!isBedroomMatch(target.beds, candidate.beds)) return Number.POSITIVE_INFINITY;
  // Ownership class is a HARD gate (condo↔condo, co-op↔co-op) — excluded, not merely down-ranked.
  if (!isOwnershipMatch(target.ownership, candidate.ownership)) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(candidate.price) || candidate.price <= 0 || target.price <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const priceDistance = Math.abs(candidate.price - target.price) / target.price;
  const bedDistance = Math.abs((candidate.beds ?? target.beds) - target.beds);
  const targetZip = normalize(target.postalCode);
  const candidateZip = normalize(candidate.postalCode);
  const targetNeighborhood = normalize(target.neighborhood);
  const candidateNeighborhood = normalize(candidate.neighborhood);

  const locationPenalty = targetZip && candidateZip === targetZip
    ? 0
    : targetNeighborhood && candidateNeighborhood === targetNeighborhood
      ? 0.08
      : 0.25;

  return priceDistance * 100 + bedDistance * 20 + locationPenalty * 100;
}

export function rankSimilarListings<T extends SimilarityCandidate>(
  candidates: T[],
  target: SimilarityTarget,
  limit = 6,
): T[] {
  return candidates
    .map((candidate) => ({ candidate, score: similarityScore(target, candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
