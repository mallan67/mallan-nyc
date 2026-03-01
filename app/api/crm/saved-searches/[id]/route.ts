// GET /api/crm/saved-searches/[id] — get a single saved search
// PATCH /api/crm/saved-searches/[id] — update saved search
// DELETE /api/crm/saved-searches/[id] — delete saved search
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import type { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
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

    // Ownership check: agent can only see their own, broker can see all
    if (auth.role !== "BROKER" && search.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      id: search.id.toString(),
      name: search.name,
      criteria: search.criteria,
      last_run: search.last_run,
      result_count: search.result_count,
      agent_id: search.agent_id?.toString() ?? null,
      lead_id: search.lead_id?.toString() ?? null,
      created_at: search.created_at,
      updated_at: search.updated_at,
    });
  } catch (err) {
    console.error("Get saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const existing = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const updates: Prisma.SavedSearchUpdateInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.criteria !== undefined) {
      if (typeof body.criteria !== "object") {
        return NextResponse.json({ error: "criteria must be an object" }, { status: 400 });
      }
      updates.criteria = body.criteria as Prisma.InputJsonValue;
    }

    const updated = await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: updates,
    });

    await logAuditEvent("update", "saved_search", id, auth, body);

    return NextResponse.json({
      id: updated.id.toString(),
      name: updated.name,
      criteria: updated.criteria,
      updated_at: updated.updated_at,
    });
  } catch (err) {
    console.error("Update saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const existing = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await prisma.savedSearch.delete({ where: { id: BigInt(id) } });

    await logAuditEvent("delete", "saved_search", id, auth);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
