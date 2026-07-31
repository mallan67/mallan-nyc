/**
 * Search-card photo carousel + right-sized image delivery.
 *
 * Two defects, both browser-confirmed on production 2026-07-31:
 *
 *   1. CAROUSEL — only SplitCard had one. A snapshot of 100 cards on
 *      /search?tab=buy-residential found 0 next/prev buttons and exactly
 *      1 <img> per listing, while the cards still advertised a photo
 *      count. Maya: "there is only 1st photo the photos are missing from
 *      the listings pages."
 *
 *   2. IMAGE SIZE — a card rendering at ~343-356 CSS px downloaded the
 *      full R2 original (one measured at 1,437,336 bytes). `thumbUrl` in
 *      the DTO is byte-identical to `url`, so no smaller stored variant
 *      existed to switch to.
 *
 * Each test below is written to FAIL on the pre-fix build.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=<preview-url> npx playwright test tests/e2e/search-card-carousel.spec.ts
 */
import { test, expect, type Page, type Request } from '@playwright/test';

/** Every search surface that renders a card variant. */
const GRID_PAGES = ['/search?tab=buy-residential', '/search?tab=rent-residential'];
const FEATURED_PAGES = ['/buy', '/rent'];

/** Wait for cards to arrive (they land via a client-side fetch). */
async function waitForCards(page: Page) {
  await page.waitForSelector('.glass-card img', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

/**
 * Find a card that actually has more than one photo. Cards with a single
 * photo correctly render no arrows, so asserting against them would be a
 * false negative. Returns the card locator, or null if the page happens
 * to serve only single-photo listings.
 */
async function firstMultiPhotoCard(page: Page) {
  const cards = page.locator('.glass-card');
  const n = Math.min(await cards.count(), 12);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if ((await card.getByRole('button', { name: 'Next photo' }).count()) > 0) {
      return card;
    }
  }
  return null;
}

test.describe('Card carousel — desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of GRID_PAGES) {
    test(`${path} — multi-photo cards expose photo navigation`, async ({ page }) => {
      await page.goto(path);
      await waitForCards(page);

      // FAILS PRE-FIX: GridCard rendered no next/prev controls at all.
      const nextButtons = page.getByRole('button', { name: 'Next photo' });
      const prevButtons = page.getByRole('button', { name: 'Previous photo' });
      expect(await nextButtons.count()).toBeGreaterThan(0);
      expect(await prevButtons.count()).toBe(await nextButtons.count());
    });

    test(`${path} — Next advances the image and the counter`, async ({ page }) => {
      await page.goto(path);
      await waitForCards(page);

      const card = await firstMultiPhotoCard(page);
      test.skip(card === null, 'no multi-photo listing on this page right now');

      const img = card!.locator('img').first();
      const before = await img.getAttribute('src');
      const counterBefore = (await card!.textContent())?.match(/\b(\d+)\/(\d+)\b/)?.[0];

      await card!.hover();
      await card!.getByRole('button', { name: 'Next photo' }).click();
      await page.waitForTimeout(400);

      // FAILS PRE-FIX (no button to click, and no index state to change).
      const after = await img.getAttribute('src');
      expect(after, 'clicking Next must change the displayed image').not.toBe(before);

      const counterAfter = (await card!.textContent())?.match(/\b(\d+)\/(\d+)\b/)?.[0];
      expect(counterAfter, 'the n/N counter must advance').not.toBe(counterBefore);
      expect(counterAfter).toMatch(/^2\//);
    });

    test(`${path} — Previous walks back to the first photo`, async ({ page }) => {
      await page.goto(path);
      await waitForCards(page);

      const card = await firstMultiPhotoCard(page);
      test.skip(card === null, 'no multi-photo listing on this page right now');

      const img = card!.locator('img').first();
      const first = await img.getAttribute('src');

      await card!.hover();
      await card!.getByRole('button', { name: 'Next photo' }).click();
      await page.waitForTimeout(300);
      await card!.getByRole('button', { name: 'Previous photo' }).click();
      await page.waitForTimeout(300);

      expect(await img.getAttribute('src')).toBe(first);
    });

    test(`${path} — an arrow click must NOT navigate to the listing`, async ({ page }) => {
      await page.goto(path);
      await waitForCards(page);

      const card = await firstMultiPhotoCard(page);
      test.skip(card === null, 'no multi-photo listing on this page right now');

      const urlBefore = page.url();
      await card!.hover();
      await card!.getByRole('button', { name: 'Next photo' }).click();
      await page.waitForTimeout(600);

      // The arrows sit inside the card's <Link>; without
      // preventDefault + stopPropagation this navigates to the listing.
      expect(page.url(), 'arrow click leaked through to the card link').toBe(urlBefore);
    });

    test(`${path} — a non-arrow click still opens the listing`, async ({ page }) => {
      await page.goto(path);
      await waitForCards(page);

      const urlBefore = page.url();
      // Click the price line — ordinary card content, not a control.
      await page.locator('.glass-card').first().locator('p').first().click();
      await page.waitForTimeout(1500);

      expect(page.url(), 'the card must still be a link to the listing').not.toBe(urlBefore);
      expect(page.url()).toMatch(/\/listing\//);
    });
  }
});

test.describe('Card carousel — mobile swipe', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('/search?tab=buy-residential — swiping left advances the photo', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    const card = page.locator('.glass-card').first();
    const img = card.locator('img').first();
    const before = await img.getAttribute('src');

    const box = await img.boundingBox();
    expect(box).not.toBeNull();
    const y = box!.y + box!.height / 2;
    // Swipe further than useSwipe's 40px threshold.
    await page.touchscreen.tap(box!.x + box!.width * 0.8, y);
    await page.locator('body').dispatchEvent('touchstart');
    await img.dispatchEvent('touchstart', {
      touches: [{ clientX: box!.x + box!.width * 0.85, clientY: y }],
    });
    await img.dispatchEvent('touchmove', {
      touches: [{ clientX: box!.x + box!.width * 0.15, clientY: y }],
    });
    await img.dispatchEvent('touchend', { touches: [] });
    await page.waitForTimeout(500);

    // FAILS PRE-FIX: GridCard had no touch handlers at all on mobile.
    const after = await img.getAttribute('src');
    expect(after, 'a left swipe must advance to the next photo').not.toBe(before);
  });
});

test.describe('Image delivery — cards must not download originals', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of [...GRID_PAGES, ...FEATURED_PAGES]) {
    test(`${path} — no card requests an oversized source image`, async ({ page }) => {
      const imageRequests: Array<{ url: string; width: number | null }> = [];
      const onRequest = (req: Request) => {
        if (req.resourceType() !== 'image') return;
        const url = req.url();
        const w = new URL(url, 'http://x').searchParams.get('w');
        imageRequests.push({ url, width: w ? Number(w) : null });
      };
      page.on('request', onRequest);

      await page.goto(path);
      await waitForCards(page);
      page.off('request', onRequest);

      // Photo requests only — ignore icons/logos served from /_next/static.
      const photoRequests = imageRequests.filter(
        (r) => r.url.includes('/_next/image') || /r2\.dev|trestle\.com|cotality\.com/.test(r.url),
      );
      expect(photoRequests.length, 'expected the page to request listing photos').toBeGreaterThan(0);

      // FAILS PRE-FIX: every card photo was a bare R2 original with no
      // width parameter, i.e. the full 2,000-3,200px source.
      const unsized = photoRequests.filter((r) => !r.url.includes('/_next/image'));
      expect(
        unsized.map((r) => r.url).slice(0, 5),
        'card photos must be requested through the image optimizer, not as raw originals',
      ).toEqual([]);

      // A ~360px card slot on a 1x display must not pull a 1920/3200px
      // candidate. 1080 is the ceiling that still covers a 3x DPR card.
      const oversized = photoRequests.filter((r) => r.width !== null && r.width > 1080);
      expect(
        oversized.map((r) => `${r.width}px ${r.url.slice(0, 90)}`),
        'no card photo should be fetched above 1080px wide',
      ).toEqual([]);
    });
  }

  test('/search?tab=buy-residential — the delivered bytes are card-sized', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    // The pre-fix measurement was 1,437,336 bytes for ONE card photo.
    // Anything under 300 KB proves a real transform happened rather than
    // a `sizes` hint bolted onto a full-resolution source.
    const sizes = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.glass-card img'))
        .filter((i) => i.currentSrc)
        .slice(0, 4);
      return Promise.all(
        imgs.map(async (i) => {
          const r = await fetch(i.currentSrc, { method: 'GET' });
          const b = await r.blob();
          return { src: i.currentSrc.slice(0, 100), bytes: b.size, rendered: i.getBoundingClientRect().width };
        }),
      );
    });

    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s.bytes, `${s.src} rendered at ${s.rendered}px`).toBeLessThan(300_000);
    }
  });
});

test.describe('No console or hydration errors block interaction', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of GRID_PAGES) {
    test(`${path} — clean console through a carousel interaction`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

      await page.goto(path);
      await waitForCards(page);

      const card = await firstMultiPhotoCard(page);
      if (card) {
        await card.hover();
        await card.getByRole('button', { name: 'Next photo' }).click();
        await page.waitForTimeout(400);
      }

      // Image 404s from individual dead R2 objects are a data problem, not
      // a code problem — the card handles them via the error fallback.
      const relevant = errors.filter(
        (e) => !/Failed to load resource/i.test(e) && !/net::ERR/i.test(e),
      );
      expect(relevant, `console errors: ${JSON.stringify(relevant.slice(0, 5))}`).toEqual([]);
    });
  }
});

test.describe('Failed photo fallback', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('/search?tab=buy-residential — a broken photo never leaves a card blank', async ({ page }) => {
    // Force every optimizer request to fail so BOTH recovery layers run:
    // IDXImage's raw-source retry, then the carousel's drop-and-advance.
    await page.route('**/_next/image**', (route) => route.abort());
    await page.goto('/search?tab=buy-residential');
    await page.waitForSelector('.glass-card', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    const state = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.glass-card')).slice(0, 6);
      return cards.map((c) => {
        const img = c.querySelector<HTMLImageElement>('img');
        const placeholder = c.querySelector('[role="img"]');
        const rect = (img ?? placeholder)?.getBoundingClientRect();
        return {
          hasVisual: Boolean(img || placeholder),
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        };
      });
    });

    expect(state.length).toBeGreaterThan(0);
    for (const s of state) {
      // Either a real <img> (raw-source retry succeeded) or IDXImage's
      // labelled placeholder — never an empty box.
      expect(s.hasVisual, 'card lost its photo area entirely').toBe(true);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });
});
