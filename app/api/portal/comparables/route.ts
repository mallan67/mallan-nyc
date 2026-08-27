// /api/portal/comparables — Comparables for seller's listing
// Returns comparable listings in the same building + neighborhood
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace, isAuthError } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";
import { SEARCH_DISPLAY_GATE } from "@/lib/search/listing-access-decision";
import { canAccessOwnerListing, isOwnerLead } from "@/lib/portal/listing-ownership";

export async function GET(req: NextRequest) {
  // requireWorkspace (not requirePortalRole) with "buyer" retained: buyers get public comps, and a
  // workspace-only owner — enabled_workspaces:['landlord'] while legacy portal_role is still 'buyer'
  // from a tenant→landlord conversion — is admitted instead of 403'd before the ownership check
  // below (Codex #458 round 6). requirePortalRole reads only portal_role and would deny those owners.
  const auth = await requireWorkspace(req, "buyer", "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const listingId = req.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  // Find the subject listing
  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Ownership enforcement for owner-roles (REBNY Art. III §2): a seller/landlord may only pull comps
  // for THEIR OWN listing. Agents bypass (full CRM access); buyers get public-comp data unchanged.
  // Owner detection uses the effective access set (enabled_workspaces → roles → portal_role) — a
  // workspace-only owner (enabled_workspaces:['seller'], legacy portal_role:'buyer') is admitted here
  // by the buyer allowance, so a portal_role-only check would skip enforcement (Codex #458 round 5).
  if (auth.userType === "lead") {
    const lead = await prisma.lead.findUnique({
      where: { id: auth.userId },
      select: { portal_role: true, enabled_workspaces: true, roles: true },
    });
    if (isOwnerLead(lead) && !canAccessOwnerListing(auth, listing.owner_client_id)) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
  }

  const addr = (listing.address || {}) as Record<string, string>;
  const neighborhood = listing.neighborhood || "";
  const borough = listing.borough || "";
  const listPrice = Number(listing.list_price) || 0;
  const propertyType = listing.property_type || "";
  const bedrooms = listing.bedrooms_total || 0;

  // Find comparables in same building (same street address).
  //
  // REBNY UCBA Art. I §6: closed listings must be removed from public display
  // within 24h. The `data-retention` cron flips `idx_display_yn=false` for
  // listings that crossed the 24h boundary, so the `idx_display_yn: true`
  // filter is the canonical fail-closed gate. Without it, this surface would
  // expose closed listings indefinitely.
  const buildingComps = await prisma.listing.findMany({
    where: {
      id: { not: listing.id },
      neighborhood,
      borough,
      // `Rented` was missing. Nothing in this codebase ever WRITES `Leased`
      // — it survives only in read-side sets — while `Rented` is what the CRM
      // status route writes when a Mallan rental closes (Pending -> Rented).
      // So rental comps included a status no row holds and excluded the one
      // every Mallan rental ends up in.
      status: { in: ["Active", "Closed", "Sold", "Leased", "Rented"] },
      ...SEARCH_DISPLAY_GATE,
    },
    orderBy: { modification_timestamp: "desc" },
    take: 20,
  });

  // Filter to same building by matching street
  const streetName = addr.streetName || "";
  const streetNumber = addr.streetNumber || "";
  const inBuilding = buildingComps.filter((c) => {
    const ca = (c.address || {}) as Record<string, string>;
    return ca.streetName === streetName && ca.streetNumber === streetNumber && c.listing_id !== listing.listing_id;
  });

  // Area comps: same neighborhood, similar type + price range (80%-120%)
  const areaComps = buildingComps.filter((c) => {
    const ca = (c.address || {}) as Record<string, string>;
    const isSameBuilding = ca.streetName === streetName && ca.streetNumber === streetNumber;
    if (isSameBuilding) return false;
    const cp = Number(c.list_price) || 0;
    return cp >= listPrice * 0.7 && cp <= listPrice * 1.3;
  }).slice(0, 10);

  const serializeComp = (c: typeof listing) => {
    const ca = (c.address || {}) as Record<string, string>;
    const sanitized = sanitizeForPublic({
      address: c.address,
      internet_address_display_yn: c.internet_address_display_yn,
    });
    return {
      listing_id: c.listing_id,
      address: sanitized.address || `${ca.streetNumber || ''} ${ca.streetName || ''}`.trim(),
      unit: ca.unitNumber || null,
      price: Number(c.list_price),
      status: c.status,
      property_type: c.property_type,
      bedrooms: c.bedrooms_total,
      bathrooms: c.bathrooms_full,
      living_area: c.living_area ? Number(c.living_area) : null,
      days_on_market: c.days_on_market,
      listing_type: c.listing_type,
    };
  };

  return NextResponse.json({
    building: {
      address: `${streetNumber} ${streetName}`.trim(),
      count: inBuilding.length,
      listings: inBuilding.map(serializeComp),
    },
    area: {
      neighborhood,
      count: areaComps.length,
      listings: areaComps.map(serializeComp),
    },
    subject: {
      listing_id: listing.listing_id,
      price: listPrice,
      property_type: propertyType,
      bedrooms,
    },
  });
}
