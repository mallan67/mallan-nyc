/**
 * PROVIDER/LOCAL RECONCILIATION MANIFEST GENERATOR.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The Property recovery executor used to select its own work with
 * `last_synced_from_trestle < 7 days`. That predicate selects 4,465 rows, and a
 * live measurement of the 500 OLDEST-synced of them showed what those rows
 * actually are:
 *
 *     62 (12.6%)  provider ModificationTimestamp NEWER than local  -> real work
 *    432 (87.4%)  provider MT EQUAL to local                       -> already current
 *      0 ( 0.0%)  local MT newer than provider
 *      6           no longer provider-Active
 *
 * An old telemetry clock is NOT evidence of stale data. `last_synced_from_trestle`
 * records when we last LOOKED, not what we last SAW, and it is in
 * LISTING_NON_MATERIAL_UPDATE_FIELDS (lib/idx/write-suppression.ts:80) — so a
 * converged row is suppressed, its clock never advances, and it stays "stale"
 * forever. Selecting on it therefore hands the executor an 87%-noise worklist
 * that regenerates itself on every run.
 *
 * This generator replaces that guess with a MEASUREMENT. It compares the live
 * provider Active-ish population against the local rows field by field and emits
 * only the ids that carry a VERIFIED DIFFERENCE, each labelled with the reason(s)
 * that justified it. The executor consumes that manifest and may touch nothing
 * else.
 *
 * Also verified live (2026-08-13): the provider Active-ish population has
 * ListingId and ListingKey BOTH unique and 1:1 (8,385 rows, 0 duplicate ids,
 * 0 duplicate keys), and ZERO provider Active-ish ListingIds are absent locally.
 * This is purely a refresh/correction problem — never an import problem — which
 * is why the manifest is consumed by an UPDATE-only executor.
 *
 * ── READ-ONLY ────────────────────────────────────────────────────────────────
 *
 * This script NEVER writes to the database. It issues HTTP GETs against Cotality
 * and `findMany` SELECTs against Postgres, and writes exactly one local JSON
 * artifact. There is no `--execute` mode because there is nothing to execute.
 *
 * ── SANITIZATION ─────────────────────────────────────────────────────────────
 *
 * A manifest entry carries `listingId`, `listingKey` and `reasons` — nothing
 * else. No address, no price, no agent, no status, no timestamps, no listing
 * content of any kind. Two reasons:
 *
 *   1. The artifact is a plain file on an operator's disk. It must not become an
 *      uncontrolled copy of REBNY listing content sitting outside the database.
 *   2. The manifest supplies WHICH ids to re-read, never WHAT to write. If it
 *      carried a payload, an operator could run the executor hours later against
 *      a snapshot the provider has since superseded. The executor RE-FETCHES
 *      every row from Cotality at execution time, and it structurally cannot do
 *      otherwise because there is no payload here to trust.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   npm run ops:build-recovery-manifest
 *   npm run ops:build-recovery-manifest -- --include-mls-backfill
 *   npm run ops:build-recovery-manifest -- --out=artifacts/my-manifest.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { getAccessToken } from "@/lib/idx/auth";
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";
import {
  normalizeStandardStatus,
  computeGateColumns,
  derivePermissionGates,
} from "@/lib/idx/trestle-mapper";

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * The provider-side "Active-ish" population. Identical to the executor's
 * RECOVERABLE_STATUSES: the display-eligible set. A terminal row that drifted is
 * the retention drain's business (lib/retention/), not this reconciliation's.
 */
export const PROVIDER_ACTIVE_STATUSES: readonly string[] = [
  "Active",
  "ActiveUnderContract",
  "ComingSoon",
];

/**
 * The exact provider fields this reconciliation compares. Deliberately minimal:
 * every field here is a field the manifest can justify a re-read with. Pulling
 * the full IDX Plus select would move 900 fields across the wire to answer a
 * five-field question.
 */
export const PROVIDER_SELECT_FIELDS: readonly string[] = [
  "ListingId",
  "ListingKey",
  "ModificationTimestamp",
  "StandardStatus",
  "PropertyType",
  "InternetEntireListingDisplayYN",
  // The two source fields behind the per-row REBNY gates. Selected 2026-08-13
  // to break the display-gate reconciliation circularity: the gates must be
  // re-derived from CURRENT provider state, never read back from the stored
  // local columns they produced. `MlsStatus` is required as well — it carries
  // the second arm of the owner-opt-out test in `derivePermissionGates`.
  "Permission",
  "MlsStatus",
];

/**
 * Every reason code that can justify a manifest entry. A row with NO reason is
 * EXCLUDED — that is the entire point of this file. Order is canonical: reasons
 * on an entry are emitted in this order so two runs over the same state produce
 * byte-identical arrays.
 */
export const RECOVERY_REASON_CODES = [
  /** Provider ModificationTimestamp is strictly newer than the local one. */
  "provider_mt_newer",
  /** Provider StandardStatus and local status disagree (both normalized). */
  "status_mismatch",
  /** Locally Active-ish, but absent from the provider Active-ish population. */
  "local_active_provider_terminal",
  /** Provider-derived display gate and local `idx_display_yn` disagree. */
  "display_gate_mismatch",
  /** Local `mls_id` is NULL, or differs from the provider ListingKey. */
  "mls_id_missing_or_wrong",
] as const;

export type RecoveryReason = (typeof RECOVERY_REASON_CODES)[number];

const REASON_ORDER = new Map<RecoveryReason, number>(
  RECOVERY_REASON_CODES.map((code, i) => [code, i]),
);

/**
 * Postgres has a hard parameter ceiling per statement and Neon charges by
 * compute-second; a 8,400-element `IN` list is one statement that plans badly.
 * 1000 is the contractual maximum chunk (never exceeded, clamped not rejected).
 */
export const LOCAL_LOOKUP_CHUNK_SIZE = 1000;

export const DEFAULT_MANIFEST_PATH = "artifacts/property-recovery-manifest.json";

/** Page size for the provider scan — matches MAX_PAGE_SIZE in lib/idx/fetch.ts:28. */
const PROVIDER_PAGE_SIZE = 500;

/**
 * Runaway guard on `@odata.nextLink` following. At 500 rows/page this admits
 * 1,000,000 rows against a measured population of ~8,400 — generous enough that
 * it can only ever fire on a provider-side pagination loop, which must abort
 * loudly rather than spin.
 */
const MAX_PROVIDER_PAGES = 2000;

// ── Types ───────────────────────────────────────────────────────────────────

/** One provider record, reduced to PROVIDER_SELECT_FIELDS. */
export interface ProviderRow {
  ListingId: string;
  ListingKey: string | null;
  ModificationTimestamp: string | null;
  StandardStatus: string | null;
  PropertyType: string | null;
  InternetEntireListingDisplayYN: boolean | null;
  /** Multi-Enum. Source of BOTH per-row REBNY gates. */
  Permission: string | null;
  /** Second arm of the owner-opt-out test. Not a display status. */
  MlsStatus: string | null;
}

/**
 * One local counterpart row. Exactly the columns the comparison needs.
 *
 * `rls_eligible` is a CLASSIFICATION input: it is genuinely local (no Cotality
 * field maps to it) so the provider cannot answer it and local state is the
 * authority. See `expectedIdxDisplay`.
 *
 * `participant_only` / `owner_opt_out` are NOT classification inputs and MUST
 * NOT become them again. They are source-derived outputs of
 * `derivePermissionGates`, so feeding them back into the gate evaluator would
 * ask stored state to vouch for stored state. They are read for exactly one
 * purpose: the `staleLocalPermissionGates` diagnostic, which measures how far
 * the stored copies have drifted from current provider truth — i.e. how much
 * the old circular form was hiding.
 *
 * All of these are read, never emitted — nothing about them reaches the
 * manifest artifact.
 */
export interface LocalRow {
  listing_id: string;
  status: string;
  modification_timestamp: Date | null;
  idx_display_yn: boolean;
  mls_id: string | null;
  sync_status: string | null;
  /** REBNY Gate 2 — Permission='Private'. Forces idx_display_yn=false. */
  participant_only: boolean;
  /** REBNY Gate 1 — Permission='OwnerOptOut'. Forces idx_display_yn=false. */
  owner_opt_out: boolean;
  /** false = website-only / commercial. Forces idx_display_yn=false. */
  rls_eligible: boolean;
}

/**
 * A manifest entry. THREE KEYS, FOREVER. `buildEntry` is the only constructor
 * and tests assert the exact key set — see the SANITIZATION note in the header.
 */
export interface ManifestEntry {
  listingId: string;
  /** Provider ListingKey. `null` for a local-only row (no provider record). */
  listingKey: string | null;
  reasons: RecoveryReason[];
}

export interface RecoveryManifest {
  generatedAt: string;
  /** Whether `mls_id_missing_or_wrong`-only rows were admitted. */
  includeMlsBackfill: boolean;
  /** Unique provider Active-ish records seen. */
  providerPopulation: number;
  /** Provider records that HAVE a local counterpart (the comparable set). */
  localComparablePopulation: number;
  /** Provider Active-ish records with NO local row. Measured live as 0. */
  absentLocally: number;
  /** Counts over the EMITTED entries, so they reconcile with `entries`. */
  totalsByReason: Record<RecoveryReason, number>;
  /** Diagnostics that do NOT gate inclusion — see `ManifestDiagnostics`. */
  diagnostics: ManifestDiagnostics;
  manifestSize: number;
  entries: ManifestEntry[];
}

export interface ManifestDiagnostics {
  /**
   * Rows carrying `mls_id_missing_or_wrong` REGARDLESS of whether they were
   * emitted. `mapTrestleToPrisma` maps `mls_id = ListingKey`, but most
   * historical rows were synced when ListingKey was not selected, so `mls_id` is
   * NULL on ~24,000 of ~25,000 rows. `mls_id` IS a material comparison field, so
   * a refresh physically writes every one of them. That is an IDENTITY BACKFILL,
   * not a staleness repair, and it must be visible as its own number before an
   * operator can decide to run it.
   */
  mlsIdMissingOrWrongTotal: number;
  /** Rows whose ONLY reason was the mls_id one (excluded unless the flag is on). */
  mlsBackfillOnlyRows: number;
  /** Duplicate provider ListingIds collapsed during the scan. Measured live as 0. */
  duplicateProviderListingIds: number;
  /**
   * The actual duplicated ids, so the condition is diagnosable without re-running
   * the scan. A duplicate is a scan artifact when the provider reports
   * `@odata.count = 1` for it, and a REAL identity collision otherwise — the CLI
   * verifies each one and fails closed only on a real collision.
   */
  duplicateProviderListingIdSamples: string[];
  /**
   * EMITTED gate mismatches where the expected display is false but we display
   * anyway. The safety-relevant direction: we are showing what REBNY gates off.
   * Split out so the explained-mismatch suppression below can never silently
   * swallow a real over-display — if this number moves, it is a compliance
   * signal, not noise.
   */
  displayGateOverDisplay: number;
  /** EMITTED gate mismatches where display is expected but we hide the row. */
  displayGateUnderDisplay: number;
  /**
   * SUPPRESSED mismatches: the provider-status-only expectation disagreed with
   * local `idx_display_yn`, but a gate — a CURRENT-provider Permission gate or
   * the local `rls_eligible` — fully explains the disagreement. These are NOT
   * differences and never enter the manifest. Reported because a large number
   * here means the provider-status-only view is systematically misleading.
   */
  displayGateExplainedByLocalGate: number;
  /**
   * Rows whose STORED `participant_only` / `owner_opt_out` disagree with the
   * values `derivePermissionGates` produces from the CURRENT provider record.
   *
   * This is the direct measurement of what the pre-2026-08-13 circular form was
   * hiding: every one of these rows had a stale source-derived gate column that
   * was being used to validate the very `idx_display_yn` it produced. It is a
   * DIAGNOSTIC, not a reason code — a stale gate column is repaired as a side
   * effect of any refresh the row already earns, and on its own it changes no
   * display outcome (if it did, `display_gate_mismatch` fires and the row is
   * emitted on that axis). A non-zero value here with zero
   * `display_gate_mismatch` means the drift is real but currently benign.
   */
  staleLocalPermissionGates: number;
  /**
   * Locally Active-ish Mallan-authored rows skipped by pass 2. These are absent
   * from the provider population by definition (they were never REBNY-sourced),
   * so their absence is not drift and must not become recovery work. Measured
   * live at 2 — SL-0004 and SL-0007, which are simultaneously the only
   * `rls_eligible=false` rows, the only locally-hidden Active-ish rows, and the
   * only non-`RLS`-prefixed ids in the Active-ish set.
   */
  mallanOwnedExcluded: number;
  /**
   * Reverse-set rows absent from the provider at EVERY status -- ghosts.
   * Deferred to app/api/cron/feed-reconcile, which transitions them to
   * Withdrawn with an audit trail daily at 30 3 * * *. NOT recovery work: the
   * executor has nothing to re-fetch and would book each one as a failure.
   * Measured live 2026-08-14: 58 of a 74-row reverse set (the other 16 exist at
   * StandardStatus=Pending and ARE emitted).
   */
  providerGhostsDeferredToFeedReconcile: number;
  /**
   * Reverse-set rows the provider NEVER ANSWERED for, after bounded retry.
   * A failed read is UNKNOWN, not absence: treating it as absence would defer a
   * live listing to feed-reconcile, which deliberately spares Pending, so
   * nothing would ever correct it. These rows are classified NEITHER way.
   *
   * MUST be 0 for a valid production manifest -- the CLI refuses to write the
   * artifact otherwise.
   */
  providerExistenceProbeUnknown: number;
  /**
   * Split of `absentLocally`. These three ALWAYS sum to it exactly.
   *
   * A live feed adds listings between our sync cycles, so `absentLocally = 0` is
   * not a stable gate. The production gate is instead
   * `absentLocallyUnexplained = 0` AND `absentLocallyUnknownTimestamp = 0`;
   * expected new arrivals MAY exist and are left to the normal incremental
   * Property owner, never put into recovery (the executor is update-only).
   */
  absentLocallyExpectedNew: number;
  /** Provider MT at/before the absorbed boundary -- we should already hold it. */
  absentLocallyUnexplained: number;
  /** Provider MT missing/unparseable, or no local boundary to compare against. */
  absentLocallyUnknownTimestamp: number;
}

// ── Pure classification ─────────────────────────────────────────────────────

/** Non-empty trimmed string, or null. Empty string is never an identity. */
function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse a provider timestamp. Returns null for absent OR unparsable input. */
function parseProviderTimestamp(value: string | null): number | null {
  const raw = nonEmpty(value);
  if (raw === null) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The display gate computed from the PROVIDER FIELDS ALONE.
 *
 * The Permission enum is not in PROVIDER_SELECT_FIELDS, so the per-row REBNY
 * gates are unknown to this view and default open. It is therefore the MAXIMUM
 * value the gate could take — useful only as the "before" half of the
 * explained-mismatch diagnostic. NEVER classify with it: on its own it reports
 * every legitimately-gated local row as a mismatch.
 */
export function providerExpectedIdxDisplay(provider: ProviderRow): boolean {
  return computeGateColumns({
    status: provider.StandardStatus,
    internetEntireListingDisplayYN: provider.InternetEntireListingDisplayYN,
  }).idx_display_yn;
}

/**
 * THE classification input: the display gate a canonical ingest would compute
 * for this row RIGHT NOW.
 *
 * Every source-derived input comes from the CURRENT provider record — status,
 * entire-listing flag, and the two per-row REBNY gates re-derived from live
 * `Permission` / `MlsStatus` through `derivePermissionGates`, the same single
 * owner `mapTrestleToPrisma` uses. Only `rls_eligible` is read locally, and
 * only because it is genuinely local: no Cotality field maps to it,
 * `mapTrestleToPrisma` never emits it, it appears zero times in
 * `LISTING_SYNC_COMPARE_SELECT`, the Trestle path hard-codes the constant
 * `true` (`lib/idx/sync.ts:1085`), and its only real writers are the CRM
 * routes classifying Mallan-authored website-only inventory. Provider state
 * cannot answer it, so local state is the authority — not a fallback.
 *
 * WHY THIS IS NOT THE OLD VERSION. Until 2026-08-13 this fed the STORED local
 * `participant_only` / `owner_opt_out` into the evaluator. Those columns are
 * outputs of `derivePermissionGates`, so stored state was vouching for stored
 * state. The concrete failure: a listing whose Permission goes 'Private' →
 * 'Public' at the source keeps `participant_only=true` locally until something
 * refreshes it; that stale `true` "explained" its stale `idx_display_yn=false`,
 * the row earned no reason, and the generator whose job is to schedule that
 * refresh excluded it — permanently. Re-deriving from the provider inverts it:
 * the row now reports `display_gate_mismatch` and gets repaired.
 *
 * Delegating to `computeGateColumns` keeps this file holding no second opinion
 * about gate semantics — null IELD = REBNY pre-filter passed = displayable,
 * terminal status forces false, and each gate forces false on its own.
 */
export function expectedIdxDisplay(provider: ProviderRow, local: LocalRow): boolean {
  const gates = derivePermissionGates({
    Permission: provider.Permission,
    MlsStatus: provider.MlsStatus,
  });
  return computeGateColumns({
    status: provider.StandardStatus,
    internetEntireListingDisplayYN: provider.InternetEntireListingDisplayYN,
    participantOnly: gates.participantOnly,
    ownerOptOut: gates.ownerOptOut,
    // Local by proof, not by convenience — see the docstring.
    rls_eligible: local.rls_eligible,
  }).idx_display_yn;
}

/**
 * True when the STORED source-derived gate columns disagree with what the
 * CURRENT provider record derives. Pure diagnostic — see
 * `ManifestDiagnostics.staleLocalPermissionGates`. Emits NO reason: this
 * function exists to MEASURE the drift the old circular classifier consumed,
 * never to act on it.
 */
export function localPermissionGatesAreStale(
  provider: ProviderRow,
  local: LocalRow,
): boolean {
  const gates = derivePermissionGates({
    Permission: provider.Permission,
    MlsStatus: provider.MlsStatus,
  });
  return (
    gates.participantOnly !== local.participant_only ||
    gates.ownerOptOut !== local.owner_opt_out
  );
}

/**
 * True when the provider-status-only view called a mismatch but the full
 * evaluation does not — i.e. a gate fully explains the disagreement. Pure
 * diagnostic: these rows carry NO reason and never enter the manifest.
 *
 * The explaining gate is now a CURRENT-PROVIDER Permission gate or the local
 * `rls_eligible`, never a stale stored gate column. A row suppressed here is
 * one canonical ingest would agree with today.
 */
export function displayGateMismatchExplainedByGate(
  provider: ProviderRow,
  local: LocalRow,
): boolean {
  return (
    providerExpectedIdxDisplay(provider) !== local.idx_display_yn &&
    expectedIdxDisplay(provider, local) === local.idx_display_yn
  );
}

/**
 * Classify one provider row against its local counterpart. Returns EVERY reason
 * that applies, in canonical order. An empty array means "provably converged" —
 * the row is excluded.
 *
 * Per-reason semantics:
 *
 *  - `provider_mt_newer` — strictly newer only. Equal MT is convergence (that is
 *    the 87.4% the old predicate mis-selected) and a LOCAL MT newer than the
 *    provider's is not a refresh case (measured: 0 rows). An unparsable or
 *    absent provider MT yields NO reason: we cannot verify a difference we
 *    cannot read, and this generator never guesses. A local MT that is null
 *    against a readable provider MT IS a verified difference.
 *
 *  - `status_mismatch` — both sides go through `normalizeStandardStatus` so a
 *    case/whitespace/alias variant ("canceled" vs "Cancelled") is convergence,
 *    not a mismatch. Comparing raw strings would manufacture work.
 *
 *  - `display_gate_mismatch` — fires ONLY when the disagreement is UNEXPLAINED.
 *    The expectation is computed by `expectedIdxDisplay`, which re-derives the
 *    REBNY gates from the row's CURRENT provider `Permission` / `MlsStatus` and
 *    folds in the genuinely-local `rls_eligible`. A row that canonical ingest
 *    would gate off TODAY produces NO reason on this axis; a row gated off only
 *    by a STALE stored gate column now DOES produce one, which is the entire
 *    point of the 2026-08-13 de-circularization. Emitting it would be a false positive of
 *    exactly the shape this generator exists to eliminate: the row is not
 *    different, so a refresh would re-fetch it, suppress the write, change
 *    nothing, and the row would re-appear in every future manifest — the "old
 *    clock" defect in a new costume. Suppressed rows are counted as
 *    `displayGateExplainedByLocalGate`, and the surviving mismatches are split
 *    into `displayGateOverDisplay` / `displayGateUnderDisplay`, so a genuine
 *    over-display can never be swallowed by this suppression.
 *
 *  - `mls_id_missing_or_wrong` — a null provider ListingKey yields NO reason
 *    (nothing to compare against); anything else is a verified identity gap.
 */
export function classifyProviderRow(provider: ProviderRow, local: LocalRow): RecoveryReason[] {
  const reasons: RecoveryReason[] = [];

  const providerMs = parseProviderTimestamp(provider.ModificationTimestamp);
  if (providerMs !== null) {
    const localMs = local.modification_timestamp?.getTime() ?? null;
    if (localMs === null || providerMs > localMs) reasons.push("provider_mt_newer");
  }

  if (normalizeStandardStatus(provider.StandardStatus) !== normalizeStandardStatus(local.status)) {
    reasons.push("status_mismatch");
  }

  if (expectedIdxDisplay(provider, local) !== local.idx_display_yn) {
    reasons.push("display_gate_mismatch");
  }

  const providerKey = nonEmpty(provider.ListingKey);
  if (providerKey !== null && local.mls_id !== providerKey) {
    reasons.push("mls_id_missing_or_wrong");
  }

  return sortReasons(reasons);
}

/** Canonical reason ordering, so identical state yields identical arrays. */
export function sortReasons(reasons: readonly RecoveryReason[]): RecoveryReason[] {
  return [...new Set(reasons)].sort(
    (a, b) => (REASON_ORDER.get(a) ?? 0) - (REASON_ORDER.get(b) ?? 0),
  );
}

/** THE ONLY manifest-entry constructor. Three keys, nothing else — ever. */
export function buildEntry(
  listingId: string,
  listingKey: string | null,
  reasons: readonly RecoveryReason[],
): ManifestEntry {
  return { listingId, listingKey, reasons: sortReasons(reasons) };
}

export function isLocalActiveIsh(row: LocalRow): boolean {
  return PROVIDER_ACTIVE_STATUSES.includes(normalizeStandardStatus(row.status));
}

// ── Manifest assembly ───────────────────────────────────────────────────────

export interface BuildManifestInput {
  providerRows: readonly ProviderRow[];
  /**
   * The union of (a) the chunked counterpart lookup over provider ListingIds and
   * (b) the local Active-ish scan. Both are needed: (a) finds provider rows whose
   * local status drifted OUT of Active-ish, (b) finds local Active-ish rows the
   * provider no longer lists as Active-ish.
   */
  localRows: readonly LocalRow[];
  /** Default OFF — see `ManifestDiagnostics.mlsIdMissingOrWrongTotal`. */
  includeMlsBackfill: boolean;
  generatedAt?: string;
  /**
   * TRI-STATE reverse-set classification — see `fetchProviderExistence`.
   * `existing` rows become `local_active_provider_terminal`; PROVEN `absent`
   * rows are ghosts owned by `app/api/cron/feed-reconcile`; `unknown` rows are
   * counted and must abort the build, never classified either way.
   *
   * OMITTED (undefined) means the probe was not run, and pass 2 keeps its
   * pre-2026-08-14 behavior of emitting every reverse-set row. Callers that
   * feed a live provider MUST pass it; the CLI always does.
   */
  providerExistence?: ProviderExistence;
  /**
   * The newest provider ModificationTimestamp this deployment has actually
   * ABSORBED — `MAX(listings.modification_timestamp)`. Used to classify
   * `absentLocally` rows; see `classifyAbsentLocally`.
   *
   * WHY NOT `sync_state.last_watermark`. Measured on canonical production
   * 2026-08-14: `last_watermark` (04:00:40) equals `last_run_at` EXACTLY and is
   * LATER than the newest local `modification_timestamp` (03:59:58) — it is a
   * wall clock, not a provider instant, which is the defect this PR removes.
   * Comparing a provider MT against our run clock is that same cross-clock
   * error. `MAX(modification_timestamp)` is provider-domain on both sides and is
   * what `getPropertyKeysetCursor()` already bootstraps from.
   *
   * OMITTED means absent rows are only counted, never classified.
   */
  absorbedThroughMt?: Date | null;
}

export function buildManifest(input: BuildManifestInput): RecoveryManifest {
  const providerById = new Map<string, ProviderRow>();
  const duplicateIds = new Set<string>();
  for (const row of input.providerRows) {
    const id = nonEmpty(row.ListingId);
    if (id === null) continue;
    if (providerById.has(id)) {
      // Same id observed twice IN ONE SCAN. The scan is ordered by
      // (ModificationTimestamp asc, ListingKey asc); a row MODIFIED while the
      // scan is in flight moves forward in that order and can be seen again on
      // a later page. That is an artifact of paging a live feed on a mutating
      // sort key, NOT two records sharing an identity — and it is why a literal
      // `duplicateProviderListingIds = 0` is not a stable invariant. The ids are
      // recorded so the CLI can ask the provider which it is.
      duplicateIds.add(id);
      continue;
    }
    providerById.set(id, row);
  }
  const duplicateProviderListingIds = duplicateIds.size;

  const localById = new Map<string, LocalRow>();
  for (const row of input.localRows) {
    const id = nonEmpty(row.listing_id);
    if (id !== null) localById.set(id, row);
  }

  const classified: ManifestEntry[] = [];
  let absentLocally = 0;
  let localComparablePopulation = 0;
  let displayGateOverDisplay = 0;
  let displayGateUnderDisplay = 0;
  let displayGateExplainedByLocalGate = 0;
  let staleLocalPermissionGates = 0;
  let mallanOwnedExcluded = 0;
  let providerGhostsDeferredToFeedReconcile = 0;
  let providerExistenceProbeUnknown = 0;
  let absentLocallyExpectedNew = 0;
  let absentLocallyUnexplained = 0;
  let absentLocallyUnknownTimestamp = 0;

  // Pass 1 — provider Active-ish rows against their local counterparts.
  for (const [listingId, provider] of providerById) {
    const local = localById.get(listingId);
    if (!local) {
      // NOT a manifest entry. The executor is `listing.update`-only and
      // structurally cannot create; emitting an id it must refuse would be a
      // manifest that lies. Counted and printed instead — loudly, because the
      // live census measured this at exactly 0 and a non-zero value means the
      // problem changed shape.
      absentLocally++;
      switch (classifyAbsentLocally(provider.ModificationTimestamp, input.absorbedThroughMt)) {
        case "expected_new_arrival":
          absentLocallyExpectedNew++;
          break;
        case "unexplained_absent":
          absentLocallyUnexplained++;
          break;
        default:
          absentLocallyUnknownTimestamp++;
      }
      continue;
    }
    localComparablePopulation++;
    const reasons = classifyProviderRow(provider, local);
    if (reasons.includes("display_gate_mismatch")) {
      // Local `idx_display_yn=true` against an expected false is the
      // safety-relevant direction and is never suppressible — a local gate can
      // only push the expectation toward false, never toward true.
      if (local.idx_display_yn) displayGateOverDisplay++;
      else displayGateUnderDisplay++;
    } else if (displayGateMismatchExplainedByGate(provider, local)) {
      displayGateExplainedByLocalGate++;
    }
    if (localPermissionGatesAreStale(provider, local)) staleLocalPermissionGates++;
    if (reasons.length === 0) continue;
    classified.push(buildEntry(listingId, nonEmpty(provider.ListingKey), reasons));
  }

  // Pass 2 — the reverse set: locally Active-ish, absent from the provider
  // Active-ish population. Disjoint from pass 1 by construction (this branch
  // requires absence from `providerById`), so no entry can be produced twice.
  for (const [listingId, local] of localById) {
    if (providerById.has(listingId)) continue;
    if (!isLocalActiveIsh(local)) continue;
    // Mallan-authored inventory is absent from the Cotality Property feed BY
    // DEFINITION, never by drift — it was never REBNY-sourced. Emitting it here
    // would tell the executor to "correct" a listing whose authority is Mallan.
    // The executor fetches it, gets nothing back, and fail-closes to `failed`
    // (scripts/recover-stale-property-listings.ts:576) — so no bad write, but
    // the pre-authorization gate is `failed = 0` and these rows would block a
    // clean run for a false reason. Uses the CANONICAL ownership helper, so the
    // manifest holds no second opinion about what Mallan-owned means.
    if (isMallanExclusiveListing({ listing_id: listingId, rls_eligible: local.rls_eligible })) {
      mallanOwnedExcluded++;
      continue;
    }
    if (input.providerExistence !== undefined) {
      const { existing, unknown } = input.providerExistence;
      // UNKNOWN: the provider never answered for this id. It is neither
      // recovery work nor a ghost — classifying it either way would be a guess.
      // Counted so the CLI can fail the build; never emitted, never deferred.
      if (unknown.has(listingId)) {
        providerExistenceProbeUnknown++;
        continue;
      }
      // PROVEN ABSENT (provider answered, did not return it): a ghost. The
      // executor has nothing to re-fetch and fail-closes to `failed`, which
      // would permanently block the `failed = 0` gate, and
      // `app/api/cron/feed-reconcile` already owns the transition to Withdrawn
      // WITH an audit event. Deferred, not dropped — the count is reported.
      if (!existing.has(listingId)) {
        providerGhostsDeferredToFeedReconcile++;
        continue;
      }
    }
    // `listingKey` comes from the local mls_id when we have one — there is no
    // provider record to read it from. Usually null; that is honest, not a bug.
    classified.push(buildEntry(listingId, local.mls_id, ["local_active_provider_terminal"]));
  }

  const mlsOnly = (e: ManifestEntry) =>
    e.reasons.length === 1 && e.reasons[0] === "mls_id_missing_or_wrong";

  const mlsIdMissingOrWrongTotal = classified.filter((e) =>
    e.reasons.includes("mls_id_missing_or_wrong"),
  ).length;
  const mlsBackfillOnlyRows = classified.filter(mlsOnly).length;

  const entries = input.includeMlsBackfill ? classified : classified.filter((e) => !mlsOnly(e));
  entries.sort((a, b) => a.listingId.localeCompare(b.listingId));

  const totalsByReason = Object.fromEntries(
    RECOVERY_REASON_CODES.map((code) => [
      code,
      entries.filter((e) => e.reasons.includes(code)).length,
    ]),
  ) as Record<RecoveryReason, number>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    includeMlsBackfill: input.includeMlsBackfill,
    providerPopulation: providerById.size,
    localComparablePopulation,
    absentLocally,
    totalsByReason,
    diagnostics: {
      mlsIdMissingOrWrongTotal,
      mlsBackfillOnlyRows,
      duplicateProviderListingIds,
      duplicateProviderListingIdSamples: [...duplicateIds].sort(),
      displayGateOverDisplay,
      displayGateUnderDisplay,
      displayGateExplainedByLocalGate,
      staleLocalPermissionGates,
      mallanOwnedExcluded,
      providerGhostsDeferredToFeedReconcile,
      providerExistenceProbeUnknown,
      absentLocallyExpectedNew,
      absentLocallyUnexplained,
      absentLocallyUnknownTimestamp,
    },
    manifestSize: entries.length,
    entries,
  };
}

// ── Provider I/O ────────────────────────────────────────────────────────────

/** Injected in tests so the paging loop is exercised without a live provider. */
export interface ProviderFetchDeps {
  token: () => Promise<string>;
  httpGet: (url: string, bearer: string) => Promise<Record<string, unknown>>;
}

function providerEndpoint(): string {
  const base =
    process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
  return `${base}/odata/Property`;
}

/** `StandardStatus eq 'Active' or ...` — the provider Active-ish predicate. */
export function buildProviderActiveFilter(): string {
  return PROVIDER_ACTIVE_STATUSES.map((s) => `StandardStatus eq '${s}'`).join(" or ");
}

function coerceProviderRow(raw: Record<string, unknown>): ProviderRow | null {
  const listingId = nonEmpty(raw.ListingId);
  if (listingId === null) return null;
  return {
    ListingId: listingId,
    ListingKey: nonEmpty(raw.ListingKey),
    ModificationTimestamp: nonEmpty(raw.ModificationTimestamp),
    StandardStatus: nonEmpty(raw.StandardStatus),
    PropertyType: nonEmpty(raw.PropertyType),
    // Tri-state on purpose: `null` means "REBNY's upstream filter passed this
    // row" (displayable), which is NOT the same as an explicit `false`. Coercing
    // to a boolean here is the exact shape of the 2026-04-30 7,594-row
    // corruption (memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md).
    InternetEntireListingDisplayYN:
      typeof raw.InternetEntireListingDisplayYN === "boolean"
        ? raw.InternetEntireListingDisplayYN
        : null,
    // Passed through UNPARSED. `derivePermissionGates` is the single owner of
    // what these mean; normalizing, splitting, or upper-casing here would be
    // the second interpretation this refactor exists to prevent. `nonEmpty`
    // only distinguishes absent from present — it makes no claim about value.
    Permission: nonEmpty(raw.Permission),
    MlsStatus: nonEmpty(raw.MlsStatus),
  };
}

/**
 * Chunk size for the reverse-set existence probe. Matches the Property lookup
 * in `scripts/recover-residual-listing-media.ts` — an `or`-joined ListingId
 * filter grows the URL linearly and Trestle rejects over-long query strings.
 */
export const EXISTENCE_PROBE_CHUNK_SIZE = 15;

/**
 * Which of these ListingIds exist on the provider AT ANY STATUS.
 *
 * WHY THIS EXISTS. Pass 2 keys on absence from the Active-ish population, and
 * that single signal covers TWO conditions with DIFFERENT OWNERS:
 *
 *   1. Still in the feed, moved to a non-Active-ish status (measured live:
 *      16 rows, all `Pending`). The recovery executor re-fetches and corrects
 *      these — genuinely its work.
 *   2. Gone from the feed entirely (measured live: 58 rows, `@odata.count = 0`
 *      at HTTP 200, so not throttling). These are GHOSTS, and they already have
 *      a canonical owner: `app/api/cron/feed-reconcile`, which transitions them
 *      to Withdrawn with an audit trail, daily at `30 3 * * *`, sparing
 *      Pending/ActiveUnderContract/ComingSoon. It is demonstrably healthy —
 *      production shows its last transition at exactly 2026-08-13 03:30 UTC and
 *      90/522/2,079 withdrawals over 24h/7d/30d.
 *
 * Emitting (2) as recovery work is a defect: `fetchSingleListing` has nothing to
 * return, the executor fail-closes to `failed`, and the pre-authorization gate
 * `failed = 0` can never be met. It would also duplicate a compliance-shaped
 * status transition that owes an audit event — a second implementation of
 * exactly the kind this file refuses to make.
 *
 * Fail-closed: a chunk that errors marks its ids UNKNOWN, and an unknown id is
 * NOT emitted as recovery work. We never manufacture a repair from a failed
 * read.
 */
/** How a provider Active-ish row with no local counterpart is explained. */
export type AbsentClass = "expected_new_arrival" | "unexplained_absent" | "unknown_absent_time";

/**
 * Classify ONE absent provider row against the boundary we have absorbed.
 *
 * `absentLocally = 0` is NOT a stable invariant against a live feed: listings
 * appear on Cotality between our sync cycles, and a generator that demanded a
 * literal zero would fail at random depending on when it ran. The real question
 * is whether an absent row is one we SHOULD already hold.
 *
 * STRICTLY greater than the boundary is required for "expected". A row whose MT
 * EQUALS the boundary sits inside the same-timestamp cluster the keyset cursor
 * exists to traverse, and an absent row there is precisely the cluster-loss
 * defect this PR repairs — so equality is `unexplained`, the fail-closed
 * direction that forces investigation rather than excusing it.
 */
export function classifyAbsentLocally(
  providerMt: string | null,
  absorbedThroughMt: Date | null | undefined,
): AbsentClass {
  const ms = parseProviderTimestamp(providerMt);
  if (ms === null) return "unknown_absent_time";
  // No boundary (empty local table) — we cannot claim the row is late.
  if (absorbedThroughMt === null || absorbedThroughMt === undefined) return "unknown_absent_time";
  return ms > absorbedThroughMt.getTime() ? "expected_new_arrival" : "unexplained_absent";
}

export interface ProviderExistence {
  /** Provider returned the row. HTTP 200 + present. */
  existing: Set<string>;
  /** Provider answered successfully and did NOT return the row. HTTP 200 + absent. */
  absent: Set<string>;
  /** The provider never answered. NOT absence — see below. */
  unknown: Set<string>;
}

/** Attempts per chunk before its ids are declared UNKNOWN. */
export const EXISTENCE_PROBE_MAX_ATTEMPTS = 3;

/**
 * Classify these ListingIds against the provider AT ANY STATUS, as a TRI-STATE.
 *
 * A FAILED READ IS NOT AN ABSENCE. The first version of this returned a single
 * `found` set and callers treated "not in found" as authoritative absence, so a
 * transient HTTP 503 silently reclassified a live listing as a ghost. The
 * concrete failure: a locally-Active listing that is actually `Pending` on
 * Cotality gets a 503 on its probe chunk, is deferred as a ghost, and
 * feed-reconcile deliberately SPARES Pending — so nothing ever corrects it and
 * the stale local Active row persists indefinitely. Absence and ignorance are
 * different facts and must not share a representation.
 *
 * Only a SUCCESSFUL provider response may establish absence. A chunk is retried
 * up to `EXISTENCE_PROBE_MAX_ATTEMPTS`; if it still fails, every id in it lands
 * in `unknown` and the caller MUST fail the build rather than classify.
 */
export async function fetchProviderExistence(
  listingIds: readonly string[],
  deps: Partial<ProviderFetchDeps> = {},
): Promise<ProviderExistence> {
  const existing = new Set<string>();
  const absent = new Set<string>();
  const unknown = new Set<string>();
  if (listingIds.length === 0) return { existing, absent, unknown };
  const token = deps.token ?? getAccessToken;
  const httpGet = deps.httpGet ?? defaultHttpGet;
  const bearer = await token();

  for (const group of chunk(listingIds, EXISTENCE_PROBE_CHUNK_SIZE)) {
    const filter = group.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(" or ");
    const url =
      `${providerEndpoint()}?` +
      new URLSearchParams({
        $select: "ListingId",
        $filter: filter,
        $top: String(group.length),
      }).toString();

    let answered = false;
    let lastErr = "";
    for (let attempt = 1; attempt <= EXISTENCE_PROBE_MAX_ATTEMPTS && !answered; attempt++) {
      try {
        const page = await httpGet(url, bearer);
        const returned = new Set<string>();
        for (const raw of (page.value as Array<Record<string, unknown>>) ?? []) {
          const id = nonEmpty(raw.ListingId);
          if (id !== null) returned.add(id);
        }
        // The provider ANSWERED. Everything it did not return is now
        // authoritatively absent — this is the only path that may say so.
        for (const id of group) {
          if (returned.has(id)) existing.add(id);
          else absent.add(id);
        }
        answered = true;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(
          `[recovery-manifest] existence probe chunk attempt ${attempt}/` +
            `${EXISTENCE_PROBE_MAX_ATTEMPTS} failed (${group.length} ids): ${lastErr}`,
        );
      }
    }
    if (!answered) {
      for (const id of group) unknown.add(id);
      console.error(
        `[recovery-manifest] existence probe UNKNOWN for ${group.length} id(s) after ` +
          `${EXISTENCE_PROBE_MAX_ATTEMPTS} attempts: ${lastErr}`,
      );
    }
  }
  return { existing, absent, unknown };
}

/** `@odata.count` for one ListingId. -1 when the provider did not answer. */
async function providerRecordCount(listingId: string): Promise<number> {
  const bearer = await getAccessToken();
  const url =
    `${providerEndpoint()}?` +
    new URLSearchParams({
      $filter: `ListingId eq '${listingId.replace(/'/g, "''")}'`,
      $select: "ListingId",
      $count: "true",
      $top: "2",
    }).toString();
  try {
    const body = await defaultHttpGet(url, bearer);
    return Number(body["@odata.count"] ?? -1);
  } catch {
    return -1;
  }
}

async function defaultHttpGet(url: string, bearer: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[recovery-manifest] provider page failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Page the FULL provider Active-ish population, following `@odata.nextLink`.
 *
 * Ordered by the same keyset the canonical ingest uses
 * (ModificationTimestamp asc, ListingKey asc) so a mid-scan provider write
 * cannot make a row skip past the read window.
 */
export async function fetchProviderActivePopulation(
  deps: Partial<ProviderFetchDeps> = {},
): Promise<ProviderRow[]> {
  const token = deps.token ?? getAccessToken;
  const httpGet = deps.httpGet ?? defaultHttpGet;
  const bearer = await token();

  let url =
    `${providerEndpoint()}?` +
    new URLSearchParams({
      $select: PROVIDER_SELECT_FIELDS.join(","),
      $filter: buildProviderActiveFilter(),
      $orderby: "ModificationTimestamp asc,ListingKey asc",
      $top: String(PROVIDER_PAGE_SIZE),
    }).toString();

  const rows: ProviderRow[] = [];
  let pages = 0;
  while (url) {
    if (++pages > MAX_PROVIDER_PAGES) {
      throw new Error(
        `[recovery-manifest] provider paging exceeded ${MAX_PROVIDER_PAGES} pages — ` +
          "refusing to continue (suspected nextLink loop). Fail closed.",
      );
    }
    const body = await httpGet(url, bearer);
    const page = (body.value as Record<string, unknown>[] | undefined) ?? [];
    for (const raw of page) {
      const row = coerceProviderRow(raw);
      if (row !== null) rows.push(row);
    }
    const next = body["@odata.nextLink"];
    url = typeof next === "string" && next.length > 0 ? next : "";
  }
  return rows;
}

// ── Local I/O ───────────────────────────────────────────────────────────────

/** The narrow prisma surface this generator uses. READ ONLY — findMany only. */
export interface ManifestPrisma {
  listing: {
    findMany: (args: Record<string, unknown>) => Promise<LocalRow[]>;
  };
}

/**
 * The columns compared. Nothing else is read, so nothing else can leak.
 *
 * The last three are gate INPUTS, not comparison targets: they exist so the
 * display-gate check can distinguish a real over-display from a row that is
 * legitimately gated off locally. Without them the check reports every
 * participant-only / owner-opted-out / non-RLS-eligible row as a difference
 * forever.
 */
export const LOCAL_COMPARE_SELECT = {
  listing_id: true,
  status: true,
  modification_timestamp: true,
  idx_display_yn: true,
  mls_id: true,
  sync_status: true,
  participant_only: true,
  owner_opt_out: true,
  rls_eligible: true,
} as const;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const bounded = Math.max(1, Math.min(Math.floor(size), LOCAL_LOOKUP_CHUNK_SIZE));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += bounded) out.push(items.slice(i, i + bounded));
  return out;
}

/**
 * Load local counterparts for the provider ids, in chunked `IN` queries. The
 * chunk size is CLAMPED to LOCAL_LOOKUP_CHUNK_SIZE, never merely validated — a
 * caller passing 50,000 must degrade to a safe query plan, not blow the
 * statement parameter ceiling mid-reconciliation.
 */
export async function loadLocalRows(
  db: ManifestPrisma,
  listingIds: readonly string[],
  chunkSize: number = LOCAL_LOOKUP_CHUNK_SIZE,
): Promise<LocalRow[]> {
  const out: LocalRow[] = [];
  for (const ids of chunk(listingIds, chunkSize)) {
    const rows = await db.listing.findMany({
      where: { listing_id: { in: ids } },
      select: LOCAL_COMPARE_SELECT,
    });
    out.push(...rows);
  }
  return out;
}

/**
 * Load every locally Active-ish row, keyset-paginated by `listing_id`. This is
 * the source of the reverse set (`local_active_provider_terminal`) — rows we
 * still show as Active that the provider no longer lists as Active-ish.
 */
export async function loadLocalActiveIshRows(
  db: ManifestPrisma,
  pageSize: number = LOCAL_LOOKUP_CHUNK_SIZE,
): Promise<LocalRow[]> {
  const take = Math.max(1, Math.min(Math.floor(pageSize), LOCAL_LOOKUP_CHUNK_SIZE));
  const out: LocalRow[] = [];
  let after: string | null = null;
  for (;;) {
    const rows: LocalRow[] = await db.listing.findMany({
      where: {
        status: { in: [...PROVIDER_ACTIVE_STATUSES] },
        ...(after === null ? {} : { listing_id: { gt: after } }),
      },
      orderBy: { listing_id: "asc" },
      take,
      select: LOCAL_COMPARE_SELECT,
    });
    if (rows.length === 0) break;
    out.push(...rows);
    after = rows[rows.length - 1].listing_id;
    if (rows.length < take) break;
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export interface ManifestArgs {
  includeMlsBackfill: boolean;
  outPath: string;
}

export function parseManifestArgs(argv: readonly string[]): ManifestArgs {
  const outFlag = argv.find((a) => a.startsWith("--out="));
  return {
    // Default OFF. An identity backfill must never be hidden inside a staleness
    // repair — the operator opts in after seeing the volume printed below.
    includeMlsBackfill: argv.includes("--include-mls-backfill"),
    outPath: outFlag ? outFlag.slice("--out=".length) : DEFAULT_MANIFEST_PATH,
  };
}

export function formatTotalsTable(manifest: RecoveryManifest): string {
  const lines: string[] = [];
  lines.push("reason                            count");
  lines.push("--------------------------------- -----");
  for (const code of RECOVERY_REASON_CODES) {
    lines.push(`${code.padEnd(33)} ${String(manifest.totalsByReason[code]).padStart(5)}`);
  }
  lines.push("--------------------------------- -----");
  lines.push(`${"MANIFEST SIZE".padEnd(33)} ${String(manifest.manifestSize).padStart(5)}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseManifestArgs(process.argv.slice(2));

  console.log("[recovery-manifest] scanning provider Active-ish population…");
  const providerRows = await fetchProviderActivePopulation();
  console.log(`[recovery-manifest] provider rows: ${providerRows.length}`);

  const providerIds = providerRows.map((r) => r.ListingId);
  const counterparts = await loadLocalRows(prisma as unknown as ManifestPrisma, providerIds);
  const localActive = await loadLocalActiveIshRows(prisma as unknown as ManifestPrisma);
  console.log(
    `[recovery-manifest] local counterparts: ${counterparts.length}; local Active-ish: ${localActive.length}`,
  );

  // The reverse set: locally Active-ish, absent from the provider Active-ish
  // population. Probe each against the provider AT ANY STATUS so a ghost (gone
  // from the feed) is separated from a live status change. Bounded by the
  // reverse-set size, which is two orders of magnitude below the population.
  const providerIdSet = new Set(providerRows.map((r) => r.ListingId));
  const reverseSetIds = localActive
    .filter((l) => !providerIdSet.has(l.listing_id))
    .filter((l) => !isMallanExclusiveListing({ listing_id: l.listing_id, rls_eligible: l.rls_eligible }))
    .map((l) => l.listing_id);
  console.log(`[recovery-manifest] reverse set: ${reverseSetIds.length}; probing provider at any status…`);
  const providerExistence = await fetchProviderExistence(reverseSetIds);
  console.log(
    `[recovery-manifest] reverse set: existing ${providerExistence.existing.size}; ` +
      `proven-absent ghosts ${providerExistence.absent.size}; ` +
      `UNKNOWN ${providerExistence.unknown.size}`,
  );

  // The boundary we have actually ABSORBED, in the provider's own MT domain.
  // NOT sync_state.last_watermark: measured on production it equals last_run_at
  // exactly and exceeds the newest local modification_timestamp, i.e. it is a
  // wall clock -- the very defect this PR removes.
  const absorbed = await prisma.listing.aggregate({ _max: { modification_timestamp: true } });
  const absorbedThroughMt = absorbed._max.modification_timestamp ?? null;
  console.log(
    `[recovery-manifest] absorbed through provider MT: ${absorbedThroughMt?.toISOString() ?? "(none)"}`,
  );

  const manifest = buildManifest({
    providerRows,
    localRows: [...counterparts, ...localActive],
    includeMlsBackfill: args.includeMlsBackfill,
    providerExistence,
    absorbedThroughMt,
  });

  // A duplicated id is a SCAN ARTIFACT when the provider holds exactly one
  // record for it, and a REAL identity collision otherwise. Verified, not
  // assumed: the two demand opposite responses. The scan is ordered by
  // (ModificationTimestamp asc, ListingKey asc), so a row modified mid-scan
  // moves forward and can be observed twice — which is why a literal
  // `duplicateProviderListingIds = 0` is not a stable invariant on a live feed.
  let identityCollisions = 0;
  for (const id of manifest.diagnostics.duplicateProviderListingIdSamples) {
    const n = await providerRecordCount(id);
    if (n !== 1) identityCollisions++;
    console.log(
      `[recovery-manifest] duplicate id ${id}: ` +
        (n === 1 ? "pagination artifact (provider holds 1 record)" : `REAL COLLISION (count=${n})`),
    );
  }

  // ── FAIL-CLOSED GATES ─────────────────────────────────────────────────────
  // Enforced BEFORE the artifact is written, so an invalid manifest never
  // reaches an operator's disk where it could be fed to the executor later.
  const blockers: string[] = [];
  if (manifest.diagnostics.providerExistenceProbeUnknown > 0) {
    blockers.push(
      `providerExistenceProbeUnknown=${manifest.diagnostics.providerExistenceProbeUnknown} ` +
        `(a failed provider read is UNKNOWN, never absence — these ids cannot be classified)`,
    );
  }
  if (manifest.diagnostics.absentLocallyUnexplained > 0) {
    blockers.push(
      `absentLocallyUnexplained=${manifest.diagnostics.absentLocallyUnexplained} ` +
        `(provider row at/before the absorbed MT boundary that we do not hold)`,
    );
  }
  if (manifest.diagnostics.absentLocallyUnknownTimestamp > 0) {
    blockers.push(
      `absentLocallyUnknownTimestamp=${manifest.diagnostics.absentLocallyUnknownTimestamp} ` +
        `(unreadable provider ModificationTimestamp — cannot prove it is a new arrival)`,
    );
  }
  if (identityCollisions > 0) {
    blockers.push(
      `providerIdentityCollisions=${identityCollisions} ` +
        `(a ListingId resolving to more than one provider record invalidates the join key)`,
    );
  }
  if (blockers.length > 0) {
    console.error("");
    console.error("[recovery-manifest] REFUSING to write the manifest:");
    for (const b of blockers) console.error(`  - ${b}`);
    console.error("[recovery-manifest] investigate before any recovery is authorized.");
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const outPath = path.resolve(process.cwd(), args.outPath);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("");
  console.log(formatTotalsTable(manifest));
  console.log("");
  console.log(`provider population              ${manifest.providerPopulation}`);
  console.log(`local comparable population      ${manifest.localComparablePopulation}`);
  console.log(`absent locally                   ${manifest.absentLocally}`);
  console.log(`mls_id missing/wrong (all rows)  ${manifest.diagnostics.mlsIdMissingOrWrongTotal}`);
  console.log(`  ↳ mls_id-ONLY rows             ${manifest.diagnostics.mlsBackfillOnlyRows} ` +
    `(${args.includeMlsBackfill ? "INCLUDED" : "EXCLUDED — pass --include-mls-backfill to admit"})`);
  console.log(`display gate OVER-display (we show what is gated off)  ${manifest.diagnostics.displayGateOverDisplay}`);
  console.log(`display gate UNDER-display (we hide what is displayable) ${manifest.diagnostics.displayGateUnderDisplay}`);
  console.log(`display gate explained by a gate (suppressed)            ${manifest.diagnostics.displayGateExplainedByLocalGate}`);
  console.log(`stale local Permission gate columns (diagnostic only)     ${manifest.diagnostics.staleLocalPermissionGates}`);
  console.log(`Mallan-owned rows excluded from the reverse set           ${manifest.diagnostics.mallanOwnedExcluded}`);
  console.log(`provider GHOSTS deferred to feed-reconcile (not recovery) ${manifest.diagnostics.providerGhostsDeferredToFeedReconcile}`);
  console.log(`provider existence probe UNKNOWN (must be 0)              ${manifest.diagnostics.providerExistenceProbeUnknown}`);
  console.log(`  ↳ absent: expected NEW arrivals                         ${manifest.diagnostics.absentLocallyExpectedNew}`);
  console.log(`  ↳ absent: UNEXPLAINED (must be 0)                       ${manifest.diagnostics.absentLocallyUnexplained}`);
  console.log(`  ↳ absent: UNKNOWN timestamp (must be 0)                 ${manifest.diagnostics.absentLocallyUnknownTimestamp}`);
  console.log(`duplicate provider ListingIds (scan-order artifacts)      ${manifest.diagnostics.duplicateProviderListingIds}`);
  console.log(`  ↳ REAL identity collisions (must be 0)                  ${identityCollisions}`);
  console.log("");
  if (manifest.absentLocally > 0) {
    console.warn(
      `[recovery-manifest] WARNING: ${manifest.absentLocally} provider Active-ish ListingId(s) have ` +
        "NO local row. The live census measured this at 0. These are NOT in the manifest — the " +
        "recovery executor is update-only and cannot create them. Investigate before recovering.",
    );
  }
  if (manifest.diagnostics.displayGateOverDisplay > 0) {
    console.warn(
      `[recovery-manifest] WARNING: ${manifest.diagnostics.displayGateOverDisplay} row(s) are ` +
        "displayed locally while the provider gates them OFF, and no local REBNY gate explains it. " +
        "This is the compliance-relevant direction — recover these first.",
    );
  }
  console.log(`[recovery-manifest] manifest written: ${outPath}`);
}

// Run ONLY when invoked directly (same argv[1] test as the executor — portable
// across `npx tsx` and the ts-jest CJS transform, unlike require.main/import.meta).
if (/build-recovery-manifest\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  void main()
    .catch((err) => {
      console.error("[recovery-manifest] fatal:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
}
