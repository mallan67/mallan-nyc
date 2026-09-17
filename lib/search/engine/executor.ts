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
import type { SearchAudience } from './audience-gate';
import type { CountMeaning } from './universe';

// Settled-universe cache: keyed by criteria WITHOUT paging, short-lived. Per function instance.
const UNIVERSE_TTL_MS = 60_000;
const UNIVERSE_MAX = 64;
const universeCache = new Map<string, { u: SettledUniverse; expiresAt: number }>();

/**
 * Cache identity = AUDIENCE + criteria-without-pagination.
 *
 * Audience is not decoration here. A participant-only row belongs to the member universe and not to the
 * public one, so two otherwise identical searches settle different memberships and different totals. With
 * audience absent from the key, whichever audience ran first would serve its universe to the other — a
 * member could receive the public count, or, far worse, the public could receive a universe containing
 * participant-only inventory.
 */
export function universeKeyOf(c: SearchCriteria, audience: SearchAudience): string {
  const { limit: _l, offset: _o, ...rest } = c;
  return JSON.stringify({ audience, ...rest });
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
export async function settledUniverseFor(c: SearchCriteria, audience: SearchAudience, cache = true): Promise<{ universe: SettledUniverse; fromCache: boolean }> {
  const key = universeKeyOf(c, audience);
  if (cache) {
    const hit = cachedUniverse(key);
    if (hit) return { universe: hit, fromCache: true };
  }
  const universe = await settleUniverse(c, audience);
  if (cache) rememberUniverse(key, universe);
  return { universe, fromCache: false };
}

export interface ExecuteOptions {
  select?: readonly string[];
  media?: boolean;
  cache?: boolean;
  /** Who receives the rows (participants-only gate). Undeclared = the public (fail-closed). */
  audience?: SearchAudience;
}

export interface ExecutedSearch {
  listings: Record<string, unknown>[];
  total: number;
  countMeaning: CountMeaning;
  hasMore: boolean;
  skip: number;
  limit: number;
  universe: SettledUniverse;
  universeFromCache: boolean;
  page: UniverseRow[];
  hydrated: HydratedPage;
}

/**
 * Combine what the universe knows with what hydration lost, WITHOUT inverting the sign.
 *
 * The previous rule was `exact && pageShort === 0 ? 'exact' : 'lower_bound'`. When rows were counted and
 * then removed the total is too HIGH, and calling that a lower bound tells a caller "at least N" when the
 * truth is "at most N" — the opposite error, stated confidently.
 *
 *   walk complete   + nothing lost  → exact
 *   walk incomplete + nothing lost  → lower_bound   (there may be more)
 *   walk complete   + rows lost     → upper_bound   (there are fewer)
 *   walk incomplete + rows lost     → indeterminate (neither direction is guaranteed)
 *
 * With C4B's membership gate in place, ordinary stored Mallan permissions no longer reach this path at all
 * — a suppressed row is never counted. What remains is genuine drift: provider response changes, storage
 * changing between settle and hydrate, a missing row. That is exactly what the label should describe.
 */
export function resolveCountMeaning(universeMeaning: CountMeaning, pageShort: number): CountMeaning {
  const complete = universeMeaning === 'exact';
  if (pageShort === 0) return complete ? 'exact' : 'lower_bound';
  return complete ? 'upper_bound' : 'indeterminate';
}

/** Execute one page of criteria: settle → page → hydrate. The same call for every consumer. */
export async function executeSearch(c: SearchCriteria, o: ExecuteOptions = {}): Promise<ExecutedSearch> {
  // Audience reaches MEMBERSHIP, not merely rendering. Passing it only to hydratePage was the defect:
  // the universe counted rows this audience would never receive.
  const audience: SearchAudience = o.audience ?? 'public';
  const { universe, fromCache } = await settledUniverseFor(c, audience, o.cache !== false);
  const page = pageOf(universe, c.offset, c.limit);
  const hydrated = await hydratePage(page, { select: o.select ?? SEARCH_SELECT_FIELDS, media: o.media !== false, audience });
  const pageShort = hydrated.missing.length + hydrated.gateExcluded.length;
  const countMeaning = resolveCountMeaning(universe.countMeaning, pageShort);
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
export async function countSearch(c: SearchCriteria, audience: SearchAudience, cache = true): Promise<{ total: number; countMeaning: CountMeaning }> {
  const { universe } = await settledUniverseFor(c, audience, cache);
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
  return hydratePage(rows, { select: o.select ?? SEARCH_SELECT_FIELDS, media: o.media !== false, audience: o.audience });
}
