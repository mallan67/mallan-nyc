/**
 * Backfill `listings.terminal_since` for existing terminal rows (Archive Clock PR-1, #415).
 *
 * DRY-RUN BY DEFAULT — performs ZERO writes. Reports how many terminal rows would receive a
 * terminal_since and how many have no valid stable date. Pass `--execute` ONLY after explicit
 * Maya approval (a separate gated step). Host-guarded to cold-waterfall.
 *
 * Derivation is done IN JS via the SAME helper the live writers use
 * (lib/listings/terminal-since.ts → deriveTerminalSince) — NOT a SQL COALESCE. This guarantees
 * parity with the runtime clock and fixes the prior SQL divergence (Codex #446): each candidate
 * (raw_data.CloseDate → features.CloseDate → raw_data.OffMarketDate → raw_data.ExpirationDate for
 * Expired) is sanity-windowed and the first VALID one wins; invalid/out-of-window candidates (e.g.
 * a CloseDate of year 2814, or an unparseable date) are skipped, never aborting the run.
 * Only fills rows where terminal_since IS NULL (never bumps; never touches live rows).
 *
 * Usage:
 *   npx tsx scripts/backfill-terminal-since.ts            # DRY-RUN (default, no writes)
 *   npx tsx scripts/backfill-terminal-since.ts --execute  # WRITE (gated — only when approved)
 *
 * Under --execute, every actually-updated row (RETURNING id) is appended to a timestamped
 * artifacts/gate3-backfill-touched-<stamp>.jsonl log: { id, old_terminal_since:null,
 * new_terminal_since, source, backfill_run }. That log is the authoritative rollback set, applied
 * VALUE-GUARDED so a later live-writer update is never clobbered (clears only rows still holding the
 * backfilled value; ::timestamp is TZ-independent and matches the stored value under any session):
 *   UPDATE listings AS l SET terminal_since = NULL
 *   FROM (VALUES (<id>, '<new_terminal_since>'::timestamp)) AS v(id, ts)
 *   WHERE l.id = v.id AND l.terminal_since = v.ts;
 */
import path from "node:path";
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });
import pg from "pg";
import { deriveTerminalSince, parseStableDate } from "../lib/listings/terminal-since";
import { normalizeStandardStatus } from "../lib/idx/trestle-mapper";

const EXECUTE = process.argv.includes("--execute");
const HOST = "ep-cold-waterfall-adno3ao2";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
if (!url.includes(HOST)) {
  console.error("FATAL: target is not cold-waterfall production. Aborting.");
  process.exit(1);
}

// Terminal-status predicate matched to RUNTIME normalization (Codex #446): case-insensitive
// and carrying BOTH spellings of canceled. `Canceled` (one L) is the live Cotality value;
// `Cancelled` (two Ls) is the value Mallan invented and stored for a long time. The mapper
// persists raw.StandardStatus VERBATIM (trestle-mapper.ts `status: raw.StandardStatus`), so a
// stored 'Canceled' or 'closed' (lower-case) is a legitimate terminal row — a case-sensitive
// canonical `status IN (...)` would silently skip it, leaving terminal_since NULL so it never
// ages for the future archive predicate. One builder feeds BOTH the SELECT and the --execute
// UPDATE guard, so the two predicates can never drift.
//
// THIS SCRIPT GOT IT RIGHT BEFORE ANYTHING ELSE DID. Every other terminal-status list in the
// repo — the data-retention cron, lib/retention, lib/syndication, scripts/archive-backlog-
// predicate — carried only the invented spelling and therefore silently skipped every row the
// PROVIDER marked canceled. That is fixed now (see
// tests/runtime/status-vocabulary-cotality-binding.test.ts); this comment records that the
// hazard was identified here first.
const TERMINAL_LOWER = ["closed", "sold", "leased", "rented", "withdrawn", "expired", "cancelled", "canceled"];
const terminalPredicate = (col: string) => `lower(${col}) IN (${TERMINAL_LOWER.map((s) => `'${s}'`).join(",")})`;
const NOW = new Date();
const CUTOFF_180 = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000);

// Touched-id capture (Gate 3): under --execute, every actually-updated row is appended to a
// timestamped JSONL artifact for an exact, targeted rollback. We do NOT rely on a vague claim —
// the log is the authoritative `WHERE id IN (...)` source. old_terminal_since is always null
// (the UPDATE guards `terminal_since IS NULL`), so rollback is unambiguous.
const STAMP = NOW.toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("artifacts");
const LOG_PATH = path.join(LOG_DIR, `gate3-backfill-touched-${STAMP}.jsonl`);

/** Append text and fsync it to disk before returning — so the log is DURABLE before the COMMIT.
 *  Loops until EVERY byte is written (writeSync may short-write without throwing), then fsyncs.
 *  Throws (propagating to the caller's ROLLBACK+abort) if a write makes no progress or fsync fails,
 *  so the touched-id log can never be silently truncated → never under-reports committed changes. */
function appendDurable(file: string, text: string): void {
  const buf = Buffer.from(text, "utf8");
  const fd = openSync(file, "a");
  try {
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (n <= 0) throw new Error(`durable log write made no progress at offset ${off}/${buf.length}`);
      off += n;
    }
    fsyncSync(fd); // force OS buffers to disk — survives a crash between log write and COMMIT
  } finally {
    closeSync(fd);
  }
}

/** Make a directory's entries durable (POSIX): fsync(file) flushes contents but not the new dir entry,
 *  so a power loss could otherwise leave a committed batch with no discoverable log file. Called once at
 *  --execute start (after the log file is pre-created) so the entry is durable before any batch commits.
 *  Cross-platform safe + NEVER throws: on Windows (where opening a directory fd is unsupported and NTFS
 *  journals metadata) it is an explicit no-op; any other failure degrades to the Neon rollback branch +
 *  post-verify power-loss fallback rather than aborting the run. */
function fsyncDirIfSupported(dir: string): void {
  if (process.platform === "win32") return; // Windows: openSync(dir) unsupported; NTFS journals metadata
  try {
    const dfd = openSync(dir, "r");
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  } catch (e) {
    console.warn(
      `[EXECUTE] directory fsync skipped (${dir}): ${e instanceof Error ? e.message : String(e)}. ` +
      `Power-loss fallback = the pre-execute Neon rollback branch + post-verify.`,
    );
  }
}

type Row = { status: string; cd: string | null; fcd: string | null; omd: string | null; ed: string | null; exp: string | null };

/** Which stable source produced the derived date — mirrors deriveTerminalSince's exact priority. */
function classifySource(r: Row): string | null {
  const ordered: Array<[string, string | null]> = [
    ["CloseDate", r.cd],
    ["features.CloseDate", r.fcd],
    ["OffMarketDate", r.omd],
  ];
  if (normalizeStandardStatus(r.status) === "Expired") {
    ordered.push(["ExpirationDate", r.ed]);
    ordered.push(["typedExpiration", r.exp]);
  }
  for (const [label, val] of ordered) {
    if (parseStableDate(val, NOW)) return label;
  }
  // No stable source → deriveTerminalSince returns null → row is left NULL (never written).
  // The backfill has NO wall-clock fallback (unlike the live writer), so 'wallClock' never occurs here.
  return null;
}

/** Derive terminal_since for a candidate row using the SHARED helper (full parity). */
function deriveForRow(r: {
  status: string;
  cd: string | null;
  fcd: string | null;
  omd: string | null;
  ed: string | null;
  exp: string | null; // typed listings.expiration_date (CRM exclusives — Codex #446)
}): Date | null {
  return deriveTerminalSince({
    status: r.status,
    raw_data: { CloseDate: r.cd, OffMarketDate: r.omd, ExpirationDate: r.ed },
    features: { CloseDate: r.fcd },
    // Typed listings.expiration_date as the Expired fallback (Codex #446). Passed via
    // expirationDateFallback (NOT a nullish-coalesce of raw-vs-typed) so a blank/invalid
    // raw ExpirationDate fails its own sanity check inside the helper and correctly falls
    // through to the typed value — recovering CRM exclusives converted before the migration.
    expirationDateFallback: r.exp,
    now: NOW,
  });
}

async function main() {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await c.connect();

  if (EXECUTE) {
    mkdirSync(LOG_DIR, { recursive: true });
    // Pre-create the log file so its directory entry exists, then make that entry durable (POSIX)
    // BEFORE any batch commits — so a committed batch can never lack a discoverable rollback log.
    closeSync(openSync(LOG_PATH, "a"));
    fsyncDirIfSupported(LOG_DIR);
    console.log(`[EXECUTE] touched-id capture → ${LOG_PATH}`);
  }

  // Page through terminal rows with NULL terminal_since, fetching only the small candidate
  // date strings (NOT full raw_data) — derivation happens in JS.
  let last = 0;
  let wouldSet = 0, noDate = 0, over180 = 0, alreadySet = 0, batchWrites = 0, batch = 0;

  // already_set count (informational)
  alreadySet = Number(
    (await c.query(`SELECT count(*) n FROM listings WHERE ${terminalPredicate("status")} AND terminal_since IS NOT NULL`)).rows[0].n,
  );

  for (;;) {
    batch++;
    const { rows } = await c.query(
      `SELECT id, status,
         raw_data->>'CloseDate' AS cd, features->>'CloseDate' AS fcd,
         raw_data->>'OffMarketDate' AS omd, raw_data->>'ExpirationDate' AS ed,
         expiration_date::text AS exp
       FROM listings
       WHERE id > $1 AND ${terminalPredicate("status")} AND terminal_since IS NULL
       ORDER BY id LIMIT 5000`,
      [last],
    );
    if (rows.length === 0) break;
    last = rows.reduce((mx: number, r: { id: string | number }) => Math.max(mx, Number(r.id)), last);

    const updates: { id: number; ts: Date }[] = [];
    for (const r of rows) {
      const d = deriveForRow(r);
      if (d) {
        wouldSet++;
        if (d < CUTOFF_180) over180++;
        updates.push({ id: Number(r.id), ts: d });
      } else {
        noDate++;
      }
    }

    if (EXECUTE && updates.length > 0) {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout = '5s'");
      await c.query("SET LOCAL statement_timeout = '60s'");
      // Batched set via unnest; guard terminal_since IS NULL so we never bump.
      const ids = updates.map((u) => u.id);
      const tss = updates.map((u) => u.ts.toISOString());
      const res = await c.query(
        // Re-assert the terminal-status predicate (Codex #446): if a row left terminal
        // status (reactivated/back-on-market) between the SELECT and this UPDATE, the
        // l.status guard prevents writing a stale terminal_since onto a now-live row.
        // RETURNING id captures the rows ACTUALLY updated (post-guard) for the touched-id log.
        // Store as ::timestamp (NOT ::timestamptz): the ts strings are UTC ISO (…Z); ::timestamp takes
        // the wall-time portion → UTC wall time, INDEPENDENT of the session TimeZone, and matching how
        // the live writer (Prisma) stores into this `timestamp(3) without time zone` column. This makes
        // the value-guarded rollback (l.terminal_since = '<logged>'::timestamp) match exactly under any
        // session TZ (verified: ::timestamp matches under GMT and America/New_York; ::timestamptz does NOT).
        `UPDATE listings AS l SET terminal_since = v.ts
         FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::timestamp[]) AS ts) v
         WHERE l.id = v.id AND l.terminal_since IS NULL AND ${terminalPredicate("l.status")}
         RETURNING l.id`,
        [ids, tss],
      );

      // INVARIANT (Codex #451): write the touched-id log DURABLY (fsync) BEFORE COMMIT. A committed
      // batch must never be missing from the rollback set. The log lists the rows the UPDATE actually
      // changed (RETURNING id), each with old (null), new terminal_since, and the derived source.
      const tsById = new Map(updates.map((u) => [u.id, u.ts.toISOString()]));
      const srcById = new Map(rows.map((r: Row & { id: string | number }) => [Number(r.id), classifySource(r)]));
      const logLines = (res.rows as Array<{ id: string | number }>).map((row) => {
        const id = Number(row.id);
        return JSON.stringify({
          id,
          old_terminal_since: null,
          new_terminal_since: tsById.get(id) ?? null,
          source: srcById.get(id) ?? "unknown",
          backfill_run: STAMP,
        });
      });
      try {
        if (logLines.length) appendDurable(LOG_PATH, logLines.join("\n") + "\n");
      } catch (logErr) {
        // Log write failed (disk full / read-only / permission) → the batch is NOT yet committed.
        // ROLLBACK and ABORT so we never commit rows that are absent from the rollback set.
        await c.query("ROLLBACK").catch(() => {});
        console.error(
          `FATAL: touched-id log write failed at batch ${batch} — ROLLED BACK this batch's UPDATE and aborting (no unlogged commit). ` +
          (logErr instanceof Error ? logErr.message : String(logErr)),
        );
        process.exit(1);
      }

      // Log is durably on disk → safe to COMMIT. If COMMIT itself fails, the rows were NOT changed
      // but their ids are already logged: that is harmless OVER-reporting (the rollback UPDATE that
      // nulls a row which stayed NULL is a no-op). The error propagates to main().catch and aborts.
      await c.query("COMMIT");
      batchWrites += res.rowCount ?? 0;
    }
    console.log(`[${EXECUTE ? "EXEC" : "DRY"}] batch ${batch}: scanned ${rows.length}; would_set so far ${wouldSet}; no_date ${noDate}`);
    if (batch > 80) { console.error("ABORT: batch cap"); break; }
  }

  console.log(`\n[${EXECUTE ? "EXECUTE" : "DRY-RUN"}] terminal rows with valid stable date (would set / set): ${wouldSet}`);
  console.log(`[${EXECUTE ? "EXECUTE" : "DRY-RUN"}] no valid stable date (left NULL): ${noDate}`);
  console.log(`[${EXECUTE ? "EXECUTE" : "DRY-RUN"}] of those, >180d old (future archive-eligible): ${over180}`);
  console.log(`[info] terminal rows already having terminal_since (skipped): ${alreadySet}`);
  if (EXECUTE) {
    console.log(`[EXECUTE] rows actually updated: ${batchWrites}`);
    console.log(`[EXECUTE] touched-id log written: ${LOG_PATH} (${batchWrites} lines)`);
    console.log(`[EXECUTE] VALUE-GUARDED rollback (clears ONLY rows still holding the backfilled value;`);
    console.log(`[EXECUTE]   preserves any later live-writer update; build VALUES from the log's id + new_terminal_since):`);
    console.log(`[EXECUTE]   UPDATE listings AS l SET terminal_since = NULL`);
    console.log(`[EXECUTE]   FROM (VALUES (<id>, '<new_terminal_since>'::timestamp)) AS v(id, ts)`);
    console.log(`[EXECUTE]   WHERE l.id = v.id AND l.terminal_since = v.ts;`);
  } else {
    console.log("\nDRY-RUN ONLY — no writes performed. Re-run with --execute (gated) to backfill.");
  }

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
