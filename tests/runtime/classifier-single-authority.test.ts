/**
 * Unified system — Phase 1, Task 4: single strict classifier authority (guard).
 *
 * The new pipeline uses ONE strict classifier (lib/media/media-classifier.ts).
 * The legacy classifyTrestleMediaCategory (media-sync-service.ts) stays behavior-
 * unchanged for the still-active legacy pipeline and is marked @deprecated; it is
 * removed at the flag cutover (activation). This guard prevents a second strict
 * classifier from being introduced and pins the strict contract. Source-scan +
 * behavior; no DB/network.
 */
import * as fs from "fs";
import * as path from "path";
import { classifyMedia } from "@/lib/media/media-classifier";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("single strict classifier authority", () => {
  it("the new spine modules import the canonical type from media-classifier (not a second classifier)", () => {
    for (const f of ["lib/media/media-identity.ts", "lib/media/hero-resolver.ts"]) {
      const src = read(f);
      expect(src).toContain('from "./media-classifier"');
    }
  });

  it("the strict classifier NEVER returns Photo for a non-photo Cotality category", () => {
    for (const nonPhoto of ["Document", "Disclosure", "Map", "Survey", "AgentPhoto", "OfficePhoto", "OfficeLogo", "Other", "FloorPlan", "Video", "AerialView", "BrandedVirtualTour", "UnbrandedVirtualTour"]) {
      expect(classifyMedia({ mediaCategory: nonPhoto })).not.toBe("Photo");
    }
  });

  it("the legacy classifier is marked @deprecated and points to the strict one", () => {
    const legacy = read("lib/media/media-sync-service.ts");
    expect(legacy).toContain("@deprecated");
    expect(legacy).toContain("classifyMedia");
  });
});
