/**
 * THE CANONICAL SORT CONTRACT.
 *
 * Sort is part of result identity, not a display preference: it decides which
 * listings land on page 1 and therefore which ones a broker actually sees. So it
 * gets the same treatment as every other criterion — a closed registry of Mallan
 * keys, each mapped to a live-verified provider field, each rendered with a
 * deterministic tie-break, and anything unrecognised refused by name.
 *
 * WHAT THIS REPLACES:
 *
 *     const effectiveSort = sort || "ModificationTimestamp desc";
 *
 * A caller-authored OData fragment handed to the provider unexamined, with a
 * silent default for anything the route did not understand — which was
 * everything, because it never looked. Three live problems came out of that:
 *
 *   1. RAW PROVIDER FRAGMENT FROM A CALLER. The same passthrough shape this
 *      codebase already refuses for `gridFilter`.
 *
 *   2. A SUPPRESSED FIELD OFFERED AS A SORT. The toolbar maps the DOM column to
 *      `DaysOnMarket`. Live 2026-08-26: "Results from 'RLS' has been suppressed
 *      (provider Level) as field DaysOnMarket' cannot be used for filtering or
 *      ordering queries." Sorting by DOM does not sort badly — it 400s the whole
 *      search.
 *
 *   3. A MISLABELLED FIELD. `listedDate` was mapped to `ModificationTimestamp`.
 *      When a listing was LISTED is `ListingContractDate`; ModificationTimestamp
 *      is when the record was last touched. "Sort by listed date" silently
 *      sorted by last-modified.
 *
 * THE TIE-BREAK IS NOT DECORATION. Rows sharing a sort value have no defined
 * order in OData, so page 1 and page 2 of an unstable sort can return the same
 * listing twice and omit another entirely. Every clause therefore ends with
 * `ListingKey asc`, which makes the ordering total.
 *
 * Live-verified orderable on Property, 2026-08-26, against 7,864 Active rows:
 * ListPrice, ModificationTimestamp, ListingContractDate, ListingKey.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  /** A field proven orderable by EXECUTING an $orderby, not by metadata. */
  readonly cotalityField: string;
  readonly direction: SortDirection;
  /** What the broker sees. */
  readonly label: string;
  /**
   * Whether a KEYSET continuation is safe on this field.
   *
   * Keyset resumes with "rows ordered after (value, ListingKey)" instead of
   * "skip N rows", which is what makes it stable while the feed changes
   * underneath a broker. It requires the field to be NON-NULL on every row: a
   * null cannot be compared, so null-valued rows would be silently dropped from
   * the resumed sequence.
   *
   * Verified live 2026-08-26, UNSCOPED (all statuses, including the 577,526
   * Closed rows), because "no nulls among Active" would not have been enough:
   *
   *   ListPrice              0 nulls  -> keyset safe
   *   ModificationTimestamp  0 nulls  -> keyset safe
   *   ListingContractDate    9,771 nulls -> NOT safe
   */
  readonly keysetSafe: boolean;
}

/**
 * The identity tie-break appended to every sort.
 *
 * ListingKey is the provider's own identity domain and is orderable, so it
 * totalises any ordering without changing the requested one.
 */
const TIE_BREAK = 'ListingKey asc';

/** Every sort Mallan offers, keyed by MALLAN name rather than provider field. */
export const MALLAN_SORT_KEYS: Readonly<Record<string, SortSpec>> = Object.freeze({
  price_desc: { cotalityField: 'ListPrice', direction: 'desc', label: 'Price (high to low)', keysetSafe: true },
  price_asc: { cotalityField: 'ListPrice', direction: 'asc', label: 'Price (low to high)', keysetSafe: true },
  // LISTED, not modified. Kept as a separate key from updated_* precisely
  // because collapsing them is the defect this contract removes.
  listed_desc: {
    cotalityField: 'ListingContractDate',
    direction: 'desc',
    label: 'Newest listed',
    // 9,771 rows carry a null ListingContractDate, and where the provider
    // orders those nulls could not be established: ordering ASC starts at
    // 1900-01-01 and DESC starts at 2028-03-02, so nulls appear at neither end
    // of the first rows. Guessing would silently drop those listings from a
    // resumed sequence, so this sort takes the bounded rescan instead.
    keysetSafe: false,
  },
  listed_asc: {
    cotalityField: 'ListingContractDate',
    direction: 'asc',
    label: 'Oldest listed',
    keysetSafe: false,
  },
  updated_desc: {
    cotalityField: 'ModificationTimestamp',
    direction: 'desc',
    label: 'Recently updated',
    keysetSafe: true,
  },
  updated_asc: {
    cotalityField: 'ModificationTimestamp',
    direction: 'asc',
    label: 'Least recently updated',
    keysetSafe: true,
  },
});

/**
 * Provider strings the shipped client still emits, mapped onto canonical keys.
 *
 * An ALLOWLIST OF PROVEN STRINGS, not a syntax rule: `LivingArea desc` is
 * shaped identically and is refused, because nobody has executed an $orderby
 * against it. Compatibility is for the values already in the field, and it
 * exists so those callers pick up the tie-break too.
 */
const LEGACY_PROVIDER_SORTS: Readonly<Record<string, string>> = Object.freeze({
  'ListPrice desc': 'price_desc',
  'ListPrice asc': 'price_asc',
  'ModificationTimestamp desc': 'updated_desc',
  'ModificationTimestamp asc': 'updated_asc',
  'ListingContractDate desc': 'listed_desc',
  'ListingContractDate asc': 'listed_asc',
});

/**
 * Sorts a caller may plausibly ask for that cannot be served, each with the
 * reason. A broker told only "unsupported" will ask again next quarter.
 */
const REFUSED_WITH_REASON: Readonly<Record<string, string>> = Object.freeze({
  DaysOnMarket:
    'Provider-suppressed for ordering. Live 2026-08-26: $orderby=DaysOnMarket -> ' +
    'HTTP 400 "Results from \'RLS\' has been suppressed (provider Level) as field ' +
    "DaysOnMarket' cannot be used for filtering or ordering queries.\" The field " +
    'exists on Property; the licence forbids ordering by it.',
  CumulativeDaysOnMarket:
    'Same provider suppression family as DaysOnMarket, and not separately proven.',
});

/** The sort used when a caller asks for none. ABSENT is not UNRECOGNISED. */
export const DEFAULT_SORT_KEY = 'updated_desc';

export class UnsupportedSortError extends Error {
  readonly requested: string;
  readonly supported: readonly string[];

  constructor(requested: string, detail?: string) {
    super(
      `Unsupported sort '${requested}'.` +
        (detail ? ` ${detail}` : '') +
        ` Supported: ${Object.keys(MALLAN_SORT_KEYS).join(', ')}.` +
        ' Mallan will not silently substitute a different order — sort decides' +
        ' which listings reach page 1.',
    );
    this.name = 'UnsupportedSortError';
    this.requested = requested;
    this.supported = Object.keys(MALLAN_SORT_KEYS);
  }
}

/**
 * Resolve a requested sort to a canonical key.
 *
 * `null`/`undefined` means the caller asked for no particular order and gets the
 * documented default. An empty string is NOT that: it is a value that failed to
 * be a sort, and defaulting on it would hide a broken caller.
 */
export function resolveSort(requested: string | null | undefined): { key: string; spec: SortSpec } {
  if (requested == null) {
    return { key: DEFAULT_SORT_KEY, spec: MALLAN_SORT_KEYS[DEFAULT_SORT_KEY] };
  }

  const value = requested.trim();
  if (value !== '') {
    if (value in MALLAN_SORT_KEYS) return { key: value, spec: MALLAN_SORT_KEYS[value] };

    const legacy = LEGACY_PROVIDER_SORTS[value];
    if (legacy) return { key: legacy, spec: MALLAN_SORT_KEYS[legacy] };
  }

  // Carry the reason when there is one, so the refusal teaches something.
  const field = value.split(/\s+/)[0];
  throw new UnsupportedSortError(requested, REFUSED_WITH_REASON[field]);
}

/** Render the provider `$orderby` for a canonical key, tie-break included. */
export function sortODataClause(key: string): string {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  return `${spec.cotalityField} ${spec.direction}, ${TIE_BREAK}`;
}

/**
 * The OData predicate that resumes AFTER a given position in this sort order.
 *
 * WHY THIS EXISTS. Cotality's own `@odata.nextLink` is a plain `$skip=N`
 * (verified live 2026-08-26 — there is no opaque skiptoken), and a numeric
 * offset is only correct against a frozen feed. Between two page requests a
 * listing ahead of the boundary can change price, be added, or be withdrawn,
 * and the offset then points somewhere else — duplicating or skipping rows even
 * though every sort carries a ListingKey tie-break.
 *
 * A keyset predicate asks "rows ordered after (value, key)" instead, which is
 * stable under exactly those changes: it names a POSITION IN THE ORDERING
 * rather than a distance from the start.
 *
 * Proven live: after (128000000, '1146011469') on `ListPrice desc, ListingKey
 * asc` the next rows are 88,500,000 then two rows both at 85,000,000 ordered by
 * key — the tie is traversed correctly rather than skipped.
 *
 * Returns null when the sort is not keyset-safe, so the caller falls back
 * rather than emitting a predicate that would drop null-valued rows.
 */
export function keysetResumePredicate(
  key: string,
  lastValue: string | number,
  lastListingKey: string,
): string | null {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  if (!spec.keysetSafe) return null;

  const field = spec.cotalityField;
  // Values are emitted the way OData compares them: numbers bare, everything
  // else quoted with quotes doubled.
  const v =
    typeof lastValue === 'number'
      ? String(lastValue)
      : `'${String(lastValue).replace(/'/g, "''")}'`;
  const k = `'${lastListingKey.replace(/'/g, "''")}'`;
  // The tie-break is ALWAYS ascending on ListingKey, in both sort directions,
  // because that is what sortODataClause emits.
  const beyond = spec.direction === 'desc' ? 'lt' : 'gt';
  return `(${field} ${beyond} ${v} or (${field} eq ${v} and ListingKey gt ${k}))`;
}
