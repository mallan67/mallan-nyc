/// <reference types="jest" />
/**
 * Live Cotality enum guard for collectSaleFormData.
 *
 * Codex caught two Herringbone-class bugs on PR #270:
 *   1. Flooring write included "Herringbone" — not a live Flooring member
 *   2. BuildingFeatures write pushed all 19 amenity LABEL TEXTs (e.g.
 *      "Elevator", "Gym/Fitness Center") — none of which are live
 *      BuildingFeatures members
 *
 * Both fixes:
 *   - Flooring → demoted to Mallan internal (saleFlooring raw key)
 *   - BuildingFeatures → translation table (8 unambiguous label→canonical
 *     mappings; untranslatable labels go to saleBuildingFeaturesInternal)
 *
 * Authority: the committed live Cotality contract `data/cotality-enums.live.json`
 * (every entity, field type and enum from live `$metadata`; regenerate with
 * `npm run cotality:pull`, check drift with `npm run cotality:verify`). Every form
 * value written to a live Cotality enum field must be a live member of that
 * field's enum, so a non-live string cannot ship.
 *
 * Known Sale Redesign gap (live probe 2026-10-01; closed by the Sale Redesign
 * conversion, never by widening this test):
 *   - salePetsAllowed writes UnitYes / UnitCatsOK / … into PetsAllowed. Live
 *     PetsAllowed uses Yes / CatsOk / DogsOk / … and also carries the building
 *     values (BuildingYes, BuildingCatsOk, …) in the same field.
 *   - saleBuildingPetsAllowed, saleBldgHeating, saleBldgCooling,
 *     saleBuildingLaundryFeatures and saleAttendanceType write fields that are
 *     not typed live fields (AttendanceType is a CustomProperty.CustomFields key).
 * The ratchet below lets those existing values stand and fails on any new one.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const LIVE_PATH = resolve(__dirname, '../../data/cotality-enums.live.json');

const formHtml = readFileSync(FORM_PATH, 'utf8');
const live: { entities: Record<string, Record<string, string>>; enums: Record<string, string[]> } =
  JSON.parse(readFileSync(LIVE_PATH, 'utf8'));

// ── Helpers ──

/** Live enum members for a Property field, via the enum type it is declared with. */
function liveEnum(field: string): Set<string> {
  const type = live.entities.Property?.[field];
  if (!type) return new Set();
  const enumName = type.replace(/^Collection\((.*)\)$/, '$1').split('.').pop() ?? '';
  return new Set(live.enums[enumName] ?? []);
}

/** True when the field is declared on any live entity. */
function isLiveField(field: string): boolean {
  return Object.values(live.entities).some((e) => Object.prototype.hasOwnProperty.call(e, field));
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

describe('Writes to live Cotality enum fields use live members only', () => {
  // collectSaleFormData pushes `cb.value` directly into `data.<Field>`, so every
  // value attribute must be a live member of that field's enum.
  const liveEnumWrites: Array<{ formName: string; field: string }> = [
    { formName: 'saleHeating', field: 'Heating' },
    { formName: 'saleCooling', field: 'Cooling' },
  ];

  it.each(liveEnumWrites.map(({ formName, field }) => [formName, field]))(
    'every form value for name="%s" is a live member of "%s"',
    (formName, field) => {
      const formVals = formValuesForName(formName);
      expect(formVals.length).toBeGreaterThan(0); // sanity — fields exist
      const enumSet = liveEnum(field);
      expect(enumSet.size).toBeGreaterThan(0); // sanity — live enum resolved
      const nonLive = formVals.filter((v) => !enumSet.has(v));
      expect({ field, nonLiveValues: nonLive }).toEqual({ field, nonLiveValues: [] });
    },
  );
});

describe('Known Sale Redesign gap cannot grow (closed by the Sale Redesign conversion)', () => {
  // Values the form writes into live PetsAllowed that live Cotality does not serve.
  const KNOWN_NON_LIVE_PETS = new Set([
    'UnitYes', 'UnitCatsOK', 'UnitDogsOK', 'UnitBreedRestrictions',
    'UnitSizeLimit', 'UnitNumberLimit', 'UnitNo',
  ]);
  // Fields the form writes that are not typed live Cotality fields.
  const NON_LIVE_FIELDS: Array<{ formName: string; field: string }> = [
    { formName: 'saleBuildingPetsAllowed', field: 'BuildingPetsAllowed' },
    { formName: 'saleBldgHeating', field: 'BuildingHeating' },
    { formName: 'saleBldgCooling', field: 'BuildingCooling' },
    { formName: 'saleBuildingLaundryFeatures', field: 'BuildingLaundryFeatures' },
    { formName: 'saleAttendanceType', field: 'AttendanceType' },
  ];

  it('salePetsAllowed adds no non-live PetsAllowed value beyond the known set', () => {
    const formVals = formValuesForName('salePetsAllowed');
    expect(formVals.length).toBeGreaterThan(0);
    const enumSet = liveEnum('PetsAllowed');
    expect(enumSet.size).toBeGreaterThan(0);
    const newNonLive = formVals.filter((v) => !enumSet.has(v) && !KNOWN_NON_LIVE_PETS.has(v));
    expect(newNonLive).toEqual([]);
  });

  it.each(NON_LIVE_FIELDS.map(({ formName, field }) => [formName, field]))(
    'name="%s" still writes "%s", which is not a typed live field',
    (formName, field) => {
      expect(formValuesForName(formName).length).toBeGreaterThan(0);
      expect({ field, live: isLiveField(field) }).toEqual({ field, live: false });
    },
  );
});

describe('BuildingFeatures translation table — Herringbone-class PR #270 fix', () => {
  const translationMap = extractBuildingFeaturesMap();

  it('translation map exists and has at least one mapping', () => {
    expect(Object.keys(translationMap).length).toBeGreaterThan(0);
  });

  it('every mapped canonical value is a live BuildingFeatures member', () => {
    const enumSet = liveEnum('BuildingFeatures');
    expect(enumSet.size).toBeGreaterThan(0);
    const nonLive = Object.entries(translationMap).filter(([, canonical]) => !enumSet.has(canonical));
    expect({ nonLiveMappings: nonLive }).toEqual({ nonLiveMappings: [] });
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

  it('non-amenity inputs no longer carry data-rls-field="BuildingFeatures" mis-tag', () => {
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
      expect({ id, stillTagged: /data-rls-field="BuildingFeatures"/.test(tag) }).toEqual({
        id,
        stillTagged: false,
      });
    }
  });

  it('only the 19 SALE_BUILDING_FEATURE_IDS amenity checkboxes carry the BuildingFeatures tag', () => {
    // Count occurrences in HTML inputs (excludes the JS query string).
    const inputMatches = formHtml.match(/<input[^>]*data-rls-field="BuildingFeatures"[^>]*>/g) || [];
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

  it('Flooring inputs are marked data-rls-ignore (legacy validator attribute, Mallan internal)', () => {
    const flooringInputs = formHtml.match(/<input[^>]*name="saleFlooring"[^>]*>/g) || [];
    expect(flooringInputs.length).toBe(5);
    for (const tag of flooringInputs) {
      expect(tag).toContain('data-rls-ignore="true"');
    }
  });

  it('SALE_CHECKBOX_ARRAY_MAP entry for saleFlooring uses Mallan internal rls key', () => {
    expect(formHtml).toMatch(/\{\s*rls:\s*'saleFlooring'\s*,\s*name:\s*'saleFlooring'/);
    // The old Cotality-field mapping `{ rls: 'Flooring', name: 'saleFlooring' }`
    // should no longer be present.
    expect(formHtml).not.toMatch(/\{\s*rls:\s*'Flooring'\s*,\s*name:\s*'saleFlooring'/);
  });
});
