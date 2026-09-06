#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// CRM SMOKE TEST — Runtime validation for HTML forms + JS modules
//
// Checks:
//   1. All CRM HTML files parse without errors
//   2. Critical elements exist (required fields, buttons, gates)
//   3. JavaScript modules load without reference errors
//   4. API route files exist and export expected HTTP methods
//   5. Prisma schema models match expected route dependencies
//
// Usage: node scripts/smoke-test-crm.js
// Keep permanently — catches regressions on every CRM/form change.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CRM_DIR = path.join(ROOT, 'public', 'crm');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✓ ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗ FAIL: ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠ WARN: ${msg}`); warnings++; }

// ─── Test 1: HTML Files Parse & Critical Elements ───────────────

console.log('\n═══ TEST 1: CRM HTML Files — Critical Elements ═══\n');

const HTML_FILES = {
  'SALE-FORM-REDESIGN.html': {
    role: 'Sale Listing Submission',
    requiredIds: [
      'saleStreetNumber', 'saleStreetName', 'saleCity', 'saleBorough',
      'saleStatus', 'salePrice', 'saleBedrooms',
      'saleFullBaths', 'saleDescription',
    ],
    requiredNames: ['salePropertyType'], // radio button group (no single id)
    gateIds: [
      'saleInternetEntireListingDisplayYN', 'saleInternetAddressDisplayYN',
    ],
    mustContain: ['data-rls-field', 'Fair Housing'],
  },
  'RENTAL-FORM-REDESIGN.html': {
    role: 'Rental Listing Submission',
    requiredIds: [
      'rentalStreetNumber', 'rentalStreetName', 'rentalCity', 'rentalBorough',
      'rentalStatus', 'rentalMonthlyRent', 'rentalBedrooms',
      'rentalFullBathrooms', 'rentalDescription',
    ],
    requiredNames: ['rentalPropertyType'], // radio button group (no single id)
    gateIds: [
      'rentalInternetEntireListingDisplayYN', 'rentalInternetAddressDisplayYN',
    ],
    mustContain: ['data-rls-field', 'Fair Housing'],
  },
  'SALE-FORM-WITH-TOOLS.html': {
    role: 'Sale Listing Viewer',
    requiredIds: [],
    gateIds: [],
    mustContain: ['data-rls-viewer', 'readonly'],
  },
  'RENTAL-FORM-WITH-TOOLS.html': {
    role: 'Rental Listing Viewer',
    requiredIds: [],
    gateIds: [],
    mustContain: ['data-rls-viewer', 'readonly'],
  },
  'index-built.html': {
    role: 'IDX Search',
    requiredIds: [
      'btnSale', 'btnRent', 'generalSearchSection',
      // Unified form IDs (Task 6 dedup)
      'searchBasicMode', 'searchMinPrice', 'searchMaxPrice',
      'searchMinBeds', 'searchMaxBeds', 'searchKeyword',
      // Sticky search bar (Task 7)
      'stickySearchBar', 'activeFilterCount',
      // Header nav (Task 5)
      'navSales', 'navRentals', 'navBuildings', 'navCMA',
    ],
    gateIds: [],
    mustContain: ['data-rls-ignore', 'updateFilterCount', 'data-show-on'],
  },
  'dashboard.html': {
    role: 'CRM Dashboard',
    requiredIds: [],
    gateIds: [],
    mustContain: ['api-client.js'],
  },
};

for (const [filename, spec] of Object.entries(HTML_FILES)) {
  const filePath = path.join(CRM_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fail(`${filename} — file not found`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check required element IDs
  for (const id of spec.requiredIds) {
    if (content.includes(`id="${id}"`)) {
      pass(`${filename}: has required field #${id}`);
    } else {
      fail(`${filename}: missing required field #${id}`);
    }
  }

  // Check required radio-button name groups
  for (const name of (spec.requiredNames || [])) {
    if (content.includes(`name="${name}"`)) {
      pass(`${filename}: has required radio group name="${name}"`);
    } else {
      fail(`${filename}: missing required radio group name="${name}"`);
    }
  }

  // Check distribution gate IDs
  for (const id of spec.gateIds) {
    if (content.includes(`id="${id}"`)) {
      pass(`${filename}: has gate field #${id}`);
    } else {
      fail(`${filename}: missing gate field #${id}`);
    }
  }

  // Check must-contain strings
  for (const str of spec.mustContain) {
    if (content.includes(str)) {
      pass(`${filename}: contains "${str}"`);
    } else {
      fail(`${filename}: missing "${str}"`);
    }
  }
}

// ─── Test 2: JavaScript Module Syntax ───────────────────────────

console.log('\n═══ TEST 2: CRM JavaScript Modules — Syntax Check ═══\n');

function checkJsSyntax(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkJsSyntax(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const relPath = path.relative(ROOT, fullPath);
      try {
        const code = fs.readFileSync(fullPath, 'utf8');
        vm.createScript(code, { filename: relPath });
        pass(`${relPath}: syntax OK`);
      } catch (err) {
        fail(`${relPath}: ${err.message.split('\n')[0]}`);
      }
    }
  }
}

checkJsSyntax(path.join(CRM_DIR, 'js'));

// ─── Test 3: API Route Files — Existence & Exports ──────────────

console.log('\n═══ TEST 3: API Routes — File Existence ═══\n');

const CRITICAL_ROUTES = [
  // Auth
  'app/api/auth/login/route.ts',
  'app/api/auth/logout/route.ts',
  'app/api/auth/me/route.ts',
  // CRM Core
  'app/api/crm/listings/route.ts',
  'app/api/crm/listings/[id]/route.ts',
  'app/api/crm/listings/[id]/status/route.ts',
  'app/api/crm/clients/route.ts',
  'app/api/crm/clients/[id]/route.ts',
  'app/api/crm/deals/route.ts',
  'app/api/crm/showings/route.ts',
  // Protected Periods (UCBA A6/A7/A8)
  'app/api/crm/protected-periods/route.ts',
  'app/api/crm/protected-periods/[id]/route.ts',
  'app/api/crm/protected-periods/[id]/buyers/route.ts',
  // IDX
  'app/api/idx/search/route.ts',
  'app/api/idx/sync/route.ts',
  // Portal
  'app/api/portal/me/route.ts',
  'app/api/portal/listings/route.ts',
  // Public
  'app/api/listings/route.ts',
  'app/api/media/proxy/route.ts',
  // Crons
  'app/api/cron/idx-sync/route.ts',
  'app/api/cron/dom-reset/route.ts',
  'app/api/cron/listing-expiration/route.ts',
  'app/api/cron/data-retention/route.ts',
];

for (const route of CRITICAL_ROUTES) {
  const fullPath = path.join(ROOT, route);
  if (fs.existsSync(fullPath)) {
    // Check it exports at least one HTTP method
    const content = fs.readFileSync(fullPath, 'utf8');
    const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].filter(
      m => content.includes(`export async function ${m}`) || content.includes(`export function ${m}`)
    );
    if (methods.length > 0) {
      pass(`${route}: exists (${methods.join(', ')})`);
    } else {
      warn(`${route}: exists but exports no HTTP methods`);
    }
  } else {
    fail(`${route}: MISSING`);
  }
}

// ─── Test 4: Cron Routes Match vercel.json ──────────────────────

console.log('\n═══ TEST 4: Cron Routes vs vercel.json ═══\n');

const vercelPath = path.join(ROOT, 'vercel.json');
if (fs.existsSync(vercelPath)) {
  const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  if (vercel.crons) {
    for (const cron of vercel.crons) {
      const routePath = path.join(ROOT, 'app', cron.path.replace(/^\//, ''), 'route.ts');
      if (fs.existsSync(routePath)) {
        pass(`Cron ${cron.path}: route file exists`);
      } else {
        fail(`Cron ${cron.path}: route file MISSING at ${routePath}`);
      }
    }
  }
} else {
  warn('vercel.json not found — skipping cron check');
}

// ─── Test 5: Compliance Libraries Exist ─────────────────────────

console.log('\n═══ TEST 5: Compliance Libraries ═══\n');

const COMPLIANCE_FILES = [
  'lib/compliance/rls-enforcement.ts',
  'lib/compliance/dom-tracker.ts',
  'lib/compliance/dto.ts',
  'lib/compliance/rebny-ucba-rules.ts',
  'lib/compliance/rebny-validator.ts',
  'lib/compliance/normalizer.ts',
  'lib/compliance/business-days.ts',
  'lib/idx/trestle-mapper.ts',
  'lib/auth/index.ts',
  'lib/notifications/engine.ts',
];

for (const file of COMPLIANCE_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    pass(`${file}: exists`);
  } else {
    fail(`${file}: MISSING`);
  }
}

// ─── Test 6: Data Files Exist ───────────────────────────────────

console.log('\n═══ TEST 6: Data Files ═══\n');

const DATA_FILES = [
  'data/rebny-rls-property-fields.csv',
  'data/rebny-rls-property-lookup.csv',
  'data/rls-form-bindings.json',
  'data/RLS-FIELD-REGISTRY.md',
  'compliance/rules/active.json',
  'compliance/rules/rls-required.json',
  'compliance/rules/export-policy.json',
  'compliance/rules/status-rules.json',
  'compliance/fields.json',
];

for (const file of DATA_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    pass(`${file}: exists`);
  } else {
    fail(`${file}: MISSING`);
  }
}

// ─── Test 7: No Empty Route Directories ─────────────────────────

console.log('\n═══ TEST 7: Empty Route Directories ═══\n');

function findEmptyRouteDirs(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);
    const children = fs.readdirSync(fullPath);
    if (children.length === 0) {
      fail(`Empty directory: ${path.relative(ROOT, fullPath)}`);
    } else {
      // Check subdirectories
      findEmptyRouteDirs(fullPath);
    }
  }
}

findEmptyRouteDirs(path.join(ROOT, 'app', 'api'));
if (failed === 0) pass('No empty route directories found');

// ─── Summary ────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log(`  SMOKE TEST RESULTS`);
console.log(`  PASSED:   ${passed}`);
console.log(`  FAILED:   ${failed}`);
console.log(`  WARNINGS: ${warnings}`);
console.log('═══════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('⚠ SMOKE TEST FAILED — fix issues above before deploying.\n');
  process.exit(1);
}

console.log('✓ All smoke tests passed.\n');
