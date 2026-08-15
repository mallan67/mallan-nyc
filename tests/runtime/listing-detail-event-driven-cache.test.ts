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

describe('the #523 → #528 failure class is NOT reopened', () => {
  it('the page does not wrap raw Prisma listing reads in unstable_cache', () => {
    // Caching Prisma Decimal/Date/BigInt shapes corrupts them on cache hits.
    expect(PAGE_CODE).not.toMatch(/unstable_cache/);
  });
});
