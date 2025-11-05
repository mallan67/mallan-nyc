const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const rows = await p.$queryRawUnsafe('SELECT * FROM agent_deals_v LIMIT 5');
    console.log("agent_deals_v rows:");
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error("ERROR (agent_deals_v):", e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
