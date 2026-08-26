/**
 * THE SAVED SEARCH PERSISTENCE BOUNDARY.
 *
 * Execution became canonical in Tranche 1: the server registry is keyed by
 * Mallan criteria and Cotality field names live only inside it. Persistence did
 * not follow. `saved-searches.js` wrote `checkbox_filters` as a JSON STRING of
 * legacy provider-style keys (`View`, `PetsAllowed`, `LaundryFeatures`), and
 * every route persisted and returned `criteria` exactly as received.
 *
 * So canonical identity stopped at execution and storage remained a SECOND
 * TRUTH. A saved search is not a cache of a query — it is the query, replayed
 * days later. If storage speaks a different vocabulary than execution, the two
 * drift, and the broker reloads something other than what they saved.
 *
 * This normalizer eliminates the split. It is the ONE place a legacy key is
 * understood, it lives in the canonical layer rather than in CRM JavaScript, and
 * it runs at every persistence boundary (POST, PATCH, GET list, GET one).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR DISPOSITIONS. AN UNKNOWN CRITERION IS NEVER DROPPED.
 *
 *   canonical            a known Mallan criterion
 *   legacy_unavailable   a real control with no verified provider contract
 *   unknown              a key nothing recognises
 *   malformed            wrong shape (not an array of scalars)
 *
 * Dropping an unrecognised criterion silently converts a RESTRICTIVE saved
 * search into a BROADER one — the broker saved "doorman only" and reloads
 * "everything". That is the same silent-widening failure as a dropped status,
 * arriving through storage. Unrecognised criteria therefore survive
 * normalization and are reported so the caller can raise UNSUPPORTED_CRITERION
 * rather than quietly running a different search.
 *
 * NO DB MIGRATION. Legacy rows are normalized IN MEMORY on read. Nothing is
 * rewritten or backfilled.
 */
import { canonicalCheckboxCriterion } from "@/lib/search/canonical/checkbox-criteria";

/**
 * Canonical Mallan keys for the boolean checkbox criteria.
 *
 * These predate the Tranche 1 registry and were still persisted under provider
 * field names. Their canonical names preserve EXACT semantics — `GarageYN` is a
 * garage, so it becomes `garage` and NOT a generic `parking`, because garage is
 * not all parking and the broader word would be an invented equivalence.
 */
const BOOLEAN_CANONICAL: Readonly<Record<string, string>> = Object.freeze({
  LandLeaseYN: "land_lease",
  CoolingYN: "cooling",
  GarageYN: "garage",
  NewConstructionYN: "new_construction",
  NewConstruction: "new_construction",
});

const BOOLEAN_CANONICAL_NAMES: ReadonlySet<string> = new Set(Object.values(BOOLEAN_CANONICAL));

export interface NormalizedCheckboxFilters {
  /** Canonical Mallan criterion -> selected values. */
  readonly canonical: Record<string, string[]>;
  /** Keys carried forward that have no verified contract, with their original name. */
  readonly unavailable: string[];
  /** Keys nothing recognises. Carried, never dropped. */
  readonly unknown: string[];
  /** Keys whose value shape is wrong. Carried, never dropped. */
  readonly malformed: string[];
}

export interface NormalizedSavedSearch {
  /** The criteria object with a canonical `checkbox_filters` OBJECT (never a string). */
  readonly criteria: Record<string, unknown>;
  readonly checkboxes: NormalizedCheckboxFilters;
  /** True when any criterion could not be canonicalised. */
  readonly hasUnresolved: boolean;
}

/** The canonical Mallan key for a persisted checkbox key, or null. */
export function canonicalSavedSearchKey(key: string): string | null {
  if (BOOLEAN_CANONICAL[key]) return BOOLEAN_CANONICAL[key];
  if (BOOLEAN_CANONICAL_NAMES.has(key)) return key;
  return canonicalCheckboxCriterion(key);
}

function parseCheckboxContainer(raw: unknown): { value: Record<string, unknown> | null; malformed: boolean } {
  if (raw === null || raw === undefined) return { value: null, malformed: false };
  if (typeof raw === "string") {
    // Legacy shape: a JSON STRING inside a JSON column. Readable, not written.
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown>, malformed: false };
      }
      return { value: null, malformed: true };
    } catch {
      return { value: null, malformed: true };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { value: raw as Record<string, unknown>, malformed: false };
  }
  return { value: null, malformed: true };
}

/** Normalize one `checkbox_filters` container to canonical Mallan keys. */
export function normalizeCheckboxFilters(raw: unknown): NormalizedCheckboxFilters {
  const canonical: Record<string, string[]> = {};
  const unavailable: string[] = [];
  const unknown: string[] = [];
  const malformed: string[] = [];

  const { value, malformed: containerMalformed } = parseCheckboxContainer(raw);
  if (containerMalformed) {
    // The whole container is unreadable. Recorded by name so the caller can
    // fail loudly — a malformed container must not read as "no filters".
    malformed.push("checkbox_filters");
    return { canonical, unavailable, unknown, malformed };
  }
  if (!value) return { canonical, unavailable, unknown, malformed };

  for (const [key, rawValues] of Object.entries(value)) {
    if (!Array.isArray(rawValues)) {
      malformed.push(key);
      continue;
    }
    const values = rawValues.map((v) => String(v));
    const canonicalKey = canonicalSavedSearchKey(key);

    if (canonicalKey) {
      const existing = canonical[canonicalKey] ?? [];
      for (const v of values) if (!existing.includes(v)) existing.push(v);
      canonical[canonicalKey] = existing;
      continue;
    }

    // Not canonicalisable. It still travels: a saved search that quietly loses a
    // criterion runs BROADER than the broker saved.
    if (/^[A-Z]/.test(key)) unavailable.push(key);
    else unknown.push(key);
    canonical[key] = values;
  }

  return { canonical, unavailable, unknown, malformed };
}

/**
 * Normalize a whole Saved Search criteria object.
 *
 * Every other criterion key passes through untouched — this boundary owns the
 * checkbox vocabulary, not the whole schema, and inventing normalisation for
 * keys it has not proven would be the same overreach it exists to prevent.
 */
export function normalizeSavedSearchCriteria(input: unknown): NormalizedSavedSearch {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? ({ ...(input as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const checkboxes = normalizeCheckboxFilters(source.checkbox_filters);

  if (source.checkbox_filters !== undefined) {
    // Always an OBJECT going forward. A JSON string inside a JSON column forces
    // every reader to re-parse a value the database could have held natively.
    source.checkbox_filters = checkboxes.canonical;
  }

  return {
    criteria: source,
    checkboxes,
    hasUnresolved:
      checkboxes.unavailable.length > 0 ||
      checkboxes.unknown.length > 0 ||
      checkboxes.malformed.length > 0,
  };
}
