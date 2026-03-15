/**
 * Manhattan Market Report Builder
 *
 * Pulls REAL listing data from Trestle RLS feed, computes market statistics,
 * generates AI narrative using Claude.
 *
 * Data source: Trestle API (same feed as IDX search)
 * AI: Anthropic Claude API for narrative generation
 */
import { fetchFromTrestle } from "@/lib/idx/fetch";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface MarketReportInput {
  report_type: "sale" | "rent" | "both";
  property_types: string[];
  neighborhoods?: string[];
  period?: string;
}

export interface MarketReportSection {
  property_type: string;
  listing_type: string;
  stats: {
    active_count: number;
    median_price: number;
    avg_price: number;
    avg_price_per_sqft: number;
    avg_dom: number;
    new_listings_30d: number;
    price_range: { min: number; max: number };
    avg_maintenance: number;
  };
  sample_listings: {
    address: string;
    price: number;
    beds: number;
    baths: number;
    sqft: number | null;
    dom: number;
    type: string;
    company: string;
  }[];
}

export interface MarketReport {
  title: string;
  period: string;
  generated_at: string;
  sections: MarketReportSection[];
  narrative: string;
  total_listings: number;
  disclaimer: string;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

// Map display names to Trestle PropertySubType values
const TYPE_FILTERS: Record<string, string> = {
  "Condo": "PropertySubType eq 'Condominium' or PropertySubType eq 'Condo'",
  "Co-op": "PropertySubType eq 'StockCooperative' or PropertySubType eq 'Cooperative'",
  "Condop": "PropertySubType eq 'Condop'",
  "Townhouse": "PropertySubType eq 'SingleFamilyTownhouse' or PropertySubType eq 'Townhouse'",
};

async function fetchTrestleStats(
  listingType: string,
  propertyType: string,
  neighborhoods?: string[]
): Promise<MarketReportSection | null> {
  const typeFilter = TYPE_FILTERS[propertyType];
  if (!typeFilter) return null;

  const statusFilter = listingType === "rent"
    ? "StandardStatus eq 'Active' and PropertyType eq 'Residential Lease'"
    : "StandardStatus eq 'Active' and PropertyType eq 'Residential'";

  let filter = `${statusFilter} and (${typeFilter})`;

  // Borough filter — Manhattan
  filter += " and CountyOrParish eq 'New York'";

  // Neighborhood filter
  if (neighborhoods && neighborhoods.length > 0) {
    const nhFilter = neighborhoods
      .map((n) => `MLSAreaMajor eq '${n.replace(/'/g, "''")}'`)
      .join(" or ");
    filter += ` and (${nhFilter})`;
  }

  try {
    const result = await fetchFromTrestle({
      filter,
      top: 200,
      count: true,
      expandMedia: false,
      select: [
        "ListingId", "ListPrice", "ClosePrice", "OriginalListPrice",
        "BedroomsTotal", "BathroomsFull", "BathroomsHalf",
        "LivingArea", "DaysOnMarket", "CumulativeDaysOnMarket",
        "StreetNumber", "StreetName", "UnitNumber",
        "MLSAreaMajor", "PropertySubType",
        "AssociationFee", "ListOfficeName",
        "ModificationTimestamp", "OnMarketDate",
      ],
      orderby: "ListPrice desc",
    });

    const listings = result.records || [];
    const totalCount = result.odataCount || listings.length;

    if (listings.length === 0) {
      return {
        property_type: propertyType,
        listing_type: listingType,
        stats: {
          active_count: 0, median_price: 0, avg_price: 0,
          avg_price_per_sqft: 0, avg_dom: 0, new_listings_30d: 0,
          price_range: { min: 0, max: 0 }, avg_maintenance: 0,
        },
        sample_listings: [],
      };
    }

    // Compute statistics
    const prices = listings
      .map((l) => Number(l.ListPrice) || 0)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
    const avgPrice = prices.length > 0
      ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      : 0;

    const sqftPrices = listings
      .filter((l) => Number(l.LivingArea) > 0 && Number(l.ListPrice) > 0)
      .map((l) => Number(l.ListPrice) / Number(l.LivingArea));
    const avgPpSqft = sqftPrices.length > 0
      ? Math.round(sqftPrices.reduce((s, p) => s + p, 0) / sqftPrices.length)
      : 0;

    const domValues = listings
      .map((l) => Number(l.DaysOnMarket) || Number(l.CumulativeDaysOnMarket) || 0)
      .filter((d) => d >= 0);
    const avgDom = domValues.length > 0
      ? Math.round(domValues.reduce((s, d) => s + d, 0) / domValues.length)
      : 0;

    const maintValues = listings
      .map((l) => Number(l.AssociationFee) || 0)
      .filter((m) => m > 0);
    const avgMaint = maintValues.length > 0
      ? Math.round(maintValues.reduce((s, m) => s + m, 0) / maintValues.length)
      : 0;

    // New listings in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newListings = listings.filter((l) => {
      const onMarket = l.OnMarketDate || l.ModificationTimestamp;
      return onMarket && new Date(String(onMarket)) >= thirtyDaysAgo;
    }).length;

    // Sample listings (top 5 by price)
    const samples = listings.slice(0, 5).map((l) => ({
      address: `${l.StreetNumber || ''} ${l.StreetName || ''}${l.UnitNumber ? ` #${l.UnitNumber}` : ''}`.trim(),
      price: Number(l.ListPrice) || 0,
      beds: Number(l.BedroomsTotal) || 0,
      baths: Number(l.BathroomsFull) || 0,
      sqft: Number(l.LivingArea) || null,
      dom: Number(l.DaysOnMarket) || 0,
      type: String(l.PropertySubType || propertyType),
      company: String(l.ListOfficeName || ''),
    }));

    return {
      property_type: propertyType,
      listing_type: listingType,
      stats: {
        active_count: totalCount,
        median_price: medianPrice,
        avg_price: avgPrice,
        avg_price_per_sqft: avgPpSqft,
        avg_dom: avgDom,
        new_listings_30d: newListings,
        price_range: {
          min: prices.length > 0 ? prices[0] : 0,
          max: prices.length > 0 ? prices[prices.length - 1] : 0,
        },
        avg_maintenance: avgMaint,
      },
      sample_listings: samples,
    };
  } catch (err) {
    console.error(`[market-report] Trestle fetch failed for ${propertyType} ${listingType}:`, err);
    return null;
  }
}

async function generateNarrative(
  sections: MarketReportSection[],
  period: string
): Promise<string> {
  const activeSections = sections.filter((s) => s.stats.active_count > 0);

  if (activeSections.length === 0) {
    return `The Manhattan real estate market in ${period} shows limited inventory across the tracked property types. Market conditions are expected to evolve as seasonal patterns develop. Contact your agent for the latest updates and personalized market analysis.`;
  }

  const dataSummary = activeSections
    .map((s) => {
      const priceLabel = s.listing_type === "rent" ? "/month" : "";
      return [
        `${s.property_type} (${s.listing_type === "rent" ? "Rental" : "Sale"}):`,
        `  Active inventory: ${s.stats.active_count} listings`,
        `  Median price: $${s.stats.median_price.toLocaleString()}${priceLabel}`,
        `  Average price: $${s.stats.avg_price.toLocaleString()}${priceLabel}`,
        `  Avg price/sqft: $${s.stats.avg_price_per_sqft}`,
        `  Avg days on market: ${s.stats.avg_dom}`,
        `  New listings (30d): ${s.stats.new_listings_30d}`,
        s.stats.avg_maintenance > 0 ? `  Avg maintenance/CC: $${s.stats.avg_maintenance}/mo` : "",
        s.stats.price_range.min > 0
          ? `  Price range: $${s.stats.price_range.min.toLocaleString()} - $${s.stats.price_range.max.toLocaleString()}`
          : "",
        s.sample_listings.length > 0
          ? `  Notable listings: ${s.sample_listings.slice(0, 3).map((l) => `${l.address} ($${l.price.toLocaleString()}, ${l.beds}BR, ${l.dom} DOM, ${l.company})`).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const totalListings = activeSections.reduce((s, sec) => s + sec.stats.active_count, 0);

  const prompt = `You are a senior real estate market analyst for Mallan Real Estate Inc., a REBNY-licensed brokerage in Manhattan, NYC. Write a professional market report for ${period}.

REAL MARKET DATA FROM REBNY RLS (via Trestle):
Total active listings analyzed: ${totalListings}

${dataSummary}

REQUIREMENTS:
1. Write 4-6 paragraphs of professional, insightful market narrative
2. Start with a market overview paragraph summarizing overall conditions
3. Cover: pricing trends, inventory levels, absorption speed, and notable patterns
4. Compare property types where data permits (condo vs co-op pricing, maintenance differences)
5. Reference specific numbers from the data — be precise
6. Include observations about what the numbers mean for buyers and sellers
7. Tone: authoritative, data-driven, suitable for high-net-worth NYC real estate clients
8. Do NOT use discriminatory language or reference any protected classes
9. Do NOT make specific price predictions — describe current conditions and momentum
10. End with a brief market outlook paragraph
11. Do NOT include greetings, signatures, subject lines, or marketing language
12. This data is from the actual REBNY RLS feed — present it with confidence

Write the narrative now:`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "Market narrative generation unavailable.";
  } catch (err) {
    console.error("[market-report] AI generation failed:", err);
    const avgDom = Math.round(
      activeSections.reduce((s, sec) => s + sec.stats.avg_dom, 0) / activeSections.length
    );
    return `The Manhattan real estate market in ${period} shows ${totalListings} active listings across the tracked property types, with an average of ${avgDom} days on market. The market continues to reflect New York City's dynamic real estate landscape with varying conditions across property types and neighborhoods. Contact your Mallan Real Estate agent for a detailed analysis tailored to your specific needs and investment criteria.`;
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

  // Fetch from Trestle in parallel
  const promises: Promise<MarketReportSection | null>[] = [];

  if (input.report_type === "sale" || input.report_type === "both") {
    for (const pt of propertyTypes) {
      promises.push(fetchTrestleStats("sale", pt, input.neighborhoods));
    }
  }

  if (input.report_type === "rent" || input.report_type === "both") {
    for (const pt of propertyTypes) {
      promises.push(fetchTrestleStats("rent", pt, input.neighborhoods));
    }
  }

  const results = await Promise.all(promises);
  sections = results.filter(Boolean) as MarketReportSection[];

  const narrative = await generateNarrative(sections, period);
  const totalListings = sections.reduce((s, sec) => s + sec.stats.active_count, 0);

  return {
    title: `Manhattan ${input.report_type === "rent" ? "Rental" : input.report_type === "both" ? "Sale & Rental" : "Sale"} Market Report`,
    period,
    generated_at: new Date().toISOString(),
    sections,
    narrative,
    total_listings: totalListings,
    disclaimer:
      "Based on information from the REBNY Listing Service for the period indicated. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof. Broker commissions are not set by law and are fully negotiable. Equal Housing Opportunity.",
  };
}
