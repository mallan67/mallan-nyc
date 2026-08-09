// /api/crm/listings/[id]/seller-report
// GET: SELLER-001 Phase 1 — internal (broker/agent-only) seller listing
// intelligence report aggregated from EXISTING data (listing_views,
// inquiries, showings, client_listing_actions + market-proxy context from
// the listings table). Read-only; no new tables (Phase-2 models are
// Maya-HELD design deliverables).
//
// Truth rules (Maya 2026-07-03): every metric carries a truth level
// (VERIFIED_MALLAN_TRAFFIC / TRACKED_CAMPAIGN / PORTAL_REPORTED /
// EXTERNAL_PRESENCE / MARKET_PROXY); viewer identity never exposed
// (aggregate counts only); market context is proxy data from our own DB,
// never a competitor/portal-traffic claim; data_gaps lists what is not
// yet tracked. Spec: docs/architecture/SELLER-001-SPEC-2026-07-03.md
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { loadSellerReport } from "@/lib/seller-report/load-report";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Resolve a listing by numeric ID or listing_id string.
 * Mirrors the resolver in /api/crm/listings/[id]/route.ts.
 */
async function findListing(id: string) {
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({ where: { id: BigInt(numericId) } });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({ where: { listing_id: id } });
  }
  return listing;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listing = await findListing(id);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // SELLER-SIDE AUTHORITY, not association. Mallan represents the seller only
  // on its own LOCAL listings, so the report is a local-listing capability.
  //
  // What this closes: `syncAgentHistory` stamps `agent_id` from BuyerAgentMlsId
  // too, so an agent who was merely the BUYER-side agent on a third-party
  // listing previously received that listing's seller intelligence report
  // (views, inquiries, showings). A broker previously received it for EVERY row
  // in the table, including inventory Mallan does not list.
  //
  // Role normalization (Codex #472 r4) is preserved inside listingCapabilities().
  const caps = listingCapabilities(auth, listing);
  if (!caps.mayViewSellerReport) {
    return NextResponse.json(
      caps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
  }

  const report = await loadSellerReport(listing);
  return NextResponse.json(report);
}
