/// <reference types="jest" />
/**
 * Phase A producer dual-write — behavioral proof of the reset-sync UPDATE branch.
 *
 * Codex #413 P2: the create branch spreads `...mapped`, but the UPDATE branch in
 * reset-sync enumerates fields, so before this fix the 8 typed agent columns would
 * NOT persist on update. This test mocks Trestle + Prisma (NOT the real
 * `typedAgentColumnsFromJson` seam) and asserts the captured UPDATE payload carries
 * all 8 typed columns, each derived from the mapper's `agent_info` JSON.
 *
 * (The normal idx-sync UPDATE branch uses the identical `...typedAgentColumnsFromJson(
 * mapped.agent_info)` spread — proven by the unit seam tests + construction.)
 */
import { makeRequest, readJson } from "./helpers";

const upsertCalls: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    agent: { findUnique: jest.fn(async () => ({ id: 1n, license_no: "10311201806", trestle_mls_id: "39361", full_name: "Maya Allan" })) },
    clientListingAction: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    showing: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    comment: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    priceHistory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    marketingActivity: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    protectedPeriod: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    listing: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      // #446: reset-sync now fetches existing status for the terminal_since clock.
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upsertCalls.push(args);
        return {};
      }),
      count: jest.fn(async () => 1),
      groupBy: jest.fn(async () => []),
    },
  },
}));

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireBroker: jest.fn(async () => ({ userId: 1n, userType: "agent", role: "BROKER" })),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/idx/auth", () => ({ __esModule: true, hasCredentials: () => true }));
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: jest.fn(async () => ({ totalFetched: 1, records: [{ ListingId: "RLS20012345", ListingKey: "1159000001" }] })),
}));

// Mapper mocked to return a POPULATED agent_info — the real reset-sync route then
// derives the 8 typed columns from it via the (unmocked) shared seam.
jest.mock("@/lib/idx/trestle-mapper", () => ({
  __esModule: true,
  // #446: the terminal_since helper (via reset-sync) needs the real terminal set + normalizer.
  TERMINAL_STATUSES: jest.requireActual("@/lib/idx/trestle-mapper").TERMINAL_STATUSES,
  normalizeStandardStatus: jest.requireActual("@/lib/idx/trestle-mapper").normalizeStandardStatus,
  validateHistoricalFields: jest.fn(() => ({ valid: true, missingFields: [] })),
  checkDistributionGates: jest.fn(() => ({ displayable: true, reason: null })),
  mapTrestleToPrisma: jest.fn(() => ({
    listing_id: "RLS20012345", mls_id: "RLS20012345", status: "Active", listing_type: "sale",
    property_type: "Residential", property_sub_type: "Condo", list_price: 1000000,
    bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: 1000,
    borough: "Manhattan", neighborhood: "Midtown", city: "New York", postal_code: "10017",
    idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true,
    participant_only: false, owner_opt_out: false,
    address: {}, features: {}, media: [], compliance: {},
    agent_info: {
      ListAgentFullName: "Jane Doe", ListOfficeName: "Acme Realty",
      ListAgentEmail: "jane@acme.com", ListAgentDirectPhone: "212-555-0100",
      ListOfficeMlsId: "OFF1", ListAgentMlsId: "AG1",
      CoListOfficeMlsId: "OFF2", CoListAgentMlsId: "AG2",
    },
    // The real mapper (A2) emits these 8 typed columns alongside agent_info;
    // the mock mirrors that so the CREATE branch's `...mapped` carries them.
    list_agent_full_name: "Jane Doe", list_office_name: "Acme Realty",
    list_agent_email: "jane@acme.com", list_agent_direct_phone: "212-555-0100",
    list_office_mls_id: "OFF1", list_agent_mls_id: "AG1",
    co_list_office_mls_id: "OFF2", co_list_agent_mls_id: "AG2",
    raw_data: {},
    modification_timestamp: new Date("2026-06-01"), listing_contract_date: null,
    last_synced_from_trestle: new Date("2026-06-11"), sync_status: "ok",
  })),
}));

jest.mock("@/lib/search/listing-search-projection", () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));

import { POST } from "@/app/api/crm/listings/reset-sync/route";

beforeEach(() => {
  upsertCalls.length = 0;
  process.env.IDX_ENABLED = "true";
  // PR #618 disabled this route's EXECUTABLE access in production (it is the
  // only whole-table delete in the repo and emits no cache invalidation, so a
  // run would leave permanent event-driven cache ghosts). These tests exercise
  // the WRITER CONTRACT beneath that guard, not the guard itself — that is
  // covered by reset-sync-disabled.test.ts — so they opt in explicitly.
  process.env.RESET_SYNC_ENABLED = "true";
});

describe("Phase C — reset-sync persists all 8 typed columns but NOT agent_info JSON", () => {
  it("the captured UPDATE payload carries every typed column and does NOT write agent_info", async () => {
    const res = await POST(makeRequest({ method: "POST", url: "http://localhost/api/crm/listings/reset-sync" }));
    const json = await readJson<{ upserted?: number }>(res);
    expect(res.status).toBe(200);
    expect(json.upserted).toBe(1);
    expect(upsertCalls).toHaveLength(1);

    const update = upsertCalls[0].update;
    expect(update.list_agent_full_name).toBe("Jane Doe");
    expect(update.list_office_name).toBe("Acme Realty");
    expect(update.list_agent_email).toBe("jane@acme.com");
    expect(update.list_agent_direct_phone).toBe("212-555-0100");
    expect(update.list_office_mls_id).toBe("OFF1");
    expect(update.list_agent_mls_id).toBe("AG1");
    expect(update.co_list_office_mls_id).toBe("OFF2");
    expect(update.co_list_agent_mls_id).toBe("AG2");
    // Phase C: agent_info JSON is NO LONGER written.
    expect(update.agent_info).toBeUndefined();
  });

  it("the CREATE branch carries the typed columns (via ...typedOnlyMapped) and strips agent_info", async () => {
    await POST(makeRequest({ method: "POST", url: "http://localhost/api/crm/listings/reset-sync" }));
    const create = upsertCalls[0].create;
    expect(create.list_agent_email).toBe("jane@acme.com");
    expect(create.co_list_agent_mls_id).toBe("AG2");
    // Phase C: agent_info JSON is stripped from the create spread.
    expect(create.agent_info).toBeUndefined();
  });
});
