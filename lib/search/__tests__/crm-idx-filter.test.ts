/**
 * CRM Agent Search mapping layer — contract tests against the LIVE Cotality contract
 * committed in data/cotality-enums.live.json (`npm run cotality:pull`, live 2026-10-23).
 *
 * Every criterion is SUPPORTED (a Cotality clause), LOCAL (applied by Mallan after retrieval)
 * or refused visibly. These tests replace the former "DEAD:" tests, which pinned criteria
 * being silently dropped.
 */
import {
  applyLocalCriteria,
  buildCrmIdxQuery,
  carriedOn,
  escapeOData,
  SEARCH_CONTRACT,
} from "@/lib/search/crm-idx-filter";
import { inventoryFromPairs } from "@/lib/idx/geography";

const q = (params: Record<string, string>) => buildCrmIdxQuery(new URLSearchParams(params));
const withBoxes = (type: string, boxes: Record<string, string[]>) => q({ type, checkboxFilters: JSON.stringify(boxes) });
const refusedFields = (r: ReturnType<typeof q>) => r.refused.map((x) => x.field);
const customFieldsRecord = (fields: Record<string, string>) => ({ CustomProperty: [{ CustomFields: JSON.stringify(fields) }] });

describe("live contract facts the mapping relies on", () => {
  it("sale and rental are separate Cotality PropertyTypes, and this licence serves no commercial type", () => {
    expect(SEARCH_CONTRACT.types).toEqual({ sale: "Residential", rental: "ResidentialLease" });
    const counts = (SEARCH_CONTRACT as unknown as { type_counts: Record<string, number> }).type_counts;
    expect(counts.Residential).toBeGreaterThan(0);
    expect(counts.ResidentialLease).toBeGreaterThan(0);
    expect(counts.CommercialSale).toBe(0);
    expect(counts.CommercialLease).toBe(0);
  });

  it("rent and sale price are both ListPrice; LeaseAmount carries no data", () => {
    expect(carriedOn("ListPrice", "sale")).toBe(true);
    expect(carriedOn("ListPrice", "rental")).toBe(true);
    expect(carriedOn("LeaseAmount", "rental")).toBe(false);
  });

  it("geography, MlsStatus and provider DOM are suppressed", () => {
    for (const f of ["Latitude", "Longitude", "MlsStatus", "DaysOnMarket", "SourceSystemKey"]) {
      expect(SEARCH_CONTRACT.property[f].filter).toBe("SUPPRESSED");
    }
  });
});

describe("listing type — two mappings", () => {
  it("sale searches Residential only", () => {
    expect(q({ type: "sale" }).filter).toContain("PropertyType eq 'Residential'");
  });

  it("rental searches ResidentialLease only", () => {
    expect(q({ type: "rental" }).filter).toContain("PropertyType eq 'ResidentialLease'");
    expect(q({ type: "rent" }).filter).toContain("PropertyType eq 'ResidentialLease'");
  });

  it("building search spans both", () => {
    expect(q({}).filter).toContain("(PropertyType eq 'Residential' or PropertyType eq 'ResidentialLease')");
  });

  it("a rental-only field is refused on a sale search and executed on a rental search", () => {
    const rentalOnly = Object.keys(SEARCH_CONTRACT.property).find(
      (f) => SEARCH_CONTRACT.property[f].filter === "SUPPORTED" && SEARCH_CONTRACT.property[f].kind === "number"
        && carriedOn(f, "rental") && !carriedOn(f, "sale"),
    );
    expect(rentalOnly).toBeDefined(); // SecurityDeposit, live 2026-10-23
    const sale = q({ type: "sale", fieldRanges: JSON.stringify({ [rentalOnly!]: { min: "1000" } }) });
    expect(refusedFields(sale)).toContain(rentalOnly);
    const rental = q({ type: "rental", fieldRanges: JSON.stringify({ [rentalOnly!]: { min: "1000" } }) });
    expect(rental.refused).toEqual([]);
    expect(rental.filter).toContain(`${rentalOnly} ge 1000`);
  });
});

describe("status — StandardStatus only", () => {
  it("defaults to on market and in contract: Active, ComingSoon, ActiveUnderContract, Pending", () => {
    expect(q({ type: "sale" }).filter).toContain("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Pending')");
  });

  it("normalizes display spacing to live values", () => {
    expect(q({ type: "rental", status: "Coming Soon,Active Under Contract" }).filter)
      .toContain("(StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  });

  it("lets agents search Closed / Expired / Withdrawn (CMA comps and market history)", () => {
    const r = q({ type: "sale", status: "Closed,Expired,Withdrawn,Canceled" });
    expect(r.refused).toEqual([]);
    expect(r.filter).toContain("StandardStatus eq 'Closed'");
    expect(r.filter).toContain("StandardStatus eq 'Expired'");
  });

  it("refuses values that are not live StandardStatus values (former MlsStatus sub-statuses)", () => {
    const r = q({ type: "sale", status: "Active,OFFEROUT" });
    expect(r.refused[0]).toMatchObject({ criterion: "status", field: "StandardStatus" });
    expect(r.refused[0].reason).toContain("OFFEROUT");
    expect(r.filter).not.toContain("OFFEROUT");
  });

  it("status=* counts every status", () => {
    expect(q({ status: "*" }).filter).not.toContain("StandardStatus");
  });

  it("maps old sub-statuses to live fields: back on market, sold / rented through Mallan, financing", () => {
    const office = SEARCH_CONTRACT.mallan_office!.ListOfficeMlsId;
    expect(q({ type: "sale", status: "BackOnMarket" }).filter)
      .toContain("(StandardStatus eq 'Active' and BackOnMarketTimestamp ne null)");
    const thru = q({ type: "rental", status: "RentedThruUs" });
    expect(thru.refused).toEqual([]);
    expect(thru.filter).toContain(`(StandardStatus eq 'Closed' and (BuyerOfficeMlsId eq '${office}' or CoBuyerOfficeMlsId eq '${office}'))`);
    expect(q({ type: "sale", status: "NoFinancing" }).filter).toContain("(StandardStatus eq 'Closed' and BuyerFinancing has 'Cash')");
    // Active OR back-on-market is all Active; the derived clause is OR-ed, never AND-ed onto every status.
    expect(q({ type: "sale", status: "Active,Pending,BackOnMarket" }).filter)
      .toContain("(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or (StandardStatus eq 'Active' and BackOnMarketTimestamp ne null))");
  });

  it("refuses a sub-status whose live field no record of that side carries", () => {
    const r = q({ type: "rental", status: "NoFinancing" }); // BuyerFinancing: sale records only, live 2026-10-24
    expect(r.refused[0]).toMatchObject({ criterion: "status", field: "BuyerFinancing" });
  });
});

describe("presence and recency values", () => {
  it("'isnull' matches records without the field; 'within:N' matches the last N days", () => {
    const none = withBoxes("sale", { BackOnMarketTimestamp: ["isnull"] });
    expect(none.filter).toContain("BackOnMarketTimestamp eq null");
    const recent = withBoxes("sale", { BackOnMarketTimestamp: ["within:30"] });
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    expect(recent.refused).toEqual([]);
    expect(recent.filter).toContain(`BackOnMarketTimestamp ge ${since}T00:00:00Z`);
  });

  it("the back-on-market form: 'BOM only' AND 'within 7 days' (radio + recency select)", () => {
    const r = q({ type: "sale", checkboxFilters: JSON.stringify({ BackOnMarketTimestamp: ["notnull"] }),
      fieldRanges: JSON.stringify({ BackOnMarketTimestamp: { min: "within:7" } }) });
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    expect(r.refused).toEqual([]);
    expect(r.filter).toContain("BackOnMarketTimestamp ne null");
    expect(r.filter).toContain(`BackOnMarketTimestamp ge ${since}T00:00:00Z`);
  });
});

describe("ranges and dates", () => {
  it("maps the basic-form ranges to live fields", () => {
    const f = q({
      type: "sale", minPrice: "1000000", maxPrice: "2000000", minBeds: "2", maxBeds: "4",
      minBaths: "1.5", maxBaths: "3", minRooms: "3", maxRooms: "6", minSqft: "800", maxSqft: "2000",
      minYear: "1900", maxYear: "1946", minFloors: "6", minUnits: "10",
    }).filter;
    for (const clause of [
      "ListPrice ge 1000000", "ListPrice le 2000000", "BedroomsTotal ge 2", "BedroomsTotal le 4",
      "BathroomsTotalInteger ge 1.5", "BathroomsTotalInteger le 3", "RoomsTotal ge 3", "RoomsTotal le 6",
      "LivingArea ge 800", "LivingArea le 2000", "YearBuilt ge 1900", "YearBuilt le 1946",
      "StoriesTotal ge 6", "NumberOfUnitsTotal ge 10",
    ]) expect(f).toContain(clause);
  });

  it("monthly rent is ListPrice on a rental search", () => {
    expect(q({ type: "rental", minPrice: "3000", maxPrice: "5000" }).filter).toContain("ListPrice ge 3000 and ListPrice le 5000");
  });

  it("contract signed / lease signed is PurchaseContractDate, not the listing agreement date", () => {
    const f = q({ type: "sale", contractDateFrom: "2026-01-01", contractDateTo: "2026-03-31" }).filter;
    expect(f).toContain("PurchaseContractDate ge 2026-01-01");
    expect(f).toContain("PurchaseContractDate le 2026-03-31");
    expect(f).not.toContain("ListingContractDate");
  });

  it("sold / rented date is CloseDate", () => {
    expect(q({ type: "rental", closeDateFrom: "2026-01-01", closeDateTo: "2026-02-01" }).filter)
      .toContain("CloseDate ge 2026-01-01 and CloseDate le 2026-02-01");
  });

  it("rental availability is AvailabilityDate", () => {
    expect(q({ type: "rental", availableFrom: "2026-11-01" }).filter).toContain("AvailabilityDate ge 2026-11-01");
  });

  it("Listed → ListingContractDate, Updated → ModificationTimestamp (whole days)", () => {
    expect(q({ dateFrom: "2026-04-01", dateTo: "2026-04-30" }).filter)
      .toContain("ListingContractDate ge 2026-04-01 and ListingContractDate le 2026-04-30");
    expect(q({ dateType: "Updated", dateFrom: "2026-04-01", dateTo: "2026-04-30" }).filter)
      .toContain("ModificationTimestamp ge 2026-04-01T00:00:00Z and ModificationTimestamp le 2026-04-30T23:59:59Z");
  });

  it("ListedAndUpdated matches either window", () => {
    expect(q({ dateType: "ListedAndUpdated", dateFrom: "2026-04-01", dateTo: "2026-04-30" }).filter).toContain(
      "((ListingContractDate ge 2026-04-01 and ListingContractDate le 2026-04-30) or (ModificationTimestamp ge 2026-04-01T00:00:00Z and ModificationTimestamp le 2026-04-30T23:59:59Z))",
    );
  });

  it("refuses a malformed date instead of sending it", () => {
    const r = q({ closeDateFrom: "April 1" });
    expect(refusedFields(r)).toContain("CloseDate");
  });
});

describe("location, identity and text", () => {
  it("escapes OData strings and parses addresses", () => {
    expect(escapeOData("Broker's Open")).toBe("Broker''s Open");
    // A full address names one building: exact house number (plus Queens "400-xx"), never a prefix.
    const dir = q({ address: "400 East 90th Street" }).filter;
    expect(dir).toContain("(StreetNumber eq '400' or startswith(StreetNumber,'400-'))");
    expect(dir).not.toContain("startswith(StreetNumber,'400')");
    expect(dir).toContain("StreetDirPrefix eq 'E'");
    expect(dir).toContain("contains(StreetName,'90')");
    const queens = q({ address: "63-34 Fresh Pond Road" }).filter;
    expect(queens).toContain("(StreetNumber eq '63-34' or startswith(StreetNumber,'63-34-'))");
    expect(queens).toContain("contains(StreetName,'FRESH POND')");
    expect(q({ address: "333 e 46th st" }).filter).toContain("(StreetNumber eq '333' or startswith(StreetNumber,'333-')) and StreetDirPrefix eq 'E'");
    const text = q({ address: "Park Avenue" }).filter;
    expect(text).toContain("contains(StreetName,'PARK')");
    expect(text).toContain("contains(BuildingName,'PARK AVENUE')");
    const num = q({ address: "1234" }).filter;
    expect(num).toContain("(startswith(StreetNumber,'1234') or contains(BuildingName,'1234'))");
  });

  it("neighborhood and borough resolve to the exact live Cotality values through the geography inventory", () => {
    const geo = inventoryFromPairs([
      { borough: "Manhattan", name: "Upper East Side", sale: 5 }, { borough: "Manhattan", name: "UPPER EAST SIDE", sale: 1 },
      { borough: "Brooklyn", name: "Bedford-Stuyvesant", sale: 3 }, { borough: "Brooklyn", name: "Bedford - Stuyvesant" },
      { borough: "StatenIsland", name: "St. George" },
    ]);
    // Typed shorthand, any case or punctuation → every live spelling; borough display name → live value
    const r = buildCrmIdxQuery(new URLSearchParams({ neighborhood: "ues, bed-stuy", borough: "Staten Island, bk", zip: "10128" }), geo);
    expect(r.refused).toEqual([]);
    // Picked places combine: the neighborhoods OR the boroughs, all exact live strings
    expect(r.filter).toContain("((SubdivisionName eq 'Upper East Side' or SubdivisionName eq 'UPPER EAST SIDE' or SubdivisionName eq 'Bedford-Stuyvesant' or SubdivisionName eq 'Bedford - Stuyvesant') or (CityRegion eq 'StatenIsland' or CityRegion eq 'Brooklyn'))");
    expect(r.filter).toContain("PostalCode eq '10128'");
    // Names and boroughs Cotality does not carry are refused, never guessed
    const bad = buildCrmIdxQuery(new URLSearchParams({ neighborhood: "Atlantis", borough: "Jersey" }), geo);
    expect(bad.refused.map((x) => x.field)).toEqual(["SubdivisionName", "CityRegion"]);
  });

  it("without the live inventory (no network) typed location values are sent as given", () => {
    const f = q({ neighborhood: "NoSuchNeighborhoodA,NoSuchNeighborhoodB", borough: "Manhattan", zip: "10128" }).filter;
    expect(f).toContain("((SubdivisionName eq 'NoSuchNeighborhoodA' or SubdivisionName eq 'NoSuchNeighborhoodB') or CityRegion eq 'Manhattan')");
    expect(f).toContain("PostalCode eq '10128'");
  });

  it("unit, keyword, building name, office and RLS ids", () => {
    const f = q({ unit: "4a", keyword: "Doorman's", buildingName: "The Dakota", managementCompany: "Mallan", listingId: "RLS1, RLS'2" }).filter;
    expect(f).toContain("UnitNumber eq '4A'");
    expect(f).toContain("contains(PublicRemarks,'Doorman''s')");
    expect(f).toContain("contains(BuildingName,'The Dakota')");
    expect(f).toContain("contains(ListOfficeName,'Mallan')");
    expect(f).toContain("(ListingId eq 'RLS1' or ListingId eq 'RLS''2')");
  });

  it("map-area (Lat/Lng) search is refused — Cotality suppresses coordinates", () => {
    const r = q({ gridFilter: "Latitude ge 40.7" });
    expect(r.refused[0]).toMatchObject({ criterion: "mapArea", field: "Latitude" });
    expect(r.filter).not.toContain("Latitude");
  });
});

describe("picklists — live LookupValues and the operator their type requires", () => {
  it("PropertySubType is single-value: eq, not contains", () => {
    const f = q({ type: "sale", propertySubType: "SingleFamilyResidence,MultiFamily" }).filter;
    expect(f).toContain("(PropertySubType eq 'SingleFamilyResidence' or PropertySubType eq 'MultiFamily')");
    expect(f).not.toContain("contains(PropertySubType");
  });

  it("CommonInterest uses live values; a display label is refused", () => {
    expect(q({ type: "sale", ownership: "StockCooperative" }).filter).toContain("CommonInterest eq 'StockCooperative'");
    expect(refusedFields(q({ type: "sale", ownership: "Co-op" }))).toContain("CommonInterest");
  });

  it("multi-select fields use has with the bare LookupValue", () => {
    const f = withBoxes("rental", { PetsAllowed: ["CatsOk", "DogsOk"] }).filter;
    expect(f).toContain("(PetsAllowed has 'CatsOk' or PetsAllowed has 'DogsOk')");
  });

  it("comma-joined data-values expand to OR-ed live values", () => {
    const f = withBoxes("sale", { View: ["City,Skyline"] }).filter;
    expect(f).toContain("(View has 'City' or View has 'Skyline')");
  });

  it("a value Cotality does not have is refused, never sent (it would be an HTTP 400)", () => {
    const r = withBoxes("rental", { PetsAllowed: ["CatsOnly"] });
    expect(r.refused[0]).toMatchObject({ field: "PetsAllowed" });
    expect(r.filter).not.toContain("CatsOnly");
  });

  it("Yes/No fields: true → eq true; 'any' or both is no constraint", () => {
    expect(withBoxes("sale", { GarageYN: ["true"] }).filter).toContain("GarageYN eq true");
    expect(withBoxes("sale", { LandLeaseYN: ["any"] }).filter).not.toContain("LandLeaseYN");
    expect(withBoxes("sale", { LandLeaseYN: ["true", "false"] }).filter).not.toContain("LandLeaseYN");
  });

  it("'Any' on a picklist means the field has a value", () => {
    expect(withBoxes("sale", { PoolFeatures: ["Any"] }).filter).toContain("PoolFeatures ne null");
  });

  it("operator-prefixed values become comparisons; several are OR-ed", () => {
    expect(withBoxes("sale", { YearBuilt: ["lte:1946"] }).filter).toContain("YearBuilt le 1946");
    expect(withBoxes("sale", { YearBuilt: ["lte:1946", "gte:1947"] }).filter).toContain("(YearBuilt le 1946 or YearBuilt ge 1947)");
  });

  it("'Any' on a picklist excludes the None / BuildingNone values Cotality uses", () => {
    expect(withBoxes("sale", { PoolFeatures: ["Any"] }).filter)
      .toContain("(PoolFeatures ne null and not (PoolFeatures has 'None') and not (PoolFeatures has 'BuildingNone'))");
  });

  it("exclusions (not:) need the field present and are AND-ed after the choices", () => {
    const f = withBoxes("sale", { LaundryFeatures: ["InUnit", "not:BuildingWasherDryerInstallAllowed"] }).filter;
    expect(f).toContain("(LaundryFeatures has 'InUnit' and (LaundryFeatures ne null and not (LaundryFeatures has 'BuildingWasherDryerInstallAllowed')))");
  });

  it("a checkbox group spanning fields is OR-ed, not AND-ed", () => {
    const r = q({ type: "sale", checkboxGroups: JSON.stringify({ buildingStyle: { StructureType: ["HighRise"], ArchitecturalStyle: ["WalkUp"] } }) });
    expect(r.refused).toEqual([]);
    expect(r.filter).toContain("(StructureType has 'HighRise' or ArchitecturalStyle has 'WalkUp')");
  });
});

describe("derived criteria (documented LOCAL semantics)", () => {
  it("price decreased: Cotality narrows to PreviousListPrice, Mallan compares the prices", () => {
    const r = withBoxes("sale", { PriceChangeDirection: ["decrease"] });
    expect(r.filter).toContain("PreviousListPrice ne null");
    const kept = applyLocalCriteria([{ ListPrice: 900, PreviousListPrice: 1000 }, { ListPrice: 1100, PreviousListPrice: 1000 }], r.local);
    expect(kept).toEqual([{ ListPrice: 900, PreviousListPrice: 1000 }]);
  });

  it("days on market, on-market statuses: exact on OnMarketDate, executed by Cotality", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ DOM: { min: "90" } }) });
    expect(r.refused).toEqual([]);
    expect(r.local).toEqual([]);
    expect(r.filter).toMatch(/OnMarketDate ne null and OnMarketDate le \d{4}-\d{2}-\d{2}/);
    expect(withBoxes("sale", { DOM: ["le:7"] }).filter).toMatch(/OnMarketDate ge \d{4}-\d{2}-\d{2}/);
  });

  it("days on market including Closed: Cotality narrows, Mallan applies the exact count", () => {
    const r = q({ type: "sale", status: "Closed", fieldRanges: JSON.stringify({ DOM: { min: "90" } }) });
    expect(r.local.map((c) => c.criterion)).toEqual(["DOM"]);
    const kept = applyLocalCriteria([
      { StandardStatus: "Closed", OnMarketDate: "2026-01-01", CloseDate: "2026-06-01" },
      { StandardStatus: "Closed", OnMarketDate: "2026-01-01", CloseDate: "2026-01-20" },
    ], r.local);
    expect(kept).toHaveLength(1);
  });

  it("default statuses include live 'Pending' (in contract)", () => {
    expect(q({ type: "sale" }).filter).toContain("StandardStatus eq 'Pending'");
  });

  it("price at least N% below the original asking price", () => {
    const r = withBoxes("sale", { PriceBelowOriginalPct: ["ge:10"] });
    expect(r.filter).toContain("OriginalListPrice ne null");
    expect(applyLocalCriteria([{ ListPrice: 850, OriginalListPrice: 1000 }, { ListPrice: 950, OriginalListPrice: 1000 }], r.local)).toHaveLength(1);
  });

  it("price changed within N days, or never", () => {
    expect(withBoxes("sale", { PriceChangedWithinDays: ["7"] }).filter).toMatch(/PriceChangeTimestamp ge \d{4}-\d{2}-\d{2}T00:00:00Z/);
    expect(withBoxes("sale", { PriceChangedWithinDays: ["none"] }).filter).toContain("PriceChangeTimestamp eq null");
  });

  it("total monthly = AssociationFee + monthly real-estate tax", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ TotalMonthly: { max: "3000" } }) });
    expect(applyLocalCriteria([{ AssociationFee: 2000, TaxAnnualAmount: 12000 }, { AssociationFee: 2500, TaxAnnualAmount: 12000 }], r.local)).toHaveLength(1);
  });

  it("price per square foot", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ PricePerSqft: { max: "1500" } }) });
    expect(r.filter).toContain("LivingArea gt 0");
    expect(applyLocalCriteria([{ ListPrice: 1_200_000, LivingArea: 1000 }, { ListPrice: 2_000_000, LivingArea: 1000 }], r.local)).toHaveLength(1);
  });

  it("top floor and penthouse", () => {
    const top = withBoxes("sale", { TopFloor: ["true"] });
    expect(applyLocalCriteria([{ EntryLevel: 12, StoriesTotal: 12 }, { EntryLevel: 3, StoriesTotal: 12 }], top.local)).toHaveLength(1);
    expect(withBoxes("sale", { Penthouse: ["true"] }).filter).toContain("startswith(UnitNumber,'PH')");
  });

  it("In-House (Company) resolves to Mallan's live office id", () => {
    const own = SEARCH_CONTRACT.mallan_office?.ListOfficeMlsId;
    expect(own).toBeTruthy(); // MAllan Real Estate Inc → 7041, live 2026-10-23
    expect(withBoxes("sale", { ListOfficeMlsId: ["OwnOffice"] }).filter).toContain(`ListOfficeMlsId eq '${own}'`);
  });
});

describe("REBNY CustomFields — applied by Mallan after retrieval", () => {
  it("AttendanceType is a local criterion, not an OData clause", () => {
    const r = withBoxes("sale", { AttendanceType: ["DoormanFullTime"] });
    expect(r.refused).toEqual([]);
    expect(r.filter).not.toContain("AttendanceType");
    expect(r.local.map((c) => c.field)).toEqual(["AttendanceType"]);
    const kept = applyLocalCriteria(
      [customFieldsRecord({ AttendanceType: "DoormanFullTime,ConciergeYes" }), customFieldsRecord({ AttendanceType: "None" })],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  it("'Any' attendance excludes 'None'", () => {
    const r = withBoxes("rental", { AttendanceType: ["Any"] });
    const kept = applyLocalCriteria(
      [customFieldsRecord({ AttendanceType: "LobbyAttendantFullTime" }), customFieldsRecord({ AttendanceType: "None" })],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  it("numeric REBNY keys compare as numbers (MaximumFinancingPercent gt:0)", () => {
    const r = withBoxes("sale", { MaximumFinancingPercent: ["gt:0"] });
    const kept = applyLocalCriteria(
      [customFieldsRecord({ MaximumFinancingPercent: "80.00" }), customFieldsRecord({ MaximumFinancingPercent: "0.00" }), {}],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  it("sponsorUnit=true keeps live SponsorUnitYN '1' only", () => {
    const r = q({ type: "sale", sponsorUnit: "true" });
    const kept = applyLocalCriteria(
      [customFieldsRecord({ SponsorUnitYN: "1" }), customFieldsRecord({ SponsorUnitYN: "0" }), {}],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  // Sponsor Unit, New Development (NewConstructionYN) and ownership (CommonInterest) are independent
  // facets. Live 2026-10-26: 2,328 of 14,051 on-market sales are sponsor units — 1,010 in new
  // construction, 1,305 in older buildings (452 built 1900–1959, 214 co-ops with unsold shares).
  describe("sponsor / new development / ownership — independent, combinable facets", () => {
    const sponsorNew = { CommonInterest: "Condominium", NewConstructionYN: true, ...customFieldsRecord({ SponsorUnitYN: "1" }) };
    const sponsorOldCoop = { CommonInterest: "StockCooperative", NewConstructionYN: false, YearBuilt: 1959, ...customFieldsRecord({ SponsorUnitYN: "1" }) };
    const resaleCondo = { CommonInterest: "Condominium", NewConstructionYN: false, ...customFieldsRecord({ SponsorUnitYN: "0" }) };
    const newNotSponsor = { CommonInterest: "Condominium", NewConstructionYN: true, ...customFieldsRecord({ SponsorUnitYN: "0" }) };

    it("AND: Condo + New Development + Sponsor Unit — Cotality executes the first two, Mallan the sponsor flag", () => {
      const r = q({ type: "sale", ownership: "Condominium", checkboxFilters: JSON.stringify({ NewConstructionYN: ["true"], SponsorUnitYN: ["true"] }) });
      expect(r.refused).toEqual([]);
      expect(r.filter).toContain("CommonInterest eq 'Condominium'");
      expect(r.filter).toContain("NewConstructionYN eq true");
      expect(r.filter).not.toContain("SponsorUnitYN");
      expect(r.local.map((c) => [c.field, c.source])).toEqual([["SponsorUnitYN", "customFields"]]);
      expect(applyLocalCriteria([sponsorNew, newNotSponsor], r.local)).toEqual([sponsorNew]);
    });

    it("Sponsor Unit alone never depends on new construction: an 1959 co-op sponsor unit matches", () => {
      const r = withBoxes("sale", { SponsorUnitYN: ["true"] });
      expect(r.filter).not.toContain("NewConstructionYN");
      expect(applyLocalCriteria([sponsorNew, sponsorOldCoop, resaleCondo], r.local)).toEqual([sponsorNew, sponsorOldCoop]);
    });

    it("Resale + New Development both ticked (match all) is no constraint on NewConstructionYN", () => {
      const r = withBoxes("sale", { NewConstructionYN: ["false", "true"], SponsorUnitYN: ["true"] });
      expect(r.filter).not.toContain("NewConstructionYN");
      expect(r.local).toHaveLength(1);
    });

    it("OR (match any): New Development OR Sponsor Unit is one group whose members the route can execute exactly", () => {
      const r = q({ type: "sale", ownership: "Condominium", checkboxGroups: JSON.stringify({ buildingStatus: { NewConstructionYN: ["true"], SponsorUnitYN: ["true"] } }) });
      expect(r.refused).toEqual([]);
      expect(r.filter).toContain("CommonInterest eq 'Condominium'");
      expect(r.filter).not.toContain("NewConstructionYN");
      expect(r.select).toContain("NewConstructionYN");
      expect(r.local).toHaveLength(1);
      const g = r.local[0];
      expect(g.members?.map((m) => [m.field, m.source, m.execution, m.clause])).toEqual([
        ["NewConstructionYN", "property", "cotality", "NewConstructionYN eq true"],
        ["SponsorUnitYN", "customFields", "local", ""],
      ]);
      // The same listing qualifies under both facets; nothing forces it into one category.
      expect(applyLocalCriteria([sponsorNew, sponsorOldCoop, newNotSponsor, resaleCondo], r.local)).toEqual([sponsorNew, sponsorOldCoop, newNotSponsor]);
      expect(g.members![0].test(true)).toBe(true);
      expect(g.members![1].test("1")).toBe(true);
      expect(g.members![1].test("0")).toBe(false);
    });

    it("the search's live StandardStatus values are exposed for the CustomProperty slice", () => {
      expect(q({ type: "sale" }).statuses).toEqual(["Active", "ComingSoon", "ActiveUnderContract", "Pending"]);
      expect(q({ type: "sale", status: "Sold,Active" }).statuses).toEqual(["Closed", "Active"]);
      expect(q({ type: "sale", status: "*" }).statuses).toEqual([]);
    });
  });

  it("'does not allow' on a REBNY list key keeps only buildings known not to allow it", () => {
    const r = withBoxes("sale", { BuildingRules: ["not:PiedATerreAllowed"] });
    const kept = applyLocalCriteria(
      [customFieldsRecord({ BuildingRules: "CorporateOwnerAllowed" }), customFieldsRecord({ BuildingRules: "PiedATerreAllowed" }), customFieldsRecord({})],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  it("text contains on a REBNY string key (UnitLine)", () => {
    const r = q({ type: "sale", fieldText: JSON.stringify({ UnitLine: "b" }) });
    expect(r.refused).toEqual([]);
    expect(applyLocalCriteria([customFieldsRecord({ UnitLine: "B-Line" }), customFieldsRecord({ UnitLine: "A" })], r.local)).toHaveLength(1);
  });

  it("financing min/max ranges on a REBNY key are AND-ed", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ MaximumFinancingPercent: { min: "50", max: "80" } }) });
    const kept = applyLocalCriteria(
      [customFieldsRecord({ MaximumFinancingPercent: "75.00" }), customFieldsRecord({ MaximumFinancingPercent: "90.00" })],
      r.local,
    );
    expect(kept).toHaveLength(1);
  });

  it("a REBNY key no rental record carries is refused on a rental search", () => {
    const saleOnlyKey = Object.keys(SEARCH_CONTRACT.custom_fields.keys).find(
      (k) => (SEARCH_CONTRACT.custom_fields.keys[k].sale || 0) > 0 && !(SEARCH_CONTRACT.custom_fields.keys[k].rental || 0),
    );
    expect(saleOnlyKey).toBeDefined();
    expect(refusedFields(withBoxes("rental", { [saleOnlyKey!]: ["Any"] }))).toContain(saleOnlyKey);
  });
});

describe("refused visibly — never dropped", () => {
  it("suppressed fields", () => {
    expect(refusedFields(withBoxes("sale", { MlsStatus: ["Active"] }))).toContain("MlsStatus");
    expect(refusedFields(withBoxes("sale", { PropertyCondition: ["Excellent"] }))).toContain("PropertyCondition");
  });

  it("names that are not Cotality fields", () => {
    const r = withBoxes("sale", { CRM: ["AdvertisingAllowed"], BuildingPetsAllowed: ["BuildingYes"] });
    expect(refusedFields(r)).toEqual(expect.arrayContaining(["CRM", "BuildingPetsAllowed"]));
    expect(r.filter).not.toMatch(/CRM|BuildingPetsAllowed/);
  });

  it("fields no record carries (BusinessType is empty on every live record)", () => {
    expect(refusedFields(withBoxes("sale", { BusinessType: ["Restaurant"] }))).toContain("BusinessType");
  });

  it("invalid JSON in checkboxFilters", () => {
    expect(q({ checkboxFilters: "{not json" }).refused[0]).toMatchObject({ criterion: "checkboxFilters" });
  });
});

describe("Fair Housing", () => {
  it("refuses a Diplomats criterion in any field, including the REBNY BuildingRules key", () => {
    for (const boxes of [{ CRM: ["DiplomatsAllowed"] }, { BuildingRules: ["DiplomatsAllowed"] }]) {
      const r = withBoxes("sale", boxes);
      expect(r.filter).not.toMatch(/Diplomat/i);
      expect(r.local).toEqual([]);
      expect(r.refused.length).toBeGreaterThan(0);
    }
  });
});

describe("linked resources — open houses, rooms, agents, offices, CustomProperty columns", () => {
  it("AND-s criteria on one resource into one join, narrowed to the side, keyed to ListingKey", () => {
    const r = q({
      type: "sale",
      checkboxFilters: JSON.stringify({ "OpenHouse/OpenHouseType": ["Public"] }),
      fieldRanges: JSON.stringify({ "OpenHouse/OpenHouseDate": { min: "2026-10-24", max: "2026-10-26" } }),
    });
    expect(r.refused).toEqual([]);
    expect(r.joins).toHaveLength(1);
    expect(r.joins[0]).toMatchObject({ resource: "OpenHouse", key: "ListingKey", propertyFields: ["ListingKey"] });
    expect(r.joins[0].filter).toBe("PropertyType eq 'Residential' and (StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Pending') and OpenHouseType eq 'Public' and OpenHouseDate ge 2026-10-24 and OpenHouseDate le 2026-10-26");
    expect(r.filter).not.toContain("OpenHouse");
  });

  it("'next:N' is the coming N days (open houses)", () => {
    const r = q({ type: "rental", fieldRanges: JSON.stringify({ "OpenHouse/OpenHouseDate": { max: "next:7" } }) });
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(r.joins[0].filter).toContain(`OpenHouseDate le ${until}`);
  });

  it("an agent criterion matches the listing agent or any co-listing agent; an office one any listing office", () => {
    const agent = q({ type: "sale", fieldText: JSON.stringify({ "Member/MemberLastName": "Allan" }) });
    expect(agent.joins[0]).toMatchObject({ resource: "Member", key: "MemberMlsId", filter: "contains(MemberLastName,'Allan')" });
    expect(agent.joins[0].propertyFields).toEqual(["ListAgentMlsId", "CoListAgentMlsId", "CoListAgent2MlsId", "CoListAgent3MlsId"]);
    const office = q({ type: "rental", checkboxFilters: JSON.stringify({ "Office/IDXOfficeParticipationYN": ["true"] }) });
    expect(office.joins[0]).toMatchObject({ resource: "Office", key: "OfficeMlsId", filter: "IDXOfficeParticipationYN eq true" });
  });

  it("a CustomProperty column (floor plans) is searched on the CustomProperty resource", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ "CustomProperty/SourceFloorPlansCount": { min: "1" } }) });
    expect(r.refused).toEqual([]);
    expect(r.joins[0].filter).toBe("PropertyType eq 'Residential' and (StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Pending') and SourceFloorPlansCount ge 1");
    // A derived sub-status narrows by its base status; an agent join (Member) is never status-narrowed.
    expect(q({ type: "sale", status: "SoldThruUs", fieldRanges: JSON.stringify({ "CustomProperty/SourceFloorPlansCount": { min: "1" } }) }).joins[0].filter)
      .toContain("StandardStatus eq 'Closed'");
    expect(q({ type: "sale", fieldText: JSON.stringify({ "Member/MemberLastName": "Allan" }) }).joins[0].filter).not.toContain("StandardStatus");
  });

  it("uses live LookupValues and refuses what the resource does not have", () => {
    expect(refusedFields(q({ type: "sale", checkboxFilters: JSON.stringify({ "OpenHouse/OpenHouseType": ["NotAType"] }) }))).toContain("OpenHouseType");
    expect(refusedFields(q({ type: "sale", checkboxFilters: JSON.stringify({ "OpenHouse/NoSuchField": ["x"] }) }))).toContain("NoSuchField");
    expect(refusedFields(q({ type: "sale", checkboxFilters: JSON.stringify({ "Teams/TeamName": ["x"] }) }))).toContain("TeamName");
  });
});

describe("CustomProperty columns — exact fallback when the key set is too large", () => {
  it("carries the same criteria as a local test on the expanded CustomProperty columns", () => {
    const r = q({ type: "sale", fieldRanges: JSON.stringify({ "CustomProperty/SourceFloorPlansCount": { min: "1" } }) });
    const fb = r.joins[0].fallback!;
    expect(fb.expand).toEqual(["SourceFloorPlansCount"]);
    expect(fb.criterion.test({ CustomProperty: [{ SourceFloorPlansCount: 2 }] })).toBe(true);
    expect(fb.criterion.test({ CustomProperty: [{ SourceFloorPlansCount: 0 }] })).toBe(false);
    expect(fb.criterion.test({ CustomProperty: [] })).toBe(false);
    // Open houses and agents have no per-listing column to test: no fallback.
    expect(q({ type: "sale", fieldRanges: JSON.stringify({ "OpenHouse/OpenHouseDate": { min: "2026-10-24" } }) }).joins[0].fallback).toBeUndefined();
  });
});

describe("Yes/No exclusions keep records that leave the field empty", () => {
  it("'Exclude land-lease buildings' (not:true) is LandLeaseYN ne true, not eq false", () => {
    const r = withBoxes("sale", { LandLeaseYN: ["not:true"] });
    expect(r.refused).toEqual([]);
    expect(r.filter).toContain("LandLeaseYN ne true");
    expect(r.filter).not.toContain("LandLeaseYN eq false");
  });
});
