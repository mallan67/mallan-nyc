/*
 scripts/restore_views.js
 - Reads views_backup.sql and applies it to the DB.
 Usage: set DATABASE_URL env var, then run: node scripts/restore_views.js
*/
const fs = require('fs');
const { Pool } = require('pg');

(async () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error('ERROR: Set DATABASE_URL environment variable.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: cs });
  try {
    const sql = fs.readFileSync('views_backup.sql', 'utf8');
    if (!sql || sql.trim().length === 0) {
      console.error('views_backup.sql is empty or missing.');
      process.exit(1);
    }
    // Execute as a single multi-statement batch
    await pool.query(sql);
    console.log('Restored views from views_backup.sql');
  } catch (err) {
    console.error('Error restoring views:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
