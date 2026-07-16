export interface SimilarityTarget {
  beds: number;
  price: number;
  postalCode: string;
  neighborhood?: string;
  /** Canonical property class of the subject (already normalized: condo/coop/condop/townhouse/
   *  multifamily/house/loft/apartment, or '' when unknown). Comps must match it. */
  propertyClass?: string | null;
}

export interface SimilarityCandidate {
  beds: number | null;
  price: number;
  postalCode?: string | null;
  neighborhood?: string | null;
  /** Candidate's canonical property class (normalized, same vocabulary as the target). */
  propertyClass?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

/** The canonical comparison classes. Compare like-with-like: a townhouse to townhouses, a condo to
 *  condos, a co-op to co-ops — different products that are NOT interchangeable comps. */
export type PropertyClass = '' | 'condo' | 'coop' | 'condop' | 'townhouse' | 'loft' | 'apartment';

/** Collapse the many ownership/type spellings (RESO enums + our display strings) to ONE class.
 *  Handles raw feed values (Condominium, StockCooperative, SingleFamilyResidence, MultiFamily,
 *  Duplex…) and our mapped labels (Condo, Co-op…). Round-trips its own output.
 *
 *  NYC townhouse reality (verified live on the Cotality API 2026-07-16): the feed does NOT use the
 *  'Townhouse' sub-type — townhouses appear as SingleFamilyResidence, MultiFamily, or Duplex with
 *  CommonInterest=None. So all fee-simple / whole-building homes (single- AND multi-family) fold into ONE
 *  'townhouse' class — a townhouse compares to townhouses, never to condo/co-op apartments. A duplex/
 *  unit that carries a condo/co-op CommonInterest is an APARTMENT and is caught earlier via
 *  classifyPropertyClass (CommonInterest first), so only CI=None fee-simple homes reach here. */
export function normalizePropertyClass(value: string | null | undefined): PropertyClass {
  const v = normalize(value);
  if (!v) return '';
  if (v.includes('condop')) return 'condop';                                   // before 'condo'
  if (v.includes('stockcooperative') || v.includes('cooperative') || v.includes('coop') || v.includes('co-op')) return 'coop';
  if (
    v.includes('townhouse') || v.includes('town house') || v.includes('rowhouse') || v.includes('row house') || v.includes('brownstone') ||
    v.includes('singlefamily') || v.includes('single family') || v.includes('single-family') || v.includes('detached') ||
    v.includes('multifamily') || v.includes('multi family') || v.includes('multi-family') ||
    v.includes('duplex') || v.includes('triplex') || v.includes('quadruplex') || v.includes('twoapartment') ||
    /\b(two|three|four)\s*family\b/.test(v)
  ) return 'townhouse';
  if (v.includes('loft')) return 'loft';
  if (v.includes('condominium') || v === 'condo') return 'condo';
  if (v.includes('apartment') || v === 'studio') return 'apartment';
  return '';
}

/** Classify a candidate from the raw feed fields. Ownership structure (CommonInterest) wins first —
 *  matching mapPropertyTypeToDisplay's priority — then PropertySubType, then PropertyType. */
export function classifyPropertyClass(
  commonInterest: string | null | undefined,
  propertySubType: string | null | undefined,
  propertyType?: string | null | undefined,
): PropertyClass {
  return normalizePropertyClass(commonInterest) || normalizePropertyClass(propertySubType) || normalizePropertyClass(propertyType);
}

/** For RENTALS, ownership structure is not a meaningful comp split — a condo rental and a
 *  rental-building apartment are the same product to a renter — so collapse all apartment-style units
 *  (condo/co-op/condop/loft/apartment) into one 'apartment' bucket. Townhouse / multifamily / house
 *  stay DISTINCT (a townhouse rental is a different product from an apartment rental). Sales unchanged. */
export function collapseForRental(cls: PropertyClass, isRental: boolean): PropertyClass {
  if (!isRental) return cls;
  if (cls === 'condo' || cls === 'coop' || cls === 'condop' || cls === 'loft' || cls === 'apartment') return 'apartment';
  return cls;
}

/** True when property classes are compatible. Unknown on EITHER side → permissive (never drop a
 *  candidate just because its type is unlabeled); two KNOWN, differing classes → not a match. */
export function isPropertyClassMatch(target: string | null | undefined, candidate: string | null | undefined): boolean {
  const t = normalizePropertyClass(target);
  const c = normalizePropertyClass(candidate);
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
  // Property class is a HARD gate (townhouse↔townhouse, condo↔condo, house↔house…) — excluded, not
  // merely down-ranked. Rentals collapse apartment-style upstream so a rental condo ↔ rental apartment.
  if (!isPropertyClassMatch(target.propertyClass, candidate.propertyClass)) return Number.POSITIVE_INFINITY;
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
