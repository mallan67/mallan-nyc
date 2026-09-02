// lib/compliance/listing-status-vocabulary.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// THE SINGLE SOURCE OF TRUTH FOR EVERY PREDICATE OVER `listings.status`.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS MODULE EXISTS (the defect it closes, 2026-08-20) ──────────────
//
// `listings.status` is ONE column written by TWO authorities that spell the
// same real-world concept differently, and nothing on the row says which wrote
// it:
//
//   PROVIDER WRITER   `mapTrestleToPrisma` (lib/idx/trestle-mapper.ts) stores
//                     `String(raw.StandardStatus || …)` VERBATIM. The live
//                     Cotality enumeration member is `Canceled` (single L), so
//                     a provider cancellation lands in the column spelled
//                     EXACTLY `Canceled`.
//   MALLAN WRITER     The CRM canonical vocabulary (`lib/crm/status-mapping.ts`
//                     `CANONICAL_STATUSES`, `WORKFLOW_TO_CANONICAL.Cancelled =
//                     'Cancelled'`) writes `Cancelled` (double L) — a string the
//                     live provider REJECTS with HTTP 400.
//
// Both writers are live. Therefore EVERY exact-case predicate over the stored
// column must accept BOTH spellings, or it silently skips half the rows that
// mean the thing it is looking for.
//
// On 2026-08-19 `Canceled` was correctly added to the mapper's
// `TERMINAL_STATUSES`. It was NOT added to the eight other places that carry a
// hand-copied duplicate of the same concept, and one of those omissions was a
// UCBA 2026 Art. I §11 DOM-reset failure proven by execution:
//
//     shouldResetDom({status:'Cancelled', status_changed_at:-60d, dom:42}) === true
//     shouldResetDom({status:'Canceled',  ...identical...})                === false
//
// THE ROOT CAUSE WAS NEVER THE SPELLING. It was that a one-concept /
// two-spelling equivalence was expressed as NINE independent literal arrays, so
// "add the new member" was a nine-place edit that nobody could perform
// atomically. Adding a ninth element to nine literals would have rebuilt the
// same trap. This module replaces the literals with ONE declaration plus
// derivations, and `lib/compliance/__tests__/listing-status-spelling-closure.test.ts`
// fails if a tenth copy appears.
//
// ── HOW TO USE IT ─────────────────────────────────────────────────────────
// Need "is this row terminal?" → import `TERMINAL_STATUSES`.
// Need a NEW predicate over stored status → build it with
// `withStatusSpellings([...])` so it is spelling-closed BY CONSTRUCTION rather
// than by the author remembering. Never hand-write a status array that mentions
// one spelling of a class without the other.
//
// ── AUTHORITY BOUNDARY ────────────────────────────────────────────────────
// This module carries the MALLAN vocabulary decisions and the live-probed
// provider member list. It is NOT provider authority: the provider vocabulary
// below is a transcription of a dated live probe (see
// `LIVE_PROVIDER_STANDARD_STATUSES`), re-provable only against
// `api.cotality.com`, never against this file.
//
// This module deliberately imports NOTHING from `lib/idx/**` so that
// `lib/syndication/**` may import it without breaching the structural
// no-IDX-import pin (tests/runtime/syndication-no-idx-imports.test.ts).

/**
 * The LIVE Cotality `StandardStatus` vocabulary — every member, nothing else.
 *
 * ── PROVENANCE (live probe, 2026-08-19; raw bodies + sha256 in
 *    `.cache/cotality-authority-m2/raw/`, index in `PROBE-STATUS.json`;
 *    independently re-verified by three agents 2026-08-20) ──────────────────
 * `GET {TRESTLE_API_URL}/odata/Property/$count?$filter=StandardStatus eq '<X>'`
 * with client-credentials auth returned HTTP 200 for exactly these 11 strings
 * (with `@odata.count`):
 *
 *   Active 8,103 · ActiveUnderContract 0 · Canceled 0 · Closed 577,073 ·
 *   ComingSoon 1 · Delete 0 · Expired 0 · Hold 0 · Incomplete 0 ·
 *   Pending 6,029 · Withdrawn 0
 *
 * and HTTP 400 "The string '<X>' is not a valid enumeration type constant" for
 * `Cancelled`, `Sold`, `Rented`, `Leased`, `TemporarilyOffMarket`,
 * `OwnerOptOut` and `Draft`. `GET /odata/$metadata` (HTTP 200, sha256
 * 1984a8ad…7e2ae105) declares EnumType StandardStatus with exactly those 11
 * members — used ONLY to prove the probed candidate list was CLOSED, never as
 * membership evidence in itself (`$metadata` over-declares).
 *
 * A COUNT OF 0 IS NOT ABSENCE FROM THE VOCABULARY. `Canceled`, `Delete`,
 * `Expired`, `Hold`, `Incomplete`, `Withdrawn` and `ActiveUnderContract` all
 * answer HTTP 200 with 0 rows today: they are fully valid members the feed
 * simply carries none of right now. SUPPORTED and "population 0" are different
 * facts and may never be collapsed.
 *
 * STATUS-SPELLING-EXEMPT: this IS the provider vocabulary declaration. It must
 * contain ONLY the 11 strings the live provider answers HTTP 200 for; adding the
 * provider-rejected `Cancelled` here would be a false authority claim.
 */
export const LIVE_PROVIDER_STANDARD_STATUSES: ReadonlySet<string> = new Set([
  'Active',
  'ActiveUnderContract',
  'Canceled',
  'Closed',
  'ComingSoon',
  'Delete',
  'Expired',
  'Hold',
  'Incomplete',
  'Pending',
  'Withdrawn',
]);

/**
 * SPELLING EQUIVALENCE CLASSES — one real-world concept, several stored strings.
 *
 * A class is NOT "statuses that behave similarly". It is strictly "strings that
 * denote the SAME state and therefore must never be distinguishable by any
 * predicate over `listings.status`". `Closed` and `Sold` are NOT a class (a
 * predicate may legitimately want one without the other). `Canceled` and
 * `Cancelled` ARE: they are the identical state written by two authorities.
 *
 * `providerSpelling` names the member the live provider accepts, when the class
 * has one. It is what `canonicalProviderSpelling()` converges on, and it is why
 * reconciliation may rewrite a stored `Cancelled` to `Canceled` on a feed row
 * but must never do the reverse.
 *
 * ADDING A CLASS: add it here and every derived set below picks it up. Do not
 * add a spelling to a downstream literal.
 */
export interface StatusSpellingClass {
  /** Every stored string that denotes this state. */
  readonly members: readonly string[];
  /** The member the live provider accepts, or null if Mallan-only. */
  readonly providerSpelling: string | null;
  /** Why this class exists — cited in test failures. */
  readonly rationale: string;
}

export const STATUS_SPELLING_CLASSES: readonly StatusSpellingClass[] = [
  {
    members: ['Canceled', 'Cancelled'],
    providerSpelling: 'Canceled',
    rationale:
      "'Canceled' is the live Cotality enumeration member (HTTP 200, probe 2026-08-19) and is stored " +
      "verbatim by mapTrestleToPrisma. 'Cancelled' is the Mallan CRM canonical value " +
      '(lib/crm/status-mapping.ts CANONICAL_STATUSES) and is rejected by the provider with HTTP 400. ' +
      'Both are written by live code paths, so both are present in listings.status.',
  },
];

/** Fast lookup: member → the class it belongs to. */
const MEMBER_TO_CLASS = new Map<string, StatusSpellingClass>();
for (const cls of STATUS_SPELLING_CLASSES) {
  for (const m of cls.members) MEMBER_TO_CLASS.set(m, cls);
}

/**
 * Expand a status list to its SPELLING CLOSURE — every equivalent spelling of
 * every value present.
 *
 * This is the constructor every stored-status predicate should be built with.
 * `withStatusSpellings(['Withdrawn', 'Cancelled'])` yields
 * `['Withdrawn', 'Cancelled', 'Canceled']`, so the predicate is correct whether
 * the row was written by the provider or by the CRM — and stays correct when a
 * future class is added here, with no edit at the call site.
 *
 * Order is stable: input order first, then the missing siblings in class order,
 * so snapshot-style assertions elsewhere stay deterministic.
 */
export function withStatusSpellings(statuses: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  for (const s of statuses) push(s);
  for (const s of statuses) {
    const cls = MEMBER_TO_CLASS.get(s);
    if (cls) for (const m of cls.members) push(m);
  }
  return out;
}

/** Set-returning form of {@link withStatusSpellings}. */
export function statusSpellingSet(statuses: readonly string[]): ReadonlySet<string> {
  return new Set(withStatusSpellings(statuses));
}

/**
 * Every accepted spelling of the state `status` denotes (including `status`).
 * Returns `[status]` for a value with no siblings.
 */
export function statusSpellings(status: string): string[] {
  return MEMBER_TO_CLASS.get(status)?.members.slice() ?? [status];
}

/**
 * Fold a status onto the spelling the LIVE PROVIDER accepts, when its class has
 * one; otherwise return it unchanged.
 *
 * Direction is deliberate and one-way. A provider-sourced row that the provider
 * has just spoken about should converge on the provider's own string
 * (`Cancelled` → `Canceled`); a provider string must NEVER be rewritten into one
 * the provider answers HTTP 400 for (`Canceled` stays `Canceled`).
 * `lib/idx/reconcile-decision.ts` uses this for its `targetStatus`.
 */
export function canonicalProviderSpelling(status: string): string {
  const cls = MEMBER_TO_CLASS.get(status);
  return cls?.providerSpelling ?? status;
}

/** True if the live provider could have asserted this exact string. */
export function isProviderAssertableStatus(status: unknown): boolean {
  return typeof status === 'string' && LIVE_PROVIDER_STANDARD_STATUSES.has(status);
}

// ═══════════════════════════════════════════════════════════════════════════
// DERIVED PREDICATE SETS — every one is spelling-closed BY CONSTRUCTION.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Statuses meaning "no longer publicly displayable on IDX" — the REBNY RLS
 * §2.05 removal set, the `terminal_since` clock set, and the retention
 * (T+24h / T+30d / T+180d) set.
 *
 * Carries BOTH vocabularies on purpose:
 *   PROVIDER members `Canceled` · `Closed` · `Expired` · `Withdrawn`
 *   MALLAN-ONLY values `Cancelled` · `Sold` · `Rented` · `Leased` (provider 400s)
 *
 * Mirrored by `app/api/cron/data-retention/route.ts`,
 * `lib/retention/archive-terminals.ts` and `scripts/archive-backlog-predicate.js`.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = statusSpellingSet([
  'Closed',
  'Sold',
  'Leased',
  'Rented',
  'Withdrawn',
  'Expired',
  'Cancelled',
]);

/**
 * Statuses that start the UCBA 2026 Art. I §11 30-day DOM-reset clock.
 *
 * UCBA: "If a listing is in Withdrawn/Cancelled for >= 30 consecutive days, DOM
 * resets to 0 upon reactivation." Both cancel spellings denote that one state.
 *
 * `Hold` is DELIBERATELY ABSENT. It is a live provider member meaning
 * temporarily off-market, and folding it in here would be plausible — but the
 * UCBA text names Withdrawn and Cancelled, and extending a compliance clock to a
 * status the rule does not name is exactly the extrapolation CLAUDE.md §E
 * forbids. Left as an open question, not silently decided.
 */
export const DOM_RESET_ELIGIBLE_STATUSES: ReadonlySet<string> = statusSpellingSet([
  'Withdrawn',
  'Cancelled',
]);

/**
 * Statuses hidden from the default CRM grid (presentation only — an explicit
 * `?status=` filter still reaches them). NOT an ownership or compliance gate.
 */
export const CRM_HIDDEN_STATUSES: readonly string[] = withStatusSpellings([
  'Withdrawn',
  'Cancelled',
]);

/**
 * Statuses that are NEITHER publicly displayable NOR terminal.
 *
 * `Hold` / `Incomplete` / `Delete` are live provider members that must not
 * display (REBNY `suppressFromPublicSearch`, the off-market filter, and the
 * provider's own tombstone semantics for `Delete`) but are not permanent
 * off-market states, so they must not drive `terminal_since`, the archive clock
 * or the DOM rules.
 */
export const NON_DISPLAYABLE_STATUSES: ReadonlySet<string> = statusSpellingSet([
  'Hold',
  'Incomplete',
  'Delete',
]);

/** RESO StandardStatus values that are publicly displayable on IDX. */
export const ACTIVE_DISPLAY_STATUSES: ReadonlySet<string> = statusSpellingSet([
  'Active',
  'ComingSoon',
  'ActiveUnderContract',
]);

/**
 * CRM lifecycle statuses outside the public displayable set that are still
 * legitimate CRM form inputs. `Incomplete` appears here AND in
 * `NON_DISPLAYABLE_STATUSES`: membership here governs NORMALIZATION (it
 * round-trips unchanged), membership there governs DISPLAY. Different questions.
 */
export const CRM_LIFECYCLE_STATUSES: ReadonlySet<string> = statusSpellingSet([
  'Draft',
  'Incomplete',
  'Pending',
]);

/** Every status string this repo models, across all sets. */
export const ALL_MODELLED_STATUSES: ReadonlySet<string> = new Set([
  ...TERMINAL_STATUSES,
  ...NON_DISPLAYABLE_STATUSES,
  ...ACTIVE_DISPLAY_STATUSES,
  ...CRM_LIFECYCLE_STATUSES,
]);

/**
 * D9 — "Coming Soon may be used ONCE per address" (UCBA 2026).
 *
 * The statuses a PRIOR listing at the same address may be sitting in when the
 * D9 lookup runs (`app/api/crm/listings/route.ts`, the `status: { in: … }` leg
 * of the `_wasComingSoon` query).
 *
 * ── WHY THIS IS DELIBERATELY EXHAUSTIVE ───────────────────────────────────
 * The discriminator in that query is `raw_data._wasComingSoon === true`, which
 * is written by exactly one code path
 * (`app/api/crm/listings/[id]/status/route.ts`, on a transition OUT of
 * `ComingSoon`). Once set, it is a PERMANENT record that the address consumed
 * its one Coming Soon. **No subsequent status un-consumes it.** Therefore the
 * status leg can only ever NARROW a fail-closed compliance gate — every value it
 * omits is a false negative that lets a second Coming Soon through.
 *
 * The literal it replaces was `["Active","Withdrawn","Expired","Sold","Rented",
 * "Cancelled"]`. Measured against the frozen production census
 * (`.cache/r2-census/DB-2026-08-18T13-20-59-918Z.ndjson`, 25,239 `listings`
 * rows) that literal reached 14,422 rows and MISSED 10,817 — 42.9% of the
 * corpus — because it omitted `Closed` (4,609), `Pending` (6,207) and
 * `ComingSoon` (1). It also omitted the provider spelling `Canceled`, which is 0
 * rows today but is reachable by a live writer (`mapTrestleToPrisma` stores
 * `StandardStatus` verbatim).
 *
 * ── ON `Sold` / `Rented` / `Leased` ───────────────────────────────────────
 * The live provider REJECTS all three with HTTP 400 (re-probed 2026-08-20, see
 * `LIVE_PROVIDER_STANDARD_STATUSES`). They are nonetheless CORRECT here, because
 * this is a predicate over the Neon `listings.status` column, not an OData
 * filter, and the Mallan CRM writes `Sold`/`Rented` itself
 * (`STATUS_TRANSITIONS.Pending`). What their presence proves is that the old
 * literal was written against the MALLAN vocabulary alone — which is exactly why
 * every PROVIDER-only member (`Closed`, `Canceled`, `Hold`, `Incomplete`,
 * `ActiveUnderContract`, `Delete`) was missing from it.
 *
 * ── RESIDUAL (stated, not hidden) ─────────────────────────────────────────
 * An `in` list still cannot match a status string this repo does not model at
 * all. Every one of the 25,239 rows in the frozen census carries a status inside
 * `ALL_MODELLED_STATUSES`, so the residual is empty in production today, and
 * `lib/compliance/__tests__/d9-coming-soon-status-closure.test.ts` asserts that.
 * Because this set is DERIVED, a status added to the vocabulary above enrolls in
 * D9 with no edit at the call site.
 */
export const COMING_SOON_PRIOR_USE_STATUSES: readonly string[] = withStatusSpellings([
  ...ACTIVE_DISPLAY_STATUSES,
  ...CRM_LIFECYCLE_STATUSES,
  ...NON_DISPLAYABLE_STATUSES,
  ...TERMINAL_STATUSES,
]);
