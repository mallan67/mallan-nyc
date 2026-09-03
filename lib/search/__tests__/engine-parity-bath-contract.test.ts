/**
 * ENGINE PARITY — one criterion contract, two execution sources.
 *
 * Search must mean the same thing whether it runs against Mallan storage or an
 * authorized Cotality fallback. Both renderers derive from ONE definition in
 * `lib/search/canonical/bath-contract.ts`, so this suite asserts they agree on
 * concrete listings rather than merely producing similar-looking strings.
 *
 * The defects replaced, both live-verified as real (BathroomsHalf is non-zero
 * on 2,023 of 8,103 Active rows, so neither is a corner case):
 *   minBaths=1.5 was `BathroomsFull ge 1 AND BathroomsHalf ge 1` — REJECTED a
 *                 2-full/0-half apartment.
 *   maxBaths=1   was `BathroomsFull le 1` — ADMITTED a 1.5-bath listing.
 */
import {
  bathTotal,
  minBathsAlternatives,
  maxBathsAlternatives,
  minBathsOData,
  maxBathsOData,
  BATH_COMPONENTS_LIVE,
} from "@/lib/search/canonical/bath-contract";

type Row = { full: number; half: number | null };

/** Evaluate the canonical alternatives against a concrete listing. */
const minAdmits = (m: number, r: Row) =>
  minBathsAlternatives(m).some((a) =>
    a.fullAtLeast !== undefined
      ? r.full >= a.fullAtLeast
      : r.full === a.fullExactly && (r.half ?? 0) >= (a.halfAtLeast ?? 0),
  );

const maxAdmits = (m: number, r: Row) =>
  maxBathsAlternatives(m).some((a) => r.full === a.fullExactly && (r.half ?? 0) <= a.halfAtMost);

/** Ground truth, straight from the definition of a bathroom total. */
const trueMin = (m: number, r: Row) => bathTotal(r.full, r.half) >= m;
const trueMax = (m: number, r: Row) => bathTotal(r.full, r.half) <= m;

const ROWS: Row[] = [];
for (let full = 0; full <= 6; full++) for (const half of [null, 0, 1, 2, 3]) ROWS.push({ full, half });

describe("the canonical bath contract matches the true total exactly", () => {
  it.each([0.5, 1, 1.5, 2, 2.5, 3, 4])("minBaths=%s agrees with full + half/2 on every row", (m) => {
    for (const r of ROWS) expect(minAdmits(m, r)).toBe(trueMin(m, r));
  });

  it.each([1, 1.5, 2, 2.5, 3])("maxBaths=%s agrees with full + half/2 on every row", (m) => {
    for (const r of ROWS) expect(maxAdmits(m, r)).toBe(trueMax(m, r));
  });

  it("admits two full baths for minBaths=1.5 — the exact regression", () => {
    expect(minAdmits(1.5, { full: 2, half: 0 })).toBe(true);
    expect(minAdmits(1.5, { full: 2, half: null })).toBe(true);
  });

  it("excludes a 1.5-bath listing from maxBaths=1 — the mirror regression", () => {
    expect(maxAdmits(1, { full: 1, half: 1 })).toBe(false);
    expect(maxAdmits(1, { full: 1, half: 0 })).toBe(true);
  });

  it("reads a NULL half-bath count as zero, not as unknown-so-admit", () => {
    expect(minAdmits(1.5, { full: 1, half: null })).toBe(false);
    expect(maxAdmits(1, { full: 1, half: null })).toBe(true);
  });

  it("THE CANONICAL MALLAN BATH DEFINITION, stated case by case", () => {
    // Maya's ruling, 2026-08-31: half baths are real Cotality data and are
    // first-class bath information. They are never rounded away, and never
    // replaced by BathroomsTotalInteger — an Edm.Int32 that cannot represent 1.5
    // and disagrees with its own components on ~1% of rows.
    //
    // Total baths for numeric search = BathroomsFull + (BathroomsHalf x 0.5).
    //
    // Named individually rather than left implicit in the property-based sweep
    // above, because this is the BUSINESS definition the sweep is checking
    // against. If the rule ever changes, it should change here, visibly.
    expect(bathTotal(1, 1)).toBe(1.5);
    expect(bathTotal(2, 0)).toBe(2);
    expect(bathTotal(2, 1)).toBe(2.5);
    expect(bathTotal(0, 1)).toBe(0.5);
    expect(bathTotal(3, 2)).toBe(4);
  });

  it("and the fractional boundaries hold from both directions", () => {
    // A 1.5-bath listing is admitted by minBaths=1.5 and by maxBaths=1.5, and
    // excluded by minBaths=2 and maxBaths=1. Boundary inclusivity stated
    // explicitly so a future off-by-a-half cannot pass unnoticed.
    const oneAndAHalf = { full: 1, half: 1 };
    expect(minAdmits(1.5, oneAndAHalf)).toBe(true);
    expect(maxAdmits(1.5, oneAndAHalf)).toBe(true);
    expect(minAdmits(2, oneAndAHalf)).toBe(false);
    expect(maxAdmits(1, oneAndAHalf)).toBe(false);

    const twoAndAHalf = { full: 2, half: 1 };
    expect(minAdmits(2.5, twoAndAHalf)).toBe(true);
    expect(maxAdmits(2.5, twoAndAHalf)).toBe(true);
    expect(minAdmits(3, twoAndAHalf)).toBe(false);
    expect(maxAdmits(2, twoAndAHalf)).toBe(false);
  });

  it("a half bath is never rounded away — 2 full + 1 half is not 2 baths", () => {
    // The regression that would silently lose the 2,023 Active listings whose
    // BathroomsHalf is non-zero.
    expect(bathTotal(2, 1)).not.toBe(2);
    expect(maxAdmits(2, { full: 2, half: 1 })).toBe(false);
  });
});

describe("the OData renderer uses only live-permitted operators", () => {
  it("never emits arithmetic — div and mul are PROVIDER_REJECTED_500", () => {
    for (const m of [1, 1.5, 2, 2.5, 3]) {
      for (const f of [minBathsOData(m), maxBathsOData(m)]) {
        expect(f).not.toMatch(/\b(div|mul|sub)\b/);
        expect(f).not.toContain("BathroomsTotalInteger");
      }
    }
  });

  it("emits one clause per canonical alternative — same rule, other dialect", () => {
    expect(minBathsOData(1.5).match(/BathroomsFull/g)?.length).toBe(minBathsAlternatives(1.5).length);
    expect(maxBathsOData(2).match(/BathroomsFull/g)?.length).toBe(maxBathsAlternatives(2).length);
  });

  it("refuses BathroomsTotalInteger, which cannot express 1.5 and is unreliable", () => {
    // Int32, so 1.5 is unrepresentable. It is also not a derivable function of
    // the components: no hypothesis matched all 8,087 comparable rows (best
    // 98.8%), and rows exist reporting full=2, half=1, TotalInteger=0.
    expect(BATH_COMPONENTS_LIVE.rejected).toContain("BathroomsTotalInteger");
    expect(BATH_COMPONENTS_LIVE.used).toEqual(["BathroomsFull", "BathroomsHalf"]);
  });

  it("records that no populated component is discarded", () => {
    // Gate on freezing full + half/2: quarter components are present on a few
    // rows but ZERO on all of them, and BathroomsPartial is never delivered.
    expect(BATH_COMPONENTS_LIVE.coverage.complete).toBe(true);
    expect(BATH_COMPONENTS_LIVE.coverage.rowsRead).toBe(BATH_COMPONENTS_LIVE.coverage.providerDeclared);
    expect(BATH_COMPONENTS_LIVE.presentButAlwaysZero).toContain("BathroomsOneQuarter");
    expect(BATH_COMPONENTS_LIVE.neverDelivered).toContain("BathroomsPartial");
  });
});
