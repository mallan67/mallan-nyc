import { contractNames } from "../../../tests/runtime/cotality-contract-facts";
import { B26_MEDIA } from "../trestle-mapper";

/**
 * Live-parity guard for the B26 media field group.
 *
 * Every name in B26_MEDIA must correspond to a real field on a live Cotality/Trestle
 * resource (verified against the committed live Cotality contract, data/cotality-contract/**).
 *
 * This catches PHANTOM media fields — names that look plausible (VideoURL,
 * FloorPlanURL, MatterportURL, InteractiveFloorPlanURL, *SocialMediaURL) but do
 * not exist on any live resource. The real model is:
 *   - Property carries counts/timestamps + VirtualTourURL* (tours/3D).
 *   - The Media resource carries item URLs (MediaURL/OriginalMediaUrl), classified
 *     by MediaCategory (Photo / Floor Plan / Video / Virtual Tour).
 */
describe("B26_MEDIA live-parity (no phantom Cotality media fields)", () => {
  // Every resource / field / navigation / vocabulary name the live Cotality contract declares.
  const liveNames = contractNames();

  // Names that are intentionally internal/derived and NOT live $metadata fields.
  // (Empty by design — all legitimate B26 entries resolve to a live name,
  // including the `Media` navigation property and the Media-resource `MediaURL`.)
  const INTERNAL_ALLOWLIST = new Set<string>([]);

  it("the committed live contract parsed and non-empty", () => {
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it("every B26_MEDIA field exists on a live Cotality resource", () => {
    const phantom = B26_MEDIA.filter(
      (f) => !liveNames.has(f) && !INTERNAL_ALLOWLIST.has(f)
    );
    expect(phantom).toEqual([]);
  });
});
