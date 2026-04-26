#!/usr/bin/env tsx
// Direct admin password reset — bypasses email + token validation.
//
// Use when:
//   - The forgot-password email is not arriving (e.g. M365 same-mailbox)
//   - The reset URL token isn't validating (e.g. local SESSION_SECRET
//     differs from prod, so HMAC signatures don't match across env)
//   - Any other reason the normal reset flow is broken
//
// What it does:
//   - Looks up the agent by email
//   - Hashes the new password with bcrypt (matching lib/auth/password.ts)
//   - UPDATEs agents.password_hash directly
//   - Reports success — agent can log in with the new password immediately
//
// SECURITY: This is a direct write to the prod DB. Only run for accounts
// you legitimately own. Audit log entry is written so the change is
// recorded.
//
// Usage:
//   npx tsx scripts/admin-reset-password.ts <email> <new-password>
//
// Example:
//   npx tsx scripts/admin-reset-password.ts maya@mallan.nyc 'TempPass#2026!'

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim().toLowerCase();
  const newPassword = args[1];

  if (!email || !newPassword) {
    console.error("");
    console.error("Usage: npx tsx scripts/admin-reset-password.ts <email> <new-password>");
    console.error("");
    console.error("Example:");
    console.error("  npx tsx scripts/admin-reset-password.ts maya@mallan.nyc 'TempPass#2026!'");
    console.error("");
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error("✗ Password must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log("");
    console.log("======================================================");
    console.log("  Admin Password Reset");
    console.log("======================================================");
    console.log(`  Email:    ${email}`);
    console.log("");

    const agent = await prisma.agent.findUnique({
      where: { email },
      select: { id: true, first_name: true, last_name: true, role: true, status: true },
    });

    if (!agent) {
      console.error(`✗ No agent found with email "${email}".`);
      process.exit(2);
    }

    console.log(`Agent matched:`);
    console.log(`  ID:     ${agent.id}`);
    console.log(`  Name:   ${agent.first_name} ${agent.last_name}`);
    console.log(`  Role:   ${agent.role}`);
    console.log(`  Status: ${agent.status}`);
    console.log("");

    if (agent.status !== "active") {
      console.error(`⚠  Account status is "${agent.status}" — login will be blocked even after reset.`);
      console.error(`   Reactivate via: UPDATE agents SET status='active' WHERE email='${email}';`);
    }

    // Hash with bcrypt — match lib/auth/password.ts (10 rounds)
    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.agent.update({
      where: { id: agent.id },
      data: { password_hash: newHash },
    });

    // Audit trail
    try {
      await prisma.auditEvent.create({
        data: {
          event_type: "update",
          entity_type: "agent",
          entity_id: agent.id.toString(),
          actor_type: "admin_script",
          actor_id: "admin-reset-password",
          metadata: {
            field: "password_hash",
            method: "admin_script_direct_reset",
            email,
          },
        },
      });
    } catch {
      // Audit logging is best-effort; never block the reset
    }

    console.log("✅ Password reset successfully.");
    console.log("");
    console.log(`Sign in at https://mallan.nyc/admin/login with:`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${newPassword}`);
    console.log("");
    console.log("MFA: a 6-digit code will be sent to your auth_delivery_email (or");
    console.log("MFA_EMAIL env, or primary email — whichever is configured).");
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("");
  console.error("❌ Error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
