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

  it('result type carries per-edge ratios for telemetry/test introspection', () => {
    const data = makeImageData(160, 90, { borderPx: { left: 14, right: 14 } });
    const result: BorderDetectionResult = detectWhiteBorderFromImageData(data);
    expect(typeof result.ratios.top).toBe('number');
    expect(typeof result.ratios.bottom).toBe('number');
    expect(typeof result.ratios.left).toBe('number');
    expect(typeof result.ratios.right).toBe('number');
    expect(typeof result.ratios.center).toBe('number');
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

  it('IDXImage uses the WHITE_BORDER_CROP_SCALE constant (not a magic number) for the scale value', () => {
    expect(idxImageSrc).toMatch(/export\s+const\s+WHITE_BORDER_CROP_SCALE\s*=\s*1\.1\b/);
    expect(idxImageSrc).toMatch(/scale\(\$\{WHITE_BORDER_CROP_SCALE\}\)/);
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
    // Pattern: borderedSrc holds the src the detector confirmed, and
    // hasWhiteBorder is `borderedSrc === src`. When src changes,
    // borderedSrc still points at the OLD src, so the derived flag
    // flips to false — no useEffect reset needed and no
    // `react-hooks/set-state-in-effect` lint warning.
    expect(idxImageSrc).toMatch(/borderedSrc\s*,?\s*setBorderedSrc/);
    expect(idxImageSrc).toMatch(/const\s+hasWhiteBorder\s*=\s*borderedSrc\s*===\s*src/);
    // The detector calls setBorderedSrc(src) — NOT a bare boolean.
    expect(idxImageSrc).toMatch(/setBorderedSrc\(src\)/);
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
