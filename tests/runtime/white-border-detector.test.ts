/// <reference types="jest" />
/**
 * Detect-then-scale: unit tests for the white-border detector
 * (2026-05-16).
 *
 * Two layers:
 *
 *   1. Synthetic ImageData fed into the pure detector
 *      `detectWhiteBorderFromImageData`. Pinning the decision logic
 *      and false-positive guards.
 *
 *   2. Source-regex assertions that pin where the opt-in prop
 *      `autoCropWhiteBorder` is enabled (SearchListingCard's three
 *      variants) and where it is intentionally NOT enabled by default
 *      (IDXImage default, FeaturedListings until proven affected).
 *
 * Why source-regex and not full DOM tests: IDXImage's onLoad-driven
 * canvas work requires a real browser environment. The behavior side
 * is covered by `tests/e2e/search-card-image-fit.spec.ts`; this file
 * pins the wiring at the source level so a future refactor that
 * silently drops the prop is caught at jest time, not at e2e time.
 */

import {
  WHITE_BORDER_THRESHOLDS,
  detectWhiteBorderFromImageData,
  computeAdaptiveCropScale,
  type BorderDetectionResult,
} from '@/lib/media/white-border-detector';
import { readFileSync } from 'fs';
import * as path from 'path';

// jsdom's Jest environment does not expose the browser-native
// `ImageData` constructor. The detector only reads `width`, `height`,
// and `data` (Uint8ClampedArray) — so a structural duck-type is
// sufficient for unit testing. Browser code paths still use the real
// constructor; this shim is test-only.
type ImageDataLike = { width: number; height: number; data: Uint8ClampedArray };
function mkImageData(w: number, h: number, data: Uint8ClampedArray): ImageDataLike {
  return { width: w, height: h, data };
}

/**
 * Construct a synthetic ImageData of size w×h with a uniform RGB fill,
 * then optionally paint a border block in white.
 *
 * `borderPx` painted from each edge: e.g. `{ top: 10, bottom: 10 }`
 * draws 10 rows of white at the top and bottom, leaving left/right
 * untouched (still whatever the base fill was).
 *
 * `inner` fill applied to the central region (everything not part of
 * a border block). Default mid-gray.
 */
function makeImageData(
  w: number,
  h: number,
  options: {
    borderPx?: { top?: number; bottom?: number; left?: number; right?: number };
    inner?: [number, number, number]; // RGB
    border?: [number, number, number]; // RGB, default 255/255/255
  } = {},
): ImageData {
  const { borderPx = {}, inner = [80, 80, 80], border = [255, 255, 255] } = options;
  const pixels = new Uint8ClampedArray(w * h * 4);
  const bt = borderPx.top ?? 0;
  const bb = borderPx.bottom ?? 0;
  const bl = borderPx.left ?? 0;
  const br = borderPx.right ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inBorder =
        y < bt || y >= h - bb || x < bl || x >= w - br;
      const [r, g, b] = inBorder ? border : inner;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255; // fully opaque
    }
  }
  // jsdom doesn't expose the ImageData constructor in this Jest env.
  // Return a structural duck (width/height/data) cast to ImageData —
  // the detector reads only these three properties.
  return mkImageData(w, h, pixels) as unknown as ImageData;
}

describe('detectWhiteBorderFromImageData — synthetic fixtures', () => {
  it('detects a thick 4-sided border (the worst-case 401 WEST #6 shape)', () => {
    // 160×90 simulates the downsampled canvas IDXImage feeds in.
    // 401 WEST #6 had ~140 px top/bottom / ~200 px left/right on a
    // 1920×1080 source — that's ~13% / ~21% / ~13% / ~21% in
    // proportional terms. Scaled to 160×90 ≈ ~12 px top/bottom and
    // ~33 px left/right.
    const data = makeImageData(160, 90, {
      borderPx: { top: 12, bottom: 12, left: 33, right: 33 },
    });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(true);
    expect(result.ratios.top).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
    expect(result.ratios.bottom).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
    expect(result.ratios.left).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
    expect(result.ratios.right).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
  });

  it('detects a horizontal-only letterbox (left+right opposite borders, 401 WEST PH shape)', () => {
    // 174 px / 1920 = 9.06%. On a 160×90 downsample that's ~14 px.
    const data = makeImageData(160, 90, {
      borderPx: { left: 14, right: 14 },
    });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(true);
    expect(result.ratios.left).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
    expect(result.ratios.right).toBeGreaterThan(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold);
  });

  it('does NOT detect a clean photo (15 W 68TH shape — uniform interior, no border)', () => {
    const data = makeImageData(160, 90, { inner: [110, 80, 60] });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(false);
  });

  it('does NOT detect a single bright edge (window in a corner)', () => {
    // Only top is bright. Only ONE edge above threshold. The opposite-
    // edges + min-count rules combined require either two OPPOSITE
    // edges or 3+ edges total.
    const data = makeImageData(160, 90, { borderPx: { top: 12 } });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(false);
    expect(result.reason).toMatch(/not-enough-bordered-edges|only-adjacent-bordered-edges/);
  });

  it('does NOT detect a bright interior with no continuous border (false-positive guard)', () => {
    // The entire image is near-white but none of the edges qualify
    // because there is no DARK content anywhere — the center sample
    // is also white, which is the guard's trip wire.
    const data = makeImageData(160, 90, { inner: [252, 252, 252], border: [255, 255, 255] });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(false);
    // Center-too-white path is the expected reason for this fixture.
    expect(result.reason).toContain('center-too-white');
  });

  it('does NOT detect a warm-tinted edge (yellow wall, RGB spread > maxChannelSpread)', () => {
    // Top "border" is warm beige (255, 240, 200). Channel spread is
    // 55 — far above maxChannelSpread (12). Should NOT count as
    // bordered even though R is above rgbMin.
    const data = makeImageData(160, 90, {
      borderPx: { top: 12, bottom: 12 },
      border: [255, 240, 200],
    });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(false);
  });

  it('returns hasBorder=false on empty/zero-dim ImageData', () => {
    // 1×1 image — too small for any band sample, must return false.
    const data = mkImageData(1, 1, new Uint8ClampedArray([0, 0, 0, 255]));
    const result = detectWhiteBorderFromImageData(data as unknown as ImageData);
    expect(result.hasBorder).toBe(false);
  });

  it('detects three-edge T+L+R borders (poster-style upload, 3 of 4 edges qualifying)', () => {
    // 3 of 4 edges. Opposite-edges check fails (top alone, no bottom),
    // but the borderedEdges>=3 fallback catches it.
    const data = makeImageData(160, 90, { borderPx: { top: 12, left: 14, right: 14 } });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(true);
  });

  it('center-white-max-ratio threshold is named + reachable for tuning', () => {
    // Defensive — the test fails if anyone removes the named constant
    // or drops it below the value Maya approved (>= 0.5 so it still
    // distinguishes "white interior" from "white canvas border").
    expect(WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio).toBeGreaterThanOrEqual(0.5);
    expect(WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio).toBeLessThanOrEqual(0.9);
  });
});

describe('detector public-API safety', () => {
  it('exports all four thresholds Maya asked for', () => {
    expect(WHITE_BORDER_THRESHOLDS.rgbMin).toBeGreaterThanOrEqual(240);
    expect(WHITE_BORDER_THRESHOLDS.edgeBandPct).toBeGreaterThan(0);
    expect(WHITE_BORDER_THRESHOLDS.whiteRatioThreshold).toBeGreaterThan(0.5);
    expect(WHITE_BORDER_THRESHOLDS.minBorderedEdges).toBeGreaterThanOrEqual(2);
  });

  it('exports the adaptive-scale clamp ceiling + depth-walk threshold', () => {
    expect(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax).toBeGreaterThan(1);
    expect(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax).toBeLessThanOrEqual(2);
    expect(WHITE_BORDER_THRESHOLDS.depthWhiteRatioThreshold).toBeGreaterThan(0.5);
    expect(WHITE_BORDER_THRESHOLDS.depthWhiteRatioThreshold).toBeLessThanOrEqual(1);
  });

  it('result type carries per-edge ratios for telemetry/test introspection', () => {
    const data = makeImageData(160, 90, { borderPx: { left: 14, right: 14 } });
    const result: BorderDetectionResult = detectWhiteBorderFromImageData(data);
    expect(typeof result.ratios.top).toBe('number');
    expect(typeof result.ratios.bottom).toBe('number');
    expect(typeof result.ratios.left).toBe('number');
    expect(typeof result.ratios.right).toBe('number');
    expect(typeof result.ratios.center).toBe('number');
  });

  it('result type carries depthRatios for adaptive-scale computation', () => {
    const data = makeImageData(160, 90, { borderPx: { left: 14, right: 14 } });
    const result: BorderDetectionResult = detectWhiteBorderFromImageData(data);
    expect(typeof result.depthRatios.top).toBe('number');
    expect(typeof result.depthRatios.bottom).toBe('number');
    expect(typeof result.depthRatios.left).toBe('number');
    expect(typeof result.depthRatios.right).toBe('number');
    // depthRatios must be in [0, 1]
    for (const k of ['top', 'bottom', 'left', 'right'] as const) {
      expect(result.depthRatios[k]).toBeGreaterThanOrEqual(0);
      expect(result.depthRatios[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe('detector depthRatios — accurate per-edge measurement', () => {
  it('measures left/right border depth as a fraction of source width (letterbox shape)', () => {
    // 14px L+R border on a 160×90 canvas → depth fraction = 14/160 = 0.0875
    const data = makeImageData(160, 90, { borderPx: { left: 14, right: 14 } });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(true);
    expect(result.depthRatios.left).toBeCloseTo(14 / 160, 2);
    expect(result.depthRatios.right).toBeCloseTo(14 / 160, 2);
    // Top/bottom had no border in the synthetic input
    expect(result.depthRatios.top).toBeLessThan(0.05);
    expect(result.depthRatios.bottom).toBeLessThan(0.05);
  });

  it('measures top/bottom + left/right border depth (4-sided heavy border)', () => {
    // 401 WEST #6 shape: 12px T/B + 33px L/R on 160×90
    const data = makeImageData(160, 90, { borderPx: { top: 12, bottom: 12, left: 33, right: 33 } });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(true);
    expect(result.depthRatios.top).toBeCloseTo(12 / 90, 2);
    expect(result.depthRatios.bottom).toBeCloseTo(12 / 90, 2);
    expect(result.depthRatios.left).toBeCloseTo(33 / 160, 2);
    expect(result.depthRatios.right).toBeCloseTo(33 / 160, 2);
  });

  it('returns near-zero depthRatios for a clean photo (false-positive safety preserved)', () => {
    const data = makeImageData(160, 90, { inner: [110, 80, 60] });
    const result = detectWhiteBorderFromImageData(data);
    expect(result.hasBorder).toBe(false);
    expect(result.depthRatios.top).toBeLessThan(0.05);
    expect(result.depthRatios.bottom).toBeLessThan(0.05);
    expect(result.depthRatios.left).toBeLessThan(0.05);
    expect(result.depthRatios.right).toBeLessThan(0.05);
  });
});

describe('computeAdaptiveCropScale — scale math', () => {
  // 401 WEST #6 production shape: 1920×1080 source, 376×250.656 wrapper,
  // ~21% L/R border + ~13% T/B border on the source.
  const SOURCE_W = 1920;
  const SOURCE_H = 1080;
  const WRAPPER_W = 376;
  const WRAPPER_H = 250.656;
  const baseDepth = { top: 0, bottom: 0, left: 0, right: 0 };

  it('returns 1 (no extra crop) when there is no detected border', () => {
    const scale = computeAdaptiveCropScale({
      depthRatios: baseDepth,
      sourceWidth: SOURCE_W,
      sourceHeight: SOURCE_H,
      wrapperWidth: WRAPPER_W,
      wrapperHeight: WRAPPER_H,
    });
    expect(scale).toBe(1);
  });

  it('returns 1 (degenerate input) when any dimension is zero or negative', () => {
    for (const bad of [
      { sourceWidth: 0 },
      { sourceHeight: 0 },
      { wrapperWidth: 0 },
      { wrapperHeight: 0 },
      { sourceWidth: -1 },
    ]) {
      const scale = computeAdaptiveCropScale({
        depthRatios: { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 },
        sourceWidth: SOURCE_W, sourceHeight: SOURCE_H,
        wrapperWidth: WRAPPER_W, wrapperHeight: WRAPPER_H,
        ...bad,
      });
      expect(scale).toBe(1);
    }
  });

  it('clamps the scale at WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax', () => {
    // An absurd 45% border on every edge would otherwise compute a scale
    // far above 1.5. The clamp must hold.
    const scale = computeAdaptiveCropScale({
      depthRatios: { top: 0.45, bottom: 0.45, left: 0.45, right: 0.45 },
      sourceWidth: SOURCE_W, sourceHeight: SOURCE_H,
      wrapperWidth: WRAPPER_W, wrapperHeight: WRAPPER_H,
    });
    expect(scale).toBeLessThanOrEqual(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax);
    expect(scale).toBe(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax);
  });

  it('cropping math: for a wide source on a less-wide wrapper, L/R borders are PARTIALLY hidden by cover', () => {
    // 401 WEST PH: ~9% L/R border, no T/B border. sourceAspect=1.778,
    // wrapperAspect=1.5. cover crops L+R; effective L/R visible ratio
    // (in wrapper-fraction) = max(0, (0.09 - cropFraction) * scaleRatio).
    //   scaleRatio = 1.778/1.5 = 1.185
    //   cropFraction = (1.185-1)/(2*1.185) = 0.0782
    //   effective = (0.09 - 0.0782) * 1.185 = 0.014
    //   required scale = 1 + 2*0.014 = 1.028, clamped to floor 1
    // Detector floors this in IDXImage but the math itself returns
    // raw value (caller applies the floor).
    const scale = computeAdaptiveCropScale({
      depthRatios: { top: 0, bottom: 0, left: 0.09, right: 0.09 },
      sourceWidth: SOURCE_W, sourceHeight: SOURCE_H,
      wrapperWidth: WRAPPER_W, wrapperHeight: WRAPPER_H,
    });
    // Cover absorbs most of the L/R border, so the required scale is
    // small. Just confirm it's > 1 (some additional crop needed) and
    // bounded.
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(1.1);
  });

  it('cropping math: for a heavy 4-sided border, the larger post-cover edge drives the scale', () => {
    // 401 WEST #6: ~21% L/R + ~13% T/B on 1920×1080 → 376×250.656.
    //   sourceAspect = 1.778, wrapperAspect = 1.5
    //   sourceAspect >= wrapperAspect → cover crops L/R
    //   scaleRatio = sourceAspect / wrapperAspect = 1.185
    //   cropFraction (per side, as fraction of source width) =
    //     (scaleRatio - 1) / (2 * scaleRatio) = 0.0782
    //   L/R effective (wrapper-fraction) =
    //     max(0, (0.21 - 0.0782) * scaleRatio) = 0.1318 * 1.185 = 0.156
    //   T/B effective (wrapper-fraction, no cover crop on this axis) =
    //     0.13 (raw)
    //   worst = max(L/R effective, T/B effective) = 0.156 (L/R wins
    //     after cover absorbs only part of the 21% L/R source border)
    //   required scale = 1 + 2 * 0.156 = 1.312
    const scale = computeAdaptiveCropScale({
      depthRatios: { top: 0.13, bottom: 0.13, left: 0.21, right: 0.21 },
      sourceWidth: SOURCE_W, sourceHeight: SOURCE_H,
      wrapperWidth: WRAPPER_W, wrapperHeight: WRAPPER_H,
    });
    expect(scale).toBeGreaterThan(1.2);
    expect(scale).toBeLessThanOrEqual(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax);
    expect(scale).toBeCloseTo(1.31, 1);
  });

  it('cropping math: for a tall source on a wider wrapper, T/B borders are partially hidden by cover', () => {
    // Mirror case: portrait source on landscape wrapper. cover scales by
    // width, crops T+B. Source 1080×1920 (portrait) on wrapper 376×251.
    //   sourceAspect=0.5625, wrapperAspect=1.5
    //   sourceAspect < wrapperAspect → cover scales by width
    //   scaleRatio = wrapperAspect/sourceAspect = 2.667
    //   cropFraction = (2.667-1)/(2*2.667) = 0.3125
    // A 0.20 T/B depth ratio with 0.3125 cropped per side → 0 effective.
    const scale = computeAdaptiveCropScale({
      depthRatios: { top: 0.20, bottom: 0.20, left: 0.05, right: 0.05 },
      sourceWidth: 1080, sourceHeight: 1920,
      wrapperWidth: WRAPPER_W, wrapperHeight: WRAPPER_H,
    });
    // T/B fully absorbed by cover. L/R drives: 0.05 of source maps 1:1
    // to wrapper-fraction, so worst = 0.05 → required = 1 + 0.1 = 1.10.
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeCloseTo(1.1, 1);
  });
});

/**
 * Source-regex assertions — pin which components opt into the
 * detector and which do not.
 *
 * If a future refactor accidentally drops the prop on a card variant,
 * the white-border issue silently regresses on that variant; this
 * test catches it before merge.
 */
describe('autoCropWhiteBorder wiring (source-level pins)', () => {
  let idxImageSrc: string;
  let searchCardSrc: string;
  let featuredSrc: string;

  beforeAll(() => {
    idxImageSrc = readFileSync(path.resolve(__dirname, '../../app/components/IDXImage.tsx'), 'utf8');
    searchCardSrc = readFileSync(path.resolve(__dirname, '../../app/components/SearchListingCard.tsx'), 'utf8');
    featuredSrc = readFileSync(path.resolve(__dirname, '../../app/components/FeaturedListings.tsx'), 'utf8');
  });

  it('IDXImage exposes the opt-in prop with default false', () => {
    // Pin both: the prop type signature AND the destructuring default.
    expect(idxImageSrc).toMatch(/autoCropWhiteBorder\?\s*:\s*boolean/);
    expect(idxImageSrc).toMatch(/autoCropWhiteBorder\s*=\s*false/);
  });

  it('IDXImage applies the ADAPTIVE per-image scale (not a hardcoded constant) in the render path', () => {
    // PR #149+: the scale is computed per-image by
    // computeAdaptiveCropScale and stored in IDXImage state as
    // `borderedState.scale`. The render path must template it as
    // `scale(${cropScale})` — NOT a hardcoded `scale(1.10)` magic
    // number or the old `WHITE_BORDER_CROP_SCALE` constant.
    expect(idxImageSrc).toMatch(/transform:\s*hasWhiteBorder\s*\?\s*`scale\(\$\{cropScale\}\)`/);
    // The old constant must be gone — its presence would mean a partial
    // revert dropped the adaptive math.
    expect(idxImageSrc).not.toMatch(/\bWHITE_BORDER_CROP_SCALE\b/);
    // The min-floor constant must be exported and used.
    expect(idxImageSrc).toMatch(/export\s+const\s+WHITE_BORDER_MIN_CROP_SCALE\s*=/);
    // The adaptive computer must be imported.
    expect(idxImageSrc).toMatch(/computeAdaptiveCropScale/);
  });

  it('IDXImage imports the detector from the canonical module', () => {
    expect(idxImageSrc).toMatch(/from\s+['"]@\/lib\/media\/white-border-detector['"]/);
  });

  it('IDXImage disables the liquidMotion animation when a white border is detected', () => {
    // The animation overrides static transform during keyframes. We
    // pin "&& !hasWhiteBorder" on the animation gate so the static
    // scale wins on bordered images.
    expect(idxImageSrc).toMatch(/shouldAnimate\s*&&\s*!\s*hasWhiteBorder/);
  });

  it('IDXImage derives hasWhiteBorder per-src so a carousel advance auto-invalidates the old verdict', () => {
    // PR #149+: state shape is `borderedState: { src, scale } | null`,
    // and `hasWhiteBorder` is `borderedState?.src === src`. When src
    // changes, borderedState.src still points at the OLD src so the
    // derived flag flips to false — no useEffect reset, no
    // `react-hooks/set-state-in-effect` lint warning. The companion
    // `cropScale` (the per-image adaptive scale) lives alongside src
    // in the same state object so they invalidate atomically.
    expect(idxImageSrc).toMatch(/borderedState\s*,?\s*setBorderedState/);
    expect(idxImageSrc).toMatch(/const\s+hasWhiteBorder\s*=\s*borderedState\?\.\s*src\s*===\s*src/);
    // The detector calls setBorderedState({ src, scale }) — NOT a bare boolean.
    expect(idxImageSrc).toMatch(/setBorderedState\s*\(\s*\{\s*src\s*,\s*scale\s*\}\s*\)/);
    // cropScale is derived from borderedState.scale, falls back to 1 when not bordered
    expect(idxImageSrc).toMatch(/const\s+cropScale\s*=\s*hasWhiteBorder\s*\?\s*borderedState\.scale\s*:\s*1/);
  });

  it('SearchListingCard GridCard passes autoCropWhiteBorder on the hero IDXImage', () => {
    // The three `<IDXImage ... />` blocks all opt in. Use a regex that
    // matches a single JSX block containing aspect="card" or
    // aspect="wide" plus autoCropWhiteBorder.
    const blocks = searchCardSrc.match(/<IDXImage\b[\s\S]*?\/>/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      expect(block).toContain('autoCropWhiteBorder');
    }
  });

  it('FeaturedListings does NOT opt in by default (out-of-scope per 2026-05-16 authorization)', () => {
    // Featured cards may opt in later if proven affected. Until then
    // pin the conservative scope so a future refactor doesn't
    // silently broaden the change.
    expect(featuredSrc).not.toMatch(/autoCropWhiteBorder/);
  });

  // ─── Conditional crossOrigin wiring (R2 CORS policy live 2026-05-16) ───
  // The detector needs an UNTAINTED canvas. For cross-origin images
  // (R2 cached copies on pub-<hash>.r2.dev) the browser will refuse to
  // give us pixel data unless the <img> element opts in with
  // `crossOrigin="anonymous"` AND the response carries
  // Access-Control-Allow-Origin matching the page origin. The R2 bucket
  // now emits ACAO for mallan.nyc + www + *.mallan.vercel.app.
  //
  // Wiring contract:
  //   1. crossOrigin is set ONLY when autoCropWhiteBorder === true
  //      (so featured + detail-page images stay no-CORS)
  //   2. Value is exactly "anonymous" — not "use-credentials"
  //      (public bucket, no cookies, ACAC: true intentionally NOT in
  //      the R2 policy)
  //   3. Falsy default → undefined attr → browser skips Origin header
  //      and serves no-CORS like before
  //
  // Regression matters: dropping conditional `crossOrigin` reintroduces
  // the SecurityError on R2 photos and the detector silently no-ops on
  // every cached card photo — the exact failure mode pre-2026-05-16.
  it('IDXImage sets crossOrigin="anonymous" CONDITIONALLY on autoCropWhiteBorder', () => {
    // Match the exact JSX attribute shape. The conditional MUST guard
    // on autoCropWhiteBorder so featured + detail-page images stay on
    // the no-CORS path.
    expect(idxImageSrc).toMatch(
      /crossOrigin\s*=\s*\{\s*autoCropWhiteBorder\s*\?\s*['"]anonymous['"]\s*:\s*undefined\s*\}/
    );
  });

  it('IDXImage does NOT use crossOrigin="use-credentials" (public bucket — credentials would break CORS)', () => {
    // ACAC: true is NOT in the R2 policy. "use-credentials" would make
    // the browser refuse the response. Defensive pin against a future
    // copy-paste that swaps the literal.
    expect(idxImageSrc).not.toMatch(/crossOrigin\s*=\s*['"]use-credentials['"]/);
    expect(idxImageSrc).not.toMatch(
      /crossOrigin\s*=\s*\{[^}]*['"]use-credentials['"][^}]*\}/
    );
  });

  it('IDXImage does NOT set crossOrigin unconditionally (would break non-CORS image hosts)', () => {
    // A bare `crossOrigin="anonymous"` (no conditional, no destructuring
    // ternary) would force CORS on every image — featured listings and
    // detail-page galleries would suddenly render broken on any future
    // image host without a matching CORS policy. Pin the conditional
    // shape so a refactor can't silently always-on it.
    //
    // Strip // line comments and /* ... */ block comments before
    // matching, because the comment block that documents the attribute
    // contains the literal text `crossOrigin="anonymous"` for
    // readability — that's not the actual JSX attribute.
    const stripped = idxImageSrc
      .replace(/\/\/[^\n]*/g, '')          // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');   // strip block comments
    expect(stripped).not.toMatch(/crossOrigin[ \t]*=[ \t]*["']anonymous["']/);
    // The bare attr `crossOrigin="anonymous"` is gone; the only allowed
    // form is the conditional `crossOrigin={autoCropWhiteBorder ? ...}`.
    expect(stripped).toMatch(/crossOrigin\s*=\s*\{\s*autoCropWhiteBorder\s*\?/);
  });

  it('IDXImage attaches crossOrigin to the SAME <img> element the detector targets', () => {
    // Defensive: there's only ONE real <img> JSX element in IDXImage
    // (the JSDoc comments at the top mention <img> as text). Pin that
    // the crossOrigin attribute lives on the element the detector
    // reads via imgRef (so the CORS opt-in actually affects the
    // canvas the detector touches).
    //
    // Match strategy: find `<img` followed by a newline + indented
    // `ref={imgRef}` (the actual JSX element shape) — JSDoc
    // references close immediately with `>` and don't have ref=.
    const imgStart = idxImageSrc.search(/<img\s*\n\s*ref=\{\s*imgRef\s*\}/);
    expect(imgStart).toBeGreaterThan(0);
    // Slice from the JSX <img start to the next /> (the close of the
    // self-closing element). This is now safe — we've anchored at the
    // real element, not at a JSDoc mention.
    const tail = idxImageSrc.slice(imgStart);
    const closeIdx = tail.indexOf('/>');
    expect(closeIdx).toBeGreaterThan(0);
    const imgBlock = tail.slice(0, closeIdx + 2);
    expect(imgBlock).toMatch(/ref=\{\s*imgRef\s*\}/);
    expect(imgBlock).toMatch(/crossOrigin=\{\s*autoCropWhiteBorder\s*\?/);
  });

  it('white-border-detector docstring reflects R2 CORS is live (no stale "no-op on R2" caveat)', () => {
    const detectorSrc = readFileSync(
      path.resolve(__dirname, '../../lib/media/white-border-detector.ts'),
      'utf8',
    );
    // Negative pin — the old caveat text MUST be gone now that R2 CORS
    // is configured. If a future refactor accidentally regresses the
    // doc, this catches it.
    expect(detectorSrc).not.toMatch(/detector NO-OPS\.\s*R2\s+bucket\s+does\s+not\s+emit/);
    // Positive pin — the updated text mentions the live policy + the
    // crossOrigin opt-in pattern.
    expect(detectorSrc).toMatch(/R2 CORS policy live/);
    expect(detectorSrc).toMatch(/crossOrigin="anonymous"/);
  });
});
