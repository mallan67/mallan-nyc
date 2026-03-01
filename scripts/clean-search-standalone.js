/**
 * Clean SEARCH-STANDALONE.html — Remove Customer Mode + Dashboard Tabs
 *
 * KEEPS: All 5 nav sections (New Search, My Searches, Client Searches, Last Search, Manage)
 * KEEPS: All search JS, manage JS, client functions, agent portal functions
 * KEEPS: customerDB, getMyClients, populateClientSelect, renderClientGrid, filterClientList
 *
 * DELETES: customerNavBar HTML, dashboard tabs HTML, section-customer HTML
 * DELETES: Customer mode JS functions (enterCustomerMode, exitCustomerMode, etc.)
 * DELETES: CSS for #customerNavBar and #custSection-summary
 * UPDATES: showSearchSection() — remove section-customer/customerNavBar references
 * UPDATES: renderClientGrid() — remove enterCustomerMode onclick
 */

const fs = require('fs');

const filePath = 'C:/Users/MayaAllan/Desktop/1/Old/SEARCH-STANDALONE.html';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Original line count:', lines.length);

// ═══════════════════════════════════════════════════════
// STEP 1: Mark line ranges for deletion (1-indexed)
// ═══════════════════════════════════════════════════════
const deleteRanges = [
  // CSS: #customerNavBar styles
  [654, 664],

  // CSS: #customerNavBar extended styles
  [939, 963],

  // CSS: #customerNavBar + #custSection-summary responsive (inside @media block)
  [1091, 1100],

  // HTML: customerNavBar (Customer Mode nav bar)
  [1127, 1172],

  // HTML: Dashboard tabs (Customer Directory, Analytics, Mortgage Rates, etc.)
  // Line 11830 is a stray </div> — not matched by any opening div
  [11662, 11830],

  // HTML: CMA/Customer Mode comments + section-customer (7 tabs)
  [11832, 12334],

  // JS: Customer mode global variables
  [13108, 13109],

  // JS: enterCustomerMode through filterCustomerSwitcher
  // (stops before filterClientList at 13308 which must be KEPT)
  [13201, 13307],

  // JS: runSearchForCustomer through click-outside handler
  // (starts after filterClientList ends at 13322)
  [13323, 13412],
];

// Build set of 1-indexed line numbers to delete
const toDelete = new Set();
for (const [start, end] of deleteRanges) {
  for (let i = start; i <= end; i++) {
    toDelete.add(i);
  }
}

// Also delete these individual lines:
// showSearchSection: remove section-customer hide
toDelete.add(12375); // document.getElementById('section-customer').style.display = 'none';
// showSearchSection: remove customerNavBar hide
toDelete.add(12380); // document.getElementById('customerNavBar').style.display = 'none';

// ═══════════════════════════════════════════════════════
// STEP 2: Process lines — delete or modify
// ═══════════════════════════════════════════════════════
const result = [];
let deletedCount = 0;
let modifiedCount = 0;

for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1; // 1-indexed

  if (toDelete.has(lineNum)) {
    deletedCount++;
    continue; // Skip this line
  }

  let line = lines[i];

  // Modify renderClientGrid: remove enterCustomerMode onclick
  // Line 13134: html += '<div ... onclick="enterCustomerMode(\'' + id + '\')">';
  if (lineNum === 13134 && line.includes('enterCustomerMode')) {
    line = line.replace(/ onclick="enterCustomerMode\(\\\x27' \+ id \+ '\\\x27\)"/, '');
    // Fallback: try simpler pattern
    if (line.includes('enterCustomerMode')) {
      line = line.replace(/\s*onclick="enterCustomerMode\([^)]*\)"/, '');
    }
    // Final fallback: direct string replace
    if (line.includes('enterCustomerMode')) {
      line = line.replace(` onclick="enterCustomerMode('` + `' + id + '` + `')"`, '');
    }
    modifiedCount++;
  }

  result.push(line);
}

// ═══════════════════════════════════════════════════════
// STEP 3: Verify integrity
// ═══════════════════════════════════════════════════════
const output = result.join('\n');

// Check that kept elements still exist
const keepChecks = [
  'id="section-main"',
  'id="section-my"',
  'id="section-client"',
  'id="section-last"',
  'id="section-manage"',
  'id="generalNavBar"',
  'searchNav-main',
  'searchNav-my',
  'searchNav-client',
  'searchNav-last',
  'searchNav-manage',
  'function showSearchSection',
  'function renderManageSection',
  'function renderClientGrid',
  'function populateClientSelect',
  'function filterClientList',
  'function getMyClients',
  'var customerDB',
  'function performSearch',
  'var mockListings',
  'function showAgentSection',
  'function editCommissionRow',
  'function showMarketingSubTab',
  'LOGGED_IN_AGENT',
  'AGENT_PROFILE',
];

// Check that deleted elements are gone
const deleteChecks = [
  'id="customerNavBar"',
  'id="section-customer"',
  'id="customers" class="tab-content',
  'id="analytics-master"',
  'id="mortgage-rates"',
  'id="calculator" class="tab-content',
  'function enterCustomerMode',
  'function exitCustomerMode',
  'function showCustomerTab',
  'function toggleCustomerSwitcher',
  'function runSearchForCustomer',
  'function returnToCustomerMode',
  'activeCustomerId',
];

console.log('\n--- KEEP CHECKS ---');
let keepFails = 0;
for (const check of keepChecks) {
  if (output.includes(check)) {
    console.log('  OK: ' + check);
  } else {
    console.log('  FAIL: ' + check + ' — NOT FOUND!');
    keepFails++;
  }
}

console.log('\n--- DELETE CHECKS ---');
let deleteFails = 0;
for (const check of deleteChecks) {
  if (!output.includes(check)) {
    console.log('  OK: ' + check + ' — removed');
  } else {
    console.log('  FAIL: ' + check + ' — STILL PRESENT!');
    deleteFails++;
  }
}

// Check enterCustomerMode not in renderClientGrid
if (output.includes("enterCustomerMode")) {
  console.log('\n  WARNING: enterCustomerMode still found in output');
} else {
  console.log('\n  OK: enterCustomerMode fully removed');
}

console.log('\n--- SUMMARY ---');
console.log('Lines deleted:', deletedCount);
console.log('Lines modified:', modifiedCount);
console.log('New line count:', result.length);
console.log('Keep checks:', keepFails === 0 ? 'ALL PASS' : keepFails + ' FAILED');
console.log('Delete checks:', deleteFails === 0 ? 'ALL PASS' : deleteFails + ' FAILED');

if (keepFails > 0 || deleteFails > 0) {
  console.log('\n*** VERIFICATION FAILED — NOT WRITING FILE ***');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════
// STEP 4: Write output
// ═══════════════════════════════════════════════════════
fs.writeFileSync(filePath, output, 'utf8');
console.log('\nFile written successfully:', filePath);
