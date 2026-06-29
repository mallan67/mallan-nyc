/// <reference types="jest" />
/**
 * Owner-portal listing authorization (REBNY Art. III §2 confidentiality).
 *
 * Closes the IDOR in the by-listingId seller routes (price-history, marketing, comparables):
 * checking the "seller" ROLE is not enough — the caller must OWN the listing (owner_client_id).
 * Also fixes /api/portal/listings so sellers/landlords see their OWNED listings (not buyer actions).
 * Mirrors the already-fixed /api/portal/showings + /offers ownership pattern.
 */
import { buildPrismaMock } from "./helpers";
import { canAccessOwnerListing } from "@/lib/portal/listing-ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = buildPrismaMock().prisma;
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

const requirePortalRoleMock = jest.fn();
const requireAuthMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requirePortalRole: (...a: unknown[]) => requirePortalRoleMock(...a),
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  isAuthError: () => false,
}));

jest.mock("@/lib/compliance/dto", () => ({
  __esModule: true,
  sanitizeListingForPortal: (l: { listing_id: string; status: string }) => ({ listing_id: l.listing_id, status: l.status }),
  sanitizeOwnedListingForOwner: (l: { listing_id: string; status: string }) => ({ listing_id: l.listing_id, status: l.status }),
}));
jest.mock("@/lib/search/listing-access-decision", () => ({
  __esModule: true,
  isListingDisplayable: () => true,
}));

import { GET as priceHistoryGET } from "@/app/api/portal/price-history/route";
import { GET as marketingGET } from "@/app/api/portal/marketing/route";
import { GET as comparablesGET } from "@/app/api/portal/comparables/route";
import { GET as listingsGET } from "@/app/api/portal/listings/route";

const SELLER = { userId: 200n, userType: "lead" as const, role: "seller" };

function getReq(url: string) {
  const req = new Request(url, { method: "GET" }) as unknown as { nextUrl: URL };
  req.nextUrl = new URL(url);
  return req as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  requirePortalRoleMock.mockResolvedValue(SELLER);
  requireAuthMock.mockResolvedValue(SELLER);
});

describe("canAccessOwnerListing — fail-closed ownership guard", () => {
  it("agent/broker: always allowed (full CRM access), even for an unowned listing", () => {
    expect(canAccessOwnerListing({ userType: "agent", userId: 1n }, 999n)).toBe(true);
    expect(canAccessOwnerListing({ userType: "agent", userId: 1n }, null)).toBe(true);
  });
  it("lead: allowed only for their OWN listing", () => {
    expect(canAccessOwnerListing({ userType: "lead", userId: 200n }, 200n)).toBe(true);
    expect(canAccessOwnerListing({ userType: "lead", userId: 200n }, 999n)).toBe(false);
  });
  it("lead + unowned listing (null owner): fail closed", () => {
    expect(canAccessOwnerListing({ userType: "lead", userId: 200n }, null)).toBe(false);
    expect(canAccessOwnerListing({ userType: "lead", userId: 200n }, undefined)).toBe(false);
  });
});

describe("/api/portal/price-history — ownership enforced (IDOR closed)", () => {
  it("seller querying a listing they do NOT own → 404 (no data, no existence leak)", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ id: 5n, list_price: 100, owner_client_id: 999n })) as never;
    const phMany = jest.fn(async () => []);
    prismaMock.priceHistory.findMany = phMany as never;
    const res = await priceHistoryGET(getReq("http://localhost/api/portal/price-history?listingId=SL-OTHER"));
    expect(res.status).toBe(404);
    expect(phMany).not.toHaveBeenCalled(); // never reads another owner's history
  });
  it("seller querying their OWN listing → 200 with history", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ id: 5n, list_price: 100, owner_client_id: 200n })) as never;
    prismaMock.priceHistory.findMany = jest.fn(async () => []) as never;
    const res = await priceHistoryGET(getReq("http://localhost/api/portal/price-history?listingId=SL-MINE"));
    expect(res.status).toBe(200);
  });
});

describe("/api/portal/marketing — ownership enforced (IDOR closed)", () => {
  it("seller querying a listing they do NOT own → 404", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ id: 5n, owner_client_id: 999n })) as never;
    const maMany = jest.fn(async () => []);
    prismaMock.marketingActivity.findMany = maMany as never;
    const res = await marketingGET(getReq("http://localhost/api/portal/marketing?listingId=SL-OTHER"));
    expect(res.status).toBe(404);
    expect(maMany).not.toHaveBeenCalled();
  });
});

describe("/api/portal/comparables — ownership enforced for owner-roles (IDOR closed)", () => {
  it("seller pulling comps for a listing they do NOT own → 404 (comps query never runs)", async () => {
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "seller" })) as never;
    prismaMock.listing.findFirst = jest.fn(async () => ({
      id: 5n, listing_id: "SL-OTHER", owner_client_id: 999n,
      address: {}, neighborhood: "X", borough: "M", list_price: 100, property_type: "Condo", bedrooms_total: 1,
    })) as never;
    const findMany = jest.fn(async () => []);
    prismaMock.listing.findMany = findMany as never;
    const res = await comparablesGET(getReq("http://localhost/api/portal/comparables?listingId=SL-OTHER"));
    expect(res.status).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("/api/portal/listings — sellers see their OWNED listings (not buyer interactions)", () => {
  it("queries by owner_client_id for a seller and returns owned listings (incl. terminal)", async () => {
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "seller" })) as never;
    const findMany = jest.fn((..._a: unknown[]) => Promise.resolve([{ id: 5n, listing_id: "SL-MINE", status: "Withdrawn", owner_client_id: 200n }]));
    prismaMock.listing.findMany = findMany;
    const clientActions = jest.fn((..._a: unknown[]) => Promise.resolve([]));
    prismaMock.clientListingAction.findMany = clientActions;

    const res = await listingsGET(getReq("http://localhost/api/portal/listings"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { listings: Array<{ listing_id: string }> };
    expect(body.listings.map((l) => l.listing_id)).toContain("SL-MINE"); // a Withdrawn (terminal) owned listing still shows
    expect(findMany).toHaveBeenCalled();
    expect((findMany.mock.calls[0][0] as { where: { owner_client_id: bigint } }).where.owner_client_id).toBe(200n);
    expect(clientActions).not.toHaveBeenCalled(); // NOT the buyer clientListingAction path
  });

  it("recognizes an owner via enabled_workspaces/roles even if legacy portal_role is still 'buyer' (Codex P2)", async () => {
    // promote/conversion flows add a seller/landlord workspace without flipping legacy portal_role.
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "buyer", enabled_workspaces: ["seller"], roles: [] }));
    const findMany = jest.fn((..._a: unknown[]) => Promise.resolve([{ id: 6n, listing_id: "SL-WS", status: "Active", owner_client_id: 200n }]));
    prismaMock.listing.findMany = findMany;
    const clientActions = jest.fn((..._a: unknown[]) => Promise.resolve([]));
    prismaMock.clientListingAction.findMany = clientActions;

    const res = await listingsGET(getReq("http://localhost/api/portal/listings"));
    const body = (await res.json()) as { listings: Array<{ listing_id: string }> };
    expect(body.listings.map((l) => l.listing_id)).toContain("SL-WS"); // owner branch reached via workspace
    expect(findMany).toHaveBeenCalled();
    expect(clientActions).not.toHaveBeenCalled();
  });
});
