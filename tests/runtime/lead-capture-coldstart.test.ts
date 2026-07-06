/// <reference types="jest" />
/**
 * Gap-fill proof (2026-07-06): a transient Neon cold-start (P1001) on a
 * public lead-capture write must NOT lose the lead/inquiry — the write is
 * wrapped in the existing withDbRetry, so the wake retry commits it.
 *
 * Covers the three approved seams:
 *   - app/api/cma/route.ts            → lead.upsert
 *   - app/api/open-houses/rsvp/route  → lead.upsert
 *   - lib/inquiries/create.ts         → inquiry.create (retry BEFORE the
 *                                        never-throws swallow; contract kept)
 *
 * Out of scope (unchanged, not asserted here): contact route, sign-up,
 * auditEvent.create writes.
 */
import { makeRequest } from "./helpers";

// Real withDbRetry runs (not mocked) so we prove the actual wiring. Only the
// DB driver + side-effect deps are mocked.
const leadUpsert = jest.fn();
const auditCreate = jest.fn(async () => ({ id: 1n }));
const inquiryCreate = jest.fn(async () => ({ id: 7n }));
const showingFindFirst = jest.fn(async () => null);

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    lead: { upsert: leadUpsert },
    auditEvent: { create: auditCreate },
    inquiry: { create: inquiryCreate },
    showing: { findFirst: showingFindFirst },
  },
}));
jest.mock("@/lib/email/sendgrid", () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ success: true })),
}));
jest.mock("@/lib/email/templates", () => ({
  __esModule: true,
  cmaAutoResponseEmail: () => "<p>cma</p>",
  openHouseRsvpEmail: () => "<p>rsvp</p>",
}));
jest.mock("@/lib/middleware/rate-limiter", () => ({
  __esModule: true,
  checkRouteRateLimit: jest.fn(async () => true),
  extractClientIp: jest.fn(() => "203.0.113.7"),
}));
jest.mock("@/lib/sanitize", () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
}));

/** Transient Neon cold-start error — carries the P1001 code the helper retries. */
function p1001(): Error {
  return Object.assign(new Error("Can't reach database server"), {
    code: "P1001",
  });
}

beforeEach(() => {
  leadUpsert.mockReset();
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ id: 1n });
  inquiryCreate.mockReset();
  inquiryCreate.mockResolvedValue({ id: 7n });
  showingFindFirst.mockReset();
  showingFindFirst.mockResolvedValue(null);
});

describe("CMA lead upsert — cold-start does not lose the lead", () => {
  const body = {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "2125550100",
    address: "123 Main St",
    consent: true,
  };

  test("transient P1001 then success → lead persists, upsert retried", async () => {
    leadUpsert
      .mockRejectedValueOnce(p1001())
      .mockResolvedValueOnce({ id: 5n, email: body.email, phone: body.phone });

    const { POST } = await import("@/app/api/cma/route");
    const res = await POST(makeRequest({ url: "http://test/api/cma", body }));

    expect(res.status).toBe(200);
    expect(leadUpsert).toHaveBeenCalledTimes(2); // 1 cold-start + 1 wake retry
  });
});

describe("Open-house RSVP lead upsert — cold-start does not lose the lead", () => {
  const body = {
    name: "Bob Smith",
    email: "bob@example.com",
    phone: "2125550111",
    listingAddress: "55 Fifth Ave",
    openHouseDate: "2026-08-01",
    openHouseTime: "2:00 PM",
    partySize: 2,
    agreeToTerms: true,
  };

  test("transient P1001 then success → lead persists, upsert retried", async () => {
    leadUpsert
      .mockRejectedValueOnce(p1001())
      .mockResolvedValueOnce({ id: 6n, email: body.email, phone: body.phone });

    const { POST } = await import("@/app/api/open-houses/rsvp/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/open-houses/rsvp", body }),
    );

    expect(res.status).toBe(200);
    expect(leadUpsert).toHaveBeenCalledTimes(2);
  });
});

describe("createInquiry — cold-start retry before swallow", () => {
  test("transient P1001 then success → inquiry persists (retried)", async () => {
    inquiryCreate
      .mockRejectedValueOnce(p1001())
      .mockResolvedValueOnce({ id: 88n });

    const { createInquiry } = await import("@/lib/inquiries/create");
    const id = await createInquiry({
      source: "cma_request",
      email: "a@b.com",
      rawClientIp: "203.0.113.7",
    });

    expect(id).toBe(88n);
    expect(inquiryCreate).toHaveBeenCalledTimes(2);
  });

  test("non-transient failure → still returns null (never-throws contract preserved)", async () => {
    inquiryCreate.mockRejectedValue(
      Object.assign(new Error("Inquiry table missing"), { code: "P2021" }),
    );

    const { createInquiry } = await import("@/lib/inquiries/create");
    const id = await createInquiry({ source: "cma_request", email: "a@b.com" });

    expect(id).toBeNull();
    expect(inquiryCreate).toHaveBeenCalledTimes(1); // not retried
  });
});
