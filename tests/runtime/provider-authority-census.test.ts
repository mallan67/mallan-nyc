/// <reference types="jest" />
/**
 * ONE TRUTH — provider / feed authority census guards (Search Consolidation Packet 2 closure).
 *
 * Cotality/Trestle is the only provider and feed authority. These guards make the closure
 * durable: ONE provider→storage mapper, ONE storage→public projection (live records reach it
 * through the canonical chain), ONE status / property-type / permission interpretation, no
 * RealPlus identifier, no browser provider mapping, no static listing catalogue, every provider
 * field name verified against the dated live pulls. A grep alone is not proof; each guard states
 * what it proves and names offenders.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
/** Source with comment lines removed — history may be mentioned in comments; code may not use retired names. */
const codeOnly = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const liveFields = () => new Set<string>(JSON.parse(read("data/cotality-property-fields.live.json")).fields);
const liveEnums = () => JSON.parse(read("data/cotality-enums.live.json")).enums as Record<string, string[]>;

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
const runtimeFiles = () => ["app", "lib", "prisma"].flatMap((d) => walk(d));
const browserFiles = () => ["public/crm/js", "public/crm/html"].flatMap((d) => walk(d)).concat(fs.readdirSync(path.join(ROOT, "public/crm")).filter((f) => f.endsWith(".html")).map((f) => "public/crm/" + f));
const offenders = (files: string[], re: RegExp, opts: { comments?: boolean; except?: string[] } = {}) =>
  files.filter((f) => !(opts.except || []).includes(f) && re.test(opts.comments ? read(f) : codeOnly(read(f))));

describe("RealPlus has ZERO active role", () => {
  it("no RealPlus identifier or wording in active source (app, lib, CRM shell, forms, scripts, prisma)", () => {
    expect(activeFiles().filter((f) => /realplus/i.test(read(f)))).toEqual([]);
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

describe("ONE provider → storage mapper, ONE storage → public projection", () => {
  it("the duplicate provider→DTO mapper is gone and nothing defines or imports it", () => {
    expect(exists("lib/idx/mapping.ts")).toBe(false);
    expect(offenders(activeFiles(), /mapRESOToInternal|from ['"]@\/lib\/idx\/mapping['"]|idx\/mapping['"]|validateRESOResponse|\bRESO_FIELDS\b/, { except: ["scripts/ci-compliance-check.js"] })).toEqual([]);
  });
  it("no second public builder: toPublicDTO(IDXListing) and the IDXListing type are gone", () => {
    expect(offenders(runtimeFiles(), /\btoPublicDTO\(|\bIDXListing\b/)).toEqual([]);
    expect(read("lib/idx/public-dto.ts")).not.toMatch(/export function toPublicDTO\(/);
  });
  it("public listing routes consume live Cotality records ONLY through the canonical chain", () => {
    for (const f of ["app/api/listings/route.ts", "app/api/listings/[id]/route.ts", "app/api/agents/[slug]/listings/route.ts"]) {
      const src = codeOnly(read(f));
      expect(src).toMatch(/cotalityRecordsToPublicDTOs|cotalityRecordToPublicDTO/);
      expect(src).not.toMatch(/mapRESOToInternal|toPublicDTO\(/);
    }
    const chain = read("lib/idx/cotality-public-dto.ts");
    expect(chain).toMatch(/mapTrestleToPrisma\(/);
    expect(chain).toMatch(/dbListingToPublicDTO\(/);
  });
  it("every provider-row writer maps through mapTrestleToPrisma, or is the identity path / a Mallan-authored path", () => {
    const writers = activeFiles().filter((f) => /prisma\.listing\.(upsert|create)\(/.test(codeOnly(read(f))) && !/lib\/idx\/trestle-mapper\.ts$/.test(f));
    const bad = writers.filter((f) => {
      const src = read(f);
      return !(/mapTrestleToPrisma\(/.test(src) || f === "lib/listings/ensure-local-listing.ts" || /app\/api\/crm\/(convert|listings)\/route\.ts$/.test(f));
    });
    expect(bad).toEqual([]);
  });
  it("the ensured provider identity is source-owned (rls_eligible true) and gated by the canonical helper", () => {
    const src = read("lib/listings/ensure-local-listing.ts");
    expect(src).toMatch(/rls_eligible:\s*true/);
    expect(src).not.toMatch(/rls_eligible:\s*false/);
    expect(src).toMatch(/computeGateColumns\(/);
  });
});

describe("NO static parallel listing truth", () => {
  it("data/listings.json is gone and no runtime file imports a static listing catalogue", () => {
    expect(exists("data/listings.json")).toBe(false);
    expect(offenders(activeFiles(), /data\/listings\.json|listings\.json['"]|sample-listings|SAMPLE_LISTINGS|MOCK_LISTINGS/)).toEqual([]);
  });
  it("the public detail route falls back to canonical Mallan storage only, and fails loud on a provider outage", () => {
    const src = read("app/api/listings/[id]/route.ts");
    expect(src).toMatch(/prisma\.listing\.findUnique\(/);
    expect(src).toMatch(/filterDisplayableDbListings\(/);
    expect(src).toMatch(/status: 503/);
    expect(src).not.toMatch(/listingsData/);
  });
});

describe("the canonical mapper fabricates no provider fact", () => {
  it("refuses an absent StandardStatus / ListPrice / ModificationTimestamp / PropertyType instead of defaulting", () => {
    const src = codeOnly(read("lib/idx/trestle-mapper.ts"));
    expect(src).toMatch(/class UnrepresentableProviderRecordError/);
    expect(src).not.toMatch(/raw\.StandardStatus \|\| raw\.MlsStatus \|\| "Active"/);
    expect(src).not.toMatch(/String\(raw\.ListPrice\) : "0"/);
    expect(src).not.toMatch(/: new Date\(\);\s*\n\s*const contractDate/);
    for (const field of ["StandardStatus", "PropertyType", "ListPrice", "ModificationTimestamp"]) {
      expect(src).toContain(`new UnrepresentableProviderRecordError("${field}"`);
    }
  });
  it("normalizeStandardStatus never invents Active and computeGateColumns closes the gate on an unknown status", () => {
    const src = codeOnly(read("lib/idx/trestle-mapper.ts"));
    expect(src).not.toMatch(/return 'Active';/);
    expect(src).toMatch(/status_known/);
  });
  it("no alias table: the mapper reads every live field by its own name", () => {
    expect(codeOnly(read("lib/idx/trestle-mapper.ts"))).not.toMatch(/RESO_TO_RLS_RENAMES|COTALITY_FIELD_ALIASES|\bALL_RLS_FIELDS\b|\bREQUIRED_RLS_FIELDS\b|IDX_PLUS_EXCLUDED_FIELDS/);
  });
});

describe("live Cotality metadata verifies every provider field used", () => {
  it("the mapper's field categories and the IDX Plus select are live Property fields — none from a REBNY spec", () => {
    const live = liveFields();
    const src = read("lib/idx/trestle-mapper.ts");
    const start = src.indexOf("const B1_ADDRESS"); const end = src.indexOf("export const COTALITY_PROPERTY_FIELDS");
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const names = [...codeOnly(src.slice(start, end)).matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(300);
    expect(names.filter((n) => !live.has(n))).toEqual([]);
  });
  it("the engine select list is entirely live Cotality Property fields", () => {
    const live = liveFields();
    const names = [...read("lib/search/engine/select.ts").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
    expect(names.filter((n) => !live.has(n))).toEqual([]);
  });
  it("phantom names never sit in an active provider map (only in the legacy-form-key module and in tests)", () => {
    const hits = offenders(["lib/idx", "lib/search", "app/api/idx", "app/api/listings"].flatMap((d) => walk(d)), /["']IDXEntireListingDisplayYN["']|["']ParticipantOnlyYN["']|["']IDXParticipationYN["']|["']SyndicateYN["']/);
    expect(hits).toEqual([]);
    const ctl = read("lib/idx/trestle-mapper.ts").match(/const CONTROL_FIELDS = new Set\(\[([\s\S]*?)\]\)/)![1];
    expect(ctl).not.toMatch(/IDXEntireListingDisplayYN|ParticipantOnlyYN|VOW|SyndicateYN/);
  });
  it("the browser field map is display annotation: every value is a live Cotality Property field or an explicit computed marker", () => {
    const live = liveFields();
    const src = read("public/crm/js/core/reso-field-map.js");
    expect(src).toContain("DISPLAY-ANNOTATION VOCABULARY, NOT PROVIDER AUTHORITY");
    const block = src.match(/var RESO_FIELD_MAP = \{([\s\S]*?)\n\s*\};/);
    expect(block).toBeTruthy();
    const entries = [...block![1].matchAll(/^\s*([A-Za-z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]] as const);
    expect(entries.length).toBeGreaterThan(50);
    expect(entries.filter(([, v]) => !v.startsWith("computed:") && !live.has(v)).map(([k, v]) => `${k}=${v}`)).toEqual([]);
    expect(src).not.toMatch(/function\s+map[A-Za-z]*\(|toRESO|fromRESO|mapListingTo|mapRESOTo/);
  });
});

describe("ONE status, ONE property-type, ONE permission interpretation", () => {
  it("normalizeStandardStatus, computeGateColumns, derivePermissionGates, inferListingType are each defined once (the canonical mapper)", () => {
    for (const fn of ["normalizeStandardStatus", "computeGateColumns", "derivePermissionGates", "inferListingType"]) {
      const defs = runtimeFiles().filter((f) => new RegExp(`function ${fn}\\(`).test(codeOnly(read(f))));
      expect(defs).toEqual(["lib/idx/trestle-mapper.ts"]);
    }
  });
  it("displayPropertyType is the one display property-type implementation and every other property-type function delegates", () => {
    const defs = runtimeFiles().filter((f) => /function displayPropertyType\(/.test(codeOnly(read(f))));
    expect(defs).toEqual(["lib/idx/display-property-type.ts"]);
    expect(codeOnly(read("lib/idx/public-dto.ts"))).toMatch(/return displayPropertyType\(/);
    expect(codeOnly(read("lib/search/crm-idx-mapper.ts"))).toMatch(/return displayPropertyType\(/);
    // no independent CommonInterest → label table anywhere else
    const tables = offenders(runtimeFiles(), /['"]StockCooperative['"]\s*:\s*['"]Co-op['"]|case ['"]StockCooperative['"]:\s*return ['"]Co-op['"]/, { except: ["lib/idx/display-property-type.ts"] });
    expect(tables).toEqual([]);
  });
  it("the Search engine derives gates and inventory type from the canonical helpers, never its own", () => {
    const mapper = codeOnly(read("lib/search/crm-idx-mapper.ts"));
    expect(mapper).toMatch(/computeGateColumns\(/);
    expect(mapper).toMatch(/derivePermissionGates\(/);
    expect(mapper).toMatch(/inferListingType\(raw\)/);
    expect(mapper).toMatch(/normalizeStandardStatus\(/);
    expect(mapper).not.toMatch(/isIdxPlusDisplayFlagOn|ownerOptOut:\s*false|participantOnly:\s*false/);
    expect(codeOnly(read("lib/search/engine/hydrate.ts"))).toMatch(/derivePermissionGates\(raw\)/);
  });
  it("no runtime file re-implements the IDX Plus display-flag convention outside the canonical helpers", () => {
    const hits = offenders(runtimeFiles(), /InternetEntireListingDisplayYN\s*!==\s*false/, { except: ["lib/idx/trestle-mapper.ts", "lib/compliance/gates.ts", "lib/search/engine/hydrate.ts"] });
    expect(hits).toEqual([]);
  });
});

describe("the SERVER owns the Mallan form → Cotality vocabulary conversion (no browser provider mapping)", () => {
  it("no browser file defines or calls a CRM → provider status / property-type mapper", () => {
    expect(exists("public/crm/js/compliance/reso-mappers.js")).toBe(false);
    const hits = offenders(browserFiles(), /CRM_TO_RESO_STATUS|CRM_TO_RESO_RENTAL_STATUS|getResoMlsStatus|getResoRentalMlsStatus|getResoPropertyFields|getBuildingTypeMapping/);
    expect(hits).toEqual([]);
    expect(read("public/crm/index-built.html")).not.toMatch(/CRM_TO_RESO_STATUS|function getResoMlsStatus|function getResoPropertyFields/);
  });
  it("the forms never assign provider-vocabulary status / type fields into the payload", () => {
    const forms = ["public/crm/SALE-FORM-REDESIGN.html", "public/crm/RENTAL-FORM-REDESIGN.html", "public/crm/SALE-FORM-WITH-TOOLS.html", "public/crm/RENTAL-FORM-WITH-TOOLS.html"];
    expect(offenders(forms, /data\.(MlsStatus|StandardStatus|PropertyType|PropertySubType|CommonInterest)\s*=/)).toEqual([]);
  });
  it("the CRM create / update / status routes derive and validate through lib/crm/listing-form-mapping.ts", () => {
    expect(codeOnly(read("app/api/crm/listings/route.ts"))).toMatch(/applyServerFormMapping\(body/);
    expect(codeOnly(read("app/api/crm/listings/[id]/route.ts"))).toMatch(/applyServerFormMapping\(body/);
    expect(codeOnly(read("app/api/crm/listings/[id]/status/route.ts"))).toMatch(/canonicalStatusFromForm\(requested\)/);
    const mapping = codeOnly(read("lib/crm/listing-form-mapping.ts"));
    expect(mapping).toMatch(/cotality-enums.live.json/);
    expect(mapping).not.toMatch(/['"]Commercial['"]\s*:\s*\{[^}]*PropertyType:\s*['"]Commercial['"]/);
  });
  it("every value the server may write is a live enum member (dated pull)", () => {
    const enums = liveEnums();
    const src = read("lib/crm/listing-form-mapping.ts");
    const pt = new Set(enums.PropertyType), st = new Set(enums.PropertySubType), ci = new Set(enums.CommonInterest);
    const subs = [...src.match(/const SUBTYPE = Object\.freeze\(\{([\s\S]*?)\}\)/)![1].matchAll(/:\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect(subs.filter((v) => !st.has(v))).toEqual([]);
    for (const v of ["Residential", "ResidentialLease", "CommercialSale", "CommercialLease", "Land"]) expect(pt.has(v)).toBe(true);
    for (const v of ["Condominium", "StockCooperative", "Condop", "RentalBuilding", "None"]) expect(ci.has(v)).toBe(true);
  });
});

describe("Search membership: ONE executor, no projection or browser matcher", () => {
  it("no runProjectionListingSearch, criteria-to-prisma or crm-idx-filter in runtime code", () => {
    expect(offenders(activeFiles(), /runProjectionListingSearch\(|criteria-to-prisma|crm-idx-filter/)).toEqual([]);
  });
  it("the Search route, Saved Search execute and the alert cron all consume lib/search/engine", () => {
    expect(read("app/api/idx/search/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
    expect(read("app/api/crm/saved-searches/[id]/execute/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
    expect(read("app/api/cron/search-alerts/route.ts")).toMatch(/from "@\/lib\/search\/engine\/executor"/);
  });
});

describe("RESO / RLS are vocabulary and compliance, never a provider", () => {
  it("the compliance RESO mapper (mapListingToRESO / mapRESOToListing) is gone and nothing imports it", () => {
    expect(exists("lib/compliance/reso-mapper.ts")).toBe(false);
    expect(offenders(activeFiles(), /reso-mapper|mapListingToRESO|mapRESOToListing|canExportToRESO/)).toEqual([]);
  });
  it("the RESO script suite is a read-only diagnostic kit against the live API, not a mapper", () => {
    expect(read("scripts/reso/README.md")).toMatch(/read-only diagnostic kit/);
    expect(read("scripts/reso/lib/trestle-client.js")).toMatch(/api\.cotality\.com\/trestle/);
    expect(walk("scripts/reso").filter((f) => /mapListingToRESO|mapRESOToListing|prisma\.listing\.(create|upsert|update)/.test(codeOnly(read(f))))).toEqual([]);
  });
  it("the provider mapper carries no RLS-named contract constant; REBNY/UCBA remain as compliance context only", () => {
    const src = read("lib/idx/trestle-mapper.ts");
    expect(src).not.toMatch(/export const [A-Z_]*RLS[A-Z_]*\b/);
    expect(src).toMatch(/COTALITY_PROPERTY_FIELDS|REQUIRED_COTALITY_FIELDS/);
    expect(read("lib/compliance/rls-eligibility.ts")).toMatch(/UCBA Art\. I, Sec\. 5\(F\)/);
    expect(read("lib/compliance/rls-eligibility.ts")).not.toMatch(/fetch|api\.cotality|trestle/i);
  });
  it("rls_eligible is documented as Mallan website-only state, never a Cotality field", () => {
    expect(read("lib/listings/mallan-source-identity.ts")).not.toMatch(/RealPlus/);
    expect(read("lib/idx/trestle-mapper.ts")).toMatch(/commercial\/website-only listings carry false/);
  });
});
