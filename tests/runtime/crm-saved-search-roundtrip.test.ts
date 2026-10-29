/**
 * Saved search round trip — the status (and every other criterion) must survive save → reload.
 *
 * Found 2026-10-27 in the browser: a saved search carrying status ["ACTIVE"] reloaded as a request with
 * no status at all (Cotality then answered with its default Active/ComingSoon/ActiveUnderContract/Pending
 * set: 358 rows instead of 204). Two causes:
 *   1. collectSearchCriteria's visibility guard walked up to <body>; the saved-search list only exists in
 *      the results header, where the whole #searchFormContainer is hidden, so every status, ownership and
 *      facet box read as "inactive" (price / beds survived because they are read by id).
 *   2. the restore wrote statuses into the basic form only, while the advanced form reads
 *      #saleStatusOptions / #rentalStatusOptions — an advanced saved search ran on Clear's default.
 *
 * Correction (same day): search criteria are business data and the form is an editor for them. A saved
 * record is validated and normalised (_criteriaFromApiFormat), shown in the form, verified to be displayed
 * exactly, and then executed itself (executeSearchCriteria) — never re-collected from hidden controls.
 *
 * The guard, the mappings and the request builder are executed in a vm sandbox; the wiring is asserted
 * on the shipped source.
 */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const ROOT = path.resolve(__dirname, "../../");
const engineSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/search/search-engine.js"), "utf8");
const savedSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/search/saved-searches.js"), "utf8");

function extract(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

type FakeNode = { id?: string; style: { display: string }; parentElement: FakeNode | null };

describe("collectSearchCriteria visibility guard (_isActiveControl)", () => {
  const guardSrc = extract(engineSrc, "function _isActiveControl(el) {", "function _activeOnly(");

  function build(opts: { containerHidden?: boolean; formHidden?: boolean; advancedHidden?: boolean }) {
    const body: FakeNode = { id: "body", style: { display: "" }, parentElement: null };
    const container: FakeNode = { id: "searchFormContainer", style: { display: opts.containerHidden ? "none" : "block" }, parentElement: body };
    const basicForm: FakeNode = { id: "searchBasicMode", style: { display: opts.formHidden ? "none" : "block" }, parentElement: container };
    const advanced: FakeNode = { id: "searchAdvancedMode", style: { display: opts.advancedHidden ? "none" : "block" }, parentElement: container };
    const statusOptions: FakeNode = { id: "saleStatusOptions", style: { display: "" }, parentElement: advanced };
    const basicBox: FakeNode = { style: { display: "" }, parentElement: basicForm };
    const advancedBox: FakeNode = { style: { display: "" }, parentElement: statusOptions };
    const ctx = vm.createContext({ document: { body, getElementById: (id: string) => (id === "searchFormContainer" ? container : null) } });
    vm.runInContext(guardSrc + "\n;globalThis.__guard = _isActiveControl;", ctx);
    const guard = (ctx as unknown as { __guard: (n: FakeNode) => boolean }).__guard;
    return { guard, basicBox, advancedBox };
  }

  it("a status box still counts while the results view hides the whole form container", () => {
    const { guard, basicBox } = build({ containerHidden: true, advancedHidden: true });
    expect(guard(basicBox)).toBe(true);
  });

  it("a box inside a hidden basic form (other tab, or advanced mode) does not count", () => {
    const { guard, basicBox } = build({ formHidden: true });
    expect(guard(basicBox)).toBe(false);
  });

  it("an advanced status box does not count while the advanced form is hidden (basic mode)", () => {
    const { guard, advancedBox } = build({ advancedHidden: true });
    expect(guard(advancedBox)).toBe(false);
  });

  it("an advanced status box counts in advanced mode even with the container hidden", () => {
    const { guard, advancedBox } = build({ containerHidden: true, formHidden: true });
    expect(guard(advancedBox)).toBe(true);
  });
});

describe("saved-search wiring: the record is executed, the form only displays it", () => {
  it("restores statuses into the container the mode reads (advanced: sale / rental status options)", () => {
    const restore = extract(savedSrc, "function _criteriaToFormFields(criteria) {", "// ── Saved-search reconciliation ──");
    expect(restore).toMatch(/var statusScope = _wantAdv\s*\?\s*document\.getElementById\(tab === 'rent' \? 'rentalStatusOptions' : 'saleStatusOptions'\)\s*:\s*document\.getElementById\(_basicFormId\)/);
    // saved without a status = any status: every box is unticked before the saved ones are ticked
    expect(restore).toMatch(/statusBoxes\.forEach\(function\(cb\) \{ cb\.checked = false; \}\);/);
    // a saved status with no box is reported, not dropped
    expect(restore).toMatch(/unresolved\.push\('Status ' \+ s/);
    // the two keys the writer used to lose are restored (or reported)
    expect(restore).toMatch(/criteria\.open_house_from \|\| criteria\.open_house_to/);
    expect(restore).toMatch(/criteria\.financing_min/);
    expect(restore).toMatch(/return unresolved;\s*\}\s*$/);
  });

  it("loadSavedSearch: parse → clear → restore → verify → executeSearchCriteria(parsed.criteria); no timer, no performSearch", () => {
    const load = extract(savedSrc, "function loadSavedSearch(searchId) {", "function deleteSavedSearch(");
    expect(load).not.toMatch(/setTimeout/);
    const parseAt = load.indexOf("_criteriaFromApiFormat(search.criteria)");
    const clearAt = load.indexOf("clearSearchForm()");
    const restoreAt = load.indexOf("_criteriaToFormFields(search.criteria)");
    const reconcileAt = load.indexOf("_reconcileSavedCriteria(search.criteria)");
    const runAt = load.indexOf("executeSearchCriteria(parsed.criteria)");
    expect(parseAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(parseAt);
    expect(restoreAt).toBeGreaterThan(clearAt);
    expect(reconcileAt).toBeGreaterThan(restoreAt);
    expect(runAt).toBeGreaterThan(reconcileAt);
    expect(load).toMatch(/var diffs = parsed\.unsupported\.concat\(unresolved, _reconcileSavedCriteria\(search\.criteria\)\)/);
    expect(load).toMatch(/if \(diffs\.length\) \{[\s\S]*showToast\([\s\S]*return;/);
    // the record runs directly; the form path is only a fallback for a build without the entry
    expect(load).toMatch(/if \(typeof executeSearchCriteria === 'function'\) executeSearchCriteria\(parsed\.criteria\);\s*else if \(typeof performSearch === 'function'\) performSearch\(\);/);
  });

  it("performSearch reads the form and hands the collected criteria to executeSearchCriteria", () => {
    const perform = extract(engineSrc, "function performSearch() {", "function _searchCriteriaProblem(");
    expect(perform).toMatch(/collected = collectSearchCriteria\(\)/);
    expect(perform).toMatch(/executeSearchCriteria\(collected\);/);
    expect(perform).not.toMatch(/_serverSearch\(/);
    const execute = extract(engineSrc, "function executeSearchCriteria(criteria) {", "function _setResultsCountText(");
    expect(execute).toMatch(/activeSearchCriteria = criteria \|\| \{\};/);
    expect(execute).not.toMatch(/collectSearchCriteria\(/);
    expect(execute).toMatch(/_serverSearch\(activeSearchCriteria\);/);
  });

  it("treats _search_mode as reserved view state in the frontend alert gate, like _search_tab", () => {
    expect(savedSrc).toMatch(/_search_tab: 1, _search_mode: 1/);
  });

  it("refine: an untouched box keeps the criteria value (custom amounts), and statuses sync back to the form", () => {
    const open = extract(engineSrc, "function toggleRefinePanel() {", "function applyRefinedSearch() {");
    // every refine box remembers what it was given, so Apply can tell a change from a preset the box could not show
    expect(open).toMatch(/\['refineMinPrice', 'refineMaxPrice', 'refineMinBeds', 'refineMaxBeds', 'refineMinBaths', 'refineMaxBaths'\]\.forEach\(function \(id\) \{\s*var box = document\.getElementById\(id\);\s*if \(box\) box\.setAttribute\('data-seed', box\.value\);/);
    const apply = extract(engineSrc, "function applyRefinedSearch() {", "function syncRefineToMainForm(");
    expect(apply).toMatch(/var _touched = function \(el\) \{ return !!el && el\.getAttribute\('data-seed'\) !== el\.value; \};/);
    expect(apply).toMatch(/if \(_touched\(pMin\)\) \{ if \(pMin\.value\) c\.priceMin = parseInt\(pMin\.value\); else delete c\.priceMin; \}/);
    expect(apply).not.toMatch(/if \(pMin && pMin\.value\) c\.priceMin/);
    const sync = extract(engineSrc, "function syncRefineToMainForm(c) {", "function clearRefinePanel(");
    expect(sync).toMatch(/querySelectorAll\('\[data-field="StandardStatus"\]'\)/);
    expect(sync).toMatch(/boxes\.forEach\(function \(cb\) \{ cb\.checked = false; \}\);/);
    expect(sync).toMatch(/\(c\.statuses \|\| \[\]\)\.forEach/);
  });
});

// ── shared sandbox: writer, inverse, reconciliation, request builder ──
const apiFormatSrc = extract(savedSrc, "function _criteriaToApiFormat(c) {", "/** Restore API criteria");
const reconcileSrc = extract(savedSrc, "// ── Saved-search reconciliation ──", "// ── /reconciliation ──");
const builderSrc = extract(engineSrc, "window.buildIdxSearchParams = function(criteria) {", "\n        };") + "\n        };";

type Dict = Record<string, unknown>;
type Sandbox = {
  __toApi: (c: Dict | null) => Dict;
  __fromApi: (s: Dict) => { criteria: Dict; unsupported: string[] };
  __reconcile: (s: Dict) => string[];
  __canon: (v: unknown) => string;
  __params: (c: Dict) => Dict;
  searchResultsState: { sortField: string; sortOrder: string; sortExplicit: boolean };
};

function sandbox(collected: Dict | null = null): Sandbox {
  const ctx = vm.createContext({
    window: {},
    console: { warn: () => undefined, log: () => undefined },
    document: { getElementById: () => null },
    searchResultsState: { sortField: "price", sortOrder: "asc", sortExplicit: false },
    collectSearchCriteria: () => collected,
  });
  vm.runInContext(
    apiFormatSrc + "\n" + reconcileSrc + "\n" + builderSrc +
      "\n;globalThis.__toApi = _criteriaToApiFormat; globalThis.__fromApi = _criteriaFromApiFormat; globalThis.__reconcile = _reconcileSavedCriteria; globalThis.__canon = _canonCriterion; globalThis.__params = window.buildIdxSearchParams;",
    ctx,
  );
  return ctx as unknown as Sandbox;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Every key the collector can produce (search-engine.js collectSearchCriteria), with a value.
const FULL_COLLECTED: Dict = {
  searchTab: "sale", searchMode: "advanced",
  statuses: ["ACTIVE", "PENDING", "Sold"], priceMin: 1234567, priceMax: 2500000, bedsMin: 0, bedsMax: 3, bathsMin: 1, bathsMax: 2.5,
  sqftMin: 800, sqftMax: 2000, roomsMin: 3, roomsMax: 6, neighborhoods: ["Dumbo", "Brooklyn Heights"], borough: "Brooklyn", zip: "11201",
  ownership: ["Condominium", "Cooperative"], address: "1 Main St", rlsId: "RLS123", yearMin: 1990, yearMax: 2020, floorsMin: 5, floorsMax: 40,
  unitsMin: 20, unitsMax: 400, buildingName: "The Tower", dateFrom: "2026-01-01", dateTo: "2026-02-01", dateActivityType: "Listed",
  soldDateFrom: "2025-01-01", soldDateTo: "2025-12-31", keyword: "river", managementCompany: "Corcoran", propertySubType: "Apartment,Loft",
  unit: "4B", contractDateFrom: "2026-03-01", contractDateTo: "2026-03-31",
  checkboxFilters: { Cooling: ["CentralAir"], SponsorUnit: ["true"] },
  checkboxGroups: { ownershipType: { CommonInterest: ["Condominium"] } },
  fieldRanges: { TotalMonthly: { max: "2000" } }, fieldText: { PublicRemarks: "park" },
  financingMin: 80, openHouseDateFrom: "2026-11-01", openHouseDateTo: "2026-11-02",
};

describe("saved record ⇄ executable criteria (_criteriaToApiFormat / _criteriaFromApiFormat)", () => {
  it("every collected key survives save → parse → save unchanged, and nothing is reported", () => {
    const sb = sandbox();
    const saved = sb.__toApi(clone(FULL_COLLECTED));
    const parsed = sb.__fromApi(clone(saved));
    expect(parsed.unsupported).toEqual([]);
    expect(sb.__canon(sb.__toApi(parsed.criteria))).toBe(sb.__canon(saved));
    expect(parsed.criteria.searchTab).toBe("sale");
    expect(parsed.criteria.searchMode).toBe("advanced");
    expect(parsed.criteria.bedsMin).toBe(0); // studio
    expect(parsed.criteria.financingMin).toBe(80);
    expect(parsed.criteria.openHouseDateTo).toBe("2026-11-02");
  });

  it("the request built from the parsed record equals the request built from the form's criteria", () => {
    const sb = sandbox();
    const saved = sb.__toApi(clone(FULL_COLLECTED));
    const parsed = sb.__fromApi(clone(saved));
    const fromForm = sb.__params(clone(FULL_COLLECTED));
    sb.searchResultsState.sortField = "price"; sb.searchResultsState.sortOrder = "asc";
    const fromRecord = sb.__params(clone(parsed.criteria));
    expect(fromRecord).toEqual(fromForm);
    expect(fromRecord.status).toBe("Active,Pending,ActiveUnderContract,Sold");
    expect(fromRecord.sponsorUnit).toBe("true");
    expect(JSON.parse(String(fromRecord.fieldRanges))).toEqual({ TotalMonthly: { max: "2000" }, "OpenHouse/OpenHouseDate": { min: "2026-11-01", max: "2026-11-02" }, MaximumFinancingPercent: { min: "80" } });
  });

  it("the writer now carries building financing and the open-house range (they were sent but never saved)", () => {
    const sb = sandbox();
    const saved = sb.__toApi({ searchTab: "sale", financingMin: 80, openHouseDateFrom: "2026-11-01", openHouseDateTo: "2026-11-02" });
    expect(saved.financing_min).toBe(80);
    expect(saved.open_house_from).toBe("2026-11-01");
    expect(saved.open_house_to).toBe("2026-11-02");
  });

  it("an older record: listing_type only, sponsor flag on its own, numbers as strings", () => {
    const sb = sandbox();
    const parsed = sb.__fromApi({ listing_type: "rental", status: ["ACTIVE"], min_price: "3000", max_price: "4500", sponsor_unit: "true" });
    expect(parsed.unsupported).toEqual([]);
    expect(parsed.criteria).toEqual({ searchTab: "rent", searchMode: "basic", statuses: ["ACTIVE"], priceMin: 3000, priceMax: 4500, checkboxFilters: { SponsorUnit: ["true"] } });
    expect(sb.__params(clone(parsed.criteria)).sponsorUnit).toBe("true");
  });

  it("reports what it cannot execute instead of dropping it", () => {
    const sb = sandbox();
    const parsed = sb.__fromApi({ listing_type: "sale", status: ["ACTIVE"], school_district: "2", checkbox_filters: "{not json", min_price: "abc" });
    expect(parsed.criteria).toEqual({ searchTab: "sale", searchMode: "basic", statuses: ["ACTIVE"] });
    expect(parsed.unsupported.sort()).toEqual([
      "Facets (stored value unreadable)",
      "Min price (stored value \"abc\" is not a number)",
      "school_district (not a criterion this build can run)",
    ]);
  });
});

describe("saved-search reconciliation (record vs what the restored form displays)", () => {
  const reconcile = (saved: Dict, collected: Dict) => sandbox(collected).__reconcile(saved);

  it("reports a status the form no longer carries (the 2026-10-27 reload)", () => {
    expect(reconcile(
      { listing_type: "sale", status: ["ACTIVE"], zip: "10028", _search_tab: "sale", _search_mode: "basic" },
      { searchTab: "sale", searchMode: "basic", zip: "10028" },
    )).toEqual(["Status: saved ACTIVE, form now none"]);
  });

  it("reports Clear's default Active when the record was saved with any status", () => {
    expect(reconcile(
      { listing_type: "sale", zip: "10028", _search_tab: "sale" },
      { searchTab: "sale", searchMode: "basic", zip: "10028", statuses: ["ACTIVE"] },
    )).toEqual(["Status: saved none, form now ACTIVE"]);
  });

  it("is exact when the form carries every saved value — order, case and JSON strings aside", () => {
    expect(reconcile(
      { listing_type: "sale", status: ["PENDING", "ACTIVE"], min_price: 1234567, min_beds: 2, neighborhoods: ["Dumbo", "Brooklyn Heights"],
        checkbox_groups: '{"ownershipType":{"CommonInterest":["Condominium"]}}', _search_tab: "sale", _search_mode: "advanced" },
      { searchTab: "sale", searchMode: "advanced", statuses: ["ACTIVE", "PENDING"], priceMin: 1234567, bedsMin: 2,
        neighborhoods: ["brooklyn heights", "Dumbo"], checkboxGroups: { ownershipType: { CommonInterest: ["Condominium"] } } },
    )).toEqual([]);
  });

  it("names each criterion that differs, with both sides", () => {
    expect(reconcile(
      { listing_type: "rental", status: ["CLOSED"], max_price: 4000, property_type: ["Condominium"], _search_tab: "rent" },
      { searchTab: "rent", statuses: ["ACTIVE"], priceMax: 4000 },
    ).sort()).toEqual(["Ownership: saved Condominium, form now none", "Status: saved CLOSED, form now ACTIVE"]);
  });

  it("ignores the view-state keys an older record never carried", () => {
    expect(reconcile({ listing_type: "sale", status: ["ACTIVE"] }, { searchTab: "sale", searchMode: "basic", statuses: ["ACTIVE"] })).toEqual([]);
  });

  it("carries min / max boxes by live field (monthlies cap) and reports them when the form loses them", () => {
    expect(savedSrc).toMatch(/field_ranges: c\.fieldRanges && Object\.keys\(c\.fieldRanges\)\.length \? JSON\.stringify\(c\.fieldRanges\) : undefined/);
    expect(savedSrc).toMatch(/\[data-field="' \+ field \+ '"\]\[data-range="' \+ bound \+ '"\]/);
    expect(reconcile(
      { listing_type: "sale", status: ["ACTIVE"], field_ranges: '{"TotalMonthly":{"max":"2000"}}' },
      { searchTab: "sale", statuses: ["ACTIVE"], fieldRanges: { TotalMonthly: { max: "2000" } } },
    )).toEqual([]);
    expect(reconcile(
      { listing_type: "sale", status: ["ACTIVE"], field_ranges: '{"TotalMonthly":{"max":"2000"}}' },
      { searchTab: "sale", statuses: ["ACTIVE"] },
    )).toEqual(["Ranges: saved TotalMonthly max 2000, form now none"]);
  });

  it("reports a financing minimum or open-house range the form no longer displays", () => {
    expect(reconcile(
      { listing_type: "sale", status: ["ACTIVE"], financing_min: 80, open_house_from: "2026-11-01", open_house_to: "2026-11-02" },
      { searchTab: "sale", statuses: ["ACTIVE"] },
    ).sort()).toEqual(["Min financing %: saved 80, form now none", "Open house from: saved 2026-11-01, form now none", "Open house to: saved 2026-11-02, form now none"]);
  });
});
