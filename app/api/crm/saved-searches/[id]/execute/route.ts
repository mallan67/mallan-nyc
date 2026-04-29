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
import { runListingSearch, serializeSearchListing } from "@/lib/search/core";
import { recordSearchRun } from "@/lib/search/search-run-recorder";

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

    const criteria = search.criteria as Record<string, unknown>;

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

    const result = await runListingSearch(prisma, criteria, { limit, offset });

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
      },
      resultCount: result.total,
      limit: result.limit,
      offset: result.offset,
      source: "saved_search_execute",
      criteria,
    });

    const serialized = result.listings.map(serializeSearchListing);

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
