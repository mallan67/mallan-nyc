/**
 * One selection authority (Domain 2, 2026-09-08) — ratchet.
 *
 * Every provider field list the program sends must be a contract-typed constant (`cotalityFields(...)`,
 * compile-checked against the live $metadata) exported by the module that interprets the rows:
 *   - Media      → `MEDIA_SELECT_FIELDS`                lib/media/listing-media-resolver.ts (the one media resolver)
 *   - OpenHouse  → `OPEN_HOUSE_SELECT_FIELDS`           lib/open-houses/upcoming-open-houses.ts (shared scope constants)
 *   - Property in an OpenHouse query → `OPEN_HOUSE_PROPERTY_SELECT_FIELDS` (same module)
 *   - Property location facts → `CANONICAL_LOCATION_SELECT_FIELDS` lib/listings/canonical-location.ts
 *   - Property sync / search / card → IDX_PLUS_SELECT_FIELDS / SEARCH_SELECT_FIELDS / CARD_SELECT_FIELDS (unchanged)
 *
 * A string literal `$select` with two or more field names cannot be compile-checked and drifts (the census
 * of 2026-09-08 found four Media sites selecting fewer fields than the shared resolver reads, and three
 * byte-identical OpenHouse lists). This test fails on any new literal multi-field select in runtime code.
 * `lib/idx/sync.ts` is HELD (charter: "Do not touch IDX sync without explicit authorization") and keeps
 * its three literal Media selects until Maya releases the hold — listed here, not hidden.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (!['node_modules', '__tests__', '.next'].includes(ent.name)) walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) out.push(rel);
  }
  return out;
}

/** Provider $select literals with 2+ PascalCase field names (Cotality only — Graph/Facebook selects are excluded). */
const LITERAL_SELECT = /\$select(?:['"`]?\s*[,:=]\s*|=)['"`]?[A-Z][A-Za-z0-9]*(?:,[A-Z][A-Za-z0-9]*)+/g;
const NOT_COTALITY = [/^lib\/outlook\//, /^app\/api\/auth\//];

/** Held module — literal selects tolerated until the IDX-sync hold is lifted (charter §IDX sync). */
const HELD: Record<string, number> = { 'lib/idx/sync.ts': 3 };

describe('provider select authority — no literal multi-field $select outside the held sync module', () => {
  const files = [...walk('app'), ...walk('lib')].filter((f) => !NOT_COTALITY.some((re) => re.test(f)));

  it('every runtime provider select is a contract-typed constant (literal lists appear only in the held module)', () => {
    const offenders: Record<string, number> = {};
    for (const f of files) {
      const src = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const n = (src.match(LITERAL_SELECT) || []).length;
      if (n > 0) offenders[f] = n;
    }
    expect(offenders).toEqual(HELD);
  });

  it('the Media authority is exported by the one media resolver and consumed by every Media query site', () => {
    expect(read('lib/media/listing-media-resolver.ts')).toMatch(/export const MEDIA_SELECT_FIELDS = cotalityFields\('Media'/);
    for (const f of [
      'lib/idx/fetch.ts',
      'lib/idx/media-sync.ts',
      'lib/search/engine/hydrate.ts',
      'app/api/media/batch/route.ts',
      'app/api/agents/[slug]/listings/route.ts',
      'lib/buildings/public-building-data.ts',
      'app/api/cron/feed-reconcile/route.ts',
    ]) {
      expect(read(f)).toMatch(/MEDIA_SELECT_FIELDS/);
    }
  });

  it('the OpenHouse authorities are exported by the shared open-house scope module and consumed by the route', () => {
    const scope = read('lib/open-houses/upcoming-open-houses.ts');
    expect(scope).toMatch(/export const OPEN_HOUSE_SELECT_FIELDS = cotalityFields\('OpenHouse'/);
    expect(scope).toMatch(/export const OPEN_HOUSE_PROPERTY_SELECT_FIELDS = cotalityFields\('Property'/);
    const route = read('app/api/open-houses/route.ts');
    expect(route).toMatch(/OPEN_HOUSE_SELECT_FIELDS/);
    expect(route).toMatch(/OPEN_HOUSE_PROPERTY_SELECT_FIELDS/);
  });

  it('the public search open-house facet only counts PUBLIC, active open houses (never broker-only or private events)', () => {
    const scope = read('lib/open-houses/upcoming-open-houses.ts');
    expect(scope).toMatch(/export const OPEN_HOUSE_PUBLIC_FILTER = "OpenHouseType eq 'Public' and OpenHouseStatus eq 'Active'"/);
    const listings = read('app/api/listings/route.ts');
    const facetQueries = listings.match(/ohParams\.set\('\$filter'[^\n]*\)/g) || [];
    expect(facetQueries.length).toBeGreaterThanOrEqual(2);
    for (const q of facetQueries) expect(q).toMatch(/OPEN_HOUSE_PUBLIC_FILTER/);
  });

  it('the location select is exported by the canonical location interpreter and feeds the suggest route', () => {
    expect(read('lib/listings/canonical-location.ts')).toMatch(/export const CANONICAL_LOCATION_SELECT_FIELDS = cotalityFields\('Property'/);
    expect(read('app/api/listings/suggest/route.ts')).toMatch(/\.\.\.CANONICAL_LOCATION_SELECT_FIELDS/);
  });
});
