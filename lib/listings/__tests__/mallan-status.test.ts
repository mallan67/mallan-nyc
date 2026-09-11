/**
 * The status domains (owner ruling, Maya 2026-09-08 evening):
 *
 *   Cotality StandardStatus = exact live members only (dated pull)
 *   Mallan storage status   = THE SAME ELEVEN TOKENS, verbatim (one-L Canceled) — never a Mallan word
 *   legacy spellings        = read-compatible only ('Draft' / 'Sold' / 'Rented' / 'Leased' / 'Cancelled' → token)
 *   provider representation = the stored token itself
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
  LEGACY_STORAGE_ALIASES,
  TERMINAL_STATUS_FILTER_VALUES,
  mallanStatusFromCotality,
  cotalityStandardStatusForMallan,
  mallanStorageStatusesForCotality,
  normalizeStoredStatus,
  storageStatusesFor,
} from '../mallan-status';

const pull = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')) as { enums: Record<string, string[]> };

describe('Cotality StandardStatus = the dated live pull, nothing else', () => {
  it('the live-contract members are exactly the pulled members', () => {
    expect([...COTALITY_STANDARD_STATUS_MEMBERS].sort()).toEqual([...pull.enums.StandardStatus].sort());
    expect(COTALITY_STANDARD_STATUS_MEMBERS.length).toBe(11);
  });
  it('the storage vocabulary IS the live vocabulary: no Mallan-only status exists any more', () => {
    expect([...MALLAN_STORAGE_STATUSES].sort()).toEqual([...COTALITY_STANDARD_STATUS_MEMBERS].sort());
    expect(MALLAN_ONLY_STATUSES).toEqual([]);
    expect(MALLAN_STORAGE_STATUSES).toContain('Canceled');
    for (const legacy of ['Draft', 'Sold', 'Rented', 'Leased', 'Cancelled']) {
      expect(isCotalityStandardStatus(legacy)).toBe(false);
      expect(MALLAN_STORAGE_STATUSES as readonly string[]).not.toContain(legacy);
    }
  });
});

describe('provider → storage', () => {
  it('every live member is stored verbatim (one-L Canceled included)', () => {
    expect([...COTALITY_STATUS_COVERAGE].sort()).toEqual([...COTALITY_STANDARD_STATUS_MEMBERS].sort());
    for (const live of COTALITY_STANDARD_STATUS_MEMBERS) expect(mallanStatusFromCotality(live)).toBe(live);
  });
  it('anything that is not a live member is refused (null), never defaulted', () => {
    for (const bad of ['Sold', 'Rented', 'Cancelled', 'Draft', 'active', 'ACTIVE', '', null, undefined, 42, 'OffMarket']) {
      expect(mallanStatusFromCotality(bad)).toBeNull();
    }
  });
});

describe('legacy spellings are read-compatible, never written', () => {
  it('each legacy spelling resolves to its provider token; a token resolves to itself; garbage to null', () => {
    expect(LEGACY_STORAGE_ALIASES).toEqual({ Draft: 'Incomplete', Sold: 'Closed', Rented: 'Closed', Leased: 'Closed', Cancelled: 'Canceled' });
    for (const [legacy, token] of Object.entries(LEGACY_STORAGE_ALIASES)) expect(normalizeStoredStatus(legacy)).toBe(token);
    for (const token of MALLAN_STORAGE_STATUSES) expect(normalizeStoredStatus(token)).toBe(token);
    expect(normalizeStoredStatus('closed')).toBe('Closed');
    expect(normalizeStoredStatus('cancelled')).toBe('Canceled');
    for (const bad of ['OffMarket', 'Delisted', '', null, 42]) expect(normalizeStoredStatus(bad)).toBeNull();
  });
  it('the provider representation of a stored value is its token (legacy spellings resolved)', () => {
    for (const s of MALLAN_STORAGE_STATUSES) expect(cotalityStandardStatusForMallan(s)).toBe(s);
    expect(cotalityStandardStatusForMallan('Sold')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Rented')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Leased')).toBe('Closed');
    expect(cotalityStandardStatusForMallan('Cancelled')).toBe('Canceled');
    expect(cotalityStandardStatusForMallan('Draft')).toBe('Incomplete');
    expect(cotalityStandardStatusForMallan('NotAStatus')).toBeNull();
  });
  it('a DB filter on a live criterion covers the token and its legacy spellings until the correction plan runs', () => {
    expect(mallanStorageStatusesForCotality(['Closed']).sort()).toEqual(['Closed', 'Leased', 'Rented', 'Sold']);
    expect(mallanStorageStatusesForCotality(['Canceled']).sort()).toEqual(['Canceled', 'Cancelled']);
    expect(mallanStorageStatusesForCotality(['Incomplete']).sort()).toEqual(['Draft', 'Incomplete']);
    expect(mallanStorageStatusesForCotality(['Active'])).toEqual(['Active']);
    expect(mallanStorageStatusesForCotality(['Delete'])).toEqual(['Delete']);
    expect(storageStatusesFor(['Closed', 'Withdrawn'])).toEqual(['Closed', 'Sold', 'Rented', 'Leased', 'Withdrawn']);
    expect(TERMINAL_STATUS_FILTER_VALUES).toEqual(['Closed', 'Sold', 'Rented', 'Leased', 'Withdrawn', 'Expired', 'Canceled', 'Cancelled', 'Delete']);
  });
});

describe('the storage sets partition the vocabulary', () => {
  it('terminal / active / lifecycle are disjoint and cover every storage status', () => {
    expect([...MALLAN_TERMINAL_STATUSES].sort()).toEqual(['Canceled', 'Closed', 'Delete', 'Expired', 'Withdrawn']);
    const all = new Set<string>([...MALLAN_TERMINAL_STATUSES, ...MALLAN_ACTIVE_STATUSES, ...MALLAN_LIFECYCLE_STATUSES]);
    expect([...all].sort()).toEqual([...MALLAN_STORAGE_STATUSES].sort());
    for (const s of MALLAN_TERMINAL_STATUSES) { expect(MALLAN_ACTIVE_STATUSES.has(s)).toBe(false); expect(MALLAN_LIFECYCLE_STATUSES.has(s)).toBe(false); }
    for (const s of MALLAN_ACTIVE_STATUSES) expect(MALLAN_LIFECYCLE_STATUSES.has(s)).toBe(false);
  });
});
