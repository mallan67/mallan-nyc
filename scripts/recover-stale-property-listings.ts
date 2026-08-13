/**
 * BOUNDED PROPERTY STALENESS RECOVERY EXECUTOR.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Measured on production (read-only, 2026-08-13):
 *   - 4,536 of 8,411 local ACTIVE listings have `last_synced_from_trestle`
 *     older than 7 days (oldest 2026-03-28).
 *   - ALL 4,536 have `modification_timestamp` STRICTLY BELOW the bootstrap
 *     cursor `MAX(listings.modification_timestamp)`; zero sit at or above it.
 *   - A complete ID-level census proved ZERO provider Active-ish listings are
 *     missing locally (8,379/8,379 present).
 *
 * The consequence is structural, not transient. The Property resume position is
 * a FORWARD-ONLY keyset over (ModificationTimestamp, ListingKey) ASC
 * (lib/idx/sync.ts:1463 `advanceCursor`, lib/idx/cursor/keyset-cursor.ts). A
 * forward-only cursor can only ever reach records at or ahead of its position,
 * so it can NEVER revisit a record whose ModificationTimestamp is behind it. No
 * number of incremental cycles will refresh these 4,536 rows.
 *
 * And it is a REFRESH problem, not an import problem: nothing is missing. So the
 * fix is a bounded, state-selected re-read — NOT a cursor rewind (which would
 * re-traverse the whole feed and re-open the 2026-08-13 write-amplification
 * regression) and NOT a re-import (nothing to import).
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * This executor MUST NEVER TOUCH `sync_state`. Not `last_watermark`, not
 * `last_listing_key`, not `last_run_at`. `sync_state.Property` is ONE position
 * over ONE ordered universe (lib/idx/sync.ts:580 — "WHO MAY MOVE THE GLOBAL
 * PROPERTY CURSOR"). This run traverses a LOCAL-STATE universe (rows ordered by
 * our own `last_synced_from_trestle`), which says nothing about a position in
 * the provider's (MT, ListingKey) order. Writing any position from here would
 * declare provider records processed that this run never fetched, and the next
 * incremental pass would resume past them — manufacturing exactly the
 * unreachable-tail defect this script exists to repair. The prohibition is
 * proven by test, not by comment (tests/runtime/property-staleness-recovery.test.ts).
 *
 * It also never CREATES a listing: every selected row provably exists and the
 * census proved zero missing rows, so the write is `prisma.listing.update`, not
 * `upsert`. An UPDATE structurally cannot turn a bounded refresh into an import.
 *
 * ── POLICY REUSE ─────────────────────────────────────────────────────────────
 *
 * There is no second mapper here. Every mapping / gating / suppression decision
 * is delegated to the SAME exported helpers the canonical ingest uses, so this
 * path cannot hold a different opinion than lib/idx/sync.ts:
 *   fetchSingleListing            lib/idx/fetch.ts:226
 *   validateRequiredFields        lib/idx/trestle-mapper.ts:1286
 *   checkDistributionGates        lib/idx/trestle-mapper.ts:1244
 *   mapTrestleToPrisma            lib/idx/trestle-mapper.ts:930
 *   shouldSkipNewTerminalListing  lib/idx/sync.ts:90
 *   guardArchivedRehydration      lib/idx/sync.ts:191
 *   mediaUpdatePatch              lib/idx/sync.ts:106
 *   complianceUpdatePatch         lib/idx/sync.ts:131
 *   classifyListingChangeReasons  lib/idx/write-suppression.ts:694
 *   isProvenanceOnlyChange        lib/idx/write-suppression.ts:736
 *   listingUpdateMateriallyUnchanged lib/idx/write-suppression.ts:190
 *   publicListingChangeTags       lib/cache/public-listing-change-tags.ts:50
 *   dualWriteProjectionForListingId  lib/search/listing-search-projection.ts:728
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 *
 * DRY RUN IS THE DEFAULT and performs zero writes and zero cache invalidation.
 * Writing requires ALL THREE of: `--execute`, `--confirm=<RECOVERY_CONFIRM_TOKEN>`,
 * and the production-environment declaration (see PRODUCTION_ENV_VAR). Every run
 * — dry run included — additionally refuses unless the resolved DATABASE_URL
 * host is the canonical production endpoint.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   npm run ops:recover-stale-listings -- --total=50                 # DRY RUN
 *   npm run ops:recover-stale-listings -- --total=50 --batch=25      # DRY RUN
 *   RECOVERY_TARGET_ENV=production npm run ops:recover-stale-listings -- \
 *     --total=500 --batch=250 --execute --confirm=<token>            # WRITES
 *
 * `--total` is REQUIRED and must be an explicit finite positive integer. There
 * is no unbounded mode: `--total=all` / `--total=Infinity` are refused, and a
 * total larger than the measured backlog is refused.
 */

import prisma from "@/lib/prisma";
import { fetchSingleListing } from "@/lib/idx/fetch";
import {
  mapTrestleToPrisma,
  checkDistributionGates,
  validateRequiredFields,
} from "@/lib/idx/trestle-mapper";
import {
  shouldSkipNewTerminalListing,
  guardArchivedRehydration,
  mediaUpdatePatch,
  complianceUpdatePatch,
} from "@/lib/idx/sync";
import {
  LISTING_SYNC_COMPARE_SELECT,
  listingUpdateMateriallyUnchanged,
  classifyListingChangeReasons,
  isProvenanceOnlyChange,
} from "@/lib/idx/write-suppression";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { computeDomTransition } from "@/lib/compliance/dom-tracker";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { publicListingChangeTags } from "@/lib/cache/public-listing-change-tags";
import {
  SEARCH_CACHE_TAG,
  newRevalidationCounters,
  safeRevalidateTags,
} from "@/lib/cache/public-cache";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { isCanonicalNeonHost, CANONICAL_NEON_HOST_SUBSTRING } from "@/lib/ops/canonical-neon-target";
import type { Prisma } from "@prisma/client";

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * The `--confirm` value. Deliberately long, dated and un-guessable-by-habit so
 * it cannot be produced by muscle memory or by a shell-history arrow-up from an
 * unrelated command; the operator has to read THIS file to run a write.
 */
export const RECOVERY_CONFIRM_TOKEN = "RECOVER-STALE-PROPERTY-2026-08-13";

/**
 * Hard ceiling on rows selected per batch. CLAMPED, never rejected: a fat-finger
 * `--batch=5000` must degrade to a safe run, not abort a recovery mid-backlog.
 * 500 also matches MAX_PAGE_SIZE in lib/idx/fetch.ts:28.
 */
export const MAX_BATCH_SIZE = 500;
export const DEFAULT_BATCH_SIZE = 250;
export const DEFAULT_STALE_DAYS = 7;

/**
 * Production-environment declaration. Script-SPECIFIC on purpose: `NODE_ENV` and
 * `VERCEL_ENV` are set incidentally by build tooling and by `vercel dev`, so a
 * gate keyed on them can be satisfied by accident. This one cannot — the
 * operator has to type the word "production" for a run that writes to
 * production.
 */
export const PRODUCTION_ENV_VAR = "RECOVERY_TARGET_ENV";
export const PRODUCTION_ENV_VALUE = "production";

/**
 * The recoverable status set (requirement: state-based selection). Exactly the
 * display-eligible statuses — a terminal row that already went stale is the
 * retention drain's business (lib/retention/), not this executor's.
 */
export const RECOVERABLE_STATUSES: readonly string[] = [
  "Active",
  "ActiveUnderContract",
  "ComingSoon",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Types ───────────────────────────────────────────────────────────────────

/** The eight required per-batch counters. Mutually exclusive: they sum to `selected`. */
export interface RecoveryCounters {
  selected: number;
  fetched: number;
  /** In DRY RUN this is the WOULD-write count; no write is issued. */
  written: number;
  suppressed_provenance_only: number;
  suppressed_unchanged: number;
  skipped_archived: number;
  skipped_new_terminal: number;
  failed: number;
}

export interface RecoveryBatchTelemetry extends RecoveryCounters {
  batch: number;
  duration_ms: number;
}

export interface RecoveryReport {
  mode: "dry-run" | "execute";
  stale_days: number;
  stale_before: string;
  backlog: number;
  requested_total: number;
  batch_size: number;
  batches: RecoveryBatchTelemetry[];
  totals: RecoveryCounters;
  /** Cache tags expired for materially-changed rows (empty in dry run). */
  revalidated_tags: string[];
  revalidation_failures: number;
  duration_ms: number;
}

/**
 * Only the string-keyed reads the guards perform. Deliberately NOT
 * `NodeJS.ProcessEnv`: that type requires `NODE_ENV`, which would force every
 * caller (and every guard test) to supply an unrelated key just to type-check.
 * `process.env` is assignable to this.
 */
export type RecoveryEnv = Record<string, string | undefined>;

export interface RecoveryOptions {
  execute: boolean;
  confirm: string | null;
  /** REQUIRED explicit finite positive integer. No unbounded mode exists. */
  total: number;
  batchSize: number;
  staleDays: number;
  /** Injected for tests; production reads process.env. */
  env?: RecoveryEnv;
  /** Injected for tests so the stale window is deterministic. */
  now?: Date;
}

/** One row's terminal outcome. Exactly one is produced per selected row. */
type RowOutcome =
  | "written"
  | "suppressed_provenance_only"
  | "suppressed_unchanged"
  | "skipped_archived"
  | "skipped_new_terminal"
  | "failed";

// ── Argument parsing (exported so the refusals are testable) ────────────────

export interface ParsedArgs {
  execute: boolean;
  confirm: string | null;
  total: number;
  batchSize: number;
  staleDays: number;
}

function readFlag(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

/**
 * Strict integer parse. `Number("Infinity")` is a number and `parseInt("50abc")`
 * is 50 — both would silently widen the blast radius, so neither form is
 * accepted here.
 */
function parseStrictPositiveInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${label} must be a plain positive integer; received "${raw}".`);
  }
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${label} must be a finite positive integer; received "${raw}".`);
  }
  return n;
}

/** Clamp to MAX_BATCH_SIZE. Never exceeds; never throws. */
export function clampBatchSize(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), MAX_BATCH_SIZE);
}

export function parseRecoveryArgs(argv: readonly string[]): ParsedArgs {
  const totalRaw = readFlag(argv, "total");
  if (totalRaw === null) {
    throw new Error(
      "--total=<n> is REQUIRED. There is no unbounded mode: a recovery run must " +
        "state up front how many rows it may touch.",
    );
  }
  const total = parseStrictPositiveInt(totalRaw, "--total");

  const batchRaw = readFlag(argv, "batch");
  const batchSize = clampBatchSize(
    batchRaw === null ? DEFAULT_BATCH_SIZE : parseStrictPositiveInt(batchRaw, "--batch"),
  );

  const daysRaw = readFlag(argv, "days");
  const staleDays = daysRaw === null ? DEFAULT_STALE_DAYS : parseStrictPositiveInt(daysRaw, "--days");

  return {
    execute: argv.includes("--execute"),
    confirm: readFlag(argv, "confirm"),
    total,
    batchSize,
    staleDays,
  };
}

// ── Guards ──────────────────────────────────────────────────────────────────

/** Unpooled first — same precedence the other ops scripts use (scripts/backfill-terminal-since.ts:36). */
export function resolveDatabaseUrl(env: RecoveryEnv): string | null {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || "";
  return url.length > 0 ? url : null;
}

/**
 * Refuse any run — dry run included — whose target is not the canonical
 * production endpoint. Delegates to lib/ops/canonical-neon-target.ts, which is
 * the single source of truth for the canonical/forbidden host lists and already
 * refuses `ep-royal-dawn-ad6eh8t2` (morning-bread, STALE/DO-NOT-SERVE per
 * CLAUDE.md) explicitly and fails closed on an empty/undetermined host.
 *
 * The URL is NEVER echoed into the error — it carries credentials.
 */
export function assertCanonicalTarget(env: RecoveryEnv): void {
  const url = resolveDatabaseUrl(env);
  if (url === null) {
    throw new Error(
      "Refusing to run: the target database host cannot be determined " +
        "(DATABASE_URL_UNPOOLED / DATABASE_URL are unset or empty). Fail closed.",
    );
  }
  if (!isCanonicalNeonHost(url)) {
    throw new Error(
      `Refusing to run: the resolved database host is not the canonical production ` +
        `endpoint (${CANONICAL_NEON_HOST_SUBSTRING}). The legacy ep-royal-dawn-ad6eh8t2 / ` +
        `morning-bread project is STALE / DO-NOT-SERVE and is refused explicitly.`,
    );
  }
}

/**
 * Every condition required before a single row may be written. Called ONLY on
 * the `--execute` path; a dry run never reaches it, which is why a dry run can
 * never be one missing flag away from a write.
 */
export function assertWriteAuthorized(options: RecoveryOptions, env: RecoveryEnv): void {
  if (options.confirm !== RECOVERY_CONFIRM_TOKEN) {
    throw new Error(
      "Refusing to execute: --confirm=<token> is missing or does not match the token " +
        "defined in scripts/recover-stale-property-listings.ts.",
    );
  }
  if (env[PRODUCTION_ENV_VAR] !== PRODUCTION_ENV_VALUE) {
    throw new Error(
      `Refusing to execute: ${PRODUCTION_ENV_VAR}=${PRODUCTION_ENV_VALUE} is not set. ` +
        "A run that writes to production must declare that it targets production.",
    );
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

/**
 * STATE-BASED selection — deliberately NOT cursor-based.
 *
 * The whole defect is that the provider keyset cursor cannot reach these rows,
 * so re-deriving selection from that cursor would select nothing. Selection is
 * therefore local state only: an eligible status plus a `last_synced_from_trestle`
 * older than the window.
 *
 * NULL `last_synced_from_trestle` is OUTSIDE this predicate (SQL `NULL < x` is
 * NULL, not TRUE). That is intentional and load-bearing: the SAME predicate
 * feeds the backlog `count` and every `findMany`, so the cap can never be
 * exceeded by a row the count did not see. Never-synced rows are a different
 * population and a different remediation.
 */
export function buildStaleWhere(staleDays: number, now: Date): Prisma.ListingWhereInput {
  return {
    status: { in: [...RECOVERABLE_STATUSES] },
    last_synced_from_trestle: { lt: new Date(now.getTime() - staleDays * MS_PER_DAY) },
  };
}

/** Intra-run pagination position. Never persisted, never a provider position. */
interface LocalPage {
  lastSynced: Date;
  listingId: string;
}

/**
 * Shape of one selected row. Annotated explicitly rather than inferred: the
 * `findMany` argument depends on the local page, which is derived from the
 * previous batch's rows, and TypeScript reports that as a circular initializer
 * (TS7022) unless the loop variable's type is pinned here.
 */
interface SelectedRow {
  listing_id: string;
  last_synced_from_trestle: Date | null;
}

/**
 * Intra-run keyset predicate over (last_synced_from_trestle, listing_id).
 *
 * WHY THIS IS REQUIRED: `last_synced_from_trestle` is in
 * LISTING_NON_MATERIAL_UPDATE_FIELDS (lib/idx/write-suppression.ts:80), so a row
 * whose content did not change is SUPPRESSED and its staleness clock never
 * advances. Suppression is the expected majority outcome. Without a local
 * position the second `findMany` would return the byte-identical first page
 * forever — an all-suppressed livelock, the same shape as the all-skip cursor
 * livelock documented at lib/idx/sync.ts:855.
 *
 * `listing_id` is the tie-breaker because `last_synced_from_trestle` is not
 * unique — a bulk-stamped cluster without a tie-breaker can re-serve or skip
 * rows across pages.
 */
function afterLocalPage(page: LocalPage): Prisma.ListingWhereInput {
  return {
    OR: [
      { last_synced_from_trestle: { gt: page.lastSynced } },
      {
        last_synced_from_trestle: page.lastSynced,
        listing_id: { gt: page.listingId },
      },
    ],
  };
}

// ── Per-row recovery ────────────────────────────────────────────────────────

/**
 * Trestle exposes `Permission` (singular) or the legacy `Permissions`. Mirrors
 * `readTrestlePermissions` at lib/idx/sync.ts:252, which is module-private. This
 * is a two-key field read, not a mapper — the mapping itself stays in
 * mapTrestleToPrisma.
 */
function readTrestlePermissions(raw: Record<string, unknown>): string | null {
  if (typeof raw.Permission === "string") return raw.Permission;
  if (typeof raw.Permissions === "string") return raw.Permissions;
  return null;
}

interface RowResult {
  outcome: RowOutcome;
  fetched: boolean;
  /** Cache tags to expire — populated only for a written row. */
  tags: string[];
}

async function recoverOneListing(
  listingId: string,
  execute: boolean,
): Promise<RowResult> {
  const raw = await fetchSingleListing(listingId);
  if (raw === null) {
    // `fetchSingleListing` returns null for BOTH "no such record" and "HTTP
    // error / rate limited" (lib/idx/fetch.ts:252-278) and the caller cannot
    // tell them apart. Fail closed: an indistinguishable outcome is never a
    // resolved one, so the row stays in the backlog for a later run.
    console.error(`[recover-stale] fetch returned no record for ${listingId}`);
    return { outcome: "failed", fetched: false, tags: [] };
  }

  const validation = validateRequiredFields(raw);
  if (!validation.valid) {
    // syncListings counts this separately (skipped_validation, lib/idx/sync.ts:711).
    // This executor has no such bucket by design: a record we cannot validate is
    // a record we did NOT recover, so it belongs in `failed` where it stays
    // visible instead of being reported as a benign skip.
    console.error(
      `[recover-stale] ${listingId} failed required-field validation: ${validation.missingFields.join(", ")}`,
    );
    return { outcome: "failed", fetched: true, tags: [] };
  }

  const gates = checkDistributionGates(raw);
  const mapped = mapTrestleToPrisma(raw);
  if (!gates.displayable) mapped.sync_status = `gated:${gates.reason}`;

  const existing = await prisma.listing.findUnique({
    where: { listing_id: mapped.listing_id },
    select: LISTING_SYNC_COMPARE_SELECT,
  });

  // Policy preserved verbatim (lib/idx/sync.ts:841): a never-tracked listing
  // arriving terminal must not be created.
  if (shouldSkipNewTerminalListing(existing, mapped.status)) {
    return { outcome: "skipped_new_terminal", fetched: true, tags: [] };
  }
  if (!existing) {
    // Selection guarantees the row existed moments ago, and the ID census proved
    // zero missing listings — so a null here is a concurrent delete, not an
    // import gap. Creating it would silently turn a bounded refresh into an
    // import path. Refuse.
    console.error(`[recover-stale] ${listingId} vanished between selection and read; not creating.`);
    return { outcome: "failed", fetched: true, tags: [] };
  }

  const statusChanged = existing.status !== mapped.status;
  const statusTransition = statusChanged
    ? computeDomTransition(
        {
          status: existing.status,
          status_changed_at: existing.status_changed_at,
          first_active_date: existing.first_active_date,
          days_on_market: existing.days_on_market,
          // Historical permissions are not persisted — conservative, matches
          // lib/idx/sync.ts:803.
          permissions: null,
        },
        mapped.status,
        readTrestlePermissions(raw),
      )
    : {};

  const terminalSinceUpdate = computeTerminalSincePatch({
    previousStatus: existing.status,
    newStatus: mapped.status,
    raw_data: mapped.raw_data as Record<string, unknown>,
    features: mapped.features as Record<string, unknown>,
    // ExpirationDate is stripped from mapped.raw_data by PRIVATE_FIELDS (#446),
    // so the un-stripped provider record supplies the Expired fallback.
    expirationDateFallback: raw.ExpirationDate as string | undefined,
  });

  const candidateUpdate = {
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
    // `false` — this path never expands Media, so writing mapped.media ([]) would
    // WIPE existing media (lib/idx/sync.ts:106). Media refill is the media lane's job.
    ...mediaUpdatePatch(mapped.media, false),
    // Omits `compliance` so CRM/syndication-authored keys survive (#445 S1).
    ...complianceUpdatePatch(),
    ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
    raw_data: mapped.raw_data as Prisma.InputJsonValue,
    modification_timestamp: mapped.modification_timestamp,
    listing_contract_date: mapped.listing_contract_date,
    last_synced_from_trestle: mapped.last_synced_from_trestle,
    sync_status: mapped.sync_status,
    ...statusTransition,
  };

  const listingUpdateData = guardArchivedRehydration(candidateUpdate, existing);
  // guardArchivedRehydration returns the INPUT REFERENCE when it does not guard
  // and a NEW object when it strips (lib/idx/sync.ts:191 "returns a NEW object
  // when guarding"), so reference identity is the guard's own verdict — not a
  // second opinion about what "archived" means.
  const archivedGuardApplied = listingUpdateData !== candidateUpdate;
  if (archivedGuardApplied) {
    // Stricter than syncListings, which writes the stripped payload. A bulk
    // backfill re-touching archived rows is precisely the strip -> rehydrate ->
    // re-strip churn #415 exists to prevent, and an archived row is by
    // definition not part of the displayable inventory this recovery serves.
    // The GUARD still decides: a canonical-active re-emit is not guarded, so a
    // genuine unarchive flows through the normal path below.
    return { outcome: "skipped_archived", fetched: true, tags: [] };
  }

  const existingRecord = existing as unknown as Record<string, unknown>;
  const updateRecord = listingUpdateData as Record<string, unknown>;

  // Provenance-only first: classifyListingChangeReasons returns [] for "nothing
  // changed", and isProvenanceOnlyChange([]) is false, so the two buckets below
  // are mutually exclusive.
  if (isProvenanceOnlyChange(classifyListingChangeReasons(updateRecord, existingRecord))) {
    return { outcome: "suppressed_provenance_only", fetched: true, tags: [] };
  }
  if (listingUpdateMateriallyUnchanged(updateRecord, existingRecord)) {
    return { outcome: "suppressed_unchanged", fetched: true, tags: [] };
  }

  const { tags } = publicListingChangeTags(mapped.listing_id, existing.address, mapped.address);

  if (!execute) {
    // DRY RUN: everything above ran for real; nothing below is reached. No
    // listing write, no projection write, no cache invalidation.
    return { outcome: "written", fetched: true, tags: [] };
  }

  // UPDATE, never upsert — see the header. The row provably exists (read above)
  // and this executor must be structurally incapable of creating one.
  await prisma.listing.update({
    where: { listing_id: mapped.listing_id },
    data: listingUpdateData,
  });

  // Search reads listing_search_projection (lib/search/core.ts:149), so a
  // material listing write that skipped the projection would leave search stale.
  // Reuses the canonical dual-write helper — no second projection builder.
  await dualWriteProjectionForListingId(prisma, mapped.listing_id);

  return { outcome: "written", fetched: true, tags };
}

// ── Executor ────────────────────────────────────────────────────────────────

function newCounters(): RecoveryCounters {
  return {
    selected: 0,
    fetched: 0,
    written: 0,
    suppressed_provenance_only: 0,
    suppressed_unchanged: 0,
    skipped_archived: 0,
    skipped_new_terminal: 0,
    failed: 0,
  };
}

function addCounters(into: RecoveryCounters, from: RecoveryCounters): void {
  into.selected += from.selected;
  into.fetched += from.fetched;
  into.written += from.written;
  into.suppressed_provenance_only += from.suppressed_provenance_only;
  into.suppressed_unchanged += from.suppressed_unchanged;
  into.skipped_archived += from.skipped_archived;
  into.skipped_new_terminal += from.skipped_new_terminal;
  into.failed += from.failed;
}

export async function recoverStalePropertyListings(
  options: RecoveryOptions,
): Promise<RecoveryReport> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const startedAt = Date.now();

  // ORDER IS DELIBERATE. The target guard runs FIRST and on EVERY run: a dry run
  // still queries the database, so it must be pointed at the right one before a
  // single statement is issued.
  assertCanonicalTarget(env);
  if (options.execute) assertWriteAuthorized(options, env);

  if (!Number.isSafeInteger(options.total) || options.total <= 0) {
    throw new Error(
      `Refusing to run: total must be an explicit finite positive integer (received ${String(options.total)}). ` +
        "There is no unbounded mode.",
    );
  }
  const batchSize = clampBatchSize(options.batchSize);
  const staleWhere = buildStaleWhere(options.staleDays, now);
  const staleBefore = new Date(now.getTime() - options.staleDays * MS_PER_DAY);

  // Same predicate as every findMany below, so the cap is measured against
  // exactly the population that will be traversed.
  const backlog = await prisma.listing.count({ where: staleWhere });
  if (options.total > backlog) {
    throw new Error(
      `Refusing to run: --total=${options.total} exceeds the measured backlog of ${backlog} ` +
        `stale row(s) (status in ${RECOVERABLE_STATUSES.join("/")}, last_synced_from_trestle < ` +
        `${staleBefore.toISOString()}). A cap larger than the backlog is not a cap.`,
    );
  }

  const batches: RecoveryBatchTelemetry[] = [];
  const totals = newCounters();
  const revalidatedTags = new Set<string>();
  const revalidation = newRevalidationCounters();

  let processed = 0;
  let page: LocalPage | null = null;
  let batchNumber = 0;

  while (processed < options.total) {
    const take = Math.min(batchSize, options.total - processed);
    const rows: SelectedRow[] = await prisma.listing.findMany({
      where: page ? { AND: [staleWhere, afterLocalPage(page)] } : staleWhere,
      orderBy: [{ last_synced_from_trestle: "asc" }, { listing_id: "asc" }],
      take,
      select: { listing_id: true, last_synced_from_trestle: true },
    });
    if (rows.length === 0) break;

    batchNumber++;
    const batchStartedAt = Date.now();
    const counters = newCounters();
    counters.selected = rows.length;
    const batchTags = new Set<string>();

    for (const row of rows) {
      try {
        const result = await recoverOneListing(row.listing_id, options.execute);
        if (result.fetched) counters.fetched++;
        counters[result.outcome]++;
        for (const tag of result.tags) batchTags.add(tag);
      } catch (err) {
        // Failure isolation: one bad row never aborts the batch and never
        // corrupts the accounting — it is counted ONLY as failed.
        counters.failed++;
        console.error(
          `[recover-stale] row ${row.listing_id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      // The local position advances on EVERY outcome, including failures.
      // A failed row that did not advance the position would be re-served as the
      // head of the next page forever (the livelock this pagination exists to
      // avoid); it stays in the backlog for a later run instead.
      page = { lastSynced: row.last_synced_from_trestle ?? staleBefore, listingId: row.listing_id };
    }

    if (options.execute && batchTags.size > 0) {
      // One coarse search bump per invalidating batch — same contract as
      // lib/idx/sync.ts:1408.
      batchTags.add(SEARCH_CACHE_TAG);
      safeRevalidateTags(batchTags, revalidation);
      for (const tag of batchTags) revalidatedTags.add(tag);
    }

    const telemetry: RecoveryBatchTelemetry = {
      batch: batchNumber,
      duration_ms: Date.now() - batchStartedAt,
      ...counters,
    };
    batches.push(telemetry);
    addCounters(totals, counters);
    processed += rows.length;

    console.log(
      `[recover-stale] batch ${JSON.stringify({ mode: options.execute ? "execute" : "dry-run", ...telemetry })}`,
    );
  }

  return {
    mode: options.execute ? "execute" : "dry-run",
    stale_days: options.staleDays,
    stale_before: staleBefore.toISOString(),
    backlog,
    requested_total: options.total,
    batch_size: batchSize,
    batches,
    totals,
    revalidated_tags: [...revalidatedTags].sort(),
    revalidation_failures: revalidation.revalidation_failures,
    duration_ms: Date.now() - startedAt,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseRecoveryArgs(process.argv.slice(2));
  const report = await recoverStalePropertyListings({
    execute: args.execute,
    confirm: args.confirm,
    total: args.total,
    batchSize: args.batchSize,
    staleDays: args.staleDays,
  });
  console.log("[recover-stale] report");
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) {
    console.error(`[recover-stale] exiting non-zero — ${report.totals.failed} row(s) failed.`);
    process.exitCode = 1;
  }
}

// Run ONLY when invoked directly. `require.main` is unavailable under ESM and
// `import.meta` is unavailable under the CJS transform ts-jest uses, so neither
// is portable across `npx tsx` and the test runner; argv[1] is.
if (/recover-stale-property-listings\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  void main()
    .catch((err) => {
      console.error("[recover-stale] fatal:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
}
