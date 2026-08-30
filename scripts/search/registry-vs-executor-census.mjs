/**
 * WHO ACTUALLY DECIDES WHICH COTALITY FIELD A SEARCH CRITERION ASKS FOR?
 *
 * `lib/search/canonical/field-registry.ts` says it is "THE CANONICAL SEARCH
 * MAPPING AUTHORITY". The authenticated Search executor
 * (`app/api/idx/search/route.ts` -> `lib/search/crm-idx-filter.ts`) carried its
 * own `searchParam -> Cotality field` table.
 *
 * Two tables describing one mapping is how drift returns, and it already had:
 * this census exists to measure the divergence exactly rather than assert it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION 5: THIS IS NOW A GATE, NOT A REPORT.
 *
 * It previously printed its findings and exited 0 no matter what it found, so a
 * new unowned executor mapping could be added and this file would describe it
 * politely and let it through. Section 5.G requires the census to FAIL when a
 * new executor mapping appears without an authority owner, so every check below
 * is counted and the process exits non-zero.
 *
 * THE BLIND SPOT THAT WAS FIXED AT THE SAME TIME
 *
 * The old parser only compared the 14 rows of the numeric TABLE. The executor
 * also names Cotality fields INLINE — `PostalCode eq`, `contains(PublicRemarks,`,
 * `CloseDate ge` and so on — and those were read into a bag of parameter names
 * with their target field discarded. So section A reported "(none)" for
 * disagreement while never having looked at roughly half the mappings. "(none)"
 * meant NOT CHECKED, which is worse than a known gap because it reads as proof.
 *
 * READ-ONLY. Parses source; touches no network, no database, no Cotality.
 * Nothing here asserts a Cotality FACT — it compares Mallan tables to each other.
 * Field truth comes only from the live authenticated Cotality API.
 *
 * Run: node scripts/search/registry-vs-executor-census.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

const violations = [];
const fail = (check, detail) => violations.push({ check, detail });

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE DECLARED AUTHORITY
//
// Entries are single-line `f({ ... })` calls, so a line is one entry. String
// values never contain an unescaped quote of their own delimiter.
// ─────────────────────────────────────────────────────────────────────────────
function parseRegistry() {
  const out = [];
  for (const line of read('lib/search/canonical/field-registry.ts').split('\n')) {
    const key = /canonicalKey:\s*'([^']+)'/.exec(line);
    if (!key) continue;
    const str = (name) => {
      const m = new RegExp(name + ":\\s*(?:'([^']*)'|null)").exec(line);
      if (!m) return undefined; // absent -> factory default
      return m[1] ?? null;
    };
    const list = (name) => {
      const m = new RegExp(name + ':\\s*\\[([^\\]]*)\\]').exec(line);
      return m ? m[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
    };
    out.push({
      canonicalKey: key[1],
      searchParam: str('searchParam'),
      // THE JOIN KEY is `searchParams` (structured). `searchParam` is prose and
      // is read only to report which entries still carry the legacy label.
      searchParams: list('searchParams'),
      mappingOwner: str('mappingOwner') ?? null,
      vocabularyOwner: str('vocabularyOwner') ?? null,
      cotalityField: str('cotalityField'),
      cotalityFields: list('cotalityFields'),
      executionStrategy: str('executionStrategy') ?? null,
      criterionRole: str('criterionRole') ?? null,
      dbColumn: str('dbColumn'),
      filterable: str('filterable') ?? 'no',
      failureBehavior: str('failureBehavior') ?? null,
      authorityResolution: str('authorityResolution'),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WHAT ACTUALLY EXECUTES
// ─────────────────────────────────────────────────────────────────────────────
const executorSrc = read('lib/search/crm-idx-filter.ts');

/**
 * Source with COMMENTS REMOVED, string and template literals preserved.
 *
 * The field scan below must read CODE, not prose. The executor's bathrooms
 * section explains at length why `BathroomsTotalInteger ge/le` was removed —
 * and the first version of this gate matched that sentence and reported the
 * criterion as an unowned live mapping. A gate that fires on the comment
 * explaining a removed mapping is worse than no gate: the cheapest way to
 * silence it is to delete the explanation, so it would actively destroy the
 * reasoning it exists to protect.
 *
 * DELIBERATELY LINE-BASED rather than a character scanner.
 *
 * The first attempt walked the source tracking which quote it was inside. That
 * is the textbook approach and it broke on this exact file: `escapeOData` contains
 * the regex literal `/'/g`, whose apostrophe the scanner read as the START of a
 * string. From that point it was inverted — code counted as string, comments
 * counted as code — for the remaining 340 lines. Correctly distinguishing a regex
 * literal from division needs a real JS parser, which is far more machinery than a
 * census needs, and a subtly wrong parser is worse than none because it fails
 * silently in one direction.
 *
 * Every comment in this executor occupies whole lines, so dropping comment LINES
 * is exact here and cannot desynchronize. A trailing comment after code on the
 * same line would survive; the guards below assert both directions so that shows
 * up as a failure rather than a vacuous pass.
 */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      out.push('');
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      out.push('');
      continue;
    }
    if (t.startsWith('//')) { out.push(''); continue; }
    out.push(line);
  }
  return out.join('\n');
}

const executorCode = stripComments(executorSrc);

function parseExecutor() {
  const numeric = [];
  const tableRe = /\[\s*"([A-Za-z_]+)"\s*,\s*"([A-Za-z]+)"\s*,\s*"(ge|le|gt|lt|eq)"/g;
  let m;
  while ((m = tableRe.exec(executorSrc))) {
    numeric.push({ searchParam: m[1], cotalityField: m[2], op: m[3] });
  }

  const paramsRead = new Set();
  const getRe = /params\.get\(\s*"([^"]+)"\s*\)/g;
  while ((m = getRe.exec(executorSrc))) paramsRead.add(m[1]);

  const delegated = [];
  const delRe = /from\s*"@\/lib\/search\/canonical\/([a-z-]+)"/g;
  while ((m = delRe.exec(executorSrc))) delegated.push(m[1]);

  // EVERY Cotality field this file names in an OData position — the half the
  // old parser threw away. Anchored on the OPERATOR so ordinary identifiers are
  // not swept in: `X eq`, `X ge`, `contains(X,`, `startswith(X,`.
  const fields = new Set();
  const opRe = /\b([A-Z][A-Za-z0-9]+)\s+(?:eq|ne|ge|le|gt|lt)\b/g;
  while ((m = opRe.exec(executorCode))) fields.add(m[1]);
  const fnRe = /\b(?:contains|startswith|endswith)\(\s*([A-Z][A-Za-z0-9]+)\s*,/g;
  while ((m = fnRe.exec(executorCode))) fields.add(m[1]);

  return { numeric, paramsRead: [...paramsRead].sort(), delegated, fields: [...fields].sort() };
}

const registry = parseRegistry();
const executor = parseExecutor();

const byParam = new Map();
for (const e of registry) for (const p of e.searchParams) byParam.set(p, e);

/**
 * `type` picks Sale vs Rental — a Mallan workflow selector rendered by
 * property-type-universe, not a Cotality field criterion. Giving it a registry
 * entry would put a non-field in a field table.
 */
const WORKFLOW_SELECTORS = new Set(['type']);

console.log('# Registry vs executor — search mapping census\n');
console.log(`registry entries:                 ${registry.length}`);
console.log(`  with structured searchParams:   ${registry.filter((e) => e.searchParams.length).length}`);
console.log(`  distinct params claimed:        ${byParam.size}`);
console.log(`  delegating to a module:         ${registry.filter((e) => e.mappingOwner).length}`);
console.log(`  filterable = 'yes':             ${registry.filter((e) => e.filterable === 'yes').length}`);
console.log(`executor numeric mappings:        ${executor.numeric.length}`);
console.log(`executor params.get() reads:      ${executor.paramsRead.length}`);
console.log(`executor names Cotality fields:   ${executor.fields.length}`);
console.log(`executor delegates to modules:    ${executor.delegated.join(', ')}`);

// GUARD THE GUARD. Every extractor above must actually find something. A regex
// that silently stops matching turns every check below into a vacuous pass,
// which is the precise failure this census exists to catch.
if (executor.numeric.length < 10) fail('extraction', `numeric table parse found only ${executor.numeric.length} rows`);
if (executor.paramsRead.length < 20) fail('extraction', `params.get parse found only ${executor.paramsRead.length}`);
if (executor.fields.length < 10) fail('extraction', `OData field parse found only ${executor.fields.length}`);
if (byParam.size < 20) fail('extraction', `registry searchParams parse found only ${byParam.size}`);

// The comment stripper itself is guarded, in BOTH directions. If it silently ate
// real code the field list would shrink and every ownership check below would
// pass vacuously — the same "(none) means not checked" failure this rewrite
// exists to remove. So: prose must be gone, and live code must survive.
if (executorCode.includes('BathroomsTotalInteger')) {
  fail('extraction', 'comment stripper left prose in the code view');
}
if (!executorCode.includes('PostalCode')) {
  fail('extraction', 'comment stripper removed live code — the PostalCode clause is missing');
}

console.log('\n## A. Executor maps it; registry disagrees or does not know it\n');
const rows = [];
for (const nm of executor.numeric) {
  const reg = byParam.get(nm.searchParam);
  if (!reg) {
    rows.push(`  UNKNOWN   ${nm.searchParam.padEnd(12)} executor=${nm.cotalityField.padEnd(24)} no registry entry claims this param`);
    fail('A', `executor numeric mapping '${nm.searchParam}' -> ${nm.cotalityField} has no registry entry`);
    continue;
  }
  if (reg.cotalityField !== nm.cotalityField) {
    rows.push(`  DISAGREE  ${nm.searchParam.padEnd(12)} executor=${String(nm.cotalityField).padEnd(24)} registry=${String(reg.cotalityField)}  (${reg.canonicalKey})`);
    fail('A', `'${nm.searchParam}': executor says ${nm.cotalityField}, registry says ${reg.cotalityField}`);
  }
}
console.log(rows.length ? rows.join('\n') : '(none)');

console.log('\n## B. Params the executor reads that no registry entry claims\n');
const orphanParams = executor.paramsRead.filter((p) => !byParam.has(p) && !WORKFLOW_SELECTORS.has(p));
console.log(orphanParams.length ? orphanParams.join(', ') : '(none)');
for (const p of orphanParams) fail('B', `executor reads param '${p}' that no registry entry claims`);

console.log('\n## C. Registry says filterable=yes, but the executor reads none of its params\n');
const executable = new Set([...executor.paramsRead, ...executor.numeric.map((n) => n.searchParam)]);
const notExecuted = registry
  .filter((e) => e.filterable === 'yes' && e.searchParams.length > 0)
  .filter((e) => !e.searchParams.some((p) => executable.has(p)));
console.log(
  notExecuted.length
    ? notExecuted.map((e) => `  ${e.searchParams.join(',').padEnd(24)} ${e.canonicalKey}`).join('\n')
    : '(none)',
);

console.log('\n## D. Registry entries whose provider authority is still unresolved\n');
const unresolved = registry.filter((e) => e.authorityResolution === 'unresolved' && e.filterable === 'yes');
console.log(
  unresolved.length
    ? unresolved
        .map((e) =>
          `  ${e.canonicalKey.padEnd(24)} ` +
          (e.mappingOwner
            ? `mapping owned by ${e.mappingOwner} (authority still unresolved)`
            : `cotalityField=${String(e.cotalityField)}`))
        .join('\n')
    : '(none)',
);

console.log('\n## E. Entries still carrying ONLY the legacy prose searchParam\n');
const proseOnly = registry.filter((e) => e.searchParam && e.searchParams.length === 0);
console.log(
  proseOnly.length
    ? proseOnly.map((e) => `  ${String(e.searchParam).padEnd(26)} ${e.canonicalKey}`).join('\n')
    : '(none)',
);

// ─────────────────────────────────────────────────────────────────────────────
// F. EVERY COTALITY FIELD THE EXECUTOR NAMES HAS AN AUTHORITY OWNER.
//
// The check the old census could not make. A field named here must be one the
// registry declares for a criterion; otherwise a new provider mapping has
// entered the executor with nothing owning it.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## F. Cotality fields the executor names — is each one registry-declared?\n');
const declaredFields = new Set();
for (const e of registry) {
  if (e.cotalityField) declaredFields.add(e.cotalityField);
  for (const f of e.cotalityFields) declaredFields.add(f);
}
const unownedFields = executor.fields.filter((f) => !declaredFields.has(f));
for (const f of executor.fields) {
  console.log(`  ${declaredFields.has(f) ? 'OWNED  ' : 'UNOWNED'} ${f}`);
}
for (const f of unownedFields) {
  fail('F', `executor emits a clause over '${f}' but no registry entry declares that field`);
}

// ─────────────────────────────────────────────────────────────────────────────
// G. ONE OWNER PER CRITERION.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## G. One owner per criterion\n');
const restating = registry.filter((e) => e.mappingOwner && e.cotalityField);
for (const e of restating) {
  fail('G', `${e.canonicalKey} delegates to ${e.mappingOwner} AND restates cotalityField=${e.cotalityField}`);
}
const ownersUsed = new Set(registry.map((e) => e.mappingOwner).filter(Boolean));
const delegatedTo = new Set(executor.delegated);
for (const o of ownersUsed) {
  if (!delegatedTo.has(o)) fail('G', `declared mappingOwner '${o}' is a module the executor never delegates to`);
}
console.log(restating.length ? '  (see violations)' : '  every delegating entry withholds the field it delegated: OK');
console.log(`  declared owners: ${[...ownersUsed].sort().join(', ')}`);

// ─────────────────────────────────────────────────────────────────────────────
// H. EVERY BROKER CRITERION SAYS HOW IT WOULD RUN, OR HOW IT REFUSES.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## H. Execution strategy declared\n');
const strayStrategy = registry.filter(
  (e) => e.criterionRole === 'broker_input' && e.filterable === 'yes' && !e.executionStrategy,
);
for (const e of strayStrategy) {
  fail('H', `${e.canonicalKey} is broker_input + filterable:yes with NO executionStrategy — nothing decides how it runs`);
}
const refusedNoBehaviour = registry.filter(
  (e) => e.criterionRole === 'broker_input' && e.filterable === 'unsupported' && !e.failureBehavior,
);
for (const e of refusedNoBehaviour) {
  fail('H', `${e.canonicalKey} is unsupported with no declared failureBehavior — refusal is not specified`);
}
const byStrategy = {};
for (const e of registry.filter((e) => e.executionStrategy)) {
  byStrategy[e.executionStrategy] = (byStrategy[e.executionStrategy] ?? 0) + 1;
}
for (const [k, v] of Object.entries(byStrategy).sort()) console.log(`  ${k.padEnd(26)} ${v}`);
console.log(`  (broker_input criteria with no strategy: ${strayStrategy.length})`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(78));
if (violations.length === 0) {
  console.log('CENSUS CLEAN — every executor mapping resolves to exactly one authority owner.');
  process.exit(0);
}
console.log(`CENSUS FAILED — ${violations.length} violation(s):\n`);
for (const v of violations) console.log(`  [${v.check}] ${v.detail}`);
console.log('\nA new executor mapping needs a registry entry that owns it.');
process.exit(1);
