/**
 * A2 (PR-A2-mobile-cta, 2026-05-21) — Mobile above-fold CTA live proof.
 *
 * Class-A launch-blocker per
 *   docs/audits/exclusive-launch-readiness-audit-2026-05-20.md A2.
 *
 * This spec is the live-browser companion to the source-grep test at
 *   tests/runtime/listing-detail-mobile-cta.test.ts.
 *
 * What it proves (per Maya's correction, 2026-05-21):
 *   1. At 390×844 viewport on a SALE listing, the sticky CTA is rendered,
 *      its bbox.top is ≤ 844 (above-the-fold from page load), bbox.width
 *      is ≤ 390 (no horizontal overflow), and bbox.height is ≥ 44 px
 *      (WCAG 2.5.5 touch target).
 *   2. The same SALE-listing CTA's <a href> contains `intent=buyer`
 *      (A3 INTENT_ALLOWLIST member — routes to roles=['buyer']).
 *   3. At 390×844 viewport on a RENT listing, the sticky CTA is rendered
 *      with the same geometric guarantees AND its <a href> contains
 *      `intent=tenant` (A3 INTENT_ALLOWLIST member — routes to
 *      roles=['tenant']). NEVER `intent=buyer` for rentals — the prior
 *      agent's draft hardcoded buyer for every listing, misrouting every
 *      rental inquiry.
 *   4. At 1440×900 viewport, the sticky CTA is NOT visible (`md:hidden`
 *      working — desktop sidebar agent-contact card remains the
 *      canonical CTA path).
 *   5. Regression pin: at 390×844, the document still has no horizontal
 *      overflow (A1's `flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10`
 *      outer-container fix is preserved).
 *
 * To reproduce locally:
 *   npm run dev
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test \
 *     tests/e2e/listing-detail-mobile-cta.spec.ts
 *
 * Against an immutable Vercel preview:
 *   PLAYWRIGHT_BASE_URL=https://<dpl_*>.vercel.app npx playwright test \
 *     tests/e2e/listing-detail-mobile-cta.spec.ts
 *
 * Red-green proof: running this spec against the prior agent's draft (which
 * hardcoded intent=buyer for rentals) fails on the "RENT listing CTA href
 * contains intent=tenant" assertion.
 */
import { test, expect, type Page } from '@playwright/test';

/** WCAG 2.5.5 touch-target floor in CSS pixels. Component uses 48 px (min-h-12). */
const TOUCH_TARGET_FLOOR_PX = 44;

/**
 * Pick a real listing slug at runtime, filtered by listing_type. We hit the
 * public /api/listings reader (1 row) and use the returned slug so the test
 * stays green even as inventory changes. Fallback to a hardcoded recent
 * slug if the API is unreachable (preview deployments without DB access).
 *
 * `type` is the API parameter (`type=sale` / `type=rent`); the same value
 * is accepted by the upstream filter at `app/api/listings/route.ts:225`.
 */
async function resolveListingSlug(
  page: Page,
  type: 'sale' | 'rent',
  fallback: string
): Promise<string> {
  try {
    const res = await page.request.get(`/api/listings?type=${type}&limit=1`);
    if (res.ok()) {
      const json = (await res.json()) as { listings?: Array<{ slug?: string; listingType?: string }> };
      const first = json?.listings?.[0];
      const slug = first?.slug;
      // Defensive: confirm the returned listing matches the requested type.
      // The public DTO returns listingType as 'sale' | 'rent' (see
      // lib/idx/public-dto.ts:151) so a mismatch is a real signal.
      if (slug && typeof slug === 'string' && (!first?.listingType || first.listingType === type)) {
        return slug;
      }
    }
  } catch {
    // Fall through to hardcoded fallback.
  }
  return fallback;
}

/** Known-active SALE listing slug from the 2026-05-20 audit. */
const FALLBACK_SALE_SLUG =
  '815-5th-avenue-apt-duplex-new-york-city-ny-10065-rls20091223';

/**
 * Known-active RENT listing slug fallback. If the API does not return a
 * rental row, this hardcoded slug must exist in the DB; if it 404s on a
 * given preview, the test will fail the page.goto and the diagnostic will
 * tell us to update the fallback. We pick a generic-sounding canonical
 * pattern (matches Prisma slug shape `[a-z0-9-]+-rls[0-9]+`).
 */
const FALLBACK_RENT_SLUG = 'rent-listing-fallback-rls00000000';

test.describe('A2 — mobile above-fold CTA (390 px) — SALE listing', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro logical viewport

  test('sticky CTA is above-the-fold, full-width, and has 44+ px touch target', async ({ page }) => {
    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const cta = page.locator('[data-testid="mobile-sticky-cta"]');
    await expect(cta).toBeVisible({ timeout: 10_000 });

    const box = await cta.boundingBox();
    expect(box, 'CTA bounding box').not.toBeNull();
    // Above-the-fold: top is within the 844 px visual viewport.
    expect(box!.y, 'CTA top within viewport').toBeLessThanOrEqual(844);
    // No horizontal overflow: bar width ≤ viewport width.
    expect(box!.width, 'CTA width ≤ viewport').toBeLessThanOrEqual(390);
    // Touch target floor: min-h-12 (48 px) clears 44 px WCAG floor.
    expect(box!.height, 'CTA height ≥ WCAG 2.5.5 floor').toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR_PX);
  });

  test('SALE listing CTA links to /contact?intent=buyer&listing=<slug>', async ({ page }) => {
    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const contactLink = page.locator('[data-testid="mobile-sticky-cta-contact"]');
    await expect(contactLink).toBeVisible({ timeout: 10_000 });
    const href = await contactLink.getAttribute('href');
    expect(href, 'CTA href present').not.toBeNull();
    // Sale → buyer (A3 INTENT_ALLOWLIST member).
    expect(href!).toContain('/contact?intent=buyer&listing=');
    // CRITICAL: NOT intent=tenant on a sale listing.
    expect(href!).not.toContain('intent=tenant');
  });

  test('regression pin: no horizontal overflow at 390 px (A1 layout preserved)', async ({ page }) => {
    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    // A1's no-overflow guarantee preserved despite the new fixed-position
    // CTA bar (fixed positioning takes the element out of normal flow, so
    // it does NOT contribute to scrollWidth).
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe('A2 — mobile above-fold CTA (390 px) — RENT listing', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sticky CTA is above-the-fold and full-width on a rental listing', async ({ page }) => {
    const slug = await resolveListingSlug(page, 'rent', FALLBACK_RENT_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const cta = page.locator('[data-testid="mobile-sticky-cta"]');
    await expect(cta).toBeVisible({ timeout: 10_000 });

    const box = await cta.boundingBox();
    expect(box, 'CTA bounding box').not.toBeNull();
    expect(box!.y, 'CTA top within viewport').toBeLessThanOrEqual(844);
    expect(box!.width, 'CTA width ≤ viewport').toBeLessThanOrEqual(390);
    expect(box!.height, 'CTA height ≥ WCAG 2.5.5 floor').toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR_PX);
  });

  test('RENT listing CTA links to /contact?intent=tenant&listing=<slug> (NOT buyer)', async ({ page }) => {
    // This is the Maya-corrected assertion — the prior agent hardcoded
    // intent=buyer for every listing. Rentals MUST use intent=tenant so
    // classifyIntent() routes the lead to roles=['tenant'] for the rental
    // queue, not the buyer queue.
    const slug = await resolveListingSlug(page, 'rent', FALLBACK_RENT_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const contactLink = page.locator('[data-testid="mobile-sticky-cta-contact"]');
    await expect(contactLink).toBeVisible({ timeout: 10_000 });
    const href = await contactLink.getAttribute('href');
    expect(href, 'CTA href present').not.toBeNull();
    // Rent → tenant (A3 INTENT_ALLOWLIST member).
    expect(href!).toContain('/contact?intent=tenant&listing=');
    // CRITICAL: NOT intent=buyer on a rental — the prior-agent regression.
    expect(href!).not.toContain('intent=buyer');
  });
});

test.describe('A2 — mobile above-fold CTA hidden on desktop (1440 px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('sticky CTA is NOT visible at lg+ breakpoint (md:hidden working)', async ({ page }) => {
    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const cta = page.locator('[data-testid="mobile-sticky-cta"]');
    // The element exists in the DOM (it's the same SSR markup as mobile)
    // but `md:hidden` resolves to `display: none` at ≥ 768 px viewport,
    // so toBeVisible() must be false.
    await expect(cta).toBeHidden({ timeout: 5_000 });
  });
});
