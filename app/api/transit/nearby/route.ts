import { NextRequest, NextResponse } from 'next/server';
import { findNearbyStations, calculateTransitScore } from '@/lib/transit/stations';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const limit = parseInt(searchParams.get('limit') || '5', 10);
  const radius = parseInt(searchParams.get('radius') || '800', 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: 'lat and lng are required' },
      { status: 400 }
    );
  }

  // Clamp values
  const clampedLimit = Math.min(Math.max(limit, 1), 20);
  const clampedRadius = Math.min(Math.max(radius, 200), 3200);

  const stations = findNearbyStations(lat, lng, {
    limit: clampedLimit,
    radiusMeters: clampedRadius,
  });

  // If no stations within radius, expand to 1.6km
  const finalStations =
    stations.length === 0
      ? findNearbyStations(lat, lng, { limit: clampedLimit, radiusMeters: 1600 })
      : stations;

  const transitScore = calculateTransitScore(lat, lng);

  return NextResponse.json({
    stations: finalStations,
    transitScore,
    expanded: stations.length === 0 && finalStations.length > 0,
  });
}
