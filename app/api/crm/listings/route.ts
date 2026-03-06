// /api/crm/listings
// GET: Returns listings with ownership enforcement.
// POST: Create a new listing (runs compliance validation + RLS enforcement gate).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateListing } from "@/lib/compliance/rebny-validator";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type"); // "sale" | "rent"
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Build where clause with ownership enforcement
  const where: Record<string, unknown> = {};

  // Ownership: agent sees only their own, broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (type) where.listing_type = type;
  if (status) where.status = status;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        listing_id: true,
        status: true,
        listing_type: true,
        property_type: true,
        property_sub_type: true,
        list_price: true,
        bedrooms_total: true,
        bathrooms_full: true,
        bathrooms_half: true,
        living_area: true,
        borough: true,
        neighborhood: true,
        address: true,
        features: true,
        media: true,
        agent_info: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        listing_contract_date: true,
        status_changed_at: true,
        first_active_date: true,
        days_on_market: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.listing.count({ where }),
  ]);

  // Serialize BigInt ids to strings
  const serialized = listings.map((l) => ({
    ...l,
    id: l.id.toString(),
    list_price: l.list_price.toString(),
    living_area: l.living_area?.toString() ?? null,
  }));

  return NextResponse.json({
    listings: serialized,
    total,
    limit,
    offset,
  });
}

// Valid listing statuses and their allowed transitions
const STATUS_INITIAL = "Draft";

/**
 * Generate a unique listing_id: SL-XXXX for sales, RL-XXXX for rentals.
 */
async function generateListingId(listingType: string): Promise<string> {
  const prefix = listingType === "rent" ? "RL" : "SL";
  const count = await prisma.listing.count({
    where: { listing_id: { startsWith: prefix } },
  });
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${seq}`;
}

/**
 * POST /api/crm/listings
 * Create a new listing. Runs REBNY RLS compliance validation first.
 * Returns the created listing ID + any validation warnings.
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const listingType = (body.listing_type as string) || "sale";
  if (!["sale", "rent"].includes(listingType)) {
    return NextResponse.json(
      { error: "listing_type must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  // Run REBNY RLS compliance validation (existing validator)
  const validation = validateListing(body);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Listing failed compliance validation",
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
          suggestions: validation.suggestions,
          compliance: validation.compliance,
        },
      },
      { status: 422 }
    );
  }

  // RLS Enforcement Gate — hard gate on UCBA/RLS rules for write path
  // This is the backend enforcement layer that ensures compliance on live payloads,
  // not just mockup HTML (addresses the "validator exists ≠ enforcement exists" gap).
  const enforcement = assertRlsCompliantPayload(body, {
    listingType: listingType as "sale" | "rent",
    isNewDevelopment: body.NewDevelopmentYN === true,
    currentStatus: (body.MlsStatus as string) || undefined,
  });
  if (!enforcement.passed) {
    return NextResponse.json(
      {
        error: "Listing blocked by RLS enforcement gate",
        blockers: enforcement.blockers,
        warnings: enforcement.warnings,
      },
      { status: 422 }
    );
  }

  // Generate listing ID
  const listingId = await generateListingId(listingType);

  // Extract structured fields from flat form data
  const address: Record<string, unknown> = {};
  const addressFields = [
    "StreetNumber", "StreetName", "StreetSuffix", "UnitNumber",
    "City", "StateOrProvince", "PostalCode", "Borough",
    "Neighborhood", "BuildingName", "UnparsedAddress",
  ];
  for (const f of addressFields) {
    if (body[f] !== undefined) address[f] = body[f];
  }

  const features: Record<string, unknown> = {};
  const featureFields = [
    "YearBuilt", "StoriesTotal", "Rooms", "LivingAreaUnits",
    "Flooring", "Heating", "Cooling", "ParkingFeatures",
    "LaundryFeatures", "Appliances", "InteriorFeatures",
    "ExteriorFeatures", "Utilities", "WaterSource", "Sewer",
    "FireplaceYN", "FireplacesTotal", "PoolPrivateYN",
    "PatioAndPorchFeatures", "View", "Directions", "GarageYN",
    "GarageSpaces", "ArchitecturalStyle", "ConstructionMaterials",
    "Roof", "Foundation", "LotSizeArea", "LotSizeUnits",
    "CommonInterest", "AssociationFee", "AssociationFeeFrequency",
    "RealEstateTax", "TaxYear", "TaxAnnualAmount",
    "PublicRemarks", "PrivateRemarks", "ShowingInstructions",
    "NewDevelopmentYN", "BathroomsTotal",
  ];
  for (const f of featureFields) {
    if (body[f] !== undefined) features[f] = body[f];
  }

  const compliance: Record<string, unknown> = {
    validation_result: validation.compliance,
    validated_at: new Date().toISOString(),
    warnings: validation.warnings,
  };

  const agentInfo: Record<string, unknown> = {};
  const agentFields = [
    "ListAgentKey", "ListAgentMlsId", "ListAgentFullName",
    "ListAgentEmail", "ListAgentDirectPhone",
    "ListOfficeName", "ListOfficeKey", "ListOfficeMlsId",
  ];
  for (const f of agentFields) {
    if (body[f] !== undefined) agentInfo[f] = body[f];
  }

  const now = new Date();

  const listing = await prisma.listing.create({
    data: {
      listing_id: listingId,
      mls_id: (body.mls_id as string) ?? null,
      agent_id: auth.userId,
      status: STATUS_INITIAL,
      listing_type: listingType,
      property_type: (body.PropertyType as string) ?? null,
      property_sub_type: (body.PropertySubType as string) ?? null,
      list_price: body.ListPrice ? Number(body.ListPrice) : 0,
      bedrooms_total: body.BedroomsTotal ? Number(body.BedroomsTotal) : null,
      bathrooms_full: body.BathroomsFull ? Number(body.BathroomsFull) : null,
      bathrooms_half: body.BathroomsHalf ? Number(body.BathroomsHalf) : null,
      living_area: body.LivingArea ? Number(body.LivingArea) : null,
      borough: (body.Borough as string) ?? (body.City as string) ?? null,
      neighborhood: (body.Neighborhood as string) ?? (body.SubdivisionName as string) ?? null,
      city: (body.City as string) ?? null,
      postal_code: (body.PostalCode as string) ?? null,
      idx_display_yn: body.IDXEntireListingDisplayYN !== false,
      internet_entire_listing_display_yn: body.InternetEntireListingDisplayYN !== false,
      internet_address_display_yn: body.InternetAddressDisplayYN !== false,
      participant_only: body.ParticipantOnly === true,
      owner_opt_out: body.OwnerOptOut === true,
      address: address as Prisma.InputJsonValue,
      features: features as Prisma.InputJsonValue,
      media: (body.media as Prisma.InputJsonValue) ?? [],
      compliance: compliance as Prisma.InputJsonValue,
      agent_info: agentInfo as Prisma.InputJsonValue,
      raw_data: body as Prisma.InputJsonValue,
      modification_timestamp: now,
      listing_contract_date: body.ListingContractDate
        ? new Date(body.ListingContractDate as string)
        : null,
    },
  });

  // Audit log
  await logAuditEvent(
    "create",
    "listing",
    listing.id.toString(),
    auth,
    { listing_id: listingId, listing_type: listingType },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: listing.id.toString(),
      listing_id: listingId,
      status: STATUS_INITIAL,
      warnings: validation.warnings,
      suggestions: validation.suggestions,
    },
    { status: 201 }
  );
}
