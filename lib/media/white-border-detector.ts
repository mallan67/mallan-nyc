/**
 * Detect-then-scale companion for IDXImage hero cards (2026-05-16).
 *
 * Why this exists
 * ===============
 * A subset of broker-uploaded Trestle photos arrive with SOLID WHITE
 * PIXELS BAKED INTO THE IMAGE ITSELF — typically a smaller photo
 * pasted onto a 1920×1080 white canvas. Pixel analysis of production
 * listings on 2026-05-16:
 *
 *   401 WEST Street #PH (RLS20072917) : top 0 bottom 0 left 174 right 174
 *   401 WEST Street #6  (RLS20077312) : top 140 bottom 140 left 200 right 199
 *   15 W 68th Street    (RLS20078798) : 0 / 0 / 0 / 0
 *   815 5th Ave DUPLEX  (RLS20091223) : 0 / 0 / 0 / 0
 *
 * `object-fit: cover` on a 376×251 card crops only ~35 px from a 1920-
 * wide source, so a 174-px baked border still leaves ~10 visible
 * pixels of white frame around the actual content. That's the "inset
 * /boxed with excess white padding" Maya reported.
 *
 * This module exposes a tiny detector that an `<img onLoad>` handler
 * can call to decide whether to apply an extra crop transform to the
 * image element. Detection is intentionally conservative — it must
 * NOT trigger on:
 *
 *   • bright interiors (white walls, kitchens)
 *   • snow / sky / pale exteriors
 *   • photos with a single bright edge (a window in the corner)
 *
 * Only continuous near-white CANVAS borders trigger. The triggers are:
 *
 *   (1) ≥2 OPPOSITE edges exceed the white ratio threshold, OR
 *       ≥3 of 4 edges exceed it.
 *   (2) The center sample is NOT also overwhelmingly white (false-
 *       positive guard against "everything in the photo is bright").
 *
 * Detection is fully synchronous post-load. Canvas operations stay
 * within a downsampled 160-px-max canvas to keep CPU under 1 ms on
 * typical hardware.
 *
 * Earlier attempt history
 * -----------------------
 * Commit `97d1670d` (2026-04-06) reverted an earlier fix attempt that
 * added an `absolute inset` wrapper around the image. That wrapper
 * broke IDXImage's IntersectionObserver and was reverted. This module
 * AVOIDS that pattern entirely: no new wrapper, no DOM-tree change.
 * The detector returns a boolean; the consumer (IDXImage) applies a
 * `transform: scale(…)` ON THE EXISTING img element only.
 */

/**
 * All tunable thresholds named + exported so tests can pin them and
 * future audits don't need to grep through implementation.
 */
export const WHITE_BORDER_THRESHOLDS = {
  /** Minimum R, G, AND B channel value for a pixel to count as "near white". */
  rgbMin: 245,
  /** Max spread between R/G/B channels — rejects warm/cool tints (yellow walls etc.). */
  maxChannelSpread: 12,
  /** Fraction of pixels in an edge band that must be near-white for the edge to count as "bordered". */
  whiteRatioThreshold: 0.9,
  /** Edge band thickness as fraction of the relevant image dimension. */
  edgeBandPct: 0.05,
  /** Center sample size (square) as fraction of the shorter image dimension. */
  centerSamplePct: 0.3,
  /** Max ratio of near-white pixels in the CENTER sample — above this we bail. */
  centerWhiteMaxRatio: 0.75,
  /** Min count of bordered edges required to trigger (must also satisfy opposite-edges rule). */
  minBorderedEdges: 2,
  /** Max canvas dimension when downsampling — keeps detection fast on huge images. */
  maxCanvasDim: 160,
  /**
   * Per-row / per-column whiteness threshold used by the depth walk.
   * When walking inward from an edge, a row (top/bottom) or column
   * (left/right) is treated as "still inside the white border" while
   * ≥ this fraction of its pixels are near-white. The walk stops at
   * the first row/column that drops below the threshold. 0.85 keeps
   * the depth conservative (slightly under-reports) so the adaptive
   * crop never over-shoots and clips photo content.
   */
  depthWhiteRatioThreshold: 0.85,
  /**
   * RGB floor for the per-row "is this still inside the border?" check
   * used by the depth walk. Intentionally LOWER than `rgbMin` (245) so
   * the depth walk also captures anti-aliased pixels at the border-to-
   * content boundary — which a typical broker-uploaded photo renders
   * with channel values around 220–244 instead of pure 255. Without
   * this, the depth walk stops one pixel too early on every edge,
   * under-reports the visible white extent, and the adaptive scale
   * lands too low (verified 2026-05-17: 401 WEST PH adaptive came out
   * to 1.05× when 1.20× was needed). The strict 245 floor is still
   * used by the hasBorder edge-band test so the false-positive
   * protections (warm tints, bright interiors) are unaffected.
   */
  depthRgbMin: 225,
  /**
   * Hard upper bound on the adaptive crop scale. Even if the detector
   * thinks the border is enormous (e.g. an off-aspect photo where
   * `object-fit: cover` already crops most of the source), refuse to
   * scale beyond this. 1.5× = at most 17% of the wrapper's smaller
   * dimension is hidden per side, which keeps even false-positive
   * triggers visually bounded.
   */
  adaptiveScaleClampMax: 1.5,
} as const;

export interface EdgeRatios {
  top: number;
  bottom: number;
  left: number;
  right: number;
  center: number;
}

/**
 * Per-edge contiguous white-band depth as a fraction of the
 * corresponding image dimension (0..1). Always populated (even when
 * `hasBorder=false`) so consumers can inspect the underlying
 * measurement without re-running the detector.
 *
 * `top`/`bottom` are fractions of the source IMAGE HEIGHT;
 * `left`/`right` are fractions of the source IMAGE WIDTH.
 *
 * Example: `{ top: 0.13, bottom: 0.13, left: 0.10, right: 0.10 }`
 * means the photo has a baked white border that occupies ~13% of
 * the source's height at top + bottom and ~10% of the source's
 * width at left + right.
 */
export interface DepthRatios {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BorderDetectionResult {
  hasBorder: boolean;
  /** Per-edge white-pixel ratios (0..1). Useful for test introspection. */
  ratios: EdgeRatios;
  /**
   * Per-edge contiguous white-band depth as a fraction of the
   * corresponding image dimension. Populated whenever the detector
   * has a valid ImageData to walk; consumers should treat 0 as "no
   * measurable white band on this edge" rather than "unknown".
   */
  depthRatios: DepthRatios;
  /** Reason short-circuited (or null on a fully-evaluated result). */
  reason?: string;
}

/**
 * Inner pure function. Operates on an already-rasterized ImageData
 * object so tests can construct synthetic inputs without needing a
 * real <canvas>. The async wrapper `detectWhiteBorder` is the one
 * IDXImage calls.
 */
export function detectWhiteBorderFromImageData(
  imageData: ImageData,
): BorderDetectionResult {
  const cw = imageData.width;
  const ch = imageData.height;
  const emptyDepth: DepthRatios = { top: 0, bottom: 0, left: 0, right: 0 };
  if (cw <= 0 || ch <= 0) {
    return {
      hasBorder: false,
      ratios: { top: 0, bottom: 0, left: 0, right: 0, center: 0 },
      depthRatios: emptyDepth,
      reason: 'empty-image-data',
    };
  }

  const data = imageData.data;

  function isWhitePixel(idx: number): boolean {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (r < WHITE_BORDER_THRESHOLDS.rgbMin) return false;
    if (g < WHITE_BORDER_THRESHOLDS.rgbMin) return false;
    if (b < WHITE_BORDER_THRESHOLDS.rgbMin) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max - min) <= WHITE_BORDER_THRESHOLDS.maxChannelSpread;
  }

  function whiteRatio(x0: number, y0: number, w: number, h: number): number {
    if (w <= 0 || h <= 0) return 0;
    let white = 0;
    let total = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const idx = (y * cw + x) * 4;
        if (isWhitePixel(idx)) white++;
        total++;
      }
    }
    return total > 0 ? white / total : 0;
  }

  // ── Per-row / per-column whiteness for the depth walk ──
  // Uses a LOOSER whiteness check (depthRgbMin instead of rgbMin) so
  // anti-aliased near-white pixels at the border-to-content boundary
  // are still counted as part of the border. This is critical for the
  // adaptive scale to match the visible-white extent — see the
  // `depthRgbMin` doc on WHITE_BORDER_THRESHOLDS for rationale.
  function isWhitishPixel(idx: number): boolean {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (r < WHITE_BORDER_THRESHOLDS.depthRgbMin) return false;
    if (g < WHITE_BORDER_THRESHOLDS.depthRgbMin) return false;
    if (b < WHITE_BORDER_THRESHOLDS.depthRgbMin) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max - min) <= WHITE_BORDER_THRESHOLDS.maxChannelSpread;
  }
  function rowWhiteFraction(y: number): number {
    let white = 0;
    for (let x = 0; x < cw; x++) {
      if (isWhitishPixel((y * cw + x) * 4)) white++;
    }
    return cw > 0 ? white / cw : 0;
  }
  function colWhiteFraction(x: number): number {
    let white = 0;
    for (let y = 0; y < ch; y++) {
      if (isWhitishPixel((y * cw + x) * 4)) white++;
    }
    return ch > 0 ? white / ch : 0;
  }

  const bandH = Math.max(2, Math.floor(ch * WHITE_BORDER_THRESHOLDS.edgeBandPct));
  const bandW = Math.max(2, Math.floor(cw * WHITE_BORDER_THRESHOLDS.edgeBandPct));

  const topRatio = whiteRatio(0, 0, cw, bandH);
  const bottomRatio = whiteRatio(0, Math.max(0, ch - bandH), cw, bandH);
  const leftRatio = whiteRatio(0, 0, bandW, ch);
  const rightRatio = whiteRatio(Math.max(0, cw - bandW), 0, bandW, ch);

  const cSize = Math.max(2, Math.floor(Math.min(cw, ch) * WHITE_BORDER_THRESHOLDS.centerSamplePct));
  const cx = Math.floor((cw - cSize) / 2);
  const cy = Math.floor((ch - cSize) / 2);
  const centerRatio = whiteRatio(cx, cy, cSize, cSize);

  // Walk inward from each edge to measure the actual contiguous-white
  // depth. Stop at the first row/column that drops below
  // `depthWhiteRatioThreshold`. Returned as a fraction of the
  // corresponding image dimension (height for top/bottom, width for
  // left/right). Conservative under-report by design — the adaptive
  // scale clamp guards against overshoot if a photo happens to have
  // a near-white area mid-frame.
  const depthThr = WHITE_BORDER_THRESHOLDS.depthWhiteRatioThreshold;
  let topDepth = 0;
  for (let y = 0; y < ch; y++) {
    if (rowWhiteFraction(y) < depthThr) { topDepth = y; break; }
    if (y === ch - 1) topDepth = ch;
  }
  let bottomDepth = 0;
  for (let y = ch - 1; y >= 0; y--) {
    if (rowWhiteFraction(y) < depthThr) { bottomDepth = ch - 1 - y; break; }
    if (y === 0) bottomDepth = ch;
  }
  let leftDepth = 0;
  for (let x = 0; x < cw; x++) {
    if (colWhiteFraction(x) < depthThr) { leftDepth = x; break; }
    if (x === cw - 1) leftDepth = cw;
  }
  let rightDepth = 0;
  for (let x = cw - 1; x >= 0; x--) {
    if (colWhiteFraction(x) < depthThr) { rightDepth = cw - 1 - x; break; }
    if (x === 0) rightDepth = cw;
  }
  const depthRatios: DepthRatios = {
    top: ch > 0 ? topDepth / ch : 0,
    bottom: ch > 0 ? bottomDepth / ch : 0,
    left: cw > 0 ? leftDepth / cw : 0,
    right: cw > 0 ? rightDepth / cw : 0,
  };

  const ratios = { top: topRatio, bottom: bottomRatio, left: leftRatio, right: rightRatio, center: centerRatio };
  const t = WHITE_BORDER_THRESHOLDS.whiteRatioThreshold;

  const topB = topRatio >= t;
  const bottomB = bottomRatio >= t;
  const leftB = leftRatio >= t;
  const rightB = rightRatio >= t;
  const borderedEdges = (topB ? 1 : 0) + (bottomB ? 1 : 0) + (leftB ? 1 : 0) + (rightB ? 1 : 0);

  if (borderedEdges < WHITE_BORDER_THRESHOLDS.minBorderedEdges) {
    return { hasBorder: false, ratios, depthRatios, reason: `not-enough-bordered-edges (${borderedEdges}/4)` };
  }
  // Require either two OPPOSITE edges OR three+ total. A single corner
  // with two adjacent bright edges (e.g. window in a corner) is
  // intentionally NOT enough to trigger.
  const opposite = (topB && bottomB) || (leftB && rightB);
  if (!opposite && borderedEdges < 3) {
    return { hasBorder: false, ratios, depthRatios, reason: 'only-adjacent-bordered-edges' };
  }
  // False-positive guard: if the CENTER is also overwhelmingly near-
  // white, this is more likely a bright interior than a baked border.
  if (centerRatio > WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio) {
    return { hasBorder: false, ratios, depthRatios, reason: `center-too-white (${centerRatio.toFixed(2)} > ${WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio})` };
  }

  return { hasBorder: true, ratios, depthRatios };
}

/**
 * Adaptive scale computation — the math the IDXImage onLoad handler
 * uses to convert detector output + wrapper dimensions + source
 * dimensions into a single `transform: scale(N)` factor that hides
 * the remaining visible white margin after `object-fit: cover`.
 *
 * Inputs (all in raw pixel units):
 *   - `depthRatios` from the detector (fraction of source dimension)
 *   - `sourceWidth` × `sourceHeight` — `img.naturalWidth/Height`
 *   - `wrapperWidth` × `wrapperHeight` — bounding rect of the IDXImage
 *     `<div>` that owns `position: relative; overflow: hidden`
 *
 * Returns a scale in `[1, WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax]`
 * (currently `[1, 1.5]`).
 *
 * Math (single source of truth — referenced from
 * `app/components/IDXImage.tsx` and the unit tests):
 *
 *   1. `cover` resolves the rendered image dimensions:
 *      - If source-aspect ≥ wrapper-aspect, image fills wrapper
 *        height; cover crops L+R. Crop fraction (per side, of the
 *        source width) = `(scaleRatio - 1) / (2 * scaleRatio)`
 *        where `scaleRatio = sourceAspect / wrapperAspect`.
 *      - Else, image fills wrapper width; cover crops T+B.
 *
 *   2. Per edge, compute "visible border in wrapper coordinates as a
 *      fraction of the wrapper dimension":
 *      - For an axis cover crops along (L+R in the wide case, T+B
 *        in the tall case), the source border at that axis is
 *        partially hidden by the cover crop:
 *          `effective = max(0, (depthRatio - cropFraction) * scaleRatio)`
 *      - For the axis cover does NOT crop, the source border maps
 *        1:1 to the wrapper:
 *          `effective = depthRatio`
 *
 *   3. Worst remaining = `max(effLeft, effRight, effTop, effBottom)`.
 *
 *   4. Required scale to hide that worst remaining: each side of the
 *      wrapper loses `(S - 1) / 2` of its dimension when the image is
 *      scaled by S (with `transform-origin: center`). Setting
 *      `worst - (S - 1) / 2 ≤ 0` gives `S ≥ 1 + 2 * worst`.
 *
 *   5. Clamp to `[1, adaptiveScaleClampMax]`. Even if a false-positive
 *      detection reports an enormous border, the clamp keeps the
 *      photo visually bounded.
 *
 * Returns 1 (no extra crop) on any degenerate input.
 */
export interface AdaptiveScaleInput {
  depthRatios: DepthRatios;
  sourceWidth: number;
  sourceHeight: number;
  wrapperWidth: number;
  wrapperHeight: number;
}
export function computeAdaptiveCropScale(input: AdaptiveScaleInput): number {
  const { depthRatios, sourceWidth, sourceHeight, wrapperWidth, wrapperHeight } = input;
  if (
    !Number.isFinite(sourceWidth) || sourceWidth <= 0 ||
    !Number.isFinite(sourceHeight) || sourceHeight <= 0 ||
    !Number.isFinite(wrapperWidth) || wrapperWidth <= 0 ||
    !Number.isFinite(wrapperHeight) || wrapperHeight <= 0
  ) {
    return 1;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const wrapperAspect = wrapperWidth / wrapperHeight;

  let effLeft: number, effRight: number, effTop: number, effBottom: number;
  if (sourceAspect >= wrapperAspect) {
    // cover scales by height → L/R cropped, T/B map 1:1
    const scaleRatio = sourceAspect / wrapperAspect; // ≥ 1
    const cropFraction = (scaleRatio - 1) / (2 * scaleRatio);
    effLeft = Math.max(0, (depthRatios.left - cropFraction) * scaleRatio);
    effRight = Math.max(0, (depthRatios.right - cropFraction) * scaleRatio);
    effTop = Math.max(0, depthRatios.top);
    effBottom = Math.max(0, depthRatios.bottom);
  } else {
    // cover scales by width → T/B cropped, L/R map 1:1
    const scaleRatio = wrapperAspect / sourceAspect; // > 1
    const cropFraction = (scaleRatio - 1) / (2 * scaleRatio);
    effTop = Math.max(0, (depthRatios.top - cropFraction) * scaleRatio);
    effBottom = Math.max(0, (depthRatios.bottom - cropFraction) * scaleRatio);
    effLeft = Math.max(0, depthRatios.left);
    effRight = Math.max(0, depthRatios.right);
  }

  const worst = Math.max(effLeft, effRight, effTop, effBottom);
  if (worst <= 0) return 1;

  const required = 1 + 2 * worst;
  const clamped = Math.min(WHITE_BORDER_THRESHOLDS.adaptiveScaleClampMax, Math.max(1, required));
  return clamped;
}

/**
 * Browser-side wrapper: draw the image into a downsampled canvas,
 * extract ImageData, run the pure detector. Returns `false` (no-op)
 * on any failure path — tainted canvas, OOM, missing 2D context,
 * detached image, etc.
 *
 * This function is the ONLY canvas-touching code. The IDXImage
 * onLoad handler calls it inside a try/catch as defense in depth.
 *
 * Same-origin / CORS contract (updated 2026-05-16, R2 CORS policy live)
 * ---------------------------------------------------------------------
 * `getImageData()` throws `SecurityError` when the canvas has been
 * tainted by a cross-origin image drawn WITHOUT a valid CORS opt-in.
 * The wrapper catches the throw and returns false — so any future
 * source without matching CORS headers degrades gracefully into "no
 * border detected" (no scale, no transform, image renders unchanged).
 *
 * Coverage by source on mallan.nyc (verified by curl probe 2026-05-16
 * after R2 bucket CORS policy was applied):
 *
 *   - `/api/media/proxy?url=…` (Trestle live, server-side Bearer
 *     auth, response is same-origin from the browser) → detector
 *     WORKS. CORS not applicable; canvas is never tainted.
 *
 *   - `https://pub-<hash>.r2.dev/photos/…` (Cloudflare R2 cached
 *     copies) → detector WORKS, provided the consumer sets
 *     `crossOrigin="anonymous"` on the <img> element AND the request
 *     `Origin` matches the R2 bucket's CORS policy
 *     (`AllowedOrigins: [https://mallan.nyc, https://www.mallan.nyc,
 *     https://*.mallan.vercel.app]`, `AllowedMethods: [GET, HEAD]`).
 *     `IDXImage` opts in to `crossOrigin="anonymous"` only when its
 *     `autoCropWhiteBorder` prop is true, keeping featured + detail-
 *     page images on the no-CORS path.
 *
 *   - Any other future image host without a matching CORS policy →
 *     detector NO-OPS gracefully (defensive try/catch on
 *     `getImageData`). No broken-image side effects.
 *
 * @param img  The loaded <img> element. Must have non-zero
 *             naturalWidth / naturalHeight.
 * @returns    Structured detection result. `hasBorder=true` means the
 *             consumer should apply an extra crop transform. The
 *             companion `depthRatios` field is the input to
 *             `computeAdaptiveCropScale()` so the per-image scale
 *             can match the actual border thickness instead of a
 *             one-size-fits-all constant.
 *             Any failure path returns `hasBorder=false` with zeroed
 *             ratios (no over-crop / no scale).
 */
const FAILED_RESULT: BorderDetectionResult = {
  hasBorder: false,
  ratios: { top: 0, bottom: 0, left: 0, right: 0, center: 0 },
  depthRatios: { top: 0, bottom: 0, left: 0, right: 0 },
};
export function detectWhiteBorder(img: HTMLImageElement): BorderDetectionResult {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) return { ...FAILED_RESULT, reason: 'zero-natural-dim' };

  // Downsample to keep the canvas small. 1920×1080 → 160×90 keeps
  // pixel work under ~14 k iterations; getImageData on a 160-px
  // canvas measures sub-ms on a modern laptop.
  const scale = Math.min(1, WHITE_BORDER_THRESHOLDS.maxCanvasDim / Math.max(w, h));
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));

  try {
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ...FAILED_RESULT, reason: 'no-2d-context' };
    ctx.drawImage(img, 0, 0, cw, ch);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, cw, ch);
    } catch {
      // Tainted canvas — image came from a cross-origin source without
      // matching CORS headers (or the <img> wasn't given
      // `crossOrigin="anonymous"`). Same-origin proxy responses + R2
      // cached copies with the live CORS policy are both safe; this
      // branch defends against future image hosts that don't fit
      // either pattern.
      return { ...FAILED_RESULT, reason: 'tainted-canvas' };
    }
    return detectWhiteBorderFromImageData(imageData);
  } catch {
    return { ...FAILED_RESULT, reason: 'detector-exception' };
  }
}
