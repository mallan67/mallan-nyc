// /api/crm/listings
// GET: Returns listings with ownership enforcement.
// POST: Create a new listing (runs compliance validation + RLS enforcement gate).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateListing } from "@/lib/compliance/rebny-validator";
import { assertRlsCompliantPayload, scanRecordForFairHousing } from "@/lib/compliance/rls-enforcement";
import { classifyRlsEligibility } from "@/lib/compliance/rls-eligibility";
import { normalizePayload, derivePermissionBooleans, buildPersistenceRecord } from "@/lib/compliance/normalizer";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { AGENT_TYPED_SELECT } from "@/lib/listings/agent-info-resolver";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { buildListingUrls } from "@/lib/crm/listing-urls";
import { buildPublishContract } from "@/lib/crm/listing-publish-contract";
import { applyServerFormMapping } from "@/lib/crm/listing-form-mapping";
import { buildExclusiveAgentAssignment } from "@/lib/listings/exclusive-agent-assignment";
import { composeDbPublicMedia } from "@/lib/media/db-media-composition";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type"); // "sale" | "rent"
  const status = searchParams.get("status");
  // PR-CRM.4 (2026-05-24) — clamp limit to [1, 200] to prevent bulk
  // extraction (NY SHIELD Act concern surfaced by the 2026-05-24 CRM
  // Backbone Audit §8 finding #4). Prior cap was 200 but had no
  // min-guard / NaN-guard: `?limit=` (empty) or `?limit=abc` would
  // have made `parseInt` return NaN, propagating through Math.min to
  // Prisma and failing unpredictably. Default 50 preserved.
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Build where clause with ownership enforcement.
  // CRM My Listings shows: (1) CRM-created listings (no mls_id — SL-/RL- prefix),
  // and (2) closed/terminal Trestle-synced deals. Active/Pending Trestle listings
  // are managed via REBNY RLS directly, not through the CRM.
  const TRESTLE_CLOSED = ["Closed", "Sold", "Leased", "Rented"];
  const CRM_HIDDEN = ["Withdrawn", "Cancelled"];
  const crmCreated = { mls_id: null, listing_id: { startsWith: "SL-" }, status: { notIn: CRM_HIDDEN } };
  const crmCreatedRental = { mls_id: null, listing_id: { startsWith: "RL-" }, status: { notIn: CRM_HIDDEN } };
  const trestleClosed = { mls_id: { not: null }, status: { in: TRESTLE_CLOSED } };

  const where: Record<string, unknown> = {
    OR: [crmCreated, crmCreatedRental, trestleClosed],
  };

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
        mls_id: true,
        agent_id: true,
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
        // Legacy `Listing.media` JSON — the composer's fallback input only.
        // Never serialized raw (see the media composition below).
        media: true,
        // Canonical media rows. Same column shape /api/listings selects
        // (app/api/listings/route.ts:396-414): active-only, ordered by
        // (order, id) so the resolver receives a stable input. This WIDENS the
        // existing findMany — no second round trip, no N+1.
        listing_media: {
          where: { status: "active" },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            // media_key: MIXED-GALLERY COMPOSITION — an all-`crm:` set is a
            // SUPPLEMENT to the feed JSON, not the whole gallery
            // (lib/media/listing-media-resolver.ts:748-765).
            media_key: true,
            media_url_original: true,
            media_url_cached: true,
            media_type: true,
            media_category: true,
            media_classification: true,
            order: true,
            preferred_photo_yn: true,
            status: true,
          },
        },
        // ALL-STATUS existence signal. The select above is ACTIVE-only, so
        // `listing_media.length` would read an all-deleted listing as "never
        // imported" and RESURRECT deleted media out of the legacy JSON
        // (lib/media/db-media-composition.ts:55-67). This grid is dominated by
        // SL-/RL- Mallan exclusives — exactly the ownership class whose
        // deletions are authoritative — so the signal is load-bearing here.
        _count: { select: { listing_media: true } },
        // Phase B: typed agent columns so the CRM grid hydrates attribution TYPED-FIRST
        // (authenticated surface — PII columns allowed here per spec §4).
        ...AGENT_TYPED_SELECT,
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
        cumulative_days_on_market: true,
        expiration_date: true,
        sync_status: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.listing.count({ where }),
  ]);

  // Serialize BigInt ids to strings + compose canonical media.
  //
  // `media` was previously the raw legacy `Listing.media` JSON. Both CRM grid
  // consumers read it positionally — `media[0].MediaURL || media[0].url`
  // (public/crm/js/manage/manage-listings.js:56-58) and `media.length`
  // (public/crm/js/core/data-loader.js:221,259) — so an arbitrarily ordered
  // provider array could put a floor plan or a `/DOCUMENT-Pdf/` document in the
  // grid's photo slot, and the relational `listing_media` rows (canonical since
  // PR 4) were not consulted at all.
  //
  // `media` now carries the composed gallery: relational rows first with the
  // legacy JSON as the resolver's own gated fallback, sorted photo-first,
  // deduped, each URL proxied exactly once. The KEY NAME and its array type are
  // unchanged, and each item still exposes `url`, so the existing
  // `media[0].MediaURL || media[0].url` read resolves to the photo-first hero
  // rather than whatever the provider happened to list first.
  //
  // `listing_media` and `_count` are query inputs, not response fields — they
  // are destructured out so the response contract stays exactly as it was.
  const serialized = listings.map((l) => {
    const { listing_media, _count, ...rest } = l;
    const { media } = composeDbPublicMedia({
      listingId: l.listing_id,
      rlsEligible: l.rls_eligible,
      tableRows: listing_media,
      legacyMedia: Array.isArray(l.media) ? l.media : [],
      // ALL-STATUS count, never `listing_media.length` (active-only select).
      hadRelationalRows:
        typeof _count?.listing_media === "number" ? _count.listing_media > 0 : undefined,
    });
    return {
      ...rest,
      id: l.id.toString(),
      agent_id: l.agent_id?.toString() ?? null,
      assigned_agent_id: l.agent_id?.toString() ?? null,
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
      media,
    };
  });

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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

  // Use BIGINT to avoid integer overflow on timestamp-style IDs (SL-1779...).
  // Filter to sequential IDs only (suffix <= 999999) — timestamp IDs are
  // legacy from Date.now() fallbacks and must not pollute the sequence.
  const regexPattern = `${prefix}-(\\d+)`;
  const result = await tx.$queryRaw<{ max_seq: bigint | null }[]>`
    SELECT MAX(CAST(SUBSTRING(listing_id FROM ${regexPattern}) AS BIGINT)) AS max_seq
    FROM listings
    WHERE listing_id LIKE ${pattern}
      AND LENGTH(SUBSTRING(listing_id FROM ${regexPattern})) <= 6`;

  const maxSeq = result[0]?.max_seq ? Number(result[0].max_seq) : 0;
  const nextSeq = (maxSeq + 1).toString().padStart(4, "0");
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

  // Outer try/catch — normalizePayload, buildPersistenceRecord, etc. can throw
  // outside the inner Prisma transaction catch. Without this, any error in
  // payload processing returns a bare 500 with no JSON body.
  try {

  const listingType = (body.listing_type as string) || "sale";
  if (!["sale", "rent"].includes(listingType)) {
    return NextResponse.json(
      { error: "listing_type must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  // SERVER-OWNED conversion (Packet 2 closure): MlsStatus / PropertyType / PropertySubType /
  // CommonInterest are derived here from the Mallan form keys (saleStatus, salePropertyType,
  // saleOfficeRetailOwnership, …); client-supplied provider values are validated against the live
  // Cotality enums when no form key is present. Unknown values are refused, never defaulted.
  const formMapping = applyServerFormMapping(body, listingType as "sale" | "rent");
  if (formMapping.errors.length > 0) {
    return NextResponse.json(
      { error: "Listing form values could not be converted to the stored vocabulary", code: "form_mapping", details: formMapping.errors },
      { status: 422 }
    );
  }
  body = formMapping.body;

  // Classify RLS eligibility using UCBA mixed-use model (Art. I, Sec. 5(F))
  // Mixed-use in ≤5 unit buildings → RLS-eligible; >5 units or pure commercial → website-only
  // InHouse listings are website-only by definition — not on RLS.
  const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
  const isInHouse =
    inHouseValues.includes(String(body.saleListingType || "")) ||
    inHouseValues.includes(String(body.listingAgreement || ""));
  const eligibility = classifyRlsEligibility(body, {
    explicitOptOut: body.rls_eligible === false || isInHouse,
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

  // Fair Housing applies to ALL advertising, regardless of RLS eligibility (Federal FHA, NY State
  // HRL, NYC HRL Title 8, NYC Fair Chance for Housing Act). The RLS enforcement gate above runs only
  // for rls_eligible listings, so commercial / website-only / InHouse creates would otherwise SKIP
  // the content scan entirely — a real NYC HRL advertising-law exposure. Scan the NORMALIZED remarks
  // (so accepted aliases like `description`→PublicRemarks / `privateRemarks`→PrivateRemarks are
  // resolved first — scanning raw fields here would let an aliased payload bypass the gate) on EVERY
  // create, before any persistence. (RLS-eligible listings are also scanned inside
  // assertRlsCompliantPayload; the duplicate is harmless defense-in-depth.)
  const fhRecord: Record<string, string | null | undefined> = {
    PublicRemarks: normalized.PublicRemarks as string | null | undefined,
    ShowingInstructions: normalized.ShowingInstructions as string | null | undefined,
    PrivateRemarks: normalized.PrivateRemarks as string | null | undefined,
    SyndicationRemarks: normalized.SyndicationRemarks as string | null | undefined,
  };
  // Also scan any RAW free-text field the normalizer does not canonicalize but which still persists
  // (verbatim in raw_data) — the CRM forms POST camelCase remark fields like `agentRemarks`,
  // `showingInstructions`, `webHeadline` that normalizePayload's aliasToCanonical does not map
  // (only `description`/`privateRemarks` are aliased). Key on the field NAME so structured enums
  // (property_sub_type, status, etc.) are NOT scanned and legit values like an "Active Adult"
  // property type don't false-positive (Codex #460).
  const FREE_TEXT_KEY = /(remark|description|instruction|headline|comment|note|caption)/i;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && FREE_TEXT_KEY.test(key)) {
      fhRecord[`raw:${key}`] = value;
    }
  }
  const fhViolations = scanRecordForFairHousing(fhRecord);
  if (fhViolations.length > 0) {
    return NextResponse.json(
      { error: "Listing blocked by Fair Housing content gate", blockers: fhViolations },
      { status: 422 }
    );
  }

  // Derive permission booleans from Permissions string
  // (forms send "OwnerOptOut"/"Private"/"RLS-Owner-OptOut"/etc. — normalizer resolves)
  const permBools = derivePermissionBooleans(normalized.Permission ?? normalized.Permissions);

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

  // Mallan-exclusive agent assignment (Part C2). A CRM-created listing is ALWAYS
  // a Mallan exclusive (SL-/RL- prefix, mls_id null), so the creating agent IS
  // the listing agent. Load that agent's identity so buildExclusiveAgentAssignment
  // can stamp the named agent + "Mallan Real Estate Inc." onto the row — the
  // attribution the public FeaturedListings + listing-detail contact card render
  // (19 NYCRR §175.25 / UCBA Art. III §2(C)). Identity is the AUTHENTICATED agent,
  // never invented; the helper fills only blank agent_info keys (manual wins).
  const assigningAgent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { id: true, full_name: true, first_name: true, last_name: true, email: true, phone: true },
  });

  // Wrap listing create + ID generation + audit log in a single transaction.
  // Advisory lock inside generateListingId prevents duplicate listing IDs.
  // If any step fails, the entire transaction rolls back.
  let result: { id: string; listingId: string };
  try {
  result = await prisma.$transaction(async (tx) => {
    const listingId = await generateListingId(tx, listingType);

    // Stamp the Mallan listing-agent attribution. listingId is SL-/RL- (CRM
    // exclusive) so this is never null; it blank-only-merges over whatever
    // agent keys the form already sent (manual wins) and resolves the two
    // promoted display columns (list_agent_full_name / list_office_name).
    const exclusiveAssignment = assigningAgent
      ? buildExclusiveAgentAssignment(
          assigningAgent,
          { listing_id: listingId, rls_eligible: rlsEligible },
          (persistence.agentInfo as Record<string, unknown>) ?? {},
        )
      : null;

    const listing = await tx.listing.create({
      data: {
        listing_id: listingId,
        mls_id: (normalized.mls_id as string) ?? null,
        agent_id: auth.userId,
        // H1 amend (2026-05-13): normalize the initial status through the
        // canonical helper even though STATUS_INITIAL is a hardcoded literal
        // today. Pattern-uniform with the body-driven writers; if a future
        // refactor lets STATUS_INITIAL come from request input, the same
        // case/whitespace/alias guard applies for free.
        status: normalizeStandardStatus(STATUS_INITIAL),
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
        // Auction (UCBA Art. I exception) — mallan-internal columns,
        // not in persistenceMap. Coerce body values to typed columns so the
        // AuctionBanner + DTO can read from `auction_*` columns directly
        // instead of falling back to raw_data JSON. Validator AU-001..AU-005
        // already enforced auction_type + auction_end_date when auction_yn=true.
        auction_yn:
          body.auction_yn === true || body.auction_yn === "true"
            ? true
            : body.auction_yn === false || body.auction_yn === "false"
              ? false
              : null,
        auction_type: typeof body.auction_type === "string" && body.auction_type.length > 0
          ? body.auction_type
          : null,
        auction_start_date:
          typeof body.auction_start_date === "string" && body.auction_start_date.length > 0
            ? new Date(body.auction_start_date)
            : null,
        auction_end_date:
          typeof body.auction_end_date === "string" && body.auction_end_date.length > 0
            ? new Date(body.auction_end_date)
            : null,
        auction_terms_url: typeof body.auction_terms_url === "string" && body.auction_terms_url.length > 0
          ? body.auction_terms_url
          : null,
        // Distribution gates from persistenceMap.
        //
        // H1 fix (2026-05-13) + amend: defence-in-depth terminal-status
        // guard using the canonical normalizer. STATUS_INITIAL is "Draft"
        // today (non-terminal canonical), so the guard is a no-op at
        // present. But CRM listing creation paths are a known H1 surface —
        // if a future refactor allows the create status to come from the
        // request body, the SAME guard (normalize → check TERMINAL_STATUSES)
        // prevents a terminal listing from being born with
        // idx_display_yn=true. Single source of truth:
        // lib/idx/trestle-mapper.ts exports TERMINAL_STATUSES +
        // normalizeStandardStatus.
        idx_display_yn:
          rlsEligible &&
          !TERMINAL_STATUSES.has(normalizeStandardStatus(STATUS_INITIAL)) &&
          persistence.topLevel.idx_display_yn !== false,
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
        // Phase C: agent_info JSON is no longer persisted. The assigned Mallan
        // listing-agent attribution is written ONLY to the 8 typed columns
        // (list_agent_full_name / list_office_name etc.), derived in-memory from
        // whichever agent_info object the exclusive assignment / form produced.
        // PII exposure stays gated by the read layer.
        ...typedAgentColumnsFromJson(
          (exclusiveAssignment?.agent_info ?? persistence.agentInfo) as Record<string, unknown>,
        ),
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
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    const code = (dbErr as { code?: string })?.code;
    const meta = (dbErr as { meta?: unknown })?.meta;
    console.error('[POST /api/crm/listings] DB error:', JSON.stringify({ code, meta, message: msg }));
    // Map common Prisma codes to user-friendly hints
    let hint = 'Unknown database error';
    if (code === 'P2002') hint = 'Duplicate listing ID — please retry';
    else if (code === 'P2003') hint = 'Invalid agent or office reference';
    else if (code === 'P2000') hint = 'A field value is too long for the database column';
    else if (code === 'P2005' || code === 'P2006') hint = 'Invalid field value type (check price, dates, numbers)';
    else if (code === 'P2025') hint = 'Referenced record not found';
    else if (code) hint = 'Database error (code ' + code + '). Check server logs for detail.';
    else hint = 'Unexpected database error. Check server logs for detail.';
    return NextResponse.json(
      { error: 'Failed to create listing: ' + hint },
      { status: 500 }
    );
  }

  // Phase A W3 — dual-write the listing_search_projection for newly created
  // CRM listings (Mallan exclusives).
  //
  // Closes the W3 gap from
  // docs/idx/post-reconciliation-tightening-audit-2026-05-20.md: before this
  // change, CRM POST only wrote `listings`; the projection row was created
  // lazily by the next `lib/idx/sync.ts` run — but that path only writes
  // Trestle-sourced rows. Mallan exclusives could exist for hours / days
  // with NO projection row until `npm run ops:projection-backfill` ran.
  // After PR 5B reader swap, that gap = Mallan exclusive invisible on
  // /search and any other projection-backed surface.
  //
  // Runs outside the transaction (the helper is its own transaction
  // boundary) so a projection-write failure does not roll back the listing
  // create. The data-retention cron's per-row dual-write at 03:00 UTC
  // (PR #147) and the projection-backfill script remain belt-and-suspenders.
  try {
    await dualWriteProjectionForListingId(prisma, result.listingId);
  } catch (err) {
    await prisma.auditEvent.create({
      data: {
        action: "projection_dual_write_failed",
        entity_type: "listing",
        entity_id: result.id,
        user_type: auth.userType,
        user_id: auth.userId,
        changes: {
          source: "crm_listing_create",
          listing_id: result.listingId,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    }).catch(() => { /* swallow — don't fail listing-create on a logging failure */ });
  }

  // Fetch the created listing to build URLs from its persisted address
  const createdListing = await prisma.listing.findUnique({
    where: { listing_id: result.listingId },
    // `rls_eligible` + `internet_entire_listing_display_yn` are required by the
    // canonical public-address decision (lib/compliance/db-address-decision.ts).
    // Added to THIS existing select — no extra query, no N+1.
    select: {
      listing_id: true,
      status: true,
      address: true,
      rls_eligible: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
    },
  });
  const urls = createdListing
    ? buildListingUrls(createdListing as {
        listing_id: string;
        status: string;
        address: Record<string, unknown> | null;
        rls_eligible?: boolean | null;
        internet_entire_listing_display_yn?: boolean | null;
        internet_address_display_yn?: boolean | null;
      })
    : { publicUrl: null, rebnyListingUrl: null };

  // S-BE-006 — return the full URL + eligibility contract so the form and
  // dashboard can explain Featured / Exclusive availability after publish
  // (not just publicUrl/rebnyListingUrl). A freshly created listing is a Mallan
  // exclusive (CRM-created) but is created as Draft, so it is not yet
  // Featured-eligible until it is published Active.
  const publishContract = buildPublishContract({
    status: STATUS_INITIAL,
    rlsReason: eligibility.reason,
    internetAddressDisplayYN: createdListing?.internet_address_display_yn ?? null,
  });

  return NextResponse.json(
    {
      id: result.id,
      listing_id: result.listingId,
      status: STATUS_INITIAL,
      publicUrl: urls.publicUrl,
      rebnyListingUrl: urls.rebnyListingUrl,
      featuredEligible: publishContract.featuredEligible,
      exclusiveEligible: publishContract.exclusiveEligible,
      eligibilityReason: publishContract.eligibilityReason,
      warnings: validation.warnings,
      suggestions: validation.suggestions,
    },
    { status: 201 }
  );

  } catch (outerErr) {
    const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error('[POST /api/crm/listings] Unhandled error:', msg);
    return NextResponse.json(
      { error: 'Failed to create listing: ' + msg.split('\n')[0].slice(0, 120) },
      { status: 500 }
    );
  }
}
