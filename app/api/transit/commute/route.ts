import { NextRequest, NextResponse } from 'next/server';

// In-memory cache: key → { data, timestamp }
const commuteCache = new Map<string, { data: CommuteResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CommuteStep {
  mode: 'walk' | 'transit' | 'transfer';
  instruction: string;
  duration: number;
  line?: string;
  fromStation?: string;
  toStation?: string;
}

interface CommuteResponse {
  totalMinutes: number;
  steps: CommuteStep[];
  linesUsed: string[];
  departureTime: string;
  arrivalTime: string;
  destination: string;
  fallbackUrl?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const originLat = parseFloat(searchParams.get('originLat') || '');
  const originLng = parseFloat(searchParams.get('originLng') || '');
  const destination = searchParams.get('destination') || '';

  if (isNaN(originLat) || isNaN(originLng) || !destination.trim()) {
    return NextResponse.json(
      { error: 'originLat, originLng, and destination are required' },
      { status: 400 }
    );
  }

  const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}-${destination.toLowerCase().trim()}`;
  const cached = commuteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // Fallback: return Google Maps link
    const origin = `${originLat},${originLng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

    return NextResponse.json({
      totalMinutes: 0,
      steps: [],
      linesUsed: [],
      departureTime: '',
      arrivalTime: '',
      destination,
      fallbackUrl: mapsUrl,
    });
  }

  try {
    const origin = `${originLat},${originLng}`;
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    url.searchParams.set('mode', 'transit');
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Google API returned ${res.status}`);
    }

    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
      return NextResponse.json({
        totalMinutes: 0,
        steps: [],
        linesUsed: [],
        departureTime: '',
        arrivalTime: '',
        destination,
        fallbackUrl: mapsUrl,
      });
    }

    const route = data.routes[0];
    const leg = route.legs[0];
    const steps: CommuteStep[] = [];
    const linesUsed = new Set<string>();

    for (const step of leg.steps) {
      if (step.travel_mode === 'WALKING') {
        steps.push({
          mode: 'walk',
          instruction: step.html_instructions?.replace(/<[^>]+>/g, '') || 'Walk',
          duration: Math.round(step.duration.value / 60),
        });
      } else if (step.travel_mode === 'TRANSIT') {
        const transit = step.transit_details;
        const lineName = transit?.line?.short_name || transit?.line?.name || '';
        if (lineName) linesUsed.add(lineName);

        steps.push({
          mode: 'transit',
          instruction: `Take the ${lineName} ${transit?.line?.vehicle?.type?.toLowerCase() || 'train'}`,
          duration: Math.round(step.duration.value / 60),
          line: lineName,
          fromStation: transit?.departure_stop?.name,
          toStation: transit?.arrival_stop?.name,
        });
      }
    }

    const result: CommuteResponse = {
      totalMinutes: Math.round(leg.duration.value / 60),
      steps,
      linesUsed: Array.from(linesUsed),
      departureTime: leg.departure_time?.text || '',
      arrivalTime: leg.arrival_time?.text || '',
      destination: leg.end_address || destination,
    };

    commuteCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch {
    // Fallback on any error
    const origin = `${originLat},${originLng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

    return NextResponse.json({
      totalMinutes: 0,
      steps: [],
      linesUsed: [],
      departureTime: '',
      arrivalTime: '',
      destination,
      fallbackUrl: mapsUrl,
    });
  }
}
