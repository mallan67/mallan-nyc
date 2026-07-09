/// <reference types="jest" />
/**
 * storage-health-monitor MUST stay strictly read-only.
 *
 * PR #1 of the Neon + R2 Infrastructure Closure Audit installed a storage
 * *visibility* tool. Its entire safety contract is: no DB writes, no schema
 * changes, no DELETE, no VACUUM, no raw_data trimming, no R2 mutations, no
 * cron/sync/retention side effects. This test locks that contract at the
 * source level so a future edit cannot quietly turn the monitor into a
 * mutation path. (2026-07-08)
 */
import { readFileSync } from 'fs';
import * as path from 'path';

const scriptPath = path.resolve(__dirname, '../../scripts/storage-health-monitor.ts');
const src = readFileSync(scriptPath, 'utf8');

// Strip comments so prose like "no VACUUM / no DELETE" in the safety banner
// doesn't trip the SQL-keyword guards — we only inspect executable code.
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
  .replace(/\/\/.*$/gm, ''); // line comments

describe('storage-health-monitor — read-only safety contract', () => {
  it('uses only read Prisma raw methods ($queryRaw / $queryRawUnsafe)', () => {
    expect(src).toMatch(/\$queryRaw/);
    // The write-side raw executors must never appear.
    expect(codeOnly).not.toMatch(/\$executeRaw\b/);
    expect(codeOnly).not.toMatch(/\$executeRawUnsafe\b/);
  });

  it('never calls a Prisma write/mutation method', () => {
    for (const method of [
      '.create(',
      '.createMany(',
      '.update(',
      '.updateMany(',
      '.upsert(',
      '.delete(',
      '.deleteMany(',
    ]) {
      expect(codeOnly.includes(method)).toBe(false);
    }
  });

  it('contains no DDL/DML SQL verbs in executable code', () => {
    expect(codeOnly).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|INDEX|COLUMN)|TRUNCATE|ALTER\s+TABLE|VACUUM|REINDEX|CLUSTER|CREATE\s+TABLE)\b/i,
    );
  });

  it('does NOT mutate R2 (no upload/delete; list is read-only)', () => {
    expect(codeOnly).not.toMatch(/uploadToR2/);
    expect(codeOnly).not.toMatch(/deleteFromR2/);
    expect(codeOnly).not.toMatch(/PutObjectCommand/);
    expect(codeOnly).not.toMatch(/DeleteObjectsCommand/);
    // Allowed: report config presence + read-only bucket LIST for orphan check.
    expect(src).toMatch(/hasR2Config/);
    expect(src).toMatch(/listR2ObjectKeys/);
  });

  it('includes DB-level R2 duplicate metrics', () => {
    // duplicate r2_key groups, active-vs-active sharing, same-original-diff-key,
    // and same listing/order/type slot duplicates must all be reported.
    expect(src).toMatch(/dup_groups/);
    expect(src).toMatch(/active_dup_groups/);
    expect(src).toMatch(/duplicate_original_url_groups/);
    expect(src).toMatch(/duplicate_listing_slot_groups/);
  });

  it('includes a true bucket orphan check that is honest when not run', () => {
    expect(src).toMatch(/r2_orphan_check_status/);
    expect(src).toMatch(/--r2-orphans/);
    // Must never assert "no orphans" without proving it: the not-run/unavailable
    // states are explicit.
    expect(src).toMatch(/not_run|unavailable/);
  });

  it('reports free-tier status separately for Neon and R2 without guessing the plan', () => {
    expect(src).toMatch(/free_tier_status/);
    expect(src).toMatch(/needs_account_confirmation/);
    // R2 free-tier cannot be claimed from row counts alone.
    expect(src).toMatch(/needs_account_metrics|cannot be proven/);
  });

  it('sources terminal statuses from the canonical mapper (no drift)', () => {
    expect(src).toMatch(/import\s*\{[^}]*TERMINAL_STATUSES[^}]*\}\s*from\s*'@\/lib\/idx\/trestle-mapper'/);
  });

  it('is wired as an npm script', () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    );
    expect(pkg.scripts['ops:storage-health']).toContain('scripts/storage-health-monitor.ts');
  });
});
