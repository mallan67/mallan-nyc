/**
 * Every provider field list the runtime sends to Cotality must be built through the compile-checked
 * contract (`cotalityFields(resource, [...])`), never as a bare string array.
 *
 * WHY: a bare array is where phantoms live. `cotalityFields` makes each name a type error unless it
 * is declared in the live $metadata for that resource — the compiler, not an agent's memory, is the
 * authority. This test pins the binding sites so a refactor cannot quietly regress to bare strings.
 *
 * Sites (each named because each has produced a real defect):
 *   - lib/idx/trestle-mapper.ts   every B<n>_* category list (the IDX Plus $select + the pick() maps)
 *   - lib/idx/fetch.ts            the Media $expand inner $select and fetchListingMedia's $select
 *   - lib/search/engine/hydrate.ts MEDIA_SELECT
 *   - lib/idx/media-sync.ts       the two Media/Property $select literals
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('trestle-mapper.ts — every B<n> category list is compile-checked', () => {
  const src = read('lib/idx/trestle-mapper.ts');

  it('imports cotalityFields from the contract', () => {
    expect(src).toMatch(/import \{[^}]*\bcotalityFields\b[^}]*\} from ['"]@\/lib\/cotality\/contract['"]/);
  });

  it('declares no bare-array B<n>_ list', () => {
    const bare = [...src.matchAll(/^(?:export )?const (B\d+_[A-Z_]+)\s*(?::[^=]+)?=\s*\[/gm)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it('declares every B<n>_ list through cotalityFields("Property", [...])', () => {
    const typed = [...src.matchAll(/^(?:export )?const (B\d+_[A-Z_]+)\s*=\s*cotalityFields\(["']Property["'],\s*\[/gm)].map((m) => m[1]);
    // The mapper has carried 28 categories (B1–B27, B29) since Packet 2; fewer means a list was lost.
    expect(typed.length).toBeGreaterThanOrEqual(28);
  });
});

describe('Media $select literals are compile-checked', () => {
  it('lib/idx/fetch.ts builds both Media selects from cotalityFields("Media", [...])', () => {
    const src = read('lib/idx/fetch.ts');
    expect(src).toMatch(/cotalityFields\(["']Media["'],\s*\[/);
    // No bare comma-joined Media select literal may remain.
    expect(src).not.toMatch(/"\$select",\s*"MediaKey,MediaURL/);
    expect(src).not.toMatch(/Media\(\$select=MediaURL,MediaCategory/);
  });

  it('lib/search/engine/hydrate.ts builds MEDIA_SELECT from cotalityFields("Media", [...])', () => {
    const src = read('lib/search/engine/hydrate.ts');
    expect(src).toMatch(/const MEDIA_SELECT\s*=\s*cotalityFields\(["']Media["'],\s*\[/);
  });

  it('lib/idx/media-sync.ts builds its $select lists from cotalityFields', () => {
    const src = read('lib/idx/media-sync.ts');
    const bareSelects = [...src.matchAll(/"\$select",\s*\n?\s*"([A-Za-z,]+)"/g)].map((m) => m[1]);
    expect(bareSelects).toEqual([]);
    expect(src).toMatch(/cotalityFields\(["']Media["'],\s*\[/);
  });
});
