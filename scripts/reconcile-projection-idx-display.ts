#!/usr/bin/env tsx
/**
 * reconcile-projection-idx-display — One-shot drift cleanup that brings
 * `ListingSearchProjection.idx_display_yn` (and the four other mirrored
 * gate fields) back into agreement with the source-of-truth `Listing`
 * row for every drifted listing.
 *
 * WHY THIS EXISTS
 * ---------------
 * The drift audit at `docs/listing-search-projection-drift-report-2026-05-16.md`
 * found 1,949 rows on production where `Listing.idx_display_yn=false` but
 * `ListingSearchProjection.idx_display_yn=true` (the dangerous direction —
 * if PR 5B's reader swap ships on this state, those rows go public).
 *
 * Root cause: two cron writers flipped `Listing.idx_display_yn=false`
 * without dual-writing the projection (see
 * `docs/listing-search-projection-drift-report-2026-05-16.md` §D).
 *
 * That cron writer gap is patched by PR #147
 * (`fix/projection-dual-write-cron-writers`). This script is the
 * one-shot cleanup that PR #147 explicitly does NOT do — it clears the
 * existing drift rows by routing each one through the canonical
 * `dualWriteProjectionForListingId` helper (no direct SQL, no manual
 * upserts, no hand-rolled mapping).
 *
 * SAFETY
 * ------
 *   - **Default mode is DRY-RUN.** Prints projected counts + a sample
 *     plan, never writes to the DB. `--execute` is required to mutate.
 *   - **Cron-writer patch precondition.** Refuses to run with `--execute`
 *     unless the running deployment has the PR #147 writer guards live —
 *     otherwise the next cron tick will re-create drift. A presence
 *     check on the canonical helper covers the library side; the deploy
 *     check is the user's responsibility (run after PR #147 has merged
 *     and the natural feed-reconcile + data-retention crons have ticked
 *     cleanly post-deploy).
 *   - **Pure projection logic via the canonical helper.** Uses
 *     `dualWriteProjectionForListingId` from
 *     `lib/search/listing-search-projection.ts` — the SAME helper the
 *     5 H1 Tier-1 writers and the 2 H1 Tier-2 cron writers (PR #147)
 *     use. No direct SQL. No duplicate mapping code.
 *   - **Idempotent.** Re-running picks up where it left off (cursor on
 *     `listing.id ASC`) and skips rows that have already converged.
 *   - **Cursor-based pagination.** Long execute is interruptible.
 *   - **Per-row try/catch.** A single bad row counts toward `errors`
 *     but doesn't abort the batch.
 *   - **Audit-event per row.** Emits `projection_reconcile_idx_display_yn`
 *     with the before/after snapshot for compliance trail.
 *   - **Never deletes projection rows.** Pure upsert path.
 *
 * USAGE
 * -----
 *   # Dry-run (default — counts + sample, no writes):
 *   npm run ops:projection-reconcile
 *
 *   # Execute (real writes) — ONLY after PR #147 has deployed AND a
 *   # natural cron cycle has confirmed drift accumulation has stopped:
 *   npm run ops:projection-reconcile:execute
 *
 *   # Custom batch + cap:
 *   npx tsx scripts/reconcile-projection-idx-display.ts --execute --batch=100 --max-batches=20
 *
 *   # Limit total rows (e.g. for staging probe):
 *   npx tsx scripts/reconcile-projection-idx-display.ts --execute --limit=10
 */
import prisma from "@/lib/prisma";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const BATCH = positiveInt(arg("--batch="), 100);
const MAX_BATCHES = positiveInt(arg("--max-batches="), Number.POSITIVE_INFINITY);
const LIMIT = positiveInt(arg("--limit="), Number.POSITIVE_INFINITY);

function arg(prefix: string): string | undefined {
  return args.find((a) => a.startsWith(prefix))?.split("=")[1];
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid argument value: ${value}`);
  }
  return n;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

interface ReconcileStats {
  scanned: number;
  reconciled: number;
  already_aligned: number;
  errors: number;
}

interface DriftRow {
  listing_id_pk: bigint;
  listing_id: string;
  listing_status: string;
  listing_idx_display: boolean;
  projection_idx_display: boolean | null;
  listing_ield: boolean;
  projection_ield: boolean | null;
  listing_iaddr: boolean;
  projection_iaddr: boolean | null;
  listing_participant_only: boolean;
  projection_participant_only_yn: boolean | null;
  listing_rls_eligible: boolean;
  projection_rls_eligible: boolean;
}

async function fetchDriftBatch(lastId: bigint | null, take: number): Promise<DriftRow[]> {
  // Raw query mirrors the read-only audit query in
  // docs/listing-search-projection-drift-report-2026-05-16.md so that
  // re-running this script with --execute reconciles exactly the rows
  // that the drift report identified. Pagination is on listings.id so a
  // long execute is interruptible and resumable.
  //
  // Using $queryRaw because Prisma's generated client doesn't naturally
  // expose the "listings JOIN listing_search_projection WHERE a DISTINCT
  // FROM b" pattern without a relation walk. Fully parameterized — no
  // string interpolation of user input. The `lastId` bigint binds via
  // Prisma's Sql tagged template.
  const lastIdConstraint = lastId !== null ? lastId : BigInt(-1);
  return prisma.$queryRaw<DriftRow[]>`
    SELECT
      l.id                                         AS listing_id_pk,
      l.listing_id                                 AS listing_id,
      l.status                                     AS listing_status,
      l.idx_display_yn                             AS listing_idx_display,
      p.idx_display_yn                             AS projection_idx_display,
      l.internet_entire_listing_display_yn         AS listing_ield,
      p.internet_entire_listing_display_yn         AS projection_ield,
      l.internet_address_display_yn                AS listing_iaddr,
      p.internet_address_display_yn                AS projection_iaddr,
      l.participant_only                           AS listing_participant_only,
      p.participant_only_yn                        AS projection_participant_only_yn,
      l.rls_eligible                               AS listing_rls_eligible,
      p.rls_eligible                               AS projection_rls_eligible
    FROM listings l
    JOIN listing_search_projection p ON p.listing_id = l.listing_id
    WHERE l.id > ${lastIdConstraint}
      AND (
            l.idx_display_yn                     IS DISTINCT FROM p.idx_display_yn
         OR l.internet_entire_listing_display_yn IS DISTINCT FROM p.internet_entire_listing_display_yn
         OR l.internet_address_display_yn        IS DISTINCT FROM p.internet_address_display_yn
         OR l.participant_only                   IS DISTINCT FROM p.participant_only_yn
         OR l.rls_eligible                       IS DISTINCT FROM p.rls_eligible
      )
    ORDER BY l.id ASC
    LIMIT ${take}
  `;
}

async function totalDriftCount(): Promise<{ idx_display: number; any_gate: number }> {
  const rows = await prisma.$queryRaw<Array<{ idx_display: bigint; any_gate: bigint }>>`
    SELECT
      COUNT(*) FILTER (
        WHERE l.idx_display_yn IS DISTINCT FROM p.idx_display_yn
      )::bigint AS idx_display,
      COUNT(*)::bigint AS any_gate
    FROM listings l
    JOIN listing_search_projection p ON p.listing_id = l.listing_id
    WHERE l.idx_display_yn                     IS DISTINCT FROM p.idx_display_yn
       OR l.internet_entire_listing_display_yn IS DISTINCT FROM p.internet_entire_listing_display_yn
       OR l.internet_address_display_yn        IS DISTINCT FROM p.internet_address_display_yn
       OR l.participant_only                   IS DISTINCT FROM p.participant_only_yn
       OR l.rls_eligible                       IS DISTINCT FROM p.rls_eligible
  `;
  const row = rows[0] ?? { idx_display: BigInt(0), any_gate: BigInt(0) };
  return { idx_display: Number(row.idx_display), any_gate: Number(row.any_gate) };
}

/**
 * Defensive deploy guard for `--execute` mode. Refuses to run unless the
 * canonical helper is importable (proves we're on a build that has the
 * dual-write helper). The deploy-level check that PR #147's cron writer
 * patches are live is the user's responsibility — they must wait for the
 * post-deploy soak before invoking `--execute`.
 */
function ensurePreconditions(): void {
  if (typeof dualWriteProjectionForListingId !== "function") {
    throw new Error(
      "Aborting: dualWriteProjectionForListingId is not importable from " +
        "@/lib/search/listing-search-projection. The build is missing the " +
        "canonical projection helper. This script must NOT run.",
    );
  }
}

async function run(): Promise<void> {
  const startTime = Date.now();

  console.log("─── listing search projection — idx_display reconciliation ───");
  console.log(`Mode: ${EXECUTE ? "\x1b[31mEXECUTE (real writes)\x1b[0m" : "DRY-RUN"}`);
  console.log(`Batch size: ${BATCH}`);
  console.log(`Max batches: ${MAX_BATCHES === Number.POSITIVE_INFINITY ? "unlimited" : MAX_BATCHES}`);
  console.log(`Row limit: ${LIMIT === Number.POSITIVE_INFINITY ? "unlimited" : LIMIT}`);

  ensurePreconditions();

  // Pre-flight: total drift snapshot
  const { idx_display, any_gate } = await totalDriftCount();
  console.log("");
  console.log("Pre-flight drift snapshot:");
  console.log(`  idx_display_yn drift rows:        ${idx_display}`);
  console.log(`  any-gate-field drift rows:        ${any_gate}`);
  console.log("");

  if (any_gate === 0) {
    console.log("Drift count is 0. Nothing to reconcile. Exiting.");
    return;
  }

  if (EXECUTE) {
    console.log("\x1b[33m⚠ EXECUTE mode confirmed — proceeding with writes via canonical helper.\x1b[0m");
    console.log("\x1b[33m  Verify PR #147 is deployed and the post-merge soak observed 0 new drift.\x1b[0m");
  } else {
    console.log("DRY-RUN mode — listing the first batch only. No writes will occur.");
    console.log("Re-run with --execute (or `npm run ops:projection-reconcile:execute`) to apply.");
  }
  console.log("");

  const stats: ReconcileStats = {
    scanned: 0,
    reconciled: 0,
    already_aligned: 0,
    errors: 0,
  };

  let lastId: bigint | null = null;
  let batchNum = 0;

  while (batchNum < MAX_BATCHES && stats.scanned < LIMIT) {
    const remaining = Math.min(BATCH, LIMIT - stats.scanned);
    const rows = await fetchDriftBatch(lastId, remaining);
    if (rows.length === 0) break;

    batchNum++;
    const t0 = Date.now();
    console.log(`Batch ${batchNum} — ${rows.length} drift row(s) fetched (cursor > id ${lastId ?? "null"})`);

    for (const row of rows) {
      stats.scanned++;
      lastId = row.listing_id_pk;

      // Build a compact diff string for the audit trail + dry-run output.
      const diff: string[] = [];
      if (row.listing_idx_display !== row.projection_idx_display) {
        diff.push(`idx_display=${row.projection_idx_display}→${row.listing_idx_display}`);
      }
      if (row.listing_ield !== row.projection_ield) {
        diff.push(`ield=${row.projection_ield}→${row.listing_ield}`);
      }
      if (row.listing_iaddr !== row.projection_iaddr) {
        diff.push(`iaddr=${row.projection_iaddr}→${row.listing_iaddr}`);
      }
      if (row.listing_participant_only !== row.projection_participant_only_yn) {
        diff.push(`part_only=${row.projection_participant_only_yn}→${row.listing_participant_only}`);
      }
      if (row.listing_rls_eligible !== row.projection_rls_eligible) {
        diff.push(`rls_eligible=${row.projection_rls_eligible}→${row.listing_rls_eligible}`);
      }
      const diffStr = diff.join(", ");

      if (!EXECUTE) {
        // Dry-run: just print the planned change.
        if (stats.scanned <= 10 || stats.scanned % 200 === 0) {
          console.log(`  [plan ${stats.scanned}] ${row.listing_id} (${row.listing_status}): ${diffStr}`);
        }
        stats.reconciled++;
        continue;
      }

      // EXECUTE mode — canonical helper writes the projection. Wrapped
      // in try/catch so a bad row doesn't abort the batch.
      try {
        await dualWriteProjectionForListingId(prisma, row.listing_id);

        // Audit event — REBNY compliance trail for the reconciliation.
        // Per-row create (no transaction with the upsert) — matches the
        // sequential dual-write pattern in lib/idx/sync.ts.
        await prisma.auditEvent.create({
          data: {
            action: "projection_reconcile_idx_display_yn",
            entity_type: "listing",
            entity_id: row.listing_id_pk.toString(),
            user_type: "system",
            user_id: null,
            changes: {
              listing_id: row.listing_id,
              status: row.listing_status,
              diff: diffStr,
              source: "scripts/reconcile-projection-idx-display.ts",
            },
          },
        });

        stats.reconciled++;
      } catch (err) {
        stats.errors++;
        console.warn(
          `  [error ${stats.scanned}] ${row.listing_id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    console.log(
      `  batch ${batchNum} done in ${fmtDuration(Date.now() - t0)} — ` +
        `scanned=${stats.scanned} reconciled=${stats.reconciled} errors=${stats.errors}`,
    );

    // In dry-run we only need to show the first batch to confirm the plan.
    if (!EXECUTE) {
      console.log("  (dry-run — stopping after first batch; pass --execute to process all)");
      break;
    }
  }

  // Post-flight: re-check drift after writes.
  const post = await totalDriftCount();
  console.log("");
  console.log("─── Summary ───");
  console.log(`  scanned:                 ${stats.scanned}`);
  console.log(`  reconciled:              ${stats.reconciled}`);
  console.log(`  errors:                  ${stats.errors}`);
  console.log(`  pre-flight any-gate drift: ${any_gate}`);
  console.log(`  post-flight any-gate drift: ${post.any_gate} ` +
    (EXECUTE ? (post.any_gate === 0 ? "✓ drift cleared" : "⚠ residual drift") : "(dry-run — unchanged)"));
  console.log(`  total elapsed:           ${fmtDuration(Date.now() - startTime)}`);

  // Per Codex review on PR #148: execute mode must NEVER silently succeed
  // when the reconciliation isn't actually complete. Two distinct failure
  // modes promote to a non-zero exit code so CI / a one-shot operator /
  // a wrapping shell can detect partial reconciliation without parsing
  // logs.
  //
  // Dry-run is exempt by design: it's supposed to leave drift in place
  // (the whole point), so existing drift must NOT cause a non-zero exit.
  // Only an unhandled script-level error (caught in the outer .catch
  // below) can fail a dry-run.
  if (EXECUTE) {
    const failures: string[] = [];
    if (stats.errors > 0) {
      failures.push(
        `${stats.errors} row error(s) during reconciliation — projection sync for those rows did NOT complete`,
      );
    }
    if (post.any_gate > 0) {
      failures.push(
        `${post.any_gate} drift row(s) remain after reconciliation (pre-flight was ${any_gate}) — execute did not fully reconcile`,
      );
    }
    if (failures.length > 0) {
      console.log("");
      console.log("\x1b[31m─── EXECUTE MODE FAILED ───\x1b[0m");
      for (const f of failures) {
        console.log(`\x1b[31m  ✗ ${f}\x1b[0m`);
      }
      console.log("\x1b[31m  Exit code: 1\x1b[0m");
      console.log("\x1b[31m  Action: investigate failed rows + re-run --execute to converge.\x1b[0m");
      process.exitCode = 1;
    }
  }
}

run()
  .catch((err) => {
    console.error("\x1b[31mReconciliation script failed:\x1b[0m", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
