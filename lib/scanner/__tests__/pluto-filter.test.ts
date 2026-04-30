import {
  isManhattanCorridorRow,
  isResidentialOrMixed,
  isProspectableOwnerType,
  isScannableProspect,
  projectPlutoRow,
  processRow,
  emptyStats,
  PLUTO_PROJECTION_COLUMNS,
} from "@/lib/scanner/pluto-filter";

const MALLAN_OFFICE_LAT = 40.779;
const MALLAN_OFFICE_LNG = -73.9489;
const HARLEM_LAT = 40.8104;
const HARLEM_LNG = -73.9494;
const BROOKLYN_LAT = 40.6961;
const BROOKLYN_LNG = -73.9961;

function makeRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    BBL: "1015730019",
    BoroCode: "1",
    Block: "01573",
    Lot: "0019",
    Address: "400 EAST 90 STREET",
    ZipCode: "10128",
    OwnerName: "SAMPLE OWNER LLC",
    OwnerType: "P",
    LandUse: "04", // Elevator residential
    BldgClass: "R4",
    UnitsRes: "20",
    UnitsTotal: "20",
    YearBuilt: "1985",
    Latitude: String(MALLAN_OFFICE_LAT),
    Longitude: String(MALLAN_OFFICE_LNG),
    ...overrides,
  };
}

describe("isManhattanCorridorRow", () => {
  it("accepts Manhattan corridor row", () => {
    expect(isManhattanCorridorRow(makeRow())).toBe(true);
  });

  it("rejects Brooklyn row even with same coords-like-Manhattan", () => {
    expect(isManhattanCorridorRow(makeRow({ BoroCode: "3" }))).toBe(false);
  });

  it("rejects row outside corridor (Harlem)", () => {
    expect(isManhattanCorridorRow(makeRow({ Latitude: String(HARLEM_LAT), Longitude: String(HARLEM_LNG) }))).toBe(false);
  });

  it("rejects row outside Manhattan (Brooklyn coords + Brooklyn boro)", () => {
    expect(isManhattanCorridorRow(makeRow({
      BoroCode: "3",
      Latitude: String(BROOKLYN_LAT),
      Longitude: String(BROOKLYN_LNG),
    }))).toBe(false);
  });

  it("rejects bad geo", () => {
    expect(isManhattanCorridorRow(makeRow({ Latitude: "", Longitude: "" }))).toBe(false);
    expect(isManhattanCorridorRow(makeRow({ Latitude: "abc", Longitude: "def" }))).toBe(false);
    expect(isManhattanCorridorRow(makeRow({ Latitude: "0", Longitude: "0" }))).toBe(false);
  });
});

describe("isResidentialOrMixed", () => {
  test.each([
    ["01 One-fam", "01", true],
    ["02 Two-fam", "02", true],
    ["03 Walk-up", "03", true],
    ["04 Elevator", "04", true],
    ["05 Mixed Res+Com", "05", true],
    ["06 Commercial", "06", true],
    ["07 Industrial", "07", false],
    ["08 Transp", "08", false],
    ["09 Public", "09", false],
    ["10 Parking", "10", false],
    ["11 Vacant", "11", false],
    ["empty", "", false],
    ["unpadded 4 normalizes to 04", "4", true],
    ["unpadded 7", "7", false],
  ])("%s", (_, lu, expected) => {
    expect(isResidentialOrMixed(makeRow({ LandUse: lu }))).toBe(expected);
  });
});

describe("isProspectableOwnerType", () => {
  test.each([
    ["P private", "P", true],
    ["X mixed", "X", true],
    ["M misc", "M", true],
    ["empty", "", true],
    ["lower-p", "p", true],
    ["C city", "C", false],
    ["O other gov", "O", false],
  ])("%s", (_, ot, expected) => {
    expect(isProspectableOwnerType(makeRow({ OwnerType: ot }))).toBe(expected);
  });
});

describe("isScannableProspect — composite", () => {
  it("requires all 3 conditions", () => {
    expect(isScannableProspect(makeRow())).toBe(true);
    expect(isScannableProspect(makeRow({ BoroCode: "3" }))).toBe(false);
    expect(isScannableProspect(makeRow({ LandUse: "10" }))).toBe(false);
    expect(isScannableProspect(makeRow({ OwnerType: "C" }))).toBe(false);
  });
});

describe("projectPlutoRow", () => {
  it("keeps only the projection columns", () => {
    const projected = projectPlutoRow(makeRow({ ExtraNoise: "should disappear" }));
    expect(Object.keys(projected).sort()).toEqual([...PLUTO_PROJECTION_COLUMNS].sort());
    expect((projected as Record<string, string>).ExtraNoise).toBeUndefined();
  });

  it("trims whitespace", () => {
    const projected = projectPlutoRow(makeRow({ Address: "  400 EAST 90 STREET  " }));
    expect(projected.Address).toBe("400 EAST 90 STREET");
  });

  it("missing columns become empty strings", () => {
    const sparse = { BoroCode: "1", BBL: "1015730019" };
    const projected = projectPlutoRow(sparse);
    expect(projected.Address).toBe("");
    expect(projected.OwnerName).toBe("");
  });
});

describe("processRow — full pipeline + stats", () => {
  it("keeps a corridor-eligible row and increments correct counters", () => {
    const stats = emptyStats("test");
    const r = processRow(makeRow(), stats);
    expect(r.kept).toBe(true);
    expect(r.reason).toBe("kept");
    expect(r.projected).not.toBeNull();
    expect(stats.rows_seen).toBe(1);
    expect(stats.rows_manhattan).toBe(1);
    expect(stats.rows_corridor).toBe(1);
    expect(stats.rows_residential_or_mixed).toBe(1);
    expect(stats.rows_prospectable_owner).toBe(1);
    expect(stats.rows_kept).toBe(1);
  });

  it("drops Brooklyn rows early (no corridor check)", () => {
    const stats = emptyStats();
    const r = processRow(makeRow({ BoroCode: "3" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("outside_manhattan");
    expect(stats.rows_dropped_outside_manhattan).toBe(1);
    expect(stats.rows_corridor).toBe(0);
  });

  it("drops Manhattan-but-Harlem rows at corridor", () => {
    const stats = emptyStats();
    const r = processRow(makeRow({
      Latitude: String(HARLEM_LAT),
      Longitude: String(HARLEM_LNG),
    }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("outside_corridor");
    expect(stats.rows_manhattan).toBe(1);
    expect(stats.rows_dropped_outside_corridor).toBe(1);
  });

  it("drops corridor row with non-residential land use", () => {
    const stats = emptyStats();
    const r = processRow(makeRow({ LandUse: "10" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("non_residential");
    expect(stats.rows_dropped_non_residential).toBe(1);
  });

  it("drops corridor + residential row owned by city", () => {
    const stats = emptyStats();
    const r = processRow(makeRow({ OwnerType: "C", OwnerName: "CITY OF NEW YORK" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("government_owner");
    expect(stats.rows_dropped_government_owner).toBe(1);
  });

  it("drops bad-geo rows separately", () => {
    const stats = emptyStats();
    const r = processRow(makeRow({ Latitude: "", Longitude: "" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("bad_geo");
    expect(stats.rows_dropped_bad_geo).toBe(1);
  });

  it("aggregates land-use and owner-type histograms", () => {
    const stats = emptyStats();
    processRow(makeRow({ LandUse: "04" }), stats);
    processRow(makeRow({ LandUse: "04" }), stats);
    processRow(makeRow({ LandUse: "01" }), stats);
    processRow(makeRow({ LandUse: "10" }), stats);
    expect(stats.by_land_use["04"]).toBe(2);
    expect(stats.by_land_use["01"]).toBe(1);
    expect(stats.by_land_use["10"]).toBe(1);
    expect(stats.by_owner_type["P"]).toBe(4);
  });

  it("realistic mixed-batch — 6 rows in, 2 kept", () => {
    const stats = emptyStats();
    processRow(makeRow(), stats); // KEEP — Mallan office, R4
    processRow(makeRow({ BBL: "1010100007", LandUse: "01", BldgClass: "A1" }), stats); // KEEP — 1-fam
    processRow(makeRow({ BBL: "3001230045", BoroCode: "3" }), stats); // DROP — Brooklyn
    processRow(makeRow({ BBL: "1015730020", LandUse: "08" }), stats); // DROP — transp
    processRow(makeRow({ BBL: "1015730021", OwnerType: "C", OwnerName: "NYC HOUSING AUTH" }), stats); // DROP — gov
    processRow(makeRow({ BBL: "1077000000", Latitude: String(HARLEM_LAT), Longitude: String(HARLEM_LNG) }), stats); // DROP — Harlem
    expect(stats.rows_seen).toBe(6);
    expect(stats.rows_kept).toBe(2);
    expect(stats.rows_dropped_outside_manhattan).toBe(1);
    expect(stats.rows_dropped_outside_corridor).toBe(1);
    expect(stats.rows_dropped_non_residential).toBe(1);
    expect(stats.rows_dropped_government_owner).toBe(1);
  });
});
