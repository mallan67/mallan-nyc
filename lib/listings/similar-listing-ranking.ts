export interface SimilarityTarget {
  beds: number;
  price: number;
  postalCode: string;
  neighborhood?: string;
}

export interface SimilarityCandidate {
  beds: number | null;
  price: number;
  postalCode?: string | null;
  neighborhood?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
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
