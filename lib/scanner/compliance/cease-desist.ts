/**
 * lib/scanner/compliance/cease-desist.ts
 *
 * NY DOS Cease and Desist Real Estate Solicitation Zone check.
 *
 * Regulatory basis: 19 NYCRR § 175.17(b). In any active C&D zone, real
 * estate brokers MAY NOT solicit owners (door-to-door, phone, mail, email,
 * any form) without express written invitation from the owner. Solicitation
 * in a C&D zone can result in license suspension, fines, and civil exposure.
 *
 * Zones are renewed in cycles by the NY Secretary of State. The data file
 * at `data/scanner/compliance/nyc-dos-cease-desist-zones.json` is the
 * source of truth. Refresh annually (or whenever a renewal notice publishes)
 * via `npm run scanner:refresh-cd-zones`.
 *
 * This module exposes a single function `isInCeaseDesistZone(lat, lng)`
 * that returns the matching zone (if any). Empty zone-list = always returns
 * `{ in_zone: false }` — fail-OPEN at the geographic layer. **The
 * suppression list (per-Mallan opt-outs) and the absence of zone data are
 * tracked separately in the broader `isSuppressed()` gate; do NOT use this
 * module standalone for outreach gating.**
 */
import zonesFile from "@/data/scanner/compliance/nyc-dos-cease-desist-zones.json";
import type { CeaseDesistZoneFeature, CeaseDesistZonesFile } from "@/lib/scanner/compliance/types";

const FILE = zonesFile as CeaseDesistZonesFile;
const ZONES: CeaseDesistZoneFeature[] = FILE.features || [];

interface ZoneMatch {
  in_zone: boolean;
  zone_name?: string;
  zone_id?: string;
  boro?: string;
}

/** Ray-cast point-in-polygon. lat,lng-aware. */
function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInZone(lat: number, lng: number, feature: CeaseDesistZoneFeature): boolean {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    const polygons = [geom.coordinates as number[][][]];
    return polygons.some((poly) => pointInRing(lat, lng, poly[0]));
  }
  if (geom.type === "MultiPolygon") {
    const multi = geom.coordinates as number[][][][];
    return multi.some((poly) => pointInRing(lat, lng, poly[0]));
  }
  return false;
}

/**
 * Check whether a (lat, lng) point falls inside an active NY DOS C&D zone.
 * Returns the matching zone metadata or `{ in_zone: false }`.
 *
 * Empty zone-list (placeholder file) always returns `{ in_zone: false }`.
 * This is by design — the file is the source of truth and an empty file
 * means no zones currently published. Refresh the file before relying on
 * this for outreach decisions.
 */
export function isInCeaseDesistZone(lat: number, lng: number): ZoneMatch {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { in_zone: false };
  if (ZONES.length === 0) return { in_zone: false };
  for (const z of ZONES) {
    if (pointInZone(lat, lng, z)) {
      return {
        in_zone: true,
        zone_name: z.properties?.name,
        zone_id: z.properties?.zone_id || z.id,
        boro: z.properties?.boro,
      };
    }
  }
  return { in_zone: false };
}

/** Number of currently-active zones loaded from the data file. */
export function ceaseDesistZoneCount(): number {
  return ZONES.length;
}

/** When the zones file was last refreshed (per its metadata). */
export function ceaseDesistCapturedAt(): string {
  return FILE.captured_at;
}

/** Source URL for refresh runbooks. */
export const NY_DOS_CD_ZONES_URL = "https://dos.ny.gov/real-estate-cease-and-desist-zones";

/** Full feature list (read-only) for downstream tools (map rendering, etc). */
export function getActiveCeaseDesistZones(): readonly CeaseDesistZoneFeature[] {
  return ZONES;
}
