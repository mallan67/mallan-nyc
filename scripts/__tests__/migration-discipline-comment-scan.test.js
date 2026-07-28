/**
 * Regression test — migration-discipline destructive scanner must ignore SQL
 * COMMENTS.
 *
 * THE BUG THIS PINS (2026-07-28, PR #581):
 *   `scanForDestructive` regex-scanned the raw migration file, comments
 *   included. NEON.md §4 + the repo's manual-CONCURRENTLY pattern REQUIRE every
 *   large-table index migration to document its rollback, and that rollback is
 *   by definition a destructive statement:
 *
 *     --   DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;
 *
 *   That comment tripped DROP_INDEX, so the validator reported
 *   `migration discipline FAIL: 1` and release-truth aggregated to PARTIAL —
 *   for a migration whose only executable statement is a plain additive
 *   CREATE INDEX. The effect was perverse: documenting the rollback (good
 *   practice, required by NEON.md) is what failed the guardrail.
 *
 *   Postgres never executes a comment, so scanning comments is unsound in BOTH
 *   directions — it cannot catch a real destructive op that isn't also present
 *   in executable SQL, and it fires on prose. Strip comments, then scan. The
 *   `@allow-destructive` opt-in is deliberately still read from the RAW text,
 *   because that annotation only ever lives in a comment.
 */

const fs = require('fs');
const path = require('path');
const {
  stripSqlComments,
  scanForDestructive,
  DESTRUCTIVE_PATTERNS,
} = require('../validate-migration-discipline.js');

const ids = (sql) => scanForDestructive(sql).map((d) => d.id).sort();

describe('migration-discipline destructive scan ignores SQL comments', () => {
  it('does not flag a rollback note that lives in a line comment', () => {
    const sql = [
      '-- ROLLBACK (production, manual, non-transactional):',
      '--   DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;',
      'CREATE INDEX "listing_media_r2_backlog_id_idx"',
      'ON "listing_media" ("id")',
      'WHERE "r2_key" IS NULL;',
    ].join('\n');
    expect(ids(sql)).toEqual([]);
  });

  it('still flags an executable DROP INDEX', () => {
    expect(ids('DROP INDEX listing_media_r2_backlog_id_idx;')).toEqual(['DROP_INDEX']);
  });

  it('still flags executable DROP TABLE / DROP COLUMN / TRUNCATE', () => {
    expect(ids('DROP TABLE "leads";')).toEqual(['DROP_TABLE']);
    expect(ids('ALTER TABLE "leads" DROP COLUMN "x";')).toEqual(['DROP_COLUMN']);
    expect(ids('TRUNCATE "leads";')).toEqual(['TRUNCATE']);
  });

  it('flags a destructive statement that shares a line with a trailing comment', () => {
    expect(ids('DROP TABLE "leads"; -- harmless looking note')).toEqual(['DROP_TABLE']);
  });

  it('flags a destructive statement following a block comment', () => {
    const sql = '/* explanatory\n   block */\nALTER TABLE "l" ALTER COLUMN "c" TYPE text;';
    expect(ids(sql)).toEqual(['TYPE_CHANGE']);
  });

  it('still honors @allow-destructive, which only ever lives in a comment', () => {
    const sql = '-- @allow-destructive rollback documented in PR\nDROP TABLE "old_thing";';
    expect(ids(sql)).toEqual([]);
  });
});

describe('stripSqlComments', () => {
  it('removes line and block comments but preserves statements', () => {
    const out = stripSqlComments('SELECT 1; -- note\n/* block */ SELECT 2;');
    expect(out).not.toMatch(/note/);
    expect(out).not.toMatch(/block/);
    expect(out).toMatch(/SELECT 1;/);
    expect(out).toMatch(/SELECT 2;/);
  });

  it('does not treat a double-dash inside a string literal as a comment', () => {
    // Postgres treats -- inside '...' as DATA. If we stripped from there to
    // end-of-line we would HIDE the real destructive statement that follows.
    const sql = `INSERT INTO t VALUES ('a -- not a comment'); DROP TABLE "t";`;
    expect(ids(sql)).toEqual(['DROP_TABLE']);
  });

  it('leaves dollar-quoted bodies intact so DO blocks stay scannable', () => {
    const sql = `DO $$ BEGIN EXECUTE 'noop'; END $$;\nDROP TABLE "t";`;
    expect(ids(sql)).toEqual(['DROP_TABLE']);
  });
});

describe('no regression across the committed migration set', () => {
  const migDir = path.join(__dirname, '..', '..', 'prisma', 'migrations');

  // The pre-fix behaviour: scan raw text, comments included.
  const rawScan = (sql) => {
    if (/@allow-destructive\b/i.test(sql)) return [];
    return DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(sql)).map((p) => p.id).sort();
  };

  const migrations = fs
    .readdirSync(migDir)
    .filter((d) => fs.existsSync(path.join(migDir, d, 'migration.sql')));

  it('finds migrations to check', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations)(
    'comment-stripping never introduces a NEW destructive hit: %s',
    (dir) => {
      const sql = fs.readFileSync(path.join(migDir, dir, 'migration.sql'), 'utf8');
      const before = new Set(rawScan(sql));
      const after = ids(sql);
      // The change must be strictly monotone toward FEWER hits: every hit that
      // survives must also have been present before. A migration that passed
      // before can therefore never newly fail.
      for (const hit of after) expect(before.has(hit)).toBe(true);
    },
  );
});
