import {
  categorizeDocType,
  isManhattanRecord,
  bblFromLegals,
  isSellerIntentDoc,
  isWithinWindow,
  isWatchedMasterRow,
  isGrantorParty,
  processMasterRow,
  isDeedDocType,
  computeOwnershipDuration,
  processDeedMasterRow,
  emptyDeedHistoryStats,
  projectMasterRow,
  projectLegalsRow,
  projectPartyRow,
  emptyAcrisStats,
  SELLER_INTENT_DOC_TYPES,
} from "@/lib/scanner/acris-filter";

const NOW = new Date("2026-04-30T12:00:00Z");

describe("categorizeDocType", () => {
  test.each([
    ["LP", "lis_pendens"],
    ["LIS", "lis_pendens"],
    ["LPND", "lis_pendens"],
    ["LISPD", "lis_pendens"],
    ["FORE", "foreclosure"],
    ["JDF", "foreclosure"],
    ["TAX", "tax_lien"],
    ["NOTL", "tax_lien"],
    ["EATR", "estate"],
    ["EXECUTOR", "estate"],
    ["ADMIN", "estate"],
    ["LBADM", "estate"],
    ["DEED", null],
    ["MTGE", null],
    ["", null],
    ["UNKNOWN", null],
  ])("%s → %s", (input, expected) => {
    expect(categorizeDocType(input)).toBe(expected);
  });

  test("case insensitive + trimmed", () => {
    expect(categorizeDocType(" lp ")).toBe("lis_pendens");
    expect(categorizeDocType("Lp")).toBe("lis_pendens");
    expect(categorizeDocType("LP\n")).toBe("lis_pendens");
  });
});

describe("isManhattanRecord", () => {
  test("recorded_borough '1' → Manhattan", () => {
    expect(isManhattanRecord({ recorded_borough: "1" })).toBe(true);
    expect(isManhattanRecord({ RECORDED_BOROUGH: "1" })).toBe(true);
  });
  test("borough '1' from Legals → Manhattan", () => {
    expect(isManhattanRecord({ borough: "1" })).toBe(true);
  });
  test("non-Manhattan", () => {
    expect(isManhattanRecord({ recorded_borough: "3" })).toBe(false);
    expect(isManhattanRecord({ borough: "2" })).toBe(false);
    expect(isManhattanRecord({})).toBe(false);
  });
});

describe("bblFromLegals", () => {
  test("constructs 10-digit BBL with zero-padded block + lot", () => {
    expect(bblFromLegals({ borough: "1", block: "1573", lot: "19" })).toBe("1015730019");
    expect(bblFromLegals({ borough: "1", block: "01573", lot: "0019" })).toBe("1015730019");
    expect(bblFromLegals({ borough: "3", block: "123", lot: "45" })).toBe("3001230045");
  });
  test("rejects missing fields", () => {
    expect(bblFromLegals({ borough: "1", block: "1573" })).toBeNull();
    expect(bblFromLegals({ borough: "1" })).toBeNull();
    expect(bblFromLegals({})).toBeNull();
  });
  test("rejects bad borough", () => {
    expect(bblFromLegals({ borough: "X", block: "1573", lot: "19" })).toBeNull();
    expect(bblFromLegals({ borough: "11", block: "1573", lot: "19" })).toBeNull();
  });
  test("uppercase column names work", () => {
    expect(bblFromLegals({ BOROUGH: "1", BLOCK: "1573", LOT: "19" })).toBe("1015730019");
  });
});

describe("isSellerIntentDoc", () => {
  test.each([
    ["LP", true],
    ["LIS", true],
    ["FORE", true],
    ["TAX", true],
    ["EATR", true],
    ["EXECUTOR", true],
    ["DEED", false],
    ["MTGE", false],
    ["AGMT", false],
    ["RPTT", false],
    ["", false],
  ])("doc_type=%s → %s", (dt, expected) => {
    expect(isSellerIntentDoc({ doc_type: dt })).toBe(expected);
  });
});

describe("isWithinWindow", () => {
  test("1-day-old doc is within 730-day window", () => {
    expect(isWithinWindow({ recorded_datetime: "2026-04-29T10:00:00.000" }, 730, NOW)).toBe(true);
  });
  test("2-year-old doc is on the boundary (within 730-day window)", () => {
    expect(isWithinWindow({ recorded_datetime: "2024-05-15T10:00:00.000" }, 730, NOW)).toBe(true);
  });
  test("3-year-old doc is outside 730-day window", () => {
    expect(isWithinWindow({ recorded_datetime: "2023-04-29T10:00:00.000" }, 730, NOW)).toBe(false);
  });
  test("future-dated doc is rejected", () => {
    expect(isWithinWindow({ recorded_datetime: "2027-04-29T10:00:00.000" }, 730, NOW)).toBe(false);
  });
  test("missing date is rejected", () => {
    expect(isWithinWindow({}, 730, NOW)).toBe(false);
    expect(isWithinWindow({ recorded_datetime: "" }, 730, NOW)).toBe(false);
  });
  test("unparseable date is rejected", () => {
    expect(isWithinWindow({ recorded_datetime: "garbage" }, 730, NOW)).toBe(false);
  });
});

describe("isWatchedMasterRow — composite", () => {
  test("Manhattan + LP + recent → true", () => {
    expect(isWatchedMasterRow({
      recorded_borough: "1",
      doc_type: "LP",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, 730, NOW)).toBe(true);
  });
  test("Brooklyn + LP + recent → false", () => {
    expect(isWatchedMasterRow({
      recorded_borough: "3",
      doc_type: "LP",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, 730, NOW)).toBe(false);
  });
  test("Manhattan + DEED + recent → false (deed not on watchlist)", () => {
    expect(isWatchedMasterRow({
      recorded_borough: "1",
      doc_type: "DEED",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, 730, NOW)).toBe(false);
  });
  test("Manhattan + LP + 5-year-old → false (out of window)", () => {
    expect(isWatchedMasterRow({
      recorded_borough: "1",
      doc_type: "LP",
      recorded_datetime: "2021-03-15T10:00:00.000",
    }, 730, NOW)).toBe(false);
  });
});

describe("isGrantorParty", () => {
  test("party_type '1' = grantor", () => {
    expect(isGrantorParty({ party_type: "1" })).toBe(true);
    expect(isGrantorParty({ party_type: "2" })).toBe(false);
    expect(isGrantorParty({ party_type: "3" })).toBe(false);
    expect(isGrantorParty({})).toBe(false);
  });
});

describe("processMasterRow — full pipeline + stats", () => {
  test("kept row updates correct counters", () => {
    const stats = emptyAcrisStats({ windowDays: 730 });
    const r = processMasterRow({
      document_id: "2026031500900001",
      recorded_borough: "1",
      doc_type: "LP",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, stats, 730, NOW);
    expect(r.kept).toBe(true);
    expect(r.doc_id).toBe("2026031500900001");
    expect(r.category).toBe("lis_pendens");
    expect(stats.master_rows_seen).toBe(1);
    expect(stats.master_rows_manhattan).toBe(1);
    expect(stats.master_rows_seller_intent).toBe(1);
    expect(stats.master_rows_in_window).toBe(1);
    expect(stats.master_rows_kept).toBe(1);
    expect(stats.master_by_category.lis_pendens).toBe(1);
    expect(stats.master_by_doc_type.LP).toBe(1);
  });

  test("Brooklyn LP — drops at Manhattan check", () => {
    const stats = emptyAcrisStats();
    const r = processMasterRow({
      document_id: "X",
      recorded_borough: "3",
      doc_type: "LP",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, stats, 730, NOW);
    expect(r.kept).toBe(false);
    expect(stats.master_rows_manhattan).toBe(0);
    expect(stats.master_rows_seller_intent).toBe(0);
  });

  test("Manhattan deed — drops at seller-intent check", () => {
    const stats = emptyAcrisStats();
    processMasterRow({
      document_id: "X",
      recorded_borough: "1",
      doc_type: "DEED",
      recorded_datetime: "2026-03-15T10:00:00.000",
    }, stats, 730, NOW);
    expect(stats.master_rows_manhattan).toBe(1);
    expect(stats.master_rows_seller_intent).toBe(0);
    expect(stats.master_rows_kept).toBe(0);
  });

  test("Manhattan old LP — drops at window check", () => {
    const stats = emptyAcrisStats();
    processMasterRow({
      document_id: "X",
      recorded_borough: "1",
      doc_type: "LP",
      recorded_datetime: "2020-03-15T10:00:00.000",
    }, stats, 730, NOW);
    expect(stats.master_rows_seller_intent).toBe(1);
    expect(stats.master_rows_in_window).toBe(0);
    expect(stats.master_rows_kept).toBe(0);
  });

  test("multiple categories aggregate correctly", () => {
    const stats = emptyAcrisStats();
    const rows = [
      { recorded_borough: "1", doc_type: "LP", recorded_datetime: "2026-03-15", document_id: "1" },
      { recorded_borough: "1", doc_type: "LP", recorded_datetime: "2026-03-16", document_id: "2" },
      { recorded_borough: "1", doc_type: "FORE", recorded_datetime: "2026-03-17", document_id: "3" },
      { recorded_borough: "1", doc_type: "TAX", recorded_datetime: "2026-03-18", document_id: "4" },
      { recorded_borough: "1", doc_type: "EATR", recorded_datetime: "2026-03-19", document_id: "5" },
      { recorded_borough: "1", doc_type: "DEED", recorded_datetime: "2026-03-20", document_id: "6" },
    ];
    rows.forEach((r) => processMasterRow(r, stats, 730, NOW));
    expect(stats.master_rows_kept).toBe(5);
    expect(stats.master_by_category.lis_pendens).toBe(2);
    expect(stats.master_by_category.foreclosure).toBe(1);
    expect(stats.master_by_category.tax_lien).toBe(1);
    expect(stats.master_by_category.estate).toBe(1);
    expect(stats.master_by_doc_type.LP).toBe(2);
    expect(stats.master_by_doc_type.DEED).toBe(1);
  });

  test("missing document_id rejects keep", () => {
    const stats = emptyAcrisStats();
    const r = processMasterRow({
      document_id: "",
      recorded_borough: "1",
      doc_type: "LP",
      recorded_datetime: "2026-03-15",
    }, stats, 730, NOW);
    expect(r.kept).toBe(false);
  });
});

describe("projectMasterRow / projectLegalsRow / projectPartyRow", () => {
  test("Master projection keeps only canonical fields", () => {
    const proj = projectMasterRow({
      document_id: "2026031500900001",
      doc_type: "LP",
      document_date: "03/15/2026",
      recorded_datetime: "2026-03-15T10:00:00.000",
      document_amt: "0",
      extra_garbage: "should disappear",
    }, "lis_pendens");
    expect(proj).toEqual({
      doc_id: "2026031500900001",
      doc_type: "LP",
      category: "lis_pendens",
      document_date: "03/15/2026",
      recorded_datetime: "2026-03-15T10:00:00.000",
      document_amt: "0",
    });
  });

  test("Legals projection produces 10-digit BBL", () => {
    const proj = projectLegalsRow({
      document_id: "2026031500900001",
      borough: "1",
      block: "1573",
      lot: "19",
      street_number: "400",
      street_name: "EAST 90 STREET",
      unit: "12A",
      property_type: "RC",
    });
    expect(proj?.doc_id).toBe("2026031500900001");
    expect(proj?.bbl).toBe("1015730019");
    expect(proj?.street_number).toBe("400");
    expect(proj?.unit).toBe("12A");
  });

  test("Legals projection returns null if BBL invalid", () => {
    expect(projectLegalsRow({ document_id: "X", borough: "1", block: "" })).toBeNull();
  });

  test("Party projection retains addr fields", () => {
    const proj = projectPartyRow({
      document_id: "2026031500900001",
      party_type: "1",
      name: "SMITH JOHN A",
      address_1: "400 EAST 90 STREET APT 12A",
      city: "NEW YORK",
      state: "NY",
      zip: "10128",
      country: "US",
    });
    expect(proj.party_type).toBe("1");
    expect(proj.name).toBe("SMITH JOHN A");
    expect(proj.address_1).toBe("400 EAST 90 STREET APT 12A");
    expect(proj.city).toBe("NEW YORK");
    expect(proj.zip).toBe("10128");
  });
});

describe("isDeedDocType + computeOwnershipDuration", () => {
  test("isDeedDocType matches DEED variants", () => {
    expect(isDeedDocType("DEED")).toBe(true);
    expect(isDeedDocType("DEEDS")).toBe(true);
    expect(isDeedDocType("DEED, RP")).toBe(true);
    expect(isDeedDocType("DEED, TS")).toBe(true);
    expect(isDeedDocType("BARGAIN AND SALE DEED")).toBe(true);
    expect(isDeedDocType("QUITCLAIM")).toBe(true);
    expect(isDeedDocType("QC")).toBe(true);
    expect(isDeedDocType("LP")).toBe(false);
    expect(isDeedDocType("MTGE")).toBe(false);
    expect(isDeedDocType("")).toBe(false);
  });

  test("computeOwnershipDuration picks most-recent deed per BBL", () => {
    const NOW2 = new Date("2026-04-30T00:00:00Z");
    const entries = [
      { bbl: "1015730019", doc_id: "OLD", doc_type: "DEED", recorded_datetime: "2010-01-15T00:00:00.000", document_amt: "100" },
      { bbl: "1015730019", doc_id: "RECENT", doc_type: "DEED", recorded_datetime: "2018-06-15T00:00:00.000", document_amt: "200" },
      { bbl: "1010100007", doc_id: "DEED2", doc_type: "DEED", recorded_datetime: "2020-09-01T00:00:00.000", document_amt: "300" },
    ];
    const out = computeOwnershipDuration(entries, NOW2);
    expect(out.size).toBe(2);
    // 2018-06 → ~7.9 years before 2026-04
    expect(out.get("1015730019")).toBeCloseTo(7.9, 1);
    expect(out.get("1010100007")).toBeCloseTo(5.7, 1);
  });

  test("processDeedMasterRow keeps Manhattan deeds in window", () => {
    const NOW2 = new Date("2026-04-30T00:00:00Z");
    const stats = emptyDeedHistoryStats(50 * 365);
    const r = processDeedMasterRow({
      document_id: "X",
      recorded_borough: "1",
      doc_type: "DEED",
      recorded_datetime: "2018-06-15T00:00:00.000",
    }, stats, 50 * 365, NOW2);
    expect(r.kept).toBe(true);
    expect(stats.master_rows_in_window).toBe(1);
  });

  test("processDeedMasterRow drops mortgages", () => {
    const stats = emptyDeedHistoryStats(50 * 365);
    const r = processDeedMasterRow({
      document_id: "X",
      recorded_borough: "1",
      doc_type: "MTGE",
      recorded_datetime: "2018-06-15T00:00:00.000",
    }, stats, 50 * 365, new Date());
    expect(r.kept).toBe(false);
    expect(stats.master_rows_manhattan_deeds).toBe(0);
  });
});

describe("SELLER_INTENT_DOC_TYPES — sanity", () => {
  test("includes all categorized doc types", () => {
    for (const set of [
      ["LP", "LIS", "FORE", "TAX", "EATR", "EXECUTOR", "ADMIN", "LBADM"],
    ].flat()) {
      expect(SELLER_INTENT_DOC_TYPES.has(set)).toBe(true);
    }
  });
  test("excludes deeds and mortgages (covered by other module)", () => {
    expect(SELLER_INTENT_DOC_TYPES.has("DEED")).toBe(false);
    expect(SELLER_INTENT_DOC_TYPES.has("MTGE")).toBe(false);
    expect(SELLER_INTENT_DOC_TYPES.has("AGMT")).toBe(false);
  });
});
