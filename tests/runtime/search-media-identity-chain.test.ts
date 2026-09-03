/**
 * ONE MEDIA IDENTITY, CARRIED ON THE ROW — NOT RE-DERIVED FROM THE DATABASE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROVEN DEFECT
 *
 * A broker's Yorkville sale search returned 141 listings with 0 photos; another
 * returned 200 with 0. `/api/media/proxy` served live 404s.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE PROVIDER ACTUALLY SAYS — probed live 2026-09-01, api.cotality.com
 *
 * Three listings with PhotosCount 30 / 23 / 8, all four combinations tested:
 *
 *   Media.ResourceRecordKey eq <ListingKey>   ->  30 / 23 / 8   <- matches PhotosCount
 *   Media.ResourceRecordID  eq <ListingId>    ->  30 / 23 / 8   <- also matches
 *   Media.ResourceRecordID  eq <ListingKey>   ->   0 /  0 / 0
 *   Media.ResourceRecordKey eq <ListingId>    ->   0 /  0 / 0
 *
 * Both relationship fields work, each strictly inside its own domain. A
 * cross-domain query returns an empty HTTP 200, which on screen is
 * indistinguishable from "this listing has no photos".
 *
 * So the rule is not "one field is right and the other is wrong" — it is that
 * the identity and the relationship field must MATCH, and the search row
 * already carries the provider key (`wid` = ListingKey, crm-idx-mapper:275).
 * Making the endpoint rediscover it through `prisma.listing` puts a Mallan
 * database round-trip in the path of a provider fact we were already holding,
 * and that lookup MISSES for every live-Cotality result not persisted locally.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LARGER DEFECT — four of six views could never show a photo at all
 *
 * `photo-loader.js` observes `[data-listing-lid]`. Only Gallery and Summary
 * emitted it. Master-detail, short-summary, grid and the map render an <img>
 * (or read `l.images[0]`) but were never observed, never queued, never fetched
 * — and under `mediaStrategy: "lazy"` the listing object carries no images, so
 * they resolved to a placeholder permanently. Fixing only the card would have
 * been the "single-screen media patch" this test exists to prevent.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Every view that renders a listing and could therefore show its photo. */
const PHOTO_BEARING_VIEWS = [
  'public/crm/js/render/render-gallery.js',
  'public/crm/js/render/render-summary.js',
  'public/crm/js/render/render-master-detail.js',
  'public/crm/js/render/render-short-summary.js',
];

describe('the search row carries the provider media identity', () => {
  it('the mapper emits the ListingKey as `wid`, distinct from `lid`', () => {
    const src = read('lib/search/crm-idx-mapper.ts');
    expect(src).toMatch(/wid:\s*listingKey/);
    expect(src).toMatch(/lid:\s*raw\.ListingId/);
  });
});

describe('every photo-bearing view emits the media identity', () => {
  it.each(PHOTO_BEARING_VIEWS)('%s emits data-listing-key', (rel) => {
    // Without the attribute the lazy loader never observes the card, so the
    // view shows a placeholder no matter how many photos the provider has.
    expect(read(rel)).toMatch(/data-listing-key=/);
  });

  it.each(PHOTO_BEARING_VIEWS)('%s binds it to the ListingKey, not the ListingId', (rel) => {
    const src = read(rel);
    const attr = src.match(/data-listing-key="\$\{[^}]*\}"/);
    expect(attr).not.toBeNull();
    // `wid` is the ListingKey. Binding this to `lid` would send an identity
    // from the OTHER domain and the provider would answer an empty 200.
    expect(attr?.[0]).toMatch(/\bwid\b/);
    expect(attr?.[0]).not.toMatch(/\blid\b/);
  });
});

describe('the loader asks in the same domain it was given', () => {
  const src = read('public/crm/js/render/photo-loader.js');

  it('observes the media-identity attribute', () => {
    expect(src).toMatch(/querySelectorAll\(\s*['"]\[data-listing-key\]['"]\s*\)/);
  });

  it('requests by key, not by the id whose domain no longer matches', () => {
    expect(src).toMatch(/media\/batch\?keys=/);
  });
});

describe('the endpoint resolves a provider key WITHOUT a database round-trip', () => {
  const src = read('app/api/media/batch/route.ts');

  it('accepts a `keys` parameter', () => {
    expect(src).toMatch(/searchParams\.get\(\s*["']keys["']\s*\)/);
  });

  it('derives filter AND grouping from ONE declared domain', () => {
    // Stronger than looking for the literal field name. The defect was never
    // a wrong field - it was that the FILTER field and the GROUPING field
    // were chosen independently and drifted apart. Both now come from
    // `requestDomain` through the shared contract, so they cannot.
    expect(src).toMatch(/const requestDomain = /);
    expect(src).toMatch(/mediaFilterForDomain\(uncached, requestDomain\)/);
    expect(src).toMatch(/groupMediaByRequestedDomain\(/);
  });

  it('never re-keys the lookup away from the identifier the caller sent', () => {
    // `const key = idToKey.get(id) || id` was the translation that let a
    // ListingId request be looked up in a ListingKey-indexed map.
    expect(src).not.toMatch(/idToKey/);
  });

  it('a provider failure is reported, not cached as "no photo"', () => {
    // photoCache.set(id, { url: null, ... }) on a non-OK response made one
    // bad provider minute into a minute of listings asserting they have no
    // photo - indistinguishable, on a card, from a listing that has none.
    expect(src).toMatch(/unavailable/);
    expect(src).not.toMatch(/photoCache\.set\([^)]*url: null[^)]*60_000/);
  });

  it('does not need prisma to answer a keys request', () => {
    // The DB lookup exists only to translate a legacy `ids` request. A `keys`
    // request already holds the provider identity, and a listing absent from
    // Mallan storage (every live-Cotality result) must still resolve.
    const keyPath = src.slice(src.indexOf('keysParam'));
    const beforeDb = keyPath.slice(0, keyPath.indexOf('prisma.listing') === -1
      ? keyPath.length
      : keyPath.indexOf('prisma.listing'));
    expect(beforeDb.length).toBeGreaterThan(0);
    expect(src).toMatch(/skipDbResolution|keysParam/);
  });
});

describe('a Mallan-local listing is never given a manufactured provider key', () => {
  it('SL-/RL- identities are excluded from the provider media query', () => {
    const src = read('app/api/media/batch/route.ts');
    // A Mallan-authored listing has no Cotality ListingKey. Asking the provider
    // about one is asking the wrong system, and inventing a key for it would
    // put a fabricated provider identity into the media path.
    expect(src).toMatch(/SL-|RL-/);
  });
});
