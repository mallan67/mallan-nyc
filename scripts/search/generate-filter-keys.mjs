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
 * The input shape is DECLARED on each entry, never derived from `type`.
 *
 * It used to be derived, and that conflated two different questions: "what kind
 * of fact is this on a listing" and "what may a broker type into this control".
 * Deriving forced `type` to be rewritten to describe the UI —
 * `listing_id_canonical` became `array` because the Search box accepts several
 * IDs, when one listing has exactly ONE canonical identifier. The registry ended
 * up lying about the domain in order to describe a control.
 *
 * A Search criterion with no declared shape is a hard error below, so a new
 * entry cannot inherit a silent default.
 */
/**
 * READ from the leaf module rather than restated here.
 *
 * The first draft of this line was a literal with a comment saying it "mirrors"
 * `search-workflow.ts` — which is a second declaration and a promise to keep it
 * in step by hand. That is the precise failure this whole generator exists to
 * end, reintroduced in the generator itself.
 */
const WORKFLOWS = (() => {
  const src = readFileSync(resolve(REPO, 'lib/search/canonical/search-workflow.ts'), 'utf8');
  const list = /SEARCH_WORKFLOWS = \[([^\]]*)\]/.exec(src);
  if (!list) throw new Error('cannot read SEARCH_WORKFLOWS from search-workflow.ts');
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

const VALID_SHAPES = new Set([
  'range_number',
  'range_date',
  'basis_range_date',
  'enum_set',
  'text_set',
  'text',
  'boolean',
  'geo',
]);

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

    const shape = /criterionValueShape:\s*'([^']+)'/.exec(line)?.[1];
    if (!shape) {
      throw new Error(
        `Search criterion "${key[1]}" declares no criterionValueShape. It is NOT inferred from ` +
          `type — declare what a broker may type into the control.`,
      );
    }
    if (!VALID_SHAPES.has(shape)) {
      throw new Error(`criterion "${key[1]}" declares unknown shape "${shape}"`);
    }

    const basis = /valueBasis:\s*\[([^\]]*)\]/.exec(line)?.[1];
    const bases = basis ? [...basis.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    // The two declarations must agree in BOTH directions: a composite with no
    // vocabulary would accept any basis, and a basis vocabulary on a
    // non-composite is a value nothing would ever read.
    if (shape === 'basis_range_date' && bases.length === 0) {
      throw new Error(`"${key[1]}" is a basis range but declares no valueBasis vocabulary`);
    }
    if (shape !== 'basis_range_date' && bases.length > 0) {
      throw new Error(`"${key[1]}" declares valueBasis but its shape is "${shape}"`);
    }

    // `enum_set` claims membership is CHECKED, which is only true if something
    // owns the members. Without an owner, every consumer supplies its own
    // allowed list and the translation tables multiply again.
    const owner = /vocabularyOwner:\s*'([^']+)'/.exec(line)?.[1] ?? null;
    if (shape === 'enum_set' && !owner) {
      throw new Error(
        `"${key[1]}" is an enum_set but names no vocabularyOwner — a closed vocabulary with no ` +
          `owner cannot be checked, and each consumer would restate its own allowed list.`,
      );
    }
    if (shape !== 'enum_set' && owner) {
      throw new Error(`"${key[1]}" names a vocabularyOwner but its shape is "${shape}"`);
    }

    // Applicability is REQUIRED. A criterion that belongs to no workflow would
    // silently vanish from all four contracts while still existing everywhere
    // else — present in the vocabulary, absent from every surface that could use
    // it, and invisible in the diff that caused it.
    const wf = /workflows:\s*\[([^\]]*)\]/.exec(line)?.[1];
    const workflows = wf ? [...wf.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    if (workflows.length === 0) {
      throw new Error(
        `Search criterion "${key[1]}" declares no workflows — it would be absent from all four ` +
          `workflow contracts while still existing in the vocabulary.`,
      );
    }
    const unknownWorkflow = workflows.filter((w) => !WORKFLOWS.includes(w));
    if (unknownWorkflow.length > 0) {
      throw new Error(`"${key[1]}" names unknown workflow(s): ${unknownWorkflow.join(', ')}`);
    }

    const label = /uiLabel:\s*'([^']+)'/.exec(line)?.[1] ?? key[1];
    found.set(key[1], { key: key[1], shape, bases, label, type, owner, workflows });
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
  CriterionValueShape,
  GeoValue,
  RangeValue,
  SetValue,
} from './criteria-values';
import type { SearchWorkflow } from './search-workflow';

export type { CriterionValueShape };

export const CANONICAL_FILTER_KEYS = [
${keys.map((k) => `  '${k}',`).join('\n')}
] as const;

export type CanonicalFilterKeyName = (typeof CANONICAL_FILTER_KEYS)[number];

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

/**
 * The ONE canonical module owning each closed vocabulary.
 *
 * A workflow contract asks this map who owns a criterion's members and consumes
 * that module. It must never carry its own \`allowed\` array — four workflow
 * validators with four private lists is four new translation tables, which is
 * precisely the split this registry exists to remove.
 *
 * Only \`enum_set\` criteria appear. \`text_set\` criteria are OPEN by design:
 * \`neighborhood\` passes an unrecognised name through as a literal
 * SubdivisionName, so there is no closed vocabulary to own yet.
 */
export const CRITERION_VOCABULARY_OWNER: Partial<Record<CanonicalFilterKeyName, string>> = {
${criteria
  .filter((c) => c.owner)
  .map((c) => `  ${c.key}: '${c.owner}',`)
  .join('\n')}
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

/**
 * WHICH canonical criteria each workflow may offer.
 *
 * This is the ONLY question the four workflow contracts answer. They do not
 * redefine a criterion's type, its value shape, its allowed vocabulary, its
 * Cotality mapping, or its execution semantics — each of those already has
 * exactly one owner, and a workflow restating any of them would recreate the
 * per-surface divergence this registry exists to remove.
 */
export const WORKFLOW_CRITERIA = {
${WORKFLOWS.map(
  (w) =>
    `  ${w}: [\n${criteria
      .filter((c) => c.workflows.includes(w))
      .map((c) => `    '${c.key}',`)
      .join('\n')}\n  ],`,
).join('\n')}
} as const satisfies Record<SearchWorkflow, readonly CanonicalFilterKeyName[]>;

${WORKFLOWS.map((w) => {
  const name = `${w[0].toUpperCase()}${w.slice(1)}Criteria`;
  const keys = criteria.filter((c) => c.workflows.includes(w)).map((c) => c.key);
  return `/**
 * ${name} — a PROJECTION of \`CanonicalCriteriaValues\`, not a new contract.
 *
 * Every property keeps the canonical identity, value shape and refusal
 * behaviour it has everywhere else. \`Pick\` is deliberate: a hand-written
 * interface here could drift in a way this cannot.
 */
export type ${name} = Pick<
  CanonicalCriteriaValues,
${keys.map((k) => `  | '${k}'`).join('\n')}
>;`;
}).join('\n\n')}
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
