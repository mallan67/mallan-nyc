/// <reference types="jest" />
/**
 * Packet 2 closure — "New Listing" delivery idempotency and the per-run universe memo.
 *
 * A listing is New for an alert only once. Durable history is EXISTING canonical storage:
 * ClientListingAction(lead, local listing, "sent") for a linked Lead, and this saved search's
 * own search_alert_delivered audit trail (SavedSearch + ListingId) for agent-only searches and
 * provider results with no local row. Written after success only; read before every decision.
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
  },
}));
const sendEmailMock = jest.fn<Promise<{ success: boolean; _devMode?: boolean; error?: string }>, [string, string, string]>(async () => ({ success: true }));
jest.mock("@/lib/email/sendgrid", () => ({ __esModule: true, sendEmail: sendEmailMock }));
const recordSearchRunMock = jest.fn(async () => undefined);
jest.mock("@/lib/search/search-run-recorder", () => ({ __esModule: true, recordSearchRun: recordSearchRunMock }));
const settledUniverseForMock = jest.fn();
const hydrateRowsMock = jest.fn();
jest.mock("@/lib/search/engine/executor", () => {
  const actual = jest.requireActual("@/lib/search/engine/executor");
  return { __esModule: true, settledUniverseFor: settledUniverseForMock, hydrateRows: hydrateRowsMock, rowsModifiedSince: actual.rowsModifiedSince, universeKeyOf: actual.universeKeyOf };
});

const SINCE = new Date("2026-09-04T07:30:00Z");
const OLD = "2026-09-01T00:00:00Z";
const NEW = "2026-09-05T01:00:00Z";
const urow = (id: string, ts: string, key: string | null = "K-" + id) => ({ source: key ? ("provider" as const) : ("mallan" as const), listingKey: key, listingId: id, price: 1000000, contractDate: null, modificationTimestamp: ts });
const universe = (rows: unknown[]) => ({ universe: { rows, total: rows.length, countMeaning: "exact", providerPages: 3 } });
const alertRow = (over: Record<string, unknown> = {}) => ({
  id: 5n, agent_id: 42n, lead_id: 77n, name: "Tribeca 2BR",
  criteria: { criteria_version: 2, params: { type: "sale", neighborhood: "Tribeca" } },
  alert_enabled: true, alert_frequency: "daily", alert_email: "client@example.com", last_alert_sent: SINCE,
  lead: { id: 77n, first_name: "Test", last_name: "Buyer", email: "client@example.com" }, agent: null, ...over,
});
const dto = (id: string) => ({ id, address: "217 W 57TH STREET", unit: "", neighborhood: "Tribeca", price: 1850000, beds: 2, baths: 2, images: [] });
const priorDelivery = (ids: string[]) => ({ changes: { listing_ids: ids } });
const cron = async () => {
  const { GET } = await import("@/app/api/cron/search-alerts/route");
  return GET(new NextRequest("http://test/api/cron/search-alerts", { headers: { authorization: "Bearer test-cron-secret" } }));
};
const emailedIds = () => (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; changes: { listing_ids?: string[] } } }]>).filter((c) => c[0].data.action === "search_alert_delivered").map((c) => c[0].data.changes.listing_ids);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  savedSearchFindManyMock.mockResolvedValue([]);
  listingFindManyMock.mockResolvedValue([]);
  clientActionFindManyMock.mockResolvedValue([]);
  auditFindManyMock.mockResolvedValue([]);
  hydrateRowsMock.mockImplementation(async (rows: Array<{ listingId: string }>) => ({ listings: rows.map((r) => dto(r.listingId)), missing: [], gateExcluded: [] }));
});

describe("A/F. never delivered → sent once, durable history written BEFORE the cadence clock", () => {
  it("sends, records search_alert_delivered with the emailed ids, then advances last_alert_sent", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow({ lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } })]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1", NEW), urow("ID2", OLD)]));
    const res = await cron();
    expect((await res.json()).sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(emailedIds()).toEqual([["ID1"]]);
    // history is written before the saved search row is updated
    const auditIdx = auditCreateMock.mock.invocationCallOrder[auditCreateMock.mock.calls.findIndex((c) => (c[0] as { data: { action: string } }).data.action === "search_alert_delivered")];
    expect(auditIdx).toBeLessThan(savedSearchUpdateMock.mock.invocationCallOrder[0]);
  });
});

describe("B/C. already delivered by this alert, then modified → NOT re-sent; immediate rerun → zero email", () => {
  it("a listing in the audit trail is excluded although its ModificationTimestamp advanced", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow({ lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } })]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1", NEW)]));
    auditFindManyMock.mockResolvedValue([priorDelivery(["ID1"])]);
    const res = await cron();
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(emailedIds()).toEqual([]);
    expect(recordSearchRunMock).toHaveBeenCalledWith(expect.objectContaining({ delta: expect.objectContaining({ matched: 1, delivered: 0, alreadyDelivered: 1 }) }));
  });
});

describe("D. one genuinely new + one previously delivered-but-modified → only the new one is emailed", () => {
  it("lead-linked: the Lead's CRM send history (ClientListingAction) counts too", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID-OLD", NEW), urow("ID-NEW", NEW), urow("ID-CRM", NEW)]));
    auditFindManyMock.mockResolvedValue([priorDelivery(["ID-OLD"])]);
    listingFindManyMock.mockResolvedValue([{ id: 1001n, listing_id: "ID-CRM" }, { id: 1002n, listing_id: "ID-NEW" }]);
    clientActionFindManyMock.mockResolvedValue([{ listing_id: 1001n }]);
    const res = await cron();
    expect((await res.json()).sent).toBe(1);
    expect(emailedIds()).toEqual([["ID-NEW"]]);
    const html = String(sendEmailMock.mock.calls[0][2]);
    expect(html).toContain("/listing/ID-NEW");
    expect(html).not.toContain("/listing/ID-OLD");
    expect(html).not.toContain("/listing/ID-CRM");
    // and the Lead's canonical history gains the delivered local listing
    expect(clientActionUpsertMock).toHaveBeenCalledTimes(1);
    expect(clientActionUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ create: { lead_id: 77n, listing_id: 1002n, action: "sent" } }));
  });
});

describe("E. email failure → no history, no cadence advance", () => {
  it("records nothing and leaves last_alert_sent untouched", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1", NEW)]));
    sendEmailMock.mockResolvedValueOnce({ success: false, error: "boom" });
    const res = await cron();
    expect((await res.json()).errored).toBe(1);
    expect(emailedIds()).toEqual([]);
    expect(clientActionUpsertMock).not.toHaveBeenCalled();
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
});

describe("G/H. identity paths", () => {
  it("provider-only result with no local Listing row: durably recorded in the saved search's audit trail (no ClientListingAction possible), and excluded next time", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID-PROV", NEW)]));
    listingFindManyMock.mockResolvedValue([]);
    await cron();
    expect(emailedIds()).toEqual([["ID-PROV"]]);
    expect(clientActionUpsertMock).not.toHaveBeenCalled();
    jest.clearAllMocks();
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID-PROV", NEW)]));
    auditFindManyMock.mockResolvedValue([priorDelivery(["ID-PROV"])]);
    const res = await cron();
    expect((await res.json()).sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
  it("agent-only saved search (no Lead): identity is SavedSearch + listing in the audit trail; a second run is silent", async () => {
    const agentOnly = alertRow({ lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } });
    savedSearchFindManyMock.mockResolvedValue([agentOnly]);
    settledUniverseForMock.mockResolvedValue(universe([urow("SL-QA-1", NEW, null)]));
    await cron();
    expect(emailedIds()).toEqual([["SL-QA-1"]]);
    expect(clientActionFindManyMock).not.toHaveBeenCalled();
    jest.clearAllMocks();
    savedSearchFindManyMock.mockResolvedValue([agentOnly]);
    settledUniverseForMock.mockResolvedValue(universe([urow("SL-QA-1", NEW, null)]));
    auditFindManyMock.mockResolvedValue([priorDelivery(["SL-QA-1"])]);
    expect((await (await cron()).json()).sent).toBe(0);
  });
  it("history is per saved search: another saved search's delivery does not silence this one (the audit query is scoped by entity_id)", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow({ id: 9n, lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } })]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1", NEW)]));
    await cron();
    const where = (auditFindManyMock.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ entity_type: "saved_search", entity_id: "9", action: "search_alert_delivered" });
  });
});

describe("cost: identical canonical criteria settle ONCE per invocation", () => {
  it("three due alerts with the same criteria → one settle, two reuses; a different criteria → its own settle", async () => {
    const same = { criteria_version: 2, params: { type: "sale", borough: "Manhattan" } };
    savedSearchFindManyMock.mockResolvedValue([
      alertRow({ id: 1n, criteria: same }), alertRow({ id: 2n, criteria: same, lead_id: null, lead: null, agent: { id: 42n, first_name: "A", last_name: "B", email: "a@example.com" } }),
      alertRow({ id: 3n, criteria: { criteria_version: 2, params: { type: "sale", borough: "Manhattan", sort: "price_desc" } } }),
      alertRow({ id: 4n, criteria: { criteria_version: 2, params: { type: "rental", borough: "Manhattan" } } }),
    ]);
    settledUniverseForMock.mockResolvedValue(universe([urow("ID1", OLD)]));
    const body = await (await cron()).json();
    expect(settledUniverseForMock).toHaveBeenCalledTimes(2);
    expect(body.universeSettles).toBe(2);
    expect(body.universeReuses).toBe(2);
    expect(body.providerPages).toBe(6);
    expect(typeof body.elapsedMs).toBe("number");
  });
});
