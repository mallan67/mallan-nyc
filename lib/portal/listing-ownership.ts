/**
 * Owner-portal listing authorization (REBNY Art. III §2 confidentiality).
 *
 * Owner-private listing data — price-change history, marketing log, and "comps for YOUR listing" —
 * may be read by:
 *   - an AGENT/BROKER session (full CRM access — the same bypass `requirePortalRole` already grants), or
 *   - the LEAD who OWNS the listing (`Listing.owner_client_id === their lead id`).
 * Any other lead is denied. Fail-closed: an UNOWNED listing (null owner_client_id) is NOT accessible
 * to a lead.
 *
 * This is the seam the `/api/portal/showings` + `/offers` routes already enforce via an
 * `owner_client_id` filter; the by-`listingId` routes (price-history, marketing, comparables) must run
 * this against the FETCHED `owner_client_id` and treat denial as **404** — never 403, which would leak
 * the listing's existence to a non-owner.
 */
export interface OwnerAccessAuth {
  /** "lead" (portal client) | "agent" (CRM staff). Agents/brokers bypass ownership. */
  userType: string;
  /** The authenticated principal's id (for a lead, compared against owner_client_id). */
  userId: bigint;
}

/**
 * True iff `auth` may read owner-private data for a listing whose owner is `ownerClientId`.
 * Agents/brokers: always. Leads: only if they own it. Unowned listing + lead: false (fail-closed).
 */
export function canAccessOwnerListing(
  auth: OwnerAccessAuth,
  ownerClientId: bigint | null | undefined,
): boolean {
  if (auth.userType === "agent") return true;
  if (ownerClientId == null) return false;
  return ownerClientId === auth.userId;
}

/**
 * The lead's effective access set, resolved with the SAME precedence as `requireWorkspace` /
 * `/api/auth/me`: `enabled_workspaces` when present, else legacy `roles[]`, else `portal_role`.
 * Single source of truth so per-route owner detection cannot drift (the comparables IDOR was a
 * route-local `portal_role ===` check that ignored workspaces — Codex #458 round 5).
 */
export function leadAccessRoles(lead: {
  portal_role?: string | null;
  enabled_workspaces?: string[] | null;
  roles?: string[] | null;
} | null | undefined): string[] {
  if (lead?.enabled_workspaces?.length) return lead.enabled_workspaces;
  if (lead?.roles?.length) return lead.roles;
  return lead?.portal_role ? [lead.portal_role] : [];
}

/**
 * True iff the lead is an OWNER (seller or landlord) by effective access set. Routes that also admit
 * buyers (e.g. comparables) use this to decide whether ownership enforcement must run — a buyer with
 * no owner workspace gets public data, an owner (by role OR workspace) must own the subject listing.
 */
export function isOwnerLead(lead: {
  portal_role?: string | null;
  enabled_workspaces?: string[] | null;
  roles?: string[] | null;
} | null | undefined): boolean {
  const roles = leadAccessRoles(lead);
  return roles.includes("seller") || roles.includes("landlord");
}
