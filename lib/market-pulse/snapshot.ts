/**
 * Market Pulse — snapshot computation from listing DB
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { publicListingVisibilityWhere } from '@/lib/search/listing-access-decision';

/**
 * Compute market snapshot for a neighborhood + period.
 */
export async function computeSnapshot(
  neighborhood: string,
  period: string,      // "YYYY-MM"
  listingType: string  // "sale" | "rent"
) {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const where: Prisma.ListingWhereInput = {
    neighborhood,
    listing_type: listingType,
    // Gates AND return-copy suppression. Without the suppression every Mallan
    // listing that had round-tripped through RLS was counted twice, inflating
    // neighborhood inventory and skewing every median computed from it.
    ...publicListingVisibilityWhere(),
  };

  // Active inventory at end of period
  const inventory = await prisma.listing.count({
    where: { ...where, status: 'Active' },
  });

  // Listings that became active this period
  const newListings = await prisma.listing.count({
    where: { ...where, first_active_date: { gte: start, lt: end } },
  });

  // Price aggregation for active listings
  const priceAgg = await prisma.listing.aggregate({
    where: { ...where, status: 'Active' },
    _avg: { list_price: true, living_area: true, days_on_market: true },
  });

  // Median price (approximate via sorted mid-point)
  const activePrices = await prisma.listing.findMany({
    where: { ...where, status: 'Active' },
    select: { list_price: true, living_area: true },
    orderBy: { list_price: 'asc' },
  });

  const medianPrice = activePrices.length > 0
    ? Number(activePrices[Math.floor(activePrices.length / 2)].list_price)
    : null;

  const avgPrice = priceAgg._avg.list_price ? Number(priceAgg._avg.list_price) : null;
  const avgDom = priceAgg._avg.days_on_market ? Math.round(Number(priceAgg._avg.days_on_market)) : null;

  // Price per sqft
  const withArea = activePrices.filter(l => l.living_area && Number(l.living_area) > 0);
  const pricePerSqft = withArea.length > 0
    ? Math.round(withArea.reduce((s, l) => s + Number(l.list_price) / Number(l.living_area!), 0) / withArea.length)
    : null;

  // Borough from any listing
  const sample = await prisma.listing.findFirst({
    where: { neighborhood },
    select: { borough: true },
  });

  // Upsert snapshot.
  //
  // Phase 3 item-6 inventory decision — NO write-suppression here, by design:
  // this runs MONTHLY (vercel.json: 1st of month, 06:00), keyed on the unique
  // (neighborhood, period, listing_type). Each run either inserts the new
  // period's row or refreshes the current period with aggregates derived from
  // the live listings table (inventory/prices/DOM genuinely move month to
  // month). Worst-case churn is ~2 rows per neighborhood per MONTH —
  // negligible next to the daily writers this phase fixed.
  const snapshot = await prisma.marketSnapshot.upsert({
    where: {
      neighborhood_period_listing_type: {
        neighborhood,
        period,
        listing_type: listingType,
      },
    },
    create: {
      neighborhood,
      borough: sample?.borough ?? null,
      period,
      listing_type: listingType,
      median_price: medianPrice,
      avg_price: avgPrice,
      avg_dom: avgDom,
      inventory,
      price_per_sqft: pricePerSqft,
      new_listings: newListings,
      closed_sales: 0,
      metrics: {} as Prisma.InputJsonValue,
    },
    update: {
      median_price: medianPrice,
      avg_price: avgPrice,
      avg_dom: avgDom,
      inventory,
      price_per_sqft: pricePerSqft,
      new_listings: newListings,
    },
  });

  return snapshot;
}

/**
 * Batch compute snapshots for all neighborhoods.
 */
export async function batchComputeSnapshots(period?: string): Promise<number> {
  const now = new Date();
  const p = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const neighborhoods = await prisma.listing.findMany({
    select: { neighborhood: true },
    distinct: ['neighborhood'],
    where: { neighborhood: { not: null } },
  });

  let computed = 0;
  for (const { neighborhood } of neighborhoods) {
    if (!neighborhood) continue;
    try {
      await computeSnapshot(neighborhood, p, 'sale');
      await computeSnapshot(neighborhood, p, 'rent');
      computed++;
    } catch (err) {
      console.warn(`[market-pulse] Failed snapshot for ${neighborhood}:`, err);
    }
  }

  return computed;
}
