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
import {
  canonicalCheckboxCriterion,
  validateCheckboxValues,
} from "@/lib/search/canonical/checkbox-criteria";

/**
 * NO BOOLEAN MAP LIVES HERE.
 *
 * An earlier cut of this file kept its own `BOOLEAN_CANONICAL`
 * (LandLeaseYN -> land_lease, GarageYN -> garage, ...) while
 * crm-idx-filter kept a separate `booleanFields` set and a `NewConstruction`
 * alias. Two mappings for one business criterion is the translation-table drift
 * this whole workstream exists to remove — and it was reintroduced here, in the
 * module whose job is to end exactly that split.
 *
 * The booleans now live in the ONE checkbox registry alongside the multi-enums,
 * each entry carrying its own `kind`. This file resolves keys through that
 * registry and owns no vocabulary of its own.
 */
/**
 * What may be persisted as a criterion VALUE.
 *
 * `Array.isArray()` alone was not enough: elements were pushed through
 * `String(v)`, so `[{x:1}]` became `["[object Object]"]`, `[["City"]]` silently
 * flattened to `["City"]`, and `[null]` became the string `"null"`. That is not
 * canonicalisation, it is corruption — a fabricated criterion the broker never
 * chose.
 */
function isPersistableScalar(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export interface NormalizedCheckboxFilters {
  /** Canonical Mallan criterion -> selected values. */
  readonly canonical: Record<string, string[]>;
  /** Keys carried forward that have no verified contract, with their original name. */
  readonly unavailable: string[];
  /** Keys nothing recognises. Carried, never dropped. */
  readonly unknown: string[];
  /** Keys whose value shape is wrong. Carried, never dropped. */
  readonly malformed: string[];
  /**
   * Canonical keys carrying a value that cannot execute — unresolved semantics,
   * a non-member, or a boolean contradiction. A canonical KEY is not a verified
   * criterion: `view` is canonical and `view: Park` is still unexecutable.
   */
  readonly unexecutableValues: string[];
  /** The unreadable container, preserved verbatim when parsing failed. */
  readonly rawContainer?: unknown;
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
  const unexecutableValues: string[] = [];

  const { value, malformed: containerMalformed } = parseCheckboxContainer(raw);
  if (containerMalformed) {
    // The whole container is unreadable. It is recorded by name AND the raw
    // value is preserved, because an unreadable container silently becoming an
    // empty filter set turns a narrow saved search into an unrestricted one.
    malformed.push("checkbox_filters");
    return { canonical, unavailable, unknown, malformed, unexecutableValues, rawContainer: raw };
  }
  if (!value) return { canonical, unavailable, unknown, malformed, unexecutableValues };

  for (const [key, rawValues] of Object.entries(value)) {
    // MALFORMED IS PRESERVED, NOT SKIPPED.
    //
    // An earlier cut recorded the key in `malformed` and then dropped it, so
    // `{View: "City"}` normalised to `{}` — the criterion vanished and the
    // saved search became BROADER. That is the precise failure this module
    // claims to prevent, committed inside the module itself. The original value
    // now travels so a caller can reject the write or mark the record invalid.
    if (!Array.isArray(rawValues) || !rawValues.every(isPersistableScalar)) {
      malformed.push(key);
      canonical[key] = rawValues as never;
      continue;
    }
    const values = rawValues.map((v) => String(v));
    const canonicalKey = canonicalSavedSearchKey(key);

    if (canonicalKey) {
      // A canonical key is not enough. Ask the ONE value authority whether the
      // selected values can actually execute — otherwise a perfectly canonical
      // `view: Park` stores as executable and fails at the provider later.
      const verdict = validateCheckboxValues(canonicalKey, values);
      if (verdict.disposition !== "executable") {
        unexecutableValues.push(`${canonicalKey}: ${verdict.offending.join(", ")}`);
      }
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

  return { canonical, unavailable, unknown, malformed, unexecutableValues };
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
    if (checkboxes.malformed.includes("checkbox_filters")) {
      // Leave the unreadable original in place. Replacing it with {} would
      // present an unrestricted search as a normalised one.
      source.checkbox_filters = checkboxes.rawContainer;
    } else {
      // Always an OBJECT going forward. A JSON string inside a JSON column
      // forces every reader to re-parse a value the database could hold natively.
      source.checkbox_filters = checkboxes.canonical;
    }
  }

  return {
    criteria: source,
    checkboxes,
    hasUnresolved:
      checkboxes.unavailable.length > 0 ||
      checkboxes.unknown.length > 0 ||
      checkboxes.malformed.length > 0 ||
      checkboxes.unexecutableValues.length > 0,
  };
}

/** Whether a stored Saved Search may execute as written. */
export type SavedSearchCriteriaStatus = "executable" | "unsupported_criteria" | "malformed_criteria";

export interface SavedSearchDisposition {
  readonly criteria_status: SavedSearchCriteriaStatus;
  readonly criteria_issues: {
    readonly malformed: string[];
    readonly unknown: string[];
    readonly unavailable: string[];
    readonly unexecutable_values: string[];
  };
}

/**
 * The execution disposition of a stored record.
 *
 * A legacy row must stay READABLE without any database rewrite — an agent may
 * need to open it to repair it. But readable is not the same as runnable: if its
 * meaning cannot be fully represented, executing it runs a BROADER search than
 * the one that was saved. So the disposition travels with the record and the
 * client gates auto-execution on it, instead of loading and firing regardless.
 */
export function savedSearchDisposition(input: unknown): SavedSearchDisposition {
  const { checkboxes } = normalizeSavedSearchCriteria(input);
  const status: SavedSearchCriteriaStatus = checkboxes.malformed.length > 0
    ? "malformed_criteria"
    : checkboxes.unknown.length > 0 ||
      checkboxes.unavailable.length > 0 ||
      checkboxes.unexecutableValues.length > 0
      ? "unsupported_criteria"
      : "executable";
  return {
    criteria_status: status,
    criteria_issues: {
      malformed: checkboxes.malformed,
      unknown: checkboxes.unknown,
      unavailable: checkboxes.unavailable,
      unexecutable_values: checkboxes.unexecutableValues,
    },
  };
}
