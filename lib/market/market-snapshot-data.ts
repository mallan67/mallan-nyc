/**
 * What the listing page's market card (app/components/MarketSnapshot.tsx) asks /api/market for, and what it keeps of the answer.
 *
 * Found 2026-10-09 (an independent read of every surface that shows RLS statistics): the card asked for type=rental, a word the route has never known (it knows 'sale' and 'rent'), so a rental
 * listing's page showed the SALE statistics under a "Median Rent" label; and the card printed its own disclaimer, "for the period currently available", while the API sends the statistics with the
 * statistical-data disclaimer for the period they really cover (UCBA 2026 Art. VIII Sec. 4; lib/compliance/rls-statistical-disclaimer.ts). The card now keeps the API's disclaimer and shows
 * statistics only together with it.
 */

export interface SnapshotData {
  neighborhood: string;
  borough: string;
  medianPrice: number | null;
  avgPricePerSqft: number | null;
  totalActive: number;
  avgDaysOnMarket: number | null;
  /** the statistical-data disclaimer the API sent with the statistics, for the period they cover */
  disclaimer: string;
}

export type ListingKind = "sale" | "rent";

/** The `type` /api/market answers for. */
export function marketRequestType(listingType: ListingKind): "sale" | "rent" {
  return listingType === "rent" ? "rent" : "sale";
}

interface MarketAnswer {
  success?: boolean;
  neighborhoodBreakdown?: Array<{ name: string; avgPrice?: number; count?: number }>;
  active?: { medianPrice?: number; avgPricePerSqft?: number; totalCount?: number; medianDaysOnMarket?: number };
  _compliance?: { disclaimer?: unknown };
}

/** The card's data from the API's answer, or null when there is nothing to show: an unsuccessful answer, no price, or statistics that came without their disclaimer. */
export function snapshotFromMarket(answer: unknown, neighborhood: string, borough: string): SnapshotData | null {
  const d = answer as MarketAnswer | null | undefined;
  if (!d?.success) return null;
  const match = d.neighborhoodBreakdown?.find((n) => n.name.toLowerCase() === neighborhood.toLowerCase());
  const disclaimer = typeof d._compliance?.disclaimer === "string" ? d._compliance.disclaimer.trim() : "";
  const data: SnapshotData = {
    neighborhood: match ? match.name : borough,
    borough,
    medianPrice: match?.avgPrice || d.active?.medianPrice || null,
    avgPricePerSqft: d.active?.avgPricePerSqft || null,
    totalActive: match?.count || d.active?.totalCount || 0,
    avgDaysOnMarket: d.active?.medianDaysOnMarket || null,
    disclaimer,
  };
  return data.medianPrice && data.disclaimer ? data : null;
}
