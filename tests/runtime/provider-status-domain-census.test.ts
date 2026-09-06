/// <reference types="jest" />
/**
 * ONE TRUTH — status-domain and field-contract guards (Search Consolidation Packet 2 closure, round 3).
 *
 *   Cotality  = sole provider field contract (dated live pulls) — field existence, spelling, enums.
 *   REBNY/UCBA = compliance rules applied AFTER the field contract.
 *   Mallan     = its own workflow / business status and persistence model.
 *
 * No Mallan-only status under a provider field name; every provider enum value a writer emits is a
 * live member; no REBNY/RLS CSV acts as a provider field authority. Each guard names offenders.
 */
import * as fs from "fs";
import * as path from "path";
import { normalizePayload, buildPersistenceRecord } from "@/lib/compliance/normalizer";
import { REBNY_UCBA_RULES } from "@/lib/compliance/rebny-ucba-rules";
import { MALLAN_FORM_CONTRACT, MALLAN_INTERNAL_KEYS } from "@/lib/listings/mallan-form-contract";
import { MALLAN_STORAGE_STATUSES, MALLAN_ONLY_STATUSES, cotalityStandardStatusForMallan } from "@/lib/listings/mallan-status";
import { LIVE_PROPERTY_FIELDS, COTALITY_STANDARD_STATUS_MEMBERS, liveEnumMembers, isCotalityStandardStatus } from "@/lib/cotality/live-contract";
import { mallanRecord } from "@/lib/search/engine/hydrate";
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
import { CANONICAL_STATUSES, CRM_WORKFLOW_STATUSES } from "@/lib/crm/status-mapping";
import { applyServerFormMapping } from "@/lib/crm/listing-form-mapping";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
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
const runtimeFiles = () => ["app", "lib", "prisma"].flatMap((d) => walk(d));
const PROVIDER_DECISION_KEYS = ["MlsStatus", "StandardStatus", "Permission", "Permissions"];
const knownKey = (k: string) => LIVE_PROPERTY_FIELDS.has(k) || MALLAN_INTERNAL_KEYS.includes(k);

describe("no second field authority", () => {
  it("the monolithic REBNY field table is gone and no runtime file claims an RLS-first authority order", () => {
    expect(exists("lib/compliance/rebny-field-tables.ts")).toBe(false);
    // code lines only: the successor modules cite the retired file by name in their history comments
    const hits = runtimeFiles().filter((f) => /Single Canonical Field Authority|RLS overrides RESO|RLS TRUMPS ALL|REBNY_FIELD_TABLES|rebny-field-tables|rls-rules\.json|compliance\/data-loader/.test(codeOnly(read(f))));
    expect(hits).toEqual([]);
  });
  it("the compliance rules only name live Cotality fields or declared Mallan-internal keys", () => {
    const r = REBNY_UCBA_RULES;
    const names = new Set<string>([
      ...(r.requiredFields.agentSubmitted as readonly string[]),
      ...(r.requiredFields.systemGenerated as readonly string[]),
      ...(r.removedFields as readonly string[]),
      ...r.conditionalRules.flatMap((rule) => [...Object.keys(rule.appliesWhen as Record<string, unknown>), ...(rule.requireFields as readonly string[])]),
    ]);
    const bad = [...names].filter((n) => !knownKey(n));
    expect(bad).toEqual([]);
  });
  it("the Mallan persistence map only stores live Cotality fields or declared Mallan-internal keys; no provider status / permission entry", () => {
    const keys = Object.keys(MALLAN_FORM_CONTRACT.persistenceMap);
    expect(keys.filter((k) => !knownKey(k))).toEqual([]);
    for (const k of PROVIDER_DECISION_KEYS) expect(keys).not.toContain(k);
    expect(keys).toContain("_mallanStatus");
    expect(keys).toContain("_mallanPermission");
  });
  it("form aliases target live fields or Mallan-internal keys, and never redirect one live Cotality field into another", () => {
    const aliases = MALLAN_FORM_CONTRACT.aliasToCanonical as Record<string, string>;
    const badTargets = Object.entries(aliases).filter(([, to]) => !knownKey(to)).map(([k, v]) => `${k}→${v}`);
    expect(badTargets).toEqual([]);
    const liveToLive = Object.entries(aliases).filter(([from, to]) => LIVE_PROPERTY_FIELDS.has(from) && LIVE_PROPERTY_FIELDS.has(to) && from !== to).map(([k, v]) => `${k}→${v}`);
    expect(liveToLive).toEqual([]);
    for (const k of ["MlsStatus", "Permission", "Permissions", "status", "permission"]) expect(aliases[k]).toMatch(/^_mallan/);
  });
  it("form value aliases only write live enum members (or Mallan values under a Mallan key)", () => {
    const va = MALLAN_FORM_CONTRACT.valueAliases as Record<string, Record<string, string>>;
    const bad: string[] = [];
    for (const [field, map] of Object.entries(va)) {
      if (field.startsWith("_mallan")) continue;
      const live = liveEnumMembers(field);
      for (const v of Object.values(map)) if (live && !live.includes(v)) bad.push(`${field}=${v}`);
    }
    expect(bad).toEqual([]);
    expect(va).not.toHaveProperty("MlsStatus");
    expect(va).not.toHaveProperty("Permission");
  });
  it("the exclusive-agreement rule lists live ListingAgreement members only", () => {
    const live = liveEnumMembers("ListingAgreement")!;
    expect((REBNY_UCBA_RULES.exclusiveListingAgreements as readonly string[]).filter((v) => !live.includes(v))).toEqual([]);
  });
});

describe("Mallan status ≠ Cotality status (raw_data never carries a fake provider fact)", () => {
  it("the normalizer never emits a provider-named status / permission for a Mallan-authored payload", () => {
    const legacy = { status: "Sold", MlsStatus: "Rented", StandardStatus: "Draft", Permissions: "OwnerOptOut", Permission: "Private", participantOnlyYN: true, saleStatus: "OfferOut" };
    const { normalized } = normalizePayload(legacy);
    for (const k of PROVIDER_DECISION_KEYS) expect(normalized).not.toHaveProperty(k);
    expect(normalized._mallanStatus).toBeDefined();
    expect(normalized._mallanPermission).toBeDefined();
    const rec = buildPersistenceRecord(normalized);
    for (const k of PROVIDER_DECISION_KEYS) expect(rec.raw_data).not.toHaveProperty(k);
    expect(rec.topLevel).not.toHaveProperty("status"); // the routes set the column from _mallanStatus
  });
  it("the write path (server form mapping) never emits a provider-named status / permission for any workflow or canonical input", () => {
    const inputs: Record<string, unknown>[] = [];
    for (const w of CRM_WORKFLOW_STATUSES) inputs.push({ saleStatus: w }, { rentalStatus: w });
    for (const c of CANONICAL_STATUSES) inputs.push({ MlsStatus: c }, { StandardStatus: c }, { status: c });
    inputs.push({ Permission: "OwnerOptOut" }, { Permissions: "RLS-Participant" });
    for (const input of inputs) for (const ft of ["sale", "rent"] as const) {
      const out = applyServerFormMapping(input, ft).body;
      for (const k of PROVIDER_DECISION_KEYS) expect(out).not.toHaveProperty(k);
    }
  });
  it("Mallan-only statuses exist internally and are not live members", () => {
    for (const s of ["Draft", "Sold", "Rented", "Cancelled"]) {
      expect(MALLAN_STORAGE_STATUSES).toContain(s);
      expect(MALLAN_ONLY_STATUSES).toContain(s);
      expect(isCotalityStandardStatus(s)).toBe(false);
    }
  });
  it("a provider-shaped Mallan row carries ONLY a verified live member under StandardStatus (or none) and its Mallan status under the Mallan key", () => {
    for (const s of MALLAN_STORAGE_STATUSES) {
      const row = {
        listing_id: "SL-0001", status: s, listing_type: "sale", property_sub_type: null, list_price: 1000000, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, living_area: null,
        borough: "Manhattan", neighborhood: null, city: "New York", postal_code: "10128", address: {}, media: [], photo_count: 0, listing_contract_date: null, updated_at: new Date(),
        list_agent_full_name: null, list_office_name: null, raw_data: {}, days_on_market: null, cumulative_days_on_market: null, listing_media: [],
      } as unknown as Parameters<typeof mallanRecord>[0];
      const rec = mallanRecord(row);
      expect(rec._mallanStatus).toBe(s);
      if (rec.StandardStatus !== null) expect(isCotalityStandardStatus(rec.StandardStatus)).toBe(true);
      expect(rec.StandardStatus).toBe(cotalityStandardStatusForMallan(s));
      expect(rec).not.toHaveProperty("MlsStatus");
    }
    expect(mallanRecord({ status: "Draft", listing_id: "SL-1", listing_type: "sale", address: {}, media: [], listing_media: [], updated_at: new Date(), raw_data: {} } as unknown as Parameters<typeof mallanRecord>[0]).StandardStatus).toBeNull();
  });
  it("the canonical mapper parses a provider status against the exact live domain and stores it in Mallan vocabulary", () => {
    const base = { ListingId: "RLS1", ListingKey: "1", PropertyType: "Residential", ListPrice: 1, ModificationTimestamp: "2026-09-01T00:00:00Z", Permission: "IDX" };
    for (const live of COTALITY_STANDARD_STATUS_MEMBERS) {
      const m = mapTrestleToPrisma({ ...base, StandardStatus: live });
      expect(MALLAN_STORAGE_STATUSES).toContain(m.status);
      expect(m.status).toBe(live === "Canceled" ? "Cancelled" : live);
    }
    for (const bad of ["Sold", "Rented", "Cancelled", "closed", "ACTIVE", "Draft"]) {
      expect(() => mapTrestleToPrisma({ ...base, StandardStatus: bad })).toThrow(/StandardStatus/);
    }
  });
  it("no runtime write puts a Mallan status under MlsStatus / StandardStatus, and the enforcement layer reads the Mallan key", () => {
    const writers = runtimeFiles().filter((f) => /\.tsx?$/.test(f) && /MlsStatus:\s*(newStatus|canonical|status\b|mallan)/.test(codeOnly(read(f))));
    expect(writers).toEqual([]);
    const enf = codeOnly(read("lib/compliance/rls-enforcement.ts"));
    expect(enf).not.toMatch(/payload\.MlsStatus|payload\.StandardStatus/);
    expect(enf).toMatch(/payload\._mallanStatus/);
    expect(codeOnly(read("app/api/crm/listings/[id]/status/route.ts"))).toMatch(/_mallanStatus: newStatus/);
    expect(codeOnly(read("app/api/crm/listings/route.ts"))).toMatch(/body\._mallanStatus/);
    expect(codeOnly(read("app/api/crm/listings/[id]/route.ts"))).toMatch(/merged\._mallanStatus/);
  });
  it("the Search engine represents Mallan rows through the verified mapping only", () => {
    expect(codeOnly(read("lib/search/engine/hydrate.ts"))).toMatch(/StandardStatus: cotalityStandardStatusForMallan\(r\.status\)/);
    expect(codeOnly(read("lib/search/engine/universe.ts"))).toMatch(/mallanStorageStatusesForCotality\(c\.standardStatus\)/);
  });
  it("the forms send the permission decision under the Mallan key, never the provider field", () => {
    for (const f of ["public/crm/SALE-FORM-REDESIGN.html", "public/crm/RENTAL-FORM-REDESIGN.html"]) {
      const src = codeOnly(read(f));
      expect(src).toMatch(/data\._mallanPermission =/);
      expect(src).not.toMatch(/data\.Permissions? =/);
    }
  });
  it("the mapper never describes Mallan vocabulary as the provider's canonical spelling", () => {
    expect(read("lib/idx/trestle-mapper.ts")).not.toMatch(/RESO canonical|canonical REBNY\/Trestle|RESO StandardStatus values that/);
    expect(codeOnly(read("lib/idx/trestle-mapper.ts"))).toMatch(/isCotalityStandardStatus\(raw\.StandardStatus\)/);
  });
});
