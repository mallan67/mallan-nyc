// lib/compliance/status.ts
//
// Canonical listing-status representation — single source of truth.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Before this module, the codebase mixed three different formats for the same
// values across 37 files:
//   "ComingSoon"        (Cotality internal, DB format)
//   "Coming Soon"        (human display format)
//   "COMING_SOON"        (URL / API-param format)
//
// Some comparisons were against the wrong format at runtime even though they
// type-checked (e.g. `listing.standardStatus === 'Coming Soon'` in public-dto
// never fired because DB stores `ComingSoon`). This broke the REBNY UCBA
// Art. I §16(C) "Coming Soon — No Showings or Open House until [date]"
// badge on every Coming Soon listing served via the public DTO.
//
// RULE: this module is the only place that knows about status strings.
// Anywhere else in the codebase, use the helpers exported here. Comparisons
// against string literals like `'Coming Soon'` or `'ComingSoon'` outside
// this file are prohibited.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Canonical internal status values. These are exactly the strings the DB
 * stores (matches REBNY Cotality StandardStatus enum, no spaces).
 *
 * Values ALPHABETIZED by enum key to keep the order deterministic across
 * schema diffs. The underlying string values are whatever Cotality uses.
 */
export const Status = {
  ACTIVE: 'Active',
  ACTIVE_UNDER_CONTRACT: 'ActiveUnderContract',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  COMING_SOON: 'ComingSoon',
  EXPIRED: 'Expired',
  HOLD: 'Hold',
  LEASED: 'Leased',
  PENDING: 'Pending',
  RENTED: 'Rented',
  SOLD: 'Sold',
  WITHDRAWN: 'Withdrawn',
} as const;

export type StatusValue = typeof Status[keyof typeof Status];

/**
 * Every accepted input form → canonical value.
 *
 * Keep this map growing when you find new legacy inputs; do NOT pepper the
 * rest of the codebase with bespoke normalization. Any value passed to
 * `normalizeStatus()` that isn't here returns `null` (fail-closed).
 */
const INPUT_TO_CANONICAL: Record<string, StatusValue> = {
  // Canonical (pass-through)
  'Active': Status.ACTIVE,
  'ActiveUnderContract': Status.ACTIVE_UNDER_CONTRACT,
  'Cancelled': Status.CANCELLED,
  'Closed': Status.CLOSED,
  'ComingSoon': Status.COMING_SOON,
  'Expired': Status.EXPIRED,
  'Hold': Status.HOLD,
  'Leased': Status.LEASED,
  'Pending': Status.PENDING,
  'Rented': Status.RENTED,
  'Sold': Status.SOLD,
  'Withdrawn': Status.WITHDRAWN,

  // Human display format (Cotality-style with spaces — Trestle sometimes sends these)
  'Active Under Contract': Status.ACTIVE_UNDER_CONTRACT,
  'Coming Soon': Status.COMING_SOON,

  // Common typo / alternate spelling
  'Canceled': Status.CANCELLED,

  // URL / API-param format (rarely incoming, but defensively accepted)
  'ACTIVE': Status.ACTIVE,
  'ACTIVE_UNDER_CONTRACT': Status.ACTIVE_UNDER_CONTRACT,
  'COMING_SOON': Status.COMING_SOON,
  'CLOSED': Status.CLOSED,
  'PENDING': Status.PENDING,
  'SOLD': Status.SOLD,
  'WITHDRAWN': Status.WITHDRAWN,
  'CANCELLED': Status.CANCELLED,
  'EXPIRED': Status.EXPIRED,
  'HOLD': Status.HOLD,
  'LEASED': Status.LEASED,
  'RENTED': Status.RENTED,
};

/**
 * Canonical display label for a status (what a buyer sees on the listing
 * card).
 *
 * Kept separate from the canonical value so the DB stays in Cotality format
 * while the UI gets human-friendly text.
 */
const CANONICAL_TO_LABEL: Record<StatusValue, string> = {
  [Status.ACTIVE]: 'Active',
  [Status.ACTIVE_UNDER_CONTRACT]: 'Under Contract',
  [Status.CANCELLED]: 'Cancelled',
  [Status.CLOSED]: 'Closed',
  [Status.COMING_SOON]: 'Coming Soon',
  [Status.EXPIRED]: 'Expired',
  [Status.HOLD]: 'On Hold',
  [Status.LEASED]: 'Leased',
  [Status.PENDING]: 'Pending',
  [Status.RENTED]: 'Rented',
  [Status.SOLD]: 'Sold',
  [Status.WITHDRAWN]: 'Withdrawn',
};

/**
 * Statuses that count as "actively on market" for public search display.
 *
 * Coming Soon is included — it IS displayable (with the REBNY §16(C) badge)
 * even though it's not technically "Active" per Cotality. ActiveUnderContract
 * is included because REBNY allows IDX display of listings that have
 * accepted an offer but haven't closed — typically shown with an "Under
 * Contract" badge.
 *
 * Pending is NOT included — listings in signed-contract-pending-closing
 * are usually hidden from public search by convention.
 */
const ACTIVE_DISPLAY_STATUSES = new Set<StatusValue>([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
]);

/**
 * Statuses that mean "listing is off-market" for REBNY UCBA Art. I §6
 * 24-hour removal enforcement.
 */
const TERMINAL_STATUSES = new Set<StatusValue>([
  Status.CANCELLED,
  Status.CLOSED,
  Status.EXPIRED,
  Status.LEASED,
  Status.RENTED,
  Status.SOLD,
  Status.WITHDRAWN,
]);

// ── Public helpers ───────────────────────────────────────────────────────

/**
 * Coerce any plausible input to a canonical StatusValue.
 * Returns `null` if the input is unrecognized (callers must handle this
 * explicitly — treating unknown as "displayable" would violate the
 * fail-closed principle).
 */
export function normalizeStatus(input: unknown): StatusValue | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return INPUT_TO_CANONICAL[trimmed] ?? null;
}

/** Display label for a canonical status — what the UI shows a consumer. */
export function statusDisplayLabel(status: unknown): string {
  const canonical = normalizeStatus(status);
  return canonical ? CANONICAL_TO_LABEL[canonical] : '';
}

/** Is this listing currently shown in public search? */
export function isActiveDisplayStatus(status: unknown): boolean {
  const canonical = normalizeStatus(status);
  return canonical !== null && ACTIVE_DISPLAY_STATUSES.has(canonical);
}

/** Is this a terminal (off-market) status per REBNY UCBA Art. I §6? */
export function isTerminalStatus(status: unknown): boolean {
  const canonical = normalizeStatus(status);
  return canonical !== null && TERMINAL_STATUSES.has(canonical);
}

/** Specifically the Coming Soon state for REBNY UCBA Art. I §16(C). */
export function isComingSoonStatus(status: unknown): boolean {
  return normalizeStatus(status) === Status.COMING_SOON;
}

/**
 * Statuses under which a listing may be PUBLICLY RETRIEVED at its own detail
 * URL.
 *
 * THREE DIFFERENT QUESTIONS — keeping them separate is the entire point:
 *
 *   PUBLIC SEARCH MEMBERSHIP      ACTIVE_DISPLAY_STATUSES
 *                                 {Active, ActiveUnderContract, ComingSoon}.
 *                                 `app/sitemap.ts` emits exactly this set too.
 *
 *   PUBLIC DETAIL RETRIEVABILITY  THIS set. Broader than search, because a
 *                                 link shared or saved while a listing was
 *                                 Active must keep resolving once it goes to
 *                                 contract. Narrower than "any recognised
 *                                 status" — see below.
 *
 *   INTERNAL / PORTAL VISIBILITY  `isListingDisplayable` + the portal DTO
 *                                 tiers. Those legitimately see pre-publication
 *                                 and off-market rows and are NOT narrowed here.
 *
 * THE RULE: the status must be CANONICAL **and NON-TERMINAL**.
 *
 * WHY NOT "any recognised canonical status" (the previous rule)
 * ------------------------------------------------------------
 * Recognition by the parser is not proof of public eligibility. The previous
 * rule (`normalizeStatus(status) !== null`) admitted Closed/Sold/Rented/Leased/
 * Withdrawn/Cancelled/Expired purely because they are spelled canonically.
 *
 * For an RLS-backed row that was masked: `computeGateColumns` sets
 * `idx_display_yn = rls_eligible && !is_terminal && …`, so a terminal Cotality
 * row is already refused by the distribution gate. But that gate is BYPASSED
 * for website-only rows (`rls_eligible === false`) — and it must be, because
 * the same formula forces `idx_display_yn: false` for every one of them by
 * construction. So on Mallan website-only inventory the status test was the
 * ONLY gate, and "recognised" let a Sold/Withdrawn Mallan listing keep a public
 * detail page. Two source classes, one rule, different consequences.
 *
 * WHY NON-TERMINAL IS THE RIGHT LINE FOR *MALLAN* INVENTORY
 * ---------------------------------------------------------
 *   1. `lib/crm/listing-publish-contract.ts` — the shipped Mallan publication
 *      contract already ends public eligibility at terminal:
 *      `exclusiveEligible = !isTerminal` ("Terminal status — no longer a live
 *      exclusive"). This set reuses that contract instead of inventing one.
 *   2. MALLAN-PLATFORM-MASTER-PLAN §5.1 scopes public inventory to ELIGIBLE
 *      Mallan-authored AND ELIGIBLE third-party listings; §4.1 states source
 *      existence does not itself grant republication, and §4.5 that Mallan
 *      supplemental inventory is "not public Mallan inventory by default".
 *      NOTE the plan never DEFINES "eligible", and is silent on per-status
 *      visibility, on terminal statuses, and on Draft — so the definition is
 *      taken from the repo's own shipped contracts above, not from the plan.
 *
 * WHY THIS IS NOT APPLIED TO RLS-BACKED ROWS
 * ------------------------------------------
 * `evaluateDisplayGate` ALREADY owns terminal for RLS inventory, and owns it
 * more precisely than a flat set can: `displayable: !terminal ||
 * closedWithin24Hours`. That second term is a deliberate REBNY UCBA Art. I §6
 * implementation — "Closed listings must be removed OR MARKED CLOSED on broker
 * website within 24hrs" — so a just-closed listing is intentionally still
 * served for 24 hours after its CloseDate. Applying a flat non-terminal set to
 * RLS rows would silently delete that provision.
 *
 * DO NOT assume `idx_display_yn` alone excludes terminal RLS rows. It is
 * `Boolean @default(true)`, only a handful of writers call `computeGateColumns`,
 * and at least one script hardcodes `idx_display_yn: true` on a Closed row. The
 * real guarantee comes from `evaluateDisplayGate`, which re-derives terminality
 * from the status at read time.
 *
 * WHY Pending AND Hold STAY
 * -------------------------
 * Both are non-terminal, so `evaluateDisplayGate` already reports them
 * displayable and they are retrievable today. Preserving them is behaviour
 * preservation, not a new grant.
 *
 * Be precise about the evidence: REBNY UCBA mandates removal only for CLOSED
 * (Art. I §6) and is SILENT on Pending. No pre-existing test, doc or commit
 * asserts Pending detail is required — its reachability was emergent from the
 * gate's `!terminal` term rather than designed. The live feed carries 6,103
 * Pending rows (probe below), so narrowing to the search set would 404 all of
 * them for no compliance benefit. `Hold` is non-terminal with 0 live rows.
 *
 * WHY Draft/Incomplete FAIL
 * -------------------------
 * They are Mallan pre-publication workspace values living in the mapper's
 * `CRM_LIFECYCLE_STATUSES` {Draft, Incomplete, Pending} — not in the canonical
 * `Status` vocabulary — so `normalizeStatus` fails closed to null. Meanwhile
 * `normalizeStandardStatus` passes `Draft` through and TERMINAL_STATUSES does
 * not contain it, which is exactly how a Draft acquired `idx_display_yn: true`
 * and became publicly retrievable.
 *
 * An explicit ALLOWLIST, not `!isTerminalStatus(...)`: a newly added canonical
 * status must be admitted deliberately rather than inherit public visibility by
 * default. `publication-eligibility.test.ts` pins the set against
 * `TERMINAL_VALUES` so the two can only diverge on purpose.
 *
 * ── VERIFIED AGAINST THE LIVE COTALITY API, NOT A SNAPSHOT ──────────────────
 * Per the standing law (scripts/cotality/pull-enums.mjs): "the live Cotality API
 * is the SOLE authority for every status, field, and picklist value. Never
 * assume, never snapshot, never hand-copy a list."
 *
 * Live read-only probe of `api.cotality.com/trestle` on 2026-08-17
 * (`/odata/$metadata` HTTP 200, then per-status `$count` on `/odata/Property`):
 *
 *   LIVE StandardStatus members:
 *     Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete,
 *     Expired, Hold, Incomplete, Pending, Withdrawn
 *
 *   LIVE row counts:
 *     Active 8,205 · Pending 6,103 · Closed 576,810 · ComingSoon 1 ·
 *     all others 0
 *
 * What that live evidence establishes:
 *   - Every member of this allowlist IS a real live StandardStatus value.
 *   - `Pending` is genuinely populated at scale (6,103) — preserving it is
 *     evidence-backed, not folklore.
 *   - `Closed` is the LARGEST live population (576,810). That is the blast
 *     radius the old "any recognised status" rule left open, and the reason
 *     terminal exclusion matters rather than being theoretical.
 *   - `Hold` and `ActiveUnderContract` are live-VALID but currently 0 rows.
 *     They stay admitted because they are non-terminal and the repo already
 *     treats them as retrievable; this is behaviour preservation, not a claim
 *     that they are populated.
 *   - `Delete` and `Incomplete` are LIVE StandardStatus values that this repo's
 *     `Status` vocabulary does not contain, so `normalizeStatus` returns null
 *     and they fail closed here. That is the correct outcome — but note they
 *     are REAL provider values, not garbage input. Do NOT "fix" that by adding
 *     them to INPUT_TO_CANONICAL without also deciding their visibility here.
 *   - `Sold` / `Rented` / `Leased` are NOT live StandardStatus members at all
 *     (`Leased` appears only in MlsStatus). They exist in this vocabulary for
 *     Mallan-authored inventory, which is exactly the class whose terminal rows
 *     this narrowing closes.
 *   - The live spelling is `Canceled` (single-L); INPUT_TO_CANONICAL folds it to
 *     `Cancelled`, so the terminal test still fires. The comment there calling
 *     it a "typo" is inaccurate — it is the provider's own spelling — but the
 *     mapping behaviour is correct and is left alone.
 */
const MALLAN_PUBLICATION_ELIGIBLE_STATUSES = new Set<StatusValue>([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
  Status.PENDING,
  Status.HOLD,
]);

/**
 * Is this a status the canonical vocabulary RECOGNISES at all?
 *
 * The vocabulary gate, and nothing more. `Draft` and `Incomplete` — the Mallan
 * pre-publication workspace values — fail here, as do the live-but-unmodelled
 * provider values (`Delete`) and any garbage. Deliberately NOT a visibility
 * answer on its own; `decidePublicDetailAccess` composes it with a source-class
 * contract.
 */
export function isCanonicalStatus(status: unknown): boolean {
  return normalizeStatus(status) !== null;
}

/**
 * MALLAN's own publication contract, for inventory that no REBNY/RLS gate
 * governs (`rls_eligible === false` website-only rows).
 *
 * Canonical AND non-terminal. This mirrors the already-shipped contract in
 * `lib/crm/listing-publish-contract.ts` — `exclusiveEligible = !isTerminal`,
 * "Terminal status — no longer a live exclusive" — rather than inventing a
 * second opinion about when Mallan inventory stops being public.
 *
 * It applies ONLY to website-only rows. RLS-backed rows are decided by
 * `evaluateDisplayGate`, which owns terminal itself AND implements the UCBA
 * Art. I §6 window ("Closed listings must be removed OR MARKED CLOSED within
 * 24hrs") via `displayable: !terminal || closedWithin24Hours`. Applying this
 * set to RLS rows would silently delete that 24-hour provision.
 */
export function isMallanPublicationEligibleStatus(status: unknown): boolean {
  const canonical = normalizeStatus(status);
  return canonical !== null && MALLAN_PUBLICATION_ELIGIBLE_STATUSES.has(canonical);
}

/** The Mallan publication-eligible set, frozen for tests and DB `status` filters. */
export const MALLAN_PUBLICATION_ELIGIBLE_VALUES: readonly StatusValue[] = Object.freeze([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
  Status.PENDING,
  Status.HOLD,
]);

/** The canonical set of values that should be used in DB `status` filters. */
export const ACTIVE_DISPLAY_VALUES: readonly StatusValue[] = Object.freeze([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
]);

export const TERMINAL_VALUES: readonly StatusValue[] = Object.freeze([
  Status.CANCELLED,
  Status.CLOSED,
  Status.EXPIRED,
  Status.LEASED,
  Status.RENTED,
  Status.SOLD,
  Status.WITHDRAWN,
]);
