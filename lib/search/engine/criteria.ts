/**
 * SEARCH CRITERIA — the two canonical workflow contracts (PURE).
 *
 * Sale and Rental are separate contracts over the same shape, distinguished
 * by `workflow`, so a Sale criterion can never reach a Rental query.
 *
 * NAMING RULE (docs/search/evidence/2026-09-05-provider-naming-rule.md):
 * a field is named by the provider's field name; a member is stored and
 * executed as the provider's `LookupValue` and displayed as its
 * `StandardLookupValue`. Every token below was returned by the live Cotality
 * Lookup / picklist resources on 2026-09-05. Mallan invents no vocabulary.
 *
 * The provider ACCEPTS an unknown token and returns an empty result silently
 * (Validator re-check item 4), so anything that cannot be resolved to a live
 * token is REFUSED here by name. Criteria outside this checkpoint are refused,
 * not ignored: an ignored criterion is a silent widening of the universe.
 */

export type SearchWorkflow = 'sale' | 'rental';

/** [LookupValue, StandardLookupValue] pairs, verbatim from the live Lookup resource. */
export type Member = readonly [token: string, display: string];

export const STANDARD_STATUS_MEMBERS: readonly Member[] = Object.freeze([
  ['Active', 'Active'], ['ActiveUnderContract', 'Active Under Contract'], ['Canceled', 'Canceled'], ['Closed', 'Closed'],
  ['ComingSoon', 'Coming Soon'], ['Delete', 'Delete'], ['Expired', 'Expired'], ['Hold', 'Hold'], ['Incomplete', 'Incomplete'],
  ['Pending', 'Pending'], ['Withdrawn', 'Withdrawn'],
]);

export const PROPERTY_TYPE_MEMBERS: readonly Member[] = Object.freeze([
  ['BusinessOpportunity', 'Business Opportunity'], ['CommercialLease', 'Commercial Lease'], ['CommercialSale', 'Commercial Sale'],
  ['DisasterReliefRental', 'Disaster Relief Rental'], ['Farm', 'Farm'], ['HighRise', 'High Rise'], ['Land', 'Land'],
  ['ManufacturedInPark', 'Manufactured In Park'], ['MultiFamily', 'Multi Family'], ['Residential', 'Residential'],
  ['ResidentialIncome', 'Residential Income'], ['ResidentialLease', 'Residential Lease'], ['Specialty', 'Specialty'],
]);

export const COMMON_INTEREST_MEMBERS: readonly Member[] = Object.freeze([
  ['BareLandCondominium', 'Bare Land Condominium'], ['CoOwnership', 'Co-Ownership'], ['CommunityApartment', 'Community Apartment'],
  ['Condominium', 'Condominium'], ['Condop', 'Condop'], ['Freehold', 'Freehold'], ['Leasehold', 'Leasehold'], ['None', 'None'],
  ['Other', 'Other'], ['PlannedDevelopment', 'Planned Development'], ['RentalBuilding', 'Rental Building'],
  ['StockCooperative', 'Stock Cooperative'], ['Timeshare', 'Timeshare'],
]);

export const STRUCTURE_TYPE_MEMBERS: readonly Member[] = Object.freeze([
  ['Apartment', 'Apartment'], ['Cabin', 'Cabin'], ['Dock', 'Dock'], ['Duplex', 'Duplex'], ['Flex', 'Flex'],
  ['FreeStandingBuilding', 'Free Standing Building'], ['HighRise', 'High Rise'], ['HotelMotel', 'Hotel/Motel'], ['House', 'House'],
  ['Industrial', 'Industrial'], ['LowRise', 'Low Rise'], ['ManufacturedHouse', 'Manufactured House'], ['MidRise', 'Mid Rise'],
  ['MixedUse', 'Mixed Use'], ['MultiFamily', 'Multi Family'], ['None', 'None'], ['Office', 'Office'], ['Other', 'Other'],
  ['Quadruplex', 'Quadruplex'], ['Retail', 'Retail'], ['Townhouse', 'Townhouse'], ['Triplex', 'Triplex'], ['Warehouse', 'Warehouse'],
]);

/** CityRegion is a plain string field with no lookup; these are its live values. `StatenIsland` has no space. */
export const CITY_REGION_VALUES = Object.freeze(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'StatenIsland'] as const);
export type CityRegionValue = (typeof CITY_REGION_VALUES)[number];

export type SortKey = 'price_desc' | 'price_asc' | 'newest';
export const DEFAULT_SORT: SortKey = 'price_desc';
export const MAX_PAGE = 200;
export const DEFAULT_PAGE = 50;

export interface SearchCriteria {
  workflow: SearchWorkflow;
  /** StandardStatus LookupValues. */
  standardStatus: readonly string[];
  /** ListPrice bounds. For rentals this is the provider's rent figure carried on ListPrice. */
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bedsMax?: number;
  /** Mallan canonical bath value: BathroomsFull + 0.5 × BathroomsHalf, in half-steps. */
  bathsMin?: number;
  bathsMax?: number;
  cityRegion: readonly CityRegionValue[];
  /** Entered names; executed case-insensitively against SubdivisionName at the provider. */
  subdivisionName: readonly string[];
  /** CommonInterest LookupValues. */
  commonInterest: readonly string[];
  /** StructureType LookupValues (multi-value field; executed with `has`). */
  structureType: readonly string[];
  postalCode: readonly string[];
  listingId: readonly string[];
  sort: SortKey;
  limit: number;
  offset: number;
}
export interface SaleCriteria extends SearchCriteria { workflow: 'sale' }
export interface RentalCriteria extends SearchCriteria { workflow: 'rental' }

export interface CriteriaRefusal {
  unsupported: string[];
  invalid: Array<{ param: string; value: string; reason: string }>;
}
export type CriteriaResult =
  | { ok: true; criteria: SaleCriteria | RentalCriteria }
  | { ok: false; refusal: CriteriaRefusal };

/** Wire names the CRM already sends, plus the provider field names themselves. */
const EXECUTED_PARAMS = new Set([
  'type', 'status', 'StandardStatus', 'minPrice', 'maxPrice', 'beds', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths',
  'borough', 'CityRegion', 'neighborhood', 'SubdivisionName', 'ownership', 'CommonInterest', 'StructureType',
  'zip', 'PostalCode', 'listingId', 'ListingId', 'sort', 'limit', 'skip', 'offset',
]);
const TRANSPORT_PARAMS = new Set(['_', '_t', 't', 'cb', 'v', 'page', 'inlineMedia', 'mediaMode', 'countMeaning']);

function isBlank(v: string | null): boolean {
  if (v == null) return true;
  const s = v.trim();
  return s === '' || s === '{}' || s === '[]' || s === 'null' || s === 'undefined';
}
function num(v: string | null): number | undefined {
  if (isBlank(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function list(...vs: Array<string | null>): string[] {
  const out: string[] = [];
  for (const v of vs) if (!isBlank(v)) for (const s of String(v).split(',')) { const t = s.trim(); if (t && !out.includes(t)) out.push(t); }
  return out;
}
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-/]+/g, '');
}
function halfSteps(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Resolve an input to a member token by LookupValue or StandardLookupValue, case/space-insensitively. */
export function resolveMember(input: string, members: readonly Member[]): string | null {
  const n = norm(input);
  for (const [token, display] of members) if (norm(token) === n || norm(display) === n) return token;
  return null;
}

/** Display form for a token, from the live Lookup. */
export function displayOf(token: string, members: readonly Member[]): string {
  const hit = members.find(([t]) => t === token);
  return hit ? hit[1] : token;
}

const CITY_REGION_INPUTS: Readonly<Record<string, CityRegionValue>> = Object.freeze({
  manhattan: 'Manhattan', brooklyn: 'Brooklyn', queens: 'Queens', bronx: 'Bronx', thebronx: 'Bronx', statenisland: 'StatenIsland',
});

const SORT_INPUTS: Readonly<Record<string, SortKey>> = Object.freeze({
  price_desc: 'price_desc', 'listprice desc': 'price_desc', 'price desc': 'price_desc',
  price_asc: 'price_asc', 'listprice asc': 'price_asc', 'price asc': 'price_asc',
  newest: 'newest', 'listingcontractdate desc': 'newest',
});

export function criteriaFromParams(params: URLSearchParams): CriteriaResult {
  const unsupported: string[] = [];
  const invalid: CriteriaRefusal['invalid'] = [];
  const bad = (param: string, value: string, reason: string) => invalid.push({ param, value, reason });

  for (const [key, value] of params.entries()) {
    if (EXECUTED_PARAMS.has(key) || TRANSPORT_PARAMS.has(key)) continue;
    if (!isBlank(value) && !unsupported.includes(key)) unsupported.push(key);
  }

  const typeRaw = (params.get('type') || 'sale').trim().toLowerCase();
  let workflow: SearchWorkflow = 'sale';
  if (typeRaw === 'sale' || typeRaw === 'buy' || typeRaw === 'residential') workflow = 'sale';
  else if (typeRaw === 'rent' || typeRaw === 'rental' || typeRaw === 'lease' || typeRaw === 'residentiallease') workflow = 'rental';
  else bad('type', typeRaw, 'must be sale or rental');

  const standardStatus: string[] = [];
  const statusRaw = params.get('status') ?? params.get('StandardStatus');
  if (isBlank(statusRaw) || statusRaw === '*') standardStatus.push('Active');
  else for (const s of list(statusRaw)) {
    const t = resolveMember(s, STANDARD_STATUS_MEMBERS);
    if (t) { if (!standardStatus.includes(t)) standardStatus.push(t); } else bad('status', s, 'not a live StandardStatus member');
  }

  const priceMin = num(params.get('minPrice'));
  const priceMax = num(params.get('maxPrice'));
  const bedsMin = num(params.get('minBeds') ?? params.get('beds'));
  const bedsMax = num(params.get('maxBeds'));
  const bathsMinRaw = num(params.get('minBaths'));
  const bathsMaxRaw = num(params.get('maxBaths'));
  for (const [p, v] of [['minPrice', priceMin], ['maxPrice', priceMax], ['beds', bedsMin], ['maxBeds', bedsMax], ['minBaths', bathsMinRaw], ['maxBaths', bathsMaxRaw]] as const) {
    if (typeof v === 'number' && (Number.isNaN(v) || v < 0)) bad(p, String(params.get(p === 'beds' ? 'beds' : p) ?? ''), 'must be a non-negative number');
  }
  const ok = (v: number | undefined): v is number => v != null && !Number.isNaN(v);
  if (ok(priceMin) && ok(priceMax) && priceMin > priceMax) bad('minPrice', String(priceMin), 'minPrice exceeds maxPrice');
  if (ok(bedsMin) && ok(bedsMax) && bedsMin > bedsMax) bad('beds', String(bedsMin), 'minimum beds exceeds maximum');
  const bathsMin = ok(bathsMinRaw) ? halfSteps(bathsMinRaw) : undefined;
  const bathsMax = ok(bathsMaxRaw) ? halfSteps(bathsMaxRaw) : undefined;
  if (ok(bathsMin) && ok(bathsMax) && bathsMin > bathsMax) bad('minBaths', String(bathsMin), 'minimum baths exceeds maximum');

  const cityRegion: CityRegionValue[] = [];
  for (const b of list(params.get('borough'), params.get('CityRegion'))) {
    const t = CITY_REGION_INPUTS[norm(b)];
    if (t) { if (!cityRegion.includes(t)) cityRegion.push(t); } else bad('borough', b, 'not a live CityRegion value');
  }

  const subdivisionName = list(params.get('neighborhood'), params.get('SubdivisionName'));

  const commonInterest: string[] = [];
  const structureType: string[] = [];
  for (const raw of list(params.get('ownership'), params.get('CommonInterest'))) {
    const t = resolveMember(raw, COMMON_INTEREST_MEMBERS);
    if (t) { if (!commonInterest.includes(t)) commonInterest.push(t); } else bad('ownership', raw, 'not a live CommonInterest member');
  }
  for (const raw of list(params.get('StructureType'))) {
    const t = resolveMember(raw, STRUCTURE_TYPE_MEMBERS);
    if (t) { if (!structureType.includes(t)) structureType.push(t); } else bad('StructureType', raw, 'not a live StructureType member');
  }

  const postalCode = list(params.get('zip'), params.get('PostalCode'));
  for (const z of postalCode) if (!/^\d{5}$/.test(z)) bad('zip', z, 'must be five digits');

  const listingId = list(params.get('listingId'), params.get('ListingId'));
  for (const id of listingId) if (!/^[A-Za-z0-9-]+$/.test(id)) bad('listingId', id, 'malformed listing id');

  let sort: SortKey = DEFAULT_SORT;
  const sortRaw = params.get('sort');
  if (!isBlank(sortRaw)) {
    const t = SORT_INPUTS[String(sortRaw).trim().toLowerCase()];
    if (t) sort = t; else bad('sort', String(sortRaw), 'not a supported sort key');
  }

  const limitRaw = num(params.get('limit'));
  const limit = Math.min(Math.max(ok(limitRaw) ? Math.floor(limitRaw) : DEFAULT_PAGE, 1), MAX_PAGE);
  const offsetRaw = num(params.get('skip') ?? params.get('offset'));
  const offset = ok(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  if (unsupported.length || invalid.length) return { ok: false, refusal: { unsupported, invalid } };

  const criteria: SearchCriteria = {
    workflow, standardStatus, priceMin, priceMax, bedsMin, bedsMax, bathsMin, bathsMax,
    cityRegion, subdivisionName, commonInterest, structureType, postalCode, listingId, sort, limit, offset,
  };
  return { ok: true, criteria: criteria as SaleCriteria | RentalCriteria };
}
