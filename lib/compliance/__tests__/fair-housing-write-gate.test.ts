/// <reference types="jest" />
/**
 * P0b — Fair Housing write-gate parity (server-side scanner).
 *
 * The server scanner (FAIR_HOUSING_HARD_BLOCKS = hardcoded + prohibited-terms.json) must catch the
 * specific phrasings the client scanner already blocks but the server missed: familial/age "adults
 * only" + "55+"/"active adult"/"age restricted", local source-of-income programs (CityFHEPS / FHEPS /
 * DSS / HRA / "section 8 not accepted"), and NYC Fair Chance for Housing Act criminal-history language
 * ("must pass background check", "no felonies", "no convictions"). Clean copy must still pass.
 */
import { scanTextForFairHousing, scanRecordForFairHousing } from "@/lib/compliance/rls-enforcement";

const BLOCKED: Array<[string, string]> = [
  ["familial/age — adults only", "Quiet building, adults only."],
  ["age — 55+", "Active adult 55+ community."],
  ["age — age restricted", "This is an age-restricted building."],
  ["SOI — CityFHEPS", "Sorry, no CityFHEPS accepted here."],
  ["SOI — FHEPS", "No FHEPS."],
  ["SOI — DSS", "No DSS."],
  ["SOI — section 8 not accepted", "Section 8 not accepted."],
  ["SOI — vouchers not accepted", "Housing vouchers not accepted."],
  ["Fair Chance — must pass background check", "Tenant must pass background check."],
  ["Fair Chance — no felonies", "No felonies, no convictions."],
  ["Fair Chance — criminal background check", "We run a criminal background check on all applicants."],
];

describe("server Fair Housing scanner — newly-covered phrasings (write-gate parity)", () => {
  it.each(BLOCKED)("blocks %s", (_label, text) => {
    const issues = scanTextForFairHousing(text, "PublicRemarks");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("BLOCKER");
    expect(issues[0].field).toBe("PublicRemarks");
  });

  it("clean marketing copy is NOT blocked (no false positives)", () => {
    const clean =
      "Sun-filled 2-bedroom with a renovated kitchen, in-unit laundry, and a private balcony. " +
      "Close to the express train and Central Park. Pets welcome. Available immediately.";
    expect(scanTextForFairHousing(clean, "PublicRemarks")).toEqual([]);
  });

  it("scanRecordForFairHousing flags the offending field across a record", () => {
    const issues = scanRecordForFairHousing({
      PublicRemarks: "Spacious and bright.",
      ShowingInstructions: "Adults only, no CityFHEPS.",
      PrivateRemarks: null,
    });
    expect(issues.some((i) => i.field === "ShowingInstructions")).toBe(true);
    expect(issues.some((i) => i.field === "PublicRemarks")).toBe(false);
  });
});
