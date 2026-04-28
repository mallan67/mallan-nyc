#!/usr/bin/env tsx
/**
 * neon-prune-branches — Delete idle Neon branches that have been
 * accumulating from preview deploys.
 *
 * Why this exists: Neon's free-tier project caps at 10 branches.
 * The Neon-Vercel marketplace integration creates a fresh branch on
 * every preview deploy, so a fast-pushing day fills the quota and
 * every subsequent preview shows "Neon branching: Branch limit
 * exceeded" in Vercel's deployment Checks panel. Daily runs of this
 * script (via the cron at app/api/cron/neon-branch-prune) keep the
 * count well under the cap so the failure mode never recurs.
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
const HOURS = Number(
  args.find((a) => a.startsWith("--hours="))?.split("=")[1] ?? 24
);

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
