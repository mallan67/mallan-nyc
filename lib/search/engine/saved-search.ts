/**
 * saved-search.ts — the ONE canonical Saved Search criteria contract (PURE; no DB, no alerts).
 *
 * Search Consolidation Packet 2. A saved search stores the EXACT executable parameters of the
 * accepted Search executor (`lib/search/engine/criteria.ts`), versioned, in the existing
 * `SavedSearch.criteria` JSON column. Nothing else is a Saved Search vocabulary:
 *
 *   - the browser saves the parameters of a search that actually executed (no re-encoding);
 *   - `POST /api/crm/saved-searches`, `/[id]/execute`, the list count and the alert cron all
 *     read the same object and hand it to the same executor;
 *   - a stored blob without the current version is LEGACY: it is either converted by the
 *     deterministic, meaning-preserving map below (read-time only; persisted on the next
 *     authorized update) or refused by name. It is never reinterpreted "because the names
 *     look similar".
 *
 * No schema is added. `criteria_version` lives inside the JSON.
 */

import {
  criteriaFromParams,
  EXECUTED_PARAMS,
  type CriteriaRefusal,
  type SearchCriteria,
} from '@/lib/search/engine/criteria';

/** Version 2 = executor parameters. (Version 1, the never-persisted filters/sort draft, is retired.) */
export const CRITERIA_VERSION = 2 as const;

const PAGING_PARAMS: ReadonlySet<string> = new Set(['limit', 'skip', 'offset']);

/** The keys a saved search may carry: exactly the executor's executed parameters minus paging. */
export const SAVED_PARAM_KEYS: ReadonlySet<string> = new Set([...EXECUTED_PARAMS].filter((k) => !PAGING_PARAMS.has(k)));

export interface SavedSearchCriteria {
  criteria_version: typeof CRITERIA_VERSION;
  /** Executor wire parameters, string-valued, paging removed, blanks removed. */
  params: Record<string, string>;
}

export type ResolvedSavedSearch =
  | { state: 'current'; params: Record<string, string>; criteria: SearchCriteria }
  | { state: 'migrated'; params: Record<string, string>; criteria: SearchCriteria; from: 'legacy'; mapped: string[] }
  | { state: 'invalid'; reasons: string[]; unsupported: string[]; invalid: CriteriaRefusal['invalid'] };

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') { const s = v.trim(); return s === '' || s === 'null' || s === 'undefined' || s === '[]' || s === '{}'; }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function csv(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(',');
  return String(v).trim();
}

function toSearchParams(input: URLSearchParams | Record<string, unknown>): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) if (!isBlank(v)) sp.set(k, csv(v));
  return sp;
}

/**
 * Turn the parameters of a search that EXECUTED into the stored contract. The executor's own
 * parser is the validator: any parameter it refuses is refused here, by name. Paging is dropped.
 */
export function savedCriteriaFromExecuted(
  input: URLSearchParams | Record<string, unknown>,
): { ok: true; criteria: SavedSearchCriteria; executed: SearchCriteria } | { ok: false; refusal: CriteriaRefusal } {
  const sp = toSearchParams(input);
  for (const k of PAGING_PARAMS) sp.delete(k);
  const parsed = criteriaFromParams(sp);
  if (!parsed.ok) return { ok: false, refusal: parsed.refusal };
  const params: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (SAVED_PARAM_KEYS.has(k) && !isBlank(v)) params[k] = v.trim();
  return { ok: true, criteria: { criteria_version: CRITERIA_VERSION, params }, executed: parsed.criteria };
}

export function isSavedSearchCriteria(v: unknown): v is SavedSearchCriteria {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  if (c.criteria_version !== CRITERIA_VERSION) return false;
  if (c.params == null || typeof c.params !== 'object' || Array.isArray(c.params)) return false;
  return Object.entries(c.params as Record<string, unknown>).every(([k, val]) => SAVED_PARAM_KEYS.has(k) && typeof val === 'string');
}

/** current = carries the current version; legacy = a plain object without it; invalid = not an object. */
export function savedSearchVersionState(v: unknown): 'current' | 'legacy' | 'invalid' {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return 'invalid';
  const c = v as Record<string, unknown>;
  if (c.criteria_version === undefined) return 'legacy';
  return isSavedSearchCriteria(v) ? 'current' : 'invalid';
}

// ── Legacy conversion ────────────────────────────────────────────────────────────────────────
//
// Every key below is mapped ONLY where its meaning under the retired projection reader
// (`lib/search/criteria-to-prisma.ts`, deleted in Packet 2) is provably the executor's meaning.
// Anything else is refused by name — never dropped, never widened.

/** Legacy ownership inputs → live CommonInterest tokens (the projection's own dictionary). */
const LEGACY_OWNERSHIP: Readonly<Record<string, string>> = Object.freeze({
  condo: 'Condominium', condominium: 'Condominium',
  coop: 'StockCooperative', cooperative: 'StockCooperative', stockcooperative: 'StockCooperative',
  condop: 'Condop',
});

/**
 * The projection matched `Active`, `ActiveUnderContract` and `ComingSoon` when a legacy search
 * carried no status (lib/compliance/status.ts ACTIVE_DISPLAY_VALUES). The executor defaults to
 * Active alone, so a converted legacy search states that list explicitly — same meaning.
 */
export const LEGACY_DEFAULT_STATUS = 'Active,ActiveUnderContract,ComingSoon';

/** The projection treated a max price at/above this sentinel as "no maximum". */
const LEGACY_NO_MAX_PRICE = 99999999;

type LegacyRule = { to: string; convert?: (v: unknown, note: (s: string) => void) => string | null };

const LEGACY_KEYS: Readonly<Record<string, LegacyRule>> = Object.freeze({
  listing_type: { to: 'type', convert: legacyType }, listingType: { to: 'type', convert: legacyType }, type: { to: 'type', convert: legacyType },
  statuses: { to: 'status' }, status: { to: 'status' }, standardStatus: { to: 'status' }, standard_status: { to: 'status' },
  min_price: { to: 'minPrice', convert: legacyNumber }, minPrice: { to: 'minPrice', convert: legacyNumber }, priceMin: { to: 'minPrice', convert: legacyNumber },
  max_price: { to: 'maxPrice', convert: legacyMaxPrice }, maxPrice: { to: 'maxPrice', convert: legacyMaxPrice }, priceMax: { to: 'maxPrice', convert: legacyMaxPrice },
  min_beds: { to: 'minBeds', convert: legacyNumber }, minBeds: { to: 'minBeds', convert: legacyNumber }, bedsMin: { to: 'minBeds', convert: legacyNumber }, beds: { to: 'minBeds', convert: legacyNumber },
  max_beds: { to: 'maxBeds', convert: legacyNumber }, maxBeds: { to: 'maxBeds', convert: legacyNumber }, bedsMax: { to: 'maxBeds', convert: legacyNumber },
  min_baths: { to: 'minBaths', convert: legacyNumber }, minBaths: { to: 'minBaths', convert: legacyNumber }, bathsMin: { to: 'minBaths', convert: legacyNumber }, baths: { to: 'minBaths', convert: legacyNumber },
  max_baths: { to: 'maxBaths', convert: legacyNumber }, maxBaths: { to: 'maxBaths', convert: legacyNumber }, bathsMax: { to: 'maxBaths', convert: legacyNumber },
  borough: { to: 'borough' },
  neighborhoods: { to: 'neighborhood' }, neighborhood: { to: 'neighborhood' },
  property_type: { to: 'ownership', convert: legacyOwnership }, property_types: { to: 'ownership', convert: legacyOwnership },
  propertyType: { to: 'ownership', convert: legacyOwnership }, propertyTypes: { to: 'ownership', convert: legacyOwnership },
  zip: { to: 'zip' }, zipCodes: { to: 'zip' }, zip_codes: { to: 'zip' }, postal_code: { to: 'zip' },
  listing_id: { to: 'listingId' }, listingId: { to: 'listingId' },
  sort: { to: 'sort' },
});

function legacyType(v: unknown): string | null {
  const t = String(v).trim().toLowerCase();
  if (t === 'sale' || t === 'buy') return 'sale';
  if (t === 'rent' || t === 'rental' || t === 'lease') return 'rental';
  return null;
}
function legacyNumber(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}
function legacyMaxPrice(v: unknown, note: (s: string) => void): string | null {
  const s = legacyNumber(v);
  if (s === null) return null;
  if (Number(s) >= LEGACY_NO_MAX_PRICE) { note(`max price ${s} meant "no maximum" and is dropped`); return ''; }
  return s;
}
function legacyOwnership(v: unknown): string | null {
  const out: string[] = [];
  for (const raw of csv(v).split(',')) {
    const t = raw.trim(); if (!t) continue;
    const token = LEGACY_OWNERSHIP[t.toLowerCase().replace(/[\s_\-/]+/g, '')];
    if (!token) return null;
    if (!out.includes(token)) out.push(token);
  }
  return out.join(',');
}

/** Deterministic legacy → executor parameters. Refuses, by name, anything whose meaning is not proven. */
export function legacyToParams(legacy: Record<string, unknown>): { ok: true; params: Record<string, string>; mapped: string[] } | { ok: false; reasons: string[] } {
  const params: Record<string, string> = {};
  const mapped: string[] = [];
  const reasons: string[] = [];
  const note = (s: string) => mapped.push(s);
  let tab: string | null = null;
  for (const [key, value] of Object.entries(legacy)) {
    if (isBlank(value)) continue;
    if (key === '_search_tab') { tab = String(value); continue; }
    const rule = LEGACY_KEYS[key];
    if (!rule) { reasons.push(`"${key}" is not reproducible by the Search executor`); continue; }
    const converted = rule.convert ? rule.convert(value, note) : csv(value);
    if (converted === null) { reasons.push(`"${key}" = ${JSON.stringify(value)} has no exact executor meaning`); continue; }
    if (converted === '') continue;
    if (params[rule.to] !== undefined && params[rule.to] !== converted) { reasons.push(`"${key}" conflicts with another legacy key for "${rule.to}"`); continue; }
    params[rule.to] = converted;
    mapped.push(`${key} → ${rule.to}`);
  }
  if (tab === 'building') reasons.push('"_search_tab" = "building": Building search is not executable');
  else if (tab === 'rent' && params.type && params.type !== 'rental') reasons.push('"_search_tab" disagrees with the listing type');
  else if (tab === 'sale' && params.type && params.type !== 'sale') reasons.push('"_search_tab" disagrees with the listing type');
  if (!params.type) reasons.push('no listing type (sale / rental) is stored');
  if (params.status === undefined) { params.status = LEGACY_DEFAULT_STATUS; mapped.push(`no status → ${LEGACY_DEFAULT_STATUS} (the projection's default)`); }
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, params, mapped };
}

/**
 * Resolve whatever is stored in `SavedSearch.criteria` to executable criteria — or to a named refusal.
 * Read-time only; nothing here writes.
 */
export function resolveStoredCriteria(stored: unknown): ResolvedSavedSearch {
  const state = savedSearchVersionState(stored);
  if (state === 'invalid') {
    return { state: 'invalid', reasons: ['stored criteria is not a versioned Saved Search object'], unsupported: [], invalid: [] };
  }
  if (state === 'current') {
    const c = stored as SavedSearchCriteria;
    const parsed = criteriaFromParams(toSearchParams(c.params));
    if (!parsed.ok) return { state: 'invalid', reasons: refusalReasons(parsed.refusal), unsupported: parsed.refusal.unsupported, invalid: parsed.refusal.invalid };
    return { state: 'current', params: { ...c.params }, criteria: parsed.criteria };
  }
  const legacy = legacyToParams(stored as Record<string, unknown>);
  if (!legacy.ok) return { state: 'invalid', reasons: legacy.reasons, unsupported: [], invalid: [] };
  const parsed = criteriaFromParams(toSearchParams(legacy.params));
  if (!parsed.ok) return { state: 'invalid', reasons: refusalReasons(parsed.refusal), unsupported: parsed.refusal.unsupported, invalid: parsed.refusal.invalid };
  return { state: 'migrated', params: legacy.params, criteria: parsed.criteria, from: 'legacy', mapped: legacy.mapped };
}

export function refusalReasons(r: CriteriaRefusal): string[] {
  return [
    ...r.unsupported.map((k) => `"${k}" is not executable by the Search executor`),
    ...r.invalid.map((i) => `"${i.param}" = ${JSON.stringify(i.value)}: ${i.reason}`),
  ];
}

/** A human name for a saved search derived from its executed parameters (public signups have none). */
export function describeSavedParams(params: Record<string, string>): string {
  const parts: string[] = [params.type === 'rental' ? 'For Rent' : 'For Sale'];
  if (params.borough) parts.push(params.borough.split(',').join(', '));
  if (params.neighborhood) parts.push(params.neighborhood.split(',').slice(0, 2).join(', '));
  if (params.minBeds) parts.push(`${params.minBeds}+ bed`);
  const min = params.minPrice ? `$${Number(params.minPrice).toLocaleString()}` : '';
  const max = params.maxPrice ? `$${Number(params.maxPrice).toLocaleString()}` : '';
  if (min && max) parts.push(`${min}-${max}`); else if (min) parts.push(`${min}+`); else if (max) parts.push(`Up to ${max}`);
  return parts.join(' · ');
}
