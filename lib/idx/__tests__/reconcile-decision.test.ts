/// <reference types="jest" />
import {
  reconcileStatusDecision,
  resolveIdxDisplay,
  ON_MARKET_STATUSES,
  DEPARTED_STATUS,
  type LiveTruth,
  type ReconcileClass,
} from '@/lib/idx/reconcile-decision';
import { normalizeStandardStatus, TERMINAL_STATUSES } from '@/lib/idx/trestle-mapper';
import { canonicalProviderSpelling } from '@/lib/compliance/listing-status-vocabulary';

/** The status the decision engine must target for a given live status. */
const providerTarget = (s: string) => canonicalProviderSpelling(normalizeStandardStatus(s));

const ON_MARKET = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'];

// TERMINALS is DERIVED from the canonical set, not hand-listed.
//
// It used to be the 7-element literal
//   ['Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled']
// which silently diverged when the live provider member 'Canceled' (single L)
// was added to TERMINAL_STATUSES on 2026-08-19. The exhaustive db × live matrix
// below therefore never exercised a single provider-cancelled row — the test
// that exists to be exhaustive had a hole in it, and the hole was invisible
// because the literal looked complete.
//
// Deriving it means the matrix automatically covers any member added to the
// canonical set, and the two can no longer drift together.
const TERMINALS = [...TERMINAL_STATUSES].sort();
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

          // The TARGET is the live status folded to the spelling the provider
          // accepts; the STORED status is compared verbatim. See
          // `providerTargetStatus` in lib/idx/reconcile-decision.ts for why the
          // fold is one-directional. Before 2026-08-20 this invariant used a
          // bare `normalizeStandardStatus(live.status)`, which was equivalent
          // only because the normalizer used to collapse 'Canceled' into
          // 'Cancelled' — an alias that itself was the defect.
          if (live.kind === 'onmarket') {
            const tgt = providerTarget(live.status);
            // SAFETY: a live on-market listing is NEVER made terminal, target is on-market
            expect(d.targetIsTerminal).toBe(false);
            expect(ON_MARKET_STATUSES.has(d.targetStatus)).toBe(true);
            expect(d.targetStatus).toBe(tgt);
            expect(d.action).toBe(dbN === tgt ? 'none' : 'update');
          } else if (live.kind === 'terminal') {
            const tgt = providerTarget(live.status);
            expect(d.targetIsTerminal).toBe(true);
            expect(TERMINAL_STATUSES.has(d.targetStatus)).toBe(true);
            expect(d.targetStatus).toBe(tgt);
            expect(d.action).toBe(dbN === tgt ? 'none' : 'update');
            // A target may NEVER be a string the provider rejects when the class
            // has a provider spelling — that would write back a value the feed
            // can never confirm.
            expect(d.targetStatus).toBe(canonicalProviderSpelling(d.targetStatus));
          } else {
            // absent
            if (TERMINAL_STATUSES.has(dbN)) {
              expect(d.action).toBe('none');
              expect(d.className).toBe('departed_noop');
            } else if (ON_MARKET_STATUSES.has(dbN)) {
              expect(d.action).toBe('update');
              expect(d.targetStatus).toBe(DEPARTED_STATUS);
              expect(d.targetIsTerminal).toBe(true);
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
        const second = reconcileStatusDecision(first.targetStatus, live);
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
  it('hides the 218 gone-but-shown (Pending → absent → Withdrawn)', () => {
    expect(reconcileStatusDecision('Pending', absent)).toMatchObject({ action: 'update', targetStatus: 'Withdrawn', targetIsTerminal: true, className: 'stale_to_departed' });
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

  // ── PINNED: the cancel-spelling cells (decided 2026-08-20) ────────────────
  //
  // These four assertions exist because the behaviour of this pair CHANGED when
  // 'Canceled' stopped being folded to 'Cancelled' by the normalizer, and the
  // change went unexamined. The decision is recorded here, not left implicit.
  //
  // RULE: the TARGET status is folded to the spelling the live provider
  // accepts; the STORED status is compared verbatim. Consequences:
  //
  //  - A stored Mallan-local 'Cancelled' meeting a provider 'Canceled' is a
  //    terminal_realign UPDATE, not a departed_noop. The provider has actually
  //    asserted a status for this row, and a real assertion outranks the local
  //    derivation that 'Cancelled' represents on a feed row
  //    (lib/compliance/status-provenance.ts). This is also how any legacy
  //    double-L row migrates onto the provider spelling with no backfill.
  //
  //  - The reverse can never rewrite a provider value into a provider-rejected
  //    one. 'Cancelled' is HTTP 400 at the provider, so it must never be
  //    WRITTEN as a target even if a caller hands it in as live truth.
  //
  //  - Neither cell changes the display outcome: targetIsTerminal is true both
  //    ways, so resolveIdxDisplay forces idx_display_yn=false regardless.
  it('realigns a stored Mallan-local Cancelled onto the provider spelling Canceled', () => {
    expect(reconcileStatusDecision('Cancelled', terminal('Canceled'))).toMatchObject({
      action: 'update',
      targetStatus: 'Canceled',
      targetIsTerminal: true,
      className: 'terminal_realign',
    });
  });
  it('NEVER rewrites a provider Canceled into the provider-rejected Cancelled', () => {
    expect(reconcileStatusDecision('Canceled', terminal('Cancelled'))).toMatchObject({
      action: 'none',
      targetStatus: 'Canceled',
      targetIsTerminal: true,
      className: 'departed_noop',
    });
  });
  it('the realign settles in ONE step (idempotent, no write loop)', () => {
    const first = reconcileStatusDecision('Cancelled', terminal('Canceled'));
    const second = reconcileStatusDecision(first.targetStatus, terminal('Canceled'));
    expect(second.action).toBe('none');
    expect(second.targetStatus).toBe(first.targetStatus);
  });
  it('both cancel spellings are equally undisplayable regardless of class', () => {
    for (const stored of ['Cancelled', 'Canceled']) {
      const d = reconcileStatusDecision(stored, terminal('Canceled'));
      expect(d.targetIsTerminal).toBe(true);
      expect(resolveIdxDisplay(d, true)).toBe(false);
    }
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
