import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/idx/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

    const allOpenHouses = [...trestleOH, ...uniqueLocal].sort((a, b) => {
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

    // Fetch upcoming open houses from the OpenHouse entity
    const today = new Date().toISOString().split('T')[0];
    const params = new URLSearchParams();
    params.set('$filter', `OpenHouseDate ge ${today}`);
    params.set('$select', 'OpenHouseKey,ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseType,OpenHouseRemarks');
    params.set('$orderby', 'OpenHouseDate asc');
    params.set('$top', '100');
    params.set('$expand', 'Property($select=ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,PropertySubType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListAgentFullName,ListAgentDirectPhone,ListAgentOfficePhone,ListOfficeName,PublicRemarks,PhotosCount)');

    const res = await fetch(`${base}/odata/OpenHouse?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      // Fallback: try without $expand (some Trestle setups don't support it on OpenHouse)
      return fetchTrestleOpenHousesFlat();
    }

    const data = await res.json();
    const records = data.value || [];

    return records.map((r: Record<string, unknown>) => {
      const prop = (r.Property || {}) as Record<string, unknown>;
      const street = [prop.StreetNumber, prop.StreetDirPrefix, prop.StreetName, prop.StreetSuffix, prop.StreetDirSuffix]
        .filter(Boolean).join(' ');
      const unit = prop.UnitNumber ? `, ${prop.UnitNumber}` : '';
      const totalBaths = ((prop.BathroomsFull as number) || 0) + ((prop.BathroomsHalf as number) || 0) * 0.5;

      // Format times
      const startTime = formatTrestleTime(r.OpenHouseStartTime as string);
      const endTime = formatTrestleTime(r.OpenHouseEndTime as string);

      return {
        id: `trestle-${r.OpenHouseKey || r.ListingKey}`,
        listingId: (r.ListingId as string) || (r.ListingKey as string) || '',
        address: `${street}${unit}`,
        neighborhood: ((prop.City as string) || 'New York').replace('New York City', 'New York'),
        date: (r.OpenHouseDate as string || '').split('T')[0],
        startTime,
        endTime,
        price: (prop.ListPrice as number) || 0,
        beds: (prop.BedroomsTotal as number) || 0,
        baths: totalBaths,
        sqft: (prop.LivingArea as number) || 0,
        type: mapPropertyType(prop.CommonInterest as string, prop.PropertyType as string),
        openHouseType: (r.OpenHouseType as string) || 'Public',
        agentName: (prop.ListAgentFullName as string) || '',
        agentPhone: (prop.ListAgentDirectPhone as string) || (prop.ListAgentOfficePhone as string) || '',
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

// Fallback: fetch OpenHouse without $expand, then batch-fetch Property data
async function fetchTrestleOpenHousesFlat(): Promise<OpenHouseDTO[]> {
  try {
    const token = await getAccessToken();
    const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
    const today = new Date().toISOString().split('T')[0];

    const params = new URLSearchParams();
    params.set('$filter', `OpenHouseDate ge ${today}`);
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
      propParams.set('$select', 'ListingKey,ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListAgentFullName,ListAgentDirectPhone,ListOfficeName,PublicRemarks');
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

    return ohRecords.map((r: Record<string, unknown>) => {
      const prop = propMap.get(r.ListingKey as string) || {};
      const street = [prop.StreetNumber, prop.StreetDirPrefix, prop.StreetName, prop.StreetSuffix, prop.StreetDirSuffix]
        .filter(Boolean).join(' ');
      const unit = prop.UnitNumber ? `, ${prop.UnitNumber}` : '';
      const totalBaths = ((prop.BathroomsFull as number) || 0) + ((prop.BathroomsHalf as number) || 0) * 0.5;

      return {
        id: `trestle-${r.OpenHouseKey || r.ListingKey}`,
        listingId: (r.ListingId as string) || (r.ListingKey as string) || '',
        address: `${street}${unit}`,
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
        agentName: (prop.ListAgentFullName as string) || '',
        agentPhone: (prop.ListAgentDirectPhone as string) || '',
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
            address: true,
            city: true,
            neighborhood: true,
            list_price: true,
            bedrooms_total: true,
            bathrooms_full: true,
            bathrooms_half: true,
            living_area: true,
            property_type: true,
            media: true,
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

    return showings.map((s) => {
      const l = s.listing;
      // Address is stored as JSON: { streetNumber, streetName, unitNumber, ... }
      const addrObj = (l.address || {}) as Record<string, string>;
      const street = [addrObj.streetNumber, addrObj.streetDirPrefix, addrObj.streetName, addrObj.streetSuffix]
        .filter(Boolean).join(' ');
      const unit = addrObj.unitNumber ? `, ${addrObj.unitNumber}` : '';
      const addr = `${street}${unit}`;

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
        type: l.property_type || 'Residential',
        openHouseType: 'Public',
        agentName: s.agent?.full_name || '',
        agentPhone: s.agent?.phone || '',
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
