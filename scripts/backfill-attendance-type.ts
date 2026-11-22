/**
 * ATTENDANCETYPE BACKFILL: writes ONE key, `features.AttendanceType`, and nothing else.
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
 *     set        Cotality carries an AttendanceType and the stored value differs: store Cotality's value, verbatim. The provider is the authority:
 *                a listing RLS has not yet renamed (live 2026-11-22: 76 Active) is stored with the spelling RLS serves, never hand-edited.
 *     clear      the lookup SUCCEEDED, returned the listing's CustomProperty row, and it carries no AttendanceType: remove the stored value.
 *     unchanged  already equal.
 *     unknown    the lookup failed, timed out, returned no row, or returned a value that is not text: KEEP WHAT IS STORED. A failed lookup is
 *                "unknown", never "absent" (the rule of custom-property-join.ts).
 *     no-key     no `mls_id`: nothing to look up.
 *   Mallan-authored rows (SL- / RL-): not in Cotality's feed, so no lookup.
 *     rename     the stored value holds a member RLS retired on 2026-11-17 (the Doorman* spellings): store the live member for it, one for one,
 *                the rest of the list untouched. (SL-0010 "DoormanFullTime,LobbyAttendantFullTime" becomes "DoorpersonFullTime,LobbyAttendantFullTime".)
 *
 * It touches NOTHING ELSE: the write replaces `features` with the same object except the one key (the planner proves that, and a test pins it).
 * It never creates a listing, never touches `sync_state`, never reads or writes media, never moves a status.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 *
 * DRY RUN IS THE DEFAULT: it reads, looks up and plans, and performs zero writes and zero cache invalidation. Every run, dry run included, refuses
 * unless the resolved DATABASE_URL host is the canonical production endpoint (the same guard as scripts/recover-stale-property-listings.ts).
 * Writing requires ALL of: `--execute`, `--confirm=<BACKFILL_CONFIRM_TOKEN>` and BACKFILL_TARGET_ENV=production.
 * `--total` is REQUIRED, a finite positive integer: there is no unbounded mode.
 * Each write is a compare-and-set on the `features` value that was read, so a row the sync changed in the meantime is skipped (counted
 * `concurrent`), never overwritten. A write and its search-projection rewrite share one transaction.
 *
 * ── HOW TO KNOW IT IS DONE ───────────────────────────────────────────────────
 *
 * Run the dry run over the whole population again (no `--after-id`). When set, clear and rename are all 0 the stored field matches live Cotality
 * at that moment: that is the coverage check that lets STORED_LISTINGS_CARRY_ATTENDANCE_TYPE be switched on (with its tests and the State).
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
/** The statuses the public site shows. A closed listing is history, not search. */
export const BACKFILL_STATUSES: readonly string[] = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];

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
  address: unknown;
}

export type PlanAction = "set" | "clear" | "rename" | "unchanged" | "unknown" | "no-key";

export interface RowPlan {
  action: PlanAction;
  /** The AttendanceType stored before (undefined: none). */
  from: string | undefined;
  /** The AttendanceType stored after (undefined: none). */
  to: string | undefined;
  /** The whole `features` to write; null unless the action is set, clear or rename. */
  nextFeatures: Record<string, unknown> | null;
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
  /** A write skipped because the row's features changed after it was read. */
  concurrent: number;
  failed: number;
}

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
  revalidated_tags: number;
  revalidation_failures: number;
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

/** The AttendanceType a listing stores: a non-empty text, else undefined. */
export function storedAttendance(features: unknown): string | undefined {
  const value = asObject(features).AttendanceType;
  return typeof value === "string" && value.trim() ? value : undefined;
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
 * What to do with one stored listing. PURE: it reads the row and the lookup and decides. The only key that may differ between `row.features`
 * and `nextFeatures` is AttendanceType.
 */
export function planRow(row: BackfillRow, join: AttendanceJoin): RowPlan {
  const features = asObject(row.features);
  const from = storedAttendance(features);
  const none = (action: PlanAction): RowPlan => ({ action, from, to: from, nextFeatures: null });

  if (isMallanAuthored(row.listing_id)) {
    if (!from) return none("unchanged");
    const renamed = renameRetiredMembers(from);
    if (renamed === from) return none("unchanged");
    return { action: "rename", from, to: renamed, nextFeatures: { ...features, AttendanceType: renamed } };
  }

  const key = (row.mls_id ?? "").trim();
  if (!key) return none("no-key");
  // A lookup that did not answer for this listing is unknown: keep what is stored.
  if (!join.byKey.has(key)) return none("unknown");

  const next = withAttendanceType(features, key, join, features);
  const to = storedAttendance(next);
  if (to === from) return none("unchanged");
  return { action: to ? "set" : "clear", from, to, nextFeatures: next };
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
  const touchedTags = new Set<string>();
  const revalidation = newRevalidationCounters();
  let cursor: bigint = options.afterId ?? BigInt(0);
  let lastId: bigint | null = null;
  let batches = 0;
  let exhausted = false;
  let retiredAfter = 0;
  let carryingAfter = 0;

  while (totals.scanned < total) {
    const take = Math.min(batchSize, total - totals.scanned);
    const rows = (await deps.prisma.listing.findMany({
      where: { id: { gt: cursor }, status: { in: [...BACKFILL_STATUSES] } },
      orderBy: { id: "asc" },
      take,
      select: { id: true, listing_id: true, mls_id: true, status: true, features: true, address: true },
    })) as BackfillRow[];
    if (rows.length === 0) { exhausted = true; break; }
    batches++;

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
        if (!options.execute) { totals[plan.action]++; continue; } // DRY RUN: counted as a would-write, nothing issued
        try {
          const outcome = await deps.prisma.$transaction(async (tx) => {
            const updated = await tx.listing.updateMany({
              where: { id: row.id, features: { equals: row.features as Prisma.InputJsonValue } },
              data: { features: plan.nextFeatures as Prisma.InputJsonValue },
            });
            if (updated.count === 0) return "concurrent" as const;
            await dualWriteProjectionForListingId(tx as unknown as DualWriteProjectionPrisma, row.listing_id);
            return "written" as const;
          });
          if (outcome === "concurrent") totals.concurrent++;
          else {
            totals[plan.action]++;
            for (const tag of publicListingChangeTags(row.listing_id, row.address, row.address).tags) touchedTags.add(tag);
          }
        } catch (err) {
          totals.failed++;
          console.error(`[backfill-attendance] row ${row.listing_id} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }

    lastId = rows[rows.length - 1].id;
    cursor = lastId;
    if (options.execute && touchedTags.size > 0) {
      // One coarse search bump per run of batches, like lib/idx/sync.ts.
      touchedTags.add(SEARCH_CACHE_TAG);
      deps.revalidate(new Set(touchedTags), revalidation);
    }
    if (rows.length < take) { exhausted = true; break; }
  }

  return {
    mode: options.execute ? "execute" : "dry-run",
    batches,
    totals,
    feed_rows_with_retired_member: retiredAfter,
    feed_rows_carrying_value: carryingAfter,
    last_id: lastId === null ? null : lastId.toString(),
    exhausted,
    revalidated_tags: touchedTags.size,
    revalidation_failures: revalidation.revalidation_failures,
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
