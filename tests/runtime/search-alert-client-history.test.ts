/// <reference types="jest" />
/**
 * Packet 2 closure — ONE client history for lead-linked alerts.
 *
 * A Lead's "already received" is ClientListingAction(lead, local listing, "sent"): across ALL
 * saved searches and ALL workflows. A provider-only result gets a local identity through the
 * CRM's own ensure-listing mechanism BEFORE it is sent; if that cannot happen, it is not sent.
 * Agent-only alerts keep their own per-saved-search operational history.
 */
import { NextRequest } from "next/server";

const savedSearchFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const savedSearchUpdateMock = jest.fn(async () => ({}));
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const clientActionFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const clientActionUpsertMock = jest.fn(async () => ({}));
const auditFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const auditCreateMock = jest.fn<Promise<{ id: bigint }>, [unknown]>(async () => ({ id: 1n }));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    savedSearch: { findMany: savedSearchFindManyMock, update: savedSearchUpdateMock },
    listing: { findMany: listingFindManyMock },
    clientListingAction: { findMany: clientActionFindManyMock, upsert: clientActionUpsertMock },
    auditEvent: { findMany: auditFindManyMock, create: auditCreateMock },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ clientListingAction: { upsert: clientActionUpsertMock }, auditEvent: { create: auditCreateMock }, savedSearch: { update: savedSearchUpdateMock } })),
  },
}));
const ensureLocalListingMock = jest.fn();
jest.mock("@/lib/listings/ensure-local-listing", () => {
  const actual = jest.requireActual("@/lib/listings/ensure-local-listing");
  return { __esModule: true, ensureLocalListing: ensureLocalListingMock, ensureInputFromSearchDto: actual.ensureInputFromSearchDto };
});
const sendEmailMock = jest.fn<Promise<{ success: boolean; _devMode?: boolean; error?: string }>, [string, string, string]>(async () => ({ success: true }));
jest.mock("@/lib/email/sendgrid", () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock("@/lib/search/search-run-recorder", () => ({ __esModule: true, recordSearchRun: jest.fn(async () => undefined) }));
const settledUniverseForMock = jest.fn();
const hydrateRowsMock = jest.fn();
jest.mock("@/lib/search/engine/executor", () => {
  const actual = jest.requireActual("@/lib/search/engine/executor");
  return { __esModule: true, settledUniverseFor: settledUniverseForMock, hydrateRows: hydrateRowsMock, rowsModifiedSince: actual.rowsModifiedSince, universeKeyOf: actual.universeKeyOf };
});

const SINCE = new Date("2026-09-04T07:30:00Z");
const NEW = "2026-09-05T01:00:00Z";
const urow = (id: string) => ({ source: "provider" as const, listingKey: "K-" + id, listingId: id, price: 1000000, contractDate: null, modificationTimestamp: NEW });
const universe = (rows: unknown[]) => ({ universe: { rows, total: rows.length, countMeaning: "exact", providerPages: 1 } });
const lead77 = { id: 77n, first_name: "Test", last_name: "Buyer", email: "client@example.com" };
const alertRow = (over: Record<string, unknown> = {}) => ({
  id: 5n, agent_id: 42n, lead_id: 77n, name: "A", criteria: { criteria_version: 2, params: { type: "sale", neighborhood: "Tribeca" } },
  alert_enabled: true, alert_frequency: "daily", alert_email: "client@example.com", last_alert_sent: SINCE, lead: lead77, agent: null, ...over,
});
const dto = (id: string) => ({ id, mlsStatus: "Active", status: "ACTIVE", address: "217 W 57TH STREET", unit: "", neighborhood: "Tribeca", borough: "Manhattan", price: 1850000, beds: 2, baths: 2, fullBaths: 2, halfBaths: 0, internetDisplayYN: true, addressDisplayYN: true, images: [] });
const cron = async () => {
  const { GET } = await import("@/app/api/cron/search-alerts/route");
  return GET(new NextRequest("http://test/api/cron/search-alerts", { headers: { authorization: "Bearer test-cron-secret" } }));
};
const emailed = () => sendEmailMock.mock.calls.map((c) => (String(c[2]).match(/\/listing\/[A-Za-z0-9-]+/g) || []).map((u) => u.replace("/listing/", "")));
const clientRows = () => (clientActionUpsertMock.mock.calls as unknown as Array<[{ create: { lead_id: bigint; listing_id: bigint; action: string } }]>).map((c) => c[0].create);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  savedSearchFindManyMock.mockResolvedValue([]);
  listingFindManyMock.mockResolvedValue([]);
  clientActionFindManyMock.mockResolvedValue([]);
  auditFindManyMock.mockResolvedValue([]);
  hydrateRowsMock.mockImplementation(async (rows: Array<{ listingId: string }>) => ({ listings: rows.map((r) => dto(r.listingId)), missing: [], gateExcluded: [] }));
  // the ensure mechanism: a deterministic local id per ListingId
  ensureLocalListingMock.mockImplementation(async (input: { listing_id: string }) => ({ id: BigInt(1000 + Number(input.listing_id.replace(/\D/g, "") || 0)), listing_id: input.listing_id, created: true }));
});

describe("same Lead, two saved searches, same provider-only listing", () => {
  it("Search A delivers first and canonicalizes; Search B MUST NOT deliver it as New", async () => {
    const a = alertRow({ id: 5n, name: "A" });
    const b = alertRow({ id: 6n, name: "B", criteria: { criteria_version: 2, params: { type: "sale", borough: "Manhattan" } } });
    // Search A: no local row yet → ensure creates 1007 → ClientListingAction(77, 1007, sent)
    savedSearchFindManyMock.mockResolvedValue([a]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID7")]));
    listingFindManyMock.mockResolvedValue([]);
    await cron();
    expect(ensureLocalListingMock).toHaveBeenCalledTimes(1);
    expect((ensureLocalListingMock.mock.calls[0][0] as { listing_id: string; listing_type: string }).listing_id).toBe("ID7");
    // the inventory type is the saved search's own (sale universe), never inferred from the DTO
    expect((ensureLocalListingMock.mock.calls[0][0] as { listing_type: string }).listing_type).toBe("sale");
    expect(clientRows()).toEqual([{ lead_id: 77n, listing_id: 1007n, action: "sent" }]);
    expect(emailed()).toEqual([["ID7"]]);
    // Search B, later: the local row now exists and the Lead's history holds it
    jest.clearAllMocks();
    savedSearchFindManyMock.mockResolvedValue([b]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID7")]));
    listingFindManyMock.mockResolvedValue([{ id: 1007n, listing_id: "ID7" }]);
    clientActionFindManyMock.mockResolvedValue([{ listing_id: 1007n }]);
    auditFindManyMock.mockResolvedValue([]); // no audit for B — and it is not consulted for a Lead anyway
    const res = await cron();
    expect((await res.json()).sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });
});

describe("same Lead, CRM listing-send first", () => {
  it("any saved search later does NOT call it New", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1"), urow("ID2")]));
    listingFindManyMock.mockResolvedValue([{ id: 1001n, listing_id: "ID1" }]); // ID1 was sent via the CRM: local row + action exist
    clientActionFindManyMock.mockResolvedValue([{ listing_id: 1001n }]);
    await cron();
    expect(emailed()).toEqual([["ID2"]]);
    expect(clientRows()).toEqual([{ lead_id: 77n, listing_id: 1002n, action: "sent" }]);
  });
});

describe("same Lead, alert first → the CRM's canonical history shows the same 'sent' event", () => {
  it("writes ClientListingAction(lead, local listing, 'sent') for every delivered listing, local identity ensured where missing", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1"), urow("ID2")]));
    listingFindManyMock.mockResolvedValue([{ id: 1001n, listing_id: "ID1" }]); // ID1 already local, ID2 provider-only
    await cron();
    expect(ensureLocalListingMock).toHaveBeenCalledTimes(1);
    expect(clientRows()).toEqual([{ lead_id: 77n, listing_id: 1001n, action: "sent" }, { lead_id: 77n, listing_id: 1002n, action: "sent" }]);
    const evidence = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; changes: Record<string, unknown> } }]>).map((c) => c[0].data).find((d) => d.action === "search_alert_delivered");
    expect(evidence?.changes.client_history_rows).toBe(2);
  });
});

describe("provider-only Lead path: canonicalized or refused, never sent unremembered", () => {
  it("a listing whose local identity cannot be ensured is dropped from the email and audited by name; the rest are sent", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1"), urow("ID2")]));
    ensureLocalListingMock.mockImplementation(async (input: { listing_id: string }) => { if (input.listing_id === "ID2") throw new Error("db down"); return { id: 1001n, listing_id: "ID1", created: true }; });
    const res = await cron();
    expect((await res.json()).sent).toBe(1);
    expect(emailed()).toEqual([["ID1"]]);
    expect(clientRows()).toEqual([{ lead_id: 77n, listing_id: 1001n, action: "sent" }]);
    const unrep = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; changes: { listings?: Array<{ listingId: string }> } } }]>).map((c) => c[0].data).find((d) => d.action === "search_alerts_cron_delivery_unrepresentable");
    expect(unrep?.changes.listings?.map((l) => l.listingId)).toEqual(["ID2"]);
    // OBSERVABILITY: the search_run audit reflects the ACTUAL email — 2 capped, 1 unrepresentable, 1 emailed
    const { recordSearchRun } = await import("@/lib/search/search-run-recorder");
    expect(recordSearchRun).toHaveBeenCalledWith(expect.objectContaining({ delta: expect.objectContaining({ matched: 2, candidates: 2, capped: 2, unrepresentable: 1, emailed: 1, delivered: 1, sendSuccess: true }) }));
  });
  it("when nothing can be canonicalized, nothing is sent and nothing advances", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1")]));
    ensureLocalListingMock.mockRejectedValue(new Error("db down"));
    const res = await cron();
    expect((await res.json()).errored).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
});

describe("agent-only alert keeps its per-saved-search operational history (unchanged)", () => {
  it("no ensure, no ClientListingAction; the audit trail excludes; another saved search's audit does not", async () => {
    const agentOnly = alertRow({ lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } });
    savedSearchFindManyMock.mockResolvedValue([agentOnly]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1")]));
    auditFindManyMock.mockResolvedValue([{ changes: { listing_ids: ["ID1"] } }]);
    expect((await (await cron()).json()).sent).toBe(0);
    expect(ensureLocalListingMock).not.toHaveBeenCalled();
    expect(clientActionUpsertMock).not.toHaveBeenCalled();
    expect((auditFindManyMock.mock.calls[0][0] as { where: { entity_id: string } }).where.entity_id).toBe("5");
  });
});

describe("post-send persistence is ONE transaction", () => {
  it("client history + delivery evidence + cadence commit together; a failure mid-history rolls everything back (no partial ClientListingAction set, no cadence advance)", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const tx = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1"), urow("ID2"), urow("ID3")]));
    // second history row fails inside the transaction
    clientActionUpsertMock.mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => { throw new Error("db down mid-transaction"); });
    const res = await cron();
    expect(tx).toHaveBeenCalledTimes(1);
    // the transaction threw: Prisma rolls back everything inside it — the cron treats it as an error
    expect((await res.json()).errored).toBe(1);
    // the cadence update inside the transaction was never reached; nothing outside it touched the row
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
    const evidence = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string } }]>).map((c) => c[0].data.action);
    expect(evidence).not.toContain("search_alert_delivered");
  });
  it("on success the three writes happen inside the same transaction, and only then", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const tx = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1"), urow("ID2")]));
    await cron();
    expect(tx).toHaveBeenCalledTimes(1);
    expect(clientActionUpsertMock).toHaveBeenCalledTimes(2);
    expect(savedSearchUpdateMock).toHaveBeenCalledTimes(1);
    expect(savedSearchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ last_alert_sent: expect.any(Date), result_count: 2 }) }));
    const txOrder = tx.mock.invocationCallOrder[0];
    for (const order of [...clientActionUpsertMock.mock.invocationCallOrder, ...savedSearchUpdateMock.mock.invocationCallOrder]) expect(order).toBeGreaterThan(txOrder);
  });
});

describe("alert line: a withheld address withholds the UNIT too", () => {
  it("emits no unit when addressDisplayYN is false; neighborhood may show", async () => {
    const { alertLine } = await import("@/app/api/cron/search-alerts/route");
    const line = alertLine({ id: "RLS1", address: "217 W 57TH STREET", unit: "PH-4A", neighborhood: "Tribeca", addressDisplayYN: false, price: 1850000, beds: 2, baths: 2 });
    expect(line.address).toBe("Address Available on Request, Tribeca");
    expect(line.address).not.toContain("PH-4A");
    expect(line.address).not.toContain("57TH");
    const shown = alertLine({ id: "RLS1", address: "217 W 57TH STREET", unit: "PH-4A", neighborhood: "Tribeca", addressDisplayYN: true, price: 1850000, beds: 2, baths: 2 });
    expect(shown.address).toBe("217 W 57TH STREET #PH-4A, Tribeca");
  });
  it("the emitted email string contains no unit for a withheld address", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID9")]));
    hydrateRowsMock.mockResolvedValue({ listings: [{ ...dto("ID9"), unit: "PH-4A", addressDisplayYN: false }], missing: [], gateExcluded: [] });
    await cron();
    const html = String(sendEmailMock.mock.calls[0][2]);
    expect(html).toContain("Address Available on Request, Tribeca");
    expect(html).not.toContain("PH-4A");
    expect(html).not.toContain("57TH");
  });
});
