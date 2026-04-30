import {
  normalizeEntityName,
  normalizeEntityNameStripped,
  isManhattanCounty,
  isNycCounty,
  hasNycProcessAddress,
  isNycRelevant,
  isRelevantEntityType,
  processRow,
  projectDosCorpRow,
  emptyDosCorpStats,
} from "@/lib/scanner/dos-corp-filter";

describe("normalizeEntityName", () => {
  test.each([
    ["ACME 90 LLC", "acme 90 llc"],
    ["ACME 90, LLC", "acme 90 llc"],
    ["A.C.M.E. 90 L.L.C.", "acme 90 llc"],
    ["ACME 90  L L C", "acme 90 l l c"],
    ["  ACME 90 LLC  ", "acme 90 llc"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeEntityName(input)).toBe(expected);
  });
});

describe("normalizeEntityNameStripped", () => {
  test.each([
    ["ACME 90 LLC", "acme 90"],
    ["ACME 90, LLC", "acme 90"],
    ["ACME 90 INC", "acme 90"],
    ["ACME 90 INC.", "acme 90"],
    ["ACME 90 CORPORATION", "acme 90"],
    ["ACME 90 CORP", "acme 90"],
    ["ACME 90 LTD.", "acme 90"],
    ["JOE'S DELI LP", "joe's deli"],
    ["123 EAST 50TH OWNER LLC", "123 east 50th owner"],
    ["ABC PLLC", "abc"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeEntityNameStripped(input)).toBe(expected);
  });
});

describe("isManhattanCounty / isNycCounty", () => {
  test("NEW YORK county = Manhattan", () => {
    expect(isManhattanCounty({ county: "NEW YORK" })).toBe(true);
    expect(isManhattanCounty({ County: "New York" })).toBe(true);
  });
  test("Other NYC counties not Manhattan but still NYC", () => {
    for (const c of ["KINGS", "QUEENS", "BRONX", "RICHMOND"]) {
      expect(isManhattanCounty({ county: c })).toBe(false);
      expect(isNycCounty({ county: c })).toBe(true);
    }
  });
  test("Upstate not NYC", () => {
    expect(isNycCounty({ county: "ALBANY" })).toBe(false);
    expect(isNycCounty({ county: "WESTCHESTER" })).toBe(false);
  });
});

describe("hasNycProcessAddress", () => {
  test("NY state + 100xx zip → NYC", () => {
    expect(hasNycProcessAddress({ dos_process_state: "NY", dos_process_zip: "10128" })).toBe(true);
    expect(hasNycProcessAddress({ dos_process_state: "NY", dos_process_zip: "10003" })).toBe(true);
    expect(hasNycProcessAddress({ dos_process_state: "NY", dos_process_zip: "11201" })).toBe(true); // Brooklyn
  });
  test("Out-of-state process address rejected even with NYC zip", () => {
    expect(hasNycProcessAddress({ dos_process_state: "NJ", dos_process_zip: "10128" })).toBe(false);
  });
  test("NY state but upstate zip rejected", () => {
    expect(hasNycProcessAddress({ dos_process_state: "NY", dos_process_zip: "12203" })).toBe(false); // Albany
    expect(hasNycProcessAddress({ dos_process_state: "NY", dos_process_zip: "10583" })).toBe(false); // Scarsdale
  });
  test("missing fields", () => {
    expect(hasNycProcessAddress({})).toBe(false);
    expect(hasNycProcessAddress({ dos_process_state: "NY" })).toBe(false);
  });
});

describe("isNycRelevant — composite", () => {
  test("Manhattan county passes", () => {
    expect(isNycRelevant({ county: "NEW YORK" })).toBe(true);
  });
  test("Non-NYC county but NYC process address passes", () => {
    expect(isNycRelevant({
      county: "WESTCHESTER",
      dos_process_state: "NY",
      dos_process_zip: "10128",
    })).toBe(true);
  });
  test("Truly out-of-NYC fails", () => {
    expect(isNycRelevant({
      county: "ALBANY",
      dos_process_state: "NY",
      dos_process_zip: "12203",
    })).toBe(false);
  });
});

describe("isRelevantEntityType", () => {
  test.each([
    ["DOMESTIC LIMITED LIABILITY COMPANY", true],
    ["FOREIGN LIMITED LIABILITY COMPANY", true],
    ["DOMESTIC BUSINESS CORPORATION", true],
    ["FOREIGN BUSINESS CORPORATION", true],
    ["DOMESTIC NOT-FOR-PROFIT CORPORATION", true],
    ["DOMESTIC LIMITED PARTNERSHIP", true],
    ["DOMESTIC LIMITED LIABILITY PARTNERSHIP", true],
    ["LLC", true],
    ["CORP", true],
    ["", true], // blank — let through, agent will dedupe
    ["ASSUMED NAME", false],
    ["DBA", false],
    ["INDIVIDUAL DOING BUSINESS AS", false],
  ])("%s → %s", (t, expected) => {
    expect(isRelevantEntityType({ entity_type: t })).toBe(expected);
  });

  test("contains-based match for unfamiliar variations", () => {
    expect(isRelevantEntityType({ entity_type: "DOMESTIC LIMITED LIABILITY COMPANY (CONVERTED)" })).toBe(true);
    expect(isRelevantEntityType({ entity_type: "PROFESSIONAL CORPORATION" })).toBe(true);
    expect(isRelevantEntityType({ entity_type: "GENERAL PARTNERSHIP" })).toBe(true);
  });
});

describe("processRow — pipeline + stats", () => {
  function makeRow(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      dos_id: "1234567",
      current_entity_name: "400 EAST 90 OWNER LLC",
      entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
      county: "NEW YORK",
      jurisdiction: "NEW YORK",
      initial_dos_filing_date: "01/15/2018",
      dos_process_name: "JOHN A SMITH",
      dos_process_address_1: "400 EAST 90 STREET",
      dos_process_address_2: "",
      dos_process_city: "NEW YORK",
      dos_process_state: "NY",
      dos_process_zip: "10128",
      ...overrides,
    };
  }

  test("Manhattan LLC kept", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow(), stats);
    expect(r.kept).toBe(true);
    expect(r.projected?.dos_id).toBe("1234567");
    expect(r.projected?.normalized_name).toBe("400 east 90 owner llc");
    expect(r.projected?.normalized_name_stripped).toBe("400 east 90 owner");
    expect(stats.rows_seen).toBe(1);
    expect(stats.rows_kept).toBe(1);
    expect(stats.rows_kept_manhattan_county).toBe(1);
    expect(stats.rows_kept_active).toBe(1);
  });

  test("Brooklyn LLC kept under other_nyc_county", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow({ county: "KINGS" }), stats);
    expect(r.kept).toBe(true);
    expect(stats.rows_kept_other_nyc_county).toBe(1);
    expect(stats.rows_kept_manhattan_county).toBe(0);
  });

  test("Westchester LLC with NYC process address kept under nyc_process_only", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow({ county: "WESTCHESTER" }), stats);
    expect(r.kept).toBe(true);
    expect(stats.rows_kept_nyc_process_only).toBe(1);
  });

  test("Albany LLC dropped at non-NYC", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow({
      county: "ALBANY",
      dos_process_state: "NY",
      dos_process_zip: "12203",
    }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("non_nyc");
    expect(stats.rows_dropped_non_nyc).toBe(1);
  });

  test("DBA dropped at irrelevant entity type", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow({ entity_type: "ASSUMED NAME" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("irrelevant_entity_type");
    expect(stats.rows_dropped_irrelevant_type).toBe(1);
  });

  test("Dissolved Manhattan LLC kept (dissolved-with-property is a sell signal)", () => {
    const stats = emptyDosCorpStats();
    const r = processRow(makeRow({ status: "DISSOLVED" }), stats);
    expect(r.kept).toBe(true);
    expect(stats.rows_kept_inactive).toBe(1);
    expect(r.projected?.status).toBe("DISSOLVED");
  });

  test("Aggregates entity_type and status histograms", () => {
    const stats = emptyDosCorpStats();
    processRow(makeRow(), stats); // active LLC Manhattan
    processRow(makeRow({ entity_type: "DOMESTIC BUSINESS CORPORATION" }), stats);
    processRow(makeRow({ status: "DISSOLVED" }), stats);
    processRow(makeRow({ status: "FORFEITED" }), stats);
    expect(stats.by_status.ACTIVE).toBe(2);
    expect(stats.by_status.DISSOLVED).toBe(1);
    expect(stats.by_status.FORFEITED).toBe(1);
    expect(stats.by_entity_type["DOMESTIC LIMITED LIABILITY COMPANY"]).toBe(3);
    expect(stats.by_entity_type["DOMESTIC BUSINESS CORPORATION"]).toBe(1);
  });

  test("Mixed batch: 6 rows in, kept reflects expected breakdown", () => {
    const stats = emptyDosCorpStats();
    processRow(makeRow(), stats); // KEEP — Manhattan LLC
    processRow(makeRow({ county: "KINGS" }), stats); // KEEP — Brooklyn LLC
    processRow(makeRow({
      county: "ALBANY",
      dos_process_state: "NY",
      dos_process_zip: "12203",
    }), stats); // DROP — Albany
    processRow(makeRow({
      county: "WESTCHESTER",
      dos_process_state: "NY",
      dos_process_zip: "10128",
    }), stats); // KEEP — Westchester county but NYC process
    processRow(makeRow({ entity_type: "ASSUMED NAME" }), stats); // DROP — DBA
    processRow(makeRow({ status: "DISSOLVED" }), stats); // KEEP — dissolved (still NYC)

    expect(stats.rows_seen).toBe(6);
    expect(stats.rows_kept).toBe(4);
    expect(stats.rows_dropped_non_nyc).toBe(1);
    expect(stats.rows_dropped_irrelevant_type).toBe(1);
    expect(stats.rows_kept_active).toBe(3);
    expect(stats.rows_kept_inactive).toBe(1);
  });
});

describe("projectDosCorpRow", () => {
  test("produces canonical join keys", () => {
    const proj = projectDosCorpRow({
      dos_id: "999",
      current_entity_name: "ACME 90, L.L.C.",
      entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
      county: "NEW YORK",
      dos_process_state: "NY",
      dos_process_zip: "10128",
    });
    expect(proj.normalized_name).toBe("acme 90 llc");
    expect(proj.normalized_name_stripped).toBe("acme 90");
    expect(proj.process_state).toBe("NY");
    expect(proj.county).toBe("NEW YORK");
  });
});
