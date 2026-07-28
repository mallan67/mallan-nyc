#!/usr/bin/env node
/**
 * Regression test — migration-discipline destructive scanner must ignore SQL
 * COMMENTS.
 *
 * THE BUG THIS PINS (2026-07-28, PR #581):
 *   `scanForDestructive` regex-scanned the raw migration file, including
 *   comment lines. NEON.md §4 + the repo's manual-CONCURRENTLY pattern REQUIRE
 *   every large-table index migration to document its rollback, and that
 *   rollback is by definition a destructive statement:
 *
 *     -- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;
 *
 *   That comment tripped DROP_INDEX, so the validator reported
 *   `migration discipline FAIL: 1` and release-truth aggregated to PARTIAL —
 *   for a migration whose only executable statement is a plain additive
 *   CREATE INDEX. The effect was perverse: documenting the rollback (good
 *   practice, required by NEON.md) is what failed the guardrail.
 *
 *   Comments are never executed by Postgres, so scanning them is unsound in
 *   BOTH directions — it cannot catch a real destructive op that isn't also
 *   present in executable SQL, and it fires on prose. Strip comments, then
 *   scan. The `@allow-destructive` opt-in is deliberately still read from the
 *   RAW text, because that annotation only ever lives in a comment.
 *
 * Run: node scripts/__tests__/migration-discipline-comment-scan.test.js
 */

const assert = require('assert');
const {
  stripSqlComments,
  scanForDestructive,
} = require('../validate-migration-discipline.js');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failures++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${e.message}`);
  }
}

const ids = (sql) => scanForDestructive(sql).map((d) => d.id).sort();

console.log('\nmigration-discipline — comment-aware destructive scan\n');

// ─── The exact PR #581 shape ─────────────────────────────────────────────
test('rollback note in a line comment does not trip DROP_INDEX', () => {
  const sql = [
    '-- ROLLBACK (production, manual, non-transactional):',
    '--   DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;',
    'CREATE INDEX "listing_media_r2_backlog_id_idx"',
    'ON "listing_media" ("id")',
    'WHERE "r2_key" IS NULL;',
  ].join('\n');
  assert.deepStrictEqual(ids(sql), [], 'comment-only DROP INDEX must not be flagged');
});

// ─── Still catches the real thing ────────────────────────────────────────
test('executable DROP INDEX is still flagged', () => {
  assert.deepStrictEqual(ids('DROP INDEX listing_media_r2_backlog_id_idx;'), ['DROP_INDEX']);
});

test('executable DROP TABLE / DROP COLUMN / TRUNCATE still flagged', () => {
  assert.deepStrictEqual(ids('DROP TABLE "leads";'), ['DROP_TABLE']);
  assert.deepStrictEqual(ids('ALTER TABLE "leads" DROP COLUMN "x";'), ['DROP_COLUMN']);
  assert.deepStrictEqual(ids('TRUNCATE "leads";'), ['TRUNCATE']);
});

test('destructive statement is caught even when a comment precedes it on the same line', () => {
  assert.deepStrictEqual(ids('DROP TABLE "leads"; -- harmless looking note'), ['DROP_TABLE']);
});

test('destructive statement after a block comment is still caught', () => {
  const sql = '/* explanatory\n   block */\nALTER TABLE "l" ALTER COLUMN "c" TYPE text;';
  assert.deepStrictEqual(ids(sql), ['TYPE_CHANGE']);
});

// ─── @allow-destructive opt-in must survive comment stripping ────────────
test('@allow-destructive (which only ever lives in a comment) still suppresses', () => {
  const sql = '-- @allow-destructive rollback documented in PR\nDROP TABLE "old_thing";';
  assert.deepStrictEqual(ids(sql), [], '@allow-destructive must be read from RAW text');
});

// ─── stripSqlComments unit behaviour ─────────────────────────────────────
test('stripSqlComments removes line and block comments, preserves statements', () => {
  const out = stripSqlComments('SELECT 1; -- note\n/* block */ SELECT 2;');
  assert.ok(!/note/.test(out), 'line comment body removed');
  assert.ok(!/block/.test(out), 'block comment body removed');
  assert.ok(/SELECT 1;/.test(out) && /SELECT 2;/.test(out), 'statements preserved');
});

test('a double-dash inside a string literal does not eat the rest of the line', () => {
  // Postgres treats -- inside '...' as data, not a comment. If we stripped it
  // we could hide a real destructive statement that follows on the same line.
  const sql = `INSERT INTO t VALUES ('a -- not a comment'); DROP TABLE "t";`;
  assert.deepStrictEqual(ids(sql), ['DROP_TABLE']);
});

console.log('');
if (failures > 0) {
  console.log(`\x1b[31m${failures} failing\x1b[0m\n`);
  process.exit(1);
}
console.log('\x1b[32mall passing\x1b[0m\n');
