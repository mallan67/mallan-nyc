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
  isCrmMediaKey,
  legacyItemUrl,
  legacyItemBasis,
  type LegacyMediaItem,
} from "@/lib/media/crm-media";
import { classifyLegacyMediaItemProvenance } from "@/lib/media/media-provenance";
import {
  listingCapabilities,
  CAPABILITY_DENIED,
  CAPABILITY_LISTING_SELECT,
} from "@/lib/auth/listing-capabilities";
// THE canonical full-size resolver. Reused so this route does not carry a second
// cached-vs-original preference order.
import { pickFullSizeUrl } from "@/lib/media/listing-media-resolver";

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
      select: { id: true, media: true, ...CAPABILITY_LISTING_SELECT },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
      select: { id: true, media: true, ...CAPABILITY_LISTING_SELECT },
    });
  }
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  // READ-ONLY endpoint: association-level access (broker or the listing's
  // associated agent). Per-item editability is reported in the payload below,
  // never implied by reaching this route.
  if (!listingCapabilities(auth, listing).mayViewHistory) {
    return NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 });
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
      // CANONICAL full-size resolver — one formula, not a second hand-rolled
      // preference order.
      //
      // This was `media_url_original || media_url_cached` (SOURCE-FIRST). For a
      // CRM upload that is correct — the 1600px `-hero.webp` lives in
      // `media_url_original` and the 800px `-card.webp` in `media_url_cached`.
      // But for a DELIVERED Cotality row it returned the ROTATING Cotality
      // locator even though a durable R2 copy existed, making this a live
      // consumer of the very locator that delivered-row write suppression stops
      // refreshing — a stale-image path.
      //
      // `pickFullSizeUrl` covers both: explicit `-hero.webp` wins (CRM keeps its
      // full-size hero), otherwise cached-first (delivered rows get durable R2).
      heroUrl: pickFullSizeUrl(r.media_url_cached || "", r.media_url_original || ""),
      media_type: r.media_type,
      media_category: r.media_category,
      order: r.order,
      preferred_photo_yn: r.preferred_photo_yn,
      // PROVENANCE, reported explicitly rather than inferred by the client.
      // Editability follows the KEY NAMESPACE — the same rule the write routes
      // enforce (`isCrmMediaKey` in the delete/set-main/reorder handlers) — so
      // the form cannot offer an action the API will reject.
      source: isCrmMediaKey(r.media_key) ? "mallan-crm" : "cotality-feed",
      editable: isCrmMediaKey(r.media_key),
    }));
    return NextResponse.json({ listing_id: listing.listing_id, media });
  }

  if (rows.length > 0) {
    // Rows existed but all are soft-deleted → authoritative empty.
    // Do NOT resurrect from the legacy JSON.
    return NextResponse.json({ listing_id: listing.listing_id, media: [] });
  }

  // No rows ever imported → READ-ONLY legacy-JSON preview (no DB write).
  //
  // PROVENANCE GATE. This JSON is NOT uniformly CRM media: the Trestle sync
  // writes Cotality image URLs into `Listing.media` on every upsert
  // (lib/idx/sync.ts:821, plus the media backfills). Minting a `crm:` key for
  // every item — as this route used to — advertised a feed photo as a CRM
  // identity, and because the write routes resolve THE SAME key, the first
  // upload/delete/set-main would import it as a `crm:` row. Those rows are
  // excluded from `tombstoneVanished` (media-sync.ts:1347/1353), so a photo
  // Cotality later deletes would survive forever.
  //
  // Only a provably Mallan-owned item gets a `crm:` key and `editable: true`.
  // Feed and unprovable items are still RETURNED — the gallery must render —
  // but carry their source identity and are not editable.
  const items: LegacyMediaItem[] = Array.isArray(listing.media)
    ? (listing.media as LegacyMediaItem[])
    : [];
  const listingIsTrestleSynced = listing.last_synced_from_trestle !== null;
  const seen = new Set<string>();
  const media: Array<Record<string, unknown>> = [];
  let idx = 0;
  for (const item of items) {
    const url = legacyItemUrl(item);
    if (!url) { idx++; continue; }

    const provenance = classifyLegacyMediaItemProvenance(item, { listingIsTrestleSynced });
    const isMallanOwned = provenance === "mallan-crm-upload";

    // A non-CRM item must NOT receive a `crm:` key. Its identity is the source
    // URL, which is also what the public reader keys on.
    const key = isMallanOwned
      ? crmMediaKey(listing.listing_id, legacyItemBasis(item))
      : `source:${legacyItemBasis(item)}`;
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
      source: provenance === "cotality-feed" ? "cotality-feed" : isMallanOwned ? "mallan-crm" : "unknown",
      // Fail-closed: only provable Mallan media is editable. A feed-backed
      // image never becomes CRM-editable merely because no relational row
      // exists yet.
      editable: isMallanOwned,
      _preview: true, // not yet persisted; rendered read-only until a write imports it
    });
    idx++;
  }
  return NextResponse.json({ listing_id: listing.listing_id, media, _legacyPreview: true });
}
