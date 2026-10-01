import { readFileSync } from "fs";
import { resolve } from "path";
import { B26_MEDIA } from "../trestle-mapper";

/**
 * Live-parity guard for the B26 media field group.
 *
 * Every name in B26_MEDIA must correspond to a real field on a live Cotality/Trestle
 * resource (verified against the committed live contract data/cotality-enums.live.json).
 *
 * This catches PHANTOM media fields — names that look plausible (VideoURL,
 * FloorPlanURL, MatterportURL, InteractiveFloorPlanURL, *SocialMediaURL) but do
 * not exist on any live resource. The real model is:
 *   - Property carries counts/timestamps + VirtualTourURL* (tours/3D).
 *   - The Media resource carries item URLs (MediaURL/OriginalMediaUrl), classified
 *     by MediaCategory (Photo / Floor Plan / Video / Virtual Tour).
 */
describe("B26_MEDIA live-parity (no phantom Cotality media fields)", () => {
  // Every entity, field, enum and enum-member name in the committed live contract
  // (generated from live $metadata by `npm run cotality:pull`).
  const live = JSON.parse(
    readFileSync(resolve(__dirname, "../../../data/cotality-enums.live.json"), "utf-8")
  );
  const liveNames = new Set<string>([
    ...Object.keys(live.entities),
    ...Object.values(live.entities as Record<string, Record<string, string>>).flatMap((e) => Object.keys(e)),
    ...Object.keys(live.enums),
    ...Object.values(live.enums as Record<string, string[]>).flat(),
  ]);

  // Names that are intentionally internal/derived and NOT live $metadata fields.
  // (Empty by design — all legitimate B26 entries resolve to a live name,
  // including `Media` (also an entity name) and the Media-resource `MediaURL`.)
  const INTERNAL_ALLOWLIST = new Set<string>([]);

  it("live Cotality contract parsed and non-empty", () => {
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it("every B26_MEDIA field exists on a live Cotality resource", () => {
    const phantom = B26_MEDIA.filter(
      (f) => !liveNames.has(f) && !INTERNAL_ALLOWLIST.has(f)
    );
    expect(phantom).toEqual([]);
  });
});
