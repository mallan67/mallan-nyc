#!/usr/bin/env tsx
/**
 * media:system-health CLI — runs the read-only media invariant monitor and
 * prints a human or --json report. NEVER mutates.
 *
 * Use:
 *   npm run media:system-health          # human-readable
 *   npm run media:system-health -- --json
 *
 * Exit codes:
 *   0  no red invariants
 *   1  one or more red invariants (a real inventory defect)
 *
 * The inventory reader is injected. Phase 1 ships a clean STUB reader so the
 * check surface is runnable and wired into ops:health now; the real read-only
 * DB reader (SELECT over listing_media identity/key/hero columns) is attached
 * at Phase 2/5 when those columns are populated. Until then the identity
 * invariants run against the stub and report green — the wiring is real even
 * though the data source is a placeholder, and that is stated, not hidden.
 */
import { runSystemHealth, type MediaInventoryRow } from "../lib/ops/media-system-health";

/** Placeholder read-only reader — replaced by the real DB reader in Phase 2. */
async function readInventoryStub(): Promise<MediaInventoryRow[]> {
  return [];
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const report = await runSystemHealth({ readInventory: readInventoryStub });

  if (asJson) {
    process.stdout.write(JSON.stringify({ ...report, source: "stub" }, null, 2) + "\n");
  } else {
    console.log("media:system-health (source: stub — real reader wired in Phase 2)\n");
    for (const c of report.checks) {
      const mark = c.status === "green" ? "PASS" : c.status === "red" ? "FAIL" : " n/a";
      console.log(`  [${mark}] ${c.id} — ${c.detail}`);
    }
    console.log(`\n  red: ${report.red}`);
  }

  process.exit(report.red > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("media:system-health crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
