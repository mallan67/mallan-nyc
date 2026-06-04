import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Live-parity guard for the FORBIDDEN_FIELDS list in
 * scripts/audit-server-trestle-coverage.ts (the server-code phantom guard that
 * `npm run trestle:audit-server` enforces).
 *
 * Invariant: every forbidden field must be EITHER absent from the live Cotality
 * $metadata (a genuine phantom) OR a documented live-but-intentional exception.
 * As of 2026-06-04 the only live-but-forbidden field is ResourceRecordID — it
 * exists but is NOT unique across MLOs, so ResourceRecordKey is used for Media
 * joins. If the live feed ever turns one of the other phantoms real, this test
 * fails so the guard list is reconciled with proof (not silently stale).
 *
 * The list is read as text (not imported): the audit script self-executes an
 * async IIFE + process.exit on load, so importing it would run the whole audit.
 * Parsing the source keeps the audit script the single source of truth without
 * executing it.
 */
describe('FORBIDDEN_FIELDS live-parity (server phantom guard)', () => {
  const auditSrc = readFileSync(
    resolve(__dirname, '../../../scripts/audit-server-trestle-coverage.ts'),
    'utf-8'
  );

  // Extract the FORBIDDEN_FIELDS object body and pull its keys.
  const block = auditSrc.slice(
    auditSrc.indexOf('const FORBIDDEN_FIELDS'),
    auditSrc.indexOf('\n};', auditSrc.indexOf('const FORBIDDEN_FIELDS'))
  );
  const forbiddenKeys = [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*'/gm)].map(
    (m) => m[1]
  );

  // Fields that exist on live but are intentionally forbidden (documented).
  const INTENTIONAL_DESPITE_LIVE = new Set<string>(['ResourceRecordID']);

  const xml = readFileSync(
    resolve(__dirname, '../../../artifacts/metadata.xml'),
    'utf-8'
  );
  const liveNames = new Set(
    [...xml.matchAll(/Name="([A-Za-z0-9_]+)"/g)].map((m) => m[1])
  );

  it('parsed a non-trivial FORBIDDEN_FIELDS list and a populated live snapshot', () => {
    expect(forbiddenKeys.length).toBeGreaterThanOrEqual(15);
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it('every forbidden field is phantom on live OR a documented live exception', () => {
    const liveButUndocumented = forbiddenKeys.filter(
      (f) => liveNames.has(f) && !INTENTIONAL_DESPITE_LIVE.has(f)
    );
    expect(liveButUndocumented).toEqual([]);
  });

  it('the 5 newly guarded phantoms are present', () => {
    for (const f of [
      'MoveInCostsAmount',
      'VideoURL',
      'FloorPlanURL',
      'MatterportURL',
      'InteractiveFloorPlanURL',
    ]) {
      expect(forbiddenKeys).toContain(f);
      expect(liveNames.has(f)).toBe(false); // and genuinely phantom on live
    }
  });

  it('ResourceRecordID is the lone live-but-forbidden field and its hint documents why', () => {
    expect(liveNames.has('ResourceRecordID')).toBe(true);
    expect(forbiddenKeys).toContain('ResourceRecordID');
    const hint = /ResourceRecordID:\s*'([^']*)'/.exec(auditSrc)?.[1] ?? '';
    expect(hint).toMatch(/not unique across MLOs/i);
    expect(hint).toMatch(/ResourceRecordKey/);
  });
});
