// lib/compliance/status.ts
//
// Canonical listing-status representation — single source of truth.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Before this module, the codebase mixed three different formats for the same
// values across 37 files:
//   "ComingSoon"        (RESO internal, DB format)
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
 * stores (matches REBNY RESO StandardStatus enum, no spaces).
 *
 * Values ALPHABETIZED by enum key to keep the order deterministic across
 * schema diffs. The underlying string values are whatever RESO uses.
 */
export const Status = {
  ACTIVE: 'Active',
  ACTIVE_UNDER_CONTRACT: 'ActiveUnderContract',
  CANCELED: 'Canceled',
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
  'Canceled': Status.CANCELED,
  'Closed': Status.CLOSED,
  'ComingSoon': Status.COMING_SOON,
  'Expired': Status.EXPIRED,
  'Hold': Status.HOLD,
  'Leased': Status.LEASED,
  'Pending': Status.PENDING,
  'Rented': Status.RENTED,
  'Sold': Status.SOLD,
  'Withdrawn': Status.WITHDRAWN,

  // Human display format (RESO-style with spaces — Trestle sometimes sends these)
  'Active Under Contract': Status.ACTIVE_UNDER_CONTRACT,
  'Coming Soon': Status.COMING_SOON,

  // LEGACY MALLAN SPELLING — accepted on input, never emitted.
  //
  // This entry used to read `'Canceled': Status.CANCELLED` under the comment
  // "Common typo / alternate spelling". It had the two values the wrong way
  // round: `Canceled` (one L) is the live Cotality value, and `Cancelled`
  // (two Ls) is the one Mallan invented. The provider's own value was filed
  // here as the typo.
  //
  // Real rows carry both and no backfill is in scope, so the invented spelling
  // stays accepted as INPUT forever. It is simply no longer what we store.
  'Cancelled': Status.CANCELED,

  // URL / API-param format (rarely incoming, but defensively accepted)
  'ACTIVE': Status.ACTIVE,
  'ACTIVE_UNDER_CONTRACT': Status.ACTIVE_UNDER_CONTRACT,
  'COMING_SOON': Status.COMING_SOON,
  'CLOSED': Status.CLOSED,
  'PENDING': Status.PENDING,
  'SOLD': Status.SOLD,
  'WITHDRAWN': Status.WITHDRAWN,
  'CANCELED': Status.CANCELED,
  'CANCELLED': Status.CANCELED,
  'EXPIRED': Status.EXPIRED,
  'HOLD': Status.HOLD,
  'LEASED': Status.LEASED,
  'RENTED': Status.RENTED,
};

/**
 * Canonical display label for a status (what a buyer sees on the listing
 * card).
 *
 * Kept separate from the canonical value so the DB stays in RESO format
 * while the UI gets human-friendly text.
 */
const CANONICAL_TO_LABEL: Record<StatusValue, string> = {
  [Status.ACTIVE]: 'Active',
  [Status.ACTIVE_UNDER_CONTRACT]: 'Under Contract',
  [Status.CANCELED]: 'Canceled',
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
 * even though it's not technically "Active" per RESO. ActiveUnderContract
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
  Status.CANCELED,
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

/** The canonical set of values that should be used in DB `status` filters. */
export const ACTIVE_DISPLAY_VALUES: readonly StatusValue[] = Object.freeze([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
]);

export const TERMINAL_VALUES: readonly StatusValue[] = Object.freeze([
  Status.CANCELED,
  Status.CLOSED,
  Status.EXPIRED,
  Status.LEASED,
  Status.RENTED,
  Status.SOLD,
  Status.WITHDRAWN,
]);
