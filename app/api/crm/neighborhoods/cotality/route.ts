/**
 * GET /api/crm/neighborhoods/cotality
 *
 * The live Cotality geography inventory for the agent CRM: every distinct borough
 * (`CityRegion`) and neighborhood (`SubdivisionName`) value Cotality returns right now, with
 * on-market listing counts, plus the typing aliases the resolver accepts (UES, LIC, FiDi …).
 *
 * Both fields are free text in Cotality (no picklist — verified live 2026-10-26), so this
 * inventory is the only valid list of selectable values. It is read from Cotality itself
 * (lib/idx/geography.ts), never from the local database or a file, and refreshes on its own.
 *
 * Consumers: the agent search page (autocomplete, neighborhood trees, Comparable Reports,
 * building search) and the listing entry forms' neighborhood dropdowns. `boroughs` keeps the
 * display-keyed shape the forms already read; `catalog` carries the live values and counts.
 *
 * Auth: agent or broker session required. `?refresh=1` (broker) re-pulls immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { getLiveGeography } from '@/lib/idx/geography';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const refresh = req.nextUrl.searchParams.get('refresh') === '1' && auth.role === 'BROKER';
  try {
    const inventory = await getLiveGeography({ refresh });
    // Display-keyed lists for the entry forms: one live spelling per neighborhood, by borough.
    const boroughs: Record<string, string[]> = {};
    for (const b of inventory.boroughs) boroughs[b.display] = [];
    for (const c of inventory.catalog) (boroughs[c.boroughDisplay] = boroughs[c.boroughDisplay] || []).push(c.name);
    for (const k of Object.keys(boroughs)) boroughs[k].sort((a, b) => a.localeCompare(b));

    return NextResponse.json(
      {
        source: 'cotality_live',
        pulledAt: inventory.pulledAt,
        countsComplete: inventory.countsComplete,
        liveBoroughs: inventory.boroughs,
        boroughs,
        catalog: inventory.catalog,
        aliases: inventory.aliases,
        boroughAliases: inventory.boroughAliases,
        totalNeighborhoods: inventory.catalog.length,
      },
      { headers: { 'Cache-Control': 'private, max-age=600' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Live Cotality geography is unavailable right now', code: 'GEOGRAPHY_UNAVAILABLE', detail: (err as Error).message },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
