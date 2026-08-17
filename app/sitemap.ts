import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { dedupeRawDbRows } from '@/lib/listings/dedupe-crm-vs-idx';
import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { excludeMallanRlsReturnCopies } from "@/lib/listings/mallan-source-identity";
import { cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

const BASE_URL = 'https://mallan.nyc';

// ──────────────────────────────────────────────────────────────────────────
// Runtime generation, not build-time.
//
// Vercel's build runtime intentionally does not expose `DATABASE_URL` per the
// documented architecture (see NEON.md §1 and docs/DEPLOYMENT.md). Previously
// this sitemap ran at build time, hit `Environment variable not found:
// DATABASE_URL`, caught the error, and served an empty listing-URL section.
// Result: the deployed sitemap.xml on production never contained any
// `/listing/{slug}` URLs — Google could not discover listing pages from it.
//
// `force-dynamic` defers generation to runtime on the first request, where
// DATABASE_URL is set via Vercel env vars. That part still holds and is why it
// stays.
//
// CORRECTION (PR #618): the `revalidate = 300` below does NOT do what the
// original note claimed ("caches the result ... so we don't hit Neon on every
// crawler request ... ~1 extra DB query every 5 min"). Next 16.1.6 resolves the
// force-dynamic/revalidate conflict by OVERWRITING revalidate to 0
// (`node_modules/next/dist/build/utils.js:676`), so this route re-executed its
// Neon query on EVERY request — one of the dominant continuous readers.
//
// The Neon read is now cached at the DATA layer instead (`sitemapListingRows`
// below), which achieves the original intent without giving up runtime
// generation. `revalidate` is retained only as documentation of intent; it has
// no effect while `force-dynamic` is set.
// ──────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
export const revalidate = 300;

/**
 * Dynamic sitemap generation for Next.js 13+
 * Only includes safe-to-index public routes.
 * Excludes: admin, client-access, demo, agent-only routes.
 *
 * COMPLIANCE:
 * - Only includes listings that pass all distribution gates
 * - Suppressed-address listings use MLS-ID-based slugs (no address leak)
 * - Closed listings excluded (24-hour removal rule)
 * - Owner opt-out / participant-only excluded
 */

/**
 * SITEMAP LISTING ROWS — cached, so a crawler does not wake Neon per request.
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 * This route declares BOTH `dynamic = 'force-dynamic'` and `revalidate = 300`,
 * and the header comment states the intent: "revalidate = 300 caches the result
 * ... so we don't hit Neon on every crawler request ... ~1 extra DB query every
 * 5 min".
 *
 * That intent was never achieved. Next 16.1.6 resolves the conflict in favour
 * of `force-dynamic` and OVERWRITES the revalidate to 0 —
 * `node_modules/next/dist/build/utils.js:676`:
 *
 *     if (appConfig.dynamic === 'force-dynamic' && !isRoutePPREnabled) {
 *         appConfig.revalidate = 0;
 *     }
 *
 * So `/sitemap.xml` executed this query on EVERY request. Crawlers poll it
 * continuously, and our own hourly live-site validator hits it too — making it
 * one of the dominant continuous Neon readers, directly opposing the
 * event-driven wake contract.
 *
 * ── WHY THE FIX IS A CACHED READ, NOT REMOVING force-dynamic ───────────────
 * `force-dynamic` is load-bearing for a different reason, stated in the header:
 * it defers generation to runtime, where `DATABASE_URL` exists. Removing it
 * would risk build-time generation without a database. Caching the DATA instead
 * keeps runtime generation AND removes the per-request query.
 *
 * Tagged `SEARCH_CACHE_TAG`: the row set is exactly the public active-display
 * population, which is what that tag already represents, so sitemap freshness
 * rides the SAME writer invalidation as public search — no new invalidation
 * system, and no reliance on wall-clock.
 */
const sitemapListingRows = cachedPublicRead(
  () =>
    prisma.listing.findMany({
      where: {
        // Distribution gates — all must pass for sitemap inclusion
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
        // Only active listings (closed removed per 24h rule).
        // Canonical values from lib/compliance/status.ts — was
        // `['Active', 'Coming Soon']` which never matched because DB
        // stores `ComingSoon` (no space). Sitemap excluded every Coming
        // Soon listing as a result. Fixed here.
        status: { in: [...ACTIVE_DISPLAY_VALUES] },
        // MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
        //
        // Mallan's own listing returns through Cotality as an `RLS*` row.
        // Without this the sitemap emitted a SECOND canonical URL for the same
        // physical listing — a duplicate-content/SEO defect — and the returned
        // copy is not Mallan's public canonical listing; the local `SL-`/`RL-`
        // row is. This route builds its gate inline rather than through
        // `buildSearchDisplayWhere`, so the exclusion is applied explicitly
        // from the SAME single owner.
        AND: [excludeMallanRlsReturnCopies()],
      },
      select: {
        listing_id: true,
        mls_id: true,
        address: true,
        internet_address_display_yn: true,
        modification_timestamp: true,
      },
    }),
  ['sitemap-listing-rows-v1'],
  { tags: [SEARCH_CACHE_TAG] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Core public pages - always indexed
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/buy`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/buy/international`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/rent`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/sell`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/sell/international`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/agents`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/open-houses`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    // /search is NOT in the sitemap — it's a parameterless thin-content page.
    // The canonical indexable listing URLs are /listing/{slug} (included below).
    // robots.ts blocks /search for all bots; listing these here would create
    // a mixed signal that previously confused Google crawling.
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/neighborhoods`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/market`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/manhattan`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/brooklyn`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/queens`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/bronx`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/staten-island`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
  ];

  // Legal/compliance pages - required for indexing
  const legalPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/fair-housing`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE_URL}/sop`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/reasonable-accommodations`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Dynamic listing pages — only IDX-displayable, non-suppressed listings
  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const listingsRaw = await sitemapListingRows();

    // Public-surface dedupe (2026-05-28): when a Mallan CRM exclusive
    // (SL-/RL-) and a Trestle-synced IDX duplicate exist for the same
    // physical unit, emit only the CRM canonical URL. Avoids
    // duplicate-content SEO penalty for our own listings. See
    // lib/listings/dedupe-crm-vs-idx.ts.
    const listings = dedupeRawDbRows(listingsRaw);

    listingPages = listings.map((l) => {
      const addr = (l.address || {}) as Record<string, string>;
      const slug = generateListingSlug({
        address: {
          streetNumber: addr.StreetNumber || addr.streetNumber || '',
          // SEO-001 (2026-07-02): compose DirPrefix + Name + Suffix via the
          // SHARED helper — passing StreetName alone made 10,069/10,239
          // sitemap URLs diverge from the page canonicals (full-population
          // audit 2026-07-01; e.g. "434-20th-…" vs "434-w-20th-street-…").
          streetName: composeSlugStreetName(addr),
          unitNumber: addr.UnitNumber || addr.unitNumber || null,
          city: addr.City || addr.city || 'New York',
          stateOrProvince: addr.StateOrProvince || addr.stateOrProvince || 'NY',
          postalCode: addr.PostalCode || addr.postalCode || '',
        },
        id: l.listing_id,
        mlsId: l.mls_id || l.listing_id,
        internetAddressDisplayYN: l.internet_address_display_yn,
      });

      return {
        url: `${BASE_URL}${buildCanonicalListingPath({ slug, id: l.listing_id })}`,
        lastModified: l.modification_timestamp || now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      };
    });
  } catch (err) {
    // Non-fatal — sitemap still includes static pages
    console.error('[sitemap] Failed to fetch listings:', err);
  }

  // Agent profile pages
  let agentPages: MetadataRoute.Sitemap = [];
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
      select: { public_slug: true, updated_at: true },
    });
    agentPages = agents
      .filter((a) => a.public_slug)
      .map((a) => ({
        url: `${BASE_URL}/agents/${a.public_slug}`,
        lastModified: a.updated_at || now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
  } catch {
    // Non-fatal
  }

  // Building profile pages — from local DB (populated by silent upsert)
  let buildingPages: MetadataRoute.Sitemap = [];
  try {
    const buildings = await prisma.building.findMany({
      where: { active_listing_count: { gt: 0 } },
      select: {
        building_key: true,
        name: true,
        street_number: true,
        street_name: true,
        zip: true,
        last_synced_at: true,
      },
      take: 500,
      orderBy: { last_synced_at: 'desc' },
    });
    buildingPages = buildings
      .filter((b) => b.street_number && b.street_name)
      .map((b) => {
        const slug = [b.name || '', b.street_number, b.street_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const sp = new URLSearchParams({
          sn: b.street_number || '',
          st: b.street_name || '',
        });
        if (b.zip) sp.set('z', b.zip);
        if (b.name) sp.set('bn', b.name);
        return {
          url: `${BASE_URL}/buildings/${slug}?${sp.toString()}`,
          lastModified: b.last_synced_at || now,
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        };
      });
  } catch {
    // Non-fatal
  }

  return [...staticPages, ...legalPages, ...listingPages, ...agentPages, ...buildingPages];
}
