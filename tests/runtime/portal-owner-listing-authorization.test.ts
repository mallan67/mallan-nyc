/// <reference types="jest" />
/**
 * Owner-portal listing authorization (REBNY Art. III §2 confidentiality).
 *
 * Closes the IDOR in the by-listingId seller routes (price-history, marketing, comparables):
 * checking the "seller" ROLE is not enough — the caller must OWN the listing (owner_client_id).
 * Also fixes /api/portal/listings so sellers/landlords see their OWNED listings (not buyer actions).
 * Mirrors the already-fixed /api/portal/showings + /offers ownership pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { buildPrismaMock } from "./helpers";
import { canAccessOwnerListing } from "@/lib/portal/listing-ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = buildPrismaMock().prisma;
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

const requirePortalRoleMock = jest.fn();
const requireWorkspaceMock = jest.fn();
const requireAuthMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requirePortalRole: (...a: unknown[]) => requirePortalRoleMock(...a),
  requireWorkspace: (...a: unknown[]) => requireWorkspaceMock(...a),
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
  // The comparables route builds its where from the canonical visibility layer
  // (gates + Mallan RLS return-copy suppression). This test is about OWNERSHIP,
  // not about display gating, so the real fragment is not needed — but the
  // export has to exist or the route throws before any authorization runs, and
  // an IDOR test that dies on a TypeError proves nothing.
  publicListingVisibilityWhere: () => ({}),
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
  requireWorkspaceMock.mockResolvedValue(SELLER);
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

  it("WORKSPACE-ONLY owner (enabled_workspaces:['seller'], portal_role:'buyer') pulling comps for an UNOWNED listing → 404 (Codex round-5 IDOR)", async () => {
    // requirePortalRole admits this lead via the BUYER allowance; the ownership check must still fire
    // because the workspace makes them an owner. portal_role alone ('buyer') would skip it — the bug.
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "buyer", enabled_workspaces: ["seller"], roles: [] })) as never;
    prismaMock.listing.findFirst = jest.fn(async () => ({
      id: 5n, listing_id: "SL-OTHER", owner_client_id: 999n,
      address: {}, neighborhood: "X", borough: "M", list_price: 100, property_type: "Condo", bedrooms_total: 1,
    })) as never;
    const findMany = jest.fn(async () => []);
    prismaMock.listing.findMany = findMany as never;
    const res = await comparablesGET(getReq("http://localhost/api/portal/comparables?listingId=SL-OTHER"));
    expect(res.status).toBe(404);
    expect(findMany).not.toHaveBeenCalled(); // never pulls another owner's comps
  });

  it("a PURE buyer (no owner workspace) still gets public comps (ownership check does NOT apply)", async () => {
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "buyer", enabled_workspaces: ["buyer"], roles: [] })) as never;
    prismaMock.listing.findFirst = jest.fn(async () => ({
      id: 5n, listing_id: "RLS-1", owner_client_id: 999n,
      address: {}, neighborhood: "X", borough: "M", list_price: 100, property_type: "Condo", bedrooms_total: 1,
    })) as never;
    const findMany = jest.fn(async () => []);
    prismaMock.listing.findMany = findMany as never;
    const res = await comparablesGET(getReq("http://localhost/api/portal/comparables?listingId=RLS-1"));
    expect(res.status).toBe(200); // buyers get public comparable data unchanged
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

  it("dual buyer+seller lead keeps BOTH owned and buyer listings (Codex #458 — no buyer loss)", async () => {
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "buyer", enabled_workspaces: ["buyer", "seller"], roles: [] }));
    const findMany = jest.fn((..._a: unknown[]) => Promise.resolve([{ id: 5n, listing_id: "SL-OWNED", status: "Active", owner_client_id: 200n }]));
    prismaMock.listing.findMany = findMany;
    const clientActions = jest.fn((..._a: unknown[]) => Promise.resolve([
      { listing_id: 9n, action: "saved", listing: { id: 9n, listing_id: "RLS-SAVED", status: "Active" } },
    ]));
    prismaMock.clientListingAction.findMany = clientActions;

    const res = await listingsGET(getReq("http://localhost/api/portal/listings"));
    const body = (await res.json()) as { listings: Array<{ listing_id: string }> };
    const ids = body.listings.map((l) => l.listing_id);
    expect(ids).toContain("SL-OWNED"); // owned listing present
    expect(ids).toContain("RLS-SAVED"); // buyer saved/shared listing NOT lost
    expect(findMany).toHaveBeenCalled();
    expect(clientActions).toHaveBeenCalled();
  });

  it("enabled_workspaces takes precedence over stale roles (Codex #458): ['buyer'] + roles ['seller'] => buyer, NOT owner", async () => {
    prismaMock.lead.findUnique = jest.fn(async () => ({ portal_role: "buyer", enabled_workspaces: ["buyer"], roles: ["seller"] }));
    const findMany = jest.fn((..._a: unknown[]) => Promise.resolve([]));
    prismaMock.listing.findMany = findMany;
    const clientActions = jest.fn((..._a: unknown[]) => Promise.resolve([
      { listing_id: 9n, action: "saved", listing: { id: 9n, listing_id: "RLS-SAVED", status: "Active" } },
    ]));
    prismaMock.clientListingAction.findMany = clientActions;

    const res = await listingsGET(getReq("http://localhost/api/portal/listings"));
    const body = (await res.json()) as { listings: Array<{ listing_id: string }> };
    expect(body.listings.map((l) => l.listing_id)).toContain("RLS-SAVED");
    expect(clientActions).toHaveBeenCalled(); // buyer path used
    expect(findMany).not.toHaveBeenCalled();  // stale roles[] ignored — NOT treated as owner
  });
});

describe("detail routes honor workspace owners (Codex #458): price-history + marketing use requireWorkspace", () => {
  // requirePortalRole reads only portal_role → a workspace-only owner (enabled_workspaces:['seller'],
  // portal_role:'buyer') would 403 before the ownership check, leaving the dashboard empty. These
  // routes must admit via requireWorkspace (workspace precedence) and enforce ownership after.
  it.each(["price-history", "marketing"])("/api/portal/%s admits via requireWorkspace, not requirePortalRole", (r) => {
    const src = fs.readFileSync(path.resolve(__dirname, `../../app/api/portal/${r}/route.ts`), "utf8");
    expect(src).toMatch(/requireWorkspace\(req,\s*"seller",\s*"landlord"\)/);
    expect(src).not.toMatch(/requirePortalRole\(/);
  });

  // Comparables ALSO admits buyers, so it must keep "buyer" in the workspace allow-list while moving
  // off requirePortalRole — otherwise a workspace-only landlord (enabled_workspaces:['landlord'],
  // legacy portal_role:'buyer' from a tenant→landlord conversion) is 403'd before the ownership check
  // and loses comps on their OWN listing (Codex #458 round 6).
  it("/api/portal/comparables admits via requireWorkspace incl. buyer, not requirePortalRole", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/api/portal/comparables/route.ts"), "utf8");
    expect(src).toMatch(/requireWorkspace\(req,\s*"buyer",\s*"seller",\s*"landlord"\)/);
    expect(src).not.toMatch(/requirePortalRole\(/);
  });
});
