// /api/crm/commissions/stats — GET: P&L summary
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAgentPnL } from "@/lib/commission-tracker/tracker";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const agentId = auth.role === "BROKER" && searchParams.get("agent_id")
    ? BigInt(searchParams.get("agent_id")!)
    : auth.userId;

  // Only broker can view other agent's P&L
  if (auth.role !== "BROKER" && agentId !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");
  const startDate = startStr ? new Date(startStr) : undefined;
  const endDate = endStr ? new Date(endStr) : undefined;

  const pnl = await getAgentPnL(agentId, startDate, endDate);

  return NextResponse.json({ ok: true, ...pnl });
}
