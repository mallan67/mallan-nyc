/// <reference types="jest" />
/**
 * Structured-data canonical URL parity.
 *
 * The listing detail page advertises its URL in THREE places that must agree:
 *   1. <link rel="canonical"> / alternates.canonical  (generateMetadata)
 *   2. og:url                                          (generateMetadata openGraph)
 *   3. JSON-LD RealEstateListing.url                   (page body)
 *
 * All three must emit the SAME two-segment canonical `/listing/{address}/{id}` via the
 * shared `buildCanonicalListingPath` helper. The JSON-LD url previously used a single-
 * segment `/listing/${listing.slug}` — a non-canonical URL that 308-redirects, giving
 * Google a conflicting canonical signal. This pins all three to one path.
 */
import fs from 'fs';
import path from 'path';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

const ROOT = path.resolve(__dirname, '../..');
// Strip comments so assertions test CODE, not the explanatory comment that names the old form.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const PAGE = stripComments(
  fs.readFileSync(path.join(ROOT, 'app/listing/[...slug]/page.tsx'), 'utf8'),
);

describe('listing detail — JSON-LD, canonical metadata, and og:url share ONE canonical path', () => {
  it('JSON-LD RealEstateListing.url uses buildCanonicalListingPath (not a single-segment slug URL)', () => {
    expect(PAGE).not.toMatch(/url:\s*`https:\/\/mallan\.nyc\/listing\/\$\{listing\.slug\}`/);
    expect(PAGE).toMatch(
      /url:\s*`https:\/\/mallan\.nyc\$\{buildCanonicalListingPath\(\{\s*slug:\s*listing\.slug\s*\|\|\s*'',\s*id:\s*listing\.id\s*\|\|\s*''\s*\}\)\}`/,
    );
  });

  it('generateMetadata canonical + og:url use the SAME buildCanonicalListingPath shape', () => {
    expect(PAGE).toMatch(
      /const canonicalPath = buildCanonicalListingPath\(\{\s*slug:\s*listing\.slug\s*\|\|\s*'',\s*id:\s*listing\.id\s*\|\|\s*''\s*\}\)/,
    );
    expect(PAGE).toMatch(/const canonicalUrl = `https:\/\/mallan\.nyc\$\{canonicalPath\}`/);
    expect(PAGE).toMatch(/alternates:\s*\{\s*canonical:\s*canonicalUrl\s*\}/); // <link rel=canonical>
    expect(PAGE).toMatch(/\n\s*url:\s*canonicalUrl,/); // og:url
  });

  it('the shared helper yields the two-segment /listing/{address}/{id} canonical', () => {
    const p = buildCanonicalListingPath({
      slug: '160-central-park-apt-3410-new-york-city-ny-10019-rls20088635',
      id: 'RLS20088635',
    });
    expect(p).toBe('/listing/160-central-park-apt-3410-new-york-city-ny-10019/rls20088635');
    expect(p.split('/').filter(Boolean).length).toBe(3); // 'listing' + address + id
  });

  it('address-suppressed listing → id-only canonical (JSON-LD would emit the same, no address leak)', () => {
    expect(buildCanonicalListingPath({ slug: 'listing-rls20088635', id: 'RLS20088635' })).toBe(
      '/listing/listing-rls20088635',
    );
  });
});
