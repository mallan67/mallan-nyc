/**
 * THE SETTLED UNIVERSE — membership first, then count, then the page.
 *
 *   criteria → provider key-universe (suppression inside the query)
 *            → Mallan-authored rows under the same criteria
 *            → one merged set, one global order with an identity tie-break
 *            → total = merged length
 *            → page = slice
 *
 * Nothing is filtered after the page is cut. `countMeaning` is 'exact' only
 * when the provider walk completed; otherwise 'lower_bound', and it says so.
 */

import prisma from '@/lib/prisma';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';
import { COMMON_INTEREST_MEMBERS, STRUCTURE_TYPE_MEMBERS, resolveMember, type SearchCriteria, type SortKey } from './criteria';
import { buildProviderQuery, UNIVERSE_SELECT, PROVIDER_PAGE_CAP } from './provider-query';
import { walkProvider } from './provider-client';

export interface UniverseRow {
  source: 'provider' | 'mallan';
  /** Provider ListingKey; null for Mallan-authored rows. */
  listingKey: string | null;
  /** Provider ListingId, or the Mallan SL-/RL- id. */
  listingId: string;
  price: number | null;
  contractDate: string | null;
}

export interface SettledUniverse {
  rows: UniverseRow[];
  total: number;
  countMeaning: 'exact' | 'lower_bound';
  providerCount: number | null;
  providerRows: number;
  providerPages: number;
  mallanRows: number;
  /** Mallan-authored rows excluded because a CommonInterest/StructureType criterion was set and the row's stored value resolves to no live member. Fail-closed, reported. */
  mallanExcludedUnresolvedType: number;
  suppressedOfficeIds: readonly string[];
  filter: string;
  orderby: string;
}

type ProviderKeyRow = { ListingKey?: string; ListingId?: string; ListPrice?: number | string | null; ListingContractDate?: string | null };

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bathValue(full: number | null | undefined, half: number | null | undefined): number | null {
  if (full == null && half == null) return null;
  return (full ?? 0) + 0.5 * (half ?? 0);
}

/** How Mallan storage spells each live CityRegion value. */
const CITY_REGION_STORAGE: Readonly<Record<string, string[]>> = Object.freeze({
  Manhattan: ['Manhattan'], Brooklyn: ['Brooklyn'], Queens: ['Queens'], Bronx: ['Bronx', 'The Bronx'], StatenIsland: ['StatenIsland', 'Staten Island'],
});

async function mallanRowsFor(c: SearchCriteria): Promise<{ rows: UniverseRow[]; excludedUnresolvedType: number }> {
  const prefix = c.workflow === 'sale' ? 'SL-' : 'RL-';
  const where: Record<string, unknown> = { mls_id: null, listing_id: { startsWith: prefix }, status: { in: [...c.standardStatus] } };
  const price: Record<string, number> = {};
  if (c.priceMin != null && c.priceMin > 0) price.gte = c.priceMin;
  if (c.priceMax != null && c.priceMax > 0) price.lte = c.priceMax;
  if (Object.keys(price).length) where.list_price = price;
  const beds: Record<string, number> = {};
  if (c.bedsMin != null) beds.gte = c.bedsMin;
  if (c.bedsMax != null) beds.lte = c.bedsMax;
  if (Object.keys(beds).length) where.bedrooms_total = beds;
  if (c.cityRegion.length) where.borough = { in: c.cityRegion.flatMap((v) => CITY_REGION_STORAGE[v] ?? [v]) };
  if (c.subdivisionName.length) where.OR = c.subdivisionName.map((n) => ({ neighborhood: { equals: n, mode: 'insensitive' } }));
  if (c.postalCode.length) where.postal_code = { in: [...c.postalCode] };
  // A listingId narrows the universe; it never replaces the SL-/RL- prefix that bounds it
  // (Independent Verifier 2026-09-05, M1/M2: a Mallan row addressed by id crossed universes).
  if (c.listingId.length) where.listing_id = { startsWith: prefix, in: [...c.listingId] };

  const rows = await prisma.listing.findMany({
    where,
    select: { listing_id: true, list_price: true, listing_contract_date: true, bathrooms_full: true, bathrooms_half: true, property_sub_type: true },
  });

  const out: UniverseRow[] = [];
  let excludedUnresolvedType = 0;
  for (const r of rows) {
    const baths = bathValue(r.bathrooms_full, r.bathrooms_half);
    if (c.bathsMin != null && (baths == null || baths < c.bathsMin)) continue;
    if (c.bathsMax != null && (baths == null || baths > c.bathsMax)) continue;
    if (c.commonInterest.length || c.structureType.length) {
      // A Mallan-authored row states its type in Mallan storage; it is matched only when
      // that stored value resolves to a live provider member. Unresolvable → excluded, reported.
      const stored = r.property_sub_type ?? '';
      const ci = resolveMember(stored, COMMON_INTEREST_MEMBERS);
      const st = resolveMember(stored, STRUCTURE_TYPE_MEMBERS);
      if (ci == null && st == null) { excludedUnresolvedType++; continue; }
      const matches = (ci != null && c.commonInterest.includes(ci)) || (st != null && c.structureType.includes(st));
      if (!matches) continue;
    }
    out.push({
      source: 'mallan', listingKey: null, listingId: r.listing_id,
      price: toNum(r.list_price),
      contractDate: r.listing_contract_date ? r.listing_contract_date.toISOString() : null,
    });
  }
  return { rows: out, excludedUnresolvedType };
}

/** One comparator for both sources. Nulls sort last. Tie-break on identity, ascending. */
export function comparatorFor(sort: SortKey): (a: UniverseRow, b: UniverseRow) => number {
  const tie = (a: UniverseRow, b: UniverseRow) => {
    const ka = a.listingKey ?? a.listingId;
    const kb = b.listingKey ?? b.listingId;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
  const numCmp = (x: number | null, y: number | null, dir: 1 | -1) => {
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x === y ? 0 : (x < y ? -1 : 1) * dir;
  };
  switch (sort) {
    case 'price_asc': return (a, b) => numCmp(a.price, b.price, 1) || tie(a, b);
    case 'newest': return (a, b) => numCmp(a.contractDate ? Date.parse(a.contractDate) : null, b.contractDate ? Date.parse(b.contractDate) : null, -1) || tie(a, b);
    case 'price_desc':
    default: return (a, b) => numCmp(a.price, b.price, -1) || tie(a, b);
  }
}

export async function settleUniverse(c: SearchCriteria): Promise<SettledUniverse> {
  const q = buildProviderQuery(c);
  const [walk, mallan] = await Promise.all([
    walkProvider<ProviderKeyRow>({ resource: 'Property', select: UNIVERSE_SELECT, filter: q.filter, orderby: q.orderby, top: PROVIDER_PAGE_CAP }),
    mallanRowsFor(c),
  ]);
  const providerRows: UniverseRow[] = walk.rows.map((r) => ({
    source: 'provider',
    listingKey: r.ListingKey != null ? String(r.ListingKey) : null,
    listingId: String(r.ListingId ?? r.ListingKey ?? ''),
    price: toNum(r.ListPrice),
    contractDate: r.ListingContractDate ?? null,
  }));
  const rows = [...providerRows, ...mallan.rows].sort(comparatorFor(c.sort));
  return {
    rows, total: rows.length,
    countMeaning: walk.complete ? 'exact' : 'lower_bound',
    providerCount: walk.count, providerRows: providerRows.length, providerPages: walk.pages,
    mallanRows: mallan.rows.length, mallanExcludedUnresolvedType: mallan.excludedUnresolvedType,
    suppressedOfficeIds: MALLAN_LIST_OFFICE_MLS_IDS, filter: q.filter, orderby: q.orderby,
  };
}

export function pageOf(u: SettledUniverse, offset: number, limit: number): UniverseRow[] {
  return u.rows.slice(offset, offset + limit);
}
