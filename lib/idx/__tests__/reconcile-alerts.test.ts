/// <reference types="jest" />
import {
  evaluateAlerts,
  hasCriticalAlert,
  alertsToNotify,
  formatSummary,
  type CensusMetrics,
  type VolumeMetrics,
} from '@/lib/idx/reconcile-alerts';

const CLEAN: CensusMetrics = { mislabel_suppressed: 0, stale_showing: 0, status_drift: 0, projection_drift: 0, missing_inventory: 0 };
const VOL = (o: Partial<VolumeMetrics> = {}): VolumeMetrics => ({ total: 21808, active: 10082, pending: 6458, coming_soon: 1, closed: 1350, withdrawn: 4900, ...o });

describe('evaluateAlerts — the exact failure modes we eliminated', () => {
  it('fires nothing when clean and stable', () => {
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN } });
    expect(a).toEqual([]);
    expect(hasCriticalAlert(a)).toBe(false);
  });

  // 1. Feed Truth Invariant
  it('CRITICAL when a live listing is suppressed (mislabel_suppressed>0)', () => {
    const a = evaluateAlerts({ census: { ...CLEAN, mislabel_suppressed: 1 }, prev: { census: CLEAN } });
    expect(a[0]).toMatchObject({ key: 'mislabel_suppressed', severity: 'critical', transition: 'new' });
    expect(hasCriticalAlert(a)).toBe(true);
  });

  // 2. Stale Display Invariant
  it('CRITICAL when a shown listing is no longer live (stale_showing>0)', () => {
    const a = evaluateAlerts({ census: { ...CLEAN, stale_showing: 3 }, prev: { census: CLEAN } });
    expect(a[0]).toMatchObject({ key: 'stale_showing', severity: 'critical' });
  });

  // 3. Projection Drift (High)
  it('HIGH when listings ↔ projection drift (projection_drift>0)', () => {
    const a = evaluateAlerts({ census: { ...CLEAN, projection_drift: 1 }, prev: { census: CLEAN } });
    expect(a[0]).toMatchObject({ key: 'projection_drift', severity: 'high' });
    expect(hasCriticalAlert(a)).toBe(false);
  });

  // 4. Missing Live Inventory
  it('CRITICAL when a live listing is missing locally (missing_inventory>0)', () => {
    const a = evaluateAlerts({ census: { ...CLEAN, missing_inventory: 1 }, prev: { census: CLEAN } });
    expect(a[0]).toMatchObject({ key: 'missing_inventory', severity: 'critical' });
  });

  // State-change model (no spam)
  describe('state-change transitions', () => {
    it('marks a newly-broken invariant "new"', () => {
      const a = evaluateAlerts({ census: { ...CLEAN, mislabel_suppressed: 25 }, prev: { census: CLEAN } });
      expect(a[0].transition).toBe('new');
    });
    it('marks a still-broken invariant "ongoing" (suppressed from paging)', () => {
      const a = evaluateAlerts({ census: { ...CLEAN, mislabel_suppressed: 25 }, prev: { census: { ...CLEAN, mislabel_suppressed: 25 } } });
      expect(a[0].transition).toBe('ongoing');
      expect(alertsToNotify(a)).toEqual([]); // no re-page while ongoing
    });
    it('emits "recovered" once when an invariant returns to 0', () => {
      const a = evaluateAlerts({ census: CLEAN, prev: { census: { ...CLEAN, stale_showing: 5 } } });
      expect(a[0]).toMatchObject({ key: 'stale_showing', transition: 'recovered' });
      expect(alertsToNotify(a)).toHaveLength(1); // notify the recovery once
    });
    it('alertsToNotify pages only on new/recovered, never ongoing', () => {
      const a = evaluateAlerts({ census: { ...CLEAN, mislabel_suppressed: 1, stale_showing: 1 }, prev: { census: { ...CLEAN, mislabel_suppressed: 1 } } });
      const notify = alertsToNotify(a);
      expect(notify.map((x) => x.key)).toEqual(['stale_showing']); // only the newly-firing one
    });
  });

  // 6. Sudden growth detector — the +8,000 Closed overnight case
  it('CRITICAL on abnormal Closed volume growth (the original incident)', () => {
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN, volume: VOL() }, volume: VOL({ closed: 1350 + 8000 }) });
    const growth = a.find((x) => x.key === 'volume_closed');
    expect(growth).toMatchObject({ severity: 'critical', count: 8000 });
  });
  it('does NOT fire on normal volume drift within threshold', () => {
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN, volume: VOL() }, volume: VOL({ closed: 1350 + 50 }) });
    expect(a.find((x) => x.key === 'volume_closed')).toBeUndefined();
  });

  // 7. Ghost transition alert
  it('CRITICAL when a run transitions an abnormal number of ghosts', () => {
    const run = { duration_ms: 1, live_examined: 1, rows_updated: 0, rows_skipped: 0, rows_errored: 0, suppressed_fixed: 0, stale_hidden: 0, ghosts_detected: 900, ghosts_transitioned: 900, ghosts_skipped: 0, ghosts_failed: 0 };
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN }, run });
    expect(a.find((x) => x.key === 'ghost_transition')).toMatchObject({ severity: 'critical', count: 900 });
  });
  it('HIGH when ghost transitions fail', () => {
    const run = { duration_ms: 1, live_examined: 1, rows_updated: 0, rows_skipped: 0, rows_errored: 0, suppressed_fixed: 0, stale_hidden: 0, ghosts_detected: 10, ghosts_transitioned: 8, ghosts_skipped: 0, ghosts_failed: 2 };
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN }, run });
    expect(a.find((x) => x.key === 'ghost_failed')).toMatchObject({ severity: 'high', count: 2 });
  });

  // 8. Cotality API health
  it('CRITICAL on auth failure, HIGH on partial feed, WARNING on 429/timeout', () => {
    const a = evaluateAlerts({ census: CLEAN, prev: { census: CLEAN }, api: { auth_failures: 1, throttle_429: 3, timeouts: 1, partial_responses: 1 } });
    expect(a.find((x) => x.key === 'api_auth')?.severity).toBe('critical');
    expect(a.find((x) => x.key === 'api_partial')?.severity).toBe('high');
    expect(a.find((x) => x.key === 'api_429')?.severity).toBe('warning');
    expect(a.find((x) => x.key === 'api_timeout')?.severity).toBe('warning');
  });

  it('sorts critical → high → warning', () => {
    const a = evaluateAlerts({ census: { ...CLEAN, mislabel_suppressed: 1, projection_drift: 1, status_drift: 1 }, prev: { census: CLEAN } });
    expect(a.map((x) => x.severity)).toEqual(['critical', 'high', 'warning']);
  });
});

describe('formatSummary — one-look health report', () => {
  it('renders the five census numbers and run/volume lines', () => {
    const s = formatSummary({
      runTime: '2026-07-05T23:59:00Z',
      census: CLEAN,
      volume: VOL(),
      run: { duration_ms: 1200, live_examined: 16536, rows_updated: 454, rows_skipped: 0, rows_errored: 0, suppressed_fixed: 103, stale_hidden: 351, ghosts_detected: 5, ghosts_transitioned: 5, ghosts_skipped: 0, ghosts_failed: 0 },
      api: { auth_failures: 0, throttle_429: 0, timeouts: 0, partial_responses: 0 },
    });
    expect(s).toContain('MISLABEL_SUPPRESSED=0');
    expect(s).toContain('STALE_SHOWING=0');
    expect(s).toContain('suppressed_fixed=103');
    expect(s).toContain('ghosts: detected=5');
    expect(s).toContain('closed=1350');
  });
});
