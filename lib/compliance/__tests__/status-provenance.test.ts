/// <reference types="jest" />
/**
 * STATUS PROVENANCE classifier — Source vs Value, kept apart.
 *
 * The defect this module answers: `listings.status` carries provider
 * observations AND Mallan-local derivations in one column, on rows whose
 * `last_synced_from_trestle` is read elsewhere as "provider-sourced". The
 * classifier says what can be PROVEN from a stored row and — just as
 * importantly — refuses to guess where nothing can be.
 */
import {
  classifyStatusOrigin,
  DERIVATION_REASON,
  isProviderAssertableStatus,
  STATUS_ORIGIN,
} from '@/lib/compliance/status-provenance';

const SYNCED = new Date('2026-08-01T00:00:00Z');

describe('isProviderAssertableStatus — proven by the 2026-08-19 live probe', () => {
  // STATUS-SPELLING-EXEMPT: provider vocabulary — the HTTP 200 members only.
  // The whole point of this list is that `Canceled` IS assertable while its
  // double-L twin is not; closing it under spelling would destroy the assertion.
  it.each([
    'Active',
    'ActiveUnderContract',
    'Canceled',
    'Closed',
    'ComingSoon',
    'Delete',
    'Expired',
    'Hold',
    'Incomplete',
    'Pending',
    'Withdrawn',
  ])('%s answered HTTP 200 and IS provider-assertable', (s) => {
    expect(isProviderAssertableStatus(s)).toBe(true);
  });

  // STATUS-SPELLING-EXEMPT: provider-REJECTED vocabulary (HTTP 400 list).
  it.each(['Cancelled', 'Sold', 'Rented', 'Leased', 'TemporarilyOffMarket', 'OwnerOptOut', 'Draft'])(
    '%s answered HTTP 400 ("not a valid enumeration type constant") and is NOT provider-assertable',
    (s) => {
      expect(isProviderAssertableStatus(s)).toBe(false);
    },
  );

  it('does not fold case or whitespace — it asks about the string AS STORED', () => {
    // The provider sends exact enum casing. A stored "withdrawn" was not
    // written by copying a provider observation, and saying otherwise would
    // launder a local value into a provider one.
    expect(isProviderAssertableStatus('withdrawn')).toBe(false);
    expect(isProviderAssertableStatus(' Closed ')).toBe(false);
    expect(isProviderAssertableStatus(null)).toBe(false);
    expect(isProviderAssertableStatus(undefined)).toBe(false);
  });
});

describe('classifyStatusOrigin — proof, or an explicit refusal to guess', () => {
  it('Mallan-authored local rows are MALLAN_AUTHORED regardless of status', () => {
    expect(
      classifyStatusOrigin({ listing_id: 'SL-0001', status: 'Active', last_synced_from_trestle: null }),
    ).toBe(STATUS_ORIGIN.MALLAN_AUTHORED);
    expect(
      classifyStatusOrigin({ listing_id: 'RL-0002', status: 'Closed', last_synced_from_trestle: null }),
    ).toBe(STATUS_ORIGIN.MALLAN_AUTHORED);
    // rls_eligible=false is the other authorship marker (website-only inventory).
    expect(
      classifyStatusOrigin({ listing_id: 'RLS123', rls_eligible: false, status: 'Active' }),
    ).toBe(STATUS_ORIGIN.MALLAN_AUTHORED);
  });

  it('a never-synced row is MALLAN_AUTHORED — the provider has no record to have asserted', () => {
    expect(
      classifyStatusOrigin({ listing_id: 'RLS999', status: 'Closed', last_synced_from_trestle: null }),
    ).toBe(STATUS_ORIGIN.MALLAN_AUTHORED);
  });

  it('a feed row carrying a PROVIDER-REJECTED value is PROVABLY a local derivation', () => {
    // No inference: the provider 400s on these strings, so it cannot have sent one.
    // STATUS-SPELLING-EXEMPT: provider-REJECTED values only — the assertion is
    // that these prove a MALLAN_LOCAL_DERIVATION, which `Canceled` cannot.
    for (const s of ['Sold', 'Rented', 'Leased', 'Cancelled', 'Draft']) {
      expect(
        classifyStatusOrigin({ listing_id: 'RLS100', status: s, last_synced_from_trestle: SYNCED }),
      ).toBe(STATUS_ORIGIN.MALLAN_LOCAL_DERIVATION);
    }
  });

  it('a feed row carrying a provider-assertable value is INDETERMINATE, not provider-asserted', () => {
    // THE CORRECTION. `Withdrawn` on a Trestle-sourced row is exactly what the
    // feed-reconcile ghost pass writes AND exactly what a provider observation
    // would look like. The row keeps no discriminator, so the honest verdict is
    // "cannot tell" — the status quo silently read these as provider truth.
    expect(
      classifyStatusOrigin({ listing_id: 'RLS100', status: 'Withdrawn', last_synced_from_trestle: SYNCED }),
    ).toBe(STATUS_ORIGIN.INDETERMINATE);
    expect(
      classifyStatusOrigin({ listing_id: 'RLS100', status: 'Closed', last_synced_from_trestle: SYNCED }),
    ).toBe(STATUS_ORIGIN.INDETERMINATE);
  });

  it('NEVER returns PROVIDER_ASSERTED from a stored row alone', () => {
    // That verdict requires having actually read the provider, so only a WRITER
    // that did so may record it (feed-reconcile writes it into the audit event).
    const rows = [
      { listing_id: 'SL-1', status: 'Active' },
      { listing_id: 'RLS-1', status: 'Closed', last_synced_from_trestle: SYNCED },
      { listing_id: 'RLS-2', status: 'Sold', last_synced_from_trestle: SYNCED },
      { listing_id: 'RLS-3', status: 'Withdrawn', last_synced_from_trestle: null },
    ];
    for (const r of rows) {
      expect(classifyStatusOrigin(r)).not.toBe(STATUS_ORIGIN.PROVIDER_ASSERTED);
    }
  });

  it('exposes a derivation reason vocabulary so "derived" is never recorded bare', () => {
    expect(DERIVATION_REASON.ABSENT_FROM_LICENSED_FEED).toBe('absent_from_licensed_live_feed');
    expect(Object.values(DERIVATION_REASON).every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
  });
});
