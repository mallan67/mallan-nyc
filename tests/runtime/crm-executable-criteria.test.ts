/// <reference types="jest" />
/**
 * EXECUTABLE SEARCH / COMP CRITERIA — the whole wire, end to end (2026-09-09)
 *
 * Four shipped defects, each proved here by EXECUTING the real code rather than reading it:
 *
 *  1. `backOnMarket` never left the browser. `serializeSearchCriteria` sets `params.backOnMarket = '1'`
 *     (public/crm/js/search/search-engine.js) and `criteriaFromParams` accepts it, but
 *     `MallanAPI.idx.search` — the ONE function that turns those params into a URL — never appended it.
 *     The Back On Market refinement offered by all four Search panels and by Refine therefore returned
 *     an unnarrowed Active set: the same rows, silently, with no refusal to tell anyone.
 *
 *  2. `ClosePrice` was selected from Cotality (lib/search/engine/select.ts) and the DTO carried
 *     `closedDate`, but no `closePrice`. The Comparables table's "Sold Price" / "Rented Price" column
 *     reads `l.closePrice ?? l.close_price`, found neither, and rendered an em-dash on EVERY closed
 *     comp — a CMA silently priced at the ask.
 *
 *  3. `buildingName` / `minSqft` / `maxSqft` were refused rather than executed, even though live
 *     Cotality Property.BuildingName (Edm.String) and Property.LivingArea (Edm.Decimal) are both
 *     `filterable: true` in the committed contract (data/cotality-contract/contract.compact.json,
 *     probeHttp 200, 221,140 and 417,652 populated rows respectively).
 *
 *  4. The `MallanAPI.idx.search` JSDoc advertised minYear / maxYear / minFloors / maxFloors /
 *     minUnits / maxUnits / buildingName — parameters the function dropped on the floor.
 *
 * STRATEGY. Nothing here greps source text for a claim about behaviour:
 *   · api-client.js is booted in a `vm` sandbox with a recording `fetch`; the assertion is on the URL
 *     the client ACTUALLY requested.
 *   · that URL's own query string is then fed to the real `criteriaFromParams` + `buildProviderQuery`,
 *     so browser → wire → executor → OData `$filter` is one unbroken, executed chain.
 *   · the Comparables cell is rendered by the REAL `_compClosePrice` / `_compMoney` source lifted out
 *     of search-engine.js and executed against the REAL mapper's output.
 *   · the Mallan half of the universe is settled by the real `settleUniverse` over a recording Prisma.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import { criteriaFromParams, EXECUTED_PARAMS, type SearchCriteria } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

// The Mallan half of the universe is settled against the database; a recording Prisma and an empty
// provider walk leave `settleUniverse` itself entirely real.
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findMany: jest.fn(async () => []) } } }));
jest.mock('@/lib/search/engine/provider-client', () => ({
  __esModule: true,
  walkProvider: jest.fn(async () => ({ rows: [], count: 0, pages: 1, complete: true })),
}));
import prisma from '@/lib/prisma';
import { settleUniverse } from '@/lib/search/engine/universe';

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const API_CLIENT_SRC = readFileSync(path.join(CRM_ROOT, 'js/core/api-client.js'), 'utf8');
const SEARCH_ENGINE_SRC = readFileSync(path.join(CRM_ROOT, 'js/search/search-engine.js'), 'utf8');

// ── the real api-client.js, booted with a recording fetch ────────────────────────────────────────

interface Client {
  MallanAPI: any;
  urls: string[];
}

function bootApiClient(): Client {
  const urls: string[] = [];
  const sandbox: any = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise, Object, Array, String, Number, Boolean, JSON, Error, RegExp, Date, Math,
    encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
    localStorage: { removeItem: () => {}, getItem: () => null, setItem: () => {} },
    document: { cookie: '' },
    CustomEvent: function (this: any, type: string) { this.type = type; },
    fetch: (url: string) => {
      urls.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ listings: [] }) });
    },
  };
  sandbox.window = sandbox;
  sandbox.location = { origin: 'https://mallan.nyc', hostname: 'mallan.nyc', host: 'mallan.nyc', protocol: 'https:', pathname: '/crm/dashboard.html', href: 'https://mallan.nyc/crm/dashboard.html' };
  sandbox.addEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  vm.runInContext(API_CLIENT_SRC, vm.createContext(sandbox), { filename: 'api-client.js' });
  return { MallanAPI: sandbox.MallanAPI, urls };
}

/** Drive the REAL MallanAPI.idx.search and return the query string it actually requested. */
async function searchQuery(params: Record<string, unknown>): Promise<URLSearchParams> {
  const c = bootApiClient();
  await c.MallanAPI.idx.search(params);
  expect(c.urls).toHaveLength(1);
  const q = c.urls[0].indexOf('?');
  return new URLSearchParams(q === -1 ? '' : c.urls[0].slice(q + 1));
}

/** criteria parse → provider `$filter`, from a wire query string, refusing nothing silently. */
function filterFor(query: URLSearchParams): string {
  const r = criteriaFromParams(query);
  if (!r.ok) throw new Error('executor refused: ' + JSON.stringify(r.refusal));
  return buildProviderQuery(r.criteria).filter;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 1. backOnMarket — the browser → wire → executor → $filter chain
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('backOnMarket reaches the provider clause', () => {
  it('MallanAPI.idx.search forwards it, and the executor turns it into BackOnMarketDate ne null', async () => {
    // Exactly what serializeSearchCriteria produces for the Back On Market refinement.
    const q = await searchQuery({ type: 'sale', status: 'Active', backOnMarket: '1' });
    expect(q.get('backOnMarket')).toBe('1');

    const filter = filterFor(q);
    expect(filter).toContain("PropertyType eq 'Residential'");
    expect(filter).toContain("StandardStatus eq 'Active'");
    expect(filter).toContain('BackOnMarketDate ne null');
  });

  it('a plain Active search still sends nothing and still does not narrow', async () => {
    const q = await searchQuery({ type: 'sale', status: 'Active' });
    expect(q.has('backOnMarket')).toBe(false);
    expect(filterFor(q)).not.toContain('BackOnMarketDate');
  });

  it('a rental Back On Market search narrows the rental universe, not the sale one', async () => {
    const q = await searchQuery({ type: 'rental', status: 'Active', backOnMarket: '1' });
    const filter = filterFor(q);
    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    expect(filter).toContain('BackOnMarketDate ne null');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 2. buildingName / minSqft / maxSqft — executable, not refused
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('BuildingName and LivingArea are executed end to end', () => {
  it('the client forwards them and the executor emits tolower(BuildingName) eq and LivingArea ge/le', async () => {
    const q = await searchQuery({ type: 'sale', buildingName: 'The Apthorp', minSqft: 900, maxSqft: 2500 });
    expect(q.get('buildingName')).toBe('The Apthorp');
    expect(q.get('minSqft')).toBe('900');
    expect(q.get('maxSqft')).toBe('2500');

    const filter = filterFor(q);
    // Case-folded equality, the same form the SubdivisionName clause already executes live.
    expect(filter).toContain("tolower(BuildingName) eq 'the apthorp'");
    expect(filter).toContain('LivingArea ge 900');
    expect(filter).toContain('LivingArea le 2500');
  });

  it('parses the criteria themselves, not just the clause text', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale&buildingName=The Apthorp,One57&minSqft=900&maxSqft=2500'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criteria.buildingName).toEqual(['The Apthorp', 'One57']);
    expect(r.criteria.sqftMin).toBe(900);
    expect(r.criteria.sqftMax).toBe(2500);
    // Two buildings OR together; one clause, not two ANDed clauses that can never both be true.
    const filter = buildProviderQuery(r.criteria).filter;
    expect(filter).toContain("(tolower(BuildingName) eq 'the apthorp' or tolower(BuildingName) eq 'one57')");
  });

  it("a building name carrying an apostrophe is OData-escaped, not injected", () => {
    const r = criteriaFromParams(new URLSearchParams("type=sale&buildingName=O'Neill Building"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(buildProviderQuery(r.criteria).filter).toContain("tolower(BuildingName) eq 'o''neill building'");
  });

  it('an absent bound emits no clause at all — a size filter never appears uninvited', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const filter = buildProviderQuery(r.criteria).filter;
    expect(filter).not.toContain('LivingArea');
    expect(filter).not.toContain('BuildingName');
  });

  it('the published contract now names them as executable', () => {
    for (const p of ['buildingName', 'minSqft', 'maxSqft']) expect(EXECUTED_PARAMS.has(p)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 3. An unsupported / invalid value is REFUSED BY NAME, never silently ignored
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('refusal by name — an ignored criterion is a silent widening of the universe', () => {
  it('a criterion the executor has no clause for is named in the refusal', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale&minYear=1990&maxFloors=12&minUnits=4&keyword=doorman'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Named, every one of them — not dropped, not approximated by a neighbouring criterion.
    expect(r.refusal.unsupported.sort()).toEqual(['keyword', 'maxFloors', 'minUnits', 'minYear']);
  });

  it('an out-of-range size bound is refused by its own parameter name and reason', () => {
    const neg = criteriaFromParams(new URLSearchParams('type=sale&minSqft=-500'));
    expect(neg.ok).toBe(false);
    if (neg.ok) return;
    expect(neg.refusal.invalid).toContainEqual({ param: 'minSqft', value: '-500', reason: 'must be a non-negative number' });

    const nan = criteriaFromParams(new URLSearchParams('type=sale&maxSqft=big'));
    expect(nan.ok).toBe(false);
    if (nan.ok) return;
    expect(nan.refusal.invalid.map((i) => i.param)).toContain('maxSqft');

    const inverted = criteriaFromParams(new URLSearchParams('type=sale&minSqft=2500&maxSqft=900'));
    expect(inverted.ok).toBe(false);
    if (inverted.ok) return;
    expect(inverted.refusal.invalid).toContainEqual({ param: 'minSqft', value: '2500', reason: 'minimum square feet exceeds maximum' });
  });

  it('a refused search produces NO criteria at all — the caller cannot run a widened query by accident', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale&minSqft=2500&maxSqft=900&buildingName=One57'));
    expect(r.ok).toBe(false);
    expect((r as { criteria?: unknown }).criteria).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 4. The JSDoc contract: everything advertised is forwarded, everything forwarded is executable
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('MallanAPI.idx.search advertises exactly what it forwards', () => {
  /** Every parameter the JSDoc above `search:` names, read from the real file. */
  function advertisedParams(): string[] {
    const at = API_CLIENT_SRC.indexOf('search: function (params)');
    expect(at).toBeGreaterThan(-1);
    const doc = API_CLIENT_SRC.slice(API_CLIENT_SRC.lastIndexOf('/**', at), at);
    const block = doc.slice(doc.indexOf('@param'));
    const braces = block.slice(block.indexOf('{', block.indexOf('-')) + 1, block.lastIndexOf('}'));
    return braces.split(',').map((s) => s.trim().replace(/\*/g, '').trim()).filter(Boolean);
  }

  const SAMPLE: Record<string, unknown> = {
    type: 'sale', status: 'Active', backOnMarket: '1', minPrice: 500000, maxPrice: 4000000,
    minBeds: 1, maxBeds: 4, minBaths: 1, maxBaths: 3, minSqft: 900, maxSqft: 2500,
    neighborhood: 'Chelsea', buildingName: 'One57', borough: 'Manhattan', zip: '10011',
    ownership: 'Condominium', StructureType: 'HighRise', listingId: 'RLS123',
    sort: 'price_asc', limit: 50, skip: 100,
  };

  it('every advertised parameter is actually appended to the request URL', async () => {
    const advertised = advertisedParams();
    expect(advertised.length).toBeGreaterThan(10);
    const q = await searchQuery(SAMPLE);
    for (const p of advertised) {
      expect(Object.prototype.hasOwnProperty.call(SAMPLE, p)).toBe(true); // the sample covers the doc
      expect(q.has(p)).toBe(true);
    }
    // …and the retired advertisement is gone: these are NOT executable, so they are named nowhere.
    for (const p of ['minYear', 'maxYear', 'minFloors', 'maxFloors', 'minUnits', 'maxUnits']) {
      expect(advertised).not.toContain(p);
      expect(EXECUTED_PARAMS.has(p)).toBe(false);
    }
  });

  it('every parameter it forwards is one the executor executes — nothing is sent to be dropped', async () => {
    const q = await searchQuery(SAMPLE);
    const sent = [...q.keys()];
    expect(sent.length).toBeGreaterThan(10);
    for (const p of sent) expect(EXECUTED_PARAMS.has(p)).toBe(true);
    // The whole sample is one executable search, accepted with no refusal.
    const r = criteriaFromParams(q);
    expect(r.ok).toBe(true);
  });

  it('a parameter the client does NOT forward never reaches the server, so it cannot widen anything', async () => {
    const q = await searchQuery({ type: 'sale', minYear: 1990, minFloors: 3, minUnits: 8, keyword: 'doorman' });
    for (const p of ['minYear', 'minFloors', 'minUnits', 'keyword']) expect(q.has(p)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 5. closePrice — the Comparables "Sold Price" column, actually rendered
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** Lift a top-level `function name(...) { ... }` out of the real search-engine.js source, brace-matched. */
function liftFunction(name: string): string {
  const at = SEARCH_ENGINE_SRC.indexOf('function ' + name + '(');
  if (at === -1) throw new Error('search-engine.js no longer declares ' + name);
  let depth = 0;
  let i = SEARCH_ENGINE_SRC.indexOf('{', at);
  const start = i;
  for (; i < SEARCH_ENGINE_SRC.length; i++) {
    const ch = SEARCH_ENGINE_SRC[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return SEARCH_ENGINE_SRC.slice(at, i + 1); }
  }
  throw new Error('unbalanced braces after ' + name + ' at ' + start);
}

/** The REAL comp cell renderer: `_compMoney(_compClosePrice(listing))`, executed. */
const renderSoldPriceCell: (l: Record<string, unknown>) => string = new Function(
  liftFunction('_compClosePrice') + '\n' + liftFunction('_compMoney') + '\nreturn function (l) { return _compMoney(_compClosePrice(l)); };',
)() as (l: Record<string, unknown>) => string;

describe('a closed comp is priced at its CLOSE, not at the ask', () => {
  const closedSale = (extra: Record<string, unknown> = {}) => mapTrestleToCrmListing({
    ListingId: 'RLS900', PropertyType: 'Residential', StandardStatus: 'Closed',
    ListPrice: 1400000, CloseDate: '2026-03-04', ClosePrice: 1250000,
    InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
    ...extra,
  }, 0);

  it('the mapper emits closePrice, and the column renders it instead of an em-dash', () => {
    const dto = closedSale();
    expect(dto.closePrice).toBe(1250000);
    expect(dto.closedDate).toBe('2026-03-04');
    // The rendered cell — the actual defect symptom was this string being '—' on every closed row.
    expect(renderSoldPriceCell(dto)).toBe('$1,250,000');
    expect(renderSoldPriceCell(dto)).not.toBe('—');
    // …and it is the CLOSE, never the ask.
    expect(dto.closePrice).not.toBe(dto.price);
  });

  it('the em-dash still means "the provider published none" — it is never inferred from ListPrice', () => {
    for (const absent of [{}, { ClosePrice: null }, { ClosePrice: '' }, { ClosePrice: 0 }, { ClosePrice: -1 }, { ClosePrice: 'n/a' }]) {
      const dto = mapTrestleToCrmListing({
        ListingId: 'RLS901', PropertyType: 'Residential', StandardStatus: 'Closed',
        ListPrice: 1400000, CloseDate: '2026-03-04',
        InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
        ...absent,
      }, 0);
      expect(dto.closePrice).toBeNull();
      expect(renderSoldPriceCell(dto)).toBe('—');
    }
  });

  it('a rental close carries its own achieved rent under the same key', () => {
    const dto = mapTrestleToCrmListing({
      ListingId: 'RL900', PropertyType: 'ResidentialLease', StandardStatus: 'Closed',
      ListPrice: 6500, CloseDate: '2026-02-01', ClosePrice: 6200,
      InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
    }, 0);
    expect(dto.closePrice).toBe(6200);
    expect(dto.status_label).toBe('Rented');
    expect(renderSoldPriceCell(dto)).toBe('$6,200');
  });

  it('ClosePrice is selected from the provider, so the DTO has something to carry', async () => {
    const { SEARCH_SELECT_FIELDS } = await import('@/lib/search/engine/select');
    expect(SEARCH_SELECT_FIELDS as readonly string[]).toContain('ClosePrice');
    expect(SEARCH_SELECT_FIELDS as readonly string[]).toContain('CloseDate');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 6. The Mallan half of the universe mirrors every new criterion
//
// A criterion applied to the provider walk but NOT to the Mallan-authored rows does not "fail open"
// quietly — it returns Mallan rows the same search excluded from Cotality, i.e. it WIDENS the result
// set with rows the agent did not ask for. These cases settle the real universe over a recording
// Prisma and assert on the `where` the executor actually issued and the rows it actually kept.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('settleUniverse mirrors BuildingName and LivingArea onto Mallan-authored rows', () => {
  const findMany = (prisma as unknown as { listing: { findMany: jest.Mock } }).listing.findMany;

  const mallanRow = (listing_id: string, address: unknown, living_area: number | null) => ({
    listing_id, list_price: 1_000_000, listing_contract_date: null,
    bathrooms_full: 1, bathrooms_half: 0, property_sub_type: null,
    address, living_area, updated_at: new Date('2026-09-01T00:00:00Z'),
  });

  function criteria(query: string): SearchCriteria {
    const r = criteriaFromParams(new URLSearchParams(query));
    if (!r.ok) throw new Error('executor refused: ' + JSON.stringify(r.refusal));
    return r.criteria;
  }

  beforeEach(() => { findMany.mockReset(); findMany.mockResolvedValue([]); });

  it('pushes the size bound into the database query, so an unsized Mallan row cannot slip through', async () => {
    await settleUniverse(criteria('type=sale&minSqft=900&maxSqft=2500'));
    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
    // The same narrowing `LivingArea ge 900 and LivingArea le 2500` applies at the provider; a NULL
    // living_area fails this range in Postgres exactly as it fails `ge`/`le` in OData.
    expect(where.living_area).toEqual({ gte: 900, lte: 2500 });
    expect(findMany.mock.calls[0][0].select.address).toBe(true);
  });

  it('emits no size predicate when no size was asked for', async () => {
    await settleUniverse(criteria('type=sale'));
    expect(findMany.mock.calls[0][0].where.living_area).toBeUndefined();
  });

  it('keeps only the Mallan rows whose stored BuildingName equals the one searched, case-folded', async () => {
    findMany.mockResolvedValue([
      mallanRow('SL-1', { BuildingName: 'the apthorp' }, 1200),   // case variant of the search term
      mallanRow('SL-2', { BuildingName: 'The Apthorp ' }, 1200),  // stored with trailing space
      mallanRow('SL-3', { BuildingName: 'One57' }, 1200),         // a different building
      mallanRow('SL-4', {}, 1200),                                // no building name at all
      mallanRow('SL-5', null, 1200),                              // no address bucket at all
    ]);
    const u = await settleUniverse(criteria('type=sale&buildingName=The Apthorp'));
    expect(u.rows.map((r) => r.listingId).sort()).toEqual(['SL-1', 'SL-2']);
    // A row the provider clause `tolower(BuildingName) eq 'the apthorp'` would not have returned is
    // not smuggled in from the Mallan side.
    expect(u.rows.map((r) => r.listingId)).not.toContain('SL-3');
    expect(u.rows.map((r) => r.listingId)).not.toContain('SL-4');
    expect(u.total).toBe(2);
  });

  it('substring is NOT a match — the provider clause is equality, and so is this one', async () => {
    findMany.mockResolvedValue([mallanRow('SL-6', { BuildingName: 'The Apthorp Annex' }, 1200)]);
    const u = await settleUniverse(criteria('type=sale&buildingName=The Apthorp'));
    expect(u.rows).toHaveLength(0);
  });

  it('without a building criterion every Mallan row survives — the filter is not always-on', async () => {
    findMany.mockResolvedValue([
      mallanRow('SL-7', { BuildingName: 'One57' }, 1200),
      mallanRow('SL-8', {}, 1200),
    ]);
    const u = await settleUniverse(criteria('type=sale'));
    expect(u.rows.map((r) => r.listingId).sort()).toEqual(['SL-7', 'SL-8']);
  });
});
