/**
 * CMA Engine — Comparable Market Analysis
 * Finds comparable listings, applies adjustments, estimates value.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { canDisplayListingAddress, publicListingVisibilityWhere } from '@/lib/search/listing-access-decision';

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
  /**
   * Cotality market status, or NULL when the listing has none yet.
   * A Mallan-authored listing that has not been published has no market
   * status at all; null is that fact, and it fails closed in every
   * displayable allow-list.
   */
  status: string | null;
  days_on_market: number;
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
  const since = new Date();
  since.setMonth(since.getMonth() - radiusMonths);

  const where: Record<string, unknown> = {
    // Gates AND return-copy suppression. A CMA is a document a broker hands a
    // seller. Spreading SEARCH_DISPLAY_GATE alone listed every Mallan property
    // that had round-tripped through RLS twice, so the same sale argued its own
    // comparable and pulled the analysis toward itself.
    ...publicListingVisibilityWhere(),
  };

  // Match neighborhood or borough
  if (subject.neighborhood) {
    where.neighborhood = subject.neighborhood;
  } else if (subject.borough) {
    where.borough = subject.borough;
  }

  // Match listing type
  if (subject.listing_type) {
    where.listing_type = subject.listing_type;
  }

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

  // Active, or closed within the window.
  //
  // `Closed` is the COTALITY word. A Mallan-local listing never reaches it — the
  // CRM status route writes `Sold` for a sale and `Rented` for a rental
  // (Pending → Sold | Rented), and `Leased` survives in read-side sets. Matching
  // only `Closed` meant a CMA silently omitted the brokerage's OWN closed sales:
  // the comps most relevant to the seller, and the ones the broker actually has
  // first-hand knowledge of, were the ones missing from the document.
  const CLOSED_STATUSES = ['Closed', 'Sold', 'Rented', 'Leased'];
  where.OR = [
    { status: 'Active' },
    { status: { in: CLOSED_STATUSES }, contract_closed: { gte: since } },
  ];

  const listings = await prisma.listing.findMany({
    where: where as Prisma.ListingWhereInput,
    select: {
      listing_id: true,
      address: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      status: true,
      days_on_market: true,
      internet_address_display_yn: true,
      internet_entire_listing_display_yn: true,
    },
    take: maxComps * 3,
    orderBy: { modification_timestamp: 'desc' },
  });

  // Score and adjust each comp
  const comps: CompResult[] = listings.map(l => {
    const adjustments: Adjustment[] = [];
    let adjustedPrice = Number(l.list_price);

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
        const adj = diff * ADJUSTMENT_RATES.bathroom * Number(l.list_price);
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
        const adj = diff * ADJUSTMENT_RATES.living_area * Number(l.list_price);
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
    if (l.status === 'Closed') similarity += 10; // Closed sales are better comps
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
      status: l.status,
      days_on_market: l.days_on_market,
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
  if (comps.length === 0) return { estimated: 0, low: 0, high: 0 };

  const totalWeight = comps.reduce((s, c) => s + c.similarity_score, 0);
  const weightedAvg = comps.reduce(
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
