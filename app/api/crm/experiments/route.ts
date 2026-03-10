// /api/crm/experiments
// GET: List experiments with filtering. POST: Create a new experiment.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { createExperiment } from "@/lib/pricing-experiments/lifecycle";
import { EXPERIMENT_TYPES, EXPERIMENT_STATUSES } from "@/lib/pricing-experiments/types";
import type { ExperimentType } from "@/lib/pricing-experiments/types";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Ownership: agent sees only their own, broker sees all
  if (auth.role !== "BROKER") {
    where.created_by_id = auth.userId;
  }

  if (status) where.status = status;
  if (type) where.experiment_type = type;

  const [experiments, total] = await Promise.all([
    prisma.pricingExperiment.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
      include: {
        created_by: { select: { id: true, full_name: true } },
        arms: {
          include: {
            _count: { select: { listings: true } },
          },
        },
      },
    }),
    prisma.pricingExperiment.count({ where }),
  ]);

  const serialized = experiments.map((e) => ({
    ...e,
    id: e.id.toString(),
    created_by_id: e.created_by_id.toString(),
    significance_threshold: e.significance_threshold.toString(),
    created_by: e.created_by
      ? { ...e.created_by, id: e.created_by.id.toString() }
      : null,
    arms: e.arms.map((a) => ({
      ...a,
      id: a.id.toString(),
      experiment_id: a.experiment_id.toString(),
    })),
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { name, description, experiment_type, target_sample_size, control_arm, treatment_arm } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  if (!EXPERIMENT_TYPES.includes(experiment_type as ExperimentType)) {
    return NextResponse.json(
      { ok: false, error: `Invalid experiment_type. Must be: ${EXPERIMENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!control_arm?.name || !treatment_arm?.name) {
    return NextResponse.json(
      { ok: false, error: "control_arm and treatment_arm with name required" },
      { status: 400 }
    );
  }

  try {
    const experiment = await createExperiment(
      {
        name,
        description,
        experiment_type: experiment_type as ExperimentType,
        target_sample_size: target_sample_size || 100,
        control_arm: { name: control_arm.name, config: control_arm.config || {} },
        treatment_arm: { name: treatment_arm.name, config: treatment_arm.config || {} },
      },
      auth.userId
    );

    await logAuditEvent("create", "pricing_experiment", experiment.id.toString(), auth);

    return NextResponse.json({
      ok: true,
      item: {
        ...experiment,
        id: experiment.id.toString(),
        created_by_id: experiment.created_by_id.toString(),
        significance_threshold: experiment.significance_threshold.toString(),
        arms: experiment.arms.map((a) => ({
          ...a,
          id: a.id.toString(),
          experiment_id: a.experiment_id.toString(),
        })),
      },
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create experiment";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
