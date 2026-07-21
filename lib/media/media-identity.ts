// lib/media/media-identity.ts
//
// The canonical media-identity spine for the unified feed→DB→R2 system.
//
// LIVE-PROVEN (authenticated probe 2026-07-21T06:22Z): a media row's `MediaURL`
// changes at origin+pathname level on EVERY request (per-request path-signed).
// Therefore the URL is NOT identity and is fully EXCLUDED from change detection.
//
// Identity = (ResourceName, ResourceRecordKey, MediaKey, sourceRevision).
//   - MediaKey is the Media resource primary key (live-verified).
//   - sourceRevision = epoch-ms of max(MediaModificationTimestamp,
//     ModificationTimestamp); 0 when both null.
//
// The versioned R2 key derives from (canonicalType, listingId, MediaKey,
// sourceRevision) — never from Order (nullable) or array position. Two distinct
// media can never collide; a revision bump mints a NEW object (no overwrite of a
// still-referenced object; the old key becomes a replaced-version for the gated
// lifecycle to clean up).

import { createHash } from "node:crypto";
import { r2FolderFor, type CanonicalMediaType } from "./media-classifier";

export interface MediaIdentity {
  resourceName: string;
  resourceRecordKey: string;
  mediaKey: string;
  sourceRevision: number;
}

/** Raw-ish source row shape for identity/revision derivation (Trestle field names). */
export interface SourceRevisionInput {
  MediaModificationTimestamp?: string | null;
  ModificationTimestamp?: string | null;
}
export interface IdentityInput extends SourceRevisionInput {
  ResourceName?: string | null;
  ResourceRecordKey?: string | null;
  MediaKey?: string | null;
}

const epoch = (v: string | null | undefined): number => {
  if (!v) return 0;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
};

/** epoch-ms of max(MediaModificationTimestamp, ModificationTimestamp); 0 if none. */
export function deriveSourceRevision(row: SourceRevisionInput): number {
  return Math.max(epoch(row.MediaModificationTimestamp), epoch(row.ModificationTimestamp));
}

export function buildMediaIdentity(row: IdentityInput): MediaIdentity {
  return {
    resourceName: String(row.ResourceName ?? ""),
    resourceRecordKey: String(row.ResourceRecordKey ?? ""),
    mediaKey: String(row.MediaKey ?? ""),
    sourceRevision: deriveSourceRevision(row),
  };
}

const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const safeMediaKey = (mediaKey: string): string =>
  SAFE_KEY.test(mediaKey) ? mediaKey : createHash("sha1").update(mediaKey).digest("hex").slice(0, 20);

const DEFAULT_EXT: Record<string, string> = { photos: "jpg", floorplans: "jpg", videos: "mp4", virtualtours: "html" };

/**
 * Collision-proof versioned R2 key:
 *   `{folder}/{listingId}/{mediaKeySafe}/{sourceRevision}.{ext}`
 * Returns null for Document/Unknown (stored, never mirrored).
 * Order is deliberately absent — it is nullable at source and unsound as a key.
 */
export function buildVersionedR2Key(
  listingId: string,
  canonicalType: CanonicalMediaType,
  mediaKey: string,
  sourceRevision: number,
  ext?: string,
): string | null {
  const folder = r2FolderFor(canonicalType);
  if (folder === null) return null;
  const e = (ext && /^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : (DEFAULT_EXT[folder] ?? "bin"));
  const safeListing = String(listingId).replace(/[^A-Za-z0-9_-]/g, "_");
  return `${folder}/${safeListing}/${safeMediaKey(String(mediaKey))}/${sourceRevision}.${e}`;
}

/** The stored-row projection the change comparator reads. NO url field appears. */
export interface ComparableMediaRow {
  listing_id: string;
  resource_record_key: string | null;
  resource_record_id: string | null;
  media_key: string;
  source_revision: number | null;
  media_category: string | null;
  media_classification: string | null;
  media_type: string;
  order: number | null;
  preferred_photo_yn: boolean;
  status: string;
  // media_url_original may be present on callers' objects but is IGNORED here.
  media_url_original?: string | null;
}

/**
 * #530/unified no-op guard, identity-based. TRUE only when the stored row is
 * already `status='active'` and every IDENTITY / classification / ordering /
 * preference / linkage field matches — the URL is NEVER compared (it rotates
 * every fetch). A deleted/replaced row reappearing identically is NOT unchanged
 * (status must flip back to active → resurrect-on-reappear preserved).
 */
export function mediaRowUnchanged(existing: ComparableMediaRow, incoming: ComparableMediaRow): boolean {
  return (
    existing.status === "active" &&
    existing.listing_id === incoming.listing_id &&
    existing.resource_record_key === incoming.resource_record_key &&
    existing.resource_record_id === incoming.resource_record_id &&
    existing.media_key === incoming.media_key &&
    (existing.source_revision ?? 0) === (incoming.source_revision ?? 0) &&
    existing.media_category === incoming.media_category &&
    existing.media_classification === incoming.media_classification &&
    existing.media_type === incoming.media_type &&
    (existing.order ?? null) === (incoming.order ?? null) &&
    existing.preferred_photo_yn === incoming.preferred_photo_yn
  );
}
