/// <reference types="jest" />
/**
 * Owner-aware comments on owner-visible private listings (Codex #458 round 7).
 *
 * /api/portal/listings now returns an owner's NON-displayable listings (opted-out / participant-only /
 * internet-display-off) because the owner must see their own inventory. But the comments endpoint gated
 * GET/POST behind `!isListingDisplayable(listing)` → 404, so the seller/landlord UI showed the comment
 * composer on those rows while the API rejected them. Comments must be owner-aware: the OWNER of a
 * listing (owner_client_id === auth.userId) — or an agent — may read/post comments even when the
 * listing is not publicly displayable. Non-owners on a non-displayable listing still get 404 (no leak).
 */
import { buildPrismaMock } from "./helpers";

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
  logAuditEvent: jest.fn(async () => {}),
}));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/portal/events", () => ({ __esModule: true, recordPortalEvent: jest.fn(async () => {}) }));

const displayableMock = jest.fn();
jest.mock("@/lib/search/listing-access-decision", () => ({
  __esModule: true,
  isListingDisplayable: (...a: unknown[]) => displayableMock(...a),
}));

import { GET as commentsGET, POST as commentsPOST } from "@/app/api/portal/listings/[id]/comments/route";

// The owner: a lead whose id matches the listing's owner_client_id.
const OWNER = { userId: 200n, userType: "lead" as const, role: "seller" };

function getReq() {
  return new Request("http://localhost/api/portal/listings/5/comments", { method: "GET" }) as never;
}
function postReq(body: unknown) {
  return new Request("http://localhost/api/portal/listings/5/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
const params = { params: Promise.resolve({ id: "5" }) };

beforeEach(() => {
  jest.clearAllMocks();
  requirePortalRoleMock.mockResolvedValue(OWNER);
  requireAuthMock.mockResolvedValue(OWNER);
  prismaMock.familyMember.findMany = jest.fn(async () => []) as never;
  prismaMock.comment.findMany = jest.fn(async () => []) as never;
  prismaMock.comment.create = jest.fn(async () => ({ id: 77n, listing_id: 5n, body: "hi", created_at: new Date(0) })) as never;
});

describe("GET comments — owner-aware on non-displayable owned listings", () => {
  it("OWNER reads comments on their OWN non-displayable listing → 200 (not 404)", async () => {
    displayableMock.mockReturnValue(false); // opted-out / participant-only → not publicly displayable
    prismaMock.listing.findUnique = jest.fn(async () => ({ id: 5n, listing_id: "SL-1", owner_client_id: 200n })) as never;
    const res = await commentsGET(getReq(), params);
    expect(res.status).toBe(200);
  });

  it("NON-owner on a non-displayable listing → 404 (no existence leak)", async () => {
    displayableMock.mockReturnValue(false);
    prismaMock.listing.findUnique = jest.fn(async () => ({ id: 5n, listing_id: "SL-1", owner_client_id: 999n })) as never;
    const res = await commentsGET(getReq(), params);
    expect(res.status).toBe(404);
  });

  it("any client on a publicly displayable listing → 200 (unchanged)", async () => {
    displayableMock.mockReturnValue(true);
    prismaMock.listing.findUnique = jest.fn(async () => ({ id: 5n, listing_id: "RLS-1", owner_client_id: 999n })) as never;
    const res = await commentsGET(getReq(), params);
    expect(res.status).toBe(200);
  });
});

describe("POST comments — owner-aware on non-displayable owned listings", () => {
  it("OWNER posts a comment on their OWN non-displayable listing → 201 (not 404)", async () => {
    displayableMock.mockReturnValue(false);
    prismaMock.listing.findUnique = jest.fn(async () => ({ id: 5n, listing_id: "SL-1", owner_client_id: 200n })) as never;
    const res = await commentsPOST(postReq({ body: "Looks good" }), params);
    expect(res.status).toBe(201);
    expect(prismaMock.comment.create).toHaveBeenCalled();
  });

  it("NON-owner posting on a non-displayable listing → 404 (comment never created)", async () => {
    displayableMock.mockReturnValue(false);
    prismaMock.listing.findUnique = jest.fn(async () => ({ id: 5n, listing_id: "SL-1", owner_client_id: 999n })) as never;
    const create = jest.fn(async () => ({ id: 77n }));
    prismaMock.comment.create = create as never;
    const res = await commentsPOST(postReq({ body: "Looks good" }), params);
    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
});
