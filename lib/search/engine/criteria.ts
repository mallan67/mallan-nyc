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

import {
  STANDARD_STATUS_MEMBERS as LIVE_STANDARD_STATUS,
  PROPERTY_TYPE_MEMBERS as LIVE_PROPERTY_TYPE,
  COMMON_INTEREST_MEMBERS as LIVE_COMMON_INTEREST,
  STRUCTURE_TYPE_MEMBERS as LIVE_STRUCTURE_TYPE,
  CITY_REGION_VALUES as LIVE_CITY_REGION,
  FURNISHED_MEMBERS as LIVE_FURNISHED,
  PETS_ALLOWED_MEMBERS as LIVE_PETS_ALLOWED,
  PETS_FRIENDLY_MEMBERS,
} from '../canonical/live-truth';

/**
 * ONE vocabulary authority (Search Consolidation Packet 1, 2026-09-05):
 *   data/cotality-enums.live.json  → canonical/live-truth.ts (typed, test-bound) → THIS executor
 *   → engine/contract.ts → /api/idx/search/contract → the browser.
 * No member list is hand-maintained here. A Member is [LookupValue, derived label]; the label is
 * a presentation derivation of the token (a space before each capital), NOT the provider's
 * StandardLookupValue, which the pinned pull tooling does not capture. Resolution of inputs is
 * by token, case- and separator-insensitive, so both spellings resolve.
 */
export type Member = readonly [token: string, display: string];
function derivedLabel(token: string): string {
  return token.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
const members = (tokens: readonly string[]): readonly Member[] =>
  Object.freeze(tokens.map((t) => Object.freeze([t, derivedLabel(t)] as const)));

export const STANDARD_STATUS_MEMBERS: readonly Member[] = members(LIVE_STANDARD_STATUS);
export const PROPERTY_TYPE_MEMBERS: readonly Member[] = members(LIVE_PROPERTY_TYPE);
export const COMMON_INTEREST_MEMBERS: readonly Member[] = members(LIVE_COMMON_INTEREST);
export const STRUCTURE_TYPE_MEMBERS: readonly Member[] = members(LIVE_STRUCTURE_TYPE);
/** Rental-only vocabularies (Domain 6, 2026-09-08): Furnished (`eq`), PetsAllowed (Multi, `has`). */
export const FURNISHED_MEMBERS: readonly Member[] = members(LIVE_FURNISHED);
export const PETS_ALLOWED_MEMBERS: readonly Member[] = members(LIVE_PETS_ALLOWED);
/** Parameters that only a rental search may carry; on a sale search they are refused by name, never ignored. */
export const RENTAL_ONLY_PARAMS: ReadonlySet<string> = new Set([
  'furnished', 'Furnished', 'pets', 'PetsAllowed', 'availableBy', 'AvailabilityDate', 'maxDeposit', 'SecurityDeposit',
]);

/** CityRegion is a plain string field (no lookup); values bound in canonical/live-truth. `StatenIsland` has no space. */
export const CITY_REGION_VALUES = LIVE_CITY_REGION;
export type CityRegionValue = (typeof CITY_REGION_VALUES)[number];

export type SortKey = 'price_desc' | 'price_asc' | 'newest';
export const DEFAULT_SORT: SortKey = 'price_desc';
export const MAX_PAGE = 200;
export const DEFAULT_PAGE = 50;

export interface SearchCriteria {
  workflow: SearchWorkflow;
  /** StandardStatus LookupValues. */
  standardStatus: readonly string[];
  /**
   * Back on Market — a refinement OF Active, not a status (owner ruling 2026-09-08: Back on Market → Active +
   * BackOnMarketDate). When true the executor narrows the result to rows that carry a BackOnMarketDate.
   */
  backOnMarket?: boolean;
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
  /**
   * Entered building names; executed case-insensitively against the provider's BuildingName.
   * Live Cotality Property.BuildingName is Edm.String, `filterable: true`, 221,140 populated rows
   * (committed contract data/cotality-contract/contract.compact.json, probeHttp 200) — so it is
   * EXECUTED, not refused. It was previously refused by name in the browser serializer.
   */
  buildingName: readonly string[];
  /**
   * LivingArea (interior square feet) bounds. Live Cotality Property.LivingArea is Edm.Decimal,
   * `filterable: true`, 417,652 populated rows (same committed contract, probeHttp 200).
   * A row with no LivingArea does not satisfy `ge`/`le` at the provider, so the bound NARROWS —
   * it never admits an unknown-size row.
   */
  sqftMin?: number;
  sqftMax?: number;
  /** CommonInterest LookupValues. */
  commonInterest: readonly string[];
  /** StructureType LookupValues (multi-value field; executed with `has`). */
  structureType: readonly string[];
  postalCode: readonly string[];
  listingId: readonly string[];
  /** Rental-only: Furnished LookupValues (executed with `eq`, OR-joined). Empty on a sale search. */
  furnished: readonly string[];
  /** Rental-only: PetsAllowed LookupValues (Multi enum, executed with `has`, OR-joined). Empty on a sale search. */
  petsAllowed: readonly string[];
  /** Rental-only: AvailabilityDate upper bound (YYYY-MM-DD; `AvailabilityDate le`). */
  availableBy?: string;
  /** Rental-only: SecurityDeposit upper bound (`SecurityDeposit le`). */
  securityDepositMax?: number;
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
export const EXECUTED_PARAMS = new Set([
  'type', 'status', 'StandardStatus', 'backOnMarket', 'minPrice', 'maxPrice', 'beds', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths',
  'borough', 'CityRegion', 'neighborhood', 'SubdivisionName', 'ownership', 'CommonInterest', 'StructureType',
  'zip', 'PostalCode', 'listingId', 'ListingId', 'sort', 'limit', 'skip', 'offset',
  // Building name + interior size: both live and filterable on Cotality Property (see SearchCriteria above).
  'buildingName', 'BuildingName', 'minSqft', 'maxSqft',
  // rental-only (Domain 6): refused by name on a sale search
  'furnished', 'Furnished', 'pets', 'PetsAllowed', 'availableBy', 'AvailabilityDate', 'maxDeposit', 'SecurityDeposit',
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

  // Back on Market: a narrowing of Active by the presence of the provider's BackOnMarketDate (filterable; 4,427
  // live rows). Accepted as 1/true/yes; anything else is refused by name rather than silently ignored.
  let backOnMarket = false;
  const bomRaw = params.get('backOnMarket');
  if (!isBlank(bomRaw)) {
    const v = String(bomRaw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') backOnMarket = true;
    else if (v === '0' || v === 'false' || v === 'no') backOnMarket = false;
    else bad('backOnMarket', String(bomRaw), 'must be 1/true/yes or 0/false/no');
  }

  const priceMin = num(params.get('minPrice'));
  const priceMax = num(params.get('maxPrice'));
  const bedsMin = num(params.get('minBeds') ?? params.get('beds'));
  const bedsMax = num(params.get('maxBeds'));
  const bathsMinRaw = num(params.get('minBaths'));
  const bathsMaxRaw = num(params.get('maxBaths'));
  const sqftMin = num(params.get('minSqft'));
  const sqftMax = num(params.get('maxSqft'));
  for (const [p, v] of [['minPrice', priceMin], ['maxPrice', priceMax], ['beds', bedsMin], ['maxBeds', bedsMax], ['minBaths', bathsMinRaw], ['maxBaths', bathsMaxRaw], ['minSqft', sqftMin], ['maxSqft', sqftMax]] as const) {
    if (typeof v === 'number' && (Number.isNaN(v) || v < 0)) bad(p, String(params.get(p === 'beds' ? 'beds' : p) ?? ''), 'must be a non-negative number');
  }
  const ok = (v: number | undefined): v is number => v != null && !Number.isNaN(v);
  if (ok(priceMin) && ok(priceMax) && priceMin > priceMax) bad('minPrice', String(priceMin), 'minPrice exceeds maxPrice');
  if (ok(bedsMin) && ok(bedsMax) && bedsMin > bedsMax) bad('beds', String(bedsMin), 'minimum beds exceeds maximum');
  const bathsMin = ok(bathsMinRaw) ? halfSteps(bathsMinRaw) : undefined;
  const bathsMax = ok(bathsMaxRaw) ? halfSteps(bathsMaxRaw) : undefined;
  if (ok(bathsMin) && ok(bathsMax) && bathsMin > bathsMax) bad('minBaths', String(bathsMin), 'minimum baths exceeds maximum');
  if (ok(sqftMin) && ok(sqftMax) && sqftMin > sqftMax) bad('minSqft', String(sqftMin), 'minimum square feet exceeds maximum');

  const cityRegion: CityRegionValue[] = [];
  for (const b of list(params.get('borough'), params.get('CityRegion'))) {
    const t = CITY_REGION_INPUTS[norm(b)];
    if (t) { if (!cityRegion.includes(t)) cityRegion.push(t); } else bad('borough', b, 'not a live CityRegion value');
  }

  const subdivisionName = list(params.get('neighborhood'), params.get('SubdivisionName'));
  // A building name is free text the provider stores verbatim; there is no lookup to resolve it against, so the
  // only thing to refuse is an empty entry (which `list` already drops). It is executed, not ignored.
  const buildingName = list(params.get('buildingName'), params.get('BuildingName'));

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
  // ── Rental-only criteria (Domain 6, 2026-09-08). A sale search carrying one is refused by name. ──
  const furnished: string[] = [];
  const petsAllowed: string[] = [];
  let availableBy: string | undefined;
  let securityDepositMax: number | undefined;
  const rentalOnlyPresent: Array<[string, string]> = [];
  for (const p of RENTAL_ONLY_PARAMS) { const v = params.get(p); if (!isBlank(v)) rentalOnlyPresent.push([p, String(v)]); }
  if (workflow !== 'rental') {
    for (const [p, v] of rentalOnlyPresent) bad(p, v, 'rental-only criterion');
  } else {
    for (const raw of list(params.get('furnished'), params.get('Furnished'))) {
      // `furnished=true` is the CRM wire form for "furnished units" — the live member 'Furnished'.
      const t = /^(true|yes|1)$/i.test(raw) ? 'Furnished' : resolveMember(raw, FURNISHED_MEMBERS);
      if (t) { if (!furnished.includes(t)) furnished.push(t); } else bad('furnished', raw, 'not a live Furnished member');
    }
    for (const raw of list(params.get('pets'), params.get('PetsAllowed'))) {
      if (/^(friendly|true|yes|1)$/i.test(raw)) { for (const m of PETS_FRIENDLY_MEMBERS) if (!petsAllowed.includes(m)) petsAllowed.push(m); continue; }
      const t = resolveMember(raw, PETS_ALLOWED_MEMBERS);
      if (t) { if (!petsAllowed.includes(t)) petsAllowed.push(t); } else bad('pets', raw, 'not a live PetsAllowed member');
    }
    const availRaw = params.get('availableBy') ?? params.get('AvailabilityDate');
    if (!isBlank(availRaw)) {
      const s = String(availRaw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) availableBy = s; else bad('availableBy', s, 'must be a YYYY-MM-DD date');
    }
    const depositRaw = num(params.get('maxDeposit') ?? params.get('SecurityDeposit'));
    if (depositRaw !== undefined) {
      if (Number.isNaN(depositRaw) || depositRaw < 0) bad('maxDeposit', String(params.get('maxDeposit') ?? params.get('SecurityDeposit') ?? ''), 'must be a non-negative number');
      else securityDepositMax = depositRaw;
    }
  }

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
    workflow, standardStatus, backOnMarket, priceMin, priceMax, bedsMin, bedsMax, bathsMin, bathsMax,
    sqftMin, sqftMax,
    cityRegion, subdivisionName, buildingName, commonInterest, structureType, postalCode, listingId,
    furnished, petsAllowed, availableBy, securityDepositMax, sort, limit, offset,
  };
  return { ok: true, criteria: criteria as SaleCriteria | RentalCriteria };
}
