import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import { sanitizeForPublicDisplay } from '@/lib/compliance/idx-display-gate';
import { fetchSingleListing, fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';
import { geocodeListings } from '@/lib/geo/geocode';
import prisma from '@/lib/prisma';
import { resolveListingMediaFromRows, resolveListingMedia } from '@/lib/media/listing-media-resolver';
import { normalizeListingIdCase } from '@/lib/listing-canonical-url';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/listings/:id
 *
 * COMPLIANCE PIPELINE (Option A — distribution gates on raw Trestle data):
 *   fetchSingleListing(listingKey) → raw record
 *   checkDistributionGates(raw) → reject if non-displayable
 *   mapRESOToInternal(raw) → IDXListing
 *   toPublicDTO(listing) → PublicListingDTO (strips private data, suppresses address)
 *
 * When IDX_ENABLED=true: fetches from Trestle by ListingKey.
 * When IDX_ENABLED=false (or Trestle fails): falls back to data/listings.json.
 *
 * Returns 404 if:
 * - Listing not found in either source
 * - Listing fails distribution gates (must NOT be shown publicly)
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { id: rawId } = await params;
    // Canonical URLs lowercase the listing id; Trestle (`ListingId eq …`) and
    // Prisma findUnique are case-SENSITIVE and store it uppercase. Normalize a
    // recognizable REBNY/CRM id back to uppercase before any lookup so
    // `/api/listings/rls20059088` resolves identically to the uppercase form.
    // (2026-06-02 sitewide P0 fix.) Non-id values pass through untouched.
    const id = normalizeListingIdCase(rawId);
    const useIDX = process.env.IDX_ENABLED === 'true';

    // ═══════════════════════════════════════════════════════════
    // IDX PATH: Fetch single listing from Trestle by ListingKey
    // ═══════════════════════════════════════════════════════════
    if (useIDX) {
      try {
        const raw = await fetchSingleListing(id);

        if (raw) {
          // Step 1: Distribution gates on RAW Trestle data
          const gateResult = checkDistributionGates(raw);
          if (!gateResult.displayable) {
            // Listing exists but fails compliance gates — return 404
            // Do NOT reveal the reason to the public (compliance: fail closed)
            return NextResponse.json(
              {
                success: false,
                error: 'Listing not found',
                _compliance: {
                  source: 'idx',
                  idxEnabled: true,
                },
              },
              { status: 404 }
            );
          }

          // Step 2: Map to IDXListing
          const listing = mapRESOToInternal(raw);
          if (!listing) {
            return NextResponse.json(
              { success: false, error: 'Listing not found' },
              { status: 404 }
            );
          }

          // Step 3: Convert to public DTO (strips private data, suppresses address)
          const publicListing = toPublicDTO(listing);

          // Step 4: Resolve media if empty (Trestle Media resource).
          //
          // PR 4 reader swap: try the relational `listing_media` table first
          // (preferred — R2 URLs bypass the Trestle proxy and load faster
          // for the 99.67% of listings already mirrored), then fall back to
          // the legacy `Listing.media` JSON, then fall back to a live
          // Trestle Media fetch. Compliance gates already ran on the raw
          // Trestle payload above; this block only sources image URLs.
          if (!publicListing.media || publicListing.media.length === 0) {
            const listingKey = String(raw.SourceSystemKey || raw.ListingId || id);
            try {
              const dbRow = await prisma.listing.findUnique({
                where: { listing_id: listingKey },
                select: {
                  media: true,
                  listing_media: {
                    where: { status: 'active' },
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                    select: {
                      media_url_original: true,
                      media_url_cached: true,
                      media_type: true,
                      media_category: true,
                      media_classification: true,
                      order: true,
                      preferred_photo_yn: true,
                      status: true,
                    },
                  },
                },
              });
              if (dbRow) {
                const tableRows = Array.isArray(dbRow.listing_media) ? dbRow.listing_media : [];
                const resolved = tableRows.length > 0
                  ? resolveListingMediaFromRows(tableRows)
                  : resolveListingMedia(
                      Array.isArray(dbRow.media) ? (dbRow.media as Record<string, unknown>[]) : [],
                    );
                if (resolved.length > 0) {
                  publicListing.media = resolved.map((m) => ({
                    url: m.url,
                    mediaType: m.mediaType,
                    order: m.providerOrder,
                  }));
                  publicListing.photosCount = publicListing.media.filter(
                    (m) => m.mediaType === 'Photo',
                  ).length;
                }
              }
            } catch {
              // Non-fatal — DB lookup is best-effort; we still fall back to
              // a live Trestle Media fetch below.
            }
          }
          if (!publicListing.media || publicListing.media.length === 0) {
            try {
              const listingKey = String(raw.SourceSystemKey || raw.ListingId || id);
              const mediaItems = await fetchListingMedia(listingKey);
              if (mediaItems.length > 0) {
                publicListing.media = mediaItems.map(m => ({
                  ...m,
                  url: m.url.includes('cotality.com') || m.url.includes('corelogic.com')
                    ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
                    : m.url,
                }));
                publicListing.photosCount = publicListing.media.filter(m => m.mediaType === 'Photo').length;
              }
            } catch (mediaErr) {
              // Non-fatal — listing displays without photos
              console.warn(`[/api/listings/${id}] Media fetch failed:`, mediaErr);
            }
          }

          // Step 5: Geocode if lat/lng missing (non-fatal)
          const hasCoords = publicListing.address.latitude && publicListing.address.longitude;
          const hasAddress = publicListing.address.streetName !== 'Address Undisclosed';
          if (!hasCoords && hasAddress) {
            try {
              await geocodeListings([publicListing]);
            } catch {
              // Non-fatal — listing displays without coordinates
            }
          }

          return NextResponse.json(
            {
              success: true,
              listing: publicListing,
              _compliance: {
                source: 'idx',
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer:
                  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
              },
            },
            {
              headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
              },
            }
          );
        }
        // raw is null — listing not found in Trestle, fall through to local
      } catch (idxError) {
        // IDX fetch failed — fall through to local data for resilience
        console.error(`[/api/listings/${id}] IDX fetch failed, falling back to local data:`, idxError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LOCAL PATH: Serve from data/listings.json (fallback)
    // ═══════════════════════════════════════════════════════════
    const listing = (listingsData.listings as unknown as import('@/lib/types/listing').Listing[]).find((l) => l.id === id);

    if (!listing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Listing not found',
          _compliance: {
            source: 'exclusive',
            idxEnabled: useIDX,
          },
        },
        { status: 404 }
      );
    }

    // REBNY COMPLIANCE: Sanitize listing for public display — strip private data
    const sanitizedListing = sanitizeForPublicDisplay(
      listing as unknown as import('@/lib/types/listing').Listing
    );

    return NextResponse.json(
      {
        success: true,
        listing: sanitizedListing,
        _compliance: {
          source: 'exclusive',
          idxEnabled: useIDX,
          disclaimer: 'Information deemed reliable but not guaranteed.',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}
