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
import { classifyRlsEligibility } from "@/lib/compliance/rls-eligibility";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sanitizeForCRM } from "@/lib/compliance/dto";
import { derivePermissionBooleans } from "@/lib/compliance/normalizer";
import { coerceStrictBool } from "@/lib/compliance/gates";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
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

  // CRM sanitization: strips removed compensation fields, serializes BigInt
  const sanitized = sanitizeForCRM({
    ...listing,
    id: listing.id.toString(),
    agent_id: listing.agent_id?.toString() ?? null,
    list_price: listing.list_price.toString(),
    living_area: listing.living_area?.toString() ?? null,
  });

  return NextResponse.json(sanitized);
}

/**
 * PATCH /api/crm/listings/[id]
 * Update a listing. Re-runs compliance validation on the merged data.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
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

  // Re-classify RLS eligibility on update (unit count or property type may have changed)
  // InHouse listings are website-only — not on RLS.
  const isInHouse = merged.saleListingType === "InHouse" || merged.listingAgreement === "InHouse";
  const eligibility = classifyRlsEligibility(merged, {
    explicitOptOut: body.rls_eligible === false || (!body.rls_eligible && !listing.rls_eligible) || isInHouse,
    commercialSubType: (body.commercial_sub_type as string) || (listing.commercial_sub_type as string | null) || undefined,
    commercialOwnership: (body.commercial_ownership as string) || (listing.commercial_ownership as string | null) || undefined,
  });
  const effectiveRlsEligible = eligibility.rlsEligible;

  // RLS Enforcement Gate — same gate as POST (create)
  const enforcement = assertRlsCompliantPayload(merged, {
    listingType: (listing.listing_type as "sale" | "rent") ?? "sale",
    isNewDevelopment: merged.NewDevelopmentYN === true,
    currentStatus: (merged.MlsStatus as string) || listing.status || undefined,
    previousStatus: listing.status || undefined,
    existingActivationDate: existingRaw.ActivationDate as string | undefined, // D12 immutability
    rlsEligible: effectiveRlsEligible,
    mixedUseSmallBuilding: eligibility.mixedUseSmallBuilding,
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

  // Update rls_eligible if classification changed (e.g., unit count or property type updated)
  if (effectiveRlsEligible !== listing.rls_eligible) {
    update.rls_eligible = effectiveRlsEligible;
    // If reclassified as website-only, disable IDX distribution
    if (!effectiveRlsEligible) {
      update.idx_display_yn = false;
    }
  }

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
  // Distribution gates — all use canonical RESO/RLS field names (YN suffix).
  //
  // 2026-04-28 fail-closed correction: previous pattern was `body.X !== false`
  // which coerced null/string-"false"/garbage to true (fail-OPEN). Use
  // coerceStrictBool() so only literal true / "true" / "TRUE" stores as true;
  // anything else (including null, "false", typos, malformed JSON) stores as
  // false. This matches the compliance gate doctrine in lib/compliance/gates.ts.
  if (body.IDXEntireListingDisplayYN !== undefined) {
    // H1 fix (2026-05-13) + amend: close the secondary-writer §2.05 gap with
    // canonical-status normalization. An agent editing a listing whose
    // effective status is terminal MUST NOT be able to set
    // `idx_display_yn=true`. Effective status = the merged update's
    // MlsStatus if the body changes it, else the existing listing's status
    // — identical to the resolution the RLS enforcement gate already uses
    // at line 112 above (`merged.MlsStatus || listing.status`).
    //
    // Normalization here covers the case where an agent's client lowercases
    // the status before submitting (`merged.MlsStatus === "closed"`); the
    // pre-amend guard treated that as non-terminal and let display through.
    // After normalization the guard sees the canonical "Closed" and refuses.
    // Reuses the C2 canonical TERMINAL_STATUSES set so writer and cron stay
    // aligned (lib/idx/trestle-mapper.ts is the source of truth).
    //
    // Phase A Codex fix (2026-05-20): also AND-in `effectiveRlsEligible` so a
    // commercial / website-only listing (`rls_eligible=false`) cannot have
    // its idx_display_yn flipped true by the body's IDXEntireListingDisplayYN
    // input. Matches the CRM POST guard at
    // app/api/crm/listings/route.ts:340-343 (`rlsEligible && ...`). Before
    // this fix, if a listing was already `rls_eligible=false` AND the body
    // did not change rls_eligible (so the block at line 140-145 didn't
    // override), the body's IDXEntireListingDisplayYN: true would have
    // bypassed the rls_eligible guard.
    const effectiveStatus = normalizeStandardStatus(
      (merged.MlsStatus as string | undefined) ?? listing.status,
    );
    update.idx_display_yn =
      effectiveRlsEligible &&
      !TERMINAL_STATUSES.has(effectiveStatus) &&
      coerceStrictBool(body.IDXEntireListingDisplayYN);
  }
  if (body.InternetEntireListingDisplayYN !== undefined) update.internet_entire_listing_display_yn = coerceStrictBool(body.InternetEntireListingDisplayYN);
  if (body.InternetAddressDisplayYN !== undefined) update.internet_address_display_yn = coerceStrictBool(body.InternetAddressDisplayYN);
  // Auction (UCBA Art. I exception) — same direct-write pattern as POST.
  // Form sends auction_yn / auction_type / auction_start_date / auction_end_date / auction_terms_url
  // post-validator. AuctionBanner reads from these columns; without this
  // mapping the data would land in raw_data only and the banner would never
  // render even when the validator gates green.
  if (body.auction_yn !== undefined) {
    update.auction_yn =
      body.auction_yn === true || body.auction_yn === "true"
        ? true
        : body.auction_yn === false || body.auction_yn === "false"
          ? false
          : null;
  }
  if (body.auction_type !== undefined) {
    update.auction_type =
      typeof body.auction_type === "string" && body.auction_type.length > 0
        ? body.auction_type
        : null;
  }
  if (body.auction_start_date !== undefined) {
    update.auction_start_date =
      typeof body.auction_start_date === "string" && body.auction_start_date.length > 0
        ? new Date(body.auction_start_date)
        : null;
  }
  if (body.auction_end_date !== undefined) {
    update.auction_end_date =
      typeof body.auction_end_date === "string" && body.auction_end_date.length > 0
        ? new Date(body.auction_end_date)
        : null;
  }
  if (body.auction_terms_url !== undefined) {
    update.auction_terms_url =
      typeof body.auction_terms_url === "string" && body.auction_terms_url.length > 0
        ? body.auction_terms_url
        : null;
  }
  // ParticipantOnly + OwnerOptOut: derive from Permissions enum (same as POST route),
  // or accept the canonical RESO field names ParticipantOnlyYN / OwnerOptOutYN as fallback.
  if (body.Permissions !== undefined) {
    const permBools = derivePermissionBooleans(body.Permissions);
    update.participant_only = permBools.participant_only;
    update.owner_opt_out = permBools.owner_opt_out;
  } else {
    if (body.ParticipantOnlyYN !== undefined) update.participant_only = body.ParticipantOnlyYN === true;
    if (body.OwnerOptOutYN !== undefined) update.owner_opt_out = body.OwnerOptOutYN === true;
  }

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

  // Update compliance with latest validation + eligibility classification
  update.compliance = {
    validation_result: validation.compliance,
    validated_at: new Date().toISOString(),
    warnings: validation.warnings,
    valid: validation.valid,
    rls_eligibility: {
      eligible: eligibility.rlsEligible,
      reason: eligibility.reason,
      ucbaRef: eligibility.ucbaRef,
      mixedUseSmallBuilding: eligibility.mixedUseSmallBuilding,
    },
  } as unknown as Prisma.InputJsonValue;

  // Store full merged data as raw_data
  update.raw_data = merged as Prisma.InputJsonValue;

  if (body.media !== undefined) update.media = body.media as Prisma.InputJsonValue;

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: update,
  });

  // Phase A W3 — dual-write the listing_search_projection so any reader
  // (including the PR 5B-future projection reader) sees the updated row
  // immediately. CRM PATCH can change `list_price`, address fields,
  // `idx_display_yn` (via IDXEntireListingDisplayYN guard above),
  // `rls_eligible`, status, and other projection-mirrored columns; without
  // this dual-write the projection would lag until the next idx-sync run
  // (Trestle path only) or the data-retention cron (terminal rows only).
  //
  // See docs/idx/post-reconciliation-tightening-audit-2026-05-20.md W3 for
  // the gap analysis. Failure logged to AuditEvent + does NOT block the
  // agent's edit (matches per-row-failure semantics of lib/idx/sync.ts).
  try {
    await dualWriteProjectionForListingId(prisma, updated.listing_id);
  } catch (err) {
    await prisma.auditEvent.create({
      data: {
        action: "projection_dual_write_failed",
        entity_type: "listing",
        entity_id: updated.id.toString(),
        user_type: auth.userType,
        user_id: auth.userId,
        changes: {
          source: "crm_listing_patch",
          listing_id: updated.listing_id,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    }).catch(() => { /* swallow — don't fail user edit on a logging failure */ });
  }

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
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
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
