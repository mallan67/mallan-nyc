// PATCH /api/crm/clients/[id]/external-listings/[externalId]
// Agent/broker bucket updates for a client's non-IDX external listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireAgentOrBroker } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { normalizeExternalListingBucket, serializeExternalListing } from "@/lib/external-listings/normalize";
import { safeBigInt } from "@/lib/utils/safe-bigint";

type RouteParams = { params: Promise<{ id: string; externalId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, externalId } = await params;
  const leadId = safeBigInt(id);
  const externalListingId = safeBigInt(externalId);
  if (!leadId || !externalListingId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bucket = normalizeExternalListingBucket(body.action_bucket);
  if (!bucket) {
    return NextResponse.json(
      { error: "action_bucket must be one of: saved, seen, liked, disliked, discuss" },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, agent_id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const existing = await prisma.externalListing.findFirst({
    where: {
      id: externalListingId,
      lead_id: lead.id,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "External listing not found" }, { status: 404 });
  }

  const listing = await prisma.externalListing.update({
    where: { id: existing.id },
    data: { action_bucket: bucket },
  });

  await logAuditEvent(
    "external_listing_bucket_updated_by_agent",
    "lead",
    lead.id.toString(),
    auth,
    {
      external_listing_id: listing.id.toString(),
      action_bucket: bucket,
      previous_action_bucket: existing.action_bucket,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ external_listing: serializeExternalListing(listing) });
}
