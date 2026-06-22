/// <reference types="jest" />
/**
 * Item A (CRM blocker, board #415) — the rentals dashboard "View Listing" path must open the
 * canonical typed-first `RENTAL-FORM-REDESIGN.html` (`?id=` edit mode), NOT the legacy
 * `RENTAL-FORM-WITH-TOOLS.html`, which hydrates agent/company from `agent_info` JSON
 * NON-typed-first.
 *
 * Why this gates Phase D: before any `agent_info` DROP, no REACHABLE/served CRM form may depend
 * on `agent_info` non-typed-first — otherwise the form renders blank agent/company once the
 * column is gone. REDESIGN reads the typed columns first (typed-first), so repointing the
 * reachable path to it removes the blocker.
 *
 * These are STATIC source assertions: the dashboard panel JS and the forms are served as-is
 * (NOT inlined into index-built.html — that bundle is the /crm/search shell built from
 * index.html), so the source file IS the served file.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const CRM = join(process.cwd(), "public", "crm");
const rentalsPanel = readFileSync(join(CRM, "js", "dashboard", "panels", "rentals-crm", "index.js"), "utf8");

function allCrmJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allCrmJs(p));
    else if (entry.endsWith(".js")) out.push(p);
  }
  return out;
}

describe("Item A — rentals 'View Listing' opens the typed-first REDESIGN form", () => {
  it("_viewListing opens /crm/RENTAL-FORM-REDESIGN.html?id=", () => {
    expect(rentalsPanel).toContain("/crm/RENTAL-FORM-REDESIGN.html?id=");
  });

  it("_viewListing no longer references RENTAL-FORM-WITH-TOOLS.html", () => {
    expect(rentalsPanel).not.toContain("RENTAL-FORM-WITH-TOOLS.html");
  });
});

describe("Static guard — no served CRM JS opens a non-typed-first *-WITH-TOOLS form", () => {
  it("no public/crm/js file references any *-WITH-TOOLS.html form", () => {
    const offenders = allCrmJs(join(CRM, "js"))
      .filter((f) => /(?:RENTAL|SALE)-FORM-WITH-TOOLS\.html/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });
});

describe("Reachable rental edit form (REDESIGN) hydrates agent/company typed-first", () => {
  const rentalForm = readFileSync(join(CRM, "RENTAL-FORM-REDESIGN.html"), "utf8");

  it("reads list_agent_full_name before agent_info.ListAgentFullName", () => {
    expect(rentalForm).toContain("list_agent_full_name || agentInfo.ListAgentFullName");
  });

  it("supports ?id= edit mode (existing-listing hydration path present)", () => {
    expect(rentalForm).toMatch(/URLSearchParams\(window\.location\.search\)\.get\(['"]id['"]\)/);
  });
});
