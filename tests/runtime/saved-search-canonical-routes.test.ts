/// <reference types="jest" />
/**
 * Search Consolidation Packet 2 — Saved Search create / list / update / execute, the alert
 * cron and the public signup all run on the ONE canonical Search executor. The executor is
 * mocked at its module boundary; everything the routes decide (contract, refusal, migration,
 * delta over the complete universe, delivery cap, audit, media key) is exercised for real.
 */
import { NextRequest } from "next/server";
import { makeRequest } from "./helpers";

const savedSearchFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const savedSearchFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const savedSearchUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async (args: unknown) => ({ ...(baseRow()), ...((args as { data: Record<string, unknown> }).data) }));
const savedSearchCreateMock = jest.fn<Promise<unknown>, unknown[]>(async (args: unknown) => ({ ...(baseRow()), id: 501n, ...((args as { data: Record<string, unknown> }).data) }));
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const clientActionUpsertMock = jest.fn(async () => ({}));
const auditCreateMock = jest.fn<Promise<{ id: bigint }>, [unknown]>(async () => ({ id: 1n }));
const leadUpsertMock = jest.fn(async () => ({ id: 77n, email: "visitor@example.com" }));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    savedSearch: { findUnique: savedSearchFindUniqueMock, findMany: savedSearchFindManyMock, update: savedSearchUpdateMock, create: savedSearchCreateMock },
    listing: { findMany: listingFindManyMock },
    clientListingAction: { upsert: clientActionUpsertMock },
    auditEvent: { create: auditCreateMock },
    lead: { upsert: leadUpsertMock },
  },
}));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
const requireAgentOrBrokerMock = jest.fn();
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));
jest.mock("@/lib/idx/auth", () => ({ __esModule: true, hasCredentials: () => true }));
jest.mock("@/lib/idx/mapping", () => ({ __esModule: true, generateAttributionText: () => "Listing information © REBNY (test)" }));
jest.mock("@/lib/crm/access", () => ({ __esModule: true, assertLeadIdStringAccess: async (_a: unknown, id: string) => ({ leadId: BigInt(id), response: null }) }));
jest.mock("@/lib/middleware/rate-limiter", () => ({ __esModule: true, checkRouteRateLimit: async () => true, extractClientIp: () => "203.0.113.9" }));
jest.mock("@/lib/inquiries/create", () => ({ __esModule: true, createInquiry: jest.fn(async () => ({})) }));
const sendEmailMock = jest.fn<Promise<{ success: boolean; _devMode?: boolean; error?: string }>, [string, string, string]>(async () => ({ success: true }));
jest.mock("@/lib/email/sendgrid", () => ({ __esModule: true, sendEmail: sendEmailMock }));

const recordSearchRunMock = jest.fn(async () => undefined);
jest.mock("@/lib/search/search-run-recorder", () => ({ __esModule: true, recordSearchRun: recordSearchRunMock }));

// The executor boundary. rowsModifiedSince is the REAL one: the cron's delta rule is under test.
const executeSearchMock = jest.fn();
const countSearchMock = jest.fn();
const settledUniverseForMock = jest.fn();
const hydrateRowsMock = jest.fn();
jest.mock("@/lib/search/engine/executor", () => {
  const actual = jest.requireActual("@/lib/search/engine/executor");
  return { __esModule: true, executeSearch: executeSearchMock, countSearch: countSearchMock, settledUniverseFor: settledUniverseForMock, hydrateRows: hydrateRowsMock, rowsModifiedSince: actual.rowsModifiedSince, universeKeyOf: actual.universeKeyOf };
});

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: 99n, agent_id: 42n, lead_id: null, name: "Tribeca 2BR", criteria: { criteria_version: 2, params: { type: "sale", status: "Active", minBeds: "2", neighborhood: "Tribeca", borough: "Manhattan" } },
    last_run: null, result_count: null, alert_frequency: null, alert_enabled: false, last_alert_sent: null, alert_email: null,
    created_at: new Date("2026-09-01T00:00:00Z"), updated_at: new Date("2026-09-01T00:00:00Z"), ...over,
  };
}
const dto = (over: Record<string, unknown> = {}) => ({
  id: "RLS20059088", address: "217 W 57TH STREET", unit: "4A", neighborhood: "Tribeca", borough: "Manhattan", price: 1850000, beds: 2, baths: 2,
  images: [{ url: "https://cdn.test/1.jpg", isPrimary: true, order: 0, mediaType: "Photo" }], _source: "idx", ...over,
});
const urow = (i: number, ts: string | null) => ({ source: "provider" as const, listingKey: `K${i}`, listingId: `ID${i}`, price: 1000000 - i, contractDate: null, modificationTimestamp: ts });
const ctx = (id = "99") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.IDX_ENABLED = "true";
  process.env.CRON_SECRET = "test-cron-secret";
  savedSearchFindUniqueMock.mockResolvedValue(null);
  savedSearchFindManyMock.mockResolvedValue([]);
  listingFindManyMock.mockResolvedValue([]);
  requireAgentOrBrokerMock.mockResolvedValue({ userId: 42n, userType: "agent", role: "AGENT" });
  executeSearchMock.mockResolvedValue({ listings: [dto()], total: 1, countMeaning: "exact", hasMore: false, skip: 0, limit: 100 });
  countSearchMock.mockResolvedValue({ total: 7, countMeaning: "exact" });
  settledUniverseForMock.mockResolvedValue({ universe: { rows: [], total: 0, countMeaning: "exact" } });
  hydrateRowsMock.mockResolvedValue({ listings: [], missing: [], gateExcluded: [] });
});

// ── POST /api/crm/saved-searches ────────────────────────────────────────────────
describe("POST /api/crm/saved-searches — saves what executed, on the canonical contract", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/crm/saved-searches/route");
    return POST(makeRequest({ url: "http://test/api/crm/saved-searches", method: "POST", body }));
  };
  it("refuses the retired browser dialect with 400 criteria_contract (no silent reinterpretation)", async () => {
    const res = await post({ name: "x", criteria: { listing_type: "sale", min_price: 1 } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("criteria_contract");
    expect(savedSearchCreateMock).not.toHaveBeenCalled();
  });
  it("refuses null / array criteria with the Codex-P0 400", async () => {
    for (const c of [null, [], ["a"]]) {
      const res = await post({ name: "x", criteria: c });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/plain JSON object/);
    }
  });
  it("refuses a parameter the executor cannot execute — 422 by name, nothing saved", async () => {
    const res = await post({ name: "x", criteria: { criteria_version: 2, params: { type: "sale", borough: "Yonkers" } } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("unsupported_criteria");
    expect(body.reasons.join(" ")).toContain('"borough"');
    expect(savedSearchCreateMock).not.toHaveBeenCalled();
  });
  it("saves the canonical parameters, stamps the executor count, keeps client linkage + alert state, audits", async () => {
    const res = await post({ name: "Multi", criteria: { criteria_version: 2, params: { type: "sale", borough: "Manhattan,Brooklyn", status: "Active,Pending", sort: "price_asc" } }, lead_id: "7", alert_frequency: "weekly", alert_enabled: true });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.criteria).toEqual({ criteria_version: 2, params: { type: "sale", borough: "Manhattan,Brooklyn", status: "Active,Pending", sort: "price_asc" } });
    expect(body.result_count).toBe(7);
    expect(body.count_status).toBe("stored");
    expect(body.lead_id).toBe("7");
    expect(body.alert_frequency).toBe("weekly");
    expect(body.alert_enabled).toBe(true);
    const c = countSearchMock.mock.calls[0][0] as { cityRegion: string[]; standardStatus: string[]; sort: string };
    expect(c.cityRegion).toEqual(["Manhattan", "Brooklyn"]);
    expect(c.standardStatus).toEqual(["Active", "Pending"]);
    expect(c.sort).toBe("price_asc");
    expect(logAuditEventMock).toHaveBeenCalledWith("create", "saved_search", "501", expect.anything(), expect.objectContaining({ criteria_version: 2 }));
  });
  it("still refuses a Fair Housing violation in the name", async () => {
    const res = await post({ name: "no section 8 please", criteria: { criteria_version: 2, params: { type: "sale" } } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Fair Housing/);
  });
  it("a provider outage does not fake a count: saved with count unavailable, reported", async () => {
    countSearchMock.mockRejectedValueOnce(new Error("provider 503"));
    const res = await post({ name: "x", criteria: { criteria_version: 2, params: { type: "rental" } } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.result_count).toBeNull();
    expect(body.count_status).toBe("unavailable");
  });
});

// ── GET /api/crm/saved-searches ─────────────────────────────────────────────────
describe("GET /api/crm/saved-searches — stored counts, no hidden matcher", () => {
  it("labels current / migrated / invalid rows and never settles a universe on load", async () => {
    savedSearchFindManyMock.mockResolvedValue([
      baseRow({ id: 1n, result_count: 12, last_run: new Date("2026-09-05T00:00:00Z") }),
      baseRow({ id: 2n, criteria: { listing_type: "rent", min_beds: 1 }, result_count: 3, last_run: new Date("2026-09-05T00:00:00Z") }),
      baseRow({ id: 3n, criteria: { listing_type: "sale", min_sqft: 900 } }),
      baseRow({ id: 4n, criteria: {} }),
    ]);
    const { GET } = await import("@/app/api/crm/saved-searches/route");
    const res = await GET(makeRequest({ url: "http://test/api/crm/saved-searches", method: "GET" }));
    expect(res.status).toBe(200);
    const rows = (await res.json()).savedSearches as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.criteria_state)).toEqual(["current", "migrated", "invalid", "invalid"]);
    expect(rows.map((r) => r.count_status)).toEqual(["stored", "stored", "invalid_criteria", "invalid_criteria"]);
    expect(rows[1].executable_params).toEqual({ type: "rental", minBeds: "1", status: "Active,ActiveUnderContract,ComingSoon" });
    expect(String((rows[2].invalid_reasons as string[])[0])).toContain('"min_sqft"');
    expect(rows[0]).not.toHaveProperty("live_result_count");
    expect(countSearchMock).not.toHaveBeenCalled();
    expect(settledUniverseForMock).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/crm/saved-searches/[id] ───────────────────────────────────────────
describe("PATCH /api/crm/saved-searches/[id]", () => {
  const patch = async (body: unknown, id = "99") => {
    const { PATCH } = await import("@/app/api/crm/saved-searches/[id]/route");
    return PATCH(makeRequest({ url: `http://test/api/crm/saved-searches/${id}`, method: "PATCH", body }), ctx(id));
  };
  it("enabling an alert on a search the executor cannot reproduce is refused (422 invalid_criteria)", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ criteria: { listing_type: "sale", address: "100 W 72" } }));
    const res = await patch({ alert_frequency: "daily", alert_enabled: true });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_criteria");
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
  it("a normal update of a legacy row persists its canonical form (no bulk rewrite elsewhere)", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ criteria: { listing_type: "sale", min_beds: 2 } }));
    const res = await patch({ name: "Renamed" });
    expect(res.status).toBe(200);
    const data = (savedSearchUpdateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.criteria).toEqual({ criteria_version: 2, params: { type: "sale", minBeds: "2", status: "Active,ActiveUnderContract,ComingSoon" } });
    expect(data.name).toBe("Renamed");
  });
  it("new criteria must be canonical; they are re-counted by the executor", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow());
    expect((await patch({ criteria: { listing_type: "sale" } })).status).toBe(400);
    const res = await patch({ criteria: { criteria_version: 2, params: { type: "sale", zip: "10007" } } });
    expect(res.status).toBe(200);
    const data = (savedSearchUpdateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.result_count).toBe(7);
    expect(data.criteria).toEqual({ criteria_version: 2, params: { type: "sale", zip: "10007" } });
  });
  it("another agent's search is protected; a broker may update it", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ agent_id: 1n }));
    expect((await patch({ name: "x" })).status).toBe(403);
    requireAgentOrBrokerMock.mockResolvedValue({ userId: 9n, userType: "agent", role: "BROKER" });
    expect((await patch({ name: "x" })).status).toBe(200);
  });
});

// ── POST /api/crm/saved-searches/[id]/execute ───────────────────────────────────
describe("POST /api/crm/saved-searches/[id]/execute — the canonical universe", () => {
  const exec = async (body: unknown = {}, id = "99") => {
    const { POST } = await import("@/app/api/crm/saved-searches/[id]/execute/route");
    return POST(makeRequest({ url: `http://test/api/crm/saved-searches/${id}/execute`, method: "POST", body }), ctx(id));
  };
  it("executes the stored parameters through the shared executor; response keeps media, total, order, searchName", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow());
    const res = await exec({ limit: 25, offset: 50 });
    expect(res.status).toBe(200);
    const body = await res.json();
    const c = executeSearchMock.mock.calls[0][0] as Record<string, unknown>;
    expect(c).toMatchObject({ workflow: "sale", standardStatus: ["Active"], bedsMin: 2, subdivisionName: ["Tribeca"], cityRegion: ["Manhattan"], limit: 25, offset: 50 });
    expect(body.total).toBe(1);
    expect(body.searchName).toBe("Tribeca 2BR");
    expect(body.listings[0]).toHaveProperty("media");
    expect(body.listings[0].media).toEqual(dto().images);
    expect(body.attribution).toMatch(/REBNY/);
    expect(savedSearchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result_count: 1 }) }));
    expect(recordSearchRunMock).toHaveBeenCalledWith(expect.objectContaining({ source: "saved_search_execute", resultCount: 1, actor: { userType: "agent", userId: 42n, actorUserId: null } }));
  });
  it("a migratable legacy row executes its converted criteria (explicit projection-default status)", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ criteria: { listing_type: "rent", max_price: 4000 } }));
    const res = await exec();
    expect(res.status).toBe(200);
    const c = executeSearchMock.mock.calls[0][0] as Record<string, unknown>;
    expect(c).toMatchObject({ workflow: "rental", priceMax: 4000, standardStatus: ["Active", "ActiveUnderContract", "ComingSoon"] });
    expect((await res.json()).criteria_state).toBe("migrated");
  });
  it("a row the executor cannot reproduce exactly is refused — 422, nothing executed, nothing broadened", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ criteria: { listing_type: "sale", min_sqft: 900, keyword: "doorman" } }));
    const res = await exec();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_criteria");
    expect(body.reasons.join(" ")).toContain('"min_sqft"');
    expect(executeSearchMock).not.toHaveBeenCalled();
  });
  it("malformed stored criteria are invalid, not executed as {}", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ criteria: "oops" }));
    expect((await exec()).status).toBe(422);
    expect(executeSearchMock).not.toHaveBeenCalled();
  });
  it("ownership: another agent 403, broker allowed", async () => {
    savedSearchFindUniqueMock.mockResolvedValue(baseRow({ agent_id: 1n }));
    expect((await exec()).status).toBe(403);
    requireAgentOrBrokerMock.mockResolvedValue({ userId: 9n, userType: "agent", role: "BROKER" });
    expect((await exec()).status).toBe(200);
  });
});

// ── GET /api/cron/search-alerts ─────────────────────────────────────────────────
describe("GET /api/cron/search-alerts — delta over the COMPLETE canonical universe", () => {
  const cron = async () => {
    const { GET } = await import("@/app/api/cron/search-alerts/route");
    return GET(new NextRequest("http://test/api/cron/search-alerts", { headers: { authorization: "Bearer test-cron-secret" } }));
  };
  const alertRow = (over: Record<string, unknown> = {}) => baseRow({
    id: 5n, alert_enabled: true, alert_frequency: "daily", alert_email: "client@example.com", last_alert_sent: new Date("2026-09-04T07:30:00Z"),
    lead_id: 77n, lead: { id: 77n, first_name: "Test", last_name: "Buyer", email: "client@example.com" }, agent: null, ...over,
  });
  it("finds new rows anywhere in the universe, caps delivery at 10 in universe order, emails without images, links ClientListingAction", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    const rows = [];
    for (let i = 0; i < 300; i++) rows.push(urow(i, i % 20 === 0 ? "2026-09-05T01:00:00Z" : "2026-09-01T00:00:00Z"));
    settledUniverseForMock.mockResolvedValue({ universe: { rows, total: 300, countMeaning: "exact" } });
    hydrateRowsMock.mockImplementation(async (delivered: Array<{ listingId: string }>) => ({ listings: delivered.map((r) => dto({ id: r.listingId })), missing: [], gateExcluded: [] }));
    listingFindManyMock.mockResolvedValue([{ id: 1001n, listing_id: "ID0" }, { id: 1002n, listing_id: "ID20" }]);
    const res = await cron();
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
    const delivered = hydrateRowsMock.mock.calls[0][0] as Array<{ listingId: string }>;
    expect(delivered.map((r) => r.listingId)).toEqual(["ID0", "ID20", "ID40", "ID60", "ID80", "ID100", "ID120", "ID140", "ID160", "ID180"]);
    expect(hydrateRowsMock.mock.calls[0][1]).toMatchObject({ media: false });
    const html = String(sendEmailMock.mock.calls[0][2]);
    expect(html).toContain("217 W 57TH STREET #4A, Tribeca");
    expect(html).toContain("$1,850,000");
    expect(html).toContain("2 bed");
    expect(html).toContain("/listing/ID0");
    expect(html).not.toContain("<img");
    expect(recordSearchRunMock).toHaveBeenCalledWith(expect.objectContaining({
      source: "search_alert_cron", resultCount: 300, actor: { userType: "system", userId: null, actorUserId: null },
      delta: expect.objectContaining({ matched: 15, delivered: 10, unknownTimestamp: 0 }),
    }));
    expect(savedSearchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result_count: 300 }) }));
    expect(clientActionUpsertMock).toHaveBeenCalledTimes(2);
  });
  it("the cadence rule never touches membership: a daily alert sent 2h ago is skipped before any universe is settled", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow({ last_alert_sent: new Date(Date.now() - 2 * 3600 * 1000) })]);
    const res = await cron();
    expect((await res.json()).skipped).toBe(1);
    expect(settledUniverseForMock).not.toHaveBeenCalled();
  });
  it("no alert for criteria that cannot be reproduced exactly — skipped and audited by name, row untouched", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow({ criteria: { listing_type: "sale", checkbox_filters: { View: ["City"] } } })]);
    const res = await cron();
    expect((await res.json()).skippedUnsupported).toBe(1);
    expect(settledUniverseForMock).not.toHaveBeenCalled();
    const actions = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; changes: Record<string, unknown> } }]>).map((c) => c[0].data);
    const skip = actions.find((a) => a.action === "search_alerts_cron_skipped_unsupported");
    expect(skip).toBeTruthy();
    expect(String((skip!.changes.reasons as string[])[0])).toContain('"checkbox_filters"');
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
  it("nothing new since last alert → last_alert_sent advances, no email", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue({ universe: { rows: [urow(1, "2026-09-01T00:00:00Z")], total: 1, countMeaning: "exact" } });
    const res = await cron();
    expect((await res.json()).skipped).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(savedSearchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ last_alert_sent: expect.any(Date), result_count: 1 }) }));
  });
  it("address suppression flows from the DTO into the email", async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow()]);
    settledUniverseForMock.mockResolvedValue({ universe: { rows: [urow(1, "2026-09-05T01:00:00Z")], total: 1, countMeaning: "exact" } });
    // The cron gates on the DTO's InternetAddressDisplayYN reading itself: even if upstream text
    // carried the street, an explicit false never reaches the email.
    hydrateRowsMock.mockResolvedValue({ listings: [dto({ addressDisplayYN: false, unit: "", price: null, beds: null })], missing: [], gateExcluded: [] });
    await cron();
    const html = String(sendEmailMock.mock.calls[0][2]);
    expect(html).toContain("Address Available on Request, Tribeca");
    expect(html).not.toContain("217 W 57TH");
    expect(html).toContain("Price on request");
    expect(html).toContain("— bed");
  });
  it("SMTP fail-loud is preserved: production bails out with 503 and an audit event", async () => {
    process.env.VERCEL_ENV = "production";
    try {
      savedSearchFindManyMock.mockResolvedValue([alertRow()]);
      settledUniverseForMock.mockResolvedValue({ universe: { rows: [urow(1, "2026-09-05T01:00:00Z")], total: 1, countMeaning: "exact" } });
      hydrateRowsMock.mockResolvedValue({ listings: [dto()], missing: [], gateExcluded: [] });
      sendEmailMock.mockResolvedValueOnce({ success: false, error: "SMTP not configured", _devMode: true });
      const res = await cron();
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("SMTP_NOT_CONFIGURED");
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });
});

// ── POST /api/search-alerts (public) ────────────────────────────────────────────
describe("POST /api/search-alerts — public signups write the same canonical row", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/search-alerts/route");
    return POST(makeRequest({ url: "http://test/api/search-alerts", method: "POST", body }) as never);
  };
  it("consent is still mandatory", async () => {
    const res = await post({ email: "v@example.com", criteria: { type: "sale" }, consentOptIn: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/consent/i);
  });
  it("a seeded { type: 'sale' } signup stores canonical criteria with the projection-default status, audits consent + conversion, creates the Inquiry", async () => {
    const res = await post({ email: "V@Example.com", name: "Vis Itor", frequency: "weekly", criteria: { type: "sale" }, consentOptIn: true });
    expect(res.status).toBe(200);
    const data = (savedSearchCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.criteria).toEqual({ criteria_version: 2, params: { type: "sale", status: "Active,ActiveUnderContract,ComingSoon" } });
    expect(data.alert_frequency).toBe("weekly");
    expect(data.alert_enabled).toBe(true);
    expect(data.alert_email).toBe("v@example.com");
    expect(data.name).toBe("For Sale");
    const audit = (auditCreateMock.mock.calls[0][0] as { data: { action: string; changes: Record<string, unknown> } }).data;
    expect(audit.action).toBe("search_alert_created");
    expect(audit.changes.consent_opt_in).toBe(true);
    expect(audit.changes.criteria_version).toBe(2);
    const { createInquiry } = await import("@/lib/inquiries/create");
    expect(createInquiry).toHaveBeenCalledWith(expect.objectContaining({ source: "search_alert" }));
  });
  it("the save-search button payload converts; a criterion Search cannot reproduce is refused by name (no broader alert)", async () => {
    const ok = await post({ email: "v@example.com", criteria: { type: "sale", beds: 2, minPrice: 500000, maxPrice: 1500000, propertyType: "Co-op", neighborhood: "Tribeca", borough: "Manhattan" }, consentOptIn: true });
    expect(ok.status).toBe(200);
    const data = (savedSearchCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.criteria).toEqual({ criteria_version: 2, params: { type: "sale", minBeds: "2", minPrice: "500000", maxPrice: "1500000", ownership: "StockCooperative", neighborhood: "Tribeca", borough: "Manhattan", status: "Active,ActiveUnderContract,ComingSoon" } });
    const bad = await post({ email: "v@example.com", criteria: { type: "sale", minSqft: 800 }, consentOptIn: true });
    expect(bad.status).toBe(400);
    expect((await bad.json()).reasons.join(" ")).toContain('"minSqft"');
    expect(savedSearchCreateMock).toHaveBeenCalledTimes(1);
  });
});
