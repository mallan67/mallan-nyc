// GET /api/crm/listings/[id]/media
// READ-ONLY. Returns the listing's Cotality-shaped media rows (active), with
// stable media_key, so the sales form can render, reorder, set-as-main, delete.
//
// This endpoint NEVER writes (Codex media P0 finding #1). The legacy
// listing.media JSON → listing_media row import happens only in the write
// endpoints (upload / delete / set-main) and the explicit migration script —
// never on a GET. When no rows exist yet, GET returns a READ-ONLY preview of the
// legacy JSON with deterministic `crm:` preview keys (the same keys a later
// write-path import will mint), so the form can render and a subsequent
// write resolves the same keys. It must distinguish "no rows ever imported"
// (→ legacy preview) from "rows existed but all are deleted" (→ authoritative
// empty), so a delete is never silently resurrected from the legacy JSON.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import {
  crmMediaKey,
  crmMediaType,
  crmMediaCategory,
  legacyItemUrl,
  legacyItemBasis,
  type LegacyMediaItem,
} from "@/lib/media/crm-media";

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

  // READ-ONLY: fetch ALL rows (any status) so we can tell "no rows ever
  // imported" from "rows existed but all deleted". NO write on GET.
  const rows = await prisma.listingMedia.findMany({
    where: { listing_id: listing.listing_id },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      media_key: true,
      media_url_cached: true,
      media_url_original: true,
      media_type: true,
      media_category: true,
      order: true,
      preferred_photo_yn: true,
      status: true,
    },
  });

  const activeRows = rows.filter((r) => r.status === "active");

  if (activeRows.length > 0) {
    const media = activeRows.map((r) => ({
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

  if (rows.length > 0) {
    // Rows existed but all are soft-deleted → authoritative empty.
    // Do NOT resurrect from the legacy JSON.
    return NextResponse.json({ listing_id: listing.listing_id, media: [] });
  }

  // No rows ever imported → READ-ONLY legacy-JSON preview (no DB write).
  // Deterministic `crm:` keys match what the write-path import will mint.
  const items: LegacyMediaItem[] = Array.isArray(listing.media)
    ? (listing.media as LegacyMediaItem[])
    : [];
  const seen = new Set<string>();
  const media: Array<Record<string, unknown>> = [];
  let idx = 0;
  for (const item of items) {
    const url = legacyItemUrl(item);
    if (!url) { idx++; continue; }
    const key = crmMediaKey(listing.listing_id, legacyItemBasis(item));
    if (seen.has(key)) { idx++; continue; }
    seen.add(key);
    const mediaType = crmMediaType(item.type, item.caption);
    media.push({
      media_key: key,
      url,
      heroUrl: item.url || url,
      media_type: mediaType,
      media_category: crmMediaCategory(mediaType),
      order: Number.isFinite(item.order as number) ? (item.order as number) : idx,
      preferred_photo_yn: false,
      _preview: true, // not yet persisted; rendered read-only until a write imports it
    });
    idx++;
  }
  return NextResponse.json({ listing_id: listing.listing_id, media, _legacyPreview: true });
}
