// /api/crm/market-intelligence/my-market — GET: agent's personalized market dashboard
// Returns: agent's clients grouped by neighborhood + market data + alerts + matches
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { fetchMarketData } from "@/lib/market-intelligence/fetcher";
import {
  computeSummaryStats,
  computeLiquidityScores,
  computeSentimentScores,
  detectMarketAlerts,
  scoreListingMatch,
} from "@/lib/market-intelligence/calculator";
import { getAgentClientsWithPrefs } from "@/lib/market-intelligence/client-matcher";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    // Get agent's clients with their preferences
    const clients = await getAgentClientsWithPrefs(auth.userId, {
      pipelineStages: [
        "new",
        "contacted",
        "nurturing",
        "active",
        "showing",
        "offer",
        "deal",
      ],
    });

    // Extract all unique neighborhoods from client preferences
    const allNeighborhoods = new Set<string>();
    for (const client of clients) {
      if (client.preferences) {
        for (const nh of client.preferences.neighborhoods) {
          allNeighborhoods.add(nh);
        }
      }
    }

    // If no client preferences, return empty but helpful response
    if (allNeighborhoods.size === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          clients: clients.map((c) => ({
            id: c.id.toString(),
            name: `${c.firstName} ${c.lastName}`,
            roles: c.roles,
            pipelineStage: c.pipelineStage,
            leaseEndDate: c.leaseEndDate?.toISOString() || null,
            daysToLeaseEnd: c.leaseEndDate
              ? Math.ceil(
                  (c.leaseEndDate.getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                )
              : null,
            hasPreferences: false,
            matchingListings: 0,
          })),
          neighborhoods: [],
          summary: null,
          alerts: [],
          message:
            "Set client preferences (neighborhoods, price range, beds) to enable market matching.",
        },
      });
    }

    // Fetch market data for ALL client neighborhoods (sale)
    const saleData = await fetchMarketData({
      listingType: "sale",
      neighborhoods: [...allNeighborhoods],
    });

    // Fetch rental data too for tenants
    const hasRenters = clients.some(
      (c) =>
        c.roles.includes("renter") || c.roles.includes("tenant")
    );
    const rentalData = hasRenters
      ? await fetchMarketData({
          listingType: "rent",
          neighborhoods: [...allNeighborhoods],
        })
      : null;

    // Compute metrics
    const summary = computeSummaryStats(saleData);
    const liquidity = computeLiquidityScores(saleData);
    const sentiment = computeSentimentScores(saleData);
    const alerts = detectMarketAlerts(saleData);

    // Build per-client data with matching counts
    const clientData = clients.map((client) => {
      const prefs = client.preferences;
      let matchingSaleCount = 0;
      let matchingRentalCount = 0;
      const clientAlerts: string[] = [];

      if (prefs) {
        // Count matching sale listings
        const activeListings = [
          ...saleData.segments.new_listings,
          ...saleData.segments.coming_soon,
        ];
        for (const listing of activeListings) {
          const { score } = scoreListingMatch(listing, {
            neighborhoods: prefs.neighborhoods,
            propertyTypes: prefs.propertyTypes,
            minBeds: prefs.minBeds || undefined,
            maxBeds: prefs.maxBeds || undefined,
            minPrice: prefs.minPrice || undefined,
            maxPrice: prefs.maxPrice || undefined,
          });
          if (score >= 50) matchingSaleCount++;
        }

        // Count matching rental listings
        if (rentalData) {
          const rentalListings = [
            ...rentalData.segments.new_listings,
            ...rentalData.segments.coming_soon,
          ];
          for (const listing of rentalListings) {
            const { score } = scoreListingMatch(listing, {
              neighborhoods: prefs.neighborhoods,
              propertyTypes: prefs.propertyTypes,
              minBeds: prefs.minBeds || undefined,
              maxBeds: prefs.maxBeds || undefined,
              minPrice: prefs.minPrice || undefined,
              maxPrice: prefs.maxPrice || undefined,
            });
            if (score >= 50) matchingRentalCount++;
          }
        }

        // Client-specific alerts
        const priceDropsInAreas = saleData.segments.price_drops.filter(
          (l) => prefs.neighborhoods.includes(l.MLSAreaMajor)
        ).length;
        if (priceDropsInAreas > 0) {
          clientAlerts.push(
            `${priceDropsInAreas} price drops in ${client.firstName}'s target areas`
          );
        }
      }

      const daysToLeaseEnd = client.leaseEndDate
        ? Math.ceil(
            (client.leaseEndDate.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        id: client.id.toString(),
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        roles: client.roles,
        pipelineStage: client.pipelineStage,
        leaseEndDate: client.leaseEndDate?.toISOString() || null,
        daysToLeaseEnd,
        hasPreferences: !!prefs,
        preferredNeighborhoods: prefs?.neighborhoods || [],
        matchingSaleListings: matchingSaleCount,
        matchingRentalListings: matchingRentalCount,
        clientAlerts,
      };
    });

    // Group clients by neighborhood for the dashboard view
    const neighborhoodClients = new Map<
      string,
      { name: string; role: string; stage: string }[]
    >();
    for (const client of clientData) {
      for (const nh of client.preferredNeighborhoods) {
        const arr = neighborhoodClients.get(nh) || [];
        arr.push({
          name: client.name,
          role: client.roles[0] || "lead",
          stage: client.pipelineStage,
        });
        neighborhoodClients.set(nh, arr);
      }
    }

    // Build neighborhood data with clients + market stats
    const neighborhoods = saleData.neighborhoodStats.map((nh) => {
      const liq = liquidity.find((l) => l.neighborhood === nh.neighborhood);
      const sent = sentiment.find((s) => s.neighborhood === nh.neighborhood);

      return {
        ...nh,
        liquidity: liq
          ? { index: liq.index, label: liq.label }
          : null,
        sentiment: sent
          ? { score: sent.score, label: sent.label }
          : null,
        clients: neighborhoodClients.get(nh.neighborhood) || [],
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        clients: clientData,
        neighborhoods,
        summary,
        alerts,
        fetched_at: saleData.fetchedAt,
        disclaimer: saleData.disclaimer,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[market-intelligence/my-market] Error:", message);
    return NextResponse.json(
      { ok: false, error: "Market data temporarily unavailable" },
      { status: 500 }
    );
  }
}
