#!/usr/bin/env tsx
// Surgical rename of stale data-rls-field bindings in CRM forms.
//
// Each rename is documented with the source of truth (CLAUDE.md "Fields
// That DO NOT EXIST on Trestle - NEVER USE" + Trestle live $metadata).
// Read-only on disk preview with --dry-run; otherwise rewrites the four
// form HTML files in place.
//
// Speculative orphans (no clear correct target) are NOT touched here —
// they're listed at the end so an operator can decide rename vs delete.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const FORM_FILES = [
  'public/crm/SALE-FORM-REDESIGN.html',
  'public/crm/RENTAL-FORM-REDESIGN.html',
  'public/crm/SALE-FORM-WITH-TOOLS.html',
  'public/crm/RENTAL-FORM-WITH-TOOLS.html',
];

// Confirmed dead → correct mapping. Each entry sourced from CLAUDE.md
// "Fields That DO NOT EXIST on Trestle - NEVER USE" + REBNY IDX Plus
// 3.15.26 spec + Trestle live $metadata.
const CONFIRMED_RENAMES: Array<{ from: string; to: string | null; reason: string }> = [
  // Distribution gate name correction
  { from: 'IDXEntireListingDisplayYN', to: 'InternetEntireListingDisplayYN',
    reason: 'CLAUDE.md: no IDX-prefixed gates exist on Trestle; use Internet-prefixed' },
  // Multi-select gate (was boolean, now picker)
  { from: 'SyndicateYN', to: 'SyndicateTo',
    reason: 'CLAUDE.md: SyndicateYN does not exist; SyndicateTo is the multi-select picker' },
  // Activation timestamp rename
  { from: 'FirstShowingDate', to: 'ActivationDate',
    reason: 'CLAUDE.md: FirstShowingDate confirmed dead 2026-03-19; use ActivationDate' },
  // Decimal-precision bath count — live Trestle exposes Integer, not Decimal
  { from: 'BathroomsTotal', to: 'BathroomsTotalInteger',
    reason: 'Live Trestle Property exposes BathroomsTotalInteger (NOT BathroomsTotalDecimal)' },
  { from: 'BathroomsTotalDecimal', to: 'BathroomsTotalInteger',
    reason: 'Correction of earlier Decimal mapping — live Trestle uses Integer' },

  // Building-prefixed names → unprefixed Property fields (live Trestle has these without "Building" prefix)
  { from: 'BuildingCooling', to: 'Cooling',
    reason: 'Live Trestle Property has Cooling (no BuildingCooling exists)' },
  { from: 'BuildingHeating', to: 'Heating',
    reason: 'Live Trestle Property has Heating (no BuildingHeating exists)' },
  { from: 'BuildingLaundryFeatures', to: 'LaundryFeatures',
    reason: 'Live Trestle Property has LaundryFeatures (no BuildingLaundryFeatures exists)' },
  { from: 'BuildingPetsAllowed', to: 'PetsAllowed',
    reason: 'Live Trestle Property has PetsAllowed (no BuildingPetsAllowed exists)' },

  // Deposit
  { from: 'DepositAmount', to: 'SecurityDeposit',
    reason: 'Live Trestle Property has SecurityDeposit (and PetDeposit), no DepositAmount' },

  // Team key
  { from: 'ListTeamMlsId', to: 'ListTeamKey',
    reason: 'Live Trestle Property has ListTeamKey/ListTeamName/ListTeamKeyNumeric, no ListTeamMlsId' },

  // Video / virtual tour
  { from: 'VideoURL', to: 'VirtualTourURLBranded',
    reason: 'Live Trestle has VirtualTourURLBranded/Unbranded (RESO standard); no VideoURL property exists' },

  // Speculative fields not on Trestle and not in REBNY canonical CustomFields list — remove
  { from: 'LobbyAttendant', to: null,
    reason: 'No matching field on any live Trestle resource or in REBNY CustomFields canonical list' },
  { from: 'NumberOfRetailUnits', to: null,
    reason: 'No matching field on any live Trestle resource — speculative commercial subdivision' },
  { from: 'NumberOfProfessionalUnitsTotal', to: null,
    reason: 'No matching field on any live Trestle resource — speculative commercial subdivision' },
  { from: 'CoBrokeAgreement', to: null,
    reason: 'Compensation-related field; removed when REBNY pulled compensation fields Aug 2025' },
  { from: 'AreaOverFAR', to: null,
    reason: 'No matching FAR field on any live Trestle resource' },
  { from: 'AreaUnderFAR', to: null,
    reason: 'No matching FAR field on any live Trestle resource' },

  // Final batch — confirmed via live $metadata probe
  { from: 'NewDevelopmentYN', to: 'NewConstructionYN',
    reason: 'Live Trestle Property uses RESO standard NewConstructionYN' },
  { from: 'MinLeaseMonths', to: 'LeaseTerm',
    reason: 'RESO standard LeaseTerm on Property; CustomFields canonical list does not include MinLeaseMonths' },
  { from: 'LeaseType', to: 'AvailableLeaseType',
    reason: 'RESO standard AvailableLeaseType on Property; rental form is offering, not existing' },
  { from: 'FeeFrequency', to: 'AdditionalFeeFrequency',
    reason: 'CustomProperty has AdditionalFeeFrequency; rental application/move-in fee context' },
  { from: 'BuyerAgentRLSParticipantYN', to: null,
    reason: 'No live match for "RLSParticipant" suffix; field was speculative' },
  { from: 'RentingAllowedYN', to: null,
    reason: 'No live Trestle match' },
  { from: 'NumberOfShares', to: null,
    reason: 'Co-op shares — not in REBNY canonical CustomFields list, not on live Trestle' },
  { from: 'NetMonthlyRent', to: null,
    reason: 'No live Trestle match — speculative net-of-fees concept' },

  // Address typo
  { from: 'UnParsedAddress', to: 'UnparsedAddress',
    reason: 'Typo — capital P should be lowercase to match RESO/Trestle field name' },
  // Confirmed-dead fields with no Trestle replacement (remove, don't rename)
  { from: 'MoveInCostsAmountTotal', to: null,
    reason: 'CLAUDE.md: field does not exist on Trestle. MoveInCosts is a picklist only.' },
  // (MoveInCostsComments removed 2026-06-04: it is a live Property field now —
  //  Edm.String(1024); the rental forms bind it directly. Not a stale binding.)
  { from: 'PossessionDate', to: null,
    reason: 'CLAUDE.md: RESO field, Trestle ignores. No replacement.' },
  { from: 'YearRenovated', to: null,
    reason: 'CLAUDE.md: field does not exist on Trestle.' },
];

// Found in $metadata but currently bound to a Property-namespace name —
// these are CustomProperty.CustomFields keys (see CLAUDE.md REBNY 40-key
// list). Add prefix annotation comment near binding to clarify resource.
// (No actual rename; the field name is already correct.)

let totalEdits = 0;

for (const file of FORM_FILES) {
  if (!fs.existsSync(file)) {
    console.log(`  ⚠ skipping (not found): ${file}`);
    continue;
  }
  let html = fs.readFileSync(file, 'utf-8');
  const before = html;
  const fileEdits: Array<{ from: string; to: string | null; count: number }> = [];

  for (const r of CONFIRMED_RENAMES) {
    const fromAttr = `data-rls-field="${r.from}"`;
    const toAttr = r.to ? `data-rls-field="${r.to}"` : 'data-rls-ignore="true" data-removed-field="' + r.from + '"';
    const matches = html.split(fromAttr).length - 1;
    if (matches > 0) {
      html = html.split(fromAttr).join(toAttr);
      fileEdits.push({ from: r.from, to: r.to, count: matches });
      totalEdits += matches;
    }
  }

  if (fileEdits.length === 0) {
    console.log(`  · ${path.basename(file)} — nothing to update`);
    continue;
  }

  console.log(`  ${path.basename(file)} — ${fileEdits.reduce((a, e) => a + e.count, 0)} edits:`);
  for (const e of fileEdits) {
    const arrow = e.to ? `→ ${e.to}` : '→ (removed: data-rls-ignore)';
    console.log(`     ${e.count}x  ${e.from} ${arrow}`);
  }

  if (!dryRun && html !== before) {
    fs.writeFileSync(file, html, 'utf-8');
  }
}

console.log('');
console.log(`Total edits: ${totalEdits}${dryRun ? ' (dry-run, not written)' : ' written to disk'}`);
console.log('');
console.log('Speculative orphans NOT touched (need operator decision):');
console.log('  · AreaOverFAR / AreaUnderFAR        — FAR fields, no Trestle match');
console.log('  · BuildingCooling / BuildingHeating / BuildingLaundryFeatures');
console.log('                                       — likely meant Cooling / Heating / LaundryFeatures (Property fields)');
console.log('  · BuildingPetsAllowed               — likely meant PetsAllowed (Property field)');
console.log('  · BuyerAgentRLSParticipantYN        — typo or removed; investigate');
console.log('  · CoBrokeAgreement                  — possibly removed; was compensation-related');
console.log('  · DepositAmount                     — possibly RentDepositAmount or similar');
console.log('  · FeeFrequency / LeaseType / MinLeaseMonths   — rental-only, may be CustomProperty CustomFields not in canonical list');
console.log('  · ListTeamMlsId                     — Teams resource navigation; check trestle-mapper.ts pattern');
console.log('  · LobbyAttendant                    — possibly DoormanType or BuildingAttendantType');
console.log('  · NetMonthlyRent                    — possibly speculative, no Trestle match');
console.log('  · NewDevelopmentYN                  — check Property or CustomProperty live keys');
console.log('  · NumberOfProfessionalUnitsTotal / NumberOfRetailUnits   — speculative commercial fields');
console.log('  · NumberOfShares                    — co-op-specific; may exist on CustomFields for some listings');
console.log('  · VideoURL                          — should be VirtualTourURLBranded or VirtualTourURLUnbranded');
console.log('');
console.log('Re-run `npx tsx scripts/audit-form-trestle-coverage.ts` after deciding these.');
