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
    // lib/media tests (ts-jest) — photo fallback (PR-E.1.a, 2026-05-14),
    // listing-media resolver, and media-sync service. The per-directory
    // jest.config.js existed but was previously NOT wired into the root
    // projects list, so listing-media-resolver.test.ts and
    // media-sync-service.test.ts had been orphaned from CI. Wiring it in
    // here as part of PR-E.1.a fixes that gap.
    '<rootDir>/lib/media/jest.config.js',
    // lib/email + /api/unsubscribe (ts-jest) — email compliance hardening:
    // fail-closed suppression, signed HMAC unsubscribe token, dry-run/test/batch.
    '<rootDir>/lib/email/jest.config.js',
    // lib/rls-validator tests (ts-jest) — commented out: config missing
    // '<rootDir>/lib/rls-validator/jest.config.js',
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
