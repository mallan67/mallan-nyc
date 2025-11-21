// tools/run_sql.js
const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node tools/run_sql.js <path-to-sql>');
    process.exit(1);
  }
  // strip BOM if present
  const sql = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }});
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Applied:', file);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ SQL error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
