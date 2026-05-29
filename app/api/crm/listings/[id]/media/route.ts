// GET /api/crm/listings/[id]/media
// Returns the listing's Cotality-shaped media rows (active), with stable media_key,
// so the sales form can render, reorder, set-as-main, and delete by key.
// Lazily imports any legacy listing.media JSON into rows first (idempotent), so a
// not-yet-migrated CRM listing still returns a complete, keyed set.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { importJsonMediaToRows } from "@/lib/media/crm-media";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
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
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (auth.role.toUpperCase() !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Idempotent: bring legacy JSON into rows so the returned set is complete + keyed.
  await importJsonMediaToRows(prisma, { listing_id: listing.listing_id, media: listing.media });

  const rows = await prisma.listingMedia.findMany({
    where: { listing_id: listing.listing_id, status: "active" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      media_key: true,
      media_url_cached: true,
      media_url_original: true,
      media_type: true,
      media_category: true,
      order: true,
      preferred_photo_yn: true,
    },
  });

  const media = rows.map((r) => ({
    media_key: r.media_key,
    url: r.media_url_cached || r.media_url_original || "",
    heroUrl: r.media_url_original || r.media_url_cached || "",
    media_type: r.media_type,
    media_category: r.media_category,
    order: r.order,
    preferred_photo_yn: r.preferred_photo_yn,
  }));

  return NextResponse.json({ listing_id: listing.listing_id, media });
}
