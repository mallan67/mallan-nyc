import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';

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

/**
 * GET /api/listings/similar?type=sale&beds=1&price=715000&postalCode=10011&excludeId=xxx
 *
 * Returns up to 6 similar listings nearby (same ZIP, similar beds/price).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'sale';
  const beds = Number(searchParams.get('beds') || 0);
  const price = Number(searchParams.get('price') || 0);
  const postalCode = searchParams.get('postalCode') || '';
  const excludeId = searchParams.get('excludeId') || '';

  if (!postalCode || !price) {
    return NextResponse.json({ listings: [] });
  }

  try {
    const token = await getAccessToken();

    // Price range: 50% below to 50% above
    const minPrice = Math.round(price * 0.5);
    const maxPrice = Math.round(price * 1.5);

    const isRental = type === 'rent';
    const propertyClass = isRental
      ? "PropertyType eq 'Residential Lease'"
      : "PropertyType eq 'Residential'";

    // Build filter: same ZIP, similar price, active, same type (no bed filter — too restrictive)
    const filter = `PostalCode eq '${postalCode}' and MlsStatus eq 'Active' and ${propertyClass} and ListPrice ge ${minPrice} and ListPrice le ${maxPrice}`;

    const params = new URLSearchParams({
      $filter: filter,
      $select: 'ListingId,ListingKey,SourceSystemKey,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,StreetNumber,StreetName,UnitNumber,PostalCode,PropertySubType,PropertyType,CommonInterest,ListOfficeName,CityRegion',
      $orderby: 'ListPrice desc',
      $top: '7', // fetch 7 so we have 6 after excluding current
    });

    const res = await fetch(`${TRESTLE_URL}/odata/Property?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ listings: [] });
    }

    const data = await res.json();
    const listings = (data.value || [])
      .filter((r: Record<string, unknown>) => {
        const id = String(r.ListingId || r.ListingKey || '');
        return id !== excludeId;
      })
      .slice(0, 6)
      .map((r: Record<string, unknown>) => {
        const mlsId = String(r.ListingId || '');
        const streetNum = String(r.StreetNumber || '');
        const streetName = String(r.StreetName || '');
        const unit = r.UnitNumber ? `, ${r.UnitNumber}` : '';
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
          photoUrl: null, // Photos require separate Media fetch — client will show placeholder
          propertyType: mapPropertyType(r),
          office: String(r.ListOfficeName || ''),
        };
      });

    return NextResponse.json({
      listings,
      _compliance: { source: 'idx', attribution: 'REBNY RLS' },
    });
  } catch (err) {
    console.error('[/api/listings/similar] Error:', err);
    return NextResponse.json({ listings: [] });
  }
}
