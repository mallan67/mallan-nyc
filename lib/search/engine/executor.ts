/**
 * THE SEARCH EXECUTOR — one entry point for every consumer of the settled universe.
 *
 *   live Agent Search (/api/idx/search)
 *   Saved Search execute (/api/crm/saved-searches/[id]/execute)
 *   Saved Search count (create / update stamp result_count)
 *   alert matching (/api/cron/search-alerts)
 *
 * all call this module with `SearchCriteria` produced by `criteriaFromParams`. Membership,
 * order, total and the page are decided here and nowhere else (Search Consolidation Packet 2).
 * A temporal alert rule ("new since") is applied OVER the complete universe, never to a page.
 */

import { hydratePage, type HydratedPage } from './hydrate';
import { SEARCH_SELECT_FIELDS } from './select';
import { pageOf, settleUniverse, type SettledUniverse, type UniverseRow } from './universe';
import type { SearchCriteria } from './criteria';

// Settled-universe cache: keyed by criteria WITHOUT paging, short-lived. Per function instance.
const UNIVERSE_TTL_MS = 60_000;
const UNIVERSE_MAX = 64;
const universeCache = new Map<string, { u: SettledUniverse; expiresAt: number }>();

export function universeKeyOf(c: SearchCriteria): string {
  const { limit: _l, offset: _o, ...rest } = c;
  return JSON.stringify(rest);
}

function cachedUniverse(key: string): SettledUniverse | null {
  const e = universeCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { universeCache.delete(key); return null; }
  return e.u;
}

function rememberUniverse(key: string, u: SettledUniverse): void {
  if (universeCache.size >= UNIVERSE_MAX) {
    const first = universeCache.keys().next().value;
    if (first !== undefined) universeCache.delete(first);
  }
  universeCache.set(key, { u, expiresAt: Date.now() + UNIVERSE_TTL_MS });
}

/** Settle (or reuse, within the TTL) the universe for criteria. `cache: false` always settles afresh. */
export async function settledUniverseFor(c: SearchCriteria, cache = true): Promise<{ universe: SettledUniverse; fromCache: boolean }> {
  const key = universeKeyOf(c);
  if (cache) {
    const hit = cachedUniverse(key);
    if (hit) return { universe: hit, fromCache: true };
  }
  const universe = await settleUniverse(c);
  if (cache) rememberUniverse(key, universe);
  return { universe, fromCache: false };
}

export interface ExecuteOptions {
  select?: readonly string[];
  media?: boolean;
  cache?: boolean;
}

export interface ExecutedSearch {
  listings: Record<string, unknown>[];
  total: number;
  countMeaning: 'exact' | 'lower_bound';
  hasMore: boolean;
  skip: number;
  limit: number;
  universe: SettledUniverse;
  universeFromCache: boolean;
  page: UniverseRow[];
  hydrated: HydratedPage;
}

/** Execute one page of criteria: settle → page → hydrate. The same call for every consumer. */
export async function executeSearch(c: SearchCriteria, o: ExecuteOptions = {}): Promise<ExecutedSearch> {
  const { universe, fromCache } = await settledUniverseFor(c, o.cache !== false);
  const page = pageOf(universe, c.offset, c.limit);
  const hydrated = await hydratePage(page, { select: o.select ?? SEARCH_SELECT_FIELDS, media: o.media !== false });
  const pageShort = hydrated.missing.length + hydrated.gateExcluded.length;
  const countMeaning = universe.countMeaning === 'exact' && pageShort === 0 ? 'exact' : 'lower_bound';
  return {
    listings: hydrated.listings,
    total: universe.total,
    countMeaning,
    hasMore: c.offset + page.length < universe.total,
    skip: c.offset,
    limit: c.limit,
    universe, universeFromCache: fromCache, page, hydrated,
  };
}

/** The universe total for criteria — the Saved Search count, from the same membership as execution. */
export async function countSearch(c: SearchCriteria, cache = true): Promise<{ total: number; countMeaning: 'exact' | 'lower_bound' }> {
  const { universe } = await settledUniverseFor(c, cache);
  return { total: universe.total, countMeaning: universe.countMeaning };
}

/**
 * Alert delta: the rows of the COMPLETE universe whose source modification time is after
 * `since`, in universe order. A row with no modification time cannot prove it is new; it is
 * excluded and counted, never guessed. This is a delivery rule, not a Search criterion.
 */
export function rowsModifiedSince(u: SettledUniverse, since: Date): { rows: UniverseRow[]; unknownTimestamp: number } {
  const t = since.getTime();
  const rows: UniverseRow[] = [];
  let unknownTimestamp = 0;
  for (const r of u.rows) {
    if (r.modificationTimestamp == null) { unknownTimestamp++; continue; }
    const m = Date.parse(r.modificationTimestamp);
    if (Number.isNaN(m)) { unknownTimestamp++; continue; }
    if (m > t) rows.push(r);
  }
  return { rows, unknownTimestamp };
}

/** Hydrate an explicit row set (e.g. the capped alert delivery) into the shared DTO. */
export async function hydrateRows(rows: readonly UniverseRow[], o: ExecuteOptions = {}): Promise<HydratedPage> {
  return hydratePage(rows, { select: o.select ?? SEARCH_SELECT_FIELDS, media: o.media !== false });
}
