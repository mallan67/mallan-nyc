/**
 * SITEMAP SNAPSHOT — one cached object that the sitemap index AND every
 * partition read (2026-07-23, rev 3 architecture).
 *
 * Why one snapshot (Maya findings, exact-head preview review):
 *   - Next's generateSitemaps metadata machinery produced a Vercel runtime
 *     slug conflict ("'id' !== '__next_metadata_id__'", /sitemap.xml 500) —
 *     rev 3 uses PLAIN ROUTE HANDLERS only: /sitemap.xml (index),
 *     /sitemap/{id}.xml (partitions), /sitemap-index.xml (308 → index).
 *   - Independently-cached offset partitions could straddle a sync
 *     invalidation (rows shifting between offsets → omitted/duplicated URLs
 *     in a mixed-version crawl). Here EVERY route reads THE SAME cache entry
 *     — within a cache window all readers see one dataset version — and
 *     chunk membership is assigned by a STABLE HASH of listing_id, so a
 *     listing's partition never changes when OTHER listings come and go: a
 *     crawl that mixes snapshot versions still sees every unchanged
 *     canonical URL exactly once (test-proven).
 *   - Completeness is structural: the full gated population is fetched by
 *     deterministic keyset pagination (no fixed take that can silently
 *     truncate); past the explicit ceiling the build THROWS — routes 500
 *     (fail-closed) rather than publish a falsely complete sitemap. There is
 *     no catch-and-return-empty anywhere on this path.
 *
 * Neon-quiet: the whole snapshot builds at most once per revalidation window
 * (`search` tag — bumped by every idx-sync that changed anything; 30-min
 * fallback). Regenerations execute ZERO Neon queries between syncs.
 *
 * COMPLIANCE (unchanged from the original sitemap): distribution gates,
 * ACTIVE_DISPLAY_VALUES status filter, SEO-001 shared slug composition
 * (composeSlugStreetName), CRM-vs-IDX dedupe over the FULL population,
 * suppressed-address MLS-ID slugs.
 */
import prisma from '@/lib/prisma';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { dedupeRawDbRows } from '@/lib/listings/dedupe-crm-vs-idx';
import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

export const BASE_URL = 'https://mallan.nyc';

export const LISTINGS_PER_PARTITION = 10000;
/** 50 × 10k = 500k listing URLs — far beyond any plausible population for one
 *  brokerage site. Past it the snapshot build THROWS (routes 500). */
export const MAX_SITEMAP_PARTITIONS = 50;
const PAGE_SIZE = 10000;

/** EXACT distribution-gate WHERE clause (identical to the original sitemap). */
export const SITEMAP_LISTING_WHERE = {
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  status: { in: [...ACTIVE_DISPLAY_VALUES] as string[] },
};

export interface SitemapFullEntry {
  url: string;
  lastModified: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

export interface SitemapSnapshot {
  generatedAt: string;
  /** listing count AFTER dedupe */
  listingCount: number;
  /** number of listing partitions (ids 1..partitions; id 0 = head) */
  partitions: number;
  /** static + legal + agents + buildings sections (partition 0) */
  headEntries: SitemapFullEntry[];
  /** hash-bucketed listing chunks; tuple = [url, lastModifiedIso].
   *  Listing entries always render changefreq=daily, priority=0.7. */
  listingChunks: Array<Array<[string, string]>>;
}

/** djb2 — stable, dependency-free string hash for chunk membership. */
export function stableBucket(id: string, buckets: number): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % buckets;
}

type ListingRow = {
  listing_id: string;
  mls_id: string | null;
  address: unknown;
  internet_address_display_yn: boolean | null;
  modification_timestamp: Date | string | null;
};

/** Full gated population via deterministic keyset pagination — never a fixed
 *  take that can silently truncate. Throws past the explicit ceiling. */
async function fetchAllListingRows(): Promise<ListingRow[]> {
  const out: ListingRow[] = [];
  let cursor: string | null = null;
  const maxPages = MAX_SITEMAP_PARTITIONS + 1;
  for (let page = 0; page < maxPages; page++) {
    const rows: ListingRow[] = await prisma.listing.findMany({
      where: SITEMAP_LISTING_WHERE,
      select: {
        listing_id: true,
        mls_id: true,
        address: true,
        internet_address_display_yn: true,
        modification_timestamp: true,
      },
      orderBy: { listing_id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { listing_id: cursor }, skip: 1 } : {}),
    });
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    cursor = rows[rows.length - 1].listing_id;
  }
  throw new Error(
    `[sitemap-snapshot] OVERFLOW: more than ${PAGE_SIZE * maxPages} gated listings — refusing to build a truncated sitemap.`,
  );
}

function listingRowToTuple(l: ListingRow, nowIso: string): [string, string] {
  const addr = (l.address || {}) as Record<string, string>;
  const slug = generateListingSlug({
    address: {
      streetNumber: addr.StreetNumber || addr.streetNumber || '',
      // SEO-001 (2026-07-02): compose DirPrefix + Name + Suffix via the
      // SHARED helper — passing StreetName alone made 10,069/10,239 sitemap
      // URLs diverge from the page canonicals (full-population audit
      // 2026-07-01).
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
  const lastMod =
    typeof l.modification_timestamp === 'string'
      ? l.modification_timestamp
      : (l.modification_timestamp?.toISOString?.() ?? nowIso);
  return [`${BASE_URL}${buildCanonicalListingPath({ slug, id: l.listing_id })}`, lastMod];
}

async function buildHeadEntries(nowIso: string): Promise<SitemapFullEntry[]> {
  // Core public pages — always indexed. /search is deliberately NOT here
  // (parameterless thin-content page; robots.ts blocks it — the canonical
  // indexable listing URLs are /listing/{slug} in partitions 1+).
  const staticPages: SitemapFullEntry[] = [
    { url: BASE_URL, lastModified: nowIso, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/buy`, lastModified: nowIso, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/buy/international`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/rent`, lastModified: nowIso, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/sell`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/sell/international`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/agents`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/open-houses`, lastModified: nowIso, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/contact`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/neighborhoods`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/market`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/manhattan`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/brooklyn`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/queens`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/bronx`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/staten-island`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.6 },
    // Legal/compliance pages — required for indexing
    { url: `${BASE_URL}/privacy`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: nowIso, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/fair-housing`, lastModified: nowIso, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE_URL}/sop`, lastModified: nowIso, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/reasonable-accommodations`, lastModified: nowIso, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const agents = await prisma.agent.findMany({
    where: { status: 'active' },
    select: { public_slug: true, updated_at: true },
    orderBy: { public_slug: 'asc' },
    take: 500,
  });
  const agentPages: SitemapFullEntry[] = agents
    .filter((a) => a.public_slug)
    .map((a) => ({
      url: `${BASE_URL}/agents/${a.public_slug}`,
      lastModified: a.updated_at?.toISOString() ?? nowIso,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

  // Building profile pages — from the local buildings table. NOTE (2026-07-23
  // production measurement): 0 rows today (the request-time "silent upsert"
  // never fired and is removed from the public GET); emits zero URLs until an
  // explicit, approved building-sync workflow populates it.
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
  const buildingPages: SitemapFullEntry[] = buildings
    .filter((b) => b.street_number && b.street_name)
    .map((b) => {
      const slug = [b.name || '', b.street_number, b.street_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const sp = new URLSearchParams({ sn: b.street_number || '', st: b.street_name || '' });
      if (b.zip) sp.set('z', b.zip);
      if (b.name) sp.set('bn', b.name);
      return {
        url: `${BASE_URL}/buildings/${slug}?${sp.toString()}`,
        lastModified: b.last_synced_at?.toISOString() ?? nowIso,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      };
    });

  return [...staticPages, ...agentPages, ...buildingPages];
}

async function buildSitemapSnapshot(): Promise<SitemapSnapshot> {
  const nowIso = new Date().toISOString();
  const rowsRaw = await fetchAllListingRows();
  // Public-surface dedupe (2026-05-28) over the FULL population — a Mallan
  // CRM exclusive (SL-/RL-) and its Trestle/IDX duplicate can never both be
  // emitted, regardless of which partition either would land in.
  const rows = dedupeRawDbRows(rowsRaw as never[]) as unknown as ListingRow[];

  const partitions = Math.max(1, Math.ceil(rows.length / LISTINGS_PER_PARTITION));
  if (partitions > MAX_SITEMAP_PARTITIONS) {
    throw new Error(
      `[sitemap-snapshot] ${rows.length} listings need ${partitions} partitions (max ${MAX_SITEMAP_PARTITIONS}) — refusing to build a truncated sitemap.`,
    );
  }

  // Stable hash bucketing: a listing's partition depends ONLY on its own
  // listing_id (and the partition count), never on other rows' positions.
  const buckets: Array<Array<{ id: string; tuple: [string, string] }>> = Array.from(
    { length: partitions },
    () => [],
  );
  for (const l of rows) {
    buckets[stableBucket(l.listing_id, partitions)].push({ id: l.listing_id, tuple: listingRowToTuple(l, nowIso) });
  }
  const listingChunks = buckets.map((b) =>
    b.sort((x, y) => (x.id < y.id ? -1 : 1)).map((e) => e.tuple),
  );

  const headEntries = await buildHeadEntries(nowIso);

  return { generatedAt: nowIso, listingCount: rows.length, partitions, headEntries, listingChunks };
}

/**
 * THE shared accessor — index and every partition read this ONE entry.
 * Sync-driven `search` revalidation + 30-min fallback.
 */
export const getSitemapSnapshot = cachedPublicRead(buildSitemapSnapshot, ['sitemap-snapshot'], {
  tags: [SEARCH_CACHE_TAG],
});

// ── XML rendering (shared by the routes) ───────────────────────────────────

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderUrlset(entries: SitemapFullEntry[]): string {
  const body = entries
    .map(
      (e) =>
        `  <url><loc>${escapeXml(e.url)}</loc><lastmod>${escapeXml(e.lastModified)}</lastmod><changefreq>${e.changeFrequency}</changefreq><priority>${e.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderListingUrlset(tuples: Array<[string, string]>): string {
  const body = tuples
    .map(
      ([url, lastmod]) =>
        `  <url><loc>${escapeXml(url)}</loc><lastmod>${escapeXml(lastmod)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderSitemapIndex(partitions: number, nowIso: string): string {
  const ids = Array.from({ length: partitions + 1 }, (_, i) => i); // 0=head, 1..K listings
  const body = ids
    .map(
      (id) =>
        `  <sitemap><loc>${escapeXml(`${BASE_URL}/sitemap/${id}.xml`)}</loc><lastmod>${escapeXml(nowIso)}</lastmod></sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}
