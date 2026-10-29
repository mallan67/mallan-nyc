/// <reference types="jest" />
/**
 * Integration 2026-10-28 — the 2026-10-15 "search on any Cotality field" implementation
 * (js/search/field-filters.js + search-field-catalog.js, lib/search/field-filters.ts,
 * lib/search/open-house-keys.ts, js/core/concept-map.js) is retired: the generated
 * live-contract controls of the Search form (init-disable-dead-controls.js, "All Cotality
 * Fields", lib/search/crm-idx-filter.ts) and the OpenHouse / Member / Office joins cover the
 * same ground with refusal semantics. Nothing live may load or import the retired modules.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('retired any-field search modules', () => {
  it.each([
    'lib/search/field-filters.ts',
    'lib/search/open-house-keys.ts',
    'public/crm/js/search/field-filters.js',
    'public/crm/js/search/search-field-catalog.js',
    'public/crm/js/core/concept-map.js',
    'scripts/cotality/build-search-catalog.mjs',
  ])('%s is gone', (rel) => {
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
  });

  it('the search page loads none of them', () => {
    const html = read('public/crm/index.html');
    expect(html).not.toMatch(/field-filters\.js|search-field-catalog\.js|concept-map\.js/);
  });

  it('the search engine, saved searches and the template no longer reference CotalityFieldFilters', () => {
    for (const rel of ['public/crm/js/search/search-engine.js', 'public/crm/js/search/saved-searches.js', 'public/crm/html/search-form-and-results.html']) {
      expect(read(rel)).not.toMatch(/CotalityFieldFilters|cotalityFieldFilterRows|field_filters/);
    }
  });

  it('the search page loads the session field map (reso-field-map.js) before the renderers that call its getListingPhoto', () => {
    // concept-map.js defined getListingPhoto on the convergence line; the retirement left the gallery without it until the
    // session module was loaded in its place (found in the visible browser, 2026-10-28: renderSearchResults FAILED).
    const tags = [...read('public/crm/index.html').matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
    const map = tags.indexOf('js/core/reso-field-map.js');
    expect(map).toBeGreaterThanOrEqual(0);
    for (const renderer of ['js/render/render-gallery.js', 'js/render/render-summary.js', 'js/render/render-short-summary.js', 'js/render/render-master-detail.js', 'js/output/reports.js']) {
      const at = tags.indexOf(renderer);
      expect({ renderer, loaded: at >= 0, afterFieldMap: at > map }).toEqual({ renderer, loaded: true, afterFieldMap: true });
    }
    expect(read('public/crm/js/core/reso-field-map.js')).toMatch(/function getListingPhoto\(/);
  });

  it('the search route imports neither module', () => {
    const route = read('app/api/idx/search/route.ts');
    expect(route).not.toMatch(/lib\/search\/field-filters|lib\/search\/open-house-keys/);
  });

  it('the generated live-contract controls remain the one "every field" implementation', () => {
    expect(read('public/crm/html/search-form-and-results.html')).toContain('id="advAllCotalityFields"');
    expect(read('public/crm/js/init/init-disable-dead-controls.js')).toMatch(/data-generated-cotality/);
  });
});
