/**
 * DTO (Data Transfer Object) Enforcement Layer
 *
 * REBNY/RLS + Security: Different consumers get different data shapes.
 * This module enforces the principle that:
 *   - CRM endpoints return internal fields (still least-privilege)
 *   - Portal endpoints return client-scoped data (no agent PII, no internal notes)
 *   - Public endpoints return sanitized IDX-compliant data only
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
  ...REMOVED_FIELDS,
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

  // Null out private remarks (may be in nested structure)
  result.privateRemarks = null;
  result.showingRemarks = null;

  // Null out compensation in nested buyer object
  if (result.buyer && typeof result.buyer === "object") {
    const buyer = { ...(result.buyer as Record<string, unknown>) };
    buyer.buyerAgentCompensation = "";
    buyer.buyerAgentCompensationType = "";
    result.buyer = buyer;
  }

  // Address suppression: InternetAddressDisplayYN
  const addressDisplayYN =
    result.internet_address_display_yn ??
    result.InternetAddressDisplayYN;
  if (addressDisplayYN === false) {
    result.address = { street: "Address Undisclosed" };
    delete result.StreetNumber;
    delete result.StreetName;
    delete result.UnitNumber;
    delete result.UnParsedAddress;
    delete result.Latitude;
    delete result.Longitude;
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
  // Start with public sanitization
  const result = sanitizeForPublic(listing);

  const isBuyerOrTenant = portalRole === "buyer" || portalRole === "tenant";

  // Agent info masking for buyer/tenant portals
  if (isBuyerOrTenant && result.agent_info && typeof result.agent_info === "object") {
    const agentInfo = result.agent_info as Record<string, unknown>;
    result.agent_info = {
      company: agentInfo.company ?? agentInfo.ListOfficeName ?? null,
    };
  }

  return result;
}

/**
 * Sanitize a listing for CRM (internal) display.
 * Strips only truly forbidden fields (removed compensation fields).
 * CRM users see everything else — they're authorized.
 */
export function sanitizeForCRM(listing: Record<string, unknown>): Record<string, unknown> {
  const result = { ...listing };

  // Even CRM endpoints should not return removed compensation fields
  for (const field of REMOVED_FIELDS) {
    delete result[field];
  }

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
