/**
 * lib/cotality/contract.ts — the hand-written access layer over the GENERATED contract.
 *
 * These helpers are what runtime code binds through: field-list builders that the compiler checks,
 * fact accessors that never guess, and fail-closed assertions for $filter / $expand / entitlement.
 * Every expectation below is derived from the generated facts at test time (no live value is
 * hardcoded), so the tests prove the HELPERS, not a snapshot of the provider.
 */
import {
  CotalityContractError,
  assertAccessible,
  assertExpandable,
  assertFilterable,
  cotalityFieldFact,
  cotalityFields,
  isCotalityField,
  isCotalityResource,
  splitMultiEnum,
  unknownFields,
  zeroPopulatedFields,
} from '@/lib/cotality/contract';
import { COTALITY_ACCESS, COTALITY_FIELD_FACTS, COTALITY_NAVIGATIONS } from '@/lib/cotality/generated/contract';

function firstPropertyFieldWhere(pred: (f: { filterable: boolean | null; populated: number | null }) => boolean): string | null {
  for (const [name, fact] of Object.entries(COTALITY_FIELD_FACTS.Property)) if (pred(fact)) return name;
  return null;
}

describe('cotalityFields — compile-checked field lists', () => {
  it('returns the list unchanged at runtime (the check is the type system)', () => {
    const list = cotalityFields('Property', ['ListingKey', 'StandardStatus', 'ModificationTimestamp']);
    expect(list).toEqual(['ListingKey', 'StandardStatus', 'ModificationTimestamp']);
  });
});

describe('isCotalityResource / isCotalityField', () => {
  it('recognises every generated resource and rejects anything else', () => {
    for (const r of Object.keys(COTALITY_ACCESS)) expect(isCotalityResource(r)).toBe(true);
    expect(isCotalityResource('Listing')).toBe(false);
    expect(isCotalityResource('')).toBe(false);
  });

  it('recognises a declared field and rejects a phantom on the same resource', () => {
    expect(isCotalityField('Property', 'InternetEntireListingDisplayYN')).toBe(true);
    expect(isCotalityField('Property', 'IDXEntireListingDisplayYN')).toBe(false);
    expect(isCotalityField('Property', 'ParticipantOnlyYN')).toBe(false);
  });

  it('is resource-scoped: a Media field is not a Property field', () => {
    expect(isCotalityField('Media', 'MediaCategory')).toBe(true);
    expect(isCotalityField('Property', 'MediaCategory')).toBe(false);
  });
});

describe('unknownFields — the census primitive', () => {
  it('returns exactly the names that are not on the contract, in input order', () => {
    expect(unknownFields('Property', ['ListingKey', 'NotARealField__', 'StandardStatus', 'AlsoFake__'])).toEqual([
      'NotARealField__',
      'AlsoFake__',
    ]);
  });
});

describe('cotalityFieldFact — facts, never guesses', () => {
  it('returns the generated fact object for a declared field', () => {
    const fact = cotalityFieldFact('Property', 'ListingKey');
    expect(fact).toBe(COTALITY_FIELD_FACTS.Property.ListingKey);
  });

  it('throws UNKNOWN_FIELD for an undeclared name instead of returning undefined', () => {
    expect(() => cotalityFieldFact('Property', 'NotARealField__' as never)).toThrow(CotalityContractError);
    try {
      cotalityFieldFact('Property', 'NotARealField__' as never);
    } catch (e) {
      expect((e as CotalityContractError).code).toBe('UNKNOWN_FIELD');
    }
  });
});

describe('assertFilterable — fail-closed $filter guard', () => {
  it('passes for a field measured filterable', () => {
    const name = firstPropertyFieldWhere((f) => f.filterable === true);
    expect(name).not.toBeNull();
    expect(() => assertFilterable('Property', name as never)).not.toThrow();
  });

  it('throws NOT_FILTERABLE for a field the provider suppresses', () => {
    const name = firstPropertyFieldWhere((f) => f.filterable === false);
    expect(name).not.toBeNull(); // this feed suppresses many Property fields; if none, the snapshot is wrong
    expect(() => assertFilterable('Property', name as never)).toThrow(/NOT_FILTERABLE/);
  });

  it('throws UNKNOWN_FIELD for a phantom (never silently builds a 400)', () => {
    expect(() => assertFilterable('Property', 'ParticipantOnlyYN' as never)).toThrow(/UNKNOWN_FIELD/);
  });
});

describe('assertAccessible / assertExpandable — entitlement + navigation guards', () => {
  it('passes for an accessible resource and throws RESOURCE_REJECTED for a rejected one', () => {
    const accessible = Object.entries(COTALITY_ACCESS).find(([, a]) => a.state === 'accessible')?.[0];
    const rejected = Object.entries(COTALITY_ACCESS).find(([, a]) => a.state === 'rejected')?.[0];
    expect(accessible).toBeDefined();
    expect(() => assertAccessible(accessible as never)).not.toThrow();
    if (rejected) expect(() => assertAccessible(rejected as never)).toThrow(/RESOURCE_REJECTED/);
  });

  it('passes for a navigation whose $expand was measured SUPPORTED and throws otherwise', () => {
    const navs = COTALITY_NAVIGATIONS.Property as Record<string, { expand: string | null }>;
    const ok = Object.entries(navs).find(([, n]) => n.expand === 'SUPPORTED')?.[0];
    const bad = Object.entries(navs).find(([, n]) => n.expand !== 'SUPPORTED')?.[0];
    expect(ok).toBeDefined();
    expect(() => assertExpandable('Property', ok as never)).not.toThrow();
    if (bad) expect(() => assertExpandable('Property', bad as never)).toThrow(/NOT_EXPANDABLE/);
    expect(() => assertExpandable('Property', 'NotANav__' as never)).toThrow(/UNKNOWN_NAVIGATION/);
  });
});

describe('zeroPopulatedFields — declared, filterable, and empty on the feed', () => {
  it('lists exactly the fields whose measured population is 0', () => {
    const expected = Object.entries(COTALITY_FIELD_FACTS.Property)
      .filter(([, f]) => f.populated === 0)
      .map(([n]) => n)
      .sort();
    expect([...zeroPopulatedFields('Property')].sort()).toEqual(expected);
  });
});

describe('splitMultiEnum — comma-joined member names → tokens', () => {
  it('splits, trims, and drops empties; null/undefined → []', () => {
    expect(splitMultiEnum('IDX,VOW')).toEqual(['IDX', 'VOW']);
    expect(splitMultiEnum(' IDX , Private ,')).toEqual(['IDX', 'Private']);
    expect(splitMultiEnum(null)).toEqual([]);
    expect(splitMultiEnum(undefined)).toEqual([]);
    expect(splitMultiEnum('')).toEqual([]);
  });

  it('accepts an already-split array verbatim (provider may serialize collections as arrays)', () => {
    expect(splitMultiEnum(['IDX', 'VOW'])).toEqual(['IDX', 'VOW']);
  });
});
