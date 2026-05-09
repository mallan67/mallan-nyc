/**
 * PR 3 Checkpoint 5 — cron route at app/api/cron/media-sync/route.ts.
 *
 * High-scrutiny boundary: this is the FIRST production-execution checkpoint.
 * The route handler is verified via mocks for:
 *   - prisma.auditEvent (concurrency guard + run summary)
 *   - runMediaSync (mocked entirely; we don't exercise orchestration here)
 *   - lib/idx/auth.hasCredentials (Trestle creds pre-check)
 *
 * No live cron trigger. No live Trestle. No live R2. No live DB.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────

const mockAuditFindFirst = jest.fn<Promise<unknown>, [unknown]>();
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    auditEvent: {
      findFirst: (args: unknown) => mockAuditFindFirst(args),
      create: (args: unknown) => mockAuditCreate(args),
    },
  },
}));

const mockHasCredentials = jest.fn<boolean, []>();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  hasCredentials: () => mockHasCredentials(),
  getAccessToken: () => Promise.resolve("test-token"),
}));

const mockRunMediaSync = jest.fn<Promise<unknown>, [unknown?]>();
jest.mock("@/lib/idx/media-sync", () => {
  const actual = jest.requireActual("@/lib/idx/media-sync");
  return {
    ...actual,
    runMediaSync: (opts?: unknown) => mockRunMediaSync(opts),
  };
});

// Imported AFTER mocks are wired up.
import { GET } from "@/app/api/cron/media-sync/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  mockAuditFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockHasCredentials.mockReset();
  mockRunMediaSync.mockReset();
  process.env.CRON_SECRET = "test-secret";
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers });
}

function authedReq(): NextRequest {
  return makeReq({ authorization: "Bearer test-secret" });
}

function makeRunResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    rows_checked: 0,
    rows_updated: 0,
    rows_failed: 0,
    listings_processed: 0,
    listings_skipped: 0,
    duration_ms: 100,
    ...overrides,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────

describe("GET /api/cron/media-sync — auth", () => {
  it("returns 401 with no Authorization header — no DB writes, no sync", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockAuditFindFirst).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockHasCredentials).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong Bearer token", async () => {
    const res = await GET(makeReq({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 with a length-mismatched header (timing-safe guard)", async () => {
    const res = await GET(makeReq({ authorization: "Bearer x" }));
    expect(res.status).toBe(401);
  });
});

// ─── Trestle credentials gate ────────────────────────────────────────────

describe("GET /api/cron/media-sync — trestle credentials gate", () => {
  it("returns 503 when Trestle credentials are missing — no concurrency check, no sync", async () => {
    mockHasCredentials.mockReturnValue(false);
    const res = await GET(authedReq());
    expect(res.status).toBe(503);
    expect(mockAuditFindFirst).not.toHaveBeenCalled();
    expect(mockRunMediaSync).not.toHaveBeenCalled();
  });
});

// ─── Concurrency guard ───────────────────────────────────────────────────

describe("GET /api/cron/media-sync — concurrency guard", () => {
  it("returns skipped when a media_sync_cron auditEvent exists in the last 10 minutes", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValueOnce({
      id: 1,
      action: "media_sync_cron",
      created_at: new Date(),
    });

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/within last 10 minutes/);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("queries auditEvent with the correct concurrency window", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValueOnce(null);
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult());
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());

    const args = mockAuditFindFirst.mock.calls[0][0] as {
      where: { action: string; created_at: { gte: Date } };
      orderBy: unknown;
    };
    expect(args.where.action).toBe("media_sync_cron");
    expect(args.where.created_at.gte).toBeInstanceOf(Date);
    // Window must be exactly 10 minutes (within a few ms of now-10min).
    const expectedGte = Date.now() - 10 * 60 * 1000;
    const actualGte = args.where.created_at.gte.getTime();
    expect(Math.abs(actualGte - expectedGte)).toBeLessThan(2000);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────

describe("GET /api/cron/media-sync — happy path", () => {
  beforeEach(() => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValue(null);
  });

  it("calls runMediaSync and writes media_sync_cron audit event with the summary", async () => {
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({
        rows_checked: 50,
        rows_updated: 45,
        rows_failed: 0,
        listings_processed: 10,
        listings_skipped: 2,
        duration_ms: 4321,
      }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rows_updated).toBe(45);

    // Audit event payload includes the summary fields.
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; entity_type: string; user_type: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.entity_type).toBe("listing_media");
    expect(auditArgs.data.user_type).toBe("system");
    expect(auditArgs.data.changes.status).toBe("ok");
    expect(auditArgs.data.changes.rows_checked).toBe(50);
    expect(auditArgs.data.changes.rows_updated).toBe(45);
    expect(auditArgs.data.changes.rows_failed).toBe(0);
    expect(auditArgs.data.changes.listings_processed).toBe(10);
    expect(auditArgs.data.changes.listings_skipped).toBe(2);
    expect(auditArgs.data.changes.duration_ms).toBe(4321);
  });

  it("emits action='media_sync_cron' on a partial success run (not 'media_sync_cron_error')", async () => {
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({ status: "partial", rows_failed: 3 }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.changes.status).toBe("partial");
    expect(auditArgs.data.changes.rows_failed).toBe(3);
  });

  it("logs runMediaSync's status='error' result in the SAME media_sync_cron event (not media_sync_cron_error)", async () => {
    // runMediaSync returning {status:'error'} = source-fetch failure path —
    // it returns gracefully, doesn't throw. The route MUST log this in the
    // standard summary event for cursor / drift trends to remain analyzable.
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({ status: "error", error: "Property fetch failed: HTTP 503" }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.changes.status).toBe("error");
    expect(auditArgs.data.changes.error).toBe("Property fetch failed: HTTP 503");
  });
});

// ─── Route-level error path ──────────────────────────────────────────────

describe("GET /api/cron/media-sync — route-level error path", () => {
  beforeEach(() => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValue(null);
  });

  it("returns 500 and writes media_sync_cron_error audit event when runMediaSync throws", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("Neon write timeout"));
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Neon write timeout");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron_error");
    expect(auditArgs.data.changes.error).toBe("Neon write timeout");
  });

  it("error response does not leak Bearer tokens or full request headers", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("upstream failure"));
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-secret");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("test-token");
  });

  it("audit-write failure inside the catch does not mask the original error response", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("boom"));
    mockAuditCreate.mockRejectedValueOnce(new Error("audit write failed"));

    const res = await GET(authedReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("boom");
  });
});
