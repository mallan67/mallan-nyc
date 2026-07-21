/**
 * Unified system — Phase 2, Task 9: pg advisory-lock sync coordinator.
 *
 * Replaces the audit-event pseudo-guard (media-sync/route.ts:44). A real
 * session-level advisory lock is taken at run start and released in `finally`;
 * a second concurrent run that cannot acquire it skips cleanly (ran:false).
 * The orchestration is tested here with an injected fake session (no DB); the
 * pg-backed adapter's shape is pinned by source-scan.
 */
import * as fs from "fs";
import * as path from "path";
import {
  withSyncLock,
  SYNC_LOCK_KEYS,
  type AdvisoryLockSession,
} from "@/lib/sync/coordinator";

/** A fake cluster: `held` mimics Postgres' single global advisory-lock space. */
function makeCluster() {
  const held = new Set<number>();
  const unlocks: number[] = [];
  const session = (): AdvisoryLockSession => ({
    async tryLock(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    async unlock(key) {
      held.delete(key);
      unlocks.push(key);
    },
  });
  return { held, unlocks, session };
}

describe("withSyncLock", () => {
  it("acquires, runs fn, returns ran:true + result, releases the lock", async () => {
    const c = makeCluster();
    const fn = jest.fn(async () => "DONE");
    const out = await withSyncLock("media-sync", fn, c.session());
    expect(out).toEqual({ ran: true, result: "DONE" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.unlocks).toEqual([SYNC_LOCK_KEYS["media-sync"]]);
    expect(c.held.size).toBe(0); // released
  });

  it("a second concurrent run cannot acquire → ran:false, fn NOT called, no unlock", async () => {
    const c = makeCluster();
    // First holder takes the lock and never releases (simulates an in-flight run).
    await c.session().tryLock(SYNC_LOCK_KEYS["media-sync"]);
    const fn = jest.fn(async () => "SHOULD-NOT-RUN");
    const out = await withSyncLock("media-sync", fn, c.session());
    expect(out).toEqual({ ran: false });
    expect(fn).not.toHaveBeenCalled();
    expect(c.unlocks).toEqual([]); // must not release a lock it never held
  });

  it("releases the lock even when fn throws (finally), and propagates the error", async () => {
    const c = makeCluster();
    const boom = new Error("sync blew up");
    await expect(
      withSyncLock("property-sync", async () => {
        throw boom;
      }, c.session()),
    ).rejects.toBe(boom);
    expect(c.unlocks).toEqual([SYNC_LOCK_KEYS["property-sync"]]);
    expect(c.held.size).toBe(0);
  });

  it("distinct lock names do not block each other (different keys)", async () => {
    const c = makeCluster();
    const a = await withSyncLock("property-sync", async () => "P", c.session());
    const b = await withSyncLock("media-sync", async () => "M", c.session());
    expect(a).toEqual({ ran: true, result: "P" });
    expect(b).toEqual({ ran: true, result: "M" });
    expect(SYNC_LOCK_KEYS["property-sync"]).not.toBe(SYNC_LOCK_KEYS["media-sync"]);
  });
});

describe("pg advisory-lock adapter shape (source-scan; no DB)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../lib/sync/coordinator.ts"),
    "utf8",
  );
  it("uses pg_try_advisory_lock + pg_advisory_unlock, parameter-bound, on a dedicated unpooled connection", () => {
    expect(src).toContain("pg_try_advisory_lock");
    expect(src).toContain("pg_advisory_unlock");
    expect(src).toContain("DATABASE_URL_UNPOOLED");
    // Same-connection guarantee: a dedicated pg Client, not a pooled one.
    expect(src).toMatch(/new Client\(/);
    // Never interpolate the key into SQL — parameter-bound ($1).
    expect(src).toContain("$1");
  });
});
