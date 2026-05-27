import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string; mediaId: string }> };

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, mediaId } = await params;

  const listing = await prisma.listing.findUnique({
    where: { listing_id: id },
    select: { id: true, listing_id: true, agent_id: true },
  });

  if (!listing) {
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const byId = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
      select: { id: true, listing_id: true, agent_id: true },
    });
    if (!byId) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    return deleteMedia(req, byId, mediaId, auth);
  }

  return deleteMedia(req, listing, mediaId, auth);
}

async function deleteMedia(
  req: NextRequest,
  listing: { id: bigint; listing_id: string; agent_id: bigint | null },
  mediaId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: any,
) {
  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const numericMediaId = parseInt(mediaId);
  const where = !isNaN(numericMediaId)
    ? { id: BigInt(numericMediaId), listing_id: listing.listing_id }
    : { media_key: mediaId, listing_id: listing.listing_id };

  const mediaRow = await prisma.listingMedia.findFirst({ where });

  if (!mediaRow) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  await prisma.listingMedia.delete({ where: { id: mediaRow.id } });

  await logAuditEvent(
    "delete",
    "listing_media",
    mediaRow.id.toString(),
    auth,
    {
      listing_id: listing.listing_id,
      media_key: mediaRow.media_key,
      media_type: mediaRow.media_type,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ success: true, deleted_media_id: mediaRow.id.toString() });
}
