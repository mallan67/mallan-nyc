/**
 * saved-search.ts — canonical saved-search serialization SHAPE (PURE; no DB, no alerts).
 *
 * Fixes analysis D7-1/D7-2: saved criteria are VERSIONED (`criteria_version`) so a later vocabulary
 * change can't silently reinterpret old searches, and criteria that a target engine can't honor are
 * rejected (fail-loud) rather than saved into a silently-dead alert.
 *
 * This defines the TYPE + validators only. Persisting `criteria_version` as a DB column is a
 * separate, approval-gated migration PR — nothing here touches schema, alerts, or the projection.
 */

import { isCanonicalFilterKey, type CanonicalFilterKey } from './filter-keys';
import { isSortKey, type SortKey } from './sort';

/**
 * Bump when the canonical filter/sort vocabulary changes in a non-back-compatible
 * way.
 *
 * VERSION 2 (2026-08-28) — the canonical vocabulary changed incompatibly:
 *
 *   - one key per BUSINESS CONCEPT, not one per bound. `price_min`/`price_max`
 *     became `list_price` with the bounds in the VALUE, so a range criterion has
 *     a single business identity;
 *   - concepts renamed to their canonical business names — `standard_status` to
 *     `market_status`, `amenities` to `feature_criteria`, `address` to
 *     `street_address`;
 *   - broker-facing listing-id search resolves `listing_id_canonical` (the
 *     Mallan reference) rather than the Cotality provider-evidence entry;
 *   - `sort` is no longer a member of the filter vocabulary at all.
 *
 * Bumped BEFORE any writer produces the new shape. There is no canonical-v1
 * population to migrate — the browser has always written its own snake_case
 * record and this versioned contract was never wired — so this is the cheapest
 * moment it will ever be. Leaving it at 1 would let a v2 blob be read as v1 and
 * silently reinterpreted, which is the exact failure `savedSearchVersionState`
 * exists to prevent.
 *
 * No DB migration is implied: this file describes the SHAPE, and persisting the
 * version as a column remains separate and approval-gated.
 */
export const CRITERIA_VERSION = 2 as const;

export interface SavedSearchCriteria {
  criteria_version: number;
  /** canonical filter key → value (opaque here; validated by the field registry / engine). */
  filters: Partial<Record<CanonicalFilterKey, unknown>>;
  sort: SortKey;
}

/** Serialize criteria, always stamping the current version. */
export function serializeCriteria(input: { filters: Partial<Record<CanonicalFilterKey, unknown>>; sort: SortKey }): SavedSearchCriteria {
  return { criteria_version: CRITERIA_VERSION, filters: { ...input.filters }, sort: input.sort };
}

/**
 * Version state of a stored criteria blob. Prevents SILENT REINTERPRETATION: a criteria_version
 * that is not the current one is 'migration_required' (must be migrated, never read as current);
 * a malformed blob is 'invalid'.
 */
export function savedSearchVersionState(v: unknown): 'current' | 'migration_required' | 'invalid' {
  if (v == null || typeof v !== 'object') return 'invalid';
  const c = v as Record<string, unknown>;
  if (typeof c.criteria_version !== 'number') return 'invalid';
  if (c.filters == null || typeof c.filters !== 'object') return 'invalid';
  if (!isSortKey(c.sort)) return 'invalid';
  // Every filter key must be a canonical key — a typoed/stale key fails loud, never silently accepted.
  for (const k of Object.keys(c.filters as Record<string, unknown>)) {
    if (!isCanonicalFilterKey(k)) return 'invalid';
  }
  return c.criteria_version === CRITERIA_VERSION ? 'current' : 'migration_required';
}

/**
 * A saved search is valid to read as-is only if it carries the CURRENT criteria_version and a known
 * sort key. A stale version is NOT valid (it must be migrated, not reinterpreted) — see
 * savedSearchVersionState.
 */
export function isValidSavedSearch(v: unknown): v is SavedSearchCriteria {
  return savedSearchVersionState(v) === 'current';
}

/**
 * Guard against saving an alert whose criteria the alert engine cannot honor. `alertableKeys` is
 * supplied by the caller (derived from the field registry's `alertable === 'yes'` set). Returns the
 * keys that are NOT alert-capable; a non-empty result means the caller must fail loud, not create a
 * silently-dead alert (analysis D7-2). Callers derive `alertableKeys` from `alertableFilterKeys()`
 * (canonical FILTER keys), NOT from registry field keys.
 */
export function unalertableCriteria(
  criteria: SavedSearchCriteria,
  alertableKeys: ReadonlySet<CanonicalFilterKey>,
): CanonicalFilterKey[] {
  return (Object.keys(criteria.filters) as CanonicalFilterKey[]).filter((k) => !alertableKeys.has(k));
}
