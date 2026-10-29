/// <reference types="jest" />
/**
 * P0b — the Fair Housing scan runs on EVERY listing create, not only RLS-eligible ones.
 *
 * Gap (2026-06): app/api/crm/listings/route.ts ran the content scan (inside assertRlsCompliantPayload) ONLY inside `if (rlsEligible)`.
 * Commercial / website-only / InHouse creates (rls_eligible=false) skipped the Fair Housing scan entirely — but NYC HRL / Federal FHA
 * advertising law applies to ALL advertising regardless of RLS eligibility. This pins the unconditional scan.
 *
 * What the scan DOES with what it finds (owner rule, Master 0.15, 2026-10-28): every create persists as a Draft, and a Draft is not an
 * advertisement — the findings are REPORTED with the 201 (`fairHousing`: code, field, message), never refused. The same scan refuses the
 * move to a display-ready status (PATCH /status, tests/runtime/crm-listing-draft-create-publish-gate.test.ts) and an edit of a displayed
 * listing (crm-listing-update-fair-housing.test.ts). A slot that is not text is still refused before anything (400).
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock } = buildPrismaMock();
// The create route takes an advisory lock and reads MAX(listing_id) through raw SQL inside its transaction; the generic mock returns null
// for raw queries, so this wrapper answers them (no existing rows) and runs the transaction callback against itself.
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
  requireAgentOrBroker: jest.fn(async () => ({ userId: "agent-1", userType: "agent", role: "AGENT" })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock("@/lib/cache/public-cache", () => ({ __esModule: true, safeRevalidateTags: jest.fn(), listingCacheTag: (id: string) => `listing:${id}`, buildingAndManifestInvalidationTags: () => [], SEARCH_CACHE_TAG: "search" }));
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));
jest.mock("@/lib/notifications/engine", () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { POST } from "@/app/api/crm/listings/route";

type Finding = { code: string; field: string; message: string };
type Created = { status?: string; fairHousing?: Finding[]; error?: string; blockers?: unknown };

beforeEach(() => {
  (prismaMock as unknown as { listing: { create: jest.Mock } }).listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: BigInt(901), ...args.data }));
});

describe("POST /api/crm/listings — Fair Housing scan is unconditional (rls_eligible=false included)", () => {
  it("commercial / website-only create (rls_eligible=false) with discriminatory PublicRemarks → the Draft is created and the findings are reported", async () => {
    const res = await POST(makeRequest({
      method: "POST",
      body: { listing_type: "sale", rls_eligible: false, commercial_sub_type: "Office", PublicRemarks: "Great office conversion. No Section 8, adults only." },
    }));
    expect(res.status).toBe(201);
    const json = await readJson<Created>(res);
    expect(json.status).toBe("Draft");
    expect(json.fairHousing?.length).toBeGreaterThan(0);
    expect(json.fairHousing?.every((f) => f.code === "FH-001" && f.field === "PublicRemarks")).toBe(true);
    expect(json.fairHousing?.map((f) => f.message).join(" ")).toMatch(/[Aa]dults only|Section 8/);
  });

  it("alias bypass closed: a website-only create using the `description` alias is still scanned (the finding names PublicRemarks)", async () => {
    // normalizePayload maps `description` → PublicRemarks (and `privateRemarks` → PrivateRemarks). Scanning raw PascalCase fields before
    // normalization would miss these and persist the text unread.
    const res = await POST(makeRequest({
      method: "POST",
      body: { listing_type: "sale", rls_eligible: false, commercial_sub_type: "Office", description: "Tenant must pass background check. No Section 8." },
    }));
    expect(res.status).toBe(201);
    const json = await readJson<Created>(res);
    expect(json.fairHousing?.some((f) => f.field === "PublicRemarks")).toBe(true);
  });

  it.each([
    ["showingInstructions", "No Section 8."],
    ["agentRemarks", "Adults only, no felonies."],
    ["webHeadline", "Active adult 55+ — no CityFHEPS."],
  ])("un-aliased camelCase form field `%s` (persists in raw_data) is still scanned and reported as raw:<the key>", async (key, text) => {
    // The CRM forms POST camelCase free-text fields the normalizer does NOT alias; they survive in raw_data, so the scan reads raw
    // free-text keys too — not only the normalized PascalCase slots.
    const res = await POST(makeRequest({ method: "POST", body: { listing_type: "rent", rls_eligible: false, [key]: text } }));
    expect(res.status).toBe(201);
    const json = await readJson<Created>(res);
    expect(json.fairHousing?.some((f) => f.field === `raw:${key}`)).toBe(true);
  });

  it.each([
    ["saleTHLayout", "Adults only"],
    ["saleTHFinancing", "No vouchers accepted"],
    ["rentalTHLayout", "No children please"],
    ["bldgMinIncome", "40x monthly rent, no vouchers"],
    ["bldgMaxOccupants", "no children"],
  ])("the box `%s`, whose id does not name free text, is scanned too (found 2026-10-09: it was saved unread) and reported as raw:<the id>", async (key, text) => {
    const res = await POST(makeRequest({ method: "POST", body: { listing_type: "rent", rls_eligible: false, [key]: text } }));
    expect(res.status).toBe(201);
    const json = await readJson<Created>(res);
    expect(json.fairHousing?.some((f) => f.field === `raw:${key}`)).toBe(true);
  });

  it.each([
    [{ PublicRemarks: ["Adults only. No Section 8."] }, "PublicRemarks"],
    [{ ShowingInstructions: { text: "No felonies" } }, "ShowingInstructions"],
    [{ privateRemarks: ["x"] }, "PrivateRemarks"],
    [{ description: ["No children"] }, "PublicRemarks"],
  ])("a remark slot that is not text (%j) answers 400 before any gate: the scans read text only and the public page calls string methods on it", async (extra, slot) => {
    const res = await POST(makeRequest({ method: "POST", body: { listing_type: "sale", rls_eligible: false, ...extra } }));
    expect(res.status).toBe(400);
    expect((await readJson<{ error: string }>(res)).error).toBe(`${slot} must be text`);
  });

  // found 2026-10-09 by an independent review: the scan reads strings only, so a list or an object under any other free-text key (a headline, a comment, the layout / financing boxes) was saved without a word
  it.each([
    [{ saleTHLayout: ["No vouchers, adults only."] }, "saleTHLayout"],
    [{ bldgMinIncome: { note: "no children" } }, "bldgMinIncome"],
    [{ webHeadline: ["Adults only"] }, "webHeadline"],
    [{ saleBrokerComments: [] }, "saleBrokerComments"],
  ])("a list or an object under a free-text key (%j) answers 400 before any gate: the scan reads strings only and the value would be saved unread", async (extra, key) => {
    const res = await POST(makeRequest({ method: "POST", body: { listing_type: "sale", rls_eligible: false, ...extra } }));
    expect(res.status).toBe(400);
    expect((await readJson<{ error: string }>(res)).error).toBe(`${key} must be text`);
  });

  it("a checkbox posted under a name that says 'comment' (InternetConsumerCommentYN) is not refused as non-text: a boolean is not wording", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { listing_type: "sale", rls_eligible: false, InternetConsumerCommentYN: true, saleInternetConsumerCommentYN: false } }));
    const json = await readJson<{ error?: string }>(res);
    expect(json.error ?? "").not.toMatch(/must be text/);
  });

  it("does NOT false-positive on a structured (non-free-text) field value: a clean create reports no finding", async () => {
    // The scan keys on free-text field NAMES, so enums like property_sub_type ("Active Adult") are not scanned.
    const res = await POST(makeRequest({
      method: "POST",
      body: { listing_type: "rent", rls_eligible: false, property_sub_type: "Active Adult", PublicRemarks: "Sunny renovated one-bedroom near the park." },
    }));
    expect(res.status).toBe(201);
    expect((await readJson<Created>(res)).fairHousing).toEqual([]);
  });

  it("source pin: the unconditional scan consumes normalizePayload output (aliases resolved first), and reports with the 201", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "../../app/api/crm/listings/route.ts"), "utf8");
    // The scan itself lives in lib/compliance/listing-fair-housing.ts (shared with the edit route, so the two cannot drift); the route hands it the body AND the normalized payload.
    expect(src).toMatch(/scanListingBodyForFairHousing\(body,\s*normalized\)/);
    expect(src).not.toMatch(/scanRecordForFairHousing\(/);                       // no second, inline copy of the scan
    // normalizePayload(body) MUST run before the scan, so `description`→PublicRemarks etc. are resolved before scanning.
    const normIdx = src.indexOf("normalizePayload(body)");
    const scanIdx = src.indexOf("scanListingBodyForFairHousing(body, normalized)");
    expect(normIdx).toBeGreaterThan(0);
    expect(scanIdx).toBeGreaterThan(normIdx); // scan consumes normalized output
    expect(src).toMatch(/fairHousing:\s*fhViolations/);                          // reported, not refused (a create is a Draft)
    // the helper does the resolving: it reads the canonical slots from what it is given and the raw free-text keys from the body
    const helper = require("fs").readFileSync(require("path").resolve(__dirname, "../../lib/compliance/listing-fair-housing.ts"), "utf8");
    expect(helper).toMatch(/scanRecordForFairHousing\(record\)/);
    expect(helper).toMatch(/normalized \?\? normalizePayload\(body\)\.normalized/);
  });
});
