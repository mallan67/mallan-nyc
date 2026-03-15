const path = require("node:path");
require("dotenv").config({ path: path.resolve(".env.local"), override: true });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function run() {
  const count = await p.agent.count();
  console.log("Total agents:", count);

  const julia = await p.agent.findUnique({
    where: { email: "julia@mallan.nyc" },
    select: { id: true, email: true, status: true, password_hash: true },
  });

  if (julia) {
    console.log("Julia id:", julia.id.toString());
    console.log("Julia hash prefix:", julia.password_hash.substring(0, 20));
  } else {
    console.log("Julia NOT FOUND");
  }

  const url = process.env.DATABASE_URL || "";
  console.log("DB host:", url.match(/@([^/]+)/)?.[1] || "unknown");

  // Check if Vercel env uses same DB
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  console.log("Direct URL host:", directUrl.match(/@([^/]+)/)?.[1] || "same as DATABASE_URL");

  await p.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
