#!/usr/bin/env node
/**
 * CI Compliance Check — runs on every PR
 *
 * Verifies:
 * 1. No client-side Trestle/IDX API calls
 * 2. No NEXT_PUBLIC_ env vars containing secrets
 * 3. toPublicDTO() used in public API endpoints
 * 4. checkDistributionGates() used in public API endpoints
 *
 * Exit code 0 = pass, 1 = fail
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let passes = 0;

function pass(name) {
  console.log(`  PASS: ${name}`);
  passes++;
}

function fail(name, detail) {
  console.error(`  FAIL: ${name}`);
  if (detail) console.error(`        ${detail}`);
  failures++;
}

/**
 * Recursively find files matching a pattern
 */
function findFiles(dir, ext, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findFiles(full, ext, results);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function fileContains(filePath, pattern) {
  const content = fs.readFileSync(filePath, 'utf8');
  return pattern.test(content);
}

console.log('=== CI Compliance Check ===\n');

// ── 1. No Trestle URLs in client components ──
const TRESTLE_PATTERN = /api\.cotality\.com|api-trestle\.corelogic\.com|api-prod\.corelogic\.com/;
const componentFiles = findFiles(path.join(ROOT, 'app', 'components'), '.tsx');
const clientTrestleCalls = componentFiles.filter(f => fileContains(f, TRESTLE_PATTERN));
if (clientTrestleCalls.length === 0) {
  pass('No Trestle URLs in client components');
} else {
  fail('Trestle URLs found in client components', clientTrestleCalls.join(', '));
}

// ── 2. No client components importing from lib/idx/ (except display-adapter which is safe) ──
const USE_CLIENT = /['"]use client['"]/;
// Match lib/idx imports EXCEPT display-adapter (pure display utility, no API calls)
const IDX_IMPORT_UNSAFE = /from\s+['"]@\/lib\/idx\/(?!display-adapter)/;
const allTsx = findFiles(path.join(ROOT, 'app'), '.tsx');
const clientIdxImports = allTsx.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  return USE_CLIENT.test(content) && IDX_IMPORT_UNSAFE.test(content);
});
if (clientIdxImports.length === 0) {
  pass('No client components importing IDX modules');
} else {
  fail('Client components import IDX modules', clientIdxImports.map(f => path.relative(ROOT, f)).join(', '));
}

// ── 3. No NEXT_PUBLIC_ secrets ──
const SECRET_PATTERN = /NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|CREDENTIAL|API_KEY)/i;
for (const envFile of ['.env', '.env.local', '.env.production']) {
  const envPath = path.join(ROOT, envFile);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const secrets = lines.filter(l => SECRET_PATTERN.test(l) && !l.startsWith('#'));
    if (secrets.length === 0) {
      pass(`No secrets in NEXT_PUBLIC_ vars (${envFile})`);
    } else {
      fail(`Secrets in NEXT_PUBLIC_ vars (${envFile})`, secrets.join('; '));
    }
  }
}

// ── 4. toPublicDTO used in public listing endpoints ──
const publicEndpoints = [
  path.join(ROOT, 'app', 'api', 'listings', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'listings', '[id]', 'route.ts'),
];
for (const ep of publicEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /toPublicDTO/)) {
      pass(`toPublicDTO used in ${rel}`);
    } else {
      fail(`toPublicDTO missing in ${rel}`);
    }
  }
}

// ── 5. checkDistributionGates used in public listing endpoints ──
for (const ep of publicEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /checkDistributionGates/)) {
      pass(`checkDistributionGates used in ${rel}`);
    } else {
      fail(`checkDistributionGates missing in ${rel}`);
    }
  }
}

// ── 6. No compensation fields in public API responses ──
const apiFiles = findFiles(path.join(ROOT, 'app', 'api'), '.ts');
const COMP_PATTERN = /BuyerAgencyCompensation|SubAgencyCompensation/;
const compViolations = apiFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Skip if the reference is in a "removed" or "strip" context
  if (!COMP_PATTERN.test(content)) return false;
  const lines = content.split('\n');
  return lines.some(l => COMP_PATTERN.test(l) && !/remove|strip|deleted|REMOVED|\/\//.test(l));
});
if (compViolations.length === 0) {
  pass('No compensation fields in public APIs');
} else {
  fail('Compensation fields found', compViolations.map(f => path.relative(ROOT, f)).join(', '));
}

// ── 7. escapeHtml used in all email-sending endpoints ──
const SEND_EMAIL_PATTERN = /sendEmail|sendgrid/;
const ESCAPE_HTML_PATTERN = /escapeHtml/;
const emailEndpoints = apiFiles.filter(f => fileContains(f, SEND_EMAIL_PATTERN));
for (const ep of emailEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fileContains(ep, ESCAPE_HTML_PATTERN) || !rel.startsWith('app')) {
    pass(`escapeHtml used in ${rel}`);
  } else {
    fail(`escapeHtml missing in email endpoint ${rel}`);
  }
}

// ── 8. Distribution gates on Trestle fallback endpoints ──
const trestleFallbackEndpoints = [
  path.join(ROOT, 'app', 'api', 'market', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'buildings', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'listings', 'building', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'open-houses', 'route.ts'),
];
for (const ep of trestleFallbackEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /checkDistributionGates/)) {
      pass(`Distribution gates in ${rel}`);
    } else {
      fail(`Distribution gates missing in ${rel}`);
    }
  }
}

console.log(`\n=== Result: ${passes} passed, ${failures} failed ===`);
process.exit(failures > 0 ? 1 : 0);
