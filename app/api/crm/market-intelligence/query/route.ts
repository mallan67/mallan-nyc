// /api/crm/market-intelligence/query — POST: filtered market data from Trestle
// Powers: Market Activity grid, Market Pulse, Liquidity Index, Sentiment, Heatmap, Alerts
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { fetchMarketData, type MarketFilters } from "@/lib/market-intelligence/fetcher";
import {
  computeSummaryStats,
  computeLiquidityScores,
  computeSentimentScores,
  detectMarketAlerts,
} from "@/lib/market-intelligence/calculator";

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    listing_type = "sale",
    property_types,
    borough,
    neighborhoods,
    bedroom_range,
    price_range,
    date_range,
  } = body;

  if (!["sale", "rent"].includes(listing_type as string)) {
    return NextResponse.json(
      { ok: false, error: "listing_type must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  const filters: MarketFilters = {
    listingType: listing_type as "sale" | "rent",
    propertyTypes: Array.isArray(property_types) ? property_types : undefined,
    borough: typeof borough === "string" ? borough : undefined,
    neighborhoods: Array.isArray(neighborhoods) ? neighborhoods : undefined,
    bedroomRange: bedroom_range as MarketFilters["bedroomRange"],
    priceRange: price_range as MarketFilters["priceRange"],
    dateRange: date_range as MarketFilters["dateRange"],
  };

  try {
    const data = await fetchMarketData(filters);
    const summary = computeSummaryStats(data);
    const liquidity = computeLiquidityScores(data);
    const sentiment = computeSentimentScores(data);
    const alerts = detectMarketAlerts(data);

    return NextResponse.json({
      ok: true,
      data: {
        segments: {
          new_listings: data.segments.new_listings.length,
          coming_soon: data.segments.coming_soon.length,
          price_drops: data.segments.price_drops.length,
          contract_signed: data.segments.contract_signed.length,
          temp_off_market: data.segments.temp_off_market.length,
          expired: data.segments.expired.length,
          closed: data.segments.closed.length,
        },
        listings: {
          new_listings: data.segments.new_listings,
          coming_soon: data.segments.coming_soon,
          price_drops: data.segments.price_drops,
          contract_signed: data.segments.contract_signed,
          temp_off_market: data.segments.temp_off_market,
          expired: data.segments.expired,
          // Closed listings for analytics only — not for client display
          closed: auth.role === "BROKER" ? data.segments.closed : [],
        },
        neighborhood_stats: data.neighborhoodStats,
        summary,
        liquidity,
        sentiment,
        alerts,
        fetched_at: data.fetchedAt,
        disclaimer: data.disclaimer,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[market-intelligence/query] Error:", message);
    return NextResponse.json(
      { ok: false, error: "Market data temporarily unavailable" },
      { status: 500 }
    );
  }
}
