/**
 * CANONICAL LOCATION — the ONE interpretation of the REBNY IDX Plus feed's location fields.
 *
 * Declared by Maya 2026-09-08 on exhaustive live evidence
 * (docs/operations/evidence-2026-09-08/location-semantics.md — every one of 591,596 rows, no sampling):
 *
 *   City            = "New York City" on 100 % of rows (one value)
 *   CityRegion      = exactly {Manhattan, Brooklyn, Queens, Bronx, StatenIsland} on 100 % of rows.
 *                     RESO DD 2.0: "A subsection or area of a defined city". On this feed the
 *                     subsection of New York City IS the borough.                    → borough
 *   SubdivisionName = 723 NYC neighborhood names on 100 % of rows. RESO DD 2.0: "A neighborhood,
 *                     community, complex or builder tract".                          → neighborhood
 *   CountyOrParish  = {New York, Kings, Queens, Bronx, Richmond}; disagrees with CityRegion on 35
 *                     rows — a separate fact, NEVER a borough source.                → county
 *   PostalCity      = the USPS city (56 values, 10 of them spanning boroughs).       → postalCity
 *   MLSAreaMajor/Minor = empty on every row; REBNY does not use them.                → nothing
 *
 * Neighborhood identity is the pair (borough, neighborhood): 129 of the 723 names occur under more
 * than one borough.
 *
 * This module is INSIDE the Cotality interpretation boundary (data/cotality-contract/boundary.json).
 * Every other reader consumes its output; none re-derives a borough from a county, a city, or a name.
 */
import type { CotalityRow } from '@/lib/cotality/contract';

/** Live CityRegion vocabulary — measured on every row 2026-09-08 (evidence: location/CityRegion.json). */
export const PROVIDER_CITY_REGION_VALUES = Object.freeze(['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'StatenIsland'] as const);
export type ProviderCityRegion = (typeof PROVIDER_CITY_REGION_VALUES)[number];

/** Mallan's display vocabulary for the same five facts. */
export const MALLAN_BOROUGHS = Object.freeze(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'] as const);
export type MallanBorough = (typeof MALLAN_BOROUGHS)[number];

const BOROUGH_BY_CITY_REGION: Readonly<Record<ProviderCityRegion, MallanBorough>> = Object.freeze({
  Manhattan: 'Manhattan',
  Brooklyn: 'Brooklyn',
  Queens: 'Queens',
  Bronx: 'Bronx',
  StatenIsland: 'Staten Island',
});

const CITY_REGION_BY_BOROUGH: Readonly<Record<MallanBorough, ProviderCityRegion>> = Object.freeze({
  Manhattan: 'Manhattan',
  Brooklyn: 'Brooklyn',
  Queens: 'Queens',
  Bronx: 'Bronx',
  'Staten Island': 'StatenIsland',
});

/**
 * NYC geography (borough → county). Used ONLY to fill `county` for Mallan-authored rows that carry no
 * CountyOrParish. Never the other way round: a county is never a borough source.
 */
export const COUNTY_BY_BOROUGH: Readonly<Record<MallanBorough, 'New York' | 'Kings' | 'Queens' | 'Bronx' | 'Richmond'>> = Object.freeze({
  Manhattan: 'New York',
  Brooklyn: 'Kings',
  Queens: 'Queens',
  Bronx: 'Bronx',
  'Staten Island': 'Richmond',
});

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

export function isProviderCityRegion(value: unknown): value is ProviderCityRegion {
  return typeof value === 'string' && (PROVIDER_CITY_REGION_VALUES as readonly string[]).includes(value);
}

/**
 * Provider CityRegion (or a Mallan display form, e.g. from the CRM) → the Mallan borough.
 * Anything else — a county name, a city, an empty value — is UNKNOWN (null), never inferred.
 */
export function boroughFromCityRegion(value: unknown): MallanBorough | null {
  const v = text(value);
  if (!v) return null;
  if (isProviderCityRegion(v)) return BOROUGH_BY_CITY_REGION[v];
  const lower = v.toLowerCase();
  const display = MALLAN_BOROUGHS.find((b) => b.toLowerCase() === lower);
  if (display) return display;
  const provider = PROVIDER_CITY_REGION_VALUES.find((p) => p.toLowerCase() === lower);
  return provider ? BOROUGH_BY_CITY_REGION[provider] : null;
}

/** The live `$filter` literal for a borough (Mallan or provider form), or null when unknown. */
export function cityRegionForBorough(value: unknown): ProviderCityRegion | null {
  const b = boroughFromCityRegion(value);
  return b ? CITY_REGION_BY_BOROUGH[b] : null;
}

/** SubdivisionName, trimmed. Empty is unknown. No fallback to any other field. */
export function neighborhoodFromSubdivisionName(value: unknown): string | null {
  return text(value);
}

/** CountyOrParish verbatim (trimmed). Its own fact. */
export function countyFromCountyOrParish(value: unknown): string | null {
  return text(value);
}

/** County for a Mallan-authored row that carries no CountyOrParish (NYC geography), or null. */
export function countyForBorough(value: unknown): string | null {
  const b = boroughFromCityRegion(value);
  return b ? COUNTY_BY_BOROUGH[b] : null;
}

export interface CanonicalLocation {
  borough: MallanBorough | null;
  neighborhood: string | null;
  county: string | null;
  city: string | null;
  postalCity: string | null;
  postalCode: string | null;
}

/** The canonical location facts of one provider row. Typed against the live contract. */
export function locationFromProviderRow(raw: CotalityRow<'Property'>): CanonicalLocation {
  return {
    borough: boroughFromCityRegion(raw.CityRegion),
    neighborhood: neighborhoodFromSubdivisionName(raw.SubdivisionName),
    county: countyFromCountyOrParish(raw.CountyOrParish),
    city: text(raw.City),
    postalCity: text(raw.PostalCity),
    postalCode: text(raw.PostalCode),
  };
}

/**
 * The canonical location facts of a STORED listing row (the `listings` table): the typed columns
 * first, then the stored `address` JSON (provider keys for feed rows; legacy form keys `Borough` /
 * `Neighborhood` / `city` for older Mallan-authored rows), never a fabricated value.
 *
 * This is the only place a consumer-side reader may resolve location from the address JSON; the
 * public DTO, reports and CMA consume the returned facts.
 */
export function locationFromStoredRow(row: {
  borough?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;
  address?: unknown;
}): CanonicalLocation {
  const addr = (row.address && typeof row.address === 'object' ? row.address : {}) as Record<string, unknown>;
  const borough = boroughFromCityRegion(row.borough ?? addr.Borough ?? addr.CityRegion ?? null);
  const county = countyFromCountyOrParish(addr.CountyOrParish) ?? (borough ? COUNTY_BY_BOROUGH[borough] : null);
  return {
    borough,
    neighborhood: neighborhoodFromSubdivisionName(row.neighborhood) ?? neighborhoodFromSubdivisionName(addr.SubdivisionName) ?? neighborhoodFromSubdivisionName(addr.Neighborhood),
    county,
    city: text(row.city) ?? text(addr.City) ?? text(addr.city),
    postalCity: text(addr.PostalCity),
    postalCode: text(row.postal_code) ?? text(addr.PostalCode) ?? text(addr.postalCode),
  };
}
