/// <reference types="jest" />
/**
 * The building page reads only the building's own pet answers (lib/buildings/public-building-data.ts).
 *
 * A source guard in the style of tests/runtime/public-pet-policy-readers.test.ts: extractBuildingInfo is not exported and the module opens a database client and calls Cotality, so the
 * behaviour is held by lib/search/__tests__/pet-policy-building.test.ts (the two functions) and this file holds that the building page really goes through them. Without it the old line
 * `setList('petsAllowed', r.PetsAllowed)` could come back unnoticed, and a building would again read one apartment's own "No" as its policy.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const FILE = 'lib/buildings/public-building-data.ts';
/** the file's code without its comments, so a comment may talk about the old line */
const code = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the building page keeps only the building\'s own pet answers', () => {
  const src = code(FILE);

  it('takes them from the records through buildingPetAnswersOf', () => {
    expect(src).toMatch(/import \{[^}]*\bbuildingPetAnswersOf\b[^}]*\} from '@\/lib\/search\/pet-policy'/);
    expect(src).toMatch(/info\.petsAllowed = buildingPetAnswersOf\(records\);/);
  });

  it('no longer takes a record\'s whole PetsAllowed list as the building\'s', () => {
    expect(src).not.toMatch(/setList\('petsAllowed'/);
    expect(src).not.toMatch(/info\.petsAllowed = parseList/);
  });

  it('still shows them in the shared words', () => {
    expect(src).toMatch(/petPolicyLabels\(buildingInfo\.petsAllowed\)/);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
