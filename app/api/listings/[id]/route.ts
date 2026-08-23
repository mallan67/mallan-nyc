import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import { sanitizeForPublicDisplay } from '@/lib/compliance/idx-display-gate';
import { fetchSingleListing, fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapCotalityToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';
import { geocodeListings } from '@/lib/geo/geocode';
import prisma from '@/lib/prisma';
import { resolveListingMediaFromRows, resolveListingMedia, toDtoMedia } from '@/lib/media/listing-media-resolver';
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
 *   mapCotalityToInternal(raw) → IDXListing
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
    // Track whether the live IDX (Cotality) lookup THREW (an outage) as opposed to
    // returning no record (a genuine miss). An outage must NOT become a cached 404 —
    // that would publicly cache "listing not found" for a real listing during a Cotality
    // outage. On outage + no local fallback we return a non-cacheable 503 instead.
    let idxErrored = false;

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
              // Short negative cache so a repeatedly-hammered dead/non-displayable
              // URL is CDN-served, not re-resolved through the full pipeline each
              // hit. Identical header to the genuine not-found below → gate failures
              // remain indistinguishable from not-found (fail-closed).
              { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
            );
          }

          // Step 2: Map to IDXListing
          const listing = mapCotalityToInternal(raw);
          if (!listing) {
            return NextResponse.json(
              { success: false, error: 'Listing not found' },
              { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
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
            // TWO DIFFERENT IDENTITIES — do not reuse one variable for both.
            //
            // The DB row is keyed by the PUBLIC listing id (`RLS20105333`).
            // Trestle Media is keyed by the PROVIDER record key
            // (`1178013994` — Property.ListingKey / SourceSystemKey).
            // Live-verified on this specimen:
            //   ResourceRecordKey eq '1178013994'  -> 68 rows
            //   ResourceRecordKey eq 'RLS20105333' ->  0 rows
            // The previous single `listingKey` put the NUMERIC provider key
            // into `where: { listing_id: ... }`, so the DB lookup missed and
            // the relational-media path silently fell through to a live fetch.
            const listingId = String(raw.ListingId || id);
            try {
              const dbRow = await prisma.listing.findUnique({
                where: { listing_id: listingId },
                select: {
                  media: true,
                  listing_media: {
                    where: { status: 'active' },
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                    select: {
                      // MIXED-GALLERY COMPOSITION: an all-`crm:` relational set
                      // is a SUPPLEMENT to the legacy Cotality feed JSON, not
                      // the whole gallery. Without this column that case is
                      // undetectable and one CRM upload hides the feed gallery.
                      media_key: true,
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
                  publicListing.media = toDtoMedia(resolved);
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
              // PROVIDER record key — NOT the public listing id. Canonical
              // relation: Property.ListingKey / SourceSystemKey -> Media
              // ResourceRecordKey. `ListingId` stays last-resort only.
              const mediaResourceKey = String(
                raw.ListingKey || raw.SourceSystemKey || raw.ListingId || id,
              );
              const mediaItems = await fetchListingMedia(mediaResourceKey);
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
        // IDX (Cotality) EXCEPTION — an outage, NOT a confirmed miss. Fall through to
        // the local fallback; if that also misses, we return a non-cacheable 503 below
        // (never a cached 404, which would hide a real listing during the outage).
        idxErrored = true;
        console.error(`[/api/listings/${id}] IDX fetch failed, falling back to local data:`, idxError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LOCAL PATH: Serve from data/listings.json (fallback)
    // ═══════════════════════════════════════════════════════════
    const listing = (listingsData.listings as unknown as import('@/lib/types/listing').Listing[]).find((l) => l.id === id);

    if (!listing) {
      // IDX outage with no local fallback → non-cacheable 503 (transient; client/CDN
      // should retry, never cache). A CONFIRMED miss (IDX returned no record, or IDX
      // disabled) → short cached 404.
      if (idxErrored) {
        return NextResponse.json(
          {
            success: false,
            error: 'Listing temporarily unavailable',
            _compliance: { source: 'idx', idxEnabled: useIDX },
          },
          { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Listing not found',
          _compliance: {
            source: 'exclusive',
            idxEnabled: useIDX,
          },
        },
        { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
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
