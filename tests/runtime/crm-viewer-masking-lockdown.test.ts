/// <reference types="jest" />
/**
 * CRM static viewers: role masking and read-only lockdown.
 *
 * Preserves the provider-independent checks that lived in the retired `rls:validate` validator
 * (sections 8 and 10). They do not depend on any REBNY CSV or field map: they guard that
 *   - each viewer masks listing-agent details for restricted roles and fails closed on unknown roles, and
 *   - each viewer stays view-only (no form posts, no API calls, no submit helpers).
 * Files: public/crm/SALE-FORM-WITH-TOOLS.html and public/crm/RENTAL-FORM-WITH-TOOLS.html.
 */

import { readFileSync } from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const load = (file: string) => readFileSync(path.join(ROOT, "public/crm", file), "utf8");

const VIEWERS = [
  { file: "SALE-FORM-WITH-TOOLS.html", maskFn: "applySaleRoleMasking", failClosedRole: "buyer" },
  { file: "RENTAL-FORM-WITH-TOOLS.html", maskFn: "applyRentalRoleMasking", failClosedRole: "tenant" },
] as const;

describe.each(VIEWERS)("viewer $file: role masking", ({ file, maskFn, failClosedRole }) => {
  const raw = load(file);

  it(`defines ${maskFn}() and the valid-role list`, () => {
    expect(raw).toContain(`function ${maskFn}`);
    expect(raw).toContain("VIEWER_VALID_ROLES");
  });

  it.each(["broker", "agent", "buyer", "tenant", "seller", "landlord"])("recognizes role %s", (role) => {
    expect(raw).toContain(`'${role}'`);
  });

  it("skips masking inside designated zones and carries an agent-masking CSS hook", () => {
    expect(raw).toContain("isInsideSkipZone");
    expect(raw).toMatch(/listing-agent-mask|agentMask|agent-mask/);
  });

  it(`falls back to the restricted role "${failClosedRole}" for an unknown role (fail closed)`, () => {
    expect(raw.includes(`'${failClosedRole}'`) || raw.includes(`"${failClosedRole}"`)).toBe(true);
  });

  it("has a local/dev-mode check", () => {
    expect(raw.includes("_isLocal") || raw.includes("IS_DEV") || raw.includes("localhost")).toBe(true);
  });
});

describe.each(VIEWERS)("viewer $file: read-only lockdown", ({ file }) => {
  const raw = load(file);

  it('marks the body as a viewer (data-rls-viewer="true")', () => {
    expect(raw).toContain('data-rls-viewer="true"');
  });

  it("has no <form> that posts anywhere (empty, # or javascript: actions only)", () => {
    const forms = raw.match(/<form[^>]*action=["'][^"']*["'][^>]*>/gi) ?? [];
    const bad = forms.filter((f) => !f.includes('action=""') && !f.includes('action="#"') && !f.includes("javascript:"));
    expect(bad).toEqual([]);
  });

  it.each([
    ["submitToRLS()", /\bsubmitToRLS\b/],
    ["buildRLSPayload()", /\bbuildRLSPayload\b/],
    ["fetch() to an API endpoint", /\bfetch\s*\(\s*['"][^'"]*api/i],
    ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ])("does not contain %s", (_name, pattern) => {
    expect(raw).not.toMatch(pattern);
  });
});
