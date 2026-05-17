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
} as const;

export interface BorderDetectionResult {
  hasBorder: boolean;
  /** Per-edge white-pixel ratios (0..1). Useful for test introspection. */
  ratios: { top: number; bottom: number; left: number; right: number; center: number };
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
  if (cw <= 0 || ch <= 0) {
    return { hasBorder: false, ratios: { top: 0, bottom: 0, left: 0, right: 0, center: 0 }, reason: 'empty-image-data' };
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

  const ratios = { top: topRatio, bottom: bottomRatio, left: leftRatio, right: rightRatio, center: centerRatio };
  const t = WHITE_BORDER_THRESHOLDS.whiteRatioThreshold;

  const topB = topRatio >= t;
  const bottomB = bottomRatio >= t;
  const leftB = leftRatio >= t;
  const rightB = rightRatio >= t;
  const borderedEdges = (topB ? 1 : 0) + (bottomB ? 1 : 0) + (leftB ? 1 : 0) + (rightB ? 1 : 0);

  if (borderedEdges < WHITE_BORDER_THRESHOLDS.minBorderedEdges) {
    return { hasBorder: false, ratios, reason: `not-enough-bordered-edges (${borderedEdges}/4)` };
  }
  // Require either two OPPOSITE edges OR three+ total. A single corner
  // with two adjacent bright edges (e.g. window in a corner) is
  // intentionally NOT enough to trigger.
  const opposite = (topB && bottomB) || (leftB && rightB);
  if (!opposite && borderedEdges < 3) {
    return { hasBorder: false, ratios, reason: 'only-adjacent-bordered-edges' };
  }
  // False-positive guard: if the CENTER is also overwhelmingly near-
  // white, this is more likely a bright interior than a baked border.
  if (centerRatio > WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio) {
    return { hasBorder: false, ratios, reason: `center-too-white (${centerRatio.toFixed(2)} > ${WHITE_BORDER_THRESHOLDS.centerWhiteMaxRatio})` };
  }

  return { hasBorder: true, ratios };
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
 * @returns    `true` when a baked-in white canvas border is detected
 *             and the consumer should apply an extra crop transform.
 *             `false` on any uncertainty.
 */
export function detectWhiteBorder(img: HTMLImageElement): boolean {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) return false;

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
    if (!ctx) return false;
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
      return false;
    }
    return detectWhiteBorderFromImageData(imageData).hasBorder;
  } catch {
    return false;
  }
}
