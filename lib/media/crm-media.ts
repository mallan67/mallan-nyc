// lib/media/crm-media.ts
// Shared helpers for CRM-owned media stored in the Cotality-shaped `listing_media`
// table. Cotality/IDX Plus is the source of truth — CRM uploads are mapped onto
// the SAME row shape the Trestle sync writes (media_key, media_type, order,
// preferred_photo_yn, media_category), in a separate `crm:` key namespace so the
// Trestle sync never collides with or prunes them.
//
// Used by: the upload route, the reorder route, the delete route, the set-as-main
// route, and the JSON→rows migration script — one source of truth for the key
// scheme and the legacy-JSON import.

import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { classifyLegacyMediaItemProvenance } from "@/lib/media/media-provenance";

/** All CRM-owned media_keys start with this. Distinguishes them from Trestle feed keys. */
export const CRM_MEDIA_KEY_PREFIX = "crm:";

/** Legacy `listing.media` JSON item shape (written by the old upload route). */
export interface LegacyMediaItem {
  url?: string;
  thumbUrl?: string;
  heroUrl?: string;
  caption?: string;
  order?: number;
  type?: string;
  uploadedAt?: string;
  contentHash?: string;
}

/** Canonical Cotality media types we use for CRM media. */
export type CrmMediaType = "Photo" | "FloorPlan" | "Video";

/** True for a CRM-owned media_key. */
export function isCrmMediaKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(CRM_MEDIA_KEY_PREFIX);
}

/**
 * P1C4 (loop L8): listing-touch data for a CRM media action — or null.
 *
 * The idx-sync cursor is MAX(modification_timestamp) over rows WHERE
 * last_synced_from_trestle IS NOT NULL (lib/idx/sync.ts getLastSyncTimestamp);
 * MT must remain the TRESTLE row clock for synced rows. A CRM media action
 * that bumps MT with local NOW makes the next incremental filter
 * (`ModificationTimestamp gt SINCE`) skip every unprocessed feed record older
 * than the bump — the PR-S.6/S.7 cursor hazard through a side door.
 *
 * Scoped stop-bump (Maya, Phase-1 Correction 4): Trestle-synced listing →
 * null (no touch — media truth lives in listing_media rows, which carry their
 * own updated_at; the listing row did not change). CRM-only exclusive
 * (last_synced_from_trestle NULL, SL-/RL-) → the bump object, preserving
 * today's behavior (sitemap lastModified, disclaimer lastUpdated, portal
 * ordering all read MT for that cohort).
 */
export function crmListingTouchData(
  lastSyncedFromTrestle: Date | null | undefined,
): { modification_timestamp: Date } | null {
  // Fail-closed (tristle P1C4 observation): `undefined` means the caller did
  // not SELECT the column — sync state UNKNOWN — so do NOT bump (a wrong skip
  // costs one benign sitemap stamp; a wrong bump can skip feed records).
  // Only an explicit NULL (provably CRM-only) earns the touch.
  if (lastSyncedFromTrestle === undefined) return null;
  return lastSyncedFromTrestle ? null : { modification_timestamp: new Date() };
}

/**
 * Deterministic, stable, unique media_key for a CRM media item.
 * `basis` is a hex hash (the upload's SHA-256, or a hash of the URL for legacy
 * items). Format: `crm:{listingId}:{basis[:24]}`. The same image on the same
 * listing always yields the same key → the table's @unique(media_key) gives us
 * content-dedup for free.
 */
export function crmMediaKey(listingId: string, basis: string): string {
  const trimmed = (basis || "").replace(/[^a-f0-9]/gi, "").slice(0, 24) || "0";
  return `${CRM_MEDIA_KEY_PREFIX}${listingId}:${trimmed}`;
}

/** SHA-256 hex of a string (used to derive a stable basis from a URL when no contentHash). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Map a CRM upload/legacy item to a canonical Cotality MediaType.
 * Floor plans are detected from an explicit type OR a 'floor plan' caption.
 * NEVER returns 'Photo' for a floor plan → floor plans are excluded from hero.
 */
export function crmMediaType(rawType?: string | null, caption?: string | null): CrmMediaType {
  const t = (rawType || "").toLowerCase();
  const c = (caption || "").toLowerCase();
  if (t === "floorplan" || t === "floor_plan" || t === "floor-plan" || /floor\s*plan/.test(c)) {
    return "FloorPlan";
  }
  if (t === "video") return "Video";
  return "Photo";
}

/**
 * Cotality `MediaCategory` member for a CRM media type. Mirrors the live
 * `$metadata` enum exactly: `Photo`, `FloorPlan`, and `Video` are all valid
 * `MediaCategory` members (artifacts/metadata.xml:11276-11340), and the Trestle
 * sync stores the same raw value for synced floor plans (`media-sync.ts:407`).
 *
 * Do NOT collapse `FloorPlan` to `Document` — `Document` is a separate
 * `MediaClassification` member (see {@link crmMediaClassification}), not the
 * floor-plan category. (Corrected 2026-05-29: the earlier plan guessed
 * `Document` before the enum-level metadata check; the live enum overrides it.)
 */
export function crmMediaCategory(mediaType: CrmMediaType): string {
  return mediaType;
}

/**
 * Cotality MediaClassification. The shared resolver recognizes floor plans via
 * `MediaClassification === 'Document'` (classifyMediaItem), so CRM floor-plan rows
 * MUST set this for the public reader to group them correctly and exclude them
 * from the hero. Photos/videos leave it null.
 */
export function crmMediaClassification(mediaType: CrmMediaType): string | null {
  return mediaType === "FloorPlan" ? "Document" : null;
}

/** The display URL for a legacy item (prefers the hero/card variant). */
export function legacyItemUrl(item: LegacyMediaItem): string {
  return (item.heroUrl || item.url || item.thumbUrl || "").trim();
}

/** Build the stable key basis for a legacy item: its contentHash, else hash(url). */
export function legacyItemBasis(item: LegacyMediaItem): string {
  if (item.contentHash) return item.contentHash;
  return sha256Hex(legacyItemUrl(item) || JSON.stringify(item));
}

/**
 * Idempotently import a listing's legacy `listing.media` JSON into Cotality-shaped
 * `listing_media` rows. Skips items whose `media_key` already exists, so it is safe
 * to call repeatedly (lazily on upload, and in bulk from the migration script).
 *
 * Does NOT delete or modify the legacy JSON (left intact for read-compat/rollback).
 * Does NOT set a preferred photo — the agent chooses the hero via set-as-main.
 *
 * PROVENANCE GATE (see lib/media/media-provenance.ts). The Trestle sync writes
 * COTALITY image URLs into this same `Listing.media` JSON (sync.ts:821 and the
 * media backfills). Importing them would mint `crm:` keys for feed images —
 * and `tombstoneVanished` excludes the `crm:` namespace by design
 * (media-sync.ts:1347/1353), so those clones would become permanently
 * un-prunable and would resurrect photos Cotality has deleted. Only items that
 * are PROVABLY Mallan-owned are imported; feed and unprovable items are counted
 * in `skippedByProvenance` and left untouched in the JSON.
 *
 * Returns { imported, skipped, skippedByProvenance, planned } where `planned` is
 * the list of rows that WOULD be created (so a dry-run can print them).
 */
export async function importJsonMediaToRows(
  /**
   * Accepts a `$transaction` client as well as the module client. CRM routes
   * MUST pass the transaction client: importing legacy rows in a separate,
   * already-committed statement means a later failure in the same business
   * operation rolls back the mutation and the summary while the imported rows
   * survive — the split state this whole correction exists to remove.
   */
  prisma: Pick<PrismaClient, "listingMedia">,
  listing: {
    listing_id: string;
    media: unknown;
    /**
     * `Listing.last_synced_from_trestle`. OMITTING IT FAILS CLOSED: `undefined`
     * means the caller did not SELECT the column, so sync state is UNKNOWN and
     * unmarked items are treated as potential feed media. Same doctrine as
     * `crmListingTouchData` above.
     */
    last_synced_from_trestle?: Date | null;
  },
  opts: { apply?: boolean; now?: Date } = {},
): Promise<{
  imported: number;
  skipped: number;
  skippedByProvenance: number;
  planned: Array<{ media_key: string; media_type: string; order: number; url: string }>;
}> {
  const apply = opts.apply !== false; // default: write
  const now = opts.now ?? new Date();
  const listingId = listing.listing_id;
  const items: LegacyMediaItem[] = Array.isArray(listing.media)
    ? (listing.media as LegacyMediaItem[])
    : [];

  // Fail-closed: unknown sync state is treated as SYNCED.
  const listingIsTrestleSynced = listing.last_synced_from_trestle !== null;

  let imported = 0;
  let skipped = 0;
  let skippedByProvenance = 0;
  const planned: Array<{ media_key: string; media_type: string; order: number; url: string }> = [];
  const seenKeys = new Set<string>();

  let index = 0;
  for (const item of items) {
    const url = legacyItemUrl(item);
    if (!url) {
      index++;
      continue;
    }

    // Only provably Mallan-owned media may enter the `crm:` namespace.
    if (classifyLegacyMediaItemProvenance(item, { listingIsTrestleSynced }) !== "mallan-crm-upload") {
      skippedByProvenance++;
      index++;
      continue;
    }

    const key = crmMediaKey(listingId, legacyItemBasis(item));
    // de-dupe within the JSON itself
    if (seenKeys.has(key)) {
      skipped++;
      index++;
      continue;
    }
    seenKeys.add(key);

    const existing = await prisma.listingMedia.findUnique({
      where: { media_key: key },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      index++;
      continue;
    }

    const mediaType = crmMediaType(item.type, item.caption);
    const order = Number.isFinite(item.order as number) ? (item.order as number) : index;
    planned.push({ media_key: key, media_type: mediaType, order, url });

    if (apply) {
      await prisma.listingMedia.create({
        data: {
          listing_id: listingId,
          media_key: key,
          resource_record_key: listingId,
          media_url_original: item.url || url,
          media_url_cached: url,
          media_type: mediaType,
          media_category: crmMediaCategory(mediaType),
          media_classification: crmMediaClassification(mediaType),
          order,
          preferred_photo_yn: false,
          media_modification_ts: item.uploadedAt ? new Date(item.uploadedAt) : now,
          status: "active",
        },
      });
      imported++;
    }
    index++;
  }

  return { imported, skipped, skippedByProvenance, planned };
}
