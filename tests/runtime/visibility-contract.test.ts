/// <reference types="jest" />
/**
 * Backend-Search-0 — audience-aware status/source visibility contract.
 *
 * Locks the rule that public sees ACRIS closed sales only, while
 * agent/internal/report retain the FULL lifecycle (active…closed_sold…
 * closed_rented, all sources). Sold and rented are never collapsed. (2026-07-09)
 */
import {
  resolveVisibility,
  toLifecycleStatus,
  type Audience,
  type LifecycleStatus,
  type Source,
} from '../../lib/search/visibility-contract';

const ALL_STATUSES: LifecycleStatus[] = [
  'active', 'pending', 'temp_off_market', 'withdrawn', 'canceled', 'expired', 'closed_sold', 'closed_rented',
];

const V = (audience: Audience, status: LifecycleStatus, source: Source, transactionType: 'sale' | 'rental' = 'sale') =>
  resolveVisibility({ audience, status, source, transactionType, usage: 'comp' });

describe('resolveVisibility — public audience', () => {
  it('allows active + pending (active-family)', () => {
    expect(V('public', 'active', 'mls').allowed).toBe(true);
    expect(V('public', 'pending', 'mls').allowed).toBe(true);
  });

  it('allows ACRIS closed_sold publicly', () => {
    expect(V('public', 'closed_sold', 'acris').allowed).toBe(true);
  });

  it('BLOCKS MLS/Cotality closed_sold publicly', () => {
    expect(V('public', 'closed_sold', 'mls').allowed).toBe(false);
    expect(V('public', 'closed_sold', 'internal').allowed).toBe(false);
    expect(V('public', 'closed_sold', 'mallan_exclusive').allowed).toBe(false);
  });

  it('BLOCKS closed_rented from public sale history (any source)', () => {
    expect(V('public', 'closed_rented', 'acris', 'rental').allowed).toBe(false);
    expect(V('public', 'closed_rented', 'mls', 'rental').allowed).toBe(false);
  });

  it('BLOCKS off-market / withdrawn / canceled / expired publicly', () => {
    for (const s of ['temp_off_market', 'withdrawn', 'canceled', 'expired'] as LifecycleStatus[]) {
      expect(V('public', s, 'mls').allowed).toBe(false);
    }
  });
});

describe('resolveVisibility — agent / internal_report keep the FULL lifecycle', () => {
  for (const audience of ['agent', 'internal_report'] as Audience[]) {
    it(`${audience} allows EVERY status and source (no public restriction leaks in)`, () => {
      for (const s of ALL_STATUSES) {
        for (const src of ['acris', 'mls', 'mallan_exclusive', 'internal'] as Source[]) {
          expect(V(audience, s, src).allowed).toBe(true);
        }
      }
      // explicitly: MLS closed_sold + closed_rented that public blocks are allowed here
      expect(V(audience, 'closed_sold', 'mls').allowed).toBe(true);
      expect(V(audience, 'closed_rented', 'mls', 'rental').allowed).toBe(true);
      expect(V(audience, 'expired', 'mls').allowed).toBe(true);
      expect(V(audience, 'withdrawn', 'mls').allowed).toBe(true);
    });
  }

  it('client (portal/report) is allowed (agent-curated, labeled)', () => {
    expect(V('client', 'closed_sold', 'mls').allowed).toBe(true);
    expect(V('client', 'closed_rented', 'mls', 'rental').allowed).toBe(true);
  });
});

describe('labels — sold ≠ rented, source/status/transaction/attribution', () => {
  it('closed rows require source + status + transaction labels', () => {
    const d = V('agent', 'closed_sold', 'mls');
    expect(d.requiresSourceLabel).toBe(true);
    expect(d.requiresStatusLabel).toBe(true);
    expect(d.requiresTransactionLabel).toBe(true); // sold vs rented — never collapsed
  });

  it('MLS-sourced rows require attribution; ACRIS public-record does not', () => {
    expect(V('agent', 'closed_sold', 'mls').requiresAttribution).toBe(true);
    expect(V('public', 'closed_sold', 'acris').requiresAttribution).toBe(false);
  });

  it('blocked decisions carry no label requirements', () => {
    const blocked = V('public', 'closed_sold', 'mls');
    expect(blocked.allowed).toBe(false);
    expect(blocked.requiresSourceLabel).toBe(false);
  });
});

describe('toLifecycleStatus — provider StandardStatus → lifecycle (sold ≠ rented)', () => {
  it('keeps closed sold and closed rented distinct via transaction type', () => {
    expect(toLifecycleStatus('Closed', 'sale')).toBe('closed_sold');
    expect(toLifecycleStatus('Closed', 'rental')).toBe('closed_rented');
    expect(toLifecycleStatus('Sold', 'sale')).toBe('closed_sold');
    expect(toLifecycleStatus('Leased', 'rental')).toBe('closed_rented');
    expect(toLifecycleStatus('Rented', 'rental')).toBe('closed_rented');
  });

  it('maps the active family and off-market statuses', () => {
    expect(toLifecycleStatus('Active', 'sale')).toBe('active');
    expect(toLifecycleStatus('Coming Soon', 'sale')).toBe('active');
    expect(toLifecycleStatus('Active Under Contract', 'sale')).toBe('pending');
    expect(toLifecycleStatus('Pending', 'sale')).toBe('pending');
    expect(toLifecycleStatus('Hold', 'sale')).toBe('temp_off_market');
    expect(toLifecycleStatus('Withdrawn', 'sale')).toBe('withdrawn');
    expect(toLifecycleStatus('Cancelled', 'sale')).toBe('canceled');
    expect(toLifecycleStatus('Expired', 'sale')).toBe('expired');
  });
});
