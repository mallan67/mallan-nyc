/**
 * PROVIDER QUERY — criteria → Cotality OData `$filter` / `$orderby` (PURE).
 *
 * Every field, token and operator form used here was verified against the
 * live Cotality API on 2026-09-05 (Validator checkpoint contract and re-check;
 * Builder execution probes in docs/search/evidence/2026-09-05-builder-execution-probes.md):
 *
 *   universe        PropertyType eq 'Residential' | 'ResidentialLease' — positive membership
 *   status          StandardStatus eq '<LookupValue>'
 *   permission      Permission has 'IDX'  (every active row; runtime type Multi.ListingPermission)
 *   suppression     ListOfficeMlsId ne '<mallan office>'  — inside the query, before count
 *   price / rent    ListPrice ge | le
 *   beds            BedroomsTotal ge | le
 *   baths           disjunction over BathroomsFull / BathroomsHalf equivalent to
 *                   2·Full + Half ≥ 2·min and ≤ 2·max (arithmetic in $filter returns 500)
 *   CityRegion      CityRegion eq '<value>'
 *   SubdivisionName tolower(SubdivisionName) eq '<lowercased>'   (tolower SUPPORTED, count-exact)
 *   CommonInterest  CommonInterest eq '<LookupValue>'
 *   StructureType   StructureType has '<LookupValue>'  (bare-string has form SUPPORTED)
 *   PostalCode      PostalCode eq
 *   ListingId       ListingId eq
 *   sort            ListPrice | ListingContractDate, then ListingKey asc (two-term orderby SUPPORTED)
 */

import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';
import type { SearchCriteria, SortKey } from './criteria';

export const PROPERTY_TYPE_FOR_WORKFLOW: Readonly<Record<SearchCriteria['workflow'], string>> = Object.freeze({
  sale: 'Residential',
  rental: 'ResidentialLease',
});

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function or(parts: readonly string[]): string | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' or ')})`;
}

/**
 * 2·Full + Half ≥ n as a disjunction over half-bath counts h = 0…n.
 * Term h: Half ≥ h AND Full ≥ ceil((n − h) / 2). Exact for every row with no
 * assumed bound: a row with Half ≥ n satisfies the h = n term regardless of Full.
 */
export function bathsAtLeastFilter(minBaths: number): string | null {
  const n = Math.round(minBaths * 2);
  if (n <= 0) return null;
  const terms: string[] = [];
  for (let h = 0; h <= n; h++) {
    const fullNeeded = Math.ceil((n - h) / 2);
    const clauses: string[] = [];
    if (h > 0) clauses.push(`BathroomsHalf ge ${h}`);
    if (fullNeeded > 0) clauses.push(`BathroomsFull ge ${fullNeeded}`);
    if (clauses.length === 0) return null;
    terms.push(clauses.length === 1 ? clauses[0] : `(${clauses.join(' and ')})`);
  }
  return or(terms);
}

/**
 * 2·Full + Half ≤ n as a disjunction over Full = 0…floor(n/2).
 * Term F: Full = F AND Half ≤ n − 2F. Any Full above floor(n/2) violates the
 * bound for every Half, so the enumeration is exact.
 */
export function bathsAtMostFilter(maxBaths: number): string | null {
  const n = Math.round(maxBaths * 2);
  if (n < 0) return null;
  const terms: string[] = [];
  for (let f = 0; f <= Math.floor(n / 2); f++) terms.push(`(BathroomsFull eq ${f} and BathroomsHalf le ${n - 2 * f})`);
  return or(terms);
}

export interface ProviderQuery {
  filter: string;
  orderby: string;
  suppressedOfficeIds: readonly string[];
}

export function buildProviderQuery(c: SearchCriteria): ProviderQuery {
  const parts: string[] = [];
  parts.push(`PropertyType eq '${PROPERTY_TYPE_FOR_WORKFLOW[c.workflow]}'`);
  parts.push(or(c.standardStatus.map((s) => `StandardStatus eq '${escapeOData(s)}'`)) as string);
  parts.push("Permission has 'IDX'");
  for (const office of MALLAN_LIST_OFFICE_MLS_IDS) parts.push(`ListOfficeMlsId ne '${escapeOData(office)}'`);

  if (c.priceMin != null && c.priceMin > 0) parts.push(`ListPrice ge ${c.priceMin}`);
  if (c.priceMax != null && c.priceMax > 0) parts.push(`ListPrice le ${c.priceMax}`);
  if (c.bedsMin != null) parts.push(`BedroomsTotal ge ${c.bedsMin}`);
  if (c.bedsMax != null) parts.push(`BedroomsTotal le ${c.bedsMax}`);

  const bMin = c.bathsMin != null ? bathsAtLeastFilter(c.bathsMin) : null;
  if (bMin) parts.push(bMin);
  const bMax = c.bathsMax != null ? bathsAtMostFilter(c.bathsMax) : null;
  if (bMax) parts.push(bMax);

  const region = or(c.cityRegion.map((v) => `CityRegion eq '${escapeOData(v)}'`));
  if (region) parts.push(region);
  const subdivision = or(c.subdivisionName.map((n) => `tolower(SubdivisionName) eq '${escapeOData(n.trim().toLowerCase())}'`));
  if (subdivision) parts.push(subdivision);
  const common = or(c.commonInterest.map((t) => `CommonInterest eq '${escapeOData(t)}'`));
  if (common) parts.push(common);
  const structure = or(c.structureType.map((t) => `StructureType has '${escapeOData(t)}'`));
  if (structure) parts.push(structure);
  const zips = or(c.postalCode.map((z) => `PostalCode eq '${escapeOData(z)}'`));
  if (zips) parts.push(zips);
  const ids = or(c.listingId.map((id) => `ListingId eq '${escapeOData(id)}'`));
  if (ids) parts.push(ids);

  return { filter: parts.join(' and '), orderby: orderbyFor(c.sort), suppressedOfficeIds: MALLAN_LIST_OFFICE_MLS_IDS };
}

export function orderbyFor(sort: SortKey): string {
  switch (sort) {
    case 'price_asc': return 'ListPrice asc,ListingKey asc';
    case 'newest': return 'ListingContractDate desc,ListingKey asc';
    case 'price_desc':
    default: return 'ListPrice desc,ListingKey asc';
  }
}

/** Fields walked to settle the universe: identity plus every sort key. */
/** Key-universe fields. ModificationTimestamp carries the alert delta ("new since") over the COMPLETE universe. */
export const UNIVERSE_SELECT = Object.freeze(['ListingKey', 'ListingId', 'ListPrice', 'ListingContractDate', 'ModificationTimestamp'] as const);

/** The provider's page cap for a $select+$orderby+$count query (verbatim 400 message, 2026-09-05). */
export const PROVIDER_PAGE_CAP = 1000;
