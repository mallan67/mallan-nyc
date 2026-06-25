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
 */
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });
import pg from "pg";
import { deriveTerminalSince } from "../lib/listings/terminal-since";

const EXECUTE = process.argv.includes("--execute");
const HOST = "ep-cold-waterfall-adno3ao2";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
if (!url.includes(HOST)) {
  console.error("FATAL: target is not cold-waterfall production. Aborting.");
  process.exit(1);
}

const TERMINAL = ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Cancelled"];
const NOW = new Date();
const CUTOFF_180 = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000);

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
    // ExpirationDate fallback (Expired only, applied inside the helper): prefer the
    // raw_data JSON value, else the typed expiration_date column — matches the
    // expiration cron, which seeds terminal_since from listing.expiration_date. This
    // covers CRM exclusives converted before the migration that have no JSON
    // ExpirationDate (Codex #446) so they are no longer left terminal_since=NULL.
    raw_data: { CloseDate: r.cd, OffMarketDate: r.omd, ExpirationDate: r.ed ?? r.exp },
    features: { CloseDate: r.fcd },
    now: NOW,
  });
}

async function main() {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await c.connect();

  const STATUS_IN = `status IN (${TERMINAL.map((s) => `'${s}'`).join(",")})`;
  // Page through terminal rows with NULL terminal_since, fetching only the small candidate
  // date strings (NOT full raw_data) — derivation happens in JS.
  let last = 0;
  let wouldSet = 0, noDate = 0, over180 = 0, alreadySet = 0, batchWrites = 0, batch = 0;

  // already_set count (informational)
  alreadySet = Number(
    (await c.query(`SELECT count(*) n FROM listings WHERE ${STATUS_IN} AND terminal_since IS NOT NULL`)).rows[0].n,
  );

  for (;;) {
    batch++;
    const { rows } = await c.query(
      `SELECT id, status,
         raw_data->>'CloseDate' AS cd, features->>'CloseDate' AS fcd,
         raw_data->>'OffMarketDate' AS omd, raw_data->>'ExpirationDate' AS ed,
         expiration_date::text AS exp
       FROM listings
       WHERE id > $1 AND ${STATUS_IN} AND terminal_since IS NULL
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
        `UPDATE listings AS l SET terminal_since = v.ts
         FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::timestamptz[]) AS ts) v
         WHERE l.id = v.id AND l.terminal_since IS NULL AND l.${STATUS_IN}`,
        [ids, tss],
      );
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
  if (EXECUTE) console.log(`[EXECUTE] rows actually updated: ${batchWrites}`);
  else console.log("\nDRY-RUN ONLY — no writes performed. Re-run with --execute (gated) to backfill.");

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
