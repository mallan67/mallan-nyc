/**
 * Server-side listing fetch for ISR pages (/buy, /rent).
 *
 * Calls Trestle directly (no HTTP round-trip to our own API),
 * applies distribution gates + compliance pipeline,
 * returns PublicListingDTO[] ready for the frontend.
 *
 * ISR caches the result at the edge — visitors get instant pages.
 * Only revalidation triggers a fresh Trestle call.
 */

import { fetchFromTrestle, fetchListingMedia } from './fetch';
import { hasCredentials } from './auth';
import { checkDistributionGates } from './trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from './mapping';
import { toPublicDTO, type PublicListingDTO } from './public-dto';
import { CARD_SELECT_FIELDS } from './card-fields';
import { cacheListingPhotosToR2 } from '@/lib/images/cache-listing-photos';
import prisma from '@/lib/prisma';
import { filterDisplayableDbListings, dbListingToPublicDTO, type DbListing } from './db-to-public-dto';
import type { Prisma } from '@prisma/client';

interface ServerListingsResult {
  listings: PublicListingDTO[];
  total: number;
  hasMore: boolean;
  attribution: string;
  source: string;
}

export async function getListingsServer(
  type: 'sale' | 'rent',
  limit = 50,
): Promise<ServerListingsResult> {
  const empty: ServerListingsResult = {
    listings: [],
    total: 0,
    hasMore: false,
    attribution: '',
    source: 'none',
  };

  const useIDX = process.env.IDX_ENABLED === 'true';
  if (!useIDX || !hasCredentials()) {
    // Fallback: exclusive listings from DB only
    const exclusives = await fetchExclusives(type);
    return {
      listings: exclusives,
      total: exclusives.length,
      hasMore: false,
      attribution: '',
      source: exclusives.length > 0 ? 'exclusive' : 'none',
    };
  }

  try {
    // Build OData filter
    const filterParts: string[] = [];
    filterParts.push(
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')"
    );
    if (type === 'sale') {
      filterParts.push("PropertyType ne 'ResidentialLease'");
    } else {
      filterParts.push("PropertyType eq 'ResidentialLease'");
    }

    const fetchTop = Math.min(limit * 2 + 20, 200);

    const result = await fetchFromTrestle({
      filter: filterParts.join(' and '),
      select: CARD_SELECT_FIELDS,
      top: fetchTop,
      maxTotal: fetchTop,
      orderby: 'ModificationTimestamp desc',
      count: true,
      expandMedia: false,
    });

    // Distribution gates
    const displayable = result.records.filter(
      (raw) => checkDistributionGates(raw).displayable
    );

    // Map to IDXListing
    const mapped = displayable
      .map((raw) => mapRESOToInternal(raw))
      .filter((l): l is NonNullable<typeof l> => l !== null);

    // Take page
    const pageListings = mapped.slice(0, limit);

    // Fetch media per-listing using fetchListingMedia (proven reliable).
    // Batch OR queries on Trestle Media are unreliable for ~50% of listings.
    if (pageListings.length > 0) {
      try {
        const needsMedia = pageListings.filter(l => l.media.length === 0);
        if (needsMedia.length > 0) {
          const CONCURRENCY = 5;
          for (let i = 0; i < needsMedia.length; i += CONCURRENCY) {
            const batch = needsMedia.slice(i, i + CONCURRENCY);
            await Promise.allSettled(batch.map(async (listing) => {
              try {
                const media = await fetchListingMedia(listing.listingId, {
                  listingKeyNumeric: listing.listingKeyNumeric,
                });
                if (media.length > 0) {
                  const PH = ['cotality.com', 'corelogic.com'];
                  listing.media = media.map(m => ({
                    ...m,
                    url: PH.some(h => m.url.includes(h))
                      ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
                      : m.url,
                  })) as typeof listing.media;
                }
              } catch { /* non-fatal per listing */ }
            }));
          }
        }
      } catch {
        // Non-fatal — listings display without media
      }
    }

    // Cache Trestle photos to R2 for permanent URLs (no proxy needed)
    try {
      await cacheListingPhotosToR2(pageListings);
    } catch {
      // Non-fatal — photos fall back to proxy
    }

    const publicListings = pageListings.map(toPublicDTO);

    // Merge exclusive listings from DB
    const exclusives = await fetchExclusives(type);
    const trestleIds = new Set(publicListings.map(l => l.id));
    const newExclusives = exclusives.filter(e => !trestleIds.has(e.id));
    const merged = [...newExclusives, ...publicListings];

    const totalCount = result.odataCount ?? mapped.length;

    return {
      listings: merged,
      total: totalCount + newExclusives.length,
      hasMore: limit < totalCount || result.hasMore,
      attribution: generateAttributionText(),
      source: 'idx+exclusive',
    };
  } catch (err) {
    console.error('[getListingsServer] Trestle fetch failed:', err instanceof Error ? err.message : err);
    // Fallback to exclusive listings
    const exclusives = await fetchExclusives(type);
    return {
      listings: exclusives,
      total: exclusives.length,
      hasMore: false,
      attribution: '',
      source: exclusives.length > 0 ? 'exclusive' : 'error',
    };
  }
}

async function fetchExclusives(type: 'sale' | 'rent'): Promise<PublicListingDTO[]> {
  try {
    const where: Prisma.ListingWhereInput = {
      status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] },
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      listing_type: type === 'sale' ? 'sale' : 'rent',
    };

    const dbListings = await prisma.listing.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      take: 50,
      select: {
        id: true,
        listing_id: true,
        status: true,
        listing_type: true,
        property_type: true,
        property_sub_type: true,
        list_price: true,
        bedrooms_total: true,
        bathrooms_full: true,
        bathrooms_half: true,
        living_area: true,
        borough: true,
        neighborhood: true,
        address: true,
        features: true,
        media: true,
        agent_info: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        listing_contract_date: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
      },
    });

    const serialized: DbListing[] = dbListings.map((l) => ({
      ...l,
      id: l.id.toString(),
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
    }));

    return filterDisplayableDbListings(serialized).map(dbListingToPublicDTO);
  } catch {
    return [];
  }
}
