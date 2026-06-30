/// <reference types="jest" />
/**
 * Follow-up to #460: make data/compliance/prohibited-terms.json the SINGLE source of truth for the
 * guardrails Fair Housing content lint, eliminating the stale src/ copy that left the CI lint ~64
 * terms (incl. all of #460's new terms) behind the runtime write-gate.
 *
 * Proves:
 *   1. the stale src/ copy is gone (single source)
 *   2. guardrails loads the canonical data/ file (src/ not referenced)
 *   3. the Cotality/Trestle API field-dictionary / metadata reference (MASTER_REGISTRY.json) is
 *      excluded from the advertising scan (it documents fields like SeniorCommunityYN — not ad copy)
 *   4. public-facing neighborhood content is STILL scanned (not excluded)
 *   5. the corrected neighborhood phrases no longer contain school-proximity language
 *   6. #460's new Fair Housing terms are present in the canonical list the lint now enforces
 *   7. guardrails runs green end-to-end against the canonical list
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "../..");
const guardrailsSrc = fs.readFileSync(path.join(ROOT, "scripts/ci/guardrails.mjs"), "utf8");

describe("guardrails prohibited-terms: single canonical source (data/)", () => {
  it("1. the stale src/compliance/prohibited-terms.json copy is removed", () => {
    expect(fs.existsSync(path.join(ROOT, "src/compliance/prohibited-terms.json"))).toBe(false);
  });

  it("2. guardrails loads the canonical data/ file and does not reference the src/ copy", () => {
    expect(guardrailsSrc).toMatch(/data\/compliance\/prohibited-terms\.json/);
    expect(guardrailsSrc).not.toMatch(/src\/compliance\/prohibited-terms\.json/);
  });

  it("3. Cotality/Trestle field-dictionary metadata (MASTER_REGISTRY.json) is excluded from the ad scan", () => {
    expect(guardrailsSrc).toMatch(/MASTER_REGISTRY/);
  });

  it("4. public-facing neighborhood JSON is NOT excluded (still scanned)", () => {
    // The neighborhoods files must remain in scope — they render on public routes.
    expect(guardrailsSrc).not.toMatch(/neighborhoods?\\?\.?json/i);
  });

  it("5. corrected neighborhood phrases drop school-proximity language (no family/school proxy)", () => {
    for (const f of ["data/manhattan-neighborhoods.json", "data/staten-island-neighborhoods.json"]) {
      const txt = fs.readFileSync(path.join(ROOT, f), "utf8").toLowerCase();
      expect(txt).not.toContain("near schools");
      expect(txt).not.toContain("near school");
    }
  });

  it("6. #460's new Fair Housing terms are in the canonical list the lint enforces", () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/compliance/prohibited-terms.json"), "utf8"));
    const flat = (data.flatList as string[]).map((t) => t.toLowerCase());
    for (const term of ["no cityfheps", "adults only", "55+", "must pass background check", "section 8 not accepted"]) {
      expect(flat).toContain(term);
    }
  });

  it("8. guardrails derives terms from the authoritative `categories` (covers terms flatList omits)", () => {
    // The runtime write-gate (rls-enforcement.ts) iterates `categories`; the denormalized flatList can
    // omit category terms (e.g. `family-friendly`, `top schools`). The lint must read categories too,
    // or content with those terms passes CI while the runtime gate blocks it (Codex #461).
    expect(guardrailsSrc).toMatch(/data\.categories/);
  });

  it("9. content surfaced by the category terms is clean (no 'family-friendly' steering phrase)", () => {
    const txt = fs.readFileSync(path.join(ROOT, "src/data/geography/neighborhoods.json"), "utf8").toLowerCase();
    expect(txt).not.toContain("family-friendly");
  });

  it("10. flatList is a COMPLETE mirror of categories (no category term missing — no internal drift)", () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/compliance/prohibited-terms.json"), "utf8"));
    const catTerms = [...new Set(Object.values(data.categories as Record<string, { terms: string[] }>).flatMap((c) => c.terms || []))];
    const flat = new Set((data.flatList as string[]).map((t) => t.toLowerCase()));
    const missing = catTerms.filter((t) => !flat.has(t.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it("7. guardrails runs green end-to-end against the canonical list", () => {
    // Exits 0 (PASS). Throws on non-zero exit.
    const out = execSync("node scripts/ci/guardrails.mjs", { cwd: ROOT, encoding: "utf8" });
    expect(out).toMatch(/Guardrails passed/i);
  });
});
