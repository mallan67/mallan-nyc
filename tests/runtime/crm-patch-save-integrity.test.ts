/// <reference types="jest" />
/**
 * A CRM edit (PATCH /api/crm/listings/:id) is one transaction: the RLS link is free, the row is written only if no one saved it since this request read it (compare-and-set on
 * modification_timestamp), and the search projection is written with it. Before, the save merged data read at the start of the request and updated by id alone, so two saves in flight each wrote
 * from a stale read and the later one silently replaced the earlier; and a failed projection write was logged while the save stayed committed, so Search kept showing the old listing.
 *
 * These tests use a mocked Prisma, so they pin WHAT the route asks of the database (the conditional where, the projection call inside the transaction, the answers to a conflict and to a failed
 * projection); the database's own behaviour (a conditional update that matches nothing, a rollback) needs an isolated Postgres, which is not what this suite runs against.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async (..._a: unknown[]) => 0);
let inTransaction = false;
const mockDualWrite = jest.fn(async (_client: unknown, _listingId: string) => undefined);
const transaction = jest.fn(async (cb: (tx: unknown) => unknown) => {
  inTransaction = true;
  try { return await cb(prismaMock); } finally { inTransaction = false; }
});
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return transaction;
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
  dualWriteProjectionForListingId: (client: unknown, listingId: string) => {
    // the call the route makes, noted with whether it happened inside the transaction
    projectionCalls.push({ listingId, inTransaction });
    return mockDualWrite(client, listingId);
  },
}));
jest.mock("@/lib/notifications/engine", () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { PATCH } from "@/app/api/crm/listings/[id]/route";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mocked = { listing: Record<string, jest.Mock> };
const m = () => prismaMock as unknown as Mocked;
const projectionCalls: Array<{ listingId: string; inTransaction: boolean }> = [];

const READ_AT = new Date("2026-03-02T10:00:00.000Z");
function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", owner_client_id: null, status: "Draft", listing_type: "sale", rls_eligible: false,
    list_price: 1200000, living_area: null, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, property_type: "Commercial", property_sub_type: "",
    raw_data: { ListPrice: 1200000, StreetNumber: "800", StreetName: "2nd" }, features: {}, address: { StreetNumber: "800", StreetName: "2nd" },
    media: [], internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
    participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, last_synced_from_trestle: null,
    created_at: new Date("2026-03-01T00:00:00Z"), updated_at: new Date("2026-03-02T00:00:00Z"), modification_timestamp: READ_AT,
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  projectionCalls.length = 0;
  mockDualWrite.mockClear();
  mockDualWrite.mockImplementation(async () => undefined);
  m().listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.findMany = jest.fn(async () => []);
  m().listing.findUnique = jest.fn(async () => crmListing());
  m().listing.findFirst = jest.fn(async () => null);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

const patch = (body: Record<string, unknown>) => PATCH(makeRequest({ method: "PATCH", body }), { params: Promise.resolve({ id: "SL-0901" }) });

describe("PATCH /api/crm/listings/:id: a save never overwrites a save it did not read", () => {
  it("the update is conditional on the row exactly as this request read it", async () => {
    const res = await patch({ PublicRemarks: "Bright office." });
    expect(res.status).toBe(200);
    const where = m().listing.update.mock.calls[0][0].where;
    expect(where).toEqual({ id: BigInt(901), modification_timestamp: READ_AT });
  });

  it("a row saved by someone else meanwhile: 409 STALE_WRITE, the projection is not written, nothing is reported as saved", async () => {
    m().listing.update = jest.fn(async () => { throw Object.assign(new Error("An operation failed because it depends on one or more records that were required but not found."), { code: "P2025" }); });
    const res = await patch({ PublicRemarks: "Bright office." });
    expect(res.status).toBe(409);
    const body = await readJson<{ code?: string; error?: string }>(res);
    expect(body.code).toBe("STALE_WRITE");
    expect(body.error).toMatch(/Nothing was overwritten/);
    expect(projectionCalls).toEqual([]);
  });

  it("an unrelated database error is not turned into a conflict", async () => {
    m().listing.update = jest.fn(async () => { throw Object.assign(new Error("connection reset"), { code: "P1001" }); });
    await expect(patch({ PublicRemarks: "Bright office." })).rejects.toThrow(/connection reset/);
  });
});

describe("PATCH /api/crm/listings/:id: the save and the search projection are committed together", () => {
  it("the projection is written INSIDE the same transaction as the listing, for the listing just saved", async () => {
    const res = await patch({ PublicRemarks: "Bright office." });
    expect(res.status).toBe(200);
    expect(projectionCalls).toEqual([{ listingId: "SL-0901", inTransaction: true }]);
  });

  it("a projection that cannot be written undoes the save: 500 PROJECTION_WRITE_FAILED, not a success", async () => {
    mockDualWrite.mockImplementation(async () => { throw new Error("projection boom"); });
    const res = await patch({ PublicRemarks: "Bright office." });
    expect(res.status).toBe(500);
    const body = await readJson<{ code?: string; error?: string }>(res);
    expect(body.code).toBe("PROJECTION_WRITE_FAILED");
    expect(body.error).toMatch(/nothing was changed/i);
  });
});

describe("PATCH /api/crm/listings/:id: two saves that read the same listing at the same time", () => {
  // An in-memory row that behaves as Postgres does for a conditional update: it matches only while modification_timestamp is still the one the request read. Reads and writes take time and the
  // two requests are released together, so both read the row before either writes.
  it("one is saved and the other is told; the saved one is not overwritten by a merge built from the stale read", async () => {
    let row: Record<string, any> = crmListing({ raw_data: { ListPrice: 1200000 } });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    m().listing.findUnique = jest.fn(async () => { const seen = { ...row }; await wait(15); return seen; });
    m().listing.update = jest.fn(async (args: { where: { modification_timestamp?: Date }; data: Record<string, any> }) => {
      await wait(5);
      if (args.where.modification_timestamp && args.where.modification_timestamp.getTime() !== row.modification_timestamp.getTime()) {
        throw Object.assign(new Error("record not found"), { code: "P2025" });
      }
      row = { ...row, ...args.data, id: BigInt(901) };
      return row;
    });
    const [a, b] = await Promise.all([patch({ PublicRemarks: "Saved first." }), patch({ BuildingDescription: "Saved second." })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);                       // never two successes from one read
    const winner = a.status === 200 ? "PublicRemarks" : "BuildingDescription";
    const loser = a.status === 200 ? "BuildingDescription" : "PublicRemarks";
    expect(row.raw_data).toHaveProperty(winner);                                    // the saved change is still there ...
    expect(row.raw_data).not.toHaveProperty(loser);                                 // ... and the refused one was never half-applied
  });
});

describe("PATCH /api/crm/listings/:id: inactiveProviderFields is an explicit, separate deletion of provider fields that do not apply", () => {
  const withStored = () => {
    m().listing.findUnique = jest.fn(async () => crmListing({
      features: { TaxAnnualAmount: 18852, PercentOfCommonElements: 3.77, YearBuilt: 1957 },
      raw_data: { ListPrice: 1200000, TaxAnnualAmount: 18852, PercentOfCommonElements: 3.77, saleRETaxes: "18852", salePercentCommon: "3.77", YearBuilt: 1957 },
    }));
  };
  const sent = () => m().listing.update.mock.calls[0][0].data as Record<string, any>;

  it("removes the named provider fields from the public copy (features) and from the provider keys of raw_data, and keeps everything else, the agent's own form entries included", async () => {
    withStored();
    const res = await patch({ PublicRemarks: "Bright office.", inactiveProviderFields: ["TaxAnnualAmount", "PercentOfCommonElements"] });
    expect(res.status).toBe(200);
    expect(sent().features).toEqual({ YearBuilt: 1957, PublicRemarks: "Bright office." });
    expect(sent().raw_data).toEqual(expect.objectContaining({ saleRETaxes: "18852", salePercentCommon: "3.77", YearBuilt: 1957 }));
    expect(sent().raw_data).not.toHaveProperty("TaxAnnualAmount");
    expect(sent().raw_data).not.toHaveProperty("PercentOfCommonElements");
  });

  it("the instruction itself is not stored", async () => {
    withStored();
    await patch({ PublicRemarks: "x", inactiveProviderFields: ["TaxAnnualAmount"] });
    expect(sent().raw_data).not.toHaveProperty("inactiveProviderFields");
    expect(JSON.stringify(sent().features)).not.toContain("inactiveProviderFields");
  });

  it("only a provider field the persistence map routes to features can be named: a form key, a typed column, an unknown name and a non-text entry are ignored", async () => {
    withStored();
    await patch({ PublicRemarks: "x", inactiveProviderFields: ["saleRETaxes", "salePercentCommon", "BedroomsTotal", "ListPrice", "NoSuchField", 5, null, { a: 1 }] });
    expect(sent().raw_data).toEqual(expect.objectContaining({ saleRETaxes: "18852", salePercentCommon: "3.77", ListPrice: 1200000 }));
    expect(sent().features).toEqual(expect.objectContaining({ TaxAnnualAmount: 18852, PercentOfCommonElements: 3.77 }));
  });

  it("a field the same request sets to a value is kept, whatever the list says", async () => {
    withStored();
    await patch({ TaxAnnualAmount: 20000, inactiveProviderFields: ["TaxAnnualAmount"] });
    expect(sent().features.TaxAnnualAmount).toBe(20000);
    expect(sent().raw_data.TaxAnnualAmount).toBe(20000);
  });

  it("without the list nothing is removed: a request that leaves a provider field out leaves it as stored", async () => {
    withStored();
    await patch({ PublicRemarks: "x" });
    expect(sent().features).toEqual(expect.objectContaining({ TaxAnnualAmount: 18852, PercentOfCommonElements: 3.77 }));
  });
});
