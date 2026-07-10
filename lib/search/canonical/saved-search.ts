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

import type { CanonicalFilterKey } from './filter-keys';
import { isSortKey, type SortKey } from './sort';

/** Bump when the canonical filter/sort vocabulary changes in a non-back-compatible way. */
export const CRITERIA_VERSION = 1 as const;

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
 * silently-dead alert (analysis D7-2).
 */
export function unalertableCriteria(
  criteria: SavedSearchCriteria,
  alertableKeys: ReadonlySet<CanonicalFilterKey>,
): CanonicalFilterKey[] {
  return (Object.keys(criteria.filters) as CanonicalFilterKey[]).filter((k) => !alertableKeys.has(k));
}
