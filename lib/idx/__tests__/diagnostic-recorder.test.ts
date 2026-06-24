/// <reference types="jest" />
/**
 * Unit tests for the system diagnostic collector (P3 dedupe/cap).
 *
 * Proves the burst-prevention contract WITHOUT a DB: a fake
 * DiagnosticAuditWriter captures what would be written, so we can assert
 * dedupe, per-run cap, summary folding, fingerprint grouping, and the
 * best-effort (never-throws) guarantee.
 */
import {
  SYNC_DIAGNOSTIC_DEDUPE_ACTIONS,
  DIAGNOSTIC_FULL_ROW_CAP,
  DIAGNOSTIC_SUMMARY_ACTION,
  fingerprintError,
  bufferSyncDiagnostic,
  flushSyncDiagnostics,
  resetSyncDiagnostics,
  getBufferedKeyCount,
  withSyncDiagnosticRun,
  type DiagnosticAuditWriter,
} from "../diagnostic-recorder";

interface Captured {
  createMany: Array<Record<string, unknown>>;
  create: Array<Record<string, unknown>>;
}

function makeWriter(opts: { failCreateMany?: boolean; failCreate?: boolean } = {}): {
  writer: DiagnosticAuditWriter;
  captured: Captured;
} {
  const captured: Captured = { createMany: [], create: [] };
  const writer: DiagnosticAuditWriter = {
    auditEvent: {
      async createMany({ data }) {
        if (opts.failCreateMany) throw new Error("simulated createMany failure");
        captured.createMany.push(...(data as unknown as Record<string, unknown>[]));
        return { count: data.length };
      },
      async create({ data }) {
        if (opts.failCreate) throw new Error("simulated create failure");
        captured.create.push(data as unknown as Record<string, unknown>);
        return data;
      },
    },
  };
  return { writer, captured };
}

const READONLY_ERR = {
  error_name: "PrismaClientUnknownRequestError",
  error_message:
    "Invalid `prisma.listing.upsert()` invocation: cannot execute INSERT in a read-only transaction",
  prisma_code: undefined as string | undefined,
};

beforeEach(() => resetSyncDiagnostics());
afterAll(() => resetSyncDiagnostics());

describe("fingerprintError", () => {
  it("folds the same error across different listings to ONE fingerprint", () => {
    const a = fingerprintError({ ...READONLY_ERR, listing_id: "RLS1" });
    const b = fingerprintError({ ...READONLY_ERR, listing_id: "RLS2" });
    expect(a).toBe(b);
  });

  it("distinguishes a genuinely different error (different code/message)", () => {
    const a = fingerprintError(READONLY_ERR);
    const b = fingerprintError({
      error_name: "PrismaClientKnownRequestError",
      error_message: "Unique constraint failed",
      prisma_code: "P2002",
    });
    expect(a).not.toBe(b);
  });
});

describe("dedupe within a run", () => {
  it("collapses repeated same (action,entity_id,fingerprint) into ONE full row with occurrences=N", async () => {
    for (let i = 0; i < 5; i++) {
      bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
    }
    expect(getBufferedKeyCount()).toBe(1);
    const { writer, captured } = makeWriter();
    const res = await flushSyncDiagnostics(writer, { run_bucket: "test" });
    expect(captured.createMany).toHaveLength(1);
    expect(captured.createMany[0].changes).toMatchObject({ occurrences: 5 });
    expect(res.suppressedCount).toBe(4); // 5 events − 1 row written
  });

  it("records DIFFERENT listings separately (until cap/summary applies)", async () => {
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS2", READONLY_ERR);
    const { writer, captured } = makeWriter();
    await flushSyncDiagnostics(writer, { run_bucket: "test" });
    expect(captured.createMany).toHaveLength(2);
    expect(captured.create).toHaveLength(0); // under cap, no duplicates → no summary
  });

  it("records DIFFERENT error fingerprints separately for the same listing", async () => {
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", {
      error_name: "PrismaClientKnownRequestError",
      error_message: "Unique constraint failed",
      prisma_code: "P2002",
    });
    expect(getBufferedKeyCount()).toBe(2);
    const { writer, captured } = makeWriter();
    await flushSyncDiagnostics(writer, { run_bucket: "test" });
    expect(captured.createMany).toHaveLength(2);
  });
});

describe("per-run cap + summary", () => {
  it("caps full rows at DIAGNOSTIC_FULL_ROW_CAP and folds overflow into ONE summary", async () => {
    const overflow = 10;
    for (let i = 0; i < DIAGNOSTIC_FULL_ROW_CAP + overflow; i++) {
      bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", `RLS${i}`, READONLY_ERR);
    }
    const { writer, captured } = makeWriter();
    const res = await flushSyncDiagnostics(writer, { run_bucket: "run-1" });
    expect(captured.createMany).toHaveLength(DIAGNOSTIC_FULL_ROW_CAP);
    expect(captured.create).toHaveLength(1); // exactly one summary
    const summary = captured.create[0];
    expect(summary.action).toBe(DIAGNOSTIC_SUMMARY_ACTION);
    expect(summary.entity_type).toBe("system");
    expect((summary.changes as Record<string, unknown>).suppressed_count).toBe(overflow);
    expect((summary.changes as Record<string, unknown>).full_rows_written).toBe(DIAGNOSTIC_FULL_ROW_CAP);
    expect(res.summaryWritten).toBe(true);
  });

  it("summary groups by fingerprint with capped sample listing ids", async () => {
    for (let i = 0; i < DIAGNOSTIC_FULL_ROW_CAP + 5; i++) {
      bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", `RLS${i}`, READONLY_ERR);
    }
    const { writer, captured } = makeWriter();
    await flushSyncDiagnostics(writer, { run_bucket: "run-1" });
    const changes = captured.create[0].changes as Record<string, unknown>;
    const top = changes.top_fingerprints as Array<{ fingerprint: string; sample_listing_ids: string[] }>;
    expect(top.length).toBeGreaterThanOrEqual(1);
    expect(top[0].sample_listing_ids.length).toBeLessThanOrEqual(10);
  });
});

describe("best-effort + lifecycle", () => {
  it("flush on an empty buffer writes nothing and does not throw", async () => {
    const { writer, captured } = makeWriter();
    const res = await flushSyncDiagnostics(writer, {});
    expect(captured.createMany).toHaveLength(0);
    expect(captured.create).toHaveLength(0);
    expect(res).toEqual({ fullRowsWritten: 0, suppressedCount: 0, summaryWritten: false });
  });

  it("never throws when the writer fails, and still resets the buffer", async () => {
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
    const { writer } = makeWriter({ failCreateMany: true });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(flushSyncDiagnostics(writer, {})).resolves.toBeDefined();
    expect(getBufferedKeyCount()).toBe(0); // reset even on failure
    errSpy.mockRestore();
  });

  it("flush resets the buffer so the next run starts clean", async () => {
    bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
    const { writer } = makeWriter();
    await flushSyncDiagnostics(writer, {});
    expect(getBufferedKeyCount()).toBe(0);
  });
});

describe("per-run scoping (Codex #444 — no shared module-global buffer)", () => {
  it("isolates concurrent runs: each run's buffer sees only its own events", async () => {
    async function scenario(prefix: string, n: number): Promise<number> {
      return withSyncDiagnosticRun(async () => {
        for (let i = 0; i < n; i++) {
          bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", `${prefix}-${i}`, READONLY_ERR);
        }
        await Promise.resolve(); // yield — prove the scope survives an await
        return getBufferedKeyCount();
      });
    }
    const [a, b] = await Promise.all([scenario("A", 2), scenario("B", 5)]);
    expect(a).toBe(2); // run A saw only its 2, not 2+5
    expect(b).toBe(5); // run B saw only its 5
  });

  it("a scoped run does not leak into the fallback (module) buffer", async () => {
    resetSyncDiagnostics(); // fallback starts clean
    await withSyncDiagnosticRun(async () => {
      bufferSyncDiagnostic("idx_sync_listing_upsert_failure", "listing", "RLS1", READONLY_ERR);
      expect(getBufferedKeyCount()).toBe(1); // inside the scope
    });
    expect(getBufferedKeyCount()).toBe(0); // outside → fallback, untouched
  });
});

describe("allowlist is system-only (fail-safe)", () => {
  it("contains ONLY the two known system diagnostic actions", () => {
    expect([...SYNC_DIAGNOSTIC_DEDUPE_ACTIONS].sort()).toEqual(
      ["idx_sync_listing_upsert_failure", "idx_sync_syncstate_failure"].sort(),
    );
  });

  it("does NOT contain any human / compliance / security / §2.05 / portal action", () => {
    for (const a of [
      "status_change",
      "login",
      "logout",
      "impersonate",
      "idx_display_yn_disabled",
      "create",
      "update",
      "delete",
      "trestle_access",
      "consent_capture",
    ]) {
      expect(SYNC_DIAGNOSTIC_DEDUPE_ACTIONS.has(a)).toBe(false);
    }
  });
});
