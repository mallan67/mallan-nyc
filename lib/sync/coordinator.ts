/**
 * Sync coordinator — a real pg session-level advisory lock that serializes the
 * feed sync runs.
 *
 * THE GUARD THIS REPLACES: `app/api/cron/media-sync/route.ts` used an
 * audit-event row ("was a run logged in the last 10 min?") as a pseudo-lock.
 * That is racy (two runs can both read "no recent run" before either writes)
 * and leaves a stale marker if a run dies. A Postgres SESSION advisory lock is
 * atomic (`pg_try_advisory_lock` returns false immediately if held) and is
 * auto-released when the connection ends — so a crashed run never wedges the
 * next one.
 *
 * `withSyncLock` is pure orchestration over an injected `AdvisoryLockSession`
 * (unit-tested with a fake). `createPgAdvisoryLockSession` is the real adapter:
 * a DEDICATED `pg` Client on the UNPOOLED URL, so `tryLock` and `unlock` are
 * guaranteed to run on the SAME backend connection (a pooled client could send
 * the unlock to a different backend, which would never release the lock).
 */
import { Pool } from "pg";

export type SyncLockName = "property-sync" | "media-sync";

/**
 * Advisory-lock keys — distinct 32-bit ints, one per sync stream, so the two
 * streams never block each other. Held in a dedicated high namespace (210000+)
 * to avoid colliding with any other advisory-lock key used elsewhere against
 * the same database (session and transaction advisory locks share one space).
 */
export const SYNC_LOCK_KEYS: Record<SyncLockName, number> = {
  "property-sync": 210001,
  "media-sync": 210002,
};

/** A session that can take/release ONE Postgres advisory lock by key. Both
 * calls MUST hit the same DB backend connection (see the pg adapter). */
export interface AdvisoryLockSession {
  tryLock(key: number): Promise<boolean>;
  unlock(key: number): Promise<void>;
}

export interface WithSyncLockResult<T> {
  /** true = we held the lock and ran `fn`; false = another run held it. */
  ran: boolean;
  result?: T;
}

/**
 * Run `fn` under the named advisory lock. If the lock is already held by
 * another run, skip cleanly (`ran:false`) without calling `fn`. The lock is
 * always released in `finally` — including when `fn` throws (the error still
 * propagates).
 */
export async function withSyncLock<T>(
  name: SyncLockName,
  fn: () => Promise<T>,
  session: AdvisoryLockSession,
): Promise<WithSyncLockResult<T>> {
  const key = SYNC_LOCK_KEYS[name];
  const acquired = await session.tryLock(key);
  if (!acquired) return { ran: false };
  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    await session.unlock(key);
  }
}

/**
 * Real adapter: a dedicated single-connection `pg` Client on the UNPOOLED URL.
 * The caller owns the lifecycle — `open()` before `withSyncLock`, `close()` in
 * its own `finally` — so the backend connection (and thus the session lock)
 * lives exactly as long as the run.
 *
 * Advisory functions return a scalar, so a bound-parameter query is used with
 * the key as `$1` (never string-interpolated).
 */
export interface PgAdvisoryLockSession extends AdvisoryLockSession {
  open(): Promise<void>;
  close(): Promise<void>;
}

export function createPgAdvisoryLockSession(
  connectionString: string = process.env.DATABASE_URL_UNPOOLED ?? "",
): PgAdvisoryLockSession {
  // max:1 + a single held `connect()` client guarantees tryLock and unlock run
  // on the SAME backend connection (a session advisory lock is connection-scoped;
  // a different connection could never release it).
  const pool = new Pool({ connectionString, max: 1 });
  let client: { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>; release(): void } | null = null;
  return {
    async open() {
      client = await pool.connect();
    },
    async close() {
      if (client) {
        client.release();
        client = null;
      }
      await pool.end();
    },
    async tryLock(key: number): Promise<boolean> {
      if (!client) throw new Error("advisory-lock session not open");
      const res = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
      return res.rows[0]?.locked === true;
    },
    async unlock(key: number): Promise<void> {
      if (!client) throw new Error("advisory-lock session not open");
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    },
  };
}
