/**
 * FINAL COMPLETION LANE — two already-proven defects, pinned so they cannot silently return.
 *
 * DEFECT 1 — syncAgentHistory Media truncation.
 * `syncAgentHistory` issued ONE un-paginated Media request capped at `batch.length * 30` across the
 * WHOLE batch and processed only `data.value`. Because `$orderby` sorts globally, the cap dropped
 * the highest-ordered rows ACROSS listings. Observed live 2026-08-15: on a batch of the 15 heaviest
 * listings, 10 received ZERO rows and one got 31 of 94 — and those truncated arrays were WRITTEN.
 * MediaKey cannot repair that: a short array differs in LENGTH and is material regardless.
 *
 * `syncListings` already had the correct contract via the shared `paginateMedia`. The two paths
 * drifted, and only one was fixed. These tests assert BOTH now share it, so a future change cannot
 * leave syncListings correct while syncAgentHistory quietly reverts to single-page behaviour.
 *
 * DEFECT 2 — recover-residual-listing-media import guard.
 * Its guard was `process.env.NODE_ENV !== "test"`, which protects only TEST processes. ANY other
 * import executed `main()` and started a full production recovery campaign. That fired twice on
 * 2026-08-15, each time issuing a ~96-listing Cotality sweep nobody requested. Dry-run default
 * meant no data was written — but a module that launches a production-write-capable campaign by
 * being imported is a trap, not a safeguard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SYNC = read('lib/idx/sync.ts');
const RECOVERY = read('scripts/recover-residual-listing-media.ts');

/** Slice a named exported function's body so assertions cannot leak across sync paths. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const after = src.slice(start + 1);
  const nextExport = after.indexOf('\nexport async function ');
  return nextExport === -1 ? after : after.slice(0, nextExport);
}

const SYNC_LISTINGS = fnBody(SYNC, 'syncListings');
const SYNC_AGENT = fnBody(SYNC, 'syncAgentHistory');

describe('DEFECT 1 — syncAgentHistory shares the completeness contract', () => {
  it('uses the SHARED paginateMedia follower, not a second pagination loop', () => {
    expect(SYNC_AGENT).toMatch(/paginateMedia\(/);
    // The old shape: a bare fetch on the Media endpoint whose json was read straight into a loop.
    expect(SYNC_AGENT).not.toMatch(/const data = await res\.json\(\);[\s\S]{0,200}?for \(const m of data\.value/);
  });

  it('follows @odata.nextLink', () => {
    expect(SYNC_AGENT).toMatch(/@odata\.nextLink/);
  });

  it('FAILS CLOSED on an incomplete fetch — skips the batch with no reconciliation or write', () => {
    expect(SYNC_AGENT).toMatch(/if \(!complete\)/);
    expect(SYNC_AGENT).toMatch(/agentMediaBatchesIncompleteSkipped\+\+/);
    // `continue` must follow the incomplete check, before any write path.
    const at = SYNC_AGENT.indexOf('if (!complete)');
    expect(SYNC_AGENT.slice(at, at + 300)).toMatch(/continue;/);
  });

  it('PRE-SEEDS every requested key so a complete-empty result is an authoritative []', () => {
    expect(SYNC_AGENT).toMatch(/for \(const key of batch\) mediaByKey\.set\(String\(key\), \[\]\);/);
  });

  it('keeps $top as a page-size HINT only (it is no longer the whole budget)', () => {
    expect(SYNC_AGENT).toMatch(/\$top/);
    expect(SYNC_AGENT).toMatch(/PAGE-SIZE HINT/i);
  });

  it('preserves MediaKey mapping and the omit-when-absent guard', () => {
    expect(SYNC_AGENT).toMatch(/PreferredPhotoYN,MediaStatus,MediaKey/);
    expect(SYNC_AGENT).toContain('const mediaKey = typeof m.MediaKey === "string" ? m.MediaKey.trim() : "";');
    expect(SYNC_AGENT).toContain('...(mediaKey ? { mediaKey } : {})');
  });

  it('preserves the write-suppression comparator and the archived-row guard', () => {
    expect(SYNC_AGENT).toMatch(/mediaArraysMateriallyEqual\(/);
    expect(SYNC_AGENT).toMatch(/archivedSafeMediaWhere\(/);
  });

  it('PARITY: both sync paths share the same contract (neither may drift alone)', () => {
    for (const [label, body] of [['syncListings', SYNC_LISTINGS], ['syncAgentHistory', SYNC_AGENT]] as const) {
      expect(body).toMatch(/paginateMedia\(/);
      expect(body).toMatch(/if \(!complete\)/);
      expect(body).toMatch(/@odata\.nextLink/);
      expect(label).toBeTruthy();
    }
  });

  it('the ONLY Media pagination implementation in sync.ts is the shared follower', () => {
    // Two `paginateMedia(` call sites (one per path) and no hand-rolled nextLink loop.
    expect((SYNC.match(/paginateMedia\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(SYNC).not.toMatch(/while \([\s\S]{0,40}nextLink/);
  });
});

describe('DEFECT 2 — recovery script runs ONLY when invoked directly', () => {
  it('uses the argv[1] direct-invocation guard, not NODE_ENV', () => {
    expect(RECOVERY).toMatch(/if \(\/recover-residual-listing-media\\\.\[cm\]\?\[jt\]s\$\/\.test\(process\.argv\[1\] \?\? ""\)\)/);
    expect(RECOVERY).not.toMatch(/if \(process\.env\.NODE_ENV !== "test"\) \{\s*\n\s*void main\(/);
  });

  it('MATCHES the proven Property-lane guard shape', () => {
    const property = read('scripts/recover-stale-property-listings.ts');
    expect(property).toMatch(/process\.argv\[1\] \?\? ""/);
    expect(RECOVERY).toMatch(/process\.argv\[1\] \?\? ""/);
  });

  it('the guard does NOT fire for a non-test importer (the exact accident that occurred)', () => {
    // Reproduce the predicate against realistic argv[1] values rather than trusting the regex shape.
    const guard = (argv1: string) => /recover-residual-listing-media\.[cm]?[jt]s$/.test(argv1 ?? '');
    // Importers — must NOT run:
    expect(guard('/tmp/gate.ts')).toBe(false);
    expect(guard('C:/Users/x/scripts/__probe-unkeyed-residual.ts')).toBe(false);
    expect(guard('/app/node_modules/.bin/jest')).toBe(false);
    expect(guard('')).toBe(false);
    // Direct invocation — MUST run:
    expect(guard('scripts/recover-residual-listing-media.ts')).toBe(true);
    expect(guard('C:/Users/x/scripts/recover-residual-listing-media.ts')).toBe(true);
    expect(guard('/app/scripts/recover-residual-listing-media.js')).toBe(true);
  });

  it('NODE_ENV alone can no longer authorise execution', () => {
    // The old guard let ANY non-test process run a production-write-capable campaign.
    const oldGuard = (nodeEnv: string | undefined) => nodeEnv !== 'test';
    expect(oldGuard('production')).toBe(true); // <- the defect
    expect(oldGuard(undefined)).toBe(true); // <- the defect
    // The new guard ignores NODE_ENV entirely and keys on direct invocation.
    expect(RECOVERY).not.toMatch(/NODE_ENV !== "test"[\s\S]{0,60}void main\(/);
  });

  it('recovery safety rails are untouched by this change', () => {
    expect(RECOVERY).toMatch(/RECOVERY_RUN_CAP = 100/);
    expect(RECOVERY).toMatch(/RECOVERY_TOTAL_CAP = 200/);
    expect(RECOVERY).toMatch(/assertAllConfiguredTargetsCanonical/);
    expect(RECOVERY).toMatch(/RECOVERY_CONFIRM_TOKEN/);
  });
});
