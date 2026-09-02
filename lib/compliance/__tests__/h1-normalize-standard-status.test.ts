/**
 * H1 amend (2026-05-13) — `normalizeStandardStatus` closes the case-folding
 * gap Maya raised on PR #113.
 *
 * Pre-amend: `app/api/idx/ensure-listing` stored body.status verbatim and
 * the terminal-status guard checked case-sensitive membership in
 * TERMINAL_STATUSES. A client sending `body.status = "closed"` would
 * therefore (1) bypass the guard (idx_display_yn stayed `true`) AND (2)
 * create a row with `status = "closed"` that is invisible to every exact-
 * case predicate downstream — the data-retention cron, the ops:health
 * §2.05 query, and the public `DISPLAYABLE_STATUSES` filter all use the
 * canonical `'Closed'` spelling.
 *
 * Post-amend: `normalizeStandardStatus(body.status)` is called once at the
 * route boundary, the canonical result is used for BOTH the DB write and
 * the guard, and every downstream exact-case predicate sees the same
 * canonical value.
 *
 * CONTRACT AMENDED 2026-08-27 (nullable `listings.status`): absent input no
 * longer normalizes to "Active". That fallback was an inherited default, not a
 * decision, and it was unreachable from real rows while the column was
 * `NOT NULL DEFAULT 'Active'`. Making the column nullable made it reachable and
 * fail-OPEN — `ensure-listing` writes the normalized value AND derives
 * `idx_display_yn` from it, so a request omitting the status would have created
 * a publicly displayable row asserting a market status the provider never sent.
 * Absent input now normalizes to the empty string: a member of no status set, so
 * every allow-list gate downstream fails closed. Full rationale and the
 * behavioural proof live in
 * `tests/runtime/absent-status-never-becomes-active.test.ts`.
 *
 * The tests below enforce the documented behavior:
 *   - Empty / null / non-string → "" (fails closed, never "Active")
 *   - Exact-case canonical hit → returned as-is
 *   - Case-fold + trim match → canonical form
 *   - Known alias (Cancelled → Canceled) → provider spelling
 *   - Unknown values preserved (not silently rewritten to a known status)
 */

import {
  normalizeStandardStatus,
  TERMINAL_STATUSES,
} from '../../idx/trestle-mapper';

describe('normalizeStandardStatus — empty / non-string fallback fails CLOSED', () => {
  it('null → "" (not "Active")', () => {
    expect(normalizeStandardStatus(null)).toBe('');
  });
  it('undefined → ""', () => {
    expect(normalizeStandardStatus(undefined)).toBe('');
  });
  it('empty string → ""', () => {
    expect(normalizeStandardStatus('')).toBe('');
  });
  it('whitespace-only string → ""', () => {
    expect(normalizeStandardStatus('   ')).toBe('');
  });
  it('non-string (number) → ""', () => {
    expect(normalizeStandardStatus(42 as unknown as string)).toBe('');
  });
  it('non-string (object) → ""', () => {
    expect(normalizeStandardStatus({} as unknown as string)).toBe('');
  });
  it('and the result is in no status set, so every allow-list gate closes', () => {
    // The reason the empty string is the right token rather than a thrown
    // error: no caller has to change, and none of them can accidentally
    // treat it as on-market.
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus(null))).toBe(false);
  });
});

describe('normalizeStandardStatus — exact-case canonical pass-through', () => {
  it.each([
    'Closed',
    'Sold',
    'Leased',
    'Rented',
    'Withdrawn',
    'Expired',
    // `Canceled` — one L — is the live Cotality value, so it is the one that
    // passes through untouched. `Cancelled` is in TERMINAL_STATUSES too (real
    // rows carry it, no backfill in scope) but it is REWRITTEN, not passed
    // through; its case is in the alias block below.
    'Canceled',
  ])('terminal canonical %s passes through unchanged', (status) => {
    expect(normalizeStandardStatus(status)).toBe(status);
  });

  it.each([
    'Active',
    'ComingSoon',
    'ActiveUnderContract',
    'Draft',
    'Incomplete',
    'Pending',
  ])('non-terminal canonical %s passes through unchanged', (status) => {
    expect(normalizeStandardStatus(status)).toBe(status);
  });
});

describe('normalizeStandardStatus — case-fold + trim variants', () => {
  it('"closed" (lowercase) → "Closed"', () => {
    expect(normalizeStandardStatus('closed')).toBe('Closed');
  });
  it('"CLOSED" (uppercase) → "Closed"', () => {
    expect(normalizeStandardStatus('CLOSED')).toBe('Closed');
  });
  it('"Closed " (trailing space) → "Closed"', () => {
    expect(normalizeStandardStatus('Closed ')).toBe('Closed');
  });
  it('" Closed" (leading space) → "Closed"', () => {
    expect(normalizeStandardStatus(' Closed')).toBe('Closed');
  });
  it('"  closed  " (both sides + lowercase) → "Closed"', () => {
    expect(normalizeStandardStatus('  closed  ')).toBe('Closed');
  });
  it.each([
    ['sold', 'Sold'],
    ['leased', 'Leased'],
    ['rented', 'Rented'],
    ['withdrawn', 'Withdrawn'],
    ['expired', 'Expired'],
    ['canceled', 'Canceled'],
  ])('"%s" → "%s" (case-fold to canonical)', (input, expected) => {
    expect(normalizeStandardStatus(input)).toBe(expected);
  });
  it('"ACTIVE" → "Active"', () => {
    expect(normalizeStandardStatus('ACTIVE')).toBe('Active');
  });
  it('"comingsoon" → "ComingSoon"', () => {
    expect(normalizeStandardStatus('comingsoon')).toBe('ComingSoon');
  });
  it('"activeundercontract" → "ActiveUnderContract"', () => {
    expect(normalizeStandardStatus('activeundercontract')).toBe('ActiveUnderContract');
  });
});

describe('normalizeStandardStatus — known alias mapping', () => {
  // THIS BLOCK USED TO ASSERT THE OPPOSITE, AND IT WAS WRONG ABOUT THE PROVIDER.
  //
  // It read '"Canceled" (US single-L) → "Cancelled" (RESO canonical double-L)'
  // and pinned the normalizer to rewrite the provider's real value into one
  // Cotality does not have. `Canceled` — one L — IS the live Cotality
  // Property.StandardStatus value (standardValue "Canceled", legacyODataValue
  // "Canceled", resoStandard true). `Cancelled` is Mallan's invention.
  //
  // The alias now points at the provider. See
  // tests/runtime/status-vocabulary-cotality-binding.test.ts for the evidence
  // and for the no-backfill invariant that keeps legacy rows gating correctly.
  it('"Cancelled" (Mallan invention) → "Canceled" (live Cotality value)', () => {
    expect(normalizeStandardStatus('Cancelled')).toBe('Canceled');
    // And the result IS in TERMINAL_STATUSES, so the guard binds.
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus('Cancelled'))).toBe(true);
  });
  it('"cancelled" (lowercase) → "Canceled"', () => {
    expect(normalizeStandardStatus('cancelled')).toBe('Canceled');
  });
  it('"CANCELLED" (uppercase) → "Canceled"', () => {
    expect(normalizeStandardStatus('CANCELLED')).toBe('Canceled');
  });
  it('the legacy spelling still gates as terminal — rows are NOT backfilled', () => {
    expect(TERMINAL_STATUSES.has('Cancelled')).toBe(true);
    expect(TERMINAL_STATUSES.has('Canceled')).toBe(true);
  });
});

describe('normalizeStandardStatus — unknown values preserved', () => {
  it('unknown status string is NOT silently coerced to a known value', () => {
    // A new RESO status that has not yet been added to the known sets
    // must round-trip verbatim (trimmed). The normalizer never silently
    // promotes an unknown string into a terminal value — that would be
    // worse than the original gap.
    expect(normalizeStandardStatus('NotAStatusThatExists')).toBe('NotAStatusThatExists');
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus('NotAStatusThatExists'))).toBe(false);
  });
  it('unknown status with whitespace is trimmed but not coerced', () => {
    expect(normalizeStandardStatus('  Foobar  ')).toBe('Foobar');
  });
  it('"closeded" (typo, not in any set) is preserved verbatim', () => {
    expect(normalizeStandardStatus('closeded')).toBe('closeded');
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus('closeded'))).toBe(false);
  });
});

describe('normalizeStandardStatus — Active variants remain eligible', () => {
  it.each([
    'Active',
    'active',
    'ACTIVE',
    'Active ',
    ' Active',
    '  active  ',
  ])('"%s" normalizes to Active (eligible, non-terminal)', (input) => {
    const result = normalizeStandardStatus(input);
    expect(result).toBe('Active');
    expect(TERMINAL_STATUSES.has(result)).toBe(false);
  });

  it.each([
    'ComingSoon',
    'comingsoon',
    'COMINGSOON',
    'ComingSoon ',
  ])('"%s" normalizes to ComingSoon (eligible, non-terminal)', (input) => {
    const result = normalizeStandardStatus(input);
    expect(result).toBe('ComingSoon');
    expect(TERMINAL_STATUSES.has(result)).toBe(false);
  });

  it.each([
    'ActiveUnderContract',
    'activeundercontract',
    'ACTIVEUNDERCONTRACT',
    'ActiveUnderContract ',
  ])('"%s" normalizes to ActiveUnderContract (eligible, non-terminal)', (input) => {
    const result = normalizeStandardStatus(input);
    expect(result).toBe('ActiveUnderContract');
    expect(TERMINAL_STATUSES.has(result)).toBe(false);
  });
});

describe('normalizeStandardStatus — cron/ops parity (canonical storage)', () => {
  // The data-retention cron at app/api/cron/data-retention/route.ts:79 uses
  // an exact-case status set: `['Closed','Sold','Leased','Rented','Withdrawn','Expired','Canceled','Cancelled']`.
  // ops:health's §2.05 query at scripts/ops-health.js:152 uses the same.
  // Both miss any row stored with a non-canonical status. The normalizer
  // guarantees that rows born through any of the 4 patched writer paths
  // carry exact-case canonical statuses, so the cron and ops:health see
  // them and can act.

  it.each([
    'closed',
    'CLOSED',
    'Closed ',
    'sold',
    'SOLD',
    'leased',
    'rented',
    'withdrawn',
    'expired',
    'canceled',  // the live Cotality value
    'cancelled', // the legacy Mallan spelling, still on real rows
  ])('"%s" stores as exact-case canonical that cron will see', (input) => {
    const stored = normalizeStandardStatus(input);
    expect(TERMINAL_STATUSES.has(stored)).toBe(true);
  });
});

describe('integration — normalize + guard combination (the actual writer path)', () => {
  // Simulates what every patched writer does:
  //   const canonical = normalizeStandardStatus(body.status);
  //   row.status = canonical;
  //   row.idx_display_yn = !TERMINAL_STATUSES.has(canonical) && /* other gates */;
  const writerPipeline = (rawStatus: unknown) => {
    const canonical = normalizeStandardStatus(rawStatus);
    return {
      // Mirrors app/api/idx/ensure-listing/route.ts exactly, including the
      // empty-token checks the nullable column made reachable.
      status: canonical || null,
      idx_display_yn: canonical !== '' && !TERMINAL_STATUSES.has(canonical),
    };
  };

  it('body.status = "closed" → row stored as Closed, idx_display_yn=false', () => {
    expect(writerPipeline('closed')).toEqual({
      status: 'Closed',
      idx_display_yn: false,
    });
  });

  it('body.status = "Closed " → row stored as Closed, idx_display_yn=false', () => {
    expect(writerPipeline('Closed ')).toEqual({
      status: 'Closed',
      idx_display_yn: false,
    });
  });

  it('body.status = "CLOSED" → row stored as Closed, idx_display_yn=false', () => {
    expect(writerPipeline('CLOSED')).toEqual({
      status: 'Closed',
      idx_display_yn: false,
    });
  });

  it('body.status = "Cancelled" (legacy) → row stored as Canceled, idx_display_yn=false', () => {
    expect(writerPipeline('Cancelled')).toEqual({
      status: 'Canceled',
      idx_display_yn: false,
    });
  });

  it('body.status = "Active " → row stored as Active, idx_display_yn=true', () => {
    expect(writerPipeline('Active ')).toEqual({
      status: 'Active',
      idx_display_yn: true,
    });
  });

  it('body.status = "NotAStatus" → row stored as NotAStatus, idx_display_yn=true (no false terminal coercion)', () => {
    expect(writerPipeline('NotAStatus')).toEqual({
      status: 'NotAStatus',
      idx_display_yn: true,
    });
  });

  it('body.status = null → row stored as NULL, idx_display_yn=false (fails closed)', () => {
    // Was: stored as Active, idx_display_yn=true. That published a market
    // claim the provider never made. See the contract note at the top.
    expect(writerPipeline(null)).toEqual({
      status: null,
      idx_display_yn: false,
    });
  });
});
