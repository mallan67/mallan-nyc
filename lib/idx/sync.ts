// lib/idx/sync.ts
// Orchestrator for IDX/Trestle sync pipeline.
// READ from Trestle, WRITE to local DB only. No data goes back to Trestle.

import prisma from "@/lib/prisma";
import { fetchFromTrestle, buildIncrementalFilter, buildActiveFilter, buildAgentHistoricalFilter, PROPERTY_KEYSET_ORDERBY } from "./fetch";
import { advanceCursor, type CursorRow } from "./cursor/keyset-cursor";
import { mapTrestleToPrisma, checkDistributionGates, validateRequiredFields, validateHistoricalFields } from "./trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { logIDXAccess, createAuditEntry } from "./logger";
// SHARED OData media page-follower — the SAME completeness contract
// media-sync uses. Reused, never re-implemented: two pagination loops
// would be two opinions about what "complete" means.
import { paginateMedia } from "./media-sync";
// ONE definition of what expires on a publicly-visible listing change —
// shared with the normalized media-summary writer so they cannot drift.
import { publicListingChangeTags } from "@/lib/cache/public-listing-change-tags";
import { computeDomTransition } from "@/lib/compliance/dom-tracker";
import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  projectionRowMateriallyEqual,
  projectionRowSearchVisiblyEqual,
  PROJECTION_MATERIAL_SELECT,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";
import {
  LISTING_SYNC_COMPARE_SELECT,
  listingUpdateMateriallyUnchanged,
  classifyListingChangeReasons,
  changedRawDataMaterialKeys,
  isProvenanceOnlyChange,
  mediaArraysMateriallyEqual,
  newWritePathCounters,
  newListingChangeReasonCounters,
  newProjectionChangeReasonCounters,
  type WritePathCounters,
  type ListingChangeReasonCounters,
  type ProjectionChangeReasonCounters,
} from "./write-suppression";
import {
  SEARCH_CACHE_TAG,
  listingCacheTag,
  buildingInvalidationTags,
  manifestShardForAddress,
  manifestShardTag,
  newRevalidationCounters,
  safeRevalidateTags,
  type RevalidationCounters,
} from "@/lib/cache/public-cache";
import {
  warmBuildingManifestShards,
  probeManifestPersistence,
  type ManifestWarmResult,
  type ManifestPersistenceProbe,
} from "@/lib/buildings/public-building-data";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";
import {
  SYNC_DIAGNOSTIC_DEDUPE_ACTIONS,
  beginSyncDiagnosticRun,
  bufferSyncDiagnostic,
  flushSyncDiagnostics,
  type DiagnosticAuditWriter,
} from "./diagnostic-recorder";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { ACTIVE_DISPLAY_VALUES } from "@/lib/compliance/status";
import type { Prisma } from "@prisma/client";

// Set of statuses treated as "actively listed" for first_active_date seeding.
// Must match DOM_ACCRUING_STATUSES in dom-tracker.ts.
const ACTIVE_SEED_STATUSES = new Set(["Active", "ActiveUnderContract", "Pending"]);

/**
 * Statuses for which we CREATE a brand-new listing row. Incremental sync returns
 * EVERY modified record feed-wide, so without this guard the DB accumulates listings
 * that arrive already terminal/off-market and were NEVER active on our site.
 * Verified 2026-07-05: 88,967 of 90,280 Closed rows had first_active_date=NULL (never
 * displayed), ~82K ingested in a single month — pure bloat that grew every sync.
 * We only store listings we actually display + their in-flight states. An EXISTING row
 * is never skipped, so a real Active->terminal transition still records + hides (§2.05).
 */
const CREATABLE_NEW_STATUSES = new Set(["Active", "ActiveUnderContract", "ComingSoon", "Pending"]);

/**
 * True when a record is a BRAND-NEW listing (not already in our DB) arriving in a
 * non-creatable (terminal/off-market) status — we must NOT create it (feed-wide closure
 * bloat). Existing rows always return false so their transitions still persist. Exported
 * for unit tests.
 */
export function shouldSkipNewTerminalListing(existing: unknown, status: string): boolean {
  return !existing && !CREATABLE_NEW_STATUSES.has(status);
}

/**
 * RC2 — media-stomp guard for the per-record listing UPDATE.
 *
 * The incremental idx-sync fetches Property WITHOUT expanded Media
 * (`useExpandMedia = false`), so `mapped.media` is `[]`. Writing that on the
 * UPDATE branch would WIPE existing `listings.media`. Media is never permanently
 * lost (Cotality is the source), but the app must stop continuously overwriting
 * its own local media with empty arrays. So: only write `media` on UPDATE when it
 * was actually fetched/expanded; otherwise OMIT it (preserve existing media — the
 * separate batch-media path at sync.ts owns the refill). CREATE is unaffected (a
 * new listing has no existing media to preserve).
 */
export function mediaUpdatePatch(
  media: unknown,
  mediaWasFetched: boolean,
): { media?: Prisma.InputJsonValue } {
  // Only write media on UPDATE when it was actually fetched/expanded. When the
  // incremental sync ran without expanded Media, OMIT media so existing
  // listings.media is preserved (the batch-media path owns the refill).
  return mediaWasFetched ? { media: media as Prisma.InputJsonValue } : {};
}

/**
 * S1 (#445 Codex P1) — never overwrite `listings.compliance` on a Trestle UPDATE.
 *
 * The mapper no longer copies the redundant Trestle compliance JSON (it emits
 * `{}` — see trestle-mapper.ts), and the column is RETAINED for CRM/syndication-
 * authored keys (`validation_result`, approval keys) written directly by those
 * routes. Writing the mapper's `{}` on UPDATE would STOMP those authored keys
 * (and, before this change, the old Trestle copy stomped them too). So OMIT
 * `compliance` on UPDATE entirely — the existing DB value (authored or legacy)
 * is preserved. CREATE is unaffected: a new Trestle row has no authored
 * compliance and gets the schema default `{}` (or the mapper's `{}`).
 *
 * Mirrors `mediaUpdatePatch`: spread the result into the UPDATE object so the
 * compliance key is simply absent on update (existing value preserved).
 */
export function complianceUpdatePatch(): Record<string, never> {
  return {};
}

/** The sync_status the T+180 archiver writes (lib/retention/archive-terminals.ts). */
export const ARCHIVED_SYNC_STATUS = "archived";

/**
 * Gate 6 durability — archived-row rehydration guard (board #415).
 *
 * Once the T+180 archiver (lib/retention/archive-terminals.ts) has stripped a terminal listing
 * (raw_data→JSON null, media→[], compliance→{}, sync_status='archived'), a later Cotality re-emit
 * hitting the per-record UPDATE branch would re-hydrate raw_data + media and overwrite sync_status
 * back off 'archived' — silently UN-archiving the row. Because `archiveEligibilityWhere` keys on
 * `sync_status: { not: 'archived' }`, that un-archived row then re-enters the nightly retention drain
 * and is re-stripped: strip → rehydrate → re-strip churn.
 *
 * Guard: when the EXISTING row is archived and the re-emit is NOT an active display status, DROP
 * raw_data, media, and sync_status from the Cotality UPDATE payload so the archiver's one-way strip
 * is preserved verbatim. Other columns (status / idx_display_yn / timestamps) may still update —
 * for terminal re-emits they do not re-expose the row (terminal rows stay idx_display_yn=false via
 * the mapper's terminal gate). Non-archived rows (and CREATEs, where `existing` is null) are
 * returned unchanged — normal sync rehydration. Pure and non-mutating: returns a NEW object when
 * guarding.
 *
 * Codex #465 follow-up (2026-07-01) — ACTIVE re-emit must UNARCHIVE, not display-while-stripped:
 * when Cotality re-emits an archived listing with an ACTIVE display status, the mapper computes
 * is_terminal=false → idx_display_yn can be true, and status flows through this guard. Freezing
 * the blobs in that case produced a publicly displayable row with permanently stripped
 * raw_data/media (archivedSafeMediaWhere then blocks the batch refill because sync_status stays
 * 'archived'). A back-on-market listing is a GENUINE unarchive, not churn: the full update flows,
 * sync_status leaves 'archived' (the per-record UPDATE runs before the batch media writers in the
 * same run, so the refill's DB filter matches again) and raw_data rehydrates.
 *
 * Codex #465 round 2 — EXACT canonical match, not the alias-tolerant normalizer: the mapper
 * persists the RAW StandardStatus string into `status`, and the public/projection search filters
 * (buildSearchDisplayWhere → ACTIVE_DISPLAY_VALUES) match only the canonical DB values
 * ('Active' / 'ActiveUnderContract' / 'ComingSoon'). Unarchiving an alias form (e.g.
 * "Active Under Contract") would rehydrate a row that public search still hides — an
 * unarchived-but-invisible zombie. So the unarchive verdict must equal the search-visibility
 * verdict: exact membership in ACTIVE_DISPLAY_VALUES. (Live feed emits the canonical no-space
 * values — verified 2026-07-01: `ComingSoon`; same lesson as the historical `Coming Soon`
 * sitemap bug, app/sitemap.ts:88-92.)
 *
 * Codex #465 round 3 — the NON-unarchive branch must ALSO freeze the display/clock fields:
 * for a non-terminal, non-canonical re-emit (Pending, alias forms, trimmed/cased variants) the
 * mapper can compute a displayable (truthy) idx_display_yn, and the listing DETAIL page gates through
 * isListingDisplayable() rather than the exact search filter — so letting status/idx_display_yn
 * through would render the still-archived, blob-stripped row on a direct listing URL. When the
 * row stays archived, the guard therefore drops status, idx_display_yn, and terminal_since too:
 * the row keeps its stored terminal status + idx_display_yn=false (written at T+24h/archive
 * time) and its archive clock. Watermark fields (modification_timestamp,
 * last_synced_from_trestle) still flow — freezing them would stall the sync cursor on archived
 * re-emits. Net semantic: an archived row is IMMUTABLE for display purposes; the ONLY exit is
 * the exact canonical-active unarchive above, after which it re-enters archive eligibility only
 * once terminal again for T+180 days. Fail-closed (§J.7): terminal, unknown, alias, and absent
 * statuses keep the one-way strip.
 */
const UNARCHIVE_STATUSES: ReadonlySet<string> = new Set<string>(ACTIVE_DISPLAY_VALUES);

export function guardArchivedRehydration<T extends Record<string, unknown>>(
  update: T,
  existing: { sync_status?: string | null } | null | undefined,
): T {
  if (existing?.sync_status !== ARCHIVED_SYNC_STATUS) return update;
  // Explicit unarchive: the feed says the listing is back on market AND the
  // persisted status will actually match the public search filters. Let the
  // full update flow so the row leaves 'archived' and can rehydrate legitimately.
  if (typeof update.status === "string" && UNARCHIVE_STATUSES.has(update.status)) return update;
  // Staying archived: omit the stripped blobs AND the display/clock fields
  // (destructure-rest, no delete — matches the agent_info omit pattern).
  const {
    raw_data: _rawData,
    media: _media,
    sync_status: _syncStatus,
    status: _status,
    idx_display_yn: _idxDisplayYn,
    terminal_since: _terminalSince,
    ...rest
  } = update;
  // Codex #465 r4 — force idx_display_yn:false rather than merely omitting it.
  // Omission would PRESERVE a stale stored true (the T+180 archiver does not
  // write this column, and the T+24h cleanup only flips rows with an old
  // non-null status_changed_at), and the detail route gates via
  // isListingDisplayable() which checks the display gates, not terminal
  // status — so a stripped archived row could stay publicly reachable by
  // direct listing_id. Writing false on every non-unarchive re-emit
  // self-heals any such stale state. Fail closed.
  return { ...rest, idx_display_yn: false } as unknown as T;
}

/**
 * Where-clause for the SEPARATE post-upsert batch media refill (#415 rehydration guard, media path).
 *
 * useExpandMedia is hard-coded false in both sync paths, so the per-record upsert OMITS media
 * (mediaUpdatePatch) and media is instead written later by a batch `listing.updateMany` — which
 * guardArchivedRehydration does NOT cover. A re-emitted archived row (media=[]) would otherwise have
 * its media re-hydrated in the same run, and retention then skips it (sync_status='archived'). Adding
 * the archived exclusion at the DB filter means the media write matches 0 rows for an archived
 * listing, so its stripped media is preserved. Archived protection differs by
 * path, so be exact about which one this guard is:
 *
 *   - THIS guard covers the four surviving `Listing.media` JSON writers in this
 *     file, via an explicit `sync_status IS DISTINCT FROM 'archived'` filter.
 *   - Third-party/feed `listing_media` -> R2 admission is archived-excluded
 *     EFFECTIVELY, not by sync_status: `buildR2MirrorPolicyMediaWhere()` joins
 *     `listing: buildSearchDisplayWhere()`, which requires an active display
 *     status, and an archived row is terminal + idx_display_yn=false.
 *   - Mallan-owned R2 admission (`buildMallanOwnedListingWhere()`) keys only on
 *     SL-/RL- prefix or rls_eligible=false, with NO active/archive restriction.
 *     Latent only: that population is currently 0.
 *
 * media-sync references `sync_status` nowhere — but that is a statement about
 * MECHANISM, not about eligibility. Do not read it as absence of protection.
 *
 * NULL-safe (Codex #465 P2): `sync_status: { not: 'archived' }` alone compiles to `sync_status <> 'archived'`,
 * which is NULL (not TRUE) for legacy rows where sync_status IS NULL — silently excluding them from a
 * legitimate media refill. Excluding ONLY 'archived' requires an explicit NULL branch, so NULL and every
 * non-archived value are allowed while archived stays protected. (Mirrors the SQL `IS DISTINCT FROM
 * 'archived'` form, which is already NULL-safe.)
 */
export function archivedSafeMediaWhere(listingId: string): Prisma.ListingWhereInput {
  return {
    listing_id: listingId,
    OR: [
      { sync_status: null },
      { sync_status: { not: ARCHIVED_SYNC_STATUS } },
    ],
  };
}

/**
 * Trestle raw record exposes Permission (singular) or legacy Permissions.
 * Read whichever is present; null if neither.
 */
function readTrestlePermissions(raw: Record<string, unknown>): string | null {
  if (typeof raw.Permission === "string") return raw.Permission;
  if (typeof raw.Permissions === "string") return raw.Permissions;
  return null;
}

// ── IDX-sync diagnostic AuditEvent helpers ──────────────────────────
//
// Why this exists (2026-05-15): on 2026-05-15 the IDX cron entered a
// state where it returned HTTP 200 every 10 min but the SyncState
// watermark stayed frozen at 09:11:45 UTC. The original Prisma error
// that triggered this drift was logged to stderr (`console.error`) but
// aged out of Vercel's ~24h log retention before it could be captured.
// Without a persistent record of error code / Prisma meta / failing
// table, the root cause was unreachable.
//
// These two helpers (`extractErrorDetails`, `recordSyncDiagnostic`)
// persist the next natural failure into the existing `audit_events`
// table so the same error becomes inspectable via Prisma queries long
// after the Vercel log buffer rotates. Two-year retention is enforced
// by the existing data-retention cron — no schema change, no new table.
//
// Both helpers are diagnostic-only and best-effort. They MUST NEVER
// throw, alter sync behavior, or block the surrounding catch path.
function extractErrorDetails(err: unknown): {
  error_name: string;
  error_message: string;
  prisma_code?: string;
  prisma_meta?: unknown;
  stack_excerpt?: string;
} {
  if (err && typeof err === "object") {
    const e = err as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      meta?: unknown;
      stack?: unknown;
    };
    const out: {
      error_name: string;
      error_message: string;
      prisma_code?: string;
      prisma_meta?: unknown;
      stack_excerpt?: string;
    } = {
      error_name: typeof e.name === "string" ? e.name : "UnknownError",
      error_message:
        typeof e.message === "string"
          ? e.message.slice(0, 2000)
          : String(err).slice(0, 2000),
    };
    if (typeof e.code === "string") out.prisma_code = e.code;
    if (e.meta !== undefined && e.meta !== null) {
      try {
        out.prisma_meta = JSON.parse(JSON.stringify(e.meta));
      } catch {
        out.prisma_meta = String(e.meta).slice(0, 500);
      }
    }
    if (typeof e.stack === "string") {
      out.stack_excerpt = e.stack.split("\n").slice(0, 5).join("\n").slice(0, 800);
    }
    return out;
  }
  return {
    error_name: "UnknownError",
    error_message: String(err).slice(0, 2000),
  };
}

async function recordSyncDiagnostic(
  action: string,
  entity_type: string,
  entity_id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  // High-volume system diagnostics (the allowlist) are deduped + capped:
  // buffer in-memory now (synchronous, no DB round-trip in the hot loop) and
  // flush a capped set + one summary at end of the run (flushSyncDiagnostics).
  // FAIL-SAFE: any action NOT on the allowlist is written through immediately
  // below, full-retained — human / compliance / security / §2.05 / Trestle /
  // portal audit events never reach this helper and are never deduped.
  if (SYNC_DIAGNOSTIC_DEDUPE_ACTIONS.has(action)) {
    bufferSyncDiagnostic(action, entity_type, entity_id, changes);
    return;
  }
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        entity_type,
        entity_id,
        user_type: "system",
        user_id: null,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  } catch (diagnosticErr) {
    // Best-effort only. A diagnostic-write failure must never crash
    // the sync. We still console.error so the failure is at least
    // visible in the live log stream even if the audit row didn't land.
    console.error(
      `[IDX Sync] Failed to write diagnostic AuditEvent (${action}):`,
      diagnosticErr,
    );
  }
}

export interface SyncOptions {
  /** Listing type to sync ("sale" | "rent" | undefined for both) */
  type?: "sale" | "rent";
  /** Only fetch records modified after this date */
  since?: Date;
  /**
   * Keyset tie-breaker: ListingKey of the last fully-processed record AT
   * `since`. Paired with `since` it forms a strict total order over
   * (ModificationTimestamp, ListingKey), which a scalar timestamp cannot
   * express across a same-timestamp cluster larger than `maxRecords`
   * (production carries a 797-row cluster; the scheduled cap is 500).
   * `null`/omitted degrades to plain `MT gt since` — the pre-keyset behaviour.
   */
  sinceListingKey?: string | null;
  /** Maximum records to fetch (default 1000) */
  maxRecords?: number;
  /** Whether to do a full sync (ignore since) */
  fullSync?: boolean;
}

/**
 * Phase 3 write-suppression — per-write-path physical counters.
 * `listings` = the per-record Listing upsert; `projections` = the
 * listing_search_projection dual-write; `batch_media` = the legacy
 * listings.media JSON batch refill inside the same run.
 */
export interface SyncWritePaths {
  listings: WritePathCounters;
  projections: WritePathCounters;
  batch_media: WritePathCounters;
  /**
   * One Cycle W1 — sync-driven cache revalidation accounting. The SAME run
   * that materially changed data refreshes the anonymous public cache:
   * `listing:{id}` per materially-changed listing (+ one coarse `search`
   * bump per run when anything changed). Failures never fail the sync.
   */
  revalidation: RevalidationCounters;
  /**
   * Building-Neon-wake clustering: bounded manifest-shard refills run
   * immediately after a FULLY SUCCESSFUL sync, while the compute is already
   * awake — never scattered across the autosuspend window. Scope B
   * (2026-07-24): ONLY the shards whose listings physically changed this
   * run are warmed; null = warm skipped (run had errors, or zero
   * manifest-affecting shards changed).
   */
  building_manifest_warm?: ManifestWarmResult | null;
  /**
   * Scope A (2026-07-24): cross-request persistence instrument. Runs at the
   * START of the run — BEFORE this run revalidates any tags — so it
   * verifies whether the PREVIOUS run's warm actually survived request
   * teardown. cache_hits = persisted (zero Neon); live_fills = lost (one
   * bounded refill each). null = probe failed.
   */
  manifest_canary?: ManifestPersistenceProbe | null;
  /** Change-reason attribution for physical listing writes (2026-07-24). */
  listing_change_reasons?: ListingChangeReasonCounters;
  /** Projection write attribution: source_timestamp_only rows are SKIPPED
   *  (scope D); search_visible_fields rows are written. */
  projection_change_reasons?: ProjectionChangeReasonCounters;
  /** The manifest shards eagerly warmed this run (sorted). */
  affected_manifest_shards?: string[];
}

export interface SyncResult {
  total_fetched: number;
  /**
   * PHYSICAL listing writes this run (rows_inserted + rows_updated).
   * Phase 3: materially-unchanged records are suppressed and no longer
   * counted here — see write_paths for full accounting.
   */
  upserted: number;
  skipped_gates: number;
  skipped_validation: number;
  /** New listings NOT created because they arrived terminal/off-market and we never
   *  tracked them (root-cause guard against feed-wide closure bloat). */
  skipped_new_terminal?: number;
  /** Up to 25 sample listing_ids the guard prevented from being created this run — for
   *  investigation if the invariant is ever violated. */
  skipped_new_terminal_sample?: string[];
  errors: number;
  duration_ms: number;
  /** Phase 3 write-suppression accounting (physical writes only). */
  write_paths: SyncWritePaths;
}

/**
 * Cross-run carrier for the manifest shards the LAST run warmed, stored as
 * compact JSON in `SyncState.notes` (a previously-unwritten free-text
 * column — NO schema change). The next run's persistence canary probes
 * EXACTLY this set and nothing else (Maya review of #561: an all-shard
 * probe under a global invalidation would live-fill every never-warmed
 * shard, recreating broad scheduled reads under the name "canary").
 */
const SYNC_NOTES_WARMED_SHARDS_KEY = "manifest_warmed_shards";

export function serializeWarmedShardsToNotes(shards: readonly string[]): string {
  return JSON.stringify({ [SYNC_NOTES_WARMED_SHARDS_KEY]: [...shards] });
}

/** Fail-quiet parse: missing/malformed/legacy notes → [] (probe nothing —
 *  the canary is an instrument, never a warm). */
export function parseWarmedShardsFromNotes(notes: string | null | undefined): string[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    const shards = parsed?.[SYNC_NOTES_WARMED_SHARDS_KEY];
    if (!Array.isArray(shards)) return [];
    return shards.filter((s): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return [];
  }
}

/**
 * ONE owner for "a publicly-visible listing change happened — expire what
 * depends on it".
 *
 * WHY THIS EXISTS
 * ---------------
 * Building-manifest payloads carry public photo state (`primary_photo_url`), so
 * a MEDIA change can alter a building payload with no material Listing
 * source-field write at all. The invalidation logic previously lived only inside
 * the Listing-write branch, so media-only changes expired the listing tag but
 * never the building or manifest-shard tags.
 *
 * That coupling was invisible while every PCT movement forced a Listing write.
 * Suppressing that write (7B-2B) would have exposed it as a stale-manifest bug —
 * a cost saving paid for with a correctness regression. Fixing the coupling
 * FIRST is what makes the write suppression safe.
 *
 * `changedCacheTags` and `affectedManifestShards` are Sets, so repeated calls in
 * one cycle (e.g. an address change AND a media change on the same listing)
 * dedupe naturally and no invalidation is lost.
 *
 * `previousAddress` may be undefined for a media-only change: a media change
 * never moves a listing between buildings, so only the current address matters
 * and no extra query is performed to invent a transition.
 */
function recordPublicListingChange(
  listingId: string,
  previousAddress: unknown,
  nextAddress: unknown,
  changedCacheTags: Set<string>,
  affectedManifestShards: Set<string>,
): void {
  const { tags, shards } = publicListingChangeTags(listingId, previousAddress, nextAddress);
  for (const t of tags) changedCacheTags.add(t);
  for (const sh of shards) affectedManifestShards.add(sh);
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
  // Scope this run's diagnostic buffer to the current async context so
  // concurrent syncListings invocations (cron + the manual /api/idx/sync
  // route) never share state (Codex #444). Flushed at end of run.
  beginSyncDiagnosticRun();
  const startTime = Date.now();
  const logger = createAuditEntry("fetch", "syncListings", "success");

  // Scope A (2026-07-24, scope corrected per Maya review of #561):
  // persistence canary — MUST run before ANYTHING in this request
  // revalidates a tag, and probes ONLY the shards the PREVIOUS run actually
  // warmed (read from SyncState.notes — see the upsert below). Probing the
  // all-shard default here would recreate broad scheduled reads: under a
  // global invalidation, every never-warmed shard would live-fill on probe.
  // An empty/unknown previous set probes NOTHING (zero queries) — the
  // canary is an instrument, never a warm. Cache-hit probes cost zero
  // Neon; a lost page costs one bounded read that itself refills the page.
  // Best-effort — never blocks the sync.
  let manifestCanary: ManifestPersistenceProbe | null = null;
  try {
    const prevState = await prisma.syncState.findUnique({
      where: { resource: "Property" },
      select: { notes: true },
    });
    const prevWarmedShards = parseWarmedShardsFromNotes(prevState?.notes);
    manifestCanary = await probeManifestPersistence(prevWarmedShards);
    console.log("[IDX Sync] manifest persistence canary:", {
      probed_shards: prevWarmedShards,
      ...manifestCanary,
    });
  } catch (canaryErr) {
    console.error("[IDX Sync] manifest canary failed (non-fatal):", canaryErr);
    manifestCanary = null;
  }

  let filter: string;

  // Keyset traversal applies to the INCREMENTAL path only. A full sync uses
  // buildActiveFilter (no cursor at all), so it keeps the module default
  // ordering — there is no resume position for ASC to protect.
  const incremental = !(options.fullSync || !options.since);

  // ── WHO MAY MOVE THE GLOBAL PROPERTY CURSOR ──────────────────────────────
  //
  // `sync_state.Property.{last_watermark,last_listing_key}` is ONE position over
  // ONE ordered universe: all Property records ordered by
  // (ModificationTimestamp, ListingKey) ASC. A run may only advance it if it
  // actually traversed THAT universe.
  //
  // A `type: "sale"` run traverses a strict SUBSET (PropertyType ne
  // 'ResidentialLease'). Its last contiguous success is a valid position within
  // the sale subset and MEANINGLESS globally: advancing the shared cursor to it
  // would declare every RENTAL listing in that timestamp range processed when
  // none of them were even fetched. The next unscoped run resumes past them and
  // they are never seen again. Same argument for a full sync, which uses
  // buildActiveFilter — a different filter over a different universe (actives
  // only, no MT bound at all), so its records say nothing about incremental
  // position.
  //
  // Fail-closed and DERIVED, not caller-supplied: a caller cannot opt in to
  // moving the cursor by passing a flag, because the property that matters is
  // the shape of the traversal, not the caller's intent. Run telemetry
  // (last_run_at / status / counters) still writes from every run — only the two
  // CURSOR columns are gated.
  const advancesGlobalCursor = incremental && !options.type;

  if (!incremental) {
    // Full sync: fetch all active listings
    filter = buildActiveFilter(options.type);
  } else {
    // Incremental sync: ModificationTimestamp-only keyset resume. PCT is NOT
    // ORed in here any more — `media_sync_state` owns that dimension. See the
    // rationale on buildIncrementalFilter.
    filter = buildIncrementalFilter(options.since!, options.type, options.sinceListingKey ?? null);
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
    // ASC is load-bearing, not cosmetic. The module default is
    // `ModificationTimestamp desc` (fetch.ts buildUrl); under DESC a capped run
    // consumes the NEWEST records and the cursor jumps to the newest MT, making
    // every older unprocessed record unreachable on every subsequent capped run
    // (lib/idx/cursor/keyset-cursor.ts). Keyset resume is only sound ascending.
    ...(incremental ? { orderby: PROPERTY_KEYSET_ORDERBY } : {}),
  });

  console.log(`[IDX Sync] Fetched ${fetchResult.totalFetched} records from Trestle`);

  let upserted = 0;
  let skippedGates = 0;
  let skippedValidation = 0;
  let skippedNewTerminal = 0;
  const skippedNewTerminalSample: string[] = [];
  let errors = 0;

  // Phase 3 write-suppression counters (physical writes only).
  const listingCounters = newWritePathCounters();
  const projectionCounters = newWritePathCounters();
  const batchMediaCounters = newWritePathCounters();

  // Change-reason attribution (2026-07-24): WHY each physical write happened.
  const listingChangeReasons = newListingChangeReasonCounters();
  const projectionChangeReasons = newProjectionChangeReasonCounters();

  // Phase-1 write-amplification forensic (2026-07-25): TEMPORARY diagnostic
  // answering "which raw_data KEYS change on raw_data_only writes?". Key NAMES +
  // counts ONLY (never values/PII); emitted to runtime logs at run end, NEVER to
  // audit_events (append-only growth is the thing we're fixing).
  //
  // AUTO-EXPIRING (Maya safeguard): active ONLY while DIAG_RAW_DATA_KEYS_UNTIL is
  // a FUTURE ISO timestamp. It fails OFF after the bounded evidence window with no
  // redeploy or manual cleanup — it cannot be left on indefinitely. Unset/invalid/
  // past ⇒ disabled (zero behavior/perf impact).
  const diagUntilRaw = process.env.DIAG_RAW_DATA_KEYS_UNTIL;
  const diagUntil = Date.parse(diagUntilRaw ?? "");
  const diagRawDataKeys = Number.isFinite(diagUntil) && Date.now() < diagUntil;
  // Bounded grace after the cutoff: the "window closed" notice logs only within
  // this window, then goes fully silent (no indefinite per-cycle noise).
  const DIAG_EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000;
  const rawDataChangedKeyCounts = new Map<string, number>();
  let rawDataOnlyWritesSampled = 0;

  // One Cycle W1 — cache tags to revalidate at end of run. Only PHYSICAL
  // writes add tags (the suppression comparators are the change oracle);
  // an unchanged run revalidates NOTHING. Scope D (2026-07-24): a
  // provenance-only listing write (modification_timestamp_only) adds NO
  // tags — a change nobody can see must not expire any cache.
  const revalidation = newRevalidationCounters();
  const changedCacheTags = new Set<string>();

  // Scope B (2026-07-24): the manifest shards affected by this run's
  // PHYSICAL, cache-visible changes (old + new address shard on a move).
  // Only these are eagerly warmed after the run; empty set → no warm.
  const affectedManifestShards = new Set<string>();

  // Correction 4 — fail-closed watermark bookkeeping. Each FAILED record's
  // cursor key (max of its MT/PCT instants) caps how far the persisted
  // SyncState watermark may advance this run, so a failed listing is
  // re-fetched by the next incremental pass instead of being silently
  // skipped forever. An unparseable failed key freezes the watermark
  // entirely (strictest fail-closed).
  let watermarkFrozen = false;

  // ── Keyset cursor bookkeeping (ModificationTimestamp, ListingKey) ────────
  // Every record's provider position, plus the set of positions that FAILED.
  // After the loop these feed `advanceCursor`, which stops at the last
  // CONTIGUOUS success — never max-seen, never provider head, never local clock.
  //
  // A record whose MT is unparseable or whose ListingKey is missing CANNOT be
  // positioned in the total order. Advancing past an unpositionable record
  // could skip it forever, so it freezes the keyset (strictest fail-closed) —
  // the same rule the scalar path applies to an unbounded failure.
  const cursorRows: CursorRow[] = [];
  const failedCursorListingKeys = new Set<string>();
  let keysetFrozen = false;
  const recordCursorPosition = (raw: Record<string, unknown>, ok: boolean): void => {
    const mt = raw.ModificationTimestamp ? new Date(String(raw.ModificationTimestamp)) : null;
    const listingKey = raw.ListingKey ? String(raw.ListingKey) : "";
    if (!mt || Number.isNaN(mt.getTime()) || listingKey === "") {
      keysetFrozen = true;
      return;
    }
    cursorRows.push({ timestamp: mt, listingKey });
    if (!ok) failedCursorListingKeys.add(listingKey);
  };

  for (const [recordIndex, raw] of fetchResult.records.entries()) {
    // Stage marker so the shared catch attributes the failure to the write
    // path that actually threw (failure isolation — a failed row is counted
    // ONLY as failed, never as suppressed/inserted/updated).
    let writeStage: "listing" | "projection" = "listing";
    try {
      // 1. Validate required fields
      const validation = validateRequiredFields(raw);
      if (!validation.valid) {
        console.warn(
          `[IDX Sync] Skipping record (missing fields): ${validation.missingFields.join(", ")}`
        );
        skippedValidation++;
        // RESOLVED skip — the cursor MUST advance past it. See the note on the
        // new-terminal skip below for why a skip that does not record a position
        // livelocks the whole sync.
        recordCursorPosition(raw, true);
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
      // Phase 3: the select is widened to EVERY material field the UPDATE
      // payload can carry (LISTING_SYNC_COMPARE_SELECT) so an unchanged
      // re-emit can be verified and suppressed instead of blindly upserted.
      // A field missing from this select fails CLOSED (treated as changed).
      const existing = await prisma.listing.findUnique({
        where: { listing_id: mapped.listing_id },
        select: {
          ...LISTING_SYNC_COMPARE_SELECT,
          // CANONICAL MEDIA for the projection's feature flags. Widened onto the
          // EXISTING per-record read — no second round trip, no N+1. `distinct`
          // caps this at <=4 rows per listing (the live media_type domain is
          // Photo/FloorPlan/VirtualTour/Video).
          //
          // Without this the projection derived has_floorplan/has_video/
          // has_virtual_tour from `mapped.media`, which on the incremental path
          // is `[]` — `$expand=Media` is disabled (useExpandMedia === false), so
          // the mapper has no provider media to carry. Every flag was therefore
          // computed from an empty array on the hot path.
          //
          // Extra keys on `existing` are harmless to the write-suppression
          // comparators: both listingUpdateMateriallyUnchanged and
          // classifyListingChangeReasons iterate the UPDATE payload's keys, not
          // the existing row's.
          listing_media: {
            where: { status: "active" },
            select: { media_type: true },
            distinct: ["media_type"] as const,
          },
          // ALL-STATUS existence — distinguishes "never imported" (legacy JSON
          // may still be read) from "every row deleted" (authoritative empty).
          _count: { select: { listing_media: true } },
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

      // Archive eligibility clock (#415): set terminal_since on non-terminal→terminal,
      // clear on terminal→active, never bump on terminal re-sync. Derived from stable
      // source dates (raw_data.CloseDate/OffMarketDate), NOT status_changed_at/modts.
      // CREATE: previousStatus undefined → sets terminal_since iff the new row is terminal.
      // UPDATE: previousStatus = existing.status → set/clear/no-change.
      const terminalSinceCreate = computeTerminalSincePatch({
        previousStatus: undefined,
        newStatus: mapped.status,
        raw_data: mapped.raw_data as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        // #446: ExpirationDate is in PRIVATE_FIELDS, so mapped.raw_data has it stripped.
        // Feed the original un-stripped Trestle record's ExpirationDate as the Expired
        // fallback (NOT persisted) so a Trestle Expired listing seeds terminal_since from
        // its actual expiration date, not the sync wall-clock.
        expirationDateFallback: raw.ExpirationDate as string | undefined,
      });
      const terminalSinceUpdate = computeTerminalSincePatch({
        previousStatus: existing?.status,
        newStatus: mapped.status,
        raw_data: mapped.raw_data as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        // #446: ExpirationDate is in PRIVATE_FIELDS, so mapped.raw_data has it stripped.
        // Feed the original un-stripped Trestle record's ExpirationDate as the Expired
        // fallback (NOT persisted) so a Trestle Expired listing seeds terminal_since from
        // its actual expiration date, not the sync wall-clock.
        expirationDateFallback: raw.ExpirationDate as string | undefined,
      });

      // 4. Upsert to local DB
      // Phase C (agent_info normalization): stop persisting the legacy agent_info JSON.
      // Strip it from the spread so `create: { ...typedOnlyMapped }` no longer carries it;
      // the 8 typed columns remain in typedOnlyMapped (mapper emits them). mapped.agent_info
      // stays in memory for the UPDATE branch's typed derivation below.
      const { agent_info: _agentInfoJson, ...typedOnlyMapped } = mapped;
      // ROOT-CAUSE FIX (2026-07-05): do NOT create a brand-new row for a listing that
      // arrives terminal/off-market and we never tracked. Incremental sync returns every
      // feed-wide modification, so this was storing ~88,967 never-active Closed listings
      // (first_active_date=NULL) as fat, hidden, ever-growing bloat. Existing rows still
      // UPDATE below, so a genuine Active->Closed transition still hides via §2.05.
      if (shouldSkipNewTerminalListing(existing, mapped.status)) {
        skippedNewTerminal++;
        if (skippedNewTerminalSample.length < 25) skippedNewTerminalSample.push(mapped.listing_id);
        // RESOLVED skip — record the position so the cursor can move past it.
        //
        // A deliberate skip is a TERMINAL DECISION about the record, not a
        // failure. If it records no position, the record is invisible to
        // `advanceCursor`: a page whose records are ALL skipped yields an empty
        // `cursorRows`, so no position is written, `last_run_status` is still
        // "ok", and the next run's identical filter under deterministic ASC
        // ordering returns the byte-identical page. Forever.
        //
        // That is not hypothetical for this predicate. Never-active terminal
        // rows are the single largest skip class in the feed (~88,967 rows were
        // shed for exactly this reason), and `ListingKey` is monotone with
        // listing age, so under `(MT asc, ListingKey asc)` the OLDEST — i.e.
        // long-closed, never-tracked — keys sort FIRST within any bulk-stamp
        // cluster. A capped page over the head of such a cluster is precisely
        // an all-skip window.
        //
        // The media lane already does this (lib/idx/media-sync.ts, the
        // compliance-blocked branch pushes `ok: true` with the comment "let the
        // cursor advance past it"). Same hazard, same fix shape, both lanes.
        recordCursorPosition(raw, true);
        continue;
      }
      // #415 rehydration guard: if `existing` is already archived, guardArchivedRehydration
      // DROPS raw_data/media/sync_status from this payload so a Cotality re-emit cannot
      // re-hydrate the stripped blobs or un-archive the row (which would re-enter the drain).
      const listingUpdateData = guardArchivedRehydration({
        mls_id: mapped.mls_id,
        status: mapped.status,
        ...terminalSinceUpdate,
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
        ...mediaUpdatePatch(mapped.media, useExpandMedia),
        // S1 (#445 Codex P1): OMIT compliance on UPDATE so CRM/syndication-authored
        // keys (validation_result, approvals) are preserved — never stomped to {}.
        ...complianceUpdatePatch(),
        // Phase C: agent_info JSON is no longer persisted. Only the 8 typed agent
        // columns are written, still derived from the in-memory mapped.agent_info.
        ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
        raw_data: mapped.raw_data as Prisma.InputJsonValue,
        modification_timestamp: mapped.modification_timestamp,
        listing_contract_date: mapped.listing_contract_date,
        last_synced_from_trestle: mapped.last_synced_from_trestle,
        sync_status: mapped.sync_status,
        // Status-transition fields (only populated when status actually
        // changed; empty object is a no-op for Prisma).
        ...statusTransition,
      }, existing);

      // Phase 3 (surface A): suppress the UPDATE entirely when the prepared
      // payload carries no material change vs the existing row. Material
      // identity excludes ONLY the local telemetry clock
      // (last_synced_from_trestle) — status, price, address, eligibility,
      // attribution, lifecycle, and compliance-gate changes ALL still write.
      // CREATEs are never suppressed. Comparison failure fails closed
      // (write proceeds) inside listingUpdateMateriallyUnchanged.
      listingCounters.rows_checked++;

      // PROVENANCE-ONLY SUPPRESSION (2026-08-13) — the Neon write-amplification fix.
      //
      // Cotality re-stamps ModificationTimestamp on revisions that change no
      // listing content. Production evidence: 201 of 212 listing updates in one
      // cycle classified `modification_timestamp_only` (~95%). Each one issued a
      // physical `listing.upsert`, because `modification_timestamp` is not in
      // LISTING_NON_MATERIAL_UPDATE_FIELDS. The write was retained on purpose —
      // see the note that used to sit below at the change-reason block — because
      // the incremental cursor WAS `MAX(listings.modification_timestamp)`, so
      // not writing it would have frozen the cursor and re-fetched the same rows
      // forever.
      //
      // That constraint is now gone: the resume position lives in
      // `sync_state.{last_watermark,last_listing_key}` and advances from the
      // FETCHED batch, independent of whether any row was physically written
      // (see getPropertyKeysetCursor). So a revision that changes nothing
      // material can now advance the cursor without touching the row.
      //
      // Ordering note: this is why the cursor migration and this suppression are
      // one indivisible change and cannot ship separately.
      //
      // FAIL-CLOSED: classifyListingChangeReasons returns ["other"] on any
      // comparison failure, and `isProvenanceOnlyChange` is true ONLY for the
      // single exact reason `modification_timestamp_only`. `raw_data_only` is
      // deliberately NOT suppressed — a raw_data change may carry meaning we do
      // not model as a typed column.
      //
      // PUBLIC-SEMANTICS NOTE (UCBA Art. VIII §4): suppressing this write means
      // `listings.modification_timestamp` becomes "last MATERIAL change to this
      // listing" rather than "last provider revision". The site-wide "Data last
      // updated" surface is unaffected — it reads SyncState.last_watermark,
      // which still advances to the newest genuinely-processed provider instant
      // on every run. The per-listing detail disclosure
      // (app/listing/[...slug]/page.tsx -> IDXDisclaimer lastUpdated) therefore
      // reports when the listing's data last actually changed, which is the
      // stricter reading of "true data refresh time".
      const provenanceOnlyRevision =
        existing !== null &&
        isProvenanceOnlyChange(
          classifyListingChangeReasons(
            listingUpdateData as Record<string, unknown>,
            existing as unknown as Record<string, unknown>,
          ),
        );

      const suppressListingWrite =
        existing !== null &&
        (provenanceOnlyRevision ||
          listingUpdateMateriallyUnchanged(
            listingUpdateData as Record<string, unknown>,
            existing as unknown as Record<string, unknown>,
          ));
      if (suppressListingWrite) {
        listingCounters.rows_suppressed_unchanged++;
        // Keep the change-reason histogram complete. Before this change every
        // provenance-only revision was counted here via the write path; now it
        // is suppressed, so without this tally `modification_timestamp_only`
        // would drop to ~0 and look like the churn had vanished rather than
        // stopped costing a write. The metric must stay observable to prove the
        // reduction is real.
        if (provenanceOnlyRevision) {
          listingChangeReasons.modification_timestamp_only++;
          listingCounters.rows_suppressed_provenance_only++;
        }
      } else {
        await prisma.listing.upsert({
          where: { listing_id: mapped.listing_id },
          create: {
            ...typedOnlyMapped,
            list_price: mapped.list_price,
            living_area: mapped.living_area,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            media: mapped.media as Prisma.InputJsonValue,
            compliance: mapped.compliance as Prisma.InputJsonValue,
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
            // Seed status_changed_at on create so new listings are immediately
            // eligible for retention-cron age checks. first_active_date seeds
            // only when the initial status is one that would accrue DOM.
            status_changed_at: new Date(),
            first_active_date: ACTIVE_SEED_STATUSES.has(mapped.status)
              ? new Date()
              : null,
            ...terminalSinceCreate,
          },
          update: listingUpdateData,
        });
        if (existing) {
          listingCounters.rows_materially_changed++;
          listingCounters.rows_updated++;
        } else {
          listingCounters.rows_inserted++;
        }
        upserted++;
        // Change-reason attribution (2026-07-24). A provenance-only write
        // (modification_timestamp moved, nothing else) keeps the row write
        // (a source revision must persist) but SKIPS all cache invalidation
        // and manifest-shard marking — nothing visible changed. raw_data
        // changes and classification failures stay fail-closed (invalidate).
        const changeReasons = existing
          ? classifyListingChangeReasons(
              listingUpdateData as Record<string, unknown>,
              existing as unknown as Record<string, unknown>,
            )
          : null;
        if (changeReasons) {
          for (const reason of changeReasons) listingChangeReasons[reason]++;
        }
        // Phase-1 forensic (flag-gated): tally WHICH raw_data keys changed on a
        // raw_data_only write, using the SAME material semantics the classifier
        // used to decide raw_data_only (rotating Media URLs canonicalized away,
        // provenance clocks excluded) — so the histogram can never disagree with
        // the classification. Key NAMES + counts only; never values.
        if (
          diagRawDataKeys &&
          existing &&
          changeReasons &&
          [...changeReasons].includes("raw_data_only")
        ) {
          const keys = changedRawDataMaterialKeys(
            (existing as { raw_data?: unknown }).raw_data,
            mapped.raw_data as unknown,
          );
          for (const k of keys) {
            rawDataChangedKeyCounts.set(k, (rawDataChangedKeyCounts.get(k) ?? 0) + 1);
          }
          rawDataOnlyWritesSampled++;
        }
        if (!changeReasons || !isProvenanceOnlyChange(changeReasons)) {
          recordPublicListingChange(
            mapped.listing_id,
            existing?.address,
            mapped.address,
            changedCacheTags,
            affectedManifestShards,
          );
        }
      }

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
        // Canonical media flags come from the stored relational rows, NOT from
        // `mapped.media` (which is [] on the incremental path — see the widened
        // select above). `undefined` on a CREATE, where no stored row exists yet
        // and the legacy derivation is the only available source.
        mediaTypes: existing
          ? (existing.listing_media ?? []).map((m) => String(m.media_type ?? ""))
          : undefined,
        hadRelationalRows: existing ? (existing._count?.listing_media ?? 0) > 0 : undefined,
      };
      // Phase 3 (surface B): compare the COMPLETE material projection before
      // writing. Every projection column is source-derived (price, status,
      // geography, search text, flags, amenities, display gates, modified_at)
      // so all of them are material; only Prisma-managed id/created_at/
      // updated_at are outside the payload. Missing row → insert flows.
      writeStage = "projection";
      const projection = buildListingSearchProjectionFromListing(projectionInput);
      projectionCounters.rows_checked++;
      const existingProjection = (await prisma.listingSearchProjection.findUnique({
        where: { listing_id: mapped.listing_id },
        select: PROJECTION_MATERIAL_SELECT,
      })) as Record<string, unknown> | null;
      if (existingProjection && projectionRowSearchVisiblyEqual(existingProjection, projection)) {
        // Scope D (2026-07-24): NOTHING search-visible changed. This covers
        // both the fully-identical row AND the source-timestamp-only bump —
        // the projection keeps its old modified_at (the revision clock lives
        // on the listing row for provenance), no search/building payload is
        // invalidated, and search-alerts see no false "updated" signal.
        projectionCounters.rows_suppressed_unchanged++;
        if (!projectionRowMateriallyEqual(existingProjection, projection)) {
          projectionChangeReasons.source_timestamp_only++;
        }
      } else {
        const projectionPayload = buildProjectionUpsertPayload(projection);
        await prisma.listingSearchProjection.upsert(projectionPayload);
        if (existingProjection) {
          projectionCounters.rows_materially_changed++;
          projectionCounters.rows_updated++;
          projectionChangeReasons.search_visible_fields++;
        } else {
          projectionCounters.rows_inserted++;
        }
        // W1: projection changes affect search surfaces. Same canonical tag set.
        recordPublicListingChange(
          mapped.listing_id,
          existing?.address,
          mapped.address,
          changedCacheTags,
          affectedManifestShards,
        );
      }
      // Keyset position of this SUCCESSFULLY processed record. Recorded at the
      // very end of the try so it can only be reached once every write for the
      // record has committed. `advanceCursor` re-sorts, so push order is
      // irrelevant — only membership and the failure set matter.
      recordCursorPosition(raw, true);
    } catch (err) {
      errors++;
      // Failure isolation: attribute the failure to the write path that
      // threw; the row is never also counted as suppressed/inserted/updated.
      if (writeStage === "projection") {
        projectionCounters.rows_failed++;
      } else {
        listingCounters.rows_failed++;
      }
      // Keyset: mark this position FAILED. The cursor stops at the last
      // contiguous success BEFORE it, so the failed record is re-fetched next
      // run and nothing after it is silently consumed.
      recordCursorPosition(raw, false);
      // Correction 4 — fail-closed freeze for a failure the cursor cannot bound.
      //
      // Only the FREEZE survives. The companion `failedCursorKeys` array became
      // write-only when the scalar clamp was removed (see the watermark block):
      // a positionable failure is already handled by `advanceCursor` stopping
      // before it, so collecting its instant had no remaining reader.
      //
      // An UNPARSEABLE failure instant still matters: we cannot say where the
      // failure sits in the order, so we must not claim any position past it.
      if (!Number.isFinite(new Date(String(raw.ModificationTimestamp ?? "")).getTime())) {
        watermarkFrozen = true;
      }
      const listingId = String(raw.ListingId || raw.SourceSystemKey || "unknown");
      const mlsId = raw.ListingKey ? String(raw.ListingKey) : null;
      console.error(`[IDX Sync] Error upserting listing ${listingId}:`, err);
      // Best-effort diagnostic persist (see helper comment near top of file).
      //
      // Codex review of PR #144: this catch sits inside the hot per-record
      // loop. Awaiting an AuditEvent insert here would add one DB
      // round-trip to every failed record and, on a large-batch run with
      // many failures, materially slow sync — eating into the cron's
      // 120 s budget. We fire-and-forget instead.
      //
      // `recordSyncDiagnostic` itself already has an inner try/catch that
      // swallows errors (it's best-effort). The trailing `.catch` here is
      // defense-in-depth so that ANY future change which makes the helper
      // throw synchronously OR forward a rejection cannot turn into an
      // unhandled-promise-rejection process event.
      //
      // Loop behavior is unchanged: errors are counted and the loop
      // continues immediately to the next record.
      void recordSyncDiagnostic(
        "idx_sync_listing_upsert_failure",
        "listing",
        listingId,
        {
          listing_id: listingId,
          mls_id: mlsId,
          ...extractErrorDetails(err),
          record_index: recordIndex,
          since: options.since ? options.since.toISOString() : null,
          max_records: maxRecords,
          full_sync: options.fullSync || false,
          listing_type: options.type || "all",
        },
      ).catch((diagnosticError) => {
        console.error(
          "[IDX Sync] Failed to persist listing-upsert diagnostic:",
          diagnosticError,
        );
      });
    }
  }

  // ── Batch-fetch media for listings that didn't get inline media ──
  // When $expand=Media was disabled (large syncs), fetch photos separately
  // and update DB records. Uses Trestle Media endpoint (separate quota: 18K req/hr).
  // Correction 1: gate on PROCESSED records (rows_checked — reached the write
  // decision), NOT on physical listing writes. A fully-suppressed batch must
  // still fetch + reconcile media; the media path has its own suppression.
  if (!useExpandMedia && listingCounters.rows_checked > 0) {
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

        // Batches whose Media pagination could not be proven COMPLETE. Those
        // batches perform NO reconciliation (no clear, no tombstone) — a key
        // absent from an incomplete response is not proven empty at source.
        let mediaBatchesIncompleteSkipped = 0;
        for (let i = 0; i < listingsNeedMedia.length; i += BATCH_SIZE) {
          const batch = listingsNeedMedia.slice(i, i + BATCH_SIZE).filter(Boolean);
          if (batch.length === 0) continue;

          const idFilter = batch.map((key) => `ResourceRecordKey eq '${key.replace(/'/g, "''")}'`).join(" or ");
          // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
          const mediaFilter = `(${idFilter}) and MediaStatus ne 'Deleted'`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          mediaParams.set("$select", "ResourceRecordKey,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus,MediaKey");
          mediaParams.set("$orderby", "ResourceRecordKey asc,Order asc");
          mediaParams.set("$top", String(batch.length * 30));

          try {
            // COMPLETENESS via the SHARED follower (`paginateMedia` — the same one
            // media-sync uses). One nextLink implementation, one runaway guard,
            // one definition of "complete". No second pagination loop.
            //
            // `complete: false` (a page failed, or the runaway guard tripped)
            // means a requested key absent from the rows is NOT proven empty at
            // source, so this batch performs NO reconciliation at all. Fail closed.
            const { rows: mediaRows, complete } = await paginateMedia(
              `${TRESTLE_API}/odata/Media?${mediaParams.toString()}`,
              async (url: string) => {
                const _mc = new AbortController();
                const _mt = setTimeout(() => _mc.abort(), 15_000);
                try {
                  const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                    signal: _mc.signal,
                  });
                  if (!res.ok) throw new Error(`Media page HTTP ${res.status}`);
                  const data = await res.json();
                  return {
                    value: (data.value || []) as unknown[],
                    nextLink: (data["@odata.nextLink"] as string | undefined) ?? null,
                  };
                } finally {
                  clearTimeout(_mt);
                }
              },
            );
            if (!complete) {
              mediaBatchesIncompleteSkipped++;
              continue; // incomplete ⇒ never clear, never tombstone
            }

            // Group media by ResourceRecordKey — normalize to {url, mediaType, order} for display adapter
            const mediaByListing = new Map<string, { url: string; mediaType: string; order: number; mediaKey?: string }[]>();
            // PRE-SEED every REQUESTED key so a complete-but-empty result is
            // represented as `[]` instead of vanishing from the map. Previously
            // "the provider returned no media for this listing" was
            // indistinguishable from "we never asked", so an emptied gallery was
            // never reconciled. Only reached once the fetch proved COMPLETE, so
            // `[]` here means AUTHORITATIVE empty.
            for (const key of batch) mediaByListing.set(String(key), []);
            for (const m of mediaRows as unknown as Record<string, unknown>[]) {
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
              // Stable RESO identity for write suppression. `mediaArraysMateriallyEqual` prefers
              // `mediaKey` when BOTH sides carry one and only then falls back to URL identity.
              // Cotality rotates a signed epoch + HMAC inside the URL *path* (not the query), so
              // `rotatingUrlIdentity` cannot neutralize it and the URL leg reports every photo as
              // changed on every cycle. Supplying the key makes the authoritative branch reachable.
              //
              // OMIT the property entirely when the feed does not give a usable string: an empty
              // string would masquerade as an authoritative identity and could make two DIFFERENT
              // photos compare equal. G5 (MediaStatus / PreferredPhotoYN semantics) is NOT
              // established, so anything unexpected must degrade into the existing URL fallback
              // rather than bypass it.
              const mediaKey = typeof m.MediaKey === "string" ? m.MediaKey.trim() : "";
              mediaByListing.get(lid)!.push({
                ...(mediaKey ? { mediaKey } : {}),
                url: String(m.MediaURL),
                mediaType,
                order: isPreferred ? -1 : Number(m.Order ?? 0),
              });
            }

            // Update DB records — convert ResourceRecordKey back to listing_id via map.
            // Phase 3 (surface D): compare the stored legacy media JSON first and
            // SKIP the write when it is materially identical. Rotating signed
            // Trestle URLs are NOT identity (mediaArraysMateriallyEqual); true
            // inserts/deletions/ordering/hero/delivery-state changes still write.
            // Per-row try/catch keeps one bad row from aborting the batch.
            for (const [key, media] of mediaByListing) {
              const listingId = keyToIdMap.get(key) || key;
              batchMediaCounters.rows_checked++;
              try {
                const existingMediaRow = await prisma.listing.findFirst({
                  // #415: archived-safe filter — an archived row must not have its media re-hydrated.
                  where: archivedSafeMediaWhere(listingId),
                  // `address` widened onto the EXISTING per-listing read (no new
                  // query, no N+1) so a media-only change can invalidate the exact
                  // building + manifest shard it affects.
                  select: { media: true, address: true },
                });
                if (!existingMediaRow) {
                  // Archived or missing row: the guarded write would match 0 rows.
                  batchMediaCounters.rows_suppressed_unchanged++;
                  continue;
                }
                if (mediaArraysMateriallyEqual(existingMediaRow.media, media)) {
                  batchMediaCounters.rows_suppressed_unchanged++;
                  continue;
                }
                batchMediaCounters.rows_materially_changed++;
                await prisma.listing.updateMany({
                  where: archivedSafeMediaWhere(listingId),
                  data: { media: media as unknown as Prisma.InputJsonValue },
                });
                batchMediaCounters.rows_updated++;
                // Media changed => the building payload and manifest shard can
                // change too (they carry primary_photo_url). Same canonical
                // helper the Listing-write path uses, so the two cannot drift.
                // A media change never moves a listing between buildings, so the
                // current address is passed as both sides.
                recordPublicListingChange(
                  listingId,
                  existingMediaRow.address,
                  existingMediaRow.address,
                  changedCacheTags,
                  affectedManifestShards,
                );
              } catch (mediaRowErr) {
                batchMediaCounters.rows_failed++;
                console.warn(
                  `[IDX Sync] Media write failed for ${listingId}:`,
                  mediaRowErr instanceof Error ? mediaRowErr.message : mediaRowErr,
                );
              }
            }
          } catch (mediaErr) {
            console.warn(`[IDX Sync] Media batch ${i / BATCH_SIZE + 1} failed:`, mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }
        console.log(
          `[IDX Sync] Media batch-fetch complete (incomplete batches skipped: ${mediaBatchesIncompleteSkipped})`,
        );
      }
    } catch (mediaSyncErr) {
      console.warn("[IDX Sync] Media sync failed (non-fatal):", mediaSyncErr instanceof Error ? mediaSyncErr.message : mediaSyncErr);
    }
  }

  const durationMs = Date.now() - startTime;

  // One Cycle W1 — sync-driven cache revalidation: refresh exactly what this
  // run materially changed, plus ONE coarse `search` bump when anything
  // changed. Failures are counted, never thrown (freshness self-heals via
  // the 30-min fallback window).
  if (changedCacheTags.size > 0) {
    changedCacheTags.add(SEARCH_CACHE_TAG);
    safeRevalidateTags(changedCacheTags, revalidation);
  }

  // Audit log
  logger.durationMs = durationMs;
  logIDXAccess({
    ...logger,
    resultStatus: errors > 0 ? "error" : "success",
    errorMessage: errors > 0 ? `${errors} errors during sync` : undefined,
  });

  // The durable idx_sync AuditEvent is written AFTER the manifest warm (see
  // below) so its changes payload can carry the warm + canary + reason
  // counters (Maya-approved allowlist addition, 2026-07-24).

  // ── Watermark ownership (fix for homepage "last updated" staleness) ──
  // The UI at /api/idx/watermark and lib/idx/watermark.ts reads
  // SyncState.last_watermark + last_run_at. If sync never writes this row,
  // the UI shows a frozen date (observed 2026-04-23: homepage "Data last
  // updated: February 11, 2026" while idx-sync ran every 15 min).
  //
  // WATERMARK SEMANTICS (corrected 2026-08-13).
  //
  // This value used to be seeded `batchWatermark = now` and only ever RAISED by
  // the per-record loop. Provider timestamps are in the past relative to the
  // moment the run reaches this block, so the loop was a no-op in normal
  // operation and `last_watermark` persisted as LOCAL WALL CLOCK on every
  // successful non-empty run. Production proof (read-only, 2026-08-13):
  // `last_watermark` === `last_run_at` to the millisecond, and sat 3m52.821s
  // AHEAD of MAX(listings.modification_timestamp).
  //
  // That is a UCBA 2026 Art. VIII §4 defect: lib/idx/watermark.ts states the
  // displayed "Data last updated" must be the true data-refresh time, NOT a
  // render/run clock, and this column is what the Footer and IDXDisclaimer
  // render. The watermark is now the last CONTIGUOUS fully-processed provider
  // ModificationTimestamp — a real feed instant, never `now`.
  //
  // EXPECTED, CORRECT SIDE EFFECT: on first deploy the displayed date moves
  // BACKWARD (run clock -> newest genuinely-processed provider MT). That is the
  // defect being removed, not a regression.
  //
  // `batchWatermark` and `advanceWatermark` are hoisted out of the try block so
  // the catch can include them in the diagnostic AuditEvent payload.
  const now = new Date();
  let batchWatermark: Date | null = null;
  let batchListingKey: string | null = null;
  let advanceWatermark = false;
  try {
    // Contiguous keyset advance over (ModificationTimestamp, ListingKey) ASC.
    // `advanceCursor` sorts, walks in order, and STOPS at the first failure —
    // so the persisted position is the last fully-processed record and the
    // failed one is re-fetched next run. Never max-seen (which under the old
    // DESC ordering made the unprocessed tail unreachable), never provider
    // head, never local clock.
    const advanced = advanceCursor(
      cursorRows,
      null,
      (row) => !failedCursorListingKeys.has(row.listingKey),
    );
    if (advanced.next) {
      batchWatermark = advanced.next.timestamp;
      batchListingKey = advanced.next.listingKey;
    }

    // On empty batches, advance last_run_at but leave last_watermark alone —
    // the UI surfaces last_watermark as the "data updated" date. Preserving
    // it on empty runs avoids jumping forward when nothing actually changed.
    //
    // `keysetFrozen` (an unpositionable record — unparseable MT or missing
    // ListingKey) blocks advancement entirely: we cannot prove what was
    // contiguously processed, so we must not move the cursor past it.
    //
    // `advancesGlobalCursor` blocks a scoped/full run from claiming a position
    // over a universe it did not traverse — see its declaration.
    advanceWatermark = advancesGlobalCursor && batchWatermark !== null && !keysetFrozen;
    if (!advancesGlobalCursor) {
      // Drop the computed position so neither the create branch nor any
      // diagnostic can report a value this run is not entitled to persist.
      batchWatermark = null;
      batchListingKey = null;
    }

    // Correction 4 — fail-closed guard. It may only BLOCK advancement; it must
    // never REWRITE the position.
    //
    // The old scalar form clamped `batchWatermark` to (earliest failure - 1ms)
    // and nulled the tie-breaker. Under a keyset cursor that is both redundant
    // and harmful:
    //
    //   redundant — every POSITIONABLE failure is already in
    //     `failedCursorListingKeys`, so `advanceCursor` stopped before it; and
    //     every UNPOSITIONABLE record already set `keysetFrozen`, which blocks
    //     advancement outright. There is no failure the clamp catches that the
    //     keyset did not already handle.
    //
    //   harmful — a same-timestamp cluster makes the clamp fire on a CORRECT
    //     position. If the last contiguous success and the first failure share a
    //     ModificationTimestamp T, then batchWatermark == T > (T - 1ms), so the
    //     clamp replaced a real position (T, lastGoodKey) with a synthetic
    //     (T - 1ms, null). Nulling the key discards the tie-breaker, so the next
    //     run falls back to the bootstrap path and re-reads the whole cluster —
    //     losing exactly the progress the tie-breaker exists to preserve, on
    //     exactly the clustered input it exists to handle.
    //
    // `watermarkFrozen` is likewise a pure block, kept as defence in depth for
    // an unbounded failure the keyset could not position.
    if (watermarkFrozen) {
      advanceWatermark = false;
    }
    // The shards this run is ABOUT to warm (the warm block below runs only
    // when errors === 0). Persisted in `notes` so the NEXT run's canary
    // probes exactly this set — see parseWarmedShardsFromNotes.
    const shardsToRecord = errors === 0 ? [...affectedManifestShards].sort() : [];
    await prisma.syncState.upsert({
      where: { resource: "Property" },
      create: {
        resource: "Property",
        // Gated by the SAME `advanceWatermark` the update branch uses.
        //
        // `advancesGlobalCursor` nulls the position directly, but `keysetFrozen`
        // and `watermarkFrozen` only flip `advanceWatermark` — so an ungated
        // create branch would honour the ownership guard while silently ignoring
        // both fail-closed FREEZES, writing a position the update branch would
        // have withheld. Whether that row can exist today is beside the point:
        // one upsert must not enforce a safety rule on one branch and not the
        // other.
        //
        // Null when nothing is advanceable — the column is nullable and a null
        // cursor means "no position yet", which the reader bootstraps. Writing
        // `now` here is exactly the defect this change removes.
        last_watermark: advanceWatermark ? batchWatermark : null,
        last_listing_key: advanceWatermark ? batchListingKey : null,
        last_run_at: now,
        last_run_status: errors > 0 ? "error" : "ok",
        last_run_duration_ms: durationMs,
        rows_upserted: upserted,
        rows_skipped_by_gate: skippedGates,
        rows_with_errors: errors,
        notes: serializeWarmedShardsToNotes(shardsToRecord),
      },
      update: {
        // Watermark and tie-breaker move together or not at all — a timestamp
        // without its key (or vice versa) is not a position, and mixing a new
        // timestamp with a stale key would resume mid-cluster at the wrong row.
        ...(advanceWatermark
          ? { last_watermark: batchWatermark, last_listing_key: batchListingKey }
          : {}),
        last_run_at: now,
        last_run_status: errors > 0 ? "error" : "ok",
        last_run_duration_ms: durationMs,
        rows_upserted: upserted,
        rows_skipped_by_gate: skippedGates,
        rows_with_errors: errors,
        notes: serializeWarmedShardsToNotes(shardsToRecord),
      },
    });
  } catch (err) {
    console.error("[IDX Sync] Failed to update SyncState watermark:", err);
    // Non-fatal — sync already succeeded; watermark-write failure degrades
    // UI freshness display only.
    //
    // Best-effort diagnostic persist (see helper comment near top of file).
    // This is the catch that was silently swallowing the SyncState
    // failure during the 2026-05-15 frozen-watermark incident.
    await recordSyncDiagnostic(
      "idx_sync_syncstate_failure",
      "sync_state",
      "Property",
      {
        ...extractErrorDetails(err),
        // Null when the batch advanced nothing (empty batch, or every record
        // failed / could not be positioned) — the diagnostic must record that
        // honestly rather than substitute a clock value.
        watermark_attempted: batchWatermark ? batchWatermark.toISOString() : null,
        watermark_listing_key_attempted: batchListingKey,
        advance_watermark: advanceWatermark,
        records_in_batch: fetchResult.records.length,
        upserted,
        errors,
        skipped_gates: skippedGates,
        skipped_validation: skippedValidation,
        duration_ms: durationMs,
      },
    );
  }

  // Flush this run's buffered system diagnostics: ≤ cap full rows (highest-
  // count first, each carrying its occurrence count) + one summary row for
  // the remainder. Prevents the per-record failure burst (see
  // lib/idx/diagnostic-recorder.ts). Best-effort — never throws.
  await flushSyncDiagnostics(prisma as unknown as DiagnosticAuditWriter, {
    run_bucket: options.since ? options.since.toISOString() : "full",
    since: options.since ? options.since.toISOString() : null,
    full_sync: options.fullSync || false,
    type: options.type || "all",
  });

  // ── Building-Neon-wake clustering (AFTER the SyncState upsert, OUTSIDE its
  // try/catch): refill manifest shards while the compute is already awake
  // for this run. Only on a FULLY SUCCESSFUL run; failures are counted,
  // never thrown — feed state is already committed above and cannot be
  // advanced, blocked, or corrupted from here. Scope B (2026-07-24): ONLY
  // the shards whose listings physically changed are warmed; when no
  // manifest-affecting change happened the warm is SKIPPED ENTIRELY (zero
  // manifest reads — the acceptance gate's "zero full-manifest warm when no
  // public manifest field changed").
  let buildingManifestWarm: ManifestWarmResult | null = null;
  const sortedAffectedShards = [...affectedManifestShards].sort();
  if (errors === 0 && sortedAffectedShards.length > 0) {
    try {
      buildingManifestWarm = await warmBuildingManifestShards(sortedAffectedShards);
      console.log('[IDX Sync] building-manifest warm:', {
        shards: sortedAffectedShards,
        ...buildingManifestWarm,
      });
    } catch (warmErr) {
      // Defense-in-depth: warmBuildingManifestShards never throws by design.
      console.error('[IDX Sync] building-manifest warm-up error (non-fatal):', warmErr);
      buildingManifestWarm = null;
    }
  } else if (errors === 0) {
    console.log('[IDX Sync] building-manifest warm skipped: no manifest-affecting shard changed this run');
  }

  // Phase-1 forensic (flag-gated): ONE compact line to runtime logs per ACTIVE
  // cycle — never audit_events. Emit EVEN on a zero-change cycle (empty top20,
  // zero sample) so the ≥3-cycle capture distinguishes a quiet cycle from missing
  // instrumentation (Codex). Names + counts only.
  if (diagRawDataKeys) {
    const top20 = [...rawDataChangedKeyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, count]) => ({ key, count }));
    console.log(
      "[IDX Sync][diag] raw_data_only changed-key histogram (top20, names+counts only): " +
        JSON.stringify({
          raw_data_only_writes_sampled: rawDataOnlyWritesSampled,
          distinct_keys: rawDataChangedKeyCounts.size,
          top20,
        }),
    );
  } else if (
    diagUntilRaw &&
    Number.isFinite(diagUntil) &&
    Date.now() >= diagUntil &&
    Date.now() < diagUntil + DIAG_EXPIRY_GRACE_MS
  ) {
    // Configured-but-expired: emit the "window closed" notice ONLY within the
    // bounded grace window after the cutoff (so the evidence collector learns the
    // window ended), then go fully SILENT — no indefinite ~144/day noise (Codex).
    // Invalid/unset timestamps are silent (Number.isFinite guard).
    console.log(
      "[IDX Sync][diag] raw_data key histogram WINDOW CLOSED — DIAG_RAW_DATA_KEYS_UNTIL " +
        "passed (silent after grace): " + JSON.stringify(diagUntilRaw),
    );
  }

  // Durable idx_sync AuditEvent — written AFTER the warm so the changes
  // payload carries the warm + canary + change-reason counters (the audit
  // previously ran before the warm, which is why building_manifest_warm
  // never reached audit_events — Maya-approved allowlist fix, 2026-07-24).
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
          // Phase 3 write-suppression accounting (physical writes only).
          write_paths: {
            listings: listingCounters,
            projections: projectionCounters,
            batch_media: batchMediaCounters,
            building_manifest_warm: buildingManifestWarm,
          },
          // Change-reason attribution + targeted-warm evidence (2026-07-24).
          listing_change_reasons: listingChangeReasons,
          projection_change_reasons: projectionChangeReasons,
          affected_manifest_shards: sortedAffectedShards,
          manifest_canary: manifestCanary,
          // One Cycle W1 — bounded aggregate revalidation counters.
          pages_revalidated: revalidation.pages_revalidated,
          revalidation_failures: revalidation.revalidation_failures,
        } as unknown as Prisma.InputJsonValue,
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
    skipped_new_terminal: skippedNewTerminal,
    skipped_new_terminal_sample: skippedNewTerminalSample,
    errors,
    duration_ms: durationMs,
    write_paths: {
      listings: listingCounters,
      projections: projectionCounters,
      batch_media: batchMediaCounters,
      revalidation,
      building_manifest_warm: buildingManifestWarm,
      manifest_canary: manifestCanary,
      listing_change_reasons: listingChangeReasons,
      projection_change_reasons: projectionChangeReasons,
      affected_manifest_shards: sortedAffectedShards,
    },
  };

  // INVARIANT (Maya 2026-07-05): the guard PREVENTS creating never-active terminal rows.
  // skipped_new_terminal is the count it blocked this run (expected > 0 on a live feed with
  // closures — that is the guard working). If the guard were ever removed, these rows would
  // be CREATED instead and the DB candidate count would grow — caught by the health:probe
  // "Feed-bloat invariant" cell and the post-sync recount in the cleanup validation plan.
  // Sample listing_ids are logged for investigation.
  if (skippedNewTerminal > 0) {
    console.warn(
      `[IDX Sync] INVARIANT: prevented creation of ${skippedNewTerminal} never-active terminal/off-market listings ` +
        `(feed-wide closures never active on our site). sample listing_ids: ${skippedNewTerminalSample.join(", ")}`,
    );
  }

  console.log("[IDX Sync] Complete:", result);

  return result;
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

  const dbCursor = latest?.modification_timestamp ?? null;
  if (!dbCursor) return null;

  // Correction 4 — error-run clamp (fail-closed retry window): when the last
  // sync run FAILED, syncListings persisted SyncState.last_watermark as the
  // contiguous-success watermark (capped below the earliest failed record).
  // The DB-derived cursor (MAX modification_timestamp) may have advanced PAST
  // that failed record via later successful upserts in the same batch, which
  // would permanently exclude it from the `gt since` incremental filter. The
  // clamp only ever LOWERS the cursor (legacy now-based watermarks are newer
  // than the DB cursor and are ignored), and only while the last run status
  // is non-ok. Best-effort: a SyncState read failure falls back to the DB
  // cursor (same behavior as before this fix).
  try {
    const state = await prisma.syncState.findUnique({
      where: { resource: "Property" },
      select: { last_watermark: true, last_run_status: true },
    });
    if (
      state &&
      state.last_run_status !== null &&
      state.last_run_status !== "ok" &&
      state.last_watermark &&
      state.last_watermark < dbCursor
    ) {
      return state.last_watermark;
    }
  } catch {
    // fall through to the DB cursor
  }

  return dbCursor;
}

/** A Property incremental resume position: timestamp plus its tie-breaker. */
export interface PropertyKeysetCursor {
  since: Date | null;
  listingKey: string | null;
}

/**
 * Read the Property incremental resume position, with a SAFE bootstrap.
 *
 * WHY THE STORED WATERMARK IS NOT TRUSTED AS A POSITION
 *
 * Until 2026-08-13 the writer seeded `batchWatermark = now`, so every healthy
 * run persisted `SyncState.last_watermark` as LOCAL WALL CLOCK. Live proof:
 * `last_watermark === last_run_at` to the millisecond, sitting 3m52.821s ahead
 * of MAX(listings.modification_timestamp). Resuming from that value would skip
 * every record whose true provider MT falls in the gap — silent data loss.
 *
 * THE DISCRIMINATOR
 *
 * `last_listing_key` is written ONLY by the corrected keyset writer (the column
 * did not exist before, and the legacy writer never populates it). So:
 *
 *   last_listing_key NOT NULL -> the row was written by the new writer, whose
 *                                `last_watermark` is a real provider instant ->
 *                                trust (last_watermark, last_listing_key)
 *   last_listing_key IS NULL  -> legacy / first run -> bootstrap from
 *                                MAX(listings.modification_timestamp), which is
 *                                exactly today's behaviour and is derived from
 *                                data we actually stored
 *
 * The poisoned wall-clock value is therefore never used as a resume position,
 * and no manual rewind is required to deploy this: the first corrected run
 * bootstraps from stored data and writes a genuine position.
 *
 * KNOWN, DELIBERATE LIMITATION — this cursor is forward-only. A record that
 * enters the feed carrying an OLD ModificationTimestamp (below the current
 * position) is not reachable by any cursor value and must be recovered by a
 * state-based backlog drain, not by rewinding this cursor. The same structural
 * gap is already observable on the media lane, where 97 displayable listings
 * carry source PhotosChangeTimestamps below the live media cursor and are
 * therefore invisible to it (docs/audits/listing-media-reader-ownership-2026-08-13.md §4.1).
 */
export async function getPropertyKeysetCursor(): Promise<PropertyKeysetCursor> {
  let listingKey: string | null = null;
  let keysetWatermark: Date | null = null;
  try {
    const state = await prisma.syncState.findUnique({
      where: { resource: "Property" },
      select: { last_watermark: true, last_listing_key: true },
    });
    if (state?.last_listing_key && state.last_watermark) {
      keysetWatermark = state.last_watermark;
      listingKey = state.last_listing_key;
    }
  } catch {
    // Best-effort: fall back to the DB-derived cursor below, which is the
    // pre-keyset behaviour and cannot be worse than it.
  }

  if (keysetWatermark) return { since: keysetWatermark, listingKey };

  // Bootstrap / legacy path — unchanged semantics, no tie-breaker to offer.
  return { since: await getLastSyncTimestamp(), listingKey: null };
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

  // Phase 3 write-suppression counters (physical writes only).
  const listingCounters = newWritePathCounters();
  const projectionCounters = newWritePathCounters();
  const batchMediaCounters = newWritePathCounters();

  // Change-reason attribution (2026-07-24) — same contract as syncListings.
  const listingChangeReasons = newListingChangeReasonCounters();
  const projectionChangeReasons = newProjectionChangeReasonCounters();

  // One Cycle W1 — see syncListings.
  const revalidation = newRevalidationCounters();
  const changedCacheTags = new Set<string>();

  for (const raw of fetchResult.records) {
    let writeStage: "listing" | "projection" = "listing";
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
      // Phase C: strip the legacy agent_info JSON from the create spread; the 8 typed
      // columns remain in typedOnlyMapped. mapped.agent_info stays in memory for the
      // UPDATE branch's typed derivation below.
      const { agent_info: _agentInfoJson, ...typedOnlyMapped } = mapped;
      // Archive eligibility clock (#415): set terminal_since on the non-terminal→terminal
      // transition. CREATE uses previousStatus=undefined; UPDATE fetches the existing
      // status so a historical Closed/Expired/Withdrawn record that flips an existing
      // (e.g. Active) row IS captured on the update branch (Codex #446) — not left NULL.
      // Never bumped on terminal→terminal re-sync; cleared on terminal→active.
      // Phase 3: widened to LISTING_SYNC_COMPARE_SELECT so an unchanged
      // re-emit can be verified and suppressed (see syncListings).
      const existingForClock = await prisma.listing.findUnique({
        where: { listing_id: mapped.listing_id },
        select: LISTING_SYNC_COMPARE_SELECT,
      });
      const terminalSinceCreate = computeTerminalSincePatch({
        previousStatus: undefined,
        newStatus: mapped.status,
        raw_data: mapped.raw_data as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        // #446: ExpirationDate is in PRIVATE_FIELDS, so mapped.raw_data has it stripped.
        // Feed the original un-stripped Trestle record's ExpirationDate as the Expired
        // fallback (NOT persisted) so a Trestle Expired listing seeds terminal_since from
        // its actual expiration date, not the sync wall-clock.
        expirationDateFallback: raw.ExpirationDate as string | undefined,
      });
      const terminalSinceUpdate = computeTerminalSincePatch({
        previousStatus: existingForClock?.status,
        newStatus: mapped.status,
        raw_data: mapped.raw_data as Record<string, unknown>,
        features: mapped.features as Record<string, unknown>,
        // #446: ExpirationDate is in PRIVATE_FIELDS, so mapped.raw_data has it stripped.
        // Feed the original un-stripped Trestle record's ExpirationDate as the Expired
        // fallback (NOT persisted) so a Trestle Expired listing seeds terminal_since from
        // its actual expiration date, not the sync wall-clock.
        expirationDateFallback: raw.ExpirationDate as string | undefined,
      });
      // #415 rehydration guard (see syncListings): an already-archived row must not be
      // re-hydrated / un-archived by an agent-history re-sync either.
      const agentUpdateData = guardArchivedRehydration({
        agent_id: options.agentDbId,
        mls_id: mapped.mls_id,
        status: mapped.status,
        ...terminalSinceUpdate,
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
        ...mediaUpdatePatch(mapped.media, useExpandMedia),
        // S1 (#445 Codex P1): OMIT compliance on UPDATE so CRM/syndication-authored
        // keys (validation_result, approvals) are preserved — never stomped to {}.
        ...complianceUpdatePatch(),
        // Phase C: agent_info JSON no longer persisted; only the 8 typed columns,
        // still derived from the in-memory mapped.agent_info.
        ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
        raw_data: mapped.raw_data as Prisma.InputJsonValue,
        modification_timestamp: mapped.modification_timestamp,
        listing_contract_date: mapped.listing_contract_date,
        last_synced_from_trestle: mapped.last_synced_from_trestle,
        sync_status: mapped.sync_status,
      }, existingForClock);

      // Phase 3 (surface A, agent-history path): same suppression contract as
      // syncListings — unchanged re-emits skip the physical write; attribution
      // (agent_id) is material, so a first-time agent link still writes.
      listingCounters.rows_checked++;
      const suppressAgentListingWrite =
        existingForClock !== null &&
        listingUpdateMateriallyUnchanged(
          agentUpdateData as Record<string, unknown>,
          existingForClock as unknown as Record<string, unknown>,
        );
      if (suppressAgentListingWrite) {
        listingCounters.rows_suppressed_unchanged++;
      } else {
        await prisma.listing.upsert({
          where: { listing_id: mapped.listing_id },
          create: {
            ...typedOnlyMapped,
            agent_id: options.agentDbId,
            list_price: mapped.list_price,
            living_area: mapped.living_area,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            media: mapped.media as Prisma.InputJsonValue,
            compliance: mapped.compliance as Prisma.InputJsonValue,
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
            ...terminalSinceCreate,
          },
          update: agentUpdateData,
        });
        if (existingForClock) {
          listingCounters.rows_materially_changed++;
          listingCounters.rows_updated++;
        } else {
          listingCounters.rows_inserted++;
        }
        upserted++;
        // Change-reason attribution + provenance-only invalidation skip —
        // same contract as syncListings (2026-07-24).
        const changeReasons = existingForClock
          ? classifyListingChangeReasons(
              agentUpdateData as Record<string, unknown>,
              existingForClock as unknown as Record<string, unknown>,
            )
          : null;
        if (changeReasons) {
          for (const reason of changeReasons) listingChangeReasons[reason]++;
        }
        if (!changeReasons || !isProvenanceOnlyChange(changeReasons)) {
          // Canonical tag set — shared with the listing/media writers so the
          // EXPIRED tags cannot diverge again.
          //
          // This function performs no manifest WARMING (it has no
          // `affectedManifestShards` accumulator and never did), so the shard
          // list is collected into a local sink and discarded. Behaviour is
          // therefore unchanged here; only the tag computation is now shared.
          // Wiring warming into this path would be scope creep, not a fix.
          recordPublicListingChange(
            mapped.listing_id,
            existingForClock?.address,
            mapped.address,
            changedCacheTags,
            new Set<string>(),
          );
        }
      }

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
      // Phase 3 (surface B, agent-history path): full-material projection
      // compare before writing — see syncListings.
      writeStage = "projection";
      const projection = buildListingSearchProjectionFromListing(projectionInput);
      projectionCounters.rows_checked++;
      const existingProjection = (await prisma.listingSearchProjection.findUnique({
        where: { listing_id: mapped.listing_id },
        select: PROJECTION_MATERIAL_SELECT,
      })) as Record<string, unknown> | null;
      if (existingProjection && projectionRowSearchVisiblyEqual(existingProjection, projection)) {
        // Scope D (2026-07-24) — see syncListings: a source-timestamp-only
        // bump keeps the old projection row (revision clock stays on the
        // listing row) and invalidates nothing.
        projectionCounters.rows_suppressed_unchanged++;
        if (!projectionRowMateriallyEqual(existingProjection, projection)) {
          projectionChangeReasons.source_timestamp_only++;
        }
      } else {
        const projectionPayload = buildProjectionUpsertPayload(projection);
        await prisma.listingSearchProjection.upsert(projectionPayload);
        if (existingProjection) {
          projectionCounters.rows_materially_changed++;
          projectionCounters.rows_updated++;
          projectionChangeReasons.search_visible_fields++;
        } else {
          projectionCounters.rows_inserted++;
        }
      }

      agentMatched++;
    } catch (err) {
      errors++;
      if (writeStage === "projection") {
        projectionCounters.rows_failed++;
      } else {
        listingCounters.rows_failed++;
      }
      const listingId = String(raw.ListingId || raw.SourceSystemKey || "unknown");
      console.error(`[IDX Agent History] Error upserting listing ${listingId}:`, err);
    }
  }

  // ── Batch-fetch media for listings without inline media ──
  // Correction 1: same decoupled gate as syncListings — processed records,
  // not physical writes.
  if (!useExpandMedia && listingCounters.rows_checked > 0) {
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
        // Batches whose Media fetch could not be PROVEN complete. Counted, not merged, so a run
        // that silently skipped reconciliation is distinguishable from one that had nothing to do —
        // the same accounting syncListings keeps.
        let agentMediaBatchesIncompleteSkipped = 0;

        for (let i = 0; i < listingsNeedMedia.length; i += BATCH_SIZE) {
          const batch = listingsNeedMedia.slice(i, i + BATCH_SIZE).filter(Boolean);
          if (batch.length === 0) continue;

          const idFilter = batch.map((key) => `ResourceRecordKey eq '${key.replace(/'/g, "''")}'`).join(" or ");
          // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
          const mediaFilter = `(${idFilter}) and MediaStatus ne 'Deleted'`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          mediaParams.set("$select", "ResourceRecordKey,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus,MediaKey");
          mediaParams.set("$orderby", "ResourceRecordKey asc,Order asc");
          // `$top` is a PAGE-SIZE HINT ONLY. It was previously the whole budget: a single
          // un-paginated request capped at `batch.length * 30` across the WHOLE batch, with only
          // `data.value` processed. Because `$orderby` sorts globally, the cap dropped the
          // highest-ordered rows ACROSS listings — observed live: 10 of 15 photo-heavy listings
          // received ZERO rows and one got 31 of 94, and those truncated arrays were WRITTEN.
          mediaParams.set("$top", String(batch.length * 30));

          try {
            // COMPLETENESS via the SHARED follower — the same `paginateMedia` syncListings and
            // media-sync use. One nextLink implementation, one runaway guard, one definition of
            // "complete". No second pagination loop.
            //
            // `complete: false` (a page failed, or the runaway guard tripped) means a requested key
            // absent from the rows is NOT proven empty at source, so this batch performs NO
            // reconciliation and NO write at all. Fail closed — a partial array must never be
            // persisted, and MediaKey cannot repair one because a short array differs in LENGTH and
            // is material regardless.
            const { rows: mediaRows, complete } = await paginateMedia(
              `${TRESTLE_API}/odata/Media?${mediaParams.toString()}`,
              async (url: string) => {
                const _mc = new AbortController();
                const _mt = setTimeout(() => _mc.abort(), 15_000);
                try {
                  const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                    signal: _mc.signal,
                  });
                  if (!res.ok) throw new Error(`Media page HTTP ${res.status}`);
                  const data = await res.json();
                  return {
                    value: (data.value || []) as unknown[],
                    nextLink: (data["@odata.nextLink"] as string | undefined) ?? null,
                  };
                } finally {
                  clearTimeout(_mt);
                }
              },
            );
            if (!complete) {
              agentMediaBatchesIncompleteSkipped++;
              continue; // incomplete ⇒ never clear, never tombstone, never write a partial array
            }

            const mediaByKey = new Map<string, { url: string; mediaType: string; order: number; mediaKey?: string }[]>();
            // PRE-SEED every REQUESTED key so a complete-but-empty result is an AUTHORITATIVE `[]`
            // rather than vanishing from the map — the same contract syncListings uses. Only
            // reachable once the fetch proved COMPLETE.
            for (const key of batch) mediaByKey.set(String(key), []);
            for (const m of mediaRows as unknown as Record<string, unknown>[]) {
              const lid = String(m.ResourceRecordKey || "");
              if (!lid || !m.MediaURL) continue;
              if (!mediaByKey.has(lid)) mediaByKey.set(lid, []);
              // Use shared classifier — see classifyTrestleMediaCategory in
              // lib/media/media-sync-service.ts for the floor-plan-as-photo
              // bug this replaces.
              const mediaType = classifyTrestleMediaCategory(m.MediaCategory as string | null | undefined);
              const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
              // Same stable-identity fix as the syncListings batch above: supply the RESO MediaKey
              // so the comparator's authoritative branch is reachable instead of the URL leg, which
              // Cotality's rotating path signature defeats on every cycle. Omitted when absent so an
              // unknown key degrades into the existing URL fallback.
              //
              // (The batch-wide `$top` truncation this comment used to flag is FIXED above: this
              // path now follows every @odata.nextLink through the shared `paginateMedia` and fails
              // closed on an incomplete fetch.)
              const mediaKey = typeof m.MediaKey === "string" ? m.MediaKey.trim() : "";
              mediaByKey.get(lid)!.push({
                ...(mediaKey ? { mediaKey } : {}),
                url: String(m.MediaURL),
                mediaType,
                order: isPreferred ? -1 : Number(m.Order ?? 0),
              });
            }

            // Convert ResourceRecordKey back to listing_id via map.
            // Phase 3 (surface D): same suppression as the syncListings batch —
            // rotating signed URLs are not identity; unchanged media skips the write.
            for (const [key, media] of mediaByKey) {
              const listingId = agentKeyToIdMap.get(key) || key;
              batchMediaCounters.rows_checked++;
              try {
                const existingMediaRow = await prisma.listing.findFirst({
                  // #415: archived-safe filter — an archived row must not have its media re-hydrated.
                  where: archivedSafeMediaWhere(listingId),
                  select: { media: true },
                });
                if (!existingMediaRow) {
                  batchMediaCounters.rows_suppressed_unchanged++;
                  continue;
                }
                if (mediaArraysMateriallyEqual(existingMediaRow.media, media)) {
                  batchMediaCounters.rows_suppressed_unchanged++;
                  continue;
                }
                batchMediaCounters.rows_materially_changed++;
                await prisma.listing.updateMany({
                  where: archivedSafeMediaWhere(listingId),
                  data: { media: media as unknown as Prisma.InputJsonValue },
                });
                batchMediaCounters.rows_updated++;
                changedCacheTags.add(listingCacheTag(listingId)); // W1
              } catch (mediaRowErr) {
                batchMediaCounters.rows_failed++;
                console.warn(
                  `[IDX Agent History] Media write failed for ${listingId}:`,
                  mediaRowErr instanceof Error ? mediaRowErr.message : mediaRowErr,
                );
              }
            }
          } catch (mediaErr) {
            console.warn(`[IDX Agent History] Media batch ${i / BATCH_SIZE + 1} failed:`, mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }
        console.log(
          `[IDX Agent History] Media batch-fetch complete (incomplete batches skipped: ${agentMediaBatchesIncompleteSkipped})`,
        );
      }
    } catch (mediaSyncErr) {
      console.warn("[IDX Agent History] Media sync failed (non-fatal):", mediaSyncErr instanceof Error ? mediaSyncErr.message : mediaSyncErr);
    }
  }

  const durationMs = Date.now() - startTime;

  // One Cycle W1 — see syncListings.
  if (changedCacheTags.size > 0) {
    changedCacheTags.add(SEARCH_CACHE_TAG);
    safeRevalidateTags(changedCacheTags, revalidation);
  }

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
          // Change-reason attribution (2026-07-24) — same contract as idx_sync.
          listing_change_reasons: listingChangeReasons,
          projection_change_reasons: projectionChangeReasons,
        } as unknown as Prisma.InputJsonValue,
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
    write_paths: {
      listings: listingCounters,
      projections: projectionCounters,
      batch_media: batchMediaCounters,
      revalidation,
    },
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
