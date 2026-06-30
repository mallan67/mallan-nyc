/// <reference types="jest" />
/**
 * P0b — Fair Housing scan must run on EVERY listing create, not only RLS-eligible ones.
 *
 * Gap: app/api/crm/listings/route.ts ran the content scan (inside assertRlsCompliantPayload) ONLY
 * inside `if (rlsEligible)`. Commercial / website-only / InHouse creates (rls_eligible=false) skipped
 * the Fair Housing scan entirely — but NYC HRL / Federal FHA advertising law applies to ALL
 * advertising regardless of RLS eligibility. This pins the unconditional scan.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: prismaMock } = buildPrismaMock();
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: "agent-1", userType: "agent", role: "AGENT" })),
  isAuthError: () => false,
}));

import { POST } from "@/app/api/crm/listings/route";

describe("POST /api/crm/listings — Fair Housing scan is unconditional (rls_eligible=false included)", () => {
  it("commercial / website-only create (rls_eligible=false) with discriminatory PublicRemarks → 422 Fair Housing", async () => {
    const req = makeRequest({
      method: "POST",
      body: {
        listing_type: "sale",
        rls_eligible: false, // website-only / commercial → previously SKIPPED the scan
        commercial_sub_type: "Office",
        PublicRemarks: "Great office conversion. No Section 8, adults only.",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/Fair Housing/i);
  });

  it("alias bypass closed: a website-only create using the `description` alias is still scanned → 422", async () => {
    // normalizePayload maps `description` → PublicRemarks (and `privateRemarks` → PrivateRemarks).
    // Scanning raw PascalCase fields before normalization would miss these and persist the text.
    const req = makeRequest({
      method: "POST",
      body: {
        listing_type: "sale",
        rls_eligible: false,
        commercial_sub_type: "Office",
        description: "Tenant must pass background check. No Section 8.", // alias for PublicRemarks
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/Fair Housing/i);
  });

  it.each([
    ["showingInstructions", "No Section 8."],
    ["agentRemarks", "Adults only, no felonies."],
    ["webHeadline", "Active adult 55+ — no CityFHEPS."],
  ])("un-aliased camelCase form field `%s` (persists in raw_data) is still scanned → 422", async (key, text) => {
    // The CRM forms POST camelCase free-text fields the normalizer does NOT alias; they survive in
    // raw_data, so the gate must scan raw free-text keys too — not only the normalized PascalCase slots.
    const req = makeRequest({
      method: "POST",
      body: { listing_type: "rent", rls_eligible: false, [key]: text },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/Fair Housing/i);
  });

  it("does NOT false-positive on a structured (non-free-text) field value", async () => {
    // A clean create whose only 'adult/active' text is in a structured field name must pass the FH
    // gate (the scan keys on free-text field NAMES, so enums like property_sub_type aren't scanned).
    const req = makeRequest({
      method: "POST",
      body: { listing_type: "rent", rls_eligible: false, property_sub_type: "Active Adult", PublicRemarks: "Sunny renovated one-bedroom near the park." },
    });
    const res = await POST(req);
    // Not a Fair Housing 422 (it may proceed or fail downstream for unrelated reasons, but NOT on FH).
    if (res.status === 422) {
      const json = await readJson<{ error: string }>(res);
      expect(json.error).not.toMatch(/Fair Housing/i);
    }
  });

  it("source pin: the unconditional scan consumes normalizePayload output (aliases resolved first)", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../app/api/crm/listings/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/scanRecordForFairHousing\(/);
    // normalizePayload(body) MUST run before the scan, so `description`→PublicRemarks etc. are
    // resolved before scanning. The behavioral alias test above proves the gate blocks (422) before
    // any persistence; this pins the resolve-then-scan ordering against future refactors.
    const normIdx = src.indexOf("normalizePayload(body)");
    const scanIdx = src.indexOf("scanRecordForFairHousing(");
    expect(normIdx).toBeGreaterThan(0);
    expect(scanIdx).toBeGreaterThan(normIdx); // scan consumes normalized output
  });
});
