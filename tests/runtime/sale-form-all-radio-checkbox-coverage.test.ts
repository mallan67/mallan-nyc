/// <reference types="jest" />
/**
 * Full-coverage parametrized round-trip contract for SALE-FORM-REDESIGN.html.
 *
 * Per Maya's S3 mandate (audit at
 * docs/crm/sales-form-radio-checkbox-roundtrip-audit-2026-05-28.md):
 *
 *   Every radio and every checkbox on the sales form must end up in one of
 *   three outcomes:
 *     1. real RESO/RLS field with save+restore mapping, or
 *     2. real Mallan-internal field with save+restore under raw key, or
 *     3. dead/vestigial UI explicitly removed.
 *
 * This file derives the inventory from the HTML directly, then asserts
 * the maps cover it — so adding a new radio/checkbox without wiring it
 * breaks CI immediately rather than waiting for the next agent to notice
 * field-loss in production.
 *
 * NOT one test per field. Parametrized inventory-driven coverage.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = readFileSync(FORM_PATH, 'utf8');

// ── Inventory primitives — re-derived from the live HTML on every run ──

interface InputRecord {
  type: 'radio' | 'checkbox';
  name: string;
  id: string;
  value: string;
}

function inventoryInputs(html: string): InputRecord[] {
  const inputRe = /<input[^>]*type="(radio|checkbox)"[^>]*>/gi;
  const out: InputRecord[] = [];
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const type = m[1].toLowerCase() as 'radio' | 'checkbox';
    const get = (attr: string) => {
      const am = new RegExp(`\\s${attr}="([^"]*)"`).exec(tag);
      return am ? am[1] : '';
    };
    out.push({ type, name: get('name'), id: get('id'), value: get('value') });
  }
  return out;
}

function groupByName<T extends { name: string }>(records: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of records) {
    if (!r.name) continue;
    const arr = m.get(r.name) || [];
    arr.push(r);
    m.set(r.name, arr);
  }
  return m;
}

const allInputs = inventoryInputs(formHtml);
const radios = allInputs.filter((i) => i.type === 'radio');
const checkboxes = allInputs.filter((i) => i.type === 'checkbox');
const radioGroups = groupByName(radios);
const checkboxGroupsByName = groupByName(checkboxes);

// Extract map entries with the same simple regex used by the audit script.
function extractMapEntries(html: string, marker: string): Array<Record<string, string>> {
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const end = html.indexOf('];', start);
  const block = html.slice(start, end);
  const entries: Array<Record<string, string>> = [];
  const entryRe = /\{[^}]+\}/g;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(block)) !== null) {
    const obj: Record<string, string> = {};
    const kvRe = /(\w+)\s*:\s*'([^']*)'/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRe.exec(em[0])) !== null) obj[kv[1]] = kv[2];
    if (Object.keys(obj).length) entries.push(obj);
  }
  return entries;
}

const SALE_RADIO_MAP = extractMapEntries(formHtml, 'var SALE_RADIO_MAP = [');
const SALE_CHECKBOX_ARRAY_MAP = extractMapEntries(formHtml, 'var SALE_CHECKBOX_ARRAY_MAP = [');
const SALE_FIELD_MAP = extractMapEntries(formHtml, 'var SALE_FIELD_MAP = [');

const radioMapNames = new Set(SALE_RADIO_MAP.map((e) => e.name).filter(Boolean));
const checkboxArrayMapNames = new Set(SALE_CHECKBOX_ARRAY_MAP.map((e) => e.name).filter(Boolean));
const fieldMapForms = new Set(SALE_FIELD_MAP.map((e) => e.form).filter(Boolean));

// Extract collect body to assert array derivations exist for each group.
function collectBody(html: string): string {
  const start = html.indexOf('function collectSaleFormData()');
  const end = html.indexOf('\nfunction submitSalesListing(', start);
  return html.slice(start, end);
}
const collectSrc = collectBody(formHtml);
const collectArrayNames = new Set<string>();
const collectArrayRe = /querySelectorAll\('input\[name="([^"]+)"\]:checked'\)/g;
let cm: RegExpExecArray | null;
while ((cm = collectArrayRe.exec(collectSrc)) !== null) collectArrayNames.add(cm[1]);

// ── Tests ─────────────────────────────────────────────────────────────

describe('Full-coverage inventory snapshot (drives the contract below)', () => {
  it('inventory has the expected order of magnitude (sanity)', () => {
    expect(radioGroups.size).toBeGreaterThanOrEqual(30);
    expect(radioGroups.size).toBeLessThan(60); // grew unexpectedly? audit needed
    expect(checkboxGroupsByName.size).toBeGreaterThanOrEqual(25);
    expect(allInputs.length).toBeGreaterThanOrEqual(500);
  });

  it('zero unnamed checkboxes (would mean visual-only inputs that save nowhere)', () => {
    const unnamedAndUnIdentified = checkboxes.filter((c) => !c.name && !c.id);
    if (unnamedAndUnIdentified.length > 0) {
      // Surface the first 5 to make the failure actionable.
      const sample = unnamedAndUnIdentified.slice(0, 5);
      throw new Error(
        `Found ${unnamedAndUnIdentified.length} checkbox inputs with no name AND no id. ` +
        `These accept user clicks but never reach the data layer. ` +
        `Add name+value (and an entry to SALE_CHECKBOX_ARRAY_MAP or SALE_FIELD_MAP), ` +
        `or remove them as dead UI. Sample tags: ${JSON.stringify(sample)}`,
      );
    }
    expect(unnamedAndUnIdentified).toHaveLength(0);
  });

  it('zero radios without name (would be invalid HTML AND impossible to restore)', () => {
    const noName = radios.filter((r) => !r.name);
    expect(noName).toHaveLength(0);
  });
});

describe('Class A — every radio group has a restore mapping', () => {
  // Allow-list of radio names that are HTML-default-only (e.g. visibility
  // toggles that never persist). Empty for now — every radio is real.
  const ALLOW_RESTORE_MISSING: string[] = [];

  it.each([...radioGroups.keys()].sort().map((name) => [name]))(
    'radio group "%s" has SALE_RADIO_MAP or SALE_FIELD_MAP entry',
    (name) => {
      if (ALLOW_RESTORE_MISSING.includes(name)) return;
      const hasMap = radioMapNames.has(name) || fieldMapForms.has(name);
      expect({ name, hasRestoreMapping: hasMap }).toEqual({ name, hasRestoreMapping: true });
    },
  );
});

describe('Class B + C — every multi-input checkbox group has BOTH collect derivation AND restore mapping', () => {
  // Build the list of "groups" — names shared by 2+ checkboxes.
  const sharedNameGroups = [...checkboxGroupsByName.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([name]) => name)
    .sort();

  it.each(sharedNameGroups.map((name) => [name]))(
    'checkbox group "%s" is collected as an array AND restored via SALE_CHECKBOX_ARRAY_MAP',
    (name) => {
      const collected = collectArrayNames.has(name);
      const restored = checkboxArrayMapNames.has(name);
      expect({ name, collectedAsArray: collected, restoredViaMap: restored }).toEqual({
        name,
        collectedAsArray: true,
        restoredViaMap: true,
      });
    },
  );
});

describe('Single-id boolean checkboxes are addressable via SALE_FIELD_MAP', () => {
  // Single-input checkboxes (name appears only once OR no name but an id)
  // are restored by SALE_FIELD_MAP type:'bool'/type:'checked' entries.
  // Bucket: id-only OR (name + count == 1).
  const singleBooleans = checkboxes.filter((c) => {
    if (c.name) {
      const group = checkboxGroupsByName.get(c.name);
      return group && group.length === 1;
    }
    return Boolean(c.id);
  });

  // Allow-list: id-only checkboxes managed by other mechanisms.
  // SALE_BUILDING_FEATURE_IDS handles 19 building amenity ids → BuildingFeatures array.
  // SALE_SYNDICATION_MAP handles 6 syndication checkbox ids.
  // Tests OR these against the same form's referenced ID lists.
  const buildingFeatureIdsBlock = formHtml.match(/var SALE_BUILDING_FEATURE_IDS = \[([\s\S]*?)\];/)?.[1] || '';
  const buildingFeatureIds = new Set(
    (buildingFeatureIdsBlock.match(/'(\w+)'/g) || []).map((s) => s.slice(1, -1)),
  );
  const syndicationIdsBlock = formHtml.match(/var SALE_SYNDICATION_MAP = \[([\s\S]*?)\];/)?.[1] || '';
  const syndicationIds = new Set(
    (syndicationIdsBlock.match(/id:\s*'(\w+)'/g) || []).map((s) => s.match(/'(\w+)'/)?.[1] || ''),
  );

  // Allow-list: ids that are restored by SPECIAL-CASE populate code rather
  // than by SALE_FIELD_MAP / SALE_BUILDING_FEATURE_IDS / SALE_SYNDICATION_MAP.
  // Each has an explicit setChecked call in _populateSaleFormFromApi:
  //   - saleAuctionYn   → set in the auction block from listing.auction_yn
  //   - saleSyndicateYN → set from raw.SyndicateYN
  //   - saleDist_VOW    → set from raw.saleDist_VOW
  //   - saleSendToAll   → derived from individual syndication targets
  const SPECIAL_CASE_RESTORED = new Set([
    'saleAuctionYn',
    'saleSyndicateYN',
    'saleDist_VOW',
    'saleSendToAll',
  ]);

  // Separate allow-list: ids that are UI-only (filter toggles, view-state
  // checkboxes) and intentionally NOT persisted. The contract for these
  // is the inverse — they must NOT be in any restore map AND must NOT
  // have a setChecked call in populate. If someone adds restore wiring
  // for a UI-only toggle, the inverse-contract test below catches it.
  const UI_ONLY_NOT_PERSISTED = new Set([
    'saleShowRequiredOnly', // filter: "show required fields only"
  ]);

  // For id-bearing single booleans, the contract is: id is in SALE_FIELD_MAP.form
  // OR in SALE_BUILDING_FEATURE_IDS OR in SALE_SYNDICATION_MAP OR in either
  // allow-list (special-case restored OR intentionally UI-only).
  it('every id-bearing single-checkbox boolean has a known restore path (or is intentionally UI-only)', () => {
    const ungated: string[] = [];
    for (const cb of singleBooleans) {
      const id = cb.id;
      if (!id) continue;
      const hasFieldMap = fieldMapForms.has(id);
      const hasBuildingId = buildingFeatureIds.has(id);
      const hasSyndId = syndicationIds.has(id);
      const hasSpecialCase = SPECIAL_CASE_RESTORED.has(id);
      const isUiOnly = UI_ONLY_NOT_PERSISTED.has(id);
      if (!hasFieldMap && !hasBuildingId && !hasSyndId && !hasSpecialCase && !isUiOnly) {
        ungated.push(id);
      }
    }
    expect(ungated).toEqual([]);
  });

  // Verify SPECIAL_CASE_RESTORED isn't a free-pass list — each entry must
  // actually have a setChecked call in _populateSaleFormFromApi.
  it('every SPECIAL_CASE_RESTORED entry has a real setChecked call in populate', () => {
    const populateStart = formHtml.indexOf('function _populateSaleFormFromApi(listing)');
    const populateBody = formHtml.slice(populateStart, populateStart + 25000);
    for (const id of SPECIAL_CASE_RESTORED) {
      const hasRestore = new RegExp(`setChecked\\(['"]${id}['"]`).test(populateBody);
      expect({ id, hasSetCheckedCallInPopulate: hasRestore }).toEqual({ id, hasSetCheckedCallInPopulate: true });
    }
  });

  // Inverse contract for UI_ONLY: confirm these ids are NOT in any restore
  // map and have NO setChecked call in populate (so they're genuinely
  // ephemeral UI state, not accidentally-lost data).
  it('every UI_ONLY_NOT_PERSISTED entry is genuinely not persisted anywhere', () => {
    const populateStart = formHtml.indexOf('function _populateSaleFormFromApi(listing)');
    const populateBody = formHtml.slice(populateStart, populateStart + 25000);
    for (const id of UI_ONLY_NOT_PERSISTED) {
      const inFieldMap = fieldMapForms.has(id);
      const inBuildingIds = buildingFeatureIds.has(id);
      const inSyndIds = syndicationIds.has(id);
      const hasSetChecked = new RegExp(`setChecked\\(['"]${id}['"]`).test(populateBody);
      expect({ id, anyPersistence: inFieldMap || inBuildingIds || inSyndIds || hasSetChecked })
        .toEqual({ id, anyPersistence: false });
    }
  });
});

describe('Class A specific — InternetAutomatedValuationDisplayYN canonical write', () => {
  // saleInternetAVMDisplayYN form radio writes the canonical RESO key into
  // the body so the read-side gate at lib/compliance/gates.ts:affirmPermission
  // can evaluate it. Without this, the radio is stored only as a form-CRM-raw
  // string ('Yes'/'No'), never translated to the boolean the gate reads.
  it('collectSaleFormData wires saleInternetAVMDisplayYN → data.InternetAutomatedValuationDisplayYN', () => {
    expect(collectSrc).toMatch(
      /data\.saleInternetAVMDisplayYN\s*===\s*'No'[\s\S]*?data\.InternetAutomatedValuationDisplayYN\s*=\s*false/,
    );
    expect(collectSrc).toMatch(
      /data\.saleInternetAVMDisplayYN\s*===\s*'Yes'[\s\S]*?data\.InternetAutomatedValuationDisplayYN\s*=\s*true/,
    );
  });
});

describe('Populate-time event suppression still protects all restorers', () => {
  // Verify the PR #268 race protection is still in place — the setVal /
  // setChecked / setRadio inside _populateSaleFormFromApi guard on
  // !window._salePopulateInProgress. Without this, a cascading change
  // event during populate (now firing for ~50 more fields than before)
  // could re-overwrite values.
  const populateStart = formHtml.indexOf('function _populateSaleFormFromApi(listing)');
  const populateBody = formHtml.slice(populateStart, populateStart + 25000);

  it('setVal suppresses change events while _salePopulateInProgress', () => {
    expect(populateBody).toMatch(
      /function setVal\(id, val\)[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?dispatchEvent/,
    );
  });

  it('setChecked suppresses change events while _salePopulateInProgress', () => {
    expect(populateBody).toMatch(
      /function setChecked\(id, val\)[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?dispatchEvent/,
    );
  });

  it('setRadio suppresses change events while _salePopulateInProgress', () => {
    expect(populateBody).toMatch(
      /function setRadio\(name, val\)[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?dispatchEvent/,
    );
  });
});
