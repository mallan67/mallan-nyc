/**
 * Playwright e2e config — mallan.nyc public surface regression tests.
 *
 * Why this exists
 * ---------------
 * F1 / F2 (PR-FE.1, 2026-05-15) — mobile split-view collapsed to 2-col grid
 * inside a 390px viewport, and the search toolbar wrapped 9 controls into
 * 5-7 vertical rows on mobile. Both are CSS / layout bugs invisible to
 * jsdom-based unit tests. A real browser at real viewport widths is the
 * only reliable proof for "card width fits viewport" and "toolbar height
 * stays under 180px on mobile".
 *
 * Running
 * -------
 *   npm install                         # install @playwright/test
 *   npx playwright install chromium     # one-time browser download (~150 MB)
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 *
 *   To run against production:
 *     PLAYWRIGHT_BASE_URL=https://mallan.nyc npx playwright test
 *
 *   To run a single spec:
 *     npx playwright test tests/e2e/search-mobile.spec.ts
 *
 * Not wired into CI yet — the existing pr-check workflow runs Jest only.
 * A follow-up PR can add a separate `e2e-tests` job that runs these specs
 * against a preview deployment URL.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Cap individual test timeout at 30s — these are smoke checks against a
  // running server, not load tests.
  timeout: 30_000,
  // Tests share the same baseURL but each declares its own viewport size
  // because we explicitly need to verify behavior at 390px (mobile), 768px
  // (tablet), 1024px (laptop), 1440px (desktop). The default project below
  // covers all four with chromium; firefox/webkit projects can be added in
  // a follow-up if cross-browser regressions appear.
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    // Disable trace/video by default to keep CI artifact size small; the
    // operator can opt in via `--trace on` / `--video on` flags when
    // reproducing a failure.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Don't auto-start a webServer — operator decides whether to point at
  // localhost:3000 (npm run dev) or a preview/production URL.
  reporter: process.env.CI ? 'github' : 'list',
});
