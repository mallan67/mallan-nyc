// Temporary script to check agent records in the database
const path = require("node:path");
require("dotenv").config({ path: path.resolve(".env.local"), override: true });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function run() {
  const agents = await p.agent.findMany({
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
      status: true,
      license_type: true,
      license_no: true,
      bio: true,
      photo: true,
      specialties: true,
      languages: true,
      public_slug: true,
      title: true,
      last_login: true,
    },
    orderBy: { id: "asc" },
  });

  for (const a of agents) {
    console.log(`\n=== ${a.first_name} ${a.last_name} (${a.role}) ===`);
    console.log(`  Email: ${a.email}`);
    console.log(`  ID: ${a.id}`);
    console.log(`  Status: ${a.status}`);
    console.log(`  License: ${a.license_type || "none"} ${a.license_no || ""}`);
    console.log(`  Bio: ${a.bio ? a.bio.substring(0, 80) + "..." : "EMPTY"}`);
    console.log(`  Photo: ${a.photo || "EMPTY"}`);
    console.log(`  Title: ${a.title || "EMPTY"}`);
    console.log(`  Slug: ${a.public_slug || "EMPTY"}`);
    console.log(`  Languages: ${a.languages?.length ? a.languages.join(", ") : "EMPTY"}`);
    console.log(`  Specialties: ${a.specialties?.length ? a.specialties.join(", ") : "EMPTY"}`);
    console.log(`  Last Login: ${a.last_login || "NEVER"}`);
  }

  await p.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
