/// <reference types="jest" />
/**
 * Canonical enum-compliance guard for collectSaleFormData.
 *
 * Codex caught two Herringbone-class bugs on PR #270:
 *   1. Flooring write included "Herringbone" — not in REBNY Flooring enum
 *   2. BuildingFeatures write pushed all 19 amenity LABEL TEXTs (e.g.
 *      "Elevator", "Gym/Fitness Center") — none of which are in REBNY's
 *      BuildingFeatures enum
 *
 * Both fixes:
 *   - Flooring → demoted to Mallan internal (saleFlooring raw key)
 *   - BuildingFeatures → translation table (8 unambiguous label→canonical
 *     mappings; untranslatable labels go to saleBuildingFeaturesInternal)
 *
 * This file is the regression guard. It cross-checks every canonical
 * write in collectSaleFormData against the REBNY normalized registry
 * (data/rebny-rls-property-lookup.csv). If any future PR adds a new
 * canonical write whose form values diverge from the registered enum,
 * CI fails before the bad data ships to production.
 *
 * Specifically:
 *   - BuildingFeatures: translation table covers every amenity label
 *     AND the canonical output is enum-compliant
 *   - All other canonical-array writes (Heating, Cooling, BuildingHeating,
 *     BuildingCooling, PetsAllowed, BuildingPetsAllowed, AttendanceType,
 *     BuildingLaundryFeatures): every form value must match the REBNY
 *     enum exactly
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const LOOKUP_PATH = resolve(__dirname, '../../data/rebny-rls-property-lookup.csv');

const formHtml = readFileSync(FORM_PATH, 'utf8');
const lookupCsv = readFileSync(LOOKUP_PATH, 'utf8');

// ── Helpers ──

/** Extract REBNY enum values for a given canonical field name. */
function rebnyEnum(field: string): Set<string> {
  const values = new Set<string>();
  const re = new RegExp(`,Property,${field},([^,]+),`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(lookupCsv)) !== null) {
    values.add(m[1]);
  }
  return values;
}

/** Extract `value="..."` attributes from all <input> tags with a given `name`. */
function formValuesForName(name: string): string[] {
  const values: string[] = [];
  const re = new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]+)"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(formHtml)) !== null) values.push(m[1]);
  return values;
}

/** Extract translated canonical values from BUILDING_FEATURES_LABEL_TO_CANONICAL. */
function extractBuildingFeaturesMap(): Record<string, string> {
  const start = formHtml.indexOf('var BUILDING_FEATURES_LABEL_TO_CANONICAL = {');
  const end = formHtml.indexOf('};', start);
  const block = formHtml.slice(start, end);
  const out: Record<string, string> = {};
  // Entries can use single or double quotes for the key (e.g. "Children's Playroom")
  const entryRe = /(?:'([^']+)'|"([^"]+)")\s*:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    const key = m[1] ?? m[2];
    out[key] = m[3];
  }
  return out;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Canonical-array writes that match the REBNY enum directly', () => {
  // For these fields, collectSaleFormData pushes `cb.value` directly into
  // `data.<Canonical>`. The value attributes on the inputs must all be
  // present in the REBNY enum, otherwise we ship non-compliant strings.
  const directCanonical: Array<{ formName: string; canonical: string }> = [
    { formName: 'saleHeating', canonical: 'Heating' },
    { formName: 'saleCooling', canonical: 'Cooling' },
    { formName: 'saleBldgHeating', canonical: 'BuildingHeating' },
    { formName: 'saleBldgCooling', canonical: 'BuildingCooling' },
    { formName: 'salePetsAllowed', canonical: 'PetsAllowed' },
    { formName: 'saleBuildingPetsAllowed', canonical: 'BuildingPetsAllowed' },
    { formName: 'saleAttendanceType', canonical: 'AttendanceType' },
    { formName: 'saleBuildingLaundryFeatures', canonical: 'BuildingLaundryFeatures' },
  ];

  it.each(directCanonical.map(({ formName, canonical }) => [formName, canonical]))(
    'every form value for name="%s" exists in REBNY enum "%s"',
    (formName, canonical) => {
      const formVals = formValuesForName(formName);
      expect(formVals.length).toBeGreaterThan(0); // sanity — fields exist
      const enumSet = rebnyEnum(canonical);
      expect(enumSet.size).toBeGreaterThan(0); // sanity — enum loaded
      const nonCompliant = formVals.filter((v) => !enumSet.has(v));
      // If this fires, we're about to ship a Herringbone-class bug — a
      // non-compliant value going into a canonical IDX Plus field.
      expect({ canonical, nonCompliantValues: nonCompliant }).toEqual({
        canonical,
        nonCompliantValues: [],
      });
    },
  );
});

describe('BuildingFeatures translation table — Herringbone-class PR #270 fix', () => {
  const translationMap = extractBuildingFeaturesMap();

  it('translation map exists and has at least one mapping', () => {
    expect(Object.keys(translationMap).length).toBeGreaterThan(0);
  });

  it('every mapped canonical value exists in REBNY BuildingFeatures enum', () => {
    const enumSet = rebnyEnum('BuildingFeatures');
    expect(enumSet.size).toBeGreaterThan(0);
    const nonCompliant = Object.entries(translationMap).filter(([, canonical]) => !enumSet.has(canonical));
    expect({ nonCompliantMappings: nonCompliant }).toEqual({ nonCompliantMappings: [] });
  });

  it('every SALE_BUILDING_FEATURE_IDS amenity label is either translated OR routed to internal', () => {
    // Pull SALE_BUILDING_FEATURE_IDS list.
    const idsBlock = formHtml.match(/var SALE_BUILDING_FEATURE_IDS = \[([\s\S]*?)\];/)?.[1] || '';
    const ids = (idsBlock.match(/'(\w+)'/g) || []).map((s) => s.slice(1, -1));
    expect(ids.length).toBeGreaterThanOrEqual(19);

    // For each id, derive its label text from the HTML.
    const labels: string[] = [];
    for (const id of ids) {
      const re = new RegExp(`<input[^>]*id="${id}"[^>]*>\\s*([^<]+)<`, 'g');
      const m = re.exec(formHtml);
      const label = (m?.[1] || '').trim();
      labels.push(label);
    }

    // The translation map handles SOME labels; the rest go to internal.
    // Both paths are acceptable — what matters is no label gets pushed
    // to canonical BuildingFeatures untranslated. The collector enforces
    // this at runtime; here we verify the contract by asserting every
    // label is reachable (no undefined / empty labels in the inventory).
    const emptyLabels = labels.filter((l) => !l);
    expect(emptyLabels).toEqual([]);

    // Count split: how many go to canonical vs internal (informational).
    const toCanonical = labels.filter((l) => translationMap[l]);
    const toInternal = labels.filter((l) => !translationMap[l]);
    // Sanity: at least some labels translate (we deliberately mapped 8).
    expect(toCanonical.length).toBeGreaterThanOrEqual(8);
    expect(toCanonical.length + toInternal.length).toBe(labels.length);
  });

  it('collectSaleFormData routes via the translation table (canonical+internal split)', () => {
    // Verify the collector emits BOTH BuildingFeatures (canonical) AND
    // saleBuildingFeaturesInternal (Mallan internal) buckets.
    const collectStart = formHtml.indexOf('function collectSaleFormData()');
    const collectEnd = formHtml.indexOf('\nfunction submitSalesListing(', collectStart);
    const collectBody = formHtml.slice(collectStart, collectEnd);
    expect(collectBody).toMatch(/data\.BuildingFeatures\s*=\s*\[\]/);
    expect(collectBody).toMatch(/data\.saleBuildingFeaturesInternal\s*=\s*\[\]/);
    // Verify it uses the translation map name (so a rename catches the test).
    expect(collectBody).toMatch(/BUILDING_FEATURES_LABEL_TO_CANONICAL\[label\]/);
  });

  it('restore reads BOTH canonical and internal arrays', () => {
    const populateStart = formHtml.indexOf('function _populateSaleFormFromApi(listing)');
    const populateBody = formHtml.slice(populateStart, populateStart + 22000);
    expect(populateBody).toMatch(/raw\.BuildingFeatures/);
    expect(populateBody).toMatch(/raw\.saleBuildingFeaturesInternal/);
  });

  it('non-amenity inputs no longer carry data-mallan-group="buildingFeatures" mis-tag', () => {
    // The 9 mis-tagged inputs (Historic / LEED / Conversion + 5 policies +
    // 1 Yes/No radio) must NOT be tagged BuildingFeatures anymore — they
    // have their own SALE_FIELD_MAP / SALE_RADIO_MAP entries.
    const misTaggedIds = [
      'saleBldgHistoric', 'saleBldgLEED', 'saleBldgConversion',
      'saleBldgParentsAllowed', 'saleBldgCoBuyersAllowed',
      'saleBldgCorpOwnAllowed', 'saleBldgGiftsAllowed', 'saleBldgBoardApproval',
    ];
    for (const id of misTaggedIds) {
      const tag = formHtml.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, ''))?.[0] || '';
      expect({ id, stillTagged: /data-mallan-group="buildingFeatures"/.test(tag) }).toEqual({
        id,
        stillTagged: false,
      });
    }
  });

  it('only the 19 SALE_BUILDING_FEATURE_IDS amenity checkboxes carry the BuildingFeatures tag', () => {
    // Count occurrences in HTML inputs (excludes the JS query string).
    const inputMatches = formHtml.match(/<input[^>]*data-mallan-group="buildingFeatures"[^>]*>/g) || [];
    expect(inputMatches.length).toBe(19);
  });
});

describe('Flooring — demoted to Mallan internal (Codex PR #270 review)', () => {
  it('collectSaleFormData writes saleFlooring (Mallan internal), NOT canonical Flooring', () => {
    const collectStart = formHtml.indexOf('function collectSaleFormData()');
    const collectEnd = formHtml.indexOf('\nfunction submitSalesListing(', collectStart);
    const collectBody = formHtml.slice(collectStart, collectEnd);
    // The post-fix code emits saleFlooring (Mallan internal), not Flooring.
    expect(collectBody).toMatch(/data\.saleFlooring\s*=\s*\[\]/);
    // Strip comments before checking for the absence — the audit comment
    // explaining the demotion legitimately mentions `data.Flooring`.
    const codeOnly = collectBody
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(codeOnly).not.toMatch(/data\.Flooring\s*=\s*\[\]/);
  });

  it('Flooring inputs are marked data-mallan-internal (Mallan-owned classificationute, Mallan internal)', () => {
    const flooringInputs = formHtml.match(/<input[^>]*name="saleFlooring"[^>]*>/g) || [];
    expect(flooringInputs.length).toBe(5);
    for (const tag of flooringInputs) {
      expect(tag).toContain('data-mallan-internal="true"');
    }
  });

  it('SALE_CHECKBOX_ARRAY_MAP entry for saleFlooring uses Mallan internal rls key', () => {
    expect(formHtml).toMatch(/\{\s*rls:\s*'saleFlooring'\s*,\s*name:\s*'saleFlooring'/);
    // The old RESO-canonical mapping `{ rls: 'Flooring', name: 'saleFlooring' }`
    // should no longer be present.
    expect(formHtml).not.toMatch(/\{\s*rls:\s*'Flooring'\s*,\s*name:\s*'saleFlooring'/);
  });
});
