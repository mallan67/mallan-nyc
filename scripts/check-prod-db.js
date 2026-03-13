// Temporary script to check production DB columns
const { PrismaClient } = require('@prisma/client');

const url = process.env.PROD_DB_URL;
if (!url) { console.error('Set PROD_DB_URL'); process.exit(1); }

const p = new PrismaClient({ datasourceUrl: url });

async function run() {
  // Check listing columns
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name='listings' AND column_name IN ('rls_eligible','commercial_sub_type','commercial_ownership') ORDER BY column_name"
  );
  console.log('Listing columns:', cols.map(c => c.column_name));

  // Check leads consent column
  const leadCols = await p.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='consent_captured_at'"
  );
  console.log('Lead consent_captured_at:', leadCols.length > 0 ? 'EXISTS' : 'MISSING');

  // Check financial_ledger table
  const tables = await p.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_name='financial_ledger'"
  );
  console.log('financial_ledger table:', tables.length > 0 ? 'EXISTS' : 'MISSING');

  // Check synced listing count
  const count = await p.listing.count({ where: { sync_status: 'synced' } });
  console.log('Synced listings:', count);

  // Check migration history
  const migrations = await p.$queryRawUnsafe(
    "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5"
  );
  console.log('Recent migrations:', migrations);

  await p.$disconnect();
}

run().catch(async e => { console.error('ERROR:', e.message); await p.$disconnect(); });
