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
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  COMING_SOON: 'ComingSoon',
  /** Left the entitled feed; the provider delivers no status for it (never an invented Withdrawn). */
  DELISTED: 'Delisted',
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
  'Delisted': Status.DELISTED,
  'DELISTED': Status.DELISTED,
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
 * Kept separate from the canonical value so the DB stays in RESO format
 * while the UI gets human-friendly text.
 */
/**
 * Broker-language labels (Maya, 2026-09-08) on the combinations the whole-corpus census proved
 * (lib/listings/canonical-lifecycle.ts): the feed's only in-contract status is Pending, so Pending and the
 * never-delivered ActiveUnderContract both read "In Contract"; Closed is refined to Sold / Rented by
 * transaction type in `statusDisplayLabelFor`. No label is ever the UCBA Art. I §5(D)-prohibited "Off-Market".
 */
const CANONICAL_TO_LABEL: Record<StatusValue, string> = {
  [Status.ACTIVE]: 'Active',
  [Status.ACTIVE_UNDER_CONTRACT]: 'In Contract',
  [Status.CANCELLED]: 'Cancelled',
  [Status.CLOSED]: 'Closed',
  [Status.COMING_SOON]: 'Coming Soon',
  [Status.DELISTED]: 'Delisted',
  [Status.EXPIRED]: 'Expired',
  [Status.HOLD]: 'Temporarily Off Market',
  [Status.LEASED]: 'Rented',
  [Status.PENDING]: 'In Contract',
  [Status.RENTED]: 'Rented',
  [Status.SOLD]: 'Sold',
  [Status.WITHDRAWN]: 'Withdrawn',
};

/**
 * Statuses that count as "actively on market" for public search display.
 *
 * Coming Soon is included — it IS displayable (with the REBNY §16(C) badge). ActiveUnderContract is
 * included (a live member; 0 rows today). Pending IS included: it is the feed's in-contract status and the
 * IDX Plus feed delivers it under Permission IDX (5,590 live rows, census 2026-09-08); Maya's decision is that
 * In Contract listings appear publicly with that label.
 */
const ACTIVE_DISPLAY_STATUSES = new Set<StatusValue>([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
  Status.PENDING,
]);

/**
 * Statuses that mean "listing is off-market" for REBNY UCBA Art. I §6
 * 24-hour removal enforcement. Delisted (left the feed) is terminal too.
 */
const TERMINAL_STATUSES = new Set<StatusValue>([
  Status.CANCELLED,
  Status.CLOSED,
  Status.DELISTED,
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

/**
 * Display label refined by transaction type: a Closed sale reads "Sold", a Closed rental reads "Rented".
 * Unknown transaction type keeps the neutral "Closed". Unrecognized status → '' (fail-closed).
 */
export function statusDisplayLabelFor(status: unknown, listingType: unknown): string {
  const canonical = normalizeStatus(status);
  if (!canonical) return '';
  if (canonical === Status.CLOSED) {
    if (listingType === 'sale') return 'Sold';
    if (listingType === 'rent' || listingType === 'rental') return 'Rented';
  }
  return CANONICAL_TO_LABEL[canonical];
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
  Status.PENDING,
]);

export const TERMINAL_VALUES: readonly StatusValue[] = Object.freeze([
  Status.CANCELLED,
  Status.CLOSED,
  Status.DELISTED,
  Status.EXPIRED,
  Status.LEASED,
  Status.RENTED,
  Status.SOLD,
  Status.WITHDRAWN,
]);
