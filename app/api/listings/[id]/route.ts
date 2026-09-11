import { NextResponse } from 'next/server';
import { fetchSingleListing, fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { cotalityRecordToPublicDTO } from '@/lib/idx/cotality-public-dto';
import { generateAttributionText } from '@/lib/idx/attribution';
import { dbListingToPublicDTO, filterDisplayableDbListings, type DbListing } from '@/lib/idx/db-to-public-dto';
import { resolveFeedAuthorityForPage } from '@/lib/media/feed-media-authority';
import { AGENT_TYPED_SELECT } from '@/lib/listings/agent-info-resolver';
import { geocodeListings } from '@/lib/geo/geocode';
import prisma from '@/lib/prisma';
import { resolveListingMediaFromRows, resolveListingMedia, toDtoMedia } from '@/lib/media/listing-media-resolver';
import { normalizeListingIdCase } from '@/lib/listing-canonical-url';

type Props = {
  params: Promise<{ id: string }>;
};

const REBNY_DISCLAIMER =
  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.';

const NOT_FOUND_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' };

function notFound(source: string, idxEnabled: boolean) {
  // Gate failures and genuine misses share one response (fail-closed: never reveal why).
  return NextResponse.json(
    { success: false, error: 'Listing not found', _compliance: { source, idxEnabled } },
    { status: 404, headers: NOT_FOUND_HEADERS },
  );
}

/**
 * GET /api/listings/:id
 *
 * TWO inventory sources, no third:
 *   1. LIVE COTALITY — fetchSingleListing → checkDistributionGates → the canonical chain
 *      (mapTrestleToPrisma → dbListingToPublicDTO) via cotalityRecordToPublicDTO.
 *   2. CANONICAL MALLAN STORAGE — the `listings` row (Mallan-authored, or a persisted provider
 *      row), gated by filterDisplayableDbListings and projected by dbListingToPublicDTO.
 *
 * The static data/listings.json catalogue that used to be served "when Cotality fails" is gone
 * (Packet 2 closure): a Cotality outage with no canonical Mallan row is a non-cacheable 503,
 * never a substitute record. A confirmed miss on both sources is a short-cached 404.
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { id: rawId } = await params;
    // Canonical URLs lowercase the listing id; Cotality (`ListingId eq …`) and Prisma
    // findUnique are case-SENSITIVE and store it uppercase. Normalize a recognizable id back
    // to uppercase before any lookup. (2026-06-02 sitewide P0 fix.)
    const id = normalizeListingIdCase(rawId);
    const useIDX = process.env.IDX_ENABLED === 'true';
    // Track whether the live Cotality lookup THREW (an outage) as opposed to returning no
    // record (a genuine miss). An outage must NOT become a cached 404.
    let idxErrored = false;

    // ══════════════════════════════════════════════════════════════════════
    // SOURCE 1 — LIVE COTALITY
    // ══════════════════════════════════════════════════════════════════════
    if (useIDX) {
      try {
        const raw = await fetchSingleListing(id);

        if (raw) {
          // Step 1: distribution gates on the RAW record (the one permission interpretation)
          if (!checkDistributionGates(raw).displayable) return notFound('idx', true);

          // Step 2: the canonical chain. An unrepresentable record (absent status / price /
          // timestamp) throws — fail loud below as a 503-class outage, never a default.
          const publicListing = cotalityRecordToPublicDTO(raw, { alreadyGated: true });
          if (!publicListing) return notFound('idx', true);

          // Step 3: media — relational `listing_media` first, legacy `media` JSON, then a live
          // Cotality Media fetch. Compliance gates already ran; this block only sources images.
          if (!publicListing.media || publicListing.media.length === 0) {
            // TWO DIFFERENT IDENTITIES: the DB row is keyed by the PUBLIC listing id
            // (`RLS20105333`); Cotality Media is keyed by the PROVIDER record key
            // (`1178013994` — Property.ListingKey / SourceSystemKey).
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
                  publicListing.photosCount = publicListing.media.filter((m) => m.mediaType === 'Photo').length;
                }
              }
            } catch {
              // Non-fatal — DB lookup is best-effort; we still fall back to a live Media fetch.
            }
          }
          if (!publicListing.media || publicListing.media.length === 0) {
            try {
              const mediaResourceKey = String(raw.ListingKey || raw.SourceSystemKey || raw.ListingId || id);
              const mediaItems = await fetchListingMedia(mediaResourceKey);
              if (mediaItems.length > 0) {
                publicListing.media = mediaItems.map((m) => ({
                  ...m,
                  url: m.url.includes('cotality.com') || m.url.includes('corelogic.com')
                    ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
                    : m.url,
                }));
                publicListing.photosCount = publicListing.media.filter((m) => m.mediaType === 'Photo').length;
              }
            } catch (mediaErr) {
              console.warn(`[/api/listings/${id}] Media fetch failed:`, mediaErr);
            }
          }

          // Step 4: geocode if lat/lng missing (non-fatal)
          const hasCoords = publicListing.address.latitude && publicListing.address.longitude;
          const hasAddress = publicListing.address.streetName !== 'Address Undisclosed';
          if (!hasCoords && hasAddress) {
            try { await geocodeListings([publicListing]); } catch { /* non-fatal */ }
          }

          return NextResponse.json(
            {
              success: true,
              listing: publicListing,
              _compliance: {
                source: 'idx',
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer: REBNY_DISCLAIMER,
              },
            },
            { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
          );
        }
        // raw is null — not on the live provider; fall through to canonical Mallan storage
      } catch (idxError) {
        // Cotality EXCEPTION (or an unrepresentable provider record) — an outage, NOT a miss.
        idxErrored = true;
        console.error(`[/api/listings/${id}] Cotality lookup failed; trying canonical Mallan storage:`, idxError);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SOURCE 2 — CANONICAL MALLAN STORAGE (the `listings` row)
    // ══════════════════════════════════════════════════════════════════════
    const row = await prisma.listing.findUnique({
      where: { listing_id: id },
      select: {
        id: true,
        listing_id: true,
        mls_id: true,
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
        raw_data: true,
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
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
        _count: { select: { listing_media: true } },
        ...AGENT_TYPED_SELECT,
        agent_id: true,
        owner_client_id: true,
        rls_eligible: true,
        commercial_sub_type: true,
        commercial_ownership: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        auction_yn: true,
        auction_type: true,
        auction_start_date: true,
        auction_end_date: true,
        auction_terms_url: true,
        listing_contract_date: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!row) {
      if (idxErrored) {
        // Cotality outage and no canonical Mallan row → non-cacheable 503 (retry, never cache).
        return NextResponse.json(
          { success: false, error: 'Listing temporarily unavailable', _compliance: { source: 'idx', idxEnabled: useIDX } },
          { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
        );
      }
      return notFound('mallan', useIDX);
    }

    const dbListing: DbListing = {
      ...row,
      id: row.id.toString(),
      list_price: row.list_price.toString(),
      living_area: row.living_area?.toString() ?? null,
      agent_id: row.agent_id == null ? null : row.agent_id.toString(),
      owner_client_id: row.owner_client_id == null ? null : row.owner_client_id.toString(),
    };

    // The same gates the list surfaces apply (status, IDX/Internet display, opt-outs; website-only
    // Mallan rows bypass the RLS gates). A gated row is indistinguishable from a miss.
    if (filterDisplayableDbListings([dbListing]).length === 0) return notFound('mallan', useIDX);

    const feedAuthority = await resolveFeedAuthorityForPage(prisma, [{
      ctx: { listingId: dbListing.listing_id, rlsEligible: dbListing.rls_eligible },
      tableRows: Array.isArray(dbListing.listing_media) ? dbListing.listing_media : [],
      hasLegacyPayload: Array.isArray(dbListing.media) && dbListing.media.length > 0,
    }]);
    const publicListing = dbListingToPublicDTO(dbListing, { hadFeedRelationalRows: feedAuthority.get(dbListing.listing_id) });

    const hasCoords = publicListing.address.latitude && publicListing.address.longitude;
    const hasAddress = publicListing.address.streetName !== 'Address Undisclosed';
    if (!hasCoords && hasAddress) {
      try { await geocodeListings([publicListing]); } catch { /* non-fatal */ }
    }

    const compliance = publicListing._displayCompliance;
    return NextResponse.json(
      {
        success: true,
        listing: publicListing,
        _compliance: {
          source: publicListing._source,
          idxEnabled: useIDX,
          ...(compliance?.requiresAttribution ? { attribution: compliance.attributionText } : {}),
          disclaimer: compliance?.disclaimerRequired ? REBNY_DISCLAIMER : 'Information deemed reliable but not guaranteed.',
        },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch listing' }, { status: 500 });
  }
}
