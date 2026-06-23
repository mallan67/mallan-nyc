import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';
import { mapPropertyTypeToDisplay } from '@/lib/idx/public-dto';
import { DISPLAYABLE_STATUSES } from '@/lib/idx/db-to-public-dto';
import prisma from '@/lib/prisma';
import { evaluateDisplayGate } from '@/lib/compliance/gates';
import { resolveListingAgentInfo, AGENT_TYPED_SELECT } from '@/lib/listings/agent-info-resolver';

export const dynamic = 'force-dynamic';

// Open-house-eligible statuses for the website-only (rls_eligible=false) bypass.
// DISPLAYABLE_STATUSES includes 'ComingSoon', but a Coming Soon listing MUST NOT
// have a public open house: UCBA Art. I §16 marks Coming Soon as noOpenHouses, and
// the showing write path (/api/crm/showings) rejects Coming Soon scheduling. So we
// narrow to the open-house-eligible subset here. (P2, 2026-06-23)
const OPEN_HOUSE_ELIGIBLE_STATUSES = DISPLAYABLE_STATUSES.filter((s) => s !== 'ComingSoon');

// The public /open-houses page shows MALLAN Real Estate's open houses ONLY (Maya, 2026-06-23) —
// the brokerage's own listings, NOT the ~1,560-row city-wide REBNY RLS open-house feed. We scope
// the Trestle feed to Mallan's office MLS id.
//
// This list is intentionally DISTINCT from `MALLAN_OFFICE_MLS_IDS` in lib/syndication/mallan-identity.ts
// — do NOT consolidate. That constant is deliberately EMPTY and load-bearing for the syndication HOLD
// (invariant I.5: empty office+agent sets block every syndication row). Populating it would un-gate
// syndication exports, which are HELD. This constant only scopes the read-only open-house display.
//
// Verified live against Cotality 2026-06-23: ListOfficeMlsId '7041' = "MAllan Real Estate Inc"
// (the office on RLS20099289 / 400 E 90th #4D, ListAgentMlsId 39361 Maya Allan).
const MALLAN_OH_OFFICE_MLS_IDS = ['7041'] as const;

// Mallan's own active listing ids/keys, for scoping the OpenHouse feed to Mallan only. Small set
// (a handful). Returns empty on any error → the caller shows NO Trestle open houses (fail-closed to
// "nothing" rather than leaking the city-wide feed).
async function fetchMallanListingRefs(token: string, base: string): Promise<{ ids: string[]; keys: string[] }> {
  const officeFilter = MALLAN_OH_OFFICE_MLS_IDS.map((id) => `ListOfficeMlsId eq '${id}'`).join(' or ');
  const params = new URLSearchParams();
  params.set('$filter', `(${officeFilter}) and StandardStatus eq 'Active'`);
  params.set('$select', 'ListingId,ListingKey');
  params.set('$top', '200');
  const res = await fetch(`${base}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return { ids: [], keys: [] };
  const data = await res.json();
  const ids: string[] = [];
  const keys: string[] = [];
  for (const r of (data.value || [])) {
    if (r.ListingId) ids.push(String(r.ListingId));
    if (r.ListingKey) keys.push(String(r.ListingKey));
  }
  return { ids, keys };
}

interface OpenHouseDTO {
  id: string;
  listingId: string;
  address: string;
  neighborhood: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  openHouseType: string; // "Public" | "Broker" | "Private"
  agentName: string;
  agentPhone: string;
  description: string;
  image: string;
  featured: boolean;
  source: 'trestle' | 'local';
}

export async function GET() {
  try {
    const [trestleOH, localOH] = await Promise.all([
      fetchTrestleOpenHouses(),
      fetchLocalOpenHouses(),
    ]);

    // Dedupe: if same address + date + startTime exists in both, prefer Trestle
    const trestleKeys = new Set(
      trestleOH.map(oh => `${oh.address}|${oh.date}|${oh.startTime}`.toLowerCase())
    );
    const uniqueLocal = localOH.filter(
      oh => !trestleKeys.has(`${oh.address}|${oh.date}|${oh.startTime}`.toLowerCase())
    );

    // Filter out open houses with no meaningful property data
    // (empty address, $0 price = Trestle records where Property expand failed)
    const hasData = (oh: OpenHouseDTO) => oh.address.trim().length > 0 && oh.price > 0;

    const allOpenHouses = [...trestleOH, ...uniqueLocal].filter(hasData).sort((a, b) => {
      // Featured first, then by date
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.date.localeCompare(b.date);
    });

    return NextResponse.json(
      { openHouses: allOpenHouses },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('[open-houses]', error instanceof Error ? error.message : error);
    return NextResponse.json({ openHouses: [] });
  }
}

async function fetchTrestleOpenHouses(): Promise<OpenHouseDTO[]> {
  try {
    const token = await getAccessToken();
    const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

    // Scope to MALLAN's own active listings — the open-houses page shows Mallan Real Estate's open
    // houses only (Maya, 2026-06-23), not the city-wide feed. No Mallan listings → no Trestle OHs.
    const { ids: mallanIds } = await fetchMallanListingRefs(token, base);
    if (mallanIds.length === 0) return [];
    const listingScope = mallanIds.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');

    // Fetch upcoming open houses from the OpenHouse entity.
    // Filter to public open houses only — Broker-only and Private events
    // are not for consumer display per REBNY UCBA Art. I §16 (open-house
    // disclosure applies to public-facing events). Without this filter,
    // consumers would see agent-only preview times.
    const today = new Date().toISOString().split('T')[0];
    const params = new URLSearchParams();
    // OpenHouseStatus eq 'Active' — exclude Cancelled/inactive open houses. Now that the property
    // display gate fail-OPENs on REBNY-null IELD, a cancelled future Public OH on an otherwise
    // displayable listing would surface without this. Mirrors app/api/listings/route.ts (lines
    // ~471/~888) which already filters Active. (P1, 2026-06-23)
    // `(${listingScope})` restricts to Mallan's own listings (Mallan-only open-houses page).
    params.set('$filter', `OpenHouseDate ge ${today} and OpenHouseType eq 'Public' and OpenHouseStatus eq 'Active' and (${listingScope})`);
    params.set('$select', 'OpenHouseKey,ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseType,OpenHouseRemarks');
    params.set('$orderby', 'OpenHouseDate asc');
    params.set('$top', '100');
    // Do NOT select agent direct-contact fields. This is a public endpoint; agent
    // phone/email must never be serialized to the public response. `ListAgentFullName`
    // and `ListOfficeName` are displayable per REBNY attribution rules.
    //
    // Permission-gate fields — match the main IDX pipeline's canonical set:
    //   Permission, InternetEntireListingDisplayYN, InternetAddressDisplayYN
    //   StandardStatus + MlsStatus + CloseDate (for Closed-past-24h gate)
    // Removed dead fields previously in this list:
    //   IDXEntireListingDisplayYN (no such field on Trestle schema)
    //   ParticipantOnlyYN (never existed — superseded by Permission='Private')
    params.set('$expand', 'Property($select=ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,PropertySubType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListAgentFullName,ListOfficeName,PublicRemarks,PhotosCount,Permission,InternetEntireListingDisplayYN,InternetAddressDisplayYN,StandardStatus,MlsStatus,CloseDate)');

    const res = await fetch(`${base}/odata/OpenHouse?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      // Fallback: try without $expand (some Trestle setups don't support it on OpenHouse).
      // Pass the already-resolved Mallan listing ids so the fallback stays Mallan-scoped too.
      return fetchTrestleOpenHousesFlat(mallanIds);
    }

    const data = await res.json();
    // Canonical gate — same evaluateDisplayGate used by /api/listings,
    // public-dto, and sitemap. Fail-closed on missing permissions.
    // Previous path used `checkDistributionGates()` from trestle-mapper which
    // was functional but a parallel implementation; now unified.
    const records = (data.value || [])
      .map((r: Record<string, unknown>) => {
        // Property is a COLLECTION-valued navigation on OpenHouse, so $expand returns it as an
        // ARRAY (`[{…}]`), not a single object. Reading it as an object left every ListPrice/address
        // undefined → price 0 → the hasData filter in GET() dropped EVERY Trestle open house (the
        // page showed nothing). Unwrap the first element. (Verified live against Cotality 2026-06-23.)
        const propRaw = r.Property;
        const prop = ((Array.isArray(propRaw) ? propRaw[0] : propRaw) || {}) as Record<string, unknown>;
        // idxPlusPreFiltered: this is the RAW REBNY IDX Plus feed (Property expanded off the
        // OpenHouse entity). InternetEntireListingDisplayYN / InternetAddressDisplayYN are null on
        // REBNY-pre-filtered rows = displayable (fail-OPEN, `!== false`), NOT affirmPermission
        // (fail-CLOSED). Without this flag null collapsed to false and EVERY public Cotality open
        // house was dropped — the 2026-04-30 incident shape on this surface. Matches the canonical
        // IDX pipeline (computeGateColumns) which treats null IELD as displayable. (2026-06-23)
        return { r, prop, gate: evaluateDisplayGate(prop, { idxPlusPreFiltered: true }) };
      })
      .filter((x: { gate: { displayable: boolean } }) => x.gate.displayable);

    return records.map((x: { r: Record<string, unknown>; prop: Record<string, unknown>; gate: { addressDisplayable: boolean } }) => {
      const { r, prop, gate } = x;
      // Address suppression — if the gate says the address isn't displayable,
      // show a neighborhood-only placeholder. Previous version always built
      // the full street into the DTO.
      const fullStreet = [prop.StreetNumber, prop.StreetDirPrefix, prop.StreetName, prop.StreetSuffix, prop.StreetDirSuffix]
        .filter(Boolean).join(' ');
      const unit = prop.UnitNumber ? `, ${prop.UnitNumber}` : '';
      const addressLine = gate.addressDisplayable
        ? `${fullStreet}${unit}`
        : `${((prop.City as string) || 'New York').replace('New York City', 'New York')} (Address Available on Request)`;
      const totalBaths = ((prop.BathroomsFull as number) || 0) + ((prop.BathroomsHalf as number) || 0) * 0.5;

      // Times are formatted inline below; the standalone consts that lived
      // here were never referenced again.
      return {
        id: `trestle-${r.OpenHouseKey || r.ListingKey}`,
        listingId: (r.ListingId as string) || (r.ListingKey as string) || '',
        address: addressLine,
        neighborhood: ((prop.City as string) || 'New York').replace('New York City', 'New York'),
        date: (r.OpenHouseDate as string || '').split('T')[0],
        startTime: formatTrestleTime(r.OpenHouseStartTime as string),
        endTime: formatTrestleTime(r.OpenHouseEndTime as string),
        price: (prop.ListPrice as number) || 0,
        beds: (prop.BedroomsTotal as number) || 0,
        baths: totalBaths,
        sqft: (prop.LivingArea as number) || 0,
        type: mapPropertyType(prop.CommonInterest as string, prop.PropertyType as string),
        openHouseType: (r.OpenHouseType as string) || 'Public',
        // Attribution fallback — NEVER default to our brokerage for listings
        // we don't own. Per REBNY UCBA Art. III §2(C), "Listing Courtesy of
        // [Exclusive Broker]" must identify the actual listing broker. If we
        // don't have the office name, show a neutral placeholder.
        agentName: (prop.ListOfficeName as string) || 'Listing broker (REBNY RLS)',
        agentPhone: '',
        description: (prop.PublicRemarks as string) || '',
        image: '', // Will be filled by media proxy if needed
        featured: false,
        source: 'trestle' as const,
      };
    });
  } catch (err) {
    console.error('[open-houses] Trestle fetch failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// Fallback: fetch OpenHouse without $expand, then batch-fetch Property data.
// `mallanIds` are Mallan's own active ListingIds (resolved by the caller) — the feed stays
// Mallan-scoped. Empty → nothing to show.
async function fetchTrestleOpenHousesFlat(mallanIds: string[]): Promise<OpenHouseDTO[]> {
  try {
    if (mallanIds.length === 0) return [];
    const token = await getAccessToken();
    const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
    const today = new Date().toISOString().split('T')[0];
    const listingScope = mallanIds.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');

    const params = new URLSearchParams();
    // Public-only — Broker-only and Private events excluded (see rationale
    // in fetchTrestleOpenHouses above). OpenHouseStatus eq 'Active' excludes
    // cancelled/inactive open houses (P1, 2026-06-23 — see $expand path).
    // `(${listingScope})` keeps the fallback Mallan-scoped (Mallan-only open-houses page).
    params.set('$filter', `OpenHouseDate ge ${today} and OpenHouseType eq 'Public' and OpenHouseStatus eq 'Active' and (${listingScope})`);
    params.set('$select', 'OpenHouseKey,ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseType,OpenHouseRemarks');
    params.set('$orderby', 'OpenHouseDate asc');
    params.set('$top', '100');

    const res = await fetch(`${base}/odata/OpenHouse?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const ohRecords = data.value || [];
    if (ohRecords.length === 0) return [];

    // Batch fetch properties by ListingKey
    const listingKeys = [...new Set(ohRecords.map((r: Record<string, unknown>) => r.ListingKey as string).filter(Boolean))];
    const propMap = new Map<string, Record<string, unknown>>();

    if (listingKeys.length > 0) {
      const filterParts = listingKeys.map(k => `ListingKey eq '${k}'`);
      const propParams = new URLSearchParams();
      propParams.set('$filter', `(${filterParts.join(' or ')})`);
      // Canonical permission-gate fields — same set used by the $expand path
      // and by the main IDX pipeline. Removed dead fields (IDXEntireListingDisplayYN,
      // OwnerOptOut boolean, ParticipantOnlyYN — none exist on Trestle schema).
      // Added Permission (source of opt-out + private), InternetAddressDisplayYN
      // (address suppression), StandardStatus/MlsStatus/CloseDate (terminal-status gate).
      propParams.set('$select', 'ListingKey,ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListAgentFullName,ListOfficeName,PublicRemarks,Permission,InternetEntireListingDisplayYN,InternetAddressDisplayYN,StandardStatus,MlsStatus,CloseDate');
      propParams.set('$top', String(listingKeys.length));

      const propRes = await fetch(`${base}/odata/Property?${propParams}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (propRes.ok) {
        const propData = await propRes.json();
        for (const p of (propData.value || [])) {
          propMap.set(p.ListingKey as string, p);
        }
      }
    }

    // Canonical gate — same evaluateDisplayGate used by the $expand path.
    // If no property data came back, fail closed (cannot verify gates).
    const displayableOH = ohRecords
      .map((r: Record<string, unknown>) => {
        const prop = propMap.get(r.ListingKey as string) || null;
        // idxPlusPreFiltered: raw REBNY IDX Plus feed — null InternetEntireListingDisplayYN =
        // displayable (fail-OPEN), not affirmPermission (fail-CLOSED). See the $expand path above.
        const gate = prop ? evaluateDisplayGate(prop as Record<string, unknown>, { idxPlusPreFiltered: true }) : { displayable: false, addressDisplayable: false };
        return { r, prop, gate };
      })
      .filter((x: { prop: Record<string, unknown> | null; gate: { displayable: boolean } }) => x.prop !== null && x.gate.displayable);

    return displayableOH.map((x: { r: Record<string, unknown>; prop: Record<string, unknown>; gate: { addressDisplayable: boolean } }) => {
      const { r, prop, gate } = x;
      const fullStreet = [prop.StreetNumber, prop.StreetDirPrefix, prop.StreetName, prop.StreetSuffix, prop.StreetDirSuffix]
        .filter(Boolean).join(' ');
      const unit = prop.UnitNumber ? `, ${prop.UnitNumber}` : '';
      const addressLine = gate.addressDisplayable
        ? `${fullStreet}${unit}`
        : `${((prop.City as string) || 'New York').replace('New York City', 'New York')} (Address Available on Request)`;
      const totalBaths = ((prop.BathroomsFull as number) || 0) + ((prop.BathroomsHalf as number) || 0) * 0.5;

      return {
        id: `trestle-${r.OpenHouseKey || r.ListingKey}`,
        listingId: (r.ListingId as string) || (r.ListingKey as string) || '',
        address: addressLine,
        neighborhood: ((prop.City as string) || 'New York').replace('New York City', 'New York'),
        date: (r.OpenHouseDate as string || '').split('T')[0],
        startTime: formatTrestleTime(r.OpenHouseStartTime as string),
        endTime: formatTrestleTime(r.OpenHouseEndTime as string),
        price: (prop.ListPrice as number) || 0,
        beds: (prop.BedroomsTotal as number) || 0,
        baths: totalBaths,
        sqft: (prop.LivingArea as number) || 0,
        type: mapPropertyType(prop.CommonInterest as string, prop.PropertyType as string),
        openHouseType: (r.OpenHouseType as string) || 'Public',
        // Attribution fallback — NEVER default to our brokerage for listings
        // we don't own. Per REBNY UCBA Art. III §2(C), "Listing Courtesy of
        // [Exclusive Broker]" must identify the actual listing broker. If we
        // don't have the office name, show a neutral placeholder.
        agentName: (prop.ListOfficeName as string) || 'Listing broker (REBNY RLS)',
        agentPhone: '',
        description: (prop.PublicRemarks as string) || '',
        image: '',
        featured: false,
        source: 'trestle' as const,
      };
    });
  } catch {
    return [];
  }
}

async function fetchLocalOpenHouses(): Promise<OpenHouseDTO[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const showings = await prisma.showing.findMany({
      where: {
        type: 'openhouse',
        date: { gte: today },
        status: { not: 'cancelled' },
      },
      include: {
        listing: {
          select: {
            listing_id: true,
            status: true,
            address: true,
            city: true,
            neighborhood: true,
            list_price: true,
            bedrooms_total: true,
            bathrooms_full: true,
            bathrooms_half: true,
            living_area: true,
            property_type: true,
            property_sub_type: true,
            features: true,
            media: true,
            // Phase B: typed agent columns so office attribution resolves TYPED-FIRST.
            ...AGENT_TYPED_SELECT,
            // Canonical gate fields — previously omitted, so local open
            // houses could leak Owner Opt-Out / Participant Only /
            // Internet-off listings and show full addresses regardless
            // of InternetAddressDisplayYN. Now all gate inputs are
            // selected and passed to evaluateDisplayGate() below.
            owner_opt_out: true,
            participant_only: true,
            internet_entire_listing_display_yn: true,
            internet_address_display_yn: true,
            // Website-only Mallan exclusives (rls_eligible=false) are NOT on RLS, so their
            // internet_entire_listing_display_yn is false by definition — but they ARE displayable
            // on Mallan's own surfaces (mirror filterDisplayableDbListings, db-to-public-dto.ts:269).
            // Without selecting this, a Mallan website-only exclusive's open house is wrongly dropped.
            rls_eligible: true,
          },
        },
        agent: {
          select: {
            full_name: true,
            phone: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    return showings
      .map((s) => {
        const l = s.listing;
        // Website-only Mallan exclusive bypass — mirror filterDisplayableDbListings
        // (db-to-public-dto.ts:269): a rls_eligible=false listing is not on RLS (IELD=false by
        // definition) but IS displayable on Mallan's own surfaces, subject only to a displayable
        // status. Without this, a Mallan website-only exclusive's open house (e.g. SL-0007) is
        // dropped by the RLS internet-display gate. (2026-06-23)
        const gate = l.rls_eligible === false
          ? {
              // ComingSoon excluded — no public open houses on Coming Soon (UCBA Art. I §16).
              displayable: OPEN_HOUSE_ELIGIBLE_STATUSES.includes(l.status),
              addressDisplayable: l.internet_address_display_yn !== false,
            }
          : // Canonical gate — same evaluator the main listing pipeline uses. If any gate fails
            // (opt-out, participant-only, internet display, terminal status, closed >24h), drop it.
            evaluateDisplayGate({
              status: l.status,
              owner_opt_out: l.owner_opt_out,
              participant_only: l.participant_only,
              internet_entire_listing_display_yn: l.internet_entire_listing_display_yn,
              internet_address_display_yn: l.internet_address_display_yn,
            });
        return { s, l, gate };
      })
      .filter(({ gate }) => gate.displayable)
      .map(({ s, l, gate }) => {
      // Address is stored as JSON: { streetNumber, streetName, unitNumber, ... }
      const addrObj = (l.address || {}) as Record<string, string>;
      const fullStreet = [addrObj.streetNumber, addrObj.streetDirPrefix, addrObj.streetName, addrObj.streetSuffix]
        .filter(Boolean).join(' ');
      const unit = addrObj.unitNumber ? `, ${addrObj.unitNumber}` : '';
      // Address suppression — match the gate decision. Previously always
      // built the full street from stored JSON regardless of the
      // InternetAddressDisplayYN flag.
      const addr = gate.addressDisplayable
        ? `${fullStreet}${unit}`
        : `${l.neighborhood || l.city || 'New York'} (Address Available on Request)`;

      const totalBaths = (l.bathrooms_full || 0) + (l.bathrooms_half || 0) * 0.5;

      // Parse time string like "10:00 AM - 12:00 PM" or just "10:00 AM"
      const timeParts = (s.time || '').split('-').map(t => t.trim());

      // Get first photo from media JSON
      const mediaArr = Array.isArray(l.media) ? l.media as Record<string, string>[] : [];
      const firstPhoto = mediaArr[0]?.url || '';

      return {
        id: `local-${s.id.toString()}`,
        listingId: l.listing_id || '',
        address: addr,
        neighborhood: l.neighborhood || l.city || 'New York',
        date: s.date.toISOString().split('T')[0],
        startTime: timeParts[0] || '',
        endTime: timeParts[1] || '',
        price: l.list_price ? Number(l.list_price) : 0,
        beds: l.bedrooms_total || 0,
        baths: totalBaths,
        sqft: l.living_area ? Number(l.living_area) : 0,
        type: mapPropertyTypeToDisplay((l.features as Record<string, unknown>)?.CommonInterest as string | undefined, l.property_sub_type, l.property_type || 'Residential'),
        openHouseType: 'Public',
        // REBNY IDX/VOW Compliance Checklist (Dec 2021): agent direct contact
        // info (full name, phone, email) must NOT leak on public endpoints.
        // Show office attribution only.
        agentName: resolveListingAgentInfo(s.listing).officeName || 'Mallan Real Estate Inc.',
        agentPhone: '',
        description: '',
        image: firstPhoto,
        featured: false,
        source: 'local' as const,
      };
    });
  } catch (err) {
    console.error('[open-houses] Local fetch failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

function formatTrestleTime(time: string | null | undefined): string {
  if (!time) return '';
  // Trestle returns ISO time like "2026-03-08T11:00:00" or just "11:00:00"
  try {
    const d = new Date(time);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Try parsing just time portion
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1]);
      const m = match[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${h12}:${m} ${ampm}`;
    }
  } catch { /* */ }
  return time;
}

function mapPropertyType(commonInterest: string | null | undefined, propType: string | null | undefined): string {
  switch (commonInterest) {
    case 'Condominium': return 'Condo';
    case 'StockCooperative': return 'Co-op';
    case 'Condop': return 'Condop';
    default: return propType === 'ResidentialLease' ? 'Rental' : 'Residential';
  }
}
