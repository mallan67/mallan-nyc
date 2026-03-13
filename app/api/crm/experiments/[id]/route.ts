// /api/crm/experiments/[id]
// GET: Experiment detail. PATCH: Update. DELETE: Archive.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { archiveExperiment } from "@/lib/pricing-experiments/lifecycle";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const experiment = await prisma.pricingExperiment.findUnique({
    where: { id: BigInt(id) },
    include: {
      created_by: { select: { id: true, full_name: true } },
      arms: {
        include: {
          listings: {
            where: { withdrawn_at: null },
            orderBy: { enrolled_at: "desc" },
          },
          _count: { select: { listings: true } },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && experiment.created_by_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    item: serializeExperiment(experiment),
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
  const expId = BigInt(id);

  const experiment = await prisma.pricingExperiment.findUnique({ where: { id: expId } });
  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && experiment.created_by_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  const allowed = ["name", "description", "target_sample_size", "conclusion_notes"];

  for (const field of allowed) {
    if (field in body) data[field] = body[field];
  }

  const updated = await prisma.pricingExperiment.update({
    where: { id: expId },
    data,
  });

  await logAuditEvent("update", "pricing_experiment", id, auth, data);

  return NextResponse.json({
    ok: true,
    item: {
      ...updated,
      id: updated.id.toString(),
      created_by_id: updated.created_by_id.toString(),
      significance_threshold: updated.significance_threshold.toString(),
    },
  });
}

export async function DELETE(
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

  await archiveExperiment(expId);
  await logAuditEvent("archive", "pricing_experiment", id, auth);

  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeExperiment(e: any) {
  return {
    ...e,
    id: e.id.toString(),
    created_by_id: e.created_by_id.toString(),
    significance_threshold: e.significance_threshold?.toString(),
    created_by: e.created_by
      ? { ...e.created_by, id: e.created_by.id.toString() }
      : null,
    arms: (e.arms || []).map((a: any) => ({
      ...a,
      id: a.id.toString(),
      experiment_id: a.experiment_id.toString(),
      listings: (a.listings || []).map((l: any) => ({
        ...l,
        id: l.id.toString(),
        arm_id: l.arm_id.toString(),
      })),
    })),
  };
}
