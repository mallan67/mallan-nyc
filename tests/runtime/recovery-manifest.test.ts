/// <reference types="jest" />
/**
 * RECOVERY MANIFEST GENERATOR — behavioral contract.
 *
 * The generator's whole job is to replace a GUESS (`last_synced_from_trestle` is
 * old, so the row is probably stale — true for 12.6% of the rows it selected)
 * with a MEASUREMENT (this specific field differs between provider and local).
 * These tests hold that line:
 *
 *   1. every reason code fires on exactly the difference it names
 *   2. a row with NO verified difference is EXCLUDED — including a row that is
 *      merely old
 *   3. `mls_id_missing_or_wrong` alone does not admit a row unless the operator
 *      asked for the identity backfill, and the volume is reported either way
 *   4. the reverse set (locally Active-ish, provider no longer Active-ish) is
 *      detected
 *   5. entries carry THREE KEYS and no listing content
 *   6. the local lookup is chunked and the chunk size is clamped
 *
 * Only the two I/O boundaries are stubbed. Every classification decision runs
 * through the real `normalizeStandardStatus` / `computeGateColumns` from
 * lib/idx/trestle-mapper, so the manifest cannot hold a different opinion about
 * status folding or REBNY display-gate semantics than the ingest does.
 */

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: { findMany: jest.fn() },
    $disconnect: jest.fn(),
  },
}));

import {
  buildManifest,
  buildEntry,
  chunk,
  classifyProviderRow,
  displayGateMismatchExplainedByGate,
  expectedIdxDisplay,
  localPermissionGatesAreStale,
  fetchProviderActivePopulation,
  formatTotalsTable,
  isLocalActiveIsh,
  loadLocalRows,
  loadLocalActiveIshRows,
  parseManifestArgs,
  providerExpectedIdxDisplay,
  sortReasons,
  buildProviderActiveFilter,
  LOCAL_LOOKUP_CHUNK_SIZE,
  LOCAL_COMPARE_SELECT,
  RECOVERY_REASON_CODES,
  PROVIDER_ACTIVE_STATUSES,
  PROVIDER_SELECT_FIELDS,
  fetchProviderExistence,
  classifyAbsentLocally,
  EXISTENCE_PROBE_CHUNK_SIZE,
  EXISTENCE_PROBE_MAX_ATTEMPTS,
  DEFAULT_MANIFEST_PATH,
  type LocalRow,
  type ManifestPrisma,
  type ProviderRow,
} from "../../scripts/build-recovery-manifest";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PROVIDER_MT = "2026-08-01T00:00:00.000Z";

function providerRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    ListingId: "RLS100001",
    ListingKey: "KEY100001",
    ModificationTimestamp: PROVIDER_MT,
    StandardStatus: "Active",
    PropertyType: "Residential",
    InternetEntireListingDisplayYN: null,
    Permission: "Public",
    MlsStatus: "Active",
    ...overrides,
  };
}

/** The local row that is EXACTLY converged with `providerRow()`. */
function localRow(overrides: Partial<LocalRow> = {}): LocalRow {
  return {
    listing_id: "RLS100001",
    status: "Active",
    modification_timestamp: new Date(PROVIDER_MT),
    idx_display_yn: true,
    mls_id: "KEY100001",
    sync_status: "synced",
    participant_only: false,
    owner_opt_out: false,
    rls_eligible: true,
    ...overrides,
  };
}

/**
 * A row that is legitimately hidden locally by one REBNY gate: the gate is set,
 * and `idx_display_yn` is false BECAUSE of it — i.e. the row is internally
 * consistent and there is nothing to refresh.
 */
function locallyGatedRow(gate: Partial<LocalRow>): LocalRow {
  return localRow({ idx_display_yn: false, ...gate });
}

function manifestOf(
  providerRows: ProviderRow[],
  localRows: LocalRow[],
  includeMlsBackfill = false,
  existingIds?: ReadonlySet<string>,
  absorbedThroughMt?: Date | null,
) {
  // Mirrors the CLI: whatever is not `existing` is PROVEN absent. Tests that
  // need the UNKNOWN state build the tri-state explicitly instead.
  const providerExistence =
    existingIds === undefined
      ? undefined
      : {
          existing: new Set(existingIds),
          absent: new Set(
            localRows.map((l) => l.listing_id).filter((id) => !existingIds.has(id)),
          ),
          unknown: new Set<string>(),
        };
  return buildManifest({
    providerRows,
    localRows,
    includeMlsBackfill,
    generatedAt: "2026-08-13T12:00:00.000Z",
    providerExistence,
    absorbedThroughMt,
  });
}

/** All reasons the manifest assigned to one id, or null when it was excluded. */
function reasonsFor(
  manifest: ReturnType<typeof buildManifest>,
  listingId: string,
): string[] | null {
  return manifest.entries.find((e) => e.listingId === listingId)?.reasons ?? null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── 1. The exclusion that is the whole point ────────────────────────────────

describe("no-reason exclusion", () => {
  it("EXCLUDES a fully converged row", () => {
    const manifest = manifestOf([providerRow()], [localRow()]);

    expect(classifyProviderRow(providerRow(), localRow())).toEqual([]);
    expect(manifest.entries).toEqual([]);
    expect(manifest.manifestSize).toBe(0);
    expect(manifest.localComparablePopulation).toBe(1);
    expect(manifest.providerPopulation).toBe(1);
  });

  it("EXCLUDES a row whose only distinguishing feature is an old sync clock", () => {
    // This is the 87.4% the replaced predicate selected. `sync_status` and the
    // staleness clock are not comparison inputs at all — there is no code path
    // by which "we looked at it a long time ago" can produce a reason.
    const local = localRow({ sync_status: "pending" });
    expect(classifyProviderRow(providerRow(), local)).toEqual([]);
    expect(manifestOf([providerRow()], [local]).entries).toEqual([]);
  });

  it("EXCLUDES a row where LOCAL modification_timestamp is newer than the provider's", () => {
    // Measured live at 0 rows, and it is not a refresh case in any event: a
    // refresh would overwrite newer local state with older provider state.
    const local = localRow({
      modification_timestamp: new Date("2026-08-05T00:00:00.000Z"),
    });
    expect(classifyProviderRow(providerRow(), local)).toEqual([]);
  });

  it("EXCLUDES on an EQUAL modification timestamp — equality is convergence", () => {
    expect(
      classifyProviderRow(providerRow(), localRow({ modification_timestamp: new Date(PROVIDER_MT) })),
    ).toEqual([]);
  });
});

// ── 2. Reason: provider_mt_newer ────────────────────────────────────────────

describe("provider_mt_newer", () => {
  it("fires when the provider timestamp is strictly newer", () => {
    const local = localRow({ modification_timestamp: new Date("2026-07-01T00:00:00.000Z") });
    expect(classifyProviderRow(providerRow(), local)).toEqual(["provider_mt_newer"]);
    expect(reasonsFor(manifestOf([providerRow()], [local]), "RLS100001")).toEqual([
      "provider_mt_newer",
    ]);
  });

  it("fires when the local timestamp is missing entirely", () => {
    expect(
      classifyProviderRow(providerRow(), localRow({ modification_timestamp: null })),
    ).toEqual(["provider_mt_newer"]);
  });

  it("does NOT fire when the provider timestamp is absent or unparsable", () => {
    // Fail closed on the MEASUREMENT, not on the row: an unreadable provider
    // clock is not evidence of a difference, so it must not manufacture one.
    const local = localRow({ modification_timestamp: new Date("2026-01-01T00:00:00.000Z") });
    expect(classifyProviderRow(providerRow({ ModificationTimestamp: null }), local)).toEqual([]);
    expect(
      classifyProviderRow(providerRow({ ModificationTimestamp: "not-a-date" }), local),
    ).toEqual([]);
  });
});

// ── 3. Reason: status_mismatch ──────────────────────────────────────────────

describe("status_mismatch", () => {
  it("fires when provider and local statuses genuinely differ", () => {
    const provider = providerRow({ StandardStatus: "ActiveUnderContract" });
    // The gate is unaffected (both statuses are non-terminal) so this isolates
    // the status reason.
    expect(classifyProviderRow(provider, localRow())).toEqual(["status_mismatch"]);
  });

  it("does NOT fire on a case / whitespace / alias variant", () => {
    // Both sides go through normalizeStandardStatus, so a spelling difference is
    // convergence. Comparing raw strings here would manufacture ~thousands of
    // fake reasons.
    expect(classifyProviderRow(providerRow({ StandardStatus: "  active " }), localRow())).toEqual(
      [],
    );
  });

  it("reports a provider terminal status as BOTH a status and a display-gate reason", () => {
    // A terminal provider status forces idx_display_yn=false in computeGateColumns,
    // so a locally-displayed row genuinely differs on two axes and records both.
    const provider = providerRow({ StandardStatus: "Closed" });
    expect(classifyProviderRow(provider, localRow())).toEqual([
      "status_mismatch",
      "display_gate_mismatch",
    ]);
  });
});

// ── 4. Reason: display_gate_mismatch ────────────────────────────────────────

describe("display_gate_mismatch", () => {
  it("fires when the provider explicitly gates display off but we display", () => {
    // The compliance-critical direction: we are showing what REBNY says to hide.
    const provider = providerRow({ InternetEntireListingDisplayYN: false });
    expect(providerExpectedIdxDisplay(provider)).toBe(false);
    expect(classifyProviderRow(provider, localRow({ idx_display_yn: true }))).toEqual([
      "display_gate_mismatch",
    ]);
  });

  it("fires when we hide a displayable row and NO local gate explains it", () => {
    expect(classifyProviderRow(providerRow(), localRow({ idx_display_yn: false }))).toEqual([
      "display_gate_mismatch",
    ]);
  });

  // ── The explained-mismatch suppression ────────────────────────────────────
  //
  // Each of the three gates independently forces idx_display_yn=false. A row
  // hidden BECAUSE of one of them is internally consistent: there is no
  // difference to refresh. Emitting it would re-fetch the row, suppress the
  // write, change nothing, and re-emit it on the next build forever — the same
  // self-regenerating no-op worklist as the `last_synced_from_trestle` predicate
  // this generator replaced.
  //
  // The two REBNY gates are asserted through the CURRENT PROVIDER fields that
  // produce them, never through the stored local columns. Setting only the
  // local column would assert the circular behavior removed 2026-08-13 — see
  // the "derived from CURRENT provider Permission" suite below, which pins the
  // opposite case (stale local column, provider already moved on).

  it("does NOT fire when a CURRENT provider Permission='Private' explains the hidden row", () => {
    expect(
      classifyProviderRow(
        providerRow({ Permission: "Private" }),
        locallyGatedRow({ participant_only: true }),
      ),
    ).toEqual([]);
  });

  it("does NOT fire when a CURRENT provider owner-opt-out explains the hidden row", () => {
    expect(
      classifyProviderRow(
        providerRow({ MlsStatus: "OwnerOptOut" }),
        locallyGatedRow({ owner_opt_out: true }),
      ),
    ).toEqual([]);
  });

  it("does NOT fire when rls_eligible=false explains the hidden row", () => {
    expect(classifyProviderRow(providerRow(), locallyGatedRow({ rls_eligible: false }))).toEqual(
      [],
    );
  });

  it("STILL fires on over-display even when a local gate is set", () => {
    // A local gate can only push the expectation toward false, so it can never
    // explain a local `true`. Over-display must survive the suppression.
    const provider = providerRow({ InternetEntireListingDisplayYN: false });
    expect(
      classifyProviderRow(provider, localRow({ idx_display_yn: true, participant_only: true })),
    ).toEqual(["display_gate_mismatch"]);
  });

  it("fires when the provider gates a row off but idx_display_yn was never brought into line", () => {
    // Provider Permission='Private' with local idx_display_yn=true is the
    // safety-relevant defect: REBNY gates the row off and we display it anyway.
    // The stored participant_only column is irrelevant to the finding — set to
    // the WRONG value here on purpose, to prove classification does not consult
    // it. (Under the pre-2026-08-13 circular form this row was invisible.)
    expect(
      classifyProviderRow(
        providerRow({ Permission: "Private" }),
        localRow({ idx_display_yn: true, participant_only: false }),
      ),
    ).toEqual(["display_gate_mismatch"]);
  });

  it("EXCLUDES from the manifest a row whose ONLY reason was an explained mismatch", () => {
    const manifest = manifestOf(
      [providerRow({ Permission: "Private" })],
      [locallyGatedRow({ participant_only: true })],
    );

    expect(manifest.entries).toEqual([]);
    expect(manifest.manifestSize).toBe(0);
    expect(manifest.totalsByReason.display_gate_mismatch).toBe(0);
    // Suppressed, but visible.
    expect(manifest.diagnostics.displayGateExplainedByLocalGate).toBe(1);
    expect(manifest.diagnostics.displayGateOverDisplay).toBe(0);
    expect(manifest.diagnostics.displayGateUnderDisplay).toBe(0);
  });

  it("treats a NULL InternetEntireListingDisplayYN as displayable, not as blocked", () => {
    // The 2026-04-30 7,594-row corruption was exactly the opposite reading.
    // null = REBNY's upstream filter already passed this row = displayable.
    expect(providerExpectedIdxDisplay(providerRow({ InternetEntireListingDisplayYN: null }))).toBe(
      true,
    );
    expect(
      classifyProviderRow(
        providerRow({ InternetEntireListingDisplayYN: null }),
        localRow({ idx_display_yn: true }),
      ),
    ).toEqual([]);
  });

  it("splits emitted mismatches by direction and counts explained ones separately", () => {
    const overDisplayed = providerRow({
      ListingId: "RLS-OVER",
      ListingKey: "K-OVER",
      InternetEntireListingDisplayYN: false,
    });
    const underDisplayed = providerRow({ ListingId: "RLS-UNDER", ListingKey: "K-UNDER" });
    // Explained by a CURRENT provider gate — the local column merely agrees.
    const explained = providerRow({
      ListingId: "RLS-EXPL",
      ListingKey: "K-EXPL",
      MlsStatus: "OwnerOptOut",
    });

    const manifest = manifestOf(
      [overDisplayed, underDisplayed, explained],
      [
        localRow({ listing_id: "RLS-OVER", mls_id: "K-OVER", idx_display_yn: true }),
        localRow({ listing_id: "RLS-UNDER", mls_id: "K-UNDER", idx_display_yn: false }),
        locallyGatedRow({
          listing_id: "RLS-EXPL",
          mls_id: "K-EXPL",
          owner_opt_out: true,
        }),
      ],
    );

    expect(manifest.diagnostics.displayGateOverDisplay).toBe(1);
    expect(manifest.diagnostics.displayGateUnderDisplay).toBe(1);
    expect(manifest.diagnostics.displayGateExplainedByLocalGate).toBe(1);
    // Only the two UNEXPLAINED mismatches reach the manifest.
    expect(manifest.totalsByReason.display_gate_mismatch).toBe(2);
    expect(manifest.entries.map((e) => e.listingId).sort()).toEqual(["RLS-OVER", "RLS-UNDER"]);
  });

  it("counts an explained mismatch ONLY as explained — never in either emitted bucket", () => {
    const manifest = manifestOf([providerRow()], [locallyGatedRow({ rls_eligible: false })]);
    const d = manifest.diagnostics;
    expect(d.displayGateExplainedByLocalGate).toBe(1);
    expect(d.displayGateOverDisplay + d.displayGateUnderDisplay).toBe(0);
  });

  it("counts a converged row in NO display-gate bucket at all", () => {
    const d = manifestOf([providerRow()], [localRow()]).diagnostics;
    expect(d.displayGateOverDisplay).toBe(0);
    expect(d.displayGateUnderDisplay).toBe(0);
    expect(d.displayGateExplainedByLocalGate).toBe(0);
  });

  it("exposes the provider-only expectation as a diagnostic input, not a classifier", () => {
    // Kept exported for the explained-mismatch computation. On its own it calls
    // every legitimately-gated row a mismatch — which is exactly why
    // classification uses the full evaluator instead. The gate that explains it
    // here is the CURRENT provider Permission, not the stored column.
    const provider = providerRow({ Permission: "Private" });
    const gated = locallyGatedRow({ participant_only: true });
    expect(providerExpectedIdxDisplay(provider)).toBe(true);
    expect(providerExpectedIdxDisplay(provider)).not.toBe(gated.idx_display_yn);
    expect(expectedIdxDisplay(provider, gated)).toBe(false);
    expect(displayGateMismatchExplainedByGate(provider, gated)).toBe(true);
    expect(displayGateMismatchExplainedByGate(provider, localRow())).toBe(false);
  });
});

// ── 4b. De-circularization: gates come from the CURRENT provider record ─────
//
// Regression suite for the 2026-08-13 fix. Before it, classification fed the
// STORED `participant_only` / `owner_opt_out` into the gate evaluator. Those
// columns are OUTPUTS of `derivePermissionGates`, so stored state vouched for
// stored state and a source-side Permission change could never be detected.

describe("display gate is derived from CURRENT provider Permission", () => {
  it("FIRES when Permission went Private -> Public and the local gate is stale", () => {
    // THE bug. Provider says Public today; we still hold participant_only=true
    // and idx_display_yn=false. The old classifier used that stale `true` to
    // "explain" the stale `false` and emitted nothing — the row could never be
    // repaired by the generator whose job is to schedule its repair.
    const provider = providerRow({ Permission: "Public" });
    const stale = locallyGatedRow({ participant_only: true });

    expect(expectedIdxDisplay(provider, stale)).toBe(true);
    expect(classifyProviderRow(provider, stale)).toContain("display_gate_mismatch");
    expect(displayGateMismatchExplainedByGate(provider, stale)).toBe(false);

    const m = manifestOf([provider], [stale]);
    expect(m.entries).toHaveLength(1);
    expect(m.diagnostics.displayGateUnderDisplay).toBe(1);
    expect(m.diagnostics.displayGateExplainedByLocalGate).toBe(0);
  });

  it("stays SILENT when the provider still says Private today", () => {
    // The suppression must survive: a row canonical ingest would gate off right
    // now is not a difference, and emitting it would rebuild the 87%-noise
    // worklist this generator exists to replace.
    const provider = providerRow({ Permission: "Private" });
    const gated = locallyGatedRow({ participant_only: true });

    expect(expectedIdxDisplay(provider, gated)).toBe(false);
    expect(classifyProviderRow(provider, gated)).toEqual([]);
    expect(manifestOf([provider], [gated]).entries).toHaveLength(0);
  });

  it("honours the MlsStatus arm of owner-opt-out, not just Permission", () => {
    // `derivePermissionGates` reads BOTH fields. Selecting only Permission
    // would silently drop this arm and manufacture a false mismatch.
    const provider = providerRow({ Permission: "Public", MlsStatus: "OwnerOptOut" });
    const gated = locallyGatedRow({ owner_opt_out: true });

    expect(expectedIdxDisplay(provider, gated)).toBe(false);
    expect(classifyProviderRow(provider, gated)).toEqual([]);
  });

  it("still treats rls_eligible as LOCAL authority", () => {
    // Proven local: no Cotality field maps to it, mapTrestleToPrisma never
    // emits it, it is absent from LISTING_SYNC_COMPARE_SELECT, and the Trestle
    // path hard-codes the constant true. The provider cannot answer it, so the
    // local value is the authority and must keep explaining a hidden row.
    const provider = providerRow({ Permission: "Public", MlsStatus: "Active" });
    const websiteOnly = locallyGatedRow({ rls_eligible: false });

    expect(expectedIdxDisplay(provider, websiteOnly)).toBe(false);
    expect(classifyProviderRow(provider, websiteOnly)).toEqual([]);
  });

  it("never lets a stale gate column hide an OVER-display", () => {
    // The safety-relevant direction. A gate can only push the expectation
    // toward false, so local `idx_display_yn=true` is never suppressible.
    const provider = providerRow({ Permission: "Private" });
    const overDisplayed = localRow({ idx_display_yn: true, participant_only: false });

    expect(expectedIdxDisplay(provider, overDisplayed)).toBe(false);
    expect(classifyProviderRow(provider, overDisplayed)).toContain("display_gate_mismatch");
    expect(manifestOf([provider], [overDisplayed]).diagnostics.displayGateOverDisplay).toBe(1);
  });

  it("counts stale stored gate columns as a diagnostic without emitting a reason", () => {
    // Benign drift: Permission moved Private -> Public but idx_display_yn was
    // already corrected. The stored column is stale, yet no display outcome is
    // wrong, so this must be MEASURED and not turned into recovery work.
    const provider = providerRow({ Permission: "Public" });
    const staleButHarmless = localRow({ idx_display_yn: true, participant_only: true });

    expect(localPermissionGatesAreStale(provider, staleButHarmless)).toBe(true);
    expect(classifyProviderRow(provider, staleButHarmless)).toEqual([]);

    const m = manifestOf([provider], [staleButHarmless]);
    expect(m.diagnostics.staleLocalPermissionGates).toBe(1);
    expect(m.entries).toHaveLength(0);
  });

  it("reports zero stale gate columns when stored state matches the provider", () => {
    expect(localPermissionGatesAreStale(providerRow(), localRow())).toBe(false);
    expect(manifestOf([providerRow()], [localRow()]).diagnostics.staleLocalPermissionGates).toBe(0);
  });

  it("selects Permission AND MlsStatus from the provider", () => {
    // Without both fields on the wire the de-circularization is inert: the
    // evaluator would see undefined and fall back to gates-open for every row.
    expect(PROVIDER_SELECT_FIELDS).toContain("Permission");
    expect(PROVIDER_SELECT_FIELDS).toContain("MlsStatus");
  });
});

// ── 4c. Mallan-authored inventory is not "provider terminal" ────────────────

describe("Mallan-owned rows are excluded from the reverse set", () => {
  // Mallan exclusives are absent from the Cotality Property feed BY DEFINITION.
  // Pass 2 keys on absence, so without an ownership guard it labels them
  // `local_active_provider_terminal` — drift that never happened. The executor
  // fail-closes on the empty re-fetch, so there is no bad write, but it books
  // the row as `failed`, and the pre-authorization gate is `failed = 0`.
  const mallanRow = (over: Partial<LocalRow> = {}) =>
    localRow({ listing_id: "SL-0004", mls_id: null, rls_eligible: false, ...over });

  it("excludes an SL-/RL- prefixed row and counts it as a diagnostic", () => {
    const m = manifestOf([], [mallanRow()]);
    expect(m.entries).toHaveLength(0);
    expect(m.totalsByReason.local_active_provider_terminal).toBe(0);
    expect(m.diagnostics.mallanOwnedExcluded).toBe(1);
  });

  it("excludes a website-only row identified ONLY by rls_eligible=false", () => {
    // The prefix and the flag are independent arms of the canonical helper; a
    // guard that checked only the prefix would let this one through.
    const m = manifestOf([], [mallanRow({ listing_id: "RLS999999", rls_eligible: false })]);
    expect(m.entries).toHaveLength(0);
    expect(m.diagnostics.mallanOwnedExcluded).toBe(1);
  });

  it("STILL emits local_active_provider_terminal for a genuinely drifted RLS row", () => {
    // The guard must not swallow the real reverse-set case it shares a branch
    // with: an RLS-sourced, rls_eligible row the provider no longer reports.
    const drifted = localRow({ listing_id: "RLS777777", rls_eligible: true });
    const m = manifestOf([], [drifted]);
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].reasons).toEqual(["local_active_provider_terminal"]);
    expect(m.diagnostics.mallanOwnedExcluded).toBe(0);
  });

  it("reports zero exclusions when no Mallan-owned row is present", () => {
    expect(manifestOf([providerRow()], [localRow()]).diagnostics.mallanOwnedExcluded).toBe(0);
  });
});

// ── 4d. Ghosts belong to feed-reconcile, not the recovery executor ──────────
//
// Pass 2 keys on absence from the Active-ish population, which covers TWO
// conditions with DIFFERENT owners. Measured live 2026-08-14 on a 74-row
// reverse set: 16 still exist at StandardStatus=Pending (executor work), 58 are
// gone from the feed entirely (`@odata.count = 0` at HTTP 200 — not throttling).
//
// Emitting the 58 made the FULL dry run report `failed = 58`, permanently
// blocking the `failed = 0` authorization gate: `fetchSingleListing` has
// nothing to return and the executor fail-closes. `app/api/cron/feed-reconcile`
// already owns them — Withdrawn + audit event, daily at `30 3 * * *`.

describe("provider ghosts are deferred, not emitted as recovery work", () => {
  const drifted = (id: string) => localRow({ listing_id: id, rls_eligible: true });

  it("EMITS a reverse-set row the provider still holds at another status", () => {
    const m = manifestOf([], [drifted("RLS777777")], false, new Set(["RLS777777"]));
    expect(m.entries.map((e) => e.listingId)).toEqual(["RLS777777"]);
    expect(m.entries[0].reasons).toEqual(["local_active_provider_terminal"]);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(0);
  });

  it("DEFERS a ghost the provider no longer holds at any status", () => {
    const m = manifestOf([], [drifted("RLS777777")], false, new Set());
    expect(m.entries).toHaveLength(0);
    expect(m.totalsByReason.local_active_provider_terminal).toBe(0);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(1);
  });

  it("splits a mixed reverse set exactly, with no id lost or double-counted", () => {
    const rows = [drifted("RLS100"), drifted("RLS200"), drifted("RLS300")];
    const m = manifestOf([], rows, false, new Set(["RLS200"]));
    expect(m.entries.map((e) => e.listingId)).toEqual(["RLS200"]);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(2);
    expect(m.entries.length + m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(rows.length);
  });

  it("counts a Mallan-owned row as Mallan, never as a ghost", () => {
    // Ordering matters: the ownership guard must run first, so Mallan rows are
    // not double-counted into the feed-reconcile bucket.
    const mallan = localRow({ listing_id: "SL-0004", rls_eligible: false, mls_id: null });
    const m = manifestOf([], [mallan], false, new Set());
    expect(m.diagnostics.mallanOwnedExcluded).toBe(1);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(0);
  });

  it("keeps the pre-probe behavior when the probe was not run", () => {
    // `providerExistingIds` omitted => the generator cannot distinguish, so it
    // must not silently drop rows. Only the CLI (which always probes) relies on
    // the split; unit callers keep the old semantics.
    const m = manifestOf([], [drifted("RLS777777")]);
    expect(m.entries).toHaveLength(1);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(0);
  });

  it("chunks the existence probe and never exceeds the contractual size", async () => {
    const ids = Array.from({ length: 38 }, (_, i) => `RLS${900000 + i}`);
    const seen: number[] = [];
    const httpGet = jest.fn(async (url: string) => {
      // URLSearchParams encodes spaces as `+`, which decodeURIComponent does
      // NOT restore — so count the unambiguous `$filter` term instead.
      const filter = new URL(url).searchParams.get("$filter") ?? "";
      seen.push((filter.match(/ListingId eq /g) ?? []).length);
      return { value: [] };
    });
    await fetchProviderExistence(ids, { token: async () => "T", httpGet });
    expect(seen.every((n) => n <= EXISTENCE_PROBE_CHUNK_SIZE)).toBe(true);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(ids.length);
  });
});

// ── 4e. A FAILED READ IS UNKNOWN, NEVER ABSENCE ─────────────────────────────
//
// The first version returned a single `found` set and callers read "not in
// found" as authoritative absence. A transient 503 therefore reclassified a LIVE
// listing as a ghost, and because feed-reconcile deliberately SPARES Pending,
// nothing would ever correct it — the stale local Active row would persist
// indefinitely. Absence and ignorance are different facts.

describe("existence probe is TRI-STATE", () => {
  const ok = (present: string[]) =>
    jest.fn(async () => ({ value: present.map((id) => ({ ListingId: id })) }));

  it("HTTP 200 + id returned -> EXISTING", async () => {
    const r = await fetchProviderExistence(["RLS1"], {
      token: async () => "T",
      httpGet: ok(["RLS1"]),
    });
    expect([...r.existing]).toEqual(["RLS1"]);
    expect(r.absent.size).toBe(0);
    expect(r.unknown.size).toBe(0);
  });

  it("HTTP 200 + id NOT returned -> AUTHORITATIVELY ABSENT", async () => {
    // Only a successful provider answer may establish absence.
    const r = await fetchProviderExistence(["RLS1", "RLS2"], {
      token: async () => "T",
      httpGet: ok(["RLS1"]),
    });
    expect([...r.existing]).toEqual(["RLS1"]);
    expect([...r.absent]).toEqual(["RLS2"]);
    expect(r.unknown.size).toBe(0);
  });

  it("HTTP 503 on every attempt -> UNKNOWN, never absent", async () => {
    const httpGet = jest.fn(async () => {
      throw new Error("HTTP 503");
    });
    const r = await fetchProviderExistence(["RLS1", "RLS2"], {
      token: async () => "T",
      httpGet,
    });
    expect(r.unknown.size).toBe(2);
    expect(r.absent.size).toBe(0);
    expect(r.existing.size).toBe(0);
    expect(httpGet).toHaveBeenCalledTimes(EXISTENCE_PROBE_MAX_ATTEMPTS);
  });

  it("a TIMEOUT is UNKNOWN, never absent", async () => {
    const httpGet = jest.fn(async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      });
    });
    const r = await fetchProviderExistence(["RLS9"], { token: async () => "T", httpGet });
    expect([...r.unknown]).toEqual(["RLS9"]);
    expect(r.absent.size).toBe(0);
  });

  it("bounded retry that SUCCEEDS classifies normally", async () => {
    let calls = 0;
    const httpGet = jest.fn(async () => {
      if (++calls < EXISTENCE_PROBE_MAX_ATTEMPTS) throw new Error("HTTP 502");
      return { value: [{ ListingId: "RLS1" }] };
    });
    const r = await fetchProviderExistence(["RLS1", "RLS2"], {
      token: async () => "T",
      httpGet,
    });
    expect([...r.existing]).toEqual(["RLS1"]);
    expect([...r.absent]).toEqual(["RLS2"]);
    expect(r.unknown.size).toBe(0);
  });

  it("an UNKNOWN row is neither recovery work nor a ghost", async () => {
    // The whole point: it must not silently become either classification.
    const m = buildManifest({
      providerRows: [],
      localRows: [localRow({ listing_id: "RLS777777", rls_eligible: true })],
      includeMlsBackfill: false,
      generatedAt: "2026-08-13T12:00:00.000Z",
      providerExistence: {
        existing: new Set<string>(),
        absent: new Set<string>(),
        unknown: new Set(["RLS777777"]),
      },
    });
    expect(m.entries).toHaveLength(0);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(0);
    expect(m.diagnostics.providerExistenceProbeUnknown).toBe(1);
  });

  it("the live-Pending scenario the old code silently broke", async () => {
    // Local Active; Cotality actually holds it as Pending; the probe 503s.
    // Old behaviour: ghost -> deferred -> feed-reconcile spares Pending ->
    // never corrected. New behaviour: UNKNOWN -> build fails closed.
    const httpGet = jest.fn(async () => {
      throw new Error("HTTP 503");
    });
    const probe = await fetchProviderExistence(["RLS20087208"], {
      token: async () => "T",
      httpGet,
    });
    const m = buildManifest({
      providerRows: [],
      localRows: [localRow({ listing_id: "RLS20087208", rls_eligible: true })],
      includeMlsBackfill: false,
      generatedAt: "2026-08-13T12:00:00.000Z",
      providerExistence: probe,
    });
    expect(m.diagnostics.providerExistenceProbeUnknown).toBe(1);
    expect(m.diagnostics.providerGhostsDeferredToFeedReconcile).toBe(0);
  });
});

// ── 4f. absentLocally is classified against the ABSORBED provider boundary ──

describe("absentLocally classification", () => {
  const BOUNDARY = new Date("2026-08-14T03:20:41.000Z");
  const absentProvider = (id: string, mt: string | null) =>
    providerRow({ ListingId: id, ListingKey: `K${id}`, ModificationTimestamp: mt });

  it("a provider row NEWER than the absorbed boundary is an expected new arrival", () => {
    const m = manifestOf(
      [absentProvider("RLS20109373", "2026-08-14T03:21:23.000Z")],
      [],
      false,
      new Set(),
      BOUNDARY,
    );
    expect(m.absentLocally).toBe(1);
    expect(m.diagnostics.absentLocallyExpectedNew).toBe(1);
    expect(m.diagnostics.absentLocallyUnexplained).toBe(0);
    expect(m.entries).toHaveLength(0); // never recovery work — update-only executor
  });

  it("a provider row OLDER than the boundary is UNEXPLAINED", () => {
    const m = manifestOf(
      [absentProvider("RLS111", "2026-08-01T00:00:00.000Z")],
      [],
      false,
      new Set(),
      BOUNDARY,
    );
    expect(m.diagnostics.absentLocallyUnexplained).toBe(1);
    expect(m.diagnostics.absentLocallyExpectedNew).toBe(0);
  });

  it("a provider row EXACTLY AT the boundary is UNEXPLAINED, not excused", () => {
    // Equality sits inside the same-timestamp cluster the keyset cursor exists
    // to traverse — an absent row there is the cluster-loss defect itself.
    const m = manifestOf(
      [absentProvider("RLS222", BOUNDARY.toISOString())],
      [],
      false,
      new Set(),
      BOUNDARY,
    );
    expect(m.diagnostics.absentLocallyUnexplained).toBe(1);
    expect(m.diagnostics.absentLocallyExpectedNew).toBe(0);
  });

  it("an unreadable provider timestamp is UNKNOWN, never excused", () => {
    for (const mt of [null, "not-a-date"]) {
      const m = manifestOf([absentProvider("RLS333", mt)], [], false, new Set(), BOUNDARY);
      expect(m.diagnostics.absentLocallyUnknownTimestamp).toBe(1);
      expect(m.diagnostics.absentLocallyExpectedNew).toBe(0);
      expect(m.diagnostics.absentLocallyUnexplained).toBe(0);
    }
  });

  it("a MISSING boundary is UNKNOWN — we cannot claim the row is late", () => {
    expect(classifyAbsentLocally("2026-08-14T03:21:23.000Z", null)).toBe("unknown_absent_time");
    expect(classifyAbsentLocally("2026-08-14T03:21:23.000Z", undefined)).toBe(
      "unknown_absent_time",
    );
  });

  it("the three classes ALWAYS reconcile exactly to absentLocally", () => {
    const m = manifestOf(
      [
        absentProvider("RLS-NEW", "2026-08-14T03:59:00.000Z"),
        absentProvider("RLS-OLD", "2026-08-01T00:00:00.000Z"),
        absentProvider("RLS-BAD", "not-a-date"),
      ],
      [],
      false,
      new Set(),
      BOUNDARY,
    );
    const d = m.diagnostics;
    expect(m.absentLocally).toBe(3);
    expect(
      d.absentLocallyExpectedNew + d.absentLocallyUnexplained + d.absentLocallyUnknownTimestamp,
    ).toBe(m.absentLocally);
    expect(d.absentLocallyExpectedNew).toBe(1);
    expect(d.absentLocallyUnexplained).toBe(1);
    expect(d.absentLocallyUnknownTimestamp).toBe(1);
  });
});

// ── 4g. Duplicate provider ids are recorded, not just counted ──────────────

describe("duplicate provider ListingIds", () => {
  it("records the actual ids so the condition is diagnosable", () => {
    // Counting alone forced a separate re-scan to find out WHICH ids duplicated,
    // and a live feed may not reproduce it. The ids must survive in the artifact.
    const dupe = providerRow({ ListingId: "RLS-DUP", ListingKey: "K1" });
    const dupeAgain = providerRow({
      ListingId: "RLS-DUP",
      ListingKey: "K1",
      // Same id observed later in the scan with a moved timestamp — the exact
      // shape of the (MT asc, ListingKey asc) pagination artifact.
      ModificationTimestamp: "2026-08-02T00:00:00.000Z",
    });
    const m = manifestOf([dupe, dupeAgain], [localRow({ listing_id: "RLS-DUP" })]);
    expect(m.diagnostics.duplicateProviderListingIds).toBe(1);
    expect(m.diagnostics.duplicateProviderListingIdSamples).toEqual(["RLS-DUP"]);
  });

  it("counts DISTINCT duplicated ids, not duplicate observations", () => {
    const r = (id: string) => providerRow({ ListingId: id, ListingKey: `K${id}` });
    const m = manifestOf([r("RLS-A"), r("RLS-A"), r("RLS-A"), r("RLS-B"), r("RLS-B")], []);
    expect(m.diagnostics.duplicateProviderListingIds).toBe(2);
    expect(m.diagnostics.duplicateProviderListingIdSamples).toEqual(["RLS-A", "RLS-B"]);
  });

  it("reports an empty sample list when the scan is clean", () => {
    const m = manifestOf([providerRow()], [localRow()]);
    expect(m.diagnostics.duplicateProviderListingIds).toBe(0);
    expect(m.diagnostics.duplicateProviderListingIdSamples).toEqual([]);
  });
});

describe("provider select completeness", () => {
  it("carries every field the classification reads", () => {
    // Without both fields on the wire the de-circularization is inert: the
    // evaluator would see undefined and fall back to gates-open for every row.
    expect(PROVIDER_SELECT_FIELDS).toContain("Permission");
    expect(PROVIDER_SELECT_FIELDS).toContain("MlsStatus");
  });
});

// ── 5. Reason: mls_id_missing_or_wrong + the backfill flag ──────────────────

describe("mls_id_missing_or_wrong", () => {
  it("fires when local mls_id is NULL", () => {
    expect(classifyProviderRow(providerRow(), localRow({ mls_id: null }))).toEqual([
      "mls_id_missing_or_wrong",
    ]);
  });

  it("fires when local mls_id disagrees with the provider ListingKey", () => {
    expect(classifyProviderRow(providerRow(), localRow({ mls_id: "STALE-KEY" }))).toEqual([
      "mls_id_missing_or_wrong",
    ]);
  });

  it("does NOT fire when the provider ListingKey is absent — nothing to verify against", () => {
    expect(
      classifyProviderRow(providerRow({ ListingKey: null }), localRow({ mls_id: null })),
    ).toEqual([]);
    expect(
      classifyProviderRow(providerRow({ ListingKey: "  " }), localRow({ mls_id: null })),
    ).toEqual([]);
  });

  it("EXCLUDES an mls-ONLY row when the backfill flag is OFF (the default)", () => {
    const manifest = manifestOf([providerRow()], [localRow({ mls_id: null })], false);

    expect(manifest.entries).toEqual([]);
    expect(manifest.manifestSize).toBe(0);
    expect(manifest.includeMlsBackfill).toBe(false);
    // The volume is still REPORTED — an operator must be able to see the size of
    // the identity backfill without it being hidden inside a staleness repair.
    expect(manifest.diagnostics.mlsIdMissingOrWrongTotal).toBe(1);
    expect(manifest.diagnostics.mlsBackfillOnlyRows).toBe(1);
    // Counted over EMITTED entries, so totals reconcile with `entries`.
    expect(manifest.totalsByReason.mls_id_missing_or_wrong).toBe(0);
  });

  it("INCLUDES an mls-ONLY row when the backfill flag is ON", () => {
    const manifest = manifestOf([providerRow()], [localRow({ mls_id: null })], true);

    expect(manifest.manifestSize).toBe(1);
    expect(reasonsFor(manifest, "RLS100001")).toEqual(["mls_id_missing_or_wrong"]);
    expect(manifest.includeMlsBackfill).toBe(true);
    expect(manifest.totalsByReason.mls_id_missing_or_wrong).toBe(1);
  });

  it("KEEPS an mls row that ALSO carries another reason, flag OFF, with BOTH reasons", () => {
    // The flag governs ADMISSION of mls-only rows, not the recording of reasons.
    // A row already admitted for a real staleness difference must not have its
    // identity gap silently dropped from the record.
    const manifest = manifestOf(
      [providerRow()],
      [localRow({ mls_id: null, modification_timestamp: new Date("2026-07-01T00:00:00.000Z") })],
      false,
    );

    expect(reasonsFor(manifest, "RLS100001")).toEqual([
      "provider_mt_newer",
      "mls_id_missing_or_wrong",
    ]);
    expect(manifest.totalsByReason.provider_mt_newer).toBe(1);
    expect(manifest.totalsByReason.mls_id_missing_or_wrong).toBe(1);
  });

  it("reports the identity-backfill volume as its OWN number, separate from the manifest size", () => {
    // 1 real staleness row + 3 identity-only rows. The operator sees "1 to
    // repair, 4 rows carry an identity gap, 3 of which are identity-only".
    const provider = [
      providerRow({ ListingId: "A", ListingKey: "KA" }),
      providerRow({ ListingId: "B", ListingKey: "KB" }),
      providerRow({ ListingId: "C", ListingKey: "KC" }),
      providerRow({ ListingId: "D", ListingKey: "KD" }),
    ];
    const local = [
      localRow({
        listing_id: "A",
        mls_id: null,
        modification_timestamp: new Date("2026-07-01T00:00:00.000Z"),
      }),
      localRow({ listing_id: "B", mls_id: null }),
      localRow({ listing_id: "C", mls_id: null }),
      localRow({ listing_id: "D", mls_id: null }),
    ];

    const off = manifestOf(provider, local, false);
    expect(off.manifestSize).toBe(1);
    expect(off.diagnostics.mlsIdMissingOrWrongTotal).toBe(4);
    expect(off.diagnostics.mlsBackfillOnlyRows).toBe(3);

    const on = manifestOf(provider, local, true);
    expect(on.manifestSize).toBe(4);
  });
});

// ── 6. Reason: local_active_provider_terminal ───────────────────────────────

describe("local_active_provider_terminal", () => {
  it("detects a locally Active row absent from the provider Active-ish set", () => {
    const manifest = manifestOf(
      [providerRow({ ListingId: "STILL-ACTIVE", ListingKey: "K1" })],
      [
        localRow({ listing_id: "STILL-ACTIVE", mls_id: "K1" }),
        localRow({ listing_id: "GONE", mls_id: "K-GONE" }),
      ],
    );

    expect(reasonsFor(manifest, "GONE")).toEqual(["local_active_provider_terminal"]);
    expect(manifest.totalsByReason.local_active_provider_terminal).toBe(1);
    // The provider has no record for it, so the key comes from the LOCAL mls_id.
    expect(manifest.entries.find((e) => e.listingId === "GONE")?.listingKey).toBe("K-GONE");
  });

  it("carries a null listingKey when the local row has no mls_id either", () => {
    const manifest = manifestOf([], [localRow({ listing_id: "GONE", mls_id: null })]);
    expect(manifest.entries[0]).toEqual({
      listingId: "GONE",
      listingKey: null,
      reasons: ["local_active_provider_terminal"],
    });
  });

  it("does NOT fire for a locally TERMINAL row absent from the provider Active set", () => {
    // A locally-Closed row absent from the Active-ish feed is exactly what the
    // feed should look like. Only Active-ish local rows are reverse candidates.
    const manifest = manifestOf([], [localRow({ listing_id: "CLOSED-ROW", status: "Closed" })]);
    expect(manifest.entries).toEqual([]);
  });

  it("recognises every Active-ish status, case-folded", () => {
    for (const status of PROVIDER_ACTIVE_STATUSES) {
      expect(isLocalActiveIsh(localRow({ status }))).toBe(true);
      expect(isLocalActiveIsh(localRow({ status: status.toLowerCase() }))).toBe(true);
    }
    expect(isLocalActiveIsh(localRow({ status: "Closed" }))).toBe(false);
    expect(isLocalActiveIsh(localRow({ status: "Draft" }))).toBe(false);
  });

  it("never emits the same id twice across the two passes", () => {
    const manifest = manifestOf(
      [providerRow({ ListingId: "DUP", ListingKey: "KD" })],
      [localRow({ listing_id: "DUP", mls_id: "STALE" })],
      true,
    );
    expect(manifest.entries.map((e) => e.listingId)).toEqual(["DUP"]);
  });
});

// ── 7. Rows absent locally are counted, never emitted ───────────────────────

describe("provider rows with no local counterpart", () => {
  it("counts them in absentLocally and keeps them OUT of the manifest", () => {
    // The executor is update-only; emitting an id it must refuse would be a
    // manifest that lies. The live census measured this at 0.
    const manifest = manifestOf([providerRow({ ListingId: "NEW-ONE" })], []);

    expect(manifest.absentLocally).toBe(1);
    expect(manifest.localComparablePopulation).toBe(0);
    expect(manifest.entries).toEqual([]);
  });
});

// ── 8. Sanitization ─────────────────────────────────────────────────────────

describe("sanitization", () => {
  it("emits EXACTLY three keys per entry — no listing content can leak", () => {
    const manifest = manifestOf(
      [providerRow({ StandardStatus: "ActiveUnderContract" })],
      [localRow({ mls_id: null })],
      true,
    );

    expect(manifest.entries).toHaveLength(1);
    for (const entry of manifest.entries) {
      expect(Object.keys(entry).sort()).toEqual(["listingId", "listingKey", "reasons"]);
    }
  });

  it("does not leak address / price / agent / status / timestamps into the artifact", () => {
    const manifest = manifestOf(
      [providerRow({ StandardStatus: "Closed", PropertyType: "Residential" })],
      [localRow({ mls_id: null })],
      true,
    );
    const serialized = JSON.stringify(manifest.entries);

    // Field NAMES that must never appear as keys. Quoted-with-colon so
    // `"status"` cannot be satisfied by the substring inside `status_mismatch`.
    for (const key of [
      "StandardStatus",
      "PropertyType",
      "ModificationTimestamp",
      "status",
      "address",
      "price",
      "list_price",
      "agent",
      "sync_status",
      "idx_display_yn",
      "mls_id",
      // Gate inputs are READ for classification and must never be emitted.
      "participant_only",
      "owner_opt_out",
      "rls_eligible",
    ]) {
      expect(serialized).not.toContain(`"${key}":`);
    }
    // And the VALUES themselves — a leak that renamed the key is still a leak.
    for (const value of ["Residential", "Closed", "synced", "2026-08-01"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("buildEntry constructs the three-key shape and canonicalises reason order", () => {
    const entry = buildEntry("X", "K", [
      "mls_id_missing_or_wrong",
      "provider_mt_newer",
      "provider_mt_newer",
    ]);
    expect(entry).toEqual({
      listingId: "X",
      listingKey: "K",
      reasons: ["provider_mt_newer", "mls_id_missing_or_wrong"],
    });
  });

  it("sorts reasons into the canonical code order and dedupes", () => {
    expect(sortReasons([...RECOVERY_REASON_CODES].reverse())).toEqual([...RECOVERY_REASON_CODES]);
    expect(sortReasons(["status_mismatch", "status_mismatch"])).toEqual(["status_mismatch"]);
  });
});

// ── 9. Chunked local lookup ─────────────────────────────────────────────────

describe("local lookup chunking", () => {
  function stubPrisma(rowsFor: (ids: string[]) => LocalRow[]) {
    const findMany = jest.fn(async (args: Record<string, unknown>) => {
      const where = args.where as { listing_id?: { in?: string[] } };
      return rowsFor(where.listing_id?.in ?? []);
    });
    return { db: { listing: { findMany } } as unknown as ManifestPrisma, findMany };
  }

  it("splits the id list into chunks of at most 1000 and unions the results", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `RLS${i}`);
    const { db, findMany } = stubPrisma((chunkIds) =>
      chunkIds.map((id) => localRow({ listing_id: id })),
    );

    const rows = await loadLocalRows(db, ids);

    expect(findMany).toHaveBeenCalledTimes(3);
    const sizes = findMany.mock.calls.map(
      (c) => ((c[0] as { where: { listing_id: { in: string[] } } }).where.listing_id.in).length,
    );
    expect(sizes).toEqual([1000, 1000, 500]);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(LOCAL_LOOKUP_CHUNK_SIZE);
    expect(rows).toHaveLength(2500);
    // No id dropped or duplicated across the chunk boundaries.
    expect(new Set(rows.map((r) => r.listing_id)).size).toBe(2500);
  });

  it("CLAMPS an oversized chunk size rather than issuing one giant IN list", async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `RLS${i}`);
    const { db, findMany } = stubPrisma(() => []);

    await loadLocalRows(db, ids, 50_000);

    expect(findMany).toHaveBeenCalledTimes(2);
    for (const call of findMany.mock.calls) {
      const inList = (call[0] as { where: { listing_id: { in: string[] } } }).where.listing_id.in;
      expect(inList.length).toBeLessThanOrEqual(LOCAL_LOOKUP_CHUNK_SIZE);
    }
  });

  it("issues no query at all for an empty id list", async () => {
    const { db, findMany } = stubPrisma(() => []);
    expect(await loadLocalRows(db, [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("selects ONLY the comparison columns and the three gate inputs", async () => {
    const { db, findMany } = stubPrisma(() => []);
    await loadLocalRows(db, ["A"]);
    const select = (findMany.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    expect(Object.keys(select).sort()).toEqual([
      "idx_display_yn",
      "listing_id",
      "mls_id",
      "modification_timestamp",
      "owner_opt_out",
      "participant_only",
      "rls_eligible",
      "status",
      "sync_status",
    ]);
    expect(select).toEqual(LOCAL_COMPARE_SELECT);
  });

  it("chunk() never returns an empty or oversized slice", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([], 10)).toEqual([]);
    expect(chunk(Array.from({ length: 2001 }, (_, i) => i), 99_999).map((c) => c.length)).toEqual([
      1000, 1000, 1,
    ]);
  });

  it("keyset-paginates the local Active-ish scan and stops on a short page", async () => {
    const pages: LocalRow[][] = [
      Array.from({ length: 3 }, (_, i) => localRow({ listing_id: `A${i}` })),
      [localRow({ listing_id: "B0" })],
    ];
    let call = 0;
    const findMany = jest.fn(async (_args: Record<string, unknown>) => pages[call++] ?? []);
    const db = { listing: { findMany } } as unknown as ManifestPrisma;

    const rows = await loadLocalActiveIshRows(db, 3);

    expect(rows.map((r) => r.listing_id)).toEqual(["A0", "A1", "A2", "B0"]);
    expect(findMany).toHaveBeenCalledTimes(2);
    const second = findMany.mock.calls[1][0] as unknown as {
      where: { listing_id?: { gt: string }; status: { in: string[] } };
    };
    // Resumes strictly AFTER the last id of the previous page — no re-serve, no skip.
    expect(second.where.listing_id).toEqual({ gt: "A2" });
    expect(second.where.status).toEqual({ in: [...PROVIDER_ACTIVE_STATUSES] });
  });
});

// ── 10. Provider paging ─────────────────────────────────────────────────────

describe("provider population scan", () => {
  it("follows @odata.nextLink to completion and filters to the Active-ish set", async () => {
    const seen: string[] = [];
    const httpGet = jest.fn(async (url: string) => {
      seen.push(url);
      if (seen.length === 1) {
        return {
          value: [{ ListingId: "A", ListingKey: "KA", StandardStatus: "Active" }],
          "@odata.nextLink": "https://provider/page2",
        };
      }
      return { value: [{ ListingId: "B", ListingKey: "KB", StandardStatus: "ComingSoon" }] };
    });

    const rows = await fetchProviderActivePopulation({
      token: async () => "tok",
      httpGet,
    });

    expect(rows.map((r) => r.ListingId)).toEqual(["A", "B"]);
    expect(httpGet).toHaveBeenCalledTimes(2);
    expect(seen[1]).toBe("https://provider/page2");
    // URLSearchParams writes spaces as `+`; decodeURIComponent does not undo that.
    const firstUrl = decodeURIComponent(seen[0]).replace(/\+/g, " ");
    expect(firstUrl).toContain(buildProviderActiveFilter());
    expect(firstUrl).toContain("ModificationTimestamp asc,ListingKey asc");
    for (const field of ["ListingId", "ListingKey", "InternetEntireListingDisplayYN"]) {
      expect(firstUrl).toContain(field);
    }
  });

  it("preserves the null/false distinction on InternetEntireListingDisplayYN", async () => {
    const httpGet = jest.fn(async () => ({
      value: [
        { ListingId: "A", InternetEntireListingDisplayYN: false },
        { ListingId: "B" },
        { ListingId: "C", InternetEntireListingDisplayYN: true },
      ],
    }));

    const rows = await fetchProviderActivePopulation({ token: async () => "tok", httpGet });

    expect(rows.map((r) => r.InternetEntireListingDisplayYN)).toEqual([false, null, true]);
  });

  it("drops a record with no ListingId rather than emitting a keyless entry", async () => {
    const httpGet = jest.fn(async () => ({ value: [{ ListingKey: "K-ONLY" }, { ListingId: "A" }] }));
    const rows = await fetchProviderActivePopulation({ token: async () => "tok", httpGet });
    expect(rows.map((r) => r.ListingId)).toEqual(["A"]);
  });
});

// ── 11. Duplicate provider ids ──────────────────────────────────────────────

describe("duplicate provider ListingIds", () => {
  it("collapses them and reports the count (measured live as 0)", () => {
    const manifest = manifestOf(
      [providerRow({ ListingId: "DUP" }), providerRow({ ListingId: "DUP" })],
      [localRow({ listing_id: "DUP", mls_id: null })],
      true,
    );

    expect(manifest.providerPopulation).toBe(1);
    expect(manifest.diagnostics.duplicateProviderListingIds).toBe(1);
    expect(manifest.entries.map((e) => e.listingId)).toEqual(["DUP"]);
  });
});

// ── 12. CLI surface ─────────────────────────────────────────────────────────

describe("CLI", () => {
  it("defaults the mls backfill OFF and the output path to the canonical artifact", () => {
    expect(parseManifestArgs([])).toEqual({
      includeMlsBackfill: false,
      outPath: DEFAULT_MANIFEST_PATH,
    });
  });

  it("admits the identity backfill only on the explicit flag", () => {
    expect(parseManifestArgs(["--include-mls-backfill"]).includeMlsBackfill).toBe(true);
    expect(parseManifestArgs(["--out=artifacts/x.json"]).outPath).toBe("artifacts/x.json");
  });

  it("prints every reason code in the totals table", () => {
    const table = formatTotalsTable(manifestOf([providerRow()], [localRow()]));
    for (const code of RECOVERY_REASON_CODES) expect(table).toContain(code);
    expect(table).toContain("MANIFEST SIZE");
  });
});
