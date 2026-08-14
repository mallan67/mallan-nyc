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
  /**
   * Subset of `rows_suppressed_unchanged`: rows suppressed specifically because
   * the ONLY change was the provider's ModificationTimestamp (a revision that
   * altered no listing content). Broken out because it is the metric the Neon
   * write-amplification fix is measured by — ~95% of updates in a production
   * cycle classified `modification_timestamp_only` while still issuing a
   * physical UPDATE. Counted, not merged, so the reduction stays provable.
   */
  rows_suppressed_provenance_only: number;
  rows_inserted: number;
  rows_updated: number;
  rows_failed: number;
}

export function newWritePathCounters(): WritePathCounters {
  return {
    rows_checked: 0,
    rows_materially_changed: 0,
    rows_suppressed_unchanged: 0,
    rows_suppressed_provenance_only: 0,
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
      if (key === "raw_data") {
        // Correction 3: raw_data may carry the keep-set-preserved Media array
        // whose signed MediaURLs ROTATE per request under $expand=Media.
        // Compare through the media-aware canonicalizer so rotation alone
        // never forces a Listing write; every other raw_data change stays
        // material.
        if (!rawDataMateriallyEqual(next, existing[key])) return false;
        continue;
      }
      if (!materialValuesEqual(next, existing[key])) return false;
    }
    return true;
  } catch {
    // Comparison itself failed — fail closed: treat as changed so the write
    // proceeds. Suppression must never be the reason data went stale.
    return false;
  }
}

/**
 * Provider DOMAINS whose media URLs carry rotating signed queries
 * (query != identity). HOSTNAME-scoped: detection parses the URL and
 * inspects `URL.hostname` ONLY, matching an exact domain or a dot-boundary
 * subdomain — NEVER a substring over the full URL (a stable URL whose path
 * or query merely contains a provider-looking token must stay stable).
 *
 * Allowlist grounding (Maya re-review 2026-07-21):
 *   - `cotality.com` — LIVE-OBSERVED. The 2026-07-21 authenticated Phase-0
 *     probes (docs/superpowers/specs/evidence/
 *     2026-07-21-live-cotality-contract-probe.json and
 *     2026-07-21-live-cotality-pagination-probe.json on the #544 branch)
 *     contain exactly one media/API host: `api.cotality.com`.
 *   - `corelogic.com` — DEFENSIVE / NOT observed in those live probes. The
 *     production media proxy (app/api/media/proxy/route.ts) still allowlists
 *     the deprecated `api-trestle.corelogic.com` / `api-prod.corelogic.com`
 *     hosts ("old media URLs still work through 2026 warranty per Cotality
 *     email"), so stored legacy URLs may legitimately carry this domain.
 */
const ROTATING_MEDIA_URL_PROVIDER_DOMAINS = ["cotality.com", "corelogic.com"];

function hostnameMatchesProviderDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith("." + domain);
}

export function isRotatingFeedAssetUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ROTATING_MEDIA_URL_PROVIDER_DOMAINS.some((d) => hostnameMatchesProviderDomain(hostname, d));
  } catch {
    // Malformed URL → NOT a provider URL → exact compare downstream
    // (fail-closed: any difference stays a material change).
    return false;
  }
}

/**
 * Identity of a ROTATING feed asset URL: normalized origin + pathname.
 * ONLY the query string / fragment (where the rotating signature lives) is
 * dropped — a different host or a different media path IS a different asset
 * (true replacement / provider host migration → material). Malformed URLs
 * degrade deterministically to the raw string (fail-closed via inequality).
 */
export function rotatingUrlIdentity(url: string): string {
  try {
    const u = new URL(url);
    return u.origin.toLowerCase() + u.pathname;
  } catch {
    return url;
  }
}

/**
 * URL identity across the stored/incoming seam:
 *   - both ROTATING feed URLs → compare origin + pathname (signature ignored)
 *   - anything else (stable R2/Mallan/other URLs, or mixed rotating-vs-stable
 *     = delivery-state change) → EXACT string compare.
 */
function mediaUrlsEquivalent(a: string, b: string): boolean {
  if (isRotatingFeedAssetUrl(a) && isRotatingFeedAssetUrl(b)) {
    return rotatingUrlIdentity(a) === rotatingUrlIdentity(b);
  }
  return a === b;
}

interface LegacyMediaItem {
  url: string;
  mediaType: string;
  order: number;
  /** Stable RESO MediaKey when the writer preserved it (authoritative identity). */
  mediaKey?: string | null;
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
  const mediaKey =
    typeof rec.mediaKey === "string" ? rec.mediaKey : typeof rec.MediaKey === "string" ? rec.MediaKey : null;
  return { url, mediaType, order, mediaKey };
}

/**
 * Material identity for the LEGACY `listings.media` JSON batch writers
 * (lib/idx/sync.ts batch-media blocks + backfillEmptyMedia). This is NOT the
 * PR #547 `listing_media`-row comparator and must not replace it — it covers
 * the older JSON-array write path only.
 *
 * Equal ⇔ same length AND per-index items agree on mediaType + order AND
 * asset identity, where asset identity is:
 *   1. stable MediaKey when BOTH sides carry it (authoritative), else
 *   2. for two ROTATING feed URLs: normalized origin + pathname — ONLY the
 *      rotating signed query/fragment is ignored; a same-slot asset
 *      REPLACEMENT changes the path (or host) and stays material, else
 *   3. exact URL compare (stable R2/other URLs; rotating-vs-stable is a
 *      delivery-state change → not equal).
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
      const storedKey = stored.mediaKey ?? null;
      const incomingKey = incoming.mediaKey ?? null;
      if (storedKey !== null && incomingKey !== null) {
        if (storedKey !== incomingKey) return false;
      } else if (!mediaUrlsEquivalent(stored.url, incoming.url)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonicalize a raw_data value for MATERIAL comparison: inside the known
 * `Media` array (preserved by the raw-data keep-set,
 * lib/compliance/raw-data-keep-fields.ts), rotating signed `MediaURL` /
 * `Thumbnail` values are replaced by their origin+pathname identity. Nothing
 * else is altered — real Media path/count/order/metadata changes and every
 * non-media raw_data change stay fully material. Stable (non-feed) URLs are
 * left byte-exact.
 */
/**
 * THE deprecated provider provenance clock in `raw_data`.
 *
 * `Property.PhotosChangeTimestamp` is a media-change TRIGGER and a media-sync
 * CURSOR input — its durable home is `media_sync_state.last_photos_change`. It
 * is no longer persisted in `raw_data` (commit 7B-2B removed it from
 * RAW_DATA_KEEP_FIELDS), and its last stored-value consumer — the eligibility
 * predicate in the unreachable legacy `backfillEmptyMedia()` — was removed with
 * it.
 *
 * Historical rows still physically contain the key and NO cleanup backfill is
 * authorised, so it MUST be canonicalized away on BOTH sides of the comparison:
 *
 *   existing { ...X, PhotosChangeTimestamp: T1 }  ==  incoming { ...X }
 *   existing { ...X, PhotosChangeTimestamp: T1 }  ==  incoming { ...X, PCT: T2 }
 *
 * Without that, the first deployment would rewrite the entire table purely to
 * drop a key — the exact write storm this change exists to avoid.
 *
 * Deliberately ONE named key. This is not "timestamps are non-material":
 * ModificationTimestamp, StatusChangeTimestamp and every other clock remain
 * fully material.
 */
const DEPRECATED_RAW_DATA_PROVENANCE_KEYS = ['PhotosChangeTimestamp'] as const;

function canonicalizeRawDataMedia(raw: Record<string, unknown>): Record<string, unknown> {
  // Strip the deprecated provenance clock FIRST so it is removed even when the
  // row carries no Media array (the early return below).
  let base = raw;
  for (const key of DEPRECATED_RAW_DATA_PROVENANCE_KEYS) {
    if (key in base) {
      const { [key]: _dropped, ...rest } = base;
      base = rest;
    }
  }
  const raw_ = base;
  const media = raw_.Media;
  if (!Array.isArray(media)) return raw_;
  const canonMedia = media.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return item;
    const rec = item as Record<string, unknown>;
    const out: Record<string, unknown> = { ...rec };
    for (const key of ["MediaURL", "Thumbnail"]) {
      const v = out[key];
      if (typeof v === "string" && isRotatingFeedAssetUrl(v)) {
        out[key] = rotatingUrlIdentity(v);
      }
    }
    return out;
  });
  return { ...raw_, Media: canonMedia };
}

/**
 * Material equality for the `raw_data` column (correction 3). Deep,
 * key-order-independent compare in which ONLY the rotating signed query of
 * known feed Media URLs (`raw_data.Media[].MediaURL` / `.Thumbnail`) is
 * non-identity. Fails closed on malformed input (non-object sides,
 * canonicalization errors) → CHANGED, never throws.
 */
export function rawDataMateriallyEqual(a: unknown, b: unknown): boolean {
  try {
    if (typeof a !== "object" || a === null || Array.isArray(a)) return false;
    if (typeof b !== "object" || b === null || Array.isArray(b)) return false;
    return materialValuesEqual(
      canonicalizeRawDataMedia(a as Record<string, unknown>),
      canonicalizeRawDataMedia(b as Record<string, unknown>),
    );
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

// ── Change-reason attribution (Maya directive 2026-07-24) ──────────────────
//
// WHY: 83–95% of fetched listings count as "materially changed" every cycle
// because `modification_timestamp` is deliberately material (a source
// revision must persist). These counters attribute each physical write to
// WHAT actually changed, so a provenance-only revision (timestamp bump with
// zero visible field changes) can keep its row write but stop invalidating
// listing/building/search caches and stop triggering manifest warms.

export const LISTING_CHANGE_REASON_KEYS = [
  "modification_timestamp_only",
  "raw_data_only",
  "status",
  "price",
  "address",
  "display_permissions",
  "media_identity",
  "attribution",
  // The provider's own identity for the row (`mls_id` = Property.ListingKey).
  // Its own bucket because it produces a ONE-TIME, self-extinguishing write
  // that would otherwise be indistinguishable from real content churn.
  //
  // Measured 2026-08-14 on canonical production: 8,449 of 8,460 Active-ish
  // rows carry `mls_id = NULL`, because `ListingKey` was never in the Property
  // select until this PR added it. `mapTrestleToPrisma` sets
  // `mls_id = ListingKey` and `mls_id` is material, so the FIRST cursor touch
  // of each of those rows performs one physical UPDATE for identity alone.
  // Without this bucket that write lands in `other` and looks like content
  // churn — which would make the post-deploy write-reduction metric unreadable
  // exactly when it matters most.
  //
  // Reading the deploy: `modification_timestamp_only` must fall to ZERO
  // physical listing writes, `source_identity` accounts for the one-time
  // identity convergence and must itself decay to zero as rows are touched,
  // and a second identical emit for the same row must produce no write at all.
  "source_identity",
  // Physical/classification attributes. Uncategorized until 2026-08-14, so they
  // all landed in `other` — which made the recovery forecast report 403/403 as
  // `other` and told an operator nothing. Categorizing is behavior-NEUTRAL:
  // `isProvenanceOnlyChange` tests for exactly ["modification_timestamp_only"],
  // so no added key can create or destroy that verdict.
  "classification",
  "size",
  "features",
  "other",
] as const;

export type ListingChangeReason = (typeof LISTING_CHANGE_REASON_KEYS)[number];
export type ListingChangeReasonCounters = Record<ListingChangeReason, number>;

export function newListingChangeReasonCounters(): ListingChangeReasonCounters {
  return Object.fromEntries(
    LISTING_CHANGE_REASON_KEYS.map((k) => [k, 0]),
  ) as ListingChangeReasonCounters;
}

export const PROJECTION_CHANGE_REASON_KEYS = [
  "source_timestamp_only",
  "search_visible_fields",
] as const;

export type ProjectionChangeReason = (typeof PROJECTION_CHANGE_REASON_KEYS)[number];
export type ProjectionChangeReasonCounters = Record<ProjectionChangeReason, number>;

export function newProjectionChangeReasonCounters(): ProjectionChangeReasonCounters {
  return Object.fromEntries(
    PROJECTION_CHANGE_REASON_KEYS.map((k) => [k, 0]),
  ) as ProjectionChangeReasonCounters;
}

/** Material listing field → reason category. `modification_timestamp` and
 *  `raw_data` are handled by the exclusive buckets, never by this map.
 *  Anything unmapped classifies as "other". */
const LISTING_FIELD_CHANGE_CATEGORY: Readonly<Record<string, ListingChangeReason>> = {
  // Provider row identity (Property.ListingKey). NOT `attribution` — that
  // bucket is agent/office MLS ids, which are content about WHO holds the
  // listing. This is the key that identifies the record itself.
  mls_id: "source_identity",
  listing_type: "classification",
  property_type: "classification",
  property_sub_type: "classification",
  bedrooms_total: "size",
  bathrooms_full: "size",
  bathrooms_half: "size",
  living_area: "size",
  features: "features",
  status: "status",
  sync_status: "status",
  status_changed_at: "status",
  first_active_date: "status",
  days_on_market: "status",
  cumulative_days_on_market: "status",
  terminal_since: "status",
  listing_contract_date: "status",
  list_price: "price",
  address: "address",
  borough: "address",
  neighborhood: "address",
  city: "address",
  postal_code: "address",
  idx_display_yn: "display_permissions",
  internet_entire_listing_display_yn: "display_permissions",
  internet_address_display_yn: "display_permissions",
  participant_only: "display_permissions",
  owner_opt_out: "display_permissions",
  media: "media_identity",
  primary_photo_url: "media_identity",
  photos_count: "media_identity",
  agent_id: "attribution",
  list_agent_full_name: "attribution",
  list_office_name: "attribution",
  list_agent_email: "attribution",
  list_agent_direct_phone: "attribution",
  list_office_mls_id: "attribution",
  list_agent_mls_id: "attribution",
  co_list_office_mls_id: "attribution",
  co_list_agent_mls_id: "attribution",
};

/**
 * The material fields the prepared UPDATE payload would actually change,
 * using the SAME comparison seams as `listingUpdateMateriallyUnchanged`
 * (non-material telemetry skipped; `raw_data` through the media-aware
 * canonicalizer so rotating signed URLs never count; a field missing from
 * the existing selection counts as changed — fail closed). May throw on
 * hostile input; `classifyListingChangeReasons` absorbs that.
 */
export function changedMaterialListingFields(
  update: Record<string, unknown>,
  existing: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(update)) {
    if (LISTING_NON_MATERIAL_UPDATE_FIELDS.has(key)) continue;
    const next = update[key];
    if (next === undefined) continue;
    if (!(key in existing)) {
      changed.push(key);
      continue;
    }
    if (key === "raw_data") {
      if (!rawDataMateriallyEqual(next, existing[key])) changed.push(key);
      continue;
    }
    if (!materialValuesEqual(next, existing[key])) changed.push(key);
  }
  return changed;
}

/**
 * TOP-LEVEL raw_data keys that are pure SOURCE-REVISION CLOCKS — provenance,
 * never content. A feed re-emit whose only delta is one of these clocks
 * (plus the mirrored `modification_timestamp` column) is a change nobody
 * can see: the raw record's ModificationTimestamp moves on EVERY revision,
 * so without this carve-out the modification_timestamp_only bucket could
 * never fire (the raw_data delta would reclassify every clock bump as
 * raw_data_only and keep invalidating caches).
 *
 * Deliberately minimal: StatusChangeTimestamp / PriceChangeTimestamp are
 * NOT here — when those move, the corresponding typed field moved too and
 * classification proceeds through its real category. PhotosChangeTimestamp
 * is NOT here either (Maya review of #561): the batch-media reconcile loop
 * only processes listings that RETURN media rows — a listing whose gallery
 * the provider emptied to zero never enters mediaByListing, so its stored
 * media is not cleared by that path. Treating a PCT move as provenance
 * would also have suppressed cache invalidation for exactly that case.
 * A PCT-only delta therefore classifies raw_data_only → still invalidates
 * (fail-closed). Reclassifying PCT as provenance requires true negative
 * media reconciliation (explicit empty-set handling + stored-media clear)
 * first — tracked in the unified feed/media plan, NOT done here.
 */
export const RAW_DATA_PROVENANCE_CLOCK_KEYS: ReadonlySet<string> = new Set([
  "ModificationTimestamp",
  "OriginalEntryTimestamp",
]);

/** raw_data equality with the top-level provenance clocks removed from both
 *  sides (rotating Media URLs still canonicalized). Fail-closed: any error
 *  or non-object input → NOT equal. */
function rawDataEqualIgnoringProvenanceClocks(a: unknown, b: unknown): boolean {
  try {
    if (typeof a !== "object" || a === null || Array.isArray(a)) return false;
    if (typeof b !== "object" || b === null || Array.isArray(b)) return false;
    const strip = (o: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (!RAW_DATA_PROVENANCE_CLOCK_KEYS.has(k)) out[k] = v;
      }
      return out;
    };
    return rawDataMateriallyEqual(
      strip(a as Record<string, unknown>),
      strip(b as Record<string, unknown>),
    );
  } catch {
    return false;
  }
}

/**
 * Phase-1 write-amplification forensic (2026-07-25): the TOP-LEVEL raw_data
 * keys that DIFFER under the SAME material semantics the classifier uses to
 * decide `raw_data_only`. Critically this is NOT a JSON.stringify diff:
 *   - rotating signed feed Media URLs (`Media[].MediaURL` / `.Thumbnail`) are
 *     canonicalized via `rawDataMateriallyEqual`, so URL rotation alone NEVER
 *     reports `Media` (that rotation is exactly why the row is NOT material);
 *   - the pure provenance clocks (`RAW_DATA_PROVENANCE_CLOCK_KEYS`) are
 *     excluded — they move on every emit and are never the raw_data_only cause;
 *   - key order is irrelevant (deep compare), and added/removed keys ARE
 *     reported.
 * Reports genuine content keys only (e.g. `PhotosChangeTimestamp`,
 * `PublicRemarks`, a real Media path/order/count change). Key NAMES only —
 * never values. Pure; fail-open-empty on non-object input (no throw).
 */
export function changedRawDataMaterialKeys(previous: unknown, next: unknown): string[] {
  if (typeof previous !== "object" || previous === null || Array.isArray(previous)) return [];
  if (typeof next !== "object" || next === null || Array.isArray(next)) return [];
  const p = previous as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(p), ...Object.keys(n)])) {
    if (RAW_DATA_PROVENANCE_CLOCK_KEYS.has(key)) continue; // clock: always moves, not the cause
    // Wrap each side as { [key]: value } so a `Media` key runs through
    // canonicalizeRawDataMedia (rotation ignored) and every other key falls
    // through to the same key-order-independent deep compare the classifier uses.
    if (!rawDataMateriallyEqual({ [key]: p[key] }, { [key]: n[key] })) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Attribute a material listing change to reason buckets.
 *
 * Exclusive buckets (returned ALONE):
 *   - ["modification_timestamp_only"] — only source-revision clocks moved
 *     (the `modification_timestamp` column and/or raw_data's top-level
 *     provenance clock keys). The row write must proceed (provenance), but
 *     callers may skip cache invalidation and manifest warming.
 *   - ["raw_data_only"] — raw_data changed BEYOND its provenance clocks
 *     (± the timestamp column) with no typed column change. NOT
 *     provenance-only: raw_data feeds the public DTO Trestle-direct path,
 *     so invalidation stays fail-closed.
 *
 * Otherwise: the set of categories for every changed typed field
 * (modification_timestamp / raw_data accompanying real changes are not
 * separately attributed). Never throws — classification failure fails
 * closed to ["other"].
 */
export function classifyListingChangeReasons(
  update: Record<string, unknown>,
  existing: Record<string, unknown>,
): ListingChangeReason[] {
  try {
    const changed = changedMaterialListingFields(update, existing);
    if (changed.length === 0) return [];
    const set = new Set(changed);
    if (
      set.has("raw_data") &&
      rawDataEqualIgnoringProvenanceClocks(update.raw_data, existing.raw_data)
    ) {
      // The raw_data delta is provenance clocks only — reclassify it as
      // part of the timestamp bump, not a content change.
      set.delete("raw_data");
      if (set.size === 0) return ["modification_timestamp_only"];
    }
    if (set.size === 1 && set.has("modification_timestamp")) {
      return ["modification_timestamp_only"];
    }
    if (
      set.has("raw_data") &&
      [...set].every((k) => k === "raw_data" || k === "modification_timestamp")
    ) {
      return ["raw_data_only"];
    }
    const reasons = new Set<ListingChangeReason>();
    for (const key of set) {
      if (key === "modification_timestamp" || key === "raw_data") continue;
      reasons.add(LISTING_FIELD_CHANGE_CATEGORY[key] ?? "other");
    }
    return reasons.size > 0 ? [...reasons] : ["other"];
  } catch {
    return ["other"];
  }
}

/**
 * True ONLY for the `modification_timestamp_only` bucket — the single case
 * where a physical listing write may skip cache invalidation. Everything
 * else (including raw_data_only and classification failures) invalidates.
 */
export function isProvenanceOnlyChange(reasons: readonly string[]): boolean {
  return reasons.length === 1 && reasons[0] === "modification_timestamp_only";
}
