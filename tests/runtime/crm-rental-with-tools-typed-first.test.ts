/// <reference types="jest" />
/**
 * Item A / Option B (board #415) — clear the Phase D `agent_info` blocker for the rentals
 * "View Listing" path WITHOUT routing into the broken REDESIGN edit hydration (23 missing
 * controls — tracked as A3).
 *
 * The reachable rentals "View Listing" button opens the WORKING `RENTAL-FORM-WITH-TOOLS.html`
 * viewer. `loadRentalListingData()` renders the visible agent field (`rentalListingAgentSearch`)
 * from the object key **`d.listingAgentName`** (line ~4530) and the company courtesy text from
 * **`d.listingCompany`** (line ~4610). So the viewer object must populate those RENDERED keys
 * typed-first — populating the unused `listingAgent` key is a no-op (Codex #423).
 *
 * `apiData` is the full CRM listing row (GET /api/crm/listings/[id] → findUnique with no select
 * → typed columns present). Fallback stays safe: typed → agent_info → ''. The viewer reads no
 * agent email/phone from agent_info, so name+office are the only agent_info reads.
 *
 * Static source assertions (viewer + panel JS are served as-is, not inlined into index-built.html).
 */
import { readFileSync } from "fs";
import { join } from "path";

const CRM = join(process.cwd(), "public", "crm");
const withTools = readFileSync(join(CRM, "RENTAL-FORM-WITH-TOOLS.html"), "utf8");
const rentalsPanel = readFileSync(join(CRM, "js", "dashboard", "panels", "rentals-crm", "index.js"), "utf8");

describe("Item A/B — reachable rentals 'View Listing' still opens the working WITH-TOOLS viewer", () => {
  it("_viewListing opens WITH-TOOLS (route NOT repointed to the broken REDESIGN)", () => {
    expect(rentalsPanel).toContain("/crm/RENTAL-FORM-WITH-TOOLS.html?id=");
    expect(rentalsPanel).not.toContain("RENTAL-FORM-REDESIGN.html?id=");
  });
});

describe("Item A/B — viewer object populates the RENDERED keys typed-first", () => {
  it("the visible agent field is rendered from d.listingAgentName (the rendered key)", () => {
    expect(withTools).toContain("viewerSetVal('rentalListingAgentSearch', d.listingAgentName)");
  });

  it("object sets listingAgentName typed-first in BOTH viewer blocks", () => {
    const m =
      withTools.match(
        /listingAgentName: apiData\.list_agent_full_name \|\| \(apiData\.agent_info \|\| \{\}\)\.ListAgentFullName \|\| ''/g,
      ) || [];
    expect(m.length).toBe(2);
  });

  // Regression guard for Codex #423: the prior patch wrote the UNUSED `listingAgent` key,
  // which the renderer never reads — a no-op that left the agent field blank. This must stay gone.
  it("does NOT write the unused listingAgent key (the previous no-op)", () => {
    expect(withTools).not.toContain("listingAgent: apiData");
    expect(withTools).not.toMatch(/listingAgent:\s*\(apiData\.agent_info/);
  });

  it("company hydrates typed-first via the rendered d.listingCompany key (both blocks)", () => {
    expect(withTools).toContain("courtesyCompany.textContent = d.listingCompany");
    const m =
      withTools.match(
        /listingCompany: apiData\.list_office_name \|\| \(apiData\.agent_info \|\| \{\}\)\.ListOfficeName \|\| ''/g,
      ) || [];
    expect(m.length).toBe(2);
  });

  it("no rendered agent/company key is agent_info-first", () => {
    expect(withTools).not.toMatch(/listing(?:AgentName|Company):\s*\(apiData\.agent_info/);
  });

  it("viewer reads no agent email/phone from agent_info (nothing else to convert)", () => {
    expect(withTools).not.toMatch(/agent_info[^;]*ListAgent(?:Email|DirectPhone)/);
  });
});
