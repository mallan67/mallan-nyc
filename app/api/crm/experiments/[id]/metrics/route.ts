// /api/crm/experiments/[id]/metrics
// GET: Live-computed arm comparison, lift, p-value
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { evaluateExperiment } from "@/lib/pricing-experiments/stats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const expId = BigInt(id);

  const experiment = await prisma.pricingExperiment.findUnique({ where: { id: expId } });
  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && experiment.created_by_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const result = await evaluateExperiment(expId);
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Metrics computation failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
