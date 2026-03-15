/**
 * Real-Time Market Liquidity Index
 *
 * Measures how easy it is to buy or sell in a micro-market.
 * Combines: inventory levels, avg DOM, demand index, absorption rate,
 * and new supply trends.
 *
 * Output: 0.0–1.0 index (1.0 = highly liquid, sellers market)
 * + interpretation label + component breakdown.
 */
import prisma from "@/lib/prisma";

export interface LiquidityReport {
  neighborhood: string;
  borough: string;
  listing_type: string;
  index: number; // 0.00 - 1.00
  label: string;
  interpretation: string;
  components: LiquidityComponent[];
  computed_at: string;
}

export interface LiquidityComponent {
  name: string;
  value: number;
  normalized: number; // 0-1
  detail: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function liquidityLabel(index: number): { label: string; interpretation: string } {
  if (index >= 0.80) return { label: "Very High", interpretation: "Strong seller's market — fast absorption, limited inventory, high buyer activity" };
  if (index >= 0.60) return { label: "High", interpretation: "Favorable for sellers — moderate competition, reasonable absorption pace" };
  if (index >= 0.40) return { label: "Moderate", interpretation: "Balanced market — neither buyers nor sellers have a clear advantage" };
  if (index >= 0.20) return { label: "Low", interpretation: "Buyer's market — high inventory, slower absorption, buyers have negotiating power" };
  return { label: "Very Low", interpretation: "Stagnant market — excess inventory, very slow movement, significant price pressure" };
}

export async function computeLiquidity(
  neighborhood: string,
  listingType: string = "sale"
): Promise<LiquidityReport | null> {
  // Fetch latest market snapshot and demand index
  const [snapshot, demand] = await Promise.all([
    prisma.marketSnapshot
      .findFirst({
        where: { neighborhood, listing_type: listingType },
        orderBy: { period: "desc" },
      })
      .catch(() => null),
    prisma.demandIndex
      .findFirst({
        where: { neighborhood },
        orderBy: { last_computed: "desc" },
      })
      .catch(() => null),
  ]);

  // Count active listings for this neighborhood
  const activeCount = await prisma.listing
    .count({
      where: {
        neighborhood,
        listing_type: listingType,
        status: { in: ["Active", "active", "ACTIVE"] },
      },
    })
    .catch(() => 0);

  const inventory = snapshot?.inventory || activeCount;
  const avgDom = snapshot?.avg_dom || 60;
  const newListings = snapshot?.new_listings || 0;
  const demandScore = demand?.score || 50;
  const demandTrend = demand?.trend || "stable";
  const borough = demand?.borough || "Manhattan";

  // ── Component 1: Absorption Speed (weight 30%) ──
  // Lower DOM = faster absorption = higher liquidity
  let absorptionNorm: number;
  if (avgDom <= 20) absorptionNorm = 1.0;
  else if (avgDom <= 30) absorptionNorm = 0.85;
  else if (avgDom <= 45) absorptionNorm = 0.65;
  else if (avgDom <= 60) absorptionNorm = 0.45;
  else if (avgDom <= 90) absorptionNorm = 0.25;
  else absorptionNorm = 0.10;

  // ── Component 2: Inventory Pressure (weight 25%) ──
  // Lower inventory = scarcer supply = higher liquidity for sellers
  let inventoryNorm: number;
  if (inventory <= 10) inventoryNorm = 0.95;
  else if (inventory <= 25) inventoryNorm = 0.80;
  else if (inventory <= 50) inventoryNorm = 0.60;
  else if (inventory <= 100) inventoryNorm = 0.40;
  else if (inventory <= 200) inventoryNorm = 0.20;
  else inventoryNorm = 0.10;

  // ── Component 3: Buyer Demand (weight 25%) ──
  let demandNorm = clamp(demandScore / 100, 0, 1);
  // Trend adjustment
  if (demandTrend === "up") demandNorm = clamp(demandNorm + 0.08, 0, 1);
  else if (demandTrend === "down") demandNorm = clamp(demandNorm - 0.08, 0, 1);

  // ── Component 4: Supply Trend (weight 20%) ──
  // Declining new supply = tightening = higher liquidity
  let supplyNorm: number;
  if (inventory <= 0) {
    supplyNorm = 0.5;
  } else {
    const supplyRatio = newListings / Math.max(inventory, 1);
    if (supplyRatio <= 0.05) supplyNorm = 0.85; // barely any new supply
    else if (supplyRatio <= 0.15) supplyNorm = 0.65;
    else if (supplyRatio <= 0.25) supplyNorm = 0.45;
    else if (supplyRatio <= 0.40) supplyNorm = 0.30;
    else supplyNorm = 0.15; // flooded with new listings
  }

  const components: LiquidityComponent[] = [
    { name: "Absorption Speed", value: avgDom, normalized: absorptionNorm, detail: `${avgDom} avg days on market` },
    { name: "Inventory Level", value: inventory, normalized: inventoryNorm, detail: `${inventory} active listings` },
    { name: "Buyer Demand", value: demandScore, normalized: demandNorm, detail: `Demand index ${demandScore}/100 (${demandTrend})` },
    { name: "Supply Trend", value: newListings, normalized: supplyNorm, detail: `${newListings} new listings this period` },
  ];

  const weights = [0.30, 0.25, 0.25, 0.20];
  const index = Math.round(
    components.reduce((sum, c, i) => sum + c.normalized * weights[i], 0) * 100
  ) / 100;

  const { label, interpretation } = liquidityLabel(index);

  return {
    neighborhood,
    borough,
    listing_type: listingType,
    index,
    label,
    interpretation,
    components,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Compute liquidity for all neighborhoods with data.
 */
export async function computeAllLiquidity(
  listingType: string = "sale"
): Promise<LiquidityReport[]> {
  const snapshots = await prisma.marketSnapshot.findMany({
    where: { listing_type: listingType },
    orderBy: { period: "desc" },
    distinct: ["neighborhood"],
    select: { neighborhood: true },
  });

  const neighborhoods = snapshots.map((s) => s.neighborhood);
  const results = await Promise.all(
    neighborhoods.map((n) => computeLiquidity(n, listingType).catch(() => null))
  );

  return (results.filter(Boolean) as LiquidityReport[]).sort(
    (a, b) => b.index - a.index
  );
}
