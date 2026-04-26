#!/usr/bin/env tsx
// Audit which Agent and Lead rows are missing phone numbers.
//
// Why: SMS-based password reset requires a phone on file. Without one, a
// user can't recover their account through the standard flow. This script
// surfaces who would need a phone added BEFORE the SMS-reset PR ships.
//
// Read-only.
//
// Usage:
//   npx tsx scripts/audit-missing-phones.ts
//   npx tsx scripts/audit-missing-phones.ts --leads-with-passwords-only

import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";

async function main() {
  const onlyLeadsWithPasswords = process.argv.includes("--leads-with-passwords-only");
  const prisma = new PrismaClient();

  try {
    console.log("");
    console.log("======================================================");
    console.log("  Phone Number Audit — SMS Reset Readiness");
    console.log("======================================================");
    console.log("");

    // Agents
    const allAgents = await prisma.agent.findMany({
      where: { status: "active" },
      select: { id: true, email: true, first_name: true, last_name: true, phone: true, role: true },
      orderBy: { created_at: "desc" },
    });
    const agentsNoPhone = allAgents.filter((a) => !a.phone);

    console.log(`Active agents: ${allAgents.length}`);
    console.log(`  With phone:    ${allAgents.length - agentsNoPhone.length}`);
    console.log(`  Without phone: ${agentsNoPhone.length}`);
    if (agentsNoPhone.length) {
      console.log("");
      console.log("  Agents missing phone (would be locked out of SMS reset):");
      for (const a of agentsNoPhone) {
        console.log(`    [${a.role}] ${a.first_name} ${a.last_name} <${a.email}>`);
      }
    }
    console.log("");

    // Leads — all of them have a row, but only those with password_hash
    // can actually log in, so reset-readiness is only meaningful for them.
    const totalLeads = await prisma.lead.count();
    const leadsWithPassword = await prisma.lead.count({ where: { password_hash: { not: null } } });
    const leadsNoPhone = await prisma.lead.findMany({
      where: {
        phone: null,
        ...(onlyLeadsWithPasswords ? { password_hash: { not: null } } : {}),
      },
      select: { id: true, email: true, first_name: true, last_name: true, password_hash: true },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    console.log(`Leads (total):              ${totalLeads}`);
    console.log(`Leads with password set:    ${leadsWithPassword}  ← can actually log in`);
    console.log(`Leads missing phone${onlyLeadsWithPasswords ? " (with-password only)" : ""}: ${leadsNoPhone.length}${leadsNoPhone.length === 50 ? "+" : ""}`);
    if (leadsNoPhone.length) {
      console.log("");
      console.log(`  ${onlyLeadsWithPasswords ? "Active leads" : "Leads"} missing phone (top ${Math.min(50, leadsNoPhone.length)}):`);
      for (const l of leadsNoPhone) {
        const pw = l.password_hash ? "has-pwd" : "no-pwd ";
        console.log(`    [${pw}] ${l.first_name} ${l.last_name} <${l.email}>`);
      }
      if (!onlyLeadsWithPasswords) {
        console.log("");
        console.log("  Hint: re-run with --leads-with-passwords-only to see only");
        console.log("        leads that actually have a password and would need SMS reset.");
      }
    }
    console.log("");

    if (agentsNoPhone.length === 0 && leadsNoPhone.filter((l) => l.password_hash).length === 0) {
      console.log("✅ Everyone with login credentials has a phone on file. SMS reset is safe to ship.");
    } else {
      console.log("⚠  Some accounts would be locked out of SMS reset. Add phone numbers to those rows");
      console.log("   before relying on SMS-only reset, OR keep an admin-only fallback for them.");
    }
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
