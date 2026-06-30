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

  it("source pin: the scan runs BEFORE (outside) the `if (rlsEligible)` block", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../app/api/crm/listings/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/scanRecordForFairHousing\(/);
    const scanIdx = src.indexOf("scanRecordForFairHousing(");
    const gateIdx = src.indexOf("if (rlsEligible)");
    expect(scanIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeGreaterThan(0);
    expect(scanIdx).toBeLessThan(gateIdx); // unconditional scan precedes the RLS-only block
  });
});
