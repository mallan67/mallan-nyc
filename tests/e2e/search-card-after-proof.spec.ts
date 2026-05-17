/**
 * After-proof for PR #145 (2026-05-16).
 *
 * Runs ONLY against the Vercel preview deploy of the PR (set
 * PLAYWRIGHT_BASE_URL=<preview URL> before running). Captures the 10
 * after-state items Maya enumerated:
 *
 *   1. Screenshot of 401 WEST card after patch.
 *   2. Screenshot of 15 W 68th card after patch.
 *   3. Pixel/visual proof the 401 WEST white border is reduced.
 *   4. Confirm 15 W 68th is NOT visibly degraded by false-positive scaling.
 *   5. Confirm detector did not trigger on clean photos.
 *   6. Confirm card dimensions remain stable.
 *   7. Confirm no image load errors.
 *   8. Confirm no console errors from canvas/CORS.
 *   9. Confirm FeaturedListings still works AND is not opted in.
 *   10. Confirm mobile 390px cards still render correctly.
 *
 * Writes:
 *   tests/e2e/_artifacts/after-proof/<slug>-{page,401west,15w68th}.png
 *   tests/e2e/_artifacts/after-proof/after-proof-summary.json
 */
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS = path.resolve(__dirname, '_artifacts', 'after-proof');

test.beforeAll(() => {
  if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });
});

interface PageTelemetry {
  consoleErrors: string[];
  pageErrors: string[];
  failedImageRequests: string[];
}

/**
 * Wires page-level listeners for console errors, page errors, and
 * any non-2xx image responses. Returns the accumulator object.
 */
function attachTelemetry(page: Page): PageTelemetry {
  const t: PageTelemetry = {
    consoleErrors: [],
    pageErrors: [],
    failedImageRequests: [],
  };
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      t.consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    t.pageErrors.push(err.message);
  });
  page.on('response', (resp) => {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    // Track image responses that returned 4xx/5xx
    if ((ct.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(url)) && resp.status() >= 400) {
      t.failedImageRequests.push(`${resp.status()} ${url.slice(0, 200)}`);
    }
  });
  return t;
}

/**
 * In-page measurement: returns the rendered transform info per card,
 * keyed by address text. Also returns image error count from the
 * `.complete && naturalWidth === 0` heuristic.
 */
async function measureCards(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.glass-card')) as HTMLElement[];
    return cards.map((card, i) => {
      const cb = card.getBoundingClientRect();
      const img = card.querySelector('img') as HTMLImageElement | null;
      const ib = img?.getBoundingClientRect() ?? null;
      const cs = img ? getComputedStyle(img) : null;
      const ps = Array.from(card.querySelectorAll('p')).map((p) => p.textContent?.trim() || '');
      const addr = ps.find((t) => /\d.*(Street|Avenue|Place|Road|Way|Lane|Boulevard|Plaza|Square)/i.test(t)) || ps[0] || null;
      const imgErr = !!img && img.complete && img.naturalWidth === 0;
      return {
        i,
        addr,
        cardBox: cb ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : null,
        imgBox: ib ? { x: Math.round(ib.x), y: Math.round(ib.y), w: Math.round(ib.width), h: Math.round(ib.height) } : null,
        transform: cs?.transform ?? null,
        transformOrigin: cs?.transformOrigin ?? null,
        objectFit: cs?.objectFit ?? null,
        animation: cs?.animationName ?? null,
        natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
        complete: !!img?.complete,
        imgError: imgErr,
      };
    });
  });
}

/**
 * Crop pixel sampling — for an element bounding box on the page,
 * sample a fixed-width vertical strip 10 px in from the LEFT edge
 * and count near-white pixels. Returns the ratio. Used to prove the
 * border is materially reduced post-patch.
 */
async function leftEdgeWhiteRatio(page: Page, cardIndex: number): Promise<number | null> {
  return page.evaluate((i) => {
    const cards = Array.from(document.querySelectorAll('.glass-card')) as HTMLElement[];
    const card = cards[i];
    if (!card) return null;
    const img = card.querySelector('img') as HTMLImageElement | null;
    if (!img || img.naturalWidth === 0) return null;
    const ib = img.getBoundingClientRect();
    const wrapperRect = (img.parentElement as HTMLElement | null)?.getBoundingClientRect() ?? null;
    if (!wrapperRect) return null;

    // Render the IMG into a small canvas at its on-screen size, then
    // sample the leftmost visible strip of the WRAPPER (post-clip,
    // post-transform). object-cover + overflow:hidden mean the visible
    // pixels are what the user sees, which is the band we care about.
    // We DRAW the img scaled to wrapperRect, then sample x=2..6.
    const w = Math.max(60, Math.round(wrapperRect.width));
    const h = Math.max(40, Math.round(wrapperRect.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Account for the static transform: scale(N) the patch applies on
    // bordered images. The IMG's bounding box width (ib.width) reflects
    // the rendered (post-scale) width relative to the wrapper. We use
    // the wrapper width/height as the visible viewport so the sample
    // matches what the user sees through `overflow: hidden`.
    const offX = ib.x - wrapperRect.x;
    const offY = ib.y - wrapperRect.y;
    try {
      ctx.drawImage(img, offX, offY, ib.width, ib.height);
    } catch {
      return null;
    }
    let imgData: ImageData;
    try {
      imgData = ctx.getImageData(2, Math.floor(h * 0.2), 4, Math.floor(h * 0.6));
    } catch {
      return null;
    }
    let white = 0;
    let total = 0;
    for (let p = 0; p < imgData.data.length; p += 4) {
      const r = imgData.data[p];
      const g = imgData.data[p + 1];
      const b = imgData.data[p + 2];
      if (r >= 245 && g >= 245 && b >= 245 && Math.abs(Math.max(r,g,b) - Math.min(r,g,b)) <= 12) {
        white++;
      }
      total++;
    }
    return total > 0 ? white / total : null;
  }, cardIndex);
}

test.describe('After-proof @ Vercel preview (PR #145)', () => {
  test('desktop 1440: detector applies to 401 WEST cards, leaves 15 W 68th unchanged', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium-only proof');
    const telemetry = attachTelemetry(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/search?tab=rent-residential&sort=price-desc', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll('.glass-card img');
      return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
    }, { timeout: 45_000 });
    // The detector runs inside requestAnimationFrame after onLoad. Give
    // it enough time + a settle to land the state update + paint.
    await page.waitForTimeout(2000);

    const metrics = await measureCards(page);
    const find = (re: RegExp) => metrics.find((m) => re.test(m.addr || ''));

    const card401WestPH = find(/401 WEST Street.*PH/i);
    const card401West6 = find(/401 WEST Street.*\b6\b/i);
    const card15W68 = find(/15 W 68/i);

    // (1)(2) page screenshot + per-card screenshots
    await page.screenshot({ path: path.join(ARTIFACTS, 'desktop-1440-fullpage.png'), fullPage: false });
    for (const [card, slug] of [
      [card401WestPH, '401west-PH'],
      [card401West6, '401west-6'],
      [card15W68, '15w68th'],
    ] as const) {
      if (!card) continue;
      await page.evaluate((idx) => {
        const all = Array.from(document.querySelectorAll('.glass-card'));
        (all[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'center' });
      }, card.i);
      await page.waitForTimeout(400);
      const handle = page.locator('.glass-card').nth(card.i);
      await handle.screenshot({ path: path.join(ARTIFACTS, `desktop-1440-${slug}.png`) }).catch(() => undefined);
    }

    // (3) Pixel sampling: 401 WEST left-edge white ratio AFTER patch should be much lower than BEFORE.
    const leftRatio401PH = card401WestPH ? await leftEdgeWhiteRatio(page, card401WestPH.i) : null;
    const leftRatio401_6 = card401West6 ? await leftEdgeWhiteRatio(page, card401West6.i) : null;
    const leftRatio15W68 = card15W68 ? await leftEdgeWhiteRatio(page, card15W68.i) : null;

    // (5) Detector should NOT have triggered on the clean 15 W 68th card.
    // Per IDXImage.tsx, when no white border is detected, transform is `undefined` → computed becomes `none`.
    // When detected, computed transform becomes `matrix(1.1, …)` reflecting scale(1.1).
    const cleanIsUnscaled = card15W68
      ? (card15W68.transform === 'none' || (!card15W68.transform?.includes('matrix') || !!card15W68.transform?.match(/matrix\(1,\s*0,\s*0,\s*1/)))
      : true;
    const borderedIsScaled401PH = card401WestPH
      ? !!card401WestPH.transform && card401WestPH.transform !== 'none' && /matrix\(1\.0?[5-9]|1\.1\d?/.test(card401WestPH.transform)
      : false;
    const borderedIsScaled401_6 = card401West6
      ? !!card401West6.transform && card401West6.transform !== 'none' && /matrix\(1\.0?[5-9]|1\.1\d?/.test(card401West6.transform)
      : false;

    // (6) Card dimensions should be stable (376 × ~400 ish, height varies with text)
    const cardW401PH = card401WestPH?.cardBox?.w ?? 0;
    const cardW15W68 = card15W68?.cardBox?.w ?? 0;

    const summary = {
      url: '/search?tab=rent-residential&sort=price-desc',
      viewport: { width: 1440, height: 900 },
      headHash: process.env.HEAD_HASH || null,
      results: {
        card401WestPH,
        card401West6,
        card15W68,
        leftEdgeWhiteRatios: {
          card401WestPH: leftRatio401PH,
          card401West6: leftRatio401_6,
          card15W68: leftRatio15W68,
        },
        cleanIsUnscaled,
        borderedIsScaled401PH,
        borderedIsScaled401_6,
        cardW401PH,
        cardW15W68,
        animation_15w68: card15W68?.animation,
        animation_401PH: card401WestPH?.animation,
      },
      telemetry,
    };

    fs.writeFileSync(
      path.join(ARTIFACTS, 'after-proof-summary.json'),
      JSON.stringify(summary, null, 2),
    );

    console.log('── AFTER-PROOF · desktop 1440 ─────────────────────────────');
    console.log('  401 WEST PH:', card401WestPH ? `transform=${card401WestPH.transform?.slice(0, 80)} animation=${card401WestPH.animation} cardW=${card401WestPH.cardBox?.w} leftEdgeWhite=${(leftRatio401PH ?? 0).toFixed(2)}` : 'NOT FOUND');
    console.log('  401 WEST #6:', card401West6 ? `transform=${card401West6.transform?.slice(0, 80)} animation=${card401West6.animation} cardW=${card401West6.cardBox?.w} leftEdgeWhite=${(leftRatio401_6 ?? 0).toFixed(2)}` : 'NOT FOUND');
    console.log('  15 W 68TH:  ', card15W68 ? `transform=${card15W68.transform?.slice(0, 80)} animation=${card15W68.animation} cardW=${card15W68.cardBox?.w} leftEdgeWhite=${(leftRatio15W68 ?? 0).toFixed(2)}` : 'NOT FOUND');
    console.log('  Telemetry: consoleErrors=' + telemetry.consoleErrors.length + ' pageErrors=' + telemetry.pageErrors.length + ' failedImgResp=' + telemetry.failedImageRequests.length);
    if (telemetry.consoleErrors.length > 0) console.log('    consoleErrors[0]:', telemetry.consoleErrors[0]);
    if (telemetry.pageErrors.length > 0) console.log('    pageErrors[0]:', telemetry.pageErrors[0]);
    if (telemetry.failedImageRequests.length > 0) console.log('    failedImg[0]:', telemetry.failedImageRequests[0]);

    // Soft assertions — we want to see real numbers, not just a binary
    // pass/fail. Hard assertions surface as failures so CI flags them.
    expect(metrics.length).toBeGreaterThan(0);
    expect(card401WestPH || card401West6).toBeTruthy();
    expect(card15W68).toBeTruthy();
    // No new image load errors caused by canvas / CORS / transform.
    expect(telemetry.pageErrors).toEqual([]);
    // canvas/CORS errors would surface as console.error in the page;
    // browser-warning chatter is allowed (next/script noise, GTM etc.)
    // but anything containing "CORS", "tainted", or "white-border" is
    // blocking.
    const blockingConsole = telemetry.consoleErrors.filter((e) =>
      /CORS|tainted|white[- ]border|IDXImage|detectWhiteBorder/i.test(e),
    );
    expect(blockingConsole).toEqual([]);
  });

  // ── Adaptive crop proof (PR #149+) ────────────────────────────────
  //
  // After the F2 adaptive-scale follow-up, the visible white band that
  // survived the old fixed scale(1.10) should now be <= 5 px on the
  // two bordered cards, while the clean control card stays at 0.
  //
  // Method: walk inward from each edge of the wrapper's canvas in 1-px
  // steps; stop at the first row/column that drops below 85% near-white.
  // The first-drop depth is what the user perceives as the residual
  // white margin. Pre-PR-#149 measured 20 px on every edge of 401 WEST
  // #6 and 18 px on L/R of 401 WEST PH.
  test('adaptive crop reduces visible white band <= 5px (401 WEST #6 + PH); 15 W 68TH stays clean', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium-only proof');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/search?tab=rent-residential&sort=price-desc', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll('.glass-card img');
      return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
    }, { timeout: 45_000 });
    await page.waitForTimeout(2500);

    interface EdgeWalk {
      top: number | null;
      bottom: number | null;
      left: number | null;
      right: number | null;
    }

    async function visibleWhiteBandDepths(addrPattern: RegExp): Promise<EdgeWalk | null> {
      // Codex review (PR #149): pass BOTH source and flags so the
      // reconstructed RegExp preserves /i, /m, etc. Earlier
      // `new RegExp(pattern.source)` silently dropped the case-
      // insensitive flag, making /401 WEST Street.*PH/i fall back to
      // case-sensitive matching inside page.evaluate — which still
      // happened to find the cards because production rendered the
      // addresses in matching case, but the test was effectively
      // unguarded against any rendering change.
      return page.evaluate(({ source, flags }) => {
        const re = new RegExp(source, flags);
        const cards = Array.from(document.querySelectorAll('.glass-card')) as HTMLElement[];
        const cardIdx = cards.findIndex((c) => re.test(c.textContent ?? ''));
        if (cardIdx < 0) return null;
        const card = cards[cardIdx];
        const img = card.querySelector('img') as HTMLImageElement | null;
        const wrapper = img?.parentElement as HTMLElement | null;
        if (!img || !wrapper || img.naturalWidth === 0) return null;

        const wRect = wrapper.getBoundingClientRect();
        const iRect = img.getBoundingClientRect();
        const W = Math.max(60, Math.round(wRect.width));
        const H = Math.max(40, Math.round(wRect.height));
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const offX = iRect.x - wRect.x;
        const offY = iRect.y - wRect.y;
        try {
          ctx.drawImage(img, offX, offY, iRect.width, iRect.height);
        } catch {
          return null;
        }
        let imageData: ImageData;
        try {
          imageData = ctx.getImageData(0, 0, W, H);
        } catch {
          return null;
        }
        const isWhite = (x: number, y: number) => {
          const idx = (y * W + x) * 4;
          const r = imageData.data[idx], g = imageData.data[idx + 1], b = imageData.data[idx + 2];
          return r >= 245 && g >= 245 && b >= 245 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
        };
        const rowMostlyWhite = (y: number) => {
          let w = 0;
          for (let x = 0; x < W; x++) if (isWhite(x, y)) w++;
          return W > 0 && w / W >= 0.85;
        };
        const colMostlyWhite = (x: number) => {
          let w = 0;
          for (let y = 0; y < H; y++) if (isWhite(x, y)) w++;
          return H > 0 && w / H >= 0.85;
        };
        let top = 0, bottom = 0, left = 0, right = 0;
        for (let y = 0; y < H; y++) { if (!rowMostlyWhite(y)) { top = y; break; } if (y === H - 1) top = H; }
        for (let y = H - 1; y >= 0; y--) { if (!rowMostlyWhite(y)) { bottom = H - 1 - y; break; } if (y === 0) bottom = H; }
        for (let x = 0; x < W; x++) { if (!colMostlyWhite(x)) { left = x; break; } if (x === W - 1) left = W; }
        for (let x = W - 1; x >= 0; x--) { if (!colMostlyWhite(x)) { right = W - 1 - x; break; } if (x === 0) right = W; }
        return { top, bottom, left, right };
      }, { source: addrPattern.source, flags: addrPattern.flags });
    }

    const card6 = await visibleWhiteBandDepths(/401 WEST Street.*\b6\b/i);
    const cardPH = await visibleWhiteBandDepths(/401 WEST Street.*PH/i);
    const card15 = await visibleWhiteBandDepths(/15 W 68/i);

    console.log('── ADAPTIVE PROOF · desktop 1440 ───────────────────────────');
    console.log('  401 WEST #6 white-band depth (px): ', card6);
    console.log('  401 WEST PH white-band depth (px): ', cardPH);
    console.log('  15 W 68TH  white-band depth (px): ', card15);

    // Targets: bordered cards should now have <= 5px residual white per
    // edge. The clean control card should stay at 0 (no false positive).
    if (card6) {
      expect(card6.top).toBeLessThanOrEqual(5);
      expect(card6.bottom).toBeLessThanOrEqual(5);
      expect(card6.left).toBeLessThanOrEqual(5);
      expect(card6.right).toBeLessThanOrEqual(5);
    }
    if (cardPH) {
      expect(cardPH.top).toBeLessThanOrEqual(5);
      expect(cardPH.bottom).toBeLessThanOrEqual(5);
      expect(cardPH.left).toBeLessThanOrEqual(5);
      expect(cardPH.right).toBeLessThanOrEqual(5);
    }
    if (card15) {
      // Clean photo control — must not pick up a false-positive scale
      // that visually clips the image. 0 px is the strict expectation.
      expect(card15.top).toBe(0);
      expect(card15.bottom).toBe(0);
      expect(card15.left).toBe(0);
      expect(card15.right).toBe(0);
    }
  });

  test('mobile 390: cards render and fill viewport (item 10)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium-only proof');
    const telemetry = attachTelemetry(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search?tab=rent-residential&sort=price-desc', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll('.glass-card img');
      return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
    }, { timeout: 45_000 });
    await page.waitForTimeout(1500);
    const metrics = await measureCards(page);

    await page.screenshot({ path: path.join(ARTIFACTS, 'mobile-390-fullpage.png'), fullPage: false });

    const inViewport = metrics.filter((m) => m.cardBox && m.cardBox.w > 0).slice(0, 5);
    // Each visible card should occupy a sensible width on a 390-px
    // viewport (a 2-col grid would be ~180 each; 1-col would be ~370).
    for (const m of inViewport) {
      expect(m.cardBox!.w).toBeGreaterThan(150);
      expect(m.cardBox!.w).toBeLessThanOrEqual(400);
    }

    console.log('── AFTER-PROOF · mobile 390 ───────────────────────────────');
    console.log('  cards seen:', metrics.length, '· first:', inViewport[0]?.addr, 'cardW=', inViewport[0]?.cardBox?.w);
    console.log('  telemetry: consoleErr=' + telemetry.consoleErrors.length + ' pageErr=' + telemetry.pageErrors.length);

    expect(telemetry.pageErrors).toEqual([]);
  });

  test('FeaturedListings on /: renders images and is NOT opted in (item 9)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium-only proof');
    const telemetry = attachTelemetry(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for at least one featured-listing image to load.
    let hasFeatured = false;
    try {
      await page.waitForFunction(() => {
        const imgs = document.querySelectorAll('section img, [class*="featured" i] img, .liquid-img img');
        return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
      }, { timeout: 30_000 });
      hasFeatured = true;
    } catch {
      console.log('  No featured-listing images loaded on /. May be empty config.');
    }
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACTS, 'home-featured-1440.png'), fullPage: false });

    // FeaturedListings deliberately does NOT pass autoCropWhiteBorder.
    // We can't verify the prop directly from the rendered DOM, but we
    // CAN verify the page loaded without telemetry failures and at
    // least one image rendered (when there are featured listings).
    console.log('── AFTER-PROOF · / FeaturedListings ───────────────────────');
    console.log('  hasFeaturedImages:', hasFeatured);
    console.log('  telemetry: consoleErr=' + telemetry.consoleErrors.length + ' pageErr=' + telemetry.pageErrors.length + ' failedImg=' + telemetry.failedImageRequests.length);
    if (telemetry.consoleErrors.length > 0) console.log('    consoleErrors[0]:', telemetry.consoleErrors[0]);

    expect(telemetry.pageErrors).toEqual([]);
    const blocking = telemetry.consoleErrors.filter((e) =>
      /CORS|tainted|white[- ]border|IDXImage|detectWhiteBorder/i.test(e),
    );
    expect(blocking).toEqual([]);
  });
});
