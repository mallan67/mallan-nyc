const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const agents = await p.agent.findMany();
    console.log("AGENTS:");
    console.log(JSON.stringify(agents, null, 2));
  } catch (e) {
    console.error("ERROR (agents):", e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
