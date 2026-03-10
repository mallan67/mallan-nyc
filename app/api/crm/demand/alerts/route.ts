// /api/crm/demand/alerts
// GET: List agent's demand alerts. POST: Create a new alert.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = { agent_id: auth.userId };
  const { searchParams } = req.nextUrl;
  if (searchParams.get("enabled") === "true") where.enabled = true;

  const alerts = await prisma.demandAlert.findMany({
    where,
    include: {
      demand_index: {
        select: { neighborhood: true, score: true, trend: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const serialized = alerts.map(a => ({
    ...a,
    id: a.id.toString(),
    agent_id: a.agent_id.toString(),
    demand_index_id: a.demand_index_id.toString(),
    demand_index: a.demand_index
      ? { ...a.demand_index }
      : null,
  }));

  return NextResponse.json({ ok: true, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { neighborhood, alert_type, threshold } = await req.json();

  if (!neighborhood || !alert_type) {
    return NextResponse.json(
      { ok: false, error: "neighborhood and alert_type are required" },
      { status: 400 }
    );
  }

  const validTypes = ["score_above", "score_below", "trend_change", "spike"];
  if (!validTypes.includes(alert_type)) {
    return NextResponse.json(
      { ok: false, error: `alert_type must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // Find or create demand index entry
  let demandIndex = await prisma.demandIndex.findUnique({
    where: { neighborhood },
  });

  if (!demandIndex) {
    demandIndex = await prisma.demandIndex.create({
      data: {
        neighborhood,
        score: 0,
        trend: "stable",
        trend_delta: 0,
        components: {},
        signal_count: 0,
        last_computed: new Date(),
      },
    });
  }

  const alert = await prisma.demandAlert.create({
    data: {
      agent_id: auth.userId,
      demand_index_id: demandIndex.id,
      neighborhood,
      alert_type,
      threshold: threshold ?? 70,
      enabled: true,
    },
  });

  await logAuditEvent("create", "demand_alert", alert.id.toString(), auth);

  return NextResponse.json({
    ok: true,
    item: {
      ...alert,
      id: alert.id.toString(),
      agent_id: alert.agent_id.toString(),
      demand_index_id: alert.demand_index_id.toString(),
    },
  }, { status: 201 });
}
