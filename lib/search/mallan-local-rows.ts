/**
 * READING MALLAN-AUTHORED ROWS, AND ORDERING THEM BESIDE PROVIDER ROWS.
 *
 * The `where` lives in `mallan-local-source.ts`; this is the reader and the
 * cross-source comparator. Split because the two answer different questions —
 * "which local listings match" and "where does a local listing sit in the
 * order" — and the second one is where the identity trap lives.
 */
import {
  buildMallanLocalWhere,
  UnsupportedLocalCriterionError,
  type MallanLocalWhere,
} from '@/lib/search/mallan-local-source';

/**
 * A Mallan-authored candidate, in its OWN shape.
 *
 * Deliberately NOT dressed in Cotality field names. Putting "SL-0007" into a
 * property called `ListingKey` — even only to sort with — is the conflation
 * behind every identity defect in this workstream, and the next reader would
 * have no way to tell it from a real provider key.
 */
export interface MallanLocalRow {
  /** Marks the source explicitly, so no consumer has to infer it. */
  readonly __source: 'mallan_local';
  /** Canonical Mallan search identity: "SL-…" / "RL-…". Never a ListingKey. */
  readonly listingId: string;
  readonly listPrice: number | null;
  readonly listedDate: string | null;
  readonly updatedAt: string | null;
}

/** Is this row from Mallan storage rather than the provider feed? */
export function isMallanLocalRow(row: unknown): row is MallanLocalRow {
  return (row as MallanLocalRow | null)?.__source === 'mallan_local';
}

type AnyRow = Record<string, unknown>;

/**
 * The canonical order across BOTH sources, for one sort key.
 *
 * It MUST reduce exactly to the provider ordering when every row is a provider
 * row — a provider-only search may not reorder merely because this function
 * exists. The tie-break falls back to (source rank, canonical identity) because
 * the provider tie-break is `ListingKey asc` and a Mallan row has none.
 */
export function mixedSourceComparator(sortKey: string): (a: AnyRow, b: AnyRow) => number {
  const [field, dir]: ['price' | 'listed' | 'updated', 1 | -1] = (() => {
    switch (sortKey) {
      case 'price_asc': return ['price', 1] as ['price', 1];
      case 'price_desc': return ['price', -1] as ['price', -1];
      case 'listed_asc': return ['listed', 1] as ['listed', 1];
      case 'listed_desc': return ['listed', -1] as ['listed', -1];
      case 'updated_asc': return ['updated', 1] as ['updated', 1];
      case 'updated_desc': return ['updated', -1] as ['updated', -1];
      default: return ['price', -1] as ['price', -1];
    }
  })();

  const valueOf = (r: AnyRow): number | string | null => {
    if (isMallanLocalRow(r)) {
      const m = r as unknown as MallanLocalRow;
      return field === 'price' ? m.listPrice : field === 'listed' ? m.listedDate : m.updatedAt;
    }
    const raw = field === 'price' ? r.ListPrice
      : field === 'listed' ? r.ListingContractDate
      : r.ModificationTimestamp;
    if (raw == null) return null;
    return field === 'price' ? Number(raw) : String(raw);
  };

  const identityOf = (r: AnyRow): string =>
    isMallanLocalRow(r) ? (r as unknown as MallanLocalRow).listingId : String(r.ListingKey ?? '');

  return (a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    // NULLS LAST in both directions. The engine's phases already put the
    // unknown bucket after the known one on the provider side; a local row with
    // no value must land in the same bucket rather than sorting to the top.
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av != null && bv != null) {
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      if (cmp !== 0) return cmp * dir;
    }
    // A deterministic tie-break both sources can answer. Provider rows sort
    // before local rows on an exact tie, then by canonical identity — so a
    // provider-only set reduces to `ListingKey asc`, unchanged.
    const rank = Number(isMallanLocalRow(a)) - Number(isMallanLocalRow(b));
    if (rank !== 0) return rank;
    return identityOf(a).localeCompare(identityOf(b));
  };
}

/** One row as Mallan storage returns it. */
export interface MallanListingRecord {
  listing_id: string | null;
  list_price: unknown;
  listing_contract_date?: Date | null;
  updated_at?: Date | null;
}

export interface MallanLocalCandidateInput {
  readonly params: URLSearchParams;
  /** Runs the query built from the `where`. Injected so failures are testable. */
  readonly findListings: (where: MallanLocalWhere) => Promise<readonly MallanListingRecord[]>;
  /**
   * Restrict to these canonical Mallan identities when an Open House window is
   * active. Undefined means the criterion is not in play.
   */
  readonly openHouseMembers?: ReadonlySet<string>;
  /** Ceiling on rows read; reaching it is `unavailable`, never a smaller set. */
  readonly maxRows?: number;
}

export type MallanLocalCandidates =
  | { readonly state: 'resolved'; readonly rows: readonly MallanLocalRow[] }
  | { readonly state: 'unavailable'; readonly reason: string }
  /**
   * A criterion the broker used that Mallan storage genuinely cannot answer.
   *
   * NOT a 400. Refusing the whole search would REGRESS provider searches that
   * work today and are perfectly answerable — the broker fills in a form, hits
   * search, and gets an error about inventory they were not asking about.
   *
   * The provider half is complete and correct on its own, so the search runs
   * provider-only and the response SAYS the Mallan half was left out and which
   * criterion caused it. That is a capability state the broker can see, rather
   * than either a surprise failure or a silent omission.
   */
  | { readonly state: 'excluded'; readonly criterion: string; readonly reason: string };

/**
 * The COMPLETE set of Mallan-authored candidates for this search.
 *
 * Complete or nothing. A partial local set silently removes real Mallan
 * listings from a real search, and that is indistinguishable from a correct
 * answer. A read failure is `unavailable`; it may never become an empty array,
 * which would state "Mallan has nothing matching".
 */
export async function readMallanLocalCandidates(
  input: MallanLocalCandidateInput,
): Promise<MallanLocalCandidates> {
  const { params, findListings, openHouseMembers, maxRows = 2_000 } = input;

  let where: MallanLocalWhere;
  try {
    ({ where } = buildMallanLocalWhere(params));
  } catch (err) {
    if (err instanceof UnsupportedLocalCriterionError) {
      return { state: 'excluded', criterion: err.criterion, reason: err.message };
    }
    throw err;
  }

  let found: readonly MallanListingRecord[];
  try {
    found = await findListings(where);
  } catch (err) {
    return {
      state: 'unavailable',
      reason: `Mallan listing read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (found.length >= maxRows) {
    return {
      state: 'unavailable',
      reason: `Mallan listing read hit its ${maxRows}-row ceiling; the local half may be incomplete`,
    };
  }

  const rows: MallanLocalRow[] = [];
  for (const l of found) {
    const listingId = String(l.listing_id ?? '').trim();
    if (!listingId) continue; // no canonical identity, not addressable
    // Open House as a CORPUS constraint over this source, not a second query.
    if (openHouseMembers && !openHouseMembers.has(listingId)) continue;
    rows.push({
      __source: 'mallan_local',
      listingId,
      listPrice: l.list_price == null ? null : Number(l.list_price),
      listedDate: l.listing_contract_date ? l.listing_contract_date.toISOString() : null,
      updatedAt: l.updated_at ? l.updated_at.toISOString() : null,
    });
  }
  return { state: 'resolved', rows };
}
