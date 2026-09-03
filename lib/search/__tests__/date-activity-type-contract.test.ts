/// <reference types="jest" />
/**
 * READ_BUT_NOT_EXECUTED — the `dateType` collapse.
 *
 * `dateType` chooses WHICH provider timestamp a date range is asked about.
 * The server read it like this:
 *
 *     const dateType = params.get("dateType") || "Listed";
 *     const field = dateType === "Updated" ? "ModificationTimestamp"
 *                                          : "ListingContractDate";
 *
 * One value is recognised. EVERY other string — a typo, a stale saved record,
 * a value from an older form revision, an outright garbage token — falls
 * through the ternary and silently becomes "Listed".
 *
 * That is the same defect family as a dropped criterion, arriving through a
 * different door. The broker asks one question and the provider is asked a
 * different one, with no error anywhere. Concretely: the browser once carried
 * a third option, `ListedAndUpdated`, and the client post-filter still has a
 * branch for it. Restore a saved search holding that value and the server
 * queries ListingContractDate only — listings that were UPDATED in range but
 * listed outside it are never fetched. The result set is narrower than the
 * question, which is just as wrong as being wider.
 *
 * Two values are executable, because two are all the route can emit:
 *
 *   Listed   ListingContractDate ge / le
 *   Updated  ModificationTimestamp gt / le
 *
 * Anything else must fail BY NAME rather than resolve to a default.
 */
import {
  buildCrmIdxODataFilter,
  UnsupportedSearchCriterionError,
} from "@/lib/search/crm-idx-filter";

const range = (extra: Record<string, string>) =>
  new URLSearchParams({ dateFrom: "2026-01-01", dateTo: "2026-06-30", ...extra });

describe("the two executable dateType values still execute", () => {
  it("Listed asks ListingContractDate", () => {
    const filter = buildCrmIdxODataFilter(range({ dateType: "Listed" }));
    expect(filter).toContain("ListingContractDate ge 2026-01-01");
    expect(filter).toContain("ListingContractDate le 2026-06-30");
    expect(filter).not.toContain("ModificationTimestamp");
  });

  it("Updated asks ModificationTimestamp", () => {
    const filter = buildCrmIdxODataFilter(range({ dateType: "Updated" }));
    expect(filter).toContain("ModificationTimestamp gt 2026-01-01T00:00:00Z");
    expect(filter).toContain("ModificationTimestamp le 2026-06-30T23:59:59Z");
    expect(filter).not.toContain("ListingContractDate");
  });
});

describe("an unexecutable dateType fails by name instead of collapsing", () => {
  it.each([
    ["ListedAndUpdated", "the value an older form revision could still have saved"],
    ["Sold", "a plausible-sounding value this route cannot answer"],
    ["Closed", "another plausible-sounding one"],
    ["updated", "wrong case — the provider comparison is exact"],
    ["garbage", "an outright unknown token"],
  ])("%s throws (%s)", (value) => {
    expect(() => buildCrmIdxODataFilter(range({ dateType: value }))).toThrow(
      UnsupportedSearchCriterionError,
    );
  });

  it("names the criterion and the offending value", () => {
    // A 400 that does not say WHICH criterion died is not actionable for the
    // broker, and it is exactly what makes silent defaults tempting.
    try {
      buildCrmIdxODataFilter(range({ dateType: "ListedAndUpdated" }));
      throw new Error("expected a throw");
    } catch (err) {
      const e = err as UnsupportedSearchCriterionError;
      expect(e.criterion).toBe("dateType");
      expect(e.unsupportedValues).toEqual(["ListedAndUpdated"]);
    }
  });

  it("never silently produces a ListingContractDate clause for an unknown type", () => {
    // The precise failure being pinned: the old code returned a VALID-LOOKING
    // filter for a value it did not understand.
    let filter = "";
    try {
      filter = buildCrmIdxODataFilter(range({ dateType: "ListedAndUpdated" }));
    } catch {
      filter = "";
    }
    expect(filter).toBe("");
  });
});

describe("the validation is scoped to when a range is actually asked", () => {
  it("an unknown dateType with no range does not fabricate an error", () => {
    // Nothing is being asked of the provider, so nothing can be answered
    // wrongly. Throwing here would reject harmless leftover query state.
    expect(() =>
      buildCrmIdxODataFilter(new URLSearchParams({ dateType: "garbage", borough: "Manhattan" })),
    ).not.toThrow();
  });

  it("an absent dateType with a range still means Listed", () => {
    // Preserved deliberately. The browser only emits dateFrom once an activity
    // type is chosen, so absence means a non-browser caller, and "Listed" is
    // the documented historical meaning. It is a DEFAULT, not a fallback for
    // an unrecognised value — those are different things and only one of them
    // is safe.
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ dateFrom: "2026-01-01" }));
    expect(filter).toContain("ListingContractDate ge 2026-01-01");
  });
});
