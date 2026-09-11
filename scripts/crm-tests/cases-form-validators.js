// scripts/crm-tests/cases-form-validators.js
//
// JSDOM harness that exercises the CRM form validators end-to-end against
// a synthetic DOM. Goal is regression detection on the contract — not on
// every code path — so we mount a minimal HTML scaffold (no Tailwind/CDN
// loads, no full SALE-FORM-REDESIGN.html), inject the validator scripts
// patched at their IIFE tail to publish their internals onto window, and
// exercise the headline functions.
//
// Validators covered:
//   - 19-form-validators-sale.js          (sale: validateREBNYRequired, validateStatusChange, validateDates, scanAllContent, setupDisplayCascade)
//   - 20-form-validators-rental.js        (rental: checkDescriptionCompliance, checkFairHousing, updateRentalCharCount)
//   - 21-description-compliance.js        (shared: checkDescriptionCompliance, checkFairHousing — DOM-driven version)
//   - 22-date-and-listing-validators.js   (date + listing helpers; already exposes window.* without an IIFE wrapper)
//
// Strategy: patch each validator's `})();` tail in memory to also assign its
// inner functions onto `window` before closing the IIFE. The on-disk source
// is not touched — keeps the validator file the canonical browser-shipped
// version, while letting tests reach into it.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TESTS_DIR = path.resolve(__dirname, '..', '..', 'public', 'crm', 'tests');

// Minimal HTML scaffold with the IDs the validators reach for.
// Only the IDs that the test cases below touch need to exist.
const SCAFFOLD_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
  <!-- Sale fields -->
  <textarea id="saleDescription"></textarea>
  <div id="saleFairHousingFlags"></div>
  <input id="saleDateListed" type="date" />
  <input id="saleContractSignedDate" type="date" />
  <input id="saleSoldDate" type="date" />
  <input id="saleExclusiveExpires" type="date" />
  <input id="saleExclusiveStart" type="date" />
  <select id="saleStatus"><option value="Draft">Draft</option><option value="Active">Active</option><option value="Sold">Sold</option></select>
  <div id="saleValidationPanel" class="hidden"></div>
  <ul id="saleMissingFieldsList"></ul>
  <span id="saleDraftBadge"></span>

  <!-- Rental fields -->
  <textarea id="rentalDescription"></textarea>
  <div id="rentalFairHousingFlags"></div>
  <span id="rentalDescCharCount"></span>
</body></html>`;

// Patch to apply at IIFE tail. We grep all top-level inner function decls
// and copy them onto window so JSDOM tests can call them after script load.
//
// `prefix` lets us namespace per-file (e.g. `__crmTest_19_validateDates`)
// because some symbols (validateDates, validateStatusChange) are defined in
// multiple validator files with different signatures and would otherwise
// stomp on each other in load order.
function buildIifeExposurePatch(source, prefix) {
  const fnRe = /^\s{4,}function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const varRe = /^\s{4,}var\s+([A-Z_][A-Z0-9_]*)\s*=/gm;
  const names = new Set();
  let m;
  while ((m = fnRe.exec(source)) !== null) names.add(m[1]);
  while ((m = varRe.exec(source)) !== null) names.add(m[1]);
  if (names.size === 0) return null;
  const stamp = prefix ? `__crmTest_${prefix}_` : '__crmTest_';
  const lines = ['// === injected by scripts/crm-tests/cases-form-validators.js ==='];
  for (const n of names) {
    lines.push(`try { if (typeof ${n} !== 'undefined') window.${stamp}${n} = ${n}; } catch (_) {}`);
  }
  return lines.join('\n');
}

function loadValidatorPatched(name, prefix) {
  const file = path.join(TESTS_DIR, name);
  const source = fs.readFileSync(file, 'utf8');
  const patch = buildIifeExposurePatch(source, prefix);
  if (!patch) return source;
  // The IIFEs in 19/20/21 close with `})();`. File 22 has no IIFE wrapper —
  // its function declarations are NOT scoped, but we still want them
  // mirrored under the `__crmTest_<prefix>_` namespace for symmetry.
  if (/\}\)\(\);\s*$/.test(source)) {
    return source.replace(/\}\)\(\);\s*$/, `${patch}\n})();\n`);
  }
  return `${source}\n${patch}\n`;
}

function injectScript(dom, jsSource, label) {
  const script = dom.window.document.createElement('script');
  script.textContent = jsSource;
  dom.window.document.body.appendChild(script);
  return label;
}

function assert(results, name, condition, detail) {
  results.push({
    pass: !!condition,
    name,
    detail: condition ? '' : detail || '',
  });
}

function run() {
  const results = [];

  let dom;
  try {
    dom = new JSDOM(SCAFFOLD_HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
  } catch (err) {
    results.push({ pass: false, name: 'jsdom-bootstrap', detail: err.message });
    return results;
  }

  const { window } = dom;
  // Some validators reach for symbols that the real form provides at top
  // level. Stub the harmless ones so script execution doesn't throw.
  //
  // BUT: any pre-seeded stub also satisfies a downstream assertion like
  // `typeof window.handleSaleComingSoon === 'function'`, masking regressions
  // where a validator file stops attaching the symbol. Capture each stub
  // reference into STUBS so post-load assertions can verify the symbol was
  // REPLACED (window[name] !== STUBS[name]), not just "still a function".
  const STUBS = {};
  function stub(name, value) {
    STUBS[name] = value;
    window[name] = value;
  }
  stub('SALE_REQUIRED_FIELDS', []);
  stub('REBNY_ACTIVE_STATUSES', ['Active', 'ComingSoon', 'BackOnMarket']);
  stub('isFieldRelevant', () => true);
  stub('isStatusRelevant', () => true);
  stub('fieldHasValue', () => true);
  stub('updateSaleValidationSummary', () => {});
  stub('updateSaleStatusFields', () => {});
  stub('handleSaleComingSoon', () => {});
  stub('updateStatusTracking', () => {});
  stub('getBuildingTypeMapping', () => 'None');
  stub('showSaleMainTab', () => {});
  stub('showRentalMainTab', () => {});

  // True iff a symbol is present on window AND, if we pre-stubbed it, the
  // current value is no longer the stub reference. Used by post-load
  // assertions that need to detect "validator file replaced this" vs
  // "validator file silently dropped it and the stub is still here".
  function isAttachedAndReplaced(name, expectedType) {
    const val = window[name];
    if (typeof val !== expectedType) return false;
    if (name in STUBS && val === STUBS[name]) return false; // still the test stub
    return true;
  }

  // ── Inject validators in the same order forms load them ─────────────
  // Each file gets a per-file prefix on window so we can target the
  // version we want even when symbols collide (validateDates, validateStatusChange).
  const order = [
    { file: '21-description-compliance.js', prefix: '21' },
    { file: '19-form-validators-sale.js', prefix: '19' },
    { file: '20-form-validators-rental.js', prefix: '20' },
    { file: '22-date-and-listing-validators.js', prefix: '22' },
  ];
  for (const { file, prefix } of order) {
    try {
      injectScript(dom, loadValidatorPatched(file, prefix), file);
      assert(results, `inject:${file}`, true);
    } catch (err) {
      assert(results, `inject:${file}`, false, err.message);
    }
  }

  // ── 21: description compliance — DOM-driven path ────────────────────
  // Set a clean description, run the immediate (non-debounced) checker.
  const checker = window.__crmTest_21__performComplianceCheck;
  if (typeof checker !== 'function') {
    assert(results, '21:_performComplianceCheck exposed', false, 'function not on window');
  } else {
    try {
      const ta = window.document.getElementById('saleDescription');
      const flags = window.document.getElementById('saleFairHousingFlags');
      ta.value = 'Sunny one-bedroom on a high floor with park views.';
      checker('saleDescription', 'saleFairHousingFlags');
      const html = flags.innerHTML || '';
      const hasGreen = html.includes('No compliance violations detected');
      assert(results, '21:clean text shows green pass', hasGreen, `flags HTML: ${html.slice(0, 80)}`);

      ta.value = 'Perfect for young professionals — no kids please';
      checker('saleDescription', 'saleFairHousingFlags');
      const html2 = flags.innerHTML || '';
      const flagsRed = html2.includes('Fair Housing Violation');
      assert(results, '21:familial-status flagged red', flagsRed, `flags HTML: ${html2.slice(0, 80)}`);

      ta.value = 'Listed by Maya, call 212-555-1212 — off-market opportunity';
      checker('saleDescription', 'saleFairHousingFlags');
      const html3 = flags.innerHTML || '';
      const rebnyOrange = html3.includes('REBNY RLS / UCBA 2026 Violation');
      assert(results, '21:UCBA off-market+phone flagged', rebnyOrange, `flags HTML: ${html3.slice(0, 80)}`);
    } catch (err) {
      assert(results, '21:DOM checker exercise', false, err.message);
    }
  }

  // ── 19: sale validators — basic surface checks ──────────────────────
  // getResoMlsStatus / getResoPropertyFields were REMOVED (Packet 2 closure): the server owns the form → vocabulary conversion.
  const exposed19 = ['validateREBNYRequired', 'validateDates'];
  for (const fn of exposed19) {
    assert(
      results,
      `19:${fn} reachable via __crmTest_19_`,
      typeof window[`__crmTest_19_${fn}`] === 'function',
      `window.__crmTest_19_${fn} not a function`
    );
  }

  // Exercise validateDates with a Sold-before-Contract scenario.
  const validateDates19 = window.__crmTest_19_validateDates;
  if (typeof validateDates19 === 'function') {
    try {
      window.document.getElementById('saleDateListed').value = '2025-01-15';
      window.document.getElementById('saleContractSignedDate').value = '2025-03-01';
      window.document.getElementById('saleSoldDate').value = '2025-02-01'; // BEFORE contract
      const errs = validateDates19();
      const fired = Array.isArray(errs) && errs.some((e) => /Sold Date.*Contract/i.test(e));
      assert(results, '19:validateDates flags Sold<Contract', fired, `errors: ${JSON.stringify(errs)}`);

      window.document.getElementById('saleSoldDate').value = '2025-03-15'; // AFTER contract
      const errs2 = validateDates19();
      const noFire = Array.isArray(errs2) && !errs2.some((e) => /Sold Date.*Contract/i.test(e));
      assert(results, '19:validateDates clean when Sold>=Contract', noFire, `errors: ${JSON.stringify(errs2)}`);
    } catch (err) {
      assert(results, '19:validateDates exercise', false, err.message);
    }
  }

  // ── 20: rental validators — checkDescriptionCompliance ──────────────
  // 20 has its own copy of FAIR_HOUSING_VIOLATIONS scoped to the rental
  // IIFE. We invoke 20's checkDescriptionCompliance via its dedicated
  // namespace so we test the rental-specific patterns, not 21's sale ones.
  const checkDesc = window.__crmTest_20_checkDescriptionCompliance;
  if (typeof checkDesc !== 'function') {
    assert(results, '20:checkDescriptionCompliance exposed', false, 'function not on window');
  } else {
    try {
      const rentalTa = window.document.getElementById('rentalDescription');
      const rentalFlags = window.document.getElementById('rentalFairHousingFlags');
      rentalTa.value = 'No Section 8 vouchers accepted';
      checkDesc('rentalDescription', 'rentalFairHousingFlags');
      const html = rentalFlags.innerHTML || '';
      const hit = html.includes('Source of Income') || html.includes('Fair Housing Violation');
      assert(results, '20:rental Source-of-Income flagged', hit, `flags HTML: ${html.slice(0, 100)}`);
    } catch (err) {
      assert(results, '20:rental checker exercise', false, err.message);
    }
  }

  // ── 22: date + listing validators (no IIFE) ─────────────────────────
  // 22 exposes window.validateStatusChange / window.validateSalesListing /
  // window.handleSaleComingSoon directly (no `__crmTest_` prefix needed).
  // Verify the live-DOM listings — using isAttachedAndReplaced() so a
  // pre-seeded stub does NOT satisfy the assertion (would otherwise let
  // a regression where 22 silently stops attaching `handleSaleComingSoon`
  // pass green).
  for (const w of ['validateStatusChange', 'handleSaleComingSoon', 'handleSaleListingTypeChange', 'handleRentalListingTypeChange']) {
    const ok = isAttachedAndReplaced(w, 'function');
    const stubsHave = w in STUBS;
    const stillStub = stubsHave && window[w] === STUBS[w];
    assert(
      results,
      `22:window.${w} attached`,
      ok,
      typeof window[w] !== 'function'
        ? `window.${w} not a function`
        : stillStub
          ? `window.${w} is still the test stub — file 22 did not attach it`
          : `window.${w} unexpected state`
    );
  }

  try {
    dom.window.close();
  } catch (_) {}

  return results;
}

module.exports = { run, buildIifeExposurePatch, loadValidatorPatched };
