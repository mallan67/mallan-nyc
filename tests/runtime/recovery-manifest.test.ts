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
  displayGateMismatchExplainedByLocalGate,
  expectedIdxDisplayWithLocalGates,
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
) {
  return buildManifest({
    providerRows,
    localRows,
    includeMlsBackfill,
    generatedAt: "2026-08-13T12:00:00.000Z",
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
  // Each of the three local gates independently forces idx_display_yn=false. A
  // row hidden BECAUSE of one of them is internally consistent: there is no
  // difference to refresh. Emitting it would re-fetch the row, suppress the
  // write, change nothing, and re-emit it on the next build forever — the same
  // self-regenerating no-op worklist as the `last_synced_from_trestle` predicate
  // this generator replaced.

  it("does NOT fire when participant_only explains the hidden row", () => {
    expect(
      classifyProviderRow(providerRow(), locallyGatedRow({ participant_only: true })),
    ).toEqual([]);
  });

  it("does NOT fire when owner_opt_out explains the hidden row", () => {
    expect(classifyProviderRow(providerRow(), locallyGatedRow({ owner_opt_out: true }))).toEqual(
      [],
    );
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

  it("fires when a gate is set but idx_display_yn was never brought into line", () => {
    // participant_only=true with idx_display_yn=true is an inconsistent row —
    // the gate is set yet the listing is still publicly displayable. That is a
    // real defect, not an explanation, and it is the exact shape the
    // safety-relevant direction exists to catch.
    expect(
      classifyProviderRow(providerRow(), localRow({ participant_only: true })),
    ).toEqual(["display_gate_mismatch"]);
  });

  it("EXCLUDES from the manifest a row whose ONLY reason was an explained mismatch", () => {
    const manifest = manifestOf(
      [providerRow()],
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
    const explained = providerRow({ ListingId: "RLS-EXPL", ListingKey: "K-EXPL" });

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
    // classification uses the full-gate evaluator instead.
    const gated = locallyGatedRow({ participant_only: true });
    expect(providerExpectedIdxDisplay(providerRow())).toBe(true);
    expect(providerExpectedIdxDisplay(providerRow())).not.toBe(gated.idx_display_yn);
    expect(expectedIdxDisplayWithLocalGates(providerRow(), gated)).toBe(false);
    expect(displayGateMismatchExplainedByLocalGate(providerRow(), gated)).toBe(true);
    expect(displayGateMismatchExplainedByLocalGate(providerRow(), localRow())).toBe(false);
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
