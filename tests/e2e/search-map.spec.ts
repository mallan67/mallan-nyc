/**
 * Regression — desktop split/map view must render the Leaflet map
 * with at least one listing marker.
 *
 * The map column at `app/search/page.tsx:1094` is `hidden lg:block` — so
 * map render is intentionally desktop-only. This spec runs at 1440 px to
 * exercise the desktop branch and protects against accidental regressions
 * (CSP block of tile host, MapLibre script failing to load, MapErrorBoundary
 * triggering, or markers not rendering when listings have lat/lng).
 *
 * Proves at desktop-1440:
 *   1. `.leaflet-container` is present and visible on
 *      `/search?tab=buy-residential` and `/search?tab=rent-residential`
 *      in split view.
 *   2. At least one marker (`.leaflet-marker-icon` OR `.price-marker`)
 *      renders. The actual marker class depends on which marker style
 *      SearchMap renders for listings with coordinates — both selectors
 *      are accepted so the test isn't brittle to map-style refactors.
 *   3. The F1 mobile fix did NOT accidentally hide the desktop map
 *      (regression guard for the patch in this same PR).
 */
import { test, expect } from '@playwright/test';

test.describe('Desktop map renders at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const tab of ['buy-residential', 'rent-residential']) {
    test(`/search?tab=${tab} renders the Leaflet container`, async ({ page }) => {
      await page.goto(`/search?tab=${tab}`);

      // Wait for the listings to populate before checking for the map.
      // Without listings the SearchMap component still renders but has
      // nothing to plot, so we need the cards present first.
      await page.waitForSelector('.glass-card', { timeout: 20_000 });

      // The Leaflet container appears asynchronously after MapLibre tiles
      // load. 10 s is generous for a fast network.
      const mapContainer = page.locator('.leaflet-container').first();
      await expect(mapContainer).toBeVisible({ timeout: 10_000 });
    });

    test(`/search?tab=${tab} renders at least one map marker`, async ({ page }) => {
      await page.goto(`/search?tab=${tab}`);
      await page.waitForSelector('.glass-card', { timeout: 20_000 });
      await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 10_000 });

      // Markers settle after the map tiles finish rendering. Give it a
      // beat so all `marker-icon`s / `price-marker`s populate.
      await page.waitForTimeout(2000);

      // Either marker class is acceptable — SearchMap renders one or the
      // other depending on whether the marker has a price label.
      const markerCount = await page.evaluate(() => {
        return document.querySelectorAll(
          '.leaflet-marker-icon, .price-marker, .leaflet-marker-pane > div'
        ).length;
      });
      expect(markerCount).toBeGreaterThan(0);
    });
  }

  test('mobile patch (F1) did NOT accidentally hide the desktop map', async ({ page }) => {
    // Regression guard specific to this PR. F1 changed `grid-cols-2` to
    // `grid-cols-1 lg:grid-cols-2` — the map column is a SIBLING of the
    // listings grid (not inside it), so the F1 change shouldn't touch the
    // map's `hidden lg:block` rule. Verify explicitly.
    await page.goto('/search?tab=buy-residential');
    await page.waitForSelector('.glass-card', { timeout: 20_000 });

    const mapVisible = await page.evaluate(() => {
      const el = document.querySelector('.leaflet-container');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    expect(mapVisible).toBe(true);
  });
});
