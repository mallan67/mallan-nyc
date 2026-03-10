// /api/crm/experiments/[id]/consent
// POST: Record seller consent for an experiment listing
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { CONSENT_METHODS, CONSENT_TERMS_VERSION } from "@/lib/pricing-experiments/types";
import type { ConsentMethod } from "@/lib/pricing-experiments/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json();
  const { experiment_listing_id, consent_method } = body;

  if (!experiment_listing_id) {
    return NextResponse.json({ ok: false, error: "experiment_listing_id required" }, { status: 400 });
  }

  if (!CONSENT_METHODS.includes(consent_method as ConsentMethod)) {
    return NextResponse.json(
      { ok: false, error: `consent_method must be: ${CONSENT_METHODS.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify listing belongs to this experiment
  const el = await prisma.experimentListing.findUnique({
    where: { id: BigInt(experiment_listing_id) },
    include: { arm: true },
  });

  if (!el || el.arm.experiment_id.toString() !== id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.experimentListing.update({
    where: { id: BigInt(experiment_listing_id) },
    data: {
      seller_consent: true,
      consent_timestamp: new Date(),
      consent_method,
      consent_terms_version: CONSENT_TERMS_VERSION,
    },
  });

  await logAuditEvent("consent", "experiment_consent", experiment_listing_id.toString(), auth, {
    listing_id: el.listing_id,
    consent_method,
    terms_version: CONSENT_TERMS_VERSION,
  });

  return NextResponse.json({
    ok: true,
    item: { ...updated, id: updated.id.toString(), arm_id: updated.arm_id.toString() },
  });
}
