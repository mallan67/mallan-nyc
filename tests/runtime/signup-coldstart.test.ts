/// <reference types="jest" />
/**
 * Sign-up cold-start protection (2026-07-06) — protect the FIRST Neon touch.
 *
 * The first DB op in POST /api/sign-up is the existence-check read
 * `prisma.lead.findUnique({ where: { email } })`. On a scaled-to-zero Neon
 * compute this throws P1001 BEFORE the account is created → 500 → lead lost.
 * Wrapping that read in withDbRetry wakes the compute, so the subsequent
 * (unwrapped, non-idempotent) `lead.create` runs on a warm connection.
 *
 * Scope proof:
 *   - findUnique is retried on a transient P1001, then proceeds → 201.
 *   - existing-user 409 and non-transient 500 semantics are unchanged.
 *   - lead.create is NOT wrapped/retried (a P1001 on create → single call, 500).
 */
import { makeRequest } from "./helpers";

const findUnique = jest.fn();
const leadCreate = jest.fn();
const leadUpdate = jest.fn(async () => ({}));
const agentFindMany = jest.fn(async () => []);
const notificationCreate = jest.fn(async () => ({}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    lead: { findUnique, create: leadCreate, update: leadUpdate },
    agent: { findMany: agentFindMany },
    notification: { create: notificationCreate },
  },
}));
jest.mock("dns/promises", () => ({
  __esModule: true,
  default: { resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }] },
  resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }],
}));
jest.mock("@/lib/disposable-domains", () => ({
  __esModule: true,
  isDisposableDomain: () => false,
}));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  hashPassword: async () => "hashed-password",
}));
jest.mock("@/lib/email/sendgrid", () => ({
  __esModule: true,
  sendEmail: async () => ({ success: true }),
}));
jest.mock("@/lib/sanitize", () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
}));
jest.mock("@/lib/middleware/rate-limiter", () => ({
  __esModule: true,
  checkRouteRateLimit: async () => true,
}));
jest.mock("@/lib/inquiries/create", () => ({
  __esModule: true,
  createInquiry: async () => 1n,
}));
jest.mock("@/lib/behavioral/session-link", () => ({
  __esModule: true,
  extractBehavioralSessionId: () => null,
  linkBehavioralSessionToLead: async () => undefined,
}));

/** Transient Neon cold-start error — carries the P1001 code the helper retries. */
function p1001(): Error {
  return Object.assign(new Error("Can't reach database server"), {
    code: "P1001",
  });
}

const baseBody = () => ({
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "2125550100",
  password: "password123",
  roles: ["buyer"],
  tcpaConsent: true,
  tcpaConsentTimestamp: new Date().toISOString(),
});

beforeEach(() => {
  findUnique.mockReset();
  leadCreate.mockReset();
  leadCreate.mockResolvedValue({
    id: 1n,
    email: "jane@example.com",
    phone: "2125550100",
    first_name: "Jane",
    last_name: "Doe",
  });
  leadUpdate.mockReset();
  leadUpdate.mockResolvedValue({});
  agentFindMany.mockReset();
  agentFindMany.mockResolvedValue([]);
  notificationCreate.mockReset();
  notificationCreate.mockResolvedValue({});
});

describe("POST /api/sign-up — cold-start protection on the first Neon touch (findUnique)", () => {
  test("P1001 on findUnique once, then null → retries and proceeds to create → 201", async () => {
    findUnique.mockRejectedValueOnce(p1001()).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/sign-up/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/sign-up", body: baseBody() }),
    );

    expect(res.status).toBe(201);
    expect(findUnique).toHaveBeenCalledTimes(2); // 1 cold-start + 1 wake retry
    expect(leadCreate).toHaveBeenCalledTimes(1); // account created, lead not lost
  });

  test("existing user from findUnique → 409 unchanged (no retry needed)", async () => {
    findUnique.mockResolvedValueOnce({ id: 9n, email: "jane@example.com" });

    const { POST } = await import("@/app/api/sign-up/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/sign-up", body: baseBody() }),
    );

    expect(res.status).toBe(409);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  test("non-transient error on findUnique → no retry, 500 unchanged", async () => {
    findUnique.mockRejectedValue(
      Object.assign(new Error("unique violation"), { code: "P2002" }),
    );

    const { POST } = await import("@/app/api/sign-up/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/sign-up", body: baseBody() }),
    );

    expect(res.status).toBe(500);
    expect(findUnique).toHaveBeenCalledTimes(1); // deterministic error → not retried
    expect(leadCreate).not.toHaveBeenCalled();
  });

  test("lead.create is NOT wrapped/retried — a P1001 on create → single call, 500", async () => {
    findUnique.mockResolvedValue(null); // warm read, no existing user
    leadCreate.mockReset();
    leadCreate.mockRejectedValue(p1001());

    const { POST } = await import("@/app/api/sign-up/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/sign-up", body: baseBody() }),
    );

    expect(res.status).toBe(500);
    expect(leadCreate).toHaveBeenCalledTimes(1); // proves create is unwrapped (no retry)
  });
});
