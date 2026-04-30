/**
 * lib/geo/manhattan-corridor.ts
 *
 * Mallan Real Estate's primary-market geographic gate.
 *
 * Coverage area: Manhattan south of 97th St (East side) / 110th St (West side),
 * down to the Battery, river to river. Excludes East Harlem, Harlem, Morningside
 * Heights, Hamilton Heights, Washington Heights, Inwood. Includes UES (south of
 * 96th), Carnegie Hill, Yorkville (below 97th), Lenox Hill, Midtown East, Sutton
 * Place, Murray Hill, Gramercy, Stuy Town, East Village, LES, FiDi, Battery, TriBeCa,
 * SoHo, NoHo, Greenwich Village, West Village, Chelsea, Hudson Yards, Hell's Kitchen,
 * Midtown West, Lincoln Square, UWS (south of 110th).
 *
 * This is the source-of-truth filter for every off-market scanner read. PLUTO,
 * ACRIS, DOF, DOB, HPD, etc. ingests must filter through `isInCorridor()` before
 * any prospect surfaces.
 *
 * Polygon vertices live in `data/scanner/manhattan-luxury-corridor.geojson` and
 * are loaded once at module init (small, deterministic, no I/O on hot path).
 */
import corridorGeoJson from "@/data/scanner/manhattan-luxury-corridor.json";

type Ring = number[][]; // [lng, lat][]

const FEATURE = (corridorGeoJson as { features: Array<{ geometry: { coordinates: Ring[] } }> }).features[0];
const RING: Ring = FEATURE.geometry.coordinates[0];

/** Bounding box of the corridor polygon — fast rejection for points obviously outside Manhattan. */
export const CORRIDOR_BOUNDS = (() => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of RING) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
})();

/** NYC borough code for Manhattan (used by PLUTO BBL, ACRIS, etc.). */
export const MANHATTAN_BORO_CODE = "1" as const;

/** PLUTO/ACRIS prefix on the BBL — Manhattan BBLs all start with "1". */
export const MANHATTAN_BBL_PREFIX = "1" as const;

/** Northern boundary in Central Park (96th St transverse latitude). */
export const NORTH_PARK_LAT = 40.7920;

/**
 * Returns true if (lat, lng) is inside the Manhattan luxury corridor.
 * Uses ray-casting; exact-on-edge points are treated as inside (deliberate —
 * a tax lot whose centroid lands exactly on 97th St should be considered
 * in-market for prospecting).
 */
export function isInCorridor(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < CORRIDOR_BOUNDS.minLat || lat > CORRIDOR_BOUNDS.maxLat) return false;
  if (lng < CORRIDOR_BOUNDS.minLng || lng > CORRIDOR_BOUNDS.maxLng) return false;

  let inside = false;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [xi, yi] = RING[i];
    const [xj, yj] = RING[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Returns true if a PLUTO BBL's Manhattan-borough check passes. Useful as a
 * cheap pre-filter before centroid lookup. Real geographic gating still
 * needs `isInCorridor(lat, lng)` against the lot's centroid.
 */
export function isManhattanBbl(bbl: string | number): boolean {
  const s = String(bbl).trim();
  return s.startsWith(MANHATTAN_BBL_PREFIX);
}

/** GeoJSON feature for downstream tools (map rendering, polygon ops). */
export const CORRIDOR_FEATURE = FEATURE;
