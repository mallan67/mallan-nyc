/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — direct unit coverage for `isPrunable()`.
 *
 * WHY THIS EXISTS. `isPrunable` decides whether a Neon branch gets DELETED, and it had no direct
 * test of any kind — its only exercise was indirect, through `pruneBranches`. The primary and
 * protected exemptions are the only thing standing between the prune cron and the production
 * branch, so they are pinned here against the function itself rather than inferred from a caller.
 *
 * WHAT THIS PACKET CHANGES IN IT. One thing, and only because a test below exposes it: an
 * `updated_at` that does not parse produced `ageHours = NaN`, and `NaN < retentionHours` is
 * `false`, so the branch fell through to `{ prunable: true, reason: "idle for NaN h" }`. A branch
 * whose age could not be determined was therefore treated as old enough to delete — fail-OPEN on a
 * destructive path, and the same "undeterminable read as permission" shape this packet closes
 * everywhere else. Age that cannot be computed now refuses.
 *
 * Everything else about the function is characterised, not altered.
 */
import { isPrunable, type NeonBranch } from '@/lib/neon/branches';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const RETENTION = 24;

function branch(over: Partial<NeonBranch> = {}): NeonBranch {
  return {
    id: 'br-test-0001',
    name: 'preview/some-feature',
    primary: false,
    protected: false,
    created_at: '2026-09-01T00:00:00.000Z',
    // 100h old by default — comfortably outside a 24h window.
    updated_at: '2026-09-14T08:00:00.000Z',
    ...over,
  };
}

describe('isPrunable — the exemptions that protect production', () => {
  it('primary: true is never prunable', () => {
    const r = isPrunable(branch({ primary: true }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/primary/i);
  });

  it('protected: true is never prunable', () => {
    const r = isPrunable(branch({ protected: true }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/protect/i);
  });

  it('primary protection does NOT depend on protected: true', () => {
    // The two flags are independent exemptions. If primary protection were ever folded into the
    // protected check, an unprotected primary — which is exactly how Neon reports the production
    // branch by default — would become prunable.
    const r = isPrunable(branch({ primary: true, protected: false }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/primary/i);
  });

  it('primary wins over protected in the reported reason (order is stable)', () => {
    const r = isPrunable(branch({ primary: true, protected: true }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/primary/i);
  });

  it('a very old branch that is primary is STILL not prunable', () => {
    // Age never overrides an exemption. Pinned because the age check sits after the flags, and a
    // reordering would be invisible without this.
    const r = isPrunable(
      branch({ primary: true, updated_at: '2020-01-01T00:00:00.000Z' }),
      RETENTION,
      NOW,
    );
    expect(r.prunable).toBe(false);
  });
});

describe('isPrunable — the retention window', () => {
  it('ordinary branch inside the retention window is not prunable', () => {
    // 1h old against a 24h window.
    const r = isPrunable(branch({ updated_at: '2026-09-18T11:00:00.000Z' }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/retention/i);
  });

  it('ordinary branch outside the retention window is prunable', () => {
    const r = isPrunable(branch({ updated_at: '2026-09-17T11:00:00.000Z' }), RETENTION, NOW);
    expect(r.prunable).toBe(true);
    expect(r.reason).toMatch(/idle/i);
  });

  it('exactly at the retention boundary is prunable (the window is exclusive)', () => {
    // Characterisation, not a complaint: `ageHours < retentionHours` means a branch exactly at the
    // boundary passes. Written down so a future `<=` is a deliberate decision rather than a drift.
    const r = isPrunable(branch({ updated_at: '2026-09-17T12:00:00.000Z' }), RETENTION, NOW);
    expect(r.prunable).toBe(true);
  });

  it('a future updated_at (clock skew) is not prunable', () => {
    // Negative age lands inside the window, which refuses. The safe direction, and worth pinning.
    const r = isPrunable(branch({ updated_at: '2026-09-19T12:00:00.000Z' }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
  });

  it('retentionHours of 0 makes an ordinary idle branch prunable', () => {
    expect(isPrunable(branch(), 0, NOW).prunable).toBe(true);
  });

  it('an exemption still holds even with retentionHours of 0', () => {
    expect(isPrunable(branch({ primary: true }), 0, NOW).prunable).toBe(false);
    expect(isPrunable(branch({ protected: true }), 0, NOW).prunable).toBe(false);
  });
});

describe('isPrunable — an age that cannot be determined must refuse', () => {
  // THE DEFECT. `new Date("garbage").getTime()` is NaN, and every comparison against NaN is false,
  // so `ageHours < retentionHours` was false and the branch fell through to prunable. The values
  // below are typed as `string`, but they arrive from the Neon API as unvalidated JSON — the list
  // response is cast, not parsed — so a missing or reformatted field reaches this function intact.

  it('an unparseable updated_at is NOT prunable', () => {
    const r = isPrunable(branch({ updated_at: 'not-a-date' }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
    expect(r.reason).toMatch(/undetermin|invalid|unparse/i);
  });

  it('an empty updated_at is NOT prunable', () => {
    const r = isPrunable(branch({ updated_at: '' }), RETENTION, NOW);
    expect(r.prunable).toBe(false);
  });

  it('a missing updated_at is NOT prunable', () => {
    const r = isPrunable(
      branch({ updated_at: undefined as unknown as string }),
      RETENTION,
      NOW,
    );
    expect(r.prunable).toBe(false);
  });

  it('never reports a NaN age to the operator', () => {
    const r = isPrunable(branch({ updated_at: 'not-a-date' }), RETENTION, NOW);
    expect(r.reason).not.toMatch(/NaN/);
  });

  it('a non-finite retentionHours refuses rather than deleting everything', () => {
    // `ageHours < NaN` is false too, so a misconfigured retention value emptied the window the
    // same way. Both inputs to the comparison have to be trustworthy for its answer to mean
    // anything.
    expect(isPrunable(branch(), NaN, NOW).prunable).toBe(false);
  });
});
