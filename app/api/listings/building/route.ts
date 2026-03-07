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

/** Look up BBL from address — calls NYC Geoclient v2 or Planning Labs directly (no self-referencing API call) */
async function lookupBBL(streetNumber: string, streetName: string, borough: string): Promise<string | null> {
  try {
    let bbl: string | null = null;

    // 1) Try NYC Geoclient v2 (if subscription key available)
    const v2Key = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || process.env.GEOCLIENT_PRIMARY_KEY || '';
    if (v2Key) {
      const v2Url = `https://api.nyc.gov/geo/geoclient/v2/address.json?houseNumber=${encodeURIComponent(streetNumber)}&street=${encodeURIComponent(streetName)}&borough=${encodeURIComponent(borough || 'MANHATTAN')}`;
      const res = await fetch(v2Url, {
        headers: { 'Ocp-Apim-Subscription-Key': v2Key, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        bbl = data?.address?.bbl || null;
      }
    }

    // 2) Fallback: Planning Labs geosearch (free, no key)
    if (!bbl) {
      const oneLine = `${streetNumber} ${streetName} ${borough}`.trim();
      const planUrl = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(oneLine)}&size=1`;
      const planRes = await fetch(planUrl, { signal: AbortSignal.timeout(5000) });
      if (planRes.ok) {
        const planData = await planRes.json();
        const props = planData?.features?.[0]?.properties;
        if (props?.addendum?.pad?.bbl) {
          bbl = String(props.addendum.pad.bbl);
        }
      }
    }

    if (!bbl) return null;

    // Format as borough-block-lot (e.g., "1-01234-0056")
    const raw = String(bbl).replace(/[^0-9]/g, '');
    if (raw.length === 10) {
      return `${raw[0]}-${raw.substring(1, 6)}-${raw.substring(6, 10)}`;
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
