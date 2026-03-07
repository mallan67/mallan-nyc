import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function trestleFetch(url: string, token: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
}

/**
 * GET /api/listings/building?streetNumber=301&streetName=E+62ND+Street&postalCode=10065
 *
 * Returns active units + closed sale history for the same building address.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const streetNumber = searchParams.get('streetNumber');
  const streetName = searchParams.get('streetName');
  const postalCode = searchParams.get('postalCode');
  const excludeId = searchParams.get('excludeId') || '';

  if (!streetNumber || !streetName) {
    return NextResponse.json({ error: 'streetNumber and streetName required' }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    const escapedStreet = streetName.replace(/'/g, "''");

    // Build address filter
    const addressFilter = `StreetNumber eq '${streetNumber}' and contains(StreetName,'${escapedStreet}')${
      postalCode ? ` and PostalCode eq '${postalCode}'` : ''
    }`;

    // 1. Active listings in the building (other units for sale/rent)
    const activeFilter = `${addressFilter} and MlsStatus eq 'Active'`;
    const activeParams = new URLSearchParams({
      $filter: activeFilter,
      $select: 'ListingId,ListingKey,SourceSystemKey,ListPrice,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,UnitNumber,PropertySubType,PropertyType,StandardStatus,ListOfficeName',
      $orderby: 'ListPrice desc',
      $top: '20',
    });
    const activeUrl = `${TRESTLE_URL}/odata/Property?${activeParams}`;

    // 2. Closed sales history (sold units)
    const closedFilter = `${addressFilter} and (MlsStatus eq 'Closed' or StandardStatus eq 'Closed')`;
    const closedParams = new URLSearchParams({
      $filter: closedFilter,
      $select: 'ListingId,ListingKey,SourceSystemKey,ClosePrice,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,UnitNumber,CloseDate,PropertySubType,PropertyType,ListOfficeName',
      $orderby: 'CloseDate desc',
      $top: '20',
    });
    const closedUrl = `${TRESTLE_URL}/odata/Property?${closedParams}`;

    const [activeRes, closedRes] = await Promise.all([
      trestleFetch(activeUrl, token),
      trestleFetch(closedUrl, token),
    ]);

    const activeData = activeRes.ok ? await activeRes.json() : { value: [] };
    const closedData = closedRes.ok ? await closedRes.json() : { value: [] };

    // Map and filter
    const activeUnits = (activeData.value || [])
      .filter((r: Record<string, unknown>) => String(r.ListingId || r.ListingKey) !== excludeId)
      .map((r: Record<string, unknown>) => ({
        id: String(r.ListingKey || r.ListingId),
        mlsId: String(r.ListingId || ''),
        listPrice: Number(r.ListPrice || 0),
        beds: Number(r.BedroomsTotal || 0),
        baths: Number(r.BathroomsFull || 0),
        bathsHalf: Number(r.BathroomsHalf || 0),
        sqft: Number(r.LivingArea || 0),
        unit: String(r.UnitNumber || ''),
        propertyType: String(r.PropertySubType || r.PropertyType || ''),
        office: String(r.ListOfficeName || ''),
      }));

    const saleHistory = (closedData.value || []).map((r: Record<string, unknown>) => ({
      id: String(r.ListingKey || r.ListingId),
      mlsId: String(r.ListingId || ''),
      closePrice: Number(r.ClosePrice || r.ListPrice || 0),
      beds: Number(r.BedroomsTotal || 0),
      baths: Number(r.BathroomsFull || 0),
      sqft: Number(r.LivingArea || 0),
      unit: String(r.UnitNumber || ''),
      closeDate: r.CloseDate ? String(r.CloseDate) : null,
      propertyType: String(r.PropertySubType || r.PropertyType || ''),
      office: String(r.ListOfficeName || ''),
    }));

    return NextResponse.json({
      success: true,
      activeUnits,
      saleHistory,
      _compliance: { source: 'idx', attribution: 'REBNY RLS' },
    });
  } catch (err) {
    console.error('[/api/listings/building] Error:', err);
    return NextResponse.json({ success: true, activeUnits: [], saleHistory: [] });
  }
}
