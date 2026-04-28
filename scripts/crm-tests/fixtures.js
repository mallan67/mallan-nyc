// scripts/crm-tests/fixtures.js
//
// Loads public/crm/tests/offline-test-framework.js in a vm sandbox,
// captures the FIXTURES array (defined inside the IIFE), and re-exports it
// so Node tests can use the same deterministic dataset the browser tests use.
//
// Why a sandbox: the framework is browser-targeted (uses document, window,
// addEventListener) and its FIXTURES variable lives inside an IIFE, so a
// straight `require()` would fail and `eval` would not isolate scope.
// We patch the IIFE's tail to copy FIXTURES onto a sandbox-global, then
// stub the small set of DOM globals it touches at load time.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRAMEWORK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'public',
  'crm',
  'tests',
  'offline-test-framework.js'
);

function loadFixtures() {
  const source = fs.readFileSync(FRAMEWORK_PATH, 'utf8');

  // The framework ends with `})();` — replace the closing paren of the IIFE
  // call with a stash of FIXTURES onto the sandbox's globalThis, then close.
  const STASH = "if (typeof FIXTURES !== 'undefined') { globalThis.__FIXTURES__ = FIXTURES; }";
  const patched = source.replace(/\}\)\(\);\s*$/, `${STASH}\n})();`);
  if (patched === source) {
    throw new Error('fixtures.js: failed to patch IIFE tail in offline-test-framework.js');
  }

  // Provide a minimal browser-shaped sandbox so the framework can load
  // without throwing on document/window references during top-level setup.
  const noop = () => {};
  const fakeDoc = {
    readyState: 'complete',
    addEventListener: noop,
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, innerHTML: '' }),
    body: { appendChild: noop, addEventListener: noop },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const fakeWin = {
    addEventListener: noop,
    location: { href: 'about:blank' },
  };

  const sandbox = {
    globalThis: {},
    console: { log: noop, warn: noop, error: noop, info: noop },
    document: fakeDoc,
    window: fakeWin,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox, { filename: 'offline-test-framework.js' });

  const fixtures = sandbox.globalThis.__FIXTURES__;
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new Error('fixtures.js: FIXTURES array not captured from sandbox');
  }
  return fixtures;
}

module.exports = { loadFixtures };
