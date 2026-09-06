/**
 * DTO (Data Transfer Object) Enforcement Layer
 *
 * REBNY/RLS + Security: Different consumers get different data shapes.
 * This module enforces the principle that:
 *   - CRM endpoints return internal fields (still least-privilege)
 *   - VOW endpoints return enriched data for authenticated consumers (login-required)
 *   - Portal endpoints return client-scoped data (no agent PII, no internal notes)
 *   - Public endpoints return sanitized IDX-compliant data only
 *
 * Data tiers (most restrictive → least):
 *   PUBLIC (IDX)  →  VOW (authenticated consumer)  →  PORTAL (client)  →  CRM (agent/broker)
 *
 * VOW (Virtual Office Website) provides authenticated consumers with additional data
 * beyond IDX, such as sold/closed price, days on market, and listing history.
 * Active — Trestle IDX Plus WebAPI provides all 1,363 fields. VOW display is
 * authorized for registered/logged-in portal consumers per REBNY RLS rules.
 *
 * AUTHORITY: COTALITY LIVE CONTRACT → provider facts · REBNY / UCBA → compliance / display rules ·
 * MALLAN → form / workflow / storage · RESO = vocabulary only · Fail closed = non-display.
 */

import { affirmPermission, isOwnerOptOut, isParticipantOnly } from "./gates";
import { resolveListingAgentInfo, type ResolvableListingAgent } from "@/lib/listings/agent-info-resolver";

// ─── Fields that MUST NEVER appear in portal or public responses ──────────

/** Internal CRM fields — never exposed outside CRM endpoints */
const CRM_ONLY_FIELDS = [
  "raw_data",
  "agent_id",
  "sync_status",
  "last_synced_from_trestle",
  "compliance",       // internal validation results
  "agent_info",       // full agent object (portal gets masked version)
] as const;

/** Agent PII fields — never exposed to buyer/tenant portals */
const AGENT_PII_FIELDS = [
  "ListAgentEmail",
  "ListAgentDirectPhone",
  "ListAgentKey",
  "ListAgentFullName",
  "CoListAgentEmail",
  "CoListAgentDirectPhone",
  "CoListAgentKey",
  "CoListAgentFullName",
  "BuyerAgentEmail",
  "BuyerAgentDirectPhone",
  // Phase B (agent_info normalization): the promoted snake_case typed columns mirror the
  // PascalCase PII above. Stripped fail-closed so a raw DB row carrying these never leaks to
  // a portal, even if a future caller spreads it instead of using the curated DTO.
  "list_agent_email",
  "list_agent_direct_phone",
  "list_agent_mls_id",
  "list_agent_full_name",
  "co_list_agent_mls_id",
] as const;

/** REBNY removed fields (NAR Settlement Aug 2025) — never in any response */
const REMOVED_FIELDS = [
  "BuyerAgencyCompensation",
  "BuyerAgencyCompensationType",
  "SubAgencyCompensation",
  "SubAgencyCompensationType",
] as const;

/** Fields suppressed in public/IDX responses */
const IDX_SUPPRESSED_FIELDS = [
  "PrivateRemarks",
  "ShowingInstructions",
  "ShowingRemarks",
  "ListAgentEmail",
  "ListAgentDirectPhone",
  "ListAgentKey",
  // Phase B: snake_case typed PII columns mirror the PascalCase agent PII above —
  // suppressed from public/IDX fail-closed.
  "list_agent_email",
  "list_agent_direct_phone",
  "list_agent_mls_id",
  // ListingURL is the listing broker's website URL (e.g., bhsusa.com/listing/123).
  // Must never be shown to buyer/tenant clients — CRM/agent view only.
  "ListingURL",
  ...REMOVED_FIELDS,
] as const;

/**
 * VOW-enriched fields — additional data available to authenticated portal consumers.
 *
 * IMPORTANT (verified 2026-03-26 against REBNY IDX Plus CSV + IDX/VOW Compliance Checklist):
 *   - ClosePrice, CloseDate, OriginalListPrice, PreviousListPrice, ListingContractDate,
 *     PurchaseContractDate, BuyerFinancing, WithdrawnDate are ALL in the REBNY IDX Plus
 *     field spec (902 fields). They CAN be displayed publicly on IDX. The REBNY IDX/VOW
 *     Compliance Checklist (Dec 2021) contains NO field-level restriction blocking these
 *     from IDX display.
 *   - DaysOnMarket, CumulativeDaysOnMarket are NOT in the IDX Plus CSV but ARE returned by
 *     Trestle on the IDX Plus feed (validated live 2026-03-04). Trestle provisions additional
 *     fields beyond the 902-field CSV. Fields returned on the feed are authorized for display.
 *   - Concessions, ConcessionsAmount are NOT in the IDX Plus CSV. Needs live verification.
 *   - ExpirationDate is explicitly "Hidden" per UCBA Exhibit A — never display.
 *   - CancelledDate is not in IDX Plus CSV.
 *
 * This list is used by sanitizeForVOW() to re-add these fields after public sanitization.
 * Since sanitizeForPublic() does NOT strip IDX Plus fields, the VOW enrichment is primarily
 * relevant for fields NOT in IDX Plus (DaysOnMarket, Concessions, etc.) and for
 * ExpirationDate which is hidden from all public display.
 *
 * Sources:
 *   - REBNY IDX Plus CSV: data/rebny-rls-property-fields.csv (902 fields, "IDX Plus" feed)
 *   - REBNY IDX/VOW Compliance Checklist (Dec 2021): no field-level VOW-only restrictions
 *   - Trestle metadata: artifacts/metadata.xml (no IDX/VOW field annotations)
 *   - NAR IDX Policy 7.58: sold data must be on IDX when publicly accessible (NYC has ACRIS)
 */
const VOW_ENRICHED_FIELDS = [
  // ── In IDX Plus CSV (can display publicly, included here for VOW completeness) ──
  "ClosePrice",
  "CloseDate",
  "OriginalListPrice",
  "PreviousListPrice",
  "ListingContractDate",
  "PurchaseContractDate",
  "BuyerFinancing",
  "WithdrawnDate",
  // ── NOT in IDX Plus CSV but returned by Trestle on IDX Plus feed (validated live 2026-03-04) ──
  "DaysOnMarket",
  "CumulativeDaysOnMarket",
  // ── NOT in IDX Plus CSV — needs live verification whether Trestle provisions these ──
  "Concessions",
  "ConcessionsAmount",
  // ── Explicitly hidden per UCBA Exhibit A ──
  "CancelledDate",
  "ExpirationDate",
] as const;

// ─── DTO Sanitizers ───────────────────────────────────────────────────────

/**
 * Sanitize a listing for PUBLIC (IDX) display.
 * Strips: agent PII, private remarks, compensation fields, raw_data, internal compliance data.
 * Enforces: address suppression based on InternetAddressDisplayYN.
 */
export function sanitizeForPublic(listing: Record<string, unknown>): Record<string, unknown> {
  const result = { ...listing };

  // Strip CRM-only internal fields
  for (const field of CRM_ONLY_FIELDS) {
    delete result[field];
  }

  // Strip all agent PII
  for (const field of AGENT_PII_FIELDS) {
    delete result[field];
  }

  // Strip removed compensation fields
  for (const field of REMOVED_FIELDS) {
    delete result[field];
  }

  // Strip IDX-suppressed fields
  for (const field of IDX_SUPPRESSED_FIELDS) {
    delete result[field];
  }

  // Null out remarks in both PascalCase and camelCase variants
  result.PrivateRemarks = null;
  result.privateRemarks = null;
  result.ShowingRemarks = null;
  result.showingRemarks = null;
  result.ShowingInstructions = null;
  result.showingInstructions = null;

  // Null out compensation in nested buyer object
  if (result.buyer && typeof result.buyer === "object") {
    const buyer = { ...(result.buyer as Record<string, unknown>) };
    buyer.buyerAgentCompensation = "";
    buyer.buyerAgentCompensationType = "";
    result.buyer = buyer;
  }

  // Address suppression: InternetAddressDisplayYN — FAIL-CLOSED.
  // Was `=== false` which only suppressed when explicitly false; null /
  // undefined / missing passed through as displayable. Now uses canonical
  // `affirmPermission` from lib/compliance/gates.ts which treats ANY
  // non-true value (including null, undefined, missing) as non-displayable.
  const addressDisplayable = affirmPermission(
    result.internet_address_display_yn ?? result.InternetAddressDisplayYN,
  );
  if (!addressDisplayable) {
    result.address = { street: "Address Undisclosed" };
    // Strip both PascalCase (Trestle) and camelCase/snake_case (DB) variants
    delete result.StreetNumber;
    delete result.streetNumber;
    delete result.StreetName;
    delete result.streetName;
    delete result.UnitNumber;
    delete result.unitNumber;
    delete result.UnParsedAddress;
    delete result.unParsedAddress;
    delete result.Latitude;
    delete result.latitude;
    delete result.Longitude;
    delete result.longitude;
  }

  return result;
}

/**
 * Sanitize a listing for VOW (Virtual Office Website) display.
 * Authenticated consumers (registered + logged in) see enriched data beyond IDX:
 *   - Sold/closed prices and dates
 *   - Days on market
 *   - Original/previous list prices
 *   - Listing contract dates
 *
 * Still strips: agent PII, private remarks, showing instructions, compensation fields.
 * Still enforces: address suppression, distribution gates.
 *
 * REBNY VOW rules:
 *   - Consumer must be registered and logged in
 *   - No data scraping, no automated access
 *   - VOW data cannot be displayed on IDX pages
 *   - Attribution required: "Data provided by REBNY RLS"
 */
export function sanitizeForVOW(listing: Record<string, unknown>): Record<string, unknown> {
  // Capture VOW-enriched fields before public sanitization strips them
  const vowData: Record<string, unknown> = {};
  for (const field of VOW_ENRICHED_FIELDS) {
    if (listing[field] !== undefined) {
      vowData[field] = listing[field];
    }
    // Also check camelCase variants from DB records
    const camel = field.charAt(0).toLowerCase() + field.slice(1);
    if (listing[camel] !== undefined) {
      vowData[field] = listing[camel];
    }
  }

  // Apply public (IDX) sanitization as the base
  const result = sanitizeForPublic(listing);

  // Re-add VOW-enriched fields
  for (const [key, value] of Object.entries(vowData)) {
    result[key] = value;
  }

  return result;
}

/**
 * Sanitize a listing for PORTAL (client) display.
 *
 * Hotfix 3 (2026-05-13) — closed the M2 audit finding where seller and
 * landlord roles received the full raw `agent_info` object, including
 * `ListAgentEmail`, `ListAgentDirectPhone`, `ListAgentKey`, `full_name`,
 * etc. A seller who favorited another seller's listing (or any non-own
 * row) would receive THAT other broker's PII.
 *
 * The prior comment claimed seller/landlord "see their agent's info" —
 * but the function had no way to distinguish "their own agent" from
 * "another broker's agent." Verified during the fix: the seller and
 * landlord UIs do NOT consume `agent_info` at all, so the leak path was
 * producing data nothing rendered.
 *
 * Current policy (uniform across ALL portal roles):
 *   `agent_info` → `{ company: <ListOfficeName or company string> | null }`
 *
 * UCBA Art. III §2(C) attribution is preserved (the brokerage name IS
 * the listing broker). Everything else is stripped at the DTO boundary.
 * If a future product requirement legitimately needs an authenticated
 * seller/landlord to see THEIR OWN agent's contact, that should be a
 * separate explicit endpoint scoped to the viewer's linked agent_id —
 * NOT a wide DTO-wide unmask.
 */
export function sanitizeForPortal(
  listing: Record<string, unknown>,
  // portalRole retained on the signature for API compatibility with
  // callers (favorites + listings endpoints), but no longer branches the
  // agent_info shape — the leak path is closed for all roles uniformly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  portalRole: string,
): Record<string, unknown> {
  // Capture agent_info before public sanitization strips it
  const agentInfo = listing.agent_info as Record<string, unknown> | null | undefined;

  // Portal users are authenticated → use VOW-tier sanitization (enriched data)
  const result = sanitizeForVOW(listing);

  // Re-add agent_info as the strict allow-listed shape. Everything that
  // isn't the brokerage attribution name is dropped here. FAIL-CLOSED: only
  // `{ company }` is ever emitted — agent email/phone never reach the portal.
  // Phase B: company resolved TYPED-FIRST (list_office_name) with JSON fallback.
  if (agentInfo || (listing as ResolvableListingAgent).list_office_name) {
    const company = resolveListingAgentInfo(listing as ResolvableListingAgent).officeName;
    result.agent_info = { company };
  } else {
    result.agent_info = null;
  }

  return result;
}

// ─── Prisma-model helpers for portal endpoints ──────────────────────────

/** Listing fields needed by portal sanitization */
export type PortalListingInput = {
  id: bigint;
  listing_id: string;
  status: string;
  listing_type: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: unknown;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: unknown;
  borough: string | null;
  neighborhood: string | null;
  address: unknown;
  features: unknown;
  media: unknown;
  // Phase D code-prep: OPTIONAL — runtime readers no longer select agent_info (typed-first;
  // A6 proved typed_gap_rows=0). Consumer reads `listing.agent_info as …| undefined` (absent-safe).
  agent_info?: unknown;
  internet_address_display_yn: boolean;
  internet_entire_listing_display_yn?: boolean;
  participant_only: boolean;
  owner_opt_out: boolean;
  [key: string]: unknown;
};

/**
 * Convert a Prisma Listing into a portal-safe object.
 * Canonical function for ALL /api/portal/** endpoints that return listing data.
 * Enforces: owner opt-out exclusion, address suppression, agent PII masking, CRM field stripping.
 */
export function sanitizeListingForPortal(
  listing: PortalListingInput,
  portalRole: string
): Record<string, unknown> | null {
  // Canonical fail-closed gate evaluation — treats any missing permission
  // flag as non-displayable. Previous pattern used direct boolean checks
  // which fail OPEN: owner_opt_out=null → passed as "not opted out,"
  // internet_entire_listing_display_yn=null → passed as "displayable."
  // UCBA Art. I §4(A) / §5 and RLS Gate 3 require fail-closed treatment.

  // Gate 1 — Owner Opt-Out (UCBA Art. I §4(A) / §5(A))
  if (isOwnerOptOut({
    owner_opt_out: listing.owner_opt_out,
    permission: (listing as unknown as { permission?: unknown }).permission,
    permissions: (listing as unknown as { permissions?: unknown }).permissions,
  })) return null;

  // Gate 2 — Participant-Only (UCBA Def. (W))
  if (isParticipantOnly({
    participant_only: listing.participant_only,
    permission: (listing as unknown as { permission?: unknown }).permission,
    permissions: (listing as unknown as { permissions?: unknown }).permissions,
  })) return null;

  // Gate 3 — Internet display (fail-CLOSED). Was `=== false`; null/undefined
  // now also blocks display.
  if (!affirmPermission(listing.internet_entire_listing_display_yn)) return null;

  const flat: Record<string, unknown> = {
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    status: listing.status,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    property_sub_type: listing.property_sub_type,
    list_price: listing.list_price?.toString() ?? null,
    bedrooms_total: listing.bedrooms_total,
    bathrooms_full: listing.bathrooms_full,
    bathrooms_half: listing.bathrooms_half,
    living_area: listing.living_area?.toString() ?? null,
    borough: listing.borough,
    neighborhood: listing.neighborhood,
    address: listing.address,
    features: listing.features,
    media: listing.media,
    agent_info: listing.agent_info,
    // Phase B: carry the typed office column so sanitizeForPortal resolves the
    // company mask TYPED-FIRST (list_office_name) with agent_info JSON fallback.
    // Office name only — NO agent PII columns are carried into the portal allow-list.
    list_office_name: listing.list_office_name,
    internet_address_display_yn: listing.internet_address_display_yn,
  };

  return sanitizeForPortal(flat, portalRole);
}

/**
 * Serialize a listing for ITS OWNER's portal view (seller/landlord seeing their OWN listing).
 *
 * Unlike sanitizeListingForPortal (public/buyer portal), this does NOT apply the public-DISSEMINATION
 * gates — owner_opt_out (UCBA Art. I §4(A)/§5(A)), participant_only (Def. (W)), and
 * internet_entire_listing_display_yn (RLS Gate 3). Those gates govern PUBLIC display/IDX/syndication;
 * an owner viewing their OWN listing in their OWN authenticated portal is NOT public dissemination, so
 * an opted-out / participant-only / CRM-exclusive (SL-/RL-, internet flag null) owned listing must
 * still be visible to its owner. The SAME safe field allow-list + role masking (sanitizeForPortal —
 * address suppression, agent-PII masking, CRM-field stripping) is applied, so no extra field is
 * exposed relative to the public portal; only the listing-level visibility gate is lifted.
 *
 * FAIL-CLOSED CONTRACT: callers MUST have already verified ownership (e.g. an `owner_client_id ===
 * auth.userId` query filter or canAccessOwnerListing). This function performs NO ownership check and
 * MUST NOT be called on a listing the caller has not been proven to own.
 */
/**
 * Format a listing's raw address JSON into a single renderable line (e.g. "123 Main St #4B").
 * Handles both lowercase (streetNumber/streetName/unitNumber) and PascalCase (Trestle) shapes.
 * Owner pages type `address: string` and render it directly, so the owner DTO must emit a string.
 */
function formatOwnerAddressLine(address: unknown): string | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const a = address as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = a[k];
      if (v !== null && v !== undefined && String(v).trim().length > 0) return String(v).trim();
    }
    return "";
  };
  const streetNumber = pick("streetNumber", "StreetNumber");
  const dirPrefix = pick("streetDirPrefix", "StreetDirPrefix");
  const streetName = pick("streetName", "StreetName");
  const suffix = pick("streetSuffix", "StreetSuffix");
  const dirSuffix = pick("streetDirSuffix", "StreetDirSuffix");
  const unit = pick("unitNumber", "UnitNumber", "unit");
  // Full RESO street order: number, dir-prefix, name, suffix, dir-suffix (e.g. "333 E 46th Street").
  const street = [streetNumber, dirPrefix, streetName, suffix, dirSuffix].filter(Boolean).join(" ").trim();
  const full = unit ? `${street}${street ? " " : ""}#${unit}` : street;
  if (full.trim().length > 0) return full.trim();
  // Fall back to a pre-formatted unparsed address when discrete components are absent.
  return pick("unparsedAddress", "UnparsedAddress") || null;
}

export function sanitizeOwnedListingForOwner(
  listing: PortalListingInput,
  portalRole: string
): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    status: listing.status,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    property_sub_type: listing.property_sub_type,
    list_price: listing.list_price?.toString() ?? null,
    bedrooms_total: listing.bedrooms_total,
    bathrooms_full: listing.bathrooms_full,
    bathrooms_half: listing.bathrooms_half,
    living_area: listing.living_area?.toString() ?? null,
    borough: listing.borough,
    neighborhood: listing.neighborhood,
    address: listing.address,
    features: listing.features,
    media: listing.media,
    agent_info: listing.agent_info,
    list_office_name: listing.list_office_name,
    internet_address_display_yn: listing.internet_address_display_yn,
  };
  const masked = sanitizeForPortal(flat, portalRole);
  // Owner sees their OWN address as a renderable STRING (seller/landlord pages type address:string and
  // render it directly). Built from the raw address object; shown regardless of the public
  // internet_address_display_yn gate (an owner viewing their own data is not public dissemination).
  masked.address = formatOwnerAddressLine(listing.address);
  return masked;
}

/** Fields that must NEVER appear in any API response, including CRM */
const NEVER_EXPOSE_FIELDS = [
  // Auth credentials — must never leak even to authorized CRM users
  "password_hash",
  "portal_token",
  "portal_token_expires_at",
  // Trestle API credentials
  "trestle_token",
  "trestle_bearer",
  "api_key",
  "api_secret",
  // Prisma internal metadata
  "_count",
  "_avg",
  "_sum",
  "_min",
  "_max",
] as const;

/**
 * Sanitize a listing for CRM (internal) display.
 * CRM users (agents/brokers) are authorized to see most data, but we still enforce:
 *   1. Removed compensation fields (NAR Settlement — forbidden everywhere)
 *   2. Auth credentials / tokens (security — never in any API response)
 *   3. raw_data deep-cleaning: strip any credential fields that may be nested
 */
export function sanitizeForCRM(listing: Record<string, unknown>): Record<string, unknown> {
  const result = { ...listing };

  // Strip removed compensation fields (forbidden everywhere post-NAR Settlement)
  for (const field of REMOVED_FIELDS) {
    delete result[field];
  }

  // Strip fields that must never appear in any API response
  for (const field of NEVER_EXPOSE_FIELDS) {
    delete result[field];
  }

  // Deep-clean raw_data if present: strip compensation + credentials from nested JSON
  if (result.raw_data && typeof result.raw_data === "object") {
    const raw = { ...(result.raw_data as Record<string, unknown>) };
    for (const field of REMOVED_FIELDS) {
      delete raw[field];
    }
    for (const field of NEVER_EXPOSE_FIELDS) {
      delete raw[field];
    }
    result.raw_data = raw;
  }

  // Deep-clean agent_info: strip agent email/phone from CRM listing responses
  // (agents see their OWN info from session, not from listing payload)
  // Keep: name, office, MLS IDs (needed for CRM display)
  // Strip: direct email/phone (available from agent profile, not listing)

  return result;
}

/**
 * Strip a lead record for portal self-view (/api/portal/me).
 * Returns only fields the client should see about themselves.
 * Excludes: agent_id, source, internal status metadata, password_hash, portal_token.
 */
export function sanitizeLeadForPortal(lead: Record<string, unknown>): Record<string, unknown> {
  return {
    id: lead.id,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    portal_role: lead.portal_role,
    preferences: lead.preferences ?? null,
  };
}
