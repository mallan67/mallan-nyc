// lib/idx/sync.ts
// Orchestrator for IDX/Trestle sync pipeline.
// READ from Trestle, WRITE to local DB only. No data goes back to Trestle.

import prisma from "@/lib/prisma";
import { fetchFromTrestle, buildIncrementalFilter, buildActiveFilter, buildAgentHistoricalFilter } from "./fetch";
import { mapTrestleToPrisma, checkDistributionGates, validateRequiredFields, validateHistoricalFields } from "./trestle-mapper";
import { logIDXAccess, createAuditEntry } from "./logger";
import { computeDomTransition } from "@/lib/compliance/dom-tracker";
import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";
import type { Prisma } from "@prisma/client";

// Set of statuses treated as "actively listed" for first_active_date seeding.
// Must match DOM_ACCRUING_STATUSES in dom-tracker.ts.
const ACTIVE_SEED_STATUSES = new Set(["Active", "ActiveUnderContract", "Pending"]);

/**
 * Trestle raw record exposes Permission (singular) or legacy Permissions.
 * Read whichever is present; null if neither.
 */
function readTrestlePermissions(raw: Record<string, unknown>): string | null {
  if (typeof raw.Permission === "string") return raw.Permission;
  if (typeof raw.Permissions === "string") return raw.Permissions;
  return null;
}

export interface SyncOptions {
  /** Listing type to sync ("sale" | "rent" | undefined for both) */
  type?: "sale" | "rent";
  /** Only fetch records modified after this date */
  since?: Date;
  /** Maximum records to fetch (default 1000) */
  maxRecords?: number;
  /** Whether to do a full sync (ignore since) */
  fullSync?: boolean;
}

export interface SyncResult {
  total_fetched: number;
  upserted: number;
  skipped_gates: number;
  skipped_validation: number;
  errors: number;
  duration_ms: number;
}

/**
 * Sync listings from Trestle to local Prisma DB.
 * 1. Fetch from Trestle (paginated)
 * 2. For each record: validate → check gates → map → upsert
 * 3. Log everything for audit
 */
export async function syncListings(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const logger = createAuditEntry("fetch", "syncListings", "success");

  let filter: string;

  if (options.fullSync || !options.since) {
    // Full sync: fetch all active listings
    filter = buildActiveFilter(options.type);
  } else {
    // Incremental sync: only records modified since last sync
    filter = buildIncrementalFilter(options.since, options.type);
  }

  console.log(`[IDX Sync] Starting sync with filter: ${filter}`);

  const maxRecords = options.maxRecords || 1000;
  // PR-S.1c (2026-05-15): Trestle CONSISTENTLY rejects `$expand=Media` with
  // HTTP 400 regardless of result-set size. The previous conditional
  // (`maxRecords <= 200`) was a workaround for what was originally framed
  // as a "timeout for large batches" issue, but production logs show even
  // small batches 400 the same way. Media is fetched separately by the
  // `if (!useExpandMedia && upserted > 0)` batch-media block further down.
  const useExpandMedia = false;

  const fetchResult = await fetchFromTrestle({
    filter,
    maxTotal: maxRecords,
    expandMedia: useExpandMedia,
  });

  console.log(`[IDX Sync] Fetched ${fetchResult.totalFetched} records from Trestle`);

  let upserted = 0;
  let skippedGates = 0;
  let skippedValidation = 0;
  let errors = 0;

  for (const raw of fetchResult.records) {
    try {
      // 1. Validate required fields
      const validation = validateRequiredFields(raw);
      if (!validation.valid) {
        console.warn(
          `[IDX Sync] Skipping record (missing fields): ${validation.missingFields.join(", ")}`
        );
        skippedValidation++;
        continue;
      }

      // 2. Check distribution gates (still upsert but flag accordingly)
      const gates = checkDistributionGates(raw);

      // Map to Prisma shape
      const mapped = mapTrestleToPrisma(raw);

      // If gates fail, still store in DB but mark sync_status
      if (!gates.displayable) {
        mapped.sync_status = `gated:${gates.reason}`;
        skippedGates++;
      }

      // 3. Compute status-transition fields for retention + UCBA DOM tracking.
      //
      // WHY: The data-retention cron (T+24h IDX-off, T+30d media-null, T+180d
      // archive) filters on `status_changed_at`. If this field is NULL, the
      // listing is invisible to shedding and bloats the table forever. Prior
      // sync code never wrote this field, so every historical row has NULL
      // and every new status transition failed to record its timestamp.
      //
      // UCBA 2026 Art. I §11 also requires DOM accounting to respect the
      // 30-day reset, DOM-suppression for ComingSoon/Participant Only/Private
      // Permissions, and freezing on Sold/Rented. `computeDomTransition` in
      // lib/compliance/dom-tracker.ts encodes all of that; we delegate to it
      // whenever status changes so history is correct.
      const existing = await prisma.listing.findUnique({
        where: { listing_id: mapped.listing_id },
        select: {
          status: true,
          status_changed_at: true,
          first_active_date: true,
          days_on_market: true,
        },
      });

      const newPermissions = readTrestlePermissions(raw);
      let statusTransition: {
        status_changed_at?: Date;
        first_active_date?: Date | null;
        days_on_market?: number;
        cumulative_days_on_market?: number;
      } = {};

      if (existing && existing.status !== mapped.status) {
        // Status actually changed → compute DOM-aware transition.
        statusTransition = computeDomTransition(
          {
            status: existing.status,
            status_changed_at: existing.status_changed_at,
            first_active_date: existing.first_active_date,
            days_on_market: existing.days_on_market,
            permissions: null, // historical permissions not persisted; conservative
          },
          mapped.status,
          newPermissions,
        );
      } else if (existing && existing.status_changed_at === null) {
        // Same status but NULL timestamp (pre-Phase-1 legacy row). Don't
        // fabricate a transition date — leave it for the Phase 1 backfill
        // script (which uses modification_timestamp / last_synced_from_trestle
        // as the source of truth). If the backfill hasn't run yet, this row
        // stays stuck and will be picked up next sync after backfill.
      }

      // 4. Upsert to local DB
      await prisma.listing.upsert({
        where: { listing_id: mapped.listing_id },
        create: {
          ...mapped,
          list_price: mapped.list_price,
          living_area: mapped.living_area,
          address: mapped.address as Prisma.InputJsonValue,
          features: mapped.features as Prisma.InputJsonValue,
          media: mapped.media as Prisma.InputJsonValue,
          compliance: mapped.compliance as Prisma.InputJsonValue,
          agent_info: mapped.agent_info as Prisma.InputJsonValue,
          raw_data: mapped.raw_data as Prisma.InputJsonValue,
          // Seed status_changed_at on create so new listings are immediately
          // eligible for retention-cron age checks. first_active_date seeds
          // only when the initial status is one that would accrue DOM.
          status_changed_at: new Date(),
          first_active_date: ACTIVE_SEED_STATUSES.has(mapped.status)
            ? new Date()
            : null,
        },
        update: {
          mls_id: mapped.mls_id,
          status: mapped.status,
          listing_type: mapped.listing_type,
          property_type: mapped.property_type,
          property_sub_type: mapped.property_sub_type,
          list_price: mapped.list_price,
          bedrooms_total: mapped.bedrooms_total,
          bathrooms_full: mapped.bathrooms_full,
          bathrooms_half: mapped.bathrooms_half,
          living_area: mapped.living_area,
          borough: mapped.borough,
          neighborhood: mapped.neighborhood,
          city: mapped.city,
          postal_code: mapped.postal_code,
          idx_display_yn: mapped.idx_display_yn,
          internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
          internet_address_display_yn: mapped.internet_address_display_yn,
          participant_only: mapped.participant_only,
          owner_opt_out: mapped.owner_opt_out,
          address: mapped.address as Prisma.InputJsonValue,
          features: mapped.features as Prisma.InputJsonValue,
          media: mapped.media as Prisma.InputJsonValue,
          compliance: mapped.compliance as Prisma.InputJsonValue,
          agent_info: mapped.agent_info as Prisma.InputJsonValue,
          raw_data: mapped.raw_data as Prisma.InputJsonValue,
          modification_timestamp: mapped.modification_timestamp,
          listing_contract_date: mapped.listing_contract_date,
          last_synced_from_trestle: mapped.last_synced_from_trestle,
          sync_status: mapped.sync_status,
          // Status-transition fields (only populated when status actually
          // changed; empty object is a no-op for Prisma).
          ...statusTransition,
        },
      });

      // 5. Dual-write the search projection (master refactor PR 5B).
      // Sequential write — matches the existing per-listing upsert pattern.
      // No transaction: a projection-write failure leaves the Listing in
      // place; the next sync cycle will retry the projection upsert.
      // Errors share the same per-listing try/catch as the Listing upsert.
      const projectionInput: ListingProjectionSource = {
        listing_id: mapped.listing_id,
        status: mapped.status,
        listing_type: mapped.listing_type,
        property_type: mapped.property_type,
        property_sub_type: mapped.property_sub_type,
        list_price: mapped.list_price,
        bedrooms_total: mapped.bedrooms_total,
        bathrooms_full: mapped.bathrooms_full,
        bathrooms_half: mapped.bathrooms_half,
        living_area: mapped.living_area,
        borough: mapped.borough,
        neighborhood: mapped.neighborhood,
        city: mapped.city,
        postal_code: mapped.postal_code,
        // Trestle-sourced rows are RLS-eligible by definition; the
        // `commercial_sub_type` column is only used for our CRM-authored
        // website-only commercial listings, never for Trestle data.
        rls_eligible: true,
        commercial_sub_type: null,
        idx_display_yn: mapped.idx_display_yn,
        internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
        internet_address_display_yn: mapped.internet_address_display_yn,
        participant_only: mapped.participant_only,
        // Trestle-sourced rows don't bind to one of our agents.
        agent_id: null,
        modification_timestamp: mapped.modification_timestamp,
        address: mapped.address as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        media: mapped.media as unknown[],
      };
      const projection = buildListingSearchProjectionFromListing(projectionInput);
      const projectionPayload = buildProjectionUpsertPayload(projection);
      await prisma.listingSearchProjection.upsert(projectionPayload);

      upserted++;
    } catch (err) {
      errors++;
      const listingId = String(raw.ListingId || raw.SourceSystemKey || "unknown");
      console.error(`[IDX Sync] Error upserting listing ${listingId}:`, err);
    }
  }

  // ── Batch-fetch media for listings that didn't get inline media ──
  // When $expand=Media was disabled (large syncs), fetch photos separately
  // and update DB records. Uses Trestle Media endpoint (separate quota: 18K req/hr).
  if (!useExpandMedia && upserted > 0) {
    try {
      // Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
      // NOT ResourceRecordID (can duplicate). Property.ListingKey = Media.ResourceRecordKey.
      const listingsNeedMediaRaw = fetchResult.records
        .filter((r) => !Array.isArray(r.Media) || (r.Media as unknown[]).length === 0);
      const keyToIdMap = new Map<string, string>();
      const listingsNeedMedia: string[] = [];
      for (const r of listingsNeedMediaRaw) {
        const listingKey = String(r.ListingKey || r.SourceSystemKey || "");
        const listingId = String(r.ListingId || listingKey);
        if (listingKey) {
          keyToIdMap.set(listingKey, listingId);
          listingsNeedMedia.push(listingKey);
        } else if (listingId) {
          keyToIdMap.set(listingId, listingId);
          listingsNeedMedia.push(listingId);
        }
      }

      if (listingsNeedMedia.length > 0) {
        console.log(`[IDX Sync] Batch-fetching media for ${listingsNeedMedia.length} listings`);
        const { getAccessToken } = await import("./auth");
        const token = await getAccessToken();
        const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
        // BATCH_SIZE = 15 keeps the Trestle OData URL under ~1,000 chars.
        // 50 produced URLs of ~2,700 chars which Trestle rejects with 400
        // Bad Request (verified 2026-04-24 against live feed). Diagnosed when
        // the media-backfill cron was returning 0 updates despite the cron
        // firing successfully — every batch silently 400'd.
        const BATCH_SIZE = 15;

        for (let i = 0; i < listingsNeedMedia.length; i += BATCH_SIZE) {
          const batch = listingsNeedMedia.slice(i, i + BATCH_SIZE).filter(Boolean);
          if (batch.length === 0) continue;

          const idFilter = batch.map((key) => `ResourceRecordKey eq '${key.replace(/'/g, "''")}'`).join(" or ");
          // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
          const mediaFilter = `(${idFilter}) and MediaStatus ne 'Deleted'`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          mediaParams.set("$select", "ResourceRecordKey,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus");
          mediaParams.set("$orderby", "ResourceRecordKey asc,Order asc");
          mediaParams.set("$top", String(batch.length * 30));

          try {
            const _mc = new AbortController();
            const _mt = setTimeout(() => _mc.abort(), 15_000);
            let res: Response;
            try {
              res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                signal: _mc.signal,
              });
            } finally { clearTimeout(_mt); }
            if (!res.ok) continue;
            const data = await res.json();

            // Group media by ResourceRecordKey — normalize to {url, mediaType, order} for display adapter
            const mediaByListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
            for (const m of data.value || []) {
              const lid = String(m.ResourceRecordKey || "");
              if (!lid || !m.MediaURL) continue;
              if (!mediaByListing.has(lid)) mediaByListing.set(lid, []);
              // Use shared classifier — replaces the broken
              // `cat.includes("floor plan")` (with space) check that
              // mis-classified Trestle's actual "FloorPlan" enum value as
              // "Photo". See lib/media/media-sync-service.ts for the full
              // history of this bug.
              const mediaType = classifyTrestleMediaCategory(m.MediaCategory as string | null | undefined);
              const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
              mediaByListing.get(lid)!.push({
                url: String(m.MediaURL),
                mediaType,
                order: isPreferred ? -1 : Number(m.Order ?? 0),
              });
            }

            // Update DB records — convert ResourceRecordKey back to listing_id via map
            for (const [key, media] of mediaByListing) {
              const listingId = keyToIdMap.get(key) || key;
              await prisma.listing.updateMany({
                where: { listing_id: listingId },
                data: { media: media as unknown as Prisma.InputJsonValue },
              });
            }
          } catch (mediaErr) {
            console.warn(`[IDX Sync] Media batch ${i / BATCH_SIZE + 1} failed:`, mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }
        console.log("[IDX Sync] Media batch-fetch complete");
      }
    } catch (mediaSyncErr) {
      console.warn("[IDX Sync] Media sync failed (non-fatal):", mediaSyncErr instanceof Error ? mediaSyncErr.message : mediaSyncErr);
    }
  }

  const durationMs = Date.now() - startTime;

  // Audit log
  logger.durationMs = durationMs;
  logIDXAccess({
    ...logger,
    resultStatus: errors > 0 ? "error" : "success",
    errorMessage: errors > 0 ? `${errors} errors during sync` : undefined,
  });

  // Also log to AuditEvent table
  try {
    await prisma.auditEvent.create({
      data: {
        action: "idx_sync",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          type: options.type || "all",
          fullSync: options.fullSync || false,
          total_fetched: fetchResult.totalFetched,
          upserted,
          skipped_gates: skippedGates,
          skipped_validation: skippedValidation,
          errors,
          duration_ms: durationMs,
        },
      },
    });
  } catch (err) {
    console.error("[IDX Sync] Failed to log audit event:", err);
  }

  // ── Watermark ownership (fix for homepage "last updated" staleness) ──
  // The UI at /api/idx/watermark and lib/idx/watermark.ts reads
  // SyncState.last_watermark + last_run_at. If sync never writes this row,
  // the UI shows a frozen date (observed 2026-04-23: homepage "Data last
  // updated: February 11, 2026" while idx-sync ran every 15 min).
  //
  // Every successful sync run now upserts SyncState. Watermark = the
  // highest ModificationTimestamp we actually saw in this batch; falls
  // back to now() if the batch was empty.
  try {
    const now = new Date();
    let batchWatermark = now;
    // Advance the watermark using max(ModificationTimestamp, PhotosChangeTimestamp)
    // per record. The incremental cursor at buildIncrementalFilter() now ORs the
    // two fields, so the watermark must reflect both — otherwise the next pass
    // would re-fetch every row whose PCT advanced past the (MT-only) watermark.
    // Single-column SyncState.last_watermark; no schema change.
    for (const r of fetchResult.records) {
      const mt = r.ModificationTimestamp ? new Date(String(r.ModificationTimestamp)) : null;
      const pct = r.PhotosChangeTimestamp ? new Date(String(r.PhotosChangeTimestamp)) : null;
      for (const cand of [mt, pct]) {
        if (cand && !Number.isNaN(cand.getTime()) && cand > batchWatermark) batchWatermark = cand;
      }
    }
    // On empty batches, advance last_run_at but leave last_watermark alone —
    // the UI surfaces last_watermark as the "data updated" date. Preserving
    // it on empty runs avoids jumping forward when nothing actually changed.
    const advanceWatermark = fetchResult.records.length > 0;
    await prisma.syncState.upsert({
      where: { resource: "Property" },
      create: {
        resource: "Property",
        last_watermark: batchWatermark,
        last_run_at: now,
        last_run_status: errors > 0 ? "error" : "ok",
        last_run_duration_ms: durationMs,
        rows_upserted: upserted,
        rows_skipped_by_gate: skippedGates,
        rows_with_errors: errors,
      },
      update: {
        ...(advanceWatermark ? { last_watermark: batchWatermark } : {}),
        last_run_at: now,
        last_run_status: errors > 0 ? "error" : "ok",
        last_run_duration_ms: durationMs,
        rows_upserted: upserted,
        rows_skipped_by_gate: skippedGates,
        rows_with_errors: errors,
      },
    });
  } catch (err) {
    console.error("[IDX Sync] Failed to update SyncState watermark:", err);
    // Non-fatal — sync already succeeded; watermark-write failure degrades
    // UI freshness display only.
  }

  const result: SyncResult = {
    total_fetched: fetchResult.totalFetched,
    upserted,
    skipped_gates: skippedGates,
    skipped_validation: skippedValidation,
    errors,
    duration_ms: durationMs,
  };

  console.log("[IDX Sync] Complete:", result);

  return result;
}

/**
 * Backfill media for listings with empty media arrays.
 * Queries DB for listings with media='[]' or null, then batch-fetches
 * their photos from Trestle Media endpoint.
 * Called after sync or independently via cron/API.
 */
export async function backfillEmptyMedia(options?: { limit?: number }): Promise<{ checked: number; updated: number; errors: number }> {
  const limit = options?.limit ?? 200;

  // Find listings needing media backfill.
  //
  // Matches (eligibility expanded 2026-05-08 — Layer 2 of the
  // PhotosChangeTimestamp gap fix; see Layer 0 audit results in
  // memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md):
  //   - NULL media
  //   - empty array `[]`
  //   - empty object `{}`
  //   - ANY object-shaped media (legacy malformed rows where the mapper
  //     wrote a summary `{PhotosCount: N, ...}` instead of a photo array —
  //     see trestle-mapper.ts line 690 comments for the root-cause story)
  //   - empty-string edge case
  //   - non-empty media arrays with ZERO Photo entries (FloorPlan-only,
  //     Video-only, VirtualTour-only — pre-Fix-#1 these rendered the wrong
  //     hero; post-Fix-#1 they render the placeholder; either way the
  //     row needs a Photo refetch when the broker uploads)
  //   - rows where Trestle's PhotosChangeTimestamp is newer than our DB
  //     modification_timestamp (Cotality routinely bumps PCT without
  //     bumping MT — empirical 18,411-row drift audit on 2026-05-08).
  //     The new media array overwrites the stale one in the same upsert.
  //
  // The `jsonb_typeof(media) != 'array'` clause catches the object-shaped
  // malformed data. Without it, 8,082+ production rows with
  // `media: {PhotosCount: ...}` would never trigger backfill and would
  // keep rendering as "No Photo" on the site.
  const listings = await prisma.$queryRaw<{ listing_id: string; mls_id: string | null }[]>`
    SELECT listing_id, mls_id FROM "listings"
    WHERE (
        media IS NULL
        OR jsonb_typeof(media) != 'array'
        OR jsonb_array_length(media) = 0
        OR (
          jsonb_typeof(media) = 'array'
          AND jsonb_array_length(media) > 0
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(media) elem
            WHERE LOWER(COALESCE(elem->>'mediaType', '')) IN ('photo', 'image', '')
          )
        )
        OR (
          raw_data ? 'PhotosChangeTimestamp'
          AND NULLIF(raw_data->>'PhotosChangeTimestamp', '') IS NOT NULL
          AND modification_timestamp IS NOT NULL
          AND (raw_data->>'PhotosChangeTimestamp')::timestamp > modification_timestamp
        )
      )
      AND sync_status IS DISTINCT FROM 'gated:owner_opt_out'
      AND sync_status IS DISTINCT FROM 'gated:participant_only'
    ORDER BY modification_timestamp DESC NULLS LAST
    LIMIT ${limit}
  `;

  if (listings.length === 0) {
    console.log("[Media Backfill] No listings with empty media found");
    return { checked: 0, updated: 0, errors: 0 };
  }

  console.log(`[Media Backfill] Found ${listings.length} listings with empty media`);

  const { getAccessToken } = await import("./auth");
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    console.error("[Media Backfill] Failed to get Trestle token");
    return { checked: listings.length, updated: 0, errors: 1 };
  }

  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  // BATCH_SIZE = 15 keeps the Trestle OData URL under ~1,000 chars.
  // 50 produced URLs of ~2,700 chars which Trestle rejects with 400
  // Bad Request (verified 2026-04-24 against live feed).
  const BATCH_SIZE = 15;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    // Trestle guidance: use ResourceRecordKey (always unique), not ResourceRecordID (can duplicate across MLOs).
    // mls_id = ListingKey = Media.ResourceRecordKey. Fall back to listing_id → ResourceRecordID if mls_id is null.
    const keyToId = new Map<string, string>();
    const filterParts: string[] = [];
    for (const l of batch) {
      if (l.mls_id) {
        filterParts.push(`ResourceRecordKey eq '${l.mls_id.replace(/'/g, "''")}'`);
        keyToId.set(l.mls_id, l.listing_id);
      } else if (l.listing_id) {
        filterParts.push(`ResourceRecordID eq '${l.listing_id.replace(/'/g, "''")}'`);
        keyToId.set(l.listing_id, l.listing_id);
      }
    }
    if (filterParts.length === 0) continue;

    // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
    const mediaFilter = `(${filterParts.join(" or ")}) and MediaStatus ne 'Deleted'`;
    const mediaParams = new URLSearchParams();
    mediaParams.set("$filter", mediaFilter);
    mediaParams.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus");
    mediaParams.set("$orderby", "Order asc");
    mediaParams.set("$top", String(filterParts.length * 30));

    try {
      const res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(`[Media Backfill] Batch ${i / BATCH_SIZE + 1} failed: ${res.status} ${res.statusText}`);
        errors++;
        continue;
      }
      const data = await res.json();

      // Group by listing_id directly by trying BOTH ResourceRecordKey and
      // ResourceRecordID on every response row. Previously this code preferred
      // ResourceRecordKey and then ran `keyToId.get(key) || key` — which
      // silently failed when mls_id was null (we'd query by ResourceRecordID
      // but Trestle's response had ResourceRecordKey as the preferred first
      // key, so lookup returned undefined and we'd default to the numeric
      // ResourceRecordKey as listing_id — never matching any DB row).
      // Confirmed 2026-04-24: thousands of listings with mls_id=null were
      // being re-written with `[]` on every cron pass.
      const mediaByListingId = new Map<string, { url: string; mediaType: string; order: number }[]>();
      for (const m of data.value || []) {
        const byRRK = String(m.ResourceRecordKey || "");
        const byRRID = String(m.ResourceRecordID || "");
        const listingId = keyToId.get(byRRK) || keyToId.get(byRRID);
        if (!listingId || !m.MediaURL) continue;
        if (!mediaByListingId.has(listingId)) mediaByListingId.set(listingId, []);
        // Use shared classifier — see classifyTrestleMediaCategory in
        // lib/media/media-sync-service.ts for the floor-plan-as-photo bug
        // this replaces.
        const mediaType = classifyTrestleMediaCategory(m.MediaCategory as string | null | undefined);
        const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
        mediaByListingId.get(listingId)!.push({
          url: String(m.MediaURL),
          mediaType,
          order: isPreferred ? -1 : Number(m.Order ?? 0),
        });
      }

      for (const [listingId, media] of mediaByListingId) {
        try {
          await prisma.listing.updateMany({
            where: { listing_id: listingId },
            data: { media: media as unknown as Prisma.InputJsonValue },
          });
          updated++;
        } catch {
          errors++;
        }
      }
    } catch (err) {
      console.warn(`[Media Backfill] Batch error:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`[Media Backfill] Complete: checked=${listings.length}, updated=${updated}, errors=${errors}`);
  return { checked: listings.length, updated, errors };
}

/**
 * Migrate Trestle media URLs → R2 permanent URLs.
 *
 * Finds DB listings whose media still points at Trestle (cotality.com / corelogic.com),
 * downloads each photo, uploads to R2, and updates the DB record.
 *
 * After migration, those photos load directly from R2 CDN — no more proxy round-trips.
 * Runs after backfillEmptyMedia in the media-backfill cron.
 */
export async function migrateMediaToR2(options?: { limit?: number }): Promise<{ checked: number; migrated: number; errors: number }> {
  const { hasR2Config } = await import("@/lib/images/r2");
  if (!hasR2Config()) {
    return { checked: 0, migrated: 0, errors: 0 };
  }

  const limit = options?.limit ?? 50;

  // Find listings with Trestle media URLs (not yet cached to R2)
  const listings = await prisma.$queryRaw<{ id: bigint; listing_id: string; media: unknown }[]>`
    SELECT id, listing_id, media FROM "listings"
    WHERE media IS NOT NULL AND media::text != '[]' AND media::text != '{}'
      AND (media::text LIKE '%cotality.com%' OR media::text LIKE '%corelogic.com%')
    ORDER BY modification_timestamp DESC NULLS LAST
    LIMIT ${limit}
  `;

  if (listings.length === 0) {
    return { checked: 0, migrated: 0, errors: 0 };
  }

  console.log(`[R2 Migration] Found ${listings.length} listings with Trestle media URLs`);

  const { getAccessToken } = await import("./auth");
  const { uploadToR2, existsInR2, getR2PublicUrl } = await import("@/lib/images/r2");

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    console.error("[R2 Migration] Failed to get Trestle token");
    return { checked: listings.length, migrated: 0, errors: 1 };
  }

  const TRESTLE_HOSTS = ["cotality.com", "corelogic.com"];
  const MAX_CONCURRENT = 5;
  let migrated = 0;
  let errors = 0;

  for (const listing of listings) {
    const mediaArr = Array.isArray(listing.media) ? (listing.media as Record<string, unknown>[]) : [];
    if (mediaArr.length === 0) continue;

    let changed = false;
    const updatedMedia = [...mediaArr];

    // Process photos in small batches to avoid overwhelming R2/Trestle
    for (let i = 0; i < updatedMedia.length; i += MAX_CONCURRENT) {
      const batch = updatedMedia.slice(i, i + MAX_CONCURRENT);
      await Promise.allSettled(batch.map(async (m, batchIdx) => {
        const rawUrl = String(m.url || m.MediaURL || "");
        if (!rawUrl || !TRESTLE_HOSTS.some(h => rawUrl.includes(h))) return;

        // Classify mediaType through shared canonical classifier — handles
        // both DB-shape (mediaType) and Trestle-shape (MediaCategory) inputs
        // and recognises every "FloorPlan" variant the writer-side bug had
        // missed. Combined with buildMediaR2Key-style namespace routing:
        // Photo→photos/, FloorPlan→floorplans/, Video→videos/,
        // VirtualTour→virtualtours/. Prevents Photo Order=N and FloorPlan
        // Order=N from colliding on the same R2 key.
        const mediaType = classifyTrestleMediaCategory((m.mediaType ?? m.MediaCategory) as string | null | undefined);
        const order = Number(m.order ?? m.Order ?? batchIdx);
        const safe = listing.listing_id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const folder =
          mediaType === "FloorPlan" ? "floorplans" :
          mediaType === "Video" ? "videos" :
          mediaType === "VirtualTour" ? "virtualtours" :
          "photos";
        const key = `${folder}/${safe}/${order}.jpg`;

        try {
          // Skip if already in R2
          if (await existsInR2(key)) {
            updatedMedia[i + batchIdx] = { ...m, url: getR2PublicUrl(key), MediaURL: undefined };
            changed = true;
            return;
          }

          // Download from Trestle
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 8_000);
          let resp: Response;
          try {
            resp = await fetch(rawUrl, {
              headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
              signal: controller.signal,
            });
          } finally {
            clearTimeout(tid);
          }
          if (!resp.ok) return;

          const buffer = Buffer.from(await resp.arrayBuffer());
          const contentType = resp.headers.get("content-type") || "image/jpeg";
          await uploadToR2(key, buffer, contentType);

          // Swap to R2 URL in the media array
          updatedMedia[i + batchIdx] = { ...m, url: getR2PublicUrl(key), MediaURL: undefined };
          changed = true;
        } catch {
          // Non-fatal — keep original Trestle URL for this photo
        }
      }));
    }

    if (changed) {
      try {
        await prisma.listing.updateMany({
          where: { listing_id: listing.listing_id },
          data: { media: updatedMedia as unknown as Prisma.InputJsonValue },
        });
        migrated++;
      } catch {
        errors++;
      }
    }
  }

  console.log(`[R2 Migration] Complete: checked=${listings.length}, migrated=${migrated}, errors=${errors}`);
  return { checked: listings.length, migrated, errors };
}

/**
 * Get the cursor timestamp for the next incremental sync.
 *
 * Returns MAX(Listing.modification_timestamp) — the row's Trestle
 * `ModificationTimestamp` (mapped in `trestle-mapper.ts:949-951`),
 * NOT `last_synced_from_trestle` (which is set to `new Date()` at
 * upsert time — local clock, not the Trestle row clock).
 *
 * Why this matters (2026-05-15 — Codex review of PR #138):
 *
 * The cron route passes this value as `since` to `syncListings`,
 * which builds a Trestle OData filter `ModificationTimestamp gt SINCE`.
 * If SINCE is the local clock at the last upsert, a CAPPED batch
 * (PR-S.5 capped scheduled runs at 500 records) silently advances
 * SINCE to local NOW after processing only 500 records, and any
 * records 501..N in the same backlog window — whose actual Trestle
 * `ModificationTimestamp` is older than NOW — are then EXCLUDED by
 * the next run's `MT gt SINCE` filter. Permanent data loss for the
 * unprocessed tail of every capped catch-up.
 *
 * Using `modification_timestamp` instead means the cursor advances
 * only as far as the newest Trestle MT we actually processed in
 * this run. The next run picks up from there — records with MTs
 * strictly between the previous cursor and that high-water mark
 * have been upserted; records with MTs above the high-water mark
 * remain visible to the next run. Lossless catch-up.
 *
 * Pre-existing field — no schema change. `Listing.modification_timestamp`
 * is populated on every upsert in this file (sync.ts:221) and on every
 * agent-history upsert (sync.ts:923) from `mapped.modification_timestamp`,
 * which `mapTrestleToPrisma` (trestle-mapper.ts:949-951) sets from
 * `raw.ModificationTimestamp` (the Trestle row clock).
 *
 * `last_synced_from_trestle` is retained on the Listing model and
 * still populated at upsert time on Trestle-sourced rows. It is now
 * ALSO used as the FILTER predicate to restrict the cursor query to
 * Trestle-synced rows only — see PR-S.7 follow-up below.
 *
 * PR-S.7 (2026-05-15 follow-up to PR-S.6):
 *
 * PR #140 (PR-S.6) switched the cursor from MAX(last_synced_from_trestle)
 * to MAX(modification_timestamp) to fix the Codex-identified local-clock
 * drift on capped runs. But that fix alone is incomplete: the Listing
 * table contains rows from MULTIPLE writers, not just the Trestle sync
 * path. Specifically, `app/api/crm/convert/route.ts:224` creates
 * CRM-only listings with `modification_timestamp: new Date()` and
 * leaves `last_synced_from_trestle` NULL (they were never synced from
 * Trestle — they're website-only listings). If any such row is the
 * newest by modification_timestamp, MAX(modification_timestamp) over
 * the full table picks up local NOW and the Trestle incremental
 * filter (MT gt SINCE) skips legitimate Trestle records.
 *
 * Fix: restrict the cursor query to rows where
 * `last_synced_from_trestle IS NOT NULL`. That filter selects ONLY
 * Trestle-sync writers (sync.ts:223 and sync.ts:925 both set
 * `last_synced_from_trestle: mapped.last_synced_from_trestle`, which
 * mapTrestleToPrisma always populates from `new Date()` at the time
 * of the Trestle fetch). CRM-only writers like
 * app/api/crm/convert/route.ts NEVER set the column, so their rows
 * are excluded from the MAX.
 *
 * The where clause IS valid here because `last_synced_from_trestle`
 * is `DateTime?` (nullable) at schema.prisma:546 — Prisma accepts
 * `{ not: null }` on nullable columns. `modification_timestamp` is
 * `DateTime` (non-nullable) at schema.prisma:550 — that's where a
 * `{ not: null }` filter would be a TypeScript error and is omitted.
 *
 * `findFirst` returns `null` when no row matches (e.g. a fresh DB
 * with no Trestle sync yet) — the caller handles that via `?? null`.
 */
export async function getLastSyncTimestamp(): Promise<Date | null> {
  const latest = await prisma.listing.findFirst({
    where: {
      last_synced_from_trestle: { not: null },
    },
    orderBy: { modification_timestamp: "desc" },
    select: { modification_timestamp: true },
  });

  return latest?.modification_timestamp ?? null;
}

// ═══════════════════════════════════════════════════════════
// AGENT HISTORICAL SYNC
// Pull Sold/Rented/Expired/Hold/Withdrawn for a specific agent
// ═══════════════════════════════════════════════════════════

export interface AgentHistorySyncOptions {
  /** The agent's MLS ID or state license number to search Trestle by */
  agentMlsId: string;
  /** The agent's DB id (BigInt) — set on imported listings for roster matching */
  agentDbId: bigint;
  /** Listing type to sync ("sale" | "rent" | undefined for both) */
  type?: "sale" | "rent";
  /** Maximum records to fetch (default 2000) */
  maxRecords?: number;
}

export interface AgentHistorySyncResult extends SyncResult {
  /** Number of listings matched to agent */
  agent_matched: number;
}

/**
 * Sync an agent's historical listings from Trestle.
 * Pulls Closed, Expired, Hold (Temp Off), Withdrawn (Perm Off) by agent MLS ID.
 * Links imported listings to the agent's DB record via agent_id.
 */
export async function syncAgentHistory(
  options: AgentHistorySyncOptions
): Promise<AgentHistorySyncResult> {
  const startTime = Date.now();
  const logger = createAuditEntry("fetch", "syncAgentHistory", "success");

  const filter = buildAgentHistoricalFilter(options.agentMlsId, options.type);

  console.log(`[IDX Agent History] Starting sync for agent ${options.agentMlsId} with filter: ${filter}`);

  const maxRecords = options.maxRecords || 2000;
  // PR-S.1c (2026-05-15): see `syncListings()` above — `$expand=Media` is
  // consistently rejected by Trestle. Media is fetched separately.
  const useExpandMedia = false;

  const fetchResult = await fetchFromTrestle({
    filter,
    maxTotal: maxRecords,
    expandMedia: useExpandMedia,
    // Sort by CloseDate desc to get most recent closings first
    orderby: "ModificationTimestamp desc",
  });

  console.log(`[IDX Agent History] Fetched ${fetchResult.totalFetched} records from Trestle`);

  let upserted = 0;
  let skippedGates = 0;
  let skippedValidation = 0;
  let errors = 0;
  let agentMatched = 0;

  for (const raw of fetchResult.records) {
    try {
      // 1. Validate required fields (relaxed for historical/closed listings)
      const validation = validateHistoricalFields(raw);
      if (!validation.valid) {
        console.warn(
          `[IDX Agent History] Skipping record (missing fields): ${validation.missingFields.join(", ")}`
        );
        skippedValidation++;
        continue;
      }

      // 2. Check distribution gates (still upsert but flag accordingly)
      const gates = checkDistributionGates(raw);

      // Map to Prisma shape
      const mapped = mapTrestleToPrisma(raw);

      if (!gates.displayable) {
        mapped.sync_status = `gated:${gates.reason}`;
        skippedGates++;
      }

      // 3. Upsert to local DB — SET agent_id to link to agent's DB record
      await prisma.listing.upsert({
        where: { listing_id: mapped.listing_id },
        create: {
          ...mapped,
          agent_id: options.agentDbId,
          list_price: mapped.list_price,
          living_area: mapped.living_area,
          address: mapped.address as Prisma.InputJsonValue,
          features: mapped.features as Prisma.InputJsonValue,
          media: mapped.media as Prisma.InputJsonValue,
          compliance: mapped.compliance as Prisma.InputJsonValue,
          agent_info: mapped.agent_info as Prisma.InputJsonValue,
          raw_data: mapped.raw_data as Prisma.InputJsonValue,
        },
        update: {
          agent_id: options.agentDbId,
          mls_id: mapped.mls_id,
          status: mapped.status,
          listing_type: mapped.listing_type,
          property_type: mapped.property_type,
          property_sub_type: mapped.property_sub_type,
          list_price: mapped.list_price,
          bedrooms_total: mapped.bedrooms_total,
          bathrooms_full: mapped.bathrooms_full,
          bathrooms_half: mapped.bathrooms_half,
          living_area: mapped.living_area,
          borough: mapped.borough,
          neighborhood: mapped.neighborhood,
          city: mapped.city,
          postal_code: mapped.postal_code,
          idx_display_yn: mapped.idx_display_yn,
          internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
          internet_address_display_yn: mapped.internet_address_display_yn,
          participant_only: mapped.participant_only,
          owner_opt_out: mapped.owner_opt_out,
          address: mapped.address as Prisma.InputJsonValue,
          features: mapped.features as Prisma.InputJsonValue,
          media: mapped.media as Prisma.InputJsonValue,
          compliance: mapped.compliance as Prisma.InputJsonValue,
          agent_info: mapped.agent_info as Prisma.InputJsonValue,
          raw_data: mapped.raw_data as Prisma.InputJsonValue,
          modification_timestamp: mapped.modification_timestamp,
          listing_contract_date: mapped.listing_contract_date,
          last_synced_from_trestle: mapped.last_synced_from_trestle,
          sync_status: mapped.sync_status,
        },
      });

      // 4. Dual-write the search projection (master refactor PR 5B).
      // Same sequential pattern as syncListings(); per-listing try/catch
      // already wraps both writes. agent_id is set so the projection
      // marks the row is_exclusive: true.
      const projectionInput: ListingProjectionSource = {
        listing_id: mapped.listing_id,
        status: mapped.status,
        listing_type: mapped.listing_type,
        property_type: mapped.property_type,
        property_sub_type: mapped.property_sub_type,
        list_price: mapped.list_price,
        bedrooms_total: mapped.bedrooms_total,
        bathrooms_full: mapped.bathrooms_full,
        bathrooms_half: mapped.bathrooms_half,
        living_area: mapped.living_area,
        borough: mapped.borough,
        neighborhood: mapped.neighborhood,
        city: mapped.city,
        postal_code: mapped.postal_code,
        // Trestle-sourced rows are RLS-eligible by definition; the
        // `commercial_sub_type` column is only used for our CRM-authored
        // website-only commercial listings, never for Trestle data.
        rls_eligible: true,
        commercial_sub_type: null,
        idx_display_yn: mapped.idx_display_yn,
        internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
        internet_address_display_yn: mapped.internet_address_display_yn,
        participant_only: mapped.participant_only,
        agent_id: options.agentDbId,
        modification_timestamp: mapped.modification_timestamp,
        address: mapped.address as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        media: mapped.media as unknown[],
      };
      const projection = buildListingSearchProjectionFromListing(projectionInput);
      const projectionPayload = buildProjectionUpsertPayload(projection);
      await prisma.listingSearchProjection.upsert(projectionPayload);

      upserted++;
      agentMatched++;
    } catch (err) {
      errors++;
      const listingId = String(raw.ListingId || raw.SourceSystemKey || "unknown");
      console.error(`[IDX Agent History] Error upserting listing ${listingId}:`, err);
    }
  }

  // ── Batch-fetch media for listings without inline media ──
  if (!useExpandMedia && upserted > 0) {
    try {
      // Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
      // NOT ResourceRecordID (can duplicate). Property.ListingKey = Media.ResourceRecordKey.
      const listingsNeedMediaRaw = fetchResult.records
        .filter((r) => !Array.isArray(r.Media) || (r.Media as unknown[]).length === 0);
      const agentKeyToIdMap = new Map<string, string>();
      const listingsNeedMedia: string[] = [];
      for (const r of listingsNeedMediaRaw) {
        const listingKey = String(r.ListingKey || r.SourceSystemKey || "");
        const listingId = String(r.ListingId || listingKey);
        if (listingKey) {
          agentKeyToIdMap.set(listingKey, listingId);
          listingsNeedMedia.push(listingKey);
        } else if (listingId) {
          agentKeyToIdMap.set(listingId, listingId);
          listingsNeedMedia.push(listingId);
        }
      }

      if (listingsNeedMedia.length > 0) {
        console.log(`[IDX Agent History] Batch-fetching media for ${listingsNeedMedia.length} listings`);
        const { getAccessToken } = await import("./auth");
        const token = await getAccessToken();
        const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
        // BATCH_SIZE = 15 keeps the Trestle OData URL under ~1,000 chars.
        // 50 produced URLs of ~2,700 chars which Trestle rejects with 400
        // Bad Request (verified 2026-04-24 against live feed). Diagnosed when
        // the media-backfill cron was returning 0 updates despite the cron
        // firing successfully — every batch silently 400'd.
        const BATCH_SIZE = 15;

        for (let i = 0; i < listingsNeedMedia.length; i += BATCH_SIZE) {
          const batch = listingsNeedMedia.slice(i, i + BATCH_SIZE).filter(Boolean);
          if (batch.length === 0) continue;

          const idFilter = batch.map((key) => `ResourceRecordKey eq '${key.replace(/'/g, "''")}'`).join(" or ");
          // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
          const mediaFilter = `(${idFilter}) and MediaStatus ne 'Deleted'`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          mediaParams.set("$select", "ResourceRecordKey,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus");
          mediaParams.set("$orderby", "ResourceRecordKey asc,Order asc");
          mediaParams.set("$top", String(batch.length * 30));

          try {
            const _mc = new AbortController();
            const _mt = setTimeout(() => _mc.abort(), 15_000);
            let res: Response;
            try {
              res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                signal: _mc.signal,
              });
            } finally { clearTimeout(_mt); }
            if (!res.ok) continue;
            const data = await res.json();

            const mediaByKey = new Map<string, { url: string; mediaType: string; order: number }[]>();
            for (const m of data.value || []) {
              const lid = String(m.ResourceRecordKey || "");
              if (!lid || !m.MediaURL) continue;
              if (!mediaByKey.has(lid)) mediaByKey.set(lid, []);
              // Use shared classifier — see classifyTrestleMediaCategory in
              // lib/media/media-sync-service.ts for the floor-plan-as-photo
              // bug this replaces.
              const mediaType = classifyTrestleMediaCategory(m.MediaCategory as string | null | undefined);
              const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
              mediaByKey.get(lid)!.push({
                url: String(m.MediaURL),
                mediaType,
                order: isPreferred ? -1 : Number(m.Order ?? 0),
              });
            }

            // Convert ResourceRecordKey back to listing_id via map
            for (const [key, media] of mediaByKey) {
              const listingId = agentKeyToIdMap.get(key) || key;
              await prisma.listing.updateMany({
                where: { listing_id: listingId },
                data: { media: media as unknown as Prisma.InputJsonValue },
              });
            }
          } catch (mediaErr) {
            console.warn(`[IDX Agent History] Media batch ${i / BATCH_SIZE + 1} failed:`, mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }
        console.log("[IDX Agent History] Media batch-fetch complete");
      }
    } catch (mediaSyncErr) {
      console.warn("[IDX Agent History] Media sync failed (non-fatal):", mediaSyncErr instanceof Error ? mediaSyncErr.message : mediaSyncErr);
    }
  }

  const durationMs = Date.now() - startTime;

  // Audit log
  logger.durationMs = durationMs;
  logIDXAccess({
    ...logger,
    resultStatus: errors > 0 ? "error" : "success",
    errorMessage: errors > 0 ? `${errors} errors during agent history sync` : undefined,
  });

  try {
    await prisma.auditEvent.create({
      data: {
        action: "idx_sync_agent_history",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          agentMlsId: options.agentMlsId,
          agentDbId: options.agentDbId.toString(),
          type: options.type || "all",
          total_fetched: fetchResult.totalFetched,
          upserted,
          agent_matched: agentMatched,
          skipped_gates: skippedGates,
          skipped_validation: skippedValidation,
          errors,
          duration_ms: durationMs,
        },
      },
    });
  } catch (err) {
    console.error("[IDX Agent History] Failed to log audit event:", err);
  }

  const result: AgentHistorySyncResult = {
    total_fetched: fetchResult.totalFetched,
    upserted,
    agent_matched: agentMatched,
    skipped_gates: skippedGates,
    skipped_validation: skippedValidation,
    errors,
    duration_ms: durationMs,
  };

  console.log("[IDX Agent History] Complete:", result);

  return result;
}

/**
 * Get sync statistics for the status endpoint.
 */
export async function getSyncStats(): Promise<{
  totalListings: number;
  syncedListings: number;
  lastSyncAt: Date | null;
  byStatus: Record<string, number>;
}> {
  const [totalListings, syncedListings, lastSync, statusCounts] =
    await Promise.all([
      prisma.listing.count(),
      prisma.listing.count({
        where: { sync_status: "synced" },
      }),
      getLastSyncTimestamp(),
      prisma.listing.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) {
    byStatus[row.status] = row._count.status;
  }

  return {
    totalListings,
    syncedListings,
    lastSyncAt: lastSync,
    byStatus,
  };
}
