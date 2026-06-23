/// <reference types="jest" />
/**
 * Phase D step 3 / Codex #429 P2 — the reachable CRM sale viewer
 * `public/crm/SALE-FORM-WITH-TOOLS.html` (served at `/crm/sale-view` via the vercel.json
 * rewrite and opened by the dashboard "View" button in
 * public/crm/js/dashboard/workspace.js:4833) must hydrate listing agent/company TYPED-FIRST.
 *
 * Why: #429 removes `agent_info` from the Prisma client, so GET /api/crm/listings/[id]
 * (findUnique, no select → sanitizeForCRM spread) no longer returns a top-level `agent_info`.
 * The viewer previously read ONLY `(apiData.agent_info||{}).ListOfficeName`, so the courtesy
 * company would render blank after deploy even though the typed column `list_office_name`
 * (which sanitizeForCRM preserves) is present in the payload.
 *
 * #423 no-op trap (mirrored here): the SALE renderer reads `d.listingAgentName`
 * (SALE-FORM-WITH-TOOLS.html:5125) and `d.listingCompany` (:5184). The pre-fix object set the
 * UNUSED `listingAgent` key — a no-op the renderer never reads (the sale-side twin of Codex
 * #423). The fix writes the RENDERED key `listingAgentName` typed-first, in BOTH viewer blocks
 * (the initial fetch ~:4955 and the postMessage handler ~:4990).
 *
 * Fallback order stays safe: typed column → legacy agent_info JSON → ''. No agent email/phone
 * is read from agent_info (name + office are the only attribution reads).
 *
 * Static source assertions (the viewer HTML + route are served / executed as-is).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { sanitizeForCRM } from "@/lib/compliance/dto";

const CRM = join(process.cwd(), "public", "crm");
const saleViewer = readFileSync(join(CRM, "SALE-FORM-WITH-TOOLS.html"), "utf8");
const workspace = readFileSync(join(CRM, "js", "dashboard", "workspace.js"), "utf8");
const route = readFileSync(
  join(process.cwd(), "app", "api", "crm", "listings", "[id]", "route.ts"),
  "utf8",
);

describe("Codex #429 P2 — sale viewer is reachable (NOT orphaned)", () => {
  it("the dashboard View button opens /crm/sale-view", () => {
    expect(workspace).toContain("/crm/sale-view?id=");
  });
});

describe("Codex #429 P2 — sale viewer hydrates the RENDERED keys typed-first", () => {
  it("the visible agent field is rendered from d.listingAgentName (the rendered key)", () => {
    expect(saleViewer).toContain("viewerSetVal('saleListingAgentSearch', d.listingAgentName)");
  });

  it("the courtesy company is rendered from d.listingCompany (the rendered key)", () => {
    expect(saleViewer).toContain("courtesyCompany.textContent = d.listingCompany");
  });

  it("object sets listingAgentName typed-first in BOTH viewer blocks", () => {
    const m =
      saleViewer.match(
        /listingAgentName: apiData\.list_agent_full_name \|\| \(apiData\.agent_info \|\| \{\}\)\.ListAgentFullName \|\| ''/g,
      ) || [];
    expect(m.length).toBe(2);
  });

  it("object sets listingCompany typed-first in BOTH viewer blocks", () => {
    const m =
      saleViewer.match(
        /listingCompany: apiData\.list_office_name \|\| \(apiData\.agent_info \|\| \{\}\)\.ListOfficeName \|\| ''/g,
      ) || [];
    expect(m.length).toBe(2);
  });

  // Regression guard for the #423-style no-op: the prior object wrote the UNUSED `listingAgent`
  // key, which the renderer never reads. It must stay gone.
  it("does NOT write the unused listingAgent key (the #423 no-op trap)", () => {
    expect(saleViewer).not.toContain("listingAgent: (apiData");
    expect(saleViewer).not.toContain("listingAgent: apiData");
    expect(saleViewer).not.toMatch(/listingAgent:\s*\(apiData\.agent_info/);
  });

  it("no rendered agent/company key is agent_info-first", () => {
    expect(saleViewer).not.toMatch(/listing(?:AgentName|Company):\s*\(apiData\.agent_info/);
  });
});

describe("Codex #429 P2 — GET safety net exposes typed columns without reintroducing agent_info", () => {
  it("GET route pins the typed attribution columns the viewers need", () => {
    expect(route).toMatch(/sanitized\.list_agent_full_name\s*=\s*listing\.list_agent_full_name/);
    expect(route).toMatch(/sanitized\.list_office_name\s*=\s*listing\.list_office_name/);
  });

  it("GET route never synthesizes or reintroduces a top-level agent_info", () => {
    expect(route).not.toMatch(/sanitized\.agent_info\s*=/);
    expect(route).not.toMatch(/agent_info:\s*true/);
  });

  it("sanitizeForCRM preserves typed attribution columns and adds no agent_info", () => {
    const out = sanitizeForCRM({
      list_agent_full_name: "Jane Agent",
      list_office_name: "Mallan Real Estate Inc.",
    });
    expect(out.list_agent_full_name).toBe("Jane Agent");
    expect(out.list_office_name).toBe("Mallan Real Estate Inc.");
    expect(out.agent_info).toBeUndefined();
  });
});
