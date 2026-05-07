/// <reference types="jest" />
/**
 * Featured/Public Tier A P0 — runtime side-effect tests.
 *
 * A-4. PATCH /api/featured-config writes an AuditEvent on every save with
 *      action="featured_config_update", entity_type="featured_config",
 *      and the cap-applied flags.
 *
 * A-5. PATCH /api/featured-config caps pinnedListingIds at 12 and
 *      display_limit at 24. An over-cap request must be clamped, not
 *      passed through to the DB unchanged.
 */

import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: prismaMock, calls: prismaCalls } = buildPrismaMock();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: prismaMock,
}));

const BROKER_AUTH = {
  userId: 1n,
  userType: "agent" as const,
  role: "BROKER",
};

const requireAgentOrBrokerMock = jest.fn();
const isAuthErrorMock = jest.fn(() => false);
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: isAuthErrorMock,
}));

beforeEach(() => {
  for (const k of Object.keys(prismaCalls)) delete prismaCalls[k];
  jest.clearAllMocks();
  isAuthErrorMock.mockReturnValue(false);
  requireAgentOrBrokerMock.mockResolvedValue(BROKER_AUTH);

  const fc = (prismaMock as { featuredConfig: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock } }).featuredConfig;
  fc.findFirst = jest.fn(async () => null); // no existing row by default → create path
  fc.update = jest.fn(async () => ({ id: 100n }));
  fc.create = jest.fn(async () => ({ id: 100n }));

  const ae = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent;
  ae.create = jest.fn(async () => ({ id: 5000n }));
});

async function callPatch(body: Record<string, unknown>) {
  const route = await import("@/app/api/featured-config/route");
  const req = makeRequest({
    method: "PATCH",
    url: "http://localhost/api/featured-config",
    body,
  });
  return route.PATCH(req);
}

// ─── A-5 — input caps ──────────────────────────────────────────────────

describe("A-5 — PATCH /api/featured-config input caps", () => {
  it("clamps display_limit=999 to 24 (max)", async () => {
    const res = await callPatch({ limit: 999 });
    expect(res.status).toBe(200);

    // It's the "create" path because findFirst returned null
    const fcCreate = (prismaMock as { featuredConfig: { create: jest.Mock } }).featuredConfig.create;
    expect(fcCreate).toHaveBeenCalledTimes(1);
    const createArgs = fcCreate.mock.calls[0][0] as { data: { display_limit: number } };
    expect(createArgs.data.display_limit).toBe(24);
  });

  it("clamps display_limit=-5 to 1 (min)", async () => {
    const res = await callPatch({ limit: -5 });
    expect(res.status).toBe(200);

    const fcCreate = (prismaMock as { featuredConfig: { create: jest.Mock } }).featuredConfig.create;
    const createArgs = fcCreate.mock.calls[0][0] as { data: { display_limit: number } };
    expect(createArgs.data.display_limit).toBe(1);
  });

  it("trims pinnedListingIds longer than 12", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `LISTING_${i}`);
    const res = await callPatch({ pinnedListingIds: fifty });
    expect(res.status).toBe(200);

    const fcCreate = (prismaMock as { featuredConfig: { create: jest.Mock } }).featuredConfig.create;
    const createArgs = fcCreate.mock.calls[0][0] as { data: { pinned_ids: string[] } };
    expect(createArgs.data.pinned_ids).toHaveLength(12);
    // First 12 preserved (insertion-order)
    expect(createArgs.data.pinned_ids[0]).toBe("LISTING_0");
    expect(createArgs.data.pinned_ids[11]).toBe("LISTING_11");
    // 13th and beyond dropped
    expect(createArgs.data.pinned_ids).not.toContain("LISTING_12");
    expect(createArgs.data.pinned_ids).not.toContain("LISTING_49");
  });

  it("a small in-spec request (limit=6, 3 pinned) passes through unchanged", async () => {
    const res = await callPatch({
      limit: 6,
      pinnedListingIds: ["A", "B", "C"],
    });
    expect(res.status).toBe(200);

    const fcCreate = (prismaMock as { featuredConfig: { create: jest.Mock } }).featuredConfig.create;
    const createArgs = fcCreate.mock.calls[0][0] as { data: { display_limit: number; pinned_ids: string[] } };
    expect(createArgs.data.display_limit).toBe(6);
    expect(createArgs.data.pinned_ids).toEqual(["A", "B", "C"]);
  });
});

// ─── A-4 — AuditEvent ──────────────────────────────────────────────────

describe("A-4 — PATCH /api/featured-config writes AuditEvent", () => {
  it("writes an AuditEvent row with action=featured_config_update", async () => {
    await callPatch({ limit: 6, pinnedListingIds: ["A"] });

    const aeCreate = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent.create;
    expect(aeCreate).toHaveBeenCalledTimes(1);
    const auditArgs = aeCreate.mock.calls[0][0] as {
      data: {
        action: string;
        entity_type: string;
        entity_id: string;
        user_type: string;
        user_id: bigint;
        changes: Record<string, unknown>;
      };
    };
    expect(auditArgs.data.action).toBe("featured_config_update");
    expect(auditArgs.data.entity_type).toBe("featured_config");
    expect(auditArgs.data.entity_id).toBe("100"); // mocked config id
    expect(auditArgs.data.user_type).toBe("agent");
    expect(auditArgs.data.user_id).toBe(1n);
  });

  it("audit changes record pinned_ids_capped=true when over the cap", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `LISTING_${i}`);
    await callPatch({ pinnedListingIds: fifty });

    const aeCreate = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent.create;
    const auditArgs = aeCreate.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.pinned_ids_capped).toBe(true);
  });

  it("audit changes record display_limit_capped=true when over the cap", async () => {
    await callPatch({ limit: 999 });

    const aeCreate = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent.create;
    const auditArgs = aeCreate.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.display_limit_capped).toBe(true);
  });

  it("audit changes record both flags as false when in-spec", async () => {
    await callPatch({ limit: 6, pinnedListingIds: ["A", "B"] });

    const aeCreate = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent.create;
    const auditArgs = aeCreate.mock.calls[0][0] as { data: { changes: Record<string, unknown> } };
    expect(auditArgs.data.changes.pinned_ids_capped).toBe(false);
    expect(auditArgs.data.changes.display_limit_capped).toBe(false);
  });
});

// ─── A-4 (negative-path) — auth gate ──────────────────────────────────────

describe("A-4 (auth gate) — PATCH /api/featured-config rejects non-broker agents", () => {
  it("returns 403 for AGENT role and does NOT write an AuditEvent", async () => {
    requireAgentOrBrokerMock.mockResolvedValueOnce({
      userId: 50n,
      userType: "agent",
      role: "AGENT",
    });

    const res = await callPatch({ limit: 6 });
    expect(res.status).toBe(403);

    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/broker only/i);

    // No DB writes when auth fails — neither config nor audit
    const fcCreate = (prismaMock as { featuredConfig: { create: jest.Mock } }).featuredConfig.create;
    const fcUpdate = (prismaMock as { featuredConfig: { update: jest.Mock } }).featuredConfig.update;
    const aeCreate = (prismaMock as { auditEvent: { create: jest.Mock } }).auditEvent.create;
    expect(fcCreate).not.toHaveBeenCalled();
    expect(fcUpdate).not.toHaveBeenCalled();
    expect(aeCreate).not.toHaveBeenCalled();
  });
});
