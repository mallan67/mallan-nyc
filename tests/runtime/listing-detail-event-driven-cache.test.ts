/**
 * LISTING DETAIL = EVENT-DRIVEN CACHE (no periodic regeneration).
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `/listing/[...slug]` exported `revalidate = 600`. That was documented as a "staleness fallback",
 * but its practical effect on this route was a perpetual regeneration loop: the listing detail page
 * is the dominant continuous Neon reader (thousands of unique crawler-driven renders), so every
 * crawler revisit past the 600s window re-rendered an UNCHANGED listing against the database. That
 * is what kept Neon from ever acquiring a real idle window — the scheduler was making correct
 * decisions while this route reawakened the database indefinitely.
 *
 * Freshness never depended on that window: listing data changes ONLY when One Cycle runs, and the
 * sync already calls `revalidateTag('listing:{id}')` in-line with each write. So the window bought
 * no freshness and cost continuous compute.
 *
 * TWO CLOCKS HAD TO GO, NOT ONE
 * -----------------------------
 * The route's `revalidate` is only half of it. `attachListingCacheTags` wraps a tiny
 * `unstable_cache` entry whose sole job is to place `listing:{id}` / building tags on the route's
 * dependency graph — and it carried `revalidate: SYNC_CADENCE_SECONDS`. A finite lifetime there
 * would have silently reimposed a 600s ceiling INSIDE a route that declares `revalidate = false`.
 * Both are pinned below; restoring either one must fail.
 *
 * WHAT IS DELIBERATELY NOT DONE HERE
 * ----------------------------------
 * No `unstable_cache` is placed around raw Prisma listing data. Caching Prisma
 * Decimal/Date/BigInt shapes corrupts them on cache hits — the exact ISR-runtime failure class that
 * forced the #523 → #528 revert. The ISR render itself remains the cache for page data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const PAGE = read('app/listing/[...slug]/page.tsx');
const CACHE = read('lib/cache/public-cache.ts');
/** Comment-stripped, so a comment mentioning an old value cannot mask or fake a match. */
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const CACHE_CODE = CACHE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('route contract — no periodic regeneration', () => {
  it('exports revalidate = false', () => {
    expect(PAGE_CODE).toMatch(/export const revalidate = false\s*;/);
  });

  it('does NOT reintroduce a 600-second (or any finite) route lifetime', () => {
    expect(PAGE_CODE).not.toMatch(/export const revalidate = 600/);
    // Any numeric literal here is a periodic clock, whatever its value.
    expect(PAGE_CODE).not.toMatch(/export const revalidate = \d+/);
  });

  it('keeps dynamicParams = true (unknown slugs must still render on demand)', () => {
    expect(PAGE_CODE).toMatch(/export const dynamicParams = true\s*;/);
  });

  it('KEEPS generateStaticParams returning [] (opts the route into the static/ISR pipeline)', () => {
    // Removing this would drop the route back to fully dynamic rendering — every request hitting
    // Neon — which is the opposite of the fix.
    expect(PAGE_CODE).toMatch(/export (async )?function generateStaticParams/);
    expect(PAGE_CODE).toMatch(/generateStaticParams[\s\S]{0,200}?return \[\]/);
  });
});

describe('tag attachment must not smuggle in a second clock', () => {
  it('fetchListing still calls attachListingCacheTags', () => {
    expect(PAGE_CODE).toMatch(/attachListingCacheTags\(/);
  });

  it('BOTH the listing and the redirect/source outcome attach their listing tag', () => {
    // Two call sites: the resolved listing, and the return-copy/redirect source id. If a redirect
    // outcome stopped attaching its tag, that URL variant would never be tag-invalidatable and,
    // with revalidate=false, would never self-heal either.
    const calls = PAGE_CODE.match(/attachListingCacheTags\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('attachListingCacheTags uses revalidate: false — no finite inner lifetime', () => {
    const idx = CACHE_CODE.indexOf('export async function attachListingCacheTags');
    expect(idx).toBeGreaterThan(-1);
    const body = CACHE_CODE.slice(idx, idx + 1400);
    expect(body).toMatch(/revalidate:\s*false/);
    expect(body).not.toMatch(/revalidate:\s*SYNC_CADENCE_SECONDS/);
    expect(body).not.toMatch(/revalidate:\s*\d+/);
  });

  it('cachedPublicRead default for OTHER public APIs is unchanged', () => {
    // Scope guard: this fix is about listing-detail route regeneration only. Search/browse/
    // collection APIs keep their 10-minute default.
    expect(CACHE_CODE).toMatch(/revalidate:\s*opts\.revalidate \?\? SYNC_CADENCE_SECONDS/);
    expect(CACHE_CODE).toMatch(/SYNC_CADENCE_SECONDS = 10 \* 60/);
  });
});

describe('event-driven freshness path is intact', () => {
  it('sync-side tag revalidation still exists', () => {
    const sync = read('lib/idx/sync.ts');
    expect(sync).toMatch(/safeRevalidateTags\(/);
    expect(sync).toMatch(/listingCacheTag\(/);
  });

  it('safeRevalidateTags still invokes Next revalidateTag', () => {
    expect(CACHE_CODE).toMatch(/export function safeRevalidateTags/);
    expect(CACHE_CODE).toMatch(/import \{[^}]*revalidateTag[^}]*\} from "next\/cache"/);
    // The call is written as a cast — `(revalidateTag as unknown as (tag: string) => void)(tag)` —
    // so assert the identifier is invoked, not the literal `revalidateTag(` spelling.
    const idx = CACHE_CODE.indexOf('export function safeRevalidateTags');
    const body = CACHE_CODE.slice(idx, idx + 2500);
    expect(body).toMatch(/revalidateTag[\s\S]{0,80}\)\(tag\)/);
  });

  it('listingCacheTag shape is unchanged (the sync and the page must agree)', () => {
    expect(CACHE_CODE).toMatch(/return `listing:\$\{listingId\}`/);
  });
});

describe('PERSISTENT DATA CACHE — the layer that removes the dominant Neon read', () => {
  // Route `revalidate = false` only removes REPEAT renders of the SAME url. Production evidence on
  // the #614 deployment: 339 listing executions across 336 DISTINCT paths — ~99% of renders are
  // unique cold URLs, each executing fetchFromDB() once. And the Full Route Cache is
  // deployment-scoped, so every deploy re-cold-fills. Only a persistent, id-keyed data entry
  // survives both.

  it('wraps fetchFromDB in unstable_cache (removing the wrapper must fail this)', () => {
    expect(PAGE_CODE).toMatch(/unstable_cache\(\s*\(\)\s*=>\s*fetchFromDB\(slug, keyOverride\)/);
  });

  it('caches the NORMALIZED result, never raw Prisma output (#523 → #528 stays closed)', () => {
    // fetchFromDB runs dbListingToPublicDTO internally and returns ListingFetchResult | null, so
    // no Decimal/Date/BigInt enters the cache. The raw row must never be the cached value.
    const dtoAt = PAGE_CODE.indexOf('dbListingToPublicDTO(dbListing');
    const fetchFromDbAt = PAGE_CODE.indexOf('async function fetchFromDB');
    const fetchListingAt = PAGE_CODE.indexOf('const fetchListing = cache(');
    expect(fetchFromDbAt).toBeGreaterThan(-1);
    // The DTO conversion happens INSIDE fetchFromDB, i.e. before the cached boundary.
    expect(dtoAt).toBeGreaterThan(fetchFromDbAt);
    expect(dtoAt).toBeLessThan(fetchListingAt);
    // The cached callable is fetchFromDB itself — not a prisma call.
    expect(PAGE_CODE).not.toMatch(/unstable_cache\([\s\S]{0,120}prisma\./);
  });

  it('keys by COTALITYLVED LISTING ID, not the request URL', () => {
    expect(PAGE_CODE).toMatch(/\['listing-detail-data-v1', dataCacheId\]/);
    // Must NOT be keyed on the raw slug/pathname — that would give one listing many entries.
    expect(PAGE_CODE).not.toMatch(/\['listing-detail-data-v1', slug\]/);
    expect(PAGE_CODE).toMatch(/const dataCacheId = derivedListingIdFromSlug\(slug, keyOverride\)/);
  });

  it('uses revalidate: false and the EXISTING listingCacheTag for invalidation', () => {
    const at = PAGE_CODE.indexOf("'listing-detail-data-v1'");
    const call = PAGE_CODE.slice(at, at + 300);
    expect(call).toMatch(/tags:\s*\[listingCacheTag\(dataCacheId\)\]/);
    expect(call).toMatch(/revalidate:\s*false/);
    expect(call).not.toMatch(/revalidate:\s*\d+/);
  });

  it('NEGATIVE PATH: a confirmed miss is tagged, so a cached 404 is not stale forever', () => {
    // Under revalidate=false an untagged 404 could never be displaced by a later create/sync.
    expect(PAGE_CODE).toMatch(/\}\s*else if \(dataCacheId\)\s*\{[\s\S]{0,400}?attachListingCacheTags\(dataCacheId/);
  });

  it('a slug with NO derivable id bypasses the persistent cache (no untaggable entry)', () => {
    expect(PAGE_CODE).toMatch(/:\s*await fetchFromDB\(slug, keyOverride\)/);
  });
});

describe('URL variants collapse onto ONE data-cache identity', () => {
  // The collapse mechanism is the id extraction below; these assert its real behaviour on the
  // three shapes that must share an entry.
  const { isMlsIdSlug, extractMlsIdFromSlug, extractListingIdFromSlug } =
    require('@/lib/listing-slug') as typeof import('@/lib/listing-slug');
  const { isBareListingIdSegment } =
    require('@/lib/listing-canonical-url') as typeof import('@/lib/listing-canonical-url');

  /** Mirrors derivedListingIdFromSlug in the page, including the BARE-ID branch. */
  const derive = (slug: string): string | null => {
    if (isBareListingIdSegment(slug)) return slug.toUpperCase();
    if (isMlsIdSlug(slug)) {
      const id = extractMlsIdFromSlug(slug);
      return id ? id.toUpperCase() : null;
    }
    const embedded = extractListingIdFromSlug(slug);
    return embedded ? embedded.toUpperCase() : null;
  };

  it('hybrid (embedded id) and bare-id forms derive the SAME uppercase id', () => {
    const hybrid = derive('400-east-90th-street-apt-17c-rls20061539');
    const bare = derive('rls20061539');
    expect(hybrid).toBe('RLS20061539');
    expect(bare).toBe('RLS20061539');
    expect(hybrid).toBe(bare);
  });

  it('the MLS-ID slug form derives the same id as its bare form', () => {
    expect(derive('listing-sl-0004')).toBe(derive('sl-0004'));
    expect(derive('listing-sl-0004')).toBe('SL-0004');
  });

  it('case variants collapse (listing_id is stored uppercase, index is case-sensitive)', () => {
    expect(derive('RLS20061539')).toBe(derive('rls20061539'));
  });

  it('a pure address slug derives NO id — correctly bypassing the persistent cache', () => {
    expect(derive('400-east-90th-street')).toBeNull();
  });

  it('REGRESSION: the page keeps the BARE-ID branch (canonical URLs collapse to a bare id)', () => {
    // extractListingIdFromSlug matches an id only as the SUFFIX of a longer slug, so it returns
    // null for a bare id. The canonical two-segment form `/listing/<address>/<ID>` resolves to
    // exactly that — without this branch the DOMINANT url shape bypasses the persistent cache and
    // the fix silently does nothing. Caught by test, not in production.
    expect(PAGE_CODE).toMatch(/if \(isBareListingIdSegment\(slug\)\) return slug\.toUpperCase\(\);/);
  });
});
