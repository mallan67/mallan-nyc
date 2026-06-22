/// <reference types="jest" />
/**
 * Item A / Option B (board #415) — clear the Phase D `agent_info` blocker for the rentals
 * "View Listing" path WITHOUT routing into the broken REDESIGN edit hydration (23 missing
 * controls — tracked separately as A3).
 *
 * The reachable rentals dashboard "View Listing" button opens the WORKING
 * `RENTAL-FORM-WITH-TOOLS.html` viewer. Its agent/company hydration is now TYPED-FIRST
 * (typed column → agent_info → '') so that once Phase D drops `agent_info`, the reachable
 * viewer still renders agent/company from the typed columns.
 *
 * The viewer only consumes agent NAME + OFFICE from the listing (no email/phone read), so
 * `list_agent_full_name` + `list_office_name` are the two typed columns that matter here.
 *
 * Static source assertions: the viewer + panel JS are served as-is (NOT inlined into
 * index-built.html), so the source file IS the served file. `apiData` is the full CRM listing
 * row (GET /api/crm/listings/[id] → findUnique with no select → typed columns present).
 */
import { readFileSync } from "fs";
import { join } from "path";

const CRM = join(process.cwd(), "public", "crm");
const withTools = readFileSync(join(CRM, "RENTAL-FORM-WITH-TOOLS.html"), "utf8");
const rentalsPanel = readFileSync(join(CRM, "js", "dashboard", "panels", "rentals-crm", "index.js"), "utf8");

describe("Item A/B — reachable rentals 'View Listing' still opens the working WITH-TOOLS viewer", () => {
  it("_viewListing opens /crm/RENTAL-FORM-WITH-TOOLS.html?id= (route NOT repointed to broken REDESIGN)", () => {
    expect(rentalsPanel).toContain("/crm/RENTAL-FORM-WITH-TOOLS.html?id=");
    expect(rentalsPanel).not.toContain("RENTAL-FORM-REDESIGN.html?id=");
  });
});

describe("Item A/B — WITH-TOOLS hydrates agent/company TYPED-FIRST", () => {
  it("listingAgent reads list_agent_full_name before agent_info.ListAgentFullName", () => {
    expect(withTools).toContain(
      "listingAgent: apiData.list_agent_full_name || (apiData.agent_info || {}).ListAgentFullName",
    );
  });

  it("listingCompany reads list_office_name before agent_info.ListOfficeName", () => {
    expect(withTools).toContain(
      "listingCompany: apiData.list_office_name || (apiData.agent_info || {}).ListOfficeName",
    );
  });

  it("NO bare agent_info-first agent/company read remains", () => {
    expect(withTools).not.toMatch(/listing(?:Agent|Company):\s*\(apiData\.agent_info/);
  });

  it("both viewer blocks (2 fields x 2) hydrate typed-first AND keep the safe '' fallback", () => {
    const typedFirst =
      withTools.match(
        /listing(?:Agent|Company): apiData\.list_\w+ \|\| \(apiData\.agent_info \|\| \{\}\)\.\w+ \|\| ''/g,
      ) || [];
    expect(typedFirst.length).toBe(4);
  });

  it("viewer does not read agent email/phone from agent_info (nothing else to make typed-first)", () => {
    expect(withTools).not.toMatch(/agent_info[^;]*ListAgent(?:Email|DirectPhone)/);
  });
});
