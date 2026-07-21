// lib/idx/write-suppression.ts
//
// Phase 3 write-suppression — pure material-identity comparators + counters.
//
// WHY (2026-07 Neon write-churn forensic, docs/operations/neon-write-churn-forensic-2026-07-14.md):
// the IDX sync pipeline and recurring scorers performed UNCONDITIONAL
// upserts/updates on every run even when nothing material changed. On Neon
// every one of those no-op writes is real WAL + page churn (compute + storage
// cost) and pointless `updated_at` noise. This module defines what "material"
// means for each write path so callers can suppress writes when the stored
// row is already identical.
//
// MATERIAL-IDENTITY DOCTRINE (live-proven, PR #547):
//   - Rotating Trestle/Cotality SIGNED URLs are NEVER material identity —
//     the feed re-signs `MediaURL` on every request.
//   - Locally-generated telemetry clocks are NEVER material identity:
//     `last_synced_from_trestle` (fetch wall-clock), Prisma-managed
//     `updated_at` / `created_at`.
//   - The SOURCE revision clock (`modification_timestamp` ←
//     Trestle `ModificationTimestamp`) IS material — a source revision must
//     always persist.
//   - Anything unverifiable FAILS CLOSED → treated as changed → the write
//     proceeds. Suppression is an optimization; correctness always wins.
//
// This module is PURE (no Prisma, no I/O) so it is trivially unit-testable
// and cannot itself add DB load.

/**
 * Required physical-write accounting for every suppressed write path.
 * `rows_inserted` / `rows_updated` reflect PHYSICAL DB writes only;
 * `rows_suppressed_unchanged` are rows we verified and intentionally did
 * not write; `rows_failed` are rows whose processing threw (they are never
 * double-counted as suppressed/inserted/updated).
 */
export interface WritePathCounters {
  rows_checked: number;
  rows_materially_changed: number;
  rows_suppressed_unchanged: number;
  rows_inserted: number;
  rows_updated: number;
  rows_failed: number;
}

export function newWritePathCounters(): WritePathCounters {
  return {
    rows_checked: 0,
    rows_materially_changed: 0,
    rows_suppressed_unchanged: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_failed: 0,
  };
}

/**
 * Fields on the `listings` UPDATE payload that are NOT part of material
 * identity. Each entry documents WHY it is excluded:
 *   - `last_synced_from_trestle` — local wall-clock at fetch time ("last
 *     calculation attempt" telemetry). Refreshing it alone is exactly the
 *     no-op churn this phase removes.
 *   - `updated_at` / `created_at` — Prisma-managed columns, never written
 *     explicitly by sync; excluded defensively.
 *
 * NOT excluded (deliberately material): `modification_timestamp` (Trestle
 * source-revision clock), `sync_status` (eligibility/lifecycle),
 * `status_changed_at` / `first_active_date` / `days_on_market` /
 * `cumulative_days_on_market` / `terminal_since` (lifecycle clocks — they
 * only appear in the payload when a real transition happened).
 */
export const LISTING_NON_MATERIAL_UPDATE_FIELDS: ReadonlySet<string> = new Set([
  "last_synced_from_trestle",
  "updated_at",
  "created_at",
]);

function isNullish(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

/** Decimal-like: Prisma.Decimal / decimal.js expose toNumber(). */
function isDecimalLike(v: unknown): v is { toNumber(): number; toString(): string } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    typeof (v as { toNumber?: unknown }).toNumber === "function"
  );
}

function isNumericLike(v: unknown): boolean {
  return typeof v === "number" || typeof v === "bigint" || isDecimalLike(v);
}

/** Canonical numeric string, or null when the value is not finite-numeric. */
function numericCanon(v: unknown): string | null {
  if (typeof v === "bigint") return v.toString();
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? String(n) : null;
}

function timeCanon(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function deepJsonEqual(a: Record<string, unknown> | unknown[], b: Record<string, unknown> | unknown[]): boolean {
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr && bIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!materialValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const key of keys) {
    if (!materialValuesEqual(ao[key], bo[key])) return false;
  }
  return true;
}

/**
 * Canonical value comparison across the Prisma-read vs mapper-produced type
 * seam:
 *   - null == undefined (absent key == SQL NULL == JSON round-trip drop)
 *   - Date vs Date/ISO-string → compare instants
 *   - number vs bigint vs Prisma.Decimal vs decimal-string → compare
 *     canonical numeric value (zero-safe: 0 ≠ null, §J.5)
 *   - strings/booleans → strict
 *   - plain objects/arrays → deep, key-order-independent
 *   - anything else / mixed shapes → NOT equal (fail-closed → write)
 */
export function materialValuesEqual(a: unknown, b: unknown): boolean {
  if (isNullish(a) && isNullish(b)) return true;
  if (isNullish(a) || isNullish(b)) return false;
  if (a instanceof Date || b instanceof Date) {
    const ta = timeCanon(a);
    const tb = timeCanon(b);
    return ta !== null && ta === tb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (isNumericLike(a) || isNumericLike(b)) {
    const ca = numericCanon(isDecimalLike(a) ? a.toString() : a);
    const cb = numericCanon(isDecimalLike(b) ? b.toString() : b);
    return ca !== null && ca === cb;
  }
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "object" && typeof b === "object") {
    return deepJsonEqual(
      a as Record<string, unknown> | unknown[],
      b as Record<string, unknown> | unknown[],
    );
  }
  return a === b;
}

/**
 * True when the prepared `listings` UPDATE payload carries NO material change
 * relative to the existing row (as selected by the sync loop).
 *
 * Fail-closed rules:
 *   - a payload field missing from the existing selection → CHANGED
 *   - any comparison error → CHANGED (never throws)
 *
 * The caller passes the payload AFTER guardArchivedRehydration, so archived
 * rows compare against exactly what would be written.
 */
export function listingUpdateMateriallyUnchanged(
  update: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  try {
    for (const key of Object.keys(update)) {
      if (LISTING_NON_MATERIAL_UPDATE_FIELDS.has(key)) continue;
      const next = update[key];
      if (next === undefined) continue; // omitted field — nothing would be written
      if (!(key in existing)) return false; // unverifiable → fail closed
      if (!materialValuesEqual(next, existing[key])) return false;
    }
    return true;
  } catch {
    // Comparison itself failed — fail closed: treat as changed so the write
    // proceeds. Suppression must never be the reason data went stale.
    return false;
  }
}

/** Hosts whose media URLs carry rotating signatures (never identity). */
const ROTATING_MEDIA_URL_HOSTS = ["cotality.com", "corelogic.com", "trestle"];

export function isRotatingFeedAssetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return ROTATING_MEDIA_URL_HOSTS.some((h) => lower.includes(h));
}

interface LegacyMediaItem {
  url: string;
  mediaType: string;
  order: number;
}

function asLegacyMediaItem(v: unknown): LegacyMediaItem | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const rec = v as Record<string, unknown>;
  const url = typeof rec.url === "string" ? rec.url : typeof rec.MediaURL === "string" ? rec.MediaURL : null;
  if (url === null) return null;
  const mediaType =
    typeof rec.mediaType === "string" ? rec.mediaType : typeof rec.MediaCategory === "string" ? rec.MediaCategory : "";
  const order = typeof rec.order === "number" ? rec.order : typeof rec.Order === "number" ? rec.Order : Number.NaN;
  if (Number.isNaN(order)) return null;
  return { url, mediaType, order };
}

/**
 * Material identity for the LEGACY `listings.media` JSON batch writers
 * (lib/idx/sync.ts batch-media blocks + backfillEmptyMedia). This is NOT the
 * PR #547 `listing_media`-row comparator and must not replace it — it covers
 * the older JSON-array write path only.
 *
 * Equal ⇔ same length AND per-index items agree on mediaType + order AND
 * URL identity, where two ROTATING feed URLs (Trestle/Cotality signed) are
 * considered identical regardless of their signature. A stored stable URL
 * (e.g. R2) vs an incoming feed URL is a DELIVERY-STATE change → not equal.
 *
 * Fail-closed: non-array stored media, malformed items, or any comparison
 * error → NOT equal (the write proceeds).
 */
export function mediaArraysMateriallyEqual(existing: unknown, next: LegacyMediaItem[]): boolean {
  try {
    if (!Array.isArray(existing)) return false;
    if (existing.length !== next.length) return false;
    for (let i = 0; i < next.length; i++) {
      const stored = asLegacyMediaItem(existing[i]);
      if (stored === null) return false;
      const incoming = next[i];
      if (stored.mediaType !== incoming.mediaType) return false;
      if (stored.order !== incoming.order) return false;
      const bothRotating = isRotatingFeedAssetUrl(stored.url) && isRotatingFeedAssetUrl(incoming.url);
      if (!bothRotating && stored.url !== incoming.url) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Static select for the widened existing-row read in `syncListings` /
 * `syncAgentHistory`. A superset of every material field the UPDATE payload
 * can carry; missing fields would otherwise fail-closed into unconditional
 * writes. `media` is deliberately absent (the per-record UPDATE omits media;
 * the batch-media path reads it separately).
 */
export const LISTING_SYNC_COMPARE_SELECT = {
  // Pre-existing transition/guard fields
  status: true,
  status_changed_at: true,
  first_active_date: true,
  days_on_market: true,
  sync_status: true,
  // Material identity fields
  mls_id: true,
  listing_type: true,
  property_type: true,
  property_sub_type: true,
  list_price: true,
  bedrooms_total: true,
  bathrooms_full: true,
  bathrooms_half: true,
  living_area: true,
  borough: true,
  neighborhood: true,
  city: true,
  postal_code: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  participant_only: true,
  owner_opt_out: true,
  address: true,
  features: true,
  raw_data: true,
  modification_timestamp: true,
  listing_contract_date: true,
  terminal_since: true,
  cumulative_days_on_market: true,
  agent_id: true,
  // Typed agent attribution columns (Phase A2)
  list_agent_full_name: true,
  list_office_name: true,
  list_agent_email: true,
  list_agent_direct_phone: true,
  list_office_mls_id: true,
  list_agent_mls_id: true,
  co_list_office_mls_id: true,
  co_list_agent_mls_id: true,
} as const;
