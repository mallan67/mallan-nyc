/**
 * CANONICAL READ-SIDE MALLAN LIST-SIDE IDENTITY + RLS RETURN-COPY CLASSIFIER.
 *
 * See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A. Three concepts, deliberately
 * distinct — conflating them is the defect this module exists to prevent:
 *
 *   1. `isMallanExclusiveListing()` — Mallan-AUTHORED local listing (`SL-`/`RL-`
 *      prefix OR `rls_eligible === false`). Governs DATA/MEDIA AUTHORITY.
 *      NOT broadened here, and NOT re-implemented here.
 *   2. **Mallan-office Cotality representation** (this module) — an inbound
 *      Cotality/RLS row whose VERIFIED LIST-SIDE identity is Mallan. Still
 *      Cotality-SOURCE-OWNED data: its media stays Cotality-owned and must never
 *      enter the `crm:` namespace.
 *
 *      It is SUPPRESSED AS A COMPETING LISTING SYSTEM-WIDE. An earlier version of
 *      this line said it "is only barred from being the PUBLIC CANONICAL
 *      listing", which was wrong and dangerous: read alone, it invites a future
 *      change to re-admit the provider copy into CRM, CMA or Reports. It may not
 *      independently participate as a canonical listing in authenticated Sale or
 *      Rental Search, Saved Search, alerts, counts/pagination, CMA candidate
 *      pools, Building inventory, Map, listing detail, CRM, client portal,
 *      Reports, Open House, Media authority, marketing or public/SEO consumers.
 *   3. Third-party RLS/IDX — normal public inventory, untouched.
 *
 * WHY A REPRESENTATION EXISTS AT ALL: Mallan authors the listing locally, an
 * EXTERNAL SUBMISSION PATH files it with REBNY RLS, and it returns to Mallan
 * through Cotality as an `RLS*` row. That return trip is OUTSIDE this system;
 * Mallan never writes back.
 *
 * The intermediary that performs the submission is deliberately NOT named here.
 * It is not Mallan architecture, not a source system and not a data authority,
 * and naming it invites a future session to build product logic, source enums or
 * canonical terminology around a vendor. The system contract is Cotality/RLS.
 *
 * The local `SL-`/`RL-` row stays canonical; the returned representation is
 * SUPPRESSED AS A COMPETING LISTING — not merely "publicly" — and retained for
 * audit/reconciliation.
 *
 * TWO SEPARATE DECISIONS, never collapsed:
 *   1. CLASSIFICATION — is this a Mallan-office Cotality representation?
 *      Answered by verified list-side office identity alone.
 *   2. TWIN COTALITYLUTION — which local Mallan listing does it reconcile to?
 *      A stricter problem: MATCHED / AMBIGUOUS / UNRESOLVED.
 *
 * Failure of (2) NEVER reverses (1). Until a direct Mallan -> Cotality feed is
 * implemented and proven, EVERY verified Mallan-office representation stays
 * suppressed. If the expected local listing cannot be found, that is an
 * integrity defect to surface and repair — it does not transfer canonical or
 * display authority to the provider copy. Fail closed on canonical AUTHORITY,
 * never fail open to Cotality.
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
/**
 * LEGACY NAME. This answers CLASSIFICATION, not twin resolution.
 *
 * It returns true for a **Mallan-office Cotality representation** — a provider
 * row whose verified list-side office identity is Mallan — WHETHER OR NOT a local
 * canonical twin has been proven. It does NOT mean "matched Mallan return-copy",
 * which is the stricter claim that a specific local listing has been identified
 * (`resolveReturnCopyCanonicalTarget`).
 *
 * The two decisions are independent and failure of the second NEVER reverses the
 * first: an unresolved or ambiguous twin keeps the representation suppressed and
 * raises an integrity defect, rather than promoting the provider copy.
 *
 * WHY NOT SIMPLY RENAME IT: the name has 17 references across 6 files, two of
 * which — `app/api/listings/suggest/route.ts` and `app/listing/[...slug]/page.tsx`
 * — are PUBLIC consumer Search surfaces currently held at ZERO-DELTA against
 * production. Renaming would modify them for cosmetic reasons and break that
 * guarantee. The name is therefore documented as legacy rather than changed, and
 * a rename is deferred until the public surfaces are separately in scope.
 *
 * DO NOT add a second classifier answering the same identity question.
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
