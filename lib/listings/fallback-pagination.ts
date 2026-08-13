import type { IDXListing } from '@/lib/idx/types';
import type { PublicListingDTO } from '@/lib/idx/public-dto';
import { preferCrmExclusiveOverIdxDuplicate } from '@/lib/listings/dedupe-crm-vs-idx';

export type FallbackListingCandidate =
  | {
      source: 'idx';
      id: string;
      address: PublicListingDTO['address'];
      modificationTimestamp: string;
      dto: PublicListingDTO;
      listing: IDXListing;
    }
  | {
      source: 'crm';
      id: string;
      address: PublicListingDTO['address'];
      modificationTimestamp: string;
      dto: PublicListingDTO;
    };

export interface FallbackPage {
  canonical: FallbackListingCandidate[];
  page: FallbackListingCandidate[];
}

/**
 * The live IDX fallback can prove only `pet-friendly` from CARD_SELECT_FIELDS.
 * Returning unfiltered provider rows for another requested amenity would assert
 * a match we cannot verify, so unsupported amenity searches fail closed on the
 * provider pool while the typed CRM pool continues through its feature filter.
 */
export function filterTrestleAmenities<T extends Record<string, unknown>>(
  records: T[],
  amenities: string | null,
): T[] {
  if (!amenities) return records;
  const requested = amenities.split(',').map((value) => value.trim()).filter(Boolean);
  if (requested.some((value) => value !== 'pet-friendly')) return [];
  if (!requested.includes('pet-friendly')) return records;
  return records.filter((record) => {
    const value = String(record.PetsAllowed || '').toLowerCase();
    if (!value) return false;
    return !value.includes('no') || value.includes('catsok') || value.includes('dogsok');
  });
}

function exactIdDedupe(candidates: FallbackListingCandidate[]): FallbackListingCandidate[] {
  const byId = new Map<string, FallbackListingCandidate>();
  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    if (!current || (candidate.source === 'crm' && current.source !== 'crm')) {
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

function numberDesc(a: number | null | undefined, b: number | null | undefined): number {
  return (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY);
}

function numberAsc(a: number | null | undefined, b: number | null | undefined): number {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function compareCandidates(
  a: FallbackListingCandidate,
  b: FallbackListingCandidate,
  sort: string | null,
): number {
  let compared = 0;
  switch (sort) {
    case 'price-asc':
      compared = numberAsc(a.dto.listPrice, b.dto.listPrice);
      break;
    case 'price-desc':
      compared = numberDesc(a.dto.listPrice, b.dto.listPrice);
      break;
    case 'sqft-desc':
      compared = numberDesc(a.dto.livingArea, b.dto.livingArea);
      break;
    case 'beds-desc':
      compared = numberDesc(a.dto.bedroomsTotal, b.dto.bedroomsTotal);
      break;
    case 'neighborhood':
      compared = (a.dto.address.neighborhood || '').localeCompare(b.dto.address.neighborhood || '');
      break;
    case 'newest':
    case 'new-development':
      compared = b.modificationTimestamp.localeCompare(a.modificationTimestamp);
      break;
    default:
      // Preserve the product's established default: Mallan-owned rows first,
      // then the provider's default price-desc order.
      compared = Number(a.source !== 'crm') - Number(b.source !== 'crm');
      if (compared === 0) compared = numberDesc(a.dto.listPrice, b.dto.listPrice);
      break;
  }
  // Every explicit order is global across both sources. The listing id is the
  // deterministic final tie-breaker so the same rows cannot swap pages.
  return compared || a.id.localeCompare(b.id);
}

/**
 * Build the canonical combined prefix, then paginate it exactly once.
 *
 * Order of operations is contractual: exact-id dedupe -> physical-unit
 * prefer-CRM dedupe -> combined sort -> one slice. Sorting before dedupe can
 * place a discarded IDX twin and its CRM winner on opposite pages.
 */
export function paginateFallbackCandidates(
  candidates: FallbackListingCandidate[],
  options: { sort: string | null; skip: number; limit: number },
): FallbackPage {
  const sourceEligible = options.sort === 'exclusives'
    ? candidates.filter((candidate) => candidate.source === 'crm')
    : candidates;
  const exact = exactIdDedupe(sourceEligible);
  // The shared physical-unit helper recognizes canonical CRM ids by SL-/RL-
  // prefix. This pool also contains website-only Mallan rows whose ids need not
  // carry that prefix, but their `source: crm` authority is already proven by
  // the exclusive DB predicate. Adapt only the helper-facing id; keep the real
  // public id inside `candidate`.
  const physical = preferCrmExclusiveOverIdxDuplicate(
    exact.map((candidate, index) => ({
      id: candidate.source === 'crm' ? `SL-COMBINED-${index}` : candidate.id,
      address: candidate.address,
      modificationTimestamp: candidate.modificationTimestamp,
      candidate,
    })),
  ).map((entry) => entry.candidate);
  const canonical = physical
    .slice()
    .sort((a, b) => compareCandidates(a, b, options.sort));
  return {
    canonical,
    page: canonical.slice(options.skip, options.skip + options.limit),
  };
}

export function isWithinBounds(
  candidate: FallbackListingCandidate,
  bounds: { south: number; west: number; north: number; east: number },
): boolean {
  const { latitude, longitude } = candidate.dto.address;
  // Bounds are a removing filter. An unresolved coordinate cannot be asserted
  // to be inside the requested map, so it fails closed.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude! >= bounds.south && latitude! <= bounds.north
    && longitude! >= bounds.west && longitude! <= bounds.east;
}

export function hasDisclosedAddress(candidate: FallbackListingCandidate): boolean {
  return candidate.dto.address.streetName !== 'Address Undisclosed';
}

export function matchesBorough(candidate: FallbackListingCandidate, borough: string): boolean {
  const expected = borough.trim().toLowerCase();
  const county = candidate.dto.address.county.toLowerCase();
  const city = candidate.dto.address.city.toLowerCase();
  if (expected === 'manhattan') return county.includes('new york') || city === 'manhattan';
  if (expected === 'brooklyn') return county.includes('kings') || city === 'brooklyn';
  if (expected === 'queens') return county.includes('queens') || city === 'queens';
  if (expected === 'bronx') return county.includes('bronx') || city === 'bronx';
  if (expected === 'staten island') return county.includes('richmond') || city === 'staten island';
  return county.includes(expected) || city === expected;
}
