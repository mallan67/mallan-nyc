/**
 * GENERATE the persistence vocabulary FROM the registry entries.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN A HAND-WRITTEN LIST
 *
 * The first attempt at single-sourcing put a literal `CANONICAL_FILTER_KEYS`
 * array in `field-registry.ts` beside the entries, with a test forcing the two to
 * agree. That is **two declarations plus a drift detector**, not one declaration
 * everything derives from — exactly the "update one table, forget the other"
 * cycle this workstream exists to end.
 *
 * The second attempt derived the union at the TYPE level with a `const` generic
 * factory. TypeScript's inference gives up on 69 heterogeneous literal entries
 * and collapses the union to `never`. Fighting the compiler for that was not
 * worth a fragile result.
 *
 * Codegen is the honest answer. The registry entries are the ONE declaration.
 * This script derives the vocabulary from them and writes
 * `filter-keys.generated.ts`, which gives full compile-time narrowing. Drift is
 * impossible because the check is "regenerate and compare" — and the fix for a
 * failure is to run the generator, never to hand-edit the output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A PERSISTENCE KEY
 *
 * A registry entry is a Search criterion when it declares `searchParams` — even
 * an EMPTY array, which means "a real criterion with no wire param today"
 * (`max_financing_percent`). Its persistence key IS its `canonicalKey`: one
 * concept, one name, bounds carried in the value.
 *
 * `sort` is deliberately NOT here. Result ordering is not a filter, and
 * `SavedSearchCriteria` already carries `sort` as its own field — admitting it
 * to the filter vocabulary would allow `filters.sort` and `sort` to disagree,
 * which is two sort truths in one object.
 *
 * Run: node scripts/search/generate-filter-keys.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY = resolve(REPO, 'lib/search/canonical/field-registry.ts');
const OUT = resolve(REPO, 'lib/search/canonical/filter-keys.generated.ts');

export function deriveKeys() {
  const src = readFileSync(REGISTRY, 'utf8');
  const keys = [];
  for (const line of src.split('\n')) {
    const key = /canonicalKey:\s*'([^']+)'/.exec(line);
    if (!key) continue;
    // `searchParams:` present (possibly empty) marks a Search criterion.
    if (!/searchParams:\s*\[/.test(line)) continue;
    if (!keys.includes(key[1])) keys.push(key[1]);
  }
  return keys.sort();
}

export function render(keys) {
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: the entries in \`field-registry.ts\`. A registry entry is a
 * Search criterion when it declares \`searchParams\`, and its persistence key IS
 * its \`canonicalKey\` — one concept, one name, range bounds carried in the value
 * rather than split across two keys.
 *
 * Regenerate:  node scripts/search/generate-filter-keys.mjs
 * Verified by: lib/search/__tests__/one-search-mapping-authority.test.ts
 *
 * \`sort\` is deliberately absent. Ordering is not a filter, and
 * \`SavedSearchCriteria\` carries \`sort\` as its own field; admitting it here would
 * let \`filters.sort\` and \`sort\` disagree — two sort truths in one object.
 */

export const CANONICAL_FILTER_KEYS = [
${keys.map((k) => `  '${k}',`).join('\n')}
] as const;

export type CanonicalFilterKeyName = (typeof CANONICAL_FILTER_KEYS)[number];
`;
}

const keys = deriveKeys();
const text = render(keys);

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== text) {
    console.error('filter-keys.generated.ts is STALE. Run: node scripts/search/generate-filter-keys.mjs');
    process.exit(1);
  }
  console.log(`filter-keys.generated.ts is current (${keys.length} keys).`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${keys.length} canonical filter keys`);
}
