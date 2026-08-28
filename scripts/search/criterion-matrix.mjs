/**
 * THE REPLACEMENT SPECIFICATION — one row per BUSINESS CONCEPT.
 *
 * Not another audit. This is the specification the B1 canonical contracts are
 * built from, and it is GENERATED from every authority that currently claims a
 * criterion, so it cannot drift from the code it specifies.
 *
 * The previous census listed one row per CODE KEY, which is why it read as 36
 * separate problems. `priceMin` and `priceMax` are not two criteria; they are
 * one business concept with two bounds. `dateFrom`, `dateTo` and
 * `dateActivityType` are one concept with three parts. Counting code keys is how
 * one architectural defect looks like twenty-one bugs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CANONICAL NAME COLUMN IS A PROPOSAL, NOT A FACT
 *
 * `CONCEPTS` below is the only hand-authored table in this file, and it is the
 * proposed Mallan business vocabulary — the single canonical identity each
 * concept gets, with every existing name demoted to a boundary alias. It is
 * offered for review BEFORE it becomes code, because once it is code every other
 * vocabulary has to adapt to it.
 *
 * Naming rules applied (CURRENT.md §1):
 *   - Mallan business terminology, or a verified Cotality fact name;
 *   - no RLS / RESO / RealPlus / Trestle terms;
 *   - no legacy carrier names promoted — `rlsId` is compatibility debt and
 *     becomes `listing_id`, not a canonical name;
 *   - one name per concept, so `status` / `statuses` / `standard_status` /
 *     `market_status` collapse to exactly one.
 *
 * READ-ONLY. Parses source. No network, no database, no Cotality.
 * Run: node scripts/search/criterion-matrix.mjs [--md]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

const searchEngine = read('public/crm/js/search/search-engine.js');
const savedSearches = read('public/crm/js/search/saved-searches.js');
const registry = read('lib/search/canonical/field-registry.ts');
const filterKeys = read('lib/search/canonical/filter-keys.ts');
const crmFilter = read('lib/search/crm-idx-filter.ts');
const normalizer = read('lib/search/canonical/saved-search-normalizer.ts');

function slice(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  if (start === -1) throw new Error(`missing: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  return src.slice(start, end === -1 ? src.length : end);
}

/**
 * ONE ROW PER BUSINESS CONCEPT.
 *
 * `canonical` — the proposed single business identity.
 * `collector`  — every `criteria.*` key that carries a part of this concept.
 * `workflows`  — which workflows the concept belongs to. `building` and `cma`
 *                are marked from the UI tab and comp usage; where that is not
 *                yet established the value is `?` rather than a guess.
 */
const CONCEPTS = [
  { canonical: 'price',              collector: ['priceMin', 'priceMax'],                       workflows: 'sale,rent,cma' },
  { canonical: 'bedrooms',           collector: ['bedsMin', 'bedsMax'],                         workflows: 'sale,rent,cma' },
  { canonical: 'bathrooms',          collector: ['bathsMin', 'bathsMax'],                       workflows: 'sale,rent,cma' },
  { canonical: 'rooms',              collector: ['roomsMin', 'roomsMax'],                       workflows: 'sale,rent' },
  { canonical: 'living_area',        collector: ['sqftMin', 'sqftMax'],                         workflows: 'sale,rent,cma' },
  { canonical: 'market_status',      collector: ['statuses'],                                   workflows: 'sale,rent,cma' },
  { canonical: 'property_sub_type',  collector: ['propertySubType'],                            workflows: 'sale,rent,cma' },
  { canonical: 'ownership',          collector: ['ownership'],                                  workflows: 'sale' },
  { canonical: 'borough',            collector: ['borough'],                                    workflows: 'sale,rent,building,cma' },
  { canonical: 'neighborhood',       collector: ['neighborhoods'],                              workflows: 'sale,rent,building,cma' },
  { canonical: 'postal_code',        collector: ['zip'],                                        workflows: 'sale,rent,building' },
  { canonical: 'street_address',     collector: ['address'],                                    workflows: 'sale,rent,building' },
  { canonical: 'unit',               collector: ['unit'],                                       workflows: 'sale,rent' },
  { canonical: 'building_name',      collector: ['buildingName'],                               workflows: 'sale,rent,building' },
  { canonical: 'listing_id',         collector: ['rlsId'],                                      workflows: 'sale,rent' },
  { canonical: 'listing_activity_date', collector: ['dateFrom', 'dateTo', 'dateActivityType'],  workflows: 'sale,rent' },
  { canonical: 'contract_date',      collector: ['contractDateFrom', 'contractDateTo'],         workflows: 'sale' },
  { canonical: 'close_date',         collector: ['soldDateFrom', 'soldDateTo'],                 workflows: 'sale,cma' },
  { canonical: 'year_built',         collector: ['yearMin', 'yearMax'],                         workflows: 'sale,rent,building' },
  { canonical: 'stories',            collector: ['floorsMin', 'floorsMax'],                     workflows: 'building' },
  { canonical: 'units_in_building',  collector: ['unitsMin', 'unitsMax'],                       workflows: 'building' },
  { canonical: 'listing_remarks_keyword', collector: ['keyword'],                               workflows: 'sale,rent' },
  { canonical: 'management_company', collector: ['managementCompany'],                          workflows: 'building' },
  { canonical: 'feature_criteria',   collector: ['checkboxFilters'],                            workflows: 'sale,rent' },
  { canonical: 'max_financing',      collector: ['financingMin'],                               workflows: 'sale' },
];

// ── what each layer currently knows ─────────────────────────────────────────
const collectorBody = slice(searchEngine, 'function collectSearchCriteria', '\n        }\n');
const collected = new Set([...collectorBody.matchAll(/criteria\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));

const serializerBody = slice(searchEngine, 'window.buildIdxSearchParams = function', '\n        };');
const emitted = new Set([...serializerBody.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));

/** criteria key → wire param, brace-matched per guarded block. */
const toParam = new Map();
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
      else if (serializerBody[i] === '}') { depth--; if (depth === 0) break; }
    }
    block = serializerBody.slice(from, i + 1);
  } else {
    block = serializerBody.slice(from, lineEnd === -1 ? serializerBody.length : lineEnd);
  }
  const assigned = [...block.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]);
  if (!assigned.length) continue;
  for (const c of new Set([...block.matchAll(/criteria\.([A-Za-z_]\w*)/g)].map((m) => m[1]))) {
    if (!toParam.has(c)) toParam.set(c, assigned[0]);
  }
}
for (const key of collected) {
  if (!toParam.has(key) && emitted.has(key) && serializerBody.includes(`criteria.${key}`)) {
    toParam.set(key, key);
  }
}

const serverReads = new Set([
  ...[...crmFilter.matchAll(/params\.get\("([A-Za-z_]\w*)"\)/g)].map((m) => m[1]),
  ...[...crmFilter.matchAll(/\["(min[A-Za-z]+|max[A-Za-z]+)"/g)].map((m) => m[1]),
]);

/** wire param → registry canonicalKey / mappingOwner / filterable. */
const registryByParam = new Map();
for (const line of registry.split('\n')) {
  const key = /canonicalKey:\s*'([^']+)'/.exec(line);
  if (!key) continue;
  const params = /searchParams:\s*\[([^\]]*)\]/.exec(line);
  if (!params) continue;
  const spec = {
    canonicalKey: key[1],
    mappingOwner: (/mappingOwner:\s*'([^']+)'/.exec(line) || [])[1] ?? null,
    filterable: (/filterable:\s*'([^']+)'/.exec(line) || [])[1] ?? 'no',
    filterKeys: (/filterKeys:\s*\[([^\]]*)\]/.exec(line) || [])[1] ?? '',
    semanticProven: /semanticEquivalenceProven:\s*true/.test(line),
    liveVerified: /VERIFIED LIVE|PROBED DIRECTLY|probe record/i.test(line),
  };
  for (const raw of params[1].split(',')) {
    const p = raw.trim().replace(/^'|'$/g, '');
    if (p) registryByParam.set(p, spec);
  }
}

const canonicalFilterKeys = new Set(
  [...slice(filterKeys, 'const CANONICAL_KEYS', '])').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
);

const savedRecordBody = slice(savedSearches, 'function _criteriaToApiFormat', '\n            return out;');
const savedFrom = new Map();
for (const m of savedRecordBody.matchAll(/([a-z_]+):\s*c\.([A-Za-z_]\w*)/g)) {
  if (!savedFrom.has(m[2])) savedFrom.set(m[2], m[1]);
}

const normalizerOwns = (concept) =>
  concept.canonical === 'feature_criteria' && /canonicalCheckboxCriterion/.test(normalizer);

// ─────────────────────────────────────────────────────────────────────────────
const rows = CONCEPTS.map((c) => {
  const params = c.collector.map((k) => toParam.get(k)).filter(Boolean);
  const specs = params.map((p) => registryByParam.get(p)).filter(Boolean);
  const savedKeys = c.collector.map((k) => savedFrom.get(k)).filter(Boolean);
  return {
    ...c,
    params,
    executes: params.length > 0 && params.every((p) => emitted.has(p) && serverReads.has(p)),
    registryOwner: specs.length ? [...new Set(specs.map((s) => s.canonicalKey))].join('+') : null,
    mappingOwner: [...new Set(specs.map((s) => s.mappingOwner).filter(Boolean))].join(',') || null,
    capability: [...new Set(specs.map((s) => s.filterable))].join(',') || '—',
    liveVerified: specs.some((s) => s.liveVerified),
    filterKeyBridge: [...new Set(specs.map((s) => s.filterKeys).filter(Boolean))].join(' ') || null,
    savedKeys,
    canonicalFilterKeyExists: canonicalFilterKeys.has(c.canonical),
    normalizerOwned: normalizerOwns(c),
  };
});

const unaccounted = [...collected].filter(
  (k) => k !== 'searchTab' && !CONCEPTS.some((c) => c.collector.includes(k)),
);

const md = process.argv.includes('--md');
const pad = (v, n) => String(v ?? '—').padEnd(n);

if (!md) {
  console.log('# Criterion matrix — one row per BUSINESS CONCEPT\n');
  console.log(
    pad('canonical', 24) + pad('exec', 6) + pad('registry owner', 22) +
    pad('cap', 14) + pad('live', 6) + pad('bridge', 10) + pad('CFK?', 6) + 'workflows',
  );
  console.log('-'.repeat(120));
  for (const r of rows) {
    console.log(
      pad(r.canonical, 24) +
      pad(r.executes ? 'yes' : 'NO', 6) +
      pad(r.registryOwner, 22) +
      pad(r.capability, 14) +
      pad(r.liveVerified ? 'yes' : '—', 6) +
      pad(r.filterKeyBridge ? 'yes' : 'NO', 10) +
      pad(r.canonicalFilterKeyExists ? 'yes' : 'NO', 6) +
      r.workflows,
    );
  }
}

const executing = rows.filter((r) => r.executes);
console.log(`\nbusiness concepts:                        ${rows.length}`);
console.log(`  executing end to end today:             ${executing.length}`);
console.log(`  with a FIELD_REGISTRY owner:            ${rows.filter((r) => r.registryOwner).length}`);
console.log(`  with a registry filterKeys bridge:      ${rows.filter((r) => r.filterKeyBridge).length}`);
console.log(`  whose canonical name exists in CFK:     ${rows.filter((r) => r.canonicalFilterKeyExists).length}`);
console.log(`  with live Cotality evidence recorded:   ${rows.filter((r) => r.liveVerified).length}`);
console.log(`  owned by the checkbox normalizer:       ${rows.filter((r) => r.normalizerOwned).length}`);

console.log('\n## Concepts that do NOT execute end to end today\n');
const dead = rows.filter((r) => !r.executes);
console.log(dead.length ? dead.map((r) => `  ${pad(r.canonical, 24)} collector=${r.collector.join(',')}`).join('\n') : '  (none)');

console.log('\n## Collector keys no concept claims — the matrix must be complete\n');
console.log(unaccounted.length ? `  ${unaccounted.join(', ')}` : '  (none)');

console.log('\n## Concepts with NO registry owner — B1 must give them one\n');
const orphan = rows.filter((r) => r.executes && !r.registryOwner);
console.log(orphan.length ? orphan.map((r) => `  ${r.canonical}`).join('\n') : '  (none)');

console.log('\n## Executing concepts with NO recorded live Cotality evidence\n');
const unproven = executing.filter((r) => !r.liveVerified);
console.log(
  unproven.length ? `  ${unproven.map((r) => r.canonical).join(', ')}` : '  (none)',
);
console.log(
  '\n  Repo code proves what Mallan ASKS FOR. It does not prove Cotality accepts,' +
  '\n  populates or semantically means it (CURRENT.md §1). These are the concepts' +
  '\n  whose provider semantics still need authorized live evidence.',
);
