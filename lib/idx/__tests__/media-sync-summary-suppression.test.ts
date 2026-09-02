/**
 * Phase 3 write-suppression, surface C — Listing media-summary columns
 * (failing-first TDD, stacked on the #547 rotating-URL suppression).
 *
 * `updateListingMediaSummary()` previously performed an UNCONDITIONAL
 * `Listing.update()` on every call — one physical Listing write per synced
 * listing per run even when the 4 summary columns (`primary_photo_url`,
 * `primary_photo_r2_key`, `photo_count`, `photos_change_timestamp`) were
 * already identical. Contract proven here:
 *
 *   - stored summary identical → ZERO Listing.update calls (suppressed)
 *   - rotation-only primary_photo_url difference (same URL identity, rotated
 *     signature) → suppressed — the signed Trestle URL is NEVER material
 *   - hero change / photo_count change / photos_change_timestamp (source
 *     photo revision) change / r2_key (delivery-state) change → writes
 *   - listing row missing or unreadable → fail-closed (write proceeds)
 *   - unchanged batch → zero Listing.update calls across all listings
 */

const mockFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findMany: (args: unknown) => mockFindMany(args),
    },
    listing: {
      findUnique: (args: unknown) => mockListingFindUnique(args),
      update: (args: unknown) => mockListingUpdate(args),
    },
  },
}));

import {
  updateListingMediaSummary,
  newSummaryWriteCounters,
  isRotatingFeedSummaryUrl,
  type SummaryWriteCounters,
} from "../media-sync";

const PCT = new Date("2026-07-10T12:00:00.000Z");

function mediaRow(over: Record<string, unknown> = {}) {
  return {
    media_type: "Photo",
    status: "active",
    preferred_photo_yn: false,
    order: 0,
    media_url_original: "https://api.cotality.com/trestle/Media/abc/0.jpg?token=SIG-A",
    r2_key: "photos/L1/0.jpg",
    media_modification_ts: PCT,
    modification_ts: null,
    ...over,
  };
}

function storedSummary(over: Record<string, unknown> = {}) {
  return {
    primary_photo_url: "https://api.cotality.com/trestle/Media/abc/0.jpg?token=SIG-A",
    primary_photo_r2_key: "photos/L1/0.jpg",
    photo_count: 1,
    photos_change_timestamp: new Date(PCT.getTime()),
    ...over,
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockListingFindUnique.mockReset();
  mockListingUpdate.mockReset();
  mockListingUpdate.mockResolvedValue(undefined);
});

describe("updateListingMediaSummary — suppression of unchanged summaries", () => {
  it("stored summary identical → Listing.update is NOT called", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary());

    const counters = newSummaryWriteCounters();
    const summary = await updateListingMediaSummary("L1", { counters });

    expect(mockListingUpdate).not.toHaveBeenCalled();
    expect(summary.photo_count).toBe(1);
    expect(counters).toEqual<SummaryWriteCounters>({
      rows_checked: 1,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 1,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
      // E: storage-vs-public separation. A suppressed or hero/gallery write
      // emits no provenance-only count; the three new buckets are asserted
      // exhaustively so a future scope change cannot pass silently.
      rows_provenance_only_no_invalidation: 0,
      rows_public_gallery_change: 0,
      rows_public_hero_change: 0,
    });
  });

  it("rotation-only URL difference (same identity, rotated signature) → suppressed", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://api.cotality.com/trestle/Media/abc/0.jpg?token=SIG-B-ROTATED" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary());

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });

    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it("hero change (different media path) → writes", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({
        media_url_original: "https://api.cotality.com/trestle/Media/DIFFERENT/9.jpg?token=SIG-B",
        r2_key: "photos/L1/9.jpg",
      }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary());

    const counters = newSummaryWriteCounters();
    await updateListingMediaSummary("L1", { counters });

    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    expect(counters.rows_updated).toBe(1);
    expect(counters.rows_materially_changed).toBe(1);
  });

  it("photo_count change → writes", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow(),
      mediaRow({ order: 1, media_url_original: "https://api.cotality.com/trestle/Media/abc/1.jpg?t=S", r2_key: "photos/L1/1.jpg" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary()); // stored photo_count: 1

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("source photo revision (photos_change_timestamp) advance → writes", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_modification_ts: new Date("2026-07-12T00:00:00.000Z") }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary());

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("delivery-state change (hero r2_key appears) → writes", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary({ primary_photo_r2_key: null }));

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  // ── Correction 7: canonicalization is restricted to KNOWN rotating providers ──

  it("STABLE non-feed hero URL differing only by query (?v=2) → writes (query may be a real version id)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://cdn.example.com/photos/L1/hero.jpg?v=2" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(
      storedSummary({ primary_photo_url: "https://cdn.example.com/photos/L1/hero.jpg?v=1" }),
    );

    const counters = newSummaryWriteCounters();
    await updateListingMediaSummary("L1", { counters });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    expect(counters.rows_updated).toBe(1);
  });

  it("STABLE R2 hero URL change → writes (exact compare for non-feed URLs)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://media.mallan.nyc/photos/L1/0.jpg?rev=b" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(
      storedSummary({ primary_photo_url: "https://media.mallan.nyc/photos/L1/0.jpg?rev=a" }),
    );

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("identical STABLE non-feed hero URL → still suppressed (exact match)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://media.mallan.nyc/photos/L1/0.jpg?rev=a" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(
      storedSummary({ primary_photo_url: "https://media.mallan.nyc/photos/L1/0.jpg?rev=a" }),
    );

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it("stored feed URL vs computed STABLE URL (delivery/source switch) → writes (mixed = exact compare)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://media.mallan.nyc/photos/L1/0.jpg" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary()); // stored is the Cotality URL

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  // ── Maya re-review 2026-07-21: detection must be HOSTNAME-scoped ──
  // Substring matching over the whole URL misclassified stable URLs whose
  // PATH contains a provider-looking token or whose QUERY smuggles a
  // provider host. Only URL.hostname (exact / dot-boundary subdomain of the
  // live-evidenced provider domains) may trigger the query-insensitive
  // identity compare.

  it("stable host with 'trestle' in the PATH, ?v=1 vs ?v=2 → writes (path token is not a provider)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://cdn.example.com/photos/trestle-building.jpg?v=2" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(
      storedSummary({ primary_photo_url: "https://cdn.example.com/photos/trestle-building.jpg?v=1" }),
    );

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("provider host smuggled in the QUERY, &v=1 vs &v=2 → writes (query is not the hostname)", async () => {
    mockFindMany.mockResolvedValueOnce([
      mediaRow({ media_url_original: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=2" }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce(
      storedSummary({ primary_photo_url: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=1" }),
    );

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("isRotatingFeedSummaryUrl is hostname-scoped (live-evidenced providers only)", () => {
    // LIVE-OBSERVED host (2026-07-21 authenticated probes, #544 evidence).
    expect(isRotatingFeedSummaryUrl("https://api.cotality.com/trestle/Media/x.jpg?sig=A")).toBe(true);
    // DEFENSIVE legacy hosts (media-proxy allowlist; unobserved in live probes).
    expect(isRotatingFeedSummaryUrl("https://api-trestle.corelogic.com/x.jpg?sig=A")).toBe(true);
    expect(isRotatingFeedSummaryUrl("https://api-prod.corelogic.com/x.jpg?sig=A")).toBe(true);
    // Look-alike hosts, path tokens, query smuggling, malformed → NOT providers.
    expect(isRotatingFeedSummaryUrl("https://notcotality.com/x.jpg?sig=A")).toBe(false);
    expect(isRotatingFeedSummaryUrl("https://evilcorelogic.com/x.jpg?sig=A")).toBe(false);
    expect(isRotatingFeedSummaryUrl("https://cdn.example.com/photos/trestle-building.jpg?v=1")).toBe(false);
    expect(isRotatingFeedSummaryUrl("https://cdn.example.com/photo.jpg?redirect=api.cotality.com")).toBe(false);
    expect(isRotatingFeedSummaryUrl("not a url")).toBe(false);
  });

  it("legacy row (photo_count null) → fail-closed write", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary({ photo_count: null }));

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("listing row missing from the pre-read → fail-closed (update attempted as before)", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockResolvedValueOnce(null);

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("pre-read failure → fail-closed (update still attempted; suppression is optimization only)", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockRejectedValueOnce(new Error("read failed"));

    await updateListingMediaSummary("L1", { counters: newSummaryWriteCounters() });
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("unchanged batch of 3 listings → ZERO Listing.update calls, counters aggregate", async () => {
    const counters = newSummaryWriteCounters();
    for (const id of ["L1", "L2", "L3"]) {
      mockFindMany.mockResolvedValueOnce([mediaRow()]);
      mockListingFindUnique.mockResolvedValueOnce(storedSummary());
      await updateListingMediaSummary(id, { counters });
    }
    expect(mockListingUpdate).not.toHaveBeenCalled();
    expect(counters.rows_checked).toBe(3);
    expect(counters.rows_suppressed_unchanged).toBe(3);
    expect(counters.rows_updated).toBe(0);
  });

  it("without an options bag (legacy callers) behavior is identical — suppression still applies", async () => {
    mockFindMany.mockResolvedValueOnce([mediaRow()]);
    mockListingFindUnique.mockResolvedValueOnce(storedSummary());

    const summary = await updateListingMediaSummary("L1");
    expect(mockListingUpdate).not.toHaveBeenCalled();
    // Return shape unchanged — exactly the 4 summary fields.
    expect(summary).toEqual({
      primary_photo_url: "https://api.cotality.com/trestle/Media/abc/0.jpg?token=SIG-A",
      primary_photo_r2_key: "photos/L1/0.jpg",
      photo_count: 1,
      photos_change_timestamp: PCT,
      primary_photo_media_key: null,
    });
  });
});
