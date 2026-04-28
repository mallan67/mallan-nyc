// scripts/crm-tests/cases-description-compliance.js
//
// Pattern-coverage tests for public/crm/tests/21-description-compliance.js.
//
// Why this file exists: the validator's regex catalogs (FAIR_HOUSING_VIOLATIONS
// and REBNY_DESCRIPTION_VIOLATIONS) are the on-form Fair Housing + UCBA gate.
// Silently weakening any pattern (e.g. by accidentally narrowing a character
// class during a refactor) would let prohibited language past the form
// without triggering CI. These cases lock in canonical positive + negative
// inputs per protected-class category so a regression flips this test red.
//
// Approach: load the validator file in a vm sandbox with a stubbed DOM,
// patch the IIFE tail to expose the two pattern arrays onto sandbox global,
// then assert each canonical input matches (or doesn't) the expected category.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const VALIDATOR_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'public',
  'crm',
  'tests',
  '21-description-compliance.js'
);

function loadPatternArrays() {
  const source = fs.readFileSync(VALIDATOR_PATH, 'utf8');
  const STASH =
    "globalThis.__FAIR_HOUSING__ = FAIR_HOUSING_VIOLATIONS;\n" +
    "globalThis.__REBNY__ = REBNY_DESCRIPTION_VIOLATIONS;";
  const patched = source.replace(/\}\)\(\);\s*$/, `${STASH}\n})();`);
  if (patched === source) {
    throw new Error('cases-description-compliance: failed to patch IIFE tail');
  }

  const noop = () => {};
  const sandbox = {
    globalThis: {},
    console: { log: noop, warn: noop, error: noop, info: noop },
    document: {
      getElementById: () => null,
      createElement: () => ({
        appendChild: noop,
        innerHTML: '',
      }),
    },
    setTimeout: () => 0,
    clearTimeout: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox, { filename: '21-description-compliance.js' });

  return {
    fairHousing: sandbox.globalThis.__FAIR_HOUSING__,
    rebny: sandbox.globalThis.__REBNY__,
  };
}

// [input text, expected-category-substring (null = expect zero matches), group]
const CASES = [
  // ── Fair Housing — Federal protected classes ──────────────────────
  ['Perfect for young professionals', 'Familial Status', 'fairHousing'],
  ['Walking distance to a church nearby', 'Religion', 'fairHousing'],
  ['Wheelchair friendly bath', 'Disability', 'fairHousing'],
  ['Bachelor pad', 'Sex/Gender', 'fairHousing'],
  ['No immigrant tenants', 'National Origin', 'fairHousing'],
  // ── NY State Human Rights Law ─────────────────────────────────────
  ['Veteran preferred', 'Military Status', 'fairHousing'],
  ['Married couples only', 'Marital Status', 'fairHousing'],
  // ── NYC Title 8 ───────────────────────────────────────────────────
  ['No Section 8 vouchers accepted', 'Source of Income', 'fairHousing'],
  ['Background check required for all applicants', 'Arrest/Conviction', 'fairHousing'],
  // ── Steering language (HUD guidance) ──────────────────────────────
  ['Quiet, family-friendly neighborhood with good schools', 'Steering', 'fairHousing'],
  // ── Outdated terms (NAR style guide) ──────────────────────────────
  ['Master bedroom with en-suite', 'Outdated Term', 'fairHousing'],
  // ── REBNY Ad Policy — high-pressure language ──────────────────────
  ["Won't last — act fast!", 'High-Pressure', 'fairHousing'],

  // ── REBNY UCBA Art. I §5(D) — off-market language ─────────────────
  ['Quiet sale, off-market opportunity', 'Off-Market Language', 'rebny'],
  // ── REBNY UCBA Art. I §5(C) — agent contact info in description ──
  ['Call John for showings', 'Agent Info in Description', 'rebny'],
  ['Reach out at 212-555-1212 anytime', 'Phone Number', 'rebny'],
  ['Email questions to demo@example.com', 'Email', 'rebny'],
  ['See https://example.com/listing for floor plans', 'URL/Website', 'rebny'],
  // ── REBNY UCBA Art. I §5(E) — compensation in description ─────────
  ['Buyer pays closing costs', 'Compensation', 'rebny'],
  // ── REBNY UCBA Art. III §2 — owner identity in description ────────
  ['Owner is motivated to sell', 'Owner/Seller Identity', 'rebny'],

  // ── Clean control — should match nothing in fair-housing group ────
  ['Sunny one-bedroom on a high floor with park views.', null, 'fairHousing'],
];

function run() {
  const groups = loadPatternArrays();
  if (!Array.isArray(groups.fairHousing) || !Array.isArray(groups.rebny)) {
    throw new Error('Pattern arrays not exported from 21-description-compliance.js');
  }

  const results = [];
  for (const [text, expectedCategory, group] of CASES) {
    const patterns = groups[group];
    const fired = patterns.filter((p) => {
      // Reset regex lastIndex (the validator uses /g flags).
      p.pattern.lastIndex = 0;
      return p.pattern.test(text);
    });

    if (expectedCategory === null) {
      if (fired.length === 0) {
        results.push({ pass: true, name: `clean: "${text.slice(0, 40)}"` });
      } else {
        results.push({
          pass: false,
          name: `clean: "${text.slice(0, 40)}"`,
          detail: `Unexpected match: ${fired.map((f) => f.category).join(' | ')}`,
        });
      }
    } else {
      const match = fired.find((f) => f.category.includes(expectedCategory));
      if (match) {
        results.push({
          pass: true,
          name: `${expectedCategory}: "${text.slice(0, 40)}"`,
        });
      } else {
        const fireSummary = fired.length
          ? fired.map((f) => f.category).join(' | ')
          : '(no patterns matched)';
        results.push({
          pass: false,
          name: `${expectedCategory}: "${text.slice(0, 40)}"`,
          detail: `Expected category "${expectedCategory}" did not fire. Got: ${fireSummary}`,
        });
      }
    }
  }
  return results;
}

module.exports = { run, CASES, loadPatternArrays };
