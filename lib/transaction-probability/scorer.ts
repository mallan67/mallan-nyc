/**
 * Transaction Probability Model
 *
 * Predicts likelihood a listing will go under contract within 30/60/90 days.
 * Combines 5 signal layers:
 *   1. DOM aging curve (longer on market = lower probability)
 *   2. Price competitiveness (price/sqft vs neighborhood median)
 *   3. Behavioral momentum (views, saves, inquiries, showings)
 *   4. Neighborhood demand (demand index score + trend)
 *   5. Market saturation (inventory vs closed sales)
 *
 * Output: probability percentages for 30/60/90-day windows + confidence level.
 */
import prisma from "@/lib/prisma";

// ── Types ──
export interface TransactionProbability {
  listing_id: string;
  address: string;
  list_price: number;
  property_type: string;
  neighborhood: string;
  borough: string;
  days_on_market: number;
  prob_30: number; // 0-100%
  prob_60: number;
  prob_90: number;
  confidence: "high" | "medium" | "low";
  factors: ProbabilityFactor[];
  computed_at: string;
}

export interface ProbabilityFactor {
  name: string;
  impact: "positive" | "neutral" | "negative";
  score: number; // 0-100 contribution
  detail: string;
}

// ── Helpers ──
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * DOM decay curve — probability drops as listing ages.
 * Based on NYC market patterns:
 *   0-14 days: peak (fresh listing premium)
 *   15-30 days: slight decline
 *   31-60 days: moderate decline
 *   61-90 days: significant decline
 *   90+ days: stale
 */
function domFactor(dom: number): { score: number; detail: string } {
  let score: number;
  if (dom <= 7) { score = 95; }
  else if (dom <= 14) { score = 85; }
  else if (dom <= 30) { score = 70; }
  else if (dom <= 45) { score = 55; }
  else if (dom <= 60) { score = 40; }
  else if (dom <= 90) { score = 25; }
  else if (dom <= 120) { score = 15; }
  else { score = 8; }

  const label = dom <= 14 ? "Fresh listing" : dom <= 30 ? "Active" : dom <= 60 ? "Aging" : dom <= 90 ? "Extended" : "Stale";
  return { score, detail: `${dom} days on market — ${label}` };
}

/**
 * Price competitiveness — compare listing price/sqft to neighborhood median.
 * Underpriced = higher probability; overpriced = lower.
 */
function priceFactor(
  listPrice: number,
  livingArea: number | null,
  marketPpSqft: number | null,
  marketMedian: number | null
): { score: number; detail: string } {
  // If no sqft data, compare to median price
  if (!livingArea || livingArea <= 0 || !marketPpSqft || marketPpSqft <= 0) {
    if (!marketMedian || marketMedian <= 0) {
      return { score: 50, detail: "Insufficient market data for price comparison" };
    }
    const ratio = listPrice / marketMedian;
    if (ratio <= 0.85) return { score: 90, detail: `${Math.round((1 - ratio) * 100)}% below median price` };
    if (ratio <= 0.95) return { score: 75, detail: `${Math.round((1 - ratio) * 100)}% below median price` };
    if (ratio <= 1.05) return { score: 60, detail: "At market price" };
    if (ratio <= 1.15) return { score: 40, detail: `${Math.round((ratio - 1) * 100)}% above median price` };
    if (ratio <= 1.30) return { score: 25, detail: `${Math.round((ratio - 1) * 100)}% above median price` };
    return { score: 10, detail: `${Math.round((ratio - 1) * 100)}% above median price — significantly overpriced` };
  }

  const ppSqft = listPrice / livingArea;
  const ratio = ppSqft / marketPpSqft;

  if (ratio <= 0.85) return { score: 90, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — underpriced` };
  if (ratio <= 0.95) return { score: 75, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — competitive` };
  if (ratio <= 1.05) return { score: 60, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — at market` };
  if (ratio <= 1.15) return { score: 40, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — above market` };
  if (ratio <= 1.30) return { score: 25, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — overpriced` };
  return { score: 10, detail: `$${Math.round(ppSqft)}/sqft vs $${Math.round(marketPpSqft)}/sqft market — significantly overpriced` };
}

/**
 * Behavioral momentum — from ListingMomentum (7-day rolling).
 */
function momentumFactor(momentum: {
  score: number;
  percentile_rank: number;
} | null): { score: number; detail: string } {
  if (!momentum) return { score: 30, detail: "No behavioral data available" };

  const { score, percentile_rank } = momentum;
  const pct = Math.round(percentile_rank);

  if (score >= 80) return { score: 95, detail: `Hot — top ${100 - pct}% of listings (momentum ${score})` };
  if (score >= 60) return { score: 75, detail: `Warm — top ${100 - pct}% (momentum ${score})` };
  if (score >= 40) return { score: 50, detail: `Cooling — percentile ${pct}% (momentum ${score})` };
  if (score >= 20) return { score: 25, detail: `Cold — percentile ${pct}% (momentum ${score})` };
  return { score: 10, detail: `Stale — bottom ${pct}% (momentum ${score})` };
}

/**
 * Neighborhood demand — from DemandIndex.
 */
function demandFactor(demand: {
  score: number;
  trend: string;
} | null): { score: number; detail: string } {
  if (!demand) return { score: 50, detail: "No demand data for this neighborhood" };

  let base: number;
  if (demand.score >= 80) base = 90;
  else if (demand.score >= 60) base = 70;
  else if (demand.score >= 40) base = 50;
  else if (demand.score >= 20) base = 30;
  else base = 15;

  // Trend adjustment
  if (demand.trend === "up") base = clamp(base + 10, 0, 100);
  else if (demand.trend === "down") base = clamp(base - 10, 0, 100);

  const trendLabel = demand.trend === "up" ? "trending up" : demand.trend === "down" ? "trending down" : "stable";
  return { score: base, detail: `Demand index ${demand.score}/100, ${trendLabel}` };
}

/**
 * Market saturation — inventory pressure.
 * Low inventory + high demand = seller's market = higher probability.
 */
function saturationFactor(snapshot: {
  inventory: number;
  avg_dom: number;
  new_listings: number;
} | null): { score: number; detail: string } {
  if (!snapshot || snapshot.inventory <= 0) {
    return { score: 50, detail: "No market snapshot data available" };
  }

  // Absorption rate proxy: if avg_dom is low and inventory is tight, market is hot
  const { inventory, avg_dom, new_listings } = snapshot;

  let score: number;
  if (avg_dom <= 30 && inventory < 50) score = 85;
  else if (avg_dom <= 45 && inventory < 100) score = 70;
  else if (avg_dom <= 60) score = 55;
  else if (avg_dom <= 90) score = 40;
  else score = 25;

  // High new supply dilutes probability
  if (new_listings > inventory * 0.3) score = clamp(score - 10, 0, 100);

  return {
    score,
    detail: `${inventory} active listings, ${avg_dom} avg DOM, ${new_listings} new this period`,
  };
}

// ── Main scorer ──
export async function computeTransactionProbability(
  listingId: string
): Promise<TransactionProbability | null> {
  // Fetch listing
  const listing = await prisma.listing.findFirst({
    where: {
      OR: [
        { listing_id: listingId },
        { id: isNaN(Number(listingId)) ? undefined : BigInt(listingId) },
      ].filter((c) => Object.values(c).some((v) => v !== undefined)),
    },
  });

  if (!listing) return null;

  const neighborhood = listing.neighborhood || "Unknown";
  const borough = listing.borough || "Manhattan";
  const listPrice = Number(listing.list_price) || 0;
  const livingArea = Number(listing.living_area) || null;
  const dom = listing.days_on_market || 0;
  const listingType = listing.listing_type || "sale";

  // Fetch supporting data in parallel
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [momentumRow, demandRow, snapshotRow] = await Promise.all([
    prisma.listingMomentum
      .findFirst({
        where: { listing_id: listing.listing_id },
        orderBy: { last_computed: "desc" },
      })
      .catch(() => null),
    prisma.demandIndex
      .findFirst({
        where: { neighborhood },
        orderBy: { last_computed: "desc" },
      })
      .catch(() => null),
    prisma.marketSnapshot
      .findFirst({
        where: { neighborhood, listing_type: listingType },
        orderBy: { period: "desc" },
      })
      .catch(() => null),
  ]);

  // Compute factors
  const f1 = domFactor(dom);
  const f2 = priceFactor(
    listPrice,
    livingArea,
    snapshotRow ? Number(snapshotRow.price_per_sqft) : null,
    snapshotRow ? Number(snapshotRow.median_price) : null
  );
  const f3 = momentumFactor(
    momentumRow
      ? { score: momentumRow.score, percentile_rank: Number(momentumRow.percentile_rank) }
      : null
  );
  const f4 = demandFactor(
    demandRow ? { score: demandRow.score, trend: demandRow.trend } : null
  );
  const f5 = saturationFactor(
    snapshotRow
      ? {
          inventory: snapshotRow.inventory,
          avg_dom: snapshotRow.avg_dom ?? 60,
          new_listings: snapshotRow.new_listings,
        }
      : null
  );

  // Weighted composite (weights sum to 1.0)
  const weights = { dom: 0.25, price: 0.25, momentum: 0.20, demand: 0.15, saturation: 0.15 };
  const composite =
    f1.score * weights.dom +
    f2.score * weights.price +
    f3.score * weights.momentum +
    f4.score * weights.demand +
    f5.score * weights.saturation;

  // Convert composite (0-100) to probability curves
  // 30-day: direct mapping with slight compression
  // 60-day: higher (more time = more chance)
  // 90-day: highest
  const prob_30 = Math.round(clamp(composite * 0.85, 1, 95));
  const prob_60 = Math.round(clamp(composite * 1.05, prob_30, 97));
  const prob_90 = Math.round(clamp(composite * 1.20, prob_60, 99));

  // Confidence based on data availability
  const dataPoints = [momentumRow, demandRow, snapshotRow].filter(Boolean).length;
  const confidence: "high" | "medium" | "low" =
    dataPoints >= 3 ? "high" : dataPoints >= 1 ? "medium" : "low";

  // Build factors array
  const factors: ProbabilityFactor[] = [
    {
      name: "Days on Market",
      impact: f1.score >= 60 ? "positive" : f1.score >= 35 ? "neutral" : "negative",
      score: f1.score,
      detail: f1.detail,
    },
    {
      name: "Price Competitiveness",
      impact: f2.score >= 60 ? "positive" : f2.score >= 35 ? "neutral" : "negative",
      score: f2.score,
      detail: f2.detail,
    },
    {
      name: "Buyer Momentum",
      impact: f3.score >= 60 ? "positive" : f3.score >= 35 ? "neutral" : "negative",
      score: f3.score,
      detail: f3.detail,
    },
    {
      name: "Neighborhood Demand",
      impact: f4.score >= 60 ? "positive" : f4.score >= 35 ? "neutral" : "negative",
      score: f4.score,
      detail: f4.detail,
    },
    {
      name: "Market Saturation",
      impact: f5.score >= 60 ? "positive" : f5.score >= 35 ? "neutral" : "negative",
      score: f5.score,
      detail: f5.detail,
    },
  ];

  const addrObj = (listing.address || {}) as Record<string, string>;
  const address = [addrObj.streetNumber, addrObj.streetName, addrObj.unitNumber]
    .filter(Boolean)
    .join(" ");

  return {
    listing_id: listing.listing_id,
    address: address || listing.listing_id,
    list_price: listPrice,
    property_type: listing.property_type || "Unknown",
    neighborhood,
    borough,
    days_on_market: dom,
    prob_30,
    prob_60,
    prob_90,
    confidence,
    factors,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Batch compute for multiple listings (e.g., agent's portfolio).
 */
export async function computeBatchProbability(
  listingIds: string[]
): Promise<TransactionProbability[]> {
  const results = await Promise.all(
    listingIds.map((id) => computeTransactionProbability(id).catch(() => null))
  );
  return results.filter(Boolean) as TransactionProbability[];
}
