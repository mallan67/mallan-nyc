/// <reference types="jest" />
/**
 * STEP 2 — THE PRODUCTION WRITER, NOT THE HELPER.
 *
 * The previous round (cca79786) built a canonical universe contract and wired
 * the MAPPER to it, then proved both with 44 + 16 green assertions. The actual
 * OData writers were never touched. At that commit:
 *
 *     lib/search/crm-idx-filter.ts:47   PropertyType ne 'ResidentialLease'
 *     lib/idx/fetch.ts:488,517,549,569  PropertyType ne 'ResidentialLease'  x4
 *     lib/search/__tests__/crm-idx-filter.test.ts:17
 *                                       expect(filter).toContain(
 *                                         "PropertyType ne 'ResidentialLease'")
 *
 * So the defect kept shipping while the suite went green, and an existing test
 * actively REQUIRED it. That is the exact anti-pattern this workstream exists to
 * stop: root cause fixed in one reader, the real writer untouched, tests around
 * the helper passing, the workflow still wrong.
 *
 * These tests assert `buildCrmIdxODataFilter()` — the thing that actually talks
 * to Cotality — and they assert the ABSENCE of the negation, not merely the
 * presence of the replacement. A "contains eq 'Residential'" test would pass
 * happily while the negation sat next to it.
 */
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

const filterFor = (type: string) => buildCrmIdxODataFilter(new URLSearchParams({ type }));

describe('the authenticated CRM writer uses the verified universe', () => {
  it('renders sale as an exact positive predicate', () => {
    expect(filterFor('sale')).toContain("PropertyType eq 'Residential'");
  });

  it.each(['rent', 'rental'])('renders %s as an exact positive predicate', (t) => {
    expect(filterFor(t)).toContain("PropertyType eq 'ResidentialLease'");
  });
});

describe('the sale filter carries no negation and no rental type', () => {
  it('emits no ne operator at all for sale', () => {
    // The whole point. Asserting the presence of the new predicate is not
    // enough — the old one could still be sitting beside it.
    expect(filterFor('sale')).not.toMatch(/\bne\b/);
  });

  it('does not mention ResidentialLease anywhere in a sale filter', () => {
    expect(filterFor('sale')).not.toContain('ResidentialLease');
  });

  it('does not define sale by excluding rental', () => {
    expect(filterFor('sale')).not.toContain("ne 'ResidentialLease'");
  });
});

describe('the rental filter does not leak the sale type', () => {
  it('is the exact rental predicate', () => {
    // Guarded on the predicate, not by substring: 'Residential' IS a substring
    // of 'ResidentialLease', so a naive containment check would mislead.
    const f = filterFor('rental');
    expect(f).toContain("PropertyType eq 'ResidentialLease'");
    expect(f).not.toContain("PropertyType eq 'Residential'");
  });
});

describe('an unrecognised or absent type constrains nothing by guesswork', () => {
  it.each(['', 'commercial', 'land', 'anything'])(
    'type=%p emits no PropertyType predicate rather than defaulting to sale',
    (t) => {
      const f = buildCrmIdxODataFilter(new URLSearchParams(t ? { type: t } : {}));
      expect(f).not.toContain('PropertyType');
    },
  );
});

describe('the universe predicate matches the canonical contract exactly', () => {
  it('sale is byte-identical to the canonical rendering', async () => {
    const { propertyTypeUniverseOData } = await import('@/lib/search/canonical/property-type-universe');
    expect(filterFor('sale')).toContain(propertyTypeUniverseOData('sale'));
  });

  it('rental is byte-identical to the canonical rendering', async () => {
    const { propertyTypeUniverseOData } = await import('@/lib/search/canonical/property-type-universe');
    expect(filterFor('rental')).toContain(propertyTypeUniverseOData('rental'));
  });
});
