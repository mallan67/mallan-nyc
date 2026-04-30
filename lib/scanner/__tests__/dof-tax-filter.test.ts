import {
  bblFromDofRow,
  isManhattanRow,
  categorizeLienType,
  projectDofRow,
  processRow,
  emptyDofTaxStats,
} from "@/lib/scanner/dof-tax-filter";

describe("bblFromDofRow", () => {
  test("constructs from borough/block/lot", () => {
    expect(bblFromDofRow({ borough: "1", block: "1573", lot: "19" })).toBe("1015730019");
    expect(bblFromDofRow({ Borough: "1", Block: "01573", Lot: "0019" })).toBe("1015730019");
  });
  test("uses direct BBL field if present", () => {
    expect(bblFromDofRow({ bbl: "1015730019" })).toBe("1015730019");
    expect(bblFromDofRow({ BBL: "1015730019" })).toBe("1015730019");
  });
  test("rejects bad input", () => {
    expect(bblFromDofRow({ borough: "X", block: "1", lot: "1" })).toBeNull();
    expect(bblFromDofRow({})).toBeNull();
  });
  test("strips formatting from direct BBL", () => {
    expect(bblFromDofRow({ bbl: "1-01573-0019" })).toBe("1015730019");
  });
});

describe("isManhattanRow", () => {
  test("borough = 1 → true", () => {
    expect(isManhattanRow({ borough: "1" })).toBe(true);
  });
  test("BBL prefix 1 → true", () => {
    expect(isManhattanRow({ bbl: "1015730019" })).toBe(true);
  });
  test("borough = 3 → false", () => {
    expect(isManhattanRow({ borough: "3", block: "123", lot: "45" })).toBe(false);
  });
});

describe("categorizeLienType", () => {
  test.each([
    ["Property Tax", "property_tax"],
    ["Tax Class 2", "property_tax"],
    ["Water and Sewer", "water_sewer"],
    ["DEP Water", "water_sewer"],
    ["Emergency Repair Program", "emergency_repair"],
    ["ERP", "emergency_repair"],
    ["Other Charges", "other"],
    ["", "other"],
  ])("%s → %s", (input, expected) => {
    expect(categorizeLienType(input)).toBe(expected);
  });
});

describe("projectDofRow", () => {
  test("extracts canonical fields", () => {
    const sig = projectDofRow({
      borough: "1", block: "1573", lot: "19",
      address: "400 EAST 90 STREET",
      owner_name: "400 EAST 90 OWNER LLC",
      lien_type: "Property Tax",
      lien_amount: "12500.00",
      sale_date: "2026-05-15",
      list_date: "2026-04-15",
    }, "1015730019");
    expect(sig.bbl).toBe("1015730019");
    expect(sig.address).toBe("400 EAST 90 STREET");
    expect(sig.lien_category).toBe("property_tax");
    expect(sig.lien_amount).toBe("12500.00");
  });
});

describe("processRow — pipeline + stats", () => {
  function row(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      borough: "1",
      block: "1573",
      lot: "19",
      address: "400 EAST 90 STREET",
      owner_name: "400 EAST 90 OWNER LLC",
      lien_type: "Property Tax",
      lien_amount: "12500.00",
      sale_date: "2026-05-15",
      list_date: "2026-04-15",
      ...overrides,
    };
  }

  test("Manhattan property-tax lien kept", () => {
    const stats = emptyDofTaxStats();
    const r = processRow(row(), stats);
    expect(r.kept).toBe(true);
    expect(r.signal?.bbl).toBe("1015730019");
    expect(r.signal?.lien_category).toBe("property_tax");
    expect(stats.rows_kept).toBe(1);
    expect(stats.by_lien_category.property_tax).toBe(1);
  });

  test("Brooklyn lien dropped", () => {
    const stats = emptyDofTaxStats();
    const r = processRow(row({ borough: "3" }), stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("non_manhattan");
    expect(stats.rows_dropped_non_manhattan).toBe(1);
  });

  test("missing BBL parts dropped at bad_bbl", () => {
    const stats = emptyDofTaxStats();
    const r = processRow({ borough: "1", lien_type: "Tax" }, stats);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("bad_bbl");
  });

  test("corridor BBL whitelist clips out-of-corridor BBLs", () => {
    const stats = emptyDofTaxStats({ corridorSize: 1 });
    const corridor = new Set(["1015730019"]);
    expect(processRow(row(), stats, corridor).kept).toBe(true);
    expect(processRow(row({ block: "9999", lot: "9999" }), stats, corridor).kept).toBe(false);
    expect(stats.rows_dropped_outside_corridor).toBe(1);
  });

  test("lien-category histogram aggregates", () => {
    const stats = emptyDofTaxStats();
    processRow(row({ lien_type: "Property Tax" }), stats);
    processRow(row({ lien_type: "Tax Class 2", block: "1574" }), stats);
    processRow(row({ lien_type: "Water and Sewer", block: "1575" }), stats);
    processRow(row({ lien_type: "ERP", block: "1576" }), stats);
    expect(stats.by_lien_category.property_tax).toBe(2);
    expect(stats.by_lien_category.water_sewer).toBe(1);
    expect(stats.by_lien_category.emergency_repair).toBe(1);
  });
});
