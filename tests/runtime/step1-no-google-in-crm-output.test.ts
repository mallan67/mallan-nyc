/// <reference types="jest" />
/**
 * STEP 1, ITEM 5 — NO GOOGLE IN AUTHENTICATED CRM / REPORT OUTPUT.
 *
 * Six sites emitted `https://maps.google.com/?q=<address>` into broker reports:
 *
 *   reports.js:1301        listing links block        UNGATED
 *   reports.js:1764        open-house links block     gated by googleMapLink
 *   reports.js:2637        per-listing detail block   UNGATED
 *   report-package.js:573, :766, :936                 same three, second copy
 *
 * Two of the three in the live generator ran regardless of the "Google Map
 * Link" report option, so a broker who left that box unchecked still sent a
 * client a report whose only mapping link went to Google — carrying the
 * property address in the query string of a third party's URL.
 *
 * Mallan's map capability is MapLibre/OpenFreeMap (js/render/results-map.js,
 * js/render/neighborhood-map.js). Those are in-app panels, not URL-addressable
 * per-listing routes, so there is nothing to link a static report to — and per
 * the instruction, Google is not swapped for a different outside location
 * authority. The link and its option are removed; the report keeps the address.
 *
 * Scope is exactly as stated: authenticated CRM / report output. Findings on
 * the CONSUMER site (a Google Maps iframe embed in NeighborhoodExplorer, and
 * app/api/transit/commute forwarding a typed address to Google's Directions
 * API) are reported to Maya, not changed here — Step 1 excludes Consumer Search.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

const CRM_OUTPUT_FILES = [
  'public/crm/js/output/reports.js',
  'public/crm/js/output/report-package.js',
  'public/crm/html/modals/reports.html',
  'public/crm/js/core/data-loader.js',
];

/** Executable/markup lines only — a comment naming the removed link is not the link. */
const code = (rel: string) =>
  readFileSync(join(REPO, rel), 'utf8')
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join(String.fromCharCode(10));

describe('no Google link leaves the CRM in a report', () => {
  it.each(CRM_OUTPUT_FILES)('%s emits no maps.google.com URL', (rel) => {
    expect(code(rel)).not.toMatch(/maps\.google\.com/);
  });

  it.each(CRM_OUTPUT_FILES)('%s emits no google.com/maps URL', (rel) => {
    expect(code(rel)).not.toMatch(/google\.com\/maps/);
  });

  it.each(CRM_OUTPUT_FILES)('%s offers no Google Map report option', (rel) => {
    expect(code(rel)).not.toMatch(/googleMapLink/);
  });

  it('the report options modal no longer shows a Google Map Link checkbox', () => {
    expect(code('public/crm/html/modals/reports.html')).not.toMatch(/Google Map/i);
  });
});

describe('the built page a broker actually loads carries none of it', () => {
  /** Same comment filter as above — the note explaining the removal is inlined too. */
  const built = () =>
    readFileSync(join(REPO, 'public/crm/index-built.html'), 'utf8')
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith('//'))
      .join(String.fromCharCode(10));

  it('serves no maps.google.com link', () => {
    expect(built()).not.toMatch(/maps\.google\.com/);
  });

  it('serves no Google Map Link option', () => {
    expect(built()).not.toMatch(/Google Map Link/);
  });

  it('serves no Google Map anchor text', () => {
    expect(built()).not.toMatch(/>Google Map</);
  });
});

describe("Mallan's own map capability is untouched", () => {
  it.each([
    'public/crm/js/render/results-map.js',
    'public/crm/js/render/neighborhood-map.js',
  ])('%s still uses the MapLibre/OpenFreeMap stack', (rel) => {
    const src = readFileSync(join(REPO, rel), 'utf8');
    expect(src).toMatch(/maplibre|openfreemap/i);
  });
});
