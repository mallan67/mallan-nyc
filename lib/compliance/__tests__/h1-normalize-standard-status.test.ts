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
 * The tests below enforce the documented behavior:
 *   - Empty / null / non-string → "Active"
 *   - Exact-case canonical hit → returned as-is
 *   - Case-fold + trim match → canonical form
 *   - Known alias (canceled → Cancelled) → canonical form
 *   - Unknown values preserved (not silently rewritten to a known status)
 */

import {
  normalizeStandardStatus,
  TERMINAL_STATUSES,
} from '../../idx/trestle-mapper';

describe('normalizeStandardStatus — empty / non-string fallback', () => {
  it('null → "Active"', () => {
    expect(normalizeStandardStatus(null)).toBe('Active');
  });
  it('undefined → "Active"', () => {
    expect(normalizeStandardStatus(undefined)).toBe('Active');
  });
  it('empty string → "Active"', () => {
    expect(normalizeStandardStatus('')).toBe('Active');
  });
  it('whitespace-only string → "Active"', () => {
    expect(normalizeStandardStatus('   ')).toBe('Active');
  });
  it('non-string (number) → "Active"', () => {
    expect(normalizeStandardStatus(42 as unknown as string)).toBe('Active');
  });
  it('non-string (object) → "Active"', () => {
    expect(normalizeStandardStatus({} as unknown as string)).toBe('Active');
  });
});

describe('normalizeStandardStatus — exact-case canonical pass-through', () => {
  // DERIVED from the canonical set, not hand-listed. The 7-element literal this
  // replaces omitted 'Canceled' once it joined TERMINAL_STATUSES, so the ONE
  // pass-through case that actually mattered — the provider's own spelling
  // surviving the normalizer verbatim — was never asserted here.
  it.each([...TERMINAL_STATUSES])('terminal canonical %s passes through unchanged', (status) => {
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
    ['cancelled', 'Cancelled'],
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

describe('normalizeStandardStatus — Canceled / Cancelled, corrected 2026-08-19', () => {
  // WHAT CHANGED AND WHY.
  //
  // This block used to assert `normalizeStandardStatus('Canceled') === 'Cancelled'`
  // and described single-L 'Canceled' as a "US English" spelling of a "RESO
  // canonical double-L". That was backwards, and the assertion pinned a defect.
  //
  // LIVE PROBE, api.cotality.com/trestle, 2026-08-19 (raw + sha256 in
  // .cache/cotality-authority-m2/raw/, index in PROBE-STATUS.json):
  //   GET /odata/Property/$count?$filter=StandardStatus eq 'Canceled'
  //     -> HTTP 200, @odata.count 0        (a real enumeration member)
  //   GET /odata/Property/$count?$filter=StandardStatus eq 'Cancelled'
  //     -> HTTP 400, "The string 'Cancelled' is not a valid enumeration type
  //        constant."                       (NOT a provider value at all)
  //
  // So single-L IS the provider spelling and double-L is Mallan-internal. The
  // old behaviour rewrote a real provider value into a string the provider
  // rejects, and `mapTrestleToPrisma` stores `raw.StandardStatus` verbatim, so
  // the two write paths disagreed about how a Canceled row is spelled in
  // `listings.status`.
  //
  // CORRECTED CONTRACT — provider provenance in, CRM canonical out:
  //   exact-case 'Canceled'  (what the feed sends)  -> preserved verbatim
  //   lower/upper 'canceled' (what a CRM form sends) -> folded to 'Cancelled',
  //                                                    the CRM canonical value
  //                                                    (lib/crm/status-mapping.ts)
  // Both spellings are members of TERMINAL_STATUSES, so no route the value
  // takes can slip past a display or retention gate.
  it("'Canceled' (the LIVE provider member) is preserved verbatim", () => {
    expect(normalizeStandardStatus('Canceled')).toBe('Canceled');
    // ...and it still binds the terminal guard, which is the point.
    expect(TERMINAL_STATUSES.has(normalizeStandardStatus('Canceled'))).toBe(true);
  });
  it("'canceled' (lower-case CRM input) folds to the CRM canonical 'Cancelled'", () => {
    expect(normalizeStandardStatus('canceled')).toBe('Cancelled');
    expect(TERMINAL_STATUSES.has('Cancelled')).toBe(true);
  });
  it("'CANCELED' (upper-case CRM input) folds to the CRM canonical 'Cancelled'", () => {
    expect(normalizeStandardStatus('CANCELED')).toBe('Cancelled');
  });
  it('BOTH spellings are terminal — neither can slip past a gate', () => {
    expect(TERMINAL_STATUSES.has('Canceled')).toBe(true);
    expect(TERMINAL_STATUSES.has('Cancelled')).toBe(true);
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
  // an exact-case status set: `['Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled']`.
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
    'cancelled',
    'canceled', // US single-L alias
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
      status: canonical,
      idx_display_yn: !TERMINAL_STATUSES.has(canonical),
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

  it('body.status = "Canceled" (the live provider spelling) → stored VERBATIM, idx_display_yn=false', () => {
    // Corrected 2026-08-19 — see the "Canceled / Cancelled" describe block
    // above. The provider's own spelling must reach the DB unaltered; what
    // matters for compliance is that the guard still fires, and it does.
    expect(writerPipeline('Canceled')).toEqual({
      status: 'Canceled',
      idx_display_yn: false,
    });
  });

  it('body.status = "canceled" (lower-case CRM input) → stored as the CRM canonical, idx_display_yn=false', () => {
    expect(writerPipeline('canceled')).toEqual({
      status: 'Cancelled',
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

  it('body.status = null → row stored as Active, idx_display_yn=true (default eligible)', () => {
    expect(writerPipeline(null)).toEqual({
      status: 'Active',
      idx_display_yn: true,
    });
  });
});
