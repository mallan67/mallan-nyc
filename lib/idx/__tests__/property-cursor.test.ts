/// <reference types="jest" />
/**
 * Phase 1A — two-stream composite keyset cursor state.
 *
 * The Property incremental fetch uses TWO clocks (`ModificationTimestamp` and
 * `PhotosChangeTimestamp`) joined by `or`. The live probe
 * (docs/idx/cotality-keyset-cursor-probe-2026-07-29.md) proved:
 *
 *   - no single ordering serves both clocks, so one scalar cursor over the OR
 *     filter is unsafe;
 *   - a timestamp-only cursor is unsafe regardless: one ModificationTimestamp
 *     is shared by 1,203 listings, 4.8x the 250-row page budget;
 *   - `ListingKey eq ''` returns the FULL population, so empty-string
 *     comparison cannot be trusted anywhere in a filter.
 *
 * Hence: two independent streams, each with a `(timestamp, ListingKey)` keyset
 * cursor, and a bootstrap mode that never emits an empty-key tie clause.
 */

import {
  PROPERTY_CURSOR_BOOTSTRAP_EPOCH,
  CURSOR_BASIS_BOOTSTRAP,
  CURSOR_BASIS_LIVE,
  bootstrapCursorState,
  parsePropertyCursorNotes,
  mergePropertyCursorIntoNotes,
  buildStreamFilter,
  streamOrderBy,
  type PropertyCursorState,
} from "@/lib/idx/property-cursor";

describe("bootstrap epoch is PINNED, never computed", () => {
  it("is the fixed UTC instant proven equivalent to `ge 2026-06-29T00:00:00Z`", () => {
    expect(PROPERTY_CURSOR_BOOTSTRAP_EPOCH).toBe("2026-06-28T23:59:59.999Z");
  });

  it("does not move between calls (no `Date.now() - 30 days`)", () => {
    const a = bootstrapCursorState();
    const b = bootstrapCursorState();
    expect(a.mt).toEqual(b.mt);
    expect(a.pct).toEqual(b.pct);
    expect(a.mt.timestamp).toBe(PROPERTY_CURSOR_BOOTSTRAP_EPOCH);
    expect(a.pct.timestamp).toBe(PROPERTY_CURSOR_BOOTSTRAP_EPOCH);
    expect(a.basis).toBe(CURSOR_BASIS_BOOTSTRAP);
  });
});

describe("filter shapes", () => {
  it("BOOTSTRAP emits a plain `gt` and NEVER an empty-key tie clause", () => {
    const f = buildStreamFilter("ModificationTimestamp", { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH });
    expect(f).toBe("ModificationTimestamp gt 2026-06-28T23:59:59.999Z");
    // The probe proved empty-string comparison is not evaluated as a predicate.
    expect(f).not.toContain("ListingKey");
    expect(f).not.toContain("''");
  });

  it("KEYSET emits the compound tie predicate", () => {
    const f = buildStreamFilter("ModificationTimestamp", {
      mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "1091329763",
    });
    expect(f).toBe(
      "(ModificationTimestamp gt 2026-07-01T00:00:00.000Z or " +
      "(ModificationTimestamp eq 2026-07-01T00:00:00.000Z and ListingKey gt '1091329763'))",
    );
  });

  it("uses the PCT field for the PCT stream", () => {
    const f = buildStreamFilter("PhotosChangeTimestamp", {
      mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1",
    });
    expect(f).toContain("PhotosChangeTimestamp gt");
    expect(f).toContain("PhotosChangeTimestamp eq");
    expect(f).not.toContain("ModificationTimestamp");
  });

  it("escapes a quote in the tie key so the filter cannot be broken", () => {
    const f = buildStreamFilter("ModificationTimestamp", {
      mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "A'B",
    });
    expect(f).toContain("ListingKey gt 'A''B'");
  });

  it("REFUSES to build a keyset filter with an empty key", () => {
    // Would produce `ListingKey gt ''`, which the probe proved is not evaluated.
    expect(() =>
      buildStreamFilter("ModificationTimestamp", { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "" }),
    ).toThrow();
  });

  it("orders by the stream clock then ListingKey", () => {
    expect(streamOrderBy("ModificationTimestamp")).toBe("ModificationTimestamp asc,ListingKey asc");
    expect(streamOrderBy("PhotosChangeTimestamp")).toBe("PhotosChangeTimestamp asc,ListingKey asc");
  });
});

describe("notes parsing fails closed", () => {
  const good = {
    manifest_warmed_shards: ["1", "4"],
    property_cursor_basis: CURSOR_BASIS_LIVE,
    property_cursors: {
      mt: { timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
      pct: { timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" },
    },
  };

  it("reads a well-formed trusted state", () => {
    const s = parsePropertyCursorNotes(good);
    expect(s).not.toBeNull();
    expect(s!.basis).toBe(CURSOR_BASIS_LIVE);
    expect(s!.mt).toEqual({ mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" });
    expect(s!.pct).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" });
  });

  it.each([
    ["null notes", null],
    ["a string", "nope"],
    ["an array", []],
    ["absent basis", { property_cursors: good.property_cursors }],
    ["an unrecognised basis", { ...good, property_cursor_basis: "something_else" }],
    ["absent cursors", { property_cursor_basis: CURSOR_BASIS_LIVE }],
    ["a missing stream", { ...good, property_cursors: { mt: good.property_cursors.mt } }],
    ["a missing listingKey", { ...good, property_cursors: { ...good.property_cursors, mt: { timestamp: "2026-07-01T00:00:00.000Z" } } }],
    ["an empty listingKey", { ...good, property_cursors: { ...good.property_cursors, mt: { timestamp: "2026-07-01T00:00:00.000Z", listingKey: "" } } }],
    ["a malformed timestamp", { ...good, property_cursors: { ...good.property_cursors, mt: { timestamp: "not-a-date", listingKey: "K1" } } }],
  ])("returns null for %s", (_label, notes) => {
    expect(parsePropertyCursorNotes(notes)).toBeNull();
  });

  it("accepts a bootstrap-basis state whose streams carry no key yet", () => {
    const s = parsePropertyCursorNotes({
      manifest_warmed_shards: [],
      property_cursor_basis: CURSOR_BASIS_BOOTSTRAP,
      property_cursors: {
        mt: { timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
        pct: { timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
      },
    });
    expect(s).not.toBeNull();
    expect(s!.mt.mode).toBe("bootstrap");
    expect(s!.pct.mode).toBe("bootstrap");
  });

  it("allows one stream to be live while the other is still bootstrapping", () => {
    const s = parsePropertyCursorNotes({
      property_cursor_basis: CURSOR_BASIS_BOOTSTRAP,
      property_cursors: {
        mt: { timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
        pct: { timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
      },
    });
    expect(s!.mt.mode).toBe("keyset");
    expect(s!.pct.mode).toBe("bootstrap");
  });
});

describe("notes merge preserves unrelated recognised fields", () => {
  it("keeps manifest_warmed_shards and any other existing key", () => {
    const existing = {
      manifest_warmed_shards: ["1", "4", "7"],
      some_other_recognised_field: { keep: true },
    };
    const state: PropertyCursorState = {
      basis: CURSOR_BASIS_LIVE,
      mt: { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
      pct: { mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" },
    };
    const merged = mergePropertyCursorIntoNotes(existing, state);
    expect(merged.manifest_warmed_shards).toEqual(["1", "4", "7"]);
    expect(merged.some_other_recognised_field).toEqual({ keep: true });
    expect(merged.property_cursor_basis).toBe(CURSOR_BASIS_LIVE);
    expect(merged.property_cursors).toEqual({
      mt: { timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
      pct: { timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" },
    });
  });

  it("survives a round trip exactly (restart fidelity)", () => {
    const state: PropertyCursorState = {
      basis: CURSOR_BASIS_BOOTSTRAP,
      mt: { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
      pct: { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
    };
    const merged = mergePropertyCursorIntoNotes({ manifest_warmed_shards: ["2"] }, state);
    // Simulate a process restart: serialise through JSON exactly as Prisma would.
    const reparsed = parsePropertyCursorNotes(JSON.parse(JSON.stringify(merged)));
    expect(reparsed).toEqual(state);
    expect((merged as { manifest_warmed_shards: string[] }).manifest_warmed_shards).toEqual(["2"]);
  });

  it("does not mutate the caller's notes object", () => {
    const existing = { manifest_warmed_shards: ["1"] };
    mergePropertyCursorIntoNotes(existing, bootstrapCursorState());
    expect(existing).toEqual({ manifest_warmed_shards: ["1"] });
  });
});

// ── §5 Bootstrap epoch is the ONLY legal keyless timestamp ────────────────

describe("a keyless bootstrap cursor must sit exactly on the pinned epoch", () => {
  it("rejects an arbitrary keyless timestamp (a moving bootstrap bound)", () => {
    const s = parsePropertyCursorNotes({
      property_cursor_basis: CURSOR_BASIS_BOOTSTRAP,
      property_cursors: {
        mt: { timestamp: "2026-07-15T00:00:00.000Z" }, // not the pinned epoch
        pct: { timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
      },
    });
    expect(s).toBeNull();
  });

  it("accepts the pinned epoch written in a non-canonical offset form", () => {
    const s = parsePropertyCursorNotes({
      property_cursor_basis: CURSOR_BASIS_BOOTSTRAP,
      property_cursors: {
        mt: { timestamp: "2026-06-28T23:59:59.999-00:00" },
        pct: { timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
      },
    });
    expect(s).not.toBeNull();
    expect(s!.mt).toEqual({ mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH });
  });
});

describe("timestamp normalisation and whitespace keys", () => {
  it("normalises a persisted keyset timestamp to canonical UTC", () => {
    const s = parsePropertyCursorNotes({
      property_cursor_basis: CURSOR_BASIS_LIVE,
      property_cursors: {
        mt: { timestamp: "2026-05-15T11:12:44.223-00:00", listingKey: "K1" },
        pct: { timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" },
      },
    });
    expect(s!.mt).toEqual({ mode: "keyset", timestamp: "2026-05-15T11:12:44.223Z", listingKey: "K1" });
  });

  it("emits a canonical UTC timestamp in the filter", () => {
    const f = buildStreamFilter("ModificationTimestamp", {
      mode: "keyset", timestamp: "2026-05-15T11:12:44.223-00:00", listingKey: "K1",
    });
    expect(f).toContain("2026-05-15T11:12:44.223Z");
    expect(f).not.toContain("-00:00");
  });

  it("treats a whitespace-only ListingKey as missing", () => {
    expect(parsePropertyCursorNotes({
      property_cursor_basis: CURSOR_BASIS_LIVE,
      property_cursors: {
        mt: { timestamp: "2026-07-01T00:00:00.000Z", listingKey: "   " },
        pct: { timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K2" },
      },
    })).toBeNull();
    expect(() => buildStreamFilter("ModificationTimestamp", {
      mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "   ",
    })).toThrow();
  });
});

// ── §6 The REAL serialized notes seam ─────────────────────────────────────

describe("round trip through a SERIALIZED notes string (the production seam)", () => {
  /** SyncState.notes is stored as JSON text, so the seam is string -> object -> string. */
  function updateSerializedNotes(notesJson: string, state: PropertyCursorState): string {
    let parsed: unknown = null;
    try { parsed = JSON.parse(notesJson); } catch { parsed = null; }
    // NB: merge the PARSED OBJECT, never the raw string — passing the string
    // would drop every existing field on the floor.
    return JSON.stringify(mergePropertyCursorIntoNotes(parsed, state));
  }

  it("preserves manifest_warmed_shards and unrelated fields across a string round trip", () => {
    const before = JSON.stringify({
      manifest_warmed_shards: ["1", "4"],
      some_other_recognised_field: { keep: true },
    });
    const state: PropertyCursorState = {
      basis: CURSOR_BASIS_BOOTSTRAP,
      mt: { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" },
      pct: { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
    };
    const after = updateSerializedNotes(before, state);
    const obj = JSON.parse(after) as Record<string, unknown>;

    expect(obj.manifest_warmed_shards).toEqual(["1", "4"]);
    expect(obj.some_other_recognised_field).toEqual({ keep: true });
    // One stream live, one still bootstrapping — survives exactly.
    expect(parsePropertyCursorNotes(obj)).toEqual(state);
  });

  it("survives repeated cycles without drifting", () => {
    let notes = JSON.stringify({ manifest_warmed_shards: ["7"] });
    for (let i = 1; i <= 3; i++) {
      notes = updateSerializedNotes(notes, {
        basis: CURSOR_BASIS_BOOTSTRAP,
        mt: { mode: "keyset", timestamp: `2026-07-0${i}T00:00:00.000Z`, listingKey: `K${i}` },
        pct: { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
      });
    }
    const obj = JSON.parse(notes) as Record<string, unknown>;
    expect(obj.manifest_warmed_shards).toEqual(["7"]);
    const s = parsePropertyCursorNotes(obj);
    expect(s!.mt).toEqual({ mode: "keyset", timestamp: "2026-07-03T00:00:00.000Z", listingKey: "K3" });
    expect(s!.pct.mode).toBe("bootstrap");
  });

  it("malformed notes JSON bootstraps rather than inventing a cursor", () => {
    const after = updateSerializedNotes("{not json", bootstrapCursorState());
    const obj = JSON.parse(after) as Record<string, unknown>;
    const s = parsePropertyCursorNotes(obj);
    expect(s!.mt).toEqual({ mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH });
  });
});
