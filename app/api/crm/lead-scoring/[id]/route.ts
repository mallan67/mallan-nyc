// /api/crm/lead-scoring/[id] — GET: score detail, POST: rescore
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { scoreLeadById } from "@/lib/lead-scoring/scorer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { agent_id: true },
  });
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const score = await prisma.leadScore.findUnique({ where: { lead_id: leadId } });
  if (!score) return NextResponse.json({ ok: false, error: "Score not computed yet" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    item: { ...score, id: score.id.toString(), lead_id: score.lead_id.toString() },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { agent_id: true },
  });
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const result = await scoreLeadById(leadId);
  await logAuditEvent("rescore", "lead_score", id, auth);

  return NextResponse.json({
    ok: true,
    item: { ...result, lead_id: result.lead_id.toString() },
  });
}
