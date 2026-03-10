/**
 * Demand Signal Collector — aggregates NYC Open Data + first-party signals
 */

import { soda } from '@/lib/soda';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { SODA_DATASETS, COLLECTION_WINDOW_DAYS, SIGNAL_WEIGHTS } from './config';
import type { DemandSignalType } from './types';

const windowStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - COLLECTION_WINDOW_DAYS);
  return d;
};

interface CollectedSignal {
  signal_type: DemandSignalType;
  neighborhood: string;
  borough: string | null;
  value: number;
  normalized: number;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Collect all signals for a neighborhood and persist them.
 */
export async function collectSignalsForNeighborhood(
  neighborhood: string,
  borough?: string | null
): Promise<number> {
  const signals: CollectedSignal[] = [];
  const start = windowStart();
  const end = new Date();

  // NYC Open Data signals (non-blocking — failures don't stop others)
  const collectors = [
    collectNewBusinessLicenses(neighborhood, borough, start),
    collectBuildingPermits(neighborhood, borough, start),
    collectSavedSearchActivity(neighborhood, start),
    collectPageViewActivity(neighborhood, start),
  ];

  const results = await Promise.allSettled(collectors);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) signals.push(r.value);
  }

  // Persist signals
  if (signals.length > 0) {
    await prisma.demandSignal.createMany({
      data: signals.map(s => ({
        signal_type: s.signal_type,
        neighborhood: s.neighborhood,
        borough: s.borough,
        value: s.value,
        normalized: s.normalized,
        source: s.source,
        metadata: (s.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        period_start: start,
        period_end: end,
      })),
    });
  }

  return signals.length;
}

async function collectNewBusinessLicenses(
  neighborhood: string,
  borough: string | null | undefined,
  since: Date
): Promise<CollectedSignal | null> {
  try {
    const where = borough
      ? `borough='${borough}' AND license_creation_date>='${since.toISOString().split('T')[0]}'`
      : `license_creation_date>='${since.toISOString().split('T')[0]}'`;

    const rows = await soda<{ count: string }>({
      resource: SODA_DATASETS.dca_licenses,
      select: 'count(*) as count',
      where,
      limit: 1,
    });

    const count = parseInt(rows[0]?.count ?? '0');
    return {
      signal_type: 'new_business_license',
      neighborhood,
      borough: borough ?? null,
      value: count,
      normalized: Math.min(1.0, count / 50),
      source: 'soda',
      metadata: { dataset: 'dca_licenses', since: since.toISOString() },
    };
  } catch { return null; }
}

async function collectBuildingPermits(
  neighborhood: string,
  borough: string | null | undefined,
  since: Date
): Promise<CollectedSignal | null> {
  try {
    if (!SODA_DATASETS.dob_permits) return null;
    const boroughCode = boroughToCode(borough);
    const whereClause = boroughCode
      ? `borough='${boroughCode}' AND job_filed_date>='${since.toISOString().split('T')[0]}'`
      : `job_filed_date>='${since.toISOString().split('T')[0]}'`;

    const rows = await soda<{ count: string }>({
      resource: SODA_DATASETS.dob_permits,
      select: 'count(*) as count',
      where: whereClause,
      limit: 1,
    });

    const count = parseInt(rows[0]?.count ?? '0');
    return {
      signal_type: 'building_permit',
      neighborhood,
      borough: borough ?? null,
      value: count,
      normalized: Math.min(1.0, count / 100),
      source: 'soda',
      metadata: { dataset: 'dob_permits', since: since.toISOString() },
    };
  } catch { return null; }
}

async function collectSavedSearchActivity(
  neighborhood: string,
  since: Date
): Promise<CollectedSignal | null> {
  try {
    // Count saved searches that include this neighborhood in criteria
    const searches = await prisma.savedSearch.count({
      where: {
        created_at: { gte: since },
      },
    });

    // Simple proxy — in production, would parse criteria JSON for neighborhood match
    return {
      signal_type: 'saved_search_activity',
      neighborhood,
      borough: null,
      value: searches,
      normalized: Math.min(1.0, searches / 30),
      source: 'first_party',
    };
  } catch { return null; }
}

async function collectPageViewActivity(
  neighborhood: string,
  since: Date
): Promise<CollectedSignal | null> {
  // First-party page view proxy from listing views
  try {
    const listings = await prisma.listing.count({
      where: {
        neighborhood,
        status: 'Active',
      },
    });

    return {
      signal_type: 'page_view_activity',
      neighborhood,
      borough: null,
      value: listings,
      normalized: Math.min(1.0, listings / 20),
      source: 'first_party',
    };
  } catch { return null; }
}

function boroughToCode(borough: string | null | undefined): string | null {
  if (!borough) return null;
  const map: Record<string, string> = {
    'Manhattan': '1', 'Bronx': '2', 'Brooklyn': '3', 'Queens': '4', 'Staten Island': '5',
  };
  return map[borough] ?? null;
}
