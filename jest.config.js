/** @type {import('jest').Config} */
const path = require('path');

module.exports = {
  // Each test directory that has its own config runs as a separate project
  projects: [
    // lib/auth tests (ts-jest)
    '<rootDir>/lib/auth/jest.config.js',
    // lib/compliance tests (ts-jest)
    '<rootDir>/lib/compliance/jest.config.js',
    // lib/search tests (ts-jest)
    '<rootDir>/lib/search/jest.config.js',
    // lib/idx tests (ts-jest) — sync cursor + backfill eligibility (PCT gap)
    '<rootDir>/lib/idx/jest.config.js',
    // lib/cotality tests (ts-jest) — the verified provider projection reader.
    '<rootDir>/lib/cotality/jest.config.js',
    // lib/media tests (ts-jest) — photo fallback (PR-E.1.a, 2026-05-14),
    // listing-media resolver, and media-sync service. The per-directory
    // jest.config.js existed but was previously NOT wired into the root
    // projects list, so listing-media-resolver.test.ts and
    // media-sync-service.test.ts had been orphaned from CI. Wiring it in
    // here as part of PR-E.1.a fixes that gap.
    '<rootDir>/lib/media/jest.config.js',
    // lib/monitoring (ts-jest) — health verdict algebra + R2 mirror health.
    // Registered IN THE SAME COMMIT that creates the directory: an unregistered
    // per-directory config is invisible to `npx jest --ci` (the only thing CI
    // runs), which is exactly how lib/media, lib/crm and 8 further configs
    // silently held tests that never executed. A monitoring module whose own
    // tests do not run would be the worst possible instance of that bug.
    '<rootDir>/lib/monitoring/jest.config.js',
    // lib/crm tests (ts-jest) — fee disclosure, growth tools, and the public
    // listing-URL address gate. SAME ORPHANING BUG as lib/media above: the
    // per-directory jest.config.js existed but was never added to this
    // projects list, so fee-disclosure.test.ts and growth-tools.test.ts had
    // been running nowhere. Wired in 2026-08-07.
    '<rootDir>/lib/crm/jest.config.js',
    // lib/email + /api/unsubscribe (ts-jest) — email compliance hardening:
    // fail-closed suppression, signed HMAC unsubscribe token, dry-run/test/batch.
    '<rootDir>/lib/email/jest.config.js',
    // lib/middleware (ts-jest) — rate-limiter bucket separation (unsubscribe GET
    // vs POST quotas so scanner GET traffic can't drain the POST unsubscribe quota).
    '<rootDir>/lib/middleware/jest.config.js',
    // lib/rls-validator tests (ts-jest) — commented out: config missing
    // '<rootDir>/lib/rls-validator/jest.config.js',
    // ── Configs wired in 2026-08-07 after a full jest-config audit ──────────
    // CI runs ONLY `npx jest --ci --forceExit` (.github/workflows/pr-check.yml:135),
    // i.e. root Jest. Any per-directory jest.config.js absent from THIS list is
    // outside CI regardless of whether an npm script exists for it. The audit
    // found 8 such configs holding 415 passing tests that CI never executed —
    // most significantly lib/scanner (323 Fair Housing scanner tests) and
    // lib/geo (67). `test:scanner` / `test:corridor` remain for targeted local
    // runs; CI does not invoke them, so wiring these here does not double-run
    // anything in CI.
    '<rootDir>/lib/scanner/jest.config.js',        // 323 — Fair Housing scanner
    '<rootDir>/lib/geo/jest.config.js',            //  67 — corridor/geocode
    '<rootDir>/lib/tracking/jest.config.js',       //   7
    '<rootDir>/lib/external-listings/jest.config.js', // 7
    '<rootDir>/lib/rental-signals/jest.config.js',  //  4
    '<rootDir>/lib/seller-signals/jest.config.js',  //  3
    '<rootDir>/lib/buyer-intent/jest.config.js',    //  2
    '<rootDir>/lib/buyer-priorities/jest.config.js',//  2
    // tests/runtime — release-truth side-effect proof for high-risk routes
    // (validator framework Phase 3). Wired here so `npx jest --ci` picks
    // them up as a release gate, not just `npm run test:runtime`.
    '<rootDir>/tests/runtime/jest.config.js',
    // scripts tests (plain JS, node runner)
    {
      displayName: 'scripts',
      testEnvironment: 'node',
      roots: ['<rootDir>/scripts/__tests__'],
      testMatch: ['**/*.test.js'],
    },
  ],
};
