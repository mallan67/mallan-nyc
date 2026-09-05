// POST /api/crm/saved-searches/[id]/execute
// Execute a saved search on the canonical Search universe — the SAME executor, membership,
// order and total as live Agent Search. Updates last_run and result_count.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { hasCredentials } from "@/lib/idx/auth";
import { generateAttributionText } from "@/lib/idx/mapping";
import { CRITERIA_VERSION, resolveStoredCriteria } from "@/lib/search/engine/saved-search";
import { executeSearch } from "@/lib/search/engine/executor";
import { ProviderError } from "@/lib/search/engine/provider-client";
import { SEARCH_SELECT_FIELDS } from "@/lib/search/engine/select";
import { recordSearchRun } from "@/lib/search/search-run-recorder";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_EXECUTE_LIMIT = 100;

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

    // The stored criteria must resolve to executable criteria — current or a proven legacy
    // conversion. Anything else is refused by name; nothing is executed broader than saved.
    const resolved = resolveStoredCriteria(search.criteria);
    if (resolved.state === "invalid") {
      return NextResponse.json(
        {
          error: "Saved search criteria cannot be executed exactly: " + resolved.reasons.join("; "),
          code: "invalid_criteria",
          reasons: resolved.reasons,
          unsupported_criteria: resolved.unsupported,
        },
        { status: 422 },
      );
    }

    if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
      return NextResponse.json({ error: "Search not available", code: "IDX_UNAVAILABLE" }, { status: 503 });
    }

    // Optional pagination from the request body
    let limit = MAX_EXECUTE_LIMIT;
    let offset = 0;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") limit = Math.min(Math.max(Math.floor(body.limit), 1), MAX_EXECUTE_LIMIT);
      if (body.offset && typeof body.offset === "number") offset = Math.max(0, Math.floor(body.offset));
    } catch {
      // No body is fine — use defaults
    }

    const run = await executeSearch({ ...resolved.criteria, limit, offset }, { select: SEARCH_SELECT_FIELDS });

    await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: {
        last_run: new Date(),
        result_count: run.total,
      },
    });

    await logAuditEvent("execute", "saved_search", id, auth, {
      resultCount: run.total,
      countMeaning: run.countMeaning,
      criteria_state: resolved.state,
    });

    await recordSearchRun({
      savedSearchId: id,
      actor: {
        userType: auth.userType,
        // EFFECTIVE agent. The delegated-access branch (edab58bb) supplies `auth.actorUserId`
        // here for a broker acting inside an agent's context; this branch has no such field.
        userId: auth.userId,
        actorUserId: null,
      },
      resultCount: run.total,
      limit,
      offset,
      source: "saved_search_execute",
      criteria: { criteria_version: CRITERIA_VERSION, params: resolved.params },
      universe: { total: run.total, countMeaning: run.countMeaning },
    });

    // RESPONSE CONTRACT: `listings` is the shared Search DTO (the same shape live Agent Search
    // returns). The `media` key this endpoint has always carried is PRESERVED per listing; its
    // elements are the DTO's resolved media items (url, isPrimary, order, mediaType).
    const listings = run.listings.map((l) => ({ ...l, media: Array.isArray(l.images) ? l.images : [] }));

    return NextResponse.json({
      listings,
      total: run.total,
      countMeaning: run.countMeaning,
      hasMore: run.hasMore,
      limit,
      offset,
      searchName: search.name,
      criteria_state: resolved.state,
      executable_params: resolved.params,
      attribution: generateAttributionText(),
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error("[Saved Search execute] provider error", { status: err.status });
      return NextResponse.json(
        { error: err.status === 429 ? "Search temporarily unavailable. Please try again shortly." : "Search failed at the provider.", code: err.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR", providerStatus: err.status },
        { status: err.status === 429 ? 503 : 502 },
      );
    }
    console.error("Execute saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
