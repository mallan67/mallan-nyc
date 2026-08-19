// lib/crm/personal-participation.ts
//
// THE CANONICAL ANSWER TO "IS THIS LISTING *MINE*?"
//
// ─────────────────────────────────────────────────────────────────────────────
// THE INCIDENT THIS CLOSES (2026-08-17)
//
// CRM → Operations → My Listings showed ~178 Closed listings, of which NONE
// were Maya's. Reproduced exactly against production: the reader returned 200
// rows, 200 Closed, 0 hers, and 0 Mallan SL-. Three defects compounded:
//
//   1. The predicate `{ mls_id: { not: null }, status: { in: TERMINAL } }`
//      carried NO participation test, so it matched every Cotality terminal row
//      in the database — 522 rows spanning 387 distinct list agents across 65
//      offices.
//   2. `if (auth.role !== "BROKER") { where.agent_id = auth.userId }` — the
//      broker branch SKIPPED the only ownership constraint, so for the
//      principal broker there was no scoping at all.
//   3. `orderBy: updated_at desc, take: 200` — 426 continuously-resynced
//      provider rows sorted ahead of both Mallan SL- listings and the broker's
//      own 33 genuine records, so the visible window was 100% strangers.
//
// Verified against LIVE Cotality, not inferred: 12 sampled contaminating rows
// had list agents 71992/32768/56482/49557/… and Maya (39361) participated in
// ZERO of them. Conversely 6/6 of the rows we SHOULD show verified as
// `ListAgentMlsId = 39361 → "Maya Allan, MAllan Real Estate Inc"`.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT "PERSONAL" MEANS, AND WHAT IT DOES NOT
//
// Personal participation is a PROVEN role on the transaction. It is NOT:
//   - every row in `listings`;
//   - every Cotality row recently synced;
//   - brokerage-wide or office-wide inventory;
//   - "the provider record exists and we happen to store it".
//
// Brokerage-wide supervision is a SEPARATE operating scope
// (`ParticipationScope.BROKERAGE`). It must never leak into the personal
// dataset — a broker's own "My Listings" is still their own participation. That
// is the specific defect (2) above.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COTALITY IDENTITY FIELD — LIVE VERIFIED, NOT ASSUMED
//
// The provider identity for an agent is `ListAgentMlsId` (`Edm.String`), and the
// stored column is `list_agent_mls_id`. Confirmed live on 2026-08-17: six
// records carrying `39361` all returned `ListAgentFullName = "Maya Allan"`,
// `ListOfficeName = "MAllan Real Estate Inc"` (one under her prior brokerage,
// correctly still hers historically).
//
// `co_list_agent_mls_id` is included because co-listing IS participation:
// `CoListAgentMlsId` is populated on 161/500 live Closed records.

import type { Prisma } from '@prisma/client';

/**
 * Which operating scope a CRM read is being performed in.
 *
 * These are DIFFERENT PRODUCTS, not a permission gradient. A broker has access
 * to both; that is not a reason to merge them.
 */
export type ParticipationScope =
  /** "My Listings" / "My Business" — the caller's own proven participation. */
  | 'personal'
  /** Brokerage supervision — every listing the brokerage participates in. */
  | 'brokerage';

export interface ParticipationIdentity {
  /**
   * Mallan `agents.id` — owns Mallan-authored SL-/RL- rows.
   *
   * `listings.agent_id` is `BigInt` in Prisma, so callers may pass whatever
   * shape their auth layer holds and this module normalises it once. Coercing
   * at the boundary is deliberate: a string/bigint mismatch here silently
   * matches NOTHING, which would look exactly like "this agent owns no
   * listings" — the failure mode that hid the Mallan SL- rows in the first place.
   */
  agentId: string | number | bigint;
  /**
   * The agent's Cotality `ListAgentMlsId` (`agents.trestle_mls_id`).
   *
   * NULL for an agent with no RLS membership. That is NOT an error and must NOT
   * fail open: an agent without a provider identity simply has no provider-side
   * participation, and sees only their Mallan-authored listings.
   */
  trestleMlsId: string | null;
  /** The brokerage's Cotality office id(s), for `scope: 'brokerage'` only. */
  officeMlsIds?: string[];
}

/**
 * BUYER-SIDE PARTICIPATION — DELIBERATELY NOT YET QUERYABLE.
 *
 * ── THE PROVIDER CONTRACT IS PROVEN AND COMPLETE (live, 2026-08-17) ─────────
 *   `BuyerAgentMlsId`     Edm.String, populated 500/500 on live Closed records,
 *                         FILTERABLE (so a historical backfill is feasible).
 *   `CoBuyerAgentMlsId`   Edm.String, populated 2/500 — rare but real.
 *   `BuyerOfficeMlsId`    Edm.String, populated 500/500.
 *   `BuyerAgentFullName`  populated 0/500 — names are NOT delivered; IDs only.
 *
 *   VALUE VOCABULARY IS NOT PURELY NUMERIC. Across 500 live Closed records:
 *     473  numeric MLS id
 *      18  `NONMEMBER`   (buyer agent outside RLS membership; 8,212 feed-wide)
 *       9  team codes    (`TM61`, `TM62`, `TM63`)
 *   So any mapping MUST treat this as an opaque string with sentinel values —
 *   never coerce to a number, and never treat `NONMEMBER` as an agent id.
 *
 *   Maya's actual buyer-side participation: 6 Closed records (2023-10 → 2025-10),
 *   4 of which are dual-agency (she is both list and buyer agent) and 2 of which
 *   are pure buyer representation (list agents 51215 and 46950).
 *
 * ── WHY IT CANNOT BE QUERIED TODAY ─────────────────────────────────────────
 * Mallan does not store it. `listings` has `list_agent_mls_id` and
 * `co_list_agent_mls_id` but NO buyer-side column; `raw_data` has been shed
 * (the `BuyerAgentMlsId` key is present on 0 rows); and `past_deals` is empty.
 * So buyer-side history is unreachable by any query until the column exists.
 *
 * Adding it is a SCHEMA MIGRATION + PRODUCTION BACKFILL, both of which are
 * standing authorization holds. See `BUYER_PARTICIPATION_HOLD` below for the
 * exact prepared change.
 *
 * THE POINT OF THIS CONSTANT: the resolver below is already shaped so buyer-side
 * enters through the SAME participation contract — one additional OR-clause —
 * rather than requiring a different architecture later.
 */
export const BUYER_PARTICIPATION_HOLD = {
  status: 'AWAITING_AUTHORIZATION' as const,
  requiredColumns: ['buyer_agent_mls_id', 'co_buyer_agent_mls_id', 'buyer_office_mls_id'],
  providerFields: ['BuyerAgentMlsId', 'CoBuyerAgentMlsId', 'BuyerOfficeMlsId'],
  backfillFilter: "BuyerAgentMlsId ne null",
  sentinelValues: ['NONMEMBER', 'TM61', 'TM62', 'TM63'],
} as const;

/**
 * The canonical participation predicate.
 *
 * ONE owner, so no route can invent a second opinion about ownership — which is
 * exactly how the reader and the dashboard drifted apart (the dashboard DID
 * filter on `agent_id`; "My Listings" did not).
 *
 * SCOPE IS AN EXPLICIT ARGUMENT, never derived from role. Deriving it from role
 * is defect (2): it silently converted the principal broker's personal screen
 * into global inventory.
 */
export function participationWhere(
  identity: ParticipationIdentity,
  scope: ParticipationScope,
): Prisma.ListingWhereInput {
  if (scope === 'brokerage') {
    const offices = (identity.officeMlsIds ?? []).filter(Boolean);
    // Fail CLOSED: a brokerage scope with no proven office identity must not
    // degrade into "everything". It returns nothing rather than the whole table.
    if (offices.length === 0) return { id: { in: [] } };
    return {
      OR: [
        mallanAuthoredAny(),
        { list_office_mls_id: { in: offices } },
        { co_list_office_mls_id: { in: offices } },
      ],
    };
  }

  const clauses: Prisma.ListingWhereInput[] = [
    // 1. MALLAN-AUTHORED CANONICAL LISTINGS — created locally so they stay
    //    editable (MALLAN-PLATFORM-MASTER-PLAN §4.2). These are owned by the
    //    Mallan agent record, never by a provider identity, and must survive
    //    even when the agent has no RLS membership at all.
    { AND: [mallanAuthoredAny(), { agent_id: toAgentIdFilter(identity.agentId) }] },
  ];

  // 2. COTALITY LISTING-SIDE PARTICIPATION — the provider says this agent is
  //    the list agent (or co-list agent) on the transaction.
  if (identity.trestleMlsId) {
    clauses.push({ list_agent_mls_id: identity.trestleMlsId });
    clauses.push({ co_list_agent_mls_id: identity.trestleMlsId });
  }

  // 3. COTALITY BUYER-SIDE PARTICIPATION — intentionally absent.
  //    When `buyer_agent_mls_id` is authorized and backfilled this becomes:
  //        clauses.push({ buyer_agent_mls_id: identity.trestleMlsId });
  //        clauses.push({ co_buyer_agent_mls_id: identity.trestleMlsId });
  //    and nothing else in this file, or in any caller, has to change.
  //    See BUYER_PARTICIPATION_HOLD.

  return { OR: clauses };
}

/**
 * Normalise an agent id to the BigInt shape `listings.agent_id` uses.
 *
 * Returns a filter that matches NOTHING when the id is unparseable, rather than
 * throwing or — far worse — omitting the constraint and matching everything.
 * "Match nothing" is the fail-closed direction for an ownership predicate.
 */
function toAgentIdFilter(agentId: string | number | bigint): bigint | { in: never[] } {
  try {
    return BigInt(agentId);
  } catch {
    return { in: [] };
  }
}

/** Mallan-authored canonical rows, by the repo's existing identity convention. */
function mallanAuthoredAny(): Prisma.ListingWhereInput {
  return {
    OR: [
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
      { rls_eligible: false },
    ],
  };
}

/**
 * Is this row Mallan-authored (locally created, locally editable)?
 *
 * Used by readers that must guarantee Mallan-authored listings are never
 * crowded out of a capped, provider-dominated result set — defect (3).
 */
export function isMallanAuthoredRow(row: {
  listing_id?: string | null;
  rls_eligible?: boolean | null;
}): boolean {
  const id = row.listing_id ?? '';
  return id.startsWith('SL-') || id.startsWith('RL-') || row.rls_eligible === false;
}
