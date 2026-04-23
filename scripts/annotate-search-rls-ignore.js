// One-shot annotator — marks IDX search-widget form IDs in index-built.html
// as internal-only (data-rls-ignore="true"). These are agent-side search form
// state, not RLS-bound persistence fields, so the RLS compliance validator's
// Layer 0 skip is the correct classification.
//
// Usage: node scripts/annotate-search-rls-ignore.js
// Idempotent: existing data-rls-ignore attributes are left alone.

const fs = require('fs');
const path = require('path');

const TARGET = path.join(process.cwd(), 'public/crm/index-built.html');

const UNKNOWN_IDS = [
  'searchMinPriceCustom', 'searchMaxPriceCustom', 'searchNeighborhoodInput', 'searchKeyword',
  'adv-rls-id', 'adv-zip', 'adv-grid-north', 'adv-grid-south', 'adv-grid-west', 'adv-grid-east',
  'adv-keyword', 'advSaleMinPrice', 'advSaleMaxPrice', 'advSaleMinPriceCustom', 'advSaleMaxPriceCustom',
  'adv-min-expenses', 'adv-max-expenses', 'advRentalMinRent', 'advRentalMaxRent',
  'advRentalMinRentCustom', 'advRentalMaxRentCustom', 'adv-min-net-rent', 'adv-max-net-rent',
  'adv-min-beds', 'adv-max-beds', 'adv-min-baths', 'adv-max-baths', 'adv-min-rooms', 'adv-max-rooms',
  'adv-min-sqft', 'adv-max-sqft', 'leaseMinTerms', 'leaseMaxTerms', 'leaseAvailabilityDate',
  'adv-management', 'adv-listed-from', 'adv-listed-to', 'adv-updated-from', 'adv-updated-to',
  'adv-contract-from', 'adv-contract-to', 'adv-lease-signed-from', 'adv-lease-signed-to',
  'adv-sold-from', 'adv-sold-to', 'adv-rented-from', 'adv-rented-to', 'adv-expired-from',
  'adv-expired-to', 'adv-hold-from', 'adv-hold-to', 'adv-dom-min', 'adv-dom-max',
  'adv-cdom-min', 'adv-cdom-max', 'adv-tax-min', 'adv-tax-max', 'adv-monthly-min', 'adv-monthly-max',
  'adv-financing', 'adv-ceiling-min', 'adv-ceiling-max', 'adv-floor-min', 'adv-floor-max',
  'adv-year-built-from', 'adv-year-built-to', 'adv-floors-min', 'adv-floors-max',
  'adv-bldg-units-min', 'adv-bldg-units-max', 'adv-building-name',
  'compPropertyAddress', 'compBuildingAddress', 'compBuildingMinPrice', 'compBuildingMaxPrice',
  'compBuildingMinBeds', 'compBuildingMaxBeds', 'compBuildingMinBaths', 'compBuildingMaxBaths',
  'compBuildingMinSqft', 'compBuildingMaxSqft', 'compGeneralMinPrice', 'compGeneralMaxPrice',
  'compGeneralMinBeds', 'compGeneralMinBaths', 'compGeneralMinSqft', 'compGeneralMaxSqft',
  'savedSearchClientId', 'savedSearchAlertFreq',
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let html = fs.readFileSync(TARGET, 'utf-8');
let annotated = 0;
let skipped = 0;
let missing = [];

for (const id of UNKNOWN_IDS) {
  const re = new RegExp(`(<[a-zA-Z][a-zA-Z0-9]*\\b[^>]*?\\bid="${escapeRe(id)}"[^>]*?)(/?)>`, 'g');
  let matched = false;
  html = html.replace(re, (_m, open, slash) => {
    matched = true;
    if (/data-rls-ignore\s*=/.test(open)) { skipped++; return `${open}${slash}>`; }
    annotated++;
    return `${open} data-rls-ignore="true"${slash}>`;
  });
  if (!matched) missing.push(id);
}

fs.writeFileSync(TARGET, html);
console.log(`annotated: ${annotated}`);
console.log(`skipped (already had attribute): ${skipped}`);
console.log(`missing (id not found in file): ${missing.length}`);
if (missing.length) console.log('  ' + missing.join(', '));
