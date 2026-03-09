import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';
import { fetchListingMedia } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';

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
 * GET /api/listings/similar?type=sale&beds=1&price=715000&postalCode=10011&excludeId=xxx
 *
 * Returns up to 6 similar listings nearby (same ZIP, similar beds/price).
 * Fetches media separately per listing (Trestle $expand=Media is unreliable).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'sale';
  const beds = Number(searchParams.get('beds') || 0);
  const price = Number(searchParams.get('price') || 0);
  const postalCode = searchParams.get('postalCode') || '';
  const excludeId = searchParams.get('excludeId') || '';
  const neighborhood = searchParams.get('neighborhood') || '';

  if (!postalCode || !price) {
    return NextResponse.json({ listings: [] });
  }

  try {
    const token = await getAccessToken();

    // Price range: 30% below to 70% above (wider for luxury to find enough results)
    const minPrice = Math.round(price * 0.3);
    const maxPrice = Math.round(price * 1.7);

    const isRental = type === 'rent';
    const propertyClass = isRental
      ? "PropertyType eq 'Residential Lease'"
      : "PropertyType eq 'Residential'";

    const priceFilter = `ListPrice ge ${minPrice} and ListPrice le ${maxPrice}`;
    const selectFields = 'ListingId,ListingKey,SourceSystemKey,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,StreetNumber,StreetName,UnitNumber,PostalCode,PropertySubType,PropertyType,CommonInterest,ListOfficeName,CityRegion';

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

    const res = await fetch(`${TRESTLE_URL}/odata/Property?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[/api/listings/similar] Trestle ZIP query failed: ${res.status}`);
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
        const nhRes = await fetch(`${TRESTLE_URL}/odata/Property?${nhParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        });
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

        return {
          id: String(r.ListingKey || r.ListingId),
          mlsId,
          slug: mlsId,
          listPrice: Number(r.ListPrice || 0),
          beds: Number(r.BedroomsTotal || 0),
          baths: Number(r.BathroomsFull || 0),
          sqft: Number(r.LivingArea || 0),
          address: `${streetNum} ${streetName}${unit}`,
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
    console.error('[/api/listings/similar] Error:', err);
    return NextResponse.json({ listings: [] });
  }
}
