/**
 * E — THE PUBLIC MEDIA CHANGE CONTRACT.
 *
 * Three states that the old code collapsed into one:
 *
 *   SOURCE TRIGGER            `Property.PhotosChangeTimestamp` moved.
 *   PROVENANCE/STORAGE CHANGE our stored cursor/summary must advance.
 *   PUBLIC MATERIAL CHANGE    a consumer-visible listing actually changed.
 *
 * ── WHY THE FIRST TWO ARE NOT THE THIRD (live-proven, 2026-08-17) ───────────
 *
 * 1. `PhotosChangeTimestamp` moves in PROVIDER BATCHES. Read-only probe:
 *      RLS20109728 PhotosCount=15 PCT=17:08:55.193
 *      RLS20109727 PhotosCount=15 PCT=17:08:55.193
 *      RLS20109725 PhotosCount=18 PCT=16:51:53.583
 *      RLS20109724 PhotosCount= 8 PCT=16:51:53.583
 *    Different listings, different photo counts, byte-identical stamp. It is a
 *    provider processing clock — it says WHAT TO INSPECT, never that a
 *    consumer-visible listing changed. No public reader reads the column.
 *
 * 2. `MediaURL` ROTATES ON EVERY READ. Same MediaKey, three reads:
 *      #1 .../MTc4Njk4NjUwOA/hmaorq5o...   (epoch 1786986508)
 *      #2 .../MTc4Njk4NjUxMg/0cyqL-Ih...   (epoch 1786986512, +3s)
 *      #3 identical to #2 under a DIFFERENT token
 *    ModificationTimestamp, MediaModificationTimestamp, RecordSignature and
 *    MediaObjectID were unchanged throughout. Rotation is keyed on WALL-CLOCK
 *    and the changing component is in the URL **path** — there is no query
 *    string on this feed. A rotated locator is never a public change.
 *
 * The contract under test: storage may advance while the public cache is told
 * NOTHING, and the public scope must follow what public readers actually read.
 */

const mockFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: { findMany: (a: unknown) => mockFindMany(a) },
    listing: {
      findUnique: (a: unknown) => mockListingFindUnique(a),
      update: (a: unknown) => mockListingUpdate(a),
    },
  },
}));

// Capture the EXACT tag set emitted, so "zero tags" is proven rather than assumed.
const emittedTags: string[][] = [];
jest.mock("@/lib/cache/public-cache", () => {
  const actual = jest.requireActual("@/lib/cache/public-cache");
  return {
    ...actual,
    safeRevalidateTags: (tags: string[]) => {
      emittedTags.push(tags);
    },
  };
});

import * as fs from "node:fs";
import * as path from "node:path";
import {
  updateListingMediaSummary,
  decideListingMediaSummaryChange,
  newSummaryWriteCounters,
  type StoredListingMediaSummary,
  type ListingMediaSummary,
} from "../media-sync";

const ADDRESS = { StreetNumber: "400", StreetName: "East 90th Street", PostalCode: "10128" };
const T1 = new Date("2026-08-01T00:00:00.000Z");
const T2 = new Date("2026-08-17T17:08:55.193Z");

const HERO_A = "https://api.cotality.com/trestle/Media/Property/Photo-Jpeg/1/1/AAA/MTc4Njk4NjUwOA/sigA";
// Same asset, rotated locator: only the epoch + signature path segments differ.
const HERO_A_ROTATED = "https://api.cotality.com/trestle/Media/Property/Photo-Jpeg/1/1/AAA/MTc4Njk4NjUxMg/sigB";
const HERO_B = "https://api.cotality.com/trestle/Media/Property/Photo-Jpeg/1/1/BBB/MTc4Njk4NjUxMg/sigC";

const stored = (o: Partial<StoredListingMediaSummary> = {}): StoredListingMediaSummary =>
  ({
    primary_photo_url: HERO_A,
    primary_photo_r2_key: null,
    photo_count: 8,
    photos_change_timestamp: T1,
    address: ADDRESS,
    ...o,
  }) as StoredListingMediaSummary;

const computed = (o: Partial<ListingMediaSummary> = {}): ListingMediaSummary =>
  ({
    primary_photo_url: HERO_A,
    primary_photo_r2_key: null,
    photo_count: 8,
    photos_change_timestamp: T1,
    ...o,
  }) as ListingMediaSummary;

beforeEach(() => {
  jest.clearAllMocks();
  emittedTags.length = 0;
});

describe("classifier — storage equality is not public-material equality", () => {
  it("timestamp-only movement: storage advances, public change is provenance-only", () => {
    const d = decideListingMediaSummaryChange(stored(), computed({ photos_change_timestamp: T2 }));
    expect(d.storageChanged).toBe(true); // the sync cursor MUST persist
    expect(d.publicChange).toBe("provenance-only"); // ...and tell the public nothing
  });

  it("locator rotation on the SAME asset is not a public change", () => {
    const d = decideListingMediaSummaryChange(
      stored(),
      computed({ primary_photo_url: HERO_A_ROTATED, photos_change_timestamp: T2 }),
    );
    expect(d.publicChange).toBe("provenance-only");
  });

  it("a genuine hero replacement is public-hero", () => {
    const d = decideListingMediaSummaryChange(stored(), computed({ primary_photo_url: HERO_B }));
    expect(d.publicChange).toBe("public-hero");
  });

  it("R2 delivery key becoming durable is public-hero", () => {
    const d = decideListingMediaSummaryChange(stored(), computed({ primary_photo_r2_key: "r2/abc.jpg" }));
    expect(d.publicChange).toBe("public-hero");
  });

  it("photo count change with an unchanged hero is public-gallery", () => {
    const d = decideListingMediaSummaryChange(stored(), computed({ photo_count: 9 }));
    expect(d.publicChange).toBe("public-gallery");
  });

  it("a reorder with IDENTICAL hero and count is still public-gallery via reconciliation evidence", () => {
    // The false-negative surface: no comparison of the four summary columns can
    // see a non-hero reorder. The reconciliation must say so explicitly.
    const d = decideListingMediaSummaryChange(stored(), computed(), { galleryMutated: true });
    expect(d.publicChange).toBe("public-gallery");
    expect(d.storageChanged).toBe(true);
  });

  it("nothing moved at all: no storage write, no tags", () => {
    const d = decideListingMediaSummaryChange(stored(), computed());
    expect(d).toEqual({ storageChanged: false, publicChange: "none" });
  });

  it("missing stored row fails CLOSED to the widest scope", () => {
    const d = decideListingMediaSummaryChange(null, computed());
    expect(d).toEqual({ storageChanged: true, publicChange: "public-hero" });
  });
});

describe("sync-side evidence — what counts as a gallery mutation", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "media-sync.ts"),
    "utf8",
  );

  it("the Cotality sync passes REAL evidence instead of letting the summary guess", () => {
    expect(src).toContain("mediaChangeEvidence: { galleryMutated }");
  });

  it("EXCLUDES deliveryUrlRefreshed — the locator-rotation bucket", () => {
    // This is the single most important exclusion in the whole fix. Locator
    // refreshes are proven material-unchanged and occur on ~100% of rows every
    // cycle (rotation is universal: 0/32 sampled rows returned an unchanged
    // URL). Counting them as a gallery mutation would re-fire public
    // invalidation on every listing on every sync — exactly the amplification
    // being removed.
    // Anchor on the SYNC-SIDE expression. `const galleryMutated =` also occurs
    // inside `decideListingMediaSummaryChange` as a local, and that earlier
    // match would make this assertion test the wrong code.
    const anchor = src.indexOf("upsertResult.inserted > 0");
    expect(anchor).toBeGreaterThan(-1);
    const evidence = src.slice(anchor - 60, anchor + 200);

    expect(evidence).toContain("upsertResult.inserted");
    expect(evidence).toContain("upsertResult.updatedChanged");
    expect(evidence).toContain("upsertResult.tombstoned");
    expect(evidence).not.toContain("deliveryUrlRefreshed");
  });

  it("R2 hero propagation declares NO gallery mutation", () => {
    // The drain writes r2_key only; a real hero move is caught by the r2-key
    // term in the classifier, so asserting a gallery mutation would only widen
    // the invalidation scope for nothing.
    expect(src).toContain("mediaChangeEvidence: { galleryMutated: false }");
  });
});

describe("writer — emitted cache tags follow the classification", () => {
  const runWith = async (storedRow: StoredListingMediaSummary, mediaRows: unknown[]) => {
    mockFindMany.mockResolvedValueOnce(mediaRows);
    mockListingFindUnique.mockResolvedValueOnce(storedRow);
    const counters = newSummaryWriteCounters();
    await updateListingMediaSummary("RLS20109728", { counters });
    return counters;
  };

  // One active photo whose URL is HERO_A -> computed hero == HERO_A, count 1.
  // `computeListingMediaSummary` derives photos_change_timestamp from the MAX of
  // media_modification_ts / modification_ts across active rows — NOT from
  // photos_change_ts_snapshot. So the provider clock enters here.
  const oneActivePhoto = [
    {
      media_type: "Photo",
      // `classifyMediaItem` also inspects the URL, and a `/DOCUMENT-*/` path
      // segment classifies as a FLOORPLAN regardless of category — which drops
      // the row out of the photo set and makes the summary look empty. The
      // fixture URLs therefore use a photo-shaped path, and category is set
      // explicitly so the classification is not URL-dependent.
      media_category: "Photo",
      media_classification: "PHOTO",
      status: "active",
      preferred_photo_yn: false,
      order: 1,
      media_url_original: HERO_A,
      media_url_cached: null,
      r2_key: null,
      media_modification_ts: T2,
      modification_ts: T2,
    },
  ];

  it("PROVENANCE-ONLY: writes the row and emits ZERO public cache tags", async () => {
    // stored matches the computed public output exactly; only the source
    // timestamp advances (T1 -> T2). This is the write-amplification case.
    const counters = await runWith(
      stored({ photo_count: 1, photos_change_timestamp: T1 }),
      oneActivePhoto,
    );

    expect(mockListingUpdate).toHaveBeenCalledTimes(1); // storage advanced
    expect(emittedTags).toHaveLength(0); // and the public cache was told NOTHING
    expect(counters.rows_provenance_only_no_invalidation).toBe(1);
    expect(counters.rows_public_gallery_change).toBe(0);
    expect(counters.rows_public_hero_change).toBe(0);
  });

  it("PUBLIC-HERO: emits the listing tag AND building/manifest tags", async () => {
    const counters = await runWith(
      stored({ primary_photo_url: HERO_B, photo_count: 1, photos_change_timestamp: T2 }),
      oneActivePhoto,
    );

    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    expect(emittedTags).toHaveLength(1);
    const tags = emittedTags[0];
    expect(tags).toContain("listing:RLS20109728");
    // The building/manifest layers read hero state, so they must expire too.
    expect(tags.length).toBeGreaterThan(1);
    expect(counters.rows_public_hero_change).toBe(1);
  });

  it("PUBLIC-GALLERY: emits the listing tag ONLY — no building, no manifest shard", async () => {
    // Hero identical, count moves 5 -> 1. The manifest projection reads only
    // hero state, so expiring building/manifest here would be pure churn.
    const counters = await runWith(
      stored({ photo_count: 5, photos_change_timestamp: T2 }),
      oneActivePhoto,
    );

    expect(emittedTags).toHaveLength(1);
    expect(emittedTags[0]).toEqual(["listing:RLS20109728"]);
    expect(counters.rows_public_gallery_change).toBe(1);
    expect(counters.rows_public_hero_change).toBe(0);
  });

  it("NO CHANGE: no write and no tags", async () => {
    const counters = await runWith(
      stored({ photo_count: 1, photos_change_timestamp: T2 }),
      oneActivePhoto,
    );
    expect(mockListingUpdate).not.toHaveBeenCalled();
    expect(emittedTags).toHaveLength(0);
    expect(counters.rows_suppressed_unchanged).toBe(1);
  });
});
