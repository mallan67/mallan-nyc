// /api/crm/demand
// GET: List demand indices with filtering. POST: Trigger signal collection for a neighborhood.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { collectSignalsForNeighborhood } from "@/lib/demand-heatmap/collector";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const borough = searchParams.get("borough");
  const minScore = parseInt(searchParams.get("min_score") || "0");
  const trend = searchParams.get("trend");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "score";
  const order = searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  const where: Record<string, unknown> = {};
  if (borough) where.borough = borough;
  if (minScore > 0) where.score = { gte: minScore };
  if (trend) where.trend = trend;

  const orderBy: Record<string, string> = {};
  const allowedSorts = ["score", "neighborhood", "trend_delta", "last_computed"];
  orderBy[allowedSorts.includes(sort) ? sort : "score"] = order;

  const [indices, total] = await Promise.all([
    prisma.demandIndex.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.demandIndex.count({ where }),
  ]);

  const serialized = indices.map(i => ({
    ...i,
    id: i.id.toString(),
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { neighborhood, borough } = await req.json();
  if (!neighborhood || typeof neighborhood !== "string") {
    return NextResponse.json({ ok: false, error: "neighborhood is required" }, { status: 400 });
  }

  const count = await collectSignalsForNeighborhood(neighborhood.trim(), borough?.trim() || null);
  await logAuditEvent("collect_signals", "demand_signal", neighborhood, auth);

  return NextResponse.json({ ok: true, signals_collected: count });
}
