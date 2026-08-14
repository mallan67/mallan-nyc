#!/usr/bin/env tsx
/**
 * CANONICAL MEDIA RECOVERY — the proven 97-listing residual (state-based drain).
 *
 * WHY THIS EXISTS (measured, not hypothesised)
 * --------------------------------------------
 * 97 publicly-displayable listings carry a non-empty legacy `listings.media`
 * JSON but have ZERO ACTIVE `listing_media` rows (93 never imported, 4 only
 * tombstoned). Every one of them carries a NON-NULL
 * `raw_data->>'PhotosChangeTimestamp'` at source, and every one of those values
 * is BELOW the live media cursor (`media_sync_state.last_photos_change`).
 *
 * The media lane selects Property rows by a COMPARISON predicate on
 * PhotosChangeTimestamp in all branches (`buildPropertyQuery`,
 * lib/idx/media-sync.ts:3259), so a forward-only cursor can never revisit
 * them. A cursor rewind is therefore the wrong instrument: it would re-drain
 * the entire feed behind the watermark to reach 97 rows, and it would move a
 * cursor other lanes depend on. This executor instead selects by STATE
 * ("displayable AND zero active media rows") and NEVER touches a cursor.
 *
 * WHAT IT REUSES (no second media authority — CLAUDE.md §A.2 charter)
 * ------------------------------------------------------------------
 *   - `upsertListingMedia`         (lib/idx/media-sync.ts:1034) — row reconciliation
 *   - `updateListingMediaSummary`  (lib/idx/media-sync.ts:1760) — the 4 summary
 *     columns AND the single cache invalidation they own
 *   - `defaultFetchDeps.fetchMedia`(lib/idx/media-sync.ts:3380) — the ONLY
 *     provider fetch that follows `@odata.nextLink` to exhaustion and THROWS on
 *     an incomplete page walk (lib/idx/media-pagination.ts:49). That throw is
 *     what makes `tombstoneVanished: true` safe; this script reuses the
 *     guarantee rather than reimplementing it.
 *   - `isMallanExclusiveListing`   (lib/listings/exclusive-agent-assignment.ts:110)
 *   - `assertCanonicalHost`        (lib/retention/drain-core.ts:41)
 *   - `getAccessToken`             (lib/idx/auth.ts:36) for the key lookup
 *
 * THE LISTINGKEY PROBLEM (measured 2026-08-13 on the live residual)
 * -----------------------------------------------------------------
 * Media is queried by `ResourceRecordKey` = `Property.ListingKey`, and NONE of
 * the 97 rows carries one locally: `raw_data->>'ListingKey'` survives on 0 of
 * them and `mls_id` equals `listing_id` on all 97. Resolving from local columns
 * alone would skip the entire population, so the drain first performs a
 * BATCHED Property lookup (`ListingId eq 'A' or ListingId eq 'B' ...`,
 * <=15 ids per request per the URL-length limit at lib/idx/sync.ts:1231) to
 * obtain the real keys. Live-verified: 5/5 sampled ids resolved, and the
 * returned key resolved Media (e.g. RLS10941846 -> 1092342380 -> 5 media rows).
 * A ListingId that the Property lookup does not return stays UNRESOLVED and its
 * listing is skipped untouched — Media is never queried by a ListingId.
 *
 * It NEVER writes `listings.media` — that column is not an authority and
 * media-sync's own boundary contract says it never writes it.
 *
 * SAFETY POSTURE
 * --------------
 *   1. DRY RUN by default. Writing needs `--execute` AND
 *      `--confirm=RECOVER-RESIDUAL-MEDIA` AND a production-environment guard.
 *   2. Canonical-endpoint guard runs FIRST, in BOTH modes (a plan computed
 *      against the stale morning-bread copy would be a fiction).
 *   3. Bounded only: per-run cap `RECOVERY_RUN_CAP`, plus a campaign-wide
 *      `RECOVERY_TOTAL_CAP` that REFUSES the run when the candidate universe is
 *      larger than the proven residual. There is no unbounded mode.
 *   4. Zero cursor writes. This module deliberately contains no reference to
 *      `media_sync_state` / `sync_state` / `advanceMediaSyncCursor`.
 *
 * Usage:
 *   npx tsx scripts/recover-residual-listing-media.ts                       # DRY RUN
 *   npx tsx scripts/recover-residual-listing-media.ts --limit=25            # DRY RUN, smaller slice
 *   npx tsx scripts/recover-residual-listing-media.ts --execute --confirm=RECOVER-RESIDUAL-MEDIA
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  upsertListingMedia,
  updateListingMediaSummary,
  newSummaryWriteCounters,
  defaultFetchDeps,
  type UpsertListingMediaInput,
} from "@/lib/idx/media-sync";
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";
import { CRM_MEDIA_KEY_PREFIX } from "@/lib/media/crm-media";
import { assertCanonicalHost } from "@/lib/retention/drain-core";
import { getAccessToken } from "@/lib/idx/auth";

// ─── Bounds + tokens ────────────────────────────────────────────────────────

/**
 * The three publicly-displayable statuses the residual was measured against.
 * Deliberately NOT `buildSearchDisplayWhere()`: that gate also suppresses
 * Mallan RLS return-copies and applies four further columns, which would change
 * the population away from the one that was actually proven. The Mallan and
 * archive exclusions this script needs are applied explicitly below.
 */
export const RESIDUAL_DISPLAYABLE_STATUSES = [
  "Active",
  "ActiveUnderContract",
  "ComingSoon",
] as const;

/** Hard per-run ceiling. The proven residual is 97, so 100 drains it in one pass. */
export const RECOVERY_RUN_CAP = 100;

/**
 * Campaign-wide ceiling on the CANDIDATE UNIVERSE, not on one run.
 *
 * If the state-based query ever offers more than this, the population is no
 * longer the proven 97-row residual — something else changed (a feed outage
 * that emptied `listing_media`, a bad tombstone sweep). Draining blind at that
 * point would turn a bounded repair into an unbounded re-ingest, so the run
 * REFUSES and reports. Fail-closed by design.
 */
export const RECOVERY_TOTAL_CAP = 200;

/** Intent token for `--confirm`. Names the action, so a copy-pasted flag from another script cannot arm this one. */
export const RECOVERY_CONFIRM_TOKEN = "RECOVER-RESIDUAL-MEDIA";

/**
 * Max ListingIds per batched Property key-lookup request.
 *
 * 15 is not a tuning choice — it is the measured Trestle limit already
 * documented at lib/idx/sync.ts:1231: a batch of 50 produced ~2,700-char OData
 * URLs that Trestle rejects with 400, silently zeroing the media backfill for
 * days (diagnosed 2026-04-24 against the live feed). 15 keeps the URL under
 * ~1,000 chars. With the 100-row run cap that is at most 7 requests.
 */
export const PROPERTY_KEY_LOOKUP_CHUNK = 15;

// ─── Selection ──────────────────────────────────────────────────────────────

/** The columns the drain needs. `media` itself is NOT selected — see below. */
export const RESIDUAL_SELECT = {
  listing_id: true,
  status: true,
  idx_display_yn: true,
  rls_eligible: true,
  sync_status: true,
  mls_id: true,
  raw_data: true,
} as const;

/** Structural shape of a selected candidate (avoids importing generated Prisma payload types). */
export interface ResidualCandidate {
  listing_id: string;
  status: string;
  idx_display_yn: boolean;
  rls_eligible: boolean;
  sync_status: string | null;
  mls_id: string | null;
  raw_data: unknown;
}

/**
 * The STATE-BASED residual predicate. No timestamp, no cursor — that is the
 * whole point: every one of these rows sits below the media watermark, so no
 * comparison predicate on PhotosChangeTimestamp can ever surface them again.
 *
 * `idx_display_yn: true` is exactly `IS NOT DISTINCT FROM true` here: the column
 * is `Boolean @default(true)` NOT NULL (prisma/schema.prisma:468), so there is
 * no NULL state for the two to disagree about.
 *
 * `NOT [{ media: {equals: []} }, { media: {equals: {}} }]` is the "non-empty
 * legacy media JSON" test — the same Json-filter shape already in production at
 * app/api/cron/data-retention/route.ts:234. The `media` payload itself is NOT
 * selected: with a 100-row cap the drain would otherwise pull megabytes of JSON
 * it never reads (the authority is Cotality, not this column).
 *
 * Mallan-owned and archived rows are excluded DB-side here AND re-checked in
 * code (defense in depth — a where-clause typo must not become a silent
 * rehydration of a Mallan exclusive).
 */
export function buildResidualCandidateWhere(): Prisma.ListingWhereInput {
  return {
    status: { in: [...RESIDUAL_DISPLAYABLE_STATUSES] },
    idx_display_yn: true,
    // Archived rows are stripped one-way (lib/retention/archive-terminals.ts);
    // rehydrating one would resurrect media for a row the retention policy
    // deliberately emptied.
    sync_status: { not: "archived" },
    // ZERO ACTIVE media rows — the defining half of the residual.
    listing_media: { none: { status: "active" } },
    // Non-empty legacy media JSON — the other defining half (these listings
    // demonstrably HAD photos; they are not genuinely photo-less rows).
    NOT: [{ media: { equals: [] } }, { media: { equals: {} } }],
    // Mallan-owned rows are out of scope: 0 of the 97 are Mallan-owned, and
    // Mallan media is CRM-authored, never Trestle-authoritative.
    listing_id: { not: { startsWith: "SL-" } },
    AND: [{ listing_id: { not: { startsWith: "RL-" } } }, { rls_eligible: { not: false } }],
  };
}

/**
 * THE one rule for "is this value usable as a `Media.ResourceRecordKey`?".
 *
 * Trestle contract (lib/idx/fetch.ts:568): `Property.ListingKey =
 * Media.ResourceRecordKey`, and `ResourceRecordID` (= ListingId) is NOT unique
 * across MLOs. `defaultFetchMedia` filters on `ResourceRecordKey eq '<key>'`
 * (lib/idx/media-sync.ts:3352), so handing it a ListingId returns an EMPTY set
 * that is structurally indistinguishable from "this listing has no media" —
 * and an empty COMPLETE set is allowed to clear. A wrong key therefore
 * manufactures a false-authoritative deletion.
 *
 * Hence three fail-closed rejections, applied to EVERY source (local column and
 * Property lookup alike, so the two paths cannot hold different opinions):
 *   - not a string / not present  → unusable
 *   - blank after trim            → unusable
 *   - equal to the ListingId      → that IS the ListingId, not a key
 */
export function normalizeResourceKey(candidate: unknown, listingId: string): string | null {
  const key = typeof candidate === "string" ? candidate.trim() : "";
  if (key === "") return null;
  if (key === listingId) return null;
  return key;
}

/**
 * Resolve the `Media.ResourceRecordKey` from data ALREADY on the listing row.
 *
 *   1. `raw_data.ListingKey` — the source field itself.
 *   2. `mls_id` — set to `ListingKey || listingId` by lib/idx/mapping.ts:302,
 *      so it is a usable ListingKey ONLY when it differs from `listing_id`
 *      (equal means the ListingKey fallback fired and we have no real key).
 *
 * Returns null when neither is provable. MEASURED 2026-08-13 against the live
 * residual: all 97 rows return null here — `raw_data.ListingKey` survives on 0
 * of them (it is shed by the ordinary sync path, cf.
 * scripts/audit-property-historical-gap.ts:20) and `mls_id` equals `listing_id`
 * on all 97. That is why the batched Property lookup below exists: without it
 * this drain is a guaranteed no-op, not a repair.
 */
export function resolveMediaResourceKey(listing: {
  listing_id: string;
  mls_id?: string | null;
  raw_data?: unknown;
}): string | null {
  const raw = listing.raw_data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const fromRaw = normalizeResourceKey(
      (raw as Record<string, unknown>).ListingKey,
      listing.listing_id,
    );
    if (fromRaw !== null) return fromRaw;
  }
  return normalizeResourceKey(listing.mls_id, listing.listing_id);
}

/** Split ids into chunks of at most `size` (the OData URL-length bound). */
export function chunkListingIds(listingIds: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < listingIds.length; i += size) chunks.push(listingIds.slice(i, i + size));
  return chunks;
}

/**
 * Batched Property-side ListingId → ListingKey lookup (ONE request per chunk).
 *
 * Live-verified 2026-08-13: `GET /odata/Property?$filter=(ListingId eq 'A' or
 * ListingId eq 'B' ...)&$select=ListingId,ListingKey` returns 200 with the key
 * for each id, and that key then resolves Media by `ResourceRecordKey`.
 *
 * `$top` is pinned to the batch size: without it the service default page size
 * could silently truncate a 15-id batch, and a missing id is treated as
 * "unresolved" — a silent truncation would look like "this listing does not
 * exist" and skip rows that were perfectly resolvable. Ids ABSENT from the
 * response are simply absent from the returned map; the caller skips them
 * untouched rather than guessing.
 *
 * Chunking is the CALLER's job (so it is observable/testable); this function
 * refuses an over-long batch rather than silently emitting a URL Trestle 400s.
 */
export async function defaultFetchListingKeys(
  listingIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (listingIds.length === 0) return out;
  if (listingIds.length > PROPERTY_KEY_LOOKUP_CHUNK) {
    throw new Error(
      `Property key lookup batch of ${listingIds.length} exceeds PROPERTY_KEY_LOOKUP_CHUNK=${PROPERTY_KEY_LOOKUP_CHUNK}.`,
    );
  }

  const token = await getAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  const filter = listingIds.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(" or ");
  const params = new URLSearchParams();
  params.set("$filter", `(${filter})`);
  params.set("$select", "ListingId,ListingKey");
  params.set("$top", String(listingIds.length));

  const res = await fetch(`${TRESTLE_API}/odata/Property?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Property key lookup failed: HTTP ${res.status}`);
  const data = (await res.json()) as { value?: Array<Record<string, unknown>> };

  for (const row of data.value ?? []) {
    const id = row.ListingId == null ? "" : String(row.ListingId);
    if (id === "") continue;
    // Coerced to string but NOT validated here — `normalizeResourceKey` is the
    // single validator, so a blank/absent key is rejected in exactly one place.
    out.set(id, row.ListingKey == null ? null : String(row.ListingKey));
  }
  return out;
}

// ─── CLI parsing + guards ───────────────────────────────────────────────────

export interface RecoveryArgs {
  execute: boolean;
  confirm: string | null;
  limit: number;
}

/**
 * Strict parse. An unknown flag is a REFUSAL, not a shrug: a typo'd
 * `--dry-run` on a script whose default is dry-run is harmless, but a typo'd
 * `--limit` silently draining 100 instead of 5 is not.
 */
export function parseRecoveryArgs(argv: string[]): RecoveryArgs {
  let execute = false;
  let confirm: string | null = null;
  let limit = RECOVERY_RUN_CAP;

  for (const arg of argv) {
    if (arg === "--execute") {
      execute = true;
    } else if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length);
    } else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--json") {
      // accepted, no-op: telemetry is ALWAYS emitted as JSON
    } else {
      throw new Error(`Unknown flag '${arg}' — refusing to run.`);
    }
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  if (limit > RECOVERY_RUN_CAP) {
    throw new Error(`--limit ${limit} exceeds the hard per-run cap RECOVERY_RUN_CAP=${RECOVERY_RUN_CAP}.`);
  }
  return { execute, confirm, limit };
}

/** The env keys the production guard reads. Structural so tests can pass a literal. */
export interface RecoveryEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
}

/**
 * Production-environment guard for the WRITE path (fail-closed at every step).
 *
 * A dry run may execute anywhere; a write may not. "Undeterminable" is refused,
 * never assumed:
 *   - no connection string at all  → refuse (nothing to verify)
 *   - `NODE_ENV === 'test'`        → refuse (a test process must never be able
 *                                     to reach production, no matter what env
 *                                     leaked into it)
 *   - `VERCEL_ENV` present and not `production` → refuse (preview/dev builds)
 *   - host not canonical cold-waterfall → refuse, via the SAME parsed-hostname
 *     guard the archive drain uses (lib/retention/drain-core.ts:41). It rejects
 *     the stale royal-dawn/morning-bread endpoint by name and treats a
 *     malformed/absent host as fatal.
 */
export function assertProductionEnvironment(env: RecoveryEnv): void {
  if (env.NODE_ENV === "test") {
    throw new Error("FATAL: refusing --execute under NODE_ENV=test. Aborting.");
  }
  if (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "production") {
    throw new Error(`FATAL: refusing --execute under VERCEL_ENV='${env.VERCEL_ENV}' (production only). Aborting.`);
  }
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || "";
  if (url === "") {
    throw new Error("FATAL: no DATABASE_URL / DATABASE_URL_UNPOOLED — target undeterminable. Aborting.");
  }
  assertCanonicalHost(url);
}

/** Arms the write path only when intent + environment BOTH check out. Dry run needs neither. */
export function assertExecuteAllowed(args: RecoveryArgs, env: RecoveryEnv): void {
  if (!args.execute) return;
  if (args.confirm !== RECOVERY_CONFIRM_TOKEN) {
    throw new Error(`FATAL: --execute requires --confirm=${RECOVERY_CONFIRM_TOKEN}. Aborting.`);
  }
  assertProductionEnvironment(env);
}

// ─── Dry-run planner ────────────────────────────────────────────────────────

export interface ListingRecoveryPlan {
  listing_id: string;
  resource_record_key: string;
  /** Media rows the provider returned (COMPLETE set — the fetch throws otherwise). */
  fetched: number;
  /** Distinct admissible media_keys (the rows that will reach create/update). */
  admitted: number;
  /** Rows rejected before any DB work: no MediaKey, non-Public Permission, no MediaURL. */
  invalid: number;
  /** Incoming rows carrying `MediaStatus='Deleted'`. */
  delete_signals: number;
  expected_inserts: number;
  expected_updates: number;
  expected_deletes: number;
}

/**
 * Read-only forecast of what `upsertListingMedia` WOULD do — requirement:
 * a dry run must print the EXACT per-listing insert/update/delete counts.
 *
 * The admission filter below mirrors lib/idx/media-sync.ts:1046-1069 exactly
 * (missing MediaKey → invalid, `MediaStatus='Deleted'` → delete signal,
 * non-Public Permission → invalid, missing MediaURL → invalid). It is a
 * FORECAST ONLY and is never a writer — production admission stays owned by the
 * one function in media-sync.
 *
 * WHY "row exists ⇒ update" is exact rather than approximate: the selection
 * guarantees this listing has ZERO ACTIVE `listing_media` rows, and
 * `listingMediaRowUnchanged` (media-sync.ts:877) returns true only when the
 * stored row is BOTH `status='active'` AND on the same `listing_id`. A
 * non-active row fails the first clause; an active row must belong to some
 * OTHER listing (we have none) and fails the second. So no existing row can be
 * classified "unchanged", every one takes the material-write branch, and the
 * forecast cannot drift from the executor.
 *
 * Duplicate MediaKeys inside one response are collapsed (first occurrence
 * wins): `listing_media.media_key` is `@unique` (prisma/schema.prisma:2382), so
 * duplicates can only ever land on ONE physical row — which is what these
 * counts describe.
 */
export async function planListingRecovery(
  listingId: string,
  resourceRecordKey: string,
  mediaRows: UpsertListingMediaInput[],
): Promise<ListingRecoveryPlan> {
  const admitted: string[] = [];
  const admittedSeen = new Set<string>();
  const deleteKeys = new Set<string>();
  let invalid = 0;
  let deleteSignals = 0;

  for (const raw of mediaRows) {
    const mediaKey = raw.MediaKey ? String(raw.MediaKey) : null;
    if (!mediaKey) {
      invalid++;
      continue;
    }
    if (raw.MediaStatus === "Deleted") {
      deleteSignals++;
      deleteKeys.add(mediaKey);
      continue;
    }
    if (raw.Permission != null && String(raw.Permission) !== "Public") {
      invalid++;
      continue;
    }
    if (!raw.MediaURL) {
      invalid++;
      continue;
    }
    if (!admittedSeen.has(mediaKey)) {
      admittedSeen.add(mediaKey);
      admitted.push(mediaKey);
    }
  }

  let expectedInserts = 0;
  let expectedUpdates = 0;
  for (const mediaKey of admitted) {
    const existing = await prisma.listingMedia.findUnique({
      where: { media_key: mediaKey },
      select: { listing_id: true, status: true },
    });
    if (existing) expectedUpdates++;
    else expectedInserts++;
  }

  // Tombstone forecast — the two `updateMany` where-shapes at
  // media-sync.ts:1330-1362, counted instead of written.
  let expectedDeletes = 0;
  if (deleteKeys.size > 0) {
    expectedDeletes += await prisma.listingMedia.count({
      where: { listing_id: listingId, status: "active", media_key: { in: [...deleteKeys] } },
    });
  }
  const seenKeys = new Set<string>([...admitted, ...deleteKeys]);
  expectedDeletes += await prisma.listingMedia.count({
    where:
      seenKeys.size === 0
        ? {
            listing_id: listingId,
            status: "active",
            NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } },
          }
        : {
            listing_id: listingId,
            status: "active",
            media_key: { notIn: [...seenKeys] },
            NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } },
          },
  });

  return {
    listing_id: listingId,
    resource_record_key: resourceRecordKey,
    fetched: mediaRows.length,
    admitted: admitted.length,
    invalid,
    delete_signals: deleteSignals,
    expected_inserts: expectedInserts,
    expected_updates: expectedUpdates,
    expected_deletes: expectedDeletes,
  };
}

// ─── Executor ───────────────────────────────────────────────────────────────

export interface ResidualRecoveryOptions {
  /** DEFAULT FALSE. Nothing is written unless this is explicitly true. */
  execute?: boolean;
  /** Per-run cap; must be 1..RECOVERY_RUN_CAP. Defaults to RECOVERY_RUN_CAP. */
  limit?: number;
  /**
   * The ONLY injected dependency. Production passes
   * `defaultFetchDeps.fetchMedia`, whose resolve GUARANTEES a complete
   * `@odata.nextLink` walk and whose throw means "incomplete — do not clear".
   * Everything else (row reconciliation, summary, invalidation) is the
   * canonical media-sync code path, called for real.
   */
  fetchMedia: (resourceRecordKey: string) => Promise<UpsertListingMediaInput[]>;
  /**
   * Batched Property-side ListingId → ListingKey lookup. Receives AT MOST
   * `PROPERTY_KEY_LOOKUP_CHUNK` ids per call (the executor owns the chunking so
   * the batching is observable). Ids the provider does not return are treated
   * as unresolved and their listings are skipped untouched.
   */
  fetchListingKeys: (listingIds: string[]) => Promise<Map<string, string | null>>;
  /** Per-listing plan sink (dry run prints one JSON line per listing). */
  log?: (line: string) => void;
}

export interface ResidualRecoveryTelemetry {
  mode: "dry-run" | "execute";
  cap: number;
  /** Size of the whole candidate universe (guards RECOVERY_TOTAL_CAP). */
  candidate_total: number;
  selected: number;
  fetched: number;
  rows_inserted: number;
  rows_updated: number;
  rows_tombstoned: number;
  /** Reconciliation total from upsertListingMedia (inserts + updates + refreshes + tombstones). */
  rows_physical_writes: number;
  listings_recovered: number;
  listings_unchanged: number;
  skipped_mallan: number;
  skipped_archived: number;
  /** Fail-closed skip: no provable ListingKey, so no authoritative Media query exists. */
  skipped_no_resource_key: number;
  /** Batched Property requests issued to resolve missing ListingKeys. */
  property_key_lookups: number;
  /** Listings whose ListingKey came only from the Property lookup. */
  keys_resolved_via_property_lookup: number;
  /** Property lookup batches that errored — every listing in them skips untouched. */
  failed_property_key_lookup: number;
  failed_incomplete_fetch: number;
  /** Per-row write failures inside upsertListingMedia — listing left partial, summary skipped. */
  failed_write: number;
  failed_summary: number;
  /** Invalidation EVENTS: one per listing whose summary materially changed. */
  cache_invalidations: number;
  pages_revalidated: number;
  revalidation_failures: number;
  /** Structural zero: this module never references media_sync_state / sync_state. */
  cursor_writes: 0;
  plan: ListingRecoveryPlan[];
}

function emptyTelemetry(mode: "dry-run" | "execute", cap: number): ResidualRecoveryTelemetry {
  return {
    mode,
    cap,
    candidate_total: 0,
    selected: 0,
    fetched: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_tombstoned: 0,
    rows_physical_writes: 0,
    listings_recovered: 0,
    listings_unchanged: 0,
    skipped_mallan: 0,
    skipped_archived: 0,
    skipped_no_resource_key: 0,
    property_key_lookups: 0,
    keys_resolved_via_property_lookup: 0,
    failed_property_key_lookup: 0,
    failed_incomplete_fetch: 0,
    failed_write: 0,
    failed_summary: 0,
    cache_invalidations: 0,
    pages_revalidated: 0,
    revalidation_failures: 0,
    cursor_writes: 0,
    plan: [],
  };
}

/**
 * One bounded pass over the residual.
 *
 * Three phases, in this order (any step failing leaves the listing untouched
 * and the run continues — one bad listing must not strand the other 96):
 *
 *   A. Guards + local key resolution. Archived and Mallan rows are dropped
 *      HERE, before anything is sent to Cotality, so an excluded listing_id
 *      never appears in a provider query.
 *   B. ONE batched Property lookup per <=15 unresolved ids. This is a
 *      per-run fixed cost (<=7 requests at the 100-row cap), not per listing.
 *   C. Per listing: COMPLETE Media fetch → [dry run: forecast] |
 *      [execute: upsertListingMedia → updateListingMediaSummary].
 *
 * The fetch sits BEFORE any write on purpose: an incomplete page walk throws
 * (lib/idx/media-pagination.ts:49 → media-sync.ts:3364), so a listing whose
 * media could not be fully read never reaches `upsertListingMedia` at all and
 * therefore cannot be cleared or tombstoned by a partial view of the truth.
 */
export async function recoverResidualListingMedia(
  options: ResidualRecoveryOptions,
): Promise<ResidualRecoveryTelemetry> {
  const execute = options.execute === true;
  const limit = options.limit ?? RECOVERY_RUN_CAP;
  if (!Number.isInteger(limit) || limit <= 0 || limit > RECOVERY_RUN_CAP) {
    throw new Error(`limit must be an integer in 1..${RECOVERY_RUN_CAP} (got ${limit}).`);
  }
  const log = options.log ?? ((line: string) => console.log(line));
  const telemetry = emptyTelemetry(execute ? "execute" : "dry-run", limit);

  const where = buildResidualCandidateWhere();

  // TOTAL CAP first: measure the universe before touching any of it.
  telemetry.candidate_total = await prisma.listing.count({ where });
  if (telemetry.candidate_total > RECOVERY_TOTAL_CAP) {
    throw new Error(
      `REFUSING: ${telemetry.candidate_total} residual candidates exceeds RECOVERY_TOTAL_CAP=${RECOVERY_TOTAL_CAP}. ` +
        "This is no longer the proven 97-row residual — investigate before draining.",
    );
  }

  const candidates = (await prisma.listing.findMany({
    where,
    select: RESIDUAL_SELECT,
    orderBy: { listing_id: "asc" },
    take: limit,
  })) as unknown as ResidualCandidate[];
  telemetry.selected = candidates.length;

  // ── Phase A — guards, then local key resolution ──────────────────────────
  const prepared: { listing: ResidualCandidate; resourceRecordKey: string | null }[] = [];
  for (const listing of candidates) {
    // Defense in depth: the where-clause already excludes both, but a silent
    // rehydration of an archived row or a Mallan exclusive is not a failure
    // mode worth trusting to one layer. Placed BEFORE the Property lookup so
    // an excluded listing_id is never sent to Cotality either.
    if (listing.sync_status === "archived") {
      telemetry.skipped_archived++;
      continue;
    }
    if (isMallanExclusiveListing(listing)) {
      telemetry.skipped_mallan++;
      continue;
    }
    prepared.push({ listing, resourceRecordKey: resolveMediaResourceKey(listing) });
  }

  // ── Phase B — ONE batched Property lookup per <=15 unresolved ids ─────────
  const needLookup = prepared
    .filter((p) => p.resourceRecordKey === null)
    .map((p) => p.listing.listing_id);
  if (needLookup.length > 0) {
    const looked = new Map<string, string | null>();
    for (const chunk of chunkListingIds(needLookup, PROPERTY_KEY_LOOKUP_CHUNK)) {
      telemetry.property_key_lookups++;
      try {
        for (const [id, key] of await options.fetchListingKeys(chunk)) looked.set(id, key);
      } catch {
        // A failed batch resolves NOTHING. Its listings stay unresolved and are
        // skipped untouched below — never downgraded to a ListingId query.
        telemetry.failed_property_key_lookup++;
      }
    }
    for (const p of prepared) {
      if (p.resourceRecordKey !== null) continue;
      // `looked.get` returns undefined for an id the provider omitted and null
      // for one it returned blank; `normalizeResourceKey` rejects both, plus a
      // "key" that is really the ListingId.
      const resolved = normalizeResourceKey(looked.get(p.listing.listing_id), p.listing.listing_id);
      if (resolved !== null) {
        p.resourceRecordKey = resolved;
        telemetry.keys_resolved_via_property_lookup++;
      }
    }
  }

  // ── Phase C — per-listing drain ──────────────────────────────────────────
  for (const { listing, resourceRecordKey } of prepared) {
    if (resourceRecordKey === null) {
      telemetry.skipped_no_resource_key++;
      continue;
    }

    let mediaRows: UpsertListingMediaInput[];
    try {
      mediaRows = await options.fetchMedia(resourceRecordKey);
    } catch {
      // INCOMPLETE ⇒ UNKNOWN. Nothing cleared, nothing tombstoned, no summary
      // write, no invalidation. The listing simply stays as it was.
      telemetry.failed_incomplete_fetch++;
      continue;
    }
    telemetry.fetched += mediaRows.length;

    if (!execute) {
      const plan = await planListingRecovery(listing.listing_id, resourceRecordKey, mediaRows);
      telemetry.plan.push(plan);
      telemetry.rows_inserted += plan.expected_inserts;
      telemetry.rows_updated += plan.expected_updates;
      telemetry.rows_tombstoned += plan.expected_deletes;
      const material = plan.expected_inserts + plan.expected_updates + plan.expected_deletes;
      telemetry.rows_physical_writes += material;
      if (material === 0) telemetry.listings_unchanged++;
      else telemetry.listings_recovered++;
      log(JSON.stringify({ plan }));
      continue;
    }

    const upsert = await upsertListingMedia(listing.listing_id, mediaRows, {
      // No Property row was fetched in this lane, so there is no real
      // PhotosChangeTimestamp to record. `photos_change_ts_snapshot` is
      // write-only provenance excluded from the comparator
      // (media-sync.ts:679 doc), so null is honest and costs nothing;
      // fabricating a timestamp would plant false provenance.
      photosChangeTsSnapshot: null,
      // SAFE: the fetch above resolved, which by contract means the COMPLETE
      // current Media set (media-sync.ts:2946-2949).
      tombstoneVanished: true,
    });

    telemetry.rows_inserted += upsert.inserted;
    telemetry.rows_updated += upsert.updatedChanged + upsert.deliveryUrlRefreshed;
    telemetry.rows_tombstoned += upsert.tombstoned;
    telemetry.rows_physical_writes += upsert.physicalWrites;

    if (upsert.writeFailures > 0) {
      // Same fail-closed posture as runMediaSync (media-sync.ts:3789): a
      // partially-persisted listing must not get a summary written over it.
      telemetry.failed_write++;
      continue;
    }

    const summary = newSummaryWriteCounters();
    const revalidation = { pages_revalidated: 0, revalidation_failures: 0 };
    try {
      await updateListingMediaSummary(listing.listing_id, { counters: summary, revalidation });
    } catch {
      telemetry.failed_summary++;
      continue;
    }
    telemetry.pages_revalidated += revalidation.pages_revalidated;
    telemetry.revalidation_failures += revalidation.revalidation_failures;
    // ONE invalidation per materially-changed summary — the summary writer
    // revalidates if and only if it wrote (media-sync.ts:1822-1844), so this
    // counts events, it does not add a second invalidation path.
    if (summary.rows_materially_changed > 0) telemetry.cache_invalidations++;

    if (upsert.physicalWrites === 0 && summary.rows_materially_changed === 0) {
      telemetry.listings_unchanged++;
    } else {
      telemetry.listings_recovered++;
    }
  }

  return telemetry;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function main(argv: string[], env: RecoveryEnv): Promise<ResidualRecoveryTelemetry> {
  // Host guard FIRST and in BOTH modes: a dry-run plan computed against the
  // stale morning-bread copy would be a confident fiction.
  assertCanonicalHost(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || "");

  const args = parseRecoveryArgs(argv);
  assertExecuteAllowed(args, env);

  const telemetry = await recoverResidualListingMedia({
    execute: args.execute,
    limit: args.limit,
    fetchMedia: defaultFetchDeps.fetchMedia,
    fetchListingKeys: defaultFetchListingKeys,
  });
  console.log(JSON.stringify(telemetry, null, 2));
  return telemetry;
}

// Guarded exactly like scripts/audit/reconcile-execute.ts:225 so the module can
// be imported by tests without running a drain.
if (process.env.NODE_ENV !== "test") {
  void main(process.argv.slice(2), process.env as RecoveryEnv)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      await prisma.$disconnect();
      process.exit(1);
    });
}
