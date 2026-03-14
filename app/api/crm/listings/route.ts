// /api/crm/listings
// GET: Returns listings with ownership enforcement.
// POST: Create a new listing (runs compliance validation + RLS enforcement gate).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateListing } from "@/lib/compliance/rebny-validator";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import { classifyRlsEligibility } from "@/lib/compliance/rls-eligibility";
import { normalizePayload, derivePermissionBooleans, buildPersistenceRecord } from "@/lib/compliance/normalizer";
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
        rls_eligible: true,
        commercial_sub_type: true,
        commercial_ownership: true,
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
 * Uses MAX(listing_id) + 1 inside a transaction to prevent race conditions.
 * Must be called inside a Prisma interactive transaction (tx).
 */
async function generateListingId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  listingType: string
): Promise<string> {
  const prefix = listingType === "rent" ? "RL" : "SL";
  const pattern = `${prefix}-%`;

  // Atomically find the highest existing sequence number for this prefix.
  // Advisory lock (pg_advisory_xact_lock) prevents concurrent transactions
  // from reading the same MAX and generating duplicate IDs.
  const lockId = prefix === "RL" ? 200001 : 200002;
  await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${lockId})`);

  const result = await tx.$queryRawUnsafe<{ max_seq: number | null }[]>(
    `SELECT MAX(CAST(SUBSTRING(listing_id FROM '${prefix}-(\\d+)') AS INTEGER)) AS max_seq
     FROM listings WHERE listing_id LIKE $1`,
    pattern
  );

  const nextSeq = ((result[0]?.max_seq ?? 0) + 1).toString().padStart(4, "0");
  return `${prefix}-${nextSeq}`;
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

  // Classify RLS eligibility using UCBA mixed-use model (Art. I, Sec. 5(F))
  // Mixed-use in ≤5 unit buildings → RLS-eligible; >5 units or pure commercial → website-only
  const eligibility = classifyRlsEligibility(body, {
    explicitOptOut: body.rls_eligible === false,
    commercialSubType: body.commercial_sub_type as string | undefined,
    commercialOwnership: body.commercial_ownership as string | undefined,
  });
  const rlsEligible = eligibility.rlsEligible;

  // Run REBNY RLS compliance validation (only for RLS-eligible listings)
  let validation: { valid: boolean; errors: string[]; warnings: string[]; suggestions: string[]; compliance: unknown } = {
    valid: true, errors: [], warnings: [], suggestions: [], compliance: {},
  };
  if (rlsEligible) {
    validation = validateListing(body);
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
    const enforcement = assertRlsCompliantPayload(body, {
      listingType: listingType as "sale" | "rent",
      isNewDevelopment: body.NewDevelopmentYN === true,
      currentStatus: (body.MlsStatus as string) || undefined,
      rlsEligible,
      mixedUseSmallBuilding: eligibility.mixedUseSmallBuilding,
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

    // D9: Coming Soon is one-time per address — cannot re-use for same property
    if (body.MlsStatus === "ComingSoon" && body.StreetName) {
      const priorComingSoon = await prisma.listing.findFirst({
        where: {
          postal_code: (body.PostalCode as string) || undefined,
          status: { in: ["Active", "Withdrawn", "Expired", "Sold", "Rented", "Cancelled"] },
          raw_data: {
            path: ["_wasComingSoon"],
            equals: true,
          },
          address: {
            path: ["StreetName"],
            equals: body.StreetName as string,
          },
        },
        select: { id: true, listing_id: true },
      });
      if (priorComingSoon) {
        return NextResponse.json(
          {
            error: "Coming Soon status has already been used for this address (UCBA D9). Each address may only use Coming Soon once.",
            prior_listing_id: priorComingSoon.listing_id,
          },
          { status: 422 }
        );
      }
    }
  }

  // ─── Normalize payload via authority table ─────────────────────────
  // 1. Strip removed fields (NAR Settlement)
  // 2. Rename aliases → canonical RLS field names
  // 3. Normalize enum values
  // 4. Apply defaults (IDXEntireListingDisplayYN, SyndicateYN)
  const { normalized, stripped } = normalizePayload(body);

  // Derive permission booleans from Permissions string
  // (forms send "OwnerOptOut"/"Private"/"RLS-Owner-OptOut"/etc. — normalizer resolves)
  const permBools = derivePermissionBooleans(normalized.Permissions);

  // Route normalized fields to structured DB buckets via persistenceMap
  const persistence = buildPersistenceRecord(normalized);

  const compliance: Record<string, unknown> = {
    validation_result: validation.compliance,
    validated_at: new Date().toISOString(),
    warnings: validation.warnings,
    stripped_fields: stripped, // Track which removed fields were stripped
    rls_eligibility: {
      eligible: eligibility.rlsEligible,
      reason: eligibility.reason,
      ucbaRef: eligibility.ucbaRef,
      mixedUseSmallBuilding: eligibility.mixedUseSmallBuilding,
    },
  };

  const now = new Date();
  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  // Wrap listing create + ID generation + audit log in a single transaction.
  // Advisory lock inside generateListingId prevents duplicate listing IDs.
  // If any step fails, the entire transaction rolls back.
  const result = await prisma.$transaction(async (tx) => {
    const listingId = await generateListingId(tx, listingType);

    const listing = await tx.listing.create({
      data: {
        listing_id: listingId,
        mls_id: (normalized.mls_id as string) ?? null,
        agent_id: auth.userId,
        status: STATUS_INITIAL,
        listing_type: listingType,
        // Top-level columns derived from persistenceMap
        property_type: (persistence.topLevel.property_type as string) ?? null,
        property_sub_type: (persistence.topLevel.property_sub_type as string) ?? null,
        list_price: persistence.topLevel.list_price ? Number(persistence.topLevel.list_price) : 0,
        bedrooms_total: persistence.topLevel.bedrooms_total ? Number(persistence.topLevel.bedrooms_total) : null,
        bathrooms_full: persistence.topLevel.bathrooms_full ? Number(persistence.topLevel.bathrooms_full) : null,
        bathrooms_half: persistence.topLevel.bathrooms_half ? Number(persistence.topLevel.bathrooms_half) : null,
        living_area: persistence.topLevel.living_area ? Number(persistence.topLevel.living_area) : null,
        // CityRegion → borough (normalizer already resolved Borough→CityRegion alias)
        borough: (persistence.topLevel.borough as string) ?? null,
        // SubdivisionName → neighborhood (normalizer already resolved Neighborhood→SubdivisionName alias)
        neighborhood: (persistence.topLevel.neighborhood as string) ?? null,
        city: (persistence.topLevel.city as string) ?? null,
        postal_code: (persistence.topLevel.postal_code as string) ?? null,
        rls_eligible: rlsEligible,
        commercial_sub_type: (body.commercial_sub_type as string) ?? null,
        commercial_ownership: (body.commercial_ownership as string) ?? null,
        // Distribution gates from persistenceMap
        idx_display_yn: rlsEligible ? (persistence.topLevel.idx_display_yn !== false) : false,
        internet_entire_listing_display_yn: persistence.topLevel.internet_entire_listing_display_yn !== false,
        internet_address_display_yn: persistence.topLevel.internet_address_display_yn !== false,
        // Permission booleans derived from Permissions enum (not hardcoded from body)
        participant_only: permBools.participant_only,
        owner_opt_out: permBools.owner_opt_out,
        // Structured JSONB buckets from persistenceMap routing
        address: persistence.address as Prisma.InputJsonValue,
        features: persistence.features as Prisma.InputJsonValue,
        media: (body.media as Prisma.InputJsonValue) ?? [],
        compliance: compliance as Prisma.InputJsonValue,
        agent_info: persistence.agentInfo as Prisma.InputJsonValue,
        // raw_data stores the full normalized payload (removed fields already stripped)
        raw_data: persistence.raw_data as Prisma.InputJsonValue,
        modification_timestamp: now,
        listing_contract_date: persistence.topLevel.listing_contract_date
          ? new Date(persistence.topLevel.listing_contract_date as string)
          : null,
      },
    });

    // Audit log inside same transaction — either both commit or both roll back
    await tx.auditEvent.create({
      data: {
        action: "create",
        entity_type: "listing",
        entity_id: listing.id.toString(),
        user_type: auth.userType,
        user_id: auth.userId,
        changes: { listing_id: listingId, listing_type: listingType } as Prisma.InputJsonValue,
        ip_address: ipAddress ?? null,
      },
    });

    return { id: listing.id.toString(), listingId };
  });

  return NextResponse.json(
    {
      id: result.id,
      listing_id: result.listingId,
      status: STATUS_INITIAL,
      warnings: validation.warnings,
      suggestions: validation.suggestions,
    },
    { status: 201 }
  );
}
