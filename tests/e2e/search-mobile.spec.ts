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
});
