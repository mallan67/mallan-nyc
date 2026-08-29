/**
 * GENERATE the Search projection of the registry: the persistence vocabulary AND
 * the value shape of each criterion.
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
 * Drift is impossible because the check is "regenerate and compare" — and the
 * fix for a failure is to run the generator, never to hand-edit the output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ONE GENERATOR AND NOT TWO
 *
 * Keys and shapes are two projections of the SAME registry lines. Splitting them
 * into two scripts would duplicate the parse — and a second copy of "how to read
 * a registry entry" is the same defect class in the tooling that the registry
 * itself exists to remove. One parse, one output file, one `--check`.
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

/**
 * The declared `type` decides the value shape. This table is the ONLY place the
 * mapping lives, so a new registry type fails loudly here rather than silently
 * producing a criterion nothing knows how to validate.
 */
const SHAPE_BY_TYPE = {
  money: 'range_number',
  number: 'range_number',
  date: 'range_date',
  // A CLOSED vocabulary: every member is checked against a known set, and an
  // unrecognised one is refused rather than dropped.
  enum: 'enum_set',
  multi_enum: 'enum_set',
  // An OPEN list — a set of free values with no vocabulary to check against.
  // `listing_id_canonical` is the case: a multi-ID lookup where the members are
  // provider keys, not a picklist.
  array: 'text_set',
  string: 'text',
  boolean: 'boolean',
  geo: 'geo',
};

const TS_TYPE_BY_SHAPE = {
  range_number: 'RangeValue<number>',
  range_date: 'RangeValue<string>',
  basis_range_date: 'BasisRangeValue<string>',
  enum_set: 'SetValue',
  text_set: 'SetValue',
  text: 'string',
  boolean: 'boolean',
  geo: 'GeoValue',
};

export function deriveCriteria() {
  const src = readFileSync(REGISTRY, 'utf8');
  const found = new Map();
  for (const line of src.split('\n')) {
    const key = /canonicalKey:\s*'([^']+)'/.exec(line);
    if (!key) continue;
    // `searchParams:` present (possibly empty) marks a Search criterion.
    if (!/searchParams:\s*\[/.test(line)) continue;
    if (found.has(key[1])) continue;

    const type = /[^A-Za-z]type:\s*'([^']+)'/.exec(line)?.[1];
    if (!type) throw new Error(`registry entry "${key[1]}" declares no type`);
    let shape = SHAPE_BY_TYPE[type];
    if (!shape) throw new Error(`no value shape declared for registry type "${type}" (${key[1]})`);

    // A declared basis vocabulary promotes a plain range to a composite: the
    // same bounds mean different provider facts depending on the basis.
    const basis = /valueBasis:\s*\[([^\]]*)\]/.exec(line)?.[1];
    const bases = basis ? [...basis.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    if (bases.length > 0) {
      if (shape !== 'range_date') {
        throw new Error(`valueBasis on "${key[1]}" but its type (${type}) is not a date range`);
      }
      shape = 'basis_range_date';
    }

    const label = /uiLabel:\s*'([^']+)'/.exec(line)?.[1] ?? key[1];
    found.set(key[1], { key: key[1], shape, bases, label, type });
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function render(criteria) {
  const keys = criteria.map((c) => c.key);
  const withBases = criteria.filter((c) => c.bases.length > 0);

  const header = [
    '/**',
    ' * GENERATED FILE — DO NOT EDIT.',
    ' *',
    ' * Source of truth: the entries in `field-registry.ts`. A registry entry is a',
    ' * Search criterion when it declares `searchParams`, and its persistence key IS',
    ' * its `canonicalKey` — one concept, one name, range bounds carried in the value',
    ' * rather than split across two keys.',
    ' *',
    ' * Regenerate:  node scripts/search/generate-filter-keys.mjs',
    ' * Verified by: lib/search/__tests__/one-search-mapping-authority.test.ts',
    ' *',
    ' * `sort` is deliberately absent. Ordering is not a filter, and',
    ' * `SavedSearchCriteria` carries `sort` as its own field; admitting it here would',
    ' * let `filters.sort` and `sort` disagree — two sort truths in one object.',
    ' */',
  ].join('\n');

  const shapeDoc = [
    '/**',
    ' * Derived from each entry\'s declared `type`, so a criterion cannot exist without',
    ' * a known value shape. `satisfies` makes the map exhaustive at compile time: a',
    ' * key present in the vocabulary but missing here is a type error, not a runtime',
    ' * `undefined` that would skip validation and let the value through unchecked.',
    ' */',
  ].join('\n');

  const valuesDoc = [
    '/**',
    ' * The canonical criteria object: one optional property per business concept,',
    ' * typed by its value shape.',
    ' *',
    ' * Optional means UNFILTERED. It does not mean "absent because something dropped',
    ' * it" — the value contract refuses empty and malformed values rather than',
    ' * letting them decay into absence, because an absent criterion silently WIDENS',
    ' * the result set.',
    ' */',
  ].join('\n');

  return `${header}
import type {
  BasisRangeValue,
  GeoValue,
  RangeValue,
  SetValue,
} from './criteria-values';

export const CANONICAL_FILTER_KEYS = [
${keys.map((k) => `  '${k}',`).join('\n')}
] as const;

export type CanonicalFilterKeyName = (typeof CANONICAL_FILTER_KEYS)[number];

/** How a criterion's value is structured — what a validator dispatches on. */
export type CriterionValueShape =
  | 'range_number'
  | 'range_date'
  | 'basis_range_date'
  | 'enum_set'
  | 'text_set'
  | 'text'
  | 'boolean'
  | 'geo';

${shapeDoc}
export const CRITERION_VALUE_SHAPE = {
${criteria.map((c) => `  ${c.key}: '${c.shape}',`).join('\n')}
} as const satisfies Record<CanonicalFilterKeyName, CriterionValueShape>;

/**
 * The closed basis vocabulary for composite criteria. Empty for every criterion
 * whose bounds mean exactly one provider fact.
 */
export const CRITERION_VALUE_BASES: Partial<Record<CanonicalFilterKeyName, readonly string[]>> = {
${withBases.map((c) => `  ${c.key}: [${c.bases.map((b) => `'${b}'`).join(', ')}],`).join('\n')}
};

${valuesDoc}
export interface CanonicalCriteriaValues {
${criteria
  .map(
    (c) =>
      `  /** ${c.label} — ${c.type}${c.bases.length ? ` (basis: ${c.bases.join(' | ')})` : ''} */\n  ${c.key}?: ${TS_TYPE_BY_SHAPE[c.shape]};`,
  )
  .join('\n')}
}
`;
}

const criteria = deriveCriteria();
const text = render(criteria);

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== text) {
    console.error(
      'filter-keys.generated.ts is STALE. Run: node scripts/search/generate-filter-keys.mjs',
    );
    process.exit(1);
  }
  console.log(`filter-keys.generated.ts is current (${criteria.length} criteria).`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${criteria.length} canonical criteria (keys + value shapes)`);
}
