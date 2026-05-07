/// <reference types="jest" />
/**
 * Portals Tier A P0 — runtime side-effect tests.
 *
 * A-1. POST /api/portal/offers must NOT include raw `buyer_lead_id` in the
 *      seller-side PortalEvent metadata. It must use the same masked
 *      wording as the offers GET response: "Buyer (via your agent)".
 *      REBNY Art. III §2 confidentiality.
 *
 * A-1 (regression). GET /api/portal/offers still masks the buyer name in
 *      the response body. The fix to the side channel must not regress
 *      the masking on the primary channel.
 *
 * A-3. GET /api/portal/me uses sanitizeLeadForPortal so the response does
 *      not contain agent_id, password_hash, portal_token, source, or
 *      other internal-only fields.
 */

import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: prismaMock, calls: prismaCalls } = buildPrismaMock();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: prismaMock,
}));

const BUYER_AUTH = {
  userId: 100n,
  userType: "lead" as const,
  role: undefined as undefined | string,
};

const SELLER_AUTH = {
  userId: 200n,
  userType: "lead" as const,
  role: undefined as undefined | string,
};

interface RecordPortalEventArg {
  leadId: bigint;
  eventType: string;
  workspace?: string | null;
  listingId?: string | null;
  metadata: Record<string, unknown>;
}
const recordPortalEventMock = jest.fn<Promise<void>, [RecordPortalEventArg]>(async () => undefined);
jest.mock("@/lib/portal/events", () => ({
  __esModule: true,
  recordPortalEvent: recordPortalEventMock,
}));

const requireAuthMock = jest.fn();
const isAuthErrorMock = jest.fn(() => false);
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAuth: requireAuthMock,
  isAuthError: isAuthErrorMock,
  logAuditEvent: logAuditEventMock,
}));

jest.mock("@/lib/auth/readonly-guard", () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

jest.mock("@/lib/search/listing-access-decision", () => ({
  __esModule: true,
  isListingDisplayable: () => true,
}));

beforeEach(() => {
  for (const k of Object.keys(prismaCalls)) delete prismaCalls[k];
  jest.clearAllMocks();
  isAuthErrorMock.mockReturnValue(false);
});

// ─── A-1 — PortalEvent buyer_lead_id masking ────────────────────────────────

describe("A-1 — POST /api/portal/offers seller-side PortalEvent masking", () => {
  it("does NOT pass raw buyer_lead_id in seller-side metadata, uses masked 'from' instead", async () => {
    requireAuthMock.mockResolvedValueOnce(BUYER_AUTH);

    // Buyer Lead (the auth user)
    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => ({
      id: 100n,
      portal_role: "buyer",
      agent_id: 50n,
    }));

    // Listing being offered on — has an owner_client_id (the seller)
    (prismaMock as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(
      async () => ({
        id: 999n,
        listing_id: "L-OFFER-1",
        owner_client_id: 200n, // the seller
        listing_type: "sale",
        owner_opt_out: false,
        participant_only: false,
        internet_entire_listing_display_yn: true,
        list_price: { toString: () => "1500000" },
        address: { full: "100 Main St" },
      })
    );

    // No prior offer — set individual methods on the cached proxy model
    // (replacing the model object wholesale would silently no-op because
    // the prismaMock root Proxy has no `set` trap).
    const cla1 = (prismaMock as { clientListingAction: { findUnique: jest.Mock; create: jest.Mock } }).clientListingAction;
    cla1.findUnique = jest.fn(async () => null);
    cla1.create = jest.fn(async () => ({
      id: 5000n,
      listing_id: 999n,
      action: "offer",
      comment: "{}",
      created_at: new Date("2026-05-04"),
    }));

    const route = await import("@/app/api/portal/offers/route");
    const req = makeRequest({
      url: "http://localhost/api/portal/offers",
      body: { listing_id: "999", amount: 1450000 },
    });
    const res = await route.POST(req);
    expect(res.status).toBe(200);

    // Two recordPortalEvent calls: buyer-side (offer_submit) + seller-side (offer_view)
    expect(recordPortalEventMock).toHaveBeenCalledTimes(2);

    // Find the seller-side call by eventType
    const sellerSideCall = recordPortalEventMock.mock.calls.find(
      ([arg]) => arg.eventType === "offer_view"
    );
    expect(sellerSideCall).toBeDefined();
    const sellerSideArg = sellerSideCall![0];

    // CRITICAL — the metadata MUST NOT contain the raw buyer_lead_id
    expect(sellerSideArg.metadata).not.toHaveProperty("buyer_lead_id");
    // CRITICAL — the metadata MUST contain the same masked wording the GET response uses
    expect(sellerSideArg.metadata.from).toBe("Buyer (via your agent)");
    // The seller-side event is sent to the seller (owner_client_id), not the buyer
    expect(sellerSideArg.leadId).toBe(200n);
  });

  it("buyer-side PortalEvent (offer_submit) is unaffected — it still represents the buyer's own activity", async () => {
    requireAuthMock.mockResolvedValueOnce(BUYER_AUTH);

    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => ({
      id: 100n,
      portal_role: "buyer",
      agent_id: 50n,
    }));
    (prismaMock as { listing: { findUnique: jest.Mock } }).listing.findUnique = jest.fn(
      async () => ({
        id: 999n,
        listing_id: "L-OFFER-2",
        owner_client_id: 200n,
        listing_type: "sale",
        owner_opt_out: false,
        participant_only: false,
        internet_entire_listing_display_yn: true,
        list_price: { toString: () => "1500000" },
        address: { full: "100 Main St" },
      })
    );
    const cla2 = (prismaMock as { clientListingAction: { findUnique: jest.Mock; create: jest.Mock } }).clientListingAction;
    cla2.findUnique = jest.fn(async () => null);
    cla2.create = jest.fn(async () => ({
      id: 5001n,
      listing_id: 999n,
      action: "offer",
      comment: "{}",
      created_at: new Date(),
    }));

    const route = await import("@/app/api/portal/offers/route");
    const req = makeRequest({
      url: "http://localhost/api/portal/offers",
      body: { listing_id: "999", amount: 1400000 },
    });
    await route.POST(req);

    const buyerSideCall = recordPortalEventMock.mock.calls.find(
      ([arg]) => arg.eventType === "offer_submit"
    );
    expect(buyerSideCall).toBeDefined();
    const buyerSideArg = buyerSideCall![0];
    expect(buyerSideArg.leadId).toBe(100n); // buyer's own activity feed
    expect(buyerSideArg.metadata).toHaveProperty("offer_action_id");
    expect(buyerSideArg.metadata).toHaveProperty("amount");
  });
});

describe("A-1 (regression) — GET /api/portal/offers still masks buyer in response", () => {
  it('seller GET response shows "Buyer (via your agent)" not the buyer\'s real name', async () => {
    requireAuthMock.mockResolvedValueOnce(SELLER_AUTH);

    // Seller lead
    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => ({
      portal_role: "seller",
      agent_id: 50n,
    }));

    // The seller owns one listing
    (prismaMock as { listing: { findMany: jest.Mock } }).listing.findMany = jest.fn(async () => [
      {
        id: 999n,
        listing_id: "L-OFFER-1",
        address: { full: "100 Main St" },
        list_price: { toString: () => "1500000" },
        internet_address_display_yn: true,
      },
    ]);

    // One offer on it from a buyer with a real name
    const claGet = (prismaMock as { clientListingAction: { findMany: jest.Mock } }).clientListingAction;
    claGet.findMany = jest.fn(async () => [
      {
        id: 5000n,
        listing_id: 999n,
        comment: '{"amount":1450000,"notes":"REAL_BUYER_NOTE with phone 212-555-0100"}',
        created_at: new Date("2026-05-04"),
        lead: {
          id: 100n,
          first_name: "REAL_BUYER_FIRST_NAME",
          last_name: "REAL_BUYER_LAST_NAME",
          email: "buyer@example.com",
          phone: "212-555-0100",
        },
      },
    ]);

    const route = await import("@/app/api/portal/offers/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/offers",
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);

    const json = await readJson<{ offers: Array<{ comment: string | null; from: { name: string; id?: string } | null }> }>(res);
    const responseString = JSON.stringify(json);

    // Buyer's real name MUST NOT appear anywhere in the response
    expect(responseString).not.toMatch(/REAL_BUYER_FIRST_NAME/);
    expect(responseString).not.toMatch(/REAL_BUYER_LAST_NAME/);
    expect(responseString).not.toMatch(/buyer@example\.com/);
    expect(responseString).not.toMatch(/212-555-0100/);
    expect(responseString).not.toMatch(/REAL_BUYER_NOTE/);
    expect(responseString).not.toMatch(/\{"amount":1450000/);

    // Masked wording MUST be present
    expect(json.offers[0].from?.name).toBe("Buyer (via your agent)");
    expect(json.offers[0].from).not.toHaveProperty("id");
    expect(json.offers[0].comment).toBe("Offer: $1,450,000");
  });
});

// ─── A-3 — /api/portal/me sanitizer adoption ────────────────────────────────

describe("A-3 — GET /api/portal/me uses sanitizer, excludes internal fields", () => {
  it("response excludes agent_id, password_hash, portal_token, source, internal_notes, lead_score, buyer_rep_agreement, pipeline_stage", async () => {
    requireAuthMock.mockResolvedValueOnce(BUYER_AUTH);

    // Lead row contains every internal field that MUST NOT leak.
    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => ({
      id: 100n,
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
      phone: "212-555-0199",
      portal_role: "buyer",
      // Every one of these MUST be stripped:
      agent_id: 50n,
      source: "streeteasy",
      pipeline_stage: "active_buyer",
      password_hash: "INTERNAL_HASH_DO_NOT_LEAK",
      portal_token: "INTERNAL_TOKEN_DO_NOT_LEAK",
      internal_notes: "Motivated buyer, pre-approved 2M",
      lead_score: 85,
      buyer_rep_agreement: true,
      assigned_at: new Date("2026-01-01"),
      preferences: null,
    }));

    const route = await import("@/app/api/portal/me/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/me",
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);

    const json = await readJson<Record<string, unknown>>(res);
    const responseString = JSON.stringify(json);

    // Internal-only fields must not be in the response payload
    expect(json).not.toHaveProperty("agent_id");
    expect(json).not.toHaveProperty("password_hash");
    expect(json).not.toHaveProperty("portal_token");
    expect(json).not.toHaveProperty("source");
    expect(json).not.toHaveProperty("internal_notes");
    expect(json).not.toHaveProperty("lead_score");
    expect(json).not.toHaveProperty("buyer_rep_agreement");
    expect(json).not.toHaveProperty("pipeline_stage");
    expect(json).not.toHaveProperty("assigned_at");

    // Even as a substring scan — sensitive secret-shaped values must not appear
    expect(responseString).not.toMatch(/INTERNAL_HASH_DO_NOT_LEAK/);
    expect(responseString).not.toMatch(/INTERNAL_TOKEN_DO_NOT_LEAK/);
    expect(responseString).not.toMatch(/Motivated buyer/);

    // Client-visible fields MUST be present
    expect(json.id).toBe("100");
    expect(json.first_name).toBe("Alice");
    expect(json.last_name).toBe("Smith");
    expect(json.email).toBe("alice@example.com");
    expect(json.phone).toBe("212-555-0199");
    expect(json.portal_role).toBe("buyer");
  });

  it("returns 403 for non-lead user types", async () => {
    requireAuthMock.mockResolvedValueOnce({
      userId: 1n,
      userType: "agent",
      role: "AGENT",
    });

    const route = await import("@/app/api/portal/me/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/me",
    });
    const res = await route.GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 404 when lead not found", async () => {
    requireAuthMock.mockResolvedValueOnce(BUYER_AUTH);

    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => null);

    const route = await import("@/app/api/portal/me/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/me",
    });
    const res = await route.GET(req);
    expect(res.status).toBe(404);
  });
});

// ─── A-2 — /api/portal/documents fail-loud ──────────────────────────────────

describe("A-2 — GET /api/portal/documents fails loud, no unsafe address scope", () => {
  it("returns 501 with fail-loud code (not silently empty)", async () => {
    requireAuthMock.mockResolvedValueOnce(SELLER_AUTH);

    const route = await import("@/app/api/portal/documents/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/documents",
    });
    const res = await route.GET(req);

    expect(res.status).toBe(501);

    const json = await readJson<{
      documents: unknown[];
      unavailable: boolean;
      code: string;
      message: string;
    }>(res);

    // CRITICAL — does NOT silently return success with empty list
    // (the prior bug shape that hid documents from sellers)
    expect(json.documents).toEqual([]);
    expect(json.unavailable).toBe(true);
    expect(json.code).toBe("PORTAL_DOCUMENTS_PENDING_CLIENT_SCOPE");
    expect(json.message).toMatch(/client-scoped/i);
  });

  it("does NOT query prisma.document or prisma.listing — no unsafe address matching attempted", async () => {
    requireAuthMock.mockResolvedValueOnce(SELLER_AUTH);

    const route = await import("@/app/api/portal/documents/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/documents",
    });
    await route.GET(req);

    // No call should have been recorded against listing or document models.
    // (buildPrismaMock records every method invocation by `${model}.${method}` key)
    const documentCalls = Object.keys(prismaCalls).filter((k) =>
      k.startsWith("document.")
    );
    expect(documentCalls).toEqual([]);

    const listingCalls = Object.keys(prismaCalls).filter((k) =>
      k.startsWith("listing.")
    );
    expect(listingCalls).toEqual([]);
  });

  it("still gates auth — returns 403 for non-lead user types", async () => {
    requireAuthMock.mockResolvedValueOnce({
      userId: 1n,
      userType: "agent",
      role: "AGENT",
    });

    const route = await import("@/app/api/portal/documents/route");
    const req = makeRequest({
      method: "GET",
      url: "http://localhost/api/portal/documents",
    });
    const res = await route.GET(req);
    expect(res.status).toBe(403);
  });
});
