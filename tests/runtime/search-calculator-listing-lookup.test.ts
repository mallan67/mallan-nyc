/// <reference types="jest" />
/**
 * Search app calculators — the listing the calculator opens for is found.
 *
 * Observed 2026-10-28: openCalculatorModal('mortgage', 'RLS20103853') from a
 * result card opened with an empty purchase price. getCalcListing() looked only
 * in window.allListings, which the search page never sets; the results live in
 * searchResultsState.filteredListings and the cards carry listing.id.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const src = fs.readFileSync(path.resolve(__dirname, '../../public/crm/js/output/calculators.js'), 'utf8');
const start = src.indexOf('function getCalcListing(');
const end = src.indexOf('\nfunction calcVal(', start);
const fnSource = src.slice(start, end);

function run(ctxVars: Record<string, unknown>, id: unknown) {
  const ctx: Record<string, unknown> = { window: {}, ...ctxVars, _calcListingId: id };
  (ctx.window as Record<string, unknown>).allListings = ctxVars.allListings;
  vm.createContext(ctx);
  vm.runInContext(fnSource + '; this.result = getCalcListing();', ctx);
  return ctx.result as Record<string, unknown> | null;
}

describe('getCalcListing', () => {
  const results = [{ id: 'RLS20103853', lid: 'RLS20103853', price: 1150000, maintCC: 837 }, { id: 'RLS20114126', price: 1395000 }];

  test('finds the result the card points at in searchResultsState.filteredListings', () => {
    const hit = run({ searchResultsState: { filteredListings: results } }, 'RLS20103853');
    expect(hit && hit.price).toBe(1150000);
  });

  test('matches a numeric id against a string id', () => {
    const hit = run({ searchResultsState: { filteredListings: [{ id: 1177100986, price: 5 }] } }, '1177100986');
    expect(hit && hit.price).toBe(5);
  });

  test('still honours window.allListings when a page sets it', () => {
    const hit = run({ allListings: [{ id: 'X1', price: 9 }] }, 'X1');
    expect(hit && hit.price).toBe(9);
  });

  test('returns null when nothing matches or no id is set', () => {
    expect(run({ searchResultsState: { filteredListings: results } }, 'nope')).toBeNull();
    expect(run({ searchResultsState: { filteredListings: results } }, null)).toBeNull();
  });
});
