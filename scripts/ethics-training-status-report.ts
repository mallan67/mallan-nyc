#!/usr/bin/env tsx
// Read-only ethics-training status report for broker administration.
//
// UCBA Art. III §6: ethics training is an ADMINISTRATIVE compliance record. It
// does not affect login, MFA, or session creation (see lib/auth/session.ts and
// commit 2c10ce0b, which removed the over-broad login check that had blocked
// active agents). Account access is controlled solely by agent status
// (active/inactive/suspended).
//
// This script is READ-ONLY. It writes NOTHING — it never stamps placeholder
// training dates, it is not a release gate, and it is not an operational
// precondition for any deploy. It simply lists active agents whose ethics
// training is missing or expired so the broker can follow up.
//
// Usage:
//   npx tsx scripts/ethics-training-status-report.ts

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("");
    console.log("======================================================");
    console.log("  Ethics Training Status Report (READ-ONLY)");
    console.log("  Administrative record — does NOT affect login/access");
    console.log("======================================================");
    console.log("");

    const summary = await prisma.$queryRaw<Array<{
      total_active: bigint;
      current: bigint;
      missing: bigint;
      expired: bigint;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::bigint AS total_active,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NOT NULL AND ethics_training_expires_at >= NOW())::bigint AS current,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at IS NULL)::bigint AS missing,
        COUNT(*) FILTER (WHERE status = 'active' AND ethics_training_expires_at < NOW())::bigint AS expired
      FROM agents
    `;
    const s = summary[0];
    console.log("Active agents:");
    console.log(`  Total active:            ${s.total_active}`);
    console.log(`  Current ethics training: ${s.current}`);
    console.log(`  Missing (no record):     ${s.missing}   ← broker follow-up`);
    console.log(`  Expired:                 ${s.expired}   ← broker follow-up`);
    console.log("");

    const followUp = await prisma.$queryRaw<Array<{
      id: bigint;
      ethics_training_expires_at: Date | null;
    }>>`
      SELECT id, ethics_training_expires_at
      FROM agents
      WHERE status = 'active'
        AND (ethics_training_expires_at IS NULL OR ethics_training_expires_at < NOW())
      ORDER BY ethics_training_expires_at ASC NULLS FIRST
    `;

    if (followUp.length === 0) {
      console.log("All active agents have a current ethics-training record.");
    } else {
      console.log(`Agents needing broker follow-up (${followUp.length}):`);
      for (const a of followUp) {
        const when = a.ethics_training_expires_at
          ? `expired ${a.ethics_training_expires_at.toISOString().slice(0, 10)}`
          : "no record on file";
        console.log(`  • agent #${a.id} — ${when}`);
      }
    }
    console.log("");
    console.log("This report changes nothing. Ethics training is administrative;");
    console.log("account access is governed by agent status, never by these dates.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Report error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
