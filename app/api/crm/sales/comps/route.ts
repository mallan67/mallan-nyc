/**
 * GET /api/crm/sales/comps?listing_id=X
 *
 * Fetch building + area comps for a listing from Trestle.
 * Uses the listing's comp_criteria (agent-adjustable) or auto-generates defaults.
 * Requires agent/broker auth.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { fetchComps, buildDefaultCriteria } from "@/lib/comps";
import type { CompCriteria } from "@/lib/comps";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const listingId = req.nextUrl.searchParams.get("listing_id");
  if (!listingId) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }

  // Fetch listing with specs needed for comps
  const listing = await prisma.listing.findUnique({
    where: { listing_id: listingId },
    select: {
      listing_id: true,
      bedrooms_total: true,
      bathrooms_full: true,
      bathrooms_half: true,
      living_area: true,
      list_price: true,
      neighborhood: true,
      borough: true,
      postal_code: true,
      property_type: true,
      address: true,
      comp_criteria: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Parse address JSON for building identification
  const addr = (listing.address || {}) as Record<string, string>;
  const buildingName = addr.BuildingName || addr.building_name || null;
  const streetNumber = addr.StreetNumber || addr.street_number || null;
  const streetName = addr.StreetName || addr.street_name || null;

  // Use stored criteria or generate defaults
  const beds = listing.bedrooms_total ?? 0;
  const baths = (listing.bathrooms_full ?? 0) + Math.round((listing.bathrooms_half ?? 0) * 0.5);
  const sqft = listing.living_area ? Number(listing.living_area) : null;
  const price = Number(listing.list_price);

  let criteria: CompCriteria;
  if (listing.comp_criteria && typeof listing.comp_criteria === "object") {
    criteria = listing.comp_criteria as unknown as CompCriteria;
  } else {
    criteria = buildDefaultCriteria({
      beds,
      baths,
      sqft,
      list_price: price,
      neighborhood: listing.neighborhood,
      building_name: buildingName,
    });
    // Store defaults on first fetch so agent can see/edit them
    await prisma.listing.update({
      where: { listing_id: listingId },
      data: { comp_criteria: JSON.parse(JSON.stringify(criteria)) as Prisma.InputJsonValue },
    });
  }

  const results = await fetchComps(
    {
      listing_id: listing.listing_id,
      building_name: buildingName,
      street_number: streetNumber,
      street_name: streetName,
      neighborhood: listing.neighborhood,
      borough: listing.borough,
      postal_code: listing.postal_code,
      property_type: listing.property_type,
    },
    criteria,
  );

  return NextResponse.json({
    ...results,
    listing_specs: { beds, baths, sqft, price },
    sqft_note: !sqft ? "No sqft on file — comps matched by beds/baths/price only" : null,
  });
}
