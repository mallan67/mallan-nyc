/// <reference types="jest" />
/**
 * Phase 2A · CODE-1 — pure URL-free versioned media-set hash + source-set validity.
 *
 * Proves the determinism contract from the acceptance spec §12.4:
 *   - same rows / different API order → same hash
 *   - signed query OR host/path change on the URL → same hash (URL never hashed)
 *   - MediaKey / order / preferred / category / type / revision-ts change → different
 *   - duplicate MediaKey OR missing required identity → invalid, NO hash checkpoint
 *   - RRK inconsistent with the listing → unsafe
 */
import {
  stableMediaSetHash,
  validateMediaSourceSet,
  EMPTY_MEDIA_SET_HASH,
  type MediaSetItem,
} from "@/lib/idx/media-set-hash";
import fc from "fast-check";

// Pinned seed → reproducible property-test evidence (DB-1 / §12 acceptance).
fc.configureGlobal({ seed: 20260726 });

const row = (o: Partial<MediaSetItem> = {}): MediaSetItem => ({
  mediaKey: "m1",
  resourceRecordKey: "L1",
  mediaUrl: "https://api.cotality.com/x.jpg?sig=a",
  mediaType: "photo",
  mediaCategory: "Photo",
  mediaClassification: null,
  order: 1,
  preferredPhotoYN: true,
  mediaModificationTs: new Date("2026-01-01T00:00:00Z"),
  modificationTs: new Date("2026-01-01T00:00:00Z"),
  ...o,
});

const hashOf = (items: MediaSetItem[], key = "L1"): string => {
  const r = stableMediaSetHash(items, key);
  if (!r.ok) throw new Error(`expected valid hash, got invalid: ${r.reasons.join(",")}`);
  return r.hash;
};

describe("stableMediaSetHash — determinism", () => {
  it("is order-independent (canonical MediaKey sort)", () => {
    const a = hashOf([row({ mediaKey: "a" }), row({ mediaKey: "b" })]);
    const b = hashOf([row({ mediaKey: "b" }), row({ mediaKey: "a" })]);
    expect(a).toBe(b);
  });

  it("ignores signed query AND host/path changes on the URL (URL never hashed)", () => {
    const a = hashOf([row({ mediaUrl: "https://api.cotality.com/x.jpg?sig=aaa" })]);
    const b = hashOf([row({ mediaUrl: "https://cdn.other.example/DIFFERENT/path.jpg?sig=zzz" })]);
    expect(a).toBe(b);
  });

  it("changes on MediaKey / order / preferred / category / type / revision-ts", () => {
    const base = hashOf([row()]);
    const patches: Partial<MediaSetItem>[] = [
      { mediaKey: "m2" },
      { order: 2 },
      { preferredPhotoYN: false },
      { mediaCategory: "Floorplan" },
      { mediaType: "video" },
      { modificationTs: new Date("2026-02-02T00:00:00Z") },
      { mediaModificationTs: new Date("2026-03-03T00:00:00Z") },
    ];
    for (const patch of patches) {
      expect(hashOf([row(patch)])).not.toBe(base);
    }
  });

  it("empty valid set → versioned sentinel", () => {
    expect(hashOf([])).toBe(EMPTY_MEDIA_SET_HASH);
  });

  it("is stable across repeated calls (no time/randomness)", () => {
    expect(hashOf([row(), row({ mediaKey: "m2" })])).toBe(hashOf([row(), row({ mediaKey: "m2" })]));
  });
});

describe("stableMediaSetHash — invalidity fails closed (no hash checkpoint)", () => {
  it("duplicate MediaKey → invalid", () => {
    const r = stableMediaSetHash([row({ mediaKey: "d" }), row({ mediaKey: "d" })], "L1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("duplicate_media_key");
  });

  it("missing MediaKey → invalid", () => {
    const r = stableMediaSetHash([row({ mediaKey: null })], "L1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("missing_media_key");
  });

  it("missing MediaURL → invalid", () => {
    const r = stableMediaSetHash([row({ mediaUrl: null })], "L1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("missing_media_url");
  });

  it("malformed revision timestamp → invalid", () => {
    const r = stableMediaSetHash([row({ modificationTs: "not-a-date" })], "L1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("malformed_field");
  });
});

describe("validateMediaSourceSet", () => {
  it("ResourceRecordKey inconsistent with the listing is unsafe", () => {
    const v = validateMediaSourceSet([row({ resourceRecordKey: "OTHER" })], "L1");
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("resource_record_key_mismatch");
  });

  it("a clean single-page set is safe", () => {
    const v = validateMediaSourceSet([row(), row({ mediaKey: "m2", order: 2 })], "L1");
    expect(v.safe).toBe(true);
    expect(v.reasons).toEqual([]);
  });
});

// ── Property-based invariants (fast-check under Jest) — spec §12.4 ──────────
const LISTING = "L1";
const dateArb = fc
  .integer({ min: Date.parse("2001-01-01"), max: Date.parse("2034-01-01") })
  .map((ms) => new Date(ms));
const keyArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/** A VALID complete feed set: unique non-empty MediaKeys, consistent RRK, non-empty URL, valid dates. */
const validSetArb = fc.uniqueArray(keyArb, { maxLength: 10 }).chain((keys) =>
  keys.length === 0
    ? fc.constant([] as MediaSetItem[])
    : fc.tuple(
        ...keys.map((k) =>
          fc
            .record({
              mediaType: fc.option(fc.constantFrom("photo", "video", "floorplan"), { nil: null }),
              mediaCategory: fc.option(fc.constantFrom("Photo", "Floorplan", "Video"), { nil: null }),
              mediaClassification: fc.option(fc.constantFrom("Primary", "Secondary"), { nil: null }),
              order: fc.integer({ min: 0, max: 300 }),
              preferredPhotoYN: fc.boolean(),
              mediaModificationTs: dateArb,
              modificationTs: dateArb,
            })
            .map(
              (r): MediaSetItem => ({
                mediaKey: k,
                resourceRecordKey: LISTING,
                mediaUrl: `https://api.cotality.com/${encodeURIComponent(k)}.jpg?sig=x`,
                ...r,
              }),
            ),
        ),
      ),
);

/** Deterministic (no Math.random) Fisher–Yates using a generated seed. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const mustHash = (items: MediaSetItem[]): string => {
  const r = stableMediaSetHash(items, LISTING);
  if (!r.ok) throw new Error(`expected valid: ${r.reasons.join(",")}`);
  return r.hash;
};

describe("stableMediaSetHash — properties (fast-check)", () => {
  it("row order never changes the hash", () => {
    fc.assert(
      fc.property(validSetArb, fc.integer(), (items, seed) => {
        return mustHash(items) === mustHash(seededShuffle(items, seed));
      }),
      { numRuns: 300 },
    );
  });

  it("any URL change (host/path/query) never changes the hash", () => {
    fc.assert(
      fc.property(validSetArb, fc.integer(), (items, seed) => {
        const variant = items.map((it, i) => ({
          ...it,
          mediaUrl: `https://cdn${(seed >>> 0) % 5}.example/${i}/${seed}.jpg?sig=${seed + i}`,
        }));
        return mustHash(items) === mustHash(variant);
      }),
      { numRuns: 300 },
    );
  });

  it("hashing is idempotent (no time/randomness)", () => {
    fc.assert(
      fc.property(validSetArb, (items) => mustHash(items) === mustHash(items)),
      { numRuns: 200 },
    );
  });

  it("a duplicate MediaKey ALWAYS invalidates the set", () => {
    fc.assert(
      fc.property(validSetArb.filter((s) => s.length > 0), (items) => {
        const dup = [...items, { ...items[0] }];
        const r = stableMediaSetHash(dup, LISTING);
        return r.ok === false && r.reasons.includes("duplicate_media_key");
      }),
      { numRuns: 200 },
    );
  });

  it("missing MediaKey or MediaURL ALWAYS invalidates the set", () => {
    fc.assert(
      fc.property(
        validSetArb.filter((s) => s.length > 0),
        fc.boolean(),
        (items, dropUrl) => {
          const broken = items.map((it, i) =>
            i === 0 ? { ...it, ...(dropUrl ? { mediaUrl: null } : { mediaKey: null }) } : it,
          );
          const r = stableMediaSetHash(broken, LISTING);
          return r.ok === false;
        },
      ),
      { numRuns: 200 },
    );
  });
});
