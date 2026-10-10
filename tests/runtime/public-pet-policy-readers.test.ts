/// <reference types="jest" />
/**
 * One reading of Cotality's PetsAllowed on every public surface (lib/search/pet-policy.ts).
 *
 * Found 2026-10-09 by the second review Maya pasted: the pet-friendly filter was the substring test `!value.includes("no") || value.includes("catsok") || value.includes("dogsok")`, written out in
 * four places (the DB post-filter, the Trestle post-filter, and twice in the search projection), so NoPetRestrictions, NoBreedRestrictions, NoSizeLimit and NoDogs were read as "no pets"; the listing
 * page and the building pages each had a reading of their own besides. Maya's answers of 2026-10-09: NoDogs counts as pet-friendly.
 *
 * This file holds the readers to each other: for every live PetsAllowed member (the committed mirror of the live metadata) the Trestle path, the DB path, the search projection and the listing
 * page must give the verdict allowsPets gives, and none of them may keep a reading of its own.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/sentry-report', () => ({ __esModule: true, reportApiError: jest.fn() }));

import { filterPetFriendlyRaw } from '@/app/api/listings/route';
import { applyPublicListingPostFilters } from '@/lib/search/public-listing-db';
import { extractProjectionAmenityKeys, extractProjectionFeatureFlags } from '@/lib/search/listing-search-projection';
import { allowsPets, petPolicyView } from '@/lib/search/pet-policy';
import { AMENITY_FIELD_MAP } from '@/lib/search/types';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** the file's code without its comments, so a comment may talk about the old substring test */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const LIVE: string[] = JSON.parse(read('data/cotality-enums.live.json')).enums.PetsAllowed;
const PET_FRIENDLY = new URLSearchParams('amenities=pet-friendly');

/** a PetsAllowed value as each source holds it: the string, and the list */
const SHAPES: Array<[string, (member: string) => unknown]> = [
  ['a string', (member) => member],
  ['a list', (member) => [member]],
];

describe('the Trestle path, the DB path and the search projection give one verdict per live member', () => {
  describe.each(SHAPES)('PetsAllowed held as %s', (_shape, hold) => {
    it.each(LIVE)('%s', (member) => {
      const expected = allowsPets(member);
      const value = hold(member);
      // Trestle path: a raw record
      expect(filterPetFriendlyRaw([{ PetsAllowed: value }])).toHaveLength(expected ? 1 : 0);
      // DB path: the DTO's petsAllowed is a string, the features JSON may hold the list
      const viaFeatures = applyPublicListingPostFilters([{ id: 'x', petsAllowed: null }] as never, new Map([['x', { PetsAllowed: value }]]), PET_FRIENDLY);
      expect(viaFeatures).toHaveLength(expected ? 1 : 0);
      // search projection: the amenity key and the flag
      const features = { PetsAllowed: value };
      expect((extractProjectionAmenityKeys({ listing_id: 'X', features }) ?? []).includes('pet-friendly')).toBe(expected);
      expect(extractProjectionFeatureFlags({ listing_id: 'X', features })?.is_pet_friendly).toBe(expected);
    });
  });

  it.each(LIVE)('%s: the DTO string is read the same way (DB path)', (member) => {
    const kept = applyPublicListingPostFilters([{ id: 'x', petsAllowed: member }] as never, new Map(), PET_FRIENDLY);
    expect(kept).toHaveLength(allowsPets(member) ? 1 : 0);
  });

  // Records that hold several answers, with the verdict WRITTEN OUT here (not computed by the module under test): every reader must give it, whether the answers are one string or a list.
  // An explicit no stands unless another answer positively lets a pet in (the code review of 2026-10-09 ran `No,Other` as pet-friendly). UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED
  // for how the RLS data rules read a record that says both.
  it.each([
    ['No,Other', false],
    ['BuildingNo,Other', false],
    ['No,SeeRemarks', false],
    ['No,Call', false],
    ['No,NoDogs', false],
    ['BuildingNo,CatsOk', true],
    ['No,Yes', true],
    ['NoDogs,Other', true],
    ['Call,SeeRemarks', true],
  ])('%j: every reader says pet-friendly is %j', (value, expected) => {
    for (const held of [value, value.split(',')]) {
      expect(filterPetFriendlyRaw([{ PetsAllowed: held }])).toHaveLength(expected ? 1 : 0);
      expect(applyPublicListingPostFilters([{ id: 'x', petsAllowed: null }] as never, new Map([['x', { PetsAllowed: held }]]), PET_FRIENDLY)).toHaveLength(expected ? 1 : 0);
      expect((extractProjectionAmenityKeys({ listing_id: 'X', features: { PetsAllowed: held } }) ?? []).includes('pet-friendly')).toBe(expected);
      expect(extractProjectionFeatureFlags({ listing_id: 'X', features: { PetsAllowed: held } })?.is_pet_friendly).toBe(expected);
    }
    expect(applyPublicListingPostFilters([{ id: 'x', petsAllowed: value }] as never, new Map(), PET_FRIENDLY)).toHaveLength(expected ? 1 : 0);
  });

  it.each([[true], [5], [{}], [[['CatsOk']]], [['No', 5]]])('%j is no answer on every path (the DB path used to turn it into a string first, so it kept some of these)', (odd) => {
    expect(filterPetFriendlyRaw([{ PetsAllowed: odd }])).toHaveLength(0);
    expect(applyPublicListingPostFilters([{ id: 'x', petsAllowed: null }] as never, new Map([['x', { PetsAllowed: odd }]]), PET_FRIENDLY)).toHaveLength(0);
    expect((extractProjectionAmenityKeys({ listing_id: 'X', features: { PetsAllowed: odd } }) ?? []).includes('pet-friendly')).toBe(false);
  });

  it.each(LIVE)('%s: whenever the listing page shows a pet policy, its verdict is the one the table of live members gives', (member) => {
    const verdict = member !== 'No' && member !== 'BuildingNo';
    const view = petPolicyView(member);
    if (view) expect(view.allowed).toBe(verdict);
  });

  it('exactly No and BuildingNo are left out of a Trestle pet-friendly search of every live member', () => {
    const kept = filterPetFriendlyRaw(LIVE.map((member) => ({ id: member, PetsAllowed: member }))).map((r) => r.id);
    expect(LIVE.filter((member) => !kept.includes(member)).sort()).toEqual(['BuildingNo', 'No']);
  });

  it('a Trestle record holds the answers as the comma-joined string or the list, and a record with no answer is not kept', () => {
    const records = [
      { id: 'string', PetsAllowed: 'Yes,CatsOk' },
      { id: 'list', PetsAllowed: ['BuildingNo', 'DogsOk'] },
      { id: 'no', PetsAllowed: 'No' },
      { id: 'list-no', PetsAllowed: ['BuildingNo'] },
      { id: 'empty', PetsAllowed: '' },
      { id: 'null', PetsAllowed: null },
      { id: 'absent' },
    ];
    expect(filterPetFriendlyRaw(records).map((r) => r.id)).toEqual(['string', 'list']);
  });
});

describe('the pet-friendly amenity of the search contract names live members', () => {
  it('every value listed for it is a live PetsAllowed member that lets pets in', () => {
    const { field, values } = AMENITY_FIELD_MAP['pet-friendly'];
    expect(field).toBe('PetsAllowed');
    for (const value of values) {
      expect(LIVE).toContain(value);
      expect(allowsPets(value)).toBe(true);
    }
  });
});

describe('no reader keeps a reading of its own', () => {
  const READERS = [
    'app/api/listings/route.ts',
    'lib/search/public-listing-db.ts',
    'lib/search/listing-search-projection.ts',
    'app/listing/[...slug]/page.tsx',
    'lib/buildings/public-building-data.ts',
    'app/components/CompareProperties.tsx',
  ];

  it.each(READERS)('%s reads the pet answers through lib/search/pet-policy', (file) => {
    expect(read(file)).toMatch(/from ['"]@\/lib\/search\/pet-policy['"]/);
  });

  it.each(READERS)('%s has no substring test of a pet answer left in its code', (file) => {
    const src = code(file);
    expect(src).not.toMatch(/includes\((['"])no\1\)/);
    expect(src).not.toMatch(/includes\((['"])(catsok|dogsok)\1\)/);
    expect(src).not.toMatch(/includes\((['"])(no pets|not allowed)\1\)/);
  });

  it('the Trestle path of the listings route filters through filterPetFriendlyRaw, and the DB path and the projection through allowsPets', () => {
    expect(code('app/api/listings/route.ts')).toMatch(/amenityFiltered = filterPetFriendlyRaw\(amenityFiltered\)/);
    expect(code('lib/search/public-listing-db.ts')).toMatch(/allowsPets\(/);
    expect(code('lib/search/listing-search-projection.ts').match(/allowsPets\(/g)).toHaveLength(2);
  });

  it('the listing page shows petPolicyView, the building pages petPolicyLabels, the compare table formatPetPolicy', () => {
    const page = code('app/listing/[...slug]/page.tsx');
    expect(page).toMatch(/const petView = petPolicyView\(listing\.petsAllowedDetail\);/);
    expect(page).toMatch(/const petPolicy = petView\?\.label \?\? '';/);
    expect(page).toMatch(/\{ASSISTANCE_ANIMAL_NOTE\}/);
    expect(page).not.toMatch(/petsAllowed \?/);   // no tick or cross: the page marks nothing (compliance review of 2026-10-09)
    expect(code('lib/buildings/public-building-data.ts')).toMatch(/petPolicyLabels\(buildingInfo\.petsAllowed\)/);
    expect(code('app/components/CompareProperties.tsx')).toMatch(/formatPetPolicy\(l\.detail\?\.petsAllowed\)/);
  });
});
