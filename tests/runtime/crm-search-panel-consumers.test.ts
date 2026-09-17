/// <reference types="jest" />
export {};
/**
 * EVERY CONSUMER OF THE BASIC SEARCH PANEL MUST FOLLOW THE ACTIVE TAB.
 *
 * Until 2026-09-09 there was one basic panel, `#searchBasicMode`, and the Rentals and Buildings tabs
 * rendered it. That was fixed: each tab now owns its own panel and `_basicPanelIdFor(tab)` resolves it.
 *
 * But two consumers were left on the old "one unified basic form" assumption, and both are user-visible:
 *
 *   - `clearSearchForm()` reset only `#searchBasicMode`, so pressing Clear on a rental or building search
 *     left every field of the visible panel populated. The next search silently reused them.
 *   - `updateFilterCount()` counted only `#searchBasicMode`, so the sticky bar's filter count described the
 *     hidden sale panel while the agent was looking at the rental one.
 *
 * This is the same defect class as the original bug, in its consumers rather than its toggle, which is why
 * it survived a green suite. The tests below EXECUTE the shipped functions against a DOM that has all three
 * panels and assert on the resulting DOM state, not on source text.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const ENGINE = readFileSync(resolve(ROOT, 'public/crm/js/search/search-engine.js'), 'utf8');

/** Lift a shipped top-level function out of the bundle by brace matching, so the TEST runs the REAL code. */
function lift(name: string): string {
  const start = ENGINE.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = ENGINE.indexOf('{', start); i < ENGINE.length; i++) {
    if (ENGINE[i] === '{') depth++;
    else if (ENGINE[i] === '}') { depth--; if (depth === 0) return ENGINE.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** A page with all three basic panels; `visible` is the one the active tab shows. */
function pageWithPanels(visible: 'searchBasicMode' | 'searchBasicModeRental' | 'searchBasicModeBuilding') {
  const panel = (id: string) => `
    <div id="${id}" style="display:${id === visible ? 'block' : 'none'}">
      <select id="${id}-sel"><option value="">Any</option><option value="2" selected>2</option></select>
      <input type="text" id="${id}-txt" value="filled" />
      <input type="checkbox" id="${id}-cb" checked data-field="StandardStatus" data-value="Closed" />
    </div>`;
  const dom = new JSDOM(
    `<div id="searchAdvancedMode" style="display:none"></div>
     ${panel('searchBasicMode')}${panel('searchBasicModeRental')}${panel('searchBasicModeBuilding')}
     <span id="activeFilterCount"></span>`,
    { runScripts: 'outside-only' },
  );
  const w = dom.window as unknown as Record<string, unknown>;
  w.currentSearchTab = visible === 'searchBasicModeRental' ? 'rent' : visible === 'searchBasicModeBuilding' ? 'building' : 'sale';
  w.updateFilterCount = () => {};
  w.updateResultsCount = () => {};
  w.renderStatusPanels = () => {};
  dom.window.eval(lift('_basicPanelIdFor'));
  return dom;
}

const filled = (doc: Document, id: string) => ({
  select: (doc.getElementById(`${id}-sel`) as HTMLSelectElement).selectedIndex > 0,
  text: (doc.getElementById(`${id}-txt`) as HTMLInputElement).value !== '',
});

describe('Clear resets the panel the agent is actually looking at', () => {
  it.each([
    ['rent', 'searchBasicModeRental'],
    ['building', 'searchBasicModeBuilding'],
    ['sale', 'searchBasicMode'],
  ] as const)('the %s tab: Clear empties %s', (_tab, panelId) => {
    const dom = pageWithPanels(panelId as never);
    dom.window.eval(lift('clearSearchForm'));
    const before = filled(dom.window.document, panelId);
    expect(before).toEqual({ select: true, text: true }); // the fixture really is populated
    (dom.window as unknown as { clearSearchForm: () => void }).clearSearchForm();
    expect(filled(dom.window.document, panelId)).toEqual({ select: false, text: false });
  });
});

describe('the filter count describes the visible panel', () => {
  it.each([
    ['rent', 'searchBasicModeRental'],
    ['building', 'searchBasicModeBuilding'],
  ] as const)('the %s tab counts %s, not the hidden sale panel', (_tab, panelId) => {
    const dom = pageWithPanels(panelId as never);
    // Empty the SALE panel completely. If a count still appears, the function read the RIGHT panel.
    const sale = dom.window.document.getElementById('searchBasicMode')!;
    (sale.querySelector('select') as HTMLSelectElement).selectedIndex = 0;
    (sale.querySelector('input[type="text"]') as HTMLInputElement).value = '';
    (sale.querySelector('input[type="checkbox"]') as HTMLInputElement).checked = false;

    dom.window.eval(lift('updateFilterCount'));
    (dom.window as unknown as { updateFilterCount: () => void }).updateFilterCount();

    // The visible panel still holds a select + a text input + a non-default status checkbox.
    const shown = dom.window.document.getElementById('activeFilterCount')!.textContent ?? '';
    expect(shown).toMatch(/filters? applied/);
    expect(shown).not.toBe('No filters');
  });

  it('the sale tab still counts the sale panel', () => {
    const dom = pageWithPanels('searchBasicMode');
    dom.window.eval(lift('updateFilterCount'));
    (dom.window as unknown as { updateFilterCount: () => void }).updateFilterCount();
    expect(dom.window.document.getElementById('activeFilterCount')!.textContent).toMatch(/filters? applied/);
  });
});
