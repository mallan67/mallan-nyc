#!/usr/bin/env node
// One-time password reset script for broker account
// Usage: node scripts/reset-password.js
//
// Prompts for a new password, hashes it with bcrypt, and updates
// the Agent record in the database.

const readline = require("readline");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const SALT_ROUNDS = 12;
const EMAIL = "maya@mallan.nyc";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log(`\nPassword reset for: ${EMAIL}\n`);

  const password = await ask("Enter new password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    rl.close();
    process.exit(1);
  }

  const confirm = await ask("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    rl.close();
    process.exit(1);
  }

  rl.close();

  console.log("\nHashing password...");
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  console.log("Updating database...");
  const prisma = new PrismaClient();

  try {
    const agent = await prisma.agent.findUnique({ where: { email: EMAIL } });
    if (!agent) {
      console.error(`No agent found with email: ${EMAIL}`);
      console.log("\nCreating broker agent record...");
      await prisma.agent.create({
        data: {
          email: EMAIL,
          first_name: "Maya",
          last_name: "Allan",
          full_name: "Maya Allan",
          role: "broker",
          status: "active",
          license_no: "10311201806",
          phone: "646-258-4460",
          password_hash: hash,
        },
      });
      console.log("Broker agent record created with password.");
    } else {
      await prisma.agent.update({
        where: { email: EMAIL },
        data: { password_hash: hash },
      });
      console.log("Password updated successfully.");
    }

    console.log(`\nYou can now log in at: https://mallan.nyc/crm/login.html`);
    console.log(`  Email: ${EMAIL}`);
    console.log(`  Password: (the one you just entered)\n`);
  } catch (err) {
    console.error("Database error:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
