/**
 * BOUNDED PROPERTY RECOVERY EXECUTOR — MANIFEST-DRIVEN.
 *
 * ── WHY THE OLD SELECTION WAS REPLACED ───────────────────────────────────────
 *
 * This executor used to select its own work with
 * `last_synced_from_trestle < 7 days`. A live measurement (2026-08-13) of the
 * 500 OLDEST-synced of the 4,465 rows that predicate selects showed:
 *
 *     62 (12.6%)  provider ModificationTimestamp NEWER than local  -> real work
 *    432 (87.4%)  provider MT EQUAL to local                       -> already current
 *      0 ( 0.0%)  local MT newer than provider
 *      6           no longer provider-Active
 *
 * AN OLD TELEMETRY CLOCK IS NOT EVIDENCE OF STALE DATA.
 * `last_synced_from_trestle` records when we last LOOKED, not what we last SAW.
 * Worse, it is in LISTING_NON_MATERIAL_UPDATE_FIELDS
 * (lib/idx/write-suppression.ts:80), so a converged row's write is suppressed and
 * its clock never advances — the predicate re-selects the same 87% forever.
 *
 * Selection is therefore no longer derived here at all. It is READ FROM A
 * MANIFEST produced by `scripts/build-recovery-manifest.ts`, which compares the
 * live provider Active-ish population against local rows and emits only ids
 * carrying a VERIFIED DIFFERENCE. This executor may touch NOTHING ELSE.
 *
 * ── THE MANIFEST SUPPLIES WHICH, NEVER WHAT ──────────────────────────────────
 *
 * The manifest carries `listingId`, `listingKey` and `reasons` — no listing
 * payload, by construction, and `parseRecoveryManifest` REFUSES an entry that
 * carries anything else. Every row is RE-FETCHED from Cotality at execution
 * time. A manifest built hours ago describes a provider state that may already
 * be superseded; if the live source no longer justifies a write, the write is
 * suppressed by the normal comparators. A reason code is a hypothesis to
 * re-verify, never an instruction to write.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * This executor MUST NEVER TOUCH `sync_state`. Not `last_watermark`, not
 * `last_listing_key`, not `last_run_at`. `sync_state.Property` is ONE position
 * over ONE ordered universe (lib/idx/sync.ts:580 — "WHO MAY MOVE THE GLOBAL
 * PROPERTY CURSOR"). This run traverses a MANIFEST — an unordered id set with no
 * relationship to the provider's (MT, ListingKey) order. Writing any position
 * from here would declare provider records processed that this run never
 * fetched, and the next incremental pass would resume past them — manufacturing
 * exactly the unreachable-tail defect this script exists to repair. The
 * prohibition is proven by test, not by comment
 * (tests/runtime/property-staleness-recovery.test.ts).
 *
 * It also never CREATES a listing: the ID census proved zero provider Active-ish
 * rows missing locally, and the manifest generator refuses to emit an id with no
 * local row. The write is `prisma.listing.update`, not `upsert`. An UPDATE
 * structurally cannot turn a bounded refresh into an import.
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
 * Writing requires ALL FOUR of: `--manifest=<path>`, `--execute`,
 * `--confirm=<RECOVERY_CONFIRM_TOKEN>`, and the production-environment
 * declaration (see PRODUCTION_ENV_VAR). Every run — dry run included —
 * additionally refuses unless the resolved DATABASE_URL host is the canonical
 * production endpoint.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   npm run ops:build-recovery-manifest                              # build it
 *   npm run ops:recover-stale-listings -- \
 *     --manifest=artifacts/property-recovery-manifest.json --total=50   # DRY RUN
 *   RECOVERY_TARGET_ENV=production npm run ops:recover-stale-listings -- \
 *     --manifest=artifacts/property-recovery-manifest.json \
 *     --total=500 --batch=250 --execute --confirm=<token>            # WRITES
 *
 * `--total` is REQUIRED and must be an explicit finite positive integer. There
 * is no unbounded mode: `--total=all` / `--total=Infinity` are refused, and a
 * total larger than the manifest's unique-id count is refused — the manifest
 * size is the hard ceiling on what a run may touch.
 */

import { readFileSync } from "node:fs";
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
  LISTING_CHANGE_REASON_KEYS,
  listingUpdateMateriallyUnchanged,
  classifyListingChangeReasons,
  isProvenanceOnlyChange,
  type ListingChangeReason,
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
import {
  dualWriteProjectionForListingId,
  type DualWriteProjectionPrisma,
} from "@/lib/search/listing-search-projection";
import { isCanonicalNeonHost, CANONICAL_NEON_HOST_SUBSTRING } from "@/lib/ops/canonical-neon-target";
import {
  RECOVERY_REASON_CODES,
  type RecoveryManifest,
  type RecoveryReason,
} from "./build-recovery-manifest";
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
 * The display-eligible status set. No longer a SELECTION predicate (the manifest
 * selects), but still the population the manifest generator reconciles, kept
 * here so both sides name the same set.
 */
export const RECOVERABLE_STATUSES: readonly string[] = [
  "Active",
  "ActiveUnderContract",
  "ComingSoon",
];

/** The exact key set a manifest entry may carry. Anything else is refused. */
const ALLOWED_ENTRY_KEYS: ReadonlySet<string> = new Set(["listingId", "listingKey", "reasons"]);

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

/**
 * Canonical write-reason forecast over the WOULD-WRITE / WRITTEN rows.
 *
 * WHY THIS EXISTS. `written` alone cannot answer the question the deploy is
 * being judged on. 8,390 of 8,403 Active-ish rows carry `mls_id = NULL`, so the
 * first cursor touch of each writes once for identity alone; without attribution
 * that is indistinguishable from real content churn and the write-reduction
 * metric becomes unreadable exactly when it matters. Every count comes from the
 * SAME `classifyListingChangeReasons` call that decided suppression — never a
 * second comparator.
 *
 * `by_reason` is non-exclusive (a row may carry several). The three `*_only` /
 * `*_plus_*` counters ARE mutually exclusive and sum to the written count.
 */
export interface WriteReasonForecast {
  /** Non-exclusive: a row contributes to every reason it carries. */
  by_reason: Record<string, number>;
  /** Exclusively `source_identity` — the one-time mls_id convergence. */
  source_identity_only: number;
  /** `source_identity` alongside at least one real content reason. */
  source_identity_plus_material: number;
  /** Real content change with no identity component. */
  material_without_source_identity: number;
}

export interface RecoveryBatchTelemetry extends RecoveryCounters {
  batch: number;
  duration_ms: number;
}

export interface RecoveryReport {
  mode: "dry-run" | "execute";
  /** null when the manifest was injected rather than read from disk (tests). */
  manifest_path: string | null;
  manifest_generated_at: string;
  /** Entry count as emitted by the generator. */
  manifest_size: number;
  /** Distinct listing ids after deduplication — the HARD CEILING on `--total`. */
  manifest_unique_ids: number;
  /** Reported explicitly, never silently collapsed. */
  manifest_duplicate_ids: string[];
  manifest_totals_by_reason: Partial<Record<RecoveryReason, number>>;
  requested_total: number;
  batch_size: number;
  batches: RecoveryBatchTelemetry[];
  totals: RecoveryCounters;
  /** Canonical attribution of the would-write rows. See WriteReasonForecast. */
  would_write_by_reason: WriteReasonForecast;
  /**
   * Rows the manifest nominated for a MATERIAL comparison. A candidate is a
   * hypothesis, not a defect: `provider_mt_newer` only means the provider has a
   * newer REVISION, which after provenance-write suppression is expected to
   * persist indefinitely for rows whose revision changed nothing material.
   */
  candidate_count: number;
  /**
   * Rows the canonical comparison says actually need a physical write. THIS is
   * the authorization size — not `candidate_count`.
   */
  material_correction_count: number;
  /**
   * The convergence verdict. TRUE when nothing material remains, regardless of
   * how many candidates the manifest still nominates.
   *
   * `manifestSize = 0` is the WRONG success condition under provenance-write
   * suppression: a provider revision that changed only ModificationTimestamp
   * intentionally advances the source cursor WITHOUT writing the listing, so
   * `provider MT > listings.modification_timestamp` can hold forever. Demanding
   * a zero candidate count would either never converge or force exactly the
   * provenance-only writes this PR exists to remove.
   *
   * The two clocks are deliberately different and must never be conflated:
   *   `listings.modification_timestamp` = last MATERIAL listing change stored
   *   `sync_state` (watermark + last_listing_key) = latest provider revision
   *                                                 position traversed
   */
  converged: boolean;
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
  /** Path to the generated manifest. Read from disk unless `manifest` is given. */
  manifestPath?: string | null;
  /** Injected for tests — bypasses the disk read, NOT the shape validation. */
  manifest?: RecoveryManifest;
  /** Injected for tests; production reads process.env. */
  env?: RecoveryEnv;
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
  manifestPath: string;
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
  // Manifest FIRST: without it there is no selection source at all, so a run
  // that omits it is not a smaller run — it is an undefined one.
  const manifestPath = readFlag(argv, "manifest");
  if (manifestPath === null || manifestPath.trim().length === 0) {
    throw new Error(
      "--manifest=<path> is REQUIRED. Selection comes exclusively from the manifest " +
        "produced by scripts/build-recovery-manifest.ts; this executor has no other " +
        "selection source and refuses to invent one.",
    );
  }

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

  return {
    execute: argv.includes("--execute"),
    confirm: readFlag(argv, "confirm"),
    total,
    batchSize,
    manifestPath: manifestPath.trim(),
  };
}

// ── Manifest ingestion ──────────────────────────────────────────────────────

/**
 * Fail-closed manifest validator.
 *
 * The refusal of UNKNOWN ENTRY KEYS is load-bearing, not tidiness. It is the
 * structural guarantee behind "the manifest supplies WHICH ids, never WHAT to
 * write": if an entry cannot carry a payload, no future edit of this executor
 * can quietly start trusting one instead of re-fetching from Cotality. It also
 * refuses a manifest produced by a generator this executor does not understand
 * (unknown reason codes) rather than silently processing an unknown contract.
 */
export function parseRecoveryManifest(raw: unknown): RecoveryManifest {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Refusing to run: the manifest is not a JSON object.");
  }
  const doc = raw as Record<string, unknown>;

  if (typeof doc.generatedAt !== "string" || doc.generatedAt.length === 0) {
    throw new Error("Refusing to run: the manifest has no `generatedAt` timestamp.");
  }
  if (!Array.isArray(doc.entries)) {
    throw new Error("Refusing to run: the manifest has no `entries` array.");
  }
  if (typeof doc.manifestSize !== "number" || doc.manifestSize !== doc.entries.length) {
    throw new Error(
      `Refusing to run: manifestSize (${String(doc.manifestSize)}) does not match the ` +
        `number of entries (${doc.entries.length}). A truncated or hand-edited manifest is refused.`,
    );
  }

  const known = new Set<string>(RECOVERY_REASON_CODES);
  const entries = doc.entries.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Refusing to run: manifest entry ${index} is not an object.`);
    }
    const entry = value as Record<string, unknown>;

    const extra = Object.keys(entry).filter((k) => !ALLOWED_ENTRY_KEYS.has(k));
    if (extra.length > 0) {
      throw new Error(
        `Refusing to run: manifest entry ${index} carries unexpected key(s) [${extra.join(", ")}]. ` +
          "A manifest entry may contain listingId, listingKey and reasons ONLY — it supplies " +
          "WHICH ids to re-read, never WHAT to write. Every row is re-fetched from Cotality.",
      );
    }
    if (typeof entry.listingId !== "string" || entry.listingId.trim().length === 0) {
      throw new Error(`Refusing to run: manifest entry ${index} has no usable listingId.`);
    }
    if (entry.listingKey !== null && typeof entry.listingKey !== "string") {
      throw new Error(`Refusing to run: manifest entry ${index} has a non-string listingKey.`);
    }
    if (!Array.isArray(entry.reasons) || entry.reasons.length === 0) {
      throw new Error(
        `Refusing to run: manifest entry ${index} (${entry.listingId}) has no reason codes. ` +
          "A row with no verified reason must never have been emitted.",
      );
    }
    for (const reason of entry.reasons) {
      if (typeof reason !== "string" || !known.has(reason)) {
        throw new Error(
          `Refusing to run: manifest entry ${index} (${entry.listingId}) carries unknown reason ` +
            `code ${JSON.stringify(reason)}. Fail closed on an unrecognized manifest contract.`,
        );
      }
    }
    return {
      listingId: entry.listingId.trim(),
      listingKey: (entry.listingKey as string | null) ?? null,
      reasons: entry.reasons as RecoveryReason[],
    };
  });

  return {
    generatedAt: doc.generatedAt,
    includeMlsBackfill: doc.includeMlsBackfill === true,
    providerPopulation: Number(doc.providerPopulation ?? 0),
    localComparablePopulation: Number(doc.localComparablePopulation ?? 0),
    absentLocally: Number(doc.absentLocally ?? 0),
    totalsByReason: (doc.totalsByReason ?? {}) as RecoveryManifest["totalsByReason"],
    diagnostics: (doc.diagnostics ?? {}) as RecoveryManifest["diagnostics"],
    manifestSize: doc.manifestSize,
    entries,
  };
}

export function loadRecoveryManifest(manifestPath: string): RecoveryManifest {
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch (err) {
    throw new Error(
      `Refusing to run: cannot read the manifest at ${manifestPath} ` +
        `(${err instanceof Error ? err.message : String(err)}). Build it first with ` +
        "`npm run ops:build-recovery-manifest`.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Refusing to run: the manifest at ${manifestPath} is not valid JSON ` +
        `(${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  return parseRecoveryManifest(parsed);
}

export interface ManifestSelection {
  /** Deduplicated, in manifest order. THE complete universe this run may touch. */
  ids: string[];
  /** Ids that appeared more than once. Reported, never silently collapsed. */
  duplicateIds: string[];
}

/**
 * Turn a manifest into the id universe. Duplicates are DEDUPED AND REPORTED:
 * collapsing them silently would make `--total` mean something different from
 * "rows touched", and a duplicated id is evidence the generator (or the file)
 * is wrong — the operator needs to see which ones.
 */
export function selectManifestIds(manifest: RecoveryManifest): ManifestSelection {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const ids: string[] = [];
  for (const entry of manifest.entries) {
    if (seen.has(entry.listingId)) {
      duplicates.add(entry.listingId);
      continue;
    }
    seen.add(entry.listingId);
    ids.push(entry.listingId);
  }
  return { ids, duplicateIds: [...duplicates].sort() };
}

/**
 * The membership refusal. Called per row BEFORE any Cotality fetch and before
 * any read of the local row, so an id outside the manifest costs nothing and
 * changes nothing. This is the guard that makes "the executor may touch nothing
 * else" a property of the code rather than of the caller's discipline.
 */
export function assertListingIdInManifest(
  listingId: string,
  allowed: ReadonlySet<string>,
): void {
  if (!allowed.has(listingId)) {
    throw new Error(
      `Refusing to touch ${listingId}: it is not present in the recovery manifest. ` +
        "This executor may only act on ids carrying a verified reconciliation reason.",
    );
  }
}

// ── Guards ──────────────────────────────────────────────────────────────────

/**
 * EVERY connection string this process could actually write through.
 *
 * Checking one URL is not enough. `resolveDatabaseUrl` preferred
 * `DATABASE_URL_UNPOOLED`, but Prisma Client connects via `DATABASE_URL` — so a
 * canonical unpooled URL alongside a STALE pooled one passed the guard while
 * every write went to the wrong database. That is the exact
 * morning-bread/`ep-royal-dawn` hazard CLAUDE.md marks DO-NOT-SERVE. Both are
 * validated; a run is refused unless every URL present is canonical.
 */
export function resolveDatabaseUrls(env: RecoveryEnv): Array<{ name: string; url: string }> {
  return (["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const)
    .map((name) => ({ name, url: env[name] || "" }))
    .filter((e) => e.url.length > 0);
}

/**
 * Kept for callers/tests that only need "is a target configured at all".
 * Prefer `resolveDatabaseUrls` — this returns ONE url and cannot express the
 * multi-variable check the guard now performs.
 */
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
  const urls = resolveDatabaseUrls(env);
  if (urls.length === 0) {
    throw new Error(
      "Refusing to run: the target database host cannot be determined " +
        "(DATABASE_URL_UNPOOLED / DATABASE_URL are unset or empty). Fail closed.",
    );
  }
  // EVERY configured URL must be canonical, not just the preferred one. Prisma
  // Client connects through `DATABASE_URL`, so validating only the unpooled
  // variable would let a canonical unpooled URL vouch for a STALE pooled one
  // while every write landed in the wrong database.
  for (const { name, url } of urls) {
    if (!isCanonicalNeonHost(url)) {
      throw new Error(
        `Refusing to run: ${name} is not the canonical production ` +
          `endpoint (${CANONICAL_NEON_HOST_SUBSTRING}). The legacy ep-royal-dawn-ad6eh8t2 / ` +
          `morning-bread project is STALE / DO-NOT-SERVE and is refused explicitly.`,
      );
    }
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
  if (!options.manifest && !options.manifestPath) {
    throw new Error(
      "Refusing to execute: a manifest is REQUIRED for --execute. Build one with " +
        "`npm run ops:build-recovery-manifest` and pass --manifest=<path>.",
    );
  }
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
  /**
   * Canonical change reasons for a WOULD-WRITE / WRITTEN row, from the single
   * `classifyListingChangeReasons` call that also decided suppression. Absent
   * for suppressed, skipped and failed rows — those performed no write, so they
   * contribute nothing to the write-reason forecast.
   */
  reasons?: ListingChangeReason[];
}

/**
 * Exported so the membership refusal can be proven to be WIRED IN — not merely
 * to exist. A test calls this directly with an id outside the allowed set and
 * asserts that it throws BEFORE any Cotality fetch and before any DB read.
 */
export async function recoverOneListing(
  listingId: string,
  execute: boolean,
  allowedIds: ReadonlySet<string>,
  /** Fires the instant the provider record is in hand, so a caller can count
   *  the Cotality request even if a later stage throws. */
  onFetched?: () => void,
): Promise<RowResult> {
  // FIRST, before any I/O at all. See assertListingIdInManifest.
  assertListingIdInManifest(listingId, allowedIds);

  // RE-FETCH. The manifest said this id LOOKED different when the manifest was
  // built; only the live provider record can say whether it still does. Nothing
  // downstream reads the manifest again.
  const raw = await fetchSingleListing(listingId);
  if (raw !== null) onFetched?.();
  if (raw === null) {
    // `fetchSingleListing` returns null for BOTH "no such record" and "HTTP
    // error / rate limited" (lib/idx/fetch.ts:252-278) and the caller cannot
    // tell them apart. Fail closed: an indistinguishable outcome is never a
    // resolved one, so the row stays in the manifest for a later run.
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
    // The manifest generator refuses to emit an id with no local row, and the ID
    // census proved zero missing listings — so a null here is a concurrent
    // delete, not an import gap. Creating it would silently turn a bounded
    // refresh into an import path. Refuse.
    console.error(`[recover-stale] ${listingId} has no local row; not creating.`);
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

  // THE MANIFEST DOES NOT REACH HERE. Suppression is decided by comparing the
  // LIVE provider record against the LIVE local row. If the source converged
  // between manifest build and execution, the write is suppressed exactly as it
  // would be for any other run — a reason code never forces a write.
  //
  // Provenance-only first: classifyListingChangeReasons returns [] for "nothing
  // changed", and isProvenanceOnlyChange([]) is false, so the two buckets below
  // are mutually exclusive.
  // Classified ONCE and reused: the suppression decision, the dry-run forecast,
  // and the execute-path telemetry must all describe the same comparison. A
  // second `classifyListingChangeReasons` call here would be a second opinion
  // about what changed, and the forecast could then disagree with the write it
  // is forecasting.
  const changeReasons = classifyListingChangeReasons(updateRecord, existingRecord);

  if (isProvenanceOnlyChange(changeReasons)) {
    return { outcome: "suppressed_provenance_only", fetched: true, tags: [] };
  }
  if (listingUpdateMateriallyUnchanged(updateRecord, existingRecord)) {
    return { outcome: "suppressed_unchanged", fetched: true, tags: [] };
  }

  const { tags } = publicListingChangeTags(mapped.listing_id, existing.address, mapped.address);

  if (!execute) {
    // DRY RUN: everything above ran for real; nothing below is reached. No
    // listing write, no projection write, no cache invalidation. The reasons
    // ride along so the forecast is the SAME classification the write would use.
    return { outcome: "written", fetched: true, tags: [], reasons: changeReasons };
  }

  // ATOMIC: the listing row and its search projection commit together or not at
  // all.
  //
  // WHY THIS PATH NEEDS A TRANSACTION AND THE SYNC PATH DOES NOT. Canonical sync
  // runs the projection stage BEFORE `recordCursorPosition(raw, true)`
  // (lib/idx/sync.ts), so a projection failure lands in the per-row catch, the
  // source row is never recorded as processed, and the composite cursor RETRIES
  // it on the next pass. The cursor is that path's retry anchor.
  //
  // This executor has no such anchor: it traverses a manifest, never writes
  // `sync_state`, and re-derives its worklist from a MATERIAL comparison. So a
  // committed listing UPDATE followed by a failed projection would be
  // unrecoverable — the next run compares the (now-updated) listing against
  // Cotality, finds it materially equal, suppresses, and the stale projection is
  // never repaired. Search would serve stale data indefinitely while the
  // executor reported convergence.
  //
  // Rolling back means the row simply stays a material correction candidate and
  // the next run retries the whole thing. The projection error is NOT caught
  // here: catching it and committing anyway is the exact defect this prevents.
  await prisma.$transaction(async (tx) => {
    // UPDATE, never upsert — see the header. The row provably exists (read
    // above) and this executor must be structurally incapable of creating one.
    await tx.listing.update({
      where: { listing_id: mapped.listing_id },
      data: listingUpdateData,
    });
    // Search reads listing_search_projection (lib/search/core.ts:149), so a
    // material listing write that skipped the projection would leave search
    // stale. Reuses the canonical dual-write helper — no second projection
    // builder. `DualWriteProjectionPrisma` is structural, so the transaction
    // client satisfies it directly.
    await dualWriteProjectionForListingId(
      tx as unknown as DualWriteProjectionPrisma,
      mapped.listing_id,
    );
  });

  // Cache invalidation happens only on the caller's side, after this returns —
  // i.e. only for a COMMITTED transaction. A rolled-back row throws before here,
  // is counted `failed`, and contributes no tags.
  return { outcome: "written", fetched: true, tags, reasons: changeReasons };
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

export function newWriteReasonForecast(): WriteReasonForecast {
  return {
    by_reason: Object.fromEntries(LISTING_CHANGE_REASON_KEYS.map((k) => [k, 0])),
    source_identity_only: 0,
    source_identity_plus_material: 0,
    material_without_source_identity: 0,
  };
}

/**
 * Fold ONE written row's canonical reasons into the forecast. Exported so the
 * exclusivity contract is provable directly, not only through a full run.
 *
 * An empty/absent reason list still counts toward exactly one exclusive bucket
 * (`material_without_source_identity`) so the three always reconcile to the
 * written count — a written row is never invisible in the split.
 */
export function accumulateWriteReasons(
  into: WriteReasonForecast,
  reasons: readonly ListingChangeReason[] | undefined,
): void {
  const list = reasons ?? [];
  for (const r of list) {
    into.by_reason[r] = (into.by_reason[r] ?? 0) + 1;
  }
  const hasIdentity = list.includes("source_identity");
  const hasMaterial = list.some((r) => r !== "source_identity");
  if (hasIdentity && hasMaterial) into.source_identity_plus_material++;
  else if (hasIdentity) into.source_identity_only++;
  else into.material_without_source_identity++;
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
  const startedAt = Date.now();

  // ORDER IS DELIBERATE. The target guard runs FIRST and on EVERY run: a dry run
  // still queries the database, so it must be pointed at the right one before a
  // single statement is issued.
  assertCanonicalTarget(env);
  if (options.execute) assertWriteAuthorized(options, env);

  // The injected manifest goes through the SAME validator as the on-disk one —
  // a test fixture must not be able to smuggle in a shape production refuses.
  let manifest: RecoveryManifest;
  if (options.manifest) {
    manifest = parseRecoveryManifest(options.manifest);
  } else if (options.manifestPath) {
    manifest = loadRecoveryManifest(options.manifestPath);
  } else {
    throw new Error(
      "Refusing to run: no manifest supplied. Selection comes exclusively from a manifest " +
        "produced by scripts/build-recovery-manifest.ts — pass --manifest=<path>.",
    );
  }

  const { ids: manifestIds, duplicateIds } = selectManifestIds(manifest);
  if (duplicateIds.length > 0) {
    // Reported, never silently collapsed.
    console.warn(
      `[recover-stale] manifest contains ${duplicateIds.length} duplicated listing id(s); ` +
        `deduplicated to ${manifestIds.length} unique id(s): ${duplicateIds.join(", ")}`,
    );
  }

  if (!Number.isSafeInteger(options.total) || options.total <= 0) {
    throw new Error(
      `Refusing to run: total must be an explicit finite positive integer (received ${String(options.total)}). ` +
        "There is no unbounded mode.",
    );
  }
  // THE MANIFEST IS THE HARD CEILING. A cap above it would let a run claim
  // authority over rows nobody verified.
  if (options.total > manifestIds.length) {
    throw new Error(
      `Refusing to run: --total=${options.total} exceeds the manifest's ${manifestIds.length} ` +
        "unique listing id(s). The manifest size is the hard cap on a recovery run.",
    );
  }

  const batchSize = clampBatchSize(options.batchSize);
  // The universe this run may touch. `recoverOneListing` re-checks membership
  // per row, so even a future refactor of the loop cannot widen it.
  const allowedIds: ReadonlySet<string> = new Set(manifestIds);
  const selectedIds = manifestIds.slice(0, options.total);

  const batches: RecoveryBatchTelemetry[] = [];
  const totals = newCounters();
  const writeReasons = newWriteReasonForecast();
  const revalidatedTags = new Set<string>();
  const revalidation = newRevalidationCounters();

  let batchNumber = 0;
  for (let offset = 0; offset < selectedIds.length; offset += batchSize) {
    const rows = selectedIds.slice(offset, offset + batchSize);
    batchNumber++;
    const batchStartedAt = Date.now();
    const counters = newCounters();
    counters.selected = rows.length;
    const batchTags = new Set<string>();

    for (const listingId of rows) {
      // A row that fetched successfully and THEN threw (e.g. the projection
      // failing inside the transaction) still consumed a Cotality request. The
      // resolve-path increment below cannot see it, so `fetched` would
      // under-count exactly the rows an operator most wants to account for.
      // `onFetched` fires the moment the provider record is in hand, so the
      // count survives a later throw.
      let fetchedThisRow = false;
      try {
        const result = await recoverOneListing(listingId, options.execute, allowedIds, () => {
          fetchedThisRow = true;
        });
        if (result.fetched) counters.fetched++;
        counters[result.outcome]++;
        // Only a written row contributes to the forecast. Suppressed, skipped
        // and failed rows performed no write and must not appear in it.
        if (result.outcome === "written") accumulateWriteReasons(writeReasons, result.reasons);
        for (const tag of result.tags) batchTags.add(tag);
      } catch (err) {
        // Failure isolation: one bad row never aborts the batch and never
        // corrupts the accounting — it is counted ONLY as failed. The provider
        // request it already spent is still counted, so `fetched` reflects
        // Cotality traffic rather than only the rows that survived.
        if (fetchedThisRow) counters.fetched++;
        counters.failed++;
        console.error(
          `[recover-stale] row ${listingId} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
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

    console.log(
      `[recover-stale] batch ${JSON.stringify({ mode: options.execute ? "execute" : "dry-run", ...telemetry })}`,
    );
  }

  return {
    mode: options.execute ? "execute" : "dry-run",
    manifest_path: options.manifest ? null : (options.manifestPath ?? null),
    manifest_generated_at: manifest.generatedAt,
    manifest_size: manifest.manifestSize,
    manifest_unique_ids: manifestIds.length,
    manifest_duplicate_ids: duplicateIds,
    manifest_totals_by_reason: manifest.totalsByReason ?? {},
    requested_total: options.total,
    batch_size: batchSize,
    batches,
    totals,
    would_write_by_reason: writeReasons,
    revalidated_tags: [...revalidatedTags].sort(),
    revalidation_failures: revalidation.revalidation_failures,
    candidate_count: manifestIds.length,
    material_correction_count: totals.written,
    // Convergence is a MATERIAL verdict — candidates may legitimately remain —
    // but it is only meaningful if EVERY candidate was actually examined.
    //
    // `written === 0 && failed === 0` alone is not enough, and both gaps were
    // reproduced against the real executor:
    //   * a `--total` smaller than the manifest examines only a slice, so a
    //     partial run could report converged while most candidates were never
    //     compared at all;
    //   * `skipped_archived` / `skipped_new_terminal` rows are returned BEFORE
    //     the material comparison, so they are unresolved, not converged.
    // Both are therefore disqualifying.
    converged:
      totals.written === 0 &&
      totals.failed === 0 &&
      totals.skipped_archived === 0 &&
      totals.skipped_new_terminal === 0 &&
      totals.selected === manifestIds.length,
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
    manifestPath: args.manifestPath,
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
