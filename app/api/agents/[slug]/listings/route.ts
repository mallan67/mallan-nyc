import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { excludeMallanRlsReturnCopies } from "@/lib/listings/mallan-source-identity";
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { getAccessToken } from '@/lib/idx/auth';
import { filterDisplayableDbListings, dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { resolveFeedAuthorityForPage } from '@/lib/media/feed-media-authority';
import { AGENT_TYPED_SELECT } from '@/lib/listings/agent-info-resolver';
import { preferCrmExclusiveOverIdxDuplicate } from '@/lib/listings/dedupe-crm-vs-idx';
import { mapAgentCardMedia } from '@/lib/idx/agent-card-media';
import { getOpenHouseIndex, findNextOpenHouse } from '@/lib/open-houses/upcoming-open-houses';
import type { IDXListing } from '@/lib/idx/types';

/**
 * GET /api/agents/[slug]/listings
 *
 * Returns an agent's listings grouped by category:
 * - activeSales, activeRentals, closedSales, closedRentals
 *
 * Sources: Cotality IDX (by ListAgentFullName) + local DB exclusives (by agent_id)
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

    // Fetch from both sources in parallel. Cotality is a SUPPLEMENT — its
    // failure (bad/rotated creds, API down, preview env without IDX configured)
    // must NEVER take down the agent page. Without this guard a rejected
    // Cotality promise rejects the whole Promise.all and the outer catch returns
    // a 500, silently dropping the agent's local Mallan exclusives (matched by
    // agent_id). Isolate the Cotality branch so a throw degrades to "DB only".
    const cotalityFetch: Promise<{ active: PublicListingDTO[]; closed: PublicListingDTO[] }> = (
      useIDX
        ? fetchCotalityAgentListings(agentName, agent.trestle_mls_id)
        : Promise.resolve({ active: [], closed: [] })
    ).catch((err) => {
      console.warn(
        '[agents/listings] Cotality fetch failed; serving local DB exclusives only:',
        err instanceof Error ? err.message : err,
      );
      return { active: [], closed: [] };
    });
    const [cotalityResults, dbResults] = await Promise.all([
      cotalityFetch,
      fetchDbAgentListings(agent.id),
    ]);

    // Merge and deduplicate. The LOCAL Mallan row is canonical (Master
    // §4.4) — preferCrmExclusiveOverIdxDuplicate below keeps the CRM
    // SL-/RL- row and suppresses the IDX twin. The id-based filter here only
    // drops EXACT duplicate ids across the two branches; it is not a precedence
    // rule (SL-xxxx and RLSxxxx never share an id).
    const cotalityActiveIds = new Set(cotalityResults.active.map((l) => l.id));
    const cotalityClosedIds = new Set(cotalityResults.closed.map((l) => l.id));

    const dbActiveNew = dbResults.active.filter((l) => !cotalityActiveIds.has(l.id));
    const dbClosedNew = dbResults.closed.filter((l) => !cotalityClosedIds.has(l.id));

    // Cross-source dedupe (2026-05-28): after merging the DB branch (CRM
    // exclusives, matched by agent_id) and the Cotality branch (matched by
    // ListAgentMlsId), collapse same-physical-unit duplicates, preferring the
    // CRM SL-/RL- row over the Cotality/IDX copy. The per-branch dedupe inside
    // fetchDbAgentListings only sees DB rows; the Cotality copy (e.g.
    // RLS20093870) arrives via the Cotality branch, so the cross-source
    // suppression MUST happen here, after the merge.
    const allActive = preferCrmExclusiveOverIdxDuplicate([...dbActiveNew, ...cotalityResults.active]);
    const allClosed = preferCrmExclusiveOverIdxDuplicate([...dbClosedNew, ...cotalityResults.closed]);

    // Attach the upcoming PUBLIC open house to each ACTIVE card (agent-page "Open House" banner).
    // Mallan-scoped index, matched by listing id OR normalized address (twin-safe). Best-effort — a
    // Cotality hiccup never blocks the agent response. Closed listings get no upcoming open house.
    try {
      const ohIndex = await getOpenHouseIndex();
      if (ohIndex.size > 0) {
        for (const l of allActive) {
          const next = findNextOpenHouse(l, ohIndex);
          if (next) l.nextOpenHouse = next;
        }
      }
    } catch { /* best-effort enrichment */ }

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
 * Fetch agent's listings from Cotality IDX by ListAgentFullName.
 * Returns active and closed listings separately.
 */
async function fetchCotalityAgentListings(agentName: string, cotalityMlsId?: string | null): Promise<{
  active: PublicListingDTO[];
  closed: PublicListingDTO[];
}> {
  try {
    const safeName = agentName.replace(/'/g, "''");
    // Cotality-authoritative agent matching (2026-05-28): match by the agent's
    // REBNY/Cotality MLS member id (ListAgentMlsId = Agent.trestle_mls_id) when
    // we have it — stable across the "MAllan" vs "Maya Allan" source-spelling
    // variance, and required by REBNY syndication invariant I.4 (full-name
    // matching is fallback ONLY, never primary when a stronger id exists).
    const mlsId = (cotalityMlsId || '').trim();
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
    console.warn('[agent-listings] Cotality fetch failed:', err instanceof Error ? err.message : err);
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
      where: {
        // `agent_id` here is a ROSTER/HISTORY association, NOT ownership —
        // `syncAgentHistory` populates it from BOTH list-side and BUYER-side
        // matches. It selects which listings appear on this agent's page; it
        // confers no authority and must never be read as Mallan ownership.
        agent_id: agentId,
        // MALLAN RLS RETURN-COPY SUPPRESSION — Master §4.4.
        //
        // Applied INSIDE the query, before `take: 100`. The post-retrieval
        // physical-unit dedupe below is a SECOND DEFENSE only: it can pair a
        // local row with its twin solely when BOTH survive the take, so a twin
        // sitting beyond the 100-row window would otherwise reach the page on
        // its own with no local row present to suppress it.
        AND: [excludeMallanRlsReturnCopies()],
      },
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
        // PR 4 reader: the relational listing_media table is the authoritative,
        // RESOLVED media source (hero-first, deduped). Without it here,
        // dbListingToPublicDTO falls back to the legacy `media` JSON, so the
        // agent-page card showed a DIFFERENT hero than Featured/detail for the
        // same listing (e.g. a card-variant photo instead of the living-room
        // hero on SL-0004). Include it so all surfaces share one hero/order.
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            // MIXED-GALLERY COMPOSITION: resolveDbListingMedia treats an
            // all-`crm:` relational set as a SUPPLEMENT to the legacy Cotality
            // feed JSON rather than as the whole gallery. Without this column
            // that case is undetectable and one CRM upload hides the feed.
            media_key: true,
            media_url_original: true,
            media_url_cached: true,
            media_type: true,
            media_category: true,
            media_classification: true,
            order: true,
            preferred_photo_yn: true,
            status: true,
          },
        },
        // All-status existence signal for dbListingToPublicDTO's media authority:
        // this query selects ACTIVE rows only, so without _count a Mallan exclusive
        // whose relational photos were all deleted would look "never imported" and
        // resurrect deleted photos from the legacy JSON. _count keeps "never
        // imported" vs "all deleted" distinguishable with no extra query / no N+1
        // (Codex review, 2026-07-16).
        _count: { select: { listing_media: true } },
        media: true,
        // Phase B: typed agent columns so dbListingToPublicDTO resolves office TYPED-FIRST
        // (otherwise this public agent-page surface silently always falls back to agent_info JSON).
        ...AGENT_TYPED_SELECT,
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
        // NOTE: deliberately do NOT select agent_id / owner_client_id here.
        // syncAgentHistory writes agent_id onto Cotality-synced (third-party IDX)
        // rows, and dbListingToPublicDTO does not read either column: classifyDbListing
        // identifies a genuine Mallan exclusive by the SL-/RL- listing_id prefix OR
        // rls_eligible===false (lib/listings/mallan-source-identity.ts), so the DTO
        // still emits _source 'exclusive' for them and keeps the required RLS
        // courtesy/disclaimer on third-party rows (UCBA Art. III §2(C)).
        // (Codex review, PR #308.)
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

    // Public-surface dedupe (2026-05-28): drop Cotality-synced IDX duplicates
    // of Mallan CRM exclusives (SL-/RL-) on this agent's listings page. The
    // agent listings query above can return both the CRM row AND the IDX
    // duplicate because Cotality sync copies the agent's ListAgentMlsId onto
    // the synced row. Without this dedupe, the wrong row (typically the
    // IDX duplicate with "RLS · Listing Courtesy of …" attribution) wins
    // on /agents/{slug}. See lib/listings/dedupe-crm-vs-idx.ts.
    const activeRows = displayable.filter((l) => activeStatuses.includes(l.status));
    const closedRows = serialized.filter((l) => closedStatuses.includes(l.status));

    // FEED-authority for BOTH tabs in ONE grouped query (lib/media/feed-media-authority.ts).
    // This surface carries third-party rows stamped by syncAgentHistory, and Past Deals in
    // particular is where tombstoned feed media would otherwise be replayed from the stale legacy
    // JSON. Only ambiguous listings are queried; a failed lookup PROPAGATES.
    const feedAuthority = await resolveFeedAuthorityForPage(
      prisma,
      [...activeRows, ...closedRows].map((l) => ({
        ctx: { listingId: l.listing_id, rlsEligible: l.rls_eligible },
        tableRows: Array.isArray(l.listing_media) ? l.listing_media : [],
        hasLegacyPayload: Array.isArray(l.media) && l.media.length > 0,
      })),
    );
    // Explicit arrows, NOT bare `.map(dbListingToPublicDTO)`: `Array.map` passes (value, index,
    // array), so a bare reference would hand the numeric INDEX to the options parameter.
    const toDto = (l: DbListing) =>
      dbListingToPublicDTO(l, { hadFeedRelationalRows: feedAuthority.get(l.listing_id) });

    return {
      active: preferCrmExclusiveOverIdxDuplicate(activeRows.map(toDto)),
      closed: preferCrmExclusiveOverIdxDuplicate(closedRows.map(toDto)),
    };
  } catch (err) {
    console.warn('[agent-listings] DB fetch failed:', err instanceof Error ? err.message : err);
    return { active: [], closed: [] };
  }
}

/**
 * Batch fetch primary photos from Cotality Media endpoint for listings missing media.
 * Cotality guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
 * NOT ResourceRecordID (can duplicate). IDXListing.mlsId = ListingKey = ResourceRecordKey.
 */
async function batchFetchPhotos(listings: IDXListing[]) {
  const needsPhotos = listings.filter((l) => l.media.length === 0);
  if (needsPhotos.length === 0) return;

  try {
    const token = await getAccessToken();
    const COTALITY_API = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle';
    // Use mlsId (= ListingKey = ResourceRecordKey) for unique media lookups
    const keyToListing = new Map<string, IDXListing>();
    const filterParts: string[] = [];
    for (const l of needsPhotos) {
      const key = l.mlsId || l.listingId;
      keyToListing.set(key, l);
      const escaped = key.replace(/'/g, "''");
      filterParts.push(l.mlsId ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`);
    }
    // MediaStatus filter: exclude tombstoned photos retained by Cotality as historical records.
    const mediaFilter = `(${filterParts.join(' or ')}) and Order le 3 and MediaStatus ne 'Deleted'`;
    const mediaParams = new URLSearchParams();
    mediaParams.set('$filter', mediaFilter);
    mediaParams.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,PreferredPhotoYN,MediaStatus');
    mediaParams.set('$orderby', 'Order asc');
    // Codex #389: classification happens CLIENT-side (mapAgentCardMedia keeps
    // only canonical Photos), so the page needs headroom for the non-photo
    // rows it will discard — at x4 a mixed batch could fill the page with
    // floorplans/tours and starve later-sorted Photos. x10 bounds the worst
    // realistic mix while staying a single page. A server-side
    // `MediaCategory eq 'Photo'` $filter would be cleaner but enum
    // filterability on this feed is UNPROVEN (probe it live per Master §0.9
    // before relying on it); do not add it without that proof.
    // Codex #393: conservative $top clamp of 500 (Master §0.8 records $top
    // to 5000 as supported; raise only after a live probe) — an
    // over-limit request can be rejected, and this function's fail-soft
    // `return` would then leave EVERY listing in the batch on placeholders.
    // At the route's 100-listing ceiling the clamp still yields x5 headroom.
    mediaParams.set('$top', String(Math.min(needsPhotos.length * 10, 500)));

    const resp = await fetch(`${COTALITY_API}/odata/Media?${mediaParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const records = data.value || [];

    // P1C3 (M3): canonical classification via the extracted pure helper —
    // the old `cat.includes('floor plan')` never matched the feed's no-space
    // 'FloorPlan' member, so floorplans leaked onto cards; Videos/VirtualTours
    // no longer masquerade as card photos either.
    const byKey = mapAgentCardMedia(records);

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
