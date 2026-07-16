/// <reference types="jest" />
/**
 * Neon public-DB-wakeups P0 — durable alias index + persistent caches.
 *
 * Proves the 10 required guarantees. Aliases resolve entirely from the mocked durable store
 * (no Prisma), suppression never leaks an address, unknown aliases 404 without a DB call,
 * a changed listing invalidates its own caches, and nothing caches a false 404.
 */
import fs from 'fs';
import path from 'path';

// In-memory Upstash mock (the whole durable surface these modules touch).
const store = new Map<string, unknown>();
jest.mock('@/lib/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); return 'OK'; }),
    del: jest.fn(async (...ks: string[]) => { let n = 0; for (const k of ks) if (store.delete(k)) n++; return n; }),
    incr: jest.fn(async (k: string) => { const n = (Number(store.get(k)) || 0) + 1; store.set(k, n); return n; }),
  },
}));

import {
  deriveAliasLookup, slugPartsFromPathname, lookupAlias, writeAliasEntries, aliasKeysForListing,
} from '@/lib/listings/alias-index';
import {
  cacheGetJson, cacheSetJson, cacheDel, listingsCacheVersion, bumpListingsCacheVersion,
} from '@/lib/cache/durable-cache';
import { refreshListingCaches, canonicalForListing, detailCacheKey } from '@/lib/cache/invalidate-listing';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const displayable = {
  listing_id: 'RLS20088635', mls_id: 'RLS20088635',
  address: { StreetNumber: '160', StreetName: 'Central Park', UnitNumber: '3410', City: 'New York City', StateOrProvince: 'NY', PostalCode: '10019' },
  postal_code: '10019', rls_eligible: true,
  internet_entire_listing_display_yn: true, internet_address_display_yn: true,
};
const suppressed = { ...displayable, internet_address_display_yn: false };

beforeEach(() => { store.clear(); delete process.env.ALIAS_INDEX_AUTHORITATIVE; });

describe('alias shape derivation (pure) + no redirect loop', () => {
  it('canonical two-segment and suppressed `listing-{id}` are NOT aliases', () => {
    expect(deriveAliasLookup(['160-central-park-apt-3410-new-york-city-ny-10019', 'rls20088635']).kind).toBe('canonical');
    expect(deriveAliasLookup(['listing-rls20088635']).kind).toBe('canonical');
  });
  it('id-only, hybrid, and address-only single segments are aliases', () => {
    expect(deriveAliasLookup(['rls20088635']).kind).toBe('alias');
    expect(deriveAliasLookup(['160-central-park-apt-3410-new-york-city-ny-10019-rls20088635']).kind).toBe('alias');
    expect(deriveAliasLookup(['400-east-90th-street-apt-17c-new-york-ny-10128']).kind).toBe('alias');
  });
  it('NO redirect loop: the canonical target of an alias is itself canonical (never re-redirects)', async () => {
    await writeAliasEntries('RLS20088635', canonicalForListing(displayable).addressSlug, canonicalForListing(displayable).canonicalPath);
    const key = deriveAliasLookup(['rls20088635']);
    const canonical = key.kind === 'alias' ? await lookupAlias(key.redisKey) : null;
    const canonParts = slugPartsFromPathname(canonical as string)!;
    expect(deriveAliasLookup(canonParts).kind).toBe('canonical'); // target renders, no loop
  });
});

describe('end-to-end alias → canonical (from the durable index, no DB)', () => {
  beforeEach(async () => {
    const { canonicalPath, addressSlug } = canonicalForListing(displayable);
    await writeAliasEntries(displayable.listing_id, addressSlug, canonicalPath);
  });
  async function resolve(seg: string): Promise<string | null | undefined> {
    const k = deriveAliasLookup([seg]);
    return k.kind === 'alias' ? lookupAlias(k.redisKey) : null;
  }
  it('ID-only valid alias resolves to the two-segment canonical', async () => {
    expect(await resolve('rls20088635')).toBe('/listing/160-central-park-apt-3410-new-york-city-ny-10019/rls20088635');
  });
  it('hybrid alias resolves to the SAME canonical', async () => {
    expect(await resolve('160-central-park-apt-3410-new-york-city-ny-10019-rls20088635')).toBe('/listing/160-central-park-apt-3410-new-york-city-ny-10019/rls20088635');
  });
  it('address-only alias resolves to the canonical', async () => {
    expect(await resolve('160-central-park-apt-3410-new-york-city-ny-10019')).toBe('/listing/160-central-park-apt-3410-new-york-city-ny-10019/rls20088635');
  });
});

describe('address suppression — no leak in the index or canonical', () => {
  it('a suppressed listing writes ONLY the id key (no address key) and an id-only canonical', async () => {
    const { canonicalPath, addressSlug } = canonicalForListing(suppressed);
    expect(canonicalPath).toBe('/listing/listing-rls20088635');
    expect(canonicalPath).not.toMatch(/central-park/i);
    expect(aliasKeysForListing('RLS20088635', addressSlug)).toEqual(['idx:alias:id:RLS20088635']); // no addr key
    await writeAliasEntries('RLS20088635', addressSlug, canonicalPath);
    const idKey = deriveAliasLookup(['rls20088635']);
    expect(idKey.kind === 'alias' ? await lookupAlias(idKey.redisKey) : null).toBe('/listing/listing-rls20088635');
  });
});

describe('unknown alias → not-found WITHOUT a database call', () => {
  it('authoritative index: an unknown id returns null (→ 404, no DB)', async () => {
    process.env.ALIAS_INDEX_AUTHORITATIVE = 'true';
    const k = deriveAliasLookup(['rls99999999']);
    expect(k.kind === 'alias' ? await lookupAlias(k.redisKey) : 'x').toBeNull();
  });
  it('non-authoritative (pre-backfill): an unknown id returns undefined (→ fail OPEN, page decides)', async () => {
    const k = deriveAliasLookup(['rls99999999']);
    expect(k.kind === 'alias' ? await lookupAlias(k.redisKey) : 'x').toBeUndefined();
  });
});

describe('durable cache + changed-listing invalidation', () => {
  it('set → get is a persistent hit; del removes it', async () => {
    await cacheSetJson('listings:v1:x', { ok: 1 }, 60);
    expect(await cacheGetJson('listings:v1:x')).toEqual({ ok: 1 });
    await cacheDel('listings:v1:x');
    expect(await cacheGetJson('listings:v1:x')).toBeUndefined();
  });
  it('a changed listing DROPS its detail cache and REFRESHES its alias entries', async () => {
    await cacheSetJson(detailCacheKey('RLS20088635'), { stale: true }, 300);
    await refreshListingCaches(displayable);
    expect(await cacheGetJson(detailCacheKey('RLS20088635'))).toBeUndefined(); // detail dropped
    const k = deriveAliasLookup(['rls20088635']);
    expect(k.kind === 'alias' ? await lookupAlias(k.redisKey) : null).toContain('/rls20088635'); // alias refreshed
  });
  it('list-cache version bump retires the namespace (unchanged run performs no bump)', async () => {
    expect(await listingsCacheVersion()).toBe(0); // unset default
    await bumpListingsCacheVersion();
    expect(await listingsCacheVersion()).toBe(1); // first bump changes the namespace (v0 → v1)
    // "unchanged sync run" gate is in sync.ts source (asserted below).
  });
});

describe('architectural guarantees (source) — aliases are DB-free; no false-404 caching', () => {
  it('proxy.ts (edge) + alias-index.ts NEVER import Prisma', () => {
    // The alias path runs in the edge proxy (Next 16's middleware) — Prisma can't load there,
    // and alias-index does the resolution with only Upstash + pure slug helpers.
    expect(read('proxy.ts')).not.toMatch(/@\/lib\/prisma|from ['"].*prisma/);
    expect(read('lib/listings/alias-index.ts')).not.toMatch(/@\/lib\/prisma|from ['"].*prisma/);
  });
  it('proxy emits a real 308 (NextResponse.redirect) with CDN cache headers — not a Server-Component redirect()', () => {
    const mw = read('proxy.ts');
    expect(mw).toMatch(/NextResponse\.redirect\([\s\S]*?,\s*308\s*\)/);
    expect(mw).toMatch(/CDN-Cache-Control/);
    expect(mw).not.toMatch(/from ['"]next\/navigation['"]/); // no redirect() from next/navigation
  });
  it('sync.ts bumps the list-cache version ONLY when a listing changed (no unnecessary invalidation)', () => {
    expect(read('lib/idx/sync.ts')).toMatch(/if \(upserted > 0\) \{\s*await bumpListingsCacheVersion\(\)/);
  });
  it('the detail cache caches a RESOLVED result/miss but NEVER a thrown infra error (no false-404 cache)', () => {
    const page = read('app/listing/[...slug]/page.tsx');
    // cacheSetJson runs AFTER fetchFromDB returns; a throw skips it (propagates uncached).
    expect(page).toMatch(/const result = await fetchFromDB\(slug, keyOverride\);[\s\S]{0,200}?cacheSetJson\(/);
    expect(page).toMatch(/_miss: true/); // confirmed-miss sentinel (short TTL), not an error
  });
});
