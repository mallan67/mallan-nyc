#!/usr/bin/env node
/**
 * validate-standalone.js — Safe update tool for CRM standalone HTML files
 *
 * Commands:
 *   backup  <search|sale|rental|crm|all>   Create timestamped backup before editing
 *   validate <search|sale|rental|crm|all>  Verify CRM integration contract after changes
 *   rollback <backup-filename>             Restore a file from backup
 *   list                               List available backups
 *   schema-snapshot                    Save current trestle-metadata.xml as baseline
 *   schema-diff                        Diff current metadata against saved snapshot
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── File mapping ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CRM_DIR = path.join(PROJECT_ROOT, 'public', 'crm');
const BACKUP_DIR = path.join(CRM_DIR, '.backups');
const METADATA_FILE = path.join(PROJECT_ROOT, 'trestle-metadata.xml');

const FILES = {
  search: { path: path.join(CRM_DIR, 'index-built.html'), label: 'Search' },
  sale:   { path: path.join(CRM_DIR, 'SALE-FORM-REDESIGN.html'), label: 'Sale Form' },
  rental: { path: path.join(CRM_DIR, 'RENTAL-FORM-REDESIGN.html'), label: 'Rental Form' },
  crm:    { path: path.join(CRM_DIR, 'dashboard.html'), label: 'CRM Dashboard' },
};

// ── Colors (ANSI) ─────────────────────────────────────────────────────────────

const C = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function resolveTargets(key) {
  if (key === 'all') return Object.keys(FILES);
  if (FILES[key]) return [key];
  console.error(C.red(`Unknown target: "${key}". Use: search, sale, rental, crm, or all`));
  process.exit(1);
}

// ── Validation checks ────────────────────────────────────────────────────────

function check(name, type, pass, detail) {
  return { name, type, pass, detail: detail || '' };
}

function universalChecks(rawContent, filePath) {
  // For dashboard.html, also load JS modules so checks can find patterns
  let content = rawContent;
  const isCrmDashboard = /dashboard\.html/.test(filePath);
  if (isCrmDashboard) {
    const dashboardJsDir = path.join(CRM_DIR, 'js', 'dashboard');
    if (fs.existsSync(dashboardJsDir)) {
      const jsFiles = fs.readdirSync(dashboardJsDir).filter(f => f.endsWith('.js'));
      for (const f of jsFiles) {
        content += '\n' + fs.readFileSync(path.join(dashboardJsDir, f), 'utf-8');
      }
    }
  }
  const results = [];

  // 1. File exists + non-empty
  results.push(check(
    'File exists and non-empty', 'FAIL',
    content.length > 0,
    `${content.length.toLocaleString()} chars`
  ));

  // 2. HTML structure
  results.push(check(
    'HTML structure', 'FAIL',
    /<html[\s>]/i.test(content) && /<\/html>/i.test(content),
    'Has <html> and </html>'
  ));

  // 3. Balanced <script> tags (count only HTML-level tags, skip JS string content)
  //    A real <script> tag starts at column 0 or after whitespace/HTML.
  //    JS string content like `'<script>' + ...` won't start at column 0.
  const rawHtml = rawContent; // use raw HTML only, not appended JS modules
  const openScripts = (rawHtml.match(/^\s*<script[\s>]/gim) || []).length +
                      (rawHtml.match(/<script[^>]+src=/gi) || []).length; // external scripts (inline on same line)
  const closeScripts = (rawHtml.match(/<\/script>/gi) || []).length;
  // Deduplicate: external <script src=...></script> lines match both patterns
  const externalOneLine = (rawHtml.match(/^\s*<script[^>]+src=[^>]+><\/script>/gim) || []).length;
  const adjustedOpen = openScripts - externalOneLine;
  results.push(check(
    'Balanced <script> tags', 'FAIL',
    adjustedOpen === closeScripts,
    `open: ${adjustedOpen}, close: ${closeScripts}`
  ));

  // 4. Agent identity initialization
  //    Old files: initLoggedInAgent / LOGGED_IN_AGENT / AGENT_PROFILE
  //    New dashboard: Store.session.currentUser (cookie-based auth via API)
  results.push(check(
    'Agent identity initialization', 'FAIL',
    /initLoggedInAgent/.test(content) || /LOGGED_IN_AGENT\s*=/.test(content) ||
    /AGENT_PROFILE\s*=/.test(content) || /currentUser/.test(content),
    isCrmDashboard ? 'Cookie-based auth (Store.session.currentUser)' : 'Agent identity parsing'
  ));

  // 5. Auth: all files use cookie-based auth via MallanAPI.init()
  //    Agent identity fields (name, phone, email, license, company) come from API, not URL params
  const authFields = ['name', 'phone', 'email', 'license', 'company'];
  const foundAuth = authFields.filter(f => content.includes(f));
  results.push(check(
    'Auth identity fields', 'FAIL',
    (foundAuth.length >= 3) && (/MallanAPI/.test(content) || /currentUser/.test(content) || /api\/auth/.test(content)),
    `Cookie-based auth — fields: ${foundAuth.join(', ')}`
  ));

  // 6. localStorage referenced
  results.push(check(
    'localStorage referenced', 'WARN',
    /localStorage/.test(content),
    'Data persistence'
  ));

  // 7. REBNY attribution
  results.push(check(
    'REBNY attribution', 'WARN',
    /REBNY/i.test(content),
    'Compliance text'
  ));

  return results;
}

function searchChecks(content) {
  const results = [];

  // 8. Role-based access (via API or URL param)
  results.push(check(
    'Role-based access scoping', 'FAIL',
    (/['"]role['"]/.test(content) && (/\.role/.test(content) || /\.get\s*\(\s*['"]role['"]\s*\)/.test(content))),
    'Broker/agent access scoping'
  ));

  // 9. LOGGED_IN_AGENT global
  results.push(check(
    'LOGGED_IN_AGENT global', 'FAIL',
    /LOGGED_IN_AGENT\s*=/.test(content),
    'Agent identity object'
  ));

  // 10. Role-based access logic
  results.push(check(
    'Role-based access logic', 'FAIL',
    /role\s*===\s*['"]broker['"]/.test(content),
    'Broker/agent conditionals'
  ));

  // 11. Agent-scoped localStorage
  results.push(check(
    'Agent-scoped localStorage', 'WARN',
    /searchAuditLog_/.test(content) && /savedSearches_/.test(content),
    'Per-agent storage keys'
  ));

  // 12. Hash fragment handling
  results.push(check(
    'Hash fragment handling', 'WARN',
    /location\.hash/.test(content),
    'Sidebar navigation'
  ));

  // 13. Search filter functions
  results.push(check(
    'Search filter functions', 'WARN',
    /collectSearchCriteria/.test(content) || /filterListings/.test(content),
    'Core search logic'
  ));

  // 14. REBNY Compliance Doctor
  results.push(check(
    'REBNY Compliance Doctor', 'WARN',
    /REBNYComplianceDoctor/.test(content) && /COMPLIANCE_DOCTOR_VERSION/.test(content),
    '10-test compliance suite'
  ));

  // 15. REBNY Wiring Test
  results.push(check(
    'REBNY Wiring Test', 'WARN',
    /REBNYWiringTest/.test(content),
    'Data integrity tests (W1-W7)'
  ));

  // 16. REBNY Behavior Test
  results.push(check(
    'REBNY Behavior Test', 'WARN',
    /REBNYBehaviorTest/.test(content),
    'Edge case & UI tests (B1-B6)'
  ));

  // 17. REBNY Compliance Extended
  results.push(check(
    'REBNY Compliance Extended', 'WARN',
    /REBNYComplianceExtended/.test(content),
    'Security & hardening tests (C1-C7)'
  ));

  // 18. REBNY Test Suite (master runner)
  results.push(check(
    'REBNY Test Suite', 'WARN',
    /REBNYTestSuite/.test(content) && /TEST_SUITE_VERSION/.test(content),
    '30-test master runner with tabbed modal'
  ));

  // 19. Cross-Surface Consistency helpers
  results.push(check(
    'Cross-Surface helpers', 'WARN',
    /getStatusBadgeClasses/.test(content) && /formatCurrency/.test(content),
    'Dynamic status badges + null-safe price formatting'
  ));

  // 20. All 8 report format generators
  results.push(check(
    'All 8 report format generators', 'WARN',
    /previewFactSheet/.test(content) && /previewCma/.test(content) &&
    /previewOpenHouse/.test(content) && /previewImages/.test(content) &&
    /previewGrid/.test(content) && /previewSummary/.test(content) &&
    /previewDetail/.test(content) && /previewComparison/.test(content),
    'Grid, Summary, Detail, Comparison, Fact Sheet, CMA, Open House, Images'
  ));

  // 21. CSV/Excel/ShareableLink export functions
  results.push(check(
    'CSV/Excel/ShareableLink exports', 'WARN',
    /exportReportCSV/.test(content) && /exportReportExcel/.test(content) && /generateShareableLink/.test(content),
    'Report output handlers for CSV, Excel, and shareable link'
  ));

  // 22. Report helper functions
  results.push(check(
    'Report helper functions', 'WARN',
    /getOptionalContentConfig/.test(content) && /getSelectedReportFields/.test(content) && /getSortedListings/.test(content),
    'Optional content, custom fields, and sort helpers'
  ));

  // 23. generateReport output router
  results.push(check(
    'generateReport output router', 'WARN',
    /function generateReport/.test(content) && /switch\s*\(\s*output\s*\)/.test(content),
    'Routes to email/print/CSV/Excel/shareableLink outputs'
  ));

  // 24. Extended test suite functions (NV, AL, S, X, A11Y/RESO, R)
  const extFunctions = ['NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests',
    'SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests'];
  const missingExt = extFunctions.filter(f => !content.includes('function ' + f));
  results.push(check(
    'Extended test suite (6 functions)', 'WARN',
    missingExt.length === 0,
    missingExt.length === 0 ? 'All 6 extended test functions present' : 'Missing: ' + missingExt.join(', ')
  ));

  // 25. PROHIBITED_LEAK_FIELDS constant
  results.push(check(
    'PROHIBITED_LEAK_FIELDS constant', 'WARN',
    /PROHIBITED_LEAK_FIELDS/.test(content) && /EXTENDED_SUITE_VERSION/.test(content),
    'Allowlist leak test infrastructure'
  ));

  // 29. Strict Integrity v2.0 infrastructure
  const integrityFns = ['StrictIntegrityTests','SourceIntegrityTests','setupStrictGuards','teardownStrictGuards','markFallbackUsed','computeDatasetHash','safeSuiteCall'];
  const missingIntegrity = integrityFns.filter(f => !content.includes('function ' + f));
  results.push(check(
    'Strict Integrity v2.0 (7 functions)', 'WARN',
    missingIntegrity.length === 0,
    missingIntegrity.length === 0 ? 'All 7 integrity guard functions present' : 'Missing: ' + missingIntegrity.join(', ')
  ));

  // 30. Guard tests in suite (GUARD-01, GUARD-02, INT-01..06, SRC-01..03)
  const guardIds = ['GUARD-01','GUARD-02','INT-01','INT-03','INT-04','INT-05','INT-06','SRC-01','SRC-02','SRC-03'];
  const missingGuards = guardIds.filter(id => !content.includes("'" + id + "'"));
  results.push(check(
    'Guard/INT/SRC test IDs (10 tests)', 'WARN',
    missingGuards.length === 0,
    missingGuards.length === 0 ? 'All 10 integrity test IDs present' : 'Missing: ' + missingGuards.join(', ')
  ));

  // 26. Cross-file parity: mockListings consistency
  // Extract only the mockListings array block (not entire file) to avoid counting test fixtures
  function countMockListings(src) {
    const startMatch = src.match(/var\s+mockListings\s*=\s*\[/);
    if (!startMatch) return -1;
    const startIdx = startMatch.index;
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    const block = src.slice(startIdx, endIdx + 1);
    return (block.match(/\{\s*id\s*:\s*\d+/g) || []).length;
  }

  // CRM parity check removed — dashboard.html is modular (no inline mock listings)
  {
    const searchCount = countMockListings(content);
    if (searchCount > 0) {
      results.push(check(
        'P1: mockListings in Search', 'WARN',
        searchCount === 0,
        `Search still has ${searchCount} mock listings — should be 0 (API-driven)`
      ));
    } else {
      results.push(check(
        'P1: mockListings in Search', 'WARN',
        true,
        'No mock listings found in Search (API-driven) — PASS'
      ));
    }

    // P2: Core function presence in Search
    const coreFunctions = ['formatCurrency','getStatusBadgeClasses','checkListingCompliance','logAuditEntry'];
    const searchHas = coreFunctions.filter(f => content.includes('function ' + f));
    results.push(check(
      'P2: Core functions present in Search', 'WARN',
      searchHas.length > 0,
      `Found: ${searchHas.length}/${coreFunctions.length} (${searchHas.join(', ') || 'none'})`
    ));

    // P3: REBNY attribution in Search
    const searchAttrib = /REBNY.*RLS|REBNY.*Listing.*Service/i.test(content);
    results.push(check(
      'P3: REBNY attribution in Search', 'WARN',
      searchAttrib,
      searchAttrib ? 'REBNY attribution found' : 'Missing REBNY attribution'
    ));
  }

  return results;
}

function saleChecks(content) {
  const results = [];

  // 8. submitSalesListing function
  results.push(check(
    'submitSalesListing() function', 'FAIL',
    /submitSalesListing/.test(content),
    'Form submission'
  ));

  // 9. saleListings localStorage key
  results.push(check(
    'saleListings localStorage key', 'FAIL',
    /saleListings/.test(content),
    'Listings saved to shared storage'
  ));

  // 10. mallan_draft_sale key
  results.push(check(
    'mallan_draft_sale key', 'WARN',
    /mallan_draft_sale/.test(content),
    'Auto-save draft'
  ));

  // 11. window.opener detection
  results.push(check(
    'window.opener detection', 'WARN',
    /window\.opener/.test(content),
    'CRM launch detection'
  ));

  // 12. buildingDatabase array
  results.push(check(
    'buildingDatabase array', 'WARN',
    /buildingDatabase/.test(content),
    'IDX auto-populate'
  ));

  // 13. JSON serialization
  results.push(check(
    'JSON serialization', 'WARN',
    /JSON\.parse/.test(content) && /JSON\.stringify/.test(content),
    'Data round-trip'
  ));

  return results;
}

function crmChecks(htmlContent) {
  // dashboard.html is a thin shell — load all JS modules too
  const dashboardJsDir = path.join(CRM_DIR, 'js', 'dashboard');
  let content = htmlContent;
  if (fs.existsSync(dashboardJsDir)) {
    const jsFiles = fs.readdirSync(dashboardJsDir).filter(f => f.endsWith('.js'));
    for (const f of jsFiles) {
      content += '\n' + fs.readFileSync(path.join(dashboardJsDir, f), 'utf-8');
    }
  }
  const results = [];

  // 8. User identity (Store.session.currentUser in new dashboard)
  results.push(check(
    'User identity system', 'FAIL',
    /currentUser/.test(content) || /AGENT_PROFILE/.test(content),
    'Agent/broker identity object'
  ));

  // 9. Role-based access control (Permissions module in new dashboard)
  results.push(check(
    'Role-based access (broker/agent)', 'FAIL',
    /Permissions/.test(content) || /isTabBlockedForAgent/.test(content) || /role.*===.*['"]broker['"]/.test(content),
    'Permission-based access control'
  ));

  // 10. Standalone file launchers (uses /crm/ URL paths in new dashboard)
  const launchSearch = /crm\/search/.test(content) || /SEARCH-STANDALONE/i.test(content);
  const launchSale = /crm\/sale-listing/.test(content) || /SALE-FORM-REDESIGN/i.test(content);
  const launchRental = /crm\/rental-listing/.test(content) || /RENTAL-FORM-REDESIGN/i.test(content);
  results.push(check(
    'Standalone file launchers', 'FAIL',
    launchSearch && launchSale && launchRental,
    `Search: ${launchSearch ? 'YES' : 'NO'}, Sale: ${launchSale ? 'YES' : 'NO'}, Rental: ${launchRental ? 'YES' : 'NO'}`
  ));

  // 11. Listing data (API-driven in new dashboard, no hardcoded mockListings)
  results.push(check(
    'Listing data source', 'WARN',
    /api.*listing/i.test(content) || /Store\./.test(content) || /mockListings/.test(content),
    'API-driven or Store-based listing data'
  ));

  // 12. Core formatting/compliance (may be in panels.js or delegated to forms)
  const coreFns = ['formatCurrency','checkListingCompliance','logAuditEntry'];
  const foundFns = coreFns.filter(f => content.includes(f));
  results.push(check(
    'Core functions present', 'WARN',
    foundFns.length >= 1,
    foundFns.length > 0 ? `Found: ${foundFns.join(', ')}` : 'Delegated to standalone forms'
  ));

  // 13. Client portal sections
  const portals = ['seller-portal','landlord-portal','buyer','renter','seller','landlord'];
  const foundPortals = [...new Set(portals.filter(p => content.includes(p)))];
  results.push(check(
    'Client portal sections', 'WARN',
    foundPortals.length >= 2,
    `Found: ${foundPortals.join(', ')} (${foundPortals.length})`
  ));

  // 14. Broker admin sections
  const brokerSections = ['agent','compliance','audit-log','payouts','lead','document'];
  const foundBroker = brokerSections.filter(s => content.includes(s));
  results.push(check(
    'Broker admin sections', 'WARN',
    foundBroker.length >= 3,
    `Found: ${foundBroker.length}/${brokerSections.length} — ${foundBroker.join(', ')}`
  ));

  // 15. Commission/financial sections
  results.push(check(
    'Commission & financial sections', 'WARN',
    /commission/i.test(content) && /payment/i.test(content),
    'Commission + payment handling'
  ));

  // 16. Audit/event logging
  results.push(check(
    'Audit logging infrastructure', 'WARN',
    /audit/i.test(content) || /AuditEvent/i.test(content) || /crmAuditLog/.test(content),
    'Audit event tracking'
  ));

  // 17. Navigation system (Router.navigate in new dashboard)
  results.push(check(
    'Navigation system', 'FAIL',
    /Router\.navigate/.test(content) || /function\s+showTab/.test(content),
    'Hash-based routing or tab navigation'
  ));

  // 18. Listing management
  results.push(check(
    'Listing management', 'WARN',
    /listing/i.test(content) && /window\.open/.test(content),
    'Listing views/editors accessible'
  ));

  // 19. Document handling
  results.push(check(
    'Document handling', 'WARN',
    /document/i.test(content),
    'Document management'
  ));

  return results;
}

function rentalChecks(content) {
  const results = [];

  // 8. Rental submit function
  results.push(check(
    'submitRentalListing() function', 'FAIL',
    /submitRentalListing/.test(content),
    'Form submission'
  ));

  // 9. rentalListingDraft localStorage key
  results.push(check(
    'rentalListingDraft localStorage key', 'FAIL',
    /rentalListingDraft/.test(content),
    'Draft persistence'
  ));

  // 10. Auto-save draft (saveRentalDraft function)
  results.push(check(
    'saveRentalDraft function', 'WARN',
    /saveRentalDraft/.test(content) || /rentalListingDraft/.test(content),
    'Auto-save draft'
  ));

  // 11. window.opener detection
  results.push(check(
    'window.opener detection', 'WARN',
    /window\.opener/.test(content),
    'CRM launch detection'
  ));

  // 12. Tab navigation functions
  results.push(check(
    'Tab navigation functions', 'WARN',
    /showRentalMainTab/.test(content) && /showRentalSubTab/.test(content),
    'Navigation structure'
  ));

  return results;
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdBackup(targets) {
  ensureBackupDir();
  console.log(C.bold('\n  Backup\n'));

  for (const key of targets) {
    const { path: filePath, label } = FILES[key];
    if (!fs.existsSync(filePath)) {
      console.log(`  ${C.red('MISSING')}  ${label}: ${filePath}`);
      continue;
    }

    const baseName = path.basename(filePath, '.html');
    const backupName = `${baseName}-${timestamp()}.html`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    fs.copyFileSync(filePath, backupPath);
    const hash = fileHash(backupPath);
    const size = (fs.statSync(backupPath).size / 1024).toFixed(0);

    console.log(`  ${C.green('SAVED')}  ${label}`);
    console.log(`         ${C.dim(backupName)} (${size}KB, sha256:${hash})`);
  }
  console.log();
}

function cmdValidate(targets) {
  console.log(C.bold('\n  Standalone Validation\n'));

  let anyFailed = false;

  for (const key of targets) {
    const { path: filePath, label } = FILES[key];

    console.log(`  ${C.cyan(label)} — ${path.basename(filePath)}`);
    console.log(`  ${'─'.repeat(50)}`);

    if (!fs.existsSync(filePath)) {
      console.log(`  ${C.red('FAIL')}  File does not exist: ${filePath}\n`);
      anyFailed = true;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let results = universalChecks(content, filePath);

    if (key === 'search') results = results.concat(searchChecks(content));
    else if (key === 'sale') results = results.concat(saleChecks(content));
    else if (key === 'rental') results = results.concat(rentalChecks(content));
    else if (key === 'crm') results = results.concat(crmChecks(content));

    let failCount = 0;
    let warnCount = 0;

    for (const r of results) {
      const icon = r.pass
        ? C.green('PASS')
        : r.type === 'FAIL' ? C.red('FAIL') : C.yellow('WARN');

      if (!r.pass && r.type === 'FAIL') failCount++;
      if (!r.pass && r.type === 'WARN') warnCount++;

      const detail = r.detail ? C.dim(` — ${r.detail}`) : '';
      console.log(`  ${icon}  ${r.name}${detail}`);
    }

    const total = results.length;
    const passed = results.filter(r => r.pass).length;

    if (failCount > 0) {
      console.log(`\n  ${C.red(`RESULT: FAIL`)} — ${passed}/${total} passed, ${failCount} critical failure(s)`);
      anyFailed = true;
    } else if (warnCount > 0) {
      console.log(`\n  ${C.yellow(`RESULT: PASS with ${warnCount} warning(s)`)} — ${passed}/${total} passed`);
    } else {
      console.log(`\n  ${C.green('RESULT: PASS')} — ${total}/${total} checks passed`);
    }
    console.log();
  }

  if (anyFailed) {
    console.log(C.red('  One or more files FAILED validation. Rollback recommended.\n'));
    process.exit(1);
  } else {
    console.log(C.green('  All files passed validation.\n'));
  }
}

function cmdRollback(backupFilename) {
  ensureBackupDir();
  const backupPath = path.join(BACKUP_DIR, backupFilename);

  if (!fs.existsSync(backupPath)) {
    console.error(C.red(`\n  Backup not found: ${backupFilename}`));
    console.error(C.dim(`  Run "node scripts/validate-standalone.js list" to see available backups.\n`));
    process.exit(1);
  }

  // Determine which file this backup belongs to
  let targetKey = null;
  for (const [key, info] of Object.entries(FILES)) {
    const baseName = path.basename(info.path, '.html');
    if (backupFilename.startsWith(baseName)) {
      targetKey = key;
      break;
    }
  }

  if (!targetKey) {
    console.error(C.red(`\n  Cannot determine target file for backup: ${backupFilename}`));
    console.error(C.dim(`  Expected filename starting with: ${Object.values(FILES).map(f => path.basename(f.path, '.html')).join(', ')}\n`));
    process.exit(1);
  }

  const targetPath = FILES[targetKey].path;
  const label = FILES[targetKey].label;

  // Create a backup of the current (broken) file before overwriting
  if (fs.existsSync(targetPath)) {
    const preName = path.basename(targetPath, '.html') + '-pre-rollback-' + timestamp() + '.html';
    fs.copyFileSync(targetPath, path.join(BACKUP_DIR, preName));
    console.log(C.dim(`\n  Pre-rollback snapshot saved: ${preName}`));
  }

  fs.copyFileSync(backupPath, targetPath);
  console.log(C.green(`\n  RESTORED  ${label} from ${backupFilename}`));
  console.log(C.dim(`  Target: ${targetPath}\n`));
}

function cmdList() {
  ensureBackupDir();
  console.log(C.bold('\n  Available Backups\n'));

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.html'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log(C.dim('  No backups found.\n'));
    return;
  }

  for (const f of files) {
    const fullPath = path.join(BACKUP_DIR, f);
    const stat = fs.statSync(fullPath);
    const sizeKB = (stat.size / 1024).toFixed(0);
    const date = stat.mtime.toLocaleString();
    console.log(`  ${f}  ${C.dim(`(${sizeKB}KB, ${date})`)}`);
  }
  console.log(C.dim(`\n  Total: ${files.length} backup(s) in ${BACKUP_DIR}\n`));
}

// ── Schema diff ───────────────────────────────────────────────────────────────

function parseMetadataFields(xmlContent) {
  // Extract EntityType/ComplexType property definitions from OData $metadata XML
  const fields = new Map();
  const enums = new Map();

  // Match Property elements: <Property Name="X" Type="Y" />
  const propRegex = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"/g;
  let match;
  while ((match = propRegex.exec(xmlContent)) !== null) {
    fields.set(match[1], match[2]);
  }

  // Match NavigationProperty elements
  const navRegex = /<NavigationProperty\s+Name="([^"]+)"\s+Type="([^"]+)"/g;
  while ((match = navRegex.exec(xmlContent)) !== null) {
    fields.set('nav:' + match[1], match[2]);
  }

  // Match EnumType Members: <Member Name="X" Value="Y" />
  const enumTypeRegex = /<EnumType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EnumType>/g;
  while ((match = enumTypeRegex.exec(xmlContent)) !== null) {
    const enumName = match[1];
    const body = match[2];
    const members = [];
    const memberRegex = /<Member\s+Name="([^"]+)"/g;
    let m;
    while ((m = memberRegex.exec(body)) !== null) {
      members.push(m[1]);
    }
    enums.set(enumName, members);
  }

  return { fields, enums };
}

function cmdSchemaSnapshot() {
  ensureBackupDir();

  if (!fs.existsSync(METADATA_FILE)) {
    console.error(C.red(`\n  Metadata file not found: ${METADATA_FILE}`));
    console.error(C.dim('  Download from: GET https://api.cotality.com/trestle/odata/$metadata\n'));
    process.exit(1);
  }

  const snapshotName = `trestle-metadata-snapshot-${timestamp()}.xml`;
  const snapshotPath = path.join(BACKUP_DIR, snapshotName);
  fs.copyFileSync(METADATA_FILE, snapshotPath);

  const hash = fileHash(snapshotPath);
  const sizeKB = (fs.statSync(snapshotPath).size / 1024).toFixed(0);
  console.log(C.green(`\n  SAVED  Schema snapshot: ${snapshotName}`));
  console.log(C.dim(`  ${sizeKB}KB, sha256:${hash}\n`));
}

function cmdSchemaDiff() {
  ensureBackupDir();

  if (!fs.existsSync(METADATA_FILE)) {
    console.error(C.red(`\n  Current metadata file not found: ${METADATA_FILE}`));
    process.exit(1);
  }

  // Find most recent snapshot
  const snapshots = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('trestle-metadata-snapshot-') && f.endsWith('.xml'))
    .sort()
    .reverse();

  if (snapshots.length === 0) {
    console.error(C.red('\n  No schema snapshot found.'));
    console.error(C.dim('  Run: node scripts/validate-standalone.js schema-snapshot\n'));
    process.exit(1);
  }

  const snapshotPath = path.join(BACKUP_DIR, snapshots[0]);
  console.log(C.bold('\n  Schema Diff\n'));
  console.log(C.dim(`  Baseline: ${snapshots[0]}`));
  console.log(C.dim(`  Current:  trestle-metadata.xml\n`));

  const oldXml = fs.readFileSync(snapshotPath, 'utf-8');
  const newXml = fs.readFileSync(METADATA_FILE, 'utf-8');

  const oldSchema = parseMetadataFields(oldXml);
  const newSchema = parseMetadataFields(newXml);

  let changes = 0;

  // Fields added
  for (const [name, type] of newSchema.fields) {
    if (!oldSchema.fields.has(name)) {
      console.log(`  ${C.green('+ ADDED')}   Field: ${name} (${type})`);
      changes++;
    }
  }

  // Fields removed
  for (const [name, type] of oldSchema.fields) {
    if (!newSchema.fields.has(name)) {
      console.log(`  ${C.red('- REMOVED')} Field: ${name} (${type})`);
      changes++;
    }
  }

  // Fields with type changes
  for (const [name, newType] of newSchema.fields) {
    const oldType = oldSchema.fields.get(name);
    if (oldType && oldType !== newType) {
      console.log(`  ${C.yellow('~ CHANGED')} Field: ${name} — ${oldType} -> ${newType}`);
      changes++;
    }
  }

  // Enum changes
  for (const [enumName, newMembers] of newSchema.enums) {
    const oldMembers = oldSchema.enums.get(enumName);
    if (!oldMembers) {
      console.log(`  ${C.green('+ ADDED')}   Enum: ${enumName} (${newMembers.length} values)`);
      changes++;
      continue;
    }
    const added = newMembers.filter(m => !oldMembers.includes(m));
    const removed = oldMembers.filter(m => !newMembers.includes(m));
    for (const m of added) {
      console.log(`  ${C.green('+ ADDED')}   Enum ${enumName}.${m}`);
      changes++;
    }
    for (const m of removed) {
      console.log(`  ${C.red('- REMOVED')} Enum ${enumName}.${m}`);
      changes++;
    }
  }

  // Enums removed entirely
  for (const [enumName] of oldSchema.enums) {
    if (!newSchema.enums.has(enumName)) {
      console.log(`  ${C.red('- REMOVED')} Enum: ${enumName}`);
      changes++;
    }
  }

  if (changes === 0) {
    console.log(C.green('  No schema changes detected.\n'));
  } else {
    console.log(`\n  ${C.yellow(`${changes} change(s) detected.`)} Review and update standalone files as needed.\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [,, command, arg] = process.argv;

if (!command) {
  console.log(`
  ${C.bold('validate-standalone.js')} — Safe update tool for CRM standalone files

  ${C.cyan('Commands:')}
    backup   <search|sale|rental|crm|all>   Create timestamped backup
    validate <search|sale|rental|crm|all>   Verify CRM integration contract
    rollback <backup-filename>          Restore from backup
    list                                List available backups
    schema-snapshot                     Save trestle-metadata.xml baseline
    schema-diff                         Diff current metadata vs snapshot

  ${C.cyan('Examples:')}
    node scripts/validate-standalone.js backup all
    node scripts/validate-standalone.js validate search
    node scripts/validate-standalone.js rollback SEARCH-STANDALONE-20260214-153000.html
    node scripts/validate-standalone.js schema-diff
  `);
  process.exit(0);
}

switch (command) {
  case 'backup':
    if (!arg) { console.error(C.red('\n  Usage: backup <search|sale|rental|all>\n')); process.exit(1); }
    cmdBackup(resolveTargets(arg));
    break;
  case 'validate':
    if (!arg) { console.error(C.red('\n  Usage: validate <search|sale|rental|all>\n')); process.exit(1); }
    cmdValidate(resolveTargets(arg));
    break;
  case 'rollback':
    if (!arg) { console.error(C.red('\n  Usage: rollback <backup-filename>\n')); process.exit(1); }
    cmdRollback(arg);
    break;
  case 'list':
    cmdList();
    break;
  case 'schema-snapshot':
    cmdSchemaSnapshot();
    break;
  case 'schema-diff':
    cmdSchemaDiff();
    break;
  default:
    console.error(C.red(`\n  Unknown command: "${command}"\n`));
    process.exit(1);
}
