/**
 * Domain 6 (2026-09-08) — the rental vocabularies join the ONE vocabulary authority chain:
 *   data/cotality-enums.live.json → canonical/live-truth.ts → engine/criteria.ts → engine/contract.ts
 * Set equality on every link; the pet-friendly shorthand is a declared policy subset of the live members.
 */
import * as live from '@/lib/search/canonical/live-truth';
import { FURNISHED_MEMBERS, PETS_ALLOWED_MEMBERS, EXECUTED_PARAMS } from '@/lib/search/engine/criteria';
import { searchContract } from '@/lib/search/engine/contract';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FILE = require('../../../data/cotality-enums.live.json') as { enums: Record<string, string[]> };
const sorted = (xs: readonly string[]) => [...xs].sort();

describe('live file → live-truth (set equality)', () => {
  test.each([
    ['Furnished', live.FURNISHED_MEMBERS],
    ['PetsAllowed', live.PETS_ALLOWED_MEMBERS],
  ])('%s', (field, members) => {
    expect(sorted(members)).toEqual(sorted(FILE.enums[field]));
  });
  test('the pet-friendly shorthand is a subset of the live PetsAllowed members and names only unit-level positives', () => {
    for (const m of live.PETS_FRIENDLY_MEMBERS) expect(live.PETS_ALLOWED_MEMBERS).toContain(m);
    expect(sorted(live.PETS_FRIENDLY_MEMBERS)).toEqual(sorted(['Yes', 'CatsOk', 'DogsOk', 'NumberLimit', 'SizeLimit', 'BreedRestrictions']));
  });
});

describe('live-truth → executor → contract', () => {
  test('the executor carries the same members', () => {
    expect(sorted(FURNISHED_MEMBERS.map(([t]) => t))).toEqual(sorted(live.FURNISHED_MEMBERS));
    expect(sorted(PETS_ALLOWED_MEMBERS.map(([t]) => t))).toEqual(sorted(live.PETS_ALLOWED_MEMBERS));
  });
  test('the contract publishes the rental vocabularies, the shorthand and the parameters', () => {
    const c = searchContract();
    expect(sorted(c.members.Furnished.map((m) => m.token))).toEqual(sorted(live.FURNISHED_MEMBERS));
    expect(sorted(c.members.PetsAllowed.map((m) => m.token))).toEqual(sorted(live.PETS_ALLOWED_MEMBERS));
    expect(sorted(c.petsFriendlyMembers)).toEqual(sorted(live.PETS_FRIENDLY_MEMBERS));
    for (const p of ['furnished', 'pets', 'availableBy', 'maxDeposit']) expect(EXECUTED_PARAMS.has(p)).toBe(true);
    expect(c.rentalOnlyParams.sort()).toEqual(['AvailabilityDate', 'Furnished', 'PetsAllowed', 'SecurityDeposit', 'availableBy', 'furnished', 'maxDeposit', 'pets']);
  });
});
