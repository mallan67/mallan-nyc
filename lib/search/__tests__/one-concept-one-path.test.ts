import {
  InvalidCriterionValueError,
  assertValidFeatureSelection,
  type FeatureFamilyAuthority,
} from '../canonical/criteria-values';
import {
  FAMILIES_WITH_FIRST_CLASS_IDENTITY,
  canonicalCheckboxCriterion,
  checkboxFieldContract,
  offerableCheckboxFields,
  registeredCheckboxFields,
  validateCheckboxValues,
} from '../canonical/checkbox-criteria';
import { CRITERION_VALUE_SHAPE, WORKFLOW_CRITERIA } from '../canonical/filter-keys.generated';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE CONCEPT, ONE PATH.
 *
 * `pets` and `furnished` are first-class Rental Search questions — CURRENT.md
 * names both, and the CRM has dedicated rental sections for them. They are top-
 * level canonical criteria whose VALUES and MAPPING remain owned by
 * `checkbox-criteria.ts`.
 *
 * What must be impossible is asking the same business question twice:
 *
 *     RentalCriteria.pets       AND  feature_criteria.pet_policy
 *     RentalCriteria.furnished  AND  feature_criteria.furnished
 *
 * A request that contains both has no rule saying which half wins.
 */

/** The real owner, wired the way the validator will wire it in production. */
const authority: FeatureFamilyAuthority = {
  isOfferable: (family) => {
    const canonical = canonicalCheckboxCriterion(family);
    return canonical !== null && !FAMILIES_WITH_FIRST_CLASS_IDENTITY.has(canonical);
  },
  validate: (family, values) => {
    const canonical = canonicalCheckboxCriterion(family);
    if (!canonical) return { ok: false, reason: `unknown family "${family}"` };
    const verdict = validateCheckboxValues(canonical, values);
    return { ok: verdict.disposition === 'executable', reason: verdict.reason };
  },
};

describe('pets and furnished are top-level, not selectable features', () => {
  it('are offered as first-class Rental criteria', () => {
    expect(WORKFLOW_CRITERIA.rental).toContain('pets');
    expect(WORKFLOW_CRITERIA.rental).toContain('furnished');
  });

  it('REFUSES the same question asked through feature_criteria', () => {
    // The duplicate path, closed. Either spelling is refused: the legacy
    // `pet_policy` name and the canonical `pets` name both resolve to a family
    // that carries a first-class identity.
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { pet_policy: ['CatsOk'] }, authority),
    ).toThrow(InvalidCriterionValueError);
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { pets: ['CatsOk'] }, authority),
    ).toThrow(InvalidCriterionValueError);
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { furnished: ['Furnished'] }, authority),
    ).toThrow(/first-class criterion/);
  });

  it('still allows genuine feature families', () => {
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { laundry: ['InUnit'] }, authority),
    ).not.toThrow();
  });

  it('excludes them from the offerable family list, but KEEPS them registered', () => {
    // They remain the mapping and value authority — only their selectability as
    // generic features is removed. Deleting the families outright would have
    // thrown away verified provider work.
    expect(offerableCheckboxFields()).not.toContain('pets');
    expect(offerableCheckboxFields()).not.toContain('furnished');
    expect(registeredCheckboxFields()).toContain('pets');
    expect(registeredCheckboxFields()).toContain('furnished');
  });
});

describe('pets is NOT simply renamed pet_policy', () => {
  it('reads legacy pet_policy input into the canonical pets identity', () => {
    // Legacy saved searches and older UI writes still resolve; they just may not
    // be produced as new canonical writes.
    expect(canonicalCheckboxCriterion('pet_policy')).toBe('pets');
    expect(canonicalCheckboxCriterion('PetsAllowed')).toBe('pets');
  });

  it('accepts the PROVEN unit-level tokens', () => {
    // Exact-token match on Yes/CatsOk/DogsOk gives 4,304 live rows. These are
    // the members whose meaning is established.
    for (const token of ['Yes', 'CatsOk', 'DogsOk']) {
      expect(validateCheckboxValues('pets', [token]).disposition).toBe('executable');
    }
  });

  it('keeps the UNPROVEN members unsupported rather than silently mapping them', () => {
    // `pet_policy` carried CatsOnly / DogsOnly / NoRestrictions as UNRESOLVED,
    // and promoting the family to a first-class identity must not quietly
    // promote those too. "Only cats" is a different assertion from "cats are
    // permitted"; the provider has CatsOk, not CatsOnly.
    for (const token of ['CatsOnly', 'DogsOnly', 'NoRestrictions']) {
      expect(validateCheckboxValues('pets', [token]).disposition).not.toBe('executable');
    }
  });

  it('holds the unit-level mapping, not a building-level substring match', () => {
    // PetsAllowed mixes building- and unit-level tokens: "BuildingYes,No" means
    // the BUILDING permits pets and THE UNIT DOES NOT. Substring matching
    // returns 6,861 rows against 4,304 exact — 2,557 listings a renter with a
    // dog cannot actually rent.
    expect(checkboxFieldContract('pets')?.cotalityField).toBe('PetsAllowed');
    expect(checkboxFieldContract('pets')?.kind).toBe('multi_enum');
  });
});

describe('feature_criteria is structured, not flat', () => {
  it('is a field -> values map', () => {
    // A flat `['City', 'InUnit', 'Furnished']` throws away which family each
    // value belongs to, and `checkbox-criteria` owns eighteen families each with
    // its own Cotality field, kind, allowed members and unresolved members.
    expect(CRITERION_VALUE_SHAPE.feature_criteria).toBe('feature_map');
  });

  it('REFUSES a family carrying no values', () => {
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { laundry: [] }, authority),
    ).toThrow(InvalidCriterionValueError);
  });

  it('REFUSES an entirely empty selection', () => {
    expect(() => assertValidFeatureSelection('feature_criteria', {}, authority)).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('REFUSES an unresolved member through the owner, not a local list', () => {
    // The validator asks the owner; it never interprets the owner's name. A
    // `switch (vocabularyOwner)` here would be translation table number ten.
    expect(() =>
      assertValidFeatureSelection('feature_criteria', { laundry: ['Common'] }, authority),
    ).toThrow(/laundry/);
  });
});
