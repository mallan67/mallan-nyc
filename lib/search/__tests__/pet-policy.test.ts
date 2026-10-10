/// <reference types="jest" />
/**
 * How the public site reads Cotality's PetsAllowed answers (lib/search/pet-policy.ts).
 *
 * Found 2026-10-09 by the review Maya pasted: the public search read a pet answer with the substring test `!value.includes("no") || value.includes("catsok") || value.includes("dogsok")`, copied
 * into four places, so `NoPetRestrictions`, `NoBreedRestrictions`, `NoSizeLimit` and `NoDogs` (all of which contain "no") were read as "no pets"; and the listing page stripped a trailing
 * "Yes" / "No" from every answer, so `Yes`, `No`, `BuildingYes` and `BuildingNo` printed nothing and `NoDogs` printed "Dogs Ok".
 *
 * The table below holds EVERY live member (the committed mirror of the live metadata, data/cotality-enums.live.json) to an explicit verdict and an explicit label, and fails when the mirror gains
 * a member that has none, so a new answer cannot be misread without someone deciding what it means.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { allowsPets, formatPetPolicy, isNoPetsAnswer, petAnswerLabel, petAnswers, petPolicyLabels, petPolicyView } from '@/lib/search/pet-policy';

const LIVE: string[] = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')).enums.PetsAllowed;

/** member → [does it let pets in, the label a reader sees ('' = not shown)] */
const EXPECTED: Record<string, [boolean, string]> = {
  BirdsOk: [true, 'Birds Ok'],
  BreedRestrictions: [true, 'Breed Restrictions'],
  BuildingBreedRestrictions: [true, 'Breed Restrictions'],
  BuildingCatsOk: [true, 'Cats Ok'],
  BuildingDogsOk: [true, 'Dogs Ok'],
  BuildingNo: [false, 'No Pets'],
  BuildingNumberLimit: [true, 'Number Limit'],
  BuildingSizeLimit: [true, 'Size Limit'],
  BuildingYes: [true, 'Pets Allowed'],
  Call: [true, 'Call'],
  CatsOk: [true, 'Cats Ok'],
  ChickensOk: [true, 'Chickens Ok'],
  Conditional: [true, 'Pets Conditional'],
  DogsOk: [true, 'Dogs Ok'],
  FishOk: [true, 'Fish Ok'],
  Negotiable: [true, 'Negotiable'],
  No: [false, 'No Pets'],
  NoBreedRestrictions: [true, 'No Breed Restrictions'],
  NoDogs: [true, 'No Dogs'],                                   // cats may be allowed: counts as pet-friendly (Maya, 2026-10-09)
  NoPetRestrictions: [true, 'No Pet Restrictions'],
  NoSizeLimit: [true, 'No Size Limit'],
  NumberLimit: [true, 'Number Limit'],
  Other: [true, ''],
  OwnerOnly: [true, 'Owner Only'],
  PetDeposit: [true, 'Pet Deposit'],
  PetFee: [true, 'Pet Fee'],
  PetRestrictions: [true, 'Pet Restrictions'],
  ReptileOk: [true, 'Reptile Ok'],
  SeeRemarks: [true, 'See Remarks'],
  SizeLimit: [true, 'Size Limit'],
  Yes: [true, 'Pets Allowed'],
};

/** what the CRM Add forms stored before the live members were used (tests/runtime/crm-pets-allowed-live.test.ts) */
const LEGACY: Record<string, [boolean, string]> = {
  UnitYes: [true, 'Pets Allowed'],
  UnitNo: [false, 'No Pets'],
  UnitCatsOK: [true, 'Cats Ok'],
  UnitDogsOK: [true, 'Dogs Ok'],
  UnitBreedRestrictions: [true, 'Breed Restrictions'],
  UnitSizeLimit: [true, 'Size Limit'],
  UnitNumberLimit: [true, 'Number Limit'],
};

describe('every live PetsAllowed member has a verdict and a label', () => {
  it('the table is the mirror\'s list, member for member (a new member fails here until it is decided)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...LIVE].sort());
    expect(LIVE).toHaveLength(31);
  });

  it.each(Object.entries(EXPECTED))('%s alone', (member, [allows, label]) => {
    expect(allowsPets(member)).toBe(allows);
    expect(isNoPetsAnswer(member)).toBe(!allows);
    expect(formatPetPolicy(member)).toBe(label);
    expect(petPolicyView(member)).toEqual(label ? { label, allowed: allows } : null);
  });

  it('exactly two live members say there are no pets: No and BuildingNo', () => {
    expect(LIVE.filter(isNoPetsAnswer).sort()).toEqual(['BuildingNo', 'No']);
  });

  it('the answers that were read as "no pets" because their name contains "no" are pet-friendly', () => {
    for (const member of ['NoPetRestrictions', 'NoBreedRestrictions', 'NoSizeLimit', 'NoDogs']) expect(allowsPets(member)).toBe(true);
  });
});

describe('listings saved by the CRM Add forms before the live members were used', () => {
  it.each(Object.entries(LEGACY))('%s is read the way the form meant it', (member, [allows, label]) => {
    expect(allowsPets(member)).toBe(allows);
    expect(formatPetPolicy(member)).toBe(label);
  });

  it('the whole old set at once', () => {
    expect(formatPetPolicy(['UnitYes', 'UnitCatsOK', 'UnitDogsOK', 'UnitBreedRestrictions', 'UnitSizeLimit'])).toBe('Pets Allowed, Cats Ok, Dogs Ok, Breed Restrictions, Size Limit');
  });
});

describe('older free-text spellings', () => {
  it.each(['No Pets', 'no pets', 'Not Allowed', 'Pets Not Allowed', 'None'])('%j says there are no pets', (text) => {
    expect(isNoPetsAnswer(text)).toBe(true);
    expect(allowsPets(text)).toBe(false);
  });

  it.each([['Allowed', 'Pets Allowed'], ['Permitted', 'Pets Allowed'], ['Restricted', 'Pets Conditional']])('%j reads as %j', (text, label) => {
    expect(petAnswerLabel(text)).toBe(label);
    expect(allowsPets(text)).toBe(true);
  });
});

describe('a policy of several answers', () => {
  it.each([
    ['Yes,CatsOk', true, 'Pets Allowed, Cats Ok'],
    ['BuildingYes,BuildingCatsOk,BuildingDogsOk', true, 'Pets Allowed, Cats Ok, Dogs Ok'],
    ['CatsOk,NoDogs', true, 'Cats Ok, No Dogs'],
    ['BuildingNo,CatsOk', true, 'No Pets, Cats Ok'],             // conflicting data: the unit answer lets cats in, so the policy is not "no pets"
    ['No,BuildingNo', false, 'No Pets'],                         // the same answer twice is said once
    ['BuildingCatsOk,CatsOk', true, 'Cats Ok'],
    ['CatsOk, DogsOk ; BreedRestrictions', true, 'Cats Ok, Dogs Ok, Breed Restrictions'],
  ])('%j', (value, allows, label) => {
    expect(allowsPets(value)).toBe(allows);
    expect(formatPetPolicy(value)).toBe(label);
  });

  it('a list gives the same answer as the comma-separated string the DTO makes of it', () => {
    for (const [value] of [['Yes,CatsOk'], ['BuildingNo'], ['CatsOk,NoDogs'], ['SizeLimit,NumberLimit']] as const) {
      expect(allowsPets(value.split(','))).toBe(allowsPets(value));
      expect(formatPetPolicy(value.split(','))).toBe(formatPetPolicy(value));
      expect(formatPetPolicy(value.split(','))).toBe(formatPetPolicy(String(value.split(','))));
    }
  });

  it('answers in the order given, each label once', () => {
    expect(formatPetPolicy('DogsOk,CatsOk,DogsOk')).toBe('Dogs Ok, Cats Ok');
  });
});

describe('no answer at all', () => {
  it.each([[null], [undefined], [''], ['  '], [','], [[]], [[null, '']], [5], [true], [{}]])('%j is no policy: not pet-friendly, nothing to show', (value) => {
    expect(allowsPets(value)).toBe(false);
    expect(formatPetPolicy(value)).toBe('');
    expect(petPolicyView(value)).toBeNull();
    expect(petAnswers(value)).toEqual([]);
  });

  it('None and Other say nothing a reader needs: not shown (as before), and the section stays out', () => {
    expect(formatPetPolicy('None,Other')).toBe('');
    expect(petPolicyView('Other')).toBeNull();
    expect(formatPetPolicy('None,CatsOk')).toBe('Cats Ok');
  });
});

describe('petPolicyView is what the listing page shows', () => {
  it('Yes: the words and the check', () => {
    expect(petPolicyView('Yes')).toEqual({ label: 'Pets Allowed', allowed: true });
  });
  it('No: the words and the cross (the section used to be left out altogether)', () => {
    expect(petPolicyView('No')).toEqual({ label: 'No Pets', allowed: false });
    expect(petPolicyView('BuildingNo')).toEqual({ label: 'No Pets', allowed: false });
  });
  it('NoDogs: says No Dogs, never Dogs Ok', () => {
    expect(petPolicyView('NoDogs')?.label).toBe('No Dogs');
    expect(petPolicyView('CatsOk,NoDogs')?.label).toBe('Cats Ok, No Dogs');
    expect(petPolicyView('NoDogs')?.label).not.toMatch(/Dogs Ok/);
  });
});

describe('petPolicyLabels is what the building pages list', () => {
  it('is the same words the listing page shows: the table\'s label for every live member alone, and each distinct label once for all of them together', () => {
    for (const [member, [, label]] of Object.entries(EXPECTED)) expect(petPolicyLabels(member)).toEqual(label ? [label] : []);
    expect(petPolicyLabels(LIVE)).toEqual([...new Set(LIVE.map((member) => EXPECTED[member][1]).filter(Boolean))]);
    expect(petPolicyLabels(LIVE).join(', ')).toBe(formatPetPolicy(LIVE));
  });

  it('lists each label once, in the order the building data gives the answers, from the list the building data holds', () => {
    expect(petPolicyLabels(['BuildingYes', 'BuildingCatsOk', 'CatsOk', 'BuildingNo', 'Other', 'NoDogs'])).toEqual(['Pets Allowed', 'Cats Ok', 'No Pets', 'No Dogs']);
  });

  it('says what each answer says (the building page used to print "Dogs Ok" for NoDogs and "Size Limit" for NoSizeLimit)', () => {
    expect(petPolicyLabels(['NoDogs'])).toEqual(['No Dogs']);
    expect(petPolicyLabels(['NoSizeLimit'])).toEqual(['No Size Limit']);
    expect(petPolicyLabels(['BuildingNo'])).toEqual(['No Pets']);
    expect(petPolicyLabels(['BuildingSizeLimit', 'BuildingNumberLimit'])).toEqual(['Size Limit', 'Number Limit']);
  });

  it('has nothing to list when there is no answer, or only None / Other', () => {
    expect(petPolicyLabels([])).toEqual([]);
    expect(petPolicyLabels(['None', 'Other'])).toEqual([]);
    expect(petPolicyLabels(undefined)).toEqual([]);
  });
});

describe('petAnswers', () => {
  it('splits on commas, semicolons and bars, trims, and drops blanks', () => {
    expect(petAnswers(' CatsOk , DogsOk;;SizeLimit|NumberLimit ,')).toEqual(['CatsOk', 'DogsOk', 'SizeLimit', 'NumberLimit']);
  });
  it('flattens a list of strings and ignores anything that is not text', () => {
    expect(petAnswers(['CatsOk,DogsOk', 'SizeLimit', 7, null])).toEqual(['CatsOk', 'DogsOk', 'SizeLimit']);
  });
});
