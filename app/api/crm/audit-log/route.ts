// /api/crm/audit-log — GET: list audit events with filtering
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);
  const offset = Number(url.searchParams.get("offset") || "0");
  const typeFilter = url.searchParams.get("type"); // comma-separated action types

  const where: Record<string, unknown> = {};

  // Agents can only see their own audit events
  if (auth.role !== "BROKER") {
    where.user_id = auth.userId;
  }

  // Filter by action type (e.g., "idx_sync,listing_sync,sync_error")
  if (typeFilter) {
    const types = typeFilter.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length > 0) {
      where.action = { in: types };
    }
  }

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      ...e,
      id: e.id.toString(),
      user_id: e.user_id?.toString() ?? null,
      entity_id: e.entity_id?.toString() ?? null,
    })),
    total,
    limit,
    offset,
  });
}
