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

/**
 * A1b — a REAL touch phone and tablet (2026-11-02).
 *
 * Why the A1 block above could not see this: it runs a plain desktop-style viewport. app/globals.css gives
 * every <button> and <a> a 44×44px minimum under `@media (pointer: coarse)`, which is false in that
 * context, and a desktop viewport never widens its layout to fit overflowing content. On a real touch
 * phone the 17-photo listing's 6px gallery dots became 44px buttons (812px of them), the layout viewport
 * grew from 390px to ~601px, the sticky bar showed "$3,295,…", and at 360px SocialShareBar's non-wrapping
 * icon row widened every listing by 10px.
 *
 * `hasTouch` + `isMobile` is what makes Chromium behave like that phone: coarse pointer, viewport meta
 * honoured, layout viewport free to grow. Every assertion below is on that.
 *
 * Listings under test: E2E_LISTING_PATHS (comma-separated paths, e.g. a 1-photo, a 17-photo and a
 * 50-photo listing, sale and rental) or, when unset, one live listing.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_LISTING_PATHS=/listing/a/rls1,/listing/b/rls2 \
 *   npx playwright test tests/e2e/listing-detail-mobile.spec.ts
 */
const TOUCH_SIZES = [
  { name: 'Galaxy 360', width: 360, height: 800 },
  { name: 'iPhone 390', width: 390, height: 844 },
  { name: 'Pixel 412', width: 412, height: 915 },
  { name: 'iPad 820', width: 820, height: 1180 },
] as const;

async function listingPaths(page: Page): Promise<string[]> {
  const fromEnv = (process.env.E2E_LISTING_PATHS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return [`/listing/${await resolveListingSlug(page)}`];
}

async function openListing(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForSelector('section.bg-stone-100', { timeout: 30_000 });
  await page.waitForTimeout(1500); // hydration: the dots, counter and arrows are client components
}

for (const size of TOUCH_SIZES) {
  test.describe(`A1b — touch device ${size.name} (${size.width}px, pointer: coarse)`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('the layout viewport is not widened and nothing scrolls sideways', async ({ page }) => {
      for (const path of await listingPaths(page)) {
        await openListing(page, path);
        const m = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          coarse: window.matchMedia('(pointer: coarse)').matches,
        }));
        expect(m.coarse, `${path}: the emulated device must be a coarse pointer, or this test proves nothing`).toBe(true);
        expect(m.innerWidth, `${path}: layout viewport grew past the device width`).toBe(size.width);
        expect(m.scrollWidth, `${path}: page is wider than the device`).toBeLessThanOrEqual(size.width + 1);
      }
    });

    test('the sticky-bar price is shown in full and nothing sits on top of it', async ({ page }) => {
      for (const path of await listingPaths(page)) {
        await openListing(page, path);
        const bar = await page.evaluate(() => {
          const el = [...document.querySelectorAll('div.sticky')].find((e) => e.className.includes('lg:hidden'));
          const price = el?.querySelector('p');
          if (!el || !price) return null;
          const pr = price.getBoundingClientRect();
          const actions = [...el.querySelectorAll('a,button')].map((e) => e.getBoundingClientRect());
          return {
            text: price.textContent?.trim() ?? '',
            shown: price.clientWidth,
            needed: price.scrollWidth,
            overlaps: actions.some((r) => r.left < pr.right - 0.5 && r.right > pr.left && r.top < pr.bottom && r.bottom > pr.top),
            rightmost: Math.max(0, ...actions.map((r) => r.right)),
            actionCount: actions.length,
          };
        });
        expect(bar, `${path}: sticky bar not found`).not.toBeNull();
        expect(bar!.text).toMatch(/^\$[\d,]+(\/mo)?$/);
        expect(bar!.needed, `${path}: "${bar!.text}" is clipped (${bar!.shown}px shown, ${bar!.needed}px needed)`).toBeLessThanOrEqual(bar!.shown);
        expect(bar!.overlaps, `${path}: an action sits on the price`).toBe(false);
        expect(bar!.rightmost, `${path}: an action is off-screen`).toBeLessThanOrEqual(size.width);
        expect(bar!.actionCount, `${path}: Save, Call and Inquire must all still be there`).toBeGreaterThanOrEqual(3);
      }
    });

    test('gallery: bounded inert dots, and arrows, counter, swipe and touch targets all work', async ({ page }) => {
      for (const path of await listingPaths(page)) {
        await openListing(page, path);
        const counter = page.locator('[aria-live="polite"]').first();
        if ((await counter.count()) === 0) continue; // single photo: no dots, counter or arrows by design

        const total = Number(((await counter.textContent()) ?? '').split('/')[1]);
        expect(total, `${path}: counter should read 1/N`).toBeGreaterThan(1);

        // dots: phones only, never buttons, never more than 7
        const dots = await page.evaluate(() => {
          const box = document.querySelector('[data-photo-dots]');
          if (!box) return null;
          const r = box.getBoundingClientRect();
          return { spans: box.querySelectorAll(':scope > span').length, buttons: box.querySelectorAll('button').length, width: r.width, display: getComputedStyle(box).display };
        });
        if (size.width < 768) {
          expect(dots, `${path}: dot indicator missing on a phone`).not.toBeNull();
          expect(dots!.buttons).toBe(0);
          expect(dots!.spans).toBe(Math.min(total, 7));
          expect(dots!.width).toBeLessThan(size.width);
        } else {
          expect(dots === null || dots.display === 'none', `${path}: dots are phone-only`).toBe(true);
        }

        // previous / next keep a 44px touch target
        const next = page.getByRole('button', { name: 'Next photo' });
        const prev = page.getByRole('button', { name: 'Previous photo' });
        for (const b of [next, prev]) {
          const box = await b.boundingBox();
          expect(box, `${path}: arrow missing`).not.toBeNull();
          expect(box!.width).toBeGreaterThanOrEqual(43.5);
          expect(box!.height).toBeGreaterThanOrEqual(43.5);
        }

        // real taps
        await next.tap();
        await expect(counter).toHaveText(new RegExp(`^2/${total}$`));
        await prev.tap();
        await expect(counter).toHaveText(new RegExp(`^1/${total}$`));

        // a real swipe (CDP touch events through the page's own touch handlers): left advances
        const surface = page.locator('.touch-pan-y').first();
        const sb = await surface.boundingBox();
        expect(sb, `${path}: swipe surface missing`).not.toBeNull();
        const cdp = await page.context().newCDPSession(page);
        const y = sb!.y + Math.min(sb!.height / 2, 200);
        const xs = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2].map((f) => sb!.x + sb!.width * f);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xs[0], y }] });
        for (const x of xs.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(counter).toHaveText(new RegExp(`^2/${total}$`));
      }
    });

    test('the market card request on the listing page does not fail', async ({ page }) => {
      const statuses: number[] = [];
      page.on('response', (r) => { if (r.url().includes('/api/market')) statuses.push(r.status()); });
      for (const path of await listingPaths(page)) {
        await openListing(page, path);
        await page.mouse.wheel(0, 4000); // the card may load lazily
        await page.waitForTimeout(2500);
      }
      expect(statuses.filter((s) => s >= 400), 'GET /api/market answered an error to the listing page').toEqual([]);
    });
  });
}
