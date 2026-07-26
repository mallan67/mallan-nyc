// lib/idx/media-set-hash.ts
//
// Phase 2A · CODE-1 — pure, URL-free, versioned stable hash of a COMPLETE feed
// media set, plus the fail-closed source-set validity gate (spec §4.2 / §4.3b).
//
// WHY: the two-strike reconciliation guard (media-reconcile-guard.ts) compares a
// freshly-fetched complete candidate set against the last successfully-reconciled
// set. The comparison MUST be:
//   - URL-free  — signed Cotality MediaURLs rotate every request (host/path may
//     also change on a re-sign / CDN move); a URL delta is NEVER a set-identity
//     change (write-suppression.ts doctrine). Nothing about the URL is hashed.
//   - deterministic — canonical MediaKey sort so API row order never matters, and
//     no Date.now()/randomness so the digest is reproducible across cycles.
//   - versioned — the digest is prefixed with a scheme version so a future
//     field-set change cannot silently collide with a v1 digest.
//   - fail-closed on an unsafe set — a duplicate MediaKey, a missing MediaKey/URL,
//     a ResourceRecordKey inconsistent with the listing, or a malformed
//     identity/timestamp field makes the whole set UNSAFE: no hash is produced, so
//     the caller can neither checkpoint nor perform any implicit tombstone.
//
// PURE: no Prisma, no I/O — trivially unit-testable and cannot add DB load.

import { createHash } from "node:crypto";

/** Hash scheme version — bump on ANY change to the hashed field set. */
export const MEDIA_SET_HASH_VERSION = "v1";

/** Versioned sentinel for a valid EMPTY set — distinct from null ("never
 *  reconciled") and from any non-empty digest. */
export const EMPTY_MEDIA_SET_HASH = `${MEDIA_SET_HASH_VERSION}:empty`;

/** Field separator (US, 0x1f) and row separator (RS, 0x1e) — control chars that
 *  cannot appear in material values, so the serialization is unambiguous. */
const FIELD_SEP = "";
const ROW_SEP = "";

export type MediaSetInvalidReason =
  | "missing_media_key"
  | "missing_media_url"
  | "duplicate_media_key"
  | "resource_record_key_mismatch"
  | "malformed_field";

/**
 * One feed media row's material identity. mediaUrl and resourceRecordKey are used
 * ONLY by the validity gate — mediaUrl is never part of the hash, and
 * resourceRecordKey is checked for listing-consistency but not hashed (it is
 * constant across a listing's set).
 */
export interface MediaSetItem {
  mediaKey: string | null | undefined;
  resourceRecordKey: string | null | undefined;
  mediaUrl: string | null | undefined;
  mediaType: string | null | undefined;
  mediaCategory: string | null | undefined;
  mediaClassification: string | null | undefined;
  order: number | null | undefined;
  preferredPhotoYN: boolean | null | undefined;
  mediaModificationTs: Date | string | null | undefined;
  modificationTs: Date | string | null | undefined;
}

export interface MediaSetValidity {
  safe: boolean;
  reasons: MediaSetInvalidReason[];
}

export type MediaSetHashResult =
  | { ok: true; hash: string; count: number }
  | { ok: false; reasons: MediaSetInvalidReason[] };

/** Sentinel a malformed date canonicalizes to (never a real ISO string). */
const MALFORMED = " MALFORMED";

/** ISO instant, "" for null/undefined, MALFORMED for an un-parseable value. */
function isoOrEmpty(v: Date | string | null | undefined): string {
  if (v == null) return "";
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? MALFORMED : d.toISOString();
}

/**
 * Validate a COMPLETE feed candidate set for a listing (§4.3b). Feed rows only —
 * crm: rows are excluded by the caller before this runs. listingKey is the queried
 * ResourceRecordKey (= Property.ListingKey). Returns every distinct failure reason
 * found (not just the first) so telemetry can attribute cause.
 */
export function validateMediaSourceSet(
  items: MediaSetItem[],
  listingKey: string,
): MediaSetValidity {
  const reasons = new Set<MediaSetInvalidReason>();
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.mediaKey == null ? "" : String(it.mediaKey);
    if (key === "") {
      reasons.add("missing_media_key");
      continue; // cannot dedupe / identify — the other checks need a key
    }
    if (seen.has(key)) reasons.add("duplicate_media_key");
    else seen.add(key);

    if (it.mediaUrl == null || String(it.mediaUrl).trim() === "") {
      reasons.add("missing_media_url");
    }
    if (it.resourceRecordKey != null && String(it.resourceRecordKey) !== listingKey) {
      reasons.add("resource_record_key_mismatch");
    }
    if (isoOrEmpty(it.mediaModificationTs) === MALFORMED || isoOrEmpty(it.modificationTs) === MALFORMED) {
      reasons.add("malformed_field");
    }
  }
  return { safe: reasons.size === 0, reasons: [...reasons] };
}

/**
 * Deterministic, versioned, URL-free stable hash of a COMPLETE feed set (§4.2).
 * An unsafe set (§4.3b) returns { ok: false, reasons } — NO hash, so the caller
 * cannot checkpoint or implicitly tombstone. A valid empty set returns
 * EMPTY_MEDIA_SET_HASH.
 */
export function stableMediaSetHash(
  items: MediaSetItem[],
  listingKey: string,
): MediaSetHashResult {
  const validity = validateMediaSourceSet(items, listingKey);
  if (!validity.safe) return { ok: false, reasons: validity.reasons };
  if (items.length === 0) return { ok: true, hash: EMPTY_MEDIA_SET_HASH, count: 0 };

  const rows = items.map((it) =>
    [
      String(it.mediaKey),
      it.mediaType ?? "",
      it.mediaCategory ?? "",
      it.mediaClassification ?? "",
      it.order == null ? "" : String(it.order),
      it.preferredPhotoYN == null ? "" : it.preferredPhotoYN ? "1" : "0",
      isoOrEmpty(it.mediaModificationTs),
      isoOrEmpty(it.modificationTs),
    ].join(FIELD_SEP),
  );
  rows.sort(); // canonical order: API row order is irrelevant
  const digest = createHash("sha256").update(rows.join(ROW_SEP)).digest("hex");
  return { ok: true, hash: `${MEDIA_SET_HASH_VERSION}:${digest}`, count: items.length };
}
