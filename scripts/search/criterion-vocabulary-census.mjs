/**
 * HOW MANY VOCABULARIES DOES ONE SEARCH CRITERION HAVE?
 *
 * Section 4 (B1) says the canonical criteria object must not become another
 * parallel truth, and the Step 1 gate requires Saved Search persistence
 * ownership to be TRACED first so B1 does not create a second persistence
 * contract. This measures what is actually there before anything is designed.
 *
 * Eight vocabularies describe the same authenticated Search criteria today:
 *
 *   1. DOM element ids            mode- and tab-dependent, per criterion
 *   2. `criteria.*`               camelCase, the collector's output
 *   3. request params             `minPrice`, `maxBeds`, … the wire
 *   4. server reads               `params.get(...)` + the numeric table
 *   5. FIELD_REGISTRY             canonicalKey / searchParams (joined in B2)
 *   6. CanonicalFilterKey         filter-keys.ts — its own header says NOT WIRED
 *   7. saved-record snake_case    `_criteriaToApiFormat` → SavedSearch.criteria
 *   8. SavedSearchCriteria        versioned {criteria_version, filters, sort}
 *
 * 7 and 8 are TWO PERSISTENCE CONTRACTS for one saved search: the browser
 * writes 7, and the validators in saved-search.ts expect 8, which is keyed by 6.
 *
 * The question this answers per criterion is not "does a vocabulary mention it"
 * but "can each layer EXPRESS it at all" — because a criterion the persistence
 * vocabulary cannot name is a criterion a saved search silently cannot keep.
 *
 * READ-ONLY. Parses source. No network, no database, no Cotality.
 * Run: node scripts/search/criterion-vocabulary-census.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

const searchEngine = read('public/crm/js/search/search-engine.js');
const savedSearches = read('public/crm/js/search/saved-searches.js');
const filterKeys = read('lib/search/canonical/filter-keys.ts');
const registry = read('lib/search/canonical/field-registry.ts');
const crmFilter = read('lib/search/crm-idx-filter.ts');

function slice(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  if (start === -1) throw new Error(`missing: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  return src.slice(start, end === -1 ? src.length : end);
}

// ── 2. what the collector produces ──────────────────────────────────────────
const collectorBody = slice(searchEngine, 'function collectSearchCriteria', '\n        }\n');
const collected = new Set(
  [...collectorBody.matchAll(/criteria\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]),
);
collected.delete('searchTab'); // a workflow selector, not a criterion

// ── 3. what the serializer emits ────────────────────────────────────────────
const serializerBody = slice(searchEngine, 'window.buildIdxSearchParams = function', '\n        };');
const emitted = new Set(
  [...serializerBody.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]),
);

/**
 * criteria key → the param it becomes.
 *
 * Extracted per GUARDED BLOCK, not by proximity. A consuming regex across the
 * whole body pairs each criterion with the NEXT guard's assignment — it read
 * `priceMin → maxPrice` and `bathsMax → neighborhood`, an off-by-one that made
 * every row plausible and wrong. Brace-match each `if (criteria.X …)` and read
 * the assignments inside that block only.
 */
const criterionToParam = new Map();
for (const guard of serializerBody.matchAll(/if \(criteria\.([A-Za-z_]\w*)/g)) {
  const from = guard.index;
  const braceAt = serializerBody.indexOf('{', from);
  const lineEnd = serializerBody.indexOf('\n', from);
  let block;
  if (braceAt !== -1 && braceAt < lineEnd) {
    let depth = 0;
    let i = braceAt;
    for (; i < serializerBody.length; i++) {
      if (serializerBody[i] === '{') depth++;
      else if (serializerBody[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    block = serializerBody.slice(from, i + 1);
  } else {
    block = serializerBody.slice(from, lineEnd === -1 ? serializerBody.length : lineEnd);
  }
  // A guard may test one criterion and assign from another (`beds` fallback),
  // so record every criteria key the block reads against the param it assigns.
  const assigned = [...block.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]);
  if (assigned.length === 0) continue;
  for (const c of new Set([...block.matchAll(/criteria\.([A-Za-z_]\w*)/g)].map((m) => m[1]))) {
    if (!criterionToParam.has(c)) criterionToParam.set(c, assigned[0]);
  }
}

/**
 * Second pass: a criterion may reach the wire through a LOCAL variable rather
 * than a guard — `checkboxFilters` is read into `_cbForWire`, validated, then
 * assigned. Reporting it as unserialized would be a false finding, so pair by
 * name when the serializer emits a param of the same name.
 */
for (const key of collected) {
  if (criterionToParam.has(key)) continue;
  if (emitted.has(key) && serializerBody.includes(`criteria.${key}`)) {
    criterionToParam.set(key, key);
  }
}

// ── 4. what the server reads ────────────────────────────────────────────────
const serverReads = new Set([
  ...[...crmFilter.matchAll(/params\.get\("([A-Za-z_]\w*)"\)/g)].map((m) => m[1]),
  ...[...crmFilter.matchAll(/\["(min[A-Za-z]+|max[A-Za-z]+)"/g)].map((m) => m[1]),
]);

// ── 5. registry join key ────────────────────────────────────────────────────
const registryParams = new Set();
for (const m of registry.matchAll(/searchParams:\s*\[([^\]]*)\]/g)) {
  for (const raw of m[1].split(',')) {
    const v = raw.trim().replace(/^'|'$/g, '');
    if (v) registryParams.add(v);
  }
}

// ── 6. the (unwired) canonical filter vocabulary ────────────────────────────
const canonicalKeys = new Set(
  [...slice(filterKeys, 'const CANONICAL_KEYS', '])').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
);
const paramAliases = new Map(
  [...slice(filterKeys, 'const PARAM_ALIASES', '});').matchAll(
    /(\w+):\s*'([a-z_]+)'/g,
  )].map((m) => [m[1], m[2]]),
);

// ── 7. what the browser actually persists ───────────────────────────────────
const savedRecordBody = slice(savedSearches, 'function _criteriaToApiFormat', '\n            return out;');
/** saved-record field → the `criteria.*` key it came from. */
const savedFromCriterion = new Map();
for (const m of savedRecordBody.matchAll(/([a-z_]+):\s*c\.([A-Za-z_]\w*)/g)) {
  if (!savedFromCriterion.has(m[2])) savedFromCriterion.set(m[2], m[1]);
}

// ─────────────────────────────────────────────────────────────────────────────
const rows = [...collected].sort().map((key) => {
  const param = criterionToParam.get(key) ?? null;
  const saved = savedFromCriterion.get(key) ?? null;
  const canonical = param ? (paramAliases.get(param) ?? (canonicalKeys.has(param) ? param : null)) : null;
  return {
    key,
    param,
    onWire: param ? emitted.has(param) : false,
    serverReads: param ? serverReads.has(param) : false,
    inRegistry: param ? registryParams.has(param) : false,
    canonicalKey: canonical,
    savedAs: saved,
  };
});

const pad = (v, n) => String(v ?? '—').padEnd(n);
console.log('# Criterion vocabulary census — authenticated Search\n');
console.log(
  `${pad('criteria.*', 22)}${pad('param', 20)}${pad('wire', 6)}${pad('srv', 6)}${pad('reg', 6)}${pad('CanonicalFilterKey', 22)}saved-record`,
);
console.log('-'.repeat(110));
for (const r of rows) {
  console.log(
    pad(r.key, 22) +
      pad(r.param, 20) +
      pad(r.onWire ? 'yes' : 'NO', 6) +
      pad(r.serverReads ? 'yes' : 'NO', 6) +
      pad(r.inRegistry ? 'yes' : 'NO', 6) +
      pad(r.canonicalKey, 22) +
      (r.savedAs ?? '—'),
  );
}

const executable = rows.filter((r) => r.onWire && r.serverReads);
const unpersistable = executable.filter((r) => !r.canonicalKey);
const unsaved = executable.filter((r) => !r.savedAs);

console.log(`\ncollected criteria:                       ${rows.length}`);
console.log(`executable (emitted AND read by server):  ${executable.length}`);
console.log(`  of those, NOT nameable by CanonicalFilterKey: ${unpersistable.length}`);
console.log(`  of those, NOT written to the saved record:    ${unsaved.length}`);

console.log('\n## Executable criteria the VERSIONED persistence contract cannot name\n');
console.log(
  unpersistable.length
    ? unpersistable.map((r) => `  ${pad(r.key, 22)} param=${r.param}`).join('\n')
    : '  (none)',
);
console.log(
  '\n  `SavedSearchCriteria.filters` is keyed by CanonicalFilterKey and',
  '\n  `savedSearchVersionState` returns "invalid" for any key outside it, so each',
  '\n  criterion above cannot survive a versioned save at all.',
);

console.log('\n## Executable criteria the browser does not write to the saved record\n');
console.log(
  unsaved.length ? unsaved.map((r) => `  ${pad(r.key, 22)} param=${r.param}`).join('\n') : '  (none)',
);

const unusedCanonical = [...canonicalKeys].filter(
  (k) => !rows.some((r) => r.canonicalKey === k) && k !== 'sort',
);
console.log('\n## CanonicalFilterKey members no executable criterion maps to\n');
console.log(unusedCanonical.length ? `  ${unusedCanonical.join(', ')}` : '  (none)');
