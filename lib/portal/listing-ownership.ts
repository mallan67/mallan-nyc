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

/**
 * Resolve THE listing an owner-role lead is looking at, from the canonical
 * owner relation.
 *
 * WHY THIS EXISTS
 * ---------------
 * "My listing" had two answers. The canonical one is `Listing.owner_client_id`
 * — a real FK, enforced everywhere through `canAccessOwnerListing`. The other
 * was `Lead.active_sale_listing_id` / `active_rental_listing_id`: plain nullable
 * String columns holding a `listing_id` TEXT value, with no FK, no unique
 * constraint and no index. The seller and landlord dashboards resolved purely
 * from that string:
 *
 *     findFirst({ where: { listing_id: lead.active_sale_listing_id } })
 *
 * with no ownership check at all. Two consequences:
 *
 *   1. `POST /api/crm/listings` writes `owner_client_id` and never touches the
 *      Lead row, so a listing created through the normal CRM path left the
 *      seller's own dashboard reporting `{ listing: null }` — the client was
 *      told they had no listing.
 *   2. An unverified string was the only thing between a lead and that
 *      listing's data. It is consistent today because exactly one writer sets
 *      it (crm/convert) and nothing ever clears it, but a string is not an
 *      authorization boundary.
 *
 * The backref is now a HINT — which listing is the active one when an owner has
 * several — and never the authority for whether the listing is theirs. The
 * column keeps its meaning for the nine CRM surfaces that read it; it simply
 * cannot grant access any more.
 *
 * Fail-closed: an owner who owns nothing resolves to null, whatever the hint says.
 */
export interface OwnerListingRow {
  listing_id: string;
  [key: string]: unknown;
}

export async function resolveOwnerListing<T extends OwnerListingRow>(
  prismaClient: {
    listing: {
      findMany: (args: {
        where: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => Promise<T[]>;
    };
  },
  opts: {
    leadId: bigint;
    /** "sale" | "rent" — a seller dashboard must never surface a rental. */
    listingType: string;
    /** `Lead.active_*_listing_id`. Advisory only. */
    hintedListingId?: string | null;
    /** Optional projection; omit for the full row. */
    select?: Record<string, unknown>;
  },
): Promise<T | null> {
  const owned = await prismaClient.listing.findMany({
    // Ownership is the WHERE, not a post-filter — a listing the lead does not
    // own can never enter the candidate set in the first place.
    where: { owner_client_id: opts.leadId, listing_type: opts.listingType },
    orderBy: { modification_timestamp: "desc" },
    ...(opts.select ? { select: opts.select } : {}),
  });

  if (owned.length === 0) return null;

  const hinted = opts.hintedListingId?.trim();
  if (hinted) {
    const match = owned.find((row) => row.listing_id === hinted);
    // Only honoured when the lead ACTUALLY owns it. A stale or foreign hint
    // falls through to their own most recent listing rather than reaching
    // outside the owned set.
    if (match) return match;
  }

  return owned[0];
}
