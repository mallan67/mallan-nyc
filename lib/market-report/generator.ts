/**
 * Manhattan Market Report Builder
 *
 * AI-powered market report generation using real listing data.
 * Generates narrative market analysis by property type (Condo, Co-op, Condop, Townhouse)
 * for both sales and rentals.
 *
 * Data sources: Prisma DB listings, MarketSnapshot, DemandIndex
 * AI: Anthropic Claude API for narrative generation
 */
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface MarketReportInput {
  report_type: "sale" | "rent" | "both";
  property_types: string[]; // ["Condo", "Co-op", "Condop", "Townhouse"]
  neighborhoods?: string[]; // optional filter, defaults to all Manhattan
  period?: string; // e.g. "Q1 2026", auto-detected if not provided
}

export interface MarketReportSection {
  property_type: string;
  listing_type: string;
  stats: {
    active_count: number;
    median_price: number;
    avg_price_per_sqft: number;
    avg_dom: number;
    inventory_change_pct: number;
    new_listings: number;
    closed_count: number;
    price_range: { min: number; max: number };
  };
}

export interface MarketReport {
  title: string;
  period: string;
  generated_at: string;
  sections: MarketReportSection[];
  narrative: string;
  disclaimer: string;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

// Map display names to DB property_type values
const TYPE_MAP: Record<string, string[]> = {
  "Condo": ["Condo", "Condominium"],
  "Co-op": ["Co-op", "StockCooperative", "Cooperative"],
  "Condop": ["Condop"],
  "Townhouse": ["Townhouse", "SingleFamilyTownhouse", "SingleFamilyResidence"],
};

async function gatherStats(
  listingType: string,
  propertyTypes: string[],
  neighborhoods?: string[]
): Promise<MarketReportSection[]> {
  const sections: MarketReportSection[] = [];

  for (const displayType of propertyTypes) {
    const dbTypes = TYPE_MAP[displayType] || [displayType];

    const where: Record<string, unknown> = {
      listing_type: listingType,
      property_type: { in: dbTypes },
      borough: "Manhattan",
      owner_opt_out: false,
      participant_only: false,
    };
    if (neighborhoods && neighborhoods.length > 0) {
      where.neighborhood = { in: neighborhoods };
    }

    // Active listings
    const activeWhere = { ...where, status: { in: ["Active", "active", "ACTIVE"] } };
    const activeListings = await prisma.listing.findMany({
      where: activeWhere,
      select: { list_price: true, living_area: true, days_on_market: true },
    });

    // Closed in last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const closedWhere = {
      ...where,
      status: { in: ["Closed", "Sold", "Leased"] },
      status_changed_at: { gte: ninetyDaysAgo },
    };
    const closedCount = await prisma.listing.count({ where: closedWhere });

    // New listings in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newWhere = { ...where, created_at: { gte: thirtyDaysAgo } };
    const newListings = await prisma.listing.count({ where: newWhere });

    // Compute stats
    const prices = activeListings
      .map((l) => Number(l.list_price))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;

    const ppsqftValues = activeListings
      .filter((l) => l.living_area && Number(l.living_area) > 0)
      .map((l) => Number(l.list_price) / Number(l.living_area));
    const avgPpSqft =
      ppsqftValues.length > 0
        ? Math.round(ppsqftValues.reduce((s, v) => s + v, 0) / ppsqftValues.length)
        : 0;

    const domValues = activeListings
      .map((l) => l.days_on_market || 0)
      .filter((d) => d > 0);
    const avgDom =
      domValues.length > 0
        ? Math.round(domValues.reduce((s, v) => s + v, 0) / domValues.length)
        : 0;

    sections.push({
      property_type: displayType,
      listing_type: listingType,
      stats: {
        active_count: activeListings.length,
        median_price: medianPrice,
        avg_price_per_sqft: avgPpSqft,
        avg_dom: avgDom,
        inventory_change_pct: 0, // Would need prior period comparison
        new_listings: newListings,
        closed_count: closedCount,
        price_range: {
          min: prices.length > 0 ? prices[0] : 0,
          max: prices.length > 0 ? prices[prices.length - 1] : 0,
        },
      },
    });
  }

  return sections;
}

async function generateNarrative(
  sections: MarketReportSection[],
  period: string
): Promise<string> {
  // Build data summary for AI
  const dataSummary = sections
    .map((s) => {
      const priceLabel = s.listing_type === "rent" ? "/month" : "";
      return [
        `${s.property_type} (${s.listing_type === "rent" ? "Rental" : "Sale"}):`,
        `  Active: ${s.stats.active_count} listings`,
        `  Median Price: $${s.stats.median_price.toLocaleString()}${priceLabel}`,
        `  Avg $/sqft: $${s.stats.avg_price_per_sqft}`,
        `  Avg DOM: ${s.stats.avg_dom} days`,
        `  New listings (30d): ${s.stats.new_listings}`,
        `  Closed (90d): ${s.stats.closed_count}`,
        s.stats.price_range.min > 0
          ? `  Price range: $${s.stats.price_range.min.toLocaleString()} - $${s.stats.price_range.max.toLocaleString()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const prompt = `You are a senior real estate market analyst for Mallan Real Estate Inc., a REBNY-licensed brokerage in Manhattan, NYC. Write a professional market report for ${period}.

DATA:
${dataSummary}

REQUIREMENTS:
1. Write 3-5 paragraphs of professional market narrative
2. Cover: pricing trends, inventory conditions, absorption rates, and market outlook
3. Compare property types where data permits (condo vs co-op, etc.)
4. Include specific numbers from the data
5. Tone: authoritative but accessible, suitable for sending to clients
6. Do NOT use discriminatory language or reference any protected classes
7. Do NOT make predictions about specific price targets
8. End with a brief outlook paragraph
9. Do NOT include greetings, signatures, or marketing language
10. Focus on Manhattan market conditions

Write the narrative now:`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "Market narrative generation unavailable.";
  } catch (err) {
    console.error("[market-report] AI generation failed:", err);
    // Fallback: generate basic narrative from data
    const totalActive = sections.reduce((s, sec) => s + sec.stats.active_count, 0);
    const avgDom = Math.round(
      sections.reduce((s, sec) => s + sec.stats.avg_dom, 0) / Math.max(sections.length, 1)
    );
    return `The Manhattan real estate market in ${period} shows ${totalActive} active listings across the tracked property types, with an average of ${avgDom} days on market. Please contact your agent for a detailed market analysis tailored to your specific needs.`;
  }
}

export async function generateMarketReport(
  input: MarketReportInput
): Promise<MarketReport> {
  const period = input.period || getCurrentQuarter();
  const propertyTypes =
    input.property_types.length > 0
      ? input.property_types
      : ["Condo", "Co-op", "Condop", "Townhouse"];

  let sections: MarketReportSection[] = [];

  if (input.report_type === "sale" || input.report_type === "both") {
    const saleSections = await gatherStats("sale", propertyTypes, input.neighborhoods);
    sections = sections.concat(saleSections);
  }

  if (input.report_type === "rent" || input.report_type === "both") {
    const rentSections = await gatherStats("rent", propertyTypes, input.neighborhoods);
    sections = sections.concat(rentSections);
  }

  const narrative = await generateNarrative(sections, period);

  return {
    title: `Manhattan ${input.report_type === "rent" ? "Rental" : input.report_type === "both" ? "Sale & Rental" : "Sale"} Market Report`,
    period,
    generated_at: new Date().toISOString(),
    sections,
    narrative,
    disclaimer:
      "Based on information from the REBNY Listing Service. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information. Broker commissions are not set by law and are fully negotiable. Equal Housing Opportunity.",
  };
}
