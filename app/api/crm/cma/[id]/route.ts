// /api/crm/cma/[id] — GET: CMA detail, PATCH: update status
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const report = await prisma.cmaReport.findUnique({
    where: { id: BigInt(id) },
    include: { agent: { select: { id: true, full_name: true, email: true } } },
  });

  if (!report) return NextResponse.json({ ok: false, error: "CMA not found" }, { status: 404 });
  if (auth.role !== "BROKER" && report.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    item: {
      ...report, id: report.id.toString(), agent_id: report.agent_id.toString(),
      estimated_value: report.estimated_value?.toString() ?? null,
      price_range_low: report.price_range_low?.toString() ?? null,
      price_range_high: report.price_range_high?.toString() ?? null,
      agent: report.agent ? { ...report.agent, id: report.agent.id.toString() } : null,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const reportId = BigInt(id);

  const existing = await prisma.cmaReport.findUnique({ where: { id: reportId } });
  if (!existing) return NextResponse.json({ ok: false, error: "CMA not found" }, { status: 404 });
  if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { status, notes } = body;
  const data: Record<string, unknown> = {};
  if (status && ["draft", "final", "sent"].includes(status)) data.status = status;
  if (notes !== undefined) data.notes = notes;

  const updated = await prisma.cmaReport.update({ where: { id: reportId }, data });
  await logAuditEvent("update", "cma_report", id, auth, data);

  return NextResponse.json({
    ok: true,
    item: {
      ...updated, id: updated.id.toString(), agent_id: updated.agent_id.toString(),
      estimated_value: updated.estimated_value?.toString() ?? null,
      price_range_low: updated.price_range_low?.toString() ?? null,
      price_range_high: updated.price_range_high?.toString() ?? null,
    },
  });
}
