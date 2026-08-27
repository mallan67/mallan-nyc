/**
 * WHO ACTUALLY DECIDES WHICH COTALITY FIELD A SEARCH CRITERION ASKS FOR?
 *
 * `lib/search/canonical/field-registry.ts` says it is "THE CANONICAL SEARCH
 * MAPPING AUTHORITY". The authenticated Search executor
 * (`app/api/idx/search/route.ts` -> `lib/search/crm-idx-filter.ts`) never
 * imports it. It carries its own `searchParam -> Cotality field` table.
 *
 * Two tables describing one mapping is how drift returns, and it already has:
 * this census exists to measure the divergence exactly rather than assert it.
 *
 * READ-ONLY. Parses source; touches no network, no database, no Cotality.
 * Run: node scripts/search/registry-vs-executor-census.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

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
      const m = new RegExp(`${name}:\\s*(?:'([^']*)'|null)`).exec(line);
      if (!m) return undefined; // absent -> factory default
      return m[1] ?? null;
    };
    // THE JOIN KEY is `searchParams` (structured). `searchParam` is prose and
    // is read only to report which entries still carry the legacy label.
    const paramsArr = /searchParams:\s*\[([^\]]*)\]/.exec(line);
    out.push({
      canonicalKey: key[1],
      searchParam: str('searchParam'),
      searchParams: paramsArr
        ? paramsArr[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).filter(Boolean)
        : [],
      mappingOwner: (/mappingOwner:\s*'([^']+)'/.exec(line) || [])[1] ?? null,
      cotalityField: str('cotalityField'),
      dbColumn: str('dbColumn'),
      filterable: (/filterable:\s*'([^']+)'/.exec(line) || [])[1] ?? 'no',
      authorityResolution: (/authorityResolution:\s*'([^']+)'/.exec(line) || [])[1],
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WHAT ACTUALLY EXECUTES
//
// Three shapes carry the executor's mapping today:
//   a) the numeric table:  ["minPrice", "ListPrice", "ge", false]
//   b) inline params.get("x") reads feeding a named Cotality field
//   c) delegation to a canonical contract module (status, geography, checkbox,
//      property type/subtype) — those DO own their mapping, and are reported
//      separately because they are the shape the rest should become.
// ─────────────────────────────────────────────────────────────────────────────
function parseExecutor() {
  const src = read('lib/search/crm-idx-filter.ts');

  const numeric = [];
  const tableRe = /\[\s*"([A-Za-z_]+)"\s*,\s*"([A-Za-z]+)"\s*,\s*"(ge|le|gt|lt|eq)"/g;
  let m;
  while ((m = tableRe.exec(src))) {
    numeric.push({ searchParam: m[1], cotalityField: m[2], op: m[3] });
  }

  const paramsRead = new Set();
  const getRe = /params\.get\(\s*"([^"]+)"\s*\)/g;
  while ((m = getRe.exec(src))) paramsRead.add(m[1]);

  const delegated = [];
  const delRe = /import\s*\{[^}]*\}\s*from\s*"@\/lib\/search\/canonical\/([a-z-]+)"/g;
  while ((m = delRe.exec(src))) delegated.push(m[1]);

  return { numeric, paramsRead: [...paramsRead].sort(), delegated };
}

// ─────────────────────────────────────────────────────────────────────────────
const registry = parseRegistry();
const executor = parseExecutor();

const byParam = new Map();
for (const e of registry) for (const p of e.searchParams) byParam.set(p, e);

console.log('# Registry vs executor — search mapping census\n');
console.log(`registry entries:                 ${registry.length}`);
console.log(`  with structured searchParams:   ${registry.filter((e) => e.searchParams.length).length}`);
console.log(`  distinct params claimed:        ${byParam.size}`);
console.log(`  delegating to a module:         ${registry.filter((e) => e.mappingOwner).length}`);
console.log(`  filterable = 'yes':             ${registry.filter((e) => e.filterable === 'yes').length}`);
console.log(`executor numeric mappings:        ${executor.numeric.length}`);
console.log(`executor params.get() reads:      ${executor.paramsRead.length}`);
console.log(`executor delegates to modules:    ${executor.delegated.join(', ')}`);

console.log('\n## A. Executor maps it; registry disagrees or does not know it\n');
const disagree = [];
const unknown = [];
for (const nm of executor.numeric) {
  const reg = byParam.get(nm.searchParam);
  if (!reg) {
    unknown.push(nm);
    continue;
  }
  if (reg.cotalityField !== nm.cotalityField) {
    disagree.push({ ...nm, registryField: reg.cotalityField, canonicalKey: reg.canonicalKey });
  }
}
if (disagree.length === 0 && unknown.length === 0) console.log('(none)');
for (const d of disagree) {
  console.log(
    `  DISAGREE  ${d.searchParam.padEnd(12)} executor=${String(d.cotalityField).padEnd(24)} registry=${String(d.registryField)}  (${d.canonicalKey})`,
  );
}
for (const u of unknown) {
  console.log(`  UNKNOWN   ${u.searchParam.padEnd(12)} executor=${u.cotalityField.padEnd(24)} registry has no entry with this searchParam`);
}

console.log('\n## B. Params the executor reads that no registry entry claims\n');
const claimed = new Set([...byParam.keys()]);
const orphanParams = executor.paramsRead.filter((p) => !claimed.has(p));
console.log(orphanParams.length ? orphanParams.join(', ') : '(none)');

console.log('\n## C. Registry says filterable=yes, but the executor reads none of its params\n');
const executable = new Set([
  ...executor.paramsRead,
  ...executor.numeric.map((n) => n.searchParam),
]);
const notExecuted = registry
  .filter((e) => e.filterable === 'yes' && e.searchParams.length > 0)
  .filter((e) => !e.searchParams.some((p) => executable.has(p)));
console.log(
  notExecuted.length
    ? notExecuted.map((e) => `  ${e.searchParams.join(',').padEnd(24)} ${e.canonicalKey}`).join('\n')
    : '(none)',
);

console.log('\n## D. Registry entries whose provider authority is still unresolved\n');
const unresolved = registry.filter(
  (e) => e.authorityResolution === 'unresolved' && e.filterable === 'yes',
);
console.log(
  unresolved.length
    ? unresolved
        .map(
          (e) =>
            `  ${e.canonicalKey.padEnd(24)} ` +
            (e.mappingOwner
              ? `mapping owned by ${e.mappingOwner} (authority still unresolved)`
              : `cotalityField=${String(e.cotalityField)}`),
        )
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
