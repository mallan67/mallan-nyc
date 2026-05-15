/**
 * F1 (PR-FE.1, 2026-05-15) — Mobile search-result cards must NOT overflow.
 *
 * Pre-fix symptom (captured by the frontend-auditor sub-agent at
 * `artifacts/frontend-audit-2026-05-15/screenshots/search-rent_mobile-390.png`):
 * `app/search/page.tsx:1067` had `grid grid-cols-2 gap-2` with no responsive
 * prefix. At 390 px viewport (mobile) the split-view listings panel still
 * rendered 2 columns × ~290 px = ~580 px of cards inside a 390 px viewport,
 * clipped by `overflow-y-auto` on the parent.
 *
 * Fix: `grid grid-cols-1 lg:grid-cols-2 gap-2` so split-view collapses to
 * 1 column below the `lg` (1024 px) breakpoint. The map column (line ~1094)
 * is already `hidden lg:block` so mobile owns the full width.
 *
 * This spec proves:
 *   1. At least 6 listing cards render on /search?tab=rent-residential
 *   2. Every visible card's bounding box width <= window.innerWidth + 1
 *      (the +1 tolerates sub-pixel rounding on high-DPR devices)
 *   3. The document does NOT have horizontal overflow
 *      (document.scrollingElement.scrollWidth <= clientWidth + 1)
 *
 * Note on baseURL: configured via `PLAYWRIGHT_BASE_URL` env var in
 * `playwright.config.ts`. To run against your local dev server:
 *   npm run dev
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test \
 *     tests/e2e/search-mobile.spec.ts
 */
import { test, expect } from '@playwright/test';

test.describe('F1 — mobile search cards (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro logical viewport

  test('rent-residential cards fit inside the 390 px viewport', async ({ page }) => {
    await page.goto('/search?tab=rent-residential');

    // Wait for the listings grid to populate. The page fetches client-side via
    // `useEffect`, so we wait for at least one card to appear. The class
    // `glass-card` is the canonical card chrome shared by SplitCard / GridCard
    // / ListCard variants on `app/search/page.tsx`.
    await page.waitForSelector('.glass-card', { timeout: 20_000 });

    const cards = page.locator('.glass-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(6);

    // Every visible card's width must fit within viewport + 1 px rounding tolerance.
    const innerWidth = await page.evaluate(() => window.innerWidth);
    for (let i = 0; i < Math.min(cardCount, 12); i++) {
      const box = await cards.nth(i).boundingBox();
      // Some cards may be off-screen (below the fold) — skip those.
      if (!box) continue;
      expect(box.width).toBeLessThanOrEqual(innerWidth + 1);
    }
  });

  test('document has no horizontal overflow on rent-residential', async ({ page }) => {
    await page.goto('/search?tab=rent-residential');
    await page.waitForSelector('.glass-card', { timeout: 20_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('buy-residential cards also fit (no regression from rent fix)', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await page.waitForSelector('.glass-card', { timeout: 20_000 });

    const cards = page.locator('.glass-card');
    const innerWidth = await page.evaluate(() => window.innerWidth);
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(6);

    for (let i = 0; i < Math.min(cardCount, 12); i++) {
      const box = await cards.nth(i).boundingBox();
      if (!box) continue;
      expect(box.width).toBeLessThanOrEqual(innerWidth + 1);
    }
  });

  /**
   * Codex review of PR-FE.1 (2026-05-15) — the original F1 patch fixed
   * the LOADED grid (line ~1113) but missed the SKELETON grid (line ~1066)
   * which was still `grid grid-cols-2` unconditional. That caused:
   *   (a) Mobile overflow during the loading state — skeleton tiles at
   *       2 cols × ~290 px = ~580 px inside a 390 px viewport
   *   (b) A 2→1 column CLS jump when the data arrived and replaced the
   *       skeleton with the (already-fixed) responsive loaded grid
   *
   * This spec proves the skeleton state also has no overflow at 390 px.
   * We intercept `/api/listings` to delay it by 5 s, which keeps the
   * skeleton visible long enough to measure. The skeleton tiles share the
   * same `animate-pulse` class on `.bg-gray-100.rounded-xl`.
   */
  test('skeleton state has no horizontal overflow at 390 px', async ({ page }) => {
    // Delay the listings fetch so the skeleton state stays visible long
    // enough to measure. 5 s is plenty for Playwright to take the
    // measurement; the test still completes within the 30 s default
    // timeout.
    await page.route('**/api/listings?*', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });

    // Don't `waitForLoadState('networkidle')` — that would wait for the
    // delayed fetch to settle. We want to observe DURING the skeleton.
    await page.goto('/search?tab=rent-residential', { waitUntil: 'domcontentloaded' });

    // Wait for at least one skeleton tile to render. The skeleton tiles
    // are unique to the loading state and have the `animate-pulse` +
    // `aspect-[3/2]` shape.
    const skeleton = page.locator('.animate-pulse.bg-gray-100.rounded-xl').first();
    await skeleton.waitFor({ state: 'visible', timeout: 10_000 });

    // No horizontal overflow on the document during skeleton paint.
    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Every visible skeleton tile fits within the 390 px viewport.
    const tiles = page.locator('.animate-pulse.bg-gray-100.rounded-xl');
    const tileCount = await tiles.count();
    expect(tileCount).toBeGreaterThan(0);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    for (let i = 0; i < Math.min(tileCount, 8); i++) {
      const box = await tiles.nth(i).boundingBox();
      if (!box) continue;
      expect(box.width).toBeLessThanOrEqual(innerWidth + 1);
    }
  });
});
