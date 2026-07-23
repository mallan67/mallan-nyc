import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { dedupeRawDbRows } from '@/lib/listings/dedupe-crm-vs-idx';
import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import {
  LISTINGS_PER_SITEMAP,
  SITEMAP_LISTING_WHERE,
  getSitemapPartitionIds,
} from '@/lib/seo/sitemap-partitions';

const BASE_URL = 'https://mallan.nyc';

// ──────────────────────────────────────────────────────────────────────────
// Runtime generation, not build-time.
//
// Vercel's build runtime intentionally does not expose `DATABASE_URL` per the
// documented architecture (see NEON.md §1 and docs/DEPLOYMENT.md), so this
// runs with `force-dynamic` and edge-caches for 5 minutes.
//
// PARTITIONED (2026-07-23): `generateSitemaps` serves this file at
// /sitemap/{id}.xml — partition 0 is the static/legal/agents/buildings head,
// partitions 1..K are deterministic 10k listing chunks. The partition count
// derives from a cached COUNT of the exact gated population (+1 slack chunk),
// and the whole set FAILS CLOSED past the cap — silent truncation is
// structurally impossible (see lib/seo/sitemap-partitions.ts). The classic
// /sitemap.xml URL keeps working as a sitemap INDEX over the partitions
// (app/sitemap.xml/route.ts), so robots.txt and Search Console registrations
// are unchanged.
//
// Neon-quiet: every DB section runs through cachedPublicRead tagged `search`
// (revalidated by every idx-sync that changed anything; 30-min fallback) —
// crawler regenerations execute ZERO Neon queries between syncs.
// ──────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
export const revalidate = 300;

interface SitemapEntry {
  url: string;
  /** ISO string (JSON-safe through the data cache; Next accepts string | Date). */
  lastModified: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

const LISTING_ROW_SELECT = {
  listing_id: true,
  mls_id: true,
  address: true,
  internet_address_display_yn: true,
  modification_timestamp: true,
} as const;

type SitemapListingRow = {
  listing_id: string;
  mls_id: string | null;
  address: unknown;
  internet_address_display_yn: boolean | null;
  modification_timestamp: Date | string | null;
};

/**
 * CRM exclusives (SL-/RL-) for the global dedupe context. Small set; cached.
 * Every chunk dedupes against ALL CRM rows so a CRM exclusive and its IDX
 * duplicate can never both be emitted even when they land in different
 * partitions.
 */
async function fetchCrmExclusiveRows(): Promise<SitemapListingRow[]> {
  const rows = await prisma.listing.findMany({
    where: {
      AND: [
        SITEMAP_LISTING_WHERE,
        { OR: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] },
      ],
    },
    select: LISTING_ROW_SELECT,
    orderBy: { listing_id: 'asc' },
  });
  return rows.map((r) => ({ ...r, modification_timestamp: r.modification_timestamp?.toISOString?.() ?? null }));
}
const getCrmExclusiveRows = cachedPublicRead(fetchCrmExclusiveRows, ['sitemap-crm-rows'], {
  tags: [SEARCH_CACHE_TAG],
});

/** One deterministic listing chunk (orderBy listing_id ASC, skip/take). */
async function fetchListingChunk(chunkIndex: number): Promise<SitemapListingRow[]> {
  const rows = await prisma.listing.findMany({
    where: SITEMAP_LISTING_WHERE,
    select: LISTING_ROW_SELECT,
    orderBy: { listing_id: 'asc' },
    skip: chunkIndex * LISTINGS_PER_SITEMAP,
    take: LISTINGS_PER_SITEMAP,
  });
  return rows.map((r) => ({ ...r, modification_timestamp: r.modification_timestamp?.toISOString?.() ?? null }));
}
const getListingChunk = cachedPublicRead(fetchListingChunk, ['sitemap-listing-chunk'], {
  tags: [SEARCH_CACHE_TAG],
});

function listingRowToEntry(l: SitemapListingRow, nowIso: string): SitemapEntry {
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
    internetAddressDisplayYN: l.internet_address_display_yn ?? undefined,
  });
  return {
    url: `${BASE_URL}${buildCanonicalListingPath({ slug, id: l.listing_id })}`,
    lastModified: typeof l.modification_timestamp === 'string'
      ? l.modification_timestamp
      : (l.modification_timestamp?.toISOString?.() ?? nowIso),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  };
}

/**
 * Listing partition: chunk ∪ (global CRM rows) → shared dedupe → keep only
 * rows that belong to this chunk. Deterministic; every canonical URL appears
 * in exactly one partition; distribution gates + suppressed-address handling
 * identical to the pre-partition sitemap.
 */
async function buildListingPartition(chunkIndex: number): Promise<SitemapEntry[]> {
  const nowIso = new Date().toISOString();
  try {
    const [chunk, crmRows] = await Promise.all([getListingChunk(chunkIndex), getCrmExclusiveRows()]);
    const chunkIds = new Set(chunk.map((l) => l.listing_id));
    const merged = [...chunk];
    for (const crm of crmRows) if (!chunkIds.has(crm.listing_id)) merged.push(crm);
    // Public-surface dedupe (2026-05-28): prefer the Mallan CRM exclusive
    // over its Trestle/IDX duplicate for the same physical unit. See
    // lib/listings/dedupe-crm-vs-idx.ts.
    const deduped = dedupeRawDbRows(merged as never[]) as unknown as SitemapListingRow[];
    return deduped.filter((l) => chunkIds.has(l.listing_id)).map((l) => listingRowToEntry(l, nowIso));
  } catch (err) {
    // Non-fatal for THIS partition (matches the old behavior for the listing
    // section): the partition renders empty this pass; the index and other
    // partitions are unaffected and the next revalidation retries.
    console.error(`[sitemap] Failed to build listing partition ${chunkIndex}:`, err);
    return [];
  }
}

/** Agents + buildings head sections (partition 0), cached together. */
async function buildHeadDynamicSections(): Promise<{ agentPages: SitemapEntry[]; buildingPages: SitemapEntry[] }> {
  const nowIso = new Date().toISOString();

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
        lastModified: a.updated_at?.toISOString() ?? nowIso,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
  } catch {
    // Non-fatal
  }

  // Building profile pages — from the local buildings table. NOTE (2026-07-23
  // production measurement): this table has 0 rows — the request-time "silent
  // upsert" that was supposed to populate it never fired and has been removed
  // from the public GET. This section currently emits zero URLs; it stays so
  // an explicit, approved building-sync workflow can light it up later.
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
          lastModified: b.last_synced_at?.toISOString() ?? nowIso,
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        };
      });
  } catch {
    // Non-fatal
  }

  return { agentPages, buildingPages };
}
const getHeadDynamicSections = cachedPublicRead(buildHeadDynamicSections, ['sitemap-head-sections'], {
  tags: [SEARCH_CACHE_TAG],
});

/** Partition ids for Next's metadata route machinery. */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const ids = await getSitemapPartitionIds();
  return ids.map((id) => ({ id }));
}

/**
 * COMPLIANCE (unchanged):
 * - Only includes listings that pass all distribution gates
 * - Suppressed-address listings use MLS-ID-based slugs (no address leak)
 * - Closed listings excluded (24-hour removal rule)
 * - Owner opt-out / participant-only excluded
 * - Excludes: admin, client-access, demo, agent-only routes
 */
export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (id > 0) {
    return buildListingPartition(id - 1);
  }

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
    // The canonical indexable listing URLs are /listing/{slug} (partitions 1+).
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

  const { agentPages, buildingPages } = await getHeadDynamicSections();

  return [...staticPages, ...legalPages, ...agentPages, ...buildingPages];
}
