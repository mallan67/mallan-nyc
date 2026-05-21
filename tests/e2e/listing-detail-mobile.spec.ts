/**
 * A1 (PR-A1-grid-fix, 2026-05-20) — Listing-detail mobile-overflow regression pin.
 *
 * Pre-fix symptom (captured by the frontend-auditor sub-agent in
 * docs/audits/exclusive-launch-readiness-audit-2026-05-20.md A1):
 * `app/listing/[id]/page.tsx:1192` declared
 *     `grid lg:grid-cols-3 gap-8 lg:gap-10`
 * which created a CSS Grid container on ALL viewports. At <lg (390 px) the
 * grid had no explicit `grid-template-columns` rule, so the single implicit
 * column stretched to fit the widest child. Frontend-auditor measurement
 * showed `gridTemplateColumns: "1640px"` at 390 px viewport, and `body
 * { overflow-x: hidden }` cosmetically masked the horizontal scroll
 * (scrollX measured 1266 on mobile). Affects EVERY listing detail page,
 * sale + rental.
 *
 * Fix: replaced with
 *     `flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10`
 * so <lg stacks vertically (no horizontal columns) and lg+ uses the
 * original 3-column grid (byte-identical desktop behavior).
 *
 * This spec proves:
 *   1. At 390 px on a real production listing detail URL, the document does
 *      NOT have horizontal overflow:
 *          document.documentElement.scrollWidth ===
 *          document.documentElement.clientWidth
 *   2. Every top-level <section> inside <main> fits within the 390 px
 *      viewport (no inner section overflows).
 *   3. The price hero + photo gallery + agent contact CTA all render
 *      without forcing horizontal scroll.
 *
 * To reproduce locally:
 *   npm run dev
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test \
 *     tests/e2e/listing-detail-mobile.spec.ts
 *
 * Against production:
 *   PLAYWRIGHT_BASE_URL=https://mallan.nyc npx playwright test \
 *     tests/e2e/listing-detail-mobile.spec.ts
 *
 * Red-green proof: running this spec against commit `dd9475cd` (pre-fix
 * main) fails on the scrollWidth assertion; running against this branch
 * passes.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Pick a real listing slug at runtime. We hit the public /api/listings
 * reader (1 row) and use the returned slug so the test stays green even
 * as inventory changes. Fallback to a hardcoded recent slug if the API
 * is unreachable (preview deployments without DB access).
 */
async function resolveListingSlug(page: Page): Promise<string> {
  try {
    const res = await page.request.get('/api/listings?limit=1');
    if (res.ok()) {
      const json = (await res.json()) as { listings?: Array<{ slug?: string }> };
      const slug = json?.listings?.[0]?.slug;
      if (slug && typeof slug === 'string') return slug;
    }
  } catch {
    // Fall through to hardcoded slug.
  }
  // Hardcoded fallback — a known-active listing slug from the audit doc.
  return '815-5th-avenue-apt-duplex-new-york-city-ny-10065-rls20091223';
}

test.describe('A1 — listing-detail mobile (390 px) overflow', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro logical viewport

  test('document has no horizontal overflow on /listing/[id] at 390 px', async ({ page }) => {
    const slug = await resolveListingSlug(page);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });

    // Wait for the main content to render. The listing detail page renders
    // the price hero <section> inside <main>; this is server-rendered, so
    // it should be visible without further client-side hydration.
    await page.waitForSelector('main section', { timeout: 20_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    // Pre-fix: scrollWidth ≈ 1640, clientWidth = 390.
    // Post-fix: scrollWidth ≤ clientWidth + 1 (sub-pixel tolerance).
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('every <section> inside <main> fits within 390 px viewport', async ({ page }) => {
    const slug = await resolveListingSlug(page);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const innerWidth = await page.evaluate(() => window.innerWidth);
    const sections = page.locator('main section');
    const count = await sections.count();
    expect(count).toBeGreaterThan(0);

    // Measure up to 20 sections — covers price hero, gallery, description,
    // details, fees, building info, calculators, transit, similar listings.
    const limit = Math.min(count, 20);
    for (let i = 0; i < limit; i++) {
      const box = await sections.nth(i).boundingBox();
      if (!box) continue;
      expect(box.width, `section ${i} width`).toBeLessThanOrEqual(innerWidth + 1);
    }
  });

  test('scrollingElement also confirms no horizontal scroll', async ({ page }) => {
    // Belt-and-braces — verify the same property on the scrolling element
    // (which can differ from documentElement in some quirks-mode pages).
    const slug = await resolveListingSlug(page);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe('A1 — listing-detail desktop (1440 px) layout unchanged', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('renders 3-column grid layout at lg+ breakpoint (no regression)', async ({ page }) => {
    const slug = await resolveListingSlug(page);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    // The outer container should resolve to a CSS Grid at 1440 px with
    // 3 columns (per the `lg:grid lg:grid-cols-3` class). Pre-fix used
    // `grid lg:grid-cols-3` — both resolve to display: grid at lg+, so
    // visual behavior is unchanged.
    const outerDisplay = await page.evaluate(() => {
      // The outer grid wrapper is the direct child of `<main>` → `.max-w-7xl`.
      // We pick the first descendant of <main> that has display: grid.
      const main = document.querySelector('main');
      if (!main) return null;
      const all = Array.from(main.querySelectorAll('div'));
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'grid') {
          return {
            display: cs.display,
            gridTemplateColumns: cs.gridTemplateColumns,
          };
        }
      }
      return null;
    });

    expect(outerDisplay).not.toBeNull();
    expect(outerDisplay!.display).toBe('grid');
    // gridTemplateColumns at 1440 px should be 3 tracks (e.g.
    // "<n>px <n>px <n>px"). The simplest stable assertion is that it
    // contains at least 2 whitespace-separated tokens (i.e. > 1 column).
    const tokens = outerDisplay!.gridTemplateColumns.trim().split(/\s+/);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
  });
});
