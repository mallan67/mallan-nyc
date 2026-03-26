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
 * FIELD AUTHORITY ORDER: UCBA → RLS TRUMPS ALL → RESO/IDX fills gaps → INTERNAL-ONLY → Fail closed
 */

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

  // Address suppression: InternetAddressDisplayYN
  // Check both PascalCase (Trestle raw) and snake_case (Prisma DB) variants
  const addressDisplayYN =
    result.internet_address_display_yn ??
    result.InternetAddressDisplayYN;
  if (addressDisplayYN === false) {
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
 * Like public, but additionally:
 *   - Buyer/Tenant: agent name masked (only company shown)
 *   - Seller/Landlord: agent info visible (it's their agent)
 */
export function sanitizeForPortal(
  listing: Record<string, unknown>,
  portalRole: string
): Record<string, unknown> {
  // Capture agent_info before public sanitization strips it
  const agentInfo = listing.agent_info as Record<string, unknown> | null | undefined;
  const isBuyerOrTenant = portalRole === "buyer" || portalRole === "tenant";

  // Portal users are authenticated → use VOW-tier sanitization (enriched data)
  const result = sanitizeForVOW(listing);

  // Re-add agent_info in appropriate shape
  if (isBuyerOrTenant) {
    result.agent_info = agentInfo
      ? { company: agentInfo.company ?? agentInfo.ListOfficeName ?? null }
      : null;
  } else {
    // Seller/landlord sees their agent's info
    result.agent_info = agentInfo ?? null;
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
  agent_info: unknown;
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
  // Owner opt-out: listing must not be shown at all (UCBA Art. I, Sec. 4(A))
  if (listing.owner_opt_out) return null;

  // Participant Only: visible to RLS participants only, not portal/public (UCBA Gate 2)
  if (listing.participant_only) return null;

  // Internet display opt-out: listing cannot appear on any website/portal (RLS Gate 3)
  if (listing.internet_entire_listing_display_yn === false) return null;

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
    internet_address_display_yn: listing.internet_address_display_yn,
  };

  return sanitizeForPortal(flat, portalRole);
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
