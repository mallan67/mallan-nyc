/**
 * CANONICAL LISTING CAPABILITY MODEL — replaces `agent_id`-as-ownership.
 *
 * See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A.
 *
 * THE DEFECT THIS REPLACES. Thirteen CRM sites gated writes with:
 *
 *     auth.role !== "BROKER" && listing.agent_id !== auth.userId  ->  403
 *
 * That single predicate answers a question the data cannot support.
 * `syncAgentHistory` stamps `Listing.agent_id` on matches against BOTH
 * `ListAgentMlsId` AND `BuyerAgentMlsId`, so on a synced row it records
 * "this Mallan agent appears in this listing's history" — an association.
 * Read as ownership it granted full CRM write authority to:
 *
 *   * any BROKER on ANY row in the table, including third-party IDX inventory
 *     Mallan does not list; and
 *   * any agent who merely appeared as the BUYER agent on a third-party row.
 *
 * Both paths mutate Cotality-source-owned data through a system that, by
 * charter, never writes back to Cotality.
 *
 * WHY DISTINCT CAPABILITIES AND NOT ONE `ownsListing`. On one and the same row
 * the correct answers differ: an agent with a buyer-side history association on
 * a third-party listing SHOULD still see the history and schedule a private
 * client showing, but MUST NOT get media authority or a seller report.
 * Collapsing these into one boolean is exactly how the original defect arose,
 * so this module deliberately exposes them separately.
 *
 * FAIL-CLOSED. Every capability defaults to `false`. Unknown roles, unknown
 * provenance and unresolved associations all deny.
 */

import {
  isMallanLocalListing,
  isMallanRlsReturnCopy,
  type MallanSourceIdentityRow,
} from '@/lib/listings/mallan-source-identity';

/**
 * Which of the three charter concepts this row is.
 *
 * `mallan-local`           Mallan-AUTHORED (`SL-`/`RL-` or `rls_eligible=false`).
 *                          Mallan owns the data and the media. Editable.
 * `mallan-rls-return-copy` Mallan's own listing returned through Cotality.
 *                          Cotality-SOURCE-owned. Publicly suppressed, retained
 *                          internally, never mutated through the CRM.
 * `third-party-rls`        Normal IDX inventory. Source-owned, never mutated.
 */
export type ListingSourceClass =
  | 'mallan-local'
  | 'mallan-rls-return-copy'
  | 'third-party-rls';

/** The authenticated Mallan staff member making the request. */
export interface CapabilityActor {
  userId: bigint;
  /** `"BROKER"` | `"AGENT"` (schema.prisma:42 default `"AGENT"`). */
  role: string;
}

/** The listing columns required to decide authority. */
export interface CapabilityListing extends MallanSourceIdentityRow {
  /**
   * CRM history/roster association. NOT ownership on any synced row.
   * On a `mallan-local` row it IS a legitimate assignment, because the local
   * creation/assignment path — not `syncAgentHistory` — owns that write.
   */
  agent_id?: bigint | number | null;
  /**
   * Non-null exactly on rows the Trestle sync has written. Used for the
   * cursor-safety decision below; see `isTrestleCursorBearing`.
   */
  last_synced_from_trestle?: Date | null;
}

export interface ListingCapabilities {
  sourceClass: ListingSourceClass;

  /**
   * TRUE when a CRM write to this row would corrupt the incremental sync
   * watermark.
   *
   * `getLastSyncTimestamp()` (lib/idx/sync.ts) computes
   *   MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
   * and feeds it to the OData filter `ModificationTimestamp gt SINCE`.
   *
   * PR-S.7 already excluded CRM-ONLY rows from that MAX. It did NOT close this
   * variant: a SYNCED row passes the `IS NOT NULL` filter, so a CRM writer
   * setting `modification_timestamp: new Date()` pushes the cursor to local NOW
   * and the next incremental run skips every genuine upstream change until real
   * Trestle timestamps catch up. Callers must not bump the watermark on a
   * cursor-bearing row.
   */
  isTrestleCursorBearing: boolean;

  /**
   * Read this listing's internal record: history, association, source
   * comparison, reconciliation, audit. This is what `agent_id` legitimately
   * supports on a synced row, and it is why the return-copy stays internally
   * visible while being publicly suppressed.
   */
  mayViewHistory: boolean;

  /**
   * Arrange a PRIVATE client showing. Deliberately NOT gated on source
   * ownership: a Mallan buyer-side agent must keep working on inventory Mallan
   * does not list. A private showing is not a Mallan public open house.
   */
  mayScheduleClientShowing: boolean;

  /** Create/amend/withdraw the Mallan-authored LOCAL listing and its fields. */
  mayManageMallanLocalListing: boolean;

  /**
   * Create/amend a Mallan PUBLIC open house. Local rows only — the local twin
   * is where the public open house lives. A Cotality `OpenHouse` record is at
   * most an extra upstream source and is NEVER a precondition.
   */
  mayManageMallanPublicOpenHouse: boolean;

  /**
   * View the seller-side performance report. Mallan represents the seller only
   * on its own local listings; a buyer-side history association on someone
   * else's listing must never expose seller analytics.
   */
  mayViewSellerReport: boolean;

  /**
   * Manage EXISTING Mallan-owned (`crm:`) media on this listing — reorder,
   * delete, set-as-main.
   *
   * DELIBERATELY NOT local-only. Media ownership is decided by the KEY
   * NAMESPACE, not by the row the media hangs on: "returned Cotality media
   * remains Cotality-owned, local `crm:` media remains Mallan-owned". Genuine
   * historical Mallan uploads do sit on RLS rows, and gating this on
   * `mallan-local` would leave them permanently unmanageable — undeletable and
   * unreorderable by anyone.
   *
   * The SOURCE protection here is per-ITEM, not per-listing: callers must still
   * apply `isCrmMediaKey()` to every key they touch, which is what stops a feed
   * photo from being reordered or deleted through the CRM.
   */
  mayManageLocalMedia: boolean;

  /**
   * Upload NEW Mallan media to this listing. Local rows ONLY.
   *
   * New Mallan media belongs on the local canonical listing. Adding it to the
   * RLS return-copy would attach it to a publicly suppressed row (invisible),
   * and adding it to a third-party listing would mean publishing another
   * brokerage's listing with Mallan-authored content — an IDX display problem,
   * not merely an architectural one.
   */
  mayUploadNewLocalMedia: boolean;

  /**
   * Edit a field whose value is DERIVED FROM THE FEED on a source-owned row.
   *
   * ALWAYS FALSE, for every actor and every class. Mallan never writes back to
   * Cotality, so such an edit could only ever be a local divergence that the
   * next sync silently overwrites — and, because CRM writers stamp
   * `modification_timestamp`, it would also poison the sync cursor. On a
   * `mallan-local` row the question does not arise: those fields are not
   * source-derived, and `mayManageMallanLocalListing` governs them.
   */
  mayEditSourceDerivedThirdPartyField: boolean;
}

/**
 * The columns `listingCapabilities()` reads. Spread this into any route-local
 * `select` that feeds the decision.
 *
 * WHY THIS EXISTS. A narrowed `select` does not fail — it silently yields
 * `undefined` for the missing identity columns, so a Mallan RLS return-copy
 * would classify as `third-party-rls`. Mutation stays denied either way (both
 * are source-owned), but `sourceClass` would be wrong wherever it is reported,
 * and a future capability keyed on the return-copy would be inert. Three of the
 * media routes had exactly this narrowing.
 */
export const CAPABILITY_LISTING_SELECT = {
  listing_id: true,
  agent_id: true,
  rls_eligible: true,
  list_office_mls_id: true,
  last_synced_from_trestle: true,
} as const;

/** Classify a row into exactly one of the three charter concepts. */
export function classifyListingSource(listing: CapabilityListing): ListingSourceClass {
  if (isMallanLocalListing(listing)) return 'mallan-local';
  if (isMallanRlsReturnCopy(listing)) return 'mallan-rls-return-copy';
  return 'third-party-rls';
}

/**
 * Normalize the role column. Canonical values are uppercase (`schema.prisma:42`
 * defaults to `"AGENT"`); three of the thirteen original sites already
 * uppercased and the rest did not, so a broker was recognized inconsistently
 * across routes. Normalizing here removes that split. It cannot widen source
 * mutation, because no capability below grants mutation on a synced row to any
 * role.
 */
function normalizeRole(role: string): string {
  return String(role ?? '').trim().toUpperCase();
}

/** TRUE when the actor is this listing's recorded association. */
function isAssociatedAgent(actor: CapabilityActor, listing: CapabilityListing): boolean {
  if (listing.agent_id == null || actor.userId == null) return false;
  // The column is BigInt; some call sites carry a JS number. Compare as strings
  // so `42n` and `42` agree and neither is coerced into a lossy Number.
  return String(listing.agent_id) === String(actor.userId);
}

/**
 * Decide every capability for one actor against one listing.
 *
 * Pure and synchronous — no DB access — so routes can call it immediately after
 * they load the row, and so the decision is directly unit-testable.
 */
export function listingCapabilities(
  actor: CapabilityActor,
  listing: CapabilityListing,
): ListingCapabilities {
  const sourceClass = classifyListingSource(listing);
  const role = normalizeRole(actor.role);
  const isBroker = role === 'BROKER';
  const isStaff = isBroker || role === 'AGENT';
  const isAssociated = isAssociatedAgent(actor, listing);

  /**
   * Mallan owns this row's data. NOTE: the return-copy is deliberately EXCLUDED
   * — it carries Mallan's list-side identity but remains Cotality-source-owned.
   * That distinction is the whole point of keeping concepts (1) and (2) apart.
   */
  const mallanOwnsData = sourceClass === 'mallan-local';

  /**
   * Broker administration, or the legitimate assigned local agent. On a local
   * row `agent_id` IS a real assignment, so this preserves the existing
   * local workflow byte-for-byte.
   */
  const mayAdministerLocal = mallanOwnsData && (isBroker || isAssociated);

  return {
    sourceClass,
    isTrestleCursorBearing: listing.last_synced_from_trestle != null,

    // Association/roster reading — the one thing `agent_id` genuinely supports
    // on a synced row. Keeps the return-copy internally visible for
    // reconciliation and audit.
    mayViewHistory: isBroker || isAssociated,

    // Any authenticated Mallan agent/broker, on any source class.
    mayScheduleClientShowing: isStaff,

    mayManageMallanLocalListing: mayAdministerLocal,
    mayManageMallanPublicOpenHouse: mayAdministerLocal,
    mayViewSellerReport: mayAdministerLocal,

    // Namespace-scoped, not row-scoped — see the field doc. Callers MUST still
    // gate each key with `isCrmMediaKey()`.
    mayManageLocalMedia: isBroker || isAssociated,
    mayUploadNewLocalMedia: mayAdministerLocal,

    // Structurally denied — see the field doc above.
    mayEditSourceDerivedThirdPartyField: false,
  };
}

/** Canonical 403 payloads, so every route denies with the same shape. */
export const CAPABILITY_DENIED = {
  /** The actor has no relationship to this row at all. */
  ACCESS: { error: 'Access denied' },
  /**
   * The row is Cotality-source-owned. Distinct from ACCESS on purpose: the
   * actor may be a broker with full CRM rights and still not be permitted to
   * mutate feed-owned data.
   */
  SOURCE_OWNED: {
    error: 'This listing is source-owned by the RLS/Cotality feed and cannot be modified in the CRM',
    code: 'SOURCE_OWNED_LISTING',
  },
} as const;
