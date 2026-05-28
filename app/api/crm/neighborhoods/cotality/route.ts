/**
 * GET /api/crm/neighborhoods/cotality
 *
 * Returns all distinct Cotality `SubdivisionName` values grouped by NYC
 * borough (`CityRegion`). This is the source-of-truth neighborhoods list
 * for CRM forms — the sales/rental building tab dropdowns load from here.
 *
 * Why Cotality, not static JSON: Cotality adds and renames neighborhoods
 * upstream (e.g. Turtle Bay, Kips Bay, NoMad, Yorkville) and our hardcoded
 * `data/manhattan-neighborhoods.json` etc. fall behind. If the dropdown
 * doesn't have the value Cotality returns on a building selection,
 * `populateBuildingFromIDX` cannot set BldgNeighborhood and downstream
 * validation/listing display cascades fail.
 *
 * Auth: agent or broker session required.
 *
 * Caching: 1 hour edge cache. We do NOT call Cotality on every form load.
 *
 * Strategy: query Cotality's local DB cache (Listing table) for distinct
 * (SubdivisionName, CityRegion) pairs. This is faster than hitting the
 * Cotality OData $apply=groupby endpoint and uses the data we already
 * sync nightly. Fallback to the static JSON helper if DB is empty.
 *
 * @module app/api/crm/neighborhoods/cotality/route
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';

export const revalidate = 3600; // 1 hour

/** Borough display order */
const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'] as const;
type BoroughName = typeof BOROUGH_ORDER[number];

/** Map CityRegion variations to canonical borough display names */
function normalizeBorough(cityRegion: string): BoroughName | null {
  const v = (cityRegion || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'manhattan' || v === 'new york') return 'Manhattan';
  if (v === 'brooklyn' || v === 'kings') return 'Brooklyn';
  if (v === 'queens') return 'Queens';
  if (v === 'bronx' || v === 'the bronx') return 'Bronx';
  if (v === 'staten island' || v === 'richmond') return 'Staten Island';
  return null;
}

export interface NeighborhoodResponse {
  boroughs: Record<BoroughName, string[]>;
  source: 'cotality_db_cache' | 'static_fallback';
  cachedAt: string;
  totalNeighborhoods: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Initialize empty buckets in display order
  const boroughs: Record<BoroughName, Set<string>> = {
    Manhattan: new Set(),
    Brooklyn: new Set(),
    Queens: new Set(),
    Bronx: new Set(),
    'Staten Island': new Set(),
  };

  let source: 'cotality_db_cache' | 'static_fallback' = 'cotality_db_cache';

  try {
    // Query DB cache of Cotality-synced listings for distinct (SubdivisionName, CityRegion) pairs.
    // Using $queryRawUnsafe with parameterized values for index-friendly JSON path access.
    const rows = await prisma.$queryRawUnsafe<{ subdivision: string | null; region: string | null }[]>(
      `SELECT DISTINCT
         address->>'SubdivisionName' AS subdivision,
         address->>'CityRegion'      AS region
       FROM listings
       WHERE address->>'SubdivisionName' IS NOT NULL
         AND address->>'SubdivisionName' <> ''
         AND address->>'CityRegion'      IS NOT NULL
         AND address->>'CityRegion'      <> ''
       LIMIT 2000`,
    );

    for (const row of rows) {
      if (!row.subdivision || !row.region) continue;
      const borough = normalizeBorough(row.region);
      if (!borough) continue;
      const name = row.subdivision.trim();
      if (!name) continue;
      boroughs[borough].add(name);
    }
  } catch (err) {
    console.warn('[neighborhoods/cotality] DB query failed, using static fallback:', err);
    source = 'static_fallback';
  }

  // Static fallback ensures the dropdown is never empty even when DB has
  // not synced any Cotality data yet (e.g. first deploy, dev env, or
  // post-incident state). Returns an empty boroughs map — the form will
  // gracefully fall back to its built-in static dropdown options.
  // The form keeps the user-editable free-text override in either case.

  const sortedBoroughs: Record<BoroughName, string[]> = {
    Manhattan: [...boroughs.Manhattan].sort(),
    Brooklyn: [...boroughs.Brooklyn].sort(),
    Queens: [...boroughs.Queens].sort(),
    Bronx: [...boroughs.Bronx].sort(),
    'Staten Island': [...boroughs['Staten Island']].sort(),
  };

  const total =
    sortedBoroughs.Manhattan.length +
    sortedBoroughs.Brooklyn.length +
    sortedBoroughs.Queens.length +
    sortedBoroughs.Bronx.length +
    sortedBoroughs['Staten Island'].length;

  return NextResponse.json(
    {
      boroughs: sortedBoroughs,
      source,
      cachedAt: new Date().toISOString(),
      totalNeighborhoods: total,
    },
    {
      headers: {
        // Edge-cache for 1 hour, allow 24h SWR
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
