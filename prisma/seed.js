<<<<<<< HEAD
/* prisma/seed.js — robust seeding that handles existing rows (by email or fullName) */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function ensureAgent(agentData) {
  let a = await prisma.agent.findUnique({ where: { email: agentData.email } });
  if (a) {
    await prisma.agent.update({
      where: { email: agentData.email },
      data: {
        fullName: agentData.fullName,
        firstName: agentData.firstName,
        lastName: agentData.lastName,
        secondEmail: agentData.secondEmail,
        licenseNo: agentData.licenseNo,
        licenseExpiry: agentData.licenseExpiry,
        saleSplit: agentData.saleSplit,
        rentalSplit: agentData.rentalSplit,
      },
    });
    return await prisma.agent.findUnique({ where: { email: agentData.email } });
  }

  a = await prisma.agent.findUnique({ where: { fullName: agentData.fullName } });
  if (a) {
    await prisma.agent.update({
      where: { fullName: agentData.fullName },
      data: {
        firstName: agentData.firstName,
        lastName: agentData.lastName,
        secondEmail: agentData.secondEmail,
        licenseNo: agentData.licenseNo,
        licenseExpiry: agentData.licenseExpiry,
        saleSplit: agentData.saleSplit,
        rentalSplit: agentData.rentalSplit,
      },
    });
    return await prisma.agent.findUnique({ where: { fullName: agentData.fullName } });
  }

  return await prisma.agent.create({ data: agentData });
}

async function main() {
  const agentPayload = {
    email: "maya@mallannyhomes.com",
    fullName: "Maya Allan",
    firstName: "Maya",
    lastName: "Allan",
    secondEmail: null,
    licenseNo: "NY123456",
    licenseExpiry: new Date("2026-12-31"),
    saleSplit: 60,
    rentalSplit: 60,
  };

  const maya = await ensureAgent(agentPayload);
  console.log("Agent ensured:", maya.email, maya.fullName);
=======
// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const maya = await prisma.agent.upsert({
    where: { email: 'maya@mallannyhomes.com' },
    update: {},
    create: {
      firstName: 'Maya',
      lastName: 'Allan',
      email: 'maya@mallannyhomes.com',
      email2: null,
      licenseNo: 'NY123456',
      licenseExpiry: new Date('2026-12-31'),
      saleSplit: 60,
      rentSplit: 60,
    },
  });
>>>>>>> 103d01c (chore(db): add bootstrap.sql and BOM-safe run_sql.js)

  await prisma.deal.createMany({
    data: [
      {
<<<<<<< HEAD
        address: "300 E 90th St, New York, NY",
        agentEmail: maya.email,
        type: "SALE",
        status: "CLOSED",
        price: 1200000,
        contractSigned: new Date("2025-06-01"),
        closingDate: new Date("2025-09-01"),
      },
      {
        address: "1600 Fulton St, Brooklyn, NY",
        agentEmail: maya.email,
        type: "RENTAL",
        status: "CLOSED",
        price: 3500,
        contractSigned: new Date("2025-05-10"),
        closingDate: new Date("2025-05-25"),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dealDetail.createMany({
    data: [
      {
        address: "300 E 90th St, New York, NY",
        agentEmail: maya.email,
        contractSigned: new Date("2025-06-01"),
        agentFirstName: "Maya",
        agentLastName: "Allan",
        agentLicense: "NY123456",
        type: "SALE",
        price: 1200000,
        agentCommissionPct: 3,
        agentCommissionUsd: 36000,
        split: 60,
        contractClosed: new Date("2025-09-01"),
      },
      {
        address: "1600 Fulton St, Brooklyn, NY",
        agentEmail: maya.email,
        contractSigned: new Date("2025-05-10"),
        agentFirstName: "Maya",
        agentLastName: "Allan",
        agentLicense: "NY123456",
        type: "RENTAL",
        price: 3500,
        agentCommissionPct: 15,
        agentCommissionUsd: 525,
        split: 60,
        contractClosed: new Date("2025-05-25"),
=======
        agentId: maya.id,
        type: 'SALE',                // change if your enum differs
        address: '300 E 90th St, New York, NY',
        price: 1200000,
        agentCommissionPct: 3,
        agentCommissionUsd: 36000,
        splitPct: 60,
        signedAt: new Date('2025-06-01'),
        closedAt: new Date('2025-09-01'),
      },
      {
        agentId: maya.id,
        type: 'RENT',                // change if your enum differs
        address: '1600 Fulton St, Brooklyn, NY',
        price: 3500,
        agentCommissionPct: 15,
        agentCommissionUsd: 6300,
        splitPct: 60,
        signedAt: new Date('2025-05-10'),
        closedAt: new Date('2025-05-25'),
>>>>>>> 103d01c (chore(db): add bootstrap.sql and BOM-safe run_sql.js)
      },
    ],
    skipDuplicates: true,
  });
<<<<<<< HEAD

  await prisma.commission.createMany({
    data: [
      {
        address: "300 E 90th St, New York, NY",
        agentEmail: maya.email,
        contractSigned: new Date("2025-06-01"),
        gross: 36000,
        companyFee: Math.round(36000 * 0.2),
        agentFee: Math.round(36000 * 0.8),
        paid: false,
      },
      {
        address: "1600 Fulton St, Brooklyn, NY",
        agentEmail: maya.email,
        contractSigned: new Date("2025-05-10"),
        gross: 5250,
        companyFee: Math.round(5250 * 0.4),
        agentFee: Math.round(5250 * 0.6),
        paid: false,
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
=======
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
>>>>>>> 103d01c (chore(db): add bootstrap.sql and BOM-safe run_sql.js)
