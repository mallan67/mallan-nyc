/// <reference types="jest" />
/**
 * Codex #466 — the health probe must not certify a data-loss condition as healthy.
 *
 * dbGrowthCell previously returned 🟢 for ANY successful canonical DB read, so an empty/restored/
 * misconfigured branch (0 listings) would be reported as healthy — the exact condition the probe
 * exists to catch. These pure helpers gate on a sane floor + archived sanity, and the freshness
 * helper is extracted too so both are unit-testable without running the probe's shell/DB side effects.
 */
import { dbGrowthCell, cotalityFreshnessCell, LISTINGS_FLOOR } from '../../scripts/health/health-status';

describe('dbGrowthCell — DB growth/archive health gate (Codex #466)', () => {
  it('healthy count above floor → 🟢 with evidence', () => {
    const c = dbGrowthCell(110597, 2032);
    expect(c.status).toBe('🟢');
    expect(c.evidence).toContain('110,597');
    expect(c.evidence).toContain('2,032');
  });

  it('0 listings (empty/restored branch) → 🔴, NOT 🟢 (does not certify data loss as healthy)', () => {
    const c = dbGrowthCell(0, 0);
    expect(c.status).toBe('🔴');
    expect(c.evidence).toMatch(/below floor/i);
  });

  it('count below the floor → 🔴', () => {
    expect(dbGrowthCell(500, 10).status).toBe('🔴');
    expect(dbGrowthCell(LISTINGS_FLOOR - 1, 0).status).toBe('🔴');
  });

  it('count exactly at the floor → 🟢', () => {
    expect(dbGrowthCell(LISTINGS_FLOOR, 0).status).toBe('🟢');
  });

  it('archived greater than total (impossible / anomalous) → 🟡', () => {
    expect(dbGrowthCell(110000, 999999).status).toBe('🟡');
  });

  it('negative / non-finite total → ⚪ (invalid read, not green)', () => {
    expect(dbGrowthCell(-1, 0).status).toBe('⚪');
    expect(dbGrowthCell(Number.NaN, 0).status).toBe('⚪');
  });
});

describe('cotalityFreshnessCell — ingestion freshness', () => {
  it('<=30m → 🟢', () => expect(cotalityFreshnessCell(9).status).toBe('🟢'));
  it('31–120m → 🟡', () => expect(cotalityFreshnessCell(60).status).toBe('🟡'));
  it('>120m → 🔴', () => expect(cotalityFreshnessCell(200).status).toBe('🔴'));
  it('null (no timestamp) → ⚪', () => expect(cotalityFreshnessCell(null).status).toBe('⚪'));
});
