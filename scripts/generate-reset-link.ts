#!/usr/bin/env tsx
// One-shot password reset link generator.
//
// Use when the email-delivered reset link can't reach the recipient — e.g.
// M365 same-mailbox delivery hole when the agent's email is in the same
// tenant as the SMTP sender.
//
// What it does:
//   - Queries the Agent (or Lead) table by email.
//   - Mints a reset token using the same generateResetToken() the
//     forgot-password endpoint uses (HMAC-SHA256, 1-hour TTL, embeds the
//     current password hash prefix so the token auto-invalidates after use).
//   - Prints the reset URL.
//
// Read-only against the DB. No writes. Setting the new password happens
// through the normal /reset-password flow which fully audits + sessions.
//
// Usage:
//   npx tsx scripts/generate-reset-link.ts <email>
//   npx tsx scripts/generate-reset-link.ts <email> --type=lead

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { generateResetToken } from "../lib/auth/reset-token";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1];
  const userType: "agent" | "lead" = typeArg === "lead" ? "lead" : "agent";

  if (!email) {
    console.error("Usage: npx tsx scripts/generate-reset-link.ts <email> [--type=lead]");
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
  const prisma = new PrismaClient();

  try {
    console.log("");
    console.log("======================================================");
    console.log("  Reset Link Generator");
    console.log("======================================================");
    console.log(`  Email:    ${email}`);
    console.log(`  Type:     ${userType}`);
    console.log(`  Base URL: ${baseUrl}`);
    console.log("");

    if (userType === "agent") {
      const agent = await prisma.agent.findUnique({
        where: { email },
        select: { id: true, first_name: true, last_name: true, email: true, role: true, status: true, password_hash: true },
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

      const token = generateResetToken(agent.id, "agent", agent.password_hash);
      const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

      console.log("✅ Reset URL (valid for 1 hour, single-use):");
      console.log("");
      console.log(url);
      console.log("");
      console.log("Open the URL in a browser, set a new password, and you'll be signed in.");
      return;
    }

    const lead = await prisma.lead.findUnique({
      where: { email },
      select: { id: true, first_name: true, last_name: true, email: true, password_hash: true },
    });

    if (!lead) {
      console.error(`✗ No lead found with email "${email}".`);
      process.exit(2);
    }
    if (!lead.password_hash) {
      console.error(`✗ Lead "${email}" has no password_hash — cannot mint reset token. Use the invite flow instead.`);
      process.exit(3);
    }

    console.log(`Lead matched:`);
    console.log(`  ID:   ${lead.id}`);
    console.log(`  Name: ${lead.first_name} ${lead.last_name}`);
    console.log("");

    const token = generateResetToken(lead.id, "lead", lead.password_hash);
    const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    console.log("✅ Reset URL (valid for 1 hour, single-use):");
    console.log("");
    console.log(url);
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
