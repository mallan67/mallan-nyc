import { NextRequest, NextResponse } from 'next/server';
import { cachedPublicRead, listingCacheTag, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import { classifyMediaItem } from '@/lib/media/listing-media-resolver';
// Canonical DB→public media composition. The DB comp branch used to read the legacy
// `Listing.media` JSON directly (`Array.isArray(l.media)` for the has-media test and
// again for the photo pick), never consulting the relational `listing_media` rows that
// every other public surface treats as the authority — so a comp whose photos live only
// in `listing_media` was dropped for "no media", and a Mallan comp whose relational
// photos were deleted still rendered them from the stale JSON.
import { composeDbPublicMedia } from '@/lib/media/db-media-composition';
import { resolveFeedAuthorityForPage } from '@/lib/media/feed-media-authority';
import prisma from '@/lib/prisma';
import { dedupeRawDbRows, sameAddressKey } from '@/lib/listings/dedupe-crm-vs-idx';
import { getSimilarityPriceBand, rankSimilarListings, classifyPropertyClass, normalizePropertyClass, collapseForRental, type SimilarityTarget } from '@/lib/listings/similar-listing-ranking';
import { getAccessToken } from '@/lib/idx/auth';
import { fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { SEARCH_DISPLAY_GATE } from '@/lib/search/listing-access-decision';
import { excludeMallanRlsReturnCopies } from "@/lib/listings/mallan-source-identity";
import { resolveListingAgentInfo } from '@/lib/listings/agent-info-resolver';

export const maxDuration = 60;

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

function mapPropertyType(r: Record<string, unknown>): string {
  const ci = r.CommonInterest ? String(r.CommonInterest) : '';
  if (ci === 'Condominium') return 'Condo';
  if (ci === 'StockCooperative') return 'Co-op';
  if (ci === 'Condop') return 'Condop';
  const sub = (r.PropertySubType ? String(r.PropertySubType) : '').toLowerCase();
  if (sub.includes('condo')) return 'Condo';
  if (sub.includes('co-op') || sub.includes('coop')) return 'Co-op';
  if (sub.includes('townhouse')) return 'Townhouse';
  if (sub.includes('loft')) return 'Loft';
  if (sub === 'apartment') return '';
  return r.PropertySubType ? String(r.PropertySubType) : '';
}

/** Proxy Trestle media URLs so they load in the browser */
function proxyUrl(url: string): string {
  if (!url) return '';
  if (url.includes('cotality.com') || url.includes('corelogic.com') || url.includes('trestle.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Mask address when REBNY RLS InternetAddressDisplayYN gate is false or unknown.
 * Fail-closed: null/undefined → masked. Per REBNY RLS Sec. 2.05.
 */
function maskAddressIfRestricted(address: string, internetAddressDisplayYN: boolean | null | undefined): string {
  if (internetAddressDisplayYN === true) return address;
  return 'Address available upon request';
}

/**
 * GET /api/listings/similar?type=sale&beds=1&price=715000&postalCode=10011&excludeId=xxx
 *
 * Returns up to 6 similar listings nearby (same ZIP, similar beds/price).
 * Fetches media separately per listing (Trestle $expand=Media is unreliable).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'sale';
  // Bedroom count of the listing being viewed — the ranking helper matches on it.
  const beds = Number(searchParams.get('beds') || 0);
  const price = Number(searchParams.get('price') || 0);
  const postalCode = searchParams.get('postalCode') || '';
  const excludeId = searchParams.get('excludeId') || '';
  const neighborhood = searchParams.get('neighborhood') || '';
  // Subject property class — comps are matched like-with-like (townhouse↔townhouse, condo↔condo,
  // house↔house…). Both the mapped display (propertyType) and the raw PropertySubType are read so
  // rentals/townhouses/houses classify correctly.
  const propertyType = searchParams.get('propertyType') || '';
  const propertySubType = searchParams.get('propertySubType') || '';

  if (!postalCode || !price) {
    return NextResponse.json({ listings: [] });
  }

  // One Cycle W1 — the full similar-comps computation (DB-first + Trestle
  // fallback) is cached per parameter tuple and tagged so the SYNC that
  // changes the data refreshes it. Anonymous read; JSON-safe payload; the
  // wrapper fails closed to the live computation on any cache-layer error.
  const payload = await cachedPublicRead(computeSimilarListings, ['api-listings-similar'], {
    tags: [SEARCH_CACHE_TAG, ...(excludeId ? [listingCacheTag(excludeId)] : [])],
  })({ type, beds, price, postalCode, excludeId, neighborhood, propertyType, propertySubType });
  return NextResponse.json(payload);
}

interface SimilarParams {
  type: string;
  beds: number;
  price: number;
  postalCode: string;
  excludeId: string;
  neighborhood: string;
  propertyType: string;
  propertySubType: string;
}

async function computeSimilarListings(params: SimilarParams): Promise<Record<string, unknown>> {
  const { type, beds, price, postalCode, excludeId, neighborhood, propertyType, propertySubType } = params;
  try {
    // ── DB-first: query local listings for similar properties ──
    const isRental = type === 'rent';
    const listingTypeFilter = isRental ? 'rent' : 'sale';
    // Candidate price band + similarity target come from the shared ranking helper
    // (lib/listings/similar-listing-ranking.ts): band = 0.7–1.3x sale / 0.75–1.25x rent;
    // ranking then orders by bedroom match + price/location proximity.
    const { min: minPrice, max: maxPrice } = getSimilarityPriceBand(price, isRental);
    // Subject class: prefer the mapped display (encodes condo/co-op via CommonInterest), fall back to
    // the raw sub-type (apartment/townhouse/house). Rentals collapse apartment-style to one bucket.
    const subjectClass = collapseForRental(
      normalizePropertyClass(propertyType) || normalizePropertyClass(propertySubType),
      isRental,
    );
    const target: SimilarityTarget = {
      beds,
      price,
      postalCode,
      neighborhood: neighborhood || undefined,
      propertyClass: subjectClass || undefined,
    };

    // Fetch the excluded listing's address atoms BEFORE the similar query.
    // Used below to suppress any row whose physical address matches the
    // excluded listing's address — closes the Codex PR #269 review finding
    // that the Prisma `listing_id: { not: excludeId }` filter only removes
    // the exact-id row, leaving IDX/CRM duplicates of the excluded listing
    // free to surface as "similar" cards on the listing's own detail page.
    const excludedListing = await prisma.listing
      .findUnique({
        where: { listing_id: excludeId },
        select: { listing_id: true, address: true },
      })
      .catch(() => null);

    const dbResultsRaw = await prisma.listing.findMany({
      where: {
        status: 'Active',
        listing_type: listingTypeFilter,
        list_price: { gte: minPrice, lte: maxPrice },
        listing_id: { not: excludeId },
        ...SEARCH_DISPLAY_GATE,
        // MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
        //
        // This route spreads SEARCH_DISPLAY_GATE directly rather than calling
        // `buildSearchDisplayWhere`, so it does NOT inherit the suppression the
        // canonical builder adds. Without this, Mallan's own returned Cotality
        // row could appear as a "similar" comp beside — or instead of — its own
        // local canonical listing. Applied from the same single owner, inside
        // the query so it precedes any limit.
        AND: [excludeMallanRlsReturnCopies()],
        OR: [
          { address: { path: ['PostalCode'], equals: postalCode } },
          ...(neighborhood ? [{ neighborhood }] : []),
        ],
      },
      orderBy: { list_price: 'desc' },
      take: 24, // wider candidate pool; the ranking helper picks the closest matches
      // `include` (not `select`) — the default scalar projection is preserved
      // untouched, including the legacy `media` JSON the composer still uses as its
      // fallback input. This widens the EXISTING query; no extra round trip.
      include: {
        // Canonical media rows. Same shape /api/listings selects
        // (app/api/listings/route.ts:396-414). Active-only + (order, id) so the
        // resolver receives a stable input.
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            // media_key: MIXED-GALLERY COMPOSITION — an all-`crm:` set is a
            // SUPPLEMENT to the feed JSON, not the whole gallery
            // (listing-media-resolver.ts:748-765).
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
        // ALL-STATUS existence signal. The select above is ACTIVE-only, so
        // `listing_media.length` would read an all-deleted Mallan comp as "never
        // imported" and RESURRECT its deleted photos out of the legacy JSON
        // (db-media-composition.ts:55-67).
        _count: { select: { listing_media: true } },
      },
    });

    // Public-surface dedupe (2026-05-28): collapse Mallan CRM exclusive +
    // Trestle-synced IDX duplicate for the same physical unit, keeping the
    // CRM row. Applies before the downstream filtering/mapping so neither
    // copy reaches the response. See lib/listings/dedupe-crm-vs-idx.ts.
    //
    // Then additionally drop any row whose normalized address key matches
    // the EXCLUDED listing's address — this catches two cases the in-set
    // dedupe alone misses:
    //   1. excludeId is a CRM exclusive (SL-/RL-); its IDX duplicate has
    //      no CRM partner in `dbResultsRaw` (because the CRM row was
    //      filtered out by Prisma above), so the helper would pass the
    //      IDX duplicate through unchanged. The address-key filter
    //      removes it.
    //   2. excludeId is an IDX row that has a CRM partner in the result
    //      set; the helper would surface the CRM row (correctly) but it's
    //      still the same physical unit the user is viewing, so we drop it.
    const dbResults = dedupeRawDbRows(dbResultsRaw).filter(
      (r) => !sameAddressKey(r, excludedListing),
    );

    // Rank the deduped candidates by similarity (bedroom match + price/location
    // proximity). rankSimilarListings drops bedroom-mismatches (INFINITY score) and
    // null-beds, so "similar" is genuinely similar — not just the nearest list_price.
    const rankedDb = rankSimilarListings(
      dbResults.map((l) => {
        const a = l.address as Record<string, string> | null;
        return {
          row: l,
          beds: l.bedrooms_total ?? null,
          price: Number(l.list_price),
          postalCode: a?.PostalCode ?? null,
          neighborhood: l.neighborhood ?? null,
          propertyClass: collapseForRental(classifyPropertyClass((l.features as Record<string, unknown>)?.CommonInterest as string, l.property_sub_type, l.property_type), isRental) || null,
        };
      }),
      target,
      12, // rank a few extra; the media filter below trims to 6
    ).map((c) => c.row);

    if (rankedDb.length >= 3) {
      // Enough similar (bedroom-matched) results from DB — use those (faster, no Trestle
      // dependency). Backfill media for the top ranked rows that have none (up to 5
      // concurrent), PRESERVING rank order, then keep the first 6 that end up with a photo.
      //
      // ONE composition per row, computed once and reused by BOTH the "does this comp
      // have media?" backfill decision and the card's hero/photo count below — so the
      // two can never disagree (the old code answered them from two different reads of
      // the same JSON). Pure function, no query (db-media-composition.ts:35-38).
      // FEED-authority for the comp set in ONE grouped query (lib/media/feed-media-authority.ts):
      // a comp whose feed rows were materialized then tombstoned is authoritatively empty, so its
      // stale legacy JSON must not supply the card hero. Ambiguous rows only; failures propagate.
      const feedAuthority = await resolveFeedAuthorityForPage(
        prisma,
        rankedDb.map((l) => ({
          ctx: { listingId: l.listing_id, rlsEligible: l.rls_eligible },
          tableRows: Array.isArray(l.listing_media) ? l.listing_media : [],
          hasLegacyPayload: Array.isArray(l.media) && l.media.length > 0,
        })),
      );

      const composedById = new Map<string, ReturnType<typeof composeDbPublicMedia>>();
      for (const l of rankedDb) {
        composedById.set(
          l.listing_id,
          composeDbPublicMedia({
            listingId: l.listing_id,
            rlsEligible: l.rls_eligible,
            tableRows: l.listing_media,
            legacyMedia: Array.isArray(l.media) ? l.media : [],
            // ALL-STATUS count, never `l.listing_media.length` (active-only select):
            // an all-deleted Mallan comp must stay authoritatively empty, not fall
            // back to its own stale JSON.
            hadRelationalRows:
              typeof l._count?.listing_media === 'number' ? l._count.listing_media > 0 : undefined,
            hadFeedRelationalRows: feedAuthority.get(l.listing_id),
          }),
        );
      }
      const hasDbMedia = (l: (typeof rankedDb)[number]) =>
        (composedById.get(l.listing_id)?.media.length ?? 0) > 0;
      const needsMedia = rankedDb.filter((l) => !hasDbMedia(l)).slice(0, 5);
      if (needsMedia.length > 0) {
        const mediaResults = await Promise.allSettled(
          needsMedia.map((l) => fetchListingMedia(l.listing_id)),
        );
        needsMedia.forEach((l, i) => {
          const r = mediaResults[i];
          if (r.status === 'fulfilled' && r.value.length > 0) {
            (l as Record<string, unknown>)._backfilledMedia = r.value;
          }
        });
      }
      const hasAnyMedia = (l: (typeof rankedDb)[number]) =>
        hasDbMedia(l) || Array.isArray((l as Record<string, unknown>)._backfilledMedia);
      const combined = rankedDb.filter(hasAnyMedia).slice(0, 6);

      const listings = combined.map(l => {
        const addr = l.address as Record<string, string> | null;
        const streetNum = addr?.StreetNumber || '';
        const streetName = [addr?.StreetDirPrefix, addr?.StreetName, addr?.StreetSuffix, addr?.StreetDirSuffix].filter(Boolean).join(' ') || '';
        const unit = addr?.UnitNumber ? `, ${addr.UnitNumber}` : '';

        // Canonical composition first (relational rows, with the legacy JSON as the
        // resolver's own fallback); the live-Trestle backfill only covers rows the
        // composition left empty.
        const composed = composedById.get(l.listing_id);
        const backfilledMedia = (l as Record<string, unknown>)._backfilledMedia as { url: string; mediaType: string; order: number }[] | undefined;
        let photoUrl: string | null = null;
        let photosCount = 0;

        if (composed && composed.media.length > 0) {
          // `composed.media` is photo-first, so `find(Photo)` is the hero and a
          // FloorPlan can never lead. Its URLs are ALREADY proxied exactly once by
          // toPublicMediaUrl — do NOT re-apply `proxyUrl`: that substring-matches
          // `cotality.com` INSIDE the encoded `?url=` parameter and would mint a
          // nested proxy URL the proxy route rejects with 403
          // (lib/media/proxy-url-policy.ts:17-26).
          photosCount = composed.photoCount;
          photoUrl = composed.media.find(m => m.mediaType === 'Photo')?.url ?? null;
        } else if (backfilledMedia && backfilledMedia.length > 0) {
          // Raw Trestle Media records from the live backfill — not composed, so they
          // still need the local proxy wrap. URL-shape-aware photo selection:
          // classifyMediaItem rejects a null/empty-mediaType DOCUMENT- floor plan by
          // URL, which `mediaType === 'Photo' || !mediaType` did not.
          const photos = backfilledMedia.filter(m => classifyMediaItem(m) === 'photo');
          photosCount = photos.length;
          if (photos.length > 0) {
            photoUrl = proxyUrl(photos[0].url);
          }
        }

        const fullAddress = `${streetNum} ${streetName}${unit}`.trim();
        return {
          id: l.listing_id,
          mlsId: l.listing_id,
          slug: l.listing_id,
          listPrice: Number(l.list_price),
          beds: l.bedrooms_total ?? 0,
          baths: l.bathrooms_full ?? 0,
          sqft: l.living_area ? Number(l.living_area) : 0,
          address: maskAddressIfRestricted(fullAddress, l.internet_address_display_yn),
          neighborhood: l.neighborhood || '',
          photoUrl,
          photosCount,
          propertyType: mapPropertyType({ CommonInterest: (l.features as Record<string, unknown>)?.CommonInterest, PropertySubType: l.property_sub_type, PropertyType: l.property_type }),
          // Phase B: office attribution TYPED-FIRST (list_office_name), agent_info JSON fallback.
          office: resolveListingAgentInfo(l).officeName || '',
        };
      });

      return {
        listings,
        _compliance: { source: 'idx', attribution: 'REBNY RLS' },
      };
    }

    // ── Trestle fallback if DB has fewer than 3 results ──
    const token = await getAccessToken();

    const propertyClass = isRental
      ? "PropertyType eq 'ResidentialLease'" // live Cotality value is camelCase, no space (invariant 7)
      : "PropertyType eq 'Residential'";

    const priceFilter = `ListPrice ge ${minPrice} and ListPrice le ${maxPrice}`;
    const selectFields = 'ListingId,ListingKey,SourceSystemKey,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,StreetNumber,StreetName,UnitNumber,PostalCode,PropertySubType,PropertyType,CommonInterest,ListOfficeName,CityRegion,InternetAddressDisplayYN,InternetEntireListingDisplayYN,MlsStatus';

    // Build filter: same ZIP, similar price, active, same type
    // Do NOT use $expand=Media — Trestle often rejects it with 400.
    // Instead, fetch media separately per listing after getting property results.
    // Status filter MUST be StandardStatus, NOT MlsStatus: the Cotality API rejects filtering/ordering
    // on MlsStatus ("field 'MlsStatus' cannot be used for filtering or ordering queries" → HTTP 400),
    // which silently killed this entire live-feed path (verified live on Cotality 2026-07-16).
    const zipFilter = `PostalCode eq '${postalCode}' and StandardStatus eq 'Active' and ${propertyClass} and ${priceFilter}`;

    const params = new URLSearchParams({
      $filter: zipFilter,
      $select: selectFields,
      // Fetch the FULL in-band candidate pool (not just the 7 most expensive) so rankSimilarListings
      // can pick the closest bedroom-matched comps. With $top: 7 + ListPrice desc the query only
      // returned the priciest in-band units, starving the ranker of the nearby-priced studios.
      $orderby: 'ListPrice asc',
      $top: '50',
    });

    const zipAbort = new AbortController();
    const zipTimer = setTimeout(() => zipAbort.abort(), 10_000);
    const res = await fetch(`${TRESTLE_URL}/odata/Property?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      next: { revalidate: 3600 },
      signal: zipAbort.signal,
    });
    clearTimeout(zipTimer);

    if (!res.ok) {
      console.warn(`[/api/listings/similar] Trestle ZIP query failed: ${res.status}`);
      return { listings: [] };
    }

    const data = await res.json();
    let allResults = data.value || [];

    // If ZIP-based search returned fewer than 4 results, widen to neighborhood
    if (allResults.length < 4 && neighborhood) {
      const escapedNeighborhood = neighborhood.replace(/'/g, "''");
      const neighborhoodFilter = `CityRegion eq '${escapedNeighborhood}' and StandardStatus eq 'Active' and ${propertyClass} and ${priceFilter}`;
      const nhParams = new URLSearchParams({
        $filter: neighborhoodFilter,
        $select: selectFields,
        $orderby: 'ListPrice asc',
        $top: '50',
      });
      try {
        const nhAbort = new AbortController();
        const nhTimer = setTimeout(() => nhAbort.abort(), 8_000);
        const nhRes = await fetch(`${TRESTLE_URL}/odata/Property?${nhParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
          signal: nhAbort.signal,
        });
        clearTimeout(nhTimer);
        if (nhRes.ok) {
          const nhData = await nhRes.json();
          const existingIds = new Set(allResults.map((r: Record<string, unknown>) => String(r.ListingId || r.ListingKey)));
          for (const r of (nhData.value || [])) {
            const rid = String(r.ListingId || r.ListingKey);
            if (!existingIds.has(rid)) {
              allResults.push(r);
              existingIds.add(rid);
            }
          }
        }
      } catch { /* non-fatal — use ZIP results only */ }
    }

    // Distribution gate check — filter out listings that fail REBNY RLS display rules
    allResults = allResults.filter((r: Record<string, unknown>) => checkDistributionGates(r).displayable);

    // Filter out the current listing, then rank by similarity (bedroom match +
    // price/location proximity) and take the closest 6 — parity with the DB branch.
    // (allResults is `any` from res.json(), so type the candidate array explicitly.)
    const trestleCandidates: {
      row: Record<string, unknown>;
      beds: number | null;
      price: number;
      postalCode: string | null;
      neighborhood: string | null;
      propertyClass: string | null;
    }[] = allResults
      .filter((r: Record<string, unknown>) => {
        const id = String(r.ListingId || r.ListingKey || '');
        return id !== excludeId;
      })
      .map((r: Record<string, unknown>) => ({
        row: r,
        beds: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
        price: Number(r.ListPrice || 0),
        postalCode: r.PostalCode != null ? String(r.PostalCode) : null,
        neighborhood: r.CityRegion != null ? String(r.CityRegion) : null,
        propertyClass: collapseForRental(classifyPropertyClass(r.CommonInterest as string, r.PropertySubType as string, r.PropertyType as string), isRental) || null,
      }));
    const filtered = rankSimilarListings(trestleCandidates, target, 6).map((c) => c.row);

    // Fetch primary photo for each listing in parallel (separate media calls)
    const listings = await Promise.all(
      filtered.map(async (r: Record<string, unknown>) => {
        const mlsId = String(r.ListingId || '');
        const listingKey = String(r.SourceSystemKey || r.ListingKey || r.ListingId || '');
        const streetNum = String(r.StreetNumber || '');
        const streetName = String(r.StreetName || '');
        const unit = r.UnitNumber ? `, ${r.UnitNumber}` : '';

        // Fetch primary photo via separate media call
        let photoUrl: string | null = null;
        let photosCount = 0;
        try {
          const media = await fetchListingMedia(listingKey);
          // URL-shape-aware (parity with the DB branch). fetchListingMedia classifies
          // FloorPlan by MediaCategory/description only, so a null-category DOCUMENT- floor
          // plan arrives as mediaType:'Photo'; classifyMediaItem rejects it by URL shape.
          const photos = media.filter(m => classifyMediaItem(m) === 'photo');
          photosCount = photos.length;
          if (photos.length > 0) {
            photoUrl = proxyUrl(photos[0].url);
          }
        } catch { /* non-fatal */ }

        // REBNY RLS Sec. 2.05: mask address when InternetAddressDisplayYN is false/null (fail-closed).
        const fullAddress = `${streetNum} ${streetName}${unit}`;
        const addressDisplayYN = r.InternetAddressDisplayYN === true;

        return {
          id: String(r.ListingKey || r.ListingId),
          mlsId,
          slug: mlsId,
          listPrice: Number(r.ListPrice || 0),
          beds: Number(r.BedroomsTotal || 0),
          baths: Number(r.BathroomsFull || 0),
          sqft: Number(r.LivingArea || 0),
          address: maskAddressIfRestricted(fullAddress, addressDisplayYN),
          neighborhood: String(r.CityRegion || ''),
          photoUrl,
          photosCount,
          propertyType: mapPropertyType(r),
          office: String(r.ListOfficeName || ''),
        };
      })
    );

    return {
      listings,
      _compliance: { source: 'idx', attribution: 'REBNY RLS' },
    };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    if (isTimeout) {
      console.warn('[/api/listings/similar] Trestle timeout (aborted after limit)');
    } else {
      console.error('[/api/listings/similar] Error:', err);
    }
    return { listings: [] };
  }
}
