// PATCH /api/portal/external-listings/[id]
// Buyer-owned bucket updates for non-IDX external listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireWorkspace } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  normalizeExternalListingBucket,
  normalizeExternalListingFamilyVisible,
  serializeExternalListing,
} from "@/lib/external-listings/normalize";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { recordPortalEvent } from "@/lib/portal/events";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireWorkspace(req, "buyer");
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access requires a client account" }, { status: 403 });
  }

  const { id } = await params;
  const externalListingId = safeBigInt(id);
  if (!externalListingId) {
    return NextResponse.json({ error: "Invalid external listing id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasBucket = Object.prototype.hasOwnProperty.call(body, "action_bucket");
  const hasFamilyVisible = Object.prototype.hasOwnProperty.call(body, "family_visible");
  const bucket = hasBucket ? normalizeExternalListingBucket(body.action_bucket) : null;
  const familyVisible = hasFamilyVisible ? normalizeExternalListingFamilyVisible(body.family_visible) : null;
  if (hasBucket && !bucket) {
    return NextResponse.json(
      { error: "action_bucket must be one of: saved, seen, liked, disliked, discuss" },
      { status: 400 },
    );
  }
  if (hasFamilyVisible && familyVisible === null) {
    return NextResponse.json({ error: "family_visible must be true or false" }, { status: 400 });
  }
  if (!bucket && familyVisible === null) {
    return NextResponse.json({ error: "Provide action_bucket or family_visible" }, { status: 400 });
  }

  const existing = await prisma.externalListing.findFirst({
    where: {
      id: externalListingId,
      lead_id: auth.userId,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "External listing not found" }, { status: 404 });
  }

  const listing = await prisma.externalListing.update({
    where: { id: existing.id },
    data: {
      ...(bucket ? { action_bucket: bucket } : {}),
      ...(familyVisible !== null ? { family_visible: familyVisible } : {}),
    },
  });

  await logAuditEvent(
    "external_listing_bucket_updated",
    "lead",
    auth.userId.toString(),
    auth,
    {
      external_listing_id: listing.id.toString(),
      action_bucket: bucket ?? listing.action_bucket,
      previous_action_bucket: existing.action_bucket,
      family_visible: listing.family_visible,
      previous_family_visible: existing.family_visible,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  await recordPortalEvent({
    leadId: auth.userId,
    eventType: "external_listing_bucket_updated",
    workspace: "buyer",
    metadata: {
      external_listing_id: listing.id.toString(),
      action_bucket: bucket ?? listing.action_bucket,
      previous_action_bucket: existing.action_bucket,
      family_visible: listing.family_visible,
      previous_family_visible: existing.family_visible,
    },
  });

  return NextResponse.json({ external_listing: serializeExternalListing(listing) });
}
