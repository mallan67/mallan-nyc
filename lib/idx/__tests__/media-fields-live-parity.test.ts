import { readFileSync } from "fs";
import { resolve } from "path";
import { B26_MEDIA } from "../trestle-mapper";
import { allFieldNames } from '@/lib/cotality/live-contract';

/**
 * Live-parity guard for the B26 media field group.
 *
 * Every name in B26_MEDIA must correspond to a real field on a live Cotality/Trestle
 * resource (verified against the captured $metadata in artifacts/metadata.xml).
 *
 * This catches PHANTOM media fields — names that look plausible (VideoURL,
 * FloorPlanURL, MatterportURL, InteractiveFloorPlanURL, *SocialMediaURL) but do
 * not exist on any live resource. The real model is:
 *   - Property carries counts/timestamps + VirtualTourURL* (tours/3D).
 *   - The Media resource carries item URLs (MediaURL/OriginalMediaUrl), classified
 *     by MediaCategory (Photo / Floor Plan / Video / Virtual Tour).
 */
describe("B26_MEDIA live-parity (no phantom Cotality media fields)", () => {
  const liveNames = allFieldNames();

  // Names that are intentionally internal/derived and NOT live $metadata fields.
  // (Empty by design — all legitimate B26 entries resolve to a live name,
  // including the `Media` navigation property and the Media-resource `MediaURL`.)
  const INTERNAL_ALLOWLIST = new Set<string>([]);

  it("the Cotality contract is loaded and non-empty", () => {
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it("every B26_MEDIA field exists on a live Cotality resource", () => {
    const phantom = B26_MEDIA.filter(
      (f) => !liveNames.has(f) && !INTERNAL_ALLOWLIST.has(f)
    );
    expect(phantom).toEqual([]);
  });
});
