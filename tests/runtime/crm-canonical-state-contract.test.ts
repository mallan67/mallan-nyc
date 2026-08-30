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

  const TAB_TO_WORKFLOW: Record<string, keyof typeof WORKFLOW_CRITERIA> = {
    sale: 'sale',
    rent: 'rental',
    building: 'building',
  };

  /** The tabs an adapter applies to, however it declares them. */
  const adapterTabs = (adapter: any): string[] =>
    adapter.workflows ? [...adapter.workflows] : Object.keys(adapter.ids ?? {});

  it('binds a criterion only to workflows that actually offer it', () => {
    // This walked `adapter.ids` alone. Scope-scanned adapters — checkboxSet,
    // checkboxBool, featureMap, tags — have no ids map, so they bypassed the
    // check entirely while sync ran them against whatever tab was active. Adding
    // `workflows` arrays to those adapters fixed the RUNTIME but left the PROOF
    // blind to them, which is a second hand-maintained inventory in waiting.
    const wrong: string[] = [];
    for (const [key, adapter] of Object.entries(REGISTRY)) {
      for (const tab of adapterTabs(adapter)) {
        const workflow = TAB_TO_WORKFLOW[tab];
        const offered = WORKFLOW_CRITERIA[workflow] as readonly string[];
        if (!offered.includes(key)) wrong.push(`${key} bound to ${tab}, not offered by ${workflow}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('binds a criterion to EVERY workflow that offers it — exact agreement', () => {
    // The reverse of the above, and the half that stops the manual `workflows`
    // arrays drifting: a criterion the contract offers to a workflow, with an
    // adapter that omits that workflow, is a control the agent can see and the
    // state will not collect.
    // Scoped to the three workflows the Search TAB BAR serves. `comparable` is
    // deliberately excluded: it has no tab, and its criteria are entered through
    // a separate surface (#comparablesSection) that this state model does not
    // adapt. Asserting adapters for it would demand bindings to controls that do
    // not exist on any tab — the invented-control defect, inverted.
    const TABBED: Array<keyof typeof WORKFLOW_CRITERIA> = ['sale', 'rental', 'building'];
    const missing: string[] = [];
    for (const [key, adapter] of Object.entries(REGISTRY)) {
      const bound = new Set(adapterTabs(adapter).map((t) => TAB_TO_WORKFLOW[t]));
      for (const workflow of TABBED) {
        const keys = WORKFLOW_CRITERIA[workflow] as readonly string[];
        if (!keys.includes(key)) continue;
        if (!bound.has(workflow)) missing.push(`${key} offered by ${workflow} but not bound there`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('checks scope-scanned adapters too — guard the guard', () => {
    // If every adapter happened to carry `ids`, the two assertions above would
    // pass without ever exercising the case they exist for.
    const scoped = Object.values(REGISTRY).filter((a: any) => !a.ids && a.workflows);
    expect(scoped.length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REVERSE COVERAGE — EVERY ENABLED CONTROL IS OWNED OR REFUSED. NO THIRD STATE.
 *
 * The guards above prove the FORWARD direction: every adapter names a real
 * control, with a canonical key, the contract's shape, and a permitted workflow.
 * Nothing proved the converse, and the gap was not theoretical — `#adv-dom-min`
 * and `#adv-dom-max` shipped enabled with no canonical owner and no refusal, so
 * an agent could enter a Days-on-Market range that Search never executed.
 *
 * A control that is enabled, visible and uncollected is the same silent failure
 * as the wrong-tab layout. There are exactly two acceptable states.
 */
describe('reverse coverage: no enabled control is silently ignored', () => {
  const deadControls = readFileSync(
    join(REPO, 'public', 'crm', 'js', 'init', 'init-disable-dead-controls.js'),
    'utf8',
  );

  /** Ids and data-fields the refusal module disables. */
  const refusals = () => {
    const ids = new Set(
      [...deadControls.matchAll(/selector: '#([A-Za-z0-9_-]+)'/g)].map((m) => m[1]),
    );
    const idAnchors = [...deadControls.matchAll(/idAnchor: '([A-Za-z0-9_-]+)'/g)].map((m) => m[1]);
    const fields = new Set(
      [...deadControls.matchAll(/data-field="([A-Za-z]+)"/g)].map((m) => m[1]),
    );
    const attrs = [...deadControls.matchAll(/'input\[([a-z-]+)\]'/g)].map((m) => m[1]);
    return { ids, idAnchors, fields, attrs };
  };

  /** Everything the adapters own, by id and by data-field. */
  const ownership = () => {
    const block = /var CRITERION_ADAPTERS = \{[\s\S]*?\n        \};/.exec(engine)![0];
    const ids = new Set([...block.matchAll(/'([A-Za-z][A-Za-z0-9_-]*)'/g)].map((m) => m[1]));
    // Building-fact ids live in `_resolveBuildingFieldIds`, their single owner —
    // the adapters delegate rather than restate them. An ownership check that
    // reads only the adapter table reports all 26 as unowned.
    const resolver = /_resolveBuildingFieldIds = function[\s\S]*?\n        \};/.exec(engine)?.[0] ?? '';
    const prefixes = [...resolver.matchAll(/\?\s*'([A-Za-z]+)'\s*:\s*'([A-Za-z]+)'/g)].flatMap((m) => [
      m[1],
      m[2],
    ]);
    for (const m of resolver.matchAll(/'([A-Za-z0-9_-]+)'/g)) {
      const token = m[1];
      if (prefixes.includes(token)) continue;
      if (new RegExp(`tab\\s*===\\s*'${token}'`).test(resolver)) continue;
      if (new RegExp(`p\\s*\\+\\s*'${token}'`).test(resolver)) {
        prefixes.forEach((prefix) => ids.add(prefix + token));
        continue;
      }
      ids.add(token);
    }
    // Includes legacyFields: one criterion may answer to more than one
    // data-field spelling. Sale/Rental Basic render NewConstruction while
    // Building/Advanced render NewConstructionYN, and both are the SAME
    // criterion — an ownership check that reads only `field` reports the legacy
    // spelling as unowned.
    const fields = new Set([
      ...[...block.matchAll(/field: '([A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...block.matchAll(/legacyFields: \[([^\]]*)\]/g)].flatMap((m) =>
        [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]),
      ),
    ]);
    const firstClass = new Set(
      [...(/_FIRST_CLASS_FIELDS = \[([\s\S]*?)\]/.exec(engine) ?? [, ''])[1].matchAll(/'([^']+)'/g)].map(
        (m) => m[1],
      ),
    );
    return { ids, fields, firstClass };
  };

  /**
   * Controls that are not Search criteria at all, classified with a reason.
   * These are financial calculators and typeahead companions — they compute or
   * assist, they do not ask the provider a question.
   */
  const NOT_A_CRITERION = [
    /^(mortgage|calc|rvb)/, // mortgage / investment / rent-vs-buy calculators
    /^(enableInvestmentFilter|enableRentVsBuy|showClosingCosts|closingPropType|closingBuildingStatus)$/,
    /Custom$/, // the "Custom" companion input beside a range select
    /NeighborhoodInput$/, // typeahead box; the TAGS carry the criterion
  ];

  /**
   * Is the structural refusal for handle-less controls actually declared?
   * Checked, not assumed — the previous version exempted them on reasoning
   * alone, which is how 356 clickable-but-unreadable controls stayed invisible.
   */
  // Plain substring checks: the selectors are full of regex metacharacters, and
  // an escaping slip here would silently make this FALSE and the exemption
  // unavailable — or worse, silently TRUE against nothing.
  const HANDLE_LESS_REFUSED = [
    'input[type="checkbox"]:not([id]):not([data-field])',
    '#searchBasicMode input:not([id]):not([data-field])',
    '#searchBasicModeRental input:not([id]):not([data-field])',
    '#searchBasicModeBuilding input:not([id]):not([data-field])',
    '#searchAdvancedMode input:not([id]):not([data-field])',
    '#searchAdvancedMode select:not([id]):not([data-field])',
  ].every((selector) => deadControls.includes(selector));

  it('declares a structural refusal for handle-less controls', () => {
    expect(HANDLE_LESS_REFUSED).toBe(true);
  });

  it('classifies every enabled searchable control', () => {
    const { ids: deadIds, idAnchors, fields: deadFields, attrs } = refusals();
    const { ids: ownedIds, fields: ownedFields, firstClass } = ownership();

    const start = formHtml.indexOf('id="searchBasicMode"');
    const end = formHtml.indexOf('id="comparablesSection"');
    const surfaces = formHtml.slice(start, end > 0 ? end : formHtml.length);
    const tags = [...surfaces.matchAll(/<(input|select)\b[^>]*>/g)].map((m) => m[0]);

    const unowned: string[] = [];
    for (const tag of tags) {
      if (/type="hidden"/.test(tag)) continue;
      const id = /id="([^"]+)"/.exec(tag)?.[1];
      const field = /data-field="([^"]+)"/.exec(tag)?.[1];
      const value = /data-value="([^"]*)"/.exec(tag)?.[1];

      // ── refused ──
      if (id && deadIds.has(id)) continue;
      if (id && idAnchors.some((a) => id.startsWith(a.replace(/-north$/, '')))) continue;
      if (field && deadFields.has(field)) continue;
      if (attrs.some((a) => new RegExp(`\\b${a}\\b`).test(tag))) continue;
      if (value && /^(lte|gte|gt|eq):/.test(value)) continue;
      if (value === 'Any') continue;

      // ── owned ──
      if (id && ownedIds.has(id)) continue;
      if (field && ownedFields.has(field)) continue;
      // The feature-map adapter generically owns every non-first-class family.
      if (field && !firstClass.has(field)) continue;

      // ── not a criterion ──
      if (id && NOT_A_CRITERION.some((re) => re.test(id))) continue;

      // CRM-local flags never travel to the provider by design, and the refusal
      // module disables them by attribute selector.
      if (/data-local-field="/.test(tag)) continue;

      // A handle-less CHECKBOX is refused structurally by the dead-control
      // module — see the `:not([id]):not([data-field])` selector there.
      //
      // This used to `continue` on "no id and no data-field" with the reasoning
      // that such a control cannot carry a criterion. That was a third state
      // wearing a justification: unreadable is not the same as not-a-criterion.
      // Top Floor, Duplex, Penthouse, Concierge, Resale and New Conversion are
      // all real filters an agent can click, and being unreadable is precisely
      // what makes them silent — the defect, not the exemption.
      // A handle-less control is REFUSED, and this checks the refusal is really
      // declared rather than assuming it.
      //
      // The guard used to `continue` here on the reasoning that a control with no
      // id and no data-field "cannot carry a criterion". That was a third state
      // wearing a justification: unreadable is not the same as not-a-criterion.
      // Top Floor, Duplex, Penthouse, Concierge, Resale, New Conversion, "Unit
      // #", "School Name" and "Min SF" are all real filters an agent can click,
      // and being unreadable is exactly what makes them silent — the defect, not
      // the exemption.
      if (!id && !field) {
        if (HANDLE_LESS_REFUSED) continue;
        unowned.push(`handle-less: ${tag.slice(0, 60)}`);
        continue;
      }

      unowned.push(id ? `#${id}` : `[data-field="${field}"]`);
    }

    expect([...new Set(unowned)]).toEqual([]);
  });

  it('found controls to classify at all — guard the guard', () => {
    // A parse that matched nothing would pass the assertion above vacuously,
    // which is exactly how the forward-only guard let #adv-dom-min through.
    const start = formHtml.indexOf('id="searchBasicMode"');
    const tags = [...formHtml.slice(start).matchAll(/<(input|select)\b[^>]*>/g)];
    expect(tags.length).toBeGreaterThan(500);
  });

  it('refuses the Days-on-Market controls that had no owner', () => {
    expect(deadControls).toMatch(/#adv-dom-min/);
    expect(deadControls).toMatch(/#adv-dom-max/);
  });

  it('refuses GarageYN rather than equating it with canonical parking', () => {
    // GarageYN is NOT generic parking and the registry records parking's
    // semantic equivalence as unproven. Wiring garage into a canonical `parking`
    // criterion would equate two different facts.
    expect(deadControls).toMatch(/GarageYN is not generic Parking/);
  });
});

describe('the collector no longer keeps a private id table', () => {
  it('reads Quick Search and keyword from canonical state', () => {
    // A second id table is what allowed the first one to be wrong without
    // anything disagreeing with it.
    // The whole legacy reconstruction is gone — 488 lines that re-read the DOM
    // and rebuilt the business question a second time after canonical
    // serialization had already produced it. What remains is one serializer.
    expect(engine).toContain('serializeCanonicalToWire(currentSearchTab, criteria)');
    expect(engine).toContain('THE LEGACY DOM RECONSTRUCTION IS GONE');
    expect(engine).not.toMatch(/var rlsInputId, zipInputId, unitInputId;/);
  });
});
