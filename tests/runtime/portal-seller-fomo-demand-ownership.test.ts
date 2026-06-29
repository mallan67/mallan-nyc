/// <reference types="jest" />
/**
 * P0 — seller FOMO + Demand ownership enforcement (owner_client_id), closing the cross-client IDOR.
 *
 * BEFORE: both routes scoped ownership by `agent: { leads: { some: { id: lead.id } } }` — any two
 * sellers/landlords who share the same listing agent are BOTH in agent.leads, so seller A could pass
 * seller B's listingId and read B's FOMO/Demand analytics (REBNY Art. III §2 confidentiality breach).
 * AFTER: ownership is enforced IN the route via canAccessOwnerListing(auth, listing.owner_client_id) —
 * the caller must OWN the listing (owner_client_id === auth.userId) or be an agent; non-owners get 404
 * (no existence leak). Auth moves to requireWorkspace so workspace-only owners aren't 403'd.
 *
 * The in-route owner check is what these tests pin: the mocked prisma returns the listing regardless of
 * the (removed) agent-relation where-clause, so only an in-route owner_client_id gate can deny.
 */
import fs from "node:fs";
import path from "node:path";
import { buildPrismaMock } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = buildPrismaMock().prisma;
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

const requireWorkspaceMock = jest.fn();
const requirePortalRoleMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireWorkspace: (...a: unknown[]) => requireWorkspaceMock(...a),
  requirePortalRole: (...a: unknown[]) => requirePortalRoleMock(...a),
  isAuthError: () => false,
}));

import { GET as fomoGET } from "@/app/api/portal/seller/fomo/route";
import { GET as demandGET } from "@/app/api/portal/seller/demand/route";

const OWNER = { userId: 200n, userType: "lead" as const, role: "seller" };

function req(route: string, listingId: string) {
  return new Request(`http://localhost/api/portal/seller/${route}?listingId=${listingId}`, { method: "GET" }) as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue(OWNER);
  requirePortalRoleMock.mockResolvedValue(OWNER);
});

describe("/api/portal/seller/fomo — owner_client_id enforced (cross-client IDOR closed)", () => {
  it("a seller querying a listing they do NOT own → 404 (analytics never computed)", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ id: 5n, owner_client_id: 999n, neighborhood: "X", list_price: 100, days_on_market: 1 })) as never;
    const momentum = jest.fn(async () => null);
    prismaMock.listingMomentum.findUnique = momentum as never;
    const res = await fomoGET(req("fomo", "SL-OTHER"));
    expect(res.status).toBe(404);
    expect(momentum).not.toHaveBeenCalled(); // bail before reading another owner's analytics
  });

  it("the OWNER querying their own listing → 200", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ id: 5n, owner_client_id: 200n, neighborhood: "X", list_price: 100, days_on_market: 1 })) as never;
    const res = await fomoGET(req("fomo", "SL-MINE"));
    expect(res.status).toBe(200);
  });
});

describe("/api/portal/seller/demand — owner_client_id enforced (cross-client IDOR closed)", () => {
  it("a seller querying a listing they do NOT own → 404 (buyer demand never counted)", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ owner_client_id: 999n, neighborhood: "X", list_price: 100 })) as never;
    const count = jest.fn(async () => 0);
    prismaMock.buyerIntentProfile.count = count as never;
    const res = await demandGET(req("demand", "SL-OTHER"));
    expect(res.status).toBe(404);
    expect(count).not.toHaveBeenCalled();
  });

  it("the OWNER querying their own listing → 200", async () => {
    prismaMock.listing.findFirst = jest.fn(async () => ({ owner_client_id: 200n, neighborhood: "X", list_price: 100 })) as never;
    const res = await demandGET(req("demand", "SL-MINE"));
    expect(res.status).toBe(200);
  });
});

describe("source contract: fomo + demand use workspace auth + owner_client_id seam", () => {
  it.each(["fomo", "demand"])("/api/portal/seller/%s admits via requireWorkspace and gates with canAccessOwnerListing on owner_client_id", (r) => {
    const src = fs.readFileSync(path.resolve(__dirname, `../../app/api/portal/seller/${r}/route.ts`), "utf8");
    expect(src).toMatch(/requireWorkspace\(request,\s*"seller",\s*"landlord"\)/);
    expect(src).not.toMatch(/requirePortalRole\(/);
    expect(src).toMatch(/canAccessOwnerListing\(auth,\s*listing\.owner_client_id\)/);
    expect(src).not.toMatch(/leads:\s*\{\s*some:/); // agent-relationship ownership removed
  });
});
