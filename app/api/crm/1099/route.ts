// /api/crm/1099 — GET: status, POST: generate for one or all agents
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";

interface Agent1099Data {
  agentId: string;
  agentName: string;
  taxYear: number;
  totalCompensation: number;
  paymentCount: number;
  status: "generated" | "no_payments";
  payments: Array<{ amount: number; date: string; dealId: string; type: string }>;
  /** Reports/CMA Tier A P0: surface a warning when the agent has Deal
   *  rows in scope but the CommissionPayment query returns zero rows.
   *  This is the early-detection signal for "the assumed enum values
   *  (payment_type='agent_split', status='paid') do not match what's
   *  actually in production data" — without it, brokers see a $0
   *  1099 for an active agent and may not realize the query missed.
   */
  warning?: {
    code: string;
    message: string;
    deal_count: number;
  };
}

async function generate1099ForAgent(agentId: bigint, taxYear: number): Promise<Agent1099Data> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, full_name: true, first_name: true, last_name: true },
  });

  const name = agent?.full_name || `${agent?.first_name || ""} ${agent?.last_name || ""}`.trim() || "Unknown";

  // Get deals where this agent is the primary agent
  const deals = await prisma.deal.findMany({
    where: { agent_id: agentId },
    select: { id: true },
  });
  const dealIds = deals.map((d) => d.id);

  if (dealIds.length === 0) {
    return { agentId: agentId.toString(), agentName: name, taxYear, totalCompensation: 0, paymentCount: 0, status: "no_payments", payments: [] };
  }

  // Get agent_split payments for these deals in the tax year
  const payments = await prisma.commissionPayment.findMany({
    where: {
      deal_id: { in: dealIds },
      payment_type: "agent_split",
      status: "paid",
      date: {
        gte: new Date(`${taxYear}-01-01`),
        lt: new Date(`${taxYear + 1}-01-01`),
      },
    },
    select: { amount: true, date: true, deal_id: true, payment_type: true },
    orderBy: { date: "asc" },
  });

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Reports/CMA Tier A P0 — enum-mismatch warning.
  // The CommissionPayment query above filters by
  //   payment_type: "agent_split"
  //   status: "paid"
  // If those enum strings drift from production data (e.g. agent_split
  // → AGENT_SPLIT, paid → Paid), the query silently returns zero rows
  // and the broker sees "$0, no payments" for an active agent. Surface
  // a warning when the agent has Deals (work occurred) but the paid-
  // agent-split filter found nothing — that's the early-detection
  // signal for enum drift.
  const warning =
    payments.length === 0 && dealIds.length > 0
      ? {
          code: "ZERO_PAID_AGENT_SPLIT_FOR_DEALS",
          message:
            "Agent has " + dealIds.length + " Deal row(s) in scope but no CommissionPayment rows match payment_type='agent_split' AND status='paid'. Verify those enum values match production data before relying on this 1099 for filing.",
          deal_count: dealIds.length,
        }
      : undefined;

  return {
    agentId: agentId.toString(),
    agentName: name,
    taxYear,
    totalCompensation: Math.round(total * 100) / 100,
    paymentCount: payments.length,
    status: payments.length > 0 ? "generated" : "no_payments",
    payments: payments.map((p) => ({
      amount: Number(p.amount || 0),
      date: p.date?.toISOString().split("T")[0] || "",
      dealId: p.deal_id.toString(),
      type: p.payment_type,
    })),
    ...(warning ? { warning } : {}),
  };
}

// GET /api/crm/1099?year=2026 — status for all agents
export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const year = Number(req.nextUrl.searchParams.get("year") || new Date().getFullYear());

  const agents = await prisma.agent.findMany({
    where: { status: "active" },
    select: { id: true, full_name: true },
  });

  const results = await Promise.all(
    agents.map((a) => generate1099ForAgent(a.id, year))
  );

  return NextResponse.json({ year, agents: results });
}

// POST /api/crm/1099 — generate for one agent or all
export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const year = Number(body.year || new Date().getFullYear());
  const agentId = body.agent_id as string | undefined;
  const generateAll = body.generate_all === true;

  if (generateAll) {
    const agents = await prisma.agent.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    const results = await Promise.all(
      agents.map((a) => generate1099ForAgent(a.id, year))
    );

    await logAuditEvent("generate", "1099", "all", auth, { year, count: results.length }, ip);
    return NextResponse.json({ year, agents: results });
  }

  if (!agentId) {
    return NextResponse.json({ error: "agent_id or generate_all required" }, { status: 400 });
  }

  const result = await generate1099ForAgent(BigInt(agentId), year);
  await logAuditEvent("generate", "1099", agentId, auth, { year }, ip);
  return NextResponse.json({ ...result });
}
