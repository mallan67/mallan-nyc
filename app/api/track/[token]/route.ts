// /api/track/[token] — GET: listing engagement tracking redirect
// When a client clicks a listing link in an email, this endpoint:
// 1. Records the click as an IntentEvent
// 2. Redirects to the actual listing page on mallan.nyc
//
// COMPLIANCE:
// - No MLS data exposed in tracking — only records the click event
// - Redirects to public listing page (which has its own display compliance)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { searchParams } = req.nextUrl;
  const listingId = searchParams.get("lid");

  // Decode tracking token: base64url(clientId:agentId:timestamp)
  let clientId: bigint | null = null;
  let agentId: bigint | null = null;

  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length >= 2) {
      clientId = BigInt(parts[0]);
      agentId = BigInt(parts[1]);
    }
  } catch {
    // Invalid token — still redirect, just don't track
  }

  // Record IntentEvent
  if (clientId && listingId) {
    try {
      await prisma.intentEvent.create({
        data: {
          lead_id: clientId,
          event_type: "listing_link_clicked",
          payload: {
            listing_id: listingId,
            source: "email",
            agent_id: agentId ? agentId.toString() : null,
            clicked_at: new Date().toISOString(),
            user_agent: req.headers.get("user-agent") || null,
          },
        },
      });
    } catch (err) {
      // Don't block redirect on tracking failure
      console.error("[track] IntentEvent creation failed:", err);
    }
  }

  // Redirect to listing page
  const redirectUrl = listingId
    ? `https://mallan.nyc/listings/${encodeURIComponent(listingId)}`
    : "https://mallan.nyc";

  return NextResponse.redirect(redirectUrl, 302);
}
