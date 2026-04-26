#!/usr/bin/env tsx
// One-shot ethics-training backfill for Workstream C4.
//
// Run AFTER #51's migration applies and BEFORE merging #54 (the auth gate).
// Without this backfill, #54 will lock out every active agent at next session
// refresh because their ethics_training_expires_at is NULL.
//
// What it does:
//   - Stamps `ethics_training_expires_at = now() + 30 days` on every active
//     agent whose value is NULL.
//   - Reports before/after counts so the operator sees exactly what changed.
//   - Reports `would_lock_out` count post-backfill — must be 0 before #54.
//
// Read AND write — only modifies agents.ethics_training_expires_at where it
// was NULL. Never overwrites a real recorded date.
//
// Usage:
//   npx tsx scripts/c4-ethics-backfill.ts            # apply
//   npx tsx scripts/c4-ethics-backfill.ts --dry-run  # report only, no write

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();

  try {
    console.log("");
    console.log("======================================================");
    console.log("  C4 Ethics Training Backfill");
    if (dryRun) console.log("  *** DRY RUN — no writes ***");
    console.log("======================================================");
    console.log("");

    // Pre-state
    const before = await prisma.$queryRaw<Array<{
      total_active: bigint;
      with_expires: bigint;
      without_expires: bigint;
      already_expired: bigint;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::bigint AS total_active,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NOT NULL)::bigint AS with_expires,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NULL)::bigint AS without_expires,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at < NOW())::bigint AS already_expired
      FROM agents
    `;
    const b = before[0];
    console.log("Pre-state (active agents):");
    console.log(`  Total active:          ${b.total_active}`);
    console.log(`  With expires_at set:   ${b.with_expires}`);
    console.log(`  With expires_at NULL:  ${b.without_expires}  ← these will be backfilled`);
    console.log(`  With expires_at < NOW: ${b.already_expired}  ← NOT backfilled (real expiry)`);
    console.log("");

    if (Number(b.without_expires) === 0) {
      console.log("✓ No agents need backfilling. Nothing to do.");
      const wouldLockOut = Number(b.already_expired);
      console.log("");
      console.log(`would_lock_out = ${wouldLockOut}`);
      if (wouldLockOut > 0) {
        console.log("");
        console.log("⚠  Some active agents have an EXPIRED ethics_training_expires_at.");
        console.log("   Those WILL be locked out by #54. Either record real completions,");
        console.log("   or extend their dates manually before merging #54.");
      }
      return;
    }

    // Apply
    let updated = 0;
    if (!dryRun) {
      const result = await prisma.$executeRaw`
        UPDATE agents
           SET ethics_training_expires_at = NOW() + INTERVAL '30 days'
         WHERE status = 'active'
           AND ethics_training_expires_at IS NULL
      `;
      updated = result;
    }

    console.log(dryRun ? "Would update:" : "Updated:");
    console.log(`  ${updated} agent row(s) — set ethics_training_expires_at = now() + 30 days`);
    console.log("");

    // Post-state — same query, must show would_lock_out = 0
    const after = await prisma.$queryRaw<Array<{
      with_expires: bigint;
      without_expires: bigint;
      would_lock_out: bigint;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NOT NULL)::bigint AS with_expires,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NULL)::bigint AS without_expires,
        COUNT(*) FILTER (WHERE status = 'active' AND (ethics_training_expires_at IS NULL OR ethics_training_expires_at < NOW()))::bigint AS would_lock_out
      FROM agents
    `;
    const a = after[0];
    console.log("Post-state (active agents):");
    console.log(`  With expires_at set:   ${a.with_expires}`);
    console.log(`  With expires_at NULL:  ${a.without_expires}`);
    console.log(`  would_lock_out:        ${a.would_lock_out}  ← MUST be 0 before merging #54`);
    console.log("");

    if (Number(a.would_lock_out) === 0) {
      console.log("✅ Safe to merge #54. No active agent will be locked out.");
    } else {
      console.log("⚠  would_lock_out > 0 — investigate before merging #54.");
      console.log("   Likely cause: an agent has a real ethics_training_expires_at < NOW().");
      console.log("   Either record real completion or extend the date manually.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("");
  console.error("❌ Backfill error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
