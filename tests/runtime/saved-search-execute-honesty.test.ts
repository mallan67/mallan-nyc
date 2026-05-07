/// <reference types="jest" />

import { makeRequest } from "./helpers";

const savedSearchFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const savedSearchFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const savedSearchUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const projectionCountMock = jest.fn<Promise<number>, unknown[]>(async () => 0);

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    savedSearch: {
      findUnique: savedSearchFindUniqueMock,
      findMany: savedSearchFindManyMock,
      update: savedSearchUpdateMock,
    },
    listingSearchProjection: {
      count: projectionCountMock,
    },
  },
}));

jest.mock("@/lib/auth/readonly-guard", () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

const requireAgentOrBrokerMock = jest.fn();
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));

const runProjectionListingSearchMock = jest.fn(async () => ({
  listings: [],
  total: 0,
  limit: 100,
  offset: 0,
}));
jest.mock("@/lib/search/core", () => ({
  __esModule: true,
  runProjectionListingSearch: runProjectionListingSearchMock,
  serializeSearchListing: (listing: unknown) => listing,
}));

const recordSearchRunMock = jest.fn(async () => undefined);
jest.mock("@/lib/search/search-run-recorder", () => ({
  __esModule: true,
  recordSearchRun: recordSearchRunMock,
}));

beforeEach(() => {
  savedSearchFindUniqueMock.mockReset();
  savedSearchFindUniqueMock.mockResolvedValue(null);
  savedSearchFindManyMock.mockReset();
  savedSearchFindManyMock.mockResolvedValue([]);
  savedSearchUpdateMock.mockClear();
  projectionCountMock.mockClear();
  runProjectionListingSearchMock.mockClear();
  recordSearchRunMock.mockClear();
  logAuditEventMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({
    userId: 42n,
    userType: "agent",
    role: "AGENT",
  });
});

function ctx(id = "99") {
  return { params: Promise.resolve({ id }) };
}

describe("saved-search execute honesty", () => {
  it("returns 422 unsupported_criteria instead of silently broadening", async () => {
    savedSearchFindUniqueMock.mockResolvedValue({
      id: 99n,
      agent_id: 42n,
      name: "Open House saved search",
      criteria: { listing_type: "sale", openHouseDateFrom: "2026-05-06" },
    });

    const { POST } = await import("@/app/api/crm/saved-searches/[id]/execute/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/crm/saved-searches/99/execute", method: "POST", body: {} }),
      ctx(),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("unsupported_criteria");
    expect(body.unsupported_criteria).toContain("openHouseDateFrom");
    expect(runProjectionListingSearchMock).not.toHaveBeenCalled();
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 422 invalid_criteria for malformed legacy criteria", async () => {
    savedSearchFindUniqueMock.mockResolvedValue({
      id: 99n,
      agent_id: 42n,
      name: "Malformed saved search",
      criteria: [],
    });

    const { POST } = await import("@/app/api/crm/saved-searches/[id]/execute/route");
    const res = await POST(
      makeRequest({ url: "http://test/api/crm/saved-searches/99/execute", method: "POST", body: {} }),
      ctx(),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_criteria");
    expect(runProjectionListingSearchMock).not.toHaveBeenCalled();
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
});

describe("saved-search list honesty", () => {
  it("marks malformed legacy criteria invalid instead of counting {}", async () => {
    savedSearchFindManyMock.mockResolvedValue([
      {
        id: 1n,
        agent_id: 42n,
        lead_id: null,
        name: "Bad legacy search",
        criteria: [],
        alert_frequency: null,
        alert_enabled: false,
        result_count: 12,
        updated_at: new Date("2026-05-06T12:00:00Z"),
      },
    ]);

    const { GET } = await import("@/app/api/crm/saved-searches/route");
    const res = await GET(makeRequest({ url: "http://test/api/crm/saved-searches", method: "GET" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.savedSearches[0].count_status).toBe("invalid_criteria");
    expect(body.savedSearches[0].invalid_criteria).toBe(true);
    expect(body.savedSearches[0].projection_count).toBeNull();
    expect(projectionCountMock).not.toHaveBeenCalled();
  });
});
