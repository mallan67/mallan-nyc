import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';
import { buildingCacheTag, cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { parseBuildingAddress, buildBuildingAddressFilter } from '@/lib/buildings/building-address-filter';
import { lookupBBL, fetchAcrisSales, isDuplicate, boroughFromPostalCode } from '@/lib/buildings/acris-building-sales';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';


/**
 * One Cycle W1: fetch+decode a Trestle Property query as JSON. The OAuth
 * token is resolved INSIDE (only on cache miss) so the rotating Bearer value
 * never participates in any cache key. Non-OK responses degrade to an empty
 * value set (prior behavior).
 */
async function trestleFetchJson(url: string): Promise<{ value?: Record<string, unknown>[] }> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { value: [] };
  return (await res.json()) as { value?: Record<string, unknown>[] };
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
    // Canonical Trestle address filter (shared with /api/buildings via
    // lib/buildings/building-address-filter). Uppercases StreetName — Trestle
    // stores it UPPERCASE and OData contains() is case-sensitive, so the prior
    // raw mixed-case name matched ZERO rows and emptied the whole building-units
    // panel on every detail page.
    const addressFilter = buildBuildingAddressFilter(
      parseBuildingAddress(streetNumber, streetName, postalCode || undefined),
    );

    // 1. Active listings in the building (other units for sale/rent)
    // $select fields verified against live Trestle $metadata (2026-04-19):
    //   - IDXEntireListingDisplayYN, OwnerOptOut, ParticipantOnlyYN do NOT exist;
    //     Owner Opt-Out / Participant Only are encoded via the `Permission` enum
    //     and read by checkDistributionGates(). InternetEntireListingDisplayYN
    //     is the canonical master display gate.
    const distributionFields =
      'Permission,InternetEntireListingDisplayYN,InternetAddressDisplayYN';
    // StandardStatus (NEVER MlsStatus — provider-suppressed, Trestle 400s). Use
    // the full actively-displayable set (matches lib/compliance/status.ts
    // ACTIVE_DISPLAY_STATUSES / isActiveDisplayStatus, which /api/buildings uses),
    // so ComingSoon / ActiveUnderContract sibling units aren't dropped.
    const activeFilter = `${addressFilter} and (StandardStatus eq 'Active' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'ComingSoon')`;
    const activeParams = new URLSearchParams({
      $filter: activeFilter,
      $select: `ListingId,ListingKey,SourceSystemKey,ListPrice,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,UnitNumber,PropertySubType,PropertyType,StandardStatus,ListOfficeName,${distributionFields}`,
      $orderby: 'ListPrice desc',
      $top: '20',
    });
    const activeUrl = `${TRESTLE_URL}/odata/Property?${activeParams}`;

    // 2. Closed sales history from Trestle (MLS records)
    const closedFilter = `${addressFilter} and StandardStatus eq 'Closed'`;
    const closedParams = new URLSearchParams({
      $filter: closedFilter,
      $select: `ListingId,ListingKey,SourceSystemKey,ClosePrice,ListPrice,BedroomsTotal,BathroomsFull,LivingArea,UnitNumber,CloseDate,PropertySubType,PropertyType,ListOfficeName,${distributionFields}`,
      $orderby: 'CloseDate desc',
      $top: '20',
    });
    const closedUrl = `${TRESTLE_URL}/odata/Property?${closedParams}`;

    // 3. ACRIS lookup (in parallel with Trestle)
    const borough = postalCode ? boroughFromPostalCode(postalCode) : 'MANHATTAN';
    const bblPromise = lookupBBL(streetNumber, streetName, borough);

    // One Cycle W1 — cache the two Property queries per building (tagged),
    // so repeat anonymous views stop re-hitting Cotality + re-running this
    // handler's upstream work every request.
    const cachedBuildingQuery = cachedPublicRead(trestleFetchJson, ['api-listings-building'], {
      tags: [SEARCH_CACHE_TAG, buildingCacheTag(streetNumber, streetName, postalCode)],
    });
    const [activeData, closedData, bbl] = await Promise.all([
      cachedBuildingQuery(activeUrl),
      cachedBuildingQuery(closedUrl),
      bblPromise,
    ]);

    // Displayability via the canonical checkDistributionGates — identical to the
    // /api/buildings sibling (which shows these same units and passes the CI
    // compliance check). checkDistributionGates encodes the IDX Plus reader-side
    // gate semantics. We do NOT add a raw InternetAddressDisplayYN comparison
    // here: on a reader surface `!== false` is a compliance BLOCKER (fail-open),
    // and the previous `=== true` (fail-closed) collapsed the common null-address
    // rows and hid EVERY unit in the panel. Address-detail suppression for
    // explicitly-restricted rows is a display concern, handled downstream.
    const displayableActive = (activeData.value || []).filter(
      (r: Record<string, unknown>) => checkDistributionGates(r).displayable
    );
    const displayableClosed = (closedData.value || []).filter(
      (r: Record<string, unknown>) => checkDistributionGates(r).displayable
    );

    // Map active units
    const activeUnits = displayableActive
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
    const trestleSales = displayableClosed.map((r: Record<string, unknown>) => ({
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

    // Fetch ACRIS recorded transfers if we have a BBL.
    // Maya 2026-07-23 semantics: these are RECORDED TRANSFER documents, not
    // verified unit sales — beds/baths/sqft stay null (never 0), unit stays
    // blank, and each row carries documentId/bbl/retrievedAt provenance.
    let acrisSales: Array<{
      id: string;
      mlsId: string;
      closePrice: number;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      unit: string;
      closeDate: string | null;
      propertyType: string;
      office: string;
      source: 'acris';
      label: 'recorded-transfer';
      documentId?: string;
      bbl?: string;
      retrievedAt?: string;
    }> = [];

    if (bbl) {
      const rawAcris = await fetchAcrisSales(bbl);
      acrisSales = rawAcris
        .filter((a) => !isDuplicate(a, trestleSales))
        .map((a) => ({
          ...a,
          mlsId: '',
          beds: null,
          baths: null,
          sqft: null,
          propertyType: '',
          office: 'NYC ACRIS Public Records',
          label: 'recorded-transfer' as const,
        }));
    }

    // PUBLIC saleHistory = ACRIS public-record rows ONLY. `trestleSales`
    // (source:'mls') are RLS/Cotality closed listings — NOT public-record, and
    // restoring this route surfaced them publicly (incl. closed *leases* shown as
    // "sales", since the closed query has no PropertyType filter). Public display
    // of RLS/Cotality closed sales needs verified display rights, and sale-vs-lease
    // separation — both tracked in the "Public Building Sales History / ACRIS-backed
    // closed sales" follow-up lane. This PR only unbreaks activeUnits; it must not
    // ship RLS closed rows publicly. (trestleSales is computed but intentionally
    // excluded here; the follow-up will restructure the closed-sales pipeline.)
    const saleHistory = [...trestleSales, ...acrisSales]
      .filter((s) => s.source === 'acris')
      .sort((a, b) => {
        if (!a.closeDate && !b.closeDate) return 0;
        if (!a.closeDate) return 1;
        if (!b.closeDate) return -1;
        return new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime();
      });

    return NextResponse.json({
      success: true,
      activeUnits,
      saleHistory,
      sourceAttribution: {
        activeUnits: {
          source: 'cotality-trestle',
          attribution: 'Based on information from the REBNY Listing Service (Cotality/Trestle IDX Plus).',
        },
        recordedTransfers: {
          source: 'nyc-acris',
          attribution: 'NYC ACRIS public records — recorded transfer documents. Amounts are not verified unit-level sale prices.',
        },
      },
      _compliance: {
        source: 'cotality-trestle+nyc-acris',
        attribution:
          'Active listings: Based on information from the REBNY Listing Service (Cotality/Trestle). ' +
          'Recorded transfers: NYC ACRIS public records — not verified unit-level sales.',
        acrisBBL: bbl || null,
        acrisRecords: acrisSales.length,
      },
    });
  } catch (err) {
    console.error('[/api/listings/building] Error:', err);
    return NextResponse.json({ success: true, activeUnits: [], saleHistory: [] });
  }
}
