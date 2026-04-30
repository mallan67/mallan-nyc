import { buildProspects, summarizeAggregator, type AcrisOutputRow, type AggregatorInput } from "@/lib/scanner/aggregator/build-prospects";
import { scoreProspects } from "@/lib/scanner/scoring/scorer";
import type { PlutoProjected } from "@/lib/scanner/pluto-filter";
import type { DosCorpProjected } from "@/lib/scanner/dos-corp-filter";
import type { OffMarketSignalRef } from "@/lib/scanner/scoring/types";

const NOW = new Date("2026-04-30T12:00:00Z");

function makePluto(overrides: Partial<PlutoProjected> = {}): PlutoProjected {
  return {
    BBL: "1015730019",
    BoroCode: "1",
    Block: "01573",
    Lot: "0019",
    Address: "400 EAST 90 STREET",
    ZipCode: "10128",
    OwnerName: "400 EAST 90 OWNER LLC",
    OwnerType: "P",
    LandUse: "04",
    BldgClass: "R4",
    UnitsRes: "20",
    UnitsTotal: "20",
    YearBuilt: "1985",
    YearAlter1: "",
    YearAlter2: "",
    AssessLand: "500000",
    AssessTot: "2500000",
    ExemptLand: "0",
    ExemptTot: "0",
    BuiltFAR: "4.5",
    ResidFAR: "5.0",
    CommFAR: "0.0",
    Latitude: "40.7790",
    Longitude: "-73.9489",
    CondoNo: "0",
    HistDist: "",
    Landmark: "",
    LotArea: "5000",
    BldgArea: "30000",
    NumFloors: "12",
    ZoneDist1: "R8B",
    ...overrides,
  };
}

function makeAcris(overrides: Partial<AcrisOutputRow> = {}): AcrisOutputRow {
  return {
    doc_id: "DOC001",
    doc_type: "LP",
    category: "lis_pendens",
    document_date: "03/15/2026",
    recorded_datetime: "2026-03-15T10:30:00.000",
    document_amt: "0",
    bbl: "1015730019",
    street_number: "400",
    street_name: "EAST 90 STREET",
    unit: "12A",
    property_type: "RC",
    party_name: "SMITH JOHN A",
    party_address_1: "400 EAST 90 STREET APT 12A",
    party_address_2: "",
    party_city: "NEW YORK",
    party_state: "NY",
    party_zip: "10128",
    party_country: "US",
    ...overrides,
  };
}

function makeDos(overrides: Partial<DosCorpProjected> = {}): DosCorpProjected {
  return {
    dos_id: "1234567",
    current_entity_name: "400 EAST 90 OWNER LLC",
    normalized_name: "400 east 90 owner llc",
    normalized_name_stripped: "400 east 90 owner",
    entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
    status: "ACTIVE",
    initial_filing_date: "01/15/2018",
    jurisdiction: "NEW YORK",
    county: "NEW YORK",
    process_name: "JOHN A SMITH",
    process_address_1: "400 EAST 90 STREET",
    process_address_2: "APT 12A",
    process_city: "NEW YORK",
    process_state: "NY",
    process_zip: "10128",
    ...overrides,
  };
}

function makeOff(overrides: Partial<OffMarketSignalRef> = {}): OffMarketSignalRef {
  return {
    mls_id: "RLS-001",
    listing_id: "RLS-001",
    listing_status: "Expired",
    off_market_since: "2026-01-15T00:00:00.000Z",
    cool_through_date: "2026-02-14T00:00:00.000Z",
    past_cooling_off: true,
    was_mallan_listing: false,
    list_price: "2500000",
    days_off_market: 105,
    ...overrides,
  };
}

describe("buildProspects — basic shape", () => {
  test("produces one prospect per PLUTO row", () => {
    const input: AggregatorInput = {
      pluto: [
        makePluto({ BBL: "A" }),
        makePluto({ BBL: "B" }),
        makePluto({ BBL: "C" }),
      ],
      acris: [],
      dosCorp: [],
    };
    const out = buildProspects(input);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.bbl)).toEqual(["A", "B", "C"]);
  });

  test("PLUTO context fields propagate into prospect", () => {
    const input: AggregatorInput = {
      pluto: [makePluto()],
      acris: [],
      dosCorp: [],
    };
    const [p] = buildProspects(input);
    expect(p.pluto.bbl).toBe("1015730019");
    expect(p.pluto.owner_name).toBe("400 EAST 90 OWNER LLC");
    expect(p.pluto.year_built).toBe(1985);
    expect(p.pluto.units_total).toBe(20);
    expect(p.pluto.latitude).toBeCloseTo(40.7790, 3);
    expect(p.pluto.longitude).toBeCloseTo(-73.9489, 3);
    expect(p.pluto.property_address).toContain("400 EAST 90 STREET");
    expect(p.pluto.property_address).toContain("10128");
  });

  test("BBL with no signals → no signal arrays attached", () => {
    const [p] = buildProspects({
      pluto: [makePluto()],
      acris: [],
      dosCorp: [],
    });
    expect(p.acris_signals).toBeUndefined();
    expect(p.off_market_signals).toBeUndefined();
    expect(p.dos_matches).toBeUndefined();
    expect(p.is_dissolved_llc).toBeUndefined();
  });
});

describe("buildProspects — ACRIS join by BBL", () => {
  test("ACRIS row joins to matching PLUTO BBL", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "1015730019" })],
      acris: [makeAcris({ bbl: "1015730019", doc_id: "X" })],
      dosCorp: [],
    });
    expect(p.acris_signals).toHaveLength(1);
    expect(p.acris_signals![0].doc_id).toBe("X");
    expect(p.acris_signals![0].category).toBe("lis_pendens");
  });

  test("multiple ACRIS rows on same BBL all attach", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "B1" })],
      acris: [
        makeAcris({ bbl: "B1", doc_id: "A", category: "lis_pendens" }),
        makeAcris({ bbl: "B1", doc_id: "B", category: "foreclosure" }),
        makeAcris({ bbl: "B1", doc_id: "C", category: "estate" }),
      ],
      dosCorp: [],
    });
    expect(p.acris_signals).toHaveLength(3);
  });

  test("ACRIS row for unknown BBL does not appear on any prospect", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "ALPHA" })],
      acris: [makeAcris({ bbl: "BETA", doc_id: "X" })],
      dosCorp: [],
    });
    expect(p.acris_signals).toBeUndefined();
  });

  test("invalid ACRIS category is skipped", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "A" })],
      acris: [makeAcris({ bbl: "A", category: "deed" })],
      dosCorp: [],
    });
    expect(p.acris_signals).toBeUndefined();
  });
});

describe("buildProspects — DOS Corp join by owner name", () => {
  test("exact normalized name → exact_normalized match", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ OwnerName: "400 East 90 Owner LLC" })],
      acris: [],
      dosCorp: [makeDos({ current_entity_name: "400 EAST 90 OWNER LLC" })],
    });
    expect(p.dos_matches).toHaveLength(1);
    expect(p.dos_matches![0].match_kind).toBe("exact_normalized");
    expect(p.dos_matches![0].dos_id).toBe("1234567");
    expect(p.dos_matches![0].process_name).toBe("JOHN A SMITH");
    expect(p.dos_matches![0].process_address_full).toContain("400 EAST 90");
  });

  test("comma-formatted name still matches via normalization", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ OwnerName: "400 EAST 90 OWNER, LLC" })],
      acris: [],
      dosCorp: [makeDos({
        current_entity_name: "400 EAST 90 OWNER LLC",
        normalized_name: "400 east 90 owner llc",
        normalized_name_stripped: "400 east 90 owner",
      })],
    });
    expect(p.dos_matches).toHaveLength(1);
    expect(p.dos_matches![0].match_kind).toBe("exact_normalized");
  });

  test("LLC suffix variant matches via stripped fallback", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ OwnerName: "ACME 90 LLC" })],
      acris: [],
      dosCorp: [makeDos({
        current_entity_name: "ACME 90 INC",
        normalized_name: "acme 90 inc",
        normalized_name_stripped: "acme 90",
      })],
    });
    expect(p.dos_matches).toHaveLength(1);
    expect(p.dos_matches![0].match_kind).toBe("stripped_match");
  });

  test("no DOS match → no dos_matches attached", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ OwnerName: "INDIVIDUAL OWNER NAME" })],
      acris: [],
      dosCorp: [makeDos({ current_entity_name: "DIFFERENT LLC" })],
    });
    expect(p.dos_matches).toBeUndefined();
  });
});

describe("buildProspects — derived flags", () => {
  test("is_dissolved_llc: any non-active match → true", () => {
    const [p] = buildProspects({
      pluto: [makePluto()],
      acris: [],
      dosCorp: [
        makeDos({ status: "ACTIVE", dos_id: "1" }),
        makeDos({ status: "DISSOLVED", dos_id: "2" }),
      ],
    });
    expect(p.is_dissolved_llc).toBe(true);
  });

  test("is_dissolved_llc: all active → false (undefined as falsy)", () => {
    const [p] = buildProspects({
      pluto: [makePluto()],
      acris: [],
      dosCorp: [makeDos({ status: "ACTIVE" })],
    });
    expect(p.is_dissolved_llc).toBeUndefined();
  });

  test("is_absentee: process address differs from property → true", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ Address: "400 EAST 90 STREET", OwnerName: "ACME LLC" })],
      acris: [],
      dosCorp: [makeDos({
        current_entity_name: "ACME LLC",
        normalized_name: "acme llc",
        normalized_name_stripped: "acme",
        process_address_1: "1 BROADWAY",
        process_address_2: "",
        process_city: "NEW YORK",
        process_state: "NY",
        process_zip: "10004",
      })],
    });
    expect(p.is_absentee).toBe(true);
  });

  test("is_absentee: process address matches property → not absentee", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ Address: "400 EAST 90 STREET", OwnerName: "400 EAST 90 OWNER LLC" })],
      acris: [],
      dosCorp: [makeDos({
        current_entity_name: "400 EAST 90 OWNER LLC",
        process_address_1: "400 EAST 90 STREET",
      })],
    });
    expect(p.is_absentee).toBeUndefined(); // false → undefined in output
  });

  test("is_absentee: no DOS match → undefined (can't determine)", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ OwnerName: "INDIVIDUAL OWNER" })],
      acris: [],
      dosCorp: [],
    });
    expect(p.is_absentee).toBeUndefined();
  });
});

describe("buildProspects — off-market signals", () => {
  test("off-market signal joins by BBL", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "X" })],
      acris: [],
      dosCorp: [],
      offMarket: [{ bbl: "X", signal: makeOff() }],
    });
    expect(p.off_market_signals).toHaveLength(1);
    expect(p.off_market_signals![0].listing_status).toBe("Expired");
  });

  test("relist count attached when caller supplies map", () => {
    const counts = new Map<string, number>([["X", 3]]);
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "X" })],
      acris: [],
      dosCorp: [],
      offMarketRelistCounts: counts,
    });
    expect(p.off_market_relist_count_24mo).toBe(3);
  });

  test("off-market signal for unknown BBL is dropped", () => {
    const [p] = buildProspects({
      pluto: [makePluto({ BBL: "X" })],
      acris: [],
      dosCorp: [],
      offMarket: [{ bbl: "OTHER", signal: makeOff() }],
    });
    expect(p.off_market_signals).toBeUndefined();
  });
});

describe("buildProspects — ownership duration passthrough", () => {
  test("duration map honored", () => {
    const dur = new Map<string, number>([["1015730019", 32]]);
    const [p] = buildProspects({
      pluto: [makePluto()],
      acris: [],
      dosCorp: [],
      ownershipDurationYearsByBbl: dur,
    });
    expect(p.ownership_duration_years).toBe(32);
  });

  test("missing entry → null", () => {
    const [p] = buildProspects({
      pluto: [makePluto()],
      acris: [],
      dosCorp: [],
    });
    expect(p.ownership_duration_years).toBeNull();
  });
});

describe("buildProspects + scorer end-to-end", () => {
  test("Realistic 3-BBL batch — assembled then scored, sorted", () => {
    const input: AggregatorInput = {
      pluto: [
        // BBL A: rich seller-intent signal stack
        makePluto({
          BBL: "1015730019",
          OwnerName: "400 EAST 90 OWNER LLC",
          Address: "400 EAST 90 STREET",
          ZipCode: "10128",
          Latitude: "40.7790", Longitude: "-73.9489",
        }),
        // BBL B: only a foreclosure signal
        makePluto({
          BBL: "1010100007",
          OwnerName: "MIDTOWN OWNER LLC",
          Address: "150 EAST 50 STREET",
          ZipCode: "10022",
          Latitude: "40.7570", Longitude: "-73.9710",
        }),
        // BBL C: minor signal only (long ownership)
        makePluto({
          BBL: "1004500001",
          OwnerName: "SMITH FAMILY",
          Address: "15 GRAMERCY PARK SOUTH",
          ZipCode: "10003",
          Latitude: "40.7370", Longitude: "-73.9870",
        }),
      ],
      acris: [
        // BBL A: lis pendens 45 days ago
        makeAcris({
          bbl: "1015730019",
          doc_id: "LP-2026-001",
          category: "lis_pendens",
          recorded_datetime: new Date(NOW.getTime() - 45 * 86400000).toISOString(),
          party_name: "400 EAST 90 OWNER LLC",
        }),
        // BBL B: foreclosure 30 days ago
        makeAcris({
          bbl: "1010100007",
          doc_id: "FORE-2026-001",
          doc_type: "FORE",
          category: "foreclosure",
          recorded_datetime: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
          party_name: "MIDTOWN OWNER LLC",
        }),
      ],
      dosCorp: [
        // Active LLC for BBL A — non-absentee
        makeDos({
          current_entity_name: "400 EAST 90 OWNER LLC",
          normalized_name: "400 east 90 owner llc",
          normalized_name_stripped: "400 east 90 owner",
          status: "ACTIVE",
          process_address_1: "400 EAST 90 STREET",
          process_address_2: "APT 12A",
        }),
        // Dissolved LLC for BBL B — absentee
        makeDos({
          dos_id: "9876543",
          current_entity_name: "MIDTOWN OWNER LLC",
          normalized_name: "midtown owner llc",
          normalized_name_stripped: "midtown owner",
          status: "DISSOLVED",
          process_address_1: "1 BROADWAY",
          process_address_2: "",
          process_city: "NEW YORK",
          process_state: "NY",
          process_zip: "10004",
        }),
      ],
      offMarket: [
        // Both BBL A and B had recently-expired listings
        { bbl: "1015730019", signal: makeOff({
          off_market_since: new Date(NOW.getTime() - 120 * 86400000).toISOString(),
          past_cooling_off: true,
        }) },
      ],
      ownershipDurationYearsByBbl: new Map([
        ["1015730019", 32],
        ["1004500001", 28],
      ]),
    };

    const prospects = buildProspects(input);
    expect(prospects).toHaveLength(3);

    // Validate join math before scoring
    const a = prospects.find((p) => p.bbl === "1015730019")!;
    expect(a.acris_signals?.length).toBe(1);
    expect(a.off_market_signals?.length).toBe(1);
    expect(a.dos_matches?.length).toBe(1);
    expect(a.is_dissolved_llc).toBeUndefined();
    expect(a.is_absentee).toBeUndefined(); // process matches property
    expect(a.ownership_duration_years).toBe(32);

    const b = prospects.find((p) => p.bbl === "1010100007")!;
    expect(b.acris_signals?.length).toBe(1);
    expect(b.is_dissolved_llc).toBe(true);
    expect(b.is_absentee).toBe(true); // 1 Broadway ≠ 150 East 50

    const c = prospects.find((p) => p.bbl === "1004500001")!;
    expect(c.acris_signals).toBeUndefined();
    expect(c.dos_matches).toBeUndefined();
    expect(c.ownership_duration_years).toBe(28);

    // Now score
    const scored = scoreProspects(prospects, undefined, NOW);
    // C should be filtered (only 28y tenure → 10pt < 25 threshold)
    const bbls = scored.map((s) => s.bbl);
    expect(bbls).toContain("1015730019");
    expect(bbls).toContain("1010100007");
    expect(bbls).not.toContain("1004500001");

    // A should outscore B (3 categories + tenure + cross-source)
    const aScored = scored.find((s) => s.bbl === "1015730019")!;
    const bScored = scored.find((s) => s.bbl === "1010100007")!;
    expect(aScored.score).toBeGreaterThan(bScored.score);
    expect(aScored.confidence).toBe("high");
  });
});

describe("summarizeAggregator", () => {
  test("counts join hits + misses", () => {
    const input: AggregatorInput = {
      pluto: [
        makePluto({ BBL: "A", OwnerName: "ACME LLC" }),
        makePluto({ BBL: "B", OwnerName: "BRAVO LLC" }),
        makePluto({ BBL: "C", OwnerName: "" }), // no name
      ],
      acris: [
        makeAcris({ bbl: "A" }),
        makeAcris({ bbl: "X" }), // unmatched
      ],
      dosCorp: [
        makeDos({ current_entity_name: "ACME LLC", normalized_name: "acme llc" }),
        makeDos({ current_entity_name: "ZULU INC", normalized_name: "zulu inc" }), // unmatched
      ],
    };
    const out = buildProspects(input);
    const stats = summarizeAggregator(input, out);
    expect(stats.pluto_in).toBe(3);
    expect(stats.prospects_built).toBe(3);
    expect(stats.prospects_with_acris).toBe(1);
    expect(stats.prospects_with_dos_match).toBe(1);
    expect(stats.acris_unmatched_bbl).toBe(1);
    expect(stats.dos_unmatched).toBe(1);
  });
});
