// /api/portal/comparables — Comparables for seller's listing
// Returns comparable listings in the same building + neighborhood
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access required" }, { status: 403 });
  }

  const listingId = req.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  // Find the seller's listing
  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const addr = (listing.address || {}) as Record<string, string>;
  const neighborhood = listing.neighborhood || "";
  const borough = listing.borough || "";
  const listPrice = Number(listing.list_price) || 0;
  const propertyType = listing.property_type || "";
  const bedrooms = listing.bedrooms_total || 0;

  // Find comparables in same building (same street address)
  const buildingComps = await prisma.listing.findMany({
    where: {
      id: { not: listing.id },
      neighborhood,
      borough,
      status: { in: ["Active", "Closed", "Sold", "Leased"] },
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
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
