#!/usr/bin/env tsx
/**
 * neon-prune-branches — Delete idle Neon branches that have been
 * accumulating from preview deploys.
 *
 * Why this exists: branch hygiene + cost-control on the Launch plan.
 * The Neon-Vercel marketplace integration creates a fresh branch on
 * every preview deploy. The Launch plan's 5000-branch cap is far above
 * any realistic accumulation rate, but stale branches still represent
 * operational debt + cost. Daily runs of this script (via the cron at
 * app/api/cron/neon-branch-prune) keep the count near its steady-state
 * baseline (~8 at time of writing).
 *
 * Historical context: originally built 2026-04-28 to keep mallan-nyc
 * under the Neon free-tier 10-branch cap. After the plan was upgraded
 * to Launch, the cap dimension disappeared but the hygiene motivation
 * remained. See docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md.
 *
 * SAFETY:
 *   - Default mode is dry-run: prints what WOULD be deleted, no API
 *     mutations.
 *   - --execute is required to actually delete.
 *   - Uses the same `pruneBranches` logic the cron uses, so the
 *     decision the cron makes nightly is exactly the same one you can
 *     verify locally.
 *   - Never touches the primary or operator-protected branches, even
 *     with --execute. Only branches idle for >= retention hours go.
 *
 * Required env (loaded from .env.local or .env):
 *   - NEON_API_KEY     — generate at https://console.neon.tech/app/settings/api-keys
 *   - NEON_PROJECT_ID  — visible at the top of the Neon project settings page
 *
 * Usage:
 *   # Dry run (default 24h retention):
 *   npx tsx scripts/neon-prune-branches.ts
 *
 *   # Real delete:
 *   npx tsx scripts/neon-prune-branches.ts --execute
 *
 *   # Custom retention (e.g. 12h for an aggressive cleanup):
 *   npx tsx scripts/neon-prune-branches.ts --execute --hours=12
 */
import { pruneBranches } from "@/lib/neon/branches";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const hoursArg = args.find((a) => a.startsWith("--hours="))?.split("=")[1];
const HOURS = hoursArg !== undefined ? Number(hoursArg) : 24;

// Reject non-finite or non-positive --hours values so a CLI typo like
// `--hours=24h` (Number("24h") === NaN) cannot reach pruneBranches.
// In isPrunable, `ageHours < NaN` is always false — meaning every
// non-primary/non-protected branch would be marked prunable, and a
// follow-up `--execute` would mass-delete active branches by accident.
if (!Number.isFinite(HOURS) || HOURS <= 0) {
  console.error(
    `[neon-prune-branches] --hours must be a positive finite number; got: ${JSON.stringify(hoursArg)}`
  );
  console.error(`  example: --hours=24    --hours=12.5    --hours=48`);
  process.exit(2);
}

if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
  console.error(
    "[neon-prune-branches] NEON_API_KEY and/or NEON_PROJECT_ID not set.\n" +
      "  Add them to .env.local (or .env, or shell env) and re-run.\n" +
      "  Get an API key at https://console.neon.tech/app/settings/api-keys"
  );
  process.exit(2);
}

async function main() {
  const mode = EXECUTE ? "EXECUTE" : "DRY-RUN";
  console.log(
    `\n[neon-prune-branches] mode=${mode} retention=${HOURS}h project=${process.env.NEON_PROJECT_ID}\n`
  );
  if (!EXECUTE) {
    console.log("  (dry-run: no branches will be deleted. Re-run with --execute to apply.)\n");
  }

  const result = await pruneBranches({
    apiKey: process.env.NEON_API_KEY!,
    projectId: process.env.NEON_PROJECT_ID!,
    retentionHours: HOURS,
    execute: EXECUTE,
  });

  console.log("── Summary ───────────────────────────────────────────────");
  console.log(`  Examined:           ${result.examined}`);
  console.log(`  Primary (kept):     ${result.primary_count}`);
  console.log(`  Protected (kept):   ${result.protected_count}`);
  console.log(`  Within retention:   ${result.too_recent_count}`);
  console.log(`  ${EXECUTE ? "Deleted" : "Would delete"}:    ${result.pruned.length}`);
  if (result.pruned.length > 0) {
    console.log("\n  Branches:");
    for (const b of result.pruned) {
      console.log(`    - ${b.name.padEnd(50)} (id=${b.id}, updated=${b.updated_at})`);
    }
  }
  if (result.errors.length > 0) {
    console.error(`\n  Errors during delete: ${result.errors.length}`);
    for (const e of result.errors) {
      console.error(`    - ${e.name} (${e.id}): ${e.message}`);
    }
    process.exit(1);
  }
  if (!EXECUTE && result.pruned.length > 0) {
    console.log("\n  Re-run with --execute to apply the deletes.");
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
