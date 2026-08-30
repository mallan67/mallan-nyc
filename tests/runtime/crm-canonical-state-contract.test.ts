import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CANONICAL_FILTER_KEYS,
  CRITERION_VALUE_SHAPE,
  WORKFLOW_CRITERIA,
} from '../../lib/search/canonical/filter-keys.generated';

const REPO = join(__dirname, '..', '..');
const SEARCH_ENGINE = join(REPO, 'public', 'crm', 'js', 'search', 'search-engine.js');
const FORM_HTML = join(REPO, 'public', 'crm', 'html', 'search-form-and-results.html');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE UI STATE MUST AGREE WITH THE CANONICAL CONTRACT, AND WITH THE REAL FORM.
 *
 * Two independent failures made a 46/46 green suite meaningless while the live
 * page stayed broken:
 *
 *   INVENTED CONTROL IDS. The adapters named `searchQuickRLS`, `searchQuickZip`,
 *   `searchQuickUnit`, `searchKeyword`, `saleBuildingName` and `adv-unit`. NONE
 *   of them exist. The real controls are per-workflow — `saleQuickRls`,
 *   `rentalQuickRls`, `buildingQuickRls`, `saleKeywordSearch` and so on. The
 *   pre-existing collector carried the same dead ids, so Basic listing ID, ZIP,
 *   unit and keyword had never reached the wire at all.
 *
 *   A SYNTHETIC FIXTURE. The behavioural suite built its own DOM containing a
 *   `searchKeyword` that exists nowhere in the product, so it happily proved the
 *   adapters worked against markup that does not ship.
 *
 * A test that writes its own DOM can only ever prove the code agrees with the
 * test. These assertions read the SHIPPED form markup and the GENERATED canonical
 * contract, so neither can drift from the adapters unnoticed.
 */

const engine = readFileSync(SEARCH_ENGINE, 'utf8');
const formHtml = readFileSync(FORM_HTML, 'utf8');

/** The adapter registry, parsed out of the shipped engine source. */
function adapterRegistry(): Record<string, any> {
  const block = /var CRITERION_ADAPTERS = \{[\s\S]*?\n        \};/.exec(engine);
  if (!block) throw new Error('CRITERION_ADAPTERS not found in search-engine.js');
  // eslint-disable-next-line no-new-func
  return new Function(`${block[0]} return CRITERION_ADAPTERS;`)();
}

const REGISTRY = adapterRegistry();
const controlIds = (adapter: any): string[] =>
  Object.values(adapter.ids ?? {}).flatMap((perTab: any) =>
    Object.values(perTab).flatMap((ids: any) => (ids as (string | null)[]).filter(Boolean)),
  ) as string[];

describe('the adapter registry was parsed at all — guard the guard', () => {
  it('finds adapters with ids', () => {
    // A parse returning {} would make every assertion below vacuous, which is
    // precisely how the synthetic fixture hid a page-wide defect.
    expect(Object.keys(REGISTRY).length).toBeGreaterThanOrEqual(15);
    expect(controlIds(REGISTRY.list_price)).toContain('saleMinPrice');
  });
});

describe('every adapter control exists in the SHIPPED form', () => {
  it('names no control that the markup does not render', () => {
    const missing: string[] = [];
    for (const [key, adapter] of Object.entries(REGISTRY)) {
      for (const id of controlIds(adapter)) {
        if (!formHtml.includes(`id="${id}"`)) missing.push(`${key} -> #${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses the PER-WORKFLOW Quick Search controls, not a generic one', () => {
    // The exact defect: one generic id cannot serve three workflow forms, and
    // the generic ones were never in the markup to begin with.
    //
    // Building is absent from listing-ID, unit and keyword ON PURPOSE. The
    // Building surface DOES render `buildingQuickRls`, `buildingQuickUnit` and
    // `buildingKeywordSearch`, but WORKFLOW_CRITERIA offers those criteria to
    // sale and rental only. Binding them here would let the UI widen the
    // canonical contract by wiring itself in — a product decision, not a
    // client-side one. `postal_code` IS offered to building, so it binds there.
    expect(controlIds(REGISTRY.listing_id_canonical)).toEqual(
      expect.arrayContaining(['saleQuickRls', 'rentalQuickRls']),
    );
    expect(controlIds(REGISTRY.listing_id_canonical)).not.toContain('buildingQuickRls');
    expect(controlIds(REGISTRY.postal_code)).toEqual(
      expect.arrayContaining(['saleQuickZip', 'rentalQuickZip', 'buildingQuickZip']),
    );
    expect(controlIds(REGISTRY.unit)).toEqual(
      expect.arrayContaining(['saleQuickUnit', 'rentalQuickUnit']),
    );
    expect(controlIds(REGISTRY.public_remarks_keyword)).toEqual(
      expect.arrayContaining(['saleKeywordSearch', 'rentalKeywordSearch']),
    );
  });

  it('no longer references any of the invented ids', () => {
    const invented = [
      'searchQuickRLS',
      'searchQuickRls',
      'searchQuickZip',
      'searchQuickUnit',
      'searchKeyword',
      'adv-unit',
      'saleBuildingName',
      'rentalBuildingName',
      'buildingNameSearch',
    ];
    const stillUsed = invented.filter((id) => engine.includes(`'${id}'`));
    expect(stillUsed).toEqual([]);
  });
});

describe('adapter keys and shapes come from the canonical contract', () => {
  it('names only canonical criteria', () => {
    // The adapters are view adapters onto canonical criteria. A key outside the
    // vocabulary would be a UI-private criterion with no owner and no shape.
    const strangers = Object.keys(REGISTRY).filter(
      (k) => !(CANONICAL_FILTER_KEYS as readonly string[]).includes(k),
    );
    expect(strangers).toEqual([]);
  });

  it('declares the SAME value shape the generated contract declares', () => {
    // This is what would have caught `listing_id_canonical` being declared
    // `text` in the browser while the contract says `text_set`. The UI storing a
    // comma-joined scalar where the contract promises a set is a disagreement
    // about the FACT, not about formatting.
    const mismatches: string[] = [];
    for (const [key, adapter] of Object.entries(REGISTRY)) {
      const expected = CRITERION_VALUE_SHAPE[key as keyof typeof CRITERION_VALUE_SHAPE];
      if (adapter.shape !== expected) {
        mismatches.push(`${key}: adapter '${adapter.shape}' vs contract '${expected}'`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('binds a criterion only to workflows that actually offer it', () => {
    // An adapter wiring a criterion into a workflow the contract does not offer
    // would let the UI ask a question the product does not.
    const wrong: string[] = [];
    const TAB_TO_WORKFLOW: Record<string, keyof typeof WORKFLOW_CRITERIA> = {
      sale: 'sale',
      rent: 'rental',
      building: 'building',
    };
    for (const [key, adapter] of Object.entries(REGISTRY)) {
      for (const tab of Object.keys(adapter.ids ?? {})) {
        const workflow = TAB_TO_WORKFLOW[tab];
        const offered = WORKFLOW_CRITERIA[workflow] as readonly string[];
        if (!offered.includes(key)) wrong.push(`${key} bound to ${tab}, not offered by ${workflow}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the collector no longer keeps a private id table', () => {
  it('reads Quick Search and keyword from canonical state', () => {
    // A second id table is what allowed the first one to be wrong without
    // anything disagreeing with it.
    expect(engine).toMatch(/canonicalCriteriaFor\(currentSearchTab\)/);
    expect(engine).not.toMatch(/var rlsInputId, zipInputId, unitInputId;/);
  });
});
