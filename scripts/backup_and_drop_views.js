/*
 scripts/backup_and_drop_views.js
 - Reads the definitions of agent_deals_v and agent_deals_summary_v into views_backup.sql
 - Drops those views with CASCADE
 Usage: set DATABASE_URL env var, then run: node scripts/backup_and_drop_views.js
*/
const fs = require('fs');
const { Pool } = require('pg');

(async () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error('ERROR: Set DATABASE_URL (e.g. postgresql://dev_user:dev_password@127.0.0.1:5432/mallan?schema=public)');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: cs });
  try {
    const views = ['agent_deals_v', 'agent_deals_summary_v'];

    // fetch schema-qualified view definitions from pg_views
    const q = `
      SELECT schemaname, viewname, definition
      FROM pg_views
      WHERE viewname = ANY($1)
      ORDER BY viewname;
    `;
    const res = await pool.query(q, [views]);

    if (res.rows.length === 0) {
      console.log('No matching views found (nothing to back up).');
    } else {
      let out = '-- views_backup.sql (auto-generated)\n\n';
      // include explicit drops first
      for (const r of res.rows) {
        out += `DROP VIEW IF EXISTS ${r.schemaname}.${r.viewname} CASCADE;\n`;
      }
      out += '\n-- recreate view statements\n';
      for (const r of res.rows) {
        // r.definition is the SELECT used by the view
        out += `\nCREATE OR REPLACE VIEW ${r.schemaname}.${r.viewname} AS\n${r.definition};\n`;
      }
      fs.writeFileSync('views_backup.sql', out, 'utf8');
      console.log(`Wrote views_backup.sql with ${res.rows.length} view(s).`);
    }

    // Drop the views (unqualified names, assume public schema - that's how existing views are)
    for (const v of views) {
      console.log('Dropping view (if exists):', v);
      await pool.query(`DROP VIEW IF EXISTS ${v} CASCADE`);
    }
    console.log('Dropped views (CASCADE). You can now run prisma db push.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
