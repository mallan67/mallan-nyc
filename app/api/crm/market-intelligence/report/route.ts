// /api/crm/market-intelligence/report — POST: generate client-facing report
// Branded with company banner + agent contact info
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { fetchMarketData } from "@/lib/market-intelligence/fetcher";
import { computeSummaryStats } from "@/lib/market-intelligence/calculator";
import {
  matchListingsForClient,
  getAgentClientsWithPrefs,
} from "@/lib/market-intelligence/client-matcher";
import {
  sendListingEmail,
  getAgentBranding,
  buildListingEmail,
} from "@/lib/market-intelligence/auto-send";

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
    client_id,
    listing_type = "sale",
    neighborhoods,
    personal_message,
    send = false, // false = preview only, true = send email
  } = body;

  if (!client_id) {
    return NextResponse.json(
      { ok: false, error: "client_id is required" },
      { status: 400 }
    );
  }

  try {
    const agent = await getAgentBranding(auth.userId);

    // Get client
    const clients = await getAgentClientsWithPrefs(auth.userId);
    const client = clients.find(
      (c) => c.id.toString() === String(client_id)
    );

    if (!client) {
      return NextResponse.json(
        { ok: false, error: "Client not found or not assigned to you" },
        { status: 404 }
      );
    }

    const prefs = client.preferences;
    const nhList =
      Array.isArray(neighborhoods) && neighborhoods.length > 0
        ? neighborhoods as string[]
        : prefs?.neighborhoods || [];

    if (nhList.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No neighborhoods specified. Set client preferences or pass neighborhoods.",
        },
        { status: 400 }
      );
    }

    // Fetch market data
    const marketData = await fetchMarketData({
      listingType: listing_type as "sale" | "rent",
      neighborhoods: nhList,
    });

    const summary = computeSummaryStats(marketData);

    // Match listings
    const matched = await matchListingsForClient(
      {
        roles: client.roles,
        preferences: prefs
          ? { ...prefs, boroughs: prefs.boroughs || [] }
          : null,
      },
      {
        includeSale: client.roles.includes("buyer"),
        includeRental:
          client.roles.includes("renter") ||
          client.roles.includes("tenant"),
        limit: 8,
      }
    );

    const saleListings = matched
      .filter((m) => m.listing.PropertyType === "Residential")
      .map((m) => m.listing)
      .slice(0, 6);
    const rentalListings = matched
      .filter(
        (m) => m.listing.PropertyType === "Residential Lease"
      )
      .map((m) => m.listing)
      .slice(0, 6);

    const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

    const emailOptions = {
      recipientName: `${client.firstName} ${client.lastName}`,
      recipientEmail: client.email,
      subject: `${quarter} Market Report — ${nhList.slice(0, 2).join(", ")}`,
      preheader: `${summary.totalActive} active listings, $${summary.medianPrice.toLocaleString()} median price`,
      saleListings: saleListings.length > 0 ? saleListings : undefined,
      rentalListings:
        rentalListings.length > 0 ? rentalListings : undefined,
      neighborhoodStats: marketData.neighborhoodStats.slice(0, 5),
      personalMessage:
        (personal_message as string) ||
        `Hi ${client.firstName}, here's your market update for ${nhList.slice(0, 2).join(" and ")}.`,
      emailType: "custom" as const,
      agent,
    };

    // Build HTML preview
    const html = buildListingEmail(emailOptions);

    if (send) {
      const result = await sendListingEmail({
        ...emailOptions,
        sessionUser: auth,
      });

      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        sent: true,
        messageId: result.messageId,
        summary,
      });
    }

    // Preview only
    return NextResponse.json({
      ok: true,
      sent: false,
      preview_html: html,
      summary,
      matched_listings: matched.length,
      disclaimer: marketData.disclaimer,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[market-intelligence/report] Error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
