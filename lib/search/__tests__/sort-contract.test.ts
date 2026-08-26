/// <reference types="jest" />
/**
 * SORT IS PART OF RESULT IDENTITY, SO IT IS A CLOSED CONTRACT.
 *
 * The route took whatever `sort` a caller sent and handed it to the provider as
 * `$orderby`, falling back to `"ModificationTimestamp desc"` when it did not
 * recognise the value — which was always, because it never looked.
 *
 * Three separate problems, all live:
 *
 * 1. A RAW PROVIDER FRAGMENT FROM A CALLER. `sort=ListPrice desc` is caller-
 *    authored OData reaching the provider unexamined. This codebase already
 *    refuses that shape for `gridFilter`; sort had the same hole.
 *
 * 2. A SUPPRESSED FIELD PRESENTED AS A SORT OPTION. The toolbar maps the DOM
 *    column to `DaysOnMarket`, and live 2026-08-26 that field is
 *    PROVIDER-SUPPRESSED for ordering: "Results from 'RLS' has been suppressed
 *    (provider Level) as field DaysOnMarket' cannot be used for filtering or
 *    ordering queries." Sorting by DOM does not sort badly — it 400s the entire
 *    search.
 *
 * 3. A MISLABELLED FIELD. The toolbar mapped `listedDate` to
 *    `ModificationTimestamp`. Those are different facts: when a listing was
 *    LISTED is ListingContractDate; ModificationTimestamp is when the record was
 *    last touched. Sorting "by listed date" silently sorted by last-modified —
 *    a wrong answer wearing the right label, which is the failure mode this
 *    whole workstream exists to remove.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY SORT NEEDS A DETERMINISTIC TIE-BREAK. Rows sharing a sort value have no
 * defined order in OData, so two requests for adjacent pages can return the same
 * listing twice and omit another — the classic unstable-sort pagination bug. A
 * ListingKey tie-break makes the ordering total.
 *
 * Live-verified orderable on Property, 2026-08-26 (7,864 Active rows):
 * ListPrice, ModificationTimestamp, ListingContractDate, ListingKey.
 */
import {
  MALLAN_SORT_KEYS,
  UnsupportedSortError,
  keysetResumePredicate,
  resolveSort,
  sortODataClause,
} from '@/lib/search/canonical/sort-contract';

describe('the sort registry is closed and live-verified', () => {
  it('exposes only keys whose provider field was proven orderable', () => {
    const fields = new Set(Object.values(MALLAN_SORT_KEYS).map((s) => s.cotalityField));
    expect([...fields].sort()).toEqual([
      'ListPrice',
      'ListingContractDate',
      'ModificationTimestamp',
    ]);
  });

  it('never offers DaysOnMarket, which the provider suppresses for ordering', () => {
    const fields = Object.values(MALLAN_SORT_KEYS).map((s) => s.cotalityField);
    expect(fields).not.toContain('DaysOnMarket');
    expect(fields).not.toContain('CumulativeDaysOnMarket');
  });

  it('does not map "listed" onto the modification timestamp', () => {
    // The mislabel. These are different facts and must stay different keys.
    expect(MALLAN_SORT_KEYS.listed_desc.cotalityField).toBe('ListingContractDate');
    expect(MALLAN_SORT_KEYS.updated_desc.cotalityField).toBe('ModificationTimestamp');
  });

  it('every key carries a direction and a human label', () => {
    for (const [key, spec] of Object.entries(MALLAN_SORT_KEYS)) {
      expect(['asc', 'desc']).toContain(spec.direction);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });
});

describe('every emitted clause is totally ordered', () => {
  it.each(Object.keys(MALLAN_SORT_KEYS))('%s ends with the identity tie-break', (key) => {
    // Without this, rows sharing a price have no defined order and adjacent
    // pages can repeat one listing while dropping another.
    expect(sortODataClause(key)).toMatch(/, ListingKey asc$/);
  });

  it('renders field and direction ahead of the tie-break', () => {
    expect(sortODataClause('price_desc')).toBe('ListPrice desc, ListingKey asc');
    expect(sortODataClause('price_asc')).toBe('ListPrice asc, ListingKey asc');
    expect(sortODataClause('listed_desc')).toBe('ListingContractDate desc, ListingKey asc');
  });

  it('the tie-break is never the primary key of the sort', () => {
    // A tie-break that IS the sort would silently discard the requested order.
    for (const key of Object.keys(MALLAN_SORT_KEYS)) {
      expect(sortODataClause(key).startsWith('ListingKey ')).toBe(false);
    }
  });
});

describe('an unknown sort fails by name instead of defaulting', () => {
  it.each([
    ['DaysOnMarket desc', 'the suppressed field the toolbar used to send'],
    ['ListPrice; DROP', 'a caller-authored fragment'],
    ['Bogus asc', 'an unknown provider field'],
    ['price_sideways', 'an unknown Mallan key'],
    ['', 'an empty string, which is not the same as absent'],
  ])('%s throws (%s)', (value) => {
    expect(() => resolveSort(value)).toThrow(UnsupportedSortError);
  });

  it('names the offending value', () => {
    try {
      resolveSort('DaysOnMarket desc');
      throw new Error('expected a throw');
    } catch (err) {
      const e = err as UnsupportedSortError;
      expect(e.requested).toBe('DaysOnMarket desc');
      expect(e.supported).toEqual(expect.arrayContaining(['price_desc']));
    }
  });

  it('explains WHY DaysOnMarket cannot be offered', () => {
    // A broker told only "unsupported" will ask for it again next quarter.
    expect(() => resolveSort('DaysOnMarket desc')).toThrow(/suppress/i);
  });

  it('absent is not an error — it is the documented default', () => {
    // Absent and UNRECOGNISED are different states. Only one may default.
    const resolved = resolveSort(null);
    expect(resolved.key).toBe('updated_desc');
    expect(sortODataClause(resolved.key)).toBe('ModificationTimestamp desc, ListingKey asc');
  });
});

describe('the legacy provider strings the client still sends are translated, not passed through', () => {
  it.each([
    ['ListPrice desc', 'price_desc'],
    ['ListPrice asc', 'price_asc'],
    ['ModificationTimestamp desc', 'updated_desc'],
    ['ModificationTimestamp asc', 'updated_asc'],
  ])('%s resolves to %s', (legacy, expected) => {
    // Accepted for compatibility because the shipped toolbar emits them, and
    // mapped onto a canonical key so the tie-break is applied either way. What
    // is NOT accepted is an arbitrary provider fragment.
    expect(resolveSort(legacy).key).toBe(expected);
  });

  it('a legacy string still gains the tie-break', () => {
    expect(sortODataClause(resolveSort('ListPrice desc').key)).toBe(
      'ListPrice desc, ListingKey asc',
    );
  });

  it('a legacy-LOOKING string for an unverified field is still refused', () => {
    // Compatibility is an allowlist of proven strings, not a syntax rule.
    expect(() => resolveSort('LivingArea desc')).toThrow(UnsupportedSortError);
  });
});

/**
 * KEYSET, TYPED AND NULL-AWARE.
 *
 * Cotality's own @odata.nextLink is a plain `$skip=N` (verified live — there is
 * no opaque skiptoken), and an offset is only correct against a frozen feed. A
 * keyset names a POSITION IN THE ORDER instead, so an insertion or a withdrawal
 * ahead of the boundary cannot invalidate it.
 *
 * Two things this contract refuses to guess:
 *
 *   THE LITERAL TYPE. `typeof value` is not an OData contract. Live 2026-08-26,
 *   a quoted DateTime or Date is REJECTED — so getting it wrong does not degrade
 *   results, it 400s the search.
 *
 *   WHERE NULLS SORT. All three sort fields are declared nullable and
 *   ListingContractDate carries 9,771 nulls. Ordering ASC starts at 1900-01-01
 *   and DESC starts at 2028-03-02, so nulls appear at neither end and the
 *   provider's implicit placement could not be established. Mallan declares the
 *   policy instead: known values first, nulls last, ordered by ListingKey.
 */
import {
  KeysetPhase,
  assertProviderListingKey,
  keysetLiteral,
  phaseODataOrderBy,
  phaseScopeClause,
} from '@/lib/search/canonical/sort-contract';

describe('literals are written for the PROVIDER type, not the JS type', () => {
  it('a Decimal is bare', () => {
    expect(keysetLiteral('price_desc', 128000000)).toBe('128000000');
  });

  it('a DateTime is BARE — quoting it is rejected by the provider', () => {
    // Live: `ModificationTimestamp gt 2026-08-01T00:00:00Z` -> 266,027 rows;
    // the quoted form is rejected outright.
    expect(keysetLiteral('updated_desc', '2026-08-01T00:00:00Z')).toBe('2026-08-01T00:00:00Z');
  });

  it('a Date is BARE too', () => {
    // Live: `ListingContractDate gt 2026-01-01` -> 17,375 rows; quoted rejected.
    expect(keysetLiteral('listed_desc', '2026-01-01')).toBe('2026-01-01');
  });

  it('every registered sort declares its provider literal type', () => {
    for (const [key, spec] of Object.entries(MALLAN_SORT_KEYS)) {
      expect(['decimal', 'datetime', 'date', 'string']).toContain(spec.literalType);
      expect(key).toBeTruthy();
    }
  });

  it('no sort is left keyset-INcapable', () => {
    // The old registry parked listed_* behind the bounded rescan forever
    // because nobody knew where nulls sorted. The two-phase policy resolves
    // that without guessing, so every sort is now pageable.
    expect(Object.keys(MALLAN_SORT_KEYS)).toHaveLength(6);
    for (const key of Object.keys(MALLAN_SORT_KEYS)) {
      expect(() =>
        keysetResumePredicate(key, KeysetPhase.KNOWN, key.startsWith('price') ? 1 : '2026-01-01', '1146011469'),
      ).not.toThrow();
    }
  });
});

describe('the ordering is two explicit phases', () => {
  it('the KNOWN phase scopes to non-null and orders by the field', () => {
    expect(phaseScopeClause('listed_desc', KeysetPhase.KNOWN)).toBe('ListingContractDate ne null');
    expect(phaseODataOrderBy('listed_desc', KeysetPhase.KNOWN)).toBe(
      'ListingContractDate desc, ListingKey asc',
    );
  });

  it('the NULLS phase scopes to null and orders by the KEY alone', () => {
    // A null has no sort value, so ordering by the field would be meaningless.
    expect(phaseScopeClause('listed_desc', KeysetPhase.NULLS)).toBe('ListingContractDate eq null');
    expect(phaseODataOrderBy('listed_desc', KeysetPhase.NULLS)).toBe('ListingKey asc');
  });

  it('the two phases partition the universe exactly', () => {
    // Live: 581,534 ne null + 9,771 eq null = 591,305 total. No row is in both
    // and none is in neither, which is what makes the policy total.
    const known = phaseScopeClause('listed_asc', KeysetPhase.KNOWN);
    const nulls = phaseScopeClause('listed_asc', KeysetPhase.NULLS);
    expect(known).toContain('ne null');
    expect(nulls).toContain('eq null');
  });
});

describe('the resume predicate for each sort', () => {
  it('price desc', () => {
    expect(keysetResumePredicate('price_desc', KeysetPhase.KNOWN, 128000000, '1146011469')).toBe(
      "(ListPrice ne null and (ListPrice lt 128000000 or (ListPrice eq 128000000 and ListingKey gt '1146011469')))",
    );
  });

  it('price asc', () => {
    expect(keysetResumePredicate('price_asc', KeysetPhase.KNOWN, 500000, '1146011469')).toBe(
      "(ListPrice ne null and (ListPrice gt 500000 or (ListPrice eq 500000 and ListingKey gt '1146011469')))",
    );
  });

  it('updated desc — an unquoted DateTime', () => {
    expect(
      keysetResumePredicate('updated_desc', KeysetPhase.KNOWN, '2026-08-01T00:00:00Z', '1146011469'),
    ).toBe(
      "(ModificationTimestamp ne null and (ModificationTimestamp lt 2026-08-01T00:00:00Z or (ModificationTimestamp eq 2026-08-01T00:00:00Z and ListingKey gt '1146011469')))",
    );
  });

  it('listed asc — an unquoted Date', () => {
    expect(keysetResumePredicate('listed_asc', KeysetPhase.KNOWN, '2026-01-01', '1146011469')).toBe(
      "(ListingContractDate ne null and (ListingContractDate gt 2026-01-01 or (ListingContractDate eq 2026-01-01 and ListingKey gt '1146011469')))",
    );
  });

  it('the NULLS phase resumes on the key alone', () => {
    // Live-proven: eq null ordered by ListingKey gives 1091340174, ...175,
    // ...177; resuming after ...175 returns ...177 then ...183.
    expect(keysetResumePredicate('listed_desc', KeysetPhase.NULLS, null, '1091340175')).toBe(
      "(ListingContractDate eq null and ListingKey gt '1091340175')",
    );
  });

  it('a KNOWN resume without a boundary value is refused, not guessed', () => {
    // A null boundary belongs to the NULLS phase. Substituting one here would
    // silently produce a predicate that matches nothing.
    expect(() => keysetResumePredicate('price_desc', KeysetPhase.KNOWN, null, '1146011469')).toThrow(
      UnsupportedSortError,
    );
  });

  it('a non-provider-shaped ListingKey is refused BEFORE it reaches Cotality', () => {
    // Live 2026-08-26: `ListingKey gt 'K1'` returns HTTP 500 "Internal Server
    // Error" — not a 400, not an empty result. A bad key literal BREAKS the
    // provider rather than being rejected cleanly, with an error that says
    // nothing about why. So the shape is checked here, by name.
    //
    // This is also how the five "failing" predicate shapes above were
    // diagnosed: they were failing on the fake key 'K1', not on their design.
    // Every one was re-verified live with a real numeric key.
    expect(() => keysetResumePredicate('price_desc', KeysetPhase.KNOWN, 1, 'K1')).toThrow(
      UnsupportedSortError,
    );
    expect(() => assertProviderListingKey('1146011469')).not.toThrow();
    expect(() => assertProviderListingKey("1146011469'; DROP")).toThrow(UnsupportedSortError);
    expect(() => assertProviderListingKey('')).toThrow(UnsupportedSortError);
  });

  it('an unknown sort key still fails by name', () => {
    expect(() => keysetResumePredicate('bogus', KeysetPhase.KNOWN, 1, '1146011469')).toThrow(
      UnsupportedSortError,
    );
  });
});
