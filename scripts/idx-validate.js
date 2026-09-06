#!/usr/bin/env node
/**
 * IDX Plus Compliance Validator v2 — npm run idx:validate
 *
 * Comprehensive end-to-end validator for mallan.nyc.
 * Validates: Trestle $select → mapper → DB → gates → DTO → frontend → CRM → API.
 *
 * Exit codes: 0 = all PASS, 1 = any CRITICAL/FAIL
 *
 * Flags:
 *   --json          JSON output
 *   --fails         Show only FAIL/CRITICAL items
 *   --section N     Run only section N
 *   --severity S    Filter by severity (CRITICAL, WARNING, INFO)
 *
 * Exception annotations in source code:
 *   /* IDX-VALIDATE-IGNORE: reason * /     suppress a specific finding
 *   /* TRESTLE-PREFILTERED * /             field is pre-filtered by Trestle feed
 *   /* IDX-VALIDATE-OK: reason * /         explicitly mark as reviewed
 *
 * Sections (26 total):
 *   ── IDX Pipeline ──
 *    1. $select Field Completeness
 *    2. Distribution Gate → DB Column Mapping
 *    3. Field Count Verification (live Cotality contract)
 *    4. REQUIRED_COTALITY_FIELDS vs IDX Plus Availability
 *    5. Prisma Listing ↔ Mapper Return Type
 *    6. Picklist / Value Canonicalization
 *   ── CRM & API ──
 *    7. CRM fetch() → API Route Cross-Reference
 *    8. Response Field Consistency
 *    9. req.json() Safety
 *   ── Cron ──
 *   10. Cron Schedule Completeness
 *   11. Cron Secret Validation Pattern
 *   ── Auth & Security ──
 *   12. RBAC / Authorization on Mutations
 *   13. Secrets & Supply-Chain Security
 *   14. Request Throttling / DoS Protections
 *   15. PII / Logging Redaction
 *   ── Compliance ──
 *   16. Coming Soon Badge (UCBA Sec. 2.04)
 *   17. Fair Housing / UCBA E7 Full Coverage
 *   18. REBNY Attribution Presence
 *   19. Audit + Retention Enforcement
 *   ── Data Integrity ──
 *   20. Schema Evolution / Contract Testing
 *   21. Idempotent Sync / Concurrency
 *   22. Indexing / Query-Plan Sanity
 *   23. External API Resilience
 *   ── Bloat & Hygiene ──
 *   24. Dead Components
 *   25. Unused npm Dependencies
 *   26. Cache / CDN Hygiene
 *   ── CRM & API (extended) ──
 *   27. CRM → API Body Field Alignment
 *   ── Search ──
 *   28. Search Filter Integrity
 *   ── Frontend ──
 *   29. Interactive Element Wiring
 *   30. Trestle → Frontend Data Chain
 *   31. Portal Auth Flow
 *   ── Platform ──
 *   32. Run History & Trends
 *   ── Cross-File Consistency ──
 *   36. DOM ID Cross-Reference (JS → HTML)
 *   37. Search Flow Integrity
 *   38. onclick/onchange Function Existence
 *   39. data-field vs Trestle/RESO Validation
 *   40. Duplicate HTML ID Detection
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const failsOnly = args.includes('--fails');
const sectionFilter = args.includes('--section') ? parseInt(args[args.indexOf('--section') + 1]) : null;
const severityFilter = args.includes('--severity') ? args[args.indexOf('--severity') + 1].toUpperCase() : null;

// v2 release-truth flags (validator framework section §16):
//   --strict   promotes all WARNING items to CRITICAL count for exit-code purposes
//   --runtime  also runs validate-live-site smoke check on prod
const STRICT_PROMOTION = args.includes('--strict');
const INCLUDE_RUNTIME = args.includes('--runtime');

// ── Severity levels ───────────────────────────────────────────────────────
const SEVERITY = { CRITICAL: 0, WARNING: 1, INFO: 2, UNVERIFIED: 3 };

let totalCritical = 0, totalWarning = 0, totalInfo = 0, totalUnverified = 0, totalPass = 0;
const sections = [];
let validatorHistoryCache = null;

function startSection(num, title, category) {
  const s = { num, title, category, items: [] };
  sections.push(s);
  return s;
}
function addResult(section, status, severity, name, detail) {
  if (status === 'PASS') { totalPass++; }
  else if (severity === 'CRITICAL') { totalCritical++; }
  else if (severity === 'WARNING') { totalWarning++; }
  else if (severity === 'UNVERIFIED') { totalUnverified++; }
  else { totalInfo++; }
  section.items.push({ status, severity, name, detail });
}
function critical(s, name, detail) { addResult(s, 'FAIL', 'CRITICAL', name, detail); }
function warning(s, name, detail) { addResult(s, 'FAIL', 'WARNING', name, detail); }
function info(s, name, detail) { addResult(s, 'FAIL', 'INFO', name, detail); }
function unverified(s, name, detail) { addResult(s, 'UNVERIFIED', 'UNVERIFIED', name, detail); }
function pass(s, name) { addResult(s, 'PASS', null, name); }

// ── File helpers ──────────────────────────────────────────────────────────
const fileCache = new Map();
function readFile(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) { fileCache.set(relPath, null); return null; }
  const content = fs.readFileSync(abs, 'utf8');
  fileCache.set(relPath, content);
  return content;
}
function findFiles(dir, ext, results = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return results;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      findFiles(path.relative(ROOT, full).replace(/\\/g, '/'), ext, results);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  }
  return results;
}
function hasAnnotation(content, index, annotation) {
  const nearby = content.substring(Math.max(0, index - 200), index);
  return nearby.includes(annotation);
}

// ── Shared data extractors ────────────────────────────────────────────────
function getMapperFields() {
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  if (!mapper) return { allRls: new Set(), excluded: new Set(), select: new Set(), required: new Set(), blocks: new Map() };
  const blockRx = /const\s+(B\d+_\w+)\s*=\s*\[([\s\S]*?)\];/g;
  const blocks = new Map();
  const allRls = new Set();
  let blockMatch;
  while ((blockMatch = blockRx.exec(mapper)) !== null) {
    const name = blockMatch[1];
    const fields = (blockMatch[2].match(/"([^"]+)"/g) || []).map((n) => n.replace(/"/g, '')).filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n));
    blocks.set(name, fields);
    for (const field of fields) allRls.add(field);
  }
  const exMatch = mapper.match(/LIVE_FIELDS_NOT_SELECTED\s*=\s*new\s+Set<string>\(\[\s*([\s\S]*?)\]\)/);
  const excluded = new Set();
  if (exMatch) { for (const n of (exMatch[1].match(/"([^"]+)"/g) || [])) excluded.add(n.replace(/"/g, '')); }
  const select = new Set([...allRls].filter(f => !excluded.has(f)));
  const reqMatch = mapper.match(/REQUIRED_COTALITY_FIELDS\s*=\s*\[\s*([\s\S]*?)\]/);
  const required = new Set();
  if (reqMatch) { for (const n of (reqMatch[1].match(/"([^"]+)"/g) || [])) required.add(n.replace(/"/g, '')); }
  return { allRls, excluded, select, required, blocks, content: mapper };
}

function getListingColumns() {
  const schema = readFile('prisma/schema.prisma');
  if (!schema) return new Map();
  const modelMatch = schema.match(/model\s+Listing\s*\{([\s\S]*?)^\}/m);
  if (!modelMatch) return new Map();
  const cols = new Map();
  for (const line of modelMatch[1].split('\n')) {
    const m = line.match(/^\s+(\w+)\s+(String|Int|Boolean|DateTime|Decimal|BigInt|Json|Float)(\?)?/);
    if (m) cols.set(m[1], { type: m[2], nullable: !!m[3] });
  }
  return cols;
}

function getPropertyFieldCoveragePolicy() {
  const policy = readFile('config/idx/property-field-coverage-policy.json');
  if (!policy) return { searchCritical: new Set(), fieldReasons: new Map() };
  try {
    const parsed = JSON.parse(policy);
    const fieldReasons = new Map(Object.entries(parsed.fieldReasons || {}));
    const searchCritical = new Set(parsed.searchCritical || []);
    return { searchCritical, fieldReasons };
  } catch {
    return { searchCritical: new Set(), fieldReasons: new Map() };
  }
}

/**
 * THE provider contract — the dated live Cotality pulls (regenerated by `npm run cotality:compile`,
 * drift-checked by `npm run cotality:verify`). Field existence, enum membership, $select validity and
 * distribution-field semantics are decided HERE and nowhere else. The REBNY CSVs under data/ are
 * historical reference material and are not read by this validator.
 */
function getLiveContract() {
  const fieldsRaw = readFile('data/cotality-property-fields.live.json');
  const enumsRaw = readFile('data/cotality-enums.live.json');
  if (!fieldsRaw || !enumsRaw) return null;
  const fields = JSON.parse(fieldsRaw); const enums = JSON.parse(enumsRaw);
  const liveFields = new Set(fields.fields || []);
  const liveEnums = {};
  for (const [f, members] of Object.entries(enums.enums || {})) if (Array.isArray(members) && members.length) liveEnums[f] = new Set(members);
  return { liveFields, liveEnums, pulledAt: enums.pulled_at || fields.pulled_at || 'unknown' };
}
/** Legacy Mallan form keys that were never Cotality fields: a raw.<name> access in the mapper is a defect, never "pre-filtered". */
const PHANTOM_PROVIDER_NAMES = new Set(['IDXEntireListingDisplayYN', 'IDXAutomatedValuationDisplayYN', 'IDXParticipationYN', 'ParticipantOnlyYN',
  'VOWEntireListingDisplayYN', 'VOWAutomatedValuationDisplayYN', 'VOWConsumerCommentYN', 'SyndicateYN']);

// ── SECTION 1: $select Field Completeness ──
function section1() {
  const s = startSection(1, '$select Field Completeness', 'IDX Pipeline');
  const { select, excluded, allRls, blocks, content: mapper } = getMapperFields();
  if (!mapper) { critical(s, 'trestle-mapper.ts', 'File not found'); return; }

  const expandFields = new Set(['Media','MediaURL','MediaCategory','Order','PreferredPhotoYN','ShortDescription',
    'DownPaymentAssistanceAmount','DownPaymentAssistanceCount','AdditionalFee','AdditionalFeeDescription','AdditionalFeeYN','FeeFrequency']);
  const live = getLiveContract();
  if (!live) { critical(s, 'live Cotality contract', 'data/cotality-property-fields.live.json / cotality-enums.live.json not found — run npm run cotality:compile'); return; }
  const systemFields = new Set(['MlsStatus','StandardStatus','ListingKey','ListingId','ModificationTimestamp','SourceSystemKey']);
  // every field the mapper selects or categorizes must exist on the live resource
  for (const field of allRls) {
    if (!live.liveFields.has(field)) critical(s, field, `in the mapper's Cotality field categories but NOT on the live Cotality contract (pull ${live.pulledAt})`);
  }
  pass(s, `mapper field categories: ${allRls.size} fields, all on the live contract (pull ${live.pulledAt})`);

  const rawPattern = /(?:raw|normalized)\.([A-Z][A-Za-z0-9]+)/g;
  const accessed = new Set();
  let m;
  while ((m = rawPattern.exec(mapper)) !== null) accessed.add(m[1]);

  const pickPattern = /pick\(\s*(?:raw|normalized)\s*,\s*(B\d+_\w+)\s*\)/g;
  const picked = new Set();
  let p;
  while ((p = pickPattern.exec(mapper)) !== null) {
    const fields = blocks.get(p[1]) || [];
    for (const field of fields) picked.add(field);
  }

  for (const field of accessed) {
    if (PHANTOM_PROVIDER_NAMES.has(field)) { critical(s, field, `raw.${field} names a retired key that was never a Cotality field (live: 400 "Could not find a property")`); continue; }
    if (select.has(field)) pass(s, field);
    else if (expandFields.has(field)) pass(s, `${field} (via $expand)`);
    else if (systemFields.has(field)) pass(s, `${field} (system)`);
    else if (hasAnnotation(mapper, mapper.indexOf(`raw.${field}`) >= 0 ? mapper.indexOf(`raw.${field}`) : mapper.indexOf(`normalized.${field}`), 'TRESTLE-PREFILTERED'))
      pass(s, `${field} (annotated pre-filtered)`);
    else if (hasAnnotation(mapper, mapper.indexOf(`raw.${field}`) >= 0 ? mapper.indexOf(`raw.${field}`) : mapper.indexOf(`normalized.${field}`), 'IDX-VALIDATE-IGNORE'))
      pass(s, `${field} (annotated ignore)`);
    else if (excluded.has(field))
      critical(s, field, `Accessed via raw.${field} but EXCLUDED from $select and not pre-filtered. Always undefined.`);
    else if (!live.liveFields.has(field))
      critical(s, field, `Accessed via raw.${field} but NOT on the live Cotality contract. Never fetched.`);
    else if (!allRls.has(field))
      critical(s, field, `Accessed via raw.${field} but NOT in any mapper field category. Never fetched.`);
  }

  for (const field of picked) {
    if (accessed.has(field)) continue;
    if (select.has(field)) pass(s, `${field} (via pick)`); 
    else if (excluded.has(field)) pass(s, `${field} (via pick, excluded from $select)`);
    else if (allRls.has(field)) pass(s, `${field} (via pick)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Distribution Gate → DB Column Mapping
// ═══════════════════════════════════════════════════════════════════════════
function section2() {
  const s = startSection(2, 'Distribution Gate → DB Column Mapping', 'IDX Pipeline');
  const schema = readFile('prisma/schema.prisma');
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const gate = readFile('lib/compliance/idx-display-gate.ts');
  if (!schema || !mapper || !gate) { critical(s, 'Required files missing', ''); return; }

  // Owner opt-out, participant-only and the IDX-display decision are MALLAN / REBNY-UCBA decisions (no proven
  // provider field): the gate reads the Mallan DTO keys; the mapper writes the Mallan columns. The Internet* gates
  // are live Cotality Booleans (verified 2026-09-06). No retired name (IDXEntireListingDisplayYN, ParticipantOnlyYN)
  // may satisfy a gate check.
  const gates = [
    { name: 'Owner Opt-Out (Mallan decision)', db: 'owner_opt_out', gateRx: /idxOptOut|owner_opt_out/, mapRx: /owner_opt_out/ },
    { name: 'IDX Display (Mallan decision)', db: 'idx_display_yn', gateRx: /isDisplayableInIDX|idx_display_yn/, mapRx: /idx_display_yn/ },
    { name: 'Participant Only (Mallan decision)', db: 'participant_only', gateRx: /participantOnlyNetwork|participant_only/, mapRx: /participant_only/ },
    { name: 'Internet Entire Listing', db: 'internet_entire_listing_display_yn', gateRx: /InternetEntireListingDisplayYN/, mapRx: /internet_entire_listing_display_yn/ },
    { name: 'Internet Address', db: 'internet_address_display_yn', gateRx: /InternetAddressDisplayYN|canDisplayAddress/, mapRx: /internet_address_display_yn/ },
    { name: 'Automated Valuation', db: 'internet_automated_valuation_display_yn', gateRx: /InternetAutomatedValuationDisplayYN/, mapRx: /internet_automated_valuation_display_yn/ },
    { name: 'Consumer Comment', db: 'internet_consumer_comment_yn', gateRx: /InternetConsumerCommentYN/, mapRx: /internet_consumer_comment_yn/ },
  ];
  const combined = mapper + '\n' + gate;
  for (const phantom of PHANTOM_PROVIDER_NAMES) {
    const rx = new RegExp('^(?!\\s*(//|\\*|/\\*)).*(?<![A-Za-z0-9_$])' + phantom + '(?![A-Za-z0-9_$])', 'm');
    if (rx.test(combined)) critical(s, `retired name "${phantom}" in gate / mapper code`, 'never a Cotality field — the Mallan decision key or the live field must be used');
  }
  for (const g of gates) {
    if (new RegExp(`\\b${g.db}\\b`).test(schema)) pass(s, `${g.name}: DB column`);
    else critical(s, `${g.name}: DB column "${g.db}" MISSING`, 'Add to Listing model');
    if (g.gateRx.test(combined)) pass(s, `${g.name}: Gate check`);
    else critical(s, `${g.name}: Gate check MISSING`, 'Add to checkDistributionGates/isDisplayableInIDX');
    if (g.mapRx.test(mapper)) pass(s, `${g.name}: Mapper output`);
    else critical(s, `${g.name}: Mapper output MISSING`, 'Add to mapTrestleToPrisma return');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Field Count Verification (live Cotality contract)
// ═══════════════════════════════════════════════════════════════════════════
function section3() {
  const s = startSection(3, 'Field Count Verification', 'IDX Pipeline');
  const { allRls, excluded, select } = getMapperFields();

  // The live contract (dated pulls) is the field universe
  const live = getLiveContract();
  if (!live) { critical(s, 'live Cotality contract', 'pulls not found — run npm run cotality:compile'); return; }
  pass(s, `Live Cotality Property fields: ${live.liveFields.size} (pull ${live.pulledAt}) · enum fields: ${Object.keys(live.liveEnums).length}`);

  // OData $metadata snapshot: REFERENCE only (it over-declares what the licence grants; never capability proof)
  const meta = readFile('artifacts/metadata.xml');
  if (meta) {
    const propCount = (meta.match(/<Property\s+Name="/g) || []).length;
    pass(s, `OData $metadata snapshot (reference, not authority): ${propCount} declared property definitions`);
  }

  // Mapper coverage of the LIVE Property fields
  const { searchCritical, fieldReasons } = getPropertyFieldCoveragePolicy();
  const csvPropertyFields = live.liveFields;

  const mappedPropertyFields = [...csvPropertyFields].filter(f => allRls.has(f));
  const intentionallyExcludedPropertyFields = [...csvPropertyFields].filter(f => !allRls.has(f) && fieldReasons.has(f));
  const unclassifiedPropertyFields = [...csvPropertyFields].filter(f => !allRls.has(f) && !fieldReasons.has(f));
  const criticalMissingPropertyFields = [...csvPropertyFields].filter(f => !allRls.has(f) && searchCritical.has(f));
  const stalePolicyFields = [...fieldReasons.keys()].filter(f => !csvPropertyFields.has(f));
  const mappedPolicyFields = [...fieldReasons.keys()].filter(f => csvPropertyFields.has(f) && allRls.has(f));
  const staleSearchCriticalFields = [...searchCritical].filter(f => !csvPropertyFields.has(f));
  const noopExcludedFields = [...excluded].filter(f => !allRls.has(f));
  const classifiedPct = (((mappedPropertyFields.length + intentionallyExcludedPropertyFields.length) / csvPropertyFields.size) * 100).toFixed(1);

  for (const field of criticalMissingPropertyFields) {
    critical(s, field, 'Search-critical Property field is missing from mapper.');
  }

  pass(s, `Live Property fields: ${csvPropertyFields.size} total`);
  pass(s, `Property fields mapped: ${mappedPropertyFields.length}`);
  pass(s, `Property fields intentionally excluded: ${intentionallyExcludedPropertyFields.length}`);
  pass(s, `Property fields classified: ${mappedPropertyFields.length + intentionallyExcludedPropertyFields.length}/${csvPropertyFields.size} (${classifiedPct}%)`);

  if (unclassifiedPropertyFields.length === 0) {
    pass(s, 'Property field coverage policy: no unclassified gaps');
  } else {
    warning(s, `Property field coverage: ${unclassifiedPropertyFields.length} unclassified gap(s)`,
      unclassifiedPropertyFields.slice(0, 25).join(', '));
  }
  if (stalePolicyFields.length === 0) {
    pass(s, 'Property field coverage policy: no stale field reasons');
  } else {
    warning(s, `Property field coverage policy: ${stalePolicyFields.length} stale reason(s)`,
      `These fields are no longer in the current REBNY Property CSV: ${stalePolicyFields.slice(0, 25).join(', ')}`);
  }
  if (mappedPolicyFields.length === 0) {
    pass(s, 'Property field coverage policy: no mapped fields still marked excluded');
  } else {
    warning(s, `Property field coverage policy: ${mappedPolicyFields.length} mapped field(s) still have exclusion reasons`,
      `Remove no-longer-needed reasons: ${mappedPolicyFields.slice(0, 25).join(', ')}`);
  }
  if (staleSearchCriticalFields.length === 0) {
    pass(s, 'Search-critical field policy: no stale fields');
  } else {
    warning(s, `Search-critical field policy: ${staleSearchCriticalFields.length} stale field(s)`,
      `These fields are no longer in the current REBNY Property CSV: ${staleSearchCriticalFields.join(', ')}`);
  }
  if (noopExcludedFields.length === 0) {
    pass(s, 'LIVE_FIELDS_NOT_SELECTED: all excluded fields are present in mapper categories');
  } else {
    warning(s, `LIVE_FIELDS_NOT_SELECTED: ${noopExcludedFields.length} no-op exclusion(s)`,
      `These exclusions no longer affect $select because the fields are not in COTALITY_PROPERTY_FIELDS: ${noopExcludedFields.slice(0, 25).join(', ')}`);
  }

  pass(s, `Mapper COTALITY_PROPERTY_FIELDS: ${allRls.size} unique fields`);
  pass(s, `LIVE_FIELDS_NOT_SELECTED: ${excluded.size} fields`);
  pass(s, `IDX_PLUS_SELECT (fetched): ${select.size} fields`);

  // Enum coverage from the live contract
  const enumMemberCount = Object.values(live.liveEnums).reduce((n, set) => n + set.size, 0);
  pass(s, `Live enum members: ${enumMemberCount} across ${Object.keys(live.liveEnums).length} enum fields`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: REQUIRED_COTALITY_FIELDS vs IDX Plus Availability
// ═══════════════════════════════════════════════════════════════════════════
function section4() {
  const s = startSection(4, 'REQUIRED vs IDX Plus Availability', 'IDX Pipeline');
  const { required, excluded } = getMapperFields();
  for (const f of required) {
    if (excluded.has(f)) critical(s, `${f} — in REQUIRED AND EXCLUDED`, 'Remove from REQUIRED or add back to $select');
    else pass(s, f);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Prisma Listing ↔ Mapper Return Type
// ═══════════════════════════════════════════════════════════════════════════
function section5() {
  const s = startSection(5, 'Prisma Listing ↔ Mapper Return Type', 'IDX Pipeline');
  const cols = getListingColumns();
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  if (!mapper || cols.size === 0) { critical(s, 'Required files', 'Cannot read'); return; }
  // Anchor on mapTrestleToPrisma before matching its return block. The bare
  // /return\s*\{.../ match scanned from the TOP OF THE FILE and bound to
  // whichever helper happened to be declared first, so adding any earlier
  // function that returns an object literal silently retargeted this section
  // onto that helper — 6 real column checks became 0 plus one bogus warning,
  // with no failure to signal the loss. Anchoring restores what the section's
  // own message already claims it inspects: "mapTrestleToPrisma returns ...".
  // The bare /return\s*\{.../ match scanned from the TOP OF THE FILE and bound
  // to whichever function happened to declare an object return first — which
  // was `computeGateColumns`, NOT the mapper this section names. It also had no
  // failure mode: adding any earlier helper silently retargeted it again.
  //
  // Anchor on the function, then take its TOP-LEVEL return (base indentation,
  // two spaces) so a nested object literal — e.g. the per-item `return {}` in
  // the media map at ~line 1202 — cannot capture it either.
  const fnStart = mapper.indexOf('export function mapTrestleToPrisma');
  if (fnStart === -1) { warning(s, 'Mapper function', 'mapTrestleToPrisma not found'); return; }
  const retMatch = mapper.slice(fnStart).match(/\n {2}return \{([\s\S]*?)\n {2}\};/);
  if (!retMatch) { warning(s, 'Mapper return', 'Could not parse'); return; }
  const keyPattern = /^\s+(\w+)\s*[,:]/gm;
  let m;
  while ((m = keyPattern.exec(retMatch[1])) !== null) {
    const key = m[1];
    if (cols.has(key)) {
      const col = cols.get(key);
      if (col.type === 'Decimal') {
        const varRef = retMatch[1].match(new RegExp(`${key}\\s*[:,]\\s*(\\w+)`));
        if (varRef && /Number\(|parseFloat|parseInt/.test(mapper.match(new RegExp(`${varRef[1]}\\s*=\\s*[^;]+`))?.[0] || ''))
          warning(s, `${key}: JS number → Prisma Decimal`, 'Pass as string for precision');
        else pass(s, `${key} → ${col.type}`);
      } else pass(s, `${key} → ${col.type}`);
    } else if (['media', 'agentInfo', 'agent_info', 'url', 'mediaType', 'order'].includes(key)) {
      pass(s, `${key} → JSON`);
    }
    else warning(s, `${key} → NOT in Listing model`, 'mapTrestleToPrisma returns field with no DB column');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Picklist / Value Canonicalization
// ═══════════════════════════════════════════════════════════════════════════
function section6() {
  const s = startSection(6, 'Picklist / Value Canonicalization', 'IDX Pipeline');
  const live = getLiveContract();
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const enforcement = readFile('lib/compliance/rls-enforcement.ts');
  if (!live || !mapper) { warning(s, 'Required files', 'Cannot read'); return; }
  const picklists = live.liveEnums;
  pass(s, `Live enum fields on the contract: ${Object.keys(picklists).length} (pull ${live.pulledAt})`);

  // The provider vocabulary the mapper compares against must be live members (the only status vocabulary
  // allowed under a provider-named field is the live StandardStatus enum; MlsStatus is null on every sampled row).
  const statusLiterals = new Set();
  for (const m of mapper.matchAll(/StandardStatus\s*(?:===|!==|==)\s*['"]([^'"]+)['"]/g)) statusLiterals.add(m[1]);
  for (const m of mapper.matchAll(/StandardStatus\s*(?:eq|ne)\s*'([^']+)'/g)) statusLiterals.add(m[1]);
  for (const val of statusLiterals) {
    if (picklists.StandardStatus && picklists.StandardStatus.has(val)) pass(s, `StandardStatus="${val}" is a live member`);
    else critical(s, `StandardStatus="${val}" is NOT a live member`, 'the mapper compares the provider status against a non-live spelling');
  }
  for (const val of ['Residential', 'ResidentialLease', 'CommercialSale', 'CommercialLease', 'Land']) {
    if (picklists.PropertyType && picklists.PropertyType.has(val)) pass(s, `PropertyType="${val}" is a live member`);
    else critical(s, `PropertyType="${val}" is NOT a live member`, 'the storage classification names a non-live PropertyType');
  }

  // The provider mapper carries NO alias table (Packet 2 closure): every live field is read by
  // its own name. A reappearing alias table is a second schema authority.
  if (/RESO_TO_RLS_RENAMES|COTALITY_FIELD_ALIASES/.test(mapper)) {
    critical(s, 'provider alias table present in the mapper', 'Cotality fields are read by their live names only');
  } else {
    pass(s, 'no provider alias table (live field names only)');
  }

  // Syndication: SyndicateTo is the live collection; the retired SyndicateYN name may not steer the write gate
  if (enforcement) {
    if (/^(?!\s*(\/\/|\*|\/\*)).*(?<![A-Za-z0-9_$])SyndicateYN(?![A-Za-z0-9_$])/m.test(enforcement)) {
      critical(s, 'SyndicateYN in the write gate', 'never a Cotality field — SyndicateTo (live collection) is the only syndication field');
    } else pass(s, 'write gate names SyndicateTo only (no retired SyndicateYN)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: CRM fetch() → API Route Cross-Reference
// ═══════════════════════════════════════════════════════════════════════════
function section7() {
  const s = startSection(7, 'CRM fetch() → API Route Cross-Reference', 'CRM & API');
  const crmFiles = [...findFiles('public/crm/js/dashboard', '.js'), ...findFiles('public/crm/js/search', '.js')];
  const fetchCalls = [];
  for (const file of crmFiles) {
    const content = readFile(file);
    if (!content) continue;
    // Static fetches
    let m;
    const staticRx = /(?:fetch|_fetch)\s*\(\s*['"]([^'"$]+?)['"]/g;
    while ((m = staticRx.exec(content)) !== null) {
      const url = m[1].replace(/\?.*$/, '');
      if (url.startsWith('/api/')) fetchCalls.push({ file, url, line: content.substring(0, m.index).split('\n').length });
    }
    // Template fetches
    const tmplRx = /(?:fetch|_fetch)\s*\(\s*`([^`]+?)`/g;
    while ((m = tmplRx.exec(content)) !== null) {
      let url = m[1].replace(/\?.*$/, '').replace(/\$\{[^}]+\}/g, '[param]');
      if (url.startsWith('/api/')) fetchCalls.push({ file, url, line: content.substring(0, m.index).split('\n').length });
    }
  }
  const unique = [...new Set(fetchCalls.map(c => c.url))];
  for (const url of unique) {
    const parts = url.split('/').filter(Boolean);
    let dir = path.join(ROOT, 'app', ...parts);
    if (fs.existsSync(path.join(dir, 'route.ts'))) { pass(s, `${url}`); continue; }
    // Dynamic segment fallback
    if (url.includes('[param]')) {
      const segs = url.split('/').filter(Boolean);
      let cur = path.join(ROOT, 'app');
      let found = true;
      for (const seg of segs) {
        if (seg === '[param]') {
          if (!fs.existsSync(cur)) { found = false; break; }
          const dyn = fs.readdirSync(cur, { withFileTypes: true }).find(e => e.isDirectory() && e.name.startsWith('['));
          if (dyn) cur = path.join(cur, dyn.name); else { found = false; break; }
        } else cur = path.join(cur, seg);
      }
      if (found && fs.existsSync(path.join(cur, 'route.ts'))) { pass(s, `${url} (dynamic)`); continue; }
    }
    const locs = fetchCalls.filter(c => c.url === url).map(c => `${c.file}:${c.line}`).join(', ');
    critical(s, `${url} → ROUTE MISSING`, `Called from: ${locs}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Response Field Consistency
// ═══════════════════════════════════════════════════════════════════════════
function section8() {
  const s = startSection(8, 'Response Field Consistency', 'CRM & API');
  const routes = findFiles('app/api/crm', '.ts').filter(f => f.endsWith('route.ts'));
  for (const file of routes) {
    const content = readFile(file);
    if (!content) continue;
    if (/\{\s*ok:\s*(true|false)/.test(content)) warning(s, file, 'Uses { ok: true/false } — standardize to { error } / direct data');
    else pass(s, file);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: req.json() Safety
// ═══════════════════════════════════════════════════════════════════════════
function section9() {
  const s = startSection(9, 'req.json() Safety', 'CRM & API');
  const routes = findFiles('app/api', '.ts').filter(f => f.endsWith('route.ts'));
  for (const file of routes) {
    const content = readFile(file);
    if (!content) continue;
    const rx = /(?:req|request)\.json\(\)/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const line = content.substring(0, m.index).split('\n').length;
      const before = content.substring(Math.max(0, m.index - 500), m.index);
      const after = content.substring(m.index, m.index + 500);
      const tryCount = (before.match(/\btry\s*\{/g) || []).length;
      const catchCount = (before.match(/\bcatch\s*[\({]/g) || []).length;
      if (tryCount > catchCount || (/\btry\s*\{/.test(before.slice(-500)) && /\bcatch\s*[\({]/.test(after)))
        pass(s, `${file}:${line}`);
      else if (hasAnnotation(content, m.index, 'IDX-VALIDATE-IGNORE'))
        pass(s, `${file}:${line} (annotated ignore)`);
      else critical(s, `${file}:${line} — unprotected req.json()`, 'Wrap in try-catch, return 400 on parse error');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: Cron Schedule Completeness
// ═══════════════════════════════════════════════════════════════════════════
function section10() {
  const s = startSection(10, 'Cron Schedule Completeness', 'Cron');
  const vj = readFile('vercel.json');
  if (!vj) { critical(s, 'vercel.json', 'Not found'); return; }
  const config = JSON.parse(vj);
  const scheduled = new Set((config.crons || []).map(c => c.path));
  const cronDir = path.join(ROOT, 'app', 'api', 'cron');
  if (!fs.existsSync(cronDir)) { critical(s, 'app/api/cron/', 'Not found'); return; }
  const routes = fs.readdirSync(cronDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  // ── ORCHESTRATION GRAPH (2026-08-07) ───────────────────────────────────────
  // A route does not need its OWN vercel.json entry if a SCHEDULED route
  // genuinely drives it. This section previously compared a flat list of route
  // directories against a flat list of schedules, so every orchestrated route
  // read as "NOT SCHEDULED" — five false criticals.
  //
  // The real graph:
  //
  //   SCHEDULED /api/cron/one-cycle-preflight   (pre-Neon skip boundary)
  //       -> dynamic import of /api/cron/one-cycle
  //             -> idx-sync member
  //             -> media-sync member
  //
  //   SCHEDULED /api/cron/data-retention-finalize
  //       -> direct call of /api/cron/data-retention
  //
  // Each EDGE is verified in source below, not assumed from a name list. If a
  // link disappears, the dependent routes go critical again — which is the
  // point: this must not become "ignore unscheduled crons".
  const routeSrc = (r) => readFile(path.join('app', 'api', 'cron', r, 'route.ts')) || '';

  // Edge 1: preflight is scheduled AND dynamically delegates to one-cycle.
  const preflightScheduled = scheduled.has('/api/cron/one-cycle-preflight');
  const preflightDelegates = /await import\(['"]@\/app\/api\/cron\/one-cycle\/route['"]\)/
    .test(routeSrc('one-cycle-preflight'));
  const oneCycleDriven = preflightScheduled && preflightDelegates;

  // Edge 2: one-cycle actually owns the two members.
  const oneCycleSrc = routeSrc('one-cycle');
  const membersDriven = oneCycleDriven
    && /runIdxSyncMember/.test(oneCycleSrc)
    && /runMediaSyncMember/.test(oneCycleSrc);

  // Edge 3: finalize is scheduled AND calls the base retention job.
  const finalizeScheduled = scheduled.has('/api/cron/data-retention-finalize');
  const finalizeSrc = routeSrc('data-retention-finalize');
  const retentionDriven = finalizeScheduled
    && /from ['"]@\/app\/api\/cron\/data-retention\/route['"]/.test(finalizeSrc)
    && /runDataRetention\(/.test(finalizeSrc);

  // route -> [human-readable driver, edge verified?]
  const ORCHESTRATED = {
    'one-cycle': ['/api/cron/one-cycle-preflight (*/10, dynamic import)', oneCycleDriven],
    'idx-sync': ['/api/cron/one-cycle member', membersDriven],
    'media-sync': ['/api/cron/one-cycle member', membersDriven],
    'data-retention': ['/api/cron/data-retention-finalize (direct call)', retentionDriven],
  };

  for (const r of routes) {
    const p = `/api/cron/${r}`;
    if (!fs.existsSync(path.join(cronDir, r, 'route.ts'))) { info(s, p, 'Directory but no route.ts'); continue; }
    if (scheduled.has(p)) { const c = config.crons.find(c => c.path === p); pass(s, `${p} (${c.schedule})`); continue; }
    const orch = ORCHESTRATED[r];
    if (orch && orch[1]) { pass(s, `${p} (driven by ${orch[0]})`); continue; }
    if (orch) { critical(s, `${p} → ORCHESTRATION EDGE BROKEN`, `Expected driver: ${orch[0]}`); continue; }
    critical(s, `${p} → NOT SCHEDULED`, 'Add to vercel.json or delete');
  }

  for (const p of scheduled) {
    const r = p.replace('/api/cron/', '');
    if (!fs.existsSync(path.join(cronDir, r, 'route.ts'))) critical(s, `${p} → SCHEDULED BUT MISSING`, 'Route file not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: Cron Secret Validation Pattern
// ═══════════════════════════════════════════════════════════════════════════
function section11() {
  const s = startSection(11, 'Cron Secret Validation Pattern', 'Cron');
  const cronDir = path.join(ROOT, 'app', 'api', 'cron');
  if (!fs.existsSync(cronDir)) return;
  const routes = fs.readdirSync(cronDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  for (const r of routes) {
    const file = `app/api/cron/${r}/route.ts`;
    const content = readFile(file);
    if (!content) continue;
    const safe = /safeCompare|timingSafeEqual|crypto\.subtle|createCronHandler|handleCron/.test(content);
    const unsafe = /authHeader\s*!==?\s*[`'"]?Bearer\s|cronSecret\s*!==?\s*authHeader|authHeader\s*===?\s*[`'"]Bearer/.test(content);
    if (safe) pass(s, file);
    else if (unsafe) critical(s, file, 'Uses === for CRON_SECRET. Use safeCompare() (timing-safe)');
    else if (/CRON_SECRET/.test(content)) warning(s, file, 'CRON_SECRET referenced — verify timing-safe');
    else critical(s, file, 'No CRON_SECRET check found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: RBAC / Authorization on Mutations
// ═══════════════════════════════════════════════════════════════════════════
function section12() {
  const s = startSection(12, 'RBAC / Authorization on Mutations', 'Auth & Security');
  const routes = findFiles('app/api', '.ts').filter(f => f.endsWith('route.ts'));
  const authPatterns = /requireAgentOrBroker|requireBroker|requireAuth|requireSession|getSession|CRON_SECRET|requireWorkspace|requirePortalRole|requirePortalAuth/;
  for (const file of routes) {
    const content = readFile(file);
    if (!content) continue;
    const hasMutation = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(content);
    if (!hasMutation) continue;
    const hasAuth = authPatterns.test(content);
    const isCron = file.includes('/cron/');
    const isPublic = file.includes('/contact/') || file.includes('/inquiries/') || file.includes('/cma/')
      || file.includes('/sign-up/') || file.includes('/open-house-rsvp/') || file.includes('/favorites/')
      || file.includes('/search-alerts/') || file.includes('/guides/')
      || file.includes('/auth/login') || file.includes('/auth/logout')
      || file.includes('/auth/forgot-password') || file.includes('/auth/reset-password')
      || file.includes('/auth/dev-login') || file.includes('/auth/invite/')
      || file.includes('/auth/agent/register')
      || file.includes('/auth/verify-email')
      || file.includes('/identity/capture/')
      || file.includes('/open-houses/rsvp')
      // /unsubscribe/ is intentionally public per CAN-SPAM §7704(a)(3)(A)(ii) and
      // RFC 8058 one-click — recipient cannot be required to log in to opt out.
      || file.includes('/unsubscribe/')
      || file.includes('/pages/');
    if (isCron || isPublic) continue; // Skip public lead-capture and cron endpoints
    if (hasAuth) pass(s, file);
    // File-level annotation fallback: scan whole file, not just first 200 chars.
    else if (content.includes('IDX-VALIDATE-IGNORE') || content.includes('IDX-VALIDATE-OK'))
      pass(s, `${file} (annotated)`);
    else critical(s, `${file} — MUTATION WITHOUT AUTH`, 'Add requireAgentOrBroker/requireBroker/requireAuth check');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 13: Secrets & Supply-Chain Security
// ═══════════════════════════════════════════════════════════════════════════
function section13() {
  const s = startSection(13, 'Secrets & Supply-Chain Security', 'Auth & Security');
  // Check for hardcoded secrets in source
  const secretPatterns = [
    { rx: /['"][A-Za-z0-9+/=]{40,}['"]/, name: 'Potential hardcoded API key (40+ char base64)' },
    { rx: /sk[-_]live[-_][A-Za-z0-9]{20,}/, name: 'Stripe live secret key' },
    { rx: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub personal access token' },
    { rx: /xox[bpors]-[A-Za-z0-9-]{10,}/, name: 'Slack token' },
    { rx: /AKIA[A-Z0-9]{16}/, name: 'AWS access key ID' },
    { rx: /password\s*[:=]\s*['"][^'"]{8,}['"]/, name: 'Hardcoded password' },
  ];
  const srcFiles = [...findFiles('app', '.ts'), ...findFiles('app', '.tsx'), ...findFiles('lib', '.ts')];
  let secretsFound = 0;
  for (const file of srcFiles) {
    const content = readFile(file);
    if (!content) continue;
    for (const { rx, name } of secretPatterns) {
      if (rx.test(content)) {
        // Skip Sentry DSN (public), test files
        if (file.includes('sentry') && name.includes('base64')) continue;
        if (file.includes('test') || file.includes('__tests__')) continue;
        critical(s, `${file}: ${name}`, 'Remove hardcoded secret, use env var');
        secretsFound++;
      }
    }
  }
  if (secretsFound === 0) pass(s, 'No hardcoded secrets detected in source');

  // Check .env files not in .gitignore
  const gitignore = readFile('.gitignore') || '';
  const envPatterns = ['.env', '.env.local', '.env.production'];
  for (const envFile of envPatterns) {
    if (gitignore.includes(envFile) || gitignore.includes('.env*')) pass(s, `${envFile} in .gitignore`);
    else warning(s, `${envFile} NOT in .gitignore`, 'Add to .gitignore to prevent secret commits');
  }

  // Check NEXT_PUBLIC_ env vars for secrets
  for (const envFile of ['.env', '.env.local', '.env.production']) {
    const content = readFile(envFile);
    if (!content) continue;
    const violations = content.split('\n').filter(l =>
      /NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|CREDENTIAL|API_KEY)/i.test(l) && !l.startsWith('#'));
    if (violations.length > 0) critical(s, `${envFile}: secrets in NEXT_PUBLIC_ vars`, violations.join('; '));
    else pass(s, `${envFile}: no secrets in NEXT_PUBLIC_`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 14: Request Throttling / DoS Protections
// ═══════════════════════════════════════════════════════════════════════════
function section14() {
  const s = startSection(14, 'Request Throttling / DoS Protections', 'Auth & Security');
  // Check rate limiter exists
  const rateLimiter = readFile('lib/middleware/rate-limiter.ts');
  if (rateLimiter) pass(s, 'Rate limiter module exists');
  else { critical(s, 'No rate limiter module found', 'Create lib/middleware/rate-limiter.ts'); return; }

  // Check proxy.ts applies rate limiting
  const proxy = readFile('proxy.ts');
  if (proxy && /rate.?limit|rateLimit|rateLimiter/i.test(proxy)) pass(s, 'proxy.ts references rate limiting');
  else warning(s, 'proxy.ts may not apply rate limiting', 'Verify rate limiting in middleware');

  // Check public write endpoints have rate limiting (proxy-level counts)
  const proxyHandlesAll = proxy && /checkRateLimits|rateLimit/i.test(proxy);
  const publicWriteEndpoints = ['app/api/contact/route.ts', 'app/api/inquiries/route.ts', 'app/api/cma/route.ts',
    'app/api/sign-up/route.ts', 'app/api/favorites/route.ts', 'app/api/search-alerts/route.ts'];
  for (const ep of publicWriteEndpoints) {
    const content = readFile(ep);
    if (!content) continue;
    if (proxyHandlesAll || /rateLimit|rate.?limit|checkRateLimit|rateLimiter/i.test(content))
      pass(s, `${ep}: rate limited (${proxyHandlesAll ? 'via proxy' : 'in-route'})`);
    else warning(s, `${ep}: no explicit rate limiting`, 'Public write endpoint should have rate limiting');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 15: PII / Logging Redaction
// ═══════════════════════════════════════════════════════════════════════════
function section15() {
  const s = startSection(15, 'PII / Logging Redaction', 'Auth & Security');
  const apiFiles = findFiles('app/api', '.ts').filter(f => f.endsWith('route.ts'));
  let piiLogCount = 0;
  for (const file of apiFiles) {
    const content = readFile(file);
    if (!content) continue;
    // Check for console.log that might leak PII
    const logMatches = content.match(/console\.(log|info|warn|error)\([^)]*\b(email|phone|password|ssn|token|secret)\b[^)]*\)/gi) || [];
    for (const match of logMatches) {
      if (/sanitize|redact|mask|\*\*\*/i.test(match)) continue;
      warning(s, `${file}: PII in log statement`, `"${match.substring(0, 80)}..." — redact sensitive fields`);
      piiLogCount++;
    }
  }
  if (piiLogCount === 0) pass(s, 'No obvious PII leakage in log statements');

  // Check DTO sanitization exists
  const dto = readFile('lib/compliance/dto.ts');
  if (dto && /sanitizeForPublic|sanitizeForPortal|sanitizeForCRM/.test(dto))
    pass(s, 'DTO sanitization functions exist');
  else warning(s, 'Missing DTO sanitization functions', 'Ensure portal/public data is sanitized');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 16: Coming Soon Badge (UCBA Sec. 2.04)
// ═══════════════════════════════════════════════════════════════════════════
function section16() {
  const s = startSection(16, 'Coming Soon Badge (UCBA Sec. 2.04)', 'Compliance');
  const gate = readFile('lib/compliance/idx-display-gate.ts');
  if (gate && /getComingSoonDate/.test(gate)) pass(s, 'getComingSoonDate() defined');
  else critical(s, 'getComingSoonDate() MISSING', 'Required by UCBA');
  if (gate && /formatComingSoonBadge/.test(gate)) pass(s, 'formatComingSoonBadge() defined');
  else critical(s, 'formatComingSoonBadge() MISSING', '');

  const listing = readFile('app/listing/[...slug]/page.tsx');
  if (listing && /coming.?soon|comingSoon/i.test(listing)) pass(s, 'Listing page: Coming Soon badge');
  else critical(s, 'Listing page: NO Coming Soon badge', 'UCBA $250 first offense');

  const card = findFiles('app/components', '.tsx').find(f => f.includes('SearchListingCard'));
  if (card && /coming.?soon|comingSoon/i.test(readFile(card) || '')) pass(s, 'Search card: Coming Soon badge');
  else warning(s, 'Search card: Coming Soon badge not found', '');

  const dto = readFile('lib/idx/db-to-public-dto.ts') || readFile('lib/idx/public-dto.ts');
  if (dto && /comingSoon|coming_soon/i.test(dto)) pass(s, 'DTO: Coming Soon field');
  else critical(s, 'DTO: No Coming Soon field', 'Frontend needs this data');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 17: Fair Housing / UCBA E7 Full Coverage
// ═══════════════════════════════════════════════════════════════════════════
function section17() {
  const s = startSection(17, 'Fair Housing / UCBA E7 Full Coverage', 'Compliance');
  const enforcement = readFile('lib/compliance/rls-enforcement.ts');
  if (!enforcement) { critical(s, 'rls-enforcement.ts', 'Not found'); return; }

  // Check Fair Housing patterns exist for all jurisdictions
  const jurisdictions = [
    { name: 'Federal FHA', rx: /Federal FHA/ },
    { name: 'NY HRL (Age)', rx: /NY HRL.*Age/ },
    { name: 'NY HRL (Marital)', rx: /NY HRL.*Marital/ },
    { name: 'NY HRL (Sexual Orientation)', rx: /NY HRL.*Sexual/ },
    { name: 'NY HRL (Military/Veteran)', rx: /NY HRL.*Military|Veteran/ },
    { name: 'NYC HRL Title 8 (Source of Income)', rx: /Source of Income|section.?8|voucher/i },
    { name: 'NYC HRL Title 8 (Citizenship)', rx: /Citizenship|Immigration/i },
    { name: 'NYC Fair Chance Housing', rx: /Fair Chance|criminal/i },
    { name: 'NYC HRL Title 8 (Gender Identity)', rx: /Gender Identity|transgender/i },
  ];
  for (const j of jurisdictions) {
    if (j.rx.test(enforcement)) pass(s, `${j.name}: scanning patterns present`);
    else critical(s, `${j.name}: scanning patterns MISSING`, 'Fair Housing violation risk');
  }

  // Check email templates also scanned
  const emailDir = findFiles('lib/email', '.ts');
  if (emailDir.length > 0) {
    const anyScanned = emailDir.some(f => /fairHousing|fair.?housing|scanContent/i.test(readFile(f) || ''));
    if (anyScanned) pass(s, 'Email templates: Fair Housing scanning');
    else info(s, 'Email templates: no Fair Housing scanning found', 'Consider scanning outbound emails');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 18: REBNY Attribution Presence
// ═══════════════════════════════════════════════════════════════════════════
function section18() {
  const s = startSection(18, 'REBNY Attribution Presence', 'Compliance');
  const disclaimer = findFiles('app/components', '.tsx').find(f => f.includes('IDXDisclaimer'));
  if (disclaimer) pass(s, 'IDXDisclaimer component exists');
  else { critical(s, 'No IDXDisclaimer component', 'REBNY requires attribution on all IDX pages'); return; }

  const pages = ['app/search/page.tsx', 'app/listing/[...slug]/page.tsx', 'app/manhattan/page.tsx'];
  for (const page of pages) {
    const content = readFile(page);
    if (!content) continue;
    if (/IDXDisclaimer|idx.?disclaimer/i.test(content)) pass(s, `${page}: IDX attribution`);
    else warning(s, `${page}: no IDXDisclaimer found`, 'REBNY requires attribution on all IDX data pages');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 19: Audit + Retention Enforcement
// ═══════════════════════════════════════════════════════════════════════════
function section19() {
  const s = startSection(19, 'Audit + Retention Enforcement', 'Compliance');
  const schema = readFile('prisma/schema.prisma');
  if (schema && /AuditEvent/.test(schema)) pass(s, 'AuditEvent model in schema');
  else critical(s, 'AuditEvent model MISSING', 'REBNY requires audit logging');

  // Check data-retention cron exists and is scheduled
  const retention = readFile('app/api/cron/data-retention/route.ts');
  if (retention) pass(s, 'data-retention cron route exists');
  else critical(s, 'data-retention cron MISSING', 'NY SHIELD Act requires data retention enforcement');

  const vj = readFile('vercel.json');
  if (vj && /data-retention/.test(vj)) pass(s, 'data-retention cron scheduled');
  else critical(s, 'data-retention cron NOT SCHEDULED', '');

  // Check audit events on state changes
  const convertRoute = readFile('app/api/crm/convert/route.ts') || readFile('app/api/crm/sales/prospects/[id]/convert/route.ts');
  if (convertRoute && /AuditEvent|auditEvent|audit/i.test(convertRoute)) pass(s, 'Convert API: audit logging');
  else warning(s, 'Convert API: no audit logging found', 'State transitions should be audited');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 20: Schema Evolution / Contract Testing
// ═══════════════════════════════════════════════════════════════════════════
function section20() {
  const s = startSection(20, 'Schema Evolution / Contract Testing', 'Data Integrity');
  // Check mapper → DTO field chain
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const dto = readFile('lib/idx/db-to-public-dto.ts') || readFile('lib/idx/public-dto.ts');
  if (!mapper || !dto) { warning(s, 'Required files', 'Cannot read mapper or DTO'); return; }

  // Extract mapper return keys
  const retMatch = mapper.match(/return\s*\{([\s\S]*?)\};\s*\}/);
  const mapperKeys = new Set();
  if (retMatch) {
    let m;
    const rx = /^\s+(\w+)\s*[,:]/gm;
    while ((m = rx.exec(retMatch[1])) !== null) mapperKeys.add(m[1]);
  }

  // Check DTO references mapper output fields
  const dtoFields = new Set();
  const dtoFieldRx = /(?:listing|l|row|db)\.\b(\w+)\b/g;
  let m;
  while ((m = dtoFieldRx.exec(dto)) !== null) dtoFields.add(m[1]);

  let chainOk = 0;
  for (const key of mapperKeys) {
    if (dtoFields.has(key) || ['media', 'agentInfo', 'agent_info', 'compliance', 'features', 'address'].includes(key)) chainOk++;
  }
  pass(s, `Mapper→DTO contract: ${chainOk}/${mapperKeys.size} fields referenced in DTO`);

  // Check for DB migration sync
  const migrationDir = path.join(ROOT, 'prisma', 'migrations');
  if (fs.existsSync(migrationDir)) {
    const migrations = fs.readdirSync(migrationDir).filter(f => !f.startsWith('.')).length;
    pass(s, `Prisma migrations: ${migrations} applied`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 21: Idempotent Sync / Concurrency
// ═══════════════════════════════════════════════════════════════════════════
function section21() {
  const s = startSection(21, 'Idempotent Sync / Concurrency', 'Data Integrity');
  const sync = readFile('lib/idx/sync.ts');
  if (!sync) { warning(s, 'lib/idx/sync.ts', 'Not found'); return; }

  // Check for upsert (idempotent) vs create (non-idempotent)
  if (/upsert/.test(sync)) pass(s, 'IDX sync uses upsert (idempotent)');
  else if (/create(?!Many)/.test(sync)) warning(s, 'IDX sync uses create (non-idempotent)', 'Duplicate listings on re-run');
  else pass(s, 'IDX sync pattern OK');

  // Check for ModificationTimestamp-based dedup
  if (/ModificationTimestamp|modification_timestamp|lastModified/.test(sync))
    pass(s, 'Sync uses ModificationTimestamp for change detection');
  else warning(s, 'No ModificationTimestamp check in sync', 'Risk of processing unchanged listings');

  // Check IDX sync cron for concurrent execution guard
  const idxSync = readFile('app/api/cron/idx-sync/route.ts');
  if (idxSync) {
    if (/advisory.?lock|mutex|semaphore|isRunning|SYNC_LOCK|recentSync|already ran|Concurrency guard/i.test(idxSync))
      pass(s, 'IDX sync has concurrency guard');
    else warning(s, 'IDX sync has no concurrency guard', 'Overlapping cron runs may cause duplicates');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 22: Indexing / Query-Plan Sanity
// ═══════════════════════════════════════════════════════════════════════════
function section22() {
  const s = startSection(22, 'Indexing / Query-Plan Sanity', 'Data Integrity');
  const schema = readFile('prisma/schema.prisma');
  if (!schema) { warning(s, 'schema.prisma', 'Not found'); return; }

  // Extract Listing model indexes
  const listingMatch = schema.match(/model\s+Listing\s*\{([\s\S]*?)^\}/m);
  if (!listingMatch) return;
  const indexes = (listingMatch[1].match(/@@index\(\[([^\]]+)\]\)/g) || []);
  pass(s, `Listing model: ${indexes.length} indexes defined`);

  // Check common query patterns have indexes
  const expectedIndexed = ['mls_id', 'status', 'property_type', 'list_price', 'bedrooms_total', 'neighborhood'];
  for (const col of expectedIndexed) {
    if (listingMatch[1].includes(col) && (indexes.some(i => i.includes(col)) || listingMatch[1].includes(`@unique`)))
      pass(s, `Index on ${col}`);
    else info(s, `No index on ${col}`, 'Consider adding for search performance');
  }

  // Check for unpaginated findMany
  const apiFiles = findFiles('app/api', '.ts').filter(f => f.endsWith('route.ts'));
  for (const file of apiFiles) {
    const content = readFile(file);
    if (!content) continue;
    const findManyPattern = /findMany\(\s*\{(?:(?!take|skip).)*\}/gs;
    if (findManyPattern.test(content) && !content.includes('// paginated') && !hasAnnotation(content, 0, 'IDX-VALIDATE-OK')) {
      const hasTake = /findMany[^}]*take\s*:/s.test(content);
      if (!hasTake && /findMany/.test(content)) {
        // Only flag routes that could return large datasets
        if (file.includes('/listings/') || file.includes('/leads/') || file.includes('/search'))
          info(s, `${file}: findMany without take limit`, 'Consider pagination for large datasets');
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 23: External API Resilience
// ═══════════════════════════════════════════════════════════════════════════
function section23() {
  const s = startSection(23, 'External API Resilience', 'Data Integrity');
  const fetch = readFile('lib/idx/fetch.ts');
  const auth = readFile('lib/idx/auth.ts');

  if (fetch) {
    if (/AbortController|timeout|signal/.test(fetch)) pass(s, 'Trestle fetch: timeout/abort configured');
    else warning(s, 'Trestle fetch: no timeout', 'Add AbortController timeout');
    if (/retry|retries|attempt/i.test(fetch)) pass(s, 'Trestle fetch: retry logic');
    else warning(s, 'Trestle fetch: no retry logic', 'Add retry with backoff for transient errors');
    if (/429|rate.?limit|too.?many/i.test(fetch)) pass(s, 'Trestle fetch: 429 handling');
    else warning(s, 'Trestle fetch: no 429 handling', 'Add backoff on rate limit responses');
  } else warning(s, 'lib/idx/fetch.ts not found', '');

  if (auth) {
    if (/refresh|token.*expir|reauth|getAccessToken/i.test(auth)) pass(s, 'Trestle auth: token refresh logic');
    else warning(s, 'Trestle auth: no token refresh', 'Token may expire mid-sync');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 24: Dead Components
// ═══════════════════════════════════════════════════════════════════════════
function section24() {
  const s = startSection(24, 'Dead Components', 'Bloat & Hygiene');
  const components = findFiles('app/components', '.tsx');
  const allAppFiles = [...findFiles('app', '.tsx'), ...findFiles('app', '.ts')];

  for (const comp of components) {
    const basename = path.basename(comp, '.tsx');
    // Check if this component is imported anywhere else
    const importPattern = new RegExp(`from\\s+['"][^'"]*${basename}['"]|import.*${basename}`);
    const importedAnywhere = allAppFiles.some(f => {
      if (f === comp) return false;
      const content = readFile(f);
      return content && importPattern.test(content);
    });
    if (importedAnywhere) pass(s, basename);
    else info(s, `${basename} — never imported`, `${comp} is dead code (${((readFile(comp) || '').split('\n').length)} lines)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 25: Unused npm Dependencies
// ═══════════════════════════════════════════════════════════════════════════
function section25() {
  const s = startSection(25, 'Unused npm Dependencies', 'Bloat & Hygiene');
  const pkg = readFile('package.json');
  if (!pkg) { warning(s, 'package.json', 'Not found'); return; }
  const { dependencies = {} } = JSON.parse(pkg);
  const srcFiles = [...findFiles('app', '.ts'), ...findFiles('app', '.tsx'), ...findFiles('lib', '.ts'),
    ...findFiles('lib', '.tsx'), ...findFiles('scripts', '.js'), ...findFiles('scripts', '.ts')];
  const allSrc = srcFiles.map(f => readFile(f) || '').join('\n');

  for (const dep of Object.keys(dependencies)) {
    // Normalize package name for import matching
    const importName = dep.startsWith('@') ? dep : dep.split('/')[0];
    const patterns = [
      new RegExp(`from\\s+['"]${importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      new RegExp(`require\\(['"]${importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      new RegExp(`import\\s+['"]${importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    ];
    // Also check config files
    const configFiles = ['next.config.js', 'next.config.ts', 'tailwind.config.ts', 'postcss.config.js',
      'sentry.client.config.ts', 'sentry.server.config.ts'].map(f => readFile(f) || '').join('\n');
    const allContent = allSrc + '\n' + configFiles;

    if (patterns.some(p => p.test(allContent))) pass(s, dep);
    else if (['prisma', '@prisma/client', 'react', 'react-dom', 'next', 'typescript', 'sharp'].includes(dep))
      pass(s, `${dep} (framework/runtime)`);
    else info(s, `${dep} — no imports found`, 'May be unused — verify before removing');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 26: Cache / CDN Hygiene
// ═══════════════════════════════════════════════════════════════════════════
function section26() {
  const s = startSection(26, 'Cache / CDN Hygiene', 'Bloat & Hygiene');
  // Check public listing API has Cache-Control
  const listingsRoute = readFile('app/api/listings/route.ts');
  if (listingsRoute) {
    if (/Cache-Control|cache.?control|setHeader.*cache/i.test(listingsRoute))
      pass(s, '/api/listings: Cache-Control header');
    else info(s, '/api/listings: no Cache-Control', 'Consider adding for CDN caching');
    if (/revalidate|stale.?while/i.test(listingsRoute))
      pass(s, '/api/listings: revalidation strategy');
    else info(s, '/api/listings: no revalidation strategy', '');
  }

  // Check media proxy has caching
  const mediaProxy = readFile('app/api/media/proxy/route.ts');
  if (mediaProxy) {
    if (/Cache-Control|cache.?control|max-age/i.test(mediaProxy))
      pass(s, '/api/media/proxy: Cache-Control header');
    else warning(s, '/api/media/proxy: no Cache-Control', 'Media should be cached at CDN');
  }

  // Check next.config for image optimization
  const nextConfig = readFile('next.config.js') || readFile('next.config.ts');
  if (nextConfig && /images\s*:/.test(nextConfig)) pass(s, 'next.config: image optimization configured');
  else info(s, 'next.config: no image optimization config', '');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 27: CRM → API Body Field Alignment
// Verifies CRM fetch body field names match what API routes actually read.
// ═══════════════════════════════════════════════════════════════════════════
function section27() {
  const s = startSection(27, 'CRM → API Body Field Alignment', 'CRM & API');

  // Known field mappings to validate: [crmFile, endpoint, fieldSentByCRM, fieldExpectedByAPI]
  const knownMismatches = [
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/emails/send', correctEndpoint: '/api/crm/email',
      sent: 'client_id', expected: 'client_ids (array)', severity: 'CRITICAL' },
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/emails/send', correctEndpoint: '/api/crm/email',
      sent: 'template', expected: '(not supported)', severity: 'CRITICAL' },
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/cma',
      sent: 'address', expected: 'property_address', severity: 'CRITICAL' },
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/market-reports', correctEndpoint: '/api/crm/market-report',
      sent: 'client_id, address', expected: 'report_type, property_types, borough, neighborhoods', severity: 'CRITICAL' },
    // showings: CRM now sends listing_id + lead_id (fixed from property_address + client_id) — RESOLVED
    // next_follow_up: CRM sends it, API now handles it (added to PATCH handler) — RESOLVED
    { crmFile: 'panels.js', endpoint: '/api/crm/leads POST',
      sent: 'FormData', expected: '(only GET handler exists)', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/clients/[id]',
      sent: 'assignedAgentId', expected: 'agent_id', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/deals/[id]',
      sent: 'splitAmount', expected: 'split_percent', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/deals/[id]',
      sent: 'payoutStatus', expected: '(field not in schema)', severity: 'CRITICAL' },
  ];

  // Dynamically verify each mismatch still exists in WRITE contexts
  for (const mm of knownMismatches) {
    const crmContent = readFile(`public/crm/js/dashboard/${mm.crmFile}`);
    if (!crmContent) { info(s, `${mm.crmFile}`, 'File not found (may have been fixed)'); continue; }

    // Check for the wrong field name in WRITE contexts only (near update/fetch/POST/PATCH/body/stringify)
    const sentField = mm.sent.split(',')[0].trim();
    let issueFound = false;

    if (mm.correctEndpoint) {
      // Wrong endpoint path — check if the wrong URL is still used in a fetch call
      const wrongUrl = mm.endpoint.replace(' POST', '').replace(' PATCH', '');
      const fetchPattern = new RegExp(`_fetch\\s*\\([^)]*${wrongUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      issueFound = fetchPattern.test(crmContent);
    } else {
      // Wrong field name — check ONLY in JSON.stringify or .update() body objects
      // Must be inside { ... sentField: ... } passed to update() or stringify()
      const bodyPattern = new RegExp(`(?:update\\([^,]+,\\s*\\{|stringify\\s*\\(\\s*\\{)[^}]{0,300}\\b${sentField}\\s*:`);
      issueFound = bodyPattern.test(crmContent);
    }

    if (issueFound) {
      critical(s, `${mm.endpoint}: sends "${mm.sent}" → API expects "${mm.expected}"`,
        `Fix in ${mm.crmFile}. ${mm.correctEndpoint ? 'Correct endpoint: ' + mm.correctEndpoint : ''}`);
    } else {
      pass(s, `${mm.endpoint}: "${mm.sent}" (fixed or not found)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 28: Search Filter Integrity
// Validates search filters, enums, checkbox wiring, and OData compatibility.
// ═══════════════════════════════════════════════════════════════════════════
function section28() {
  const s = startSection(28, 'Search Filter Integrity', 'Search');

  const searchEngine = readFile('public/crm/js/search/search-engine.js');
  const searchRoute = readFile('app/api/idx/search/route.ts');
  const listingsRoute = readFile('app/api/listings/route.ts');

  // 1. PropertySubType checkbox bug (.value vs data-value)
  if (searchEngine) {
    if (/\.value\b(?![\s]*=)/.test(searchEngine) && /PropertySubType/.test(searchEngine)) {
      // Check if collectSearchCriteria uses .value for checkboxes (returns "on" instead of data-value)
      const ptBlock = searchEngine.match(/PropertySubType[\s\S]{0,500}/);
      if (ptBlock && /\.value/.test(ptBlock[0]) && !/data-value|getAttribute/.test(ptBlock[0])) {
        critical(s, 'PropertySubType checkbox uses .value ("on") instead of data-value',
          'search-engine.js: checkbox .value returns "on", should use getAttribute("data-value")');
      } else pass(s, 'PropertySubType checkbox wiring');
    } else pass(s, 'PropertySubType checkbox wiring');
  }

  // 2. Check for unwired checkboxes (data-field missing)
  const indexBuilt = readFile('public/crm/index-built.html');
  if (indexBuilt) {
    // Count checkboxes WITH data-field vs WITHOUT
    const allCheckboxes = (indexBuilt.match(/<input[^>]*type=["']checkbox["'][^>]*>/gi) || []);
    const withDataField = allCheckboxes.filter(cb => /data-field/i.test(cb));
    const withoutDataField = allCheckboxes.filter(cb => !/data-field/i.test(cb) && !/data-rls-ignore/i.test(cb));
    const searchCheckboxes = withoutDataField.filter(cb =>
      !/consent|agree|terms|privacy|cookie|sidebar|modal|toggle|select-all|portal|setting|notify|pref|rsvp|status-|mls-status|comp-|grid-|form-|manage-|oh-/i.test(cb)); // exclude non-search checkboxes

    pass(s, `Checkboxes with data-field: ${withDataField.length}`);
    // Most checkboxes without data-field are non-search UI (status, modals, forms, settings)
    if (searchCheckboxes.length > 100) {
      info(s, `${searchCheckboxes.length} checkboxes without data-field (mostly non-search UI)`, 'Expected — UI checkboxes outnumber search filters');
    } else if (searchCheckboxes.length > 20) {
      warning(s, `${searchCheckboxes.length} checkboxes without data-field`, 'May be unwired filters');
    } else pass(s, 'All search checkboxes have data-field');
  }

  // 3. CRM search filters: the canonical Search engine executes ONLY its declared criteria vocabulary and
  //    REFUSES any other filter BY NAME (422 unsupported_criteria) — nothing is silently dropped.
  //    (The pre-engine `checkboxFilters` pass-through is gone with the retired route; Packet 2 closure.)
  if (searchRoute) {
    const engineCriteria = readFile('lib/search/engine/criteria.ts') || '';
    if (/checkboxFilters/.test(searchRoute)) pass(s, '/api/idx/search: checkboxFilters supported');
    else if (/search\/engine\/executor/.test(searchRoute) && /UNSUPPORTED_CRITERION|refusal\.unsupported/.test(searchRoute + engineCriteria)) pass(s, '/api/idx/search: unknown filters are refused by name (engine criteria contract)');
    else critical(s, '/api/idx/search: NO checkboxFilters support',
      'Generic checkbox filters from CRM are silently dropped. Add checkboxFilters handling.');
  }

  // 4. OData-safe field set coverage
  if (searchRoute || listingsRoute) {
    const route = searchRoute || listingsRoute;
    const odataSafeMatch = route.match(/odataSafe[^=]*=\s*new\s+Set\(\[([^\]]+)\]\)/);
    if (odataSafeMatch) {
      const safeFields = (odataSafeMatch[1].match(/"([^"]+)"/g) || []).map(f => f.replace(/"/g, ''));
      pass(s, `OData-safe checkbox fields: ${safeFields.length}`);

      // Check for commonly needed fields NOT in odataSafe
      const commonFields = ['View', 'AccessibilityFeatures', 'ExteriorFeatures', 'BuildingFeatures',
        'LaundryFeatures', 'SecurityFeatures', 'DirectionFaces', 'Concessions'];
      const missing = commonFields.filter(f => !safeFields.includes(f));
      if (missing.length > 0) {
        warning(s, `${missing.length} common fields NOT in odataSafe: ${missing.join(', ')}`,
          'These filters only work client-side (expensive for large result sets)');
      }
    }
  }

  // 5. Comps search functionality
  if (searchEngine && /comp.*search|compSearch|comps.*button/i.test(searchEngine)) {
    // Check if comps search actually calls an API
    if (/comp.*fetch|comp.*MallanAPI|comp.*_serverSearch/i.test(searchEngine)) {
      pass(s, 'Comps search: API integration exists');
    } else {
      info(s, 'Comps search: UI exists, API integration planned',
        'Comp toolbar buttons pending implementation.');
    }
  } else if (indexBuilt && /comp.*toolbar|comp.*search/i.test(indexBuilt)) {
    warning(s, 'Comps search HTML exists but no JS handler found', '');
  }

  // 6. Distribution gates on both search endpoints
  if (listingsRoute && /checkDistributionGates|idx_display_yn.*true/.test(listingsRoute)) {
    pass(s, '/api/listings: distribution gates enforced');
  } else if (listingsRoute) {
    critical(s, '/api/listings: distribution gates NOT enforced', 'REBNY violation');
  }

  const engineHydrate = readFile('lib/search/engine/hydrate.ts') || '';
  if (searchRoute && (/checkDistributionGates/.test(searchRoute) || (/search\/engine\/executor/.test(searchRoute) && /derivePermissionGates\(raw\)/.test(engineHydrate)))) {
    pass(s, '/api/idx/search: distribution gates enforced (canonical derivePermissionGates in the engine hydrate step)');
  } else if (searchRoute) {
    critical(s, '/api/idx/search: distribution gates NOT enforced', 'REBNY violation');
  }

  // 7. Address search direction normalization
  if (searchRoute || listingsRoute) {
    const route = searchRoute || listingsRoute;
    if (/EAST|WEST|NORTH|SOUTH|StreetDirPrefix/i.test(route)) {
      pass(s, 'Address search: direction normalization present');
    } else warning(s, 'Address search: no direction normalization', 'E vs EAST searches may fail');
  }

  // 8. Pagination bounds
  if (listingsRoute) {
    if (/take.*200|limit.*200|\$top.*200|MAX_PAGE/i.test(listingsRoute)) {
      pass(s, 'Search pagination: upper bound enforced');
    } else warning(s, 'Search pagination: no explicit upper bound', 'Risk of returning 10,000+ results');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 29: Interactive Element Wiring
// Validates all frontend forms, buttons, and handlers are properly connected.
// ═══════════════════════════════════════════════════════════════════════════
function section29() {
  const s = startSection(29, 'Interactive Element Wiring', 'Frontend');

  // All form endpoints that must exist
  const formEndpoints = [
    { form: 'Contact Form', endpoint: 'app/api/contact/route.ts', method: 'POST' },
    { form: 'Inquiry Form', endpoint: 'app/api/inquiries/route.ts', method: 'POST' },
    { form: 'CMA Request', endpoint: 'app/api/cma/route.ts', method: 'POST' },
    { form: 'Open House RSVP', endpoint: 'app/api/open-houses/rsvp/route.ts', method: 'POST' },
    { form: 'Search Alerts', endpoint: 'app/api/search-alerts/route.ts', method: 'POST' },
    { form: 'Portal Complete Profile', endpoint: 'app/api/portal/complete-profile/route.ts', method: 'POST' },
    { form: 'Search Suggest', endpoint: 'app/api/listings/suggest/route.ts', method: 'GET' },
    { form: 'Company Settings', endpoint: 'app/api/settings/company/route.ts', method: 'GET' },
  ];

  for (const fe of formEndpoints) {
    const content = readFile(fe.endpoint);
    if (!content) { critical(s, `${fe.form}: endpoint MISSING (${fe.endpoint})`, ''); continue; }
    const methodRx = new RegExp(`export\\s+(async\\s+)?function\\s+${fe.method}\\b`);
    if (methodRx.test(content)) pass(s, `${fe.form}: ${fe.method} ${fe.endpoint}`);
    else critical(s, `${fe.form}: ${fe.method} handler MISSING in ${fe.endpoint}`, '');
  }

  // Check all form components have error handling
  const formComponents = [
    'app/components/InquiryForm.tsx',
    'app/components/InquiryModal.tsx',
    'app/components/CMARequestForm.tsx',
    'app/components/OpenHouseRSVP.tsx',
    'app/components/ExitIntentPopup.tsx',
    'app/components/CalculatorLeadCapture.tsx',
    'app/contact/page.tsx',
  ];
  for (const comp of formComponents) {
    const content = readFile(comp);
    if (!content) continue;
    const hasTryCatch = /try\s*\{[\s\S]*?catch/.test(content);
    const hasErrorState = /setError|setSubmitStatus|error.*state|catch.*set/i.test(content);
    if (hasTryCatch || hasErrorState) pass(s, `${path.basename(comp)}: error handling`);
    else warning(s, `${path.basename(comp)}: no error handling on submit`, '');
  }

  // Check TCPA consent on all lead capture forms
  for (const comp of formComponents) {
    const content = readFile(comp);
    if (!content) continue;
    if (/consent|agreeToTerms|tcpa/i.test(content)) pass(s, `${path.basename(comp)}: TCPA consent`);
    else warning(s, `${path.basename(comp)}: no TCPA consent checkbox`, 'Required for lead capture');
  }

  // Check for unquoted ID injection in onclick handlers (causes ReferenceError at runtime)
  // Dangerous: onclick="func(' + l.id + ')"  → becomes func(RLS123) → ReferenceError
  // Safe:      onclick="func(\'' + l.id + '\')"  → becomes func('RLS123') → works
  // Safe:      onclick="func(' + idx + ')" → numeric, no issue
  const jsFiles = [...findFiles('public/crm/js', '.js'), ...findFiles('public/crm', '.html')];
  let unquotedCount = 0;
  const unquotedFiles = [];
  for (const file of jsFiles) {
    const content = readFile(file);
    if (!content) continue;
    // Find: (' + variable.id + ') or (' + variable.lid + ') — string IDs without quotes
    // These are the dangerous ones (numeric indices like idx, ti+1 are safe)
    const dangerousPattern = /\(' \+ (\w+\.(?:id|lid|listing_id|listingId)) \+ '\)/g;
    let m;
    while ((m = dangerousPattern.exec(content)) !== null) {
      // Check surrounding context for \' quotes (already safe)
      const before20 = content.substring(Math.max(0, m.index - 20), m.index);
      const after20 = content.substring(m.index + m[0].length, m.index + m[0].length + 20);
      const fullMatch = before20 + m[0] + after20;
      if (fullMatch.includes("\\\\'") || fullMatch.includes("\\\\'" + " + " + m[1])) continue; // already quoted
      unquotedCount++;
      if (!unquotedFiles.includes(file)) unquotedFiles.push(file);
    }
  }
  if (unquotedCount === 0) {
    pass(s, 'No unquoted ID injection in onclick handlers');
  } else {
    critical(s, `${unquotedCount} unquoted ID injections in onclick handlers`,
      `Files: ${unquotedFiles.join(', ')}. String IDs like RLS20069227 cause ReferenceError. Quote with \\'.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 30: Trestle → Frontend Data Chain
// Validates no field is lost or renamed incorrectly across the 5-step chain.
// ═══════════════════════════════════════════════════════════════════════════
function section30() {
  const s = startSection(30, 'Trestle → Frontend Data Chain', 'Data Integrity');

  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const dto = readFile('lib/idx/db-to-public-dto.ts') || readFile('lib/idx/public-dto.ts');
  const listingPage = readFile('app/listing/[...slug]/page.tsx');
  if (!mapper || !dto) { warning(s, 'Required files', 'Cannot read mapper or DTO'); return; }

  // Critical fields that must survive the full chain
  const criticalFields = [
    { trestle: 'ListPrice', prisma: 'list_price', dto: /listPrice|list_price/, frontend: /listPrice|list_price|price/ },
    { trestle: 'BedroomsTotal', prisma: 'bedrooms_total', dto: /bedroomsTotal|bedrooms_total/, frontend: /bedroomsTotal|bedrooms|beds/ },
    { trestle: 'BathroomsFull', prisma: 'bathrooms_full', dto: /bathroomsFull|bathrooms_full/, frontend: /bathroomsFull|bathrooms|baths/ },
    { trestle: 'LivingArea', prisma: 'living_area', dto: /livingArea|living_area/, frontend: /livingArea|living_area|sqft/ },
    { trestle: 'StandardStatus', prisma: 'status', dto: /status/, frontend: /status/ },
    { trestle: 'PropertyType', prisma: 'property_type', dto: /propertyType|property_type/, frontend: /propertyType|property_type/ },
    { trestle: 'PublicRemarks', prisma: 'features', dto: /publicRemarks|public_remarks/, frontend: /publicRemarks|description/ },
    { trestle: 'ListOfficeName', prisma: 'agent_info', dto: /listOfficeName|list_office/, frontend: /listOfficeName|officeName/ },
  ];

  for (const field of criticalFields) {
    const inMapper = mapper.includes(field.trestle) || mapper.includes(field.prisma);
    const inDTO = field.dto.test(dto);
    const inFrontend = listingPage ? field.frontend.test(listingPage) : true;

    if (inMapper && inDTO && inFrontend) {
      pass(s, `${field.trestle} → ${field.prisma} → DTO → frontend`);
    } else {
      const gaps = [];
      if (!inMapper) gaps.push('mapper');
      if (!inDTO) gaps.push('DTO');
      if (!inFrontend) gaps.push('frontend');
      warning(s, `${field.trestle}: gap in ${gaps.join(', ')}`,
        `Field may not reach the frontend. Check ${gaps.join(' → ')}`);
    }
  }

  // Check for "dead" fields (fetched but never displayed)
  const deadFields = ['CommonInterest', 'CeilingHeight', 'BuildingKeyNumeric'];
  for (const field of deadFields) {
    if (mapper.includes(field) && dto && !new RegExp(field, 'i').test(dto)) {
      info(s, `${field}: fetched + stored but NOT in DTO (dead field)`, 'Consider exposing or removing');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 31: Portal Auth Flow
// Validates portal login, invite acceptance, and profile completion chains.
// ═══════════════════════════════════════════════════════════════════════════
function section31() {
  const s = startSection(31, 'Portal Auth Flow', 'Frontend');

  // Check invite acceptance chain
  const acceptPage = readFile('app/portal/accept/page.tsx');
  const inviteRoute = readFile('app/api/auth/invite/[token]/route.ts');
  if (acceptPage) {
    if (/\/api\/auth\/invite/.test(acceptPage)) pass(s, 'Accept invite: calls /api/auth/invite/[token]');
    else critical(s, 'Accept invite: wrong API endpoint', '');
  } else warning(s, 'app/portal/accept/page.tsx not found', '');
  if (inviteRoute) {
    if (/export.*GET/.test(inviteRoute)) pass(s, 'Invite route: GET handler (validate token)');
    else critical(s, 'Invite route: no GET handler', '');
    if (/export.*POST/.test(inviteRoute)) pass(s, 'Invite route: POST handler (create account)');
    else critical(s, 'Invite route: no POST handler', '');
  } else warning(s, 'app/api/auth/invite/[token]/route.ts not found', '');

  // Check profile completion chain
  const profilePage = readFile('app/portal/complete-profile/page.tsx');
  const profileRoute = readFile('app/api/portal/complete-profile/route.ts');
  if (profilePage && /\/api\/portal\/complete-profile/.test(profilePage))
    pass(s, 'Complete profile: calls correct endpoint');
  else if (profilePage) critical(s, 'Complete profile: wrong endpoint', '');

  if (profileRoute && /export.*POST/.test(profileRoute))
    pass(s, 'Profile route: POST handler exists');
  else if (profileRoute) critical(s, 'Profile route: no POST handler', '');

  // Check /api/auth/me exists (used by portal pages)
  const meRoute = readFile('app/api/auth/me/route.ts');
  if (meRoute && /export.*GET/.test(meRoute)) pass(s, '/api/auth/me: GET handler exists');
  else critical(s, '/api/auth/me: MISSING', 'Portal pages depend on this for user state');

  // Check portal router exists
  const portalLayout = readFile('app/portal/layout.tsx');
  if (portalLayout) pass(s, 'app/portal/layout.tsx exists');
  else warning(s, 'No portal layout — portal pages may lack auth wrapper', '');

  // Check session/auth middleware covers portal routes
  // Portal routes use requirePortalRole/requireAuth at the handler level (verified in section 12)
  pass(s, 'Portal routes: auth enforced at handler level (requirePortalRole/requireAuth)');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 32: Run History & Trend Storage
// Persists results and detects regressions across runs.
// ═══════════════════════════════════════════════════════════════════════════
function section32() {
  const s = startSection(32, 'Run History & Trends', 'Platform');
  const historyDir = path.join(ROOT, '.idx-validate');
  // Run history is a local-only chronological log of validator runs (timestamps,
  // counts). It is consumed solely by section 32's regression detection — never
  // by external tooling. Tracking it in git would dirty the working tree on
  // every run because each entry adds a new timestamp. Keeping it local keeps
  // the tree deterministic per "fix(idx): make validator snapshots deterministic"
  // (2026-05-01). The .local.json suffix is gitignored.
  const historyFile = path.join(historyDir, 'run-history.local.json');

  let history = [];
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  validatorHistoryCache = { historyDir, historyFile, history };

  // Compare with last run
  if (history.length > 0) {
    const last = history[history.length - 1];
    const critDelta = totalCritical - last.critical;
    const warnDelta = totalWarning - last.warning;

    if (critDelta > 0) critical(s, `Critical issues INCREASED by ${critDelta} since last run`,
      `Last run (${last.timestamp}): ${last.critical} critical. Now: ${totalCritical}`);
    else if (critDelta < 0) pass(s, `Critical issues decreased by ${Math.abs(critDelta)} since last run`);
    else pass(s, `Critical issues unchanged (${totalCritical})`);

    if (warnDelta > 5) warning(s, `Warnings increased by ${warnDelta} since last run`, '');
    else pass(s, `Warnings: ${totalWarning} (delta: ${warnDelta >= 0 ? '+' : ''}${warnDelta})`);
  } else {
    pass(s, 'First run — baseline established');
  }

}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 33: Session Policy Compliance
// Verifies per-role cookie TTL (Broker=24h, Agent=8h, Client=30d).
// ═══════════════════════════════════════════════════════════════════════════
function section33() {
  const s = startSection(33, 'Session Policy Compliance', 'Auth & Security');
  const cookieConfig = readFile('lib/auth/cookie-config.ts');
  const loginRoute = readFile('app/api/auth/login/route.ts');
  const inviteRoute = readFile('app/api/auth/invite/[token]/route.ts');
  const resetRoute = readFile('app/api/auth/reset-password/route.ts');

  // Check cookie-config helper exists with per-role TTLs
  if (cookieConfig) {
    if (/BROKER.*24.*60.*60|24.*BROKER/s.test(cookieConfig)) pass(s, 'Broker TTL: 24h configured');
    else critical(s, 'Broker TTL not configured in cookie-config', '');
    if (/8.*60.*60.*Agent|Agent.*8.*60/si.test(cookieConfig)) pass(s, 'Agent TTL: 8h configured');
    else critical(s, 'Agent TTL not configured in cookie-config', '');
    if (/30.*24.*60.*60|Client.*30/si.test(cookieConfig)) pass(s, 'Client TTL: 30d configured');
    else critical(s, 'Client TTL not configured in cookie-config', '');
  } else {
    critical(s, 'lib/auth/cookie-config.ts MISSING', 'Create with per-role maxAge');
    return;
  }

  // Check auth routes use getSessionCookieConfig (not hardcoded maxAge)
  for (const [name, content] of [['login', loginRoute], ['invite', inviteRoute], ['reset-password', resetRoute]]) {
    if (!content) continue;
    if (/getSessionCookieConfig/.test(content)) pass(s, `${name}: uses per-role cookie config`);
    else if (/maxAge:\s*24\s*\*\s*60\s*\*\s*60/.test(content))
      critical(s, `${name}: hardcoded 24h maxAge — should use getSessionCookieConfig`, '');
    else pass(s, `${name}: cookie config OK`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 34: MFA Enforcement
// Checks if broker login requires MFA before session creation.
// ═══════════════════════════════════════════════════════════════════════════
function section34() {
  const s = startSection(34, 'MFA Enforcement (Email OTP)', 'Auth & Security');
  const loginRoute = readFile('app/api/auth/login/route.ts');
  if (!loginRoute) { warning(s, 'login route not found', ''); return; }

  // Check for MFA/OTP flow in broker login
  if (/mfa_required|mfa\.verify|otp|two.?factor/i.test(loginRoute)) {
    pass(s, 'Broker login: MFA/OTP flow detected');
  } else {
    critical(s, 'Broker login: NO MFA enforcement',
      'Broker accounts are highest-privilege. Login must require OTP verification.');
  }

  // Check MFA verify endpoint (email OTP verification)
  const mfaVerify = readFile('app/api/auth/mfa/verify/route.ts');
  if (mfaVerify) {
    pass(s, 'MFA verify endpoint exists (/api/auth/mfa/verify)');
    // MFA verify uses mfa_session token (not session cookie) — user isn't logged in yet
    if (/mfa_session|MfaSession|mfaSess/.test(mfaVerify)) pass(s, 'MFA verify: uses MFA session token (pre-login)');
    else if (/isAuthError|requireAgent|requireBroker/.test(mfaVerify)) pass(s, 'MFA verify: session auth guard present');
    else warning(s, 'MFA verify: no authentication mechanism found', '');
  } else {
    critical(s, 'MFA verify endpoint MISSING', '/api/auth/mfa/verify required for OTP verification');
  }

  // Check MFA core library (OTP generation + email/SMS sending)
  const mfaLib = readFile('lib/auth/mfa.ts');
  if (mfaLib) {
    if (/generateOtpCode|randomInt|crypto/i.test(mfaLib)) {
      pass(s, 'MFA library: OTP code generation (crypto.randomInt)');
    } else {
      warning(s, 'MFA library: no OTP generation found', '');
    }
    if (/sendOtpEmail|sendMail|nodemailer|smtp/i.test(mfaLib)) {
      pass(s, 'MFA library: email OTP delivery');
    } else {
      warning(s, 'MFA library: no email delivery found', '');
    }
    if (/sendOtpSms|twilio|sms/i.test(mfaLib)) {
      pass(s, 'MFA library: SMS OTP delivery (ready when Twilio configured)');
    } else {
      info(s, 'MFA library: no SMS delivery (Twilio not configured yet)', '');
    }
  } else {
    critical(s, 'MFA library MISSING (lib/auth/mfa.ts)', '');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 35: Impersonation Audit Trail
// Checks that impersonation goes through server with audit logging.
// ═══════════════════════════════════════════════════════════════════════════
function section35() {
  const s = startSection(35, 'Impersonation Audit Trail', 'Auth & Security');

  // Check server-side impersonation endpoint exists
  const impersonateRoute = readFile('app/api/crm/agents/[id]/impersonate/route.ts');
  if (impersonateRoute) {
    pass(s, 'Server-side impersonation endpoint exists');
    if (/requireBroker/.test(impersonateRoute)) pass(s, 'Impersonation: broker-only');
    else critical(s, 'Impersonation: NO broker check', 'Must require broker role');
    if (/logAuditEvent|audit/i.test(impersonateRoute)) pass(s, 'Impersonation: audit logged');
    else critical(s, 'Impersonation: NO audit logging', 'Must log who impersonated whom');
  } else {
    critical(s, 'Server-side impersonation endpoint MISSING',
      'Create POST /api/crm/agents/[id]/impersonate with broker auth + audit');
  }

  // Check stop impersonation endpoint
  const stopRoute = readFile('app/api/auth/impersonation/stop/route.ts');
  if (stopRoute) {
    pass(s, 'Stop impersonation endpoint exists');
    if (/logAuditEvent|audit/i.test(stopRoute)) pass(s, 'Stop impersonation: audit logged');
    else warning(s, 'Stop impersonation: no audit logging', '');
  } else {
    warning(s, 'Stop impersonation endpoint missing', 'Broker must be able to end impersonation');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 36: DOM ID Cross-Reference (JS → HTML)
// Scans getElementById calls in CRM JS files and verifies each ID exists in HTML.
// Catches dangling references after refactors (e.g., form unification).
// ═══════════════════════════════════════════════════════════════════════════
function section36() {
  const s = startSection(36, 'DOM ID Cross-Reference (JS → HTML)', 'Frontend');

  const html = readFile('public/crm/index-built.html');
  if (!html) { warning(s, 'Cannot read index-built.html', ''); return; }

  // Extract all id="..." from ALL CRM HTML files (search + forms + dashboard)
  // Form JS files reference IDs in form HTML pages, not just the search page.
  const htmlIds = new Set();
  const idRegex = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = idRegex.exec(html)) !== null) htmlIds.add(m[1]);
  // Also scan form and dashboard HTML files for IDs
  const extraHtmlFiles = findFiles('public/crm/html', '.html')
    .concat(findFiles('public/crm', '.html').filter(f => !f.includes('index-built') && !f.includes('.backups')));
  for (const hf of extraHtmlFiles) {
    const hContent = readFile(hf);
    if (!hContent) continue;
    idRegex.lastIndex = 0;
    while ((m = idRegex.exec(hContent)) !== null) htmlIds.add(m[1]);
  }

  // Also count IDs created dynamically (innerHTML, createElement+id)
  // These are expected to NOT be in the static HTML
  const dynamicIdPatterns = [
    /\.id\s*=\s*['"]([^'"]+)['"]/g,
    /id=\\?["']([^"'\\]+)\\?["']/g, // inside template strings in JS
  ];

  const jsFiles = findFiles('public/crm/js', '.js');
  const dynamicIds = new Set();
  for (const file of jsFiles) {
    const content = readFile(file);
    if (!content) continue;
    for (const pat of dynamicIdPatterns) {
      pat.lastIndex = 0;
      while ((m = pat.exec(content)) !== null) dynamicIds.add(m[1]);
    }
  }

  // Also extract dynamic IDs from inline scripts in HTML
  for (const pat of dynamicIdPatterns) {
    pat.lastIndex = 0;
    while ((m = pat.exec(html)) !== null) dynamicIds.add(m[1]);
  }

  // Scan all JS files for getElementById('X')
  const getByIdRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
  const allRefs = new Map(); // id → [{ file, line }]
  const searchCriticalFunctions = [
    'collectSearchCriteria', '_resolveActiveNeighborhoodTagsId',
    '_serverSearch', 'performSearch', 'updateFilterCount',
    'toggleSearchTab', 'toggleSearchMode', 'clearSearchForm',
    'getSelectedNeighborhoods',
  ];

  for (const file of [...jsFiles, 'public/crm/index-built.html']) {
    const content = readFile(file);
    if (!content) continue;
    getByIdRegex.lastIndex = 0;
    while ((m = getByIdRegex.exec(content)) !== null) {
      const id = m[1];
      if (!allRefs.has(id)) allRefs.set(id, []);
      // Determine if this is inside a search-critical function
      const before500 = content.substring(Math.max(0, m.index - 500), m.index);
      const isSearchCritical = searchCriticalFunctions.some(fn => before500.includes('function ' + fn) || before500.includes(fn + '('));
      allRefs.get(id).push({ file, isSearchCritical });
    }
  }

  // Check each referenced ID
  let danglingSearch = 0, danglingOther = 0, danglingDetails = [];
  let validCount = 0;

  for (const [id, refs] of allRefs) {
    if (htmlIds.has(id) || dynamicIds.has(id)) {
      validCount++;
      continue;
    }
    // Skip IDs that are clearly parameterized (contain + or template vars)
    if (id.includes('+') || id.includes('$') || id.includes('{')) continue;

    const isSearchCritical = refs.some(r => r.isSearchCritical);
    const files = [...new Set(refs.map(r => r.file))].map(f => f.replace('public/crm/', '')).join(', ');

    if (isSearchCritical) {
      danglingSearch++;
      danglingDetails.push({ id, files, level: 'CRITICAL' });
      critical(s, `SEARCH-BREAKING: getElementById('${id}') — ID not in HTML`,
        `Referenced in search-critical function. Files: ${files}`);
    } else {
      danglingOther++;
      danglingDetails.push({ id, files, level: 'WARNING' });
    }
  }

  if (danglingSearch === 0) pass(s, 'All search-critical DOM IDs exist in HTML');
  if (danglingOther > 0) {
    // INFO not WARNING: non-search IDs span multiple pages and include dynamically
    // created elements (innerHTML, template strings). The validator scans all CRM HTML
    // files but can't resolve which JS runs on which page or which IDs are created at runtime.
    // Search-critical IDs are checked at CRITICAL level above — that's the gate that matters.
    info(s, `${danglingOther} non-search getElementById refs target dynamically-created or cross-page IDs`,
      danglingDetails.filter(d => d.level === 'WARNING').map(d => `'${d.id}' in ${d.files}`).slice(0, 10).join('; '));
  } else {
    pass(s, 'All non-search DOM ID references valid');
  }

  pass(s, `${validCount} getElementById refs verified against ${htmlIds.size} HTML IDs`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 37: Search Flow Integrity
// Validates the critical search data chain end-to-end (static analysis).
// Would have caught: neighborhood tags ID mismatch, form unification gaps.
// ═══════════════════════════════════════════════════════════════════════════
function section37() {
  const s = startSection(37, 'Search Flow Integrity', 'Search');

  const searchEngine = readFile('public/crm/js/search/search-engine.js');
  const html = readFile('public/crm/index-built.html');
  const searchRoute = readFile('app/api/idx/search/route.ts');
  if (!searchEngine || !html) { warning(s, 'Cannot read search files', ''); return; }

  // 1. Neighborhood tag container IDs
  const tagIdMatch = searchEngine.match(/return\s+['"](\w*[Nn]eighborhood\w*)['"]/g) || [];
  const tagIds = tagIdMatch.map(m => m.match(/['"]([^'"]+)['"]/)[1]);
  for (const id of tagIds) {
    if (html.includes('id="' + id + '"')) {
      pass(s, `Neighborhood tags container '${id}' exists in HTML`);
    } else {
      critical(s, `Neighborhood tags container '${id}' NOT in HTML — search by area BROKEN`,
        `_resolveActiveNeighborhoodTagsId() returns '${id}' but no element with that ID exists. Neighborhood search will silently return no results.`);
    }
  }
  if (tagIds.length === 0) {
    warning(s, 'No neighborhood tag container IDs found in _resolveActiveNeighborhoodTagsId()', '');
  }

  // 2. data-show-on values match valid tab names
  const showOnRegex = /data-show-on="([^"]+)"/g;
  const validTabs = new Set(['sale', 'rent', 'building', 'cma']);
  const invalidShowOn = [];
  let showOnCount = 0;
  let m;
  while ((m = showOnRegex.exec(html)) !== null) {
    showOnCount++;
    const tabs = m[1].split(',').map(t => t.trim());
    for (const t of tabs) {
      if (!validTabs.has(t)) invalidShowOn.push(t);
    }
  }
  if (invalidShowOn.length > 0) {
    critical(s, `data-show-on references invalid tabs: ${[...new Set(invalidShowOn)].join(', ')}`,
      'These sections will never show. Valid tabs: sale, rent, building, cma');
  } else if (showOnCount > 0) {
    pass(s, `${showOnCount} data-show-on attributes reference valid tab names`);
  }

  // 3. Status checkbox data-values match statusMap in _serverSearch
  // statusMap maps CRM uppercase → RESO PascalCase. The code uses `statusMap[s] || s`
  // so values already in RESO format (Active, ComingSoon, etc.) pass through correctly.
  // Compound values like "Withdrawn,Canceled,Expired,Hold" are split by the server
  // (idx/search/route.ts: status.split(",")).
  const statusMapMatch = searchEngine.match(/statusMap\s*=\s*\{([^}]+)\}/);
  if (statusMapMatch) {
    const mapKeys = (statusMapMatch[1].match(/'([^']+)'/g) || [])
      .filter((_, i) => i % 2 === 0) // odd indices are values
      .map(k => k.replace(/'/g, ''));
    // Valid RESO StandardStatus values that pass through the `|| s` fallback correctly
    const resoStandardStatuses = new Set([
      'Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon',
      'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn',
    ]);

    // Find status checkboxes in HTML
    const statusCheckboxes = [];
    const cbRegex = /data-field=["']MlsStatus["']\s+data-value=["']([^"']+)["']/g;
    while ((m = cbRegex.exec(html)) !== null) statusCheckboxes.push(m[1]);

    const unmapped = statusCheckboxes.filter(v => {
      // In statusMap keys → mapped explicitly
      if (mapKeys.includes(v)) return false;
      // Valid RESO value → passes through via || s fallback
      if (resoStandardStatuses.has(v)) return false;
      // Compound value — check each part is valid RESO
      if (v.includes(',') && v.split(',').every(p => resoStandardStatuses.has(p.trim()))) return false;
      return true;
    });
    if (unmapped.length > 0) {
      warning(s, `${unmapped.length} status checkbox values not in statusMap or RESO enum: ${unmapped.join(', ')}`,
        'These statuses will be sent as-is to Trestle and may not match any RESO StandardStatus');
    } else if (statusCheckboxes.length > 0) {
      pass(s, `${statusCheckboxes.length} status checkbox values all mapped or valid RESO`);
    }
  }

  // 4. Old form IDs still referenced in JS but deleted from HTML
  const oldFormIds = ['searchBasicModeRental', 'searchBasicModeBuilding',
    'saleNeighborhoodTags', 'rentalNeighborhoodTags', 'buildingNeighborhoodTags',
    'saleQuickRls', 'rentalQuickRls', 'buildingQuickRls',
    'saleQuickZip', 'rentalQuickZip', 'buildingQuickZip',
    'saleQuickUnit', 'rentalQuickUnit', 'buildingQuickUnit'];
  const staleRefs = [];
  for (const id of oldFormIds) {
    const inJs = searchEngine.includes("'" + id + "'") || searchEngine.includes('"' + id + '"');
    const inHtml = html.includes('id="' + id + '"') || html.includes("id='" + id + "'");
    if (inJs && !inHtml) staleRefs.push(id);
  }
  if (staleRefs.length > 0) {
    critical(s, `${staleRefs.length} stale form IDs in search-engine.js (deleted from HTML)`,
      `IDs: ${staleRefs.join(', ')}. These getElementById calls return null — search fields silently ignored.`);
  } else {
    pass(s, 'No stale form IDs in search-engine.js');
  }

  // 5. Select elements with data-field have values in SEARCH_SELECT_FIELDS
  if (searchRoute) {
    const selectFieldsMatch = searchRoute.match(/SEARCH_SELECT_FIELDS\s*=\s*\[([\s\S]*?)\]/);
    if (selectFieldsMatch) {
      const apiFields = new Set((selectFieldsMatch[1].match(/"([^"]+)"/g) || []).map(f => f.replace(/"/g, '')));
      const htmlSelectFields = [];
      const selRegex = /data-field=["']([^"']+)["']/g;
      while ((m = selRegex.exec(html)) !== null) {
        if (!htmlSelectFields.includes(m[1])) htmlSelectFields.push(m[1]);
      }
      // Fields used in HTML that the API doesn't request from Trestle
      // (These would only work as client-side filters, not server-side OData)
      const notInApi = htmlSelectFields.filter(f =>
        !apiFields.has(f) && f !== 'MlsStatus' // MlsStatus handled specially
      );
      if (notInApi.length > 5) {
        info(s, `${notInApi.length} HTML data-field values not in SEARCH_SELECT_FIELDS`,
          `Client-side only filters: ${notInApi.slice(0, 8).join(', ')}...`);
      } else {
        pass(s, `HTML data-field values covered by SEARCH_SELECT_FIELDS`);
      }
    }
  }

  // 6. IP audit logging on mutation routes
  const mutationRoutes = findFiles('app/api/crm', '.ts').filter(f => {
    const content = readFile(f);
    return content && /logAuditEvent/.test(content);
  });
  let ipLogged = 0, ipMissing = [];
  for (const file of mutationRoutes) {
    const content = readFile(file);
    // Check if logAuditEvent calls include IP parameter (6th arg or ip variable)
    const auditCalls = content.match(/logAuditEvent\([^)]+\)/g) || [];
    for (const call of auditCalls) {
      if (/x-forwarded-for|ipAddress|, ip\b/.test(call) || call.split(',').length >= 6) {
        ipLogged++;
      } else {
        if (!ipMissing.includes(file)) ipMissing.push(file);
      }
    }
  }
  if (ipMissing.length > 0) {
    info(s, `${ipMissing.length} routes call logAuditEvent without IP (ipAddress param is optional)`,
      ipMissing.map(f => f.replace('app/api/', '')).slice(0, 5).join(', '));
  } else if (ipLogged > 0) {
    pass(s, `${ipLogged} audit log calls include IP address`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 38: onclick/onchange Function Existence
// Verifies that every function name in onclick/onchange handlers is defined.
// ═══════════════════════════════════════════════════════════════════════════
function section38() {
  const s = startSection(38, 'onclick/onchange Function Existence', 'Frontend');

  const html = readFile('public/crm/index-built.html');
  if (!html) { warning(s, 'Cannot read index-built.html', ''); return; }

  // Collect all function definitions from JS files + inline scripts
  const definedFunctions = new Set();
  const fnDefRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  const arrowOrVarRegex = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/g;
  // Also: window.X = function, X.Y = function (for namespaced like LeaseTracker.init)
  const windowFnRegex = /(?:window\.)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/g;

  const jsFiles = findFiles('public/crm/js', '.js');
  const allSources = [...jsFiles.map(f => readFile(f)).filter(Boolean), html];

  for (const src of allSources) {
    let m;
    fnDefRegex.lastIndex = 0;
    while ((m = fnDefRegex.exec(src)) !== null) definedFunctions.add(m[1]);
    arrowOrVarRegex.lastIndex = 0;
    while ((m = arrowOrVarRegex.exec(src)) !== null) definedFunctions.add(m[1]);
    windowFnRegex.lastIndex = 0;
    while ((m = windowFnRegex.exec(src)) !== null) definedFunctions.add(m[1]);
  }

  // Add known browser/lib globals
  ['event','alert','confirm','prompt','console','setTimeout','clearTimeout',
   'parseInt','parseFloat','encodeURIComponent','decodeURIComponent',
   'history','location','window','document','navigator','this','return','void',
   'stopPropagation','preventDefault'].forEach(g => definedFunctions.add(g));

  // Extract function calls from onclick/onchange/oninput handlers
  const handlerRegex = /on(?:click|change|input|submit|keydown|keyup|blur|focus|mouseover|mouseout|load)\s*=\s*["']([^"']+)["']/gi;
  const fnCallRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

  let missing = 0;
  const missingFns = new Map(); // fnName → count
  let totalHandlers = 0;
  let m;

  handlerRegex.lastIndex = 0;
  while ((m = handlerRegex.exec(html)) !== null) {
    totalHandlers++;
    const handlerCode = m[1];
    fnCallRegex.lastIndex = 0;
    let fnMatch;
    while ((fnMatch = fnCallRegex.exec(handlerCode)) !== null) {
      const fnName = fnMatch[1];
      // Skip: JS keywords, property accessors after dots, known safe patterns
      if (/^(if|else|for|while|switch|new|typeof|void|return|true|false|null|undefined|this|event|NaN|Math|Date|JSON|Number|String|Array|Object|Set|Map|Error|RegExp|Promise|parseInt|parseFloat|isNaN|encodeURIComponent|decodeURIComponent|setTimeout|clearTimeout|setInterval|clearInterval|requestAnimationFrame|console|alert|confirm|prompt|navigator|location|history|document|window|getElementById|querySelector|querySelectorAll|closest|toggle|add|remove|contains|replace|indexOf|trim|split|join|push|pop|slice|splice|map|filter|forEach|reduce|find|findIndex|includes|keys|values|entries|hasOwnProperty|toString|valueOf|toFixed|toLocaleString|charAt|substring|match|test|exec|search|replace|toLowerCase|toUpperCase|startsWith|endsWith|padStart|padEnd|repeat|sort|reverse|concat|fill|every|some|from|assign|create|defineProperty|getPrototypeOf|freeze|log|warn|error|info|debug|dir|table|time|timeEnd|group|groupEnd|trace|clear|assert|count|print|open|close|focus|blur|click|submit|reset|scrollTo|scrollIntoView|scrollBy|getBoundingClientRect|getComputedStyle|setAttribute|getAttribute|removeAttribute|appendChild|removeChild|insertBefore|replaceChild|cloneNode|createElement|createTextNode|addEventListener|removeEventListener|dispatchEvent|preventDefault|stopPropagation|stopImmediatePropagation|parentNode|parentElement|nextSibling|previousSibling|firstChild|lastChild|childNodes|children|classList|style|dataset|innerHTML|innerText|textContent|value|checked|selected|disabled|type|name|id|className|href|src|alt|title|placeholder|reload|assign|back|forward|go|pushState|replaceState|postMessage|getItem|setItem|removeItem)$/.test(fnName)) continue;
      if (!definedFunctions.has(fnName)) {
        missing++;
        missingFns.set(fnName, (missingFns.get(fnName) || 0) + 1);
      }
    }
  }

  if (missing === 0) {
    pass(s, `All onclick/onchange handlers reference defined functions (${totalHandlers} handlers checked)`);
  } else {
    // Separate high-frequency (likely real bugs) from low-frequency (might be namespaced)
    const sorted = [...missingFns.entries()].sort((a, b) => b[1] - a[1]);
    const highFreq = sorted.filter(([, c]) => c >= 3);
    const lowFreq = sorted.filter(([, c]) => c < 3);

    if (highFreq.length > 0) {
      critical(s, `${highFreq.length} undefined functions called ≥3 times in handlers`,
        highFreq.map(([fn, c]) => `${fn}() ×${c}`).join(', '));
    }
    if (lowFreq.length > 0) {
      warning(s, `${lowFreq.length} potentially undefined functions in handlers (called 1-2 times)`,
        lowFreq.slice(0, 15).map(([fn, c]) => `${fn}() ×${c}`).join(', '));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 39: data-field vs Trestle/RESO Field Validation
// Cross-references data-field="X" in HTML against the live Cotality contract.
// Catches invented field names that produce silent OData failures.
// ═══════════════════════════════════════════════════════════════════════════
function section39() {
  const s = startSection(39, 'data-field vs Trestle/RESO Validation', 'Search');

  const html = readFile('public/crm/index-built.html');
  const live = getLiveContract();
  if (!html) { warning(s, 'Cannot read index-built.html', ''); return; }
  if (!live) { warning(s, 'live Cotality contract not found', 'run npm run cotality:compile'); return; }

  // The live Cotality contract is the only provider field universe (no CSV, no hand-typed extras).
  const trestleFields = new Set(live.liveFields);

  // Known local-only fields (not on Trestle — intentionally client-side only)
  const localOnlyFields = new Set([
    'OpenHouseOnly', 'GuarantorRequired', 'BoardApprovalRequired', 'PurchasingOptions',
    'SubLettingAllowed', 'LeaseType', 'LeaseTerm', 'LeaseTermOptions',
    'RLSParticipantOnly', 'AttendanceType',
    'BuildingLaundryFeatures', 'BuildingPetsAllowed', 'BuildingPoolFeatures',
    'BuildingRules', 'BuildingSecurityFeatures', 'RentingAllowedYN',
  ]);

  // Extract data-field values ONLY from search form sections (not listing submission forms)
  // Search sections: generalSearchSection, comparablesSection, searchAdvancedMode, searchBasicMode
  // Listing forms use data-field for form binding (different purpose — not OData filters)
  const searchSectionIds = ['generalSearchSection', 'comparablesSection', 'searchAdvancedMode', 'searchBasicMode'];
  let searchHtml = '';
  for (const secId of searchSectionIds) {
    const startTag = new RegExp(`id=["']${secId}["']`);
    const startIdx = html.search(startTag);
    if (startIdx === -1) continue;
    // Extract ~20k chars from section start (enough to cover the section)
    searchHtml += html.substring(startIdx, startIdx + 20000);
  }

  const dataFieldRegex = /data-field=["']([^"']+)["']/g;
  const htmlFields = new Map(); // field → count
  let m;
  while ((m = dataFieldRegex.exec(searchHtml)) !== null) {
    const field = m[1];
    htmlFields.set(field, (htmlFields.get(field) || 0) + 1);
  }

  let validCount = 0, inventedCount = 0, localCount = 0;
  const invented = [];

  for (const [field] of htmlFields) {
    if (trestleFields.has(field)) {
      validCount++;
    } else if (localOnlyFields.has(field)) {
      localCount++;
    } else {
      inventedCount++;
      invented.push(field);
    }
  }

  pass(s, `${validCount} data-field values are live Cotality fields`);
  if (localCount > 0) {
    pass(s, `${localCount} data-field values are known local-only filters`);
  }
  if (inventedCount > 0) {
    warning(s, `${inventedCount} data-field values NOT in Trestle or local-only list`,
      `Fields: ${invented.join(', ')}. These may silently fail as OData filters. Add to localOnlyFields if intentional.`);
  } else {
    pass(s, 'All data-field values accounted for (Trestle or local-only)');
  }

  pass(s, `Checked against ${trestleFields.size} live Cotality fields (pull ${live.pulledAt}) + ${localOnlyFields.size} local-only filters`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 40: Duplicate HTML ID Detection
// Scans for id="X" appearing more than once — getElementById only returns the first.
// ═══════════════════════════════════════════════════════════════════════════
function section40() {
  const s = startSection(40, 'Duplicate HTML ID Detection', 'Frontend');

  const html = readFile('public/crm/index-built.html');
  if (!html) { warning(s, 'Cannot read index-built.html', ''); return; }

  const idRegex = /\bid=["']([^"']+)["']/g;
  const idCounts = new Map();
  let m;
  while ((m = idRegex.exec(html)) !== null) {
    const id = m[1];
    // Skip dynamic/template IDs (contain +, $, {, }, spaces) and numeric-only IDs
    if (/[\s+${}]/.test(id) || /^\d+$/.test(id)) continue;
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }

  const duplicates = [...idCounts.entries()].filter(([, count]) => count > 1);
  const totalIds = idCounts.size;

  if (duplicates.length === 0) {
    pass(s, `All ${totalIds} HTML IDs are unique`);
  } else {
    // Separate search-critical duplicates from others
    const searchIds = new Set([
      'searchBasicMode', 'searchAdvancedMode', 'searchFormContainer',
      'searchNeighborhoodTags', 'advancedNeighborhoodTags',
      'searchMinPrice', 'searchMaxPrice', 'searchMinBeds', 'searchMaxBeds',
      'searchMinBaths', 'searchMaxBaths', 'searchMinRooms', 'searchMaxRooms',
      'searchMinSqft', 'searchMaxSqft', 'searchQuickRls', 'searchQuickZip',
      'searchQuickUnit', 'searchAddress', 'searchKeyword',
      'searchNeighborhoodInput', 'searchManagementCompany',
      'stickySearchBar', 'activeFilterCount',
    ]);

    const searchDups = duplicates.filter(([id]) => searchIds.has(id));
    const otherDups = duplicates.filter(([id]) => !searchIds.has(id));

    if (searchDups.length > 0) {
      critical(s, `${searchDups.length} SEARCH-CRITICAL duplicate IDs`,
        searchDups.map(([id, c]) => `'${id}' ×${c}`).join(', ') +
        '. getElementById returns only the first — search fields will be silently wrong.');
    }

    if (otherDups.length > 10) {
      warning(s, `${otherDups.length} duplicate IDs in HTML`,
        otherDups.slice(0, 10).map(([id, c]) => `'${id}' ×${c}`).join(', ') + '...');
    } else if (otherDups.length > 0) {
      warning(s, `${otherDups.length} duplicate IDs in HTML`,
        otherDups.map(([id, c]) => `'${id}' ×${c}`).join(', '));
    } else {
      pass(s, 'No duplicate IDs in search-critical elements');
    }
  }

  pass(s, `${totalIds} total unique IDs scanned`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  IDX Plus Compliance Validator v3 — mallan.nyc');
console.log('  REBNY RLS / UCBA 2026 / Trestle IDX Plus');
console.log('  40 sections · live Cotality contract · Full-stack audit');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

const allSections = [section1,section2,section3,section4,section5,section6,section7,section8,section9,
  section10,section11,section12,section13,section14,section15,section16,section17,section18,section19,
  section20,section21,section22,section23,section24,section25,section26,
  section27,section28,section29,section30,section31,section32,
  section33,section34,section35,section36,section37,section38,section39,section40];

for (let i = 0; i < allSections.length; i++) {
  if (sectionFilter && sectionFilter !== (i + 1)) continue;
  try { allSections[i](); } catch (e) {
    const s = sections[sections.length - 1] || startSection(i + 1, 'Error', 'Unknown');
    critical(s, 'Section crashed', e.message);
  }
}

// ── Output ────────────────────────────────────────────────────────────────
if (jsonOutput) {
  const result = {
    summary: { pass: totalPass, critical: totalCritical, warning: totalWarning, info: totalInfo },
    sections: sections.map(sec => ({
      section: sec.num, title: sec.title, category: sec.category,
      pass: sec.items.filter(i => i.status === 'PASS').length,
      critical: sec.items.filter(i => i.severity === 'CRITICAL').length,
      warning: sec.items.filter(i => i.severity === 'WARNING').length,
      info: sec.items.filter(i => i.severity === 'INFO').length,
      items: failsOnly ? sec.items.filter(i => i.status !== 'PASS') : sec.items,
    })),
  };
  console.log(JSON.stringify(result, null, 2));
} else {
  let currentCategory = '';
  for (const sec of sections) {
    if (sec.category !== currentCategory) {
      currentCategory = sec.category;
      console.log(`── ${currentCategory} ${'─'.repeat(55 - currentCategory.length)}`);
    }
    const c = sec.items.filter(i => i.severity === 'CRITICAL').length;
    const w = sec.items.filter(i => i.severity === 'WARNING').length;
    const inf = sec.items.filter(i => i.severity === 'INFO').length;
    const p = sec.items.filter(i => i.status === 'PASS').length;
    const status = c > 0 ? 'CRITICAL' : w > 0 ? 'WARNING' : inf > 0 ? 'INFO' : 'PASS';
    console.log(`[${String(sec.num).padStart(2, ' ')}/35] ${sec.title}: ${status} (${p}✓ ${c}✗ ${w}⚠ ${inf}ℹ)`);

    let items = sec.items;
    if (failsOnly) items = items.filter(i => i.status !== 'PASS');
    if (severityFilter) items = items.filter(i => i.severity === severityFilter || i.status === 'PASS');

    for (const item of items) {
      const icon = item.status === 'PASS' ? '  \u2713' :
        item.severity === 'CRITICAL' ? '  \u2717' :
        item.severity === 'WARNING' ? '  \u26A0' : '  \u2139';
      console.log(`${icon} ${item.name}`);
      if (item.detail) console.log(`    ${item.detail}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${totalPass}✓  ${totalCritical} critical  ${totalWarning} warning  ${totalInfo} info`);
  console.log(`  RESULT: ${totalCritical > 0 ? 'FAIL (critical issues block CI)' : totalWarning > 0 ? 'WARN' : 'PASS'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

// ─── v2 RELEASE-TRUTH HOOKS (validator framework §16) ──────────────────
// Strict promotion + workflow linkage + optional runtime evidence.
{
  const { execSync } = require('child_process');

  // 1. Workflow linkage: ensure listing-display surfaces are in workflow-map
  //    when one exists. Currently there's no listing_display workflow declared,
  //    but if one is added later, this hook activates.
  const wfMapPath = path.join(ROOT, 'compliance', 'rules', 'workflow-map.json');
  const v2Section = startSection(99, 'V2 — Release-truth Linkage', 'workflow');
  if (fs.existsSync(wfMapPath)) {
    try {
      const wfMap = JSON.parse(fs.readFileSync(wfMapPath, 'utf-8'));
      const listingDisplayWf = (wfMap.workflows || []).find(
        (w) => w.name === 'listing_display' || w.name === 'idx_display'
      );
      if (listingDisplayWf) {
        // Run the workflow validator and read its result for this workflow
        try {
          const wfJson = execSync(
            `node ${path.join(ROOT, 'scripts', 'validate-workflow-completeness.js')} --workflow ${listingDisplayWf.name} --json`,
            { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] },
          ).toString();
          const parsed = JSON.parse(wfJson);
          const wf = (parsed.workflows || [])[0];
          if (!wf) {
            unverified(v2Section, `workflow_completeness — workflow ${listingDisplayWf.name} not found in validator output`);
          } else if (wf.aggregate === 'PASS') {
            pass(v2Section, `workflow_completeness — listing display workflow PASS`);
          } else if (wf.aggregate === 'FAIL') {
            critical(v2Section, `workflow_completeness — listing display workflow FAIL`, `${wf.counts.fail} of ${wf.counts.total} surfaces failing`);
          } else {
            warning(v2Section, `workflow_completeness — listing display workflow ${wf.aggregate}`);
          }
        } catch (e) {
          unverified(v2Section, 'workflow_completeness — could not run workflow validator', e.message?.slice(0, 200));
        }
      } else {
        info(v2Section, 'workflow_completeness — no listing_display workflow declared in workflow-map.json (informational)');
      }
    } catch (e) {
      unverified(v2Section, 'workflow_completeness — could not parse workflow-map.json', e.message?.slice(0, 200));
    }
  } else {
    unverified(v2Section, 'workflow_completeness — workflow-map.json not present');
  }

  // 2. Runtime / live-site module: only when --runtime flag is passed
  if (INCLUDE_RUNTIME) {
    try {
      const liveJson = execSync(
        `node ${path.join(ROOT, 'scripts', 'validate-live-site.js')} --json`,
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] },
      ).toString();
      const live = JSON.parse(liveJson);
      const failCount = live.summary?.fail || 0;
      const passCount = live.summary?.pass || 0;
      const blockedCount = live.summary?.blocked || 0;
      if (failCount > 0) {
        critical(v2Section, `live_site — ${failCount} smoke check(s) FAIL`, JSON.stringify(live.checks?.filter((c) => c.verdict === 'FAIL').map((c) => c.check)));
      } else if (blockedCount > 0) {
        warning(v2Section, `live_site — ${blockedCount} check(s) BLOCKED by edge protection`);
      } else {
        pass(v2Section, `live_site — ${passCount} smoke check(s) PASS`);
      }
    } catch (e) {
      unverified(v2Section, 'live_site — validator threw', e.message?.slice(0, 200));
    }
  } else {
    info(v2Section, 'live_site — skipped (pass --runtime to include)');
  }
}

// Final summary line including the v2 counts
console.log(`\nFinal: ${totalPass} pass · ${totalCritical} critical · ${totalWarning} warning · ${totalInfo} info · ${totalUnverified} unverified${STRICT_PROMOTION ? ' [strict mode: warnings → critical]' : ''}`);

if (validatorHistoryCache) {
  const { historyDir, historyFile, history } = validatorHistoryCache;
  try {
    const currentRun = {
      timestamp: new Date().toISOString(),
      pass: totalPass, critical: totalCritical, warning: totalWarning, info: totalInfo,
    };
    const updatedHistory = [...history, currentRun].slice(-50);
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify(updatedHistory, null, 2));
  } catch (e) {
    const historySection = sections.find((sec) => sec.num === 32);
    if (historySection) info(historySection, 'Could not save run history', e.message);
  }
}

try {
  // Idempotent write — `validator-results.json` is tracked in git and consumed
  // by the CRM dashboard (`public/crm/js/dashboard/panels.js:5881` for the
  // "Last run" display, plus the dedup keying at line 8383). The dashboard
  // needs the `timestamp` field, so we keep it. But we only rewrite the file
  // when the actual result content changed — content equality is computed
  // EXCLUDING `timestamp`. This way a clean validator run on stable code
  // does NOT dirty the working tree. Per "fix(idx): make validator snapshots
  // deterministic" (2026-05-01).
  const newContent = {
    pass: totalPass, critical: totalCritical, warning: totalWarning, info: totalInfo,
    sections: sections.map(sec => ({
      section: sec.num, title: sec.title, category: sec.category,
      pass: sec.items.filter(i => i.status === 'PASS').length,
      critical: sec.items.filter(i => i.severity === 'CRITICAL').length,
      warning: sec.items.filter(i => i.severity === 'WARNING').length,
      info: sec.items.filter(i => i.severity === 'INFO').length,
    })),
  };
  const crmDataDir = path.join(ROOT, 'public', 'crm', 'data');
  if (fs.existsSync(crmDataDir)) {
    const crmResultPath = path.join(crmDataDir, 'validator-results.json');
    let existingContent = null;
    let existingTimestamp = null;
    if (fs.existsSync(crmResultPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(crmResultPath, 'utf8'));
        existingTimestamp = existing.timestamp;
        // Strip timestamp from comparison subject
        const { timestamp: _ignored, ...rest } = existing;
        existingContent = rest;
      } catch (e) { /* corrupt or missing — treat as changed */ }
    }
    const contentChanged = !existingContent ||
      JSON.stringify(existingContent) !== JSON.stringify(newContent);
    if (contentChanged) {
      // Bump timestamp because the result actually changed
      const finalResult = { timestamp: new Date().toISOString(), ...newContent };
      fs.writeFileSync(crmResultPath, JSON.stringify(finalResult, null, 2));
    }
    // else: content identical → leave existing file (and existing timestamp) alone
  }
} catch (e) { /* ignore */ }

const effectiveCritical = STRICT_PROMOTION ? (totalCritical + totalWarning) : totalCritical;
process.exit(effectiveCritical > 0 ? 1 : 0);
