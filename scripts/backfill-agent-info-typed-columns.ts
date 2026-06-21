/**
 * A6 — one-time backfill of the 8 typed agent columns from existing `agent_info` JSON.
 * (agent_info normalization, spec #410 / plan #411 Phase A6 / board issue #415 Lane 1.)
 *
 * WHY: #413 made every WRITER dual-write the typed columns, so NEW/updated rows populate going
 * forward. But the ~109K EXISTING rows still have the 6 new typed columns NULL (and the 2 old
 * ones only ~20% populated). This script fills them from the JSON they already carry.
 *
 * SAFETY (matches issue #415 Lane 1 requirements):
 *   - DEFAULT DRY-RUN. Prints per-column counts of what WOULD change. Writes nothing.
 *   - `--execute` REQUIRED to write, AND only runs after an explicit Maya approval (operator gate).
 *   - BATCH-SAFE: processes by id in chunks (default 2000) to avoid long locks / Neon timeouts.
 *   - FILL-ONLY: sets a typed column ONLY where it is currently NULL and the JSON has a value.
 *     NEVER overwrites a non-null typed column (idempotent; re-runnable).
 *   - PARITY: derives values via the SAME shared seam the producers use
 *     (lib/listings/agent-info-typed-columns.ts → typedAgentColumnsFromJson), so backfilled
 *     values match what new writes produce (PascalCase + lowercase shapes).
 *   - HOST-GUARDED: aborts unless DATABASE_URL points at the canonical cold-waterfall endpoint.
 *   - PII: email/phone are written to the typed columns (already private). Exposure stays gated by
 *     the read layer (unchanged). This script changes no reader and writes no JSON.
 *
 * USAGE:
 *   npm run ops:backfill-agent-info            # DRY-RUN (read-only counts)
 *   npm run ops:backfill-agent-info:execute    # WRITE (Maya-approved only)
 *   optional: --batch=5000
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { typedAgentColumnsFromJson, type TypedAgentColumns } from "../lib/listings/agent-info-typed-columns";

const prisma = new PrismaClient();

const EXECUTE = process.argv.includes("--execute");
const BATCH = (() => {
  const a = process.argv.find((x) => x.startsWith("--batch="));
  const n = a ? parseInt(a.split("=")[1], 10) : 2000;
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : 2000;
})();

const CANONICAL_HOST = "ep-cold-waterfall-adno3ao2";
const TYPED_KEYS: (keyof TypedAgentColumns)[] = [
  "list_agent_full_name",
  "list_office_name",
  "list_agent_email",
  "list_agent_direct_phone",
  "list_office_mls_id",
  "list_agent_mls_id",
  "co_list_office_mls_id",
  "co_list_agent_mls_id",
];

function hostGuard(): void {
  const url = process.env.DATABASE_URL || "";
  const host = url.match(/@([^/?]+)/)?.[1] || "";
  if (!host.includes(CANONICAL_HOST)) {
    console.error(`::ABORT:: DATABASE_URL host (${host || "?"}) is NOT the canonical ${CANONICAL_HOST}. Refusing to run.`);
    process.exit(2);
  }
  console.log(`HOST GUARD OK: ${host}`);
}

type Row = { id: bigint; agent_info: unknown } & Record<string, string | null>;

/** Which typed columns this row would NEWLY fill (currently null + JSON has a value). */
function fillsForRow(row: Row): Partial<Record<keyof TypedAgentColumns, string>> {
  const derived = typedAgentColumnsFromJson(row.agent_info as Record<string, unknown>);
  const out: Partial<Record<keyof TypedAgentColumns, string>> = {};
  for (const k of TYPED_KEYS) {
    const current = row[k];
    const value = derived[k];
    if ((current === null || current === undefined) && value != null) {
      out[k] = value;
    }
  }
  return out;
}

async function main() {
  hostGuard();
  console.log(`MODE: ${EXECUTE ? "EXECUTE (writing)" : "DRY-RUN (read-only)"} · batch=${BATCH}`);

  const total = await prisma.listing.count();
  console.log(`Total listings: ${total}`);

  const perColumnFilled: Record<string, number> = Object.fromEntries(TYPED_KEYS.map((k) => [k, 0]));
  let rowsAffected = 0;
  let scanned = 0;
  let cursor: bigint | undefined = undefined;

  // Keyset pagination by id (batch-safe; no OFFSET).
  for (;;) {
    const rows = (await prisma.listing.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true,
        agent_info: true,
        list_agent_full_name: true,
        list_office_name: true,
        list_agent_email: true,
        list_agent_direct_phone: true,
        list_office_mls_id: true,
        list_agent_mls_id: true,
        co_list_office_mls_id: true,
        co_list_agent_mls_id: true,
      },
    })) as unknown as Row[];

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const row of rows) {
      const fills = fillsForRow(row);
      const keys = Object.keys(fills) as (keyof TypedAgentColumns)[];
      if (keys.length === 0) continue;
      rowsAffected++;
      for (const k of keys) perColumnFilled[k]++;

      if (EXECUTE) {
        await prisma.listing.update({ where: { id: row.id }, data: fills as Prisma.ListingUpdateInput });
      }
    }
    if (scanned % (BATCH * 10) === 0) console.log(`  …scanned ${scanned}/${total} · rows-to-fill so far ${rowsAffected}`);
  }

  console.log("\n===== A6 BACKFILL REPORT =====");
  console.log(`scanned: ${scanned}`);
  console.log(`rows that ${EXECUTE ? "WERE" : "WOULD BE"} filled (≥1 column): ${rowsAffected}`);
  console.log("per-column fills:");
  for (const k of TYPED_KEYS) console.log(`  ${k}: ${perColumnFilled[k]}`);

  if (!EXECUTE) {
    console.log("\nDRY-RUN only — nothing written. Re-run with --execute (Maya-approved) to apply.");
  } else {
    console.log("\nEXECUTE complete. Re-run DRY-RUN to verify rows-to-fill drops toward 0 (idempotent).");
  }
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
