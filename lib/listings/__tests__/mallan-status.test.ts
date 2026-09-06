/**
 * The three status domains stay apart (Packet 2 closure, round 3).
 *
 *   Cotality StandardStatus = exact live members only (dated pull)
 *   Mallan storage status   = Mallan's own vocabulary (may hold Mallan-only values)
 *   provider representation = a VERIFIED live member or nothing
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { COTALITY_STANDARD_STATUS_MEMBERS, isCotalityStandardStatus } from '@/lib/cotality/live-contract';
import {
  MALLAN_STORAGE_STATUSES,
  MALLAN_ONLY_STATUSES,
  MALLAN_TERMINAL_STATUSES,
  MALLAN_ACTIVE_STATUSES,
  MALLAN_LIFECYCLE_STATUSES,
  COTALITY_STATUS_COVERAGE,
  mallanStatusFromCotality,
  cotalityStandardStatusForMallan,
  mallanStorageStatusesForCotality,
} from '../mallan-status';

const pull = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')) as { enums: Record<string, string[]> };

describe('Cotality StandardStatus = the dated live pull, nothing else', () => {
  it('the live-contract members are exactly the pulled members', () => {
    expect([...COTALITY_STANDARD_STATUS_MEMBERS].sort()).toEqual([...pull.enums.StandardStatus].sort());
    expect(COTALITY_STANDARD_STATUS_MEMBERS.length).toBe(11);
  });
  it('Mallan-only statuses are NOT live members', () => {
    for (const s of ['Draft', 'Sold', 'Rented', 'Leased', 'Cancelled']) {
      expect(isCotalityStandardStatus(s)).toBe(false);
      expect(MALLAN_ONLY_STATUSES).toContain(s);
    }
  });
});

describe('provider → Mallan storage', () => {
  it('every live member has a Mallan storage counterpart, exact except the established Cancelled spelling', () => {
    expect([...COTALITY_STATUS_COVERAGE].sort()).toEqual([...COTALITY_STANDARD_STATUS_MEMBERS].sort());
    for (const live of COTALITY_STANDARD_STATUS_MEMBERS) {
      const m = mallanStatusFromCotality(live);
      expect(m).not.toBeNull();
      expect(MALLAN_STORAGE_STATUSES).toContain(m);
      expect(m).toBe(live === 'Canceled' ? 'Cancelled' : live);
    }
  });
  it('anything that is not a live member is refused (null), never defaulted', () => {
    for (const bad of ['Sold', 'Rented', 'Cancelled', 'active', 'ACTIVE', '', null, undefined, 42, 'OffMarket']) {
      expect(mallanStatusFromCotality(bad)).toBeNull();
    }
  });
});

describe('Mallan storage → provider representation (only where verified)', () => {
  it('every emitted representation is an exact live member', () => {
    for (const s of MALLAN_STORAGE_STATUSES) {
      const rep = cotalityStandardStatusForMallan(s);
      if (rep !== null) expect(isCotalityStandardStatus(rep)).toBe(true);
    }
  });
  it('closed sales and closed rentals are represented as the live Closed (verified live 2026-09-06)', () => {
    expect(cotalityStandardStatusForMallan('Sold')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Rented')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Leased')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Cancelled')).toBe('Canceled');
  });
  it('a Mallan stage with no verified provider counterpart has NO representation', () => {
    expect(cotalityStandardStatusForMallan('Draft')).toBeNull();
    expect(cotalityStandardStatusForMallan('NotAStatus')).toBeNull();
  });
  it('Mallan-only values are never returned as a provider representation', () => {
    for (const s of MALLAN_STORAGE_STATUSES) {
      const rep = cotalityStandardStatusForMallan(s);
      expect(MALLAN_ONLY_STATUSES.includes(rep as string)).toBe(false);
    }
  });
  it('the inverse covers every Mallan storage value a live criterion reaches', () => {
    expect(mallanStorageStatusesForCotality(['Closed']).sort()).toEqual(['Closed', 'Leased', 'Rented', 'Sold']);
    expect(mallanStorageStatusesForCotality(['Canceled'])).toEqual(['Cancelled']);
    expect(mallanStorageStatusesForCotality(['Active'])).toEqual(['Active']);
    expect(mallanStorageStatusesForCotality(['Delete'])).toEqual(['Delete']);
  });
});

describe('the Mallan storage sets partition the vocabulary', () => {
  it('terminal / active / lifecycle are disjoint and cover every storage status', () => {
    const all = new Set<string>([...MALLAN_TERMINAL_STATUSES, ...MALLAN_ACTIVE_STATUSES, ...MALLAN_LIFECYCLE_STATUSES]);
    expect([...all].sort()).toEqual([...MALLAN_STORAGE_STATUSES].sort());
    for (const s of MALLAN_TERMINAL_STATUSES) { expect(MALLAN_ACTIVE_STATUSES.has(s)).toBe(false); expect(MALLAN_LIFECYCLE_STATUSES.has(s)).toBe(false); }
    for (const s of MALLAN_ACTIVE_STATUSES) expect(MALLAN_LIFECYCLE_STATUSES.has(s)).toBe(false);
  });
});
