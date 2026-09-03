/**
 * THE MARKET QUERY CONTRACT — one definition of the market universe.
 *
 * `/api/market` answers a question twice: once from the Mallan database, once
 * from Cotality as a fallback. Both must ask the SAME question, or the fallback
 * silently reports a different market than the primary path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG (found 2026-08-22 while tracing the status impact graph)
 *
 * 1. THE COTALITY FALLBACK WAS BROKEN IN PRODUCTION.
 *
 *      active: `MlsStatus eq 'Active' and …`
 *      closed: `(MlsStatus eq 'Closed' or StandardStatus eq 'Closed') and …`
 *
 *    `MlsStatus` is suppressed for filtering at licence level. Replayed live in
 *    the exact shape the route builds, BOTH return HTTP 400:
 *
 *      "Results from 'RLS' has been suppressed (provider Level) as field
 *       MlsStatus' cannot be used for filtering or ordering"
 *
 *    So the fallback failed every time it ran and the route reported DB-only
 *    numbers as though they were complete.
 *
 * 2. IT ASKED A DIFFERENT QUESTION FROM THE DB SIDE.
 *
 *    The database branch defines the active market as
 *    `status IN ('Active', 'ComingSoon', 'ActiveUnderContract')`. The fallback
 *    asked only for Active. That is Mallan's own business definition sitting in
 *    the same file, so matching it is not a new decision — and the route already
 *    counts `StandardStatus === 'ActiveUnderContract'` among the rows it gets
 *    back, which only makes sense if it expected them.
 *
 * 3. THE TYPE PARAMETER HAD TWO SPELLINGS AND ONE READER.
 *
 *    `app/components/MarketSnapshot.tsx` sends `type=rental`.
 *    `app/market/MarketReportContent.tsx` sends `type=rent`.
 *    The route tested `type === 'rent'` only, so every MarketSnapshot rental
 *    request ran the SALE branch and returned sale statistics under a rental
 *    heading.
 *
 * `Pending` is deliberately NOT added to the active set. It is populated on the
 * feed, but the active market is a Mallan business definition and population is
 * not a reason to change it.
 */
import { standardStatusOData } from '@/lib/search/canonical/status-token-contract';
import { propertyTypeUniverseOData } from '@/lib/search/canonical/property-type-universe';

export type MarketType = 'sale' | 'rental';

/**
 * Both spellings mean rental.
 *
 * Accepting both reconciles the two existing callers rather than picking one and
 * breaking the other.
 */
export function normalizeMarketType(raw: unknown): MarketType {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'rent' || value === 'rental' ? 'rental' : 'sale';
}

/**
 * The PropertyType predicate, DELEGATED to the verified Sale/Rental universe.
 *
 * This function previously re-derived the two predicates as string literals.
 * That is the very defect this file exists to close, one level down: a canonical
 * helper that copies the rule instead of consuming it drifts exactly as easily
 * as a route that copies it. `propertyTypeUniverseOData` is the single authority
 * for what Sale and Rental MEAN as a provider predicate.
 */
export function marketPropertyClass(type: MarketType): string {
  return propertyTypeUniverseOData(type === 'rental' ? 'rental' : 'sale');
}

/**
 * The ACTIVE market, as the database branch of this same route defines it.
 *
 * Rendered through the canonical status contract so it cannot drift from the
 * rest of Search, and so an unsupported token would throw rather than quietly
 * widen the set.
 */
export function marketActiveStatusFilter(): string {
  const { filter } = standardStatusOData(['Active', 'ComingSoon', 'ActiveUnderContract']);
  if (!filter) throw new Error('[market] active status set rendered empty');
  return filter;
}

/** The CLOSED market. `MlsStatus` is not consulted — the provider refuses it. */
export function marketClosedStatusFilter(): string {
  const { filter } = standardStatusOData(['Closed']);
  if (!filter) throw new Error('[market] closed status set rendered empty');
  return filter;
}
