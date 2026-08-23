/**
 * P1C3 (ledger M3) — media classification on the two remaining broken sites
 * (behavioral RED→GREEN).
 *
 * Trestle's MediaCategory enum serializes the MEMBER NAME — 'FloorPlan',
 * 'UnbrandedVirtualTour', 'BrandedVirtualTour' (no spaces; verified against
 * artifacts/metadata.xml:11545-11605). The old with-space checks
 * (`cat.includes('floor plan')`, `cat.includes('virtual tour')`) never
 * matched, so floorplans and virtual tours classified as 'Photo' and could
 * become the hero / leak onto agent cards.
 */

import { mapCotalityToInternal } from "../mapping";
import { mapAgentCardMedia } from "../agent-card-media";

function rawListing(media: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    ListingKey: "1159000001",
    ListingId: "RLS20012345",
    StandardStatus: "Active",
    PropertyType: "Residential",
    ListPrice: 1000000,
    UnparsedAddress: "333 East 46th Street",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10017",
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: media,
  };
}

describe("P1C3 — mapCotalityToInternal media classification (lib/idx/mapping.ts)", () => {
  it("classifies feed-form 'FloorPlan' (no space) as FloorPlan, sorted last — never the hero", () => {
    const listing = mapCotalityToInternal(
      rawListing([
        { MediaURL: "https://cdn/fp.jpg", MediaCategory: "FloorPlan", Order: 0 },
        { MediaURL: "https://cdn/photo.jpg", MediaCategory: "Photo", Order: 1 },
      ]),
    );
    expect(listing).not.toBeNull();
    const media = listing!.media!;
    expect(media[0].url).toBe("https://cdn/photo.jpg");
    expect(media[0].mediaType).toBe("Photo");
    expect(media[1].mediaType).toBe("FloorPlan");
  });

  it("classifies 'UnbrandedVirtualTour' / 'BrandedVirtualTour' as VirtualTour (not Photo)", () => {
    const listing = mapCotalityToInternal(
      rawListing([
        { MediaURL: "https://cdn/tour1.mp4", MediaCategory: "UnbrandedVirtualTour", Order: 0 },
        { MediaURL: "https://cdn/tour2.mp4", MediaCategory: "BrandedVirtualTour", Order: 1 },
      ]),
    );
    const types = listing!.media!.map((m) => m.mediaType);
    expect(types).toEqual(["VirtualTour", "VirtualTour"]);
  });

  it("retains the ShortDescription floor-plan heuristic (classifier is category-only)", () => {
    const listing = mapCotalityToInternal(
      rawListing([
        { MediaURL: "https://cdn/x.jpg", MediaCategory: "Photo", ShortDescription: "Floor plan - 2BR", Order: 0 },
      ]),
    );
    expect(listing!.media![0].mediaType).toBe("FloorPlan");
  });

  it("preferred photo keeps the -1 order sentinel and photos-first sort is unchanged", () => {
    const listing = mapCotalityToInternal(
      rawListing([
        { MediaURL: "https://cdn/b.jpg", MediaCategory: "Photo", Order: 5 },
        { MediaURL: "https://cdn/a.jpg", MediaCategory: "Photo", Order: 9, PreferredPhotoYN: true },
      ]),
    );
    expect(listing!.media![0].url).toBe("https://cdn/a.jpg");
    expect(listing!.media![0].order).toBe(-1);
  });
});

describe("P1C3 — mapAgentCardMedia (agent cards live batch)", () => {
  const REC = (over: Record<string, unknown>) => ({
    ResourceRecordKey: "1159000001",
    MediaURL: "https://cdn/x.jpg",
    MediaCategory: "Photo",
    Order: 0,
    ...over,
  });

  it("excludes feed-form 'FloorPlan' records from cards", () => {
    const byKey = mapAgentCardMedia([REC({ MediaCategory: "FloorPlan", MediaURL: "https://cdn/fp.jpg" }), REC({})]);
    const items = byKey.get("1159000001")!;
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://cdn/x.jpg");
  });

  it("excludes Videos and VirtualTours from cards (no more masquerading as photos)", () => {
    const byKey = mapAgentCardMedia([
      REC({ MediaCategory: "Video", MediaURL: "https://cdn/v.mp4" }),
      REC({ MediaCategory: "UnbrandedVirtualTour", MediaURL: "https://cdn/t.mp4" }),
    ]);
    expect(byKey.size).toBe(0);
  });

  it("keeps Photos with classifier-derived mediaType and the preferred -1 sentinel", () => {
    const byKey = mapAgentCardMedia([REC({ PreferredPhotoYN: true, Order: 7 })]);
    const items = byKey.get("1159000001")!;
    expect(items[0]).toEqual({ url: "https://cdn/x.jpg", mediaType: "Photo", order: -1 });
  });

  it("Codex #389 structural lock: the batch query carries x10 headroom for client-side discards", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const src = fs.readFileSync("app/api/agents/[slug]/listings/route.ts", "utf8");
    // Codex #393: clamped to Trestle's documented 500-row max $top —
    // an over-limit page is rejected and the fail-soft return would
    // placeholder the WHOLE batch.
    expect(src).toContain("Math.min(needsPhotos.length * 10, 500)");
    // The server-side MediaCategory $filter stays OUT until live-proven
    // (Class B, probe Q3) — match anywhere in CODE (comment lines excluded;
    // gate finding F1: the same-line-only regex was evadable via the
    // mediaFilter template literal).
    const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly).not.toMatch(/MediaCategory eq/);
  });
});
