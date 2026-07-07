import { NextRequest, NextResponse } from 'next/server';
import { classifyMediaItem } from '@/lib/media/listing-media-resolver';
import prisma from '@/lib/prisma';
import { dedupeRawDbRows, sameAddressKey } from '@/lib/listings/dedupe-crm-vs-idx';
import { getAccessToken } from '@/lib/idx/auth';
import { fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { SEARCH_DISPLAY_GATE } from '@/lib/search/listing-access-decision';
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
  // `beds` query param is accepted for forward-compat but not currently used
  // — similarity is computed by ZIP + price band today.
  const price = Number(searchParams.get('price') || 0);
  const postalCode = searchParams.get('postalCode') || '';
  const excludeId = searchParams.get('excludeId') || '';
  const neighborhood = searchParams.get('neighborhood') || '';

  if (!postalCode || !price) {
    return NextResponse.json({ listings: [] });
  }

  try {
    // ── DB-first: query local listings for similar properties ──
    const minPrice = Math.round(price * 0.3);
    const maxPrice = Math.round(price * 1.7);
    const isRental = type === 'rent';
    const listingTypeFilter = isRental ? 'rent' : 'sale';

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
        OR: [
          { address: { path: ['PostalCode'], equals: postalCode } },
          ...(neighborhood ? [{ neighborhood }] : []),
        ],
      },
      orderBy: { list_price: 'desc' },
      take: 8,
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

    if (dbResults.length >= 3) {
      // Enough results from DB — use those (faster, no Trestle dependency)
      // Filter out listings with null beds or empty/missing media
      const usable = dbResults.filter(l => {
        if (l.bedrooms_total == null) return false;
        const mediaArr = Array.isArray(l.media) ? l.media : [];
        if (mediaArr.length === 0) return false;
        return true;
      });

      // Backfill media from Trestle for listings with empty media (up to 5 concurrent)
      const needsMedia = dbResults.filter(l => {
        if (l.bedrooms_total == null) return false;
        const mediaArr = Array.isArray(l.media) ? l.media : [];
        return mediaArr.length === 0;
      });

      // Try to backfill up to 5 listings that have no media
      const backfilled: typeof dbResults = [];
      if (needsMedia.length > 0) {
        const toBackfill = needsMedia.slice(0, 5);
        const mediaResults = await Promise.allSettled(
          toBackfill.map(l => fetchListingMedia(l.listing_id))
        );
        for (let i = 0; i < toBackfill.length; i++) {
          const result = mediaResults[i];
          if (result.status === 'fulfilled' && result.value.length > 0) {
            // Attach fetched media as a synthetic media array
            (toBackfill[i] as Record<string, unknown>)._backfilledMedia = result.value;
            backfilled.push(toBackfill[i]);
          }
        }
      }

      const combined = [...usable, ...backfilled].slice(0, 6);

      const listings = combined.map(l => {
        const addr = l.address as Record<string, string> | null;
        const streetNum = addr?.StreetNumber || '';
        const streetName = [addr?.StreetDirPrefix, addr?.StreetName, addr?.StreetSuffix, addr?.StreetDirSuffix].filter(Boolean).join(' ') || '';
        const unit = addr?.UnitNumber ? `, ${addr.UnitNumber}` : '';

        // Check for backfilled media first, then DB media
        const backfilledMedia = (l as Record<string, unknown>)._backfilledMedia as { url: string; mediaType: string; order: number }[] | undefined;
        let photoUrl: string | null = null;
        let photosCount = 0;

        if (backfilledMedia && backfilledMedia.length > 0) {
          const photos = backfilledMedia.filter(m => m.mediaType === 'Photo' || !m.mediaType);
          photosCount = photos.length;
          if (photos.length > 0) {
            photoUrl = proxyUrl(photos[0].url);
          }
        } else {
          const mediaArr = Array.isArray(l.media) ? l.media as Record<string, string>[] : [];
          const normalized = mediaArr
            .map(m => ({ url: m.url || m.MediaURL || '', isPhoto: classifyMediaItem(m) === 'photo' }))
            .filter(m => m.url);
          const firstPhoto = normalized.find(m => m.isPhoto); // photo-only; never floorplan
          photosCount = normalized.filter(m => m.isPhoto).length;
          photoUrl = firstPhoto?.url ? proxyUrl(firstPhoto.url) : null;
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

      return NextResponse.json({
        listings,
        _compliance: { source: 'idx', attribution: 'REBNY RLS' },
      });
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
    const zipFilter = `PostalCode eq '${postalCode}' and MlsStatus eq 'Active' and ${propertyClass} and ${priceFilter}`;

    const params = new URLSearchParams({
      $filter: zipFilter,
      $select: selectFields,
      $orderby: 'ListPrice desc',
      $top: '7',
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
      return NextResponse.json({ listings: [] });
    }

    const data = await res.json();
    let allResults = data.value || [];

    // If ZIP-based search returned fewer than 4 results, widen to neighborhood
    if (allResults.length < 4 && neighborhood) {
      const escapedNeighborhood = neighborhood.replace(/'/g, "''");
      const neighborhoodFilter = `CityRegion eq '${escapedNeighborhood}' and MlsStatus eq 'Active' and ${propertyClass} and ${priceFilter}`;
      const nhParams = new URLSearchParams({
        $filter: neighborhoodFilter,
        $select: selectFields,
        $orderby: 'ListPrice desc',
        $top: '10',
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

    // Filter out the current listing and take up to 6
    const filtered = allResults
      .filter((r: Record<string, unknown>) => {
        const id = String(r.ListingId || r.ListingKey || '');
        return id !== excludeId;
      })
      .slice(0, 6);

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
          const photos = media.filter(m => m.mediaType === 'Photo' || !m.mediaType);
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

    return NextResponse.json({
      listings,
      _compliance: { source: 'idx', attribution: 'REBNY RLS' },
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    if (isTimeout) {
      console.warn('[/api/listings/similar] Trestle timeout (aborted after limit)');
    } else {
      console.error('[/api/listings/similar] Error:', err);
    }
    return NextResponse.json({ listings: [] });
  }
}
