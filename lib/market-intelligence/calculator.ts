/**
 * Market Intelligence — Calculator
 *
 * Pure functions that compute derived metrics from raw Trestle data.
 * No DB calls, no fetch — only transforms on MarketDataSet.
 *
 * COMPLIANCE:
 * - DOM uses CumulativeDaysOnMarket per UCBA 2026
 * - Scores describe market activity, NOT demographics (Fair Housing safe)
 * - No compensation amounts in any computation
 */

import type {
  MarketDataSet,
  NeighborhoodStats,
  TrestleListing,
} from "./fetcher";

// ─── Types ────────────────────────────────────────────────

export interface LiquidityScore {
  neighborhood: string;
  borough: string;
  index: number; // 0.00–1.00
  label: string; // Very High / High / Moderate / Low / Very Low
  interpretation: string;
  components: {
    absorptionSpeed: { value: number; normalized: number };
    inventoryLevel: { value: number; normalized: number };
    supplyTrend: { value: number; normalized: number };
    priceCompetition: { value: number; normalized: number };
  };
}

export interface SentimentScore {
  neighborhood: string;
  borough: string;
  score: number; // 0–100
  label: string; // Hot / Warm / Neutral / Cool / Cold
  signals: string[];
}

export interface MarketAlert {
  type:
    | "inventory_surge"
    | "inventory_drop"
    | "price_drop_cluster"
    | "new_listing_flood"
    | "dom_spike"
    | "high_absorption";
  severity: "critical" | "warning" | "info";
  neighborhood: string;
  message: string;
  value: number;
}

export interface SummaryStats {
  totalActive: number;
  totalClosed: number;
  medianPrice: number;
  avgPrice: number;
  avgPricePerSqft: number;
  avgDom: number;
  neighborhoodsTracked: number;
  newListings30d: number;
  priceDropCount: number;
  contractSignedCount: number;
  absorptionRate: number; // contracts / (active + contracts) as %
  monthsOfSupply: number; // active / (closed per month)
  salesVelocity: number; // closed per 30 days
  pctBelowAsk: number;
  pctAboveAsk: number;
}

export interface RentVsBuyAnalysis {
  neighborhood: string;
  monthlyRent: number;
  monthlyBuyTotal: number; // mortgage + taxes + maintenance
  monthlyMortgage: number;
  monthlyTaxes: number;
  monthlyMaintenance: number;
  medianBuyPrice: number;
  medianRentPrice: number;
  breakEvenYears: number;
  buyAdvantage: boolean;
  summary: string;
}

// ─── Summary Stats ────────────────────────────────────────

export function computeSummaryStats(data: MarketDataSet): SummaryStats {
  const {
    new_listings,
    price_drops,
    contract_signed,
    closed,
  } = data.segments;

  const allActive = data.neighborhoodStats.reduce(
    (s, n) => s + n.activeCount,
    0
  );
  const allPrices = data.neighborhoodStats
    .filter((n) => n.medianPrice > 0)
    .map((n) => n.medianPrice)
    .sort((a, b) => a - b);

  const medianPrice =
    allPrices.length > 0
      ? allPrices[Math.floor(allPrices.length / 2)]
      : 0;

  const avgPrice =
    data.neighborhoodStats.length > 0
      ? Math.round(
          data.neighborhoodStats.reduce((s, n) => s + n.avgPrice, 0) /
            data.neighborhoodStats.length
        )
      : 0;

  const avgPpSqft =
    data.neighborhoodStats.filter((n) => n.avgPricePerSqft > 0).length > 0
      ? Math.round(
          data.neighborhoodStats
            .filter((n) => n.avgPricePerSqft > 0)
            .reduce((s, n) => s + n.avgPricePerSqft, 0) /
            data.neighborhoodStats.filter((n) => n.avgPricePerSqft > 0).length
        )
      : 0;

  const avgDom =
    data.neighborhoodStats.length > 0
      ? Math.round(
          data.neighborhoodStats.reduce((s, n) => s + n.avgDom, 0) /
            data.neighborhoodStats.length
        )
      : 0;

  const newListings30d = data.neighborhoodStats.reduce(
    (s, n) => s + n.newListings30d,
    0
  );

  // % below / above ask (from closed listings)
  let belowAsk = 0;
  let aboveAsk = 0;
  const closedWithOriginal = closed.filter(
    (l) => l.ClosePrice && l.OriginalListPrice && l.OriginalListPrice > 0
  );
  for (const l of closedWithOriginal) {
    if (l.ClosePrice! < l.OriginalListPrice!) belowAsk++;
    if (l.ClosePrice! > l.OriginalListPrice!) aboveAsk++;
  }
  const pctBelowAsk =
    closedWithOriginal.length > 0
      ? Math.round((belowAsk / closedWithOriginal.length) * 10000) / 100
      : 0;
  const pctAboveAsk =
    closedWithOriginal.length > 0
      ? Math.round((aboveAsk / closedWithOriginal.length) * 10000) / 100
      : 0;

  // Absorption rate: contracts / (active + contracts)
  const contractCount = contract_signed.length;
  const absorptionRate =
    allActive + contractCount > 0
      ? Math.round(
          (contractCount / (allActive + contractCount)) * 10000
        ) / 100
      : 0;

  // Months of supply: active / closings per month
  // Estimate monthly closings from closed listings in dataset
  const closingsPerMonth = closed.length > 0 ? closed.length : 1;
  const monthsOfSupply =
    Math.round((allActive / closingsPerMonth) * 100) / 100;

  // Sales velocity: closings per 30 days
  const salesVelocity = closed.length;

  return {
    totalActive: allActive,
    totalClosed: closed.length,
    medianPrice,
    avgPrice,
    avgPricePerSqft: avgPpSqft,
    avgDom,
    neighborhoodsTracked: data.neighborhoodStats.length,
    newListings30d: newListings30d,
    priceDropCount: price_drops.length,
    contractSignedCount: contractCount,
    absorptionRate,
    monthsOfSupply,
    salesVelocity,
    pctBelowAsk,
    pctAboveAsk,
  };
}

// ─── Liquidity Index ──────────────────────────────────────

function liquidityLabel(index: number): {
  label: string;
  interpretation: string;
} {
  if (index >= 0.8)
    return {
      label: "Very High",
      interpretation:
        "Strong seller's market — fast absorption, limited inventory",
    };
  if (index >= 0.6)
    return {
      label: "High",
      interpretation:
        "Favorable for sellers — moderate competition, reasonable pace",
    };
  if (index >= 0.4)
    return {
      label: "Moderate",
      interpretation: "Balanced market — neither side has a clear advantage",
    };
  if (index >= 0.2)
    return {
      label: "Low",
      interpretation:
        "Buyer's market — higher inventory, buyers have negotiating power",
    };
  return {
    label: "Very Low",
    interpretation:
      "Stagnant market — excess inventory, significant price pressure",
  };
}

export function computeLiquidityScores(
  data: MarketDataSet
): LiquidityScore[] {
  return data.neighborhoodStats.map((nh) => {
    // Absorption Speed (weight 30%) — lower DOM = faster = higher liquidity
    const dom = nh.avgDom;
    let absorptionNorm: number;
    if (dom <= 20) absorptionNorm = 1.0;
    else if (dom <= 30) absorptionNorm = 0.85;
    else if (dom <= 45) absorptionNorm = 0.65;
    else if (dom <= 60) absorptionNorm = 0.45;
    else if (dom <= 90) absorptionNorm = 0.25;
    else absorptionNorm = 0.1;

    // Inventory Level (weight 25%) — lower = scarcer = higher liquidity
    const inv = nh.activeCount;
    let inventoryNorm: number;
    if (inv <= 10) inventoryNorm = 0.95;
    else if (inv <= 25) inventoryNorm = 0.8;
    else if (inv <= 50) inventoryNorm = 0.6;
    else if (inv <= 100) inventoryNorm = 0.4;
    else if (inv <= 200) inventoryNorm = 0.2;
    else inventoryNorm = 0.1;

    // Supply Trend (weight 25%) — low new supply ratio = tightening
    const supplyRatio =
      inv > 0 ? nh.newListings30d / inv : 0.5;
    let supplyNorm: number;
    if (supplyRatio <= 0.05) supplyNorm = 0.85;
    else if (supplyRatio <= 0.15) supplyNorm = 0.65;
    else if (supplyRatio <= 0.25) supplyNorm = 0.45;
    else if (supplyRatio <= 0.4) supplyNorm = 0.3;
    else supplyNorm = 0.15;

    // Price Competition (weight 20%) — price drops = buyer's market
    const priceDrops = data.segments.price_drops.filter(
      (l) => l.MLSAreaMajor === nh.neighborhood
    ).length;
    const priceDropRatio = inv > 0 ? priceDrops / inv : 0;
    let priceNorm: number;
    if (priceDropRatio <= 0.05) priceNorm = 0.9;
    else if (priceDropRatio <= 0.1) priceNorm = 0.7;
    else if (priceDropRatio <= 0.2) priceNorm = 0.5;
    else if (priceDropRatio <= 0.35) priceNorm = 0.3;
    else priceNorm = 0.1;

    const index =
      Math.round(
        (absorptionNorm * 0.3 +
          inventoryNorm * 0.25 +
          supplyNorm * 0.25 +
          priceNorm * 0.2) *
          100
      ) / 100;

    const { label, interpretation } = liquidityLabel(index);

    return {
      neighborhood: nh.neighborhood,
      borough: nh.borough,
      index,
      label,
      interpretation,
      components: {
        absorptionSpeed: { value: dom, normalized: absorptionNorm },
        inventoryLevel: { value: inv, normalized: inventoryNorm },
        supplyTrend: { value: nh.newListings30d, normalized: supplyNorm },
        priceCompetition: { value: priceDrops, normalized: priceNorm },
      },
    };
  });
}

// ─── Sentiment Score ──────────────────────────────────────

function sentimentLabel(score: number): string {
  if (score >= 80) return "Hot";
  if (score >= 60) return "Warm";
  if (score >= 40) return "Neutral";
  if (score >= 20) return "Cool";
  return "Cold";
}

export function computeSentimentScores(
  data: MarketDataSet
): SentimentScore[] {
  return data.neighborhoodStats.map((nh) => {
    const signals: string[] = [];
    let score = 50; // Base

    // Low DOM = hot market
    if (nh.avgDom <= 30) {
      score += 20;
      signals.push(`Fast absorption (${nh.avgDom} avg DOM)`);
    } else if (nh.avgDom <= 45) {
      score += 10;
      signals.push(`Moderate pace (${nh.avgDom} avg DOM)`);
    } else if (nh.avgDom >= 90) {
      score -= 15;
      signals.push(`Slow movement (${nh.avgDom} avg DOM)`);
    }

    // New supply rate
    const supplyRate =
      nh.activeCount > 0 ? nh.newListings30d / nh.activeCount : 0;
    if (supplyRate >= 0.3) {
      score -= 10;
      signals.push(
        `High new supply (${nh.newListings30d} new / ${nh.activeCount} total)`
      );
    } else if (supplyRate <= 0.1 && nh.activeCount > 5) {
      score += 10;
      signals.push("Tight supply — few new listings");
    }

    // Price drops in neighborhood
    const priceDrops = data.segments.price_drops.filter(
      (l) => l.MLSAreaMajor === nh.neighborhood
    ).length;
    const dropRate = nh.activeCount > 0 ? priceDrops / nh.activeCount : 0;
    if (dropRate >= 0.2) {
      score -= 15;
      signals.push(`${priceDrops} price drops (${Math.round(dropRate * 100)}%)`);
    } else if (dropRate <= 0.05) {
      score += 5;
      signals.push("Prices holding firm");
    }

    // Contracts signed
    const contracts = data.segments.contract_signed.filter(
      (l) => l.MLSAreaMajor === nh.neighborhood
    ).length;
    if (contracts >= 3) {
      score += 10;
      signals.push(`${contracts} contracts signed — active buyer interest`);
    }

    score = Math.max(0, Math.min(100, score));

    return {
      neighborhood: nh.neighborhood,
      borough: nh.borough,
      score,
      label: sentimentLabel(score),
      signals,
    };
  });
}

// ─── Market Alerts ────────────────────────────────────────

export function detectMarketAlerts(
  data: MarketDataSet
): MarketAlert[] {
  const alerts: MarketAlert[] = [];

  for (const nh of data.neighborhoodStats) {
    // High price drop cluster
    const priceDrops = data.segments.price_drops.filter(
      (l) => l.MLSAreaMajor === nh.neighborhood
    ).length;
    const dropRate =
      nh.activeCount > 0 ? priceDrops / nh.activeCount : 0;
    if (dropRate >= 0.25 && priceDrops >= 3) {
      alerts.push({
        type: "price_drop_cluster",
        severity: "warning",
        neighborhood: nh.neighborhood,
        message: `${priceDrops} price drops (${Math.round(dropRate * 100)}% of inventory) in ${nh.neighborhood}`,
        value: priceDrops,
      });
    }

    // New listing flood (>40% of inventory is new in 30d)
    const newRate =
      nh.activeCount > 0 ? nh.newListings30d / nh.activeCount : 0;
    if (newRate >= 0.4 && nh.newListings30d >= 5) {
      alerts.push({
        type: "new_listing_flood",
        severity: "warning",
        neighborhood: nh.neighborhood,
        message: `${nh.newListings30d} new listings in 30 days in ${nh.neighborhood} (${Math.round(newRate * 100)}% of inventory)`,
        value: nh.newListings30d,
      });
    }

    // DOM spike (>90 days average)
    if (nh.avgDom >= 90 && nh.activeCount >= 5) {
      alerts.push({
        type: "dom_spike",
        severity: "warning",
        neighborhood: nh.neighborhood,
        message: `Average ${nh.avgDom} days on market in ${nh.neighborhood} — slow absorption`,
        value: nh.avgDom,
      });
    }

    // High absorption (DOM <= 20 and contracts)
    const contracts = data.segments.contract_signed.filter(
      (l) => l.MLSAreaMajor === nh.neighborhood
    ).length;
    if (nh.avgDom <= 20 && contracts >= 2) {
      alerts.push({
        type: "high_absorption",
        severity: "info",
        neighborhood: nh.neighborhood,
        message: `Fast-moving market in ${nh.neighborhood}: ${nh.avgDom} avg DOM, ${contracts} contracts signed`,
        value: nh.avgDom,
      });
    }
  }

  return alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ─── Rent vs Buy Analysis ─────────────────────────────────

/**
 * Generate rent-vs-buy comparison for a neighborhood.
 * Uses real Trestle market data for both rental and sale medians.
 *
 * @param saleStats - Neighborhood stats from sale listings
 * @param rentalStats - Neighborhood stats from rental listings
 * @param clientFinancials - Optional client-specific data (income, down payment %)
 */
export function computeRentVsBuy(
  saleStats: NeighborhoodStats,
  rentalStats: NeighborhoodStats | null,
  clientFinancials?: {
    downPaymentPct?: number; // default 20%
    mortgageRate?: number; // default 6.5%
    mortgageYears?: number; // default 30
  }
): RentVsBuyAnalysis {
  const downPct = clientFinancials?.downPaymentPct || 0.2;
  const rate = (clientFinancials?.mortgageRate || 6.5) / 100 / 12; // monthly rate
  const months = (clientFinancials?.mortgageYears || 30) * 12;

  const buyPrice = saleStats.medianPrice;
  const loanAmount = buyPrice * (1 - downPct);

  // Monthly mortgage (P&I)
  const monthlyMortgage =
    loanAmount > 0 && rate > 0
      ? Math.round(
          (loanAmount * (rate * Math.pow(1 + rate, months))) /
            (Math.pow(1 + rate, months) - 1)
        )
      : 0;

  // Monthly taxes (estimate from avg annual tax / 12, or 1.1% of price / 12)
  const avgAnnualTax =
    saleStats.avgMaintenance > 0
      ? buyPrice * 0.011 // NYC effective rate ~1.1%
      : buyPrice * 0.011;
  const monthlyTaxes = Math.round(avgAnnualTax / 12);

  // Monthly maintenance/CC
  const monthlyMaintenance = saleStats.avgMaintenance || 0;

  const monthlyBuyTotal = monthlyMortgage + monthlyTaxes + monthlyMaintenance;

  // Monthly rent
  const monthlyRent = rentalStats?.medianPrice || 0;

  // Break-even: years until buying equity exceeds rent savings
  // Simplified: if buy < rent, break-even = 0. Otherwise estimate.
  let breakEvenYears = 0;
  if (monthlyBuyTotal > monthlyRent && monthlyRent > 0) {
    const monthlyDiff = monthlyBuyTotal - monthlyRent;
    // Equity buildup ~30% of mortgage payment in early years
    const monthlyEquity = monthlyMortgage * 0.3;
    // Appreciation ~3% annually
    const monthlyAppreciation = (buyPrice * 0.03) / 12;
    const netMonthlyGain = monthlyEquity + monthlyAppreciation - monthlyDiff;
    if (netMonthlyGain > 0) {
      breakEvenYears = Math.round((downPct * buyPrice) / (netMonthlyGain * 12));
    } else {
      breakEvenYears = 99; // Never breaks even at current rates
    }
  }

  const buyAdvantage = monthlyBuyTotal <= monthlyRent * 1.15; // Within 15%

  let summary: string;
  if (!rentalStats || monthlyRent === 0) {
    summary = `In ${saleStats.neighborhood}, the median purchase price is $${buyPrice.toLocaleString()} with estimated monthly costs of $${monthlyBuyTotal.toLocaleString()} (mortgage + taxes + maintenance). Rental comparison data is not yet available for this area.`;
  } else if (buyAdvantage) {
    summary = `In ${saleStats.neighborhood}, buying ($${monthlyBuyTotal.toLocaleString()}/mo) is comparable to renting ($${monthlyRent.toLocaleString()}/mo). With equity buildup and potential appreciation, purchasing may be the stronger long-term financial move.`;
  } else {
    summary = `In ${saleStats.neighborhood}, buying costs $${monthlyBuyTotal.toLocaleString()}/mo vs renting at $${monthlyRent.toLocaleString()}/mo. The break-even point is approximately ${breakEvenYears} years. Your financial situation and timeline should drive this decision.`;
  }

  return {
    neighborhood: saleStats.neighborhood,
    monthlyRent,
    monthlyBuyTotal,
    monthlyMortgage,
    monthlyTaxes,
    monthlyMaintenance,
    medianBuyPrice: buyPrice,
    medianRentPrice: monthlyRent,
    breakEvenYears,
    buyAdvantage,
    summary,
  };
}

// ─── Client Match Scoring ─────────────────────────────────

/**
 * Score how well a listing matches a client's preferences.
 * Returns 0-100 match score with reasons.
 */
export function scoreListingMatch(
  listing: TrestleListing,
  prefs: {
    neighborhoods?: string[];
    propertyTypes?: string[];
    minBeds?: number;
    maxBeds?: number;
    minPrice?: number;
    maxPrice?: number;
  }
): { score: number; reasons: string[] } {
  let score = 40; // Base
  const reasons: string[] = [];

  // Neighborhood match (+25)
  if (
    prefs.neighborhoods &&
    prefs.neighborhoods.length > 0 &&
    prefs.neighborhoods.includes(listing.MLSAreaMajor)
  ) {
    score += 25;
    reasons.push(`Preferred neighborhood: ${listing.MLSAreaMajor}`);
  }

  // Property type match (+15)
  if (prefs.propertyTypes && prefs.propertyTypes.length > 0) {
    const subType = listing.PropertySubType;
    const typeMap: Record<string, string[]> = {
      Condo: ["Condominium", "Condo"],
      "Co-op": ["StockCooperative", "Cooperative"],
      Condop: ["Condop"],
      Townhouse: ["SingleFamilyTownhouse", "Townhouse"],
    };
    for (const pt of prefs.propertyTypes) {
      if (typeMap[pt]?.includes(subType)) {
        score += 15;
        reasons.push(`Preferred type: ${pt}`);
        break;
      }
    }
  }

  // Bedroom match (+10)
  const beds = listing.BedroomsTotal;
  if (prefs.minBeds != null && prefs.maxBeds != null) {
    if (beds >= prefs.minBeds && beds <= prefs.maxBeds) {
      score += 10;
      reasons.push(`${beds} bed match`);
    }
  } else if (prefs.minBeds != null && beds >= prefs.minBeds) {
    score += 10;
    reasons.push(`${beds} bed match`);
  }

  // Price range (+10)
  const price = listing.ListPrice;
  if (prefs.minPrice && prefs.maxPrice) {
    if (price >= prefs.minPrice && price <= prefs.maxPrice) {
      // Sweet spot bonus
      const mid = (prefs.minPrice + prefs.maxPrice) / 2;
      const dist = Math.abs(price - mid) / mid;
      if (dist < 0.1) {
        score += 10;
        reasons.push("Price sweet spot");
      } else {
        score += 5;
        reasons.push("Within price range");
      }
    }
  }

  return { score: Math.min(100, score), reasons };
}
