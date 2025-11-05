// scripts/restore_views_retry.js
// Robust restore: split statements and retry CREATEs that fail with dependency errors.
const fs = require("fs");
const { Pool } = require("pg");

(async () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error("ERROR: Set DATABASE_URL environment variable (e.g. postgresql://...)");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: cs });

  try {
    const sql = fs.readFileSync("views_backup.sql", "utf8");
    if (!sql || sql.trim().length === 0) {
      throw new Error("views_backup.sql missing or empty.");
    }

    // Split into statements on semicolon followed by newline (keeps readability)
    const raw = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    const statements = raw.map(s => s.endsWith(";") ? s : s + ";");

    // We'll try statements in order, but if a CREATE fails due to missing relation,
    // defer it and retry later. This handles dependencies between views.
    let pending = statements.slice();
    const maxPasses = 10;
    let pass = 0;

    while (pending.length > 0 && pass < maxPasses) {
      pass++;
      console.log(`Pass ${pass}: ${pending.length} statements pending`);
      const next = [];
      let progress = false;

      for (const stmt of pending) {
        try {
          await pool.query(stmt);
          progress = true;
          console.log("OK:", stmt.split("\n")[0].slice(0, 120));
        } catch (err) {
          const msg = (err && err.message) ? err.message.toLowerCase() : String(err).toLowerCase();
          // If error looks like a dependency/undefined relation error, defer it:
          if (msg.includes("does not exist") || msg.includes("undefined_table") || msg.includes("dependent")) {
            console.warn("Deferred due to dependency:", msg.split("\n")[0]);
            next.push(stmt);
          } else {
            // otherwise treat as a fatal error
            console.error("Fatal error executing statement:\n", stmt, "\nError:", err);
            throw err;
          }
        }
      }

      if (!progress && next.length > 0) {
        throw new Error(`Stuck restoring views after pass ${pass}. ${next.length} statements deferred.`);
      }

      pending = next;
    }

    if (pending.length > 0) {
      throw new Error(`Failed to apply ${pending.length} statements after ${maxPasses} passes.`);
    }

    console.log("All statements applied successfully.");
  } catch (err) {
    console.error("Error restoring views:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
