/// <reference types="jest" />
/**
 * ONE TRUTH — provider / feed authority census guards (Search Consolidation Packet 2 closure).
 *
 * Cotality/Trestle is the only provider and feed authority. These guards make the closure
 * durable: no RealPlus runtime identifier, no RESO mapper as a provider path, no projection or
 * browser Search executor, display vocabularies verified against the dated live field pull,
 * one provider→storage mapper. A grep alone is not proof; each guard states what it proves and
 * names offenders.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
/** Source with comment lines removed — history may be mentioned in comments; code may not use retired names. */
const codeOnly = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

function walk(dir: string, out: string[] = [], skip = new Set(["node_modules", ".next", "dist", ".git", "coverage", "tests", "__tests__"])): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!skip.has(ent.name)) walk(rel, out, skip); }
    else if (/\.(ts|tsx|js|mjs|cjs|html)$/.test(ent.name) && !/index-built\.html$/.test(ent.name)) out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}
const ACTIVE_ROOTS = ["app", "lib", "public/crm/js", "public/crm/html", "scripts", "prisma"];
const activeFiles = () => ACTIVE_ROOTS.flatMap((d) => walk(d)).concat(fs.readdirSync(path.join(ROOT, "public/crm")).filter((f) => f.endsWith(".html") && f !== "index-built.html").map((f) => "public/crm/" + f));

describe("RealPlus has ZERO active role", () => {
  it("no RealPlus identifier or wording in active source (app, lib, CRM shell, forms, scripts, prisma)", () => {
    const hits = activeFiles().filter((f) => /realplus/i.test(read(f)));
    expect(hits).toEqual([]);
  });
  it("no realPlusUrl API property anywhere in runtime or tests", () => {
    const hits = [...activeFiles(), ...walk("tests", [], new Set(["node_modules"]))].filter((f) => f !== "tests/runtime/provider-authority-census.test.ts" && /realPlusUrl/.test(read(f)));
    expect(hits).toEqual([]);
  });
  it("the listing URL contract names the REBNY listing URL honestly", () => {
    const urls = read("lib/crm/listing-urls.ts");
    expect(urls).toMatch(/rebnyListingUrl/);
    expect(urls).not.toMatch(/realPlus/i);
  });
});

describe("RESO is vocabulary / diagnostic only — never a provider path", () => {
  it("the compliance RESO mapper (mapListingToRESO / mapRESOToListing) is gone and nothing imports it", () => {
    expect(exists("lib/compliance/reso-mapper.ts")).toBe(false);
    const hits = activeFiles().filter((f) => /reso-mapper|mapListingToRESO|mapRESOToListing|canExportToRESO/.test(codeOnly(read(f))));
    expect(hits).toEqual([]);
  });
  it("the browser field map is display annotation: every value is a live Cotality Property field or an explicit computed marker", () => {
    const live = new Set<string>(JSON.parse(read("data/cotality-property-fields.live.json")).fields);
    const src = read("public/crm/js/core/reso-field-map.js");
    expect(src).toContain("DISPLAY-ANNOTATION VOCABULARY, NOT PROVIDER AUTHORITY");
    const block = src.match(/var RESO_FIELD_MAP = \{([\s\S]*?)\n\s*\};/);
    expect(block).toBeTruthy();
    const entries = [...block![1].matchAll(/^\s*([A-Za-z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]] as const);
    expect(entries.length).toBeGreaterThan(50);
    const bad = entries.filter(([, v]) => !v.startsWith("computed:") && !live.has(v)).map(([k, v]) => `${k}=${v}`);
    expect(bad).toEqual([]);
    // phantom / non-live names must not come back as map VALUES
    expect(block![1]).not.toMatch(/'(IDXEntireListingDisplayYN|ComingSoonTimestamp|SourceSystemModificationTimestamp)'/);
  });
  it("the browser field map never maps data (no function reads it to transform listing values)", () => {
    const src = read("public/crm/js/core/reso-field-map.js");
    expect(src).not.toMatch(/function\s+map[A-Za-z]*\(|toRESO|fromRESO|mapListingTo|mapRESOTo/);
  });
  it("the RESO script suite is a read-only diagnostic kit against the live API, not a mapper", () => {
    expect(read("scripts/reso/README.md")).toMatch(/read-only diagnostic kit/);
    expect(read("scripts/reso/lib/trestle-client.js")).toMatch(/api\.cotality\.com\/trestle/);
    const writers = walk("scripts/reso").filter((f) => /mapListingToRESO|mapRESOToListing|prisma\.listing\.(create|upsert|update)/.test(codeOnly(read(f))));
    expect(writers).toEqual([]);
  });
});

describe("Search membership: ONE executor, no projection or browser matcher", () => {
  it("no runProjectionListingSearch, criteria-to-prisma or crm-idx-filter in runtime code", () => {
    const offenders = activeFiles().filter((f) => /runProjectionListingSearch\(|criteria-to-prisma|crm-idx-filter/.test(codeOnly(read(f))));
    expect(offenders).toEqual([]);
  });
  it("the Search route, Saved Search execute and the alert cron all consume lib/search/engine", () => {
    expect(read("app/api/idx/search/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
    expect(read("app/api/crm/saved-searches/[id]/execute/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
    expect(read("app/api/cron/search-alerts/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
  });
  it("the engine select list is entirely live Cotality Property fields", () => {
    const live = new Set<string>(JSON.parse(read("data/cotality-property-fields.live.json")).fields);
    const names = [...read("lib/search/engine/select.ts").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
    expect(names.filter((n) => !live.has(n))).toEqual([]);
  });
});

describe("provider → Mallan storage: ONE mapper, ONE identity", () => {
  it("every provider-row writer maps through mapTrestleToPrisma, or is the identity path / a Mallan-authored path", () => {
    const writers = activeFiles().filter((f) => /prisma\.listing\.(upsert|create)\(/.test(codeOnly(read(f))) && !/lib\/idx\/trestle-mapper\.ts$/.test(f));
    const offenders = writers.filter((f) => {
      const src = read(f);
      const usesCanonical = /mapTrestleToPrisma\(/.test(src);
      const identityOnly = f === "lib/listings/ensure-local-listing.ts";
      const mallanAuthored = /app\/api\/crm\/(convert|listings)\/route\.ts$/.test(f);
      return !(usesCanonical || identityOnly || mallanAuthored);
    });
    expect(offenders).toEqual([]);
  });
  it("the ensured provider identity is source-owned (rls_eligible true) and gated by the canonical helper", () => {
    const src = read("lib/listings/ensure-local-listing.ts");
    expect(src).toMatch(/rls_eligible:\s*true/);
    expect(src).not.toMatch(/rls_eligible:\s*false/);
    expect(src).toMatch(/computeGateColumns\(/);
  });
});

describe("RLS is a compliance / business concept, not a provider", () => {
  it("rls_eligible is documented as Mallan website-only state, never a Cotality field", () => {
    expect(read("lib/listings/mallan-source-identity.ts")).not.toMatch(/RealPlus/);
    expect(read("lib/idx/trestle-mapper.ts")).toMatch(/commercial\/website-only listings carry false/);
  });
  it("the RLS eligibility classifier is a UCBA business rule (Art. I Sec. 5(F)), not a feed", () => {
    const src = read("lib/compliance/rls-eligibility.ts");
    expect(src).toMatch(/UCBA Art\. I, Sec\. 5\(F\)/);
    expect(src).not.toMatch(/fetch|api\.cotality|trestle/i);
  });
});
