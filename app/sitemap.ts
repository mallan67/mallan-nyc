import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { generateListingSlug } from '@/lib/listing-slug';

const BASE_URL = 'https://mallan.nyc';

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
    { url: `${BASE_URL}/rent`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/sell`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/agents`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/open-houses`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
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
    const listings = await prisma.listing.findMany({
      where: {
        // Distribution gates — all must pass for sitemap inclusion
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
        // Only active listings (closed removed per 24h rule)
        status: { in: ['Active', 'Coming Soon'] },
      },
      select: {
        listing_id: true,
        mls_id: true,
        address: true,
        internet_address_display_yn: true,
        modification_timestamp: true,
      },
    });

    listingPages = listings.map((l) => {
      const addr = (l.address || {}) as Record<string, string>;
      const slug = generateListingSlug({
        address: {
          streetNumber: addr.StreetNumber || addr.streetNumber || '',
          streetName: addr.StreetName || addr.streetName || '',
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
        url: `${BASE_URL}/listing/${slug}`,
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
