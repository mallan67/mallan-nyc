#!/usr/bin/env node
/**
 * Extract Rental Listing Form from CRM mockup into standalone HTML.
 *
 * Reads MALLAN-NYC-CRM-FINAL2.html and produces RENTAL-FORM-STANDALONE.html
 * with all rental form HTML + all required JS functions.
 */

const fs = require('fs');
const path = require('path');

const MOCKUP = path.join(__dirname, '..', '..', '1', 'Old', 'MALLAN-NYC-CRM-FINAL2.html');
const OUTPUT = path.join(__dirname, '..', '..', '1', 'Old', 'RENTAL-FORM-STANDALONE.html');

console.log('Reading mockup:', MOCKUP);
const lines = fs.readFileSync(MOCKUP, 'utf8').split('\n');
console.log(`Total lines: ${lines.length}`);

// Helper: extract lines (1-indexed, inclusive)
function extract(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// ──────────────────────────────────────────────
// 1) RENTAL FORM HTML (lines 13069-16984)
// ──────────────────────────────────────────────
const rentalHTML = extract(13069, 16984);
console.log(`Rental HTML: ${rentalHTML.split('\n').length} lines`);

// ──────────────────────────────────────────────
// 2) JAVASCRIPT FUNCTIONS — find boundaries
//    Strategy: for each function start line, find its closing brace
// ──────────────────────────────────────────────

// We'll extract large contiguous blocks to avoid missing anything.
// Based on grep results, the JS sections are:
//
// Block A: 35154 - 35700  (rental nav, handlers, media, building, TH financials, validation, fees, etc.)
// Block B: 35700 - 36100  (collectRentalFormData, submitRentalListing continuation)
// Block C: 36907 - 37400  (populateRebnyCompanyDropdowns + REBNY agent/company data)
// Block D: 37385 - 37900  (buildingDatabase, normalizeAddress, search, select, updateListingHeaderBar, navigateNext, navigateBack)
// Block E: 38234 - 38280  (applyCommercialDistribution, clearCommercialDistribution)
// Block F: 38334 - 38340  (toggleFormSection)
// Block G: 38407 - 38670  (selectRentalCommercial, RENTAL_FIELD_VISIBILITY_RULES, toggleRentalCommercialOwnership, applyRentalFieldRules, updateRentalStatusFields)
// Block H: 38674 - 39960  (autoSave, performAutoSave, manualSaveDraft, REBNY_ACTIVE_STATUSES, RENTAL_REQUIRED_FIELDS_LIST, updateRentalValidationSummary, validateREBNYRequired, validateStatusChange, checkFairHousing, scanDescriptionCompliance, setupDisplayCascade, getResoPropertyFields, getResoMlsStatus, updateRentalAgentList, populateRentalAgentInfo, toggleFurnishedFields)
// Block I: 43457 - ~43471 (handleRentalListingTypeChangeEnhanced)
// DOMContentLoaded: need to find it

// Find the DOMContentLoaded handler that initializes the rental form
let domReadyStart = -1;
let domReadyEnd = -1;
for (let i = 39960; i < lines.length; i++) {
  if (lines[i].includes('DOMContentLoaded') && (lines[i].includes('rental') || lines[i].includes('Rental') || i > 40000)) {
    domReadyStart = i + 1; // 1-indexed
    break;
  }
}

// Actually let's find ALL DOMContentLoaded handlers
const domReadyLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('DOMContentLoaded')) {
    domReadyLines.push(i + 1);
  }
}
console.log('DOMContentLoaded handlers at lines:', domReadyLines);

// Let's be more precise with the function blocks.
// We'll extract contiguous ranges that cover all needed functions.

// Find function boundaries more precisely
function findFunctionEnd(startLine) {
  // startLine is 1-indexed
  let depth = 0;
  let started = false;
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') { depth--; }
    }
    if (started && depth === 0) return i + 1; // 1-indexed
  }
  return startLine + 50; // fallback
}

// Extract JS blocks with exact boundaries
// Block A: Rental core functions 35154-35698
const blockA_start = 35154;
const blockA_end_fn = findFunctionEnd(35615); // submitRentalListing is the last function that starts before collectRentalFormData
console.log(`Block A (rental nav/handlers): ${blockA_start}-${blockA_end_fn}`);

// Block B: collectRentalFormData 35699 - end of it
const blockB_start = 35699;
const blockB_end = findFunctionEnd(35699);
console.log(`Block B (collectRentalFormData): ${blockB_start}-${blockB_end}`);

// Block C: populateRebnyCompanyDropdowns + REBNY agent data (36907 - ~37384)
const blockC_start = 36907;
const blockC_end = findFunctionEnd(36907);
console.log(`Block C (REBNY company dropdowns): ${blockC_start}-${blockC_end}`);

// Block D: buildingDatabase + related functions (37385 - 37900+)
const blockD_start = 37385;
// navigateBackToBefore2 starts at 37860, find its end
const blockD_end = findFunctionEnd(37860);
console.log(`Block D (building DB + nav): ${blockD_start}-${blockD_end}`);

// Block E: applyCommercialDistribution + clearCommercialDistribution (38234 - 38280+)
const blockE_start = 38234;
const blockE_end = findFunctionEnd(38259);
console.log(`Block E (commercial distribution): ${blockE_start}-${blockE_end}`);

// Block F: toggleFormSection (38334)
const blockF_start = 38334;
const blockF_end = findFunctionEnd(38334);
console.log(`Block F (toggleFormSection): ${blockF_start}-${blockF_end}`);

// Block G: selectRentalCommercial through updateRentalStatusFields (38407 - 38600+)
const blockG_start = 38407;
const blockG_end = findFunctionEnd(38579); // updateRentalStatusFields starts at 38579, but applyRentalFieldRules at 38601 is also needed
// Actually let's find the end of applyRentalFieldRules
const blockG_end2 = findFunctionEnd(38601);
const blockG_final = Math.max(blockG_end, blockG_end2);
console.log(`Block G (rental commercial/field rules): ${blockG_start}-${blockG_final}`);

// Block H: autoSave through toggleFurnishedFields (38674 - 39960+)
const blockH_start = 38674;
const blockH_end = findFunctionEnd(39848); // toggleFurnishedFields starts at 39848
console.log(`Block H (auto-save/validation/compliance): ${blockH_start}-${blockH_end}`);

// Block I: handleRentalListingTypeChangeEnhanced (43457)
const blockI_start = 43457;
const blockI_end = findFunctionEnd(43457);
console.log(`Block I (handleRentalListingTypeChangeEnhanced): ${blockI_start}-${blockI_end}`);

// Also check for REBNY agent database (appears to be a large const before populateRebnyCompanyDropdowns)
// Let's check what's around line 36907
let agentDBStart = 36907;
// Search backwards from 36907 for the start of the agent data block
for (let i = 36906; i > 36500; i--) {
  if (lines[i].includes('const REBNY_AGENTS') || lines[i].includes('const rebnyAgents') || lines[i].includes('agentDatabase') || lines[i].includes('const REBNY_COMPANIES')) {
    agentDBStart = i + 1;
    break;
  }
}
console.log(`Agent DB starts at: ${agentDBStart}`);

// Also look for the showTab function stub (for Cancel button)
let showTabLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function showTab(') && !lines[i].includes('showRentalMainTab') && !lines[i].includes('showBldgMainTab')) {
    showTabLine = i + 1;
    break;
  }
}
console.log(`showTab at line: ${showTabLine}`);

// Check if there's a DOMContentLoaded for rental specifically
// Look for initialization code
let initBlock = '';
for (const lineNum of domReadyLines) {
  const snippet = extract(lineNum, Math.min(lineNum + 30, lines.length));
  if (snippet.includes('rental') || snippet.includes('Rental')) {
    console.log(`DOMContentLoaded with rental references at line ${lineNum}`);
  }
}

// ──────────────────────────────────────────────
// 3) ASSEMBLE THE FILE
// ──────────────────────────────────────────────

const header = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rental Listing Form - Mallan Real Estate CRM</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
body{font-family:Manrope,sans-serif;}
.form-section-body{transition:all .2s ease;}
.group:hover .group-hover\\:block{display:block;}
.required-highlight{box-shadow:0 0 0 2px rgba(239,68,68,0.3);}
.toast-notification{position:fixed;bottom:20px;right:20px;z-index:9999;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:14px;font-weight:600;animation:slideInRight .3s ease,fadeOut .3s ease 2.7s forwards;}
@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeOut{from{opacity:1}to{opacity:0}}
</style>
</head>
<body class="bg-gray-50 min-h-screen">
<header class="bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between"><div class="flex items-center gap-4"><span class="text-xl font-bold text-gray-900">mallan<span class="text-yellow-600">.nyc</span></span><span class="text-sm text-gray-500">|</span><span class="text-sm font-semibold text-gray-700">Rental Listing Form</span><span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full border border-yellow-300">STANDALONE MOCKUP</span></div><div class="flex items-center gap-3 text-sm text-gray-600"><span><i class="fas fa-user-circle mr-1"></i> Maya Allan</span><span class="text-gray-400">|</span><span>Mallan Real Estate Inc.</span></div></header>
<main class="max-w-screen-xl mx-auto p-4">`;

const footer = `</main>
<div id="toastContainer" class="fixed top-4 right-4 z-50 space-y-2"></div>`;

const scriptClose = `
<!-- IDX FIELD REFERENCE: rentalStreetAddress->ListingAddress.street->StreetName | rentalUnitNumber->ListingAddress.unit->UnitNumber | rentalBorough->ListingAddress.borough | rentalZipCode->ListingAddress.zipCode->PostalCode | rentalMonthlyRent->ListingPrice.price->ListPrice | rentalNetEffectiveRent->ListingPrice.netEffective | rentalSecurityDeposit->ListingPrice.securityDeposit | rentalLeasedRent->ListingPrice.leasedRent->ClosePrice | rentalPropertyType->PropertyInfo.propertyType->PropertyType+CommonInterest+PropertySubType | rentalStatus->ListingInfo.status->MlsStatus | rentalDateListed->ListingInfo.listedDate->OnMarketDate | rentalBedrooms->PropertyInfo.bedrooms->BedroomsTotal | rentalFullBathrooms->PropertyInfo.bathrooms->BathroomsFull | rentalDescription->ListingInfo.description->PublicRemarks | rentalListingAgent->AgentInfo.name->ListAgentFullName | InternetEntireListingDisplayYN->ListingFlags.internetDisplay | InternetAddressDisplayYN->ListingFlags.addressDisplay | IDXEntireListingDisplayYN->ListingFlags.idxDisplay | rentalBldgName->PropertyInfo.buildingName->BuildingName | rentalBldgYearBuilt->PropertyInfo.yearBuilt->YearBuilt | rentalBldgTotalFloors->PropertyInfo.totalFloors->StoriesTotal -->
</body>
</html>`;

// Build JS section
let jsContent = '';

jsContent += '\n// ═══════════════════════════════════════════\n';
jsContent += '// RENTAL LISTING FORM — STANDALONE JAVASCRIPT\n';
jsContent += '// Extracted from MALLAN-NYC-CRM-FINAL2.html\n';
jsContent += '// ═══════════════════════════════════════════\n\n';

// Stub for showTab (Cancel button)
jsContent += '// ═══ STUB: showTab (standalone replacement) ═══\n';
jsContent += 'function showTab(tabName) {\n';
jsContent += '    if (confirm("Discard changes and close this form?")) {\n';
jsContent += '        window.location.reload();\n';
jsContent += '    }\n';
jsContent += '}\n\n';

// Stub for showToast if not in extracted blocks
jsContent += '// ═══ TOAST NOTIFICATION ═══\n';
jsContent += 'function showToast(message, type) {\n';
jsContent += '    type = type || "success";\n';
jsContent += '    var container = document.getElementById("toastContainer");\n';
jsContent += '    if (!container) return;\n';
jsContent += '    var colors = {success:"bg-green-600",error:"bg-red-600",warning:"bg-yellow-600",info:"bg-blue-600"};\n';
jsContent += '    var toast = document.createElement("div");\n';
jsContent += '    toast.className = "px-6 py-3 rounded-lg text-white text-sm font-semibold shadow-lg " + (colors[type]||colors.success);\n';
jsContent += '    toast.textContent = message;\n';
jsContent += '    container.appendChild(toast);\n';
jsContent += '    setTimeout(function(){toast.remove();},3000);\n';
jsContent += '}\n\n';

// Block A: Rental navigation, handlers, media, building, validation, fees
jsContent += '// ═══ RENTAL NAVIGATION, HANDLERS, VALIDATION ═══\n';
jsContent += extract(blockA_start, blockA_end_fn) + '\n\n';

// Block B: collectRentalFormData
jsContent += '// ═══ COLLECT RENTAL FORM DATA ═══\n';
jsContent += extract(blockB_start, blockB_end) + '\n\n';

// Block C: REBNY company dropdowns + agent data
// First check what's between blockB_end and blockC_start for agent data
const agentDataBlock = extract(Math.max(agentDBStart, blockB_end + 1), blockC_end);
jsContent += '// ═══ REBNY AGENT DATABASE & COMPANY DROPDOWNS ═══\n';
jsContent += agentDataBlock + '\n\n';

// Block D: Building database, search, navigation helpers
jsContent += '// ═══ BUILDING DATABASE & SEARCH ═══\n';
jsContent += extract(blockD_start, blockD_end) + '\n\n';

// Block E: Commercial distribution
jsContent += '// ═══ COMMERCIAL DISTRIBUTION ═══\n';
jsContent += extract(blockE_start, blockE_end) + '\n\n';

// Block F: toggleFormSection
jsContent += '// ═══ FORM SECTION TOGGLE ═══\n';
jsContent += extract(blockF_start, blockF_end) + '\n\n';

// Block G: Rental commercial, field visibility rules, field rules, status
jsContent += '// ═══ RENTAL COMMERCIAL, FIELD VISIBILITY, STATUS ═══\n';
jsContent += extract(blockG_start, blockG_final) + '\n\n';

// Block H: Auto-save, validation, Fair Housing, RESO, display cascade, agent list, furnished
jsContent += '// ═══ AUTO-SAVE, VALIDATION, COMPLIANCE, RESO ═══\n';
jsContent += extract(blockH_start, blockH_end) + '\n\n';

// Block I: handleRentalListingTypeChangeEnhanced
jsContent += '// ═══ ENHANCED RENTAL LISTING TYPE CHANGE ═══\n';
jsContent += extract(blockI_start, blockI_end) + '\n\n';

// DOMContentLoaded initialization
jsContent += '// ═══ INITIALIZATION ═══\n';
jsContent += 'document.addEventListener("DOMContentLoaded", function() {\n';
jsContent += '    // Pre-fill dates\n';
jsContent += '    var today = new Date().toISOString().split("T")[0];\n';
jsContent += '    var createDate = document.getElementById("rentalCreateDate");\n';
jsContent += '    if (createDate) createDate.value = today;\n';
jsContent += '    var lastUpdated = document.getElementById("rentalLastUpdatedDate");\n';
jsContent += '    if (lastUpdated) lastUpdated.value = today;\n';
jsContent += '    var dateListed = document.getElementById("rentalDateListed");\n';
jsContent += '    if (dateListed && !dateListed.value) dateListed.value = today;\n';
jsContent += '    var exclusiveStart = document.getElementById("rentalExclusiveStart");\n';
jsContent += '    if (exclusiveStart && !exclusiveStart.value) exclusiveStart.value = today;\n';
jsContent += '    \n';
jsContent += '    // Populate REBNY company dropdowns\n';
jsContent += '    if (typeof populateRebnyCompanyDropdowns === "function") populateRebnyCompanyDropdowns();\n';
jsContent += '    \n';
jsContent += '    // Apply initial field rules\n';
jsContent += '    if (typeof applyRentalFieldRules === "function") applyRentalFieldRules();\n';
jsContent += '    \n';
jsContent += '    // Setup display cascade\n';
jsContent += '    if (typeof setupDisplayCascade === "function") setupDisplayCascade("rental");\n';
jsContent += '    \n';
jsContent += '    // Auto-populate listing URL from address\n';
jsContent += '    var streetAddr = document.getElementById("rentalStreetAddress");\n';
jsContent += '    if (streetAddr) {\n';
jsContent += '        streetAddr.addEventListener("change", function() {\n';
jsContent += '            var urlField = document.getElementById("rentalListingUrl");\n';
jsContent += '            if (urlField && this.value) {\n';
jsContent += '                var unit = document.getElementById("rentalUnitNumber");\n';
jsContent += '                var slug = this.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");\n';
jsContent += '                if (unit && unit.value) slug += "-" + unit.value.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n';
jsContent += '                urlField.value = "https://mallan.nyc/listing/" + slug;\n';
jsContent += '            }\n';
jsContent += '        });\n';
jsContent += '    }\n';
jsContent += '    \n';
jsContent += '    // Auto-save timer (every 60 seconds)\n';
jsContent += '    if (typeof autoSaveDraft === "function") setInterval(function() { autoSaveDraft("rental"); }, 60000);\n';
jsContent += '    \n';
jsContent += '    console.log("Rental Listing Form standalone initialized.");\n';
jsContent += '});\n';

// Assemble final file
const finalHTML = [
  header,
  rentalHTML,
  footer,
  '<script>',
  jsContent,
  '</script>',
  scriptClose
].join('\n');

fs.writeFileSync(OUTPUT, finalHTML, 'utf8');
const outputLines = finalHTML.split('\n').length;
console.log(`\nWrote ${OUTPUT}`);
console.log(`Total lines: ${outputLines}`);
console.log('Done!');
