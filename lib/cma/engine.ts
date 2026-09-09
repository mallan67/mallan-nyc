/**
 * CMA Engine — Comparable Market Analysis
 * Finds comparable listings, applies adjustments, estimates value.
 */

import prisma from '@/lib/prisma';
import { lifecycleFromStoredRow } from '@/lib/listings/canonical-lifecycle';
import { marketDom } from '@/lib/compliance/dom-tracker';
// The comp-eligibility authority (CloseDate window, ownership segmentation) is consumed through its ONE designated
// consumer, lib/comps/fetch-comps.ts — this engine is not a second reader of the canonical status vocabulary.
import { isEligibleComp } from '@/lib/comps/fetch-comps';
// The comp status vocabulary: the exact live token to store on a comp record plus the broker LABEL for that
// token on THIS transaction (owner ruling 2026-09-08 -- Closed reads "Sold" on a sale and "Rented" on a rental,
// Pending reads "In Contract" on a sale; a label is never a stored value and the two transactions never mix).
import { compStatusLabel } from '@/lib/comps/status-criteria';
import { mallanStorageStatusesForCotality, normalizeStoredStatus } from '@/lib/listings/mallan-status';
import type { Prisma } from '@prisma/client';
import { canDisplayListingAddress, SEARCH_DISPLAY_GATE } from '@/lib/search/listing-access-decision';

/** The subject is not sufficient to assemble a comp set (the caller must fix the request, not widen the search). */
export class CmaSubjectError extends Error {
  readonly code = 'CMA_SUBJECT_INCOMPLETE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CmaSubjectError';
  }
}

export function isCmaSubjectError(e: unknown): e is CmaSubjectError {
  return e instanceof CmaSubjectError;
}

export interface CmaInput {
  property_address: string;
  borough?: string;
  neighborhood?: string;
  listing_type?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  living_area?: number;
  floor?: number;
  notes?: string;
}

export interface CompResult {
  listing_id: string;
  address: string | null;
  list_price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  /** The exact live StandardStatus token (a legacy stored 'Sold' / 'Rented' / 'Leased' row normalizes to Closed). */
  status: string;
  /** Broker language for that token on the SUBJECT transaction (Closed -> Sold / Rented; Pending -> In Contract on a sale). */
  status_label: string;
  /** The comp transaction; a sale comp never appears in a rental CMA and vice versa. */
  transaction: 'sale' | 'rental';
  close_price?: number | null;
  close_date?: string | null;
  days_on_market: number | null;
  similarity_score: number;
  adjustments: Adjustment[];
  adjusted_price: number;
}

export interface Adjustment {
  field: string;
  subject_value: string | number | null;
  comp_value: string | number | null;
  adjustment_pct: number;
  adjustment_usd: number;
}

const ADJUSTMENT_RATES: Record<string, number> = {
  bedroom: 0.05,      // 5% per bedroom difference
  bathroom: 0.03,     // 3% per bathroom
  living_area: 0.0002, // $0.02/sqft difference → 0.02% per sqft
  floor: 0.01,        // 1% per floor difference
};

/**
 * Find comparable listings for a subject property.
 */
export async function findComps(
  subject: CmaInput,
  maxComps = 10,
  radiusMonths = 6
): Promise<CompResult[]> {
  const asOf = new Date();
  const since = new Date(asOf);
  since.setMonth(since.getMonth() - radiusMonths);
  const listingType = subject.listing_type === 'rental' ? 'rent' : subject.listing_type;
  if (listingType !== 'sale' && listingType !== 'rent') throw new Error('CMA requires sale or rental transaction type');

  const where: Prisma.ListingWhereInput = {};

  // Match neighborhood or borough. A CMA with NEITHER would silently compare the subject against the whole
  // city (every borough, every neighborhood) and value it from unrelated evidence -- refused, never widened
  // (Maya, 2026-09-09: a comp set is a location, and a caller that cannot state one has no comp set).
  if (subject.neighborhood) {
    where.neighborhood = subject.neighborhood;
  } else if (subject.borough) {
    where.borough = subject.borough;
  } else {
    throw new CmaSubjectError('CMA requires the subject neighborhood or borough - a comp search is never widened to the whole city');
  }

  // Match listing type
  where.listing_type = listingType;

  // Match property type
  if (subject.property_type) {
    where.property_type = subject.property_type;
  }

  // Match bedroom range (±1)
  if (subject.bedrooms !== undefined) {
    where.bedrooms_total = {
      gte: Math.max(0, subject.bedrooms - 1),
      lte: subject.bedrooms + 1,
    };
  }

  // Active competition keeps the public display gate. Historical comparables have a terminal
  // idx_display_yn=false by design; retain their consent gates and use the actual CloseDate.
  // terminal_since records archive/reconciliation timing and is never a closing-date substitute.
  //
  // CloseDate is the provider's Edm.Date, retained in raw_data as the ISO day "YYYY-MM-DD" (live contract:
  // populated on 578,417 closed rows). Prisma's JSON path filter offers ordered comparisons (`gte` / `lt`) on
  // the JSON value; the `string_*` family is only contains / starts_with / ends_with. ISO days order lexically,
  // so the day strings bound the window; the day AFTER as-of is the exclusive upper bound so a same-day closing
  // is included. The exact window is re-verified in memory below (compEligibility on the parsed CloseDate).
  const dayAfterAsOf = new Date(asOf);
  dayAfterAsOf.setUTCDate(dayAfterAsOf.getUTCDate() + 1);
  where.OR = [
    { ...SEARCH_DISPLAY_GATE, status: 'Active' },
    {
      status: { in: mallanStorageStatusesForCotality(['Closed']) },
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
      raw_data: { path: ['CloseDate'], gte: since.toISOString().slice(0, 10), lt: dayAfterAsOf.toISOString().slice(0, 10) },
    },
  ];

  const listings = await prisma.listing.findMany({
    where,
    select: {
      listing_id: true,
      address: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      status: true,
      days_on_market: true,
      // The lifecycle inputs for the market clock (lib/compliance/dom-tracker.ts): provider dates in raw_data + presence.
      listing_type: true,
      raw_data: true,
      sync_status: true,
      terminal_since: true,
      internet_address_display_yn: true,
      internet_entire_listing_display_yn: true,
    },
    take: maxComps * 3,
    orderBy: { modification_timestamp: 'desc' },
  });

  // The comp-eligibility authority validates the actual close date again after the query (the lifecycle boundary
  // reads CloseDate / ClosePrice; this engine never touches the raw keys). A closed comp without a verified
  // CloseDate or a positive ClosePrice cannot support a valuation; a row that is not publicly displayable (off the
  // feed, a draft, an unknown state) is not market evidence; an active asking price is context only.
  const transactionType = listingType === 'rent' ? 'rental' : 'sale';
  const candidates = listings.filter(l => {
    if (l.listing_type !== listingType) return false;
    // The stored spelling resolves to its live token first: a legacy 'Sold' / 'Rented' / 'Leased' row IS a
    // Closed comp, and a row whose status resolves to no live token is refused (never defaulted).
    if (normalizeStoredStatus(l.status) === null) return false;
    const lifecycle = lifecycleFromStoredRow(l);
    if (lifecycle.stage !== 'closed' && !lifecycle.publiclyDisplayable) return false;
    if (lifecycle.stage === 'closed' && lifecycle.closePrice === null) return false;
    return isEligibleComp(
      { status: l.status, close_date: lifecycle.closedDate, common_interest: null },
      { asOf, monthsBack: radiusMonths, transactionType },
    );
  });
  const comps: CompResult[] = candidates.map(l => {
    const adjustments: Adjustment[] = [];
    const lifecycle = lifecycleFromStoredRow(l);
    // never the raw stored spelling: the comp record carries the live token the row means
    const token = normalizeStoredStatus(l.status) as string;
    const closePrice = lifecycle.closePrice;
    const basePrice = closePrice ?? Number(l.list_price);
    let adjustedPrice = basePrice;

    // Bedroom adjustment
    if (subject.bedrooms !== undefined && l.bedrooms_total !== null) {
      const diff = subject.bedrooms - l.bedrooms_total;
      if (diff !== 0) {
        const adj = diff * ADJUSTMENT_RATES.bedroom * adjustedPrice;
        adjustments.push({
          field: 'bedrooms',
          subject_value: subject.bedrooms,
          comp_value: l.bedrooms_total,
          adjustment_pct: diff * ADJUSTMENT_RATES.bedroom * 100,
          adjustment_usd: Math.round(adj),
        });
        adjustedPrice += adj;
      }
    }

    // Bathroom adjustment
    if (subject.bathrooms !== undefined && l.bathrooms_full !== null) {
      const diff = subject.bathrooms - l.bathrooms_full;
      if (diff !== 0) {
        const adj = diff * ADJUSTMENT_RATES.bathroom * basePrice;
        adjustments.push({
          field: 'bathrooms',
          subject_value: subject.bathrooms,
          comp_value: l.bathrooms_full,
          adjustment_pct: diff * ADJUSTMENT_RATES.bathroom * 100,
          adjustment_usd: Math.round(adj),
        });
        adjustedPrice += adj;
      }
    }

    // Living area adjustment
    if (subject.living_area && l.living_area) {
      const diff = subject.living_area - Number(l.living_area);
      if (Math.abs(diff) > 50) {
        const adj = diff * ADJUSTMENT_RATES.living_area * basePrice;
        adjustments.push({
          field: 'living_area',
          subject_value: subject.living_area,
          comp_value: Number(l.living_area),
          adjustment_pct: (diff * ADJUSTMENT_RATES.living_area) * 100,
          adjustment_usd: Math.round(adj),
        });
        adjustedPrice += adj;
      }
    }

    // Similarity score
    let similarity = 50;
    if (l.bedrooms_total === subject.bedrooms) similarity += 15;
    if (l.bathrooms_full === subject.bathrooms) similarity += 10;
    if (lifecycle.stage === 'closed') similarity += 10; // a closing (sold / rented) is better evidence than an asking price
    if (subject.living_area && l.living_area) {
      const areaDiff = Math.abs(subject.living_area - Number(l.living_area)) / subject.living_area;
      if (areaDiff < 0.1) similarity += 15;
      else if (areaDiff < 0.2) similarity += 10;
    }

    const addr = l.address as Record<string, string> | null;
    const displayAddr = canDisplayListingAddress(l) && addr
      ? `${addr.StreetNumber || ''} ${addr.StreetName || ''}`.trim() || null
      : null;

    return {
      listing_id: l.listing_id,
      address: displayAddr,
      list_price: Number(l.list_price),
      bedrooms: l.bedrooms_total,
      bathrooms: l.bathrooms_full,
      living_area: l.living_area ? Number(l.living_area) : null,
      // the EXACT live token (a legacy 'Sold' / 'Rented' / 'Leased' row is stored back as Closed) ...
      status: token,
      // ... and the broker word for it on THIS transaction, applied at render time only
      status_label: compStatusLabel(token, transactionType),
      transaction: transactionType,
      close_price: closePrice,
      close_date: lifecycle.closedDate,
      // ONE DOM rule: the market clock from the provider's contract-event dates; the stored accrual only when the row
      // carries none (a closed row's stored clock is reset to 0 on close — never a comp's market days).
      days_on_market: marketDom(lifecycle, asOf).days,
      similarity_score: Math.min(100, similarity),
      adjustments,
      adjusted_price: Math.round(adjustedPrice),
    };
  });

  return comps
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, maxComps);
}

/**
 * Estimate value from comps (weighted average of adjusted prices).
 */
export function estimateValue(comps: CompResult[]): {
  estimated: number;
  low: number;
  high: number;
} {
  // Only verified closings value a property: close_price is set by findComps solely on a closed comp with a positive
  // provider ClosePrice inside the CloseDate window. Active asking prices carry no close_price and never enter here.
  const valuationComps = comps.filter(c => (c.close_price ?? 0) > 0);
  if (valuationComps.length === 0) return { estimated: 0, low: 0, high: 0 };

  const totalWeight = valuationComps.reduce((s, c) => s + c.similarity_score, 0);
  if (totalWeight <= 0) return { estimated: 0, low: 0, high: 0 };
  const weightedAvg = valuationComps.reduce(
    (s, c) => s + c.adjusted_price * c.similarity_score,
    0
  ) / totalWeight;

  const margin = 0.05; // ±5%

  return {
    estimated: Math.round(weightedAvg),
    low: Math.round(weightedAvg * (1 - margin)),
    high: Math.round(weightedAvg * (1 + margin)),
  };
}
