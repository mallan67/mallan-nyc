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
 *
 * If you need machine-readable output, write it into an ALREADY-IGNORED
 * artifact directory rather than the repo root — a stray reporter file
 * at the root once got committed, and the "fix" of ignoring its filename
 * repo-wide was worse than the problem (`sw*.json` would swallow a real
 * swagger.json, `r2.json` a real Cloudflare config):
 *   … --reporter=json > test-results/run.json
 */
import { test, expect, type Page, type Request } from '@playwright/test';
// The ladder is the single source of truth for the expected rung — the
// test must not hardcode widths that can drift from the config.
import { CARD_IMAGE_WIDTHS } from '../../lib/media/responsive-image';

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
/**
 * Read the "n/N" position readout.
 *
 * Must target the counter element, NOT the card's textContent: the badge
 * abuts the "3D Tour" pill with no separator, so a card renders
 * `1/343D Tour…` and a `\b\d+\/\d+\b` regex over the text finds nothing.
 */
async function counterText(card: ReturnType<Page['locator']>) {
  const el = card.locator('[aria-live]').first();
  return (await el.count()) > 0 ? (await el.textContent())?.trim() : undefined;
}

/**
 * Simulate a horizontal swipe with real TouchEvents.
 *
 * `locator.dispatchEvent` does not produce Touch objects that React's
 * synthetic handler can read `touches[0].clientX` from, so the events are
 * constructed in the page. `direction: 'left'` advances to the next photo.
 */
async function swipe(page: Page, selector: string, direction: 'left' | 'right') {
  await page.evaluate(
    ({ selector, direction }) => {
      const img = document.querySelector<HTMLImageElement>(selector);
      if (!img) throw new Error(`no element for ${selector}`);
      const area = (img.closest('.touch-pan-y') as HTMLElement) ?? img.parentElement!;
      const r = area.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const from = direction === 'left' ? r.right - 20 : r.left + 20;
      const to = direction === 'left' ? r.left + 20 : r.right - 20;
      const fire = (type: string, x: number) => {
        const t = new Touch({ identifier: 1, target: area, clientX: x, clientY: y });
        const empty = type === 'touchend';
        area.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: empty ? [] : [t],
            targetTouches: empty ? [] : [t],
            changedTouches: [t],
          }),
        );
      };
      fire('touchstart', from);
      fire('touchmove', to);
      fire('touchend', to);
    },
    { selector, direction },
  );
  await page.waitForTimeout(600);
}

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
      const counterBefore = await counterText(card!);
      expect(counterBefore, 'a multi-photo card must show a position counter').toMatch(/^1\//);

      await card!.hover();
      await card!.getByRole('button', { name: 'Next photo' }).click();
      await page.waitForTimeout(400);

      // FAILS PRE-FIX (no button to click, and no index state to change).
      const after = await img.getAttribute('src');
      expect(after, 'clicking Next must change the displayed image').not.toBe(before);

      const counterAfter = await counterText(card!);
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
    const counterBefore = await counterText(card);

    await swipe(page, '.glass-card img', 'left');

    // FAILS PRE-FIX: GridCard had no touch handlers at all on mobile.
    const after = await img.getAttribute('src');
    expect(after, 'a left swipe must advance to the next photo').not.toBe(before);
    if (counterBefore) {
      expect(await counterText(card), 'the counter must follow the swipe').not.toBe(counterBefore);
    }

    // …and swiping back returns to the first photo.
    await swipe(page, '.glass-card img', 'right');
    expect(await img.getAttribute('src')).toBe(before);
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

      // These runs are 1x DPR, and the widest card measured is ~610px
      // (all-listings), so nothing should need more than an 828 candidate.
      // The 1200/1920 entries in CARD_IMAGE_WIDTHS exist for retina and
      // must NOT be selected here — if they are, `sizes` is over-declaring.
      const oversized = photoRequests.filter((r) => r.width !== null && r.width > 828);
      expect(
        oversized.map((r) => `${r.width}px ${r.url.slice(0, 90)}`),
        'no card photo should be fetched above 828px wide at 1x DPR',
      ).toEqual([]);
    });
  }

  test('/search?tab=buy-residential — the delivered bytes are card-sized', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    // Premium standard q=85 raises bytes ~40-60% vs q=75; the pre-fix
    // measurement was 1,443,781 bytes for ONE card photo
    // (3239x2160). Anything under 200 KB proves a real transform happened
    // rather than a `sizes` hint bolted onto a full-resolution source.
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
      // Threshold accounts for the premium q=85 standard, which costs
      // roughly 40-60% more bytes than Next's default q=75. Still an
      // order of magnitude below the 1,443,781-byte original this
      // replaced — the point is right-sizing, not maximum compression.
      expect(s.bytes, `${s.src} rendered at ${s.rendered}px`).toBeLessThan(250_000);
    }
  });
});

test.describe('Card images stay within the premium resolution tolerance, without rung escalation', () => {
  /**
   * REGRESSION GUARD for the 641-767px blur (found by Codex review,
   * 2026-08-02; live on production until fixed).
   *
   * Every GridCard layout is one column until Tailwind md = 768px, but
   * the `sizes` hint switched to 50vw at 641px. Cards in that band were
   * full width and received a half-width image:
   *   700px @1x -> rendered 693, received 384  = 0.55x
   *   700px @2x -> rendered 695, received 828  = 0.60x
   *
   * The original test matrix was 390/1440/1920 and skipped the entire
   * 641-1023 band, which is exactly why this shipped. This sweep walks
   * the breakpoint edges so a `sizes` value that disagrees with the CSS
   * cannot pass again.
   */
  // Each view mode uses a DIFFERENT sizeProfile, so string-level unit
  // tests are not a substitute for selecting each layout in a browser.
  // The default URL only ever exercises all-listings (below lg) and
  // split (at lg+), which left list and the 3-col grid view untested.
  const MODES: Array<{ view: string; url: string; widths: number[] }> = [
    { view: 'all-listings', url: '&view=all-listings', widths: [360, 639, 640, 700, 767, 768, 800, 900, 1023, 1024, 1440, 1920] },
    { view: 'grid',         url: '&view=grid',         widths: [768, 900, 1023, 1024, 1280, 1440, 1920] },
    { view: 'list',         url: '&view=list',         widths: [360, 639, 640, 768, 1024, 1440, 1920] },
    { view: 'split',        url: '&view=split',        widths: [1024, 1280, 1440, 1920] },
  ];

  for (const mode of MODES) {
  for (const width of mode.widths) {
    for (const dpr of [1, 2]) {
      test(`${mode.view} ${width}px @${dpr}x — correct rung (no escalation)`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: dpr,
        });
        const page = await ctx.newPage();
        try {
          await page.goto(`/search?tab=buy-residential${mode.url}`);
          await page.waitForSelector('.glass-card img', { timeout: 30_000 });
          await page
            .waitForFunction(
              () => {
                const i = document.querySelector<HTMLImageElement>('.glass-card img');
                return Boolean(i?.currentSrc?.includes('/_next/image'));
              },
              { timeout: 15_000 },
            )
            .catch(() => {});

          const r = await page.evaluate(() => {
            const i = document.querySelector<HTMLImageElement>('.glass-card img');
            if (!i) return null;
            const u = new URL(i.currentSrc, location.origin);
            return {
              rendered: Math.round(i.getBoundingClientRect().width),
              chosen: Number(u.searchParams.get('w')),
              sizes: i.getAttribute('sizes'),
              currentSrc: i.currentSrc,
              optimized: i.currentSrc.includes('/_next/image'),
            };
          });

          // MUST NOT SKIP. Optimizer delivery is part of the contract for
          // these audited card surfaces — an earlier revision of this test
          // returned null and skipped when currentSrc was not an optimizer
          // URL, which turned every delivery failure into a false green.
          expect(r, 'no card image rendered at all').not.toBeNull();
          expect(
            r!.optimized,
            `${width}px @${dpr}x: card was NOT optimizer-served — currentSrc=${r!.currentSrc.slice(0, 120)}`,
          ).toBe(true);

          const need = Math.round(r!.rendered * dpr);
          // FAIL CLOSED. The previous `?? Math.max(...)` fallback meant a
          // need larger than the whole ladder would "expect" the biggest
          // rung and PASS — i.e. genuine under-resolution reported green.
          const expected = CARD_IMAGE_WIDTHS.find((w) => w >= need);
          expect(
            expected,
            `${width}px @${dpr}x: no configured candidate covers ${need}px ` +
              `(ladder tops out at ${Math.max(...CARD_IMAGE_WIDTHS)})`,
          ).toBeDefined();

          // Assert the correct rung WITHOUT upward escalation, allowing
          // the immediately lower rung only within the measured jitter
          // band below. `>= need` alone prevents blur but silently
          // permits gross over-download — it passed a 1920 candidate for
          // a 369px card at the 768px boundary.
          // Rendered width jitters by a pixel or two between runs
          // (scrollbar presence, sub-pixel layout). When `need` sits
          // within that jitter of a rung boundary, either neighbouring
          // rung is a correct selection, so accept both rather than
          // making this permanently flaky. Every real defect found so
          // far was 2-5 rungs off, well outside this band.
          // TOLERANCE IS ONE-SIDED, TOWARD THE SMALLER RUNG.
          //
          // A card measured at 414px may render 412 or 417 between runs,
          // and 414 x 2 = 828 sits exactly on a rung, so the "correct"
          // rung flips with sub-pixel jitter. Accepting the next rung
          // DOWN absorbs that: serving 828 for an 834px need is 0.7%
          // under, imperceptible.
          //
          // Accepting the next rung UP would not be symmetric-and-fair,
          // it would be a loophole. With a two-sided band, a need of 825
          // accepts {828, 1080} — so a 30% over-download passes merely
          // by sitting near a boundary, which is exactly the defect
          // class this assertion exists to expose. One-sided keeps 828
          // for 834 while still rejecting 1080 for 825.
          const JITTER_PX = 3;
          const exact = CARD_IMAGE_WIDTHS.find((w) => w >= need);
          const toleratedLower = CARD_IMAGE_WIDTHS.find(
            (w) => w >= Math.max(1, need - JITTER_PX * dpr),
          );
          const acceptable = new Set(
            [exact, toleratedLower].filter((w): w is number => w !== undefined),
          );
          expect(
            acceptable.has(r!.chosen),
            `${width}px @${dpr}x: rendered ${r!.rendered}px, needs ${need}px, ` +
              `acceptable rung(s) ${[...acceptable].join(' or ')}, received ${r!.chosen} — sizes="${r!.sizes}"`,
          ).toBe(true);
        } finally {
          await ctx.close();
        }
      });
    }
  }
  }
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

      // Two classes of noise are excluded, both verified pre-existing on
      // PRODUCTION (mallan.nyc) on 2026-07-31, i.e. not introduced here:
      //
      //  1. The Google Translate widget's script loads are blocked by the
      //     site CSP, which omits those hosts from `script-src`. Verified
      //     byte-identical on production (mallan.nyc), so it is a
      //     pre-existing site-config issue, not something this PR causes.
      //     It surfaces under several hosts — `translate-pa.googleapis.com`
      //     normally, and `www.google.com/sorry/...` once repeated
      //     automated runs trip Google's rate limiter and it redirects to
      //     the interstitial — so the whole widget is excluded rather
      //     than one hostname.
      //  2. Resource-load failures. On preview deployments the
      //     `/listing/...` route 500s — reproduced on a preview built from
      //     `main` BEFORE this branch existed, and 200 on production — so
      //     it is a preview-environment problem, not a code defect. Dead
      //     individual photo objects also land here and are handled by the
      //     card's error fallback by design.
      //
      // Everything else — React hydration mismatches, thrown errors,
      // anything the carousel interaction could produce — still fails.
      const relevant = errors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/net::ERR/i.test(e) &&
          !/translate-pa\.googleapis\.com|translate\.google\.com|google\.com\/sorry/i.test(e),
      );
      expect(relevant, `console errors: ${JSON.stringify(relevant.slice(0, 5))}`).toEqual([]);
    });
  }
});

test.describe('Interactive markup — arrows are not inside the listing link', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('no carousel button is a descendant of an anchor', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    // The HTML content model forbids interactive content inside <a>.
    // GridCard and ListCard used to wrap the entire card — buttons
    // included — in a single <Link>.
    const nested = await page.evaluate(() => {
      const bad: string[] = [];
      for (const b of Array.from(document.querySelectorAll('button'))) {
        if (b.closest('a')) bad.push(b.getAttribute('aria-label') || b.className.slice(0, 40));
      }
      return bad;
    });
    expect(nested, 'buttons found inside an <a>').toEqual([]);
  });

  test('each card exposes exactly one keyboard-reachable listing link', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    const perCard = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.glass-card'))
        .slice(0, 6)
        .map((c) =>
          Array.from(c.querySelectorAll('a[href^="/listing/"]')).filter(
            (a) => a.getAttribute('tabindex') !== '-1' && a.getAttribute('aria-hidden') !== 'true',
          ).length,
        ),
    );
    expect(perCard.length).toBeGreaterThan(0);
    for (const n of perCard) expect(n).toBe(1);
  });

  test('Tab reaches both arrows; Enter and Space advance the photo', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    const card = await firstMultiPhotoCard(page);
    test.skip(card === null, 'no multi-photo listing on this page right now');

    const img = card!.locator('img').first();
    const next = card!.getByRole('button', { name: 'Next photo' });
    const prev = card!.getByRole('button', { name: 'Previous photo' });

    // Wait on the state change rather than a fixed delay — under
    // parallel workers a fixed 400 ms is not reliably enough.
    const advancesOn = async (key: string, control: typeof next) => {
      const before = await img.getAttribute('src');
      await control.focus();
      expect(
        await control.evaluate((el) => el === document.activeElement),
        'control must be keyboard-focusable',
      ).toBe(true);
      await page.keyboard.press(key);
      await expect
        .poll(() => img.getAttribute('src'), { timeout: 5000 })
        .not.toBe(before);
    };

    await advancesOn('Enter', next);
    expect(page.url(), 'Enter on an arrow must not navigate').toContain('/search');

    // Space activates a native <button> too.
    await advancesOn('Space', next);
    expect(page.url()).toContain('/search');

    // Previous is reachable and works by keyboard as well.
    await advancesOn('Enter', prev);
    expect(page.url(), 'keyboard arrow activation must never navigate').toContain('/search');
  });

  test('Enter on the listing link opens the listing', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    const link = page
      .locator('.glass-card a[href^="/listing/"]')
      .filter({ hasNot: page.locator('[tabindex="-1"]') })
      .first();
    const href = await link.getAttribute('href');
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    expect(page.url()).toContain(href!.split('?')[0]);
  });

  test('FavoriteButton stays independently usable', async ({ page }) => {
    await page.goto('/search?tab=buy-residential');
    await waitForCards(page);

    const fav = page.locator('.glass-card button[aria-label*="avorite"]').first();
    test.skip((await fav.count()) === 0, 'no favorite control rendered');

    const urlBefore = page.url();
    await fav.click();
    await page.waitForTimeout(600);
    expect(page.url(), 'favoriting must not navigate to the listing').toBe(urlBefore);
  });
});

test.describe('Optimizer failure modes — exactly one fallback, never blank', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /**
   * Card photo delivery depends on the Next optimizer being able to fetch
   * the media URL. `/api/media/proxy` still exists because a browser
   * <img> cannot send the Trestle Bearer header — the optimizer fetches
   * server-side instead. If that ever stops working (Trestle tightens
   * access, host de-listed, transform error), IDXImage must fall back to
   * the authenticated proxy EXACTLY ONCE and the card must still render.
   *
   * Each case below breaks `/_next/image` a different way and asserts:
   *   - the card still shows a real image or the labelled placeholder;
   *   - the fallback is attempted at most once per photo (no retry loop).
   */
  const FAILURE_MODES: Array<{ name: string; apply: (page: Page) => Promise<unknown> }> = [
    {
      name: '401 unauthorized',
      apply: (page) =>
        page.route('**/_next/image**', (r) => r.fulfill({ status: 401, body: 'Unauthorized' })),
    },
    {
      name: '403 forbidden',
      apply: (page) =>
        page.route('**/_next/image**', (r) => r.fulfill({ status: 403, body: 'Forbidden' })),
    },
    {
      name: '404 not found',
      apply: (page) =>
        page.route('**/_next/image**', (r) => r.fulfill({ status: 404, body: 'Not Found' })),
    },
    {
      name: 'non-image response body',
      apply: (page) =>
        page.route('**/_next/image**', (r) =>
          r.fulfill({ status: 200, contentType: 'text/html', body: '<html>not an image</html>' }),
        ),
    },
    {
      name: 'timeout / connection failure',
      apply: (page) => page.route('**/_next/image**', (r) => r.abort('timedout')),
    },
  ];

  for (const mode of FAILURE_MODES) {
    test(`optimizer ${mode.name} — falls back to the proxy, card still renders`, async ({ page }) => {
      const optimizerReqs: string[] = [];
      const rawReqs: string[] = [];
      page.on('request', (r) => {
        if (r.resourceType() !== 'image') return;
        const u = r.url();
        if (u.includes('/_next/image')) optimizerReqs.push(u);
        else if (u.includes('/api/media/proxy') || /r2\.dev|cotality\.com/.test(u)) rawReqs.push(u);
      });

      await mode.apply(page);
      await page.goto('/search?tab=buy-residential');
      await page.waitForSelector('.glass-card', { timeout: 30_000 });
      await page.waitForTimeout(4000);

      // 1. No blank card — every card shows a real <img> with pixels, or
      //    IDXImage's labelled placeholder. Never an empty box.
      const state = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.glass-card')).slice(0, 6);
        return cards.map((c) => {
          const img = c.querySelector<HTMLImageElement>('img');
          const placeholder = c.querySelector('[role="img"]');
          const el = (img ?? placeholder) as HTMLElement | null;
          const rect = el?.getBoundingClientRect();
          return {
            hasVisual: Boolean(el),
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            // A loaded <img> has real pixels; the placeholder has none but
            // is a valid rendered state.
            loadedPixels: img ? img.naturalWidth > 0 : null,
            isPlaceholder: !img && Boolean(placeholder),
          };
        });
      });

      expect(state.length).toBeGreaterThan(0);
      for (const s of state) {
        expect(s.hasVisual, 'card lost its photo area entirely').toBe(true);
        expect(s.width).toBeGreaterThan(0);
        expect(s.height).toBeGreaterThan(0);
      }

      // 2. The raw source WAS attempted — proving the fallback fired
      //    rather than the card silently giving up.
      expect(rawReqs.length, 'expected a fallback to the original source').toBeGreaterThan(0);

      // 3. Exactly one fallback per photo, no retry loop. If IDXImage
      //    re-entered optimization after failing, optimizer requests would
      //    grow without bound; cap them at one per distinct URL.
      const uniqueOptimizer = new Set(optimizerReqs);
      expect(
        optimizerReqs.length,
        'optimizer was retried — indicates a fallback loop',
      ).toBeLessThanOrEqual(uniqueOptimizer.size);
    });
  }

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
