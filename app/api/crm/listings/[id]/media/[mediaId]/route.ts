// /api/crm/listings/[id]/media/[mediaId]
//   DELETE → soft-delete a CRM media item by media_key (status='deleted').
//   PATCH  → set-as-main: preferred_photo_yn=true on this item, false on siblings.
//
// CRM-owned media only: both verbs require a `crm:` media_key, so Trestle/Cotality
// synced rows can never be modified through this CRM endpoint (guardrail #10).
// Cotality/IDX Plus remains the source of truth for the media shape.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isCrmMediaKey, importJsonMediaToRows } from "@/lib/media/crm-media";
import type { SessionUser } from "@/lib/auth/session";

async function resolveOwnedListing(
  id: string,
  auth: SessionUser,
) {
  const numericId = parseInt(id);
  let listing = null;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
      select: { id: true, listing_id: true, agent_id: true, media: true },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
      select: { id: true, listing_id: true, agent_id: true, media: true },
    });
  }
  if (!listing) return { error: NextResponse.json({ error: "Listing not found" }, { status: 404 }) };
  if (auth.role.toUpperCase() !== "BROKER" && listing.agent_id !== auth.userId) {
    return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { listing };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, mediaId } = await params;
  const mediaKey = decodeURIComponent(mediaId);
  if (!isCrmMediaKey(mediaKey)) {
    return NextResponse.json(
      { error: "Only CRM media can be modified here" },
      { status: 400 },
    );
  }

  const resolved = await resolveOwnedListing(id, auth);
  if ("error" in resolved) return resolved.error;
  const { listing } = resolved;

  await importJsonMediaToRows(prisma, { listing_id: listing.listing_id, media: listing.media });

  // Soft-delete (audit trail preserved), scoped to this listing.
  const res = await prisma.listingMedia.updateMany({
    where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
    data: { status: "deleted" },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: { modification_timestamp: new Date() },
  });

  await logAuditEvent(
    "delete",
    "listing",
    listing.id.toString(),
    auth,
    { action: "media_soft_deleted", media_key: mediaKey },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ listing_id: listing.listing_id, media_key: mediaKey, deleted: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, mediaId } = await params;
  const mediaKey = decodeURIComponent(mediaId);
  if (!isCrmMediaKey(mediaKey)) {
    return NextResponse.json(
      { error: "Only CRM media can be modified here" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is allowed for a bare set-as-main
  }
  const wantsMain =
    body.preferred_photo_yn === true || body.action === "set-main" || body.set_as_main === true;
  if (!wantsMain) {
    return NextResponse.json(
      { error: "Unsupported PATCH. Send { preferred_photo_yn: true } to set as main photo." },
      { status: 400 },
    );
  }

  const resolved = await resolveOwnedListing(id, auth);
  if ("error" in resolved) return resolved.error;
  const { listing } = resolved;

  await importJsonMediaToRows(prisma, { listing_id: listing.listing_id, media: listing.media });

  // The target must be an existing active Photo on this listing (floor plans /
  // videos can never be the hero).
  const target = await prisma.listingMedia.findFirst({
    where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
    select: { media_type: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  if (target.media_type !== "Photo") {
    return NextResponse.json(
      { error: "Only a photo can be the main image" },
      { status: 400 },
    );
  }

  // Exactly one preferred photo: clear siblings, set this one.
  await prisma.$transaction([
    prisma.listingMedia.updateMany({
      where: { listing_id: listing.listing_id, status: "active", preferred_photo_yn: true },
      data: { preferred_photo_yn: false },
    }),
    prisma.listingMedia.updateMany({
      where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
      data: { preferred_photo_yn: true },
    }),
  ]);

  await prisma.listing.update({
    where: { id: listing.id },
    data: { modification_timestamp: new Date() },
  });

  await logAuditEvent(
    "update",
    "listing",
    listing.id.toString(),
    auth,
    { action: "media_set_as_main", media_key: mediaKey },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ listing_id: listing.listing_id, media_key: mediaKey, preferred_photo_yn: true });
}
