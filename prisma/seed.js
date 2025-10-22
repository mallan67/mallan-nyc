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

  await prisma.deal.createMany({
    data: [
      {
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
      },
    ],
    skipDuplicates: true,
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
