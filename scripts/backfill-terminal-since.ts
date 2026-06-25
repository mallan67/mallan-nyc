/**
 * Backfill `listings.terminal_since` for existing terminal rows (Archive Clock PR-1, #415).
 *
 * DRY-RUN BY DEFAULT — performs ZERO writes. It reports how many terminal rows would receive a
 * `terminal_since` (from the stable source dates, sanity-windowed) and how many have no valid
 * stable date. Pass `--execute` ONLY after explicit Maya approval (a separate gated step) to run
 * the batched UPDATE. Host-guarded to cold-waterfall.
 *
 * Stable-date derivation mirrors lib/listings/terminal-since.ts:
 *   raw_data.CloseDate → features.CloseDate → raw_data.OffMarketDate → raw_data.ExpirationDate(Expired)
 *   sanity window: 2000-01-01 <= d <= now()+1day (rejects bogus dates like year 2814).
 * Only fills rows where terminal_since IS NULL (never bumps existing values; never touches live rows).
 *
 * Usage:
 *   npx tsx scripts/backfill-terminal-since.ts            # DRY-RUN (default, no writes)
 *   npx tsx scripts/backfill-terminal-since.ts --execute  # WRITE (gated — only when approved)
 */
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });
import pg from "pg";

const EXECUTE = process.argv.includes("--execute");
const HOST = "ep-cold-waterfall-adno3ao2";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
if (!url.includes(HOST)) {
  console.error("FATAL: target is not cold-waterfall production. Aborting.");
  process.exit(1);
}

const T = "('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')";
// SQL mirror of deriveTerminalSince + sanity window.
const RAWTS = `COALESCE(
  NULLIF(raw_data->>'CloseDate','')::timestamp,
  NULLIF(features->>'CloseDate','')::timestamp,
  NULLIF(raw_data->>'OffMarketDate','')::timestamp,
  CASE WHEN status = 'Expired' THEN NULLIF(raw_data->>'ExpirationDate','')::timestamp END
)`;
const STABLE = `(CASE WHEN (${RAWTS}) >= TIMESTAMP '2000-01-01'
                    AND (${RAWTS}) <= now() + interval '1 day'
                 THEN (${RAWTS}) END)`;
const ELIGIBLE = `status IN ${T} AND terminal_since IS NULL AND ${STABLE} IS NOT NULL`;

async function main() {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await c.connect();

  // Dry-run measurement (always runs first).
  await c.query("BEGIN"); await c.query("SET TRANSACTION READ ONLY");
  const m = (await c.query(`SELECT
    count(*) FILTER (WHERE status IN ${T} AND terminal_since IS NULL) AS terminal_null,
    count(*) FILTER (WHERE ${ELIGIBLE}) AS would_set,
    count(*) FILTER (WHERE status IN ${T} AND terminal_since IS NULL AND ${STABLE} IS NULL) AS no_valid_stable_date,
    count(*) FILTER (WHERE status IN ${T} AND terminal_since IS NOT NULL) AS already_set,
    pg_size_pretty(sum(pg_column_size(raw_data)+pg_column_size(compliance)+pg_column_size(media))
      FILTER (WHERE ${ELIGIBLE} AND ${STABLE} < now()-interval '180 days')) AS strippable_eligible_over_180d,
    count(*) FILTER (WHERE ${ELIGIBLE} AND ${STABLE} < now()-interval '180 days') AS eligible_over_180d
    FROM listings`)).rows[0];
  await c.query("ROLLBACK");
  console.log(`[DRY-RUN] terminal rows with NULL terminal_since: ${m.terminal_null}`);
  console.log(`[DRY-RUN] would set terminal_since (valid stable date): ${m.would_set}`);
  console.log(`[DRY-RUN] no valid stable date (left NULL): ${m.no_valid_stable_date}`);
  console.log(`[DRY-RUN] already set (skipped): ${m.already_set}`);
  console.log(`[DRY-RUN] of those, >180d old (future archive-eligible): ${m.eligible_over_180d} (~${m.strippable_eligible_over_180d} raw/compliance/media)`);

  if (!EXECUTE) {
    console.log("\nDRY-RUN ONLY — no writes performed. Re-run with --execute (gated) to backfill.");
    await c.end();
    return;
  }

  // EXECUTE path (gated). Batched keyset; never bumps existing; terminal-only.
  console.log("\n--execute set: backfilling terminal_since in batches of 5000 ...");
  let last = 0, total = 0, batch = 0;
  for (;;) {
    batch++;
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    await c.query("SET LOCAL statement_timeout = '60s'");
    const r = await c.query(
      `UPDATE listings SET terminal_since = ${STABLE}
       WHERE id IN (SELECT id FROM listings WHERE id > $1 AND ${ELIGIBLE} ORDER BY id LIMIT 5000)
       RETURNING id`, [last]);
    await c.query("COMMIT");
    if (r.rows.length === 0) break;
    last = r.rows.reduce((mx, row) => Math.max(mx, Number(row.id)), last);
    total += r.rows.length;
    console.log(`  batch ${batch}: ${r.rows.length} (cumulative ${total}); lastId=${last}`);
    if (batch > 80) { console.error("ABORT: batch cap"); break; }
  }
  console.log(`Done. terminal_since set on ${total} rows.`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
