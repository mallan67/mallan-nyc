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
