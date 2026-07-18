/**
 * Listing search projection — pure builder helpers.
 *
 * Owned scope (per the PR 5A bounded brief):
 *   - Build a row for the new `listing_search_projection` table from a
 *     Listing-shaped input (DB row + features/address/media JSON).
 *   - Derive the searchable text, amenity keys, and feature flags as
 *     pure (no DB, no I/O) testable functions.
 *
 * Intentionally NOT included:
 *   - Persistence — no Prisma calls live here. PR 5B will write rows
 *     from lib/idx/sync.ts using these builders; PR 5A is schema only.
 *   - Display gating — `lib/search/listing-access-decision.ts` remains
 *     the canonical evaluator; this builder mirrors raw permission flags
 *     so a future reader can call the canonical evaluator on projection
 *     rows directly.
 *   - DTO mapping — public/portal DTOs continue to flow through
 *     `lib/idx/db-to-public-dto.ts` and `lib/idx/public-dto.ts`.
 */

import { Prisma } from "@prisma/client";

import { AMENITY_FIELD_MAP, type AmenityFilter } from "@/lib/search/types";
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";

// PropertySubType values that should classify a listing as commercial when no
// `commercial_sub_type` column is present. Matches the existing inline
// filter in `lib/search/public-listing-db.ts`'s commercial branch.
const COMMERCIAL_SUB_TYPES = new Set([
  "Commercial",
  "Office",
  "Retail",
  "Industrial",
  "MixedUse",
  "MultiFamily",
  "Warehouse",
]);

// PropertySubType values that should classify a listing as new development.
const NEW_DEVELOPMENT_SUB_TYPES = new Set(["NewConstruction", "New Construction"]);

/**
 * Loose Listing-shape input. Tolerates partial / mixed shapes so the helper
 * can run against:
 *   - a plain Prisma `Listing` row (BigInt agent_id, Decimal list_price)
 *   - a serialized DB row (string list_price, string living_area)
 *   - a partial fixture in tests
 *
 * The builder returns null/false for every field the input does not provide
 * — never throws.
 */
export interface ListingProjectionSource {
  listing_id: string;

  // Filter columns
  status?: string | null;
  listing_type?: string | null;
  property_type?: string | null;
  property_sub_type?: string | null;
  list_price?: number | string | bigint | { toString(): string } | null;
  bedrooms_total?: number | null;
  bathrooms_full?: number | null;
  bathrooms_half?: number | null;
  living_area?: number | string | { toString(): string } | null;
  borough?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;

  // Eligibility / commercial
  rls_eligible?: boolean | null;
  commercial_sub_type?: string | null;

  // Distribution gates
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  internet_address_display_yn?: boolean | null;
  participant_only?: boolean | null;

  // Exclusivity signal
  agent_id?: bigint | number | null;

  // Sync timestamp
  modification_timestamp?: Date | string | null;

  // JSON columns
  address?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  media?: unknown[] | Record<string, unknown> | null;
}

/**
 * Shape of a row written to `listing_search_projection`. Excludes
 * Prisma-managed `id`, `created_at`, `updated_at` so the same shape can
 * be passed to both `prisma.listingSearchProjection.create({ data: … })`
 * and `update({ data: … })`.
 */
export interface ListingSearchProjectionRow {
  listing_id: string;
  listing_key: string | null;
  source_system: string | null;
  mls_status: string | null;
  listing_type: string | null;
  property_type: string | null;
  property_sub_type: string | null;
  borough: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  list_price: bigint | null;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  year_built: number | null;
  latitude: number | null;
  longitude: number | null;
  is_commercial: boolean;
  is_new_development: boolean;
  is_exclusive: boolean;
  is_rental: boolean;
  rls_eligible: boolean;
  idx_display_yn: boolean | null;
  internet_entire_listing_display_yn: boolean | null;
  internet_address_display_yn: boolean | null;
  participant_only_yn: boolean | null;
  searchable_text: string | null;
  amenity_keys: string[] | null;
  feature_flags: Record<string, boolean> | null;
  modified_at: Date | null;
}

// ── Coercion helpers (kept module-local, not exported) ─────────────────

function stringFrom(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed ? trimmed : null;
}

function numberFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bigintFrom(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return BigInt(Math.trunc(value));
  }
  // Decimal / string — strip cents if present, then BigInt the integer part.
  const str = typeof value === "string" ? value : String(value);
  const cleaned = str.trim().split(".")[0].replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function dateFrom(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const str = typeof value === "string" ? value : String(value);
  const parsed = new Date(str);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isMediaArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ── Public helpers ─────────────────────────────────────────────────────

/**
 * Lowercased, whitespace-collapsed string of free-text fields safe for
 * keyword matching. Includes PublicRemarks, address parts (StreetNumber,
 * StreetName, UnitNumber, BuildingName), and the lifted neighborhood + city.
 *
 * Returns null when no source field is populated.
 *
 * Compliance note: PublicRemarks is a PUB-tier IDX field. Do NOT extend
 * this helper to include PrivateRemarks or ShowingInstructions (HID tier
 * per IDX/VOW display rules) — readers consuming `searchable_text` would
 * leak those to public surfaces.
 */
export function normalizeProjectionSearchText(listing: ListingProjectionSource): string | null {
  const features = (listing.features || {}) as Record<string, unknown>;
  const address = (listing.address || {}) as Record<string, unknown>;

  const parts: string[] = [];

  const remarks = stringFrom(features.PublicRemarks);
  if (remarks) parts.push(remarks);

  for (const key of ["StreetNumber", "StreetDirPrefix", "StreetName", "UnitNumber", "BuildingName", "City"]) {
    const v = stringFrom(address[key]);
    if (v) parts.push(v);
  }

  const neighborhood = stringFrom(listing.neighborhood);
  if (neighborhood) parts.push(neighborhood);
  const city = stringFrom(listing.city);
  if (city && city !== stringFrom(address.City)) parts.push(city);

  if (parts.length === 0) return null;

  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim() || null;
}

/**
 * AmenityFilter keys that match the listing's features JSON. Reuses the
 * same DTO/features substring rules that the route applies in
 * `lib/search/public-listing-db.ts`'s `applyPublicListingPostFilters` —
 * preserving semantic parity so a future reader switch doesn't change
 * which amenities a listing matches.
 *
 * Returns null when features is missing or no amenity matched.
 */
export function extractProjectionAmenityKeys(listing: ListingProjectionSource): string[] | null {
  const features = listing.features as Record<string, unknown> | null | undefined;
  if (!features) return null;

  const matched: string[] = [];
  for (const amenityKey of Object.keys(AMENITY_FIELD_MAP) as AmenityFilter[]) {
    const mapping = AMENITY_FIELD_MAP[amenityKey];
    const fields = mapping.field.split(",").map((f) => f.trim());
    const matchValues = mapping.values.map((v) => v.toLowerCase());

    const hit = fields.some((fieldName) => {
      const featValue = String(features[fieldName] || "").toLowerCase();
      if (!featValue) return false;
      if (amenityKey === "pet-friendly") {
        return !featValue.includes("no") || featValue.includes("catsok") || featValue.includes("dogsok");
      }
      return matchValues.some((mv) => featValue.includes(mv));
    });

    if (hit) matched.push(amenityKey);
  }

  return matched.length > 0 ? matched : null;
}

/**
 * Boolean flags about the listing record itself — distinct from amenity
 * keys (which describe building/unit attributes). Examples:
 *   - has_floorplan / has_video / has_virtual_tour from media[]
 *   - is_furnished / is_pet_friendly from features.Furnished/PetsAllowed
 *
 * Returns null when neither features nor media is populated.
 */
export function extractProjectionFeatureFlags(listing: ListingProjectionSource): Record<string, boolean> | null {
  const features = listing.features as Record<string, unknown> | null | undefined;
  const mediaRaw = listing.media;
  const flags: Record<string, boolean> = {};

  if (isMediaArray(mediaRaw)) {
    let hasFloorPlan = false;
    let hasVideo = false;
    let hasVirtualTour = false;
    for (const m of mediaRaw) {
      if (!m || typeof m !== "object") continue;
      const rec = m as Record<string, unknown>;
      const cat = String(rec.MediaCategory ?? rec.mediaType ?? "").toLowerCase();
      if (cat.includes("floor")) hasFloorPlan = true;
      else if (cat.includes("video")) hasVideo = true;
      else if (cat.includes("virtual")) hasVirtualTour = true;
    }
    flags.has_floorplan = hasFloorPlan;
    flags.has_video = hasVideo;
    flags.has_virtual_tour = hasVirtualTour;
  }

  if (features) {
    const furnished = String(features.Furnished ?? "").toLowerCase();
    flags.is_furnished = furnished === "furnished";

    const pets = String(features.PetsAllowed ?? "").toLowerCase();
    flags.is_pet_friendly = !!pets && (!pets.includes("no") || pets.includes("catsok") || pets.includes("dogsok"));
  }

  return Object.keys(flags).length > 0 ? flags : null;
}

/**
 * Build a complete `listing_search_projection` row from a Listing-shaped
 * input. Pure: same input → same output, no side effects, safe to call
 * inside test fixtures or sync loops.
 *
 * Distribution-gate fields are mirrored verbatim (null stays null) so a
 * future reader can fail-closed via the canonical evaluators in
 * `lib/search/listing-access-decision.ts`.
 */
export function buildListingSearchProjectionFromListing(
  listing: ListingProjectionSource,
): ListingSearchProjectionRow {
  const features = (listing.features || {}) as Record<string, unknown>;
  const address = (listing.address || {}) as Record<string, unknown>;

  // Bathrooms = full + half * 0.5; null when both are missing.
  const bathroomsFull = listing.bathrooms_full;
  const bathroomsHalf = listing.bathrooms_half;
  const bathrooms =
    bathroomsFull === null || bathroomsFull === undefined
      ? null
      : Number(bathroomsFull) + Number(bathroomsHalf || 0) * 0.5;

  const bedrooms = listing.bedrooms_total === null || listing.bedrooms_total === undefined
    ? null
    : Number(listing.bedrooms_total);

  const propertySubType = stringFrom(listing.property_sub_type);
  const isCommercial =
    !!stringFrom(listing.commercial_sub_type) ||
    (propertySubType !== null && COMMERCIAL_SUB_TYPES.has(propertySubType));
  const isNewDevelopment = propertySubType !== null && NEW_DEVELOPMENT_SUB_TYPES.has(propertySubType);
  // F13: a Mallan exclusive is identified by the SL-/RL- listing_id prefix OR
  // rls_eligible === false (website-only) — NEVER by agent_id, which
  // syncAgentHistory also stamps onto third-party IDX rows. Use the canonical
  // helper so this derivation cannot drift from the exclusive-attribution path.
  const isExclusive = isMallanExclusiveListing({
    listing_id: listing.listing_id,
    rls_eligible: listing.rls_eligible,
  });
  const isRental = listing.listing_type === "rent";

  return {
    listing_id: listing.listing_id,
    listing_key: stringFrom(features.ListingKey) ?? stringFrom(address.ListingKey) ?? null,
    source_system: stringFrom(features.SourceSystem) ?? stringFrom(features.SourceSystemKey) ?? null,
    mls_status: stringFrom(features.MlsStatus) ?? stringFrom(listing.status),
    listing_type: stringFrom(listing.listing_type),
    property_type: stringFrom(listing.property_type),
    property_sub_type: propertySubType,
    borough: stringFrom(listing.borough),
    neighborhood: stringFrom(listing.neighborhood),
    postal_code: stringFrom(listing.postal_code) ?? stringFrom(address.PostalCode),
    city: stringFrom(listing.city) ?? stringFrom(address.City),
    state: stringFrom(address.StateOrProvince) ?? stringFrom(address.State),
    list_price: bigintFrom(listing.list_price),
    bedrooms,
    bathrooms,
    living_area: numberFrom(listing.living_area),
    year_built: numberFrom(features.YearBuilt) ?? null,
    latitude: numberFrom(address.Latitude),
    longitude: numberFrom(address.Longitude),
    is_commercial: isCommercial,
    is_new_development: isNewDevelopment,
    is_exclusive: isExclusive,
    is_rental: isRental,
    rls_eligible: listing.rls_eligible !== false,
    idx_display_yn: listing.idx_display_yn ?? null,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn ?? null,
    internet_address_display_yn: listing.internet_address_display_yn ?? null,
    participant_only_yn: listing.participant_only ?? null,
    searchable_text: normalizeProjectionSearchText(listing),
    amenity_keys: extractProjectionAmenityKeys(listing),
    feature_flags: extractProjectionFeatureFlags(listing),
    modified_at: dateFrom(listing.modification_timestamp),
  };
}

// ── Prisma upsert payload builder ─────────────────────────────────────

/**
 * Convert a `Json?` field value into a Prisma-acceptable input. Strict
 * Prisma TypeScript types reject bare `null` for nullable Json columns —
 * the runtime value `Prisma.JsonNull` is the correct way to set the
 * column to SQL NULL on a `Json?` field.
 */
function jsonInput(
  value: string[] | Record<string, boolean> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export interface ListingSearchProjectionUpsertPayload {
  where: { listing_id: string };
  create: Prisma.ListingSearchProjectionCreateInput;
  update: Prisma.ListingSearchProjectionUpdateInput;
}

/**
 * Build the Prisma `upsert()` payload for a `listing_search_projection`
 * row. Pure: no DB, no Prisma client. The caller (lib/idx/sync.ts) passes
 * the result straight into `prisma.listingSearchProjection.upsert()`.
 *
 * `create` and `update` carry the same fields — every projection column
 * is fully derived from the source `Listing`, so an update cycle simply
 * overwrites every column. This guarantees no stale projection state
 * survives a Listing update.
 */
export function buildProjectionUpsertPayload(
  projection: ListingSearchProjectionRow,
): ListingSearchProjectionUpsertPayload {
  // The payload omits Prisma-managed fields (`id`, `created_at`,
  // `updated_at`) and the `listing` relation (write via the FK column).
  const data = {
    listing_id: projection.listing_id,
    listing_key: projection.listing_key,
    source_system: projection.source_system,
    mls_status: projection.mls_status,
    listing_type: projection.listing_type,
    property_type: projection.property_type,
    property_sub_type: projection.property_sub_type,
    borough: projection.borough,
    neighborhood: projection.neighborhood,
    postal_code: projection.postal_code,
    city: projection.city,
    state: projection.state,
    list_price: projection.list_price,
    bedrooms: projection.bedrooms,
    bathrooms: projection.bathrooms,
    living_area: projection.living_area,
    year_built: projection.year_built,
    latitude: projection.latitude,
    longitude: projection.longitude,
    is_commercial: projection.is_commercial,
    is_new_development: projection.is_new_development,
    is_exclusive: projection.is_exclusive,
    is_rental: projection.is_rental,
    rls_eligible: projection.rls_eligible,
    idx_display_yn: projection.idx_display_yn,
    internet_entire_listing_display_yn: projection.internet_entire_listing_display_yn,
    internet_address_display_yn: projection.internet_address_display_yn,
    participant_only_yn: projection.participant_only_yn,
    searchable_text: projection.searchable_text,
    amenity_keys: jsonInput(projection.amenity_keys),
    feature_flags: jsonInput(projection.feature_flags),
    modified_at: projection.modified_at,
  };

  return {
    where: { listing_id: projection.listing_id },
    // Cast to Prisma input types — the relation is satisfied by the
    // `listing_id` scalar FK; Prisma accepts that without requiring a
    // nested `listing.connect`.
    create: data as unknown as Prisma.ListingSearchProjectionCreateInput,
    update: data as unknown as Prisma.ListingSearchProjectionUpdateInput,
  };
}

// ── N2 write suppression — projection comparator ───────────────────────
//
// Root cause (T1 forensic, 2026-07-18): the sync dual-write called
// `listingSearchProjection.upsert()` unconditionally for EVERY processed
// record, rewriting identical rows (~3,856/day) — part of the 97%-unchanged
// UPDATE churn measured on Neon. N2 contract: the caller reads the existing
// projection row (PROJECTION_COMPARE_SELECT), compares EVERY column the
// upsert would write (`projectionRowUnchanged`), and SKIPS the upsert
// entirely when nothing differs — no `updated_at` bump, no WAL, no dead
// tuple. Any single-column difference still writes the full row exactly as
// before. Same doctrine as N1's `mediaRowUnchanged` in lib/idx/media-sync.ts.

/**
 * Prisma `select` for the existing-row read that feeds
 * `projectionRowUnchanged`. Mirrors the exact field list
 * `buildProjectionUpsertPayload` writes (minus `listing_id`, which is the
 * lookup key and can never differ). Keep the two in lock-step: a field
 * written but not selected/compared here would always read as "changed"
 * (fail-open to writing — correctness-safe, but defeats suppression).
 */
export const PROJECTION_COMPARE_SELECT = {
  listing_key: true,
  source_system: true,
  mls_status: true,
  listing_type: true,
  property_type: true,
  property_sub_type: true,
  borough: true,
  neighborhood: true,
  postal_code: true,
  city: true,
  state: true,
  list_price: true,
  bedrooms: true,
  bathrooms: true,
  living_area: true,
  year_built: true,
  latitude: true,
  longitude: true,
  is_commercial: true,
  is_new_development: true,
  is_exclusive: true,
  is_rental: true,
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  participant_only_yn: true,
  searchable_text: true,
  amenity_keys: true,
  feature_flags: true,
  modified_at: true,
} as const;

/**
 * Existing `listing_search_projection` row as returned by a Prisma
 * `findUnique({ select: PROJECTION_COMPARE_SELECT })`. JSON columns come
 * back as parsed values (`unknown` here); `list_price` is a JS bigint.
 */
export type ListingSearchProjectionCompareSnapshot = {
  [K in keyof typeof PROJECTION_COMPARE_SELECT]: K extends "amenity_keys" | "feature_flags"
    ? unknown
    : K extends "list_price"
      ? bigint | null
      : K extends "modified_at"
        ? Date | null
        : K extends "bedrooms" | "bathrooms" | "living_area" | "year_built" | "latitude" | "longitude"
          ? number | null
          : K extends
                | "is_commercial"
                | "is_new_development"
                | "is_exclusive"
                | "is_rental"
                | "rls_eligible"
            ? boolean
            : K extends
                  | "idx_display_yn"
                  | "internet_entire_listing_display_yn"
                  | "internet_address_display_yn"
                  | "participant_only_yn"
              ? boolean | null
              : string | null;
};

/**
 * Epoch-normalized nullable-timestamp equality (never Date identity): two
 * distinct Date instances at the same millisecond are equal; null equals
 * only null. Same rule as N1's `tsEqual` in lib/idx/media-sync.ts.
 */
function projectionTsEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/**
 * Deterministic JSON serialization: object keys sorted recursively so two
 * semantically-equal values stringify identically regardless of key order
 * (Postgres jsonb does not preserve object key order). Arrays keep their
 * order — element order is meaningful for `amenity_keys`.
 */
function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map((v) => stableJsonStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJsonStringify(obj[k])}`).join(",")}}`;
}

/**
 * Deep equality on normalized JSON — compares the value Prisma would store:
 * a JSON round-trip drops `undefined` members (undefined-vs-absent treated
 * consistently) and serializes Dates, then a stable stringify compares.
 * null equals only null.
 */
function projectionJsonEqual(existing: unknown, next: unknown): boolean {
  if (existing === null || existing === undefined) return next === null || next === undefined;
  if (next === null || next === undefined) return false;
  const normExisting: unknown = JSON.parse(JSON.stringify(existing));
  const normNext: unknown = JSON.parse(JSON.stringify(next));
  return stableJsonStringify(normExisting) === stableJsonStringify(normNext);
}

/**
 * N2 comparison contract — the projection row is "unchanged" iff EVERY
 * column `buildProjectionUpsertPayload` would write is already equal on the
 * existing row:
 *   - strings / booleans / numbers / bigint (`list_price`): strict `===`
 *     with null-safe handling (JS bigint compares by value);
 *   - `modified_at`: epoch equality, never Date identity;
 *   - `amenity_keys` / `feature_flags` (Json): deep equality on normalized
 *     JSON (the ROW value, before the `Prisma.JsonNull` sentinel mapping in
 *     `buildProjectionUpsertPayload` — DB null compares equal to row null).
 *
 * There are NO excluded bookkeeping columns on this table: `updated_at` is
 * Prisma-managed (never written explicitly, and not bumped when the upsert
 * is skipped) and `created_at`/`id` are insert-only.
 *
 * Exported for direct unit tests and for the caller in lib/idx/sync.ts.
 */
export function projectionRowUnchanged(
  existing: ListingSearchProjectionCompareSnapshot,
  projection: ListingSearchProjectionRow,
): boolean {
  return (
    existing.listing_key === projection.listing_key &&
    existing.source_system === projection.source_system &&
    existing.mls_status === projection.mls_status &&
    existing.listing_type === projection.listing_type &&
    existing.property_type === projection.property_type &&
    existing.property_sub_type === projection.property_sub_type &&
    existing.borough === projection.borough &&
    existing.neighborhood === projection.neighborhood &&
    existing.postal_code === projection.postal_code &&
    existing.city === projection.city &&
    existing.state === projection.state &&
    existing.list_price === projection.list_price &&
    existing.bedrooms === projection.bedrooms &&
    existing.bathrooms === projection.bathrooms &&
    existing.living_area === projection.living_area &&
    existing.year_built === projection.year_built &&
    existing.latitude === projection.latitude &&
    existing.longitude === projection.longitude &&
    existing.is_commercial === projection.is_commercial &&
    existing.is_new_development === projection.is_new_development &&
    existing.is_exclusive === projection.is_exclusive &&
    existing.is_rental === projection.is_rental &&
    existing.rls_eligible === projection.rls_eligible &&
    existing.idx_display_yn === projection.idx_display_yn &&
    existing.internet_entire_listing_display_yn === projection.internet_entire_listing_display_yn &&
    existing.internet_address_display_yn === projection.internet_address_display_yn &&
    existing.participant_only_yn === projection.participant_only_yn &&
    existing.searchable_text === projection.searchable_text &&
    projectionJsonEqual(existing.amenity_keys, projection.amenity_keys) &&
    projectionJsonEqual(existing.feature_flags, projection.feature_flags) &&
    projectionTsEqual(existing.modified_at, projection.modified_at)
  );
}

// ── H1 Tier-1 dual-write helper ────────────────────────────────────────

/**
 * Minimal PrismaClient surface this helper needs. Defined as a structural
 * type rather than `import { PrismaClient }` so callers passing the default
 * exported singleton (`@/lib/prisma`) work without a generic import dance,
 * and so the helper can be unit-tested with a small in-memory mock.
 */
export interface DualWriteProjectionPrisma {
  listing: {
    findUnique: (args: {
      where: { listing_id: string };
      select: Record<string, true>;
    }) => Promise<unknown>;
  };
  listingSearchProjection: {
    upsert: (args: ListingSearchProjectionUpsertPayload) => Promise<unknown>;
  };
}

/**
 * Idempotent dual-write of `listing_search_projection` from an existing
 * `listings` row.
 *
 * Use this AFTER any non-sync `prisma.listing.create` / `prisma.listing.upsert`
 * that doesn't already share the dual-write pattern in `lib/idx/sync.ts`.
 *
 * Behavior:
 *   - Reads the listing row by `listing_id`, builds the projection via the
 *     canonical `buildListingSearchProjectionFromListing` + `buildProjectionUpsertPayload`,
 *     upserts.
 *   - Idempotent: re-runs against an existing projection row are safe (upsert).
 *   - Silently no-ops if the listing was deleted between the caller's write
 *     and this call (returns without throwing).
 *   - Errors are NOT swallowed — callers wrap with try/catch if projection-
 *     write failure should not block the parent operation. Matches the same
 *     per-row failure semantics as `lib/idx/sync.ts`.
 *
 * H1 Tier-1 fix — closes the dual-write contract on 5 non-sync writers:
 *   - app/api/crm/convert/route.ts                (Lead → Listing convert)
 *   - app/api/cron/feed-reconcile/route.ts        (orphan-recovery cron)
 *   - app/api/idx/ensure-listing/route.ts         (on-demand listing create)
 *   - app/api/crm/listings/reset-sync/route.ts    (broker re-sync)
 *   - scripts/import-closed-from-trestle.ts       (closed-listing import)
 *
 * Uses the same canonical projection shape as `npm run ops:projection-backfill`
 * — never invents partial projection rows.
 */
export async function dualWriteProjectionForListingId(
  prisma: DualWriteProjectionPrisma,
  listingId: string,
): Promise<void> {
  const listing = (await prisma.listing.findUnique({
    where: { listing_id: listingId },
    select: {
      listing_id: true,
      status: true,
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
      rls_eligible: true,
      commercial_sub_type: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      participant_only: true,
      agent_id: true,
      modification_timestamp: true,
      address: true,
      features: true,
      media: true,
    },
  })) as Record<string, unknown> | null;

  if (!listing) return;

  const input: ListingProjectionSource = {
    listing_id: listing.listing_id as string,
    status: (listing.status as string | null | undefined) ?? null,
    listing_type: (listing.listing_type as string | null | undefined) ?? null,
    property_type: (listing.property_type as string | null | undefined) ?? null,
    property_sub_type: (listing.property_sub_type as string | null | undefined) ?? null,
    list_price: (listing.list_price as ListingProjectionSource["list_price"]) ?? null,
    bedrooms_total: (listing.bedrooms_total as number | null | undefined) ?? null,
    bathrooms_full: (listing.bathrooms_full as number | null | undefined) ?? null,
    bathrooms_half: (listing.bathrooms_half as number | null | undefined) ?? null,
    living_area: (listing.living_area as ListingProjectionSource["living_area"]) ?? null,
    borough: (listing.borough as string | null | undefined) ?? null,
    neighborhood: (listing.neighborhood as string | null | undefined) ?? null,
    city: (listing.city as string | null | undefined) ?? null,
    postal_code: (listing.postal_code as string | null | undefined) ?? null,
    rls_eligible: (listing.rls_eligible as boolean | null | undefined) ?? null,
    commercial_sub_type: (listing.commercial_sub_type as string | null | undefined) ?? null,
    idx_display_yn: (listing.idx_display_yn as boolean | null | undefined) ?? null,
    internet_entire_listing_display_yn:
      (listing.internet_entire_listing_display_yn as boolean | null | undefined) ?? null,
    internet_address_display_yn:
      (listing.internet_address_display_yn as boolean | null | undefined) ?? null,
    participant_only: (listing.participant_only as boolean | null | undefined) ?? null,
    agent_id: (listing.agent_id as bigint | number | null | undefined) ?? null,
    modification_timestamp:
      (listing.modification_timestamp as Date | string | null | undefined) ?? null,
    address: (listing.address as Record<string, unknown> | null | undefined) ?? {},
    features: (listing.features as Record<string, unknown> | null | undefined) ?? {},
    media: Array.isArray(listing.media) ? (listing.media as unknown[]) : [],
  };

  const projection = buildListingSearchProjectionFromListing(input);
  const payload = buildProjectionUpsertPayload(projection);
  await prisma.listingSearchProjection.upsert(payload);
}
