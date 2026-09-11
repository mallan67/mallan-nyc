import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("Codex Risk Cleanup P1 static guards", () => {
  it("CRM search does not collect or locally filter Open House, transit, or grid criteria", () => {
    const src = readFile("public/crm/js/search/search-engine.js");

    expect(src).not.toMatch(/criteria\.openHouseDateFrom\s*=/);
    expect(src).not.toMatch(/criteria\.openHouseDateTo\s*=/);
    expect(src).not.toMatch(/criteria\._transitLines\s*=/);
    expect(src).not.toMatch(/criteria\._transitBounds\s*=/);
    expect(src).not.toMatch(/criteria\._gridBounds\s*=/);
    expect(src).not.toMatch(/TransitSearch\.isNearStation/);
    expect(src).not.toMatch(/ManhattanGrid\.isInBounds/);
    expect(src).not.toMatch(/listing\.openHouseDate/);
    // Search Consolidation Packet 1: the browser-local membership engine (filterListings)
    // and its server-ignored-criteria helper are gone; these criteria are REFUSED by name
    // by the contract-driven serializer, never filtered locally.
    expect(src).not.toMatch(/function filterListings\(/);
    expect(src).not.toMatch(/function _hasServerIgnoredCriteria\(/);
    expect(src).toMatch(/\['_transitBounds',\s*'Transit'\]/);
    expect(src).toMatch(/\['_gridBounds',\s*'Map grid'\]/);
  });

  it("agent inquiry uses delegated data attributes, not inline onclick", () => {
    const src = readFile("public/crm/js/search/pagination.js");

    expect(src).toMatch(/data-agent-inquiry-listing-id/);
    expect(src).toMatch(/document\.addEventListener\(['"]click['"]/);
    expect(src).toMatch(/String\(l\.lid \|\| ''\) === listingId/);
    expect(src).not.toMatch(/onclick=["']sendAgentInquiry\(/);
    expect(src).not.toMatch(/void html/);
  });

  it("sendEmail console logging is redacted to categories", () => {
    const src = readFile("lib/email/sendgrid.ts");

    expect(src).not.toMatch(/To:\s*\$\{to\}/);
    expect(src).not.toMatch(/Subject:\s*\$\{subject\}/);
    expect(src).not.toMatch(/console\.error\([^)]*errorMessage/);
    expect(src).not.toMatch(/error:\s*errorMessage/);
    expect(src).toMatch(/error_category/);
    expect(src).toMatch(/classifyEmailProviderError/);
  });

  it("market report generator distinguishes source-data failure from AI fallback", () => {
    const src = readFile("lib/market-report/generator.ts");

    expect(src).toMatch(/MARKET_REPORT_DATA_UNAVAILABLE/);
    expect(src).toMatch(/data_failed:\s*true/);
    expect(src).toMatch(/throw error/);
    expect(src).toMatch(/ai_failed:\s*false/);
  });

  it("repo hygiene supports an optional committed-change base ref", () => {
    const src = readFile("scripts/ci/repo-hygiene.mjs");

    expect(src).toMatch(/REPO_HYGIENE_BASE/);
    expect(src).toMatch(/git\(`diff --name-only \$\{REPO_HYGIENE_BASE\}\.\.\.HEAD`\)/);
    expect(src).toMatch(/workingChanged/);
    expect(src).toMatch(/baseChanged/);
  });
});
