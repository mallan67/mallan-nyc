/// <reference types="jest" />
/**
 * P0 compute repair — the public listing page renders ONLY from the synchronized
 * Neon copy (listing + listing_media) and must NEVER reach the live Cotality/Trestle
 * feed during an ordinary page request.
 *
 * Root cause this pins: any live-feed call reachable from the render path (the
 * Trestle OAuth token fetch, a live Property fetch, or the live Media fallback)
 * opts the whole `/listing/[...slug]` route into DYNAMIC rendering — emitting
 * `Cache-Control: private, no-store` and `X-Vercel-Cache: MISS` on every request,
 * which kept Neon ~98% active. Removing the imports makes the live calls statically
 * unreachable from this module, so the route can render as ISR (revalidate=300).
 *
 * These are source-level invariants (comments stripped, so the assertions test CODE,
 * not the explanatory comments that legitimately name the removed functions). The
 * behavioral proof (MISS→HIT, no private/no-store) is captured separately by the
 * Preview cache-header probe in the PR evidence packet.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const PAGE = 'app/listing/[...slug]/page.tsx';

/** Read a source file with comments stripped, so assertions test CODE, not the
 *  explanatory comments (which legitimately mention the removed live-feed calls). */
const read = (p: string) => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');    // line comments (skip http://)
};

describe('listing page cannot reach the live Cotality/Trestle feed', () => {
  const src = read(PAGE);

  it('does not import the live Trestle fetch module (Property/Media)', () => {
    expect(src).not.toMatch(/from ['"]@\/lib\/idx\/fetch['"]/);
    expect(src).not.toMatch(/\bfetchSingleListing\b/);
    expect(src).not.toMatch(/\bfetchListingByAddress\b/);
    expect(src).not.toMatch(/\bfetchListingMedia\b/);
  });

  it('does not import the Trestle OAuth token accessor', () => {
    expect(src).not.toMatch(/from ['"]@\/lib\/idx\/auth['"]/);
    expect(src).not.toMatch(/\bgetAccessToken\b/);
  });

  it('does not perform the live last-sale comp lookups (Trestle + ACRIS)', () => {
    expect(src).not.toMatch(/\bfetchLastUnitSale\b/);
    expect(src).not.toMatch(/\bfetchLastSaleFromACRIS\b/);
    // ACRIS was the only remaining consumer of the SODA client on this page.
    expect(src).not.toMatch(/from ['"]@\/lib\/soda['"]/);
  });

  it('does not fetch a raw Trestle record or map it on the render path', () => {
    // rawToDTO + its RESO mapper/gate imports existed only for the live path.
    expect(src).not.toMatch(/\brawToDTO\b/);
    expect(src).not.toMatch(/from ['"]@\/lib\/idx\/mapping['"]/);
  });
});

describe('listing page renders from the synchronized Neon copy as ISR', () => {
  const src = read(PAGE);

  it('reads the listing from Prisma (the synced DB)', () => {
    expect(src).toMatch(/from ['"]@\/lib\/prisma['"]/);
    expect(src).toMatch(/prisma\.listing\.(findUnique|findFirst|findMany)/);
  });

  it('keeps ISR revalidation enabled (so the CDN can cache the page)', () => {
    // One Cycle W1: ISR window = unified One Cycle cadence (600s = 10 min) —
    // same effective freshness; sync-driven revalidateTag expires in-line.
    expect(src).toMatch(/export const revalidate = 600/);
  });

  it('exports generateStaticParams so the dynamic route enters the ISR pipeline', () => {
    // Without this, Next 16 renders the catch-all route fully dynamically
    // (Cache-Control: private,no-store; X-Vercel-Cache: MISS on every request),
    // regardless of `revalidate`. Confirmed by A/B against the neighborhood routes.
    expect(src).toMatch(/export (async function|const) generateStaticParams/);
  });
});
