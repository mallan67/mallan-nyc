import type { TransitStation, NearbyStation } from './types';
import stationsData from '@/data/transit/stations.json';

const stations: TransitStation[] = stationsData.stations as TransitStation[];

// Average walking speed: ~80 meters/minute (NYC pedestrian pace)
const WALK_SPEED_M_PER_MIN = 80;

/**
 * Haversine distance between two lat/lng points in meters
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find nearby transit stations sorted by walk time
 */
export function findNearbyStations(
  lat: number,
  lng: number,
  options: {
    limit?: number;
    radiusMeters?: number;
    types?: string[];
  } = {}
): NearbyStation[] {
  const { limit = 5, radiusMeters = 800, types } = options;

  const nearby: NearbyStation[] = [];

  for (const station of stations) {
    if (types && !types.includes(station.type)) continue;

    const distanceMeters = haversineDistance(lat, lng, station.lat, station.lng);
    if (distanceMeters > radiusMeters) continue;

    nearby.push({
      station,
      distanceMeters: Math.round(distanceMeters),
      distanceMiles: Math.round((distanceMeters / 1609.34) * 100) / 100,
      walkMinutes: Math.max(1, Math.round(distanceMeters / WALK_SPEED_M_PER_MIN)),
    });
  }

  // Sort by walk time, then by number of lines (more lines = better)
  nearby.sort((a, b) => {
    if (a.walkMinutes !== b.walkMinutes) return a.walkMinutes - b.walkMinutes;
    return b.station.lines.length - a.station.lines.length;
  });

  return nearby.slice(0, limit);
}

/**
 * Calculate a transit score (0-100) based on nearby stations
 * Higher score = better transit access
 */
export function calculateTransitScore(lat: number, lng: number): number {
  const stationsNearby = findNearbyStations(lat, lng, {
    limit: 20,
    radiusMeters: 1600,
  });

  if (stationsNearby.length === 0) return 0;

  let score = 0;

  for (const ns of stationsNearby) {
    // Closer stations worth more
    const distanceFactor = Math.max(0, 1 - ns.distanceMeters / 1600);

    // More lines = higher value
    const linesFactor = Math.min(ns.station.lines.length / 4, 1);

    // Subway/PATH worth more than ferry
    const typeFactor = ns.station.type === 'subway' || ns.station.type === 'path' ? 1 : 0.5;

    score += distanceFactor * (1 + linesFactor) * typeFactor * 15;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Get all unique lines at nearby stations
 */
export function getNearbyLines(lat: number, lng: number, radiusMeters = 800): string[] {
  const nearby = findNearbyStations(lat, lng, { limit: 20, radiusMeters });
  const lines = new Set<string>();
  for (const ns of nearby) {
    for (const line of ns.station.lines) {
      lines.add(line);
    }
  }
  return Array.from(lines);
}

/**
 * Get a station by ID
 */
export function getStationById(id: string): TransitStation | undefined {
  return stations.find((s) => s.id === id);
}
