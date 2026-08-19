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
import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';

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
 * BUYER-SIDE PARTICIPATION — CODE COMPLETE, PRODUCTION MUTATION HELD.
 *
 * ── THE PROVIDER CONTRACT (live, 2026-08-17) ───────────────────────────────
 *   `BuyerAgentMlsId`     Edm.String, 500/500 populated on live Closed, FILTERABLE
 *   `CoBuyerAgentMlsId`   Edm.String, 2/500 — rare but real
 *   `BuyerOfficeMlsId`    Edm.String, 500/500
 *   `BuyerAgentFullName`  0/500 — names are NOT delivered; identities only
 *
 * VALUE VOCABULARY IS OPAQUE. Across 500 live Closed records: 473 numeric ids,
 * 18 `NONMEMBER`, 9 `TM6x` codes. Never coerce to a number.
 *
 * ONLY `NONMEMBER` IS A PROVEN NON-IDENTITY. A follow-up live test measured
 * distinct `BuyerOfficeMlsId` per value — an individual identity should not span
 * unrelated brokerages:
 *   NONMEMBER  8,216 rows, office ∈ {NONMEMBER, null}  -> placeholder, not a party
 *   TM61/62/63 25/40/12 rows, ALL office 7991          -> shaped like a real party
 * So `TM6x` are NOT classified as sentinels; doing so would silently DROP real
 * participation. See `UNVERIFIED_PROVIDER_ID_SHAPES`.
 *
 * ── BACKFILL PREDICATE IS A UNION, NOT `BuyerAgentMlsId ne null` ───────────
 * That single-field filter is INCOMPLETE — proven live:
 *   CoBuyerAgentMlsId ne null AND BuyerAgentMlsId eq null  -> 106 rows MISSED
 *   BuyerOfficeMlsId  ne null AND BuyerAgentMlsId eq null  -> 370 rows MISSED
 * The backfill therefore filters on the UNION of participation roles.
 *
 * ── BACKFILL POPULATION AND NULL SEMANTICS (explicit) ──────────────────────
 * POPULATION: every Mallan agent with a non-null `agents.trestle_mls_id`, one
 * bounded provider query each, filtered server-side to that agent's own id
 * across all four roles. NOT "every stored Cotality record" — that would be
 * 98,562 rows of third-party attribution Mallan has no use for.
 *
 * NULL AFTER BACKFILL IS AMBIGUOUS BY CONSTRUCTION, and that is accepted
 * deliberately: a NULL means EITHER "the provider reported no buyer-side party"
 * OR "this row was never in a backfilled agent's result set". Because the
 * predicate is participation-scoped, a NULL on a row belonging to no Mallan
 * agent is expected and carries no information. NULL must therefore never be
 * read as "proven absent" — only a populated value is evidence.
 */
export const BUYER_PARTICIPATION_HOLD = {
  /**
   * The CODE is complete and wired. What remains is the PRODUCTION MUTATION.
   *
   * ROLLOUT ORDER IS EXPAND -> BACKFILL -> DEPLOY, and it is not optional:
   *   1. apply migration `20260817190000_add_buyer_participation` (additive,
   *      nullable, metadata-only) while the CURRENTLY DEPLOYED code still
   *      ignores the columns;
   *   2. verify schema;
   *   3. dry-run then execute the bounded backfill;
   *   4. deploy THIS SHA, which reads the columns.
   *
   * Deploying this SHA BEFORE step 1 makes every personal-participation query
   * select a column production does not have — the 2026-04-19 silent-drift
   * failure. The expand-first order removes that window entirely and needs no
   * second "wire it afterward" deployment.
   */
  status: 'CODE_COMPLETE_AWAITING_PRODUCTION_MUTATION' as const,
  /** INDIVIDUAL roles prove PERSONAL participation; OFFICE roles prove BROKERAGE only. */
  requiredColumns: [
    'buyer_agent_mls_id',
    'co_buyer_agent_mls_id',
    'buyer_office_mls_id',
    'co_buyer_office_mls_id',
  ],
  providerFields: [
    'BuyerAgentMlsId',
    'CoBuyerAgentMlsId',
    'BuyerOfficeMlsId',
    'CoBuyerOfficeMlsId',
  ],
  /**
   * UNION of participation roles. A single-field filter misses 106 co-buyer-only
   * and 370 office-only rows (live-verified 2026-08-17).
   */
  backfillFilterTemplate:
    "BuyerAgentMlsId eq '{id}' or CoBuyerAgentMlsId eq '{id}' or ListAgentMlsId eq '{id}' or CoListAgentMlsId eq '{id}'",
  /** ONLY the proven non-identity. `TM6x` deliberately excluded — see doc above. */
  sentinelValues: ['NONMEMBER'],
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
        mallanAuthoredScope(),
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
    { AND: [mallanAuthoredScope(), { agent_id: toAgentIdFilter(identity.agentId) }] },
  ];

  // 2/3. COTALITY PARTICIPATION — LISTING SIDE AND BUYER SIDE.
  //
  // All four roles are proven participation and are treated identically: the
  // provider states this agent was the list, co-list, buyer or co-buyer agent on
  // the transaction. There is deliberately no separate "buyer subsystem" — one
  // contract answers "is this mine?" for every role.
  //
  // NO BLACKLIST HERE — DELIBERATELY.
  //
  // An earlier revision refused a set of provider strings (`NONMEMBER`, and
  // wrongly `TM61`/`TM62`/`TM63`) before comparing. That was the wrong control
  // in two ways:
  //
  //   1. It assigned SEMANTICS to opaque provider values without direct Cotality
  //      contract evidence. Observing that `TM6x` occurs proves nothing about
  //      what it means, and classifying it as "not an agent" would silently DROP
  //      real participation — each `TM6x` spans exactly one office (7991) and is
  //      indistinguishable in shape from a genuine identity.
  //   2. It is unnecessary. Comparison is EXACT: if the agent's verified identity
  //      is `39361`, then `NONMEMBER` and `TM61` simply do not equal it. A
  //      blacklist only ever grows, and every entry is a guess.
  //
  // THE CORRECT CONTROL IS UPSTREAM: `agents.trestle_mls_id` must itself be a
  // VERIFIED INDIVIDUAL Cotality member identity at the point it is stored or
  // associated. Validate the Mallan side once, then compare raw provider values
  // exactly. Anything not verified against Cotality stays unverified rather than
  // being promoted to a semantic by observation.
  //
  // (`NON_AGENT_SENTINELS` still exists in the mapper for the ONE value with
  // direct evidence — `NONMEMBER`, whose `BuyerOfficeMlsId` is also `NONMEMBER`
  // across 8,216 rows — but it is not a participation control.)
  if (identity.trestleMlsId) {
    clauses.push({ list_agent_mls_id: identity.trestleMlsId });
    clauses.push({ co_list_agent_mls_id: identity.trestleMlsId });
    // BUYER-SIDE CLAUSES ARE HELD (2026-08-19).
    //
    // `docs/operations/buyer-participation-schema-hold-2026-08-17.md` §7 lists
    // "Enable the two buyer-side clauses" as an UNCHECKED authorization box, and
    // states "None of these has been performed." These clauses were nonetheless
    // enabled unconditionally, and `listings.buyer_agent_mls_id` /
    // `co_buyer_agent_mls_id` DO NOT EXIST in production (verified 2026-08-19:
    // zero `%buyer%` columns on `listings`). Shipping this as-is would raise
    // Prisma P2022 on every personal-participation query — the exact
    // 2026-04-19 silent-drift failure mode (NEON.md Trap #1).
    //
    // Re-enable ONLY after the migration is authorized and applied. The prepared
    // migration is preserved verbatim at
    // `.cache/handoff/quarantined-migrations/` (sha256 cc7b5a5e…).
    //
    // Listing-side participation above is unaffected and remains fully correct.
  }

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

/**
 * Mallan-AUTHORED canonical rows.
 *
 * AUTHORSHIP IS THE `listing_id` NAMESPACE. `rls_eligible` was removed here as
 * a release blocker: it is a VISIBILITY/eligibility flag, not a source marker,
 * and using it as one is the category error the master plan's §4 separation
 * exists to prevent. See `isMallanLocalListing`, the canonical owner, for the
 * full rationale and the production proof that this changes nothing today
 * (7 = 7 rows, 0 reclassified).
 *
 * Mirrors `LOCAL_PREFIXES` in lib/listings/mallan-source-identity.ts. Kept as a
 * Prisma `where` fragment because a predicate cannot call that function, but it
 * must stay in lockstep — `personal-participation.test.ts` pins the pair.
 */
export function mallanAuthoredScope(): Prisma.ListingWhereInput {
  return {
    OR: [
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
    ],
  };
}

/**
 * Is this row Mallan-authored (locally created, locally editable)?
 *
 * Used by readers that must guarantee Mallan-authored listings are never
 * crowded out of a capped, provider-dominated result set — defect (3).
 */
export function isMallanAuthoredRow(row: { listing_id?: string | null }): boolean {
  // DELEGATES to the canonical source-identity owner — one decision, not a
  // local reimplementation that can drift. `rls_eligible` is deliberately NOT
  // an input: it is a visibility flag, not evidence of authorship.
  return isMallanLocalListing({ listing_id: row.listing_id ?? null });
}
