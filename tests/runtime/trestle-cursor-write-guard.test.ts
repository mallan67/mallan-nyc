/// <reference types="jest" />
/**
 * TRESTLE CURSOR WRITE GUARD — one invariant, enforced repo-wide.
 *
 * `getLastSyncTimestamp()` (lib/idx/sync.ts) is
 *     MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
 * and its value becomes the OData filter `ModificationTimestamp gt SINCE`.
 *
 * So ANY writer that stamps a LOCAL clock into `modification_timestamp` on a row
 * the Trestle sync has touched pushes the cursor into the future, and the next
 * incremental run silently skips genuine upstream changes. PR-S.6 and PR-S.7
 * each closed one instance (capped batches, then CRM-only rows), yet the audit
 * on 2026-08-09 still found three live doors:
 *
 *   - `POST /api/crm/listings/[id]/photos`      (legacy media writer — RETIRED)
 *   - `POST /api/idx/ensure-listing`            (claimed last_synced_from_trestle — FIXED)
 *   - `GET  /api/cron/feed-reconcile` ghosts    (bumped MT on feed rows — FIXED)
 *
 * Fixing three instances without pinning the RULE just invites a fourth. This
 * test enumerates every local-clock `modification_timestamp` write in `app/` and
 * requires each to be justified, so a new one is a visible failure rather than a
 * silent regression in the sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..');

/** A local-clock stamp: `modification_timestamp: new Date()` or `: now`. */
const LOCAL_CLOCK_MT = /modification_timestamp:\s*(new Date\(\)|now)\b/;

/**
 * Writers allowed to stamp a LOCAL clock, each with the reason it cannot poison
 * the cursor. Adding a path here is a deliberate act that must carry a reason.
 */
const JUSTIFIED: Record<string, string> = {
  // Creates a CRM-only listing. `last_synced_from_trestle` is never set, so
  // PR-S.7's filter excludes the row from the cursor entirely.
  'app/api/crm/convert/route.ts': 'CRM-only row; last_synced_from_trestle stays NULL',

  // Both handlers are gated to Mallan-authored LOCAL rows by
  // `mayManageMallanLocalListing` (lib/auth/listing-capabilities.ts), which
  // refuses every source-owned row.
  'app/api/crm/listings/[id]/route.ts': 'local-listing capability gate refuses synced rows',
  'app/api/crm/listings/[id]/status/route.ts': 'local-listing capability gate refuses synced rows',

  // Stubs a Trestle listing locally. Leaves `last_synced_from_trestle` NULL, so
  // the row is outside the cursor query (fixed 2026-08-09).
  'app/api/idx/ensure-listing/route.ts': 'stub row; last_synced_from_trestle stays NULL',

  // Creates an SL-/RL- CRM listing. Never sets last_synced_from_trestle.
  'app/api/crm/listings/route.ts': 'CRM-created SL-/RL- row; last_synced_from_trestle stays NULL',

  // The mutating task is scoped by `buildMallanOwnedListingWhere()`, so it only
  // ever writes CRM-authored rows, which are outside the cursor query
  // (ownership scoping added 2026-08-09 — it previously scoped by agent_id
  // alone and could expire a third-party feed row).
  'app/api/cron/listing-expiration/route.ts': 'mutating task scoped to Mallan-owned rows only',
};

function sourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', 'app'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes('__tests__'));
}

/** Strip comments so the doc-comments that DESCRIBE the hazard don't match. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no unjustified local-clock modification_timestamp writes', () => {
  const files = sourceFiles();

  it('finds app source files at all (guards a broken scan)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('app/api/idx/ensure-listing/route.ts');
  });

  it('every local-clock MT writer is justified', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const code = codeOnly(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      if (!LOCAL_CLOCK_MT.test(code)) continue;
      if (!(rel in JUSTIFIED)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the retired legacy photos writer no longer stamps MT at all', () => {
    const code = codeOnly(
      fs.readFileSync(path.join(ROOT, 'app/api/crm/listings/[id]/photos/route.ts'), 'utf8'),
    );
    expect(LOCAL_CLOCK_MT.test(code)).toBe(false);
    expect(code).not.toMatch(/prisma\.listing\.update/);
  });

  it('the ghost transition no longer bumps MT on feed-sourced rows', () => {
    const code = codeOnly(
      fs.readFileSync(path.join(ROOT, 'app/api/cron/feed-reconcile/route.ts'), 'utf8'),
    );
    // The ghost update still records the transition on the stable clocks.
    expect(code).toMatch(/status_changed_at: now/);
    // UPDATED 2026-08-19 (status-truth fix): `terminal_since` is no longer the
    // hardcoded wall-clock. It comes from `computeTerminalSincePatch`, which
    // prefers the PROVIDER's CloseDate/OffMarketDate and falls back to `now`.
    // What this guard actually protects — that the ghost transition records
    // itself on the STABLE clocks and never bumps modification_timestamp with a
    // local clock — is unchanged and still asserted.
    expect(code).toMatch(/\.\.\.terminalSincePatch/);
    expect(LOCAL_CLOCK_MT.test(code)).toBe(false);
  });

  it('ensure-listing does not claim to be a Trestle-sync writer', () => {
    const code = codeOnly(
      fs.readFileSync(path.join(ROOT, 'app/api/idx/ensure-listing/route.ts'), 'utf8'),
    );
    expect(code).not.toMatch(/last_synced_from_trestle:\s*new Date\(\)/);
    expect(code).not.toMatch(/sync_status:\s*"synced"/);
  });

  it('the expiration cron scopes its MUTATING task to Mallan-owned rows', () => {
    // `agent_id: { not: null }` alone is NOT ownership — syncAgentHistory stamps
    // agent_id on third-party feed rows via BuyerAgentMlsId, so the unscoped
    // query could expire another brokerage's listing.
    const code = codeOnly(
      fs.readFileSync(path.join(ROOT, 'app/api/cron/listing-expiration/route.ts'), 'utf8'),
    );
    expect(code).toMatch(/buildMallanOwnedListingWhere\(\)/);
  });

  it('the JUSTIFIED list carries a reason for every entry', () => {
    for (const [file, reason] of Object.entries(JUSTIFIED)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });
});
