import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

// ACRIS endpoints (NYC Open Data — free, no key required)
const ACRIS_REAL_PROPERTY = 'https://data.cityofnewyork.us/resource/8h5j-fqxa.json';
const ACRIS_MASTER = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';

async function trestleFetch(url: string, token: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
}

/** Look up BBL from address via NYC Geoclient or Planning Labs fallback */
async function lookupBBL(streetNumber: string, streetName: string, borough: string): Promise<string | null> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const params = new URLSearchParams({
      houseNumber: streetNumber,
      street: streetName,
      borough: borough || 'MANHATTAN',
    });
    const res = await fetch(`${baseUrl}/api/geoclient/address?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.bbl) {
      // Format BBL as borough-block-lot (e.g., "1-01234-0056")
      const bbl = String(data.bbl);
      if (bbl.length === 10) {
        return `${bbl[0]}-${bbl.substring(1, 6)}-${bbl.substring(6, 10)}`;
      }
      return bbl;
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch deed/transfer records from ACRIS for a BBL */
async function fetchAcrisSales(bbl: string): Promise<Array<{
  id: string;
  closePrice: number;
  closeDate: string | null;
  unit: string;
  source: 'acris';
}>> {
  try {
    const parts = bbl.split('-');
    if (parts.length !== 3) return [];
    const [borough, block, lot] = parts;

    // Step 1: Get document IDs for this property from ACRIS Real Property
    const rpUrl = `${ACRIS_REAL_PROPERTY}?borough=${borough}&block=${block}&lot=${lot}&$order=document_id DESC&$limit=30`;
    const rpRes = await fetch(rpUrl, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    if (!rpRes.ok) return [];
    const rpData = (await rpRes.json()) as Array<Record<string, string>>;
    if (rpData.length === 0) return [];

    const docIds = rpData.map((r) => r.document_id).filter(Boolean);
    if (docIds.length === 0) return [];

    // Step 2: Get master records — filter to deed/transfer types with amounts
    const docIdList = docIds.map((id) => `'${id}'`).join(',');
    const masterUrl = `${ACRIS_MASTER}?$where=document_id in (${docIdList}) AND doc_type in ('DEED','DEEDO','RPTT%26RET') AND document_amt > 0&$order=recorded_datetime DESC&$limit=20`;
    const masterRes = await fetch(masterUrl, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    if (!masterRes.ok) return [];
    const masterData = (await masterRes.json()) as Array<Record<string, string>>;

    return masterData
      .filter((doc) => parseFloat(doc.document_amt || '0') > 0)
      .map((doc) => {
        const amt = parseFloat(doc.document_amt || '0');
        const dateStr = doc.recorded_datetime || doc.document_date || null;
        // Extract unit from property records if available
        const unit = rpData.find((r) => r.document_id === doc.document_id)?.easement || '';
        return {
          id: `acris-${doc.document_id}`,
          closePrice: amt,
          closeDate: dateStr ? new Date(dateStr).toISOString().split('T')[0] : null,
          unit: unit || '',
          source: 'acris' as const,
        };
      });
  } catch (err) {
    console.warn('[/api/listings/building] ACRIS fetch error:', err);
    return [];
  }
}

/** Check if an ACRIS record likely duplicates a Trestle record (same month + similar price) */
function isDuplicate(
  acris: { closePrice: number; closeDate: string | null },
  trestleRecords: Array<{ closePrice: number; closeDate: string | null }>
): boolean {
  for (const tr of trestleRecords) {
    if (!acris.closeDate || !tr.closeDate) continue;
    const acrisDate = new Date(acris.closeDate);
    const trestleDate = new Date(tr.closeDate);
    const monthDiff = Math.abs(
      (acrisDate.getFullYear() - trestleDate.getFullYear()) * 12 +
      (acrisDate.getMonth() - trestleDate.getMonth())
    );
    // Within 2 months and price within 5%
    if (monthDiff <= 2) {
      const priceDiff = Math.abs(acris.closePrice - tr.closePrice) / Math.max(acris.closePrice, tr.closePrice, 1);
      if (priceDiff < 0.05) return true;
    }
  }
  return false;
}

/** Map borough name → NYC borough code for geoclient */
function boroughFromPostalCode(postalCode: string): string {
  const zip = parseInt(postalCode, 10);
  if (zip >= 10001 && zip <= 10282) return 'MANHATTAN';
  if (zip >= 10301 && zip <= 10314) return 'STATEN ISLAND';
  if (zip >= 10451 && zip <= 10475) return 'BRONX';
  if (zip >= 11004 && zip <= 11109) return 'QUEENS';
  if (zip >= 11201 && zip <= 11256) return 'BROOKLYN';
  if (zip >= 11351 && zip <= 11697) return 'QUEENS';
  return 'MANHATTAN';
}

/**
 * GET /api/listings/building?streetNumber=301&streetName=E+62ND+Street&postalCode=10065
 *
 * Returns active units + closed sale history for the same building address.
 * Sources: Trestle (MLS closed sales) + ACRIS (NYC deed transfers as fallback).
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

    // 2. Closed sales history from Trestle (MLS records)
    const closedFilter = `${addressFilter} and (MlsStatus eq 'Closed' or StandardStatus eq 'Closed')`;
    const closedParams = new URLSearchParams({
      $filter: closedFilter,
      $select: 'ListingId,ListingKey,SourceSystemKey,ClosePrice,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,UnitNumber,CloseDate,PropertySubType,PropertyType,ListOfficeName',
      $orderby: 'CloseDate desc',
      $top: '20',
    });
    const closedUrl = `${TRESTLE_URL}/odata/Property?${closedParams}`;

    // 3. ACRIS lookup (in parallel with Trestle)
    const borough = postalCode ? boroughFromPostalCode(postalCode) : 'MANHATTAN';
    const bblPromise = lookupBBL(streetNumber, streetName, borough);

    const [activeRes, closedRes, bbl] = await Promise.all([
      trestleFetch(activeUrl, token),
      trestleFetch(closedUrl, token),
      bblPromise,
    ]);

    const activeData = activeRes.ok ? await activeRes.json() : { value: [] };
    const closedData = closedRes.ok ? await closedRes.json() : { value: [] };

    // Map active units
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

    // Map Trestle closed sales
    const trestleSales = (closedData.value || []).map((r: Record<string, unknown>) => ({
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
      source: 'mls' as const,
    }));

    // Fetch ACRIS sales if we have a BBL
    let acrisSales: Array<{
      id: string;
      mlsId: string;
      closePrice: number;
      beds: number;
      baths: number;
      sqft: number;
      unit: string;
      closeDate: string | null;
      propertyType: string;
      office: string;
      source: 'acris';
    }> = [];

    if (bbl) {
      const rawAcris = await fetchAcrisSales(bbl);
      // Convert to same shape as Trestle sales, mark source
      acrisSales = rawAcris
        .filter((a) => !isDuplicate(a, trestleSales))
        .map((a) => ({
          ...a,
          mlsId: '',
          beds: 0,
          baths: 0,
          sqft: 0,
          propertyType: '',
          office: 'NYC ACRIS Public Records',
        }));
    }

    // Merge: Trestle first, then ACRIS (non-duplicates), sorted by date
    const saleHistory = [...trestleSales, ...acrisSales].sort((a, b) => {
      if (!a.closeDate && !b.closeDate) return 0;
      if (!a.closeDate) return 1;
      if (!b.closeDate) return -1;
      return new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime();
    });

    return NextResponse.json({
      success: true,
      activeUnits,
      saleHistory,
      _compliance: {
        source: 'idx+acris',
        attribution: 'REBNY RLS',
        acrisBBL: bbl || null,
        acrisRecords: acrisSales.length,
      },
    });
  } catch (err) {
    console.error('[/api/listings/building] Error:', err);
    return NextResponse.json({ success: true, activeUnits: [], saleHistory: [] });
  }
}
