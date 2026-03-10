// /api/crm/experiments/engagement
// POST: Record an engagement event for an experiment listing
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { recordEngagement } from "@/lib/pricing-experiments/engagement";
import { ENGAGEMENT_EVENT_TYPES } from "@/lib/pricing-experiments/types";
import type { EngagementEventType } from "@/lib/pricing-experiments/types";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { experiment_listing_id, event_type, value, metadata } = body;

  if (!experiment_listing_id) {
    return NextResponse.json({ ok: false, error: "experiment_listing_id required" }, { status: 400 });
  }

  if (!ENGAGEMENT_EVENT_TYPES.includes(event_type as EngagementEventType)) {
    return NextResponse.json(
      { ok: false, error: `event_type must be: ${ENGAGEMENT_EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify listing exists and experiment is active
  const el = await prisma.experimentListing.findUnique({
    where: { id: BigInt(experiment_listing_id) },
    include: { arm: { include: { experiment: true } } },
  });

  if (!el) {
    return NextResponse.json({ ok: false, error: "Experiment listing not found" }, { status: 404 });
  }
  if (el.arm.experiment.status !== "active") {
    return NextResponse.json({ ok: false, error: "Experiment is not active" }, { status: 400 });
  }

  await recordEngagement(
    BigInt(experiment_listing_id),
    event_type as EngagementEventType,
    value,
    metadata
  );

  return NextResponse.json({ ok: true });
}
