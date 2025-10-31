const fs = require("fs");
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const p of [".env.local", ".env"]) {
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, "utf8");
      const m = txt.match(/^DATABASE_URL=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("DATABASE_URL not set. Set env var or add to .env.local / .env");
}
const { Client } = require("pg");
(async () => {
  const sqlRaw = fs.readFileSync("sql/apply_all.sql","utf8");
  const sql = sqlRaw.replace(/^\uFEFF/, ""); // strip BOM if present
  const url = loadDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("SQL applied successfully.");
    const { rows } = await client.query(`
      SELECT representation_label, property_address, price_usd,
             commission_rate_percent, split_percent,
             agent_fee_usd, company_fee_usd, gross_commission_usd,
             contract_signed, contract_closed
      FROM agent_deals_v
      ORDER BY TO_DATE(contract_closed,'MM/DD/YYYY') DESC NULLS LAST,
               TO_DATE(contract_signed,'MM/DD/YYYY') DESC
      LIMIT 5;
    `);
    console.table(rows);
  } catch (e) {
    console.error("SQL error:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
