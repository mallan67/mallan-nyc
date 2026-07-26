/// <reference types="jest" />
/**
 * Pre-write decision helper — focused proof for issue #574
 * (Neon write-amplification fix).
 *
 * The helper returns one of three actions:
 *   "suppress"  — materially identical → no DB write
 *   "targeted"  — only RAW_DATA_METADATA_ONLY_KEYS changed in raw_data →
 *                 write without raw_data (avoids TOAST/WAL write)
 *   "full"      — any unknown / business / content raw_data change →
 *                 write the complete payload including raw_data
 *
 * Tests prove:
 *   1. Identical cycle is fully suppressed.
 *   2. Allowlisted metadata-only difference → "targeted" (raw_data omitted).
 *   3. Any unknown raw_data key → "full" (fail closed).
 *   4. Mixed metadata and business changes → "full".
 *   5. CREATE (existing=null) always → "full".
 *   6. Cache/projection/manifest behavior: non-visible changes do not add
 *      cache tags (proven via isProvenanceOnlyChange — the targeted decision
 *      aligns with the modification_timestamp_only bucket).
 *   7. RAW_DATA_METADATA_ONLY_KEYS shape + eligibility criteria (Cotality
 *      alignment review 2026-07-26).
 *   8. Mapper alias safety: RESO_TO_RLS_RENAMES aliases normalize to canonical
 *      names before storage so aliases cannot create false differences.
 *   9. Absent-vs-null ambiguity → "full" (fail closed).
 *  10. ListingId identity and upsert contract unchanged.
 */

import {
  decideListingWriteAction,
  RAW_DATA_METADATA_ONLY_KEYS,
  isProvenanceOnlyChange,
  classifyListingChangeReasons,
} from "../write-suppression";

const T0 = new Date("2026-07-20T10:00:00.000Z");
const T1 = new Date("2026-07-26T10:00:00.000Z");

/** Minimal existing row for the comparator (all keys the update can carry). */
function existingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "Active",
    sync_status: "active",
    list_price: 1_250_000,
    mls_id: "MLS1",
    listing_type: "sale",
    property_type: "Residential",
    property_sub_type: "Condo",
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 900,
    address: { StreetNumber: "400", StreetName: "EAST 90 STREET", PostalCode: "10128" },
    borough: "Manhattan",
    neighborhood: "Upper East Side",
    city: "New York",
    postal_code: "10128",
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    agent_id: null,
    list_agent_full_name: "Jane Broker",
    list_office_name: "Mallan Real Estate",
    list_agent_email: null,
    list_agent_direct_phone: null,
    list_office_mls_id: "OFF1",
    list_agent_mls_id: "AGT1",
    co_list_office_mls_id: null,
    co_list_agent_mls_id: null,
    features: { rooms: 5 },
    raw_data: {
      ListingKey: "L1",
      StandardStatus: "Active",
      PublicRemarks: "Sunny 2BR",
      ModificationTimestamp: T0.toISOString(),
      OriginalEntryTimestamp: "2025-01-01T00:00:00Z",
    },
    modification_timestamp: T0,
    listing_contract_date: null,
    terminal_since: null,
    cumulative_days_on_market: null,
    status_changed_at: T0,
    first_active_date: T0,
    days_on_market: 0,
    last_synced_from_trestle: T0,
    ...overrides,
  };
}

/** An update payload that is structurally identical to existingRow() except for
 *  overrides.  `last_synced_from_trestle` advances to T1 (local telemetry
 *  clock — non-material). */
function updatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...existingRow(),
    last_synced_from_trestle: T1,
    ...overrides,
  };
}

// ── RAW_DATA_METADATA_ONLY_KEYS shape ───────────────────────────────────────

describe("RAW_DATA_METADATA_ONLY_KEYS — explicit allowlist contract", () => {
  it("contains exactly ModificationTimestamp (OriginalEntryTimestamp excluded — not in RAW_DATA_KEEP_FIELDS)", () => {
    // ModificationTimestamp IS in RAW_DATA_KEEP_FIELDS (slimRawData preserves it).
    // OriginalEntryTimestamp is NOT in RAW_DATA_KEEP_FIELDS — slimRawData strips it
    // before persistence so it can never appear in stored raw_data and is therefore
    // ineligible for this allowlist (see eligibility criteria in the module comment).
    expect([...RAW_DATA_METADATA_ONLY_KEYS].sort()).toEqual([
      "ModificationTimestamp",
    ]);
  });

  it("OriginalEntryTimestamp is still in RAW_DATA_PROVENANCE_CLOCK_KEYS (defensive comparator exclusion)", () => {
    // RAW_DATA_PROVENANCE_CLOCK_KEYS is the broader comparator-exclusion set.
    // OriginalEntryTimestamp remains there as a defensive exclusion for the
    // future case where it might be added to RAW_DATA_KEEP_FIELDS.
    expect(RAW_DATA_METADATA_ONLY_KEYS.has("OriginalEntryTimestamp")).toBe(false);
  });
});

// ── 1. Identical cycle is fully suppressed ───────────────────────────────────

describe("decideListingWriteAction — suppress: identical cycle", () => {
  it("returns 'suppress' when payload equals existing row (only telemetry clock differs)", () => {
    const update = updatePayload(); // last_synced_from_trestle bumped, all else equal
    expect(decideListingWriteAction(update, existingRow())).toBe("suppress");
  });

  it("returns 'suppress' when raw_data has identical content (key-order independent)", () => {
    const reorderedRaw = {
      OriginalEntryTimestamp: "2025-01-01T00:00:00Z",
      PublicRemarks: "Sunny 2BR",
      StandardStatus: "Active",
      ModificationTimestamp: T0.toISOString(),
      ListingKey: "L1",
    };
    const update = updatePayload({ raw_data: reorderedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("suppress");
  });

  it("returns 'suppress' when rotating Media URL rotated (same asset path, only signature changed)", () => {
    const rawWithMedia = {
      ...existingRow().raw_data as Record<string, unknown>,
      Media: [{ MediaKey: "mk1", Order: 0, MediaURL: "https://api.cotality.com/media/photo1.jpg?sig=AAA" }],
    };
    const rawRotated = {
      ...rawWithMedia,
      Media: [{ MediaKey: "mk1", Order: 0, MediaURL: "https://api.cotality.com/media/photo1.jpg?sig=ZZZ" }],
    };
    const update = updatePayload({ raw_data: rawRotated });
    // raw_data materially equal (only rotating signature differs) → suppress
    expect(decideListingWriteAction(update, existingRow({ raw_data: rawWithMedia }))).toBe("suppress");
  });
});

// ── 2. Allowlisted metadata-only difference → "targeted" ────────────────────

describe("decideListingWriteAction — targeted: allowlisted metadata only", () => {
  it("returns 'targeted' when only ModificationTimestamp changed in raw_data (production path)", () => {
    // EVIDENCE: ModificationTimestamp IS in RAW_DATA_KEEP_FIELDS, so slimRawData
    // preserves it in stored raw_data. The typed modification_timestamp column is
    // also always written even on the targeted path, so Cotality truth is never lost.
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(), // only this moved
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1, // the typed column also bumped (always persisted)
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("targeted");
  });

  it("returns 'full' when OriginalEntryTimestamp changes in raw_data — not in RAW_DATA_METADATA_ONLY_KEYS (fail closed)", () => {
    // OriginalEntryTimestamp is NOT in RAW_DATA_METADATA_ONLY_KEYS. Even though it
    // is in RAW_DATA_PROVENANCE_CLOCK_KEYS, the targeted gate requires ALL changed
    // keys to be in RAW_DATA_METADATA_ONLY_KEYS exactly. A key in the broader
    // provenance set but not in the allowlist must force a full write (fail closed).
    // NOTE: In production, OET is never stored (slimRawData strips it), so this
    // path is hypothetical. The code must be fail-closed even for hypotheticals.
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      OriginalEntryTimestamp: "2025-06-01T00:00:00Z",
    };
    const update = updatePayload({ raw_data: updatedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when both ModificationTimestamp and OriginalEntryTimestamp changed simultaneously", () => {
    // ModificationTimestamp IS in RAW_DATA_METADATA_ONLY_KEYS.
    // OriginalEntryTimestamp is NOT in RAW_DATA_METADATA_ONLY_KEYS.
    // Both changed → at least one key outside the allowlist → full (fail closed).
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      OriginalEntryTimestamp: "2025-06-01T00:00:00Z",
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("targeted decision aligns with modification_timestamp_only classification", () => {
    // classifyListingChangeReasons must agree — both helpers use the same seams.
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    const existing = existingRow();
    const decision = decideListingWriteAction(update, existing);
    const reasons = classifyListingChangeReasons(update, existing);
    expect(decision).toBe("targeted");
    // The change-reason classifier must also see this as provenance-only.
    expect(isProvenanceOnlyChange(reasons)).toBe(true);
    // And therefore cache/manifest invalidation is skipped for this change.
    expect(reasons).toEqual(["modification_timestamp_only"]);
  });

  it("targeted path writes the typed modification_timestamp column (Cotality truth preserved)", () => {
    // The targeted path OMITS raw_data from the UPDATE payload but must INCLUDE the
    // typed modification_timestamp column. This test proves decideListingWriteAction
    // correctly returns 'targeted' (not 'suppress') so the typed column write proceeds.
    // The OMISSION of raw_data is handled in sync.ts (destructuring); the typed column
    // is always in the Prisma update payload regardless of targeted vs full.
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1, // typed column carries the new Cotality timestamp
    });
    // 'targeted' — NOT 'suppress' — means the Prisma UPDATE runs and the typed column writes.
    expect(decideListingWriteAction(update, existingRow())).toBe("targeted");
    // Verify the update payload contains the typed column so the caller has it to write.
    expect(update.modification_timestamp).toEqual(T1);
    // Verify modification_timestamp actually changed (suppression guard would block this).
    expect(update.modification_timestamp).not.toEqual(existingRow().modification_timestamp);
  });
});

// ── 3. Unknown raw_data key → "full" (fail closed) ──────────────────────────

describe("decideListingWriteAction — full: unknown raw_data key", () => {
  it("returns 'full' when a new key appears in raw_data", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      UnknownField: "some value",
    };
    const update = updatePayload({ raw_data: updatedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when a non-allowlisted key changes value (PublicRemarks)", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      PublicRemarks: "Renovated 2BR with new kitchen",
    };
    const update = updatePayload({ raw_data: updatedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when an existing key is removed from raw_data", () => {
    const updatedRaw: Record<string, unknown> = { ...(existingRow().raw_data as Record<string, unknown>) };
    delete updatedRaw.PublicRemarks;
    const update = updatePayload({ raw_data: updatedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when Media asset path changed (real photo replacement)", () => {
    const rawWithMedia = {
      ...(existingRow().raw_data as Record<string, unknown>),
      Media: [{ MediaKey: "mk1", Order: 0, MediaURL: "https://api.cotality.com/media/photo1.jpg" }],
    };
    const rawNewPhoto = {
      ...(existingRow().raw_data as Record<string, unknown>),
      Media: [{ MediaKey: "mk1", Order: 0, MediaURL: "https://api.cotality.com/media/photo2.jpg" }],
    };
    const update = updatePayload({ raw_data: rawNewPhoto });
    expect(decideListingWriteAction(update, existingRow({ raw_data: rawWithMedia }))).toBe("full");
  });
});

// ── 4. Mixed metadata and business changes → "full" ─────────────────────────

describe("decideListingWriteAction — full: mixed metadata and business changes", () => {
  it("returns 'full' when ModificationTimestamp AND PublicRemarks both changed", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      PublicRemarks: "Just renovated",
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when an allowlisted raw_data key AND a typed column (status) changed", () => {
    // Even if raw_data only has allowlisted changes, a business column change
    // (status) already means the row is materially changed and must write fully.
    // The TARGETED decision omits raw_data only — it does NOT suppress other columns.
    // Here we just verify the decision returns "full" because status changed too.
    // (In the targeted path, only raw_data is omitted; other columns always write.)
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      StandardStatus: "ActiveUnderContract",
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
      status: "ActiveUnderContract",
    });
    // StandardStatus is not in the allowlist → full
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when ModificationTimestamp AND PhotosChangeTimestamp both changed", () => {
    // PhotosChangeTimestamp is explicitly NOT in the allowlist (requires real
    // media reconciliation to be treated as provenance-only — see comments in
    // write-suppression.ts regarding RAW_DATA_PROVENANCE_CLOCK_KEYS).
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      PhotosChangeTimestamp: T1.toISOString(),
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });
});

// ── 5. CREATE behavior is unchanged ─────────────────────────────────────────

describe("decideListingWriteAction — full: create (existing=null)", () => {
  it("returns 'full' for a CREATE regardless of raw_data content", () => {
    const update = updatePayload();
    expect(decideListingWriteAction(update, null)).toBe("full");
  });

  it("returns 'full' for a CREATE even when raw_data has only allowlisted keys", () => {
    const update = updatePayload({
      raw_data: {
        ModificationTimestamp: T1.toISOString(),
        OriginalEntryTimestamp: "2025-01-01T00:00:00Z",
      },
    });
    expect(decideListingWriteAction(update, null)).toBe("full");
  });
});

// ── 6. Cache/projection/manifest: non-visible changes do not invalidate ──────

describe("decideListingWriteAction — cache/projection/manifest behavior for non-visible changes", () => {
  it("targeted decision aligns with isProvenanceOnlyChange → no cache tags added", () => {
    // The sync loop skips cache/manifest invalidation when isProvenanceOnlyChange
    // returns true. We prove that a "targeted" write decision always corresponds
    // to classifyListingChangeReasons returning ["modification_timestamp_only"],
    // which isProvenanceOnlyChange maps to true.
    // Only ModificationTimestamp changes — it is the sole key in RAW_DATA_METADATA_ONLY_KEYS.
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      // OriginalEntryTimestamp deliberately excluded: it is NOT in
      // RAW_DATA_METADATA_ONLY_KEYS and would force a full write.
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    const existing = existingRow();

    const decision = decideListingWriteAction(update, existing);
    const reasons = classifyListingChangeReasons(update, existing);

    expect(decision).toBe("targeted");
    expect(isProvenanceOnlyChange(reasons)).toBe(true);
    // The sync loop guards: if (!changeReasons || !isProvenanceOnlyChange(changeReasons))
    // So for a targeted write, changedCacheTags gets NOTHING added → no ISR invalidation,
    // no manifest warm, no false "updated" signal for search alerts.
  });

  it("suppress decision: no write at all, no cache tags, no projection update", () => {
    const update = updatePayload(); // only telemetry clock differs
    const existing = existingRow();
    expect(decideListingWriteAction(update, existing)).toBe("suppress");
    // In suppress path: listingCounters.rows_suppressed_unchanged++ and nothing else.
    // No Prisma write, no cache tags, no projection.
  });

  it("two-consecutive-cycle proof: cycle-1 → targeted; cycle-2 → suppress (no repeated write)", () => {
    // CYCLE 1: Cotality sends a new ModificationTimestamp (T1).
    // Existing row: modification_timestamp=T0, raw_data.ModificationTimestamp=T0.
    const cycle1Existing = existingRow({
      modification_timestamp: T0,
      raw_data: {
        ...(existingRow().raw_data as Record<string, unknown>),
        ModificationTimestamp: T0.toISOString(),
      },
    });
    const cycle1Update = updatePayload({
      modification_timestamp: T1,
      raw_data: {
        ...(existingRow().raw_data as Record<string, unknown>),
        ModificationTimestamp: T1.toISOString(),
      },
    });
    expect(decideListingWriteAction(cycle1Update, cycle1Existing)).toBe("targeted");

    // CYCLE 2: After the targeted write, Prisma persisted modification_timestamp=T1
    // but deliberately left stored raw_data.ModificationTimestamp=T0 (raw_data was
    // omitted from the UPDATE payload). The same Cotality record is received again
    // unchanged (ModificationTimestamp is still T1).
    //
    // Post-cycle-1 DB state: typed column updated, stored raw_data.MT stale.
    const cycle2Existing = {
      ...cycle1Existing,
      modification_timestamp: T1, // typed column was persisted by cycle-1 targeted write
      raw_data: cycle1Existing.raw_data, // raw_data.ModificationTimestamp still T0 (stale)
      last_synced_from_trestle: T1, // last_synced also updated by cycle-1 write
    };
    // Cotality sends the same payload again (MT still T1).
    const cycle2Update = updatePayload({
      modification_timestamp: T1,
      raw_data: {
        ...(existingRow().raw_data as Record<string, unknown>),
        ModificationTimestamp: T1.toISOString(),
      },
    });
    // listingUpdateMateriallyUnchanged uses rawDataEqualIgnoringProvenanceClocks,
    // which strips ModificationTimestamp from both sides before comparing.
    // With MT stripped: stored raw_data == incoming raw_data (all other keys equal).
    // Typed modification_timestamp: T1 == T1. → materially unchanged → suppress.
    expect(decideListingWriteAction(cycle2Update, cycle2Existing)).toBe("suppress");
  });

  it("full decision for raw_data content change preserves cache invalidation path", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      PublicRemarks: "Newly renovated",
    };
    const update = updatePayload({ raw_data: updatedRaw });
    const existing = existingRow();

    const decision = decideListingWriteAction(update, existing);
    const reasons = classifyListingChangeReasons(update, existing);

    expect(decision).toBe("full");
    // raw_data_only — NOT provenance-only → invalidation is NOT skipped.
    expect(isProvenanceOnlyChange(reasons)).toBe(false);
  });
});

// ── Fail-closed: non-object / hostile input ──────────────────────────────────

describe("decideListingWriteAction — fail-closed on hostile input", () => {
  it("returns 'full' when existing raw_data is null (cannot compare)", () => {
    const update = updatePayload({
      raw_data: { ListingKey: "L1", ModificationTimestamp: T1.toISOString() },
    });
    // Existing row with null raw_data — raw_data comparison will fail closed.
    expect(decideListingWriteAction(update, existingRow({ raw_data: null }))).toBe("full");
  });

  it("returns 'full' when update raw_data is an array (malformed)", () => {
    const update = updatePayload({ raw_data: [1, 2, 3] });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });
});

// ── 7. Mapper alias safety (Cotality alignment requirement) ──────────────────
//
// trestle-mapper.ts normalizes RESO_TO_RLS_RENAMES (23 fields) before
// populating raw_data via slimRawData. The canonical name is what is stored
// and what the comparator sees. Cotality feeds the canonical name directly
// (e.g., `ModificationTimestamp`) OR the alias (e.g.,
// `SourceSystemModificationTimestamp`); the mapper normalizes both to the
// same canonical key before calling slimRawData/raw_data. Therefore:
//   - The stored raw_data.ModificationTimestamp was populated by the mapper
//     (canonical name).
//   - The incoming raw_data in the update is also produced by the mapper
//     (canonical name).
//   - No alias (`SourceSystemModificationTimestamp`) ever reaches the comparator.
//   - False "alias vs canonical" differences are structurally impossible.

describe("decideListingWriteAction — mapper alias safety", () => {
  it("stored raw_data uses canonical name ModificationTimestamp (not alias SourceSystemModificationTimestamp)", () => {
    // The mapper renames SourceSystemModificationTimestamp → ModificationTimestamp
    // via RESO_TO_RLS_RENAMES before slimRawData. The EXISTING row's raw_data
    // must therefore contain ModificationTimestamp (the canonical name).
    // We verify the comparator sees identical values (no false diff).
    const existing = existingRow();
    // Existing raw_data has `ModificationTimestamp` (canonical) set to T0.
    expect((existing.raw_data as Record<string, unknown>).ModificationTimestamp).toBe(T0.toISOString());
    // An update with the same canonical value → no alias-induced false diff.
    const sameTimestampRaw = {
      ...(existing.raw_data as Record<string, unknown>),
      // No SourceSystemModificationTimestamp key — mapper already normalized.
    };
    const update = updatePayload({ raw_data: sameTimestampRaw });
    expect(decideListingWriteAction(update, existing)).toBe("suppress");
  });

  it("update payload uses canonical ModificationTimestamp — same key as stored → suppressed when equal", () => {
    // Both sides use canonical name: no alias mismatch possible.
    const canonicalRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T0.toISOString(), // same as existing
    };
    const update = updatePayload({ raw_data: canonicalRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("suppress");
  });

  it("alias key SourceSystemModificationTimestamp in raw_data is UNKNOWN → full (fail closed)", () => {
    // If an alias key somehow bypassed the mapper and appeared in raw_data, the
    // comparator would treat it as an unknown key → full update (fail closed).
    // This proves the comparator is safe even against hypothetical alias leakage.
    const aliasInRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      SourceSystemModificationTimestamp: T1.toISOString(), // alias, not canonical
    };
    const update = updatePayload({ raw_data: aliasInRaw });
    // SourceSystemModificationTimestamp is not in RAW_DATA_PROVENANCE_CLOCK_KEYS
    // (only the canonical ModificationTimestamp is), so it counts as an unknown
    // key change → full update.
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });
});

// ── 8. Absent-vs-null ambiguity → "full" (Cotality alignment requirement) ───
//
// The reviewer requires: "Distinguish an absent source field from an explicitly
// present null. Do not treat partial/omitted Cotality data as an authoritative
// deletion or as proof that a value is unchanged."
//
// materialValuesEqual: null == undefined (absent == SQL NULL). This is correct
// for the PRIMARY typed-column comparison seam (a column being absent from the
// update payload is the same as being explicitly null for Prisma semantics).
// HOWEVER for raw_data keys: a key that was present before but is now absent
// (removed from the payload) is treated as a CHANGE (fail closed — the key is
// in the union of both key sets; absent-in-new produces "different").

describe("decideListingWriteAction — absent-vs-null ambiguity", () => {
  it("returns 'full' when a previously-present raw_data key is now absent (not null)", () => {
    // Existing raw_data has PublicRemarks; incoming raw_data omits it entirely.
    // Absent key is NOT the same as null — this is an unknown delta → full.
    const missingKeyRaw: Record<string, unknown> = { ...(existingRow().raw_data as Record<string, unknown>) };
    delete missingKeyRaw.PublicRemarks;
    const update = updatePayload({ raw_data: missingKeyRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when a previously-present raw_data key is set to null", () => {
    // Explicit null is a content change (Cotality actively cleared the field).
    const nullKeyRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      PublicRemarks: null,
    };
    const update = updatePayload({ raw_data: nullKeyRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("full");
  });

  it("returns 'full' when update raw_data is absent entirely (undefined) and raw_data changed", () => {
    // If the update payload has no raw_data key at all, decideListingWriteAction
    // falls through to "full" when other columns changed (it cannot determine
    // raw_data intent from an absent key).
    const updateWithoutRawData = { ...updatePayload(), list_price: 999_000 };
    delete (updateWithoutRawData as Record<string, unknown>).raw_data;
    // No raw_data in update → non-raw_data column (list_price) changed → full.
    expect(decideListingWriteAction(updateWithoutRawData as Record<string, unknown>, existingRow())).toBe("full");
  });
});

// ── 9. ListingId identity contract (Cotality alignment requirement) ──────────
//
// The contract (COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md §9): upsert key is
// `listing_id` (from Cotality `ListingId`). The write-decision helper operates
// AFTER the upsert key is resolved — it never changes the identity key.

describe("decideListingWriteAction — ListingId identity contract", () => {
  it("does not use or compare listing_id — that is the upsert key, not a material field", () => {
    // listing_id is NOT in LISTING_NON_MATERIAL_UPDATE_FIELDS and NOT in the
    // update payload produced by mapTrestleToPrisma (it's the WHERE clause, not
    // the SET clause). decideListingWriteAction receives only the UPDATE payload.
    // We verify that adding/changing it does NOT affect the decision for an
    // otherwise-identical row.
    const updateA = updatePayload({});
    const updateB = { ...updatePayload(), listing_id: "RLS99999" }; // extra key
    // Both resolve to the same decision — listing_id is not compared.
    expect(decideListingWriteAction(updateA, existingRow())).toBe("suppress");
    // listing_id is present in existingRow (via LISTING_SYNC_COMPARE_SELECT) but
    // NOT in the update payload (it's the WHERE clause). Adding it as an extra key
    // to the update does not change the decision because both sides match it.
    expect(decideListingWriteAction(
      updateB as Record<string, unknown>,
      existingRow({ listing_id: "RLS99999" }),
    )).toBe("suppress");
  });

  it("CREATE path (existing=null) always full — no identity ambiguity possible", () => {
    // A new Cotality listing arriving for the first time. No existing row to
    // compare — always full write. listing_id identity is handled by Prisma WHERE.
    expect(decideListingWriteAction(updatePayload(), null)).toBe("full");
  });
});
