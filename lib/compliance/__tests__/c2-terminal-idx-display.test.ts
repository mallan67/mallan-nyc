/**
 * C2 fix (2026-05-13) — status-aware idx_display_yn in the Trestle writer.
 *
 * Before this fix, `lib/idx/trestle-mapper.ts:724` computed
 * `idxDisplayYn = internetEntireListing && !participantOnly && !ownerOptOut`
 * without consulting `StandardStatus`. Every time Trestle re-emitted a
 * terminal row (price update, photo edit, ModificationTimestamp tick), the
 * next idx-sync pass set `idx_display_yn = true` again and undid the
 * 03:00 UTC data-retention cron's §2.05 §2.05 cleanup. Audit-event JOIN
 * proved 15 of 21 current violators were cron-disabled then sync-re-enabled.
 *
 * The fix forces `idx_display_yn=false` for any terminal `StandardStatus`,
 * mirroring the cron predicate at `app/api/cron/data-retention/route.ts:79`.
 *
 * Locks in:
 *   - All 7 terminal statuses force false even when display permissions allow.
 *   - All 3 non-terminal statuses (Active, ComingSoon, ActiveUnderContract)
 *     stay eligible when permissions allow.
 *   - Explicit `InternetEntireListingDisplayYN=false` still forces false
 *     regardless of status.
 *   - Permission='Private' (participant-only) still forces false.
 *   - Permission='OwnerOptOut' / 'Owner Opt-Out' still forces false.
 *   - Regression: a closed row with all-true permissions cannot be
 *     re-flipped to true by the mapper's output.
 *
 * Touchpoint constant is exported from `lib/idx/trestle-mapper.ts` so this
 * test (and any future caller that needs the same predicate) shares the
 * single source of truth — adding a status to the writer's set must
 * automatically expand the cron's effective scope via this same import.
 */

import { mapTrestleToPrisma, TERMINAL_STATUSES } from '../../idx/trestle-mapper';

const REQUIRED_MIN_FIELDS: Record<string, unknown> = {
  ListingId: 'RLS20000001',
  ListingKey: 'RLS20000001',
  PropertyType: 'Residential',
  ListPrice: 1000000,
  StreetName: '57th',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
  ListAgentMlsId: '74001',
  ListOfficeName: 'Compass',
  ModificationTimestamp: '2026-05-13T09:00:00Z',
};

function buildRaw(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...REQUIRED_MIN_FIELDS, ...overrides };
}

describe('C2 — TERMINAL_STATUSES constant', () => {
  it('contains exactly the 8 statuses the cron also targets', () => {
    // 8, not 7: BOTH spellings of canceled. `Canceled` (one L) is the live
    // Cotality value the Trestle sync writes raw into listings.status;
    // `Cancelled` (two Ls) is a value Mallan invented and the CRM write path
    // stored. Real rows carry both and no backfill is in scope, so a terminal
    // set that knows one spelling silently misses half the population.
    expect(TERMINAL_STATUSES.size).toBe(8);
    expect(TERMINAL_STATUSES.has('Closed')).toBe(true);
    expect(TERMINAL_STATUSES.has('Sold')).toBe(true);
    expect(TERMINAL_STATUSES.has('Leased')).toBe(true);
    expect(TERMINAL_STATUSES.has('Rented')).toBe(true);
    expect(TERMINAL_STATUSES.has('Withdrawn')).toBe(true);
    expect(TERMINAL_STATUSES.has('Expired')).toBe(true);
    expect(TERMINAL_STATUSES.has('Canceled')).toBe(true);
    expect(TERMINAL_STATUSES.has('Cancelled')).toBe(true);
    // Active variants must NOT be in the terminal set.
    expect(TERMINAL_STATUSES.has('Active')).toBe(false);
    expect(TERMINAL_STATUSES.has('ComingSoon')).toBe(false);
    expect(TERMINAL_STATUSES.has('ActiveUnderContract')).toBe(false);
    // REMOVED: `expect(TERMINAL_STATUSES.has('Canceled')).toBe(false)`, under the
    // comment "Common spelling variant kept distinct — Trestle / REBNY use
    // double-L." That assertion was the defect written down as a test: it pinned
    // the LIVE COTALITY VALUE as non-terminal. Cotality's
    // Property.StandardStatus lookup has "Canceled" — one L — with
    // standardValue "Canceled" and resoStandard true. There is no double-L
    // member. Both spellings are asserted terminal above.
  });
});

describe('C2 — terminal statuses force idx_display_yn=false', () => {
  it.each([
    'Closed',
    'Sold',
    'Leased',
    'Rented',
    'Withdrawn',
    'Expired',
    'Cancelled',
  ])('%s + display permissions all-true → idx_display_yn=false', (status) => {
    const raw = buildRaw({
      StandardStatus: status,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      Permission: 'Public',
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
    // Sanity — the display permission booleans themselves are still TRUE
    // (the writer doesn't lie about Trestle's input); only the legacy
    // `idx_display_yn` aggregate is forced false.
    expect(mapped.internet_entire_listing_display_yn).toBe(true);
    expect(mapped.internet_address_display_yn).toBe(true);
  });

  it('terminal status with null display permissions still forces false', () => {
    // The post-2026-04-30 IDX Plus convention treats null as displayable for
    // these two flags — but that convention applies only to *active* rows.
    // A closed row with null permissions must still go to false because the
    // status itself disqualifies it.
    const raw = buildRaw({
      StandardStatus: 'Closed',
      InternetEntireListingDisplayYN: null,
      InternetAddressDisplayYN: null,
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
  });
});

describe('C2 — non-terminal statuses remain eligible when permissions allow', () => {
  it.each([
    'Active',
    'ComingSoon',
    'ActiveUnderContract',
  ])('%s + display permissions all-true → idx_display_yn=true', (status) => {
    const raw = buildRaw({
      StandardStatus: status,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(true);
  });

  it('Active + IDX Plus null permissions → idx_display_yn=true (writer-side parity with the !== false convention)', () => {
    const raw = buildRaw({
      StandardStatus: 'Active',
      InternetEntireListingDisplayYN: null,
      InternetAddressDisplayYN: null,
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(true);
  });
});

describe('C2 — permission overrides still force idx_display_yn=false', () => {
  it.each([
    'Active',
    'ComingSoon',
    'ActiveUnderContract',
    'Closed',
  ])('%s + InternetEntireListingDisplayYN=false → false', (status) => {
    const raw = buildRaw({
      StandardStatus: status,
      InternetEntireListingDisplayYN: false,
      InternetAddressDisplayYN: true,
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
  });

  it.each(['Active', 'ComingSoon', 'ActiveUnderContract'])(
    '%s + Permission=Private (participant-only) → false',
    (status) => {
      const raw = buildRaw({
        StandardStatus: status,
        InternetEntireListingDisplayYN: true,
        Permission: 'Private',
      });
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.idx_display_yn).toBe(false);
      expect(mapped.participant_only).toBe(true);
    },
  );

  it.each(['Active', 'ComingSoon', 'ActiveUnderContract'])(
    '%s + Permission=OwnerOptOut → false',
    (status) => {
      const raw = buildRaw({
        StandardStatus: status,
        InternetEntireListingDisplayYN: true,
        Permission: 'OwnerOptOut',
      });
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.idx_display_yn).toBe(false);
      expect(mapped.owner_opt_out).toBe(true);
    },
  );

  it.each(['Active', 'ComingSoon', 'ActiveUnderContract'])(
    '%s + Permission="Owner Opt-Out" (display variant) → false',
    (status) => {
      const raw = buildRaw({
        StandardStatus: status,
        InternetEntireListingDisplayYN: true,
        Permission: 'Owner Opt-Out',
      });
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.idx_display_yn).toBe(false);
    },
  );
});

describe('C2 — regression: a closed row cannot be re-flipped true by mapper output', () => {
  it('reproduces the audit-trail scenario from the C2 investigation', () => {
    // Synthesizes the production scenario observed on RLS20070684 etc.:
    //   - The data-retention cron set idx_display_yn=false at 03:00 UTC.
    //   - Trestle then re-emits the same listing later in the day with the
    //     status still Closed but display permissions still true (the
    //     normal post-close state on the IDX Plus feed).
    //   - Pre-fix: mapper recomputed true and the next idx-sync flipped the
    //     row back, undoing the cron's §2.05 cleanup.
    //   - Post-fix: mapper must emit false regardless of permission state.
    const raw = buildRaw({
      ListingId: 'RLS20070684',
      ListingKey: 'RLS20070684',
      StandardStatus: 'Closed',
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      Permission: 'Public',
      ModificationTimestamp: '2026-05-13T09:30:42Z',
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
    expect(mapped.status).toBe('Closed');
  });

  it('Closed row with multiple permission signals all-blocking → false (defence-in-depth)', () => {
    // Even if every per-row signal also says "do not display", the test
    // documents that the terminal-status guard is the FIRST gate. If a
    // future refactor accidentally removes the per-row checks, the status
    // guard alone must still keep terminal rows off IDX.
    const raw = buildRaw({
      StandardStatus: 'Closed',
      InternetEntireListingDisplayYN: false,
      Permission: 'Private',
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
  });
});

describe('C2 — DOM/typo robustness', () => {
  it('unknown StandardStatus → mapper does not force false (no spurious blocking)', () => {
    // A truly-unknown status string (e.g. a vendor-side spelling drift) is
    // NOT in TERMINAL_STATUSES, so the writer falls through to the
    // existing permission gates. Status-aware does not mean status-paranoid:
    // we only short-circuit on the canonical 7. New statuses get added by
    // expanding the set, not by silent fail-closed.
    const raw = buildRaw({
      StandardStatus: 'NotAStatusThatExists',
      InternetEntireListingDisplayYN: true,
      Permission: 'Public',
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(true);
  });

  it('missing StandardStatus → NOT displayable, even when the permission gates allow it', () => {
    // CONTRACT CHANGED 2026-08-27. This asserted idx_display_yn === true: the
    // mapper fabricated `Active` when the provider sent no status, and the gate
    // is a DENY-list on terminal statuses, so a record Cotality said nothing
    // about was published. The mapper now maps an absent status to NULL and the
    // gate requires a real market status.
    //
    // The permission gates are still the reason this record is not blocked for
    // any OTHER reason — what stops it now is the absence of a market status.
    const raw = buildRaw({
      InternetEntireListingDisplayYN: true,
      Permission: 'Public',
    });
    delete (raw as Record<string, unknown>).StandardStatus;
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.status).toBeNull();
    expect(mapped.idx_display_yn).toBe(false);
  });

  it('case-insensitive — "closed" (lowercase) IS canonicalized + blocked under Phase A', () => {
    // Phase A (2026-05-20): the inline gate computation moved into the
    // shared `computeGateColumns` helper, which always runs
    // `normalizeStandardStatus` on its `status` input. That means even the
    // Trestle-sourced mapper path now case-folds "closed" → "Closed" and
    // matches the canonical TERMINAL_STATUSES set — so a hypothetical
    // upstream emit of lowercased "closed" is now correctly blocked at the
    // writer instead of silently passing through.
    //
    // The cron predicate at app/api/cron/data-retention/route.ts:79 still
    // uses Prisma's exact-case `status: { in: [...] }`, so this is a one-
    // sided defensive improvement: the writer is now MORE defensive than
    // the cron. If Trestle ever did emit "closed" (lowercase), the writer
    // would set idx_display_yn=false at ingest time and no cron sweep
    // would be needed. Strictly safer than the previous symmetric-but-
    // permissive contract.
    //
    // The H1 ping-pong scenario fixed by PR #112/#113 (writer re-flips
    // terminal row to displayable on every re-emit) is unaffected — the
    // canonical exact-case "Closed" path is still the dominant case, and
    // this test exists only to document the new lowercased-edge behavior.
    const raw = buildRaw({
      StandardStatus: 'closed',
      InternetEntireListingDisplayYN: true,
    });
    const mapped = mapTrestleToPrisma(raw);
    expect(mapped.idx_display_yn).toBe(false);
  });
});
