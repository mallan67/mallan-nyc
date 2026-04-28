#!/usr/bin/env tsx
// Mark every advanced-search filter input in public/crm/index-built.html as
// `data-rls-ignore="true"` with a "UI-only filter" reason. These inputs are
// search controls (ranges, geo bounds, keyword search) that translate into
// compound OData filters at runtime — they do NOT map 1:1 to a Trestle field
// and therefore should not be flagged as UNKNOWN by the RLS validator.

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'public/crm/index-built.html');

// IDs reported by `npm run rls:validate` as UNKNOWN. Source:
// validation output 2026-04-27.
const UI_ONLY_IDS = [
  // Custom price-range inputs (translate to ge/le compound filters)
  'saleMinPriceCustom', 'saleMaxPriceCustom',
  'rentalMinRentCustom', 'rentalMaxRentCustom',
  'advSaleMinPrice', 'advSaleMaxPrice',
  'advSaleMinPriceCustom', 'advSaleMaxPriceCustom',
  'advRentalMinRent', 'advRentalMaxRent',
  'advRentalMinRentCustom', 'advRentalMaxRentCustom',

  // Building search — building-context fields (no per-listing Trestle binding)
  'bldg-grid-north', 'bldg-grid-west', 'bldg-grid-east', 'bldg-grid-south',
  'buildingFinancingMin', 'buildingFinancingMax',
  'buildingKeywordSearch', 'buildingManagementCompany',
  'adv-building-name',
  'adv-bldg-units-min', 'adv-bldg-units-max',

  // Free-text + ID search inputs (post-filter / UI-only)
  'adv-rls-id', 'adv-zip', 'adv-keyword', 'adv-management',

  // Geographic bounds (UI-only)
  'adv-grid-north', 'adv-grid-south', 'adv-grid-west', 'adv-grid-east',

  // Numeric range filters
  'adv-min-expenses', 'adv-max-expenses',
  'adv-min-net-rent', 'adv-max-net-rent',
  'adv-min-beds', 'adv-max-beds',
  'adv-min-baths', 'adv-max-baths',
  'adv-min-rooms', 'adv-max-rooms',
  'adv-min-sqft', 'adv-max-sqft',
  'adv-tax-min', 'adv-tax-max',
  'adv-monthly-min', 'adv-monthly-max',
  'adv-ceiling-min', 'adv-ceiling-max',
  'adv-floor-min', 'adv-floor-max',
  'adv-floors-min', 'adv-floors-max',
  'adv-dom-min', 'adv-dom-max',
  'adv-cdom-min', 'adv-cdom-max',
  'adv-financing',
  'adv-year-built-from', 'adv-year-built-to',

  // Date range filters
  'adv-listed-from', 'adv-listed-to',
  'adv-updated-from', 'adv-updated-to',
  'adv-contract-from', 'adv-contract-to',
  'adv-lease-signed-from', 'adv-lease-signed-to',
  'adv-sold-from', 'adv-sold-to',
  'adv-rented-from', 'adv-rented-to',
  'adv-expired-from', 'adv-expired-to',
  'adv-hold-from', 'adv-hold-to',

  // Comp tool inputs (CRM-internal, not RLS-bound)
  'compPropertyAddress', 'compBuildingAddress',
  'compBuildingMinPrice', 'compBuildingMaxPrice',
  'compBuildingMinBeds', 'compBuildingMaxBeds',
  'compBuildingMinBaths', 'compBuildingMaxBaths',
  'compBuildingMinSqft', 'compBuildingMaxSqft',
  'compGeneralMinPrice', 'compGeneralMaxPrice',
  'compGeneralMinBeds', 'compGeneralMinBaths',
  'compGeneralMinSqft', 'compGeneralMaxSqft',

  // Saved-search internal CRM controls
  'savedSearchClientId', 'savedSearchAlertFreq',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

let html = fs.readFileSync(FILE, 'utf-8');
const before = html;

let edits = 0;
const skipped: string[] = [];

for (const id of UI_ONLY_IDS) {
  // Find an opening <input|<select|<textarea ... id="<ID>" ... > on a single
  // line, that does NOT already have data-rls-ignore. Add it immediately after
  // the id attribute. Use a non-greedy match on the tag.
  const re = new RegExp(
    `(<(?:input|select|textarea)\\b[^>]*?\\bid\\s*=\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")` +
      `(?![^>]*data-rls-ignore)([^>]*?)(\\/?>)`,
    'g'
  );
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) {
    skipped.push(id);
    continue;
  }
  html = html.replace(re, (_full, p1, p2, p3) => {
    edits++;
    return `${p1} data-rls-ignore="true" data-ui-only-filter="true"${p2}${p3}`;
  });
}

if (!dryRun && html !== before) {
  fs.writeFileSync(FILE, html, 'utf-8');
}

console.log(`Edits applied: ${edits}${dryRun ? ' (dry-run)' : ''}`);
console.log(`Skipped (id not found in HTML): ${skipped.length}`);
if (skipped.length > 0) for (const s of skipped) console.log(`   - ${s}`);
