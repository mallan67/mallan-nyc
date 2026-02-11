import { NextRequest, NextResponse } from 'next/server';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getFeedIdsForLines, GTFS_FEEDS, DIRECTION_LABELS, PATH_FEED_URL } from '@/lib/transit/feed-config';
import { getStationById } from '@/lib/transit/stations';

// In-memory cache: feedId → { data, timestamp }
const feedCache = new Map<string, { data: GtfsRealtimeBindings.transit_realtime.FeedMessage; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

async function fetchFeed(feedId: string): Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage | null> {
  const cached = feedCache.get(feedId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = feedId === 'path' ? PATH_FEED_URL : GTFS_FEEDS[feedId]?.url;
  if (!url) return null;

  try {
    const headers: HeadersInit = {};
    // MTA feeds are now open (no API key required as of 2024)
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    feedCache.set(feedId, { data: feed, timestamp: Date.now() });
    return feed;
  } catch {
    return null;
  }
}

interface ArrivalInfo {
  line: string;
  destination: string;
  direction: string;
  arrivalTime: number;
  minutesAway: number;
}

function extractArrivals(
  feed: GtfsRealtimeBindings.transit_realtime.FeedMessage,
  stationId: string,
  requestedLines: string[]
): ArrivalInfo[] {
  const now = Math.floor(Date.now() / 1000);
  const arrivals: ArrivalInfo[] = [];
  const station = getStationById(stationId);

  // MTA stop IDs use suffixes like "N" (northbound) and "S" (southbound)
  // We need to check entity.tripUpdate.stopTimeUpdate for matching stops

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.trip?.routeId) continue;

    const routeId = tripUpdate.trip.routeId;
    if (!requestedLines.includes(routeId)) continue;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate || []) {
      const stopId = stopTimeUpdate.stopId || '';
      // MTA stop IDs map to station complex IDs in various ways
      // For now, match by checking if the stop ID contains relevant station info
      const arrivalTimestamp = Number(
        stopTimeUpdate.arrival?.time ?? stopTimeUpdate.departure?.time ?? 0
      );

      if (arrivalTimestamp <= now) continue;

      const minutesAway = Math.round((arrivalTimestamp - now) / 60);
      if (minutesAway > 30) continue;

      // Direction: N suffix = northbound (uptown), S = southbound (downtown)
      const isNorth = stopId.endsWith('N');
      const dirLabels = DIRECTION_LABELS[routeId] || ['Uptown', 'Downtown'];
      const direction = isNorth ? dirLabels[0] : dirLabels[1];

      arrivals.push({
        line: routeId,
        destination: direction,
        direction: isNorth ? 'Uptown' : 'Downtown',
        arrivalTime: arrivalTimestamp,
        minutesAway,
      });
    }
  }

  // Sort by arrival time
  arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);

  // Limit to 12 nearest arrivals
  return arrivals.slice(0, 12);

  // Suppress unused variable warning
  void station;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const stationId = searchParams.get('stationId') || '';
  const linesParam = searchParams.get('lines') || '';

  if (!stationId || !linesParam) {
    return NextResponse.json(
      { error: 'stationId and lines are required' },
      { status: 400 }
    );
  }

  const station = getStationById(stationId);
  if (!station) {
    return NextResponse.json(
      { error: 'Station not found' },
      { status: 404 }
    );
  }

  const lines = linesParam.split(',').filter(Boolean);

  // Determine which feeds to fetch
  const isPath = station.type === 'path';
  const feedIds = isPath ? ['path'] : getFeedIdsForLines(lines);

  // Fetch all needed feeds in parallel
  const feeds = await Promise.all(feedIds.map((id) => fetchFeed(id)));

  const allArrivals: ArrivalInfo[] = [];
  let feedStatus: 'ok' | 'unavailable' = 'unavailable';

  for (const feed of feeds) {
    if (!feed) continue;
    feedStatus = 'ok';
    const arrivals = extractArrivals(feed, stationId, lines);
    allArrivals.push(...arrivals);
  }

  // Sort combined arrivals
  allArrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return NextResponse.json({
    stationId,
    stationName: station.name,
    arrivals: allArrivals.slice(0, 12),
    lastUpdated: Date.now(),
    feedStatus,
  });
}
