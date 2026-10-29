/// <reference types="jest" />
/**
 * Draft create vs. publish gate — 2026-10-28 acceptance defect.
 *
 * Every POST /api/crm/listings persists the new row as STATUS_INITIAL = "Draft",
 * yet the route hard-failed the full REBNY required-field validation first, so
 * the forms' "Save Draft" on a new exclusive could never create the row
 * (observed live: 422 "Listing failed compliance validation" on a minimal
 * sale draft). PATCH already treats drafts as drafts (validation reported, not
 * fatal) and the status route is where a listing becomes display-ready.
 *
 * Contract pinned here:
 *   1. POST creates the Draft and REPORTS the REBNY validation (201 +
 *      validation.errors) instead of refusing it.
 *   2. The status route refuses Draft → Active / ComingSoon for an RLS-eligible
 *      CRM-created listing whose saved data still fails the REBNY required-field
 *      validation (422 + validation.errors). The rules are moved, not dropped.
 *   3. A website-only (rls_eligible=false) listing is not REBNY-gated at publish.
 *   4. The validator honours "Yes, Conditional: Required if MLSStatus=ComingSoon":
 *      ActivationDate is required only when the listing is ComingSoon.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
// The create route takes an advisory lock and reads MAX(listing_id) through
// raw SQL inside its transaction; the generic mock returns null for raw
// queries, so this wrapper answers them (no existing SL- rows) and runs the
// transaction callback against itself.
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async () => 0);
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    return target[prop];
  },
});
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: "agent-1", userType: "agent", role: "BROKER" })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock("@/lib/cache/public-cache", () => ({
  __esModule: true,
  safeRevalidateTags: jest.fn(),
  listingCacheTag: (id: string) => `listing:${id}`,
  buildingAndManifestInvalidationTags: () => [],
  SEARCH_CACHE_TAG: "search",
}));
jest.mock("@/lib/search/listing-search-projection", () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));
jest.mock("@/lib/notifications/engine", () => ({
  __esModule: true,
  createNotification: jest.fn(async () => undefined),
}));

import { POST } from "@/app/api/crm/listings/route";
import { PATCH as STATUS_PATCH } from "@/app/api/crm/listings/[id]/status/route";
import { validateListing, publishBlockingErrors } from "@/lib/compliance/rebny-validator";
import { REBNY_FIELD_TABLES } from "@/lib/compliance/rebny-field-tables";

const minimalSaleDraft = {
  listing_type: "sale",
  listingAgreement: "ExclusiveRightToSell",
  status: "Draft",
  ListPrice: 1250000,
  StreetNumber: "400",
  StreetName: "East 90th",
  StreetSuffix: "Street",
  UnitNumber: "ACCEPTANCE-17C",
  City: "New York",
  StateOrProvince: "NY",
  PropertyType: "Residential",
  PropertySubType: "Condominium",
};

function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901),
    listing_id: "SL-0901",
    mls_id: null,
    agent_id: "agent-1",
    status: "Draft",
    listing_type: "sale",
    rls_eligible: true,
    raw_data: { ListPrice: 1250000, StreetNumber: "400", StreetName: "East 90th" },
    features: null,
    address: { StreetNumber: "400", StreetName: "East 90th" },
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    internet_automated_valuation_display_yn: true,
    internet_consumer_comment_yn: true,
    participant_only: false,
    owner_opt_out: false,
    status_changed_at: null,
    first_active_date: null,
    days_on_market: 0,
    expiration_date: null,
    ...overrides,
  };
}

function statusRequest(id: string, status: string) {
  const req = makeRequest({ method: "PATCH", body: { status } });
  return STATUS_PATCH(req, { params: Promise.resolve({ id }) });
}

describe("POST /api/crm/listings — a Draft create is reported, not refused", () => {
  beforeEach(() => {
    (prismaMock as unknown as { listing: { create: jest.Mock } }).listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
      id: BigInt(901),
      ...args.data,
    }));
  });

  it("minimal exclusive sale draft → 201 Draft with the REBNY validation errors in the body", async () => {
    const res = await POST(makeRequest({ method: "POST", body: minimalSaleDraft }));
    const json = await readJson<{ status?: string; validation?: { valid: boolean; errors: string[] }; error?: string }>(res);
    expect({ http: res.status, error: json.error, blockers: (json as { blockers?: unknown }).blockers }).toEqual({ http: 201, error: undefined, blockers: undefined });
    expect(json.status).toBe("Draft");
    expect(json.validation?.valid).toBe(false);
    expect(json.validation?.errors.some((e) => /Required field missing/.test(e))).toBe(true);
    const createCalls = (prismaMock as unknown as { listing: { create: jest.Mock } }).listing.create.mock.calls;
    expect(createCalls.length).toBe(1);
    expect(createCalls[0][0].data.status).toBe("Draft");
    expect(createCalls[0][0].data.compliance.valid).toBe(false);
  });

  it("the Draft still refuses UCBA content violations (off-market language) — only field completeness is deferred", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...minimalSaleDraft, PublicRemarks: "Quiet pocket listing, call for details." } }));
    const json = await readJson<{ error?: string; blockers?: Array<{ code: string }> }>(res);
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/RLS enforcement/i);
    expect((json.blockers ?? []).some((b) => b.code === "OM-001")).toBe(true);
  });
});

describe("publishBlockingErrors — system-generated fields are never demanded of the agent", () => {
  it("drops only the required-field errors for system-generated fields", () => {
    const errors = [
      "[REBNY] Required field missing: SourceSystemKey - LMP-assigned id",
      "[REBNY] Required field missing: OriginalEntryTimestamp - set at creation",
      "[REBNY] Required field missing: TaxLot - NYC block and lot",
      "[REBNY] Invalid value for YearBuilt: must be a 4-digit year",
    ];
    const blocking = publishBlockingErrors({ errors }, ["SourceSystemKey", "OriginalEntryTimestamp", "StandardStatus", "BuyerAgentMlsId", "OnMarketDate"]);
    expect(blocking).toEqual([
      "[REBNY] Required field missing: TaxLot - NYC block and lot",
      "[REBNY] Invalid value for YearBuilt: must be a 4-digit year",
    ]);
  });

  it("the exemption list is the field tables' systemGenerated set", () => {
    expect([...REBNY_FIELD_TABLES.requiredFields.systemGenerated]).toEqual(
      expect.arrayContaining(["SourceSystemKey", "OriginalEntryTimestamp", "StandardStatus", "BuyerAgentMlsId"]),
    );
  });
});

describe("PATCH /api/crm/listings/[id]/status — the REBNY gate lives at publish", () => {
  beforeEach(() => {
    delete calls["listing.update"];
  });

  it("Draft → Active on an RLS-eligible CRM exclusive with incomplete data → 422 with validation.errors, nothing updated", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () => crmListing());
    const res = await statusRequest("901", "Active");
    const json = await readJson<{ error?: string; validation?: { errors: string[] } }>(res);
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/REBNY/i);
    expect(json.validation?.errors.some((e) => /Required field missing/.test(e))).toBe(true);
    expect(calls["listing.update"]).toBeUndefined();
  });

  it("Draft → ComingSoon is gated the same way", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () => crmListing());
    const res = await statusRequest("901", "ComingSoon");
    expect(res.status).toBe(422);
    expect(calls["listing.update"]).toBeUndefined();
  });

  it("Draft → Active on a website-only (rls_eligible=false) listing is not REBNY-gated", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () =>
      crmListing({ rls_eligible: false }),
    );
    const res = await statusRequest("901", "Active");
    const json = await readJson<{ error?: string }>(res);
    expect(json.error ?? "").not.toMatch(/REBNY/i);
    expect(calls["listing.update"]?.length ?? 0).toBe(1);
  });
});

describe("validateListing — 'Yes, Conditional: …' rules are conditional", () => {
  it("ActivationDate is not demanded of an Active listing", () => {
    const result = validateListing({ MlsStatus: "Active", ListPrice: 1 });
    expect(result.errors.some((e) => /ActivationDate/.test(e))).toBe(false);
  });

  it("ActivationDate is demanded of a ComingSoon listing without one", () => {
    const result = validateListing({ MlsStatus: "ComingSoon", ListPrice: 1 });
    expect(result.errors.some((e) => /ActivationDate/.test(e))).toBe(true);
  });

  it("unconditional REBNY required fields are still enforced", () => {
    const result = validateListing({ MlsStatus: "Active", ListPrice: 1 });
    expect(result.errors.some((e) => /Required field missing: TaxLot/.test(e))).toBe(true);
  });
});

// ── Fair Housing wording: flagged on a Draft, refused at publication (owner rule: never blocks saving) ─────────────────────────────────
describe("Fair Housing wording — reported on a Draft save, refused when the listing is to be displayed", () => {
  beforeEach(() => {
    (prismaMock as unknown as { listing: { create: jest.Mock } }).listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
      id: BigInt(902),
      ...args.data,
    }));
    delete calls["listing.update"];
  });

  it("a Draft create with flagged wording → 201 Draft, the findings under fairHousing, the row persisted", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...minimalSaleDraft, PublicRemarks: "Sunny two bedroom, no children please." } }));
    const json = await readJson<{ status?: string; error?: string; blockers?: unknown; fairHousing?: Array<{ field: string; code: string }> }>(res);
    expect({ http: res.status, error: json.error, blockers: json.blockers }).toEqual({ http: 201, error: undefined, blockers: undefined });
    expect(json.status).toBe("Draft");
    expect((json.fairHousing ?? []).some((v) => v.field === "PublicRemarks")).toBe(true);
    expect((prismaMock as unknown as { listing: { create: jest.Mock } }).listing.create.mock.calls.length).toBe(1);
  });

  it("Draft → Active with that wording still saved → 422 Fair Housing, nothing updated (website-only listings included)", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () =>
      crmListing({ rls_eligible: false, raw_data: { ListPrice: 1250000, PublicRemarks: "Sunny two bedroom, no children please." } }),
    );
    const res = await statusRequest("901", "Active");
    const json = await readJson<{ error?: string; blockers?: Array<{ field: string }> }>(res);
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/Fair Housing/i);
    expect((json.blockers ?? []).some((b) => b.field === "PublicRemarks")).toBe(true);
    expect(calls["listing.update"]).toBeUndefined();
  });

  it("the same listing with its wording corrected publishes (a website-only listing, so no REBNY field gate): the Fair Housing gate reads the saved text", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () =>
      crmListing({ rls_eligible: false, raw_data: { ListPrice: 1250000, PublicRemarks: "Sunny two bedroom near the park." } }),
    );
    const res = await statusRequest("901", "Active");
    const json = await readJson<{ error?: string; status?: string }>(res);
    expect({ http: res.status, error: json.error }).toEqual({ http: 200, error: undefined });
    expect(calls["listing.update"]).toBeDefined();
  });

  it("a move back to Draft / Hold is never gated on wording", async () => {
    (prismaMock as unknown as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(async () =>
      crmListing({ rls_eligible: false, status: "Active", raw_data: { ListPrice: 1250000, PublicRemarks: "Sunny two bedroom, no children please." } }),
    );
    const res = await statusRequest("901", "Hold");
    const json = await readJson<{ error?: string }>(res);
    expect(json.error ?? "").not.toMatch(/Fair Housing/i);
  });
});
