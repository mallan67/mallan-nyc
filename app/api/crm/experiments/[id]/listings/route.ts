// /api/crm/experiments/[id]/listings
// POST: Assign a listing to an arm. DELETE: Withdraw a listing.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { withdrawListing } from "@/lib/pricing-experiments/lifecycle";

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

  // Verify experiment exists and is in draft
  const experiment = await prisma.pricingExperiment.findUnique({
    where: { id: expId },
    include: { arms: true },
  });
  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (experiment.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Can only add listings to draft experiments" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { arm_id, listing_id, listing_address } = body;

  if (!arm_id || !listing_id) {
    return NextResponse.json({ ok: false, error: "arm_id and listing_id required" }, { status: 400 });
  }

  // Verify arm belongs to this experiment
  const arm = experiment.arms.find(a => a.id.toString() === arm_id.toString());
  if (!arm) {
    return NextResponse.json({ ok: false, error: "arm_id does not belong to this experiment" }, { status: 400 });
  }

  // Check listing isn't in another active experiment
  const existing = await prisma.experimentListing.findFirst({
    where: {
      listing_id,
      withdrawn_at: null,
      arm: { experiment: { status: "active" } },
    },
  });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Listing is already in an active experiment" },
      { status: 409 }
    );
  }

  const el = await prisma.experimentListing.create({
    data: {
      arm_id: BigInt(arm_id),
      listing_id,
      listing_address: listing_address || undefined,
    },
  });

  await logAuditEvent("assign_listing", "pricing_experiment", id, auth, { listing_id });

  return NextResponse.json({
    ok: true,
    item: { ...el, id: el.id.toString(), arm_id: el.arm_id.toString() },
  }, { status: 201 });
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
  const body = await req.json();
  const { experiment_listing_id } = body;

  if (!experiment_listing_id) {
    return NextResponse.json({ ok: false, error: "experiment_listing_id required" }, { status: 400 });
  }

  await withdrawListing(BigInt(experiment_listing_id));
  await logAuditEvent("withdraw_listing", "pricing_experiment", id, auth, { experiment_listing_id });

  return NextResponse.json({ ok: true });
}
