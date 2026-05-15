/**
 * Regression — visible listing images must load with non-zero natural dimensions.
 *
 * Background: Maya reported "photos disappeared" on Buy/Rent/Research pages.
 * The frontend-auditor (2026-05-15) ran Playwright at 4 viewport widths × 6
 * pages and confirmed photos load correctly via `/api/media/proxy` →
 * HTTP 200 → image/jpeg in every probe. The original report was likely a
 * stale browser cache / extension state, not a code bug.
 *
 * This spec is a regression guard: if a future change accidentally breaks
 * the media chain (DTO rename, IDXImage URL rewrite, CSP block,
 * /api/media/proxy 4xx), this test catches it before merge.
 *
 * Proves on /buy, /rent, /search?tab=buy-residential,
 * /search?tab=rent-residential:
 *   1. At desktop-1440, at least 4 `<img>` elements are visible AND loaded.
 *   2. Every loaded visible image has `naturalWidth > 0` AND
 *      `naturalHeight > 0` — i.e. is a real image, not a placeholder /
 *      broken image / 0-byte response.
 *   3. No `/api/media/proxy` network response has status >= 400.
 */
import { test, expect, type Response } from '@playwright/test';

test.describe('Photos load correctly at desktop-1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const PAGES = [
    '/buy',
    '/rent',
    '/search?tab=buy-residential',
    '/search?tab=rent-residential',
  ];

  for (const path of PAGES) {
    test(`${path} renders visible images with non-zero naturalWidth`, async ({ page }) => {
      // Collect every /api/media/proxy response that fires during the page
      // visit; assert none returned an error status. Captured on the page
      // object before navigation so the listener is registered first.
      const proxyFailures: Array<{ url: string; status: number }> = [];
      const onResponse = (resp: Response) => {
        if (resp.url().includes('/api/media/proxy')) {
          const status = resp.status();
          if (status >= 400) proxyFailures.push({ url: resp.url(), status });
        }
      };
      page.on('response', onResponse);

      await page.goto(path);
      // Cards arrive via client-side fetch; wait for the first image to
      // settle. The `glass-card` selector covers both Featured (homepage)
      // and Search variants.
      await page.waitForSelector('.glass-card img', { timeout: 20_000 });
      // Give image loads a moment to complete; Playwright doesn't have a
      // built-in "all images loaded" wait. The auditor confirmed first-card
      // image dimensions of 3239x2160 typically settle within 2-3 s of
      // first paint over a fast connection.
      await page.waitForTimeout(2000);

      const imgStats = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.glass-card img'));
        return imgs.map((img) => {
          const rect = img.getBoundingClientRect();
          return {
            src: img.currentSrc || img.src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            complete: img.complete,
            visible: rect.width > 0 && rect.height > 0,
          };
        });
      });

      const visibleLoaded = imgStats.filter((s) => s.visible && s.complete);
      // At least 4 visible loaded images at desktop-1440. A typical search
      // page returns 6-18 cards each with ≥1 image; this lower bound is
      // forgiving of slow-network test runs.
      expect(visibleLoaded.length).toBeGreaterThanOrEqual(4);

      // Every visible+loaded image must have real pixel dimensions.
      for (const s of visibleLoaded) {
        expect(s.naturalWidth, `naturalWidth for ${s.src}`).toBeGreaterThan(0);
        expect(s.naturalHeight, `naturalHeight for ${s.src}`).toBeGreaterThan(0);
      }

      // No proxy failure during the page visit.
      expect(
        proxyFailures,
        `unexpected /api/media/proxy non-2xx responses: ${JSON.stringify(proxyFailures)}`
      ).toEqual([]);

      page.off('response', onResponse);
    });
  }
});
