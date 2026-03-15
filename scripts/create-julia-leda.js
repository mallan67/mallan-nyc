/**
 * Create Julia Djaafar and Leda Gorgone agent accounts.
 *
 * Usage: node scripts/create-julia-leda.js
 *
 * Generates unique temp passwords per agent. Prints them once so broker can share.
 */
const path = require("node:path");
require("dotenv").config({ path: path.resolve(".env.local"), override: true });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const p = new PrismaClient();

async function run() {
  // Generate unique temp passwords for each agent
  const juliaPassword = `Mallan-${crypto.randomBytes(8).toString("hex")}`;
  const ledaPassword = `Mallan-${crypto.randomBytes(8).toString("hex")}`;
  const juliaHash = await bcrypt.hash(juliaPassword, 12);
  const ledaHash = await bcrypt.hash(ledaPassword, 12);

  // Julia Djaafar — referral agent, Japan focus
  const julia = await p.agent.upsert({
    where: { email: "julia@mallan.nyc" },
    update: {
      first_name: "Julia",
      last_name: "Djaafar",
      full_name: "Julia Djaafar",
      password_hash: juliaHash,
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
      languages: ["English", "Japanese", "French"],
      specialties: ["International Buyers", "Luxury Rentals", "Relocation"],
      title: "International Real Estate Advisor",
      public_slug: "julia-djaafar",
    },
    create: {
      first_name: "Julia",
      last_name: "Djaafar",
      full_name: "Julia Djaafar",
      email: "julia@mallan.nyc",
      password_hash: juliaHash,
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
      languages: ["English", "Japanese", "French"],
      specialties: ["International Buyers", "Luxury Rentals", "Relocation"],
      title: "International Real Estate Advisor",
      public_slug: "julia-djaafar",
    },
  });
  console.log(`\n✓ Julia Djaafar — id=${julia.id}`);

  // Leda Gorgone — referral agent, South America focus
  const leda = await p.agent.upsert({
    where: { email: "leda@mallan.nyc" },
    update: {
      first_name: "Leda",
      last_name: "Gorgone",
      full_name: "Leda Gorgone",
      password_hash: ledaHash,
      phone: "(917) 207-5903",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
      languages: ["English", "Portuguese", "Spanish"],
      specialties: ["International Buyers", "Investment Properties", "Relocation"],
      title: "International Real Estate Advisor",
      public_slug: "leda-gorgone",
    },
    create: {
      first_name: "Leda",
      last_name: "Gorgone",
      full_name: "Leda Gorgone",
      email: "leda@mallan.nyc",
      password_hash: ledaHash,
      phone: "(917) 207-5903",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
      languages: ["English", "Portuguese", "Spanish"],
      specialties: ["International Buyers", "Investment Properties", "Relocation"],
      title: "International Real Estate Advisor",
      public_slug: "leda-gorgone",
    },
  });
  console.log(`✓ Leda Gorgone — id=${leda.id}`);

  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  TEMPORARY LOGIN CREDENTIALS               ║`);
  console.log(`║  (share these securely, one-time display)   ║`);
  console.log(`╠════════════════════════════════════════════╣`);
  console.log(`║                                            ║`);
  console.log(`║  Julia Djaafar                             ║`);
  console.log(`║  Email:    julia@mallan.nyc                ║`);
  console.log(`║  Password: ${juliaPassword.padEnd(31)}║`);
  console.log(`║                                            ║`);
  console.log(`║  Leda Gorgone                              ║`);
  console.log(`║  Email:    leda@mallan.nyc                 ║`);
  console.log(`║  Password: ${ledaPassword.padEnd(31)}║`);
  console.log(`║                                            ║`);
  console.log(`║  Login URL: https://mallan.nyc/crm/        ║`);
  console.log(`╚════════════════════════════════════════════╝`);

  await p.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
