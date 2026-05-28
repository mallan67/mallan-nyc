import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { getAccessToken } from '@/lib/idx/auth';
import { filterDisplayableDbListings, dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { preferCrmExclusiveOverIdxDuplicate } from '@/lib/listings/dedupe-crm-vs-idx';
import type { IDXListing } from '@/lib/idx/types';

/**
 * GET /api/agents/[slug]/listings
 *
 * Returns an agent's listings grouped by category:
 * - activeSales, activeRentals, closedSales, closedRentals
 *
 * Sources: Trestle IDX (by ListAgentFullName) + local DB exclusives (by agent_id)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // Look up agent by public_slug
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [
          { public_slug: slug },
          // Fallback: construct name from slug
          { full_name: { equals: slug.replace(/-/g, ' '), mode: 'insensitive' } },
        ],
      },
      select: { id: true, full_name: true, first_name: true, last_name: true, trestle_mls_id: true },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agentName = agent.full_name || `${agent.first_name} ${agent.last_name}`;
    const useIDX = process.env.IDX_ENABLED === 'true';

    // Fetch from both sources in parallel
    const [trestleResults, dbResults] = await Promise.all([
      useIDX ? fetchTrestleAgentListings(agentName, agent.trestle_mls_id) : { active: [], closed: [] },
      fetchDbAgentListings(agent.id),
    ]);

    // Merge and deduplicate (Trestle takes precedence)
    const trestleActiveIds = new Set(trestleResults.active.map((l) => l.id));
    const trestleClosedIds = new Set(trestleResults.closed.map((l) => l.id));

    const dbActiveNew = dbResults.active.filter((l) => !trestleActiveIds.has(l.id));
    const dbClosedNew = dbResults.closed.filter((l) => !trestleClosedIds.has(l.id));

    // Cross-source dedupe (2026-05-28): after merging the DB branch (CRM
    // exclusives, matched by agent_id) and the Trestle branch (matched by
    // ListAgentMlsId), collapse same-physical-unit duplicates, preferring the
    // CRM SL-/RL- row over the Trestle/IDX copy. The per-branch dedupe inside
    // fetchDbAgentListings only sees DB rows; the Trestle copy (e.g.
    // RLS20093870) arrives via the Trestle branch, so the cross-source
    // suppression MUST happen here, after the merge.
    const allActive = preferCrmExclusiveOverIdxDuplicate([...dbActiveNew, ...trestleResults.active]);
    const allClosed = preferCrmExclusiveOverIdxDuplicate([...dbClosedNew, ...trestleResults.closed]);

    // Split by listing type
    const activeSales = allActive.filter((l) => l.listingType === 'sale');
    const activeRentals = allActive.filter((l) => l.listingType === 'rent');
    const closedSales = allClosed.filter((l) => l.listingType === 'sale');
    const closedRentals = allClosed.filter((l) => l.listingType === 'rent');

    return NextResponse.json(
      {
        agent: { name: agentName, slug },
        activeSales,
        activeRentals,
        closedSales,
        closedRentals,
        _compliance: {
          source: useIDX ? 'idx+exclusive' : 'exclusive',
          attribution: useIDX ? generateAttributionText() : 'Exclusive listings by Mallan Real Estate Inc.',
        },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error(`[/api/agents/${slug}/listings] Error:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch agent listings' },
      { status: 500 }
    );
  }
}

/**
 * Fetch agent's listings from Trestle IDX by ListAgentFullName.
 * Returns active and closed listings separately.
 */
async function fetchTrestleAgentListings(agentName: string, trestleMlsId?: string | null): Promise<{
  active: PublicListingDTO[];
  closed: PublicListingDTO[];
}> {
  try {
    const safeName = agentName.replace(/'/g, "''");
    // Cotality-authoritative agent matching (2026-05-28): match by the agent's
    // REBNY/Trestle MLS member id (ListAgentMlsId = Agent.trestle_mls_id) when
    // we have it — stable across the "MAllan" vs "Maya Allan" source-spelling
    // variance, and required by REBNY syndication invariant I.4 (full-name
    // matching is fallback ONLY, never primary when a stronger id exists).
    const mlsId = (trestleMlsId || '').trim();
    const agentMatch = mlsId
      ? `ListAgentMlsId eq '${mlsId.replace(/'/g, "''")}'`
      : `ListAgentFullName eq '${safeName}'`;

    // Fetch active listings
    const activeResult = await fetchFromTrestle({
      filter: `${agentMatch} and (StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')`,
      top: 50,
      maxTotal: 50,
      orderby: 'ModificationTimestamp desc',
      expandMedia: false,
    });

    // Fetch closed listings
    const closedResult = await fetchFromTrestle({
      filter: `${agentMatch} and StandardStatus eq 'Closed'`,
      top: 50,
      maxTotal: 50,
      orderby: 'CloseDate desc',
      expandMedia: false,
    });

    // Apply distribution gates + mapping
    const processRecords = (records: Record<string, unknown>[]): IDXListing[] => {
      const displayable = records.filter((raw) => checkDistributionGates(raw).displayable);
      return displayable
        .map((raw) => mapRESOToInternal(raw))
        .filter((l): l is IDXListing => l !== null);
    };

    const activeMapped = processRecords(activeResult.records);
    const closedMapped = processRecords(closedResult.records);

    // Batch fetch photos for all listings
    const allMapped = [...activeMapped, ...closedMapped];
    await batchFetchPhotos(allMapped);

    return {
      active: activeMapped.map(toPublicDTO),
      closed: closedMapped.map(toPublicDTO),
    };
  } catch (err) {
    console.warn('[agent-listings] Trestle fetch failed:', err instanceof Error ? err.message : err);
    return { active: [], closed: [] };
  }
}

/**
 * Fetch agent's exclusive listings from the local database.
 */
async function fetchDbAgentListings(agentId: bigint): Promise<{
  active: PublicListingDTO[];
  closed: PublicListingDTO[];
}> {
  try {
    const dbListings = await prisma.listing.findMany({
      where: { agent_id: agentId },
      orderBy: { updated_at: 'desc' },
      take: 100,
      select: {
        id: true,
        listing_id: true,
        status: true,
        listing_type: true,
        property_type: true,
        property_sub_type: true,
        list_price: true,
        bedrooms_total: true,
        bathrooms_full: true,
        bathrooms_half: true,
        living_area: true,
        borough: true,
        neighborhood: true,
        address: true,
        features: true,
        media: true,
        agent_info: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        // rls_eligible drives the website-only / Mallan-exclusive bypass in
        // filterDisplayableDbListings (rls_eligible===false → displayable on
        // Mallan's own surfaces regardless of idx_display_yn). Omitting it from
        // this select (the bug) left it undefined, so `l.rls_eligible === false`
        // was never true, the bypass silently failed, and Mallan exclusives
        // with idx_display_yn=false (e.g. SL-0004) were dropped from the agent
        // page — while /api/listings (which gates in SQL via buildPublicListingDbSearch
        // where rls_eligible IS evaluated) correctly showed them. (2026-05-28)
        rls_eligible: true,
        listing_contract_date: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
      },
    });

    const serialized: DbListing[] = dbListings.map((l) => ({
      ...l,
      id: l.id.toString(),
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
    }));

    const displayable = filterDisplayableDbListings(serialized);
    const activeStatuses = ['Active', 'ComingSoon', 'ActiveUnderContract'];
    const closedStatuses = ['Closed', 'Sold', 'Rented'];

    // Public-surface dedupe (2026-05-28): drop Trestle-synced IDX duplicates
    // of Mallan CRM exclusives (SL-/RL-) on this agent's listings page. The
    // agent listings query above can return both the CRM row AND the IDX
    // duplicate because Trestle sync copies the agent's ListAgentMlsId onto
    // the synced row. Without this dedupe, the wrong row (typically the
    // IDX duplicate with "RLS · Listing Courtesy of …" attribution) wins
    // on /agents/{slug}. See lib/listings/dedupe-crm-vs-idx.ts.
    return {
      active: preferCrmExclusiveOverIdxDuplicate(
        displayable
          .filter((l) => activeStatuses.includes(l.status))
          .map(dbListingToPublicDTO),
      ),
      closed: preferCrmExclusiveOverIdxDuplicate(
        serialized
          .filter((l) => closedStatuses.includes(l.status))
          .map(dbListingToPublicDTO),
      ),
    };
  } catch (err) {
    console.warn('[agent-listings] DB fetch failed:', err instanceof Error ? err.message : err);
    return { active: [], closed: [] };
  }
}

/**
 * Batch fetch primary photos from Trestle Media endpoint for listings missing media.
 * Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
 * NOT ResourceRecordID (can duplicate). IDXListing.mlsId = ListingKey = ResourceRecordKey.
 */
async function batchFetchPhotos(listings: IDXListing[]) {
  const needsPhotos = listings.filter((l) => l.media.length === 0);
  if (needsPhotos.length === 0) return;

  try {
    const token = await getAccessToken();
    const TRESTLE_API = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle';
    // Use mlsId (= ListingKey = ResourceRecordKey) for unique media lookups
    const keyToListing = new Map<string, IDXListing>();
    const filterParts: string[] = [];
    for (const l of needsPhotos) {
      const key = l.mlsId || l.listingId;
      keyToListing.set(key, l);
      const escaped = key.replace(/'/g, "''");
      filterParts.push(l.mlsId ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`);
    }
    // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
    const mediaFilter = `(${filterParts.join(' or ')}) and Order le 3 and MediaStatus ne 'Deleted'`;
    const mediaParams = new URLSearchParams();
    mediaParams.set('$filter', mediaFilter);
    mediaParams.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,PreferredPhotoYN,MediaStatus');
    mediaParams.set('$orderby', 'Order asc');
    mediaParams.set('$top', String(needsPhotos.length * 4));

    const resp = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const records = data.value || [];

    const byKey = new Map<string, { url: string; mediaType: string; order: number }[]>();
    for (const m of records) {
      // Prefer ResourceRecordKey (unique), fall back to ResourceRecordID
      const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || '');
      if (!mkey || !m.MediaURL) continue;
      const cat = String(m.MediaCategory || '').toLowerCase();
      if (cat.includes('floor plan')) continue; // Skip floorplans for cards
      const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
      if (!byKey.has(mkey)) byKey.set(mkey, []);
      byKey.get(mkey)!.push({
        url: String(m.MediaURL),
        mediaType: 'Photo',
        order: isPreferred ? -1 : Number(m.Order ?? 0),
      });
    }

    for (const listing of needsPhotos) {
      // Match by mlsId (ResourceRecordKey) first, fall back to listingId (ResourceRecordID)
      const key = listing.mlsId || listing.listingId;
      const photos = byKey.get(key);
      if (photos && photos.length > 0) {
        listing.media = photos.sort((a, b) => a.order - b.order) as typeof listing.media;
      }
    }
  } catch {
    // Non-fatal
  }
}
