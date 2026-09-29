/**
 * CANONICAL READ-SIDE MALLAN LIST-SIDE IDENTITY + RLS RETURN-COPY CLASSIFIER.
 *
 * See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A. Three concepts, deliberately
 * distinct — conflating them is the defect this module exists to prevent:
 *
 *   1. `isMallanExclusiveListing()` — Mallan-AUTHORED local listing (`SL-`/`RL-`
 *      prefix OR `rls_eligible === false`). Governs DATA/MEDIA AUTHORITY.
 *      NOT broadened here, and NOT re-implemented here.
 *   2. **Mallan RLS return-copy** (this module) — an inbound Cotality/RLS row
 *      whose VERIFIED LIST-SIDE identity is Mallan. Still Cotality-SOURCE-OWNED
 *      data: its media stays Cotality-owned and must never enter the `crm:`
 *      namespace. It is only barred from being the PUBLIC CANONICAL listing.
 *   3. Third-party RLS/IDX — normal public inventory, untouched.
 *
 * WHY A RETURN-COPY EXISTS AT ALL: a Mallan listing may reach REBNY RLS by some
 * route OUTSIDE this system and then return to Mallan through Cotality as an
 * `RLS*` row. That route is not a Mallan component and is not modelled here.
 * mallan.nyc never writes back and cannot observe the upstream path — only the
 * result — so what this module asserts is bounded to exactly that: a Cotality/RLS
 * row carrying verified Mallan list-side identity MAY be a Mallan return-copy.
 * The local `SL-`/`RL-` row stays canonical and the returned copy is publicly
 * suppressed but retained for audit/reconciliation.
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
  /** Mallan-authored local rows are `false`; feed rows are true/null. */
  rls_eligible?: boolean | null;
}

/** CRM prefixes that mark a Mallan-AUTHORED local listing. */
const LOCAL_PREFIXES = ['SL-', 'RL-'] as const;

/** TRUE when the row is a Mallan-authored LOCAL listing (canonical publicly). */
export function isMallanLocalListing(row: MallanSourceIdentityRow): boolean {
  const id = String(row.listing_id ?? '');
  if (LOCAL_PREFIXES.some((p) => id.startsWith(p))) return true;
  return row.rls_eligible === false;
}

/**
 * TRUE when the row is Mallan's own listing returned through Cotality/RLS.
 *
 * Requires BOTH:
 *   * a verified Mallan list-side office id, AND
 *   * NOT being a Mallan-authored local row (a local row is concept 1, not 2).
 *
 * FAILS CLOSED: an absent/blank `list_office_mls_id` is NOT a return-copy, so an
 * unclassifiable row keeps its normal public treatment rather than vanishing.
 * Suppression must never be the default for unknown provenance.
 */
export function isMallanRlsReturnCopy(row: MallanSourceIdentityRow): boolean {
  if (isMallanLocalListing(row)) return false;
  const office = typeof row.list_office_mls_id === 'string' ? row.list_office_mls_id.trim() : '';
  if (!office) return false;
  return (MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office);
}

/**
 * Prisma `where` fragment excluding Mallan RLS return-copies from a PUBLIC set.
 *
 * Applied INSIDE the public access query so suppression happens BEFORE `count`,
 * `skip` and `take`. Filtering after pagination is page-local: a local row on
 * one page and its twin on another would let the twin surface, and `total` /
 * `hasMore` would describe the pre-suppression population.
 *
 * Mallan-authored local rows are explicitly re-admitted, since `rls_eligible`
 * false rows carry no office id and must never be caught by this filter.
 */
export function excludeMallanRlsReturnCopies(): {
  OR: Array<Record<string, unknown>>;
} {
  const officeIds = [...MALLAN_LIST_OFFICE_MLS_IDS];
  return {
    OR: [
      // Mallan-authored local rows are canonical — never excluded.
      { rls_eligible: false },
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
      // Unclassifiable provenance keeps normal treatment (fail-open on display,
      // fail-closed on suppression).
      { list_office_mls_id: null },
      // Everything else: any office OTHER than Mallan's is third-party.
      { list_office_mls_id: { notIn: officeIds } },
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
export function trestleExcludeMallanReturnCopiesClause(): string | null {
  const ids = [...MALLAN_LIST_OFFICE_MLS_IDS];
  if (ids.length === 0) return null;
  const notMallan = ids.map((id) => `ListOfficeMlsId ne '${id.replace(/'/g, "''")}'`).join(' and ');
  return `(ListOfficeMlsId eq null or (${notMallan}))`;
}
