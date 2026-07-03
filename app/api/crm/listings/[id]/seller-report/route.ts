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

  // Ownership: agents see only their own listings; broker sees all.
  // Same rule as GET /api/crm/listings/[id].
  // Codex #472 r4: normalize before the broker bypass — requireRole()
  // uppercases on entry, so a legacy lowercase "broker" session would
  // otherwise be treated as an agent and 403 on unassigned listings.
  if (String(auth.role).toUpperCase() !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const report = await loadSellerReport(listing);
  return NextResponse.json(report);
}
