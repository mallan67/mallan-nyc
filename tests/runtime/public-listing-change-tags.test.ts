/**
 * COMMIT 7B-2A — media-driven building/manifest invalidation.
 *
 * Building-manifest payloads carry public photo state (`primary_photo_url`), so
 * a MEDIA change can alter a building payload with NO material Listing
 * source-field write.
 *
 * Invalidation used to live only inside the Listing-write branch of
 * `syncListings`, so BOTH media writers expired the listing tag and nothing
 * else:
 *
 *   lib/idx/sync.ts       legacy Listing.media loop  -> listing tag only
 *   lib/idx/media-sync.ts summary writer (:1616)     -> listing tag only
 *
 * That was invisible while every PhotosChangeTimestamp movement forced a
 * Listing write. Suppressing that write (the write-amplification fix) would have
 * turned it into a STALE MANIFEST bug — a cost saving paid for with a
 * correctness regression. Hence: fix invalidation FIRST, suppress writes second.
 */

import { publicListingChangeTags } from '@/lib/cache/public-listing-change-tags';
import {
  listingCacheTag,
  manifestShardForAddress,
  manifestShardTag,
} from '@/lib/cache/public-cache';

const ADDR_A = {
  StreetNumber: '519', StreetName: 'Monroe Street', City: 'New York City',
  StateOrProvince: 'NY', PostalCode: '11221',
};
const ADDR_B = {
  StreetNumber: '217', StreetName: 'W 57th Street', City: 'New York City',
  StateOrProvince: 'NY', PostalCode: '10019',
};

describe('a media-only change expires more than the listing tag', () => {
  const { tags, shards } = publicListingChangeTags('RLS20105333', ADDR_A, ADDR_A);

  it('includes the listing tag', () => {
    expect(tags).toContain(listingCacheTag('RLS20105333'));
  });

  it('includes the manifest shard tag for the current address', () => {
    const shard = manifestShardForAddress(ADDR_A);
    expect(shard).toBeTruthy();
    expect(tags).toContain(manifestShardTag(shard as string));
  });

  it('reports the affected shard so it can be warmed/accounted', () => {
    expect(shards).toContain(manifestShardForAddress(ADDR_A) as string);
  });

  it('expires MORE than just the listing tag — the actual defect', () => {
    expect(tags.length).toBeGreaterThan(1);
  });
});

describe('an address transition still expires BOTH buildings', () => {
  const { tags, shards } = publicListingChangeTags('RLS20105333', ADDR_A, ADDR_B);

  it('covers both shards', () => {
    const a = manifestShardForAddress(ADDR_A) as string;
    const b = manifestShardForAddress(ADDR_B) as string;
    expect(shards).toEqual(expect.arrayContaining([a, b]));
    expect(tags).toEqual(
      expect.arrayContaining([manifestShardTag(a), manifestShardTag(b)]),
    );
  });

  it('the old building is not lost when a media change also occurs', () => {
    // Callers accumulate into Sets, so an address change and a media change on
    // the same listing in one cycle union rather than overwrite.
    const union = new Set<string>();
    for (const t of publicListingChangeTags('X', ADDR_A, ADDR_B).tags) union.add(t);
    for (const t of publicListingChangeTags('X', ADDR_B, ADDR_B).tags) union.add(t);
    expect(union).toContain(manifestShardTag(manifestShardForAddress(ADDR_A) as string));
    expect(union).toContain(manifestShardTag(manifestShardForAddress(ADDR_B) as string));
  });
});

describe('degenerate input does not throw or invent tags', () => {
  it('null/undefined addresses still yield the listing tag', () => {
    const { tags, shards } = publicListingChangeTags('RLS1', null, undefined);
    expect(tags).toContain(listingCacheTag('RLS1'));
    expect(shards).toEqual([]);
  });
});

describe('source lock — both media writers use the shared computation', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) =>
    fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8').replace(/\r\n?/g, '\n');
  const sync = read('lib/idx/sync.ts');
  const mediaSync = read('lib/idx/media-sync.ts');

  it('sync.ts routes ALL public listing changes through one helper', () => {
    expect(sync).toMatch(/import \{ publicListingChangeTags \}/);
    expect(sync).toMatch(/function recordPublicListingChange\(/);
    // The listing-write branch and the legacy media loop both call it.
    expect((sync.match(/recordPublicListingChange\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('sync.ts no longer inlines the tag computation in the write branch', () => {
    const code = sync.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const helperStart = code.indexOf('function recordPublicListingChange');
    const helperEnd = code.indexOf('export async function syncListings');
    const outside = code.slice(0, helperStart) + code.slice(helperEnd);
    // buildingInvalidationTags / manifestShardTag are used ONLY inside the
    // shared module now — not re-inlined anywhere else in sync.ts.
    expect(outside).not.toMatch(/buildingInvalidationTags\(/);
    expect(outside).not.toMatch(/manifestShardTag\(/);
  });

  it('media-sync.ts summary writer uses the shared computation, not a bare listing tag', () => {
    // The import is now multi-line because the writer also consumes
    // `PublicListingChangeScope` — it must still be the SHARED owner, never a
    // locally composed tag array.
    expect(mediaSync).toMatch(
      /import \{[\s\S]{0,200}?publicListingChangeTags[\s\S]{0,200}?\} from ['"]@\/lib\/cache\/public-listing-change-tags['"]/,
    );
    // The call now carries an explicit SCOPE: a gallery change that leaves the
    // hero output identical expires the listing alone, because the manifest
    // projection reads only hero state. Hero changes still expire all three.
    expect(mediaSync).toMatch(
      /publicListingChangeTags\(listingId, stored\?\.address, stored\?\.address, scope\)/,
    );
    expect(mediaSync).not.toMatch(/safeRevalidateTags\(\[listingCacheTag\(listingId\)\]/);
  });

  it('the scope is derived from the classified public change, not hardcoded', () => {
    // Guards against someone pinning the scope to 'listing-only' and silently
    // stranding building/manifest payloads on a real hero change.
    expect(mediaSync).toMatch(
      /decision\.publicChange === 'public-hero' \? 'listing-building-manifest' : 'listing-only'/,
    );
  });

  it('a provenance-only change emits NO tags at all', () => {
    // The write-amplification fix: storage advances, public cache untouched.
    expect(mediaSync).toMatch(/if \(decision\.publicChange === 'provenance-only'\)/);
  });

  it('INVARIANT: a manifest shard tag is never emitted without the exact building tag', () => {
    // This is what makes it SAFE for `getBuildingDataCached` to carry only its
    // building tag while consuming a shard-tagged manifest page.
    //
    // The outer building payload deliberately does NOT carry the shard tag: a
    // shard is the first character of the street number (~10% of all
    // buildings), so tagging every payload with it would expire a tenth of the
    // site on one listing change — the exact crawler-wake amplification this
    // work removes, and the opposite of what
    // `neon-quiet-distinct-buildings.test.ts` pins.
    //
    // Safety instead comes from both tag families being derived from the SAME
    // address list in ONE function, so they cannot diverge.
    const addr = { StreetNumber: '400', StreetName: 'East 90th Street', PostalCode: '10128' };
    const { tags, shards } = publicListingChangeTags('RLS1', addr, addr);

    expect(shards.length).toBeGreaterThan(0);
    for (const shard of shards) {
      expect(tags).toContain(manifestShardTag(shard));
    }
    // …and the exact building tag rides along in the same emission.
    expect(tags.some((t) => t.startsWith('building:'))).toBe(true);
    expect(tags).toContain(listingCacheTag('RLS1'));
  });

  it('listing-only scope emits NEITHER a building nor a manifest shard tag', () => {
    const addr = { StreetNumber: '400', StreetName: 'East 90th Street', PostalCode: '10128' };
    const { tags, shards } = publicListingChangeTags('RLS1', addr, addr, 'listing-only');

    expect(tags).toEqual([listingCacheTag('RLS1')]);
    expect(shards).toEqual([]);
  });

  it('the media loop widened an EXISTING select rather than adding a query', () => {
    expect(sync).toMatch(/select: \{ media: true, address: true \}/);
    expect(mediaSync).toMatch(/photos_change_timestamp: true,\n\s*\/\/[\s\S]{0,240}?address: true,/);
  });
});
