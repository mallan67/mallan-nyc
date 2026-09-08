/**
 * A listing that leaves the entitled feed has NO provider status (the feed never delivers Withdrawn, Canceled,
 * Expired or Hold — whole-corpus census 2026-09-08). Production carried 6,962 rows labelled Withdrawn whose
 * last provider status was Active / Pending / Closed; 42 of them were still live as Closed. The cron must:
 *   1. never write the invented "Withdrawn";
 *   2. decide through lib/idx/reconcile-decision.ts (the direction-agnostic reconciler that already existed but
 *      was not wired in), with a per-ghost live lookup so a listing that is live Closed becomes Closed;
 *   3. scan every on-market stored status, not only Active — Pending and ComingSoon listings leave the feed too.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELISTED_STATUS } from '@/lib/listings/canonical-lifecycle';
import { DEPARTED_STATUS, liveTruthFromRow, reconcileStatusDecision } from '@/lib/idx/reconcile-decision';

const ROOT = path.resolve(__dirname, '../..');
const route = readFileSync(path.join(ROOT, 'app/api/cron/feed-reconcile/route.ts'), 'utf8');

describe('reconcile-decision — departed vocabulary', () => {
  it('DEPARTED_STATUS is Delisted, the canonical departed-from-feed status', () => {
    expect(DEPARTED_STATUS).toBe(DELISTED_STATUS);
    expect(DEPARTED_STATUS).toBe('Delisted');
  });
  it('liveTruthFromRow classifies a live row by its StandardStatus and absence by null', () => {
    expect(liveTruthFromRow({ StandardStatus: 'Closed' })).toEqual({ kind: 'terminal', status: 'Closed' });
    expect(liveTruthFromRow({ StandardStatus: 'Pending' })).toEqual({ kind: 'onmarket', status: 'Pending' });
    expect(liveTruthFromRow({ StandardStatus: 'ComingSoon' })).toEqual({ kind: 'onmarket', status: 'ComingSoon' });
    expect(liveTruthFromRow(null)).toEqual({ kind: 'absent' });
    expect(liveTruthFromRow({ StandardStatus: null })).toEqual({ kind: 'absent' });
  });
  it('an on-market stored row that is absent live becomes Delisted; one that is live Closed becomes Closed', () => {
    expect(reconcileStatusDecision('Active', { kind: 'absent' })).toMatchObject({ action: 'update', targetStatus: 'Delisted', targetIsTerminal: true });
    expect(reconcileStatusDecision('Pending', { kind: 'absent' })).toMatchObject({ action: 'update', targetStatus: 'Delisted' });
    expect(reconcileStatusDecision('ComingSoon', { kind: 'absent' })).toMatchObject({ action: 'update', targetStatus: 'Delisted' });
    expect(reconcileStatusDecision('Active', { kind: 'terminal', status: 'Closed' })).toMatchObject({ action: 'update', targetStatus: 'Closed' });
    expect(reconcileStatusDecision('Delisted', { kind: 'absent' })).toMatchObject({ action: 'none' });
    expect(reconcileStatusDecision('Delisted', { kind: 'onmarket', status: 'Active' })).toMatchObject({ action: 'update', targetStatus: 'Active', className: 'mislabel_suppressed' });
  });
});

describe('feed-reconcile cron — wiring', () => {
  it('imports the reconciler and never spells the invented status', () => {
    expect(route).toMatch(/from ['"]@\/lib\/idx\/reconcile-decision['"]/);
    expect(route).toMatch(/reconcileStatusDecision\(/);
    expect(route).toMatch(/liveTruthFromRow\(/);
    expect(route).not.toMatch(/['"]Withdrawn['"]/);
  });
  it('uses the shared terminal vocabulary instead of a private copy', () => {
    expect(route).toMatch(/MALLAN_TERMINAL_STATUSES/);
    expect(route).not.toMatch(/const TERMINAL_STATUSES = new Set\(/);
  });
  it('scans every on-market stored status for ghosts, not only Active', () => {
    expect(route).toMatch(/ON_MARKET_STATUSES/);
    expect(route).not.toMatch(/status: "Active",\s*\n\s*listing_id: \{ startsWith: "RLS" \}/);
  });
  it('looks each ghost up live by ListingId before deciding (no decision from absence in a status snapshot alone)', () => {
    expect(route).toMatch(/ListingId in \(/);
  });
});
