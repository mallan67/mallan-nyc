/// <reference types="jest" />
/**
 * The pet policy of a BUILDING (lib/search/pet-policy.ts: buildingPetAnswers, buildingPetAnswersOf).
 *
 * Found 2026-10-09, listed as report-only until now: a building page took the PetsAllowed answers of the first listing record that had any, whichever kind they were. In the live feed a
 * listing's answers hold both the building's (`BuildingYes`, `BuildingNo` ...) and the apartment's own (`Yes`, `No`, `CatsOk` ...), and `BuildingYes,No` is the commonest mixed record (44 of
 * the first 200 rentals and 75 of the first 200 sales the preview of 3aff9efb returned on 2026-10-10), so a building could read "Pets Allowed, Not allowed per the listing" because ONE
 * apartment's listing said no. The building page now keeps only the Building* answers, as the CRM building lookup already does (app/api/buildings/search/route.ts).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildingPetAnswers, buildingPetAnswersOf, formatPetPolicy, petPolicyLabels } from '@/lib/search/pet-policy';

const LIVE: string[] = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf8')).enums.PetsAllowed;
const NO_PETS = 'Not allowed per the listing';

describe('buildingPetAnswers: the Building* members of a PetsAllowed value', () => {
  it.each([
    ['BuildingYes,Yes', ['BuildingYes']],
    ['BuildingYes,No', ['BuildingYes']],
    ['BuildingNo,No', ['BuildingNo']],
    ['BuildingDogsOk,BuildingYes,CatsOk,DogsOk,Yes', ['BuildingDogsOk', 'BuildingYes']],
    ['BreedRestrictions,BuildingYes,NumberLimit,SizeLimit,Yes', ['BuildingYes']],
    ['Yes,CatsOk', []],
    ['No', []],
    ['CatsOk, DogsOk ; Other', []],
    ['UnitYes,UnitNo', []],
    ['', []],
    ['  ', []],
  ])('%j', (value, expected) => {
    expect(buildingPetAnswers(value)).toEqual(expected);
    expect(buildingPetAnswers(value.split(','))).toEqual(expected);
  });

  it.each([[null], [undefined], [5], [true], [{}], [[]], [[null, '']]])('%j is no answer', (value) => {
    expect(buildingPetAnswers(value)).toEqual([]);
  });

  it('spelled with spaces or in lower case, a Building answer is still one', () => {
    expect(buildingPetAnswers('Building Yes,building cats ok')).toEqual(['Building Yes', 'building cats ok']);
  });

  it('exactly the seven Building* members of the live list are about a building', () => {
    const aboutBuilding = LIVE.filter((member) => buildingPetAnswers(member).length === 1);
    expect(aboutBuilding.sort()).toEqual([
      'BuildingBreedRestrictions', 'BuildingCatsOk', 'BuildingDogsOk', 'BuildingNo', 'BuildingNumberLimit', 'BuildingSizeLimit', 'BuildingYes',
    ]);
  });
});

describe('buildingPetAnswersOf: the building\'s answers from the records of its listings', () => {
  it('takes the Building* answers of the first record that has any, skipping records that have none', () => {
    expect(buildingPetAnswersOf([{ PetsAllowed: 'Yes,CatsOk' }, { PetsAllowed: undefined }, { PetsAllowed: 'BuildingYes,No' }, { PetsAllowed: 'BuildingNo' }])).toEqual(['BuildingYes']);
  });

  it('the first record wins when the records of one building disagree, as for every other list', () => {
    expect(buildingPetAnswersOf([{ PetsAllowed: 'BuildingNo,No' }, { PetsAllowed: 'BuildingYes,Yes' }])).toEqual(['BuildingNo']);
  });

  it('is empty when no record has a building answer (an apartment\'s own answer says nothing about the building)', () => {
    expect(buildingPetAnswersOf([{ PetsAllowed: 'Yes' }, { PetsAllowed: 'No' }, {}])).toEqual([]);
    expect(buildingPetAnswersOf([])).toEqual([]);
  });

  it('reads a list the way it reads a string', () => {
    expect(buildingPetAnswersOf([{ PetsAllowed: ['BuildingCatsOk', 'CatsOk'] }])).toEqual(['BuildingCatsOk']);
  });
});

describe('what the building page then says', () => {
  it('a first record of BuildingYes,No no longer makes the building contradict itself', () => {
    const records = [{ PetsAllowed: 'BuildingYes,No' }, { PetsAllowed: 'BuildingYes,Yes' }];
    // before: the whole answer of the first record was the building's
    expect(petPolicyLabels('BuildingYes,No')).toEqual(['Pets Allowed', NO_PETS]);
    // now: only what is about the building
    expect(petPolicyLabels(buildingPetAnswersOf(records))).toEqual(['Pets Allowed']);
    expect(formatPetPolicy(buildingPetAnswersOf(records))).toBe('Pets Allowed');
  });

  it('a building that says no still says it, in the listing\'s words', () => {
    expect(petPolicyLabels(buildingPetAnswersOf([{ PetsAllowed: 'BuildingNo,No' }]))).toEqual([NO_PETS]);
  });

  it('a building with conditions keeps them', () => {
    expect(formatPetPolicy(buildingPetAnswersOf([{ PetsAllowed: 'BuildingDogsOk,BuildingSizeLimit,BuildingYes,Yes' }]))).toBe('Dogs Ok, Size Limit, Pets Allowed');
  });

  it('a building none of whose records has a building answer shows no pet policy at all', () => {
    expect(petPolicyLabels(buildingPetAnswersOf([{ PetsAllowed: 'Yes,CatsOk' }]))).toEqual([]);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
