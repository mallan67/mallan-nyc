/**
 * A6 — one-time backfill of the 8 typed agent columns from existing `agent_info` JSON.
 * (agent_info normalization, spec #410 / plan #411 Phase A6 / board issue #415 Lane 1.)
 *
 * WHY: #413 made every WRITER dual-write the typed columns, so NEW/updated rows populate going
 * forward. But the ~109K EXISTING rows still have the 6 new typed columns NULL (and the 2 old
 * ones only ~20% populated). This script fills them from the JSON they already carry.
 *
 * IMPLEMENTATION: raw SQL `UPDATE ... SET col = COALESCE(col, <derived>)`. This is deliberate
 * (Codex #416 P2 x2):
 *   - RACE-SAFE / FILL-ONLY AT WRITE TIME: `COALESCE(col, derived)` keeps a non-null `col` even
 *     if a concurrent idx-sync / CRM PATCH filled it between read and write. It can NEVER overwrite
 *     a non-null typed value. (A snapshot-then-update-by-id pattern could; this cannot.)
 *   - PRESERVES `updated_at`: raw SQL does NOT trigger Prisma `@updatedAt`, so backfilled rows are
 *     NOT restamped as recently-modified (public/CRM lists sort by updated_at desc — must not reorder).
 *   - PARITY with the producer seam `lib/listings/agent-info-typed-columns.ts`
 *     (typedAgentColumnsFromJson): `NULLIF(btrim(x),'')` == cleanStr (trim, empty→null);
 *     `COALESCE(agent_info->>'PascalKey', agent_info->>'lowerKey')` == `ai.PascalKey ?? ai.lowerKey`
 *     (COALESCE falls through only on absent/NULL key, not on empty-string — matches `??`).
 *
 * SAFETY (board #415 Lane 1):
 *   - DEFAULT DRY-RUN: counts (read-only) what WOULD fill, using the SAME expressions the UPDATE uses.
 *   - `--execute` REQUIRED + explicit Maya approval (operator gate).
 *   - BATCH-SAFE: UPDATE by id range in chunks (default 2000); only touches rows that need ≥1 fill.
 *   - HOST-GUARDED: aborts unless DATABASE_URL points at canonical cold-waterfall.
 *   - Writes no JSON, changes no reader. PII email/phone exposure stays gated by the read layer.
 *
 * USAGE:
 *   npm run ops:backfill-agent-info            # DRY-RUN (read-only counts)
 *   npm run ops:backfill-agent-info:execute    # WRITE (Maya-approved only)
 *   optional: --batch=5000
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXECUTE = process.argv.includes("--execute");
const BATCH = (() => {
  const a = process.argv.find((x) => x.startsWith("--batch="));
  const n = a ? parseInt(a.split("=")[1], 10) : 2000;
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : 2000;
})();

const CANONICAL_HOST = "ep-cold-waterfall-adno3ao2";

/**
 * Per-column SQL derive expression — mirrors typedAgentColumnsFromJson exactly.
 * `derive` yields the value the producer seam would compute (or NULL). Exported for tests.
 */
export const BACKFILL_COLUMNS: { col: string; derive: string }[] = [
  { col: "list_agent_full_name",    derive: "NULLIF(btrim(COALESCE(agent_info->>'ListAgentFullName', agent_info->>'name')), '')" },
  { col: "list_office_name",        derive: "NULLIF(btrim(COALESCE(agent_info->>'ListOfficeName', agent_info->>'company')), '')" },
  { col: "list_agent_email",        derive: "NULLIF(btrim(COALESCE(agent_info->>'ListAgentEmail', agent_info->>'email')), '')" },
  { col: "list_agent_direct_phone", derive: "NULLIF(btrim(COALESCE(agent_info->>'ListAgentDirectPhone', agent_info->>'phone')), '')" },
  { col: "list_office_mls_id",      derive: "NULLIF(btrim(agent_info->>'ListOfficeMlsId'), '')" },
  { col: "list_agent_mls_id",       derive: "NULLIF(btrim(agent_info->>'ListAgentMlsId'), '')" },
  { col: "co_list_office_mls_id",   derive: "NULLIF(btrim(agent_info->>'CoListOfficeMlsId'), '')" },
  { col: "co_list_agent_mls_id",    derive: "NULLIF(btrim(agent_info->>'CoListAgentMlsId'), '')" },
];

/** A row needs filling on a column when the column IS NULL and the derived value IS NOT NULL. */
const needsFill = (c: { col: string; derive: string }) => `(${c.col} IS NULL AND ${c.derive} IS NOT NULL)`;
const ANY_FILL = BACKFILL_COLUMNS.map(needsFill).join(" OR ");

/** DRY-RUN count SQL: per-column + rows-with-any-fill. Read-only. Exported for tests. */
export function buildDryRunSql(): string {
  const perCol = BACKFILL_COLUMNS.map((c) => `count(*) FILTER (WHERE ${needsFill(c)}) AS ${c.col}`).join(",\n  ");
  return `SELECT\n  ${perCol},\n  count(*) FILTER (WHERE ${ANY_FILL}) AS rows_any\nFROM listings`;
}

/**
 * EXECUTE UPDATE SQL for one id-range batch. Fill-only + race-safe via COALESCE; does NOT touch
 * updated_at. Exported for tests.
 */
export function buildUpdateSql(): string {
  const sets = BACKFILL_COLUMNS.map((c) => `${c.col} = COALESCE(${c.col}, ${c.derive})`).join(",\n  ");
  return `UPDATE listings SET\n  ${sets}\nWHERE id > $1 AND id <= $2 AND (${ANY_FILL})`;
}

function hostGuard(): void {
  const url = process.env.DATABASE_URL || "";
  const host = url.match(/@([^/?]+)/)?.[1] || "";
  if (!host.includes(CANONICAL_HOST)) {
    console.error(`::ABORT:: DATABASE_URL host (${host || "?"}) is NOT the canonical ${CANONICAL_HOST}. Refusing to run.`);
    process.exit(2);
  }
  console.log(`HOST GUARD OK: ${host}`);
}

async function main() {
  hostGuard();
  console.log(`MODE: ${EXECUTE ? "EXECUTE (writing, COALESCE fill-only, updated_at preserved)" : "DRY-RUN (read-only)"} · batch=${BATCH}`);

  const [dry] = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(buildDryRunSql());
  const num = (v: bigint | number) => Number(v);
  console.log("\n===== A6 DRY-RUN COUNTS (rows that WOULD fill) =====");
  console.log(`rows with ≥1 column to fill: ${num(dry.rows_any)}`);
  for (const c of BACKFILL_COLUMNS) console.log(`  ${c.col}: ${num(dry[c.col])}`);

  if (!EXECUTE) {
    console.log("\nDRY-RUN only — nothing written. Re-run with --execute (Maya-approved) to apply.");
    return;
  }

  // Batched UPDATE by id range. Only rows matching ANY_FILL are touched.
  const [bounds] = await prisma.$queryRawUnsafe<{ lo: bigint | null; hi: bigint | null }[]>(
    `SELECT min(id) AS lo, max(id) AS hi FROM listings`,
  );
  if (bounds.lo == null || bounds.hi == null) { console.log("No rows."); return; }
  const updateSql = buildUpdateSql();
  let lo = BigInt(bounds.lo) - 1n;
  const hiMax = BigInt(bounds.hi);
  let totalUpdated = 0;
  while (lo < hiMax) {
    const hi = lo + BigInt(BATCH);
    const n = await prisma.$executeRawUnsafe(updateSql, lo, hi);
    totalUpdated += n;
    lo = hi;
    if (totalUpdated && totalUpdated % (BATCH * 5) < BATCH) console.log(`  …updated ${totalUpdated} so far (id ≤ ${hi})`);
  }
  console.log(`\nEXECUTE complete: ${totalUpdated} rows updated. Re-run DRY-RUN to verify rows_any → 0 (idempotent).`);
}

// Run only when invoked directly as a script (NOT when imported by a test).
const isDirectRun = (process.argv[1] || "").includes("backfill-agent-info-typed-columns");
if (isDirectRun) {
  main()
    .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
