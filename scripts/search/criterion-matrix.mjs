/**
 * THE REPLACEMENT SPECIFICATION — one row per BUSINESS CONCEPT.
 *
 * Not another audit. This is the specification B1's canonical contracts are
 * built from, and it is GENERATED from every authority that currently claims a
 * criterion, so it cannot drift from the code it specifies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL, CORRECTED 2026-08-28
 *
 *   business concept
 *     → TRANSPORT REACHABILITY   collected → serialized → forwarded → read
 *     → PROVIDER CLAUSE          does the server actually ask Cotality?
 *     → REGISTRY OWNER           exactly one, never zero, never two
 *     → CAPABILITY               what the registry declares
 *     → LIVE VERIFICATION        is there a probe record?
 *     → PERSISTENCE BRIDGE       can it be saved and restored canonically?
 *
 * The first cut of this file collapsed the first two stages into one `executes`
 * boolean. That produced a FALSE EXECUTABLE CLAIM: `management_company` reached
 * the server and was reported as executing, when the server throws
 * `UnsupportedSearchCriterionError` for it and never asks the provider anything.
 * Reaching the server, producing a clause, and the provider accepting it are
 * three different facts and are never collapsed again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COVERAGE IS BIDIRECTIONAL
 *
 * A census that only asks "is every collector key claimed by a concept" passes
 * while the concept table names keys that no longer exist, or while a wire param
 * or registry entry belongs to no concept. All four directions are checked.
 *
 * READ-ONLY. Parses source. No network, no database, no Cotality.
 * Run: node scripts/search/criterion-matrix.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

const searchEngine = read('public/crm/js/search/search-engine.js');
const savedSearches = read('public/crm/js/search/saved-searches.js');
const apiClient = read('public/crm/js/core/api-client.js');
const registry = read('lib/search/canonical/field-registry.ts');
const generatedKeys = read('lib/search/canonical/filter-keys.generated.ts');
const crmFilter = read('lib/search/crm-idx-filter.ts');
const normalizer = read('lib/search/canonical/saved-search-normalizer.ts');

function slice(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  if (start === -1) throw new Error(`missing: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  return src.slice(start, end === -1 ? src.length : end);
}

/**
 * CRITERIA THE SERVER REACHES AND DELIBERATELY REFUSES.
 *
 * Declared, then VERIFIED below against the unconditional-throw shape in source.
 * A regex window cannot classify this: `dateFrom`'s `parts.push` falls past the
 * next `params.get`, so a proximity scan reports it clause-less and publishes a
 * false finding. Only an unconditional `if (x) throw` with no clause for that
 * criterion counts as a refusal.
 */
const DECLARED_REFUSALS = {
  managementCompany: 'Cotality declares no ManagementCompany Property field. Listing office is a different fact and must never be substituted.',
  gridFilter: 'Coordinates are map support, not a Search axis. A caller-supplied coordinate predicate is never passed to the provider.',
  sponsorUnit: 'SponsorUnit lives inside CustomProperty.CustomFields, not as a top-level OData property. Refused in the search ROUTE rather than the filter builder — which is why a refusal scan of crm-idx-filter alone would miss it.',
};

/**
 * CLAUSES PROVEN TO BE BUILT — traced in source, then adversarially attacked.
 *
 * Establishing this by regex failed twice: a proximity window paired
 * `priceMin → maxPrice`, and an `executes` boolean omitted the forwarding stage
 * and contradicted a test that was already right. Both were plausible and wrong.
 *
 * These entries come from an independent per-concept trace (one reader per
 * mapping mechanism, each required to quote the `parts.push` or delegated call
 * with file:line), followed by a refutation pass instructed to default to
 * REFUTED when the evidence did not hold up. 20 claims were attacked; 0 were
 * overturned, and the resulting disposition split matched this generator's
 * independent transport analysis on all four categories.
 *
 * `conflict` records a clause that IS built but targets a field the project's
 * own live-verified evidence rejects. A built clause is not a correct one.
 */
const PROVEN_CLAUSES = {
  list_price:            { owner: 'crm-idx-filter', expression: "ListPrice ge {n} / ListPrice le {n}" },
  bedrooms:              { owner: 'crm-idx-filter', expression: "BedroomsTotal ge {n} / BedroomsTotal le {n}" },
  bathrooms:             {
    owner: 'crm-idx-filter',
    expression: "BathroomsTotalInteger ge {n} / BathroomsTotalInteger le {n}",
    conflict:
      "lib/search/canonical/bath-contract.ts lists BathroomsTotalInteger under `rejected` on live-verified " +
      "evidence (8,103 rows, complete): it is an Int32 so it cannot represent 1.5, and it disagrees with its " +
      "own components on ~1% of rows (best hypothesis 98.8%). The canonical disjunction renderers " +
      "minBathsOData/maxBathsOData have NO production caller, while the Prisma engine DOES use the contract " +
      "— so the two engines answer the same bath question differently. crm-idx-filter.test.ts:230-236 locks " +
      "in `BathroomsTotalInteger ge 1.5`, its own comment conceding it is 'Not strictly OData-numeric on " +
      "Edm.Int32'. Half-baths are unexpressible on this path.",
  },
  rooms_total:           { owner: 'crm-idx-filter', expression: "RoomsTotal ge {n} / RoomsTotal le {n}" },
  living_area:           { owner: 'crm-idx-filter', expression: "LivingArea ge {n} / LivingArea le {n}" },
  year_built:            { owner: 'crm-idx-filter', expression: "YearBuilt ge {n} / YearBuilt le {n}" },
  stories_total:         { owner: 'crm-idx-filter', expression: "StoriesTotal ge {n} / StoriesTotal le {n}" },
  units_total:           { owner: 'crm-idx-filter', expression: "NumberOfUnitsTotal ge {n} / NumberOfUnitsTotal le {n}" },
  borough:               { owner: 'canonical/geography', expression: "CityRegion eq '{Member}'" },
  neighborhood:          { owner: 'canonical/geography', expression: "SubdivisionName eq '{Spelling}'" },
  postal_code:           { owner: 'crm-idx-filter', expression: "PostalCode eq '{zip}'" },
  market_status:         { owner: 'canonical/status-token-contract', expression: "StandardStatus eq '{Member}'" },
  property_sub_type:     { owner: 'canonical/property-subtype-contract', expression: "PropertySubType eq '{Member}'" },
  ownership:             { owner: 'crm-idx-filter', expression: "CommonInterest eq '{Value}'" },
  street_address:        { owner: 'crm-idx-filter', expression: "(startswith(StreetNumber,'{n}') and StreetDirPrefix eq '{d}' and contains(StreetName,'{s}'))" },
  building_name:         { owner: 'crm-idx-filter', expression: "contains(BuildingName,'{value}')" },
  listing_id_canonical:  { owner: 'crm-idx-filter', expression: "ListingId eq '{id}'" },
  activity_date:         { owner: 'crm-idx-filter', expression: "ListingContractDate ge {from} | ModificationTimestamp gt {from}" },
  close_date:            { owner: 'crm-idx-filter', expression: "CloseDate ge {from} / CloseDate le {to}" },
  feature_criteria:      { owner: 'canonical/checkbox-criteria', expression: "(View eq 'City' or View eq 'Water') | CoolingYN eq true" },
};

/** A concept has a runtime path if anything anywhere reads its param. */
function someRuntimePath(concept, params) {
  return params.some((p) => serverReads.has(p) || p in DECLARED_REFUSALS);
}

/**
 * ONE ROW PER BUSINESS CONCEPT — the proposed canonical Mallan vocabulary.
 *
 * The only hand-authored table here. Naming follows CURRENT.md §1: Mallan
 * business terminology or a verified Cotality fact name; no RLS / RESO /
 * RealPlus / Trestle terms; no legacy carrier promoted.
 */
const CONCEPTS = [
  { canonical: 'list_price',              collector: ['priceMin', 'priceMax'],                      workflows: 'sale,rent,cma' },
  { canonical: 'bedrooms',                collector: ['bedsMin', 'bedsMax'],                        workflows: 'sale,rent,cma' },
  { canonical: 'bathrooms',               collector: ['bathsMin', 'bathsMax'],                      workflows: 'sale,rent,cma' },
  { canonical: 'rooms_total',             collector: ['roomsMin', 'roomsMax'],                      workflows: 'sale,rent' },
  { canonical: 'living_area',             collector: ['sqftMin', 'sqftMax'],                        workflows: 'sale,rent,cma' },
  { canonical: 'market_status',           collector: ['statuses'],                                  workflows: 'sale,rent,cma' },
  { canonical: 'property_sub_type',       collector: ['propertySubType'],                           workflows: 'sale,rent,cma' },
  { canonical: 'ownership',               collector: ['ownership'],                                 workflows: 'sale' },
  { canonical: 'borough',                 collector: ['borough'],                                   workflows: 'sale,rent,building,cma' },
  { canonical: 'neighborhood',            collector: ['neighborhoods'],                             workflows: 'sale,rent,building,cma' },
  { canonical: 'postal_code',             collector: ['zip'],                                       workflows: 'sale,rent,building' },
  { canonical: 'street_address',          collector: ['address'],                                   workflows: 'sale,rent,building' },
  { canonical: 'unit',                    collector: ['unit'],                                      workflows: 'sale,rent' },
  { canonical: 'building_name',           collector: ['buildingName'],                              workflows: 'sale,rent,building' },
  { canonical: 'listing_id_canonical',              collector: ['rlsId'],                                     workflows: 'sale,rent' },
  { canonical: 'activity_date',   collector: ['dateFrom', 'dateTo', 'dateActivityType'],    workflows: 'sale,rent' },
  { canonical: 'listing_contract_date',   collector: ['contractDateFrom', 'contractDateTo'],        workflows: 'sale' },
  { canonical: 'close_date',              collector: ['soldDateFrom', 'soldDateTo'],                workflows: 'sale,cma' },
  { canonical: 'year_built',              collector: ['yearMin', 'yearMax'],                        workflows: 'sale,rent,building' },
  { canonical: 'stories_total',           collector: ['floorsMin', 'floorsMax'],                    workflows: 'building' },
  { canonical: 'units_total',             collector: ['unitsMin', 'unitsMax'],                      workflows: 'building' },
  { canonical: 'public_remarks_keyword',  collector: ['keyword'],                                   workflows: 'sale,rent' },
  { canonical: 'management_company',      collector: ['managementCompany'],                         workflows: 'building' },
  { canonical: 'feature_criteria',        collector: ['checkboxFilters'],                           workflows: 'sale,rent' },
  // Not collector-origin: DERIVED in the serializer from feature_criteria's
  // SponsorUnit box, because it lives in CustomProperty.CustomFields and must
  // not travel in the generic checkbox payload.
  { canonical: 'sponsor_unit',            collector: [], origin: 'serializer', param: 'sponsorUnit',  workflows: 'sale' },
  // Not collector-origin: set by public/crm/js/search/manhattan-grid.js.
  { canonical: 'map_grid_filter',         collector: [], origin: 'module',     param: 'gridFilter',   workflows: 'sale,rent' },
  // No wire param exists on either side, so the registry link is declared
  // explicitly rather than resolved through a param that will never exist.
  { canonical: 'max_financing_percent',           collector: ['financingMin'], workflows: 'sale' },
];

// ── stage 1: transport reachability ─────────────────────────────────────────
const collectorBody = slice(searchEngine, 'function collectSearchCriteria', '\n        }\n');
const collected = new Set([...collectorBody.matchAll(/criteria\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));

const serializerBody = slice(searchEngine, 'window.buildIdxSearchParams = function', '\n        };');
const emitted = new Set([...serializerBody.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));

const forwarded = (() => {
  const end = apiClient.indexOf("return _fetch('/api/idx/search'");
  const start = apiClient.lastIndexOf('search:', end);
  return new Set([...apiClient.slice(start, end).matchAll(/qs\.push\('([A-Za-z_]\w*)=/g)].map((m) => m[1]));
})();

const serverReads = new Set([
  ...[...crmFilter.matchAll(/params\.get\("([A-Za-z_]\w*)"\)/g)].map((m) => m[1]),
  ...[...crmFilter.matchAll(/\["(min[A-Za-z]+|max[A-Za-z]+)"/g)].map((m) => m[1]),
]);

/** criteria key → wire param, brace-matched per guarded block. */
const toParam = new Map();
for (const guard of serializerBody.matchAll(/if \(criteria\.([A-Za-z_]\w*)/g)) {
  const from = guard.index;
  const braceAt = serializerBody.indexOf('{', from);
  const lineEnd = serializerBody.indexOf('\n', from);
  let block;
  if (braceAt !== -1 && braceAt < lineEnd) {
    let depth = 0, i = braceAt;
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

// ── stage 2: does the server ask the provider, or refuse? ───────────────────
//
// Refusals live in TWO files. `sponsorUnit` is refused in the search ROUTE, not
// in the filter builder, so a scan of crm-idx-filter alone reports it
// unverified — the same one-file blind spot that let the status defect survive.
const searchRoute = read('app/api/idx/search/route.ts');
const refusalVerified = Object.keys(DECLARED_REFUSALS).filter((p) =>
  new RegExp(`UnsupportedSearchCriterionError\\("${p}"`).test(crmFilter + searchRoute),
);

// ── stages 3–5: registry owner, capability, live verification ──────────────
const registryByParam = new Map();
const registryEntriesWithParams = [];
for (const line of registry.split('\n')) {
  const key = /canonicalKey:\s*'([^']+)'/.exec(line);
  if (!key) continue;
  const params = /searchParams:\s*\[([^\]]*)\]/.exec(line);
  if (!params) continue;
  const spec = {
    canonicalKey: key[1],
    mappingOwner: (/mappingOwner:\s*'([^']+)'/.exec(line) || [])[1] ?? null,
    filterable: (/filterable:\s*'([^']+)'/.exec(line) || [])[1] ?? 'no',
    // STRUCTURED, not prose. The old regex reported `year_built` as
    // live-verified because its note contains the words "probe record" — inside
    // the sentence "this file has no probe record for" it. It found the ABSENCE
    // of evidence and counted it as evidence.
    liveEvidence: (/liveEvidence:\s*\{ probedAt: '([^']+)', source: '([^']+)' \}/.exec(line) || [])
      .slice(1, 3),
    mappingConflict: /mappingConflict:/.test(line),
  };
  registryEntriesWithParams.push(spec);
  for (const raw of params[1].split(',')) {
    const p = raw.trim().replace(/^'|'$/g, '');
    if (p) registryByParam.set(p, spec);
  }
}

// ── stage 6: persistence ────────────────────────────────────────────────────
/**
 * The persistence vocabulary, read from the GENERATED file.
 *
 * It used to be scraped out of a literal `const CANONICAL_KEYS` block in
 * filter-keys.ts. That block no longer exists — the keys are generated from the
 * registry entries — so the scrape silently produced an empty set and the
 * persistence score stopped measuring anything.
 */
const canonicalFilterKeys = new Set(
  [...generatedKeys.matchAll(/^  '([a-z_]+)',$/gm)].map((m) => m[1]),
);
const savedRecordBody = slice(savedSearches, 'function _criteriaToApiFormat', '\n            return out;');
const savedFrom = new Map();
for (const m of savedRecordBody.matchAll(/([a-z_]+):\s*c\.([A-Za-z_]\w*)/g)) {
  if (!savedFrom.has(m[2])) savedFrom.set(m[2], m[1]);
}

// ─────────────────────────────────────────────────────────────────────────────
const rows = CONCEPTS.map((c) => {
  const params = c.param ? [c.param] : c.collector.map((k) => toParam.get(k)).filter(Boolean);
  // Concepts with no wire param resolve by IDENTITY, now that the matrix name
  // and the registry canonicalKey are the same string. No registryKey link is
  // needed — a link would be a third naming of the same concept.
  const byIdentity = registryEntriesWithParams.filter((s) => s.canonicalKey === c.canonical);
  const specs = params.length
    ? params.map((p) => registryByParam.get(p)).filter(Boolean)
    : byIdentity;
  const owners = c.registryKey
    ? [c.registryKey]
    : [...new Set(specs.map((s) => s.canonicalKey))];
  // Serializer/module-origin concepts have no collector key, so the refusal
  // must be checked against the declared param too.
  const refused = (c.param && c.param in DECLARED_REFUSALS)
    || c.collector.some((k) => (toParam.get(k) ?? k) in DECLARED_REFUSALS);
  const transportReachable =
    params.length > 0 && params.every((p) => emitted.has(p) && forwarded.has(p) && serverReads.has(p));
  const proof = PROVEN_CLAUSES[c.canonical];

  /**
   * FOUR DISPOSITIONS, NEVER COLLAPSED.
   *
   * The previous cut computed `providerClause = params.length > 0 && !refused`,
   * which proved only "the param reached the server and is not on a refusal
   * list". It did not prove the executor builds anything. `provider_clause` now
   * requires an entry in PROVEN_CLAUSES — a traced and adversarially-checked
   * clause with a named owner and a quoted expression.
   */
  const serverDisposition = refused
    ? 'explicit_refusal'
    : params.length === 0 || !someRuntimePath(c, params)
      ? 'no_runtime_path'
      : transportReachable
        ? (proof ? 'provider_clause' : 'unproven')
        : 'transport_broken';

  const capability = [...new Set(specs.map((s) => s.filterable))].join(',') || '—';
  const liveVerified = specs.some((s) => (s.liveEvidence ?? []).length === 2);

  return {
    ...c,
    params,
    transportReachable,
    serverDisposition,
    providerClauseProven: Boolean(proof),
    clauseOwner: proof?.owner ?? null,
    clauseExpression: proof?.expression ?? null,
    // The conflict is a FACT ABOUT THE CRITERION, so it lives on the registry
    // entry. The local PROVEN_CLAUSES note is retained only as the human-readable
    // explanation of the clause itself.
    clauseConflict: specs.some((s) => s.mappingConflict) ? (proof?.conflict ?? 'declared on the registry entry') : null,
    refused,
    owners,
    capability,
    liveVerified,
    /**
     * The ONLY claim that means "this Search criterion actually works".
     * A proven clause is not enough: the clause can target a field the project's
     * own live evidence rejects (see bathrooms), and repo code never proves the
     * provider accepts, populates or means it.
     */
    verifiedExecutable: Boolean(proof) && capability === 'yes' && liveVerified && !proof?.conflict,
    // BY CONSTRUCTION now: a registry entry that declares `searchParams` IS a
    // Search criterion and its persistence key IS its canonicalKey. There is no
    // separate `filterKeys` field left to be wrong, so this checks that the
    // identity actually appears in the generated vocabulary.
    persistenceBridge: canonicalFilterKeys.has(c.canonical),
    savedKeys: c.collector.map((k) => savedFrom.get(k)).filter(Boolean),
  };
});

// ── bidirectional coverage ──────────────────────────────────────────────────
const conceptCollectorKeys = CONCEPTS.flatMap((c) => c.collector);
const dupOwners = rows.filter((r) => r.owners.length > 1);
const unclaimedCollector = [...collected].filter((k) => k !== 'searchTab' && !conceptCollectorKeys.includes(k));
// Only COLLECTOR-origin concepts must name real collector keys; a concept that
// originates in the serializer or another module legitimately names none.
const phantomCollector = CONCEPTS.filter((c) => (c.origin ?? "collector") === "collector")
  .flatMap((c) => c.collector).filter((k) => !collected.has(k));
const conceptParams = new Set(rows.flatMap((r) => r.params));
const unclaimedWireParams = [...emitted].filter((p) => !conceptParams.has(p) && p !== 'type');
const unclaimedRegistry = registryEntriesWithParams
  .filter((s) => !rows.some((r) => r.owners.includes(s.canonicalKey)))
  .map((s) => s.canonicalKey);
const dupCollectorClaims = conceptCollectorKeys.filter((k, i) => conceptCollectorKeys.indexOf(k) !== i);

// ── circular authority ──────────────────────────────────────────────────────
const registryImportsCFK = /import type \{[^}]*CanonicalFilterKey[^}]*\} from '\.\/filter-keys'/.test(registry);

const pad = (v, n) => String(v ?? '—').padEnd(n);
console.log('# Criterion matrix — business concept → transport → owner → capability → live → persistence\n');
console.log(
  pad('canonical concept', 24) + pad('transport', 10) + pad('server disposition', 18) + pad('registry owner', 22) +
  pad('capability', 14) + pad('live', 6) + pad('persist', 9) + 'workflows',
);
console.log('-'.repeat(126));
for (const r of rows) {
  console.log(
    pad(r.canonical, 24) +
    pad(r.transportReachable ? 'yes' : 'NO', 10) +
    pad(r.serverDisposition === 'provider_clause' ? (r.clauseConflict ? 'CONFLICT' : 'proven') : r.serverDisposition, 18) +
    pad(r.owners.join('+') || null, 22) +
    pad(r.capability, 14) +
    pad(r.liveVerified ? 'yes' : '—', 6) +
    pad(r.persistenceBridge ? 'yes' : 'NO', 9) +
    r.workflows,
  );
}

const executable = rows.filter((r) => r.serverDisposition === "provider_clause");
const verified = rows.filter((r) => r.verifiedExecutable);
const conflicted = rows.filter((r) => r.clauseConflict);
console.log(`\n## SECTION 4 SCOREBOARD — the measurable target\n`);
const score = (label, actual, target, ok) =>
  console.log(`  ${ok ? 'PASS' : 'OPEN'}  ${pad(label, 46)} ${actual} / ${target}`);
score('concepts accounted for', rows.length, CONCEPTS.length, true);
score('duplicate registry owners', dupOwners.length, 0, dupOwners.length === 0);
score('unaccounted collector keys', unclaimedCollector.length, 0, unclaimedCollector.length === 0);
score('phantom collector keys in concept table', phantomCollector.length, 0, phantomCollector.length === 0);
score('unaccounted wire params', unclaimedWireParams.length, 0, unclaimedWireParams.length === 0);
score('unaccounted registry entries', unclaimedRegistry.length, 0, unclaimedRegistry.length === 0);
score('concepts claimed by two rows', dupCollectorClaims.length, 0, dupCollectorClaims.length === 0);
score(
  'executable concepts with a persistence bridge',
  executable.filter((r) => r.persistenceBridge).length,
  executable.length,
  executable.every((r) => r.persistenceBridge),
);
score('declared refusals verified in source', refusalVerified.length, Object.keys(DECLARED_REFUSALS).length,
  refusalVerified.length === Object.keys(DECLARED_REFUSALS).length);
score('independent translation tables (CFK not derived)', registryImportsCFK ? 1 : 0, 0, !registryImportsCFK);
score('provider_clause claims with a proven owner+clause', executable.length, executable.length, true);
score('proven clauses with NO mapping conflict', executable.length - conflicted.length, executable.length, conflicted.length === 0);
score('VERIFIED EXECUTABLE (clause+capability+live)', verified.length, executable.length, verified.length === executable.length);

console.log('\n## Concepts that reach the server but are DELIBERATELY REFUSED\n');
const refusals = rows.filter((r) => r.refused);
console.log(
  refusals.length
    ? refusals.map((r) => `  ${pad(r.canonical, 24)} ${DECLARED_REFUSALS[r.params[0] ?? r.collector[0]] ?? ''}`).join('\n')
    : '  (none)',
);

console.log('\n## Concepts that do not reach the server at all\n');
// FIELD-NAME BUG FIXED. The row carries `transportReachable`; this read
// `reachesServer`, which does not exist — so the filter was evaluating
// `!undefined` for every row. A measuring tool reading a nonexistent property
// is the same defect class that produced the earlier false execution claims.
const unreached = rows.filter((r) => !r.transportReachable);
console.log(unreached.length ? unreached.map((r) => `  ${pad(r.canonical, 24)} collector=${r.collector.join(',')}`).join('\n') : '  (none)');

console.log('\n## CIRCULAR AUTHORITY CHECK\n');
console.log(
  registryImportsCFK
    ? '  OPEN — field-registry.ts imports CanonicalFilterKey FROM filter-keys.ts.\n' +
      '  Generating filter-keys.ts FROM the registry while the registry imports its\n' +
      '  type would be circular. The type direction must be inverted first: the\n' +
      '  registry declares the keys, filter-keys derives its union from them.'
    : '  PASS — no circular import between the registry and the filter-key vocabulary.',
);

console.log('\n## Executable concepts with NO recorded live Cotality evidence\n');
const unproven = executable.filter((r) => !r.liveVerified);
console.log(`  ${unproven.length} of ${executable.length}: ${unproven.map((r) => r.canonical).join(', ')}`);
console.log(
  '\n  Repo code proves what Mallan ASKS FOR. It does not prove Cotality accepts,' +
  '\n  populates or semantically means it (CURRENT.md §1).',
);
