#!/usr/bin/env tsx
// Read-only ethics-training status report for broker administration.
//
// UCBA Art. III §6: ethics training is an ADMINISTRATIVE compliance record. It
// does not affect login, MFA, or session creation (see lib/auth/session.ts and
// commit 2c10ce0b, which removed the over-broad login check that had blocked
// active agents). Account access is controlled solely by agent status
// (active/inactive/suspended).
//
// This script is READ-ONLY. It performs a single SELECT ($queryRaw) and writes
// NOTHING — it never stamps placeholder training dates, it is not a release
// gate, and it is not an operational precondition for any deploy. It lists
// active agents whose ethics-training record is incomplete or expired so the
// broker can follow up.
//
// Classification (see lib/compliance/ethics-training-status.ts): a record is
// "current" ONLY when completion AND expiry are both recorded and the expiry is
// not past. A future expiry with no completion date is INCOMPLETE → follow-up.
//
// Usage:
//   npx tsx scripts/ethics-training-status-report.ts

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import {
  classifyEthicsTraining,
  ethicsFollowUpReason,
  type EthicsFollowUpReason,
} from "../lib/compliance/ethics-training-status";

const REASON_LABEL: Record<Exclude<EthicsFollowUpReason, null>, string> = {
  missing_completion: "no completion date on file",
  missing_expiry: "no expiry date on file",
  expired: "expired",
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("");
    console.log("======================================================");
    console.log("  Ethics Training Status Report (READ-ONLY)");
    console.log("  Administrative record — does not affect login/access");
    console.log("======================================================");
    console.log("");

    // READ-ONLY: one SELECT of the record fields, classified in-process.
    const rows = await prisma.$queryRaw<Array<{
      id: bigint;
      ethics_training_completed_at: Date | null;
      ethics_training_expires_at: Date | null;
    }>>`
      SELECT id, ethics_training_completed_at, ethics_training_expires_at
      FROM agents
      WHERE status = 'active'
    `;

    const now = new Date();
    let current = 0;
    const followUp: Array<{ id: bigint; reason: string }> = [];
    for (const r of rows) {
      const record = { completedAt: r.ethics_training_completed_at, expiresAt: r.ethics_training_expires_at };
      if (classifyEthicsTraining(record, now) === "current") {
        current += 1;
      } else {
        const reason = ethicsFollowUpReason(record, now);
        const detail =
          reason === "expired" && r.ethics_training_expires_at
            ? `expired ${r.ethics_training_expires_at.toISOString().slice(0, 10)}`
            : REASON_LABEL[reason as Exclude<EthicsFollowUpReason, null>];
        followUp.push({ id: r.id, reason: detail });
      }
    }

    console.log("Active agents:");
    console.log(`  Total active:     ${rows.length}`);
    console.log(`  Current record:   ${current}`);
    console.log(`  Needs follow-up:  ${followUp.length}`);
    console.log("");

    if (followUp.length === 0) {
      console.log("All active agents have a complete, unexpired ethics-training record.");
    } else {
      console.log(`Agents needing broker follow-up (${followUp.length}):`);
      for (const a of followUp) {
        console.log(`  • agent #${a.id} — ${a.reason}`);
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
