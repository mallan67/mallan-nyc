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
 *    3. Field Count Verification (all 1,426 OData fields accounted)
 *    4. REQUIRED_RLS_FIELDS vs IDX Plus Availability
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
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const failsOnly = args.includes('--fails');
const sectionFilter = args.includes('--section') ? parseInt(args[args.indexOf('--section') + 1]) : null;
const severityFilter = args.includes('--severity') ? args[args.indexOf('--severity') + 1].toUpperCase() : null;

// ── Severity levels ───────────────────────────────────────────────────────
const SEVERITY = { CRITICAL: 0, WARNING: 1, INFO: 2 };

let totalCritical = 0, totalWarning = 0, totalInfo = 0, totalPass = 0;
const sections = [];

function startSection(num, title, category) {
  const s = { num, title, category, items: [] };
  sections.push(s);
  return s;
}
function addResult(section, status, severity, name, detail) {
  if (status === 'PASS') { totalPass++; }
  else if (severity === 'CRITICAL') { totalCritical++; }
  else if (severity === 'WARNING') { totalWarning++; }
  else { totalInfo++; }
  section.items.push({ status, severity, name, detail });
}
function critical(s, name, detail) { addResult(s, 'FAIL', 'CRITICAL', name, detail); }
function warning(s, name, detail) { addResult(s, 'FAIL', 'WARNING', name, detail); }
function info(s, name, detail) { addResult(s, 'FAIL', 'INFO', name, detail); }
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
  if (!mapper) return { allRls: new Set(), excluded: new Set(), select: new Set(), required: new Set() };
  const blocks = mapper.match(/const B\d+_\w+\s*=\s*\[([^\]]+)\]/g) || [];
  const allRls = new Set();
  for (const b of blocks) {
    const names = b.match(/"([^"]+)"/g) || [];
    for (const n of names) allRls.add(n.replace(/"/g, ''));
  }
  const exMatch = mapper.match(/IDX_PLUS_EXCLUDED_FIELDS\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\]\)/);
  const excluded = new Set();
  if (exMatch) { for (const n of (exMatch[1].match(/"([^"]+)"/g) || [])) excluded.add(n.replace(/"/g, '')); }
  const select = new Set([...allRls].filter(f => !excluded.has(f)));
  const reqMatch = mapper.match(/REQUIRED_RLS_FIELDS\s*=\s*\[\s*([\s\S]*?)\]/);
  const required = new Set();
  if (reqMatch) { for (const n of (reqMatch[1].match(/"([^"]+)"/g) || [])) required.add(n.replace(/"/g, '')); }
  return { allRls, excluded, select, required, content: mapper };
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

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: $select Field Completeness
// ═══════════════════════════════════════════════════════════════════════════
function section1() {
  const s = startSection(1, '$select Field Completeness', 'IDX Pipeline');
  const { select, excluded, allRls, content: mapper } = getMapperFields();
  if (!mapper) { critical(s, 'trestle-mapper.ts', 'File not found'); return; }

  const expandFields = new Set(['Media','MediaURL','MediaCategory','Order','PreferredPhotoYN','ShortDescription',
    'DownPaymentAssistanceAmount','DownPaymentAssistanceCount','AdditionalFee','AdditionalFeeDescription','AdditionalFeeYN','FeeFrequency']);
  const preFiltered = new Set(['IDXEntireListingDisplayYN','IDXAutomatedValuationDisplayYN','VOWEntireListingDisplayYN',
    'VOWAutomatedValuationDisplayYN','VOWConsumerCommentYN','IDXParticipationYN','ParticipantOnlyYN']);
  const systemFields = new Set(['MlsStatus','StandardStatus','ListingKey','ListingId','ModificationTimestamp','SourceSystemKey']);

  const rawPattern = /(?:raw|normalized)\.([A-Z][A-Za-z0-9]+)/g;
  const accessed = new Set();
  let m;
  while ((m = rawPattern.exec(mapper)) !== null) accessed.add(m[1]);

  for (const field of accessed) {
    if (select.has(field)) pass(s, field);
    else if (expandFields.has(field)) pass(s, `${field} (via $expand)`);
    else if (preFiltered.has(field)) pass(s, `${field} (pre-filtered)`);
    else if (systemFields.has(field)) pass(s, `${field} (system)`);
    else if (hasAnnotation(mapper, mapper.indexOf(`raw.${field}`) >= 0 ? mapper.indexOf(`raw.${field}`) : mapper.indexOf(`normalized.${field}`), 'TRESTLE-PREFILTERED'))
      pass(s, `${field} (annotated pre-filtered)`);
    else if (hasAnnotation(mapper, mapper.indexOf(`raw.${field}`) >= 0 ? mapper.indexOf(`raw.${field}`) : mapper.indexOf(`normalized.${field}`), 'IDX-VALIDATE-IGNORE'))
      pass(s, `${field} (annotated ignore)`);
    else if (excluded.has(field))
      critical(s, field, `Accessed via raw.${field} but EXCLUDED from $select and not pre-filtered. Always undefined.`);
    else if (!allRls.has(field))
      critical(s, field, `Accessed via raw.${field} but NOT in any RLS category (B1-B30). Never fetched.`);
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

  const gates = [
    { name: 'Owner Opt-Out', db: 'owner_opt_out', gateRx: /Permissions.*OwnerOptOut|OwnerOptOut/, mapRx: /owner_opt_out/ },
    { name: 'IDX Display', db: 'idx_display_yn', gateRx: /IDXEntireListingDisplayYN/, mapRx: /idx_display_yn/ },
    { name: 'Participant Only', db: 'participant_only', gateRx: /ParticipantOnlyYN/, mapRx: /participant_only/ },
    { name: 'Internet Entire Listing', db: 'internet_entire_listing_display_yn', gateRx: /InternetEntireListingDisplayYN/, mapRx: /internet_entire_listing_display_yn/ },
    { name: 'Internet Address', db: 'internet_address_display_yn', gateRx: /InternetAddressDisplayYN|canDisplayAddress/, mapRx: /internet_address_display_yn/ },
    { name: 'Automated Valuation', db: 'internet_automated_valuation_display_yn', gateRx: /InternetAutomatedValuationDisplayYN/, mapRx: /internet_automated_valuation_display_yn/ },
    { name: 'Consumer Comment', db: 'internet_consumer_comment_yn', gateRx: /InternetConsumerCommentYN/, mapRx: /internet_consumer_comment_yn/ },
  ];
  const combined = mapper + '\n' + gate;
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
// SECTION 3: Field Count Verification (all 1,426 OData fields)
// ═══════════════════════════════════════════════════════════════════════════
function section3() {
  const s = startSection(3, 'Field Count Verification', 'IDX Pipeline');
  const { allRls, excluded, select } = getMapperFields();

  // Check CSV (902 IDX Plus fields)
  const csv = readFile('data/rebny-rls-property-fields.csv');
  if (!csv) { warning(s, 'rebny-rls-property-fields.csv', 'File not found'); return; }
  const csvLines = csv.split('\n').filter(l => l.trim() && !l.startsWith(',Attribute') && l.includes(','));
  const csvFields = new Set();
  const csvByResource = {};
  for (const line of csvLines) {
    const parts = line.split(',');
    const name = parts[1]?.trim();
    const resource = parts[5]?.trim() || 'Unknown';
    if (name) {
      csvFields.add(name);
      csvByResource[resource] = (csvByResource[resource] || 0) + 1;
    }
  }

  pass(s, `CSV total: ${csvFields.size} IDX Plus fields across ${Object.keys(csvByResource).length} resources`);
  for (const [res, count] of Object.entries(csvByResource)) {
    pass(s, `  ${res}: ${count} fields`);
  }

  // Check OData metadata (1,426 fields)
  const meta = readFile('artifacts/metadata.xml');
  if (meta) {
    const propCount = (meta.match(/<Property\s+Name="/g) || []).length;
    pass(s, `OData metadata: ${propCount} total field definitions`);
  } else {
    info(s, 'artifacts/metadata.xml not found', 'Cannot verify OData field count');
  }

  // Check mapper coverage of CSV Property fields
  const csvPropertyFields = new Set();
  for (const line of csvLines) {
    const parts = line.split(',');
    const name = parts[1]?.trim();
    const resource = parts[5]?.trim();
    if (name && resource === 'Property') csvPropertyFields.add(name);
  }

  const mappedPropertyFields = [...csvPropertyFields].filter(f => allRls.has(f));
  const unmappedPropertyFields = [...csvPropertyFields].filter(f => !allRls.has(f));
  const coveragePct = ((mappedPropertyFields.length / csvPropertyFields.size) * 100).toFixed(1);

  if (coveragePct >= 75) {
    pass(s, `Property field coverage: ${mappedPropertyFields.length}/${csvPropertyFields.size} (${coveragePct}%)`);
  } else {
    warning(s, `Property field coverage: ${mappedPropertyFields.length}/${csvPropertyFields.size} (${coveragePct}%)`,
      `${unmappedPropertyFields.length} CSV Property fields not in mapper. Run --fails to see them.`);
  }

  pass(s, `Mapper ALL_RLS_FIELDS: ${allRls.size} unique fields`);
  pass(s, `IDX_PLUS_EXCLUDED: ${excluded.size} fields`);
  pass(s, `IDX_PLUS_SELECT (fetched): ${select.size} fields`);

  // Check picklist coverage
  const lookup = readFile('data/rebny-rls-property-lookup.csv');
  if (lookup) {
    const lookupLines = lookup.split('\n').filter(l => l.trim()).length - 1;
    pass(s, `Picklist values: ${lookupLines} entries in lookup CSV`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: REQUIRED_RLS_FIELDS vs IDX Plus Availability
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
  const retMatch = mapper.match(/return\s*\{([\s\S]*?)\};\s*\}/);
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
    } else if (['media', 'agentInfo', 'agent_info'].includes(key)) pass(s, `${key} → JSON`);
    else warning(s, `${key} → NOT in Listing model`, 'mapTrestleToPrisma returns field with no DB column');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Picklist / Value Canonicalization
// ═══════════════════════════════════════════════════════════════════════════
function section6() {
  const s = startSection(6, 'Picklist / Value Canonicalization', 'IDX Pipeline');
  const lookup = readFile('data/rebny-rls-property-lookup.csv');
  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const enforcement = readFile('lib/compliance/rls-enforcement.ts');
  if (!lookup || !mapper) { warning(s, 'Required files', 'Cannot read'); return; }

  // Parse lookup CSV for field→values map
  const picklists = {};
  for (const line of lookup.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    const field = parts[0]?.trim();
    const value = parts[1]?.trim();
    if (field && value) {
      if (!picklists[field]) picklists[field] = new Set();
      picklists[field].add(value);
    }
  }
  pass(s, `Parsed ${Object.keys(picklists).length} picklist fields from lookup CSV`);

  // Check gate logic uses canonical values
  const gateFields = {
    StandardStatus: ['Active', 'Closed', 'Expired', 'Pending', 'Coming Soon', 'Active Under Contract', 'Withdrawn', 'Canceled'],
    PropertyType: ['Residential', 'Commercial', 'Land', 'Residential Income'],
    MlsStatus: ['Active', 'Closed', 'Expired', 'Pending', 'Coming Soon', 'Withdrawn', 'Canceled', 'OwnerOptOut'],
  };

  for (const [field, expected] of Object.entries(gateFields)) {
    if (picklists[field]) {
      const csvValues = picklists[field];
      for (const val of expected) {
        if (csvValues.has(val)) pass(s, `${field}="${val}" in picklist`);
        else if (field === 'MlsStatus' && val === 'OwnerOptOut') pass(s, `${field}="${val}" (Permissions-derived, not in picklist)`);
        else info(s, `${field}="${val}" NOT in picklist CSV`, 'Gate logic uses value not in official picklist');
      }
    }
  }

  // Check RESO_TO_RLS_RENAMES completeness
  const renamesMatch = mapper.match(/RESO_TO_RLS_RENAMES[^{]*\{([^}]+)\}/);
  if (renamesMatch) {
    const renames = (renamesMatch[1].match(/\w+:/g) || []).length;
    pass(s, `RESO_TO_RLS_RENAMES: ${renames} field renames defined`);
  }

  // Check SyndicateYN vs SyndicateTo mismatch
  if (enforcement) {
    if (/SyndicateYN/.test(enforcement) && !/SyndicateTo/.test(enforcement)) {
      warning(s, 'SyndicateYN vs SyndicateTo', 'Enforcement uses SyndicateYN but Trestle sends SyndicateTo');
    }
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
      const url = m[1].replace(/\?.+$/, '');
      if (url.startsWith('/api/')) fetchCalls.push({ file, url, line: content.substring(0, m.index).split('\n').length });
    }
    // Template fetches
    const tmplRx = /(?:fetch|_fetch)\s*\(\s*`([^`]+?)`/g;
    while ((m = tmplRx.exec(content)) !== null) {
      let url = m[1].replace(/\?.+$/, '').replace(/\$\{[^}]+\}/g, '[param]');
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
  for (const r of routes) {
    const p = `/api/cron/${r}`;
    if (!fs.existsSync(path.join(cronDir, r, 'route.ts'))) { info(s, p, 'Directory but no route.ts'); continue; }
    if (scheduled.has(p)) { const c = config.crons.find(c => c.path === p); pass(s, `${p} (${c.schedule})`); }
    else critical(s, `${p} → NOT SCHEDULED`, 'Add to vercel.json or delete');
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
  const authPatterns = /requireAgentOrBroker|requireBroker|requireAuth|requireSession|getSession|CRON_SECRET|requireWorkspace|requirePortalAuth/;
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
      || file.includes('/open-houses/rsvp')
      || file.includes('/pages/');
    if (isCron || isPublic) continue; // Skip public lead-capture and cron endpoints
    if (hasAuth) pass(s, file);
    else if (hasAnnotation(content, 0, 'IDX-VALIDATE-IGNORE') || hasAnnotation(content, 0, 'IDX-VALIDATE-OK'))
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

  // Check public write endpoints have rate limiting
  const publicWriteEndpoints = ['app/api/contact/route.ts', 'app/api/inquiries/route.ts', 'app/api/cma/route.ts',
    'app/api/sign-up/route.ts', 'app/api/favorites/route.ts', 'app/api/search-alerts/route.ts'];
  for (const ep of publicWriteEndpoints) {
    const content = readFile(ep);
    if (!content) continue;
    if (/rateLimit|rate.?limit|checkRateLimit|rateLimiter/i.test(content)) pass(s, `${ep}: rate limited`);
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

  const listing = readFile('app/listing/[id]/page.tsx');
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

  const pages = ['app/search/page.tsx', 'app/listing/[id]/page.tsx', 'app/manhattan/page.tsx'];
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
    if (/advisory.?lock|mutex|semaphore|isRunning|SYNC_LOCK/i.test(idxSync))
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
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/showings',
      sent: 'property_address, client_id', expected: 'listing_id, lead_id', severity: 'CRITICAL' },
    { crmFile: 'panels/sales-crm/index.js', endpoint: '/api/crm/clients/[id] PATCH',
      sent: 'next_follow_up', expected: '(not handled in PATCH)', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/leads POST',
      sent: 'FormData', expected: '(only GET handler exists)', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/clients/[id]',
      sent: 'assignedAgentId', expected: 'agent_id', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/deals/[id]',
      sent: 'splitAmount', expected: 'split_percent', severity: 'CRITICAL' },
    { crmFile: 'panels.js', endpoint: '/api/crm/deals/[id]',
      sent: 'payoutStatus', expected: '(field not in schema)', severity: 'CRITICAL' },
  ];

  // Dynamically verify each mismatch still exists in the code
  for (const mm of knownMismatches) {
    const crmContent = readFile(`public/crm/js/dashboard/${mm.crmFile}`);
    if (!crmContent) { info(s, `${mm.crmFile}`, 'File not found (may have been fixed)'); continue; }

    const endpointInCode = mm.correctEndpoint
      ? !crmContent.includes(mm.correctEndpoint) && crmContent.includes(mm.endpoint.replace(' POST', '').replace(' PATCH', ''))
      : crmContent.includes(mm.sent.split(',')[0].trim());

    if (endpointInCode) {
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
      !/consent|agree|terms|privacy|cookie|sidebar|modal-/i.test(cb)); // exclude non-search checkboxes

    pass(s, `Checkboxes with data-field: ${withDataField.length}`);
    if (searchCheckboxes.length > 20) {
      critical(s, `${searchCheckboxes.length} search checkboxes WITHOUT data-field attribute`,
        'These checkboxes are silently ignored by collectSearchCriteria() generic scanner');
    } else if (searchCheckboxes.length > 0) {
      warning(s, `${searchCheckboxes.length} checkboxes without data-field`, 'May be unwired filters');
    } else pass(s, 'All search checkboxes have data-field');
  }

  // 3. checkboxFilters support in CRM search endpoint
  if (searchRoute) {
    if (/checkboxFilters/.test(searchRoute)) pass(s, '/api/idx/search: checkboxFilters supported');
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
      critical(s, 'Comps search: UI exists but NO API integration',
        'Comp toolbar buttons have no onclick handlers. Comps search is non-functional.');
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

  if (searchRoute && /checkDistributionGates/.test(searchRoute)) {
    pass(s, '/api/idx/search: distribution gates enforced');
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
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 30: Trestle → Frontend Data Chain
// Validates no field is lost or renamed incorrectly across the 5-step chain.
// ═══════════════════════════════════════════════════════════════════════════
function section30() {
  const s = startSection(30, 'Trestle → Frontend Data Chain', 'Data Integrity');

  const mapper = readFile('lib/idx/trestle-mapper.ts');
  const dto = readFile('lib/idx/db-to-public-dto.ts') || readFile('lib/idx/public-dto.ts');
  const listingPage = readFile('app/listing/[id]/page.tsx');
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
  const proxy = readFile('proxy.ts');
  if (proxy && /portal/.test(proxy)) pass(s, 'proxy.ts: portal routes covered');
  else warning(s, 'proxy.ts: portal routes may not have auth middleware', '');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 32: Run History & Trend Storage
// Persists results and detects regressions across runs.
// ═══════════════════════════════════════════════════════════════════════════
function section32() {
  const s = startSection(32, 'Run History & Trends', 'Platform');
  const historyDir = path.join(ROOT, '.idx-validate');
  const historyFile = path.join(historyDir, 'history.json');

  let history = [];
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
  } catch (e) { /* ignore */ }

  const currentRun = {
    timestamp: new Date().toISOString(),
    pass: totalPass, critical: totalCritical, warning: totalWarning, info: totalInfo,
  };

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

  // Save current run
  history.push(currentRun);
  if (history.length > 50) history = history.slice(-50); // Keep last 50 runs
  try {
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    pass(s, `Run history saved (${history.length} runs)`);
  } catch (e) {
    info(s, 'Could not save run history', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  IDX Plus Compliance Validator v3 — mallan.nyc');
console.log('  REBNY RLS / UCBA 2026 / Trestle IDX Plus');
console.log('  32 sections · 1,426 OData fields · Full-stack audit');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

const allSections = [section1,section2,section3,section4,section5,section6,section7,section8,section9,
  section10,section11,section12,section13,section14,section15,section16,section17,section18,section19,
  section20,section21,section22,section23,section24,section25,section26,
  section27,section28,section29,section30,section31,section32];

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
    console.log(`[${String(sec.num).padStart(2, ' ')}/32] ${sec.title}: ${status} (${p}✓ ${c}✗ ${w}⚠ ${inf}ℹ)`);

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

// Save CRM-readable results to public/crm/data/validator-results.json
try {
  const crmResult = {
    timestamp: new Date().toISOString(),
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
    fs.writeFileSync(path.join(crmDataDir, 'validator-results.json'), JSON.stringify(crmResult, null, 2));
  }
} catch (e) { /* ignore */ }

process.exit(totalCritical > 0 ? 1 : 0);
