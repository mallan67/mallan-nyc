/**
 * CRM LISTINGS SCOPE — which listings the operational CRM screen may show.
 *
 * Pure and dependency-free (beyond the canonical Mallan identity constant) so
 * the population can be proven behaviourally instead of by matching strings in
 * the route file.
 *
 * THE POPULATION IS:
 *   1. Mallan-AUTHORED local listings (`SL-`/`RL-`, no `mls_id`), excluding the
 *      statuses hidden from the operational screen.
 *   2. Mallan's OWN closed provider deals — terminal status AND a verified
 *      Mallan list-side office identity.
 *
 * Active/Pending provider listings are managed through REBNY RLS, not the CRM,
 * and third-party inventory is never Mallan company inventory.
 *
 * OWNERSHIP IS LIST-SIDE OFFICE IDENTITY, NEVER `agent_id`.
 * `lib/listings/mallan-source-identity.ts` states the rule: `agent_id` is a CRM
 * history/roster association written by `syncAgentHistory` from BOTH list-side
 * and BUYER-side matches. Production carries the worked counter-example — a
 * Closed row whose `agent_id` is the principal broker's while its
 * `list_office_mls_id` is another brokerage's, from her previous firm. Treating
 * `agent_id` as ownership would claim that listing as Mallan inventory.
 *
 * Buyer-side and co-broker closed transaction history is a DEAL/HISTORY
 * association rather than listing ownership. It is deliberately NOT included
 * here; it has its own surface at `/api/crm/past-deals`.
 */
import { MALLAN_LIST_OFFICE_MLS_IDS } from "@/lib/listings/mallan-source-identity";

/** Terminal provider statuses a closed Mallan deal may carry. */
export const TRESTLE_CLOSED = ["Closed", "Sold", "Leased", "Rented"] as const;

/** Statuses never shown on the operational CRM listings screen. */
export const CRM_HIDDEN = ["Withdrawn", "Cancelled"] as const;

/** Maximum page size. A security limit (NY SHIELD bulk-extraction), not a default. */
export const MAX_PAGE_SIZE = 200;

/** Page size applied when the caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 50;

export interface CrmListingsScopeOptions {
  /** Authenticated role. Only "BROKER" sees the whole brokerage. */
  role: string;
  /** Authenticated agent id, applied when the role is not BROKER. */
  userId: unknown;
  /** Optional "sale" | "rent" narrowing. */
  type?: string | null;
  /** Optional exact-status narrowing. */
  status?: string | null;
}

/**
 * Build the Prisma `where` for the CRM listings reader.
 *
 * Runtime behaviour is identical to the inline construction it replaces, except
 * that the closed-provider clause is now restricted to Mallan's own list-side
 * office identity.
 */
export function buildCrmListingsWhere(
  opts: CrmListingsScopeOptions
): Record<string, unknown> {
  const crmCreated = {
    mls_id: null,
    listing_id: { startsWith: "SL-" },
    status: { notIn: [...CRM_HIDDEN] },
  };
  const crmCreatedRental = {
    mls_id: null,
    listing_id: { startsWith: "RL-" },
    status: { notIn: [...CRM_HIDDEN] },
  };
  const mallanClosedDeal = {
    mls_id: { not: null },
    status: { in: [...TRESTLE_CLOSED] },
    list_office_mls_id: { in: [...MALLAN_LIST_OFFICE_MLS_IDS] },
  };

  const where: Record<string, unknown> = {
    OR: [crmCreated, crmCreatedRental, mallanClosedDeal],
  };

  // Ownership: an agent sees only their own rows; a broker sees the brokerage.
  if (opts.role !== "BROKER") {
    where.agent_id = opts.userId;
  }

  if (opts.type) where.listing_type = opts.type;
  if (opts.status) where.status = opts.status;

  return where;
}

/**
 * Resolve the effective page size and report whether the caller's request was
 * reduced. The cap itself is unchanged; it is simply no longer silent.
 */
export function resolvePageSize(rawLimit: string | null): {
  requestedLimit: number;
  limit: number;
  limitClamped: boolean;
  maxLimit: number;
} {
  const requestedLimit =
    rawLimit === null || rawLimit === ""
      ? DEFAULT_PAGE_SIZE
      : parseInt(rawLimit) || DEFAULT_PAGE_SIZE;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);
  return {
    requestedLimit,
    limit,
    limitClamped: limit !== requestedLimit,
    maxLimit: MAX_PAGE_SIZE,
  };
}
