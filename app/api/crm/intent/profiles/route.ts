// /api/crm/intent/profiles
// GET: List buyer intent profiles with filtering
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const stage = searchParams.get("stage");
  const minStrength = parseInt(searchParams.get("min_strength") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "intent_strength";
  const order = searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  const where: Record<string, unknown> = {};
  if (stage) where.intent_stage = stage;
  if (minStrength > 0) where.intent_strength = { gte: minStrength };

  // Scope to agent's own leads (unless broker)
  if (auth.role !== "BROKER") {
    where.lead = { agent_id: auth.userId };
  }

  const orderBy: Record<string, string> = {};
  const allowedSorts = ["intent_strength", "intent_stage", "event_count", "last_computed"];
  orderBy[allowedSorts.includes(sort) ? sort : "intent_strength"] = order;

  const [profiles, total] = await Promise.all([
    prisma.buyerIntentProfile.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        lead: {
          select: { id: true, first_name: true, last_name: true, email: true, phone: true },
        },
      },
    }),
    prisma.buyerIntentProfile.count({ where }),
  ]);

  const serialized = profiles.map(p => ({
    ...p,
    id: p.id.toString(),
    lead_id: p.lead_id.toString(),
    lead: p.lead ? {
      ...p.lead,
      id: p.lead.id.toString(),
    } : null,
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}
