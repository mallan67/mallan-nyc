/**
 * ATTENDANCETYPE BACKFILL: writes ONE key, `AttendanceType`, and nothing else.
 *
 * Maya, 2026-11-22: "the doorman should be searchable, update the field only." and, for SL-0010 and SL-0004, "correct the field".
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 *
 * Who staffs the door is AttendanceType, a key INSIDE CustomProperty.CustomFields (not a Property field: `$select=AttendanceType` answers
 * HTTP 400). The listing sync read Property fields only, so no stored listing carried it. The sync now looks it up (lib/idx/custom-property-join.ts),
 * but a listing already stored carries it only after the sync next touches it, and a full sync has no resume cursor (it restarts at the newest
 * rows, 500 per run). The public Doorman filter (lib/search/types.ts, STORED_LISTINGS_CARRY_ATTENDANCE_TYPE) stays off until every stored listing
 * carries the field, so someone has to walk the stored listings once. This is that walk.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 *
 * Walks stored listings by `id` ascending (a KEYSET: `--after-id=<last id>` resumes), a bounded number per run, and plans one of:
 *
 *   feed rows (a Cotality listing, `mls_id` = ListingKey)
 *     set        Cotality carries an AttendanceType and the stored value differs: store Cotality's value, verbatim, as the comma text the sync stores.
 *                The provider is the authority: a listing RLS has not yet renamed (live 2026-11-22: 75 Active, 32 Pending) is stored with the spelling
 *                RLS serves, never hand-edited.
 *     clear      the lookup SUCCEEDED, returned the listing's CustomProperty row, and it carries no AttendanceType: remove the stored value.
 *     unchanged  already equal.
 *     unknown    the lookup failed, timed out, returned no row, or returned a value that is not text: KEEP WHAT IS STORED. A failed lookup is
 *                "unknown", never "absent" (the rule of custom-property-join.ts).
 *     no-key     no `mls_id`: nothing to look up.
 *   Mallan-authored rows (SL- / RL-): not in Cotality's feed, so no lookup.
 *     rename     the stored value holds a member RLS retired on 2026-11-17 (the Doorman* spellings): store the live member for it, one for one, the rest
 *                of the list untouched, in the SHAPE it is stored in. The CRM forms save AttendanceType as an ARRAY (the Sale and Rental forms push each
 *                ticked box), and the CRM reads `raw_data.AttendanceType` BEFORE `features.AttendanceType` when it opens a listing, so BOTH are renamed
 *                when both hold a retired member; a copy that is already live is left alone. (SL-0010 "DoormanFullTime,LobbyAttendantFullTime" or
 *                ["DoormanFullTime","LobbyAttendantFullTime"] becomes the same with DoorpersonFullTime.)
 *
 * It touches NOTHING ELSE: the write replaces `features` (and, for a Mallan-authored row only, `raw_data`) with the same object except the one key
 * (the planner proves that, and a test pins it), and it writes `updated_at` back unchanged, so a backfill does not re-order the CRM lists or the public
 * agent pages. It never creates a listing, never touches `sync_state`, never reads or writes media, never moves a status.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 *
 * DRY RUN IS THE DEFAULT: it reads, looks up and plans, and performs zero writes and zero cache invalidation. Every run, dry run included, refuses
 * unless the resolved DATABASE_URL host is the canonical production endpoint (the same guard as scripts/recover-stale-property-listings.ts).
 * Writing requires ALL of: `--execute`, `--confirm=<BACKFILL_CONFIRM_TOKEN>` and BACKFILL_TARGET_ENV=production.
 * `--total` is REQUIRED, a finite positive integer: there is no unbounded mode.
 * Each write is a compare-and-set on the `features` (and `raw_data`) value that was read, so a row the sync or the CRM changed in the meantime is
 * skipped (counted `concurrent`), never overwritten. A write and its search-projection rewrite share one transaction.
 *
 * ── THE PUBLIC CACHE IS NOT INVALIDATED FROM HERE ────────────────────────────
 *
 * `revalidateTag` works only inside a Next request. Run from a command line it throws, `safeRevalidateTags` catches it and counts a failure, and the
 * public cache is left as it was (the recovery script has the same limit). A listing page is cached by tag and re-renders only on an event for that
 * listing (a sync that changes it, a CRM save of it) or a new deployment, so a listing this run changed may show its old amenity until then, and the
 * search caches expire after about ten minutes. The report says so: `cache_invalidation` is "failed" when it happened, and `changed_listing_ids`
 * names the listings (to re-save in the CRM if one must show at once). It is never reported as done when it failed.
 *
 * ── HOW TO KNOW IT IS DONE ───────────────────────────────────────────────────
 *
 * Run the dry run over the whole population again (no `--after-id`, `--total` at least the number of listings). `converged` in the report is true only
 * when the walk reached the end AND set, clear, rename, unknown, no_key and failed are all 0. "set, clear and rename are 0" alone is not enough: it is
 * also true when Cotality could not be reached and every row came back unknown. When converged is true the stored field matches live Cotality at that
 * moment, which is what lets STORED_LISTINGS_CARRY_ATTENDANCE_TYPE be switched on (with its tests and the State).
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   npm run ops:backfill-attendance-type -- --total=500                                  # DRY RUN, first 500 listings
 *   npm run ops:backfill-attendance-type -- --total=500 --after-id=<lastId>              # DRY RUN, next 500
 *   BACKFILL_TARGET_ENV=production npm run ops:backfill-attendance-type -- \
 *     --total=500 --execute --confirm=BACKFILL-ATTENDANCE-TYPE-2026-11-22                # WRITES
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fetchAttendanceTypes, withAttendanceType, type AttendanceJoin } from "@/lib/idx/custom-property-join";
import { publicListingChangeTags } from "@/lib/cache/public-listing-change-tags";
import { SEARCH_CACHE_TAG, newRevalidationCounters, safeRevalidateTags } from "@/lib/cache/public-cache";
import { dualWriteProjectionForListingId, type DualWriteProjectionPrisma } from "@/lib/search/listing-search-projection";
import { assertCanonicalTarget, PRODUCTION_ENV_VALUE, type RecoveryEnv } from "./recover-stale-property-listings";

// ── Constants ──────────────────────────────────────────────────

/** The `--confirm` value: long and dated, so it cannot be produced by habit; the operator has to read this file to run a write. */
export const BACKFILL_CONFIRM_TOKEN = "BACKFILL-ATTENDANCE-TYPE-2026-11-22";
/** Script-specific production declaration (NODE_ENV and VERCEL_ENV are set incidentally by tooling and must not satisfy it). */
export const BACKFILL_ENV_VAR = "BACKFILL_TARGET_ENV";
/** Rows per batch. One lookup chunks itself to Cotality's URL limit, so this only bounds memory and the transaction rate. */
export const MAX_BATCH_SIZE = 300;
export const DEFAULT_BATCH_SIZE = 300;
/**
 * The statuses the PUBLIC site shows (lib/idx/db-to-public-dto.ts, lib/search/public-listing-db.ts). Pending and closed listings are not public, so they are
 * not walked: a listing that returns to Active is picked up by the sync, which now carries the field.
 */
export const BACKFILL_STATUSES: readonly string[] = ["Active", "ComingSoon", "ActiveUnderContract"];
/** At most this many changed listing ids are listed in the report (the count is always exact). */
export const MAX_REPORTED_IDS = 200;

/** The members RLS retired on 2026-11-17 and the live member that replaced each (matched without case). Kept here, in scripts/, not in anything the site serves. */
const RETIRED_TO_LIVE: Readonly<Record<string, string>> = {
  doormanfulltime: "DoorpersonFullTime",
  doormanparttime: "DoorpersonPartTime",
  doormanyes: "DoorpersonYes",
  videodoormanfulltime: "VideoDoorpersonFullTime",
  videodoormanparttime: "VideoDoorpersonPartTime",
  videodoormanyes: "VideoDoorpersonYes",
};

// ── Types ──────────────────────────────────────────────────────

export interface BackfillRow {
  id: bigint;
  listing_id: string;
  mls_id: string | null;
  status: string;
  features: unknown;
  /** The full saved payload. Read only for a Mallan-authored row: the CRM reads AttendanceType from here before `features`. */
  raw_data: unknown;
  address: unknown;
  /** Written back unchanged, so the backfill does not re-order anything that sorts on it. */
  updated_at: Date;
}

export type PlanAction = "set" | "clear" | "rename" | "unchanged" | "unknown" | "no-key";

export interface RowPlan {
  action: PlanAction;
  /** The AttendanceType stored before, as comma text (undefined: none). */
  from: string | undefined;
  /** The AttendanceType stored after, as comma text (undefined: none). */
  to: string | undefined;
  /** The whole `features` to write; null when `features` does not change. */
  nextFeatures: Record<string, unknown> | null;
  /** The whole `raw_data` to write; null when `raw_data` does not change (always null for a Cotality listing). */
  nextRawData: Record<string, unknown> | null;
}

export interface BackfillCounters {
  scanned: number;
  feed_rows: number;
  mallan_rows: number;
  set: number;
  clear: number;
  rename: number;
  unchanged: number;
  unknown: number;
  no_key: number;
  /** A write skipped because the row's features (or raw_data) changed after it was read. */
  concurrent: number;
  failed: number;
}

export type CacheInvalidation = "not-attempted" | "ok" | "failed";

export interface BackfillReport {
  mode: "dry-run" | "execute";
  batches: number;
  totals: BackfillCounters;
  /** Feed rows whose stored value, after this run, still holds a retired member (RLS has not renamed it yet). */
  feed_rows_with_retired_member: number;
  /** Feed rows that carry an AttendanceType after this run (planned, in a dry run). */
  feed_rows_carrying_value: number;
  /** `id` of the last row scanned: pass it as `--after-id` to resume. Null when nothing was scanned. */
  last_id: string | null;
  /** True when the walk reached the end of the listings (fewer rows came back than were asked for). */
  exhausted: boolean;
  /** True when the walk started at the beginning (no `--after-id`). */
  from_start: boolean;
  /**
   * True only when the walk started at the beginning, reached the end, and set, clear, rename, unknown, no_key and failed are all 0: the stored field
   * matches live Cotality at that moment. Never true after a partial walk or a walk in which Cotality did not answer.
   */
  converged: boolean;
  /** The cache tags this run tried to invalidate (a count of attempts, not of successes: see `cache_invalidation`). */
  cache_tags_attempted: number;
  /** "failed" when any tag could not be invalidated (always the case from a command line): the changed listings may show their old amenity until an event or a deployment. */
  cache_invalidation: CacheInvalidation;
  revalidation_failures: number;
  /** `listing_id` of the listings this run changed (execute) or would change (dry run), capped at MAX_REPORTED_IDS. */
  changed_listing_ids: string[];
  changed_listing_count: number;
}

export interface BackfillOptions {
  execute: boolean;
  confirm?: string;
  total: number;
  batchSize: number;
  afterId?: bigint;
}

// ── Pure planning ──────────────────────────────────────────────

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every((m) => typeof m === "string");

/** The AttendanceType a value holds as comma text: a non-empty text, or an array of texts (the CRM forms save an array); else undefined. */
function attendanceText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (isStringArray(value)) {
    const text = value.map((m) => m.trim()).filter(Boolean).join(",");
    return text || undefined;
  }
  return undefined;
}

/** The AttendanceType a listing stores in `features`, as comma text. */
export function storedAttendance(features: unknown): string | undefined {
  return attendanceText(asObject(features).AttendanceType);
}

/** True for a listing Mallan wrote itself (SL- sale, RL- rental): it is not in Cotality's feed. */
export const isMallanAuthored = (listingId: string): boolean => /^(SL|RL)-/.test(listingId);

/** Replaces each retired member with its live member and leaves every other member (and the order) alone. */
export function renameRetiredMembers(value: string): string {
  return value
    .split(",")
    .map((member) => {
      const trimmed = member.trim();
      return RETIRED_TO_LIVE[trimmed.toLowerCase()] ?? trimmed;
    })
    .filter(Boolean)
    .join(",");
}

/** True when the comma list still holds a member RLS retired. */
export const holdsRetiredMember = (value: string | undefined): boolean =>
  !!value && value.split(",").some((member) => member.trim().toLowerCase() in RETIRED_TO_LIVE);

/**
 * The stored value with its retired members renamed, in the shape it is stored in (a comma text stays a comma text, an array stays an array),
 * or undefined when it holds none, or is not a text or an array of texts.
 */
export function renameStoredValue(value: unknown): string | string[] | undefined {
  if (typeof value === "string") {
    if (!holdsRetiredMember(value)) return undefined;
    return renameRetiredMembers(value);
  }
  if (isStringArray(value)) {
    if (!value.some((m) => holdsRetiredMember(m))) return undefined;
    return value.map((m) => RETIRED_TO_LIVE[m.trim().toLowerCase()] ?? m);
  }
  return undefined;
}

/**
 * What to do with one stored listing. PURE: it reads the row and the lookup and decides. The only key that may differ between what is stored and what
 * is written is AttendanceType.
 */
export function planRow(row: BackfillRow, join: AttendanceJoin): RowPlan {
  const features = asObject(row.features);
  const from = storedAttendance(features);
  const none = (action: PlanAction): RowPlan => ({ action, from, to: from, nextFeatures: null, nextRawData: null });

  if (isMallanAuthored(row.listing_id)) {
    const rawData = asObject(row.raw_data);
    const featuresNext = renameStoredValue(features.AttendanceType);
    const rawNext = renameStoredValue(rawData.AttendanceType);
    if (featuresNext === undefined && rawNext === undefined) return none("unchanged");
    return {
      action: "rename",
      from,
      to: featuresNext !== undefined ? attendanceText(featuresNext) : from,
      nextFeatures: featuresNext !== undefined ? { ...features, AttendanceType: featuresNext } : null,
      nextRawData: rawNext !== undefined ? { ...rawData, AttendanceType: rawNext } : null,
    };
  }

  const key = (row.mls_id ?? "").trim();
  if (!key) return none("no-key");
  // A lookup that did not answer for this listing is unknown: keep what is stored.
  if (!join.byKey.has(key)) return none("unknown");

  const next = withAttendanceType(features, key, join, features);
  const to = storedAttendance(next);
  if (to === from) return none("unchanged");
  return { action: to ? "set" : "clear", from, to, nextFeatures: next, nextRawData: null };
}

// ── Guards ─────────────────────────────────────────────────────

/** Every condition required before a single row may be written. Called ONLY on the execute path. */
export function assertWriteAuthorized(options: Pick<BackfillOptions, "confirm">, env: RecoveryEnv): void {
  if (options.confirm !== BACKFILL_CONFIRM_TOKEN) {
    throw new Error("Refusing to execute: --confirm=<token> is missing or does not match the token defined in scripts/backfill-attendance-type.ts.");
  }
  if (env[BACKFILL_ENV_VAR] !== PRODUCTION_ENV_VALUE) {
    throw new Error(`Refusing to execute: ${BACKFILL_ENV_VAR}=${PRODUCTION_ENV_VALUE} is not set. A run that writes to production must declare that it targets production.`);
  }
}

/** `--total` must be an explicit finite positive integer; there is no unbounded mode. */
export function parseTotal(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) <= 0 || !Number.isSafeInteger(Number(raw))) {
    throw new Error("Refusing to run: --total=<N> is required and must be a positive whole number (there is no unbounded mode).");
  }
  return Number(raw);
}

// ── Run ────────────────────────────────────────────────────────

/** What the run reads and writes through. Defaults to the real thing; the tests pass fakes. */
export interface BackfillDeps {
  prisma: typeof prisma;
  fetchJoin: (keys: string[]) => Promise<AttendanceJoin>;
  revalidate: (tags: Set<string>, counters: ReturnType<typeof newRevalidationCounters>) => void;
  assertTarget: (env: RecoveryEnv) => void;
}

const defaultDeps = (): BackfillDeps => ({
  prisma,
  fetchJoin: (keys) => fetchAttendanceTypes(keys),
  revalidate: (tags, counters) => safeRevalidateTags(tags, counters),
  assertTarget: assertCanonicalTarget,
});

const newCounters = (): BackfillCounters => ({
  scanned: 0, feed_rows: 0, mallan_rows: 0, set: 0, clear: 0, rename: 0, unchanged: 0, unknown: 0, no_key: 0, concurrent: 0, failed: 0,
});

export async function runBackfill(options: BackfillOptions, env: RecoveryEnv, deps: BackfillDeps = defaultDeps()): Promise<BackfillReport> {
  deps.assertTarget(env);
  if (options.execute) assertWriteAuthorized(options, env);
  const total = options.total;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Refusing to run: total must be a positive whole number.");
  const batchSize = Math.max(1, Math.min(options.batchSize || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE));

  const totals = newCounters();
  const attemptedTags = new Set<string>();
  const revalidation = newRevalidationCounters();
  const changedIds: string[] = [];
  let changedCount = 0;
  let cursor: bigint = options.afterId ?? BigInt(0);
  let lastId: bigint | null = null;
  let batches = 0;
  let exhausted = false;
  let retiredAfter = 0;
  let carryingAfter = 0;
  let invalidationAttempted = false;

  while (totals.scanned < total) {
    const take = Math.min(batchSize, total - totals.scanned);
    const rows = (await deps.prisma.listing.findMany({
      where: { id: { gt: cursor }, status: { in: [...BACKFILL_STATUSES] } },
      orderBy: { id: "asc" },
      take,
      select: { id: true, listing_id: true, mls_id: true, status: true, features: true, raw_data: true, address: true, updated_at: true },
    })) as BackfillRow[];
    if (rows.length === 0) { exhausted = true; break; }
    batches++;
    const batchTags = new Set<string>();

    const feedKeys = rows.filter((r) => !isMallanAuthored(r.listing_id)).map((r) => (r.mls_id ?? "").trim()).filter(Boolean);
    const join = feedKeys.length > 0 ? await deps.fetchJoin(feedKeys) : { byKey: new Map<string, string | null>(), unknown: new Set<string>(), requests: 0 };

    for (const row of rows) {
      totals.scanned++;
      if (isMallanAuthored(row.listing_id)) totals.mallan_rows++; else totals.feed_rows++;
      const plan = planRow(row, join);
      if (!isMallanAuthored(row.listing_id)) {
        if (plan.to) carryingAfter++;
        if (holdsRetiredMember(plan.to)) retiredAfter++;
      }
      if (plan.action === "no-key") totals.no_key++;
      else if (plan.action === "unchanged") totals.unchanged++;
      else if (plan.action === "unknown") totals.unknown++;
      else {
        const noteChanged = () => { changedCount++; if (changedIds.length < MAX_REPORTED_IDS) changedIds.push(row.listing_id); };
        if (!options.execute) { totals[plan.action]++; noteChanged(); continue; } // DRY RUN: counted as a would-write, nothing issued
        try {
          const outcome = await deps.prisma.$transaction(async (tx) => {
            // Compare-and-set on every column this row is about to change, and write updated_at back as it was.
            const where: Prisma.ListingWhereInput = { id: row.id };
            const data: Prisma.ListingUpdateManyMutationInput = { updated_at: row.updated_at };
            if (plan.nextFeatures) {
              where.features = { equals: row.features as Prisma.InputJsonValue };
              data.features = plan.nextFeatures as Prisma.InputJsonValue;
            }
            if (plan.nextRawData) {
              where.raw_data = { equals: row.raw_data as Prisma.InputJsonValue };
              data.raw_data = plan.nextRawData as Prisma.InputJsonValue;
            }
            const updated = await tx.listing.updateMany({ where, data });
            if (updated.count === 0) return "concurrent" as const;
            await dualWriteProjectionForListingId(tx as unknown as DualWriteProjectionPrisma, row.listing_id);
            return "written" as const;
          });
          if (outcome === "concurrent") totals.concurrent++;
          else {
            totals[plan.action]++;
            noteChanged();
            for (const tag of publicListingChangeTags(row.listing_id, row.address, row.address).tags) batchTags.add(tag);
          }
        } catch (err) {
          totals.failed++;
          console.error(`[backfill-attendance] row ${row.listing_id} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }

    lastId = rows[rows.length - 1].id;
    cursor = lastId;
    if (options.execute && batchTags.size > 0) {
      // One coarse search bump per batch, like lib/idx/sync.ts. Outside a Next request every tag fails (see the header): the failures are counted, never hidden.
      batchTags.add(SEARCH_CACHE_TAG);
      invalidationAttempted = true;
      for (const tag of batchTags) attemptedTags.add(tag);
      deps.revalidate(batchTags, revalidation);
    }
    if (rows.length < take) { exhausted = true; break; }
  }

  const fromStart = options.afterId === undefined;
  const converged =
    fromStart && exhausted &&
    totals.set === 0 && totals.clear === 0 && totals.rename === 0 && totals.unknown === 0 && totals.no_key === 0 && totals.failed === 0 && totals.concurrent === 0;

  return {
    mode: options.execute ? "execute" : "dry-run",
    batches,
    totals,
    feed_rows_with_retired_member: retiredAfter,
    feed_rows_carrying_value: carryingAfter,
    last_id: lastId === null ? null : lastId.toString(),
    exhausted,
    from_start: fromStart,
    converged,
    cache_tags_attempted: attemptedTags.size,
    cache_invalidation: !invalidationAttempted ? "not-attempted" : revalidation.revalidation_failures > 0 ? "failed" : "ok",
    revalidation_failures: revalidation.revalidation_failures,
    changed_listing_ids: changedIds,
    changed_listing_count: changedCount,
  };
}

// ── CLI ────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): BackfillOptions {
  const get = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const afterRaw = get("after-id");
  if (afterRaw !== undefined && !/^\d+$/.test(afterRaw)) throw new Error("--after-id must be a whole number (the last id printed by the previous run).");
  const batchRaw = get("batch");
  if (batchRaw !== undefined && !/^\d+$/.test(batchRaw)) throw new Error("--batch must be a whole number.");
  return {
    execute: argv.includes("--execute"),
    confirm: get("confirm"),
    total: parseTotal(get("total")),
    batchSize: batchRaw ? Number(batchRaw) : DEFAULT_BATCH_SIZE,
    afterId: afterRaw !== undefined ? BigInt(afterRaw) : undefined,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBackfill(options, process.env as RecoveryEnv);
  console.log("[backfill-attendance] report");
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) {
    console.error(`[backfill-attendance] exiting non-zero: ${report.totals.failed} row(s) failed.`);
    process.exitCode = 1;
  }
  if (report.cache_invalidation === "failed") {
    console.warn(
      "[backfill-attendance] the public cache was NOT invalidated (revalidateTag works only inside a Next request). " +
        "A listing page changed by this run may show its old amenity until an event for that listing or a new deployment; the listings are in changed_listing_ids.",
    );
  }
  if (!report.exhausted && report.last_id) console.log(`[backfill-attendance] resume with --after-id=${report.last_id}`);
}

// Run ONLY when invoked directly (argv[1], like the recovery script: portable across tsx and the ts-jest CJS transform).
if (/backfill-attendance-type\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  void main()
    .catch((err) => {
      console.error("[backfill-attendance] fatal:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
}
