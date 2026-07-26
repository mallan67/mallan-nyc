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
  it("contains exactly ModificationTimestamp and OriginalEntryTimestamp", () => {
    expect([...RAW_DATA_METADATA_ONLY_KEYS].sort()).toEqual([
      "ModificationTimestamp",
      "OriginalEntryTimestamp",
    ]);
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
  it("returns 'targeted' when only ModificationTimestamp changed in raw_data", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(), // only this moved
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1, // the typed column also bumped
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("targeted");
  });

  it("returns 'targeted' when only OriginalEntryTimestamp changed in raw_data", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      OriginalEntryTimestamp: "2025-06-01T00:00:00Z",
    };
    const update = updatePayload({ raw_data: updatedRaw });
    expect(decideListingWriteAction(update, existingRow())).toBe("targeted");
  });

  it("returns 'targeted' when both allowlisted keys changed simultaneously", () => {
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      OriginalEntryTimestamp: "2025-06-01T00:00:00Z",
    };
    const update = updatePayload({
      raw_data: updatedRaw,
      modification_timestamp: T1,
    });
    expect(decideListingWriteAction(update, existingRow())).toBe("targeted");
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
    const updatedRaw = {
      ...(existingRow().raw_data as Record<string, unknown>),
      ModificationTimestamp: T1.toISOString(),
      OriginalEntryTimestamp: "2025-06-01T00:00:00Z",
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
