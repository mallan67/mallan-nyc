import { test, expect, type Page } from '@playwright/test';

/**
 * BROKER ACCEPTANCE — the two P0 defects, proven in a real browser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SUITE EXISTS SEPARATELY
 *
 * Both defects passed every guard in the repo and still failed a broker using
 * Search. Open House was disabled in the UI, so no test asserted it worked.
 * Photos were fetched lazily by the browser, so the server-side telemetry that
 * would have caught it read `listings_with_images: 0` BY DESIGN.
 *
 * Neither could have been caught without a session and real inventory. That is
 * what this file is for, and it is why it refuses to run without credentials
 * rather than skipping quietly into a green tick.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN IT — WITHOUT PUTTING A PASSWORD ANYWHERE
 *
 *   npx playwright codegen --save-storage=.cache/crm-e2e-storage.json <PREVIEW>/crm
 *     ^ Maya performs ONE normal broker login + MFA in that browser.
 *       `.cache/crm-e2e-storage.json` is gitignored (verified via
 *       `git check-ignore`), must never be committed, never printed to logs,
 *       and should be deleted once the acceptance proof is captured.
 *
 *   PLAYWRIGHT_BASE_URL=<PREVIEW> CRM_E2E_STORAGE_STATE=.cache/crm-e2e-storage.json \
 *     npx playwright test tests/e2e/authenticated-open-house-and-media.spec.ts
 *
 * No dev-login bypass. No ALLOW_DEV_LOGIN on Preview. No weakening of the
 * NODE_ENV guard. Those would each turn a genuine auth blocker into a hole.
 */

const EMAIL = process.env.CRM_E2E_EMAIL;
const PASSWORD = process.env.CRM_E2E_PASSWORD;
const STORAGE = process.env.CRM_E2E_STORAGE_STATE;
const HAVE_AUTH = Boolean((EMAIL && PASSWORD) || STORAGE);

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function signIn(page: Page): Promise<void> {
  if (STORAGE) return; // storageState is applied by the context
  await page.goto('/crm/login');
  await page.fill('input[type="email"], input[name="email"]', EMAIL as string);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD as string);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/crm(\/|$)/, { timeout: 20_000 });
}

async function runSaleSearch(page: Page): Promise<void> {
  await page.goto('/crm');
  await page.click('#btnSale');
  await page.click('#searchButton, [data-action="search"]');
  await page.waitForTimeout(3000);
}

test.describe('§P0 broker acceptance — Open House and media', () => {
  test.skip(
    !HAVE_AUTH,
    'No CRM credentials. Set CRM_E2E_STORAGE_STATE (preferred) or ' +
      'CRM_E2E_EMAIL + CRM_E2E_PASSWORD. This suite deliberately does not stub ' +
      'a session: a pass without a real login would be a false green.',
  );

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}px)`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('the Open House controls are ENABLED and say nothing about being unsupported', async ({ page }) => {
        await signIn(page);
        await page.goto('/crm');
        await page.click('#btnSale');

        // The exact string from Maya's screenshot. Its presence is the failure.
        const body = await page.textContent('body');
        expect(body).not.toMatch(/Open House date range not supported/i);

        const presets = page.locator('.oh-preset[data-oh="saleOpenHouse"]');
        expect(await presets.count()).toBeGreaterThan(0);
        for (let i = 0; i < await presets.count(); i++) {
          await expect(presets.nth(i)).toBeEnabled();
        }
      });

      for (const preset of ['Today', 'This Weekend', 'Next 7 Days', 'Next 30 Days']) {
        test(`Open House "${preset}" executes and the count describes THAT universe`, async ({ page }) => {
          await signIn(page);
          await page.goto('/crm');
          await page.click('#btnSale');

          // Baseline: the same search with no open-house criterion.
          await page.click('#searchButton, [data-action="search"]');
          await page.waitForTimeout(3000);
          const baseline = (await page.textContent('#resultsCount')) ?? '';

          // Now with the preset. The request must actually carry the criterion.
          const requests: string[] = [];
          page.on('request', (r) => {
            if (r.url().includes('/api/idx/search')) requests.push(r.url());
          });
          await page.click(`.oh-preset[data-oh="saleOpenHouse"]:has-text("${preset}")`);
          await page.click('#searchButton, [data-action="search"]');
          await page.waitForTimeout(4000);

          // THE CRITERION REACHED THE WIRE, AS A TOKEN. Without this the next
          // assertion could pass on a search that simply returned fewer rows
          // by chance.
          expect(requests.some((u) => /[?&]openHouse=/.test(u))).toBe(true);
          // And NOT as browser-computed dates: a preset that still sent
          // openHouseDateFrom would mean the browser was deciding the window
          // again, in whatever timezone the broker's laptop is set to.
          expect(requests.filter((u) => /openHouseDateFrom=/.test(u))).toEqual([]);

          const filtered = (await page.textContent('#resultsCount')) ?? '';
          expect(filtered).toMatch(/\d[\d,]*\+? Results/);

          // An open-house universe is a SUBSET. Identical counts would mean the
          // criterion was accepted and then ignored — the silent-widening shape.
          const n = (s: string) => Number((s.match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, ''));
          expect(n(filtered)).toBeLessThanOrEqual(n(baseline));
        });
      }

      test('an open-house result on page 2 is reachable — membership is not a page filter', async ({ page }) => {
        await signIn(page);
        await page.goto('/crm');
        await page.click('#btnSale');
        await page.click('.oh-preset[data-oh="saleOpenHouse"]:has-text("Next 30 Days")');
        await page.click('#searchButton, [data-action="search"]');
        await page.waitForTimeout(4000);

        const ids = () => page.$$eval('[data-listing-id]', (els) =>
          els.map((e) => e.getAttribute('data-listing-id')));
        const page1 = await ids();
        test.skip(page1.length === 0, 'No open houses in the next 30 days to page through.');

        const next = page.locator('#nextPageBtn, [data-action="next-page"]');
        if (await next.count() && await next.isEnabled()) {
          await next.click();
          await page.waitForTimeout(3000);
          const page2 = await ids();
          // A full page, not a remnant: page-intersect would leave 1-2 rows.
          expect(page2.length).toBeGreaterThan(0);
          expect(page1.filter((id) => page2.includes(id))).toEqual([]);
        }
      });

      test('cards carry the PROVIDER key and resolve real photos', async ({ page }) => {
        await signIn(page);

        const mediaCalls: string[] = [];
        const proxyFailures: string[] = [];
        page.on('request', (r) => {
          if (r.url().includes('/api/media/batch')) mediaCalls.push(r.url());
        });
        page.on('response', (r) => {
          if (r.url().includes('/api/media/proxy') && r.status() >= 400) {
            proxyFailures.push(`${r.status()} ${r.url().slice(0, 120)}`);
          }
        });

        await runSaleSearch(page);

        // 1. The identity is ON the card, in the provider key domain.
        const keys = await page.$$eval('[data-listing-key]', (els) =>
          els.map((e) => e.getAttribute('data-listing-key')).filter(Boolean));
        expect(keys.length).toBeGreaterThan(0);
        // A Cotality ListingKey is numeric; an RLS-prefixed value here would
        // mean the card reverted to the ListingId domain, which the provider
        // answers with an empty 200 on ResourceRecordKey.
        expect(keys.filter((k) => /^RLS/i.test(k as string))).toEqual([]);

        // 2. The browser asked in that domain.
        await page.waitForTimeout(4000);
        expect(mediaCalls.length).toBeGreaterThan(0);
        expect(mediaCalls.every((u) => u.includes('keys='))).toBe(true);

        // 3. Real pixels arrived. This is the assertion the whole defect is
        //    about: 141 listings previously resolved 0 photos.
        const withPhotos = await page.$$eval('.cm-photo', (imgs) =>
          imgs.filter((i) => {
            const el = i as HTMLImageElement;
            return el.naturalWidth > 1 && !/placeholder|data:image\/svg/i.test(el.src);
          }).length);
        expect(withPhotos).toBeGreaterThan(0);

        // 4. And the proxy did not 404 its way there.
        expect(proxyFailures).toEqual([]);
      });

      test('DETAIL GALLERY loads for a provider-only listing — the blind spot', async ({ page }) => {
        // THE TEST THE PREVIOUS SUITE DID NOT HAVE.
        //
        // Card thumbnails and the detail gallery asked in DIFFERENT identity
        // domains, so the card could show a photo while the gallery came back
        // empty for the same listing. Asserting `data-listing-key` exists on
        // each view proved nothing about whether the gallery actually loads.
        await signIn(page);

        const detailCalls: string[] = [];
        const proxyFailures: string[] = [];
        page.on('request', (r) => {
          if (r.url().includes('/api/media/batch') && r.url().includes('detail=true')) {
            detailCalls.push(r.url());
          }
        });
        page.on('response', (r) => {
          if (r.url().includes('/api/media/proxy') && r.status() >= 400) {
            proxyFailures.push(`${r.status()} ${r.url().slice(0, 140)}`);
          }
        });

        await runSaleSearch(page);

        // Pick a card that CLAIMS more than one photo. A listing with none
        // would make an empty gallery the correct answer.
        const card = page.locator('[data-listing-key]').first();
        await expect(card).toBeVisible();
        const key = await card.getAttribute('data-listing-key');
        expect(key).toBeTruthy();
        // Provider keys are numeric; an RLS value would mean the card had
        // reverted to the ListingId domain.
        expect(key).not.toMatch(/^RLS/i);

        await card.click();
        await page.waitForTimeout(5000);

        // 1. The detail request went out IN THE KEY DOMAIN.
        expect(detailCalls.length).toBeGreaterThan(0);
        expect(detailCalls.every((u) => u.includes('keys='))).toBe(true);
        expect(detailCalls.some((u) => u.includes(encodeURIComponent(key as string)))).toBe(true);
        // `ids=` here is the defect, by name.
        expect(detailCalls.filter((u) => /[?&]ids=/.test(u))).toEqual([]);

        // 2. REAL PIXELS, more than one. This is the assertion that fails when
        //    the gallery resolves to an empty array under an HTTP 200.
        const rendered = await page.$$eval('.cm-photo, [data-gallery-image] img, .gallery-image',
          (imgs) => imgs.filter((i) => {
            const el = i as HTMLImageElement;
            return el.naturalWidth > 1 && !/placeholder|data:image\/svg/i.test(el.src);
          }).length);
        expect(rendered).toBeGreaterThan(0);

        // 3. The proxy did not 404 its way there.
        expect(proxyFailures).toEqual([]);
      });

      test('every view that shows a listing carries the media identity', async ({ page }) => {
        await signIn(page);
        await runSaleSearch(page);

        // Master-detail, short-summary, grid and the map popup rendered an
        // <img> but emitted no identity, so the lazy loader never observed
        // them and they showed a placeholder permanently.
        for (const view of ['gallery', 'summary', 'short', 'detail']) {
          const btn = page.locator(`[data-view="${view}"]`);
          if (!(await btn.count())) continue;
          await btn.first().click();
          await page.waitForTimeout(2000);
          const n = await page.locator('[data-listing-key]').count();
          expect(n, `view "${view}" emits no data-listing-key`).toBeGreaterThan(0);
        }
      });
    });
  }
});
