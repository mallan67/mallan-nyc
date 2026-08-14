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
import { normalizeStandardStatus, computeGateColumns } from "@/lib/idx/trestle-mapper";

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
}

/**
 * One local counterpart row. Exactly the columns the comparison needs.
 *
 * `participant_only` / `owner_opt_out` / `rls_eligible` are here for ONE reason:
 * without them the display-gate comparison cannot tell a real over-display from
 * a row that is legitimately gated off locally. See `classifyProviderRow`. They
 * are read, never emitted — nothing about them reaches the manifest artifact.
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
   * SUPPRESSED mismatches: the provider-only expectation disagreed with local
   * `idx_display_yn`, but a local gate (`participant_only` / `owner_opt_out` /
   * `rls_eligible=false`) fully explains the disagreement. These are NOT
   * differences and never enter the manifest. Reported because a large number
   * here means the provider-only view is systematically misleading.
   */
  displayGateExplainedByLocalGate: number;
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
 * The display gate a canonical ingest WOULD compute for this row: the provider's
 * status and entire-listing flag, combined with the per-row REBNY gates as WE
 * currently hold them.
 *
 * This is THE classification input. Delegating to `computeGateColumns` — the
 * same evaluator every writer uses — means this file holds no second opinion
 * about gate semantics: null IELD = REBNY pre-filter passed = displayable,
 * terminal status forces false, and `participant_only` / `owner_opt_out` /
 * `rls_eligible=false` each force false on their own.
 *
 * Using the LOCAL gate values is correct and not circular. The mapper derives
 * `participant_only` / `owner_opt_out` from the provider's Permission enum, so
 * they are our best available knowledge of a provider fact, and `rls_eligible`
 * is a genuinely local classification. Feeding them in asks the right question:
 * "given everything we know, is `idx_display_yn` internally consistent?" A
 * disagreement that survives this is unexplained — a real defect on either side.
 * Note the gates can only push the expected value toward false, so a local
 * `idx_display_yn=true` can never be explained away by one.
 */
export function expectedIdxDisplayWithLocalGates(
  provider: ProviderRow,
  local: LocalRow,
): boolean {
  return computeGateColumns({
    status: provider.StandardStatus,
    internetEntireListingDisplayYN: provider.InternetEntireListingDisplayYN,
    participantOnly: local.participant_only,
    ownerOptOut: local.owner_opt_out,
    rls_eligible: local.rls_eligible,
  }).idx_display_yn;
}

/**
 * True when the provider-only view called a mismatch but the full-gate view does
 * not — i.e. a local REBNY gate fully explains the disagreement. Pure
 * diagnostic: these rows carry NO reason and never enter the manifest.
 */
export function displayGateMismatchExplainedByLocalGate(
  provider: ProviderRow,
  local: LocalRow,
): boolean {
  return (
    providerExpectedIdxDisplay(provider) !== local.idx_display_yn &&
    expectedIdxDisplayWithLocalGates(provider, local) === local.idx_display_yn
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
 *    The expectation is computed with the local REBNY gates folded in
 *    (`expectedIdxDisplayWithLocalGates`), so a row that is legitimately gated
 *    off locally by `participant_only` / `owner_opt_out` / `rls_eligible=false`
 *    produces NO reason on this axis. Emitting it would be a false positive of
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

  if (expectedIdxDisplayWithLocalGates(provider, local) !== local.idx_display_yn) {
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
}

export function buildManifest(input: BuildManifestInput): RecoveryManifest {
  const providerById = new Map<string, ProviderRow>();
  let duplicateProviderListingIds = 0;
  for (const row of input.providerRows) {
    const id = nonEmpty(row.ListingId);
    if (id === null) continue;
    if (providerById.has(id)) {
      duplicateProviderListingIds++;
      continue;
    }
    providerById.set(id, row);
  }

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
    } else if (displayGateMismatchExplainedByLocalGate(provider, local)) {
      displayGateExplainedByLocalGate++;
    }
    if (reasons.length === 0) continue;
    classified.push(buildEntry(listingId, nonEmpty(provider.ListingKey), reasons));
  }

  // Pass 2 — the reverse set: locally Active-ish, absent from the provider
  // Active-ish population. Disjoint from pass 1 by construction (this branch
  // requires absence from `providerById`), so no entry can be produced twice.
  for (const [listingId, local] of localById) {
    if (providerById.has(listingId)) continue;
    if (!isLocalActiveIsh(local)) continue;
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
      displayGateOverDisplay,
      displayGateUnderDisplay,
      displayGateExplainedByLocalGate,
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
  };
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

  const manifest = buildManifest({
    providerRows,
    localRows: [...counterparts, ...localActive],
    includeMlsBackfill: args.includeMlsBackfill,
  });

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
  console.log(`display gate explained by a local gate (suppressed)      ${manifest.diagnostics.displayGateExplainedByLocalGate}`);
  console.log(`duplicate provider ListingIds    ${manifest.diagnostics.duplicateProviderListingIds}`);
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
