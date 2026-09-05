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
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { buildListingUrls } from "@/lib/crm/listing-urls";
import { checkFeeDisclosure, isDisplayReadyStatus } from "@/lib/crm/fee-disclosure";
import { buildExclusiveAgentAssignment } from "@/lib/listings/exclusive-agent-assignment";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";
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

  // READ: history/association visibility. A synced row (return-copy or
  // third-party) stays internally READABLE for reconciliation and audit — that
  // is exactly what `agent_id` legitimately records. Mutation is gated
  // separately in PATCH/DELETE below.
  if (!listingCapabilities(auth, listing).mayViewHistory) {
    return NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 });
  }

  // CRM sanitization: strips removed compensation fields, serializes BigInt
  const sanitized = sanitizeForCRM({
    ...listing,
    id: listing.id.toString(),
    agent_id: listing.agent_id?.toString() ?? null,
    list_price: listing.list_price.toString(),
    living_area: listing.living_area?.toString() ?? null,
  });

  // Phase D step 3 safety net (Codex #429 P2): the reachable WITH-TOOLS viewers
  // (/crm/sale-view → SALE-FORM-WITH-TOOLS.html, /crm/rental-view → RENTAL-FORM-WITH-TOOLS.html)
  // hydrate listing agent/company attribution TYPED-FIRST now that `agent_info` is gone from the
  // Prisma client. These typed columns already flow through the no-select findUnique +
  // sanitizeForCRM spread above; pin them explicitly so a future `select` narrowing on
  // findListing() cannot silently blank viewer attribution. We do NOT reintroduce or synthesize a
  // top-level `agent_info` object, and we add NO new agent PII (email/phone) to the payload —
  // the existing CRM-tier PII boundary in sanitizeForCRM is unchanged.
  sanitized.list_agent_full_name = listing.list_agent_full_name ?? null;
  sanitized.list_office_name = listing.list_office_name ?? null;

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

  // WRITE: this handler mutates source-derived columns (property_type,
  // list_price, bedrooms_total, borough, the display gates) AND stamps
  // `modification_timestamp: new Date()`. On a synced row that is both a local
  // divergence the next sync silently overwrites AND a poisoned Trestle cursor
  // (getLastSyncTimestamp takes MAX(modification_timestamp) over rows with
  // last_synced_from_trestle NOT NULL). Only Mallan-authored local rows are
  // manageable here — for every role, broker included.
  const patchCaps = listingCapabilities(auth, listing);
  if (!patchCaps.mayManageMallanLocalListing) {
    return NextResponse.json(
      patchCaps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
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
  const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
  const isInHouse =
    inHouseValues.includes(String(merged.saleListingType || "")) ||
    inHouseValues.includes(String(merged.listingAgreement || "")) ||
    inHouseValues.includes(String(merged.ListingAgreement || ""));
  const eligibility = classifyRlsEligibility(merged, {
    explicitOptOut: body.rls_eligible === false || (!body.rls_eligible && !listing.rls_eligible) || isInHouse,
    commercialSubType: (body.commercial_sub_type as string) || (listing.commercial_sub_type as string | null) || undefined,
    commercialOwnership: (body.commercial_ownership as string) || (listing.commercial_ownership as string | null) || undefined,
  });
  const effectiveRlsEligible = eligibility.rlsEligible;

  // RLS Enforcement Gate — fail-closed, keyed on the PERSISTED `listing.status`
  // column ONLY. Enforce the 48-field mandatory check for every RLS-eligible
  // listing in a non-draft persisted status: the publicly displayable Active /
  // ComingSoon / ActiveUnderContract, plus Pending and the terminal statuses.
  // Website-only listings (InHouseWebOnly/InHouseInternal/commercial) are
  // filtered out via effectiveRlsEligible. Skip ONLY when the persisted status
  // normalizes to draft-like: "Draft", the CRM draft marker "Incomplete", or
  // empty/null (→ the "Draft" default).
  //
  // Why persisted-only: the PATCH route does NOT write the `status` column
  // (transitions go through /status). So neither `body.MlsStatus` (request
  // payload) nor `raw_data.MlsStatus` (which the status route leaves stale on
  // activation) is authoritative here. Reading either let a request — or a stale
  // raw value — make an actually Active/ActiveUnderContract row look draft-like
  // and bypass the 48-field check while the row stays publicly displayable
  // (fail-OPEN: Codex P1 ×2 on #358 — stale-raw, then request-downgrade).
  //
  // Normalize before the draft-like compare so casing/whitespace variants of the
  // persisted draft markers ("incomplete", "Incomplete ", " DRAFT ") still count
  // as draft-like (Codex P2). The `|| "Draft"` default keeps persistedStatus
  // non-empty, so an empty/null column folds to "Draft" (draft-like) and never
  // reaches normalizeStandardStatus('') — which would default to "Active". Do
  // NOT use the FARE-specific isDisplayReadyStatus() (Active/ComingSoon-only) —
  // it would fail-OPEN on the publicly displayable ActiveUnderContract.
  const persistedStatus = listing.status || "Draft";
  const normalizedPersistedStatus = normalizeStandardStatus(persistedStatus);
  const isDraftLike =
    normalizedPersistedStatus === "Draft" || normalizedPersistedStatus === "Incomplete";

  const isCrmCreated = !listing.mls_id;
  if (effectiveRlsEligible && !isDraftLike && !isCrmCreated) {
    const enforcement = assertRlsCompliantPayload(merged, {
      listingType: (listing.listing_type as "sale" | "rent") ?? "sale",
      isNewDevelopment: merged.NewDevelopmentYN === true,
      currentStatus: persistedStatus,
      previousStatus: listing.status || undefined,
      existingActivationDate: existingRaw.ActivationDate as string | undefined,
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
  }

  // FARE Act fee-disclosure gate (NYC LL 119/2024) — rentals becoming display-ready
  // (Active / ComingSoon). Covers the edit-save publish path. Applies to CRM rental
  // exclusives too. Gate on DISPLAY-READY status (not !isDraft): the CRM form saves
  // drafts as RESO MlsStatus "Incomplete", which is non-Draft but NOT display-ready,
  // so a draft save must never be gated (Codex #348).
  //
  // Unchanged from its #350 baseline: this gate reads `effectiveStatus`
  // (merged.MlsStatus → listing.status). It shares the same latent stale-raw /
  // request-override considerations as the persisted-status RLS gate above, but
  // is intentionally left at its established behavior in this PR (separate
  // follow-up). isDisplayReadyStatus() normalizes the value internally.
  const effectiveStatus = (merged.MlsStatus as string) || listing.status || "Draft";
  const isRental = ((listing.listing_type as string) ?? "") === "rent";
  if (isRental && isDisplayReadyStatus(effectiveStatus)) {
    const feeCheck = checkFeeDisclosure(merged);
    if (!feeCheck.ok) {
      return NextResponse.json(
        { error: feeCheck.reason, field: "MoveInCostsAmount", code: "FARE_FEE_DISCLOSURE" },
        { status: 422 }
      );
    }
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
  // borough/neighborhood column mirroring — accept canonical (Borough/Neighborhood)
  // OR the alias keys (CityRegion/SubdivisionName) the CRM sale form actually
  // emits in collectSaleFormData (see normalizer.ts aliasToCanonical: the form
  // sends Borough→CityRegion + Neighborhood→SubdivisionName). Before this fix
  // PATCH only mirrored when body sent the canonical names, so column-side
  // borough/neighborhood drifted on every edit-save (gap report 2026-05-28 C2).
  if (body.Borough !== undefined) update.borough = String(body.Borough);
  else if (body.CityRegion !== undefined) update.borough = String(body.CityRegion);
  if (body.Neighborhood !== undefined) update.neighborhood = String(body.Neighborhood);
  else if (body.SubdivisionName !== undefined) update.neighborhood = String(body.SubdivisionName);
  if (body.City !== undefined) update.city = String(body.City);
  if (body.PostalCode !== undefined) update.postal_code = String(body.PostalCode);
  // Distribution gates — all use canonical RESO/RLS field names (YN suffix).
  //
  // 2026-04-28 fail-closed correction: previous pattern was `body.X !== false`
  // which coerced null/string-"false"/garbage to true (fail-OPEN). Use
  // coerceStrictBool() so only literal true / "true" / "TRUE" stores as true;
  // anything else (including null, "false", typos, malformed JSON) stores as
  // false. This matches the compliance gate doctrine in lib/compliance/gates.ts.
  // IDX-display control (Cotality-clean 2026-05-30): the internal flag
  // `saleIdxDisplayYN` drives the internal `idx_display_yn` column. There is NO
  // Cotality field for IDX display — `IDXEntireListingDisplayYN` was a phantom and
  // is accepted here only as a legacy fallback. The §2.05 terminal guard below is
  // unchanged (rls-eligible AND not-terminal AND coerceStrictBool).
  const idxDisplayControl = body.saleIdxDisplayYN ?? body.IDXEntireListingDisplayYN;
  if (idxDisplayControl !== undefined) {
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
      coerceStrictBool(idxDisplayControl);
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
  const permValue = body.Permission ?? body.Permissions; // A2: accept canonical Permission + legacy Permissions
  if (permValue !== undefined) {
    const permBools = derivePermissionBooleans(permValue);
    update.participant_only = permBools.participant_only;
    update.owner_opt_out = permBools.owner_opt_out;
  } else {
    if (body.ParticipantOnlyYN !== undefined) update.participant_only = body.ParticipantOnlyYN === true;
    if (body.OwnerOptOutYN !== undefined) update.owner_opt_out = body.OwnerOptOutYN === true;
  }

  // Update JSON columns by merging
  const existingAddress = (listing.address as Record<string, unknown>) ?? {};
  const existingFeatures = (listing.features as Record<string, unknown>) ?? {};
  // Phase D step 3: agent_info removed from the Prisma client. This merge base is re-seeded
  // TYPED-FIRST from resolvedCurrent below (~lines 398-405), so an empty base is correct and
  // loses no attribution (the 8 keys come from the typed columns; non-typed keys like
  // ListAgentKey were never persisted post-Phase-C).
  const existingAgentInfo: Record<string, unknown> = {};

  // Address bucket key allowlist. Includes both canonical RESO names AND the
  // CRM-form alias keys (CityRegion/SubdivisionName/CountyOrParish/PostalCity)
  // that collectSaleFormData emits. Before adding the aliases, those four
  // fields landed only in raw_data on PATCH — the structured address bucket
  // stayed stale and the building-validator re-fired on every edit-save
  // (gap report 2026-05-28 §1.3, root cause C2).
  const addressKeys = [
    "StreetNumber", "StreetDirPrefix", "StreetName", "StreetSuffix",
    "StreetDirSuffix", "UnitNumber",
    "City", "StateOrProvince", "PostalCode", "Borough",
    "Neighborhood", "BuildingName", "UnparsedAddress",
    // Alias keys the CRM sale form emits via collectSaleFormData (these are
    // the same fields under different RESO/REBNY names — see
    // lib/compliance/normalizer.ts aliasToCanonical).
    "CityRegion", "SubdivisionName", "CountyOrParish", "PostalCity",
  ];
  const updatedAddress = { ...existingAddress };
  for (const k of addressKeys) {
    if (body[k] !== undefined) updatedAddress[k] = body[k];
  }
  // UnparsedAddress case normalization: the CRM sale form's
  // collectSaleFormData emits `UnParsedAddress` (capital P, the spelling on
  // Trestle's $metadata for OData $orderby), while existing Trestle-mapped
  // rows and most internal callers use `UnparsedAddress` (lowercase p). Accept
  // either casing and store under the lowercase-p canonical so the public-DTO
  // builders + slug + address validator (which all read `UnparsedAddress`)
  // get the fresh value on every edit. Without this, the structured bucket
  // kept the stale UnparsedAddress while raw_data.UnParsedAddress drifted
  // separately (gap report 2026-05-28 §1.3, root cause C2 + PR-F).
  if (body.UnParsedAddress !== undefined && body.UnparsedAddress === undefined) {
    updatedAddress.UnparsedAddress = body.UnParsedAddress;
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
  // Phase C: the LIVE agent attribution is in the 8 typed columns — agent_info JSON is
  // frozen/absent for rows created or edited after the stop-write change. Seed the merge
  // base from the RESOLVED current attribution (typed-first, JSON fallback) so:
  //   (a) a PATCH that does NOT touch agent fields preserves the existing typed columns
  //       (deriving from the stale `{}` JSON would null them out — Codex blocker), and
  //   (b) a Mallan exclusive's manual typed override is not clobbered by the Agent row
  //       (mergeBlankOnly keeps the seeded non-blank values).
  const resolvedCurrent = resolveListingAgentInfo(listing);
  const seededAgentInfo: Record<string, unknown> = { ...existingAgentInfo };
  const seed = (key: string, val: string | null) => { if (val) seededAgentInfo[key] = val; };
  seed("ListAgentFullName", resolvedCurrent.fullName);
  seed("ListOfficeName", resolvedCurrent.officeName);
  seed("ListAgentEmail", resolvedCurrent.agentEmail);
  seed("ListAgentDirectPhone", resolvedCurrent.agentDirectPhone);
  seed("ListOfficeMlsId", resolvedCurrent.officeMlsId);
  seed("ListAgentMlsId", resolvedCurrent.agentMlsId);
  seed("CoListOfficeMlsId", resolvedCurrent.coListOfficeMlsId);
  seed("CoListAgentMlsId", resolvedCurrent.coListAgentMlsId);

  // Did THIS PATCH explicitly change any agent attribution field?
  const agentFieldsChanged = agentKeys.some((k) => body[k] !== undefined);
  const updatedAgentInfo = { ...seededAgentInfo };
  for (const k of agentKeys) {
    if (body[k] !== undefined) updatedAgentInfo[k] = body[k];
  }

  // Mallan-exclusive agent assignment (Part C2). Re-stamp the listing-agent
  // attribution on every edit so the public contact card stays populated. Keyed
  // off the LISTING's OWN agent (listing.agent_id) — NOT the editor — so a
  // broker editing another agent's exclusive never reassigns ownership. Returns
  // null for third-party IDX/RLS rows (listing_id not SL-/RL- and rls_eligible
  // !== false), in which case we never stamp a non-Mallan agent's PII and just
  // persist the manual agent_info merge. The helper fills blank keys only
  // (manual typed values win).
  const listingAgent = listing.agent_id
    ? await prisma.agent.findUnique({
        where: { id: listing.agent_id },
        select: { id: true, full_name: true, first_name: true, last_name: true, email: true, phone: true },
      })
    : null;
  const exclusiveAssignment = listingAgent
    ? buildExclusiveAgentAssignment(
        listingAgent,
        { listing_id: listing.listing_id, rls_eligible: listing.rls_eligible },
        updatedAgentInfo,
      )
    : null;
  // Phase C: write ONLY the 8 typed columns; never persist agent_info JSON. Only touch
  // the typed columns when there is a reason to — otherwise a PATCH of an unrelated field
  // would re-derive (and potentially clear) existing attribution.
  if (exclusiveAssignment) {
    // Mallan exclusive — re-stamp on every edit so the contact card stays populated.
    // Seeded from the existing typed values above, so manual overrides survive
    // (buildExclusiveAgentAssignment fills blank keys only). agent_info/agent_id excluded.
    const { agent_id: _exAgentId, agent_info: _exAgentInfo, ...exclusiveTyped } = exclusiveAssignment;
    Object.assign(update, exclusiveTyped);
  } else if (agentFieldsChanged) {
    // Non-exclusive (third-party): rewrite typed columns ONLY when this PATCH actually
    // changed an agent field. updatedAgentInfo is seeded from the current typed values,
    // so unchanged fields keep their existing attribution.
    Object.assign(update, typedAgentColumnsFromJson(updatedAgentInfo));
  }
  // else: non-exclusive listing, no agent field changed → leave the typed columns untouched.

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

  // Building-Neon-wake — a CRM edit can change price/address/status/gates on
  // an exclusive that appears in cached BUILDING payloads: expire the listing
  // tag + BOTH buildings (previous + new address) + search in the same cycle.
  safeRevalidateTags([
    listingCacheTag(listing.listing_id),
    ...buildingAndManifestInvalidationTags(existingAddress, updated.address),
    SEARCH_CACHE_TAG,
  ]);

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

  const urls = buildListingUrls({
    listing_id: updated.listing_id,
    status: updated.status,
    address: updated.address as Record<string, unknown> | null,
    // Required by the canonical public-address decision: a prefix is not
    // permission, and a null IDX flag must fail closed on a DB row.
    rls_eligible: updated.rls_eligible,
    internet_entire_listing_display_yn: updated.internet_entire_listing_display_yn,
    internet_address_display_yn: updated.internet_address_display_yn,
  });

  return NextResponse.json({
    id: updated.id.toString(),
    listing_id: updated.listing_id,
    status: updated.status,
    publicUrl: urls.publicUrl,
    rebnyListingUrl: urls.rebnyListingUrl,
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

  // Soft-delete writes status + modification_timestamp — same cursor and
  // source-ownership reasoning as PATCH. The `listing.mls_id` guard below is
  // retained as a second, narrower defense.
  const deleteCaps = listingCapabilities(auth, listing);
  if (!deleteCaps.mayManageMallanLocalListing) {
    return NextResponse.json(
      deleteCaps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
  }

  if (listing.mls_id) {
    return NextResponse.json(
      { error: "Only CRM-created listings can be withdrawn from this dashboard." },
      { status: 409 }
    );
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: "Withdrawn",
      modification_timestamp: new Date(),
      // Archive eligibility clock (#446): soft-delete is a non-terminal→terminal
      // transition (Withdrawn). Set terminal_since (no off-market date on a CRM
      // row → transition wall-clock); never bumped if already terminal.
      ...computeTerminalSincePatch({
        previousStatus: listing.status,
        newStatus: "Withdrawn",
        raw_data: listing.raw_data as Record<string, unknown> | null,
        features: listing.features as Record<string, unknown> | null,
      }),
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

  // Building-Neon-wake — a withdrawn exclusive must leave its building's
  // cached payload (and search surfaces) in the same cycle.
  safeRevalidateTags([
    listingCacheTag(listing.listing_id),
    ...buildingAndManifestInvalidationTags(listing.address),
    SEARCH_CACHE_TAG,
  ]);

  return NextResponse.json({ success: true, status: "Withdrawn" });
}
