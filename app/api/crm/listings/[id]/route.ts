// /api/crm/listings/[id]
// GET: Single listing with full detail. PATCH: Update listing. DELETE: Soft-delete (set Withdrawn).
// Ownership enforced: agent can only access their own listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { validateListing } from "@/lib/compliance/rebny-validator";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import type { Prisma } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Resolve a listing by numeric ID or listing_id string.
 */
async function findListing(id: string) {
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
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

  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    ...listing,
    id: listing.id.toString(),
    agent_id: listing.agent_id?.toString() ?? null,
    list_price: listing.list_price.toString(),
    living_area: listing.living_area?.toString() ?? null,
  });
}

/**
 * PATCH /api/crm/listings/[id]
 * Update a listing. Re-runs compliance validation on the merged data.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listing = await findListing(id);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Merge existing raw_data with updates for validation
  const existingRaw = (listing.raw_data as Record<string, unknown>) ?? {};
  const merged = { ...existingRaw, ...body };

  // RLS Enforcement Gate — same gate as POST (create)
  const enforcement = assertRlsCompliantPayload(merged, {
    listingType: (listing.listing_type as "sale" | "rent") ?? "sale",
    isNewDevelopment: merged.NewDevelopmentYN === true,
    currentStatus: (merged.MlsStatus as string) || listing.status || undefined,
    previousStatus: listing.status || undefined,
  });
  if (!enforcement.passed) {
    return NextResponse.json(
      {
        error: "Update blocked by RLS enforcement gate",
        blockers: enforcement.blockers,
        warnings: enforcement.warnings,
      },
      { status: 422 }
    );
  }

  // Re-validate merged data
  const validation = validateListing(merged);

  // Build Prisma update data from known columns
  const update: Prisma.ListingUpdateInput = {
    modification_timestamp: new Date(),
  };

  if (body.PropertyType !== undefined) update.property_type = String(body.PropertyType);
  if (body.PropertySubType !== undefined) update.property_sub_type = String(body.PropertySubType);
  if (body.ListPrice !== undefined) update.list_price = Number(body.ListPrice);
  if (body.BedroomsTotal !== undefined) update.bedrooms_total = Number(body.BedroomsTotal);
  if (body.BathroomsFull !== undefined) update.bathrooms_full = Number(body.BathroomsFull);
  if (body.BathroomsHalf !== undefined) update.bathrooms_half = Number(body.BathroomsHalf);
  if (body.LivingArea !== undefined) update.living_area = Number(body.LivingArea);
  if (body.Borough !== undefined) update.borough = String(body.Borough);
  if (body.Neighborhood !== undefined) update.neighborhood = String(body.Neighborhood);
  if (body.City !== undefined) update.city = String(body.City);
  if (body.PostalCode !== undefined) update.postal_code = String(body.PostalCode);
  if (body.IDXEntireListingDisplayYN !== undefined) update.idx_display_yn = body.IDXEntireListingDisplayYN !== false;
  if (body.InternetEntireListingDisplayYN !== undefined) update.internet_entire_listing_display_yn = body.InternetEntireListingDisplayYN !== false;
  if (body.InternetAddressDisplayYN !== undefined) update.internet_address_display_yn = body.InternetAddressDisplayYN !== false;
  if (body.ParticipantOnly !== undefined) update.participant_only = body.ParticipantOnly === true;
  if (body.OwnerOptOut !== undefined) update.owner_opt_out = body.OwnerOptOut === true;

  // Update JSON columns by merging
  const existingAddress = (listing.address as Record<string, unknown>) ?? {};
  const existingFeatures = (listing.features as Record<string, unknown>) ?? {};
  const existingAgentInfo = (listing.agent_info as Record<string, unknown>) ?? {};

  const addressKeys = [
    "StreetNumber", "StreetName", "StreetSuffix", "UnitNumber",
    "City", "StateOrProvince", "PostalCode", "Borough",
    "Neighborhood", "BuildingName", "UnparsedAddress",
  ];
  const updatedAddress = { ...existingAddress };
  for (const k of addressKeys) {
    if (body[k] !== undefined) updatedAddress[k] = body[k];
  }
  update.address = updatedAddress as Prisma.InputJsonValue;

  const featureKeys = [
    "YearBuilt", "StoriesTotal", "Rooms", "LivingAreaUnits",
    "Flooring", "Heating", "Cooling", "ParkingFeatures",
    "LaundryFeatures", "Appliances", "InteriorFeatures",
    "ExteriorFeatures", "PublicRemarks", "PrivateRemarks",
    "ShowingInstructions", "CommonInterest", "AssociationFee",
    "RealEstateTax", "TaxAnnualAmount", "NewDevelopmentYN",
    "BathroomsTotal",
  ];
  const updatedFeatures = { ...existingFeatures };
  for (const k of featureKeys) {
    if (body[k] !== undefined) updatedFeatures[k] = body[k];
  }
  update.features = updatedFeatures as Prisma.InputJsonValue;

  const agentKeys = [
    "ListAgentKey", "ListAgentMlsId", "ListAgentFullName",
    "ListAgentEmail", "ListAgentDirectPhone",
    "ListOfficeName", "ListOfficeKey", "ListOfficeMlsId",
  ];
  const updatedAgentInfo = { ...existingAgentInfo };
  for (const k of agentKeys) {
    if (body[k] !== undefined) updatedAgentInfo[k] = body[k];
  }
  update.agent_info = updatedAgentInfo as Prisma.InputJsonValue;

  // Update compliance with latest validation
  update.compliance = {
    validation_result: validation.compliance,
    validated_at: new Date().toISOString(),
    warnings: validation.warnings,
    valid: validation.valid,
  } as unknown as Prisma.InputJsonValue;

  // Store full merged data as raw_data
  update.raw_data = merged as Prisma.InputJsonValue;

  if (body.media !== undefined) update.media = body.media as Prisma.InputJsonValue;

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "listing",
    listing.id.toString(),
    auth,
    { fields_updated: Object.keys(body) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    listing_id: updated.listing_id,
    status: updated.status,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  });
}

/**
 * DELETE /api/crm/listings/[id]
 * Soft-delete: sets status to "Withdrawn". Does not remove from database.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listing = await findListing(id);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: "Withdrawn",
      modification_timestamp: new Date(),
    },
  });

  await logAuditEvent(
    "delete",
    "listing",
    listing.id.toString(),
    auth,
    { previous_status: listing.status, new_status: "Withdrawn" },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true, status: "Withdrawn" });
}
