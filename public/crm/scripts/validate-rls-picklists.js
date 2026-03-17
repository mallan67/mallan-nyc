#!/usr/bin/env node
/**
 * RLS Picklist Validator
 *
 * Cross-references ALL picklist values used in HTML files
 * against the REBNY RLS lookup CSV (source of truth).
 *
 * Run: node scripts/validate-rls-picklists.js
 */

const fs = require('fs');
const path = require('path');

// ── Load RLS Lookup CSV ──────────────────────────────────────
const CSV_PATH = path.join(__dirname, '..', '..', '..', '..', 'mallan-nyc', 'data', 'rebny-rls-property-lookup.csv');
const csv = fs.readFileSync(CSV_PATH, 'utf-8');

// Parse: extract field name → Set of allowed values
const rlsLookup = {};
csv.split('\n').forEach(line => {
    // CSV format: ,Property,FieldName,Value,,LookupName,LookupValue,...
    const parts = line.split(',');
    if (parts.length < 4 || parts[1] !== 'Property') return;
    const field = parts[2].trim();
    const value = parts[3].trim();
    if (!field || !value) return;
    if (!rlsLookup[field]) rlsLookup[field] = new Set();
    rlsLookup[field].add(value);
});

console.log('=== REBNY RLS PICKLIST VALIDATOR ===\n');
console.log(`Loaded ${Object.keys(rlsLookup).length} RLS picklist fields from CSV\n`);

// ── Fields to validate ───────────────────────────────────────
const FIELDS_TO_CHECK = [
    'CommonInterest',
    'AttendanceType',
    'PetsAllowed',
    'BuildingPetsAllowed',
    'StructureType',
    'BuildingLaundryFeatures',
    'PropertySubType',
    'MlsStatus',
    'Flooring',
    'Heating',
    'Cooling',
    'LaundryFeatures',
    'ParkingFeatures',
    'SecurityFeatures',
    'Exposures',
    'View',
    'Concessions',
    'ListingAgreement',
    'PropertyCondition',
    'PropertyType',
    'InteriorFeatures'
];

// Fields where radio/input values are CRM-internal (mapped to RLS via JS functions, not direct RLS values)
// These are excluded from name= value= checks AND JS mapping checks
// PropertyType: CRM radios use internal names (Condo/Coop/Loft) → mapped to RLS by buildRLSPropertyTypeData()
// PropertyType also includes 'Commercial'/'Land' which are RESO/Trestle values not in REBNY RLS CSV
// (REBNY RLS only lists Residential + ResidentialLease — commercial doesn't go through RLS)
const CRM_MAPPED_FIELDS = ['PropertyType'];

// Print RLS values for each field
console.log('─── RLS SOURCE OF TRUTH ───────────────────────────\n');
FIELDS_TO_CHECK.forEach(field => {
    const vals = rlsLookup[field];
    if (vals) {
        console.log(`${field} (${vals.size} values):`);
        [...vals].sort().forEach(v => console.log(`  ✓ ${v}`));
        console.log('');
    } else {
        console.log(`${field}: NOT IN RLS CSV (Trestle-only or RESO-only)\n`);
    }
});

// ── Scan HTML files ──────────────────────────────────────────
const HTML_DIR = path.join(__dirname, '..');
const HTML_FILES = [
    'SALE-FORM-REDESIGN.html',
    'RENTAL-FORM-REDESIGN.html',
    'SALE-FORM-WITH-TOOLS.html',
    'RENTAL-FORM-WITH-TOOLS.html',
    // CRM entry removed — dashboard.html is modular (no inline picklists)
    'index-built.html'
];

let totalErrors = 0;
let totalWarnings = 0;

console.log('\n─── FILE-BY-FILE AUDIT ────────────────────────────\n');

HTML_FILES.forEach(filename => {
    const filepath = path.join(HTML_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`SKIP: ${filename} (not found)`);
        return;
    }
    const html = fs.readFileSync(filepath, 'utf-8');
    const lines = html.split('\n');
    let fileErrors = 0;
    let fileWarnings = 0;

    console.log(`\n╔══ ${filename} ══╗\n`);

    // 1. Check value= attributes in checkboxes/selects for RLS fields
    FIELDS_TO_CHECK.forEach(field => {
        const rlsVals = rlsLookup[field];
        if (!rlsVals) return;
        const isCrmMapped = CRM_MAPPED_FIELDS.includes(field);

        // Find checkbox values for this field
        // Pattern: name="*FieldName" value="X" or name that contains the field name
        const fieldPatterns = [
            field,
            'sale' + field,
            'rental' + field,
            'sale' + field.charAt(0).toUpperCase() + field.slice(1),
            'rental' + field.charAt(0).toUpperCase() + field.slice(1)
        ];

        // Skip name/value checks for CRM-mapped fields (radio values are internal, not RLS values)
        if (!isCrmMapped) {
            lines.forEach((line, idx) => {
                fieldPatterns.forEach(pat => {
                    // Check: name="<pattern>" value="X"
                    const nameMatch = line.match(new RegExp(`name="${pat}"\\s+value="([^"]+)"`, 'i'));
                    if (nameMatch) {
                        const val = nameMatch[1];
                        if (!rlsVals.has(val) && val !== '' && val !== 'Select...') {
                            console.log(`  ERROR L${idx + 1}: name="${pat}" value="${val}" — NOT in RLS ${field} picklist`);
                            fileErrors++;
                        }
                    }

                    // Check: id="<pattern>" with option values
                    if (line.includes(`id="${pat}"`) && line.includes('<select')) {
                        for (let j = idx; j < Math.min(idx + 20, lines.length); j++) {
                            const optMatch = lines[j].match(/<option\s+value="([^"]+)"/g);
                            if (optMatch) {
                                optMatch.forEach(m => {
                                    const val = m.match(/value="([^"]+)"/)[1];
                                    if (val && val !== '' && !rlsVals.has(val)) {
                                        console.log(`  ERROR L${j + 1}: <option value="${val}"> in ${pat} — NOT in RLS ${field} picklist`);
                                        fileErrors++;
                                    }
                                });
                            }
                            if (lines[j].includes('</select>')) break;
                        }
                    }
                });
            });
        }

        // Check: JS mapping tables that reference this field (skip comments + CRM-mapped fields)
        if (!isCrmMapped) {
            const jsPattern = new RegExp(`${field}:\\s*['"]([^'"]+)['"]`, 'g');
            let jsMatch;
            while ((jsMatch = jsPattern.exec(html)) !== null) {
                const val = jsMatch[1];
                if (!rlsVals.has(val)) {
                    const pos = jsMatch.index;
                    const lineNum = html.substring(0, pos).split('\n').length;
                    const lineText = lines[lineNum - 1] || '';
                    if (lineText.trimStart().startsWith('//') || lineText.trimStart().startsWith('*') || lineText.includes('<!--')) continue;
                    console.log(`  ERROR L${lineNum}: JS mapping ${field}: '${val}' — NOT in RLS picklist`);
                    fileErrors++;
                }
            }
        }
    });

    // 2. Check mock data arrays for RLS field values
    const mockArrayPattern = /(AttendanceType|PetsAllowed|BuildingPetsAllowed|StructureType):\s*\[([^\]]+)\]/g;
    let mockMatch;
    while ((mockMatch = mockArrayPattern.exec(html)) !== null) {
        const field = mockMatch[1];
        const valStr = mockMatch[2];
        const rlsVals = rlsLookup[field];
        if (!rlsVals) continue;
        const values = valStr.match(/'([^']+)'/g);
        if (values) {
            values.forEach(v => {
                const val = v.replace(/'/g, '');
                if (!rlsVals.has(val)) {
                    const pos = mockMatch.index;
                    const lineNum = html.substring(0, pos).split('\n').length;
                    console.log(`  ERROR ~L${lineNum}: Mock data ${field} value '${val}' — NOT in RLS picklist`);
                    fileErrors++;
                }
            });
        }
    }

    // 3. Check for CommonInterest dropdown completeness
    const ciSelect = html.match(/id="(sale|rental)CommonInterest"/);
    if (ciSelect) {
        const rlsCI = rlsLookup['CommonInterest'];
        if (rlsCI) {
            const selectStart = html.indexOf(ciSelect[0]);
            const selectEnd = html.indexOf('</select>', selectStart);
            const selectHTML = html.substring(selectStart, selectEnd);
            rlsCI.forEach(val => {
                if (!selectHTML.includes(`value="${val}"`)) {
                    console.log(`  WARNING: CommonInterest dropdown MISSING RLS value "${val}"`);
                    fileWarnings++;
                }
            });
        }
    }

    // 4. Check for AttendanceType checkbox completeness
    const atGroup = html.match(/id="(sale|rental)AttendanceTypeGroup"/);
    if (atGroup) {
        const rlsAT = rlsLookup['AttendanceType'];
        if (rlsAT) {
            const groupStart = html.indexOf(atGroup[0]);
            const groupEnd = html.indexOf('</div>', groupStart + 100);
            const groupHTML = html.substring(groupStart, Math.min(groupStart + 5000, html.length));
            rlsAT.forEach(val => {
                if (!groupHTML.includes(`value="${val}"`)) {
                    console.log(`  WARNING: AttendanceType group MISSING RLS value "${val}"`);
                    fileWarnings++;
                }
            });
        }
    }

    // 5. Check for BuildingPetsAllowed checkbox completeness
    const bpaGroup = html.match(/id="(sale|rental)BuildingPetsAllowedGroup"/);
    if (bpaGroup) {
        const rlsBPA = rlsLookup['BuildingPetsAllowed'];
        if (rlsBPA) {
            const groupStart = html.indexOf(bpaGroup[0]);
            const groupHTML = html.substring(groupStart, Math.min(groupStart + 3000, html.length));
            rlsBPA.forEach(val => {
                if (!groupHTML.includes(`value="${val}"`)) {
                    console.log(`  WARNING: BuildingPetsAllowed group MISSING RLS value "${val}"`);
                    fileWarnings++;
                }
            });
        }
    }

    // 6. Check for PetsAllowed checkbox completeness
    const paGroup = html.match(/id="(sale|rental)PetsAllowedGroup"/);
    if (paGroup) {
        const rlsPA = rlsLookup['PetsAllowed'];
        if (rlsPA) {
            const groupStart = html.indexOf(paGroup[0]);
            const groupHTML = html.substring(groupStart, Math.min(groupStart + 3000, html.length));
            rlsPA.forEach(val => {
                if (!groupHTML.includes(`value="${val}"`)) {
                    console.log(`  WARNING: PetsAllowed group MISSING RLS value "${val}"`);
                    fileWarnings++;
                }
            });
        }
    }

    if (fileErrors === 0 && fileWarnings === 0) {
        console.log(`  ✓ All RLS picklist values verified`);
    }
    console.log(`  Summary: ${fileErrors} errors, ${fileWarnings} warnings\n`);
    totalErrors += fileErrors;
    totalWarnings += fileWarnings;
});

console.log('\n═══════════════════════════════════════════════════');
console.log(`TOTAL: ${totalErrors} ERRORS, ${totalWarnings} WARNINGS`);
console.log('═══════════════════════════════════════════════════');
if (totalErrors > 0) {
    console.log('\nERRORS = values used in code that do NOT exist in the RLS CSV');
    console.log('These WILL FAIL RLS validation and MUST be fixed.');
}
if (totalWarnings > 0) {
    console.log('\nWARNINGS = RLS values that exist but are MISSING from the form');
    console.log('These should be added for completeness.');
}
process.exit(totalErrors > 0 ? 1 : 0);
