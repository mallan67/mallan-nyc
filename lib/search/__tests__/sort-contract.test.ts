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
