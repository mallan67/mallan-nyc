/// <reference types="jest" />
import {
  reconcileStatusDecision,
  resolveIdxDisplay,
  ON_MARKET_STATUSES,
  type LiveTruth,
  type ReconcileClass,
  liveTruthFromRow,
} from '@/lib/idx/reconcile-decision';
import { normalizeStandardStatus, TERMINAL_STATUSES } from '@/lib/idx/trestle-mapper';
import { OFF_FEED_SYNC_STATUS } from '@/lib/listings/canonical-lifecycle';

const ON_MARKET = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'];
const TERMINALS = ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled'];
const OFF_MARKET = ['Hold', 'Incomplete', 'Draft']; // non-terminal, non-on-market
const ALL_DB = [...ON_MARKET, ...TERMINALS, ...OFF_MARKET];

const onmarket = (s: string): LiveTruth => ({ kind: 'onmarket', status: s });
const terminal = (s: string): LiveTruth => ({ kind: 'terminal', status: s });
const absent: LiveTruth = { kind: 'absent' };

const VALID_CLASSES: ReconcileClass[] = [
  'ok', 'mislabel_suppressed', 'revived_offmarket', 'status_drift',
  'stale_to_terminal', 'stale_to_departed', 'terminal_realign',
  'departed_noop', 'offmarket_noop',
];

describe('reconcileStatusDecision — EXHAUSTIVE matrix (every dbStatus × liveTruth)', () => {
  const liveTruths: Array<[string, LiveTruth]> = [
    ...ON_MARKET.map((s) => [`onmarket:${s}`, onmarket(s)] as [string, LiveTruth]),
    ...TERMINALS.map((s) => [`terminal:${s}`, terminal(s)] as [string, LiveTruth]),
    ['absent', absent],
  ];

  describe('invariants hold for every cell', () => {
    for (const db of ALL_DB) {
      for (const [label, live] of liveTruths) {
        it(`db=${db} × live=${label}`, () => {
          const d = reconcileStatusDecision(db, live);
          const dbN = normalizeStandardStatus(db);
          expect(VALID_CLASSES).toContain(d.className);

          if (live.kind === 'onmarket') {
            const tgt = normalizeStandardStatus(live.status);
            // SAFETY: a live on-market listing is NEVER made terminal, target is on-market
            expect(d.targetIsTerminal).toBe(false);
            expect(ON_MARKET_STATUSES.has(d.targetStatus)).toBe(true);
            expect(d.targetStatus).toBe(tgt);
            expect(d.action).toBe(dbN === tgt ? 'none' : 'update');
            expect(d.targetSyncStatus).toBe(d.action === 'update' ? 'synced' : null);
          } else if (live.kind === 'terminal') {
            const tgt = normalizeStandardStatus(live.status);
            expect(d.targetIsTerminal).toBe(true);
            expect(TERMINAL_STATUSES.has(d.targetStatus)).toBe(true);
            expect(d.targetStatus).toBe(tgt);
            expect(d.action).toBe(dbN === tgt ? 'none' : 'update');
            expect(d.targetSyncStatus).toBe(d.action === 'update' ? 'synced' : null);
          } else {
            // absent
            if (TERMINAL_STATUSES.has(dbN)) {
              expect(d.action).toBe('none');
              expect(d.className).toBe('departed_noop');
            } else if (ON_MARKET_STATUSES.has(dbN)) {
              // Off the current feed with no verified reason: the provider status is PRESERVED and the Mallan
              // presence fact is recorded (Off Market) — never a manufactured terminal status.
              expect(d.action).toBe('update');
              expect(d.targetStatus).toBe(dbN);
              expect(d.targetIsTerminal).toBe(false);
              expect(d.targetSyncStatus).toBe(OFF_FEED_SYNC_STATUS);
              expect(d.className).toBe('stale_to_departed');
            } else {
              expect(d.action).toBe('none');
              expect(d.className).toBe('offmarket_noop');
            }
          }
        });
      }
    }
  });

  it('SAFETY: a live on-market listing is NEVER marked terminal — for any db status', () => {
    for (const db of ALL_DB) {
      for (const s of ON_MARKET) {
        expect(reconcileStatusDecision(db, onmarket(s)).targetIsTerminal).toBe(false);
      }
    }
  });

  it('IDEMPOTENT: reconcile then re-reconcile is a no-op (no oscillation across cron runs)', () => {
    const truths: LiveTruth[] = [...ON_MARKET.map(onmarket), ...TERMINALS.map(terminal), absent];
    for (const db of ALL_DB) {
      for (const live of truths) {
        const first = reconcileStatusDecision(db, live);
        const second = reconcileStatusDecision(first.targetStatus, live, first.targetSyncStatus ?? undefined);
        expect(second.action).toBe('none');
      }
    }
  });

  // ── Named production census scenarios ──
  it('un-suppresses the 6 live-Active (Withdrawn → Active)', () => {
    expect(reconcileStatusDecision('Withdrawn', onmarket('Active'))).toMatchObject({ action: 'update', targetStatus: 'Active', targetIsTerminal: false, className: 'mislabel_suppressed' });
  });
  it('un-suppresses the 97 live-Pending (Withdrawn → Pending)', () => {
    expect(reconcileStatusDecision('Withdrawn', onmarket('Pending'))).toMatchObject({ action: 'update', targetStatus: 'Pending', className: 'mislabel_suppressed' });
  });
  it('hides the 127 sold-but-shown (Pending → Closed)', () => {
    expect(reconcileStatusDecision('Pending', terminal('Closed'))).toMatchObject({ action: 'update', targetStatus: 'Closed', targetIsTerminal: true, className: 'stale_to_terminal' });
  });
  it('hides the 218 gone-but-shown: absent → Off Market (sync_status off_feed), provider status PRESERVED, never an invented status', () => {
    expect(reconcileStatusDecision('Pending', absent)).toMatchObject({ action: 'update', targetStatus: 'Pending', targetIsTerminal: false, targetSyncStatus: 'off_feed', className: 'stale_to_departed' });
    expect(reconcileStatusDecision('Active', absent)).toMatchObject({ targetStatus: 'Active', targetSyncStatus: 'off_feed' });
    expect(reconcileStatusDecision('ComingSoon', absent)).toMatchObject({ targetStatus: 'ComingSoon', targetSyncStatus: 'off_feed' });
    expect(resolveIdxDisplay(reconcileStatusDecision('Active', absent), true)).toBe(false);
  });
  it('an Off Market row that reappears live is returned to the feed; one that stays absent is left alone', () => {
    expect(reconcileStatusDecision('Active', onmarket('Active'), 'off_feed')).toMatchObject({ action: 'update', targetStatus: 'Active', targetSyncStatus: 'synced', className: 'mislabel_suppressed' });
    expect(reconcileStatusDecision('Active', onmarket('Pending'), 'off_feed')).toMatchObject({ action: 'update', targetStatus: 'Pending', targetSyncStatus: 'synced' });
    expect(reconcileStatusDecision('Active', terminal('Closed'), 'off_feed')).toMatchObject({ action: 'update', targetStatus: 'Closed', targetIsTerminal: true, targetSyncStatus: 'synced', className: 'stale_to_terminal' });
    expect(reconcileStatusDecision('Active', absent, 'off_feed')).toMatchObject({ action: 'none', className: 'departed_noop' });
    expect(reconcileStatusDecision('Pending', absent, OFF_FEED_SYNC_STATUS).action).toBe('none');
  });
  it('leaves the 4,921 departed alone (Withdrawn + absent)', () => {
    expect(reconcileStatusDecision('Withdrawn', absent)).toMatchObject({ action: 'none', className: 'departed_noop' });
  });
  it('leaves the 16,438 correct alone (Active + live Active)', () => {
    expect(reconcileStatusDecision('Active', onmarket('Active')).action).toBe('none');
  });
  it('corrects on-market drift (Active → Pending)', () => {
    expect(reconcileStatusDecision('Active', onmarket('Pending'))).toMatchObject({ action: 'update', targetStatus: 'Pending', className: 'status_drift' });
  });
  it('realigns a Withdrawn that is actually live Closed', () => {
    expect(reconcileStatusDecision('Withdrawn', terminal('Closed'))).toMatchObject({ action: 'update', targetStatus: 'Closed', className: 'terminal_realign' });
  });

  // ── Off-market protection (the gap the exhaustive pass surfaced) ──
  it.each(OFF_MARKET)('never auto-withdraws an off-market %s that is absent from the on-market feed', (s) => {
    expect(reconcileStatusDecision(s, absent)).toMatchObject({ action: 'none', className: 'offmarket_noop' });
  });
  it.each(OFF_MARKET)('brings an off-market %s on-market when it appears live Active', (s) => {
    expect(reconcileStatusDecision(s, onmarket('Active'))).toMatchObject({ action: 'update', targetStatus: 'Active', targetIsTerminal: false, className: 'revived_offmarket' });
  });

  // ── Normalization edges (case / whitespace / alias) ──
  it('normalizes case and whitespace on both sides', () => {
    expect(reconcileStatusDecision('withdrawn', onmarket('Active')).className).toBe('mislabel_suppressed');
    expect(reconcileStatusDecision('Active', onmarket('active')).action).toBe('none');
    expect(reconcileStatusDecision('  Active  ', onmarket('Active')).action).toBe('none');
  });
  it('treats a terminal (Canceled/Cancelled) + absent as a no-op either spelling', () => {
    expect(reconcileStatusDecision('Canceled', absent).action).toBe('none');
    expect(reconcileStatusDecision('Cancelled', absent).action).toBe('none');
  });
});

describe('resolveIdxDisplay — a terminal target is NEVER displayable', () => {
  // Fail-open fix (2026-07-06): a live status that is neither on-market nor in
  // canonical TERMINAL_STATUSES (Hold / Incomplete / Delete). The decision engine
  // flags targetIsTerminal=true, but computeGateColumns would treat e.g. 'Hold' as
  // non-terminal and could compute idx_display_yn=true → terminal-but-displayable.
  // resolveIdxDisplay closes that: targetIsTerminal ⟹ not displayable, always.
  it.each(['Hold', 'Incomplete', 'Delete'])(
    'live non-canonical terminal %s → decision terminal, forced NOT displayable even if gate says true',
    (status) => {
      const d = reconcileStatusDecision('Active', { kind: 'terminal', status });
      expect(d.targetIsTerminal).toBe(true);
      expect(resolveIdxDisplay(d, true)).toBe(false);
      expect(resolveIdxDisplay(d, false)).toBe(false);
    },
  );

  it('the fail-open premise: Hold is NOT in canonical TERMINAL_STATUSES', () => {
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus('Hold'))).toBe(false);
  });

  it('canonical terminal target (Closed) is also not displayable', () => {
    const d = reconcileStatusDecision('Active', { kind: 'terminal', status: 'Closed' });
    expect(d.targetIsTerminal).toBe(true);
    expect(resolveIdxDisplay(d, true)).toBe(false);
  });

  it('non-terminal (on-market) target keeps the gate-computed display', () => {
    const d = reconcileStatusDecision('Withdrawn', { kind: 'onmarket', status: 'Active' });
    expect(d.targetIsTerminal).toBe(false);
    expect(resolveIdxDisplay(d, true)).toBe(true);
    expect(resolveIdxDisplay(d, false)).toBe(false);
  });
});

describe('liveTruthFromRow — the provider row is read only through the canonical lifecycle', () => {
  it('no row → absent (departed from the licensed feed)', () => {
    expect(liveTruthFromRow(null)).toEqual({ kind: 'absent' });
    expect(liveTruthFromRow(undefined)).toEqual({ kind: 'absent' });
  });
  it("Pending is on-market (the feed's in-contract status, publicly displayable as In Contract)", () => {
    expect(liveTruthFromRow({ StandardStatus: 'Pending' })).toEqual({ kind: 'onmarket', status: 'Pending' });
  });
  it('Active / ActiveUnderContract / ComingSoon are on-market', () => {
    for (const s of ['Active', 'ActiveUnderContract', 'ComingSoon'] as const) {
      expect(liveTruthFromRow({ StandardStatus: s })).toEqual({ kind: 'onmarket', status: s });
    }
  });
  it('Closed is terminal with the live status kept', () => {
    expect(liveTruthFromRow({ StandardStatus: 'Closed' })).toEqual({ kind: 'terminal', status: 'Closed' });
  });
  it('Hold (temporarily off market) is not on-market for reconciliation', () => {
    expect(liveTruthFromRow({ StandardStatus: 'Hold' })).toEqual({ kind: 'terminal', status: 'Hold' });
  });
  it('a row without a recognised StandardStatus is absent (never an invented status)', () => {
    expect(liveTruthFromRow({ StandardStatus: null })).toEqual({ kind: 'absent' });
  });
});
