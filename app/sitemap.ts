import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { loadSitemapListingRows, sitemapListingPath } from '@/lib/sitemap/population';

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
// DATABASE_URL is set via Vercel env vars. `revalidate = 300` caches the
// result at the edge for 5 minutes so we don't hit Neon on every crawler
// request. Tradeoff: ~1 extra DB query every 5 min (negligible; a few
// CU-seconds/month).
// ──────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
export const revalidate = 300;

/**
 * Dynamic sitemap generation for Next.js 13+
 * Only includes safe-to-index public routes.
 * Excludes: admin, client-access, demo, agent-only routes.
 *
 * NOT offered, on purpose (independent compliance review 2026-10-30; recorded in the State document): the 59 neighbourhood guides,
 * whose copy carries school and family wording that Master 23.10 / 21.12 say must not publish until governed; and building pages,
 * whose data layer has open gate questions. Neither is a decision this file may make.
 *
 * COMPLIANCE: which listings are offered, and why, is lib/sitemap/population.ts: only listings that pass the distribution gates,
 * suppressed-address listings use MLS-ID-based slugs (no address leak), closed listings are excluded (24-hour removal rule), owner
 * opt-out / participant-only are excluded, Mallan's own RLS return-copies are suppressed in favour of the local canonical listing,
 * and Mallan's own website-only listings are offered through gates of their own.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // No lastmod on static or legal pages: they have no per-page modification time, and stamping "now" on every
  // request teaches Google to ignore lastmod, including on the listing and agent entries below where it IS accurate.
  // Core public pages - always indexed
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/buy`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/buy/international`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/rent`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/sell`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/sell/international`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/agents`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/open-houses`, changeFrequency: 'daily', priority: 0.8 },
    // /search is NOT in the sitemap — it's a parameterless thin-content page.
    // The canonical indexable listing URLs are /listing/{slug} (included below).
    // robots.ts blocks /search for all bots; listing these here would create
    // a mixed signal that previously confused Google crawling.
    { url: `${BASE_URL}/contact`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/neighborhoods`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/market`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/manhattan`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/brooklyn`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/queens`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/bronx`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/staten-island`, changeFrequency: 'weekly', priority: 0.6 },
  ];

  // Legal/compliance pages - required for indexing
  const legalPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/fair-housing`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE_URL}/sop`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/reasonable-accommodations`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Dynamic listing pages — third-party RLS listings and Mallan's own website-only listings, each through its own gates.
  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const listings = await loadSitemapListingRows();
    listingPages = listings.map((l) => ({
      url: `${BASE_URL}${sitemapListingPath(l)}`,
      lastModified: l.modification_timestamp || now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
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

  return [...staticPages, ...legalPages, ...listingPages, ...agentPages];
}
