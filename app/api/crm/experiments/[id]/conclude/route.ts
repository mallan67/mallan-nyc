// /api/crm/experiments/[id]/conclude
// POST: Conclude an experiment and compute final results
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { concludeExperiment } from "@/lib/pricing-experiments/lifecycle";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const expId = BigInt(id);

  const experiment = await prisma.pricingExperiment.findUnique({ where: { id: expId } });
  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && experiment.created_by_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await concludeExperiment(expId);
    await logAuditEvent("conclude", "pricing_experiment", id, auth);
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Conclusion failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
