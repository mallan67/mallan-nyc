// POST /api/crm/listings/[id]/photos
// Upload media placeholder — stores metadata in listing.media JSON.
// Actual file upload to Cloudflare R2 will be wired when R2 credentials are available.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import type { Prisma } from "@prisma/client";

interface MediaItem {
  url: string;
  caption?: string;
  order?: number;
  type?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Resolve listing
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
  }

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: { photos: MediaItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.photos)) {
    return NextResponse.json(
      { error: "Expected 'photos' array in request body" },
      { status: 400 }
    );
  }

  // Merge with existing media
  const existingMedia = (listing.media as unknown as MediaItem[]) ?? [];
  const nextOrder = existingMedia.length;

  const newPhotos: MediaItem[] = body.photos.map((p, i) => ({
    url: p.url,
    caption: p.caption ?? "",
    order: p.order ?? nextOrder + i,
    type: p.type ?? "photo",
  }));

  const updatedMedia = [...existingMedia, ...newPhotos];

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      media: updatedMedia as unknown as Prisma.InputJsonValue,
      modification_timestamp: new Date(),
    },
  });

  await logAuditEvent(
    "update",
    "listing",
    listing.id.toString(),
    auth,
    { action: "photos_added", count: newPhotos.length },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    listing_id: listing.listing_id,
    total_photos: updatedMedia.length,
    added: newPhotos.length,
  });
}
