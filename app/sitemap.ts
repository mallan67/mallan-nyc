import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { dedupeRawDbRows } from '@/lib/listings/dedupe-crm-vs-idx';
import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
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
// DATABASE_URL is set via Vercel env vars. `revalidate = 300` caches the
// rendered XML at the edge for 5 minutes.
//
// Neon-quiet (2026-07-23): a regeneration no longer scans Neon. The three
// DB-backed sections (listings, agents, buildings) are assembled by ONE
// cached builder tagged with the coarse `search` tag — the same tag every
// successful idx-sync revalidates when anything changed (One Cycle: the
// sitemap can never be fresher than the feed sync, so serving the cached
// entry until the sync bumps the tag loses zero freshness; the 30-min
// fallback window covers a missed revalidation). Repeated crawler hits
// therefore execute ZERO Prisma queries between syncs.
// ──────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
export const revalidate = 300;

/**
 * Defensive upper bound on sitemap listing rows. NOT a truncation in
 * practice: the sitemap protocol caps a file at 50,000 URLs and the live
 * displayable population is ~10.3k (2026-07 audit), so every canonical
 * listing URL is preserved. The bound exists so a runaway population can
 * never turn sitemap regeneration into an unbounded scan again; if it is
 * ever hit we log loudly (no silent caps).
 */
const SITEMAP_LISTING_BOUND = 25000;

interface SitemapEntry {
  url: string;
  /** ISO string (JSON-safe through the data cache; Next accepts string | Date). */
  lastModified: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

/**
 * All DB-backed sitemap sections in one pass. COMPLIANCE-preserving:
 * identical distribution-gate WHERE clause, identical slug composition
 * (SEO-001 shared helper), identical CRM-vs-IDX dedupe, identical
 * suppressed-address handling — only the caching + bounds around the
 * queries changed.
 */
async function buildDynamicSitemapEntries(): Promise<{
  listingPages: SitemapEntry[];
  agentPages: SitemapEntry[];
  buildingPages: SitemapEntry[];
}> {
  const nowIso = new Date().toISOString();

  // Dynamic listing pages — only IDX-displayable, non-suppressed listings
  let listingPages: SitemapEntry[] = [];
  try {
    const listingsRaw = await prisma.listing.findMany({
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
      },
      select: {
        listing_id: true,
        mls_id: true,
        address: true,
        internet_address_display_yn: true,
        modification_timestamp: true,
      },
      // Deterministic order + defensive bound (see SITEMAP_LISTING_BOUND).
      orderBy: [{ modification_timestamp: 'desc' }, { listing_id: 'asc' }],
      take: SITEMAP_LISTING_BOUND,
    });
    if (listingsRaw.length === SITEMAP_LISTING_BOUND) {
      console.error(
        `[sitemap] LISTING BOUND HIT (${SITEMAP_LISTING_BOUND}) — sitemap may be truncating canonical URLs; raise the bound / split the sitemap.`,
      );
    }

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
        lastModified: (l.modification_timestamp ?? new Date(nowIso)).toISOString(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      };
    });
  } catch (err) {
    // Non-fatal — sitemap still includes static pages
    console.error('[sitemap] Failed to fetch listings:', err);
  }

  // Agent profile pages
  let agentPages: SitemapEntry[] = [];
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
      select: { public_slug: true, updated_at: true },
      orderBy: { public_slug: 'asc' },
      take: 500,
    });
    agentPages = agents
      .filter((a) => a.public_slug)
      .map((a) => ({
        url: `${BASE_URL}/agents/${a.public_slug}`,
        lastModified: (a.updated_at ?? new Date(nowIso)).toISOString(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
  } catch {
    // Non-fatal
  }

  // Building profile pages — from the local buildings table. NOTE (2026-07-23
  // production measurement): this table has 0 rows — the request-time "silent
  // upsert" that was supposed to populate it never fired (BuildingKeyNumeric
  // absent from the public $select) and has now been removed from the public
  // GET entirely. This section currently emits zero URLs; crawlers discover
  // building pages via on-page links. It stays so an explicit, approved
  // building-sync workflow can light it up later.
  let buildingPages: SitemapEntry[] = [];
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
          lastModified: (b.last_synced_at ?? new Date(nowIso)).toISOString(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        };
      });
  } catch {
    // Non-fatal
  }

  return { listingPages, agentPages, buildingPages };
}

/**
 * Cached accessor for the DB-backed sections. `search` tag = revalidated by
 * every idx-sync that changed anything; 30-min sync-cadence fallback.
 */
const getDynamicSitemapEntries = cachedPublicRead(
  buildDynamicSitemapEntries,
  ['sitemap-dynamic-entries'],
  { tags: [SEARCH_CACHE_TAG] },
);

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

  const { listingPages, agentPages, buildingPages } = await getDynamicSitemapEntries();

  return [...staticPages, ...legalPages, ...listingPages, ...agentPages, ...buildingPages];
}
