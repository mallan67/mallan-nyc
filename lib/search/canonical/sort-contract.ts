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
   * The PROVIDER literal type, which decides how a boundary value is written
   * into OData.
   *
   * Not `typeof value`. JavaScript's idea of a type is not an OData contract:
   * quoting a DateTime because it arrives as a string produces a filter the
   * provider rejects outright. Verified live 2026-08-26 —
   *
   *   ModificationTimestamp gt 2026-08-01T00:00:00Z    -> 266,027 rows
   *   ModificationTimestamp gt '2026-08-01T00:00:00Z'  -> rejected
   *   ListingContractDate gt 2026-01-01                -> 17,375 rows
   *   ListingContractDate gt '2026-01-01'              -> rejected
   *
   * so date and datetime literals are BARE and only strings are quoted.
   */
  readonly literalType: 'decimal' | 'datetime' | 'date' | 'string';
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
  price_desc: { cotalityField: 'ListPrice', direction: 'desc', label: 'Price (high to low)', literalType: 'decimal' },
  price_asc: { cotalityField: 'ListPrice', direction: 'asc', label: 'Price (low to high)', literalType: 'decimal' },
  // LISTED, not modified. Kept as a separate key from updated_* precisely
  // because collapsing them is the defect this contract removes.
  listed_desc: {
    cotalityField: 'ListingContractDate',
    direction: 'desc',
    label: 'Newest listed',
    literalType: 'date',
  },
  listed_asc: {
    cotalityField: 'ListingContractDate',
    direction: 'asc',
    label: 'Oldest listed',
    literalType: 'date',
  },
  updated_desc: {
    cotalityField: 'ModificationTimestamp',
    direction: 'desc',
    label: 'Recently updated',
    literalType: 'datetime',
  },
  updated_asc: {
    cotalityField: 'ModificationTimestamp',
    direction: 'asc',
    label: 'Least recently updated',
    literalType: 'datetime',
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
 * WHICH BUCKET OF THE ORDERING A TRAVERSAL IS IN.
 *
 * Every one of the three sort fields is DECLARED NULLABLE by the provider, and
 * ListingContractDate carries 9,771 nulls today. "We observed zero nulls" is not
 * a provider contract — a future null would fall outside a naive comparison and
 * vanish from the resumed sequence without anything reporting a gap.
 *
 * So the ordering is defined in two explicit phases rather than left to the
 * provider's implicit null placement, which could not be established live:
 * ordering ListingContractDate ASC starts at 1900-01-01 and DESC starts at
 * 2028-03-02, so nulls appear at neither end of the first rows.
 *
 * MALLAN'S NULL POLICY: known values first, in the requested order; unknown
 * values last, ordered by ListingKey. Declared, not inferred.
 */
export enum KeysetPhase {
  /** `field ne null`, ordered by the sort field then ListingKey. */
  KNOWN = 'KNOWN',
  /** `field eq null`, ordered by ListingKey alone. */
  NULLS = 'NULLS',
}

/**
 * Write a boundary value as an OData literal for THIS field's provider type.
 *
 * Driven by the registry, never by `typeof`. Live 2026-08-26: a quoted DateTime
 * or Date literal is rejected outright, so getting this wrong does not degrade
 * the results — it 400s the search.
 */
export function keysetLiteral(key: string, value: string | number): string {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  switch (spec.literalType) {
    case 'decimal':
      return String(Number(value));
    case 'datetime':
    case 'date':
      // BARE. Proven live: `ModificationTimestamp gt 2026-08-01T00:00:00Z`
      // returns rows; the quoted form is rejected.
      return String(value);
    case 'string':
    default:
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

/**
 * ListingKey literals must LOOK like provider keys.
 *
 * Live 2026-08-26: `ListingKey gt 'K1'` returns HTTP 500 "Internal Server
 * Error" — not a 400, not empty. A non-numeric key literal breaks the provider
 * rather than being rejected cleanly, so a synthetic or corrupted boundary key
 * would take the whole search down with an error that says nothing about why.
 *
 * Real boundary keys always come from actual rows and satisfy this naturally.
 * The guard exists for the paths where one might not: a hand-built token, a
 * fixture, a future caller. Fail here, by name, rather than at the provider.
 */
export function assertProviderListingKey(value: string): void {
  if (!/^[0-9]+$/.test(value)) {
    throw new UnsupportedSortError(
      "continuation",
      `ListingKey boundary '${value}' is not a provider key. Live: a non-numeric ` +
        "ListingKey literal returns HTTP 500 from Cotality rather than an empty result.",
    );
  }
}

/** The ORDER BY for a phase. Nulls have no sort value, so only the key orders them. */
export function phaseODataOrderBy(key: string, phase: KeysetPhase): string {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  return phase === KeysetPhase.NULLS
    ? TIE_BREAK
    : `${spec.cotalityField} ${spec.direction}, ${TIE_BREAK}`;
}

/** The clause that scopes a query to one phase. */
export function phaseScopeClause(key: string, phase: KeysetPhase): string {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  // Both `eq null` and `ne null` are filterable on all three sort fields —
  // verified live, and the two buckets sum exactly to the universe
  // (581,534 + 9,771 = 591,305 for ListingContractDate).
  return phase === KeysetPhase.NULLS
    ? `${spec.cotalityField} eq null`
    : `${spec.cotalityField} ne null`;
}

/**
 * The predicate that resumes AFTER a position, within one phase.
 *
 * WHY KEYSET AT ALL. Cotality's own @odata.nextLink is a plain `$skip=N`
 * (verified live — there is no opaque skiptoken), and an offset is only correct
 * against a frozen feed: a listing ahead of the boundary being withdrawn skips a
 * row, one being inserted repeats a row. A keyset names a POSITION IN THE ORDER,
 * so there is no distance-from-the-start left to be invalidated.
 *
 * Proven live: after (128000000, '1146011469') on ListPrice desc the next rows
 * are 88,500,000 then TWO rows both at 85,000,000 ordered by key — the tie is
 * traversed rather than skipped.
 *
 * `lastValue` is null in the NULLS phase, where only the key orders rows.
 */
export function keysetResumePredicate(
  key: string,
  phase: KeysetPhase,
  lastValue: string | number | null,
  lastListingKey: string,
): string {
  const spec = MALLAN_SORT_KEYS[key];
  if (!spec) throw new UnsupportedSortError(key);
  assertProviderListingKey(lastListingKey);
  const k = `'${lastListingKey.replace(/'/g, "''")}'`;

  if (phase === KeysetPhase.NULLS) {
    return `(${spec.cotalityField} eq null and ListingKey gt ${k})`;
  }

  if (lastValue === null || lastValue === undefined) {
    throw new UnsupportedSortError(
      key,
      "A KNOWN-phase resume needs the boundary row's sort value; null belongs to the NULLS phase.",
    );
  }

  const v = keysetLiteral(key, lastValue);
  const field = spec.cotalityField;
  // The tie-break is ALWAYS ascending on ListingKey, in both sort directions,
  // because that is what the ORDER BY emits. Flipping it here would
  // desynchronise the predicate from the ordering it resumes.
  const beyond = spec.direction === 'desc' ? 'lt' : 'gt';
  return `(${field} ne null and (${field} ${beyond} ${v} or (${field} eq ${v} and ListingKey gt ${k})))`;
}
