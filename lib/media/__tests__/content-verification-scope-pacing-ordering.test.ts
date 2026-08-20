/**
 * D2 + D3 — SCOPE, PACING and ORDERING of the bounded content verifier.
 *
 * ── MEASURED INPUTS (frozen snapshot, NO production SQL) ────────────────────────────────
 * .cache/r2-census/DB-2026-08-18T13-20-59-918Z.ndjson (sha256 79340bee…2bf7), recounted for
 * this change:
 *     listing_media rows                                            352,411
 *     status='active'                                               316,206
 *     status='active' AND media_key NOT NULL AND r2_key NOT NULL     280,543   <- the selector's universe
 *     of those, media_key LIKE 'crm:%'                                   41   <- D2
 *     crm: rows table-wide                                               64
 * Cadence: `/api/cron/one-cycle-preflight` is `*​/10 * * * *` (vercel.json) => 144 polls/day
 * CEILING; the media member is only guaranteed by the hourly freshness heartbeat
 * (ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = 3600, one-cycle-preflight.ts:49,521-533) => 24
 * cycles/day FLOOR. Pacing must be derived from the FLOOR: an interval that is too SHORT
 * produces a permanent 100% duty cycle that never completes a pass (today's defect), while
 * one that is too long merely idles.
 *
 * ── D2: MALLAN-LOCAL `crm:` ROWS ARE SENT TO COTALITY ───────────────────────────────────
 * 41 rows whose media_key begins `crm:` sit inside the selector's universe. Cotality cannot
 * hold a MediaKey it never issued, so every check resolves no locator, records
 * INDETERMINATE, and re-arms on the 24h clock (media-sync.ts:3617) — 30x tighter than the
 * verification clock. The codebase already excludes `crm:` from Cotality operations at
 * media-sync.ts:1531 and :1537 and already imports the guard at :75.
 *
 * ── D3: NON-CONVERGENCE, STARVATION AND SCAN DEPTH ──────────────────────────────────────
 * 280,543 rows / 60 per cycle (content-verification.ts:39) = 4,676 cycles per full pass:
 * 32.5 days at the 144/day ceiling, 194.8 days at the 24/day floor — against a 30-day
 * re-arm (media-sync.ts:3615). Steady-state demand at the ceiling is 64.9 rows/cycle
 * against a hard cap of 60, so the verifier can never converge.
 * ORDERING: `ORDER BY media_key ASC LIMIT 60` with no cursor re-scans an ever-growing
 * already-verified prefix every cycle, and no index supports the predicate (the only
 * index on the column is the `media_key` UNIQUE btree, schema.prisma:2388).
 */

import {
  buildContentVerificationWhere,
  verifyRow,
  isDueForVerification,
  MAX_VERIFICATION_ROWS_PER_CYCLE,
  VERIFICATION_UNIVERSE_MEASURED,
  VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
  VERIFICATION_CEILING_CYCLES_PER_DAY,
  VERIFICATION_UTILIZATION_TARGET,
  verificationSweepCycles,
  verificationSweepDays,
  verificationDemandRowsPerCycle,
  requiredVerificationIntervalMs,
  isVerificationConvergent,
  emptySweepState,
  parseSweepState,
  serializeSweepState,
  shouldRunVerificationCycle,
  advanceSweepState,
  type VerifiableRow,
  type VerificationDeps,
  type VerificationIntervals,
  type VerificationSweepState,
  type SweepCycleReport,
  type ContentCheckState,
} from '../content-verification';
import {
  CONTENT_VERIFICATION_INTERVAL_MS,
  CONTENT_VERIFICATION_RETRY_MS,
  CONTENT_VERIFICATION_SWEEP_GAP_MS,
} from '@/lib/idx/media-sync';

const DAY = 86_400_000;
const NOW = new Date('2026-08-20T12:00:00.000Z');
const INTERVALS: VerificationIntervals = {
  verificationIntervalMs: CONTENT_VERIFICATION_INTERVAL_MS,
  retryIntervalMs: CONTENT_VERIFICATION_RETRY_MS,
};

function row(over: Partial<VerifiableRow> = {}): VerifiableRow {
  return {
    media_key: '2005470401678',
    listing_id: 'RLS20054046',
    r2_key: 'photos/RLS20054046/1.jpg',
    media_url_original: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/a/b/c',
    content_check_at: null,
    content_check_state: null,
    ...over,
  };
}

interface Spies extends VerificationDeps {
  locatorLookups: string[];
  recorded: Array<{ mediaKey: string; state: ContentCheckState }>;
}
function makeDeps(over: Partial<VerificationDeps> = {}): Spies {
  const locatorLookups: string[] = [];
  const recorded: Spies['recorded'] = [];
  const base: VerificationDeps = {
    async resolveFreshLocator(mk) { locatorLookups.push(mk); return 'https://api.cotality.com/fresh'; },
    async fetchProviderBytes() { return Buffer.from('SAME-BYTES'); },
    async readR2Bytes() { return Buffer.from('SAME-BYTES'); },
    async recordCheck(mediaKey, _at, state) { recorded.push({ mediaKey, state }); },
  };
  return Object.assign(base, over, { locatorLookups, recorded }) as Spies;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('D2 — Mallan-local `crm:` rows are never sent to Cotality', () => {
  it('the selector EXCLUDES the crm: namespace', () => {
    const where = buildContentVerificationWhere();
    expect(JSON.stringify(where)).toContain('crm:');
    expect(where).toMatchObject({ NOT: { media_key: { startsWith: 'crm:' } } });
  });

  it('NEGATIVE: a crm: row is never issued a Cotality lookup and never records a check', async () => {
    const deps = makeDeps();
    const out = await verifyRow(row({ media_key: 'crm:SL-0004/1779898434281' }), deps, NOW);

    expect(deps.locatorLookups).toEqual([]);          // no Cotality call, at all
    expect(deps.recorded).toEqual([]);                // no INDETERMINATE, so no 24h re-arm
    expect(out.state).toBeNull();
    expect(out.skipped).toBe('mallan_local');
  });

  it('a feed row is still checked — the guard is namespace-scoped, not a kill switch', async () => {
    const deps = makeDeps();
    const out = await verifyRow(row(), deps, NOW);
    expect(deps.locatorLookups).toEqual(['2005470401678']);
    expect(out.state).toBe('VERIFIED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D3 — pacing must converge against MEASURED capacity', () => {
  it('records the measured universe with the crm: rows removed', () => {
    expect(VERIFICATION_UNIVERSE_MEASURED).toBe(280_543 - 41);
  });

  it('reproduces the observed non-convergence of the 30-day re-arm', () => {
    const THIRTY_DAYS = 30 * DAY;
    // 4,676 cycles per full pass.
    expect(verificationSweepCycles(280_543, 60)).toBe(4676);
    // 32.5 days at the CEILING — already longer than the 30-day promise.
    expect(verificationSweepDays(280_543, 60, VERIFICATION_CEILING_CYCLES_PER_DAY)).toBeCloseTo(32.47, 2);
    // 194.8 days at the guaranteed FLOOR.
    expect(verificationSweepDays(280_543, 60, VERIFICATION_GUARANTEED_CYCLES_PER_DAY)).toBeCloseTo(194.83, 2);
    // steady-state demand 64.9 rows/cycle against a hard cap of 60.
    expect(
      verificationDemandRowsPerCycle(280_543, THIRTY_DAYS, VERIFICATION_CEILING_CYCLES_PER_DAY),
    ).toBeCloseTo(64.94, 2);
    expect(isVerificationConvergent(THIRTY_DAYS, 280_543, 60, VERIFICATION_CEILING_CYCLES_PER_DAY)).toBe(false);
    expect(isVerificationConvergent(THIRTY_DAYS, 280_543, 60, VERIFICATION_GUARANTEED_CYCLES_PER_DAY)).toBe(false);
  });

  it('the SHIPPED interval is convergent at the guaranteed floor, not merely at the ceiling', () => {
    expect(
      isVerificationConvergent(
        CONTENT_VERIFICATION_INTERVAL_MS,
        VERIFICATION_UNIVERSE_MEASURED,
        MAX_VERIFICATION_ROWS_PER_CYCLE,
        VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
      ),
    ).toBe(true);
    // and demand stays under the cap with the declared headroom
    expect(
      verificationDemandRowsPerCycle(
        VERIFICATION_UNIVERSE_MEASURED,
        CONTENT_VERIFICATION_INTERVAL_MS,
        VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
      ),
    ).toBeLessThanOrEqual(MAX_VERIFICATION_ROWS_PER_CYCLE * VERIFICATION_UTILIZATION_TARGET);
  });

  it('the interval is DERIVED, never a hand-written constant that can drift from capacity', () => {
    expect(CONTENT_VERIFICATION_INTERVAL_MS).toBe(
      requiredVerificationIntervalMs(
        VERIFICATION_UNIVERSE_MEASURED,
        MAX_VERIFICATION_ROWS_PER_CYCLE,
        VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
        VERIFICATION_UTILIZATION_TARGET,
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D3 — ordering: a keyset sweep, so scan depth cannot grow', () => {
  const KEYS = Array.from({ length: 60 }, (_, i) => `K${String(i).padStart(2, '0')}`);
  const st = (over: Partial<VerificationSweepState> = {}): VerificationSweepState => ({
    cursor: null, sweepStartedAt: null, nextSweepEligibleAt: null, progressAt: null, ...over,
  });
  const report = (over: Partial<SweepCycleReport> = {}): SweepCycleReport => ({
    queried: true, scannedKeys: [], processedKeys: [], cap: 60,
    gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS, ...over,
  });

  it('with no cursor the selector starts at the beginning of the key space', () => {
    const where = buildContentVerificationWhere(null);
    expect(where.media_key).toEqual({ not: null });
  });

  it('with a cursor the selector is an INDEX-SERVED forward range on the unique media_key btree', () => {
    const where = buildContentVerificationWhere('2005470401678');
    expect(where.media_key).toEqual({ not: null, gt: '2005470401678' });
  });

  it('the cursor advances only past rows actually EXAMINED (a budget break must not skip work)', () => {
    const next = advanceSweepState(st({ cursor: 'K-000', sweepStartedAt: NOW, progressAt: NOW }), NOW,
      report({ scannedKeys: KEYS, processedKeys: KEYS.slice(0, 3) }));
    expect(next.cursor).toBe('K02'); // NOT the 60th scanned key
    expect(next.nextSweepEligibleAt).toBeNull();
  });

  it('examining zero rows leaves the cursor exactly where it was', () => {
    const state = st({ cursor: 'K', sweepStartedAt: NOW, progressAt: NOW });
    const next = advanceSweepState(state, NOW, report({ scannedKeys: KEYS, processedKeys: [] }));
    expect(next).toEqual(state);
  });

  it('an EXHAUSTED range ends the sweep, and the gate is armed from the sweep END', () => {
    const started = new Date(NOW.getTime() - 100 * DAY);
    const state = st({ cursor: 'K', sweepStartedAt: started, progressAt: started });
    const next = advanceSweepState(state, NOW, report({ scannedKeys: ['X', 'Y', 'Z'], processedKeys: ['X', 'Y', 'Z'] }));
    expect(next.cursor).toBeNull();
    // END-anchored on purpose: `sweepStartedAt + interval` leaves the worst-case row age at
    // interval + (D_slow - D_fast) when the cadence changes between passes.
    expect(next.nextSweepEligibleAt).toEqual(new Date(NOW.getTime() + CONTENT_VERIFICATION_SWEEP_GAP_MS));
  });

  it('a NEW sweep re-stamps its own start — a stale start would mis-date the whole pass', () => {
    const staleStart = new Date(NOW.getTime() - 300 * DAY);
    const beginning = st({ sweepStartedAt: staleStart, nextSweepEligibleAt: new Date(NOW.getTime() - 1) });
    expect(shouldRunVerificationCycle(beginning, NOW)).toBe(true);

    const afterFirstCycle = advanceSweepState(beginning, NOW, report({ scannedKeys: KEYS, processedKeys: ['A'] }));
    expect(afterFirstCycle.sweepStartedAt).toEqual(NOW);

    const wrapped = advanceSweepState(afterFirstCycle, NOW, report({ scannedKeys: ['B'], processedKeys: ['B'] }));
    expect(wrapped.nextSweepEligibleAt).toEqual(new Date(NOW.getTime() + CONTENT_VERIFICATION_SWEEP_GAP_MS));
    expect(shouldRunVerificationCycle(wrapped, NOW)).toBe(false);
  });

  it('between sweeps the verifier issues NO query at all — an idle full-table scan is the defect it replaces', () => {
    const idle = st({
      sweepStartedAt: new Date(NOW.getTime() - 200 * DAY),
      nextSweepEligibleAt: new Date(NOW.getTime() + 1),
      progressAt: new Date(NOW.getTime() - 10 * DAY),
    });
    expect(shouldRunVerificationCycle(idle, NOW)).toBe(false);
    expect(shouldRunVerificationCycle(idle, new Date(NOW.getTime() + 1))).toBe(true);
    // a sweep already in flight is never gated
    expect(shouldRunVerificationCycle({ ...idle, cursor: 'MID' }, NOW)).toBe(true);
    // cold start runs immediately
    expect(shouldRunVerificationCycle(emptySweepState(), NOW)).toBe(true);
  });

  it('sweep state round-trips through the single TEXT column it is persisted in', () => {
    const s = st({ cursor: 'K', sweepStartedAt: NOW, nextSweepEligibleAt: new Date(NOW.getTime() + DAY), progressAt: NOW });
    expect(parseSweepState(serializeSweepState(s))).toEqual(s);
    // unreadable / absent state fails SAFE: start a fresh sweep, never skip verification
    expect(parseSweepState(null)).toEqual(emptySweepState());
    expect(parseSweepState('not json')).toEqual(emptySweepState());
    expect(shouldRunVerificationCycle(parseSweepState('not json'), NOW)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D3 — starvation: fast-re-arming INDETERMINATE rows cannot crowd out first checks', () => {
  it('an INDETERMINATE row the sweep has already passed cannot be re-selected in the same sweep', () => {
    // Its 24h clock says "due"; the sweep cursor says "already visited this pass".
    const stale = row({
      media_key: 'AAA',
      content_check_state: 'INDETERMINATE',
      content_check_at: new Date(NOW.getTime() - 2 * DAY),
    });
    expect(isDueForVerification(stale, NOW, INTERVALS)).toBe(true);
    const where = buildContentVerificationWhere('MMM') as {
      media_key: { gt?: string };
    };
    expect(where.media_key.gt).toBe('MMM');
    expect(stale.media_key > 'MMM').toBe(false); // excluded by the range, this pass
  });

  it('the 24h retry clock is a FLOOR, not a driver — it can no longer out-pace the sweep', () => {
    // One visit per row per sweep is now structural. The retry constant only prevents a
    // re-check within 24h if a sweep ever wraps faster than that.
    expect(CONTENT_VERIFICATION_RETRY_MS).toBe(DAY);
    expect(verificationSweepDays(
      VERIFICATION_UNIVERSE_MEASURED, MAX_VERIFICATION_ROWS_PER_CYCLE, VERIFICATION_CEILING_CYCLES_PER_DAY,
    )).toBeGreaterThan(1);
  });
});
