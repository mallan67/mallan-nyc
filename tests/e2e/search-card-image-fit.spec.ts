/**
 * Diagnostic probe for the 2026-05-16 card image-fit inconsistency.
 *
 * Reproduces Maya's observation: "15 W 68TH Street card looks correct,
 * 401 WEST Street card shows photo inset/boxed with excess white padding."
 *
 * Reads:
 *   - Every visible listing card on /search?tab=rent-residential (1440px)
 *   - For each card: card bounding box, image bounding box, image
 *     natural dimensions, computed object-fit + object-position
 *   - Flags any card where the image visibly fails to fill its container
 *
 * Writes:
 *   - tests/e2e/_artifacts/search-card-image-fit-1440.json  (data dump)
 *   - tests/e2e/_artifacts/search-card-image-fit-page-1440.png (full page)
 *   - tests/e2e/_artifacts/search-card-image-fit-RLS<id>.png  (per target)
 *
 * Read-only diagnostic. Not a test. Run with:
 *   PLAYWRIGHT_BASE_URL=https://mallan.nyc \
 *     npx playwright test tests/e2e/search-card-image-fit.probe.ts \
 *     --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS = path.resolve(__dirname, '_artifacts');

test.beforeAll(() => {
  if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });
});

interface CardMetric {
  index: number;
  href: string | null;
  addressText: string | null;
  cardBox: { x: number; y: number; w: number; h: number } | null;
  imageBox: { x: number; y: number; w: number; h: number } | null;
  imageContainerBox: { x: number; y: number; w: number; h: number } | null;
  imageContainerHasAspectClass: boolean;
  imgNaturalWidth: number | null;
  imgNaturalHeight: number | null;
  imgComputed: {
    objectFit: string;
    objectPosition: string;
    width: string;
    height: string;
    position: string;
    inset: string;
  } | null;
  imageSrcPrefix: string | null;
  fillsContainer: boolean | null;
}

// Extended probe — sweeps /search rent, /search buy, /buy, /rent at both
// desktop and mobile widths. Captures per-page artifacts so we can compare
// card image-box fits across the FOUR target pages Maya called out.
const SWEEP: Array<{ url: string; viewport: { width: number; height: number }; slug: string }> = [
  { url: '/search?tab=rent-residential&sort=price-desc', viewport: { width: 1440, height: 900 }, slug: 'search-rent-1440' },
  { url: '/search?tab=buy-residential&sort=price-desc',  viewport: { width: 1440, height: 900 }, slug: 'search-buy-1440'  },
  { url: '/buy?sort=price-desc',                         viewport: { width: 1440, height: 900 }, slug: 'buy-1440'         },
  { url: '/rent?sort=price-desc',                        viewport: { width: 1440, height: 900 }, slug: 'rent-1440'        },
  { url: '/search?tab=rent-residential&sort=price-desc', viewport: { width: 390,  height: 844 }, slug: 'search-rent-390'  },
];

for (const sweep of SWEEP) {
  test(`sweep: ${sweep.slug} (${sweep.url})`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium-only probe');
    await page.setViewportSize(sweep.viewport);
    await page.goto(sweep.url, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => {
        const imgs = document.querySelectorAll('a[href^="/listing/"] img, .glass-card img');
        return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
      }, { timeout: 25_000 });
    } catch {
      console.log(`[${sweep.slug}] no card images loaded`);
      await page.screenshot({ path: path.join(ARTIFACTS, `${sweep.slug}-no-images.png`), fullPage: false });
      return;
    }
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.glass-card')) as HTMLElement[];
      return cards.slice(0, 12).map((card, i) => {
        const cb = card.getBoundingClientRect();
        const img = card.querySelector('img') as HTMLImageElement | null;
        const ib = img?.getBoundingClientRect() ?? null;
        const cc = img?.parentElement;
        const ccb = cc?.getBoundingClientRect() ?? null;
        const cs = img ? getComputedStyle(img) : null;
        const p = Array.from(card.querySelectorAll('p')).map((q) => q.textContent?.trim() || '');
        const addr = p.find((t) => /\d.*(Street|Avenue|Place|Road|Way|Lane|Boulevard|Plaza|Square)/i.test(t)) || p[0] || null;
        return {
          i,
          addr,
          card: cb ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : null,
          img: ib ? { x: Math.round(ib.x), y: Math.round(ib.y), w: Math.round(ib.width), h: Math.round(ib.height) } : null,
          container: ccb ? { x: Math.round(ccb.x), y: Math.round(ccb.y), w: Math.round(ccb.width), h: Math.round(ccb.height) } : null,
          containerClass: cc?.className || null,
          natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
          fit: cs?.objectFit ?? null,
          containerAspect: ccb && ccb.width > 0 ? (ccb.width / ccb.height).toFixed(3) : null,
        };
      });
    });
    console.log(`── ${sweep.slug} ────────────────────────────────`);
    for (const m of metrics) {
      const fits = m.img && m.container ? (Math.abs(m.img.h - m.container.h) < 4 ? 'OK' : 'GAP') : '—';
      console.log(`  [${m.i}] ${fits} addr="${m.addr}" card=${m.card?.w}x${m.card?.h} container=${m.container?.w}x${m.container?.h}(ratio=${m.containerAspect}) img=${m.img?.w}x${m.img?.h} natural=${m.natural} fit=${m.fit}`);
    }
    fs.writeFileSync(path.join(ARTIFACTS, `${sweep.slug}.json`), JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: path.join(ARTIFACTS, `${sweep.slug}-fullpage.png`), fullPage: false });
    expect(metrics.length).toBeGreaterThan(0);
  });
}

test('probe: measure every card image-box on /search?tab=rent-residential at 1440px', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'chromium-only probe');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Use sort=price-desc so the two target listings (15 W 68TH, 401 WEST) sit
  // near the top of the result set — they're $100k/mo and $110k/mo rentals.
  await page.goto('/search?tab=rent-residential&sort=price-desc', {
    waitUntil: 'domcontentloaded',
  });

  // Wait until at least one listing card has rendered with an image whose
  // natural dimensions are non-zero. This avoids racing the result load.
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('a[href^="/listing/"] img, [data-testid="listing-card"] img, .glass-card img');
    if (imgs.length === 0) return false;
    return Array.from(imgs).some((img) => (img as HTMLImageElement).naturalWidth > 0);
  }, { timeout: 30_000 });

  // Give animations + lazy-load 1.5 s settle. The IntersectionObserver in
  // IDXImage waits 100 px rootMargin before reveal — without this settle
  // we measure pre-fade-in opacity:0 images.
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate((): CardMetric[] => {
    // `.glass-card` is the outer wrapper for ALL 3 card variants
    // (GridCard <a class="glass-card …">, ListCard <a class="glass-card …">,
    // SplitCard <div class="glass-card …">). Selecting on this class
    // collapses SplitCard's two-<a> internal structure (one wrapping the
    // image, one wrapping the text) into ONE measurement per card.
    // Fallback to the older `a[href^="/listing/"]` selector if the page
    // structure ever changes.
    let cards = Array.from(document.querySelectorAll('.glass-card')) as HTMLElement[];
    if (cards.length === 0) {
      cards = Array.from(document.querySelectorAll('a[href^="/listing/"]')) as HTMLElement[];
    }
    return cards.slice(0, 30).map((card, index) => {
      const cardRect = card.getBoundingClientRect();
      const img = card.querySelector('img') as HTMLImageElement | null;
      const imgRect = img?.getBoundingClientRect() ?? null;
      const imgComputed = img ? getComputedStyle(img) : null;
      const imageContainer = img?.parentElement ?? null;
      const containerRect = imageContainer?.getBoundingClientRect() ?? null;
      const containerClass = imageContainer?.className || '';
      const hasAspect = /aspect-\[/.test(containerClass) || /aspect-(square|video)/.test(containerClass);

      // Find the address text — search for a short text node within the card.
      const candidates = Array.from(card.querySelectorAll('p')).map((p) => p.textContent?.trim() || '');
      const addressText = candidates.find((t) => /\d.*(Street|Avenue|Place|Road|Way|Lane|Boulevard|Plaza|Square)/i.test(t)) || candidates.find((t) => /\b\d{2,5}\b/.test(t)) || candidates[0] || null;

      const fillsContainer = imgRect && containerRect
        ? Math.abs(imgRect.width - containerRect.width) < 2 && Math.abs(imgRect.height - containerRect.height) < 2
        : null;

      return {
        index,
        href: card.getAttribute('href'),
        addressText,
        cardBox: cardRect ? { x: Math.round(cardRect.x), y: Math.round(cardRect.y), w: Math.round(cardRect.width), h: Math.round(cardRect.height) } : null,
        imageBox: imgRect ? { x: Math.round(imgRect.x), y: Math.round(imgRect.y), w: Math.round(imgRect.width), h: Math.round(imgRect.height) } : null,
        imageContainerBox: containerRect ? { x: Math.round(containerRect.x), y: Math.round(containerRect.y), w: Math.round(containerRect.width), h: Math.round(containerRect.height) } : null,
        imageContainerHasAspectClass: hasAspect,
        imgNaturalWidth: img ? img.naturalWidth : null,
        imgNaturalHeight: img ? img.naturalHeight : null,
        imgComputed: imgComputed ? {
          objectFit: imgComputed.objectFit,
          objectPosition: imgComputed.objectPosition,
          width: imgComputed.width,
          height: imgComputed.height,
          position: imgComputed.position,
          inset: imgComputed.inset || `${imgComputed.top}/${imgComputed.right}/${imgComputed.bottom}/${imgComputed.left}`,
        } : null,
        imageSrcPrefix: img?.src ? img.src.slice(0, 120) : null,
        fillsContainer,
      };
    });
  });

  fs.writeFileSync(
    path.join(ARTIFACTS, 'search-card-image-fit-1440.json'),
    JSON.stringify(metrics, null, 2),
  );

  // Find the two target cards.
  const card15W68 = metrics.find((m) => /15 W 68/i.test(m.addressText || '') || /15.*68TH/i.test(m.addressText || '')) || null;
  const card401West = metrics.find((m) => /401 WEST/i.test(m.addressText || '')) || null;

  console.log('── PROBE RESULTS ─────────────────────────────────────');
  console.log(`Total cards measured: ${metrics.length}`);
  console.log(`Target 15 W 68TH:`, card15W68 ? `idx=${card15W68.index} fillsContainer=${card15W68.fillsContainer} cardBox=${JSON.stringify(card15W68.cardBox)} imgBox=${JSON.stringify(card15W68.imageBox)} containerBox=${JSON.stringify(card15W68.imageContainerBox)} natural=${card15W68.imgNaturalWidth}x${card15W68.imgNaturalHeight} fit=${card15W68.imgComputed?.objectFit}` : 'NOT FOUND');
  console.log(`Target 401 WEST:`, card401West ? `idx=${card401West.index} fillsContainer=${card401West.fillsContainer} cardBox=${JSON.stringify(card401West.cardBox)} imgBox=${JSON.stringify(card401West.imageBox)} containerBox=${JSON.stringify(card401West.imageContainerBox)} natural=${card401West.imgNaturalWidth}x${card401West.imgNaturalHeight} fit=${card401West.imgComputed?.objectFit}` : 'NOT FOUND');
  console.log('');
  console.log('Cards NOT filling container (>2px gap on width or height):');
  for (const m of metrics) {
    if (m.fillsContainer === false) {
      console.log(`  idx=${m.index} addr="${m.addressText}" cardW=${m.cardBox?.w} cardH=${m.cardBox?.h} imgW=${m.imageBox?.w} imgH=${m.imageBox?.h} containerW=${m.imageContainerBox?.w} containerH=${m.imageContainerBox?.h} natural=${m.imgNaturalWidth}x${m.imgNaturalHeight} fit=${m.imgComputed?.objectFit}`);
    }
  }

  // Page screenshot for visual reference.
  await page.screenshot({
    path: path.join(ARTIFACTS, 'search-card-image-fit-page-1440.png'),
    fullPage: false,
  });

  // Targeted screenshots — scroll each into view and snap. Use the same
  // `.glass-card` selector that drove the metric collection so the
  // screenshot frames the entire card (image wrapper + text), not just
  // one of SplitCard's two inner <a> tags.
  const scrollAndSnap = async (idx: number, filename: string) => {
    await page.evaluate((i) => {
      const cardsLocal = Array.from(document.querySelectorAll('.glass-card'));
      const target = cardsLocal[i] as HTMLElement | undefined;
      target?.scrollIntoView({ block: 'center' });
    }, idx);
    await page.waitForTimeout(400);
    const handle = page.locator('.glass-card').nth(idx);
    await handle.screenshot({ path: path.join(ARTIFACTS, filename) }).catch(() => undefined);
  };
  if (card15W68) await scrollAndSnap(card15W68.index, 'search-card-15w68th-1440.png');
  if (card401West) await scrollAndSnap(card401West.index, 'search-card-401west-1440.png');

  // Assertion just so the test reports a pass/fail. Both targets must be
  // findable; we don't yet assert "fillsContainer" because the whole point
  // of this probe is to measure that.
  expect(metrics.length).toBeGreaterThan(0);
});
