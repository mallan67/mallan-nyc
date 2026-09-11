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
import { fetchComps, buildDefaultCriteria, validateCompCriteria, compTransactionOf, isCompCriteriaError } from "@/lib/comps";
import type { CompCriteria } from "@/lib/comps";
import { transactionTypeFromProvider } from "@/lib/listings/canonical-lifecycle";
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
      listing_type: true,
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
      features: true,
      raw_data: true,
      comp_criteria: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // ── The subject transaction, agreed by BOTH facts ────────────────────────────────────────────────────────
  // The live PropertyType is the provider transaction (Residential... = sale, *Lease = rental); listing_type is
  // the Mallan transaction. A comp set is assembled only when they agree - a subject stored as a rental whose
  // PropertyType is a sale is a data fault, not a search to widen (Maya, 2026-09-09: sale and rental never mix).
  const providerTransaction = transactionTypeFromProvider(listing.property_type);
  if (!providerTransaction) {
    return NextResponse.json({
      error: `Listing ${listingId} has no comparable transaction: PropertyType ${listing.property_type ?? "(none)"} is neither a sale nor a rental`,
      code: "COMP_TRANSACTION_UNKNOWN",
    }, { status: 400 });
  }
  const storedTransaction = compTransactionOf(listing.listing_type);
  if (storedTransaction && storedTransaction !== providerTransaction) {
    return NextResponse.json({
      error: `Listing ${listingId} transaction mismatch: listing_type ${String(listing.listing_type)} but PropertyType ${String(listing.property_type)}`,
      code: "COMP_TRANSACTION_MISMATCH",
    }, { status: 400 });
  }
  const transaction = providerTransaction;

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
    // Stored criteria are validated against THIS transaction before anything reaches OData: rows written
    // before the token correction hold display names ("Under Contract") that are not a live StandardStatus
    // member and would have been passed straight into the provider filter. Refuse, naming the value.
    try {
      criteria = validateCompCriteria(listing.comp_criteria as unknown as CompCriteria, transaction);
    } catch (err) {
      if (isCompCriteriaError(err)) {
        return NextResponse.json({ error: err.message, code: err.code, value: err.value, scope: err.scope, transaction }, { status: 400 });
      }
      throw err;
    }
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

  let results;
  try {
    results = await fetchComps(
    {
      listing_id: listing.listing_id,
      building_name: buildingName,
      street_number: streetNumber,
      street_name: streetName,
      neighborhood: listing.neighborhood,
      borough: listing.borough,
      postal_code: listing.postal_code,
      property_type: listing.property_type,
      // The subject's ownership class segments its comps — co-op comps for a co-op (read by the canonical
      // ownership interpreter from the row's buckets; this route touches no provider name).
      subject: { features: listing.features, raw_data: listing.raw_data },
    },
    criteria,
    );
  } catch (err) {
    if (isCompCriteriaError(err)) {
      return NextResponse.json({ error: err.message, code: err.code, value: err.value, scope: err.scope, transaction }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({
    ...results,
    transaction,
    listing_specs: { beds, baths, sqft, price },
    sqft_note: !sqft ? "No sqft on file — comps matched by beds/baths/price only" : null,
  });
}
