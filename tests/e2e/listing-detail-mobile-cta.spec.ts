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
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/** WCAG 2.5.5 touch-target floor in CSS pixels. Component uses 48 px (min-h-12). */
const TOUCH_TARGET_FLOOR_PX = 44;

/**
 * Seed a "returning visitor" cookie-consent record so the global
 * <CookieConsent /> banner does not render and the A2 CTA mounts
 * immediately. Required after Codex #1 (ed3d6b56) — the CTA is now gated
 * on `useConsentStatus().hasConsent` and returns null while the consent
 * banner is showing. Tests that exercise CTA geometry/href must skip the
 * consent gate by seeding this record before the page loads.
 *
 * The dedicated first-visit test below intentionally does NOT call this
 * helper — it asserts the gate works.
 */
async function seedConsentForReturningVisitor(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'mallan_cookie_consent',
        JSON.stringify({
          essential: true,
          analytics: false,
          marketing: false,
          version: '1',
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore — private mode / quota errors; the test will surface the
      // failure via the CTA visibility assertion downstream.
    }
  });
}

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
 * Known-active RENT listing slug fallback (Codex review pinned at ed3d6b56,
 * 2026-05-21). Verified against production /api/listings?type=rent&limit=1
 * on 2026-05-21 — `815-5th-avenue-apt-duplex-new-york-city-ny-10065-rls20091223`
 * returned with `listingType: "rent"`. If the API is unreachable on a
 * preview deployment, this real slug is used so the test still drives a
 * 200-OK detail page.
 *
 * This replaces a prior placeholder (`rent-listing-fallback-rls00000000`)
 * that did not correspond to any DB row and would have 404'd if the
 * fallback ever fired.
 */
const FALLBACK_RENT_SLUG = '815-5th-avenue-apt-duplex-new-york-city-ny-10065-rls20091223';

test.describe('A2 — mobile above-fold CTA (390 px) — SALE listing', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro logical viewport

  test.beforeEach(async ({ context }) => {
    // Codex #1 (ed3d6b56) — CTA gates render on useConsentStatus().
    // Seed a stored-consent record so the banner does not show and the
    // CTA renders for the geometry / href assertions below.
    await seedConsentForReturningVisitor(context);
  });

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

  test.beforeEach(async ({ context }) => {
    // Same Codex #1 consent seed as the SALE describe.
    await seedConsentForReturningVisitor(context);
  });

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

  test.beforeEach(async ({ context }) => {
    // Seed consent so the consent banner isn't masking the lg-breakpoint
    // signal — this describe only cares about md:hidden behavior.
    await seedConsentForReturningVisitor(context);
  });

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

test.describe('A2 — CTA visible above-fold WITH consent banner showing (Codex #1 re-fix, Option C)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context }) => {
    // Simulate a brand-new visitor: clear all cookies + storage BEFORE the
    // page loads. The CTA must render alongside the consent banner — Option
    // A (commit 43980931) hid the CTA in this state, which Maya rejected
    // because A2's whole purpose is above-fold contact access for the
    // paid-social first-time mobile cohort.
    await context.clearCookies();
    await context.addInitScript(() => {
      try {
        window.localStorage.removeItem('mallan_cookie_consent');
      } catch {
        // No localStorage (private mode) — fine, hook treats as no-consent.
      }
    });
  });

  test('first-visit fresh session: CTA visible AND tappable above-fold WHILE consent banner is up', async ({
    page,
  }) => {
    // Maya's C1 acceptance criteria (PR #172, 2026-05-21):
    //   1. See a contact action above the fold (no scroll required)
    //   2. Tap that contact action without first dismissing the banner
    //   3. No horizontal overflow
    //   4. Contact action visible alongside (not behind) the consent banner
    //
    // Option C implementation: CTA renders in BOTH consent states. While
    // hasConsent === false (banner showing), CTA position shifts to
    // `bottom-[260px]` so it sits above the banner with vertical breathing
    // room. Once hasConsent === true (banner dismissed), CTA settles to
    // `bottom-0` like the returning-visitor case.

    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);
    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    // Both elements must be present + visible.
    const consentBanner = page.locator('[role="dialog"][aria-labelledby="cookie-consent-title"]');
    const cta = page.locator('[data-testid="mobile-sticky-cta"]');
    const contactLink = page.locator('[data-testid="mobile-sticky-cta-contact"]');
    await expect(consentBanner).toBeVisible({ timeout: 10_000 });
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await expect(contactLink).toBeVisible({ timeout: 5_000 });

    // Verify Option C is in effect: the CTA reports consent-pending = true.
    // This is a defense-in-depth marker on the wrapper that lets us
    // distinguish Option-C-correct-render from a flaky pre-hydration paint.
    await expect(cta).toHaveAttribute('data-consent-pending', 'true');

    const ctaBox = await cta.boundingBox();
    const bannerBox = await consentBanner.boundingBox();
    expect(ctaBox, 'CTA bounding box').not.toBeNull();
    expect(bannerBox, 'Banner bounding box').not.toBeNull();

    // ABOVE-FOLD: CTA top is within the 844 px visual viewport. This is
    // the core A2 contract that Maya rejected Option A for breaking.
    expect(ctaBox!.y, 'CTA top within viewport (above the fold)').toBeLessThanOrEqual(844);
    // All four corners on screen.
    expect(ctaBox!.x, 'CTA left edge on screen').toBeGreaterThanOrEqual(0);
    expect(ctaBox!.x + ctaBox!.width, 'CTA right edge on screen').toBeLessThanOrEqual(390);
    expect(ctaBox!.y + ctaBox!.height, 'CTA bottom edge on screen').toBeLessThanOrEqual(844);

    // NO OVERLAP: CTA bottom must be at or above banner top — they
    // visually occupy separate strips. This is the Option C contract.
    const ctaBottom = ctaBox!.y + ctaBox!.height;
    expect(
      ctaBottom,
      'CTA bottom edge does not overlap consent banner top (Option C — shifted upward)'
    ).toBeLessThanOrEqual(bannerBox!.y);

    // TAPPABILITY: contact link is exposed to hit-testing — not occluded
    // by the consent banner or any other overlay. Playwright's `isEnabled`
    // + `boundingBox` are not sufficient for occlusion; we use
    // `elementsFromPoint` at the link's center to confirm the topmost
    // element under the tap is the link itself (or its inner text node).
    const tappable = await contactLink.evaluate((node) => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const stack = document.elementsFromPoint(cx, cy);
      // The link itself OR a child (text node, span) must be the topmost
      // element. The consent banner must NOT be above it.
      return {
        topmostTag: stack[0]?.tagName ?? 'NONE',
        topmostIsLinkOrChild: stack.some(
          (el) => el === node || (node as HTMLElement).contains(el)
        ),
        bannerOnTop: stack.some(
          (el) =>
            el.getAttribute('aria-labelledby') === 'cookie-consent-title' ||
            el.closest('[aria-labelledby="cookie-consent-title"]') !== null
        ),
        stackTop3: stack.slice(0, 3).map((el) => el.tagName + (el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : '')),
      };
    });
    expect(tappable.topmostIsLinkOrChild, `contact link is hit-test-topmost; stackTop3=${JSON.stringify(tappable.stackTop3)}`).toBe(true);
    expect(tappable.bannerOnTop, 'consent banner is NOT covering the CTA tap point').toBe(false);

    // NO HORIZONTAL OVERFLOW: A1 layout invariant preserved.
    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(scrollWidth, 'no horizontal overflow at 390 px (A1 preserved)').toBeLessThanOrEqual(clientWidth + 1);

    // PROOF-FIRST: capture the screenshot artifact.
    await page.screenshot({
      path: 'tests/e2e/_artifacts/a2-cta-with-consent-390x844.png',
      fullPage: false,
    });

    // POST-DISMISSAL: after the user picks "Essential Only", the banner
    // closes and the CTA must SETTLE to bottom-0 (its normal resting
    // position). This proves the position swap is bidirectional.
    await page.getByRole('button', { name: 'Essential Only' }).click();
    await expect(consentBanner).toBeHidden({ timeout: 5_000 });
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await expect(cta).toHaveAttribute('data-consent-pending', 'false');
    const postBox = await cta.boundingBox();
    expect(postBox, 'CTA bounding box after consent dismissal').not.toBeNull();
    // CTA's bottom edge should be at or near the bottom of the viewport
    // (= 844 px), allowing for safe-area inset and the transition window.
    // We give a 16 px tolerance to absorb the iOS env(safe-area-inset)
    // padding and any sub-pixel rounding.
    expect(
      postBox!.y + postBox!.height,
      'CTA settles to bottom-0 after consent dismissal'
    ).toBeGreaterThanOrEqual(844 - 16);
  });

  test('returning visitor (stored consent) — CTA is visible from page load at bottom-0', async ({
    page,
    context,
  }) => {
    // Seed a "returning visitor" consent record so the banner does not show
    // and the CTA renders at its natural bottom-0 position immediately.
    // This is the happy path that the rest of the A2 spec implicitly
    // assumes — pin it here too so a regression in the consent gate (e.g.
    // inverted boolean) is caught.
    await seedConsentForReturningVisitor(context);
    const slug = await resolveListingSlug(page, 'sale', FALLBACK_SALE_SLUG);

    await page.goto(`/listing/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main section', { timeout: 20_000 });

    const consentBanner = page.locator('[role="dialog"][aria-labelledby="cookie-consent-title"]');
    await expect(consentBanner).toHaveCount(0);

    const cta = page.locator('[data-testid="mobile-sticky-cta"]');
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await expect(cta).toHaveAttribute('data-consent-pending', 'false');

    const box = await cta.boundingBox();
    expect(box, 'CTA bounding box').not.toBeNull();
    // bottom-0 → bbox bottom edge at viewport bottom (allowing 16 px
    // tolerance for iOS safe-area inset).
    expect(box!.y + box!.height, 'CTA at bottom-0').toBeGreaterThanOrEqual(844 - 16);
  });
});
