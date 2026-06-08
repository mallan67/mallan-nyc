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
 *   - Phase 0.5 guardrail: --execute FAILS CLOSED unless NEON_PROJECT_ID is the
 *     canonical production project (hidden-mountain-87248164). The refusal
 *     happens BEFORE pruneBranches is ever called with execute:true, so no
 *     branch is deleted against a wrong/stale project. Dry-run is read-only and
 *     allowed to proceed, but prints a clear non-canonical warning.
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
 *   # Real delete (canonical production project only):
 *   npx tsx scripts/neon-prune-branches.ts --execute
 *
 *   # Custom retention (e.g. 12h for an aggressive cleanup):
 *   npx tsx scripts/neon-prune-branches.ts --execute --hours=12
 */
import { pruneBranches } from "@/lib/neon/branches";
import {
  isCanonicalNeonProject,
  CANONICAL_NEON_PROJECT_ID,
} from "@/lib/ops/canonical-neon-target";

/**
 * Pure, testable CLI entrypoint. Returns the process exit code instead of
 * calling process.exit, so tests can assert refusal/allow behavior (and mock
 * pruneBranches) without spawning a process or touching Neon.
 *
 * Exit codes: 0 = ok · 1 = prune had delete errors · 2 = refused/invalid input.
 */
export async function runPruneCli(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const EXECUTE = argv.includes("--execute");
  const hoursArg = argv.find((a) => a.startsWith("--hours="))?.split("=")[1];
  const HOURS = hoursArg !== undefined ? Number(hoursArg) : 24;

  // Reject non-finite or non-positive --hours values so a CLI typo like
  // `--hours=24h` (Number("24h") === NaN) cannot reach pruneBranches.
  if (!Number.isFinite(HOURS) || HOURS <= 0) {
    console.error(
      `[neon-prune-branches] --hours must be a positive finite number; got: ${JSON.stringify(hoursArg)}`,
    );
    console.error(`  example: --hours=24    --hours=12.5    --hours=48`);
    return 2;
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    console.error(
      "[neon-prune-branches] NEON_API_KEY and/or NEON_PROJECT_ID not set.\n" +
        "  Add them to .env.local (or .env, or shell env) and re-run.\n" +
        "  Get an API key at https://console.neon.tech/app/settings/api-keys",
    );
    return 2;
  }

  // Phase 0.5 production-cut guardrail (FAIL-CLOSED). A real delete must never
  // run against a non-canonical project. This refusal is BEFORE pruneBranches,
  // so execute:true is never reached for the wrong/stale project.
  const canonical = isCanonicalNeonProject(projectId);
  if (EXECUTE && !canonical) {
    console.error(
      `[neon-prune-branches] REFUSED --execute: NEON_PROJECT_ID="${projectId}" is not the ` +
        `canonical production project (${CANONICAL_NEON_PROJECT_ID}). No branch deleted (fail-closed).`,
    );
    return 2;
  }
  if (!canonical) {
    // Dry-run is read-only, so it proceeds — but make it loud that a follow-up
    // --execute would be refused against this project.
    console.warn(
      `[neon-prune-branches] WARNING: NEON_PROJECT_ID="${projectId}" is NOT the canonical ` +
        `production project (${CANONICAL_NEON_PROJECT_ID}); --execute will be refused. ` +
        `(dry-run continues, read-only.)`,
    );
  }

  const mode = EXECUTE ? "EXECUTE" : "DRY-RUN";
  console.log(
    `\n[neon-prune-branches] mode=${mode} retention=${HOURS}h project=${projectId}\n`,
  );
  if (!EXECUTE) {
    console.log("  (dry-run: no branches will be deleted. Re-run with --execute to apply.)\n");
  }

  const result = await pruneBranches({
    apiKey,
    projectId,
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
    return 1;
  }
  if (!EXECUTE && result.pruned.length > 0) {
    console.log("\n  Re-run with --execute to apply the deletes.");
  }
  console.log();
  return 0;
}

// Auto-run ONLY when invoked directly as a CLI (tsx), never when imported by a
// test. Under jest the entry (process.argv[1]) is the test runner, not this
// file — so importing the module to unit-test runPruneCli does not execute it.
// (CommonJS/ESM-agnostic: avoids import.meta so it works under ts-jest too.)
const entry = process.argv[1] ?? "";
if (/neon-prune-branches\.(ts|mjs|js)$/.test(entry)) {
  runPruneCli(process.argv.slice(2), process.env)
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
