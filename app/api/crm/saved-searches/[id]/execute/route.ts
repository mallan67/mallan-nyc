// POST /api/crm/saved-searches/[id]/execute
// Execute a saved search — run criteria against local listings DB.
// Updates last_run and result_count.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  runProjectionListingSearch,
  serializeSearchListing,
  hydrateSearchListingMedia,
} from "@/lib/search/core";
import { recordSearchRun } from "@/lib/search/search-run-recorder";
import {
  getUnsupportedProjectionCriteria,
  isPlainSearchCriteria,
} from "@/lib/search/criteria-to-prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const search = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!search) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && search.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!isPlainSearchCriteria(search.criteria)) {
      return NextResponse.json(
        {
          error: "Saved search criteria is invalid and cannot be executed.",
          code: "invalid_criteria",
        },
        { status: 422 },
      );
    }

    const criteria = search.criteria;
    const unsupportedCriteria = getUnsupportedProjectionCriteria(criteria);
    if (unsupportedCriteria.length > 0) {
      return NextResponse.json(
        {
          error:
            "Saved search cannot be executed because these criteria are not supported by the projection search engine.",
          code: "unsupported_criteria",
          unsupported_criteria: unsupportedCriteria,
        },
        { status: 422 },
      );
    }

    // Parse optional pagination from request body
    let limit = 100;
    let offset = 0;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") limit = Math.min(body.limit, 100);
      if (body.offset && typeof body.offset === "number") offset = body.offset;
    } catch {
      // No body is fine — use defaults
    }

    // PR 5D — first reader migrated to listing_search_projection. The
    // projection table is at full parity with `Listing` (PR 5C backfill);
    // the dual-write in lib/idx/sync.ts keeps it converged. Fail-closed
    // gates are preserved exactly: 4 mirrored gates fire on the projection;
    // owner_opt_out is applied via the FK `listing` relation filter.
    // Address suppression still flows through `sanitizeSearchAddress` on
    // the included Listing — same response shape as the Listing-backed path.
    const result = await runProjectionListingSearch(prisma, criteria, { limit, offset });

    // Update last_run and result_count
    await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: {
        last_run: new Date(),
        result_count: result.total,
      },
    });

    await logAuditEvent("execute", "saved_search", id, auth, {
      resultCount: result.total,
    });

    await recordSearchRun({
      savedSearchId: id,
      actor: {
        userType: auth.userType,
        userId: auth.userId,
        // Carry the real actor so a search run executed during delegated
        // access records WHO ran it, not just whose account it ran under.
        actorUserId: auth.actorUserId,
      },
      resultCount: result.total,
      limit: result.limit,
      offset: result.offset,
      source: "saved_search_execute",
      criteria,
    });

    // RESPONSE CONTRACT (2026-08-13, CANONICAL-READER migration): this endpoint
    // has always returned a `media` key per listing, and that key is PRESERVED.
    //
    // What changed is only its SOURCE. It used to be the raw legacy
    // `Listing.media` JSON blob — an unresolved array whose `media[0]` can be a
    // FloorPlan. It is now the canonical composition (relational `listing_media`
    // first, legacy JSON only where the resolver permits, photo-first ordering).
    //
    // "No first-party caller" does NOT license dropping a public key: it cannot
    // prove an older or external client is not reading it. So the shape stays.
    //
    // The hydration is deliberately NOT part of SEARCH_RESULT_LISTING_SELECT.
    // The other consumer of that select — the `/api/cron/search-alerts` cron —
    // provably discards media (`listingAlertEmail` has no image field), and it
    // must not pay a relational read for a value it throws away. One batched
    // query, on this route only, never per-row.
    const mediaById = await hydrateSearchListingMedia(
      prisma,
      result.listings.map((l) => l.listing_id),
    );
    const serialized = result.listings.map((l) => ({
      ...serializeSearchListing(l),
      // `[]` (not undefined) when a listing has no composable media, so the key
      // and its type stay stable for every row.
      media: mediaById.get(l.listing_id)?.media ?? [],
    }));

    return NextResponse.json({
      listings: serialized,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      searchName: search.name,
    });
  } catch (err) {
    console.error("Execute saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
