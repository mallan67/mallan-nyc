// lib/idx/sync.ts
// Orchestrator for IDX/Trestle sync pipeline.
// READ from Trestle, WRITE to local DB only. No data goes back to Trestle.

import prisma from "@/lib/prisma";
import { fetchFromTrestle, buildIncrementalFilter, buildActiveFilter } from "./fetch";
import { mapTrestleToPrisma, checkDistributionGates, validateRequiredFields } from "./trestle-mapper";
import { logIDXAccess, createAuditEntry } from "./logger";
import type { Prisma } from "@prisma/client";

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
  // Disable $expand=Media for large syncs (>200 records) to avoid Trestle timeouts.
  // Media will be batch-fetched separately after property sync.
  const useExpandMedia = maxRecords <= 200;

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

      // 3. Upsert to local DB
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
        },
      });

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
      const listingsNeedMedia = fetchResult.records
        .filter((r) => !Array.isArray(r.Media) || (r.Media as unknown[]).length === 0)
        .map((r) => String(r.ListingId || r.SourceSystemKey || ""));

      if (listingsNeedMedia.length > 0) {
        console.log(`[IDX Sync] Batch-fetching media for ${listingsNeedMedia.length} listings`);
        const { getAccessToken } = await import("./auth");
        const token = await getAccessToken();
        const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
        const BATCH_SIZE = 50;

        for (let i = 0; i < listingsNeedMedia.length; i += BATCH_SIZE) {
          const batch = listingsNeedMedia.slice(i, i + BATCH_SIZE).filter(Boolean);
          if (batch.length === 0) continue;

          const idFilter = batch.map((id) => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`).join(" or ");
          const mediaFilter = `(${idFilter}) and (Order le 3 or MediaCategory ne 'Photo')`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          mediaParams.set("$select", "ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN");
          mediaParams.set("$orderby", "ResourceRecordID asc,Order asc");
          mediaParams.set("$top", String(batch.length * 4));

          try {
            const res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            });
            if (!res.ok) continue;
            const data = await res.json();

            // Group media by listing ID
            const mediaByListing = new Map<string, { MediaURL: string; MediaCategory: string; Order: number }[]>();
            for (const m of data.value || []) {
              const lid = String(m.ResourceRecordID || "");
              if (!lid || !m.MediaURL) continue;
              if (!mediaByListing.has(lid)) mediaByListing.set(lid, []);
              mediaByListing.get(lid)!.push({
                MediaURL: String(m.MediaURL),
                MediaCategory: String(m.MediaCategory || "Photo"),
                Order: Number(m.Order ?? 0),
              });
            }

            // Update DB records with media
            for (const [listingId, media] of mediaByListing) {
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
 * Get the timestamp of the most recently synced listing.
 * Used for incremental sync.
 */
export async function getLastSyncTimestamp(): Promise<Date | null> {
  const latest = await prisma.listing.findFirst({
    where: {
      last_synced_from_trestle: { not: null },
    },
    orderBy: { last_synced_from_trestle: "desc" },
    select: { last_synced_from_trestle: true },
  });

  return latest?.last_synced_from_trestle ?? null;
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
