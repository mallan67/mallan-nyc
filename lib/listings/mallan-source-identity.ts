/**
 * CANONICAL READ-SIDE MALLAN LIST-SIDE IDENTITY + RLS RETURN-COPY CLASSIFIER.
 *
 * See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A. Three concepts, deliberately
 * distinct — conflating them is the defect this module exists to prevent:
 *
 *   1. `isMallanExclusiveListing()` — Mallan-AUTHORED local listing (`SL-`/`RL-`
 *      prefix). A distribution flag never proves authorship.
 *      NOT broadened here, and NOT re-implemented here.
 *   2. **Mallan RLS return-copy** (this module) — an inbound Cotality/RLS row
 *      whose VERIFIED LIST-SIDE identity is Mallan. Still Cotality-SOURCE-OWNED
 *      data: its media stays Cotality-owned and must never enter the `crm:`
 *      namespace. It is only barred from being the PUBLIC CANONICAL listing.
 *   3. Third-party RLS/IDX — normal public inventory, untouched.
 *
 * WHY A RETURN-COPY EXISTS AT ALL: Mallan enters its listing into RealPlus,
 * RealPlus submits to REBNY RLS, and the listing returns to Mallan through
 * Cotality as an `RLS*` row. That return trip is OUTSIDE this system; Mallan
 * never writes back. The local `SL-`/`RL-` row stays canonical and the returned
 * copy is publicly suppressed but retained for audit/reconciliation.
 *
 * IDENTITY IS SOURCE-FIELD ONLY. Never `agent_id` (that is a CRM history/roster
 * association — `syncAgentHistory` sets it from BOTH list-side and BUYER-side
 * matches), never `owner_client_id`, never free-text brokerage-name matching.
 */

/**
 * Mallan's REBNY/RLS office identifier, for READ-SIDE classification.
 *
 * Verified live 2026-06-23: `ListOfficeMlsId '7041'` = "MAllan Real Estate Inc"
 * (the same evidence `lib/open-houses/upcoming-open-houses.ts` was built on).
 *
 * DELIBERATELY SEPARATE from `lib/syndication/mallan-identity.ts`
 * `MALLAN_OFFICE_MLS_IDS`, which is intentionally EMPTY because it gates the
 * HELD syndication/export program (PR #162/#163 empty-config guard). Reusing
 * that constant here would couple a read-side display decision to a held
 * distribution gate and could activate syndication. Do not merge them.
 */
export const MALLAN_LIST_OFFICE_MLS_IDS = ['7041'] as const;

/** The source fields required to classify a row's list-side identity. */
export interface MallanSourceIdentityRow {
  listing_id?: string | null;
  /** Typed column, populated by the Trestle mapper from `ListOfficeMlsId`. */
  list_office_mls_id?: string | null;
  /** Distribution setting; legacy feed stubs may also carry false. */
  rls_eligible?: boolean | null;
}

import {
  isMallanExclusiveListing,
  MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES,
} from '@/lib/listings/exclusive-agent-assignment';
import type { MallanTwinContext } from '@/lib/listings/mallan-twin-context';

/** TRUE when the row is a Mallan-authored LOCAL listing (canonical publicly). */
export function isMallanLocalListing(row: MallanSourceIdentityRow): boolean {
  return isMallanExclusiveListing(row);
}

/** A first-party distribution exemption requires proven Mallan authorship AND the explicit flag. */
export function isMallanWebsiteOnlyListing(row: MallanSourceIdentityRow): boolean {
  return row.rls_eligible === false && isMallanLocalListing(row);
}

/** Same authorship rule before DB pagination, count and address filtering. */
export function mallanLocalListingWhere(): {
  OR: Array<{ listing_id: { startsWith: string } }>;
} {
  return {
    OR: MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES.map((prefix) => ({
      listing_id: { startsWith: prefix },
    })),
  };
}

export function mallanWebsiteOnlyWhere() {
  return { rls_eligible: false, ...mallanLocalListingWhere() };
}

/**
 * TRUE when the row is a Cotality/RLS COPY of a Mallan-authored listing.
 *
 * Requires ALL of:
 *   * a verified Mallan list-side office id, AND
 *   * NOT being a Mallan-authored local row (a local row is concept 1, not 2), AND
 *   * PROOF that it duplicates one: its id is in `context.returnCopyIds`, i.e. it is the same physical unit (street number, name, zip AND unit) as a
 *     published Mallan-authored SL-/RL- row (lib/listings/mallan-twin-context.ts).
 *
 * The office id alone is NOT proof. A Mallan-office row with no local twin is Mallan's own listing entered straight into Cotality: it is the only
 * public record of that listing, so it is NOT a duplicate and is not suppressed (Master 4.4: suppress a duplicate, never the only copy).
 *
 * FAILS CLOSED on suppression: an absent/blank `list_office_mls_id`, or a unit with no proven twin, is never hidden as a duplicate.
 */
export function isMallanRlsReturnCopy(row: MallanSourceIdentityRow, context: MallanTwinContext): boolean {
  if (isMallanLocalListing(row)) return false;
  const office = typeof row.list_office_mls_id === 'string' ? row.list_office_mls_id.trim() : '';
  if (!office) return false;
  if (!(MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office)) return false;
  const id = typeof row.listing_id === 'string' ? row.listing_id : '';
  return id !== '' && context.returnCopyIds.includes(id);
}

/**
 * The agreement types that make a Mallan-listed Cotality row a Mallan EXCLUSIVE: the Sale form's own options plus the rental `ExclusiveRightToLease`
 * (rentals sourced only from Cotality). Co-Exclusive and open agreements are deliberately absent.
 */
export const MALLAN_LISTED_AGREEMENT_TYPES = ['ExclusiveRightToSell', 'ExclusiveAgency', 'ExclusiveRightWithException', 'ExclusiveRightToLease'] as const;

/**
 * TRUE while a listing is in the CURRENT listing episode: live on the market, or about to be (Active, Active Under Contract, Coming Soon, Pending).
 * Closed / Withdrawn / Expired / Canceled / Draft rows belong to an earlier episode or to none, so they can never prove that a NEW Cotality listing for
 * the same unit is their duplicate (Master 4.4: address alone is not enough; a relisting is a different episode).
 */
export function isLiveListingStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase().replace(/[\s_-]/g, '');
  return s === 'active' || s === 'activeundercontract' || s === 'comingsoon' || s === 'pending';
}

/**
 * TRUE when the row is Mallan's OWN listing, sourced from Cotality and read-only: it carries Mallan's list-side office id, its list agent is a
 * VERIFIED Mallan agent (the roster, by REBNY MLS member id), its agreement is exclusive, and it is NOT a duplicate of a Mallan-authored listing
 * (that one is the canonical record and takes the brand). Never decided from `agent_id` (a roster association, set on third-party rows too).
 *
 * This is a distinct concept from `isMallanExclusiveListing` (Mallan-AUTHORED, editable): the row stays Cotality-owned and read-only, keeps its RLS
 * attribution and `_source: 'db+idx'`; it only earns the "Mallan Exclusive" mark and Mallan's agent card.
 */
export function isVerifiedMallanListedRow(
  row: MallanSourceIdentityRow & { list_agent_mls_id?: string | null; raw_data?: unknown },
  context: MallanTwinContext,
): boolean {
  if (isMallanLocalListing(row)) return false;
  const office = typeof row.list_office_mls_id === 'string' ? row.list_office_mls_id.trim() : '';
  if (!office || !(MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office)) return false;
  if (isMallanRlsReturnCopy(row, context)) return false;
  const agentId = typeof row.list_agent_mls_id === 'string' ? row.list_agent_mls_id.trim() : '';
  if (!agentId || !context.agentsByMlsId[agentId]) return false;
  const raw = (row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}) as Record<string, unknown>;
  const agreement = typeof raw.ListingAgreement === 'string' ? raw.ListingAgreement : '';
  return (MALLAN_LISTED_AGREEMENT_TYPES as readonly string[]).includes(agreement);
}

/** The same rule before pagination and count: Prisma `where` for verified Mallan-listed Cotality rows (no author prefix, not a duplicate). */
export function mallanListedWhere(context: MallanTwinContext): Record<string, unknown> {
  return {
    list_office_mls_id: { in: [...MALLAN_LIST_OFFICE_MLS_IDS] },
    list_agent_mls_id: { in: Object.keys(context.agentsByMlsId) },
    NOT: [
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
      ...(context.returnCopyIds.length > 0 ? [{ listing_id: { in: [...context.returnCopyIds] } }] : []),
    ],
    OR: MALLAN_LISTED_AGREEMENT_TYPES.map((type) => ({ raw_data: { path: ['ListingAgreement'], equals: type } })),
  };
}

/**
 * Prisma `where` fragment excluding Mallan RLS return-copies from a PUBLIC set.
 *
 * Applied INSIDE the public access query so suppression happens BEFORE `count`,
 * `skip` and `take`. Filtering after pagination is page-local: a local row on
 * one page and its twin on another would let the twin surface, and `total` /
 * `hasMore` would describe the pre-suppression population.
 *
 * Mallan-authored local rows are explicitly re-admitted by their canonical id.
 * A legacy false eligibility flag on a feed stub does not establish authorship.
 */
export function excludeMallanRlsReturnCopies(context: MallanTwinContext): {
  OR: Array<Record<string, unknown>>;
} {
  const officeIds = [...MALLAN_LIST_OFFICE_MLS_IDS];
  return {
    OR: [
      // Mallan-authored local rows are canonical — never excluded.
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
      // Unclassifiable provenance keeps normal treatment (fail-open on display,
      // fail-closed on suppression).
      { list_office_mls_id: null },
      // Everything else: any office OTHER than Mallan's is third-party.
      { list_office_mls_id: { notIn: officeIds } },
      // A Mallan-office row is hidden ONLY when it is a proven duplicate of a Mallan-authored listing; otherwise it is Mallan's own listing and
      // the only public record of it.
      ...(context.returnCopyIds.length > 0 ? [{ listing_id: { notIn: [...context.returnCopyIds] } }] : [{ listing_id: { not: '' } }]),
    ],
  };
}

/**
 * OData clause excluding Mallan return-copies from a LIVE Trestle fetch.
 *
 * Returns null when there is nothing to exclude, so callers can omit the clause
 * entirely rather than emit `and ()`.
 *
 * NOTE ON PROVIDER NULL SEMANTICS: a row with NO `ListOfficeMlsId` must remain
 * visible, and OData `ne` comparisons against null are not reliably inclusive
 * across providers. The clause is therefore written as an explicit
 * `(A or B)` form — "office is null OR office is not Mallan's" — instead of a
 * bare `ne`, so a null-office row cannot be silently dropped.
 */
export function trestleExcludeMallanReturnCopiesClause(context: MallanTwinContext): string | null {
  const ids = [...context.returnCopyIds];
  if (ids.length === 0) return null;
  // Only a PROVEN duplicate (a Mallan-office row that is the same physical unit as a Mallan-authored listing) is excluded; a null-office row and a
  // Mallan-office row with no local twin both stay visible.
  return `(${ids.map((id) => `ListingId ne '${id.replace(/'/g, "''")}'`).join(' and ')})`;
}
