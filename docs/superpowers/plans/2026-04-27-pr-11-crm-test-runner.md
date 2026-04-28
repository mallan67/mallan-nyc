# PR 11 — Restore `npm run crm:test` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Required before any commit: invoke the `rebny-compliance` skill (this PR touches CRM compliance test infrastructure).

**Goal:** Replace the broken `npm run crm:test` (references missing `public/crm/tests/05-test-suite-runner.js`, deleted in commit `a0e00f03` 2026-03-24) with a working Node-side runner that exercises the in-tree form validators (`19-form-validators-sale.js`, `20-form-validators-rental.js`, `21-description-compliance.js`, `22-date-and-listing-validators.js`) against the deterministic 126-listing fixture set in `offline-test-framework.js`. CI gate restored.

**Architecture:** A single Node script (`scripts/crm-test-runner.js`) that boots a JSDOM environment per form HTML, loads the validator scripts via `<script>` tags so their IIFEs execute against a real DOM, then drives each validator with both fixture data (good listings → expect zero errors) and synthetically-violating data (Fair Housing trigger phrases → expect errors). Exits 0 on all-pass, non-zero on any-fail. No external services, no Trestle, no Neon — all deterministic.

**Tech Stack:** Node 24, JSDOM (new devDep), existing fixture file `public/crm/tests/offline-test-framework.js`, existing validators 19/20/21/22.

---

## Pre-flight

- [ ] **Step 1: Worktree off origin/main**
  ```bash
  cd C:/Users/MayaAllan/Desktop/mallan-nyc
  git fetch origin main
  git worktree add ../mallan-nyc-pr11 chore/restore-crm-test-runner origin/main
  cd ../mallan-nyc-pr11
  npm ci
  ```
- [ ] **Step 2: Confirm baseline**
  ```bash
  npm run ops:health   # state=ok required
  npm run crm:test     # currently fails: "Cannot find module 05-test-suite-runner.js"
  ```
  Save the failing output as evidence. Success criterion is the same command exiting 0.

## File Structure

| File | Role |
|---|---|
| Create: `scripts/crm-test-runner.js` | Node entry point; boots JSDOM, loads validators, drives tests, prints summary, exits 0/1. |
| Create: `scripts/crm-tests/fixtures.js` | Re-exports the 126-listing fixture array from `public/crm/tests/offline-test-framework.js` so tests can import without the IIFE wrapper. |
| Create: `scripts/crm-tests/cases-description-compliance.js` | Test cases for `21-description-compliance.js` — Fair Housing + REBNY pattern matching. Pure JS, no DOM. |
| Create: `scripts/crm-tests/cases-form-validators.js` | Test cases for `19-form-validators-sale.js`, `20-form-validators-rental.js`, `22-date-and-listing-validators.js` via JSDOM. |
| Modify: `package.json` | Update `crm:test` script. Add `jsdom` devDep. |
| Modify: `.github/workflows/pr-check.yml` | Confirm `npm run crm:test` is in the gate sequence (it already references `npm run ci`; we want crm:test to also run). |
| Create: `tests/runtime/crm-test-runner.test.ts` | One-line meta-test that shells out to the runner and asserts exit 0. Confirms the gate is wired into CI. |

---

## Task 1: Add JSDOM + restructure fixture access

**Files:**
- Modify: `package.json` (add devDep)
- Create: `scripts/crm-tests/fixtures.js`

- [ ] **Step 1: Add jsdom**
  ```bash
  npm install --save-dev jsdom@^25
  ```

- [ ] **Step 2: Read offline-test-framework.js to identify the fixtures variable**

  The fixture array is named `FIXTURES` inside the IIFE in `public/crm/tests/offline-test-framework.js`. We need to expose it without modifying the original file (it's loaded as a script tag in the form HTML, can't be ES-module-converted).

- [ ] **Step 3: Create `scripts/crm-tests/fixtures.js`**

  This file re-evaluates the offline framework in a sandbox and extracts FIXTURES.

  ```javascript
  // scripts/crm-tests/fixtures.js
  // Loads public/crm/tests/offline-test-framework.js in a sandbox,
  // captures the fixture array (FIXTURES inside the IIFE), and re-exports it
  // so Node tests can use the same 126-listing dataset the browser tests use.
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");

  const FRAMEWORK_PATH = path.resolve(
    __dirname, "..", "..", "public", "crm", "tests", "offline-test-framework.js"
  );

  function loadFixtures() {
    const source = fs.readFileSync(FRAMEWORK_PATH, "utf8");
    // The framework is an IIFE that does not export. Wrap it so we can
    // capture FIXTURES off the inner scope by patching the IIFE.
    // Strategy: append a tail that copies FIXTURES into a context global.
    const patched =
      source.replace(
        /\}\(\)\);?\s*$/, // last `})()` of the IIFE
        "if (typeof FIXTURES !== 'undefined') { globalThis.__FIXTURES__ = FIXTURES; }\n})());"
      );

    const sandbox = { globalThis: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(patched, sandbox, { filename: "offline-test-framework.js" });
    const fixtures = sandbox.globalThis.__FIXTURES__;
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      throw new Error("Failed to load fixtures from offline-test-framework.js");
    }
    return fixtures;
  }

  module.exports = { loadFixtures };
  ```

- [ ] **Step 4: Smoke-test fixture loading**
  ```bash
  node -e "console.log(require('./scripts/crm-tests/fixtures').loadFixtures().length)"
  ```
  Expected: `126` (or whatever count `FIXTURES.length` actually is — read the file to confirm exact number; update this step's expected value to match).

- [ ] **Step 5: Commit**
  ```bash
  git add package.json package-lock.json scripts/crm-tests/fixtures.js
  git commit -m "chore(crm-test): add jsdom + fixture loader for Node-side CRM tests"
  ```

## Task 2: Description compliance test cases

**Files:**
- Create: `scripts/crm-tests/cases-description-compliance.js`

This validator (`21-description-compliance.js`) is the most testable in pure Node — its pattern arrays don't need a DOM. We extract its violation arrays via the same vm/sandbox technique and assert behavior on known inputs.

- [ ] **Step 1: Write failing test cases**

  ```javascript
  // scripts/crm-tests/cases-description-compliance.js
  // Tests pattern coverage in public/crm/tests/21-description-compliance.js.
  // We load the file in a sandbox, capture the FAIR_HOUSING_VIOLATIONS and
  // REBNY_DESCRIPTION_VIOLATIONS arrays, then run a fixed catalog of inputs
  // through every regex and assert the expected category fires.
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");

  const VALIDATOR_PATH = path.resolve(
    __dirname, "..", "..", "public", "crm", "tests", "21-description-compliance.js"
  );

  function loadPatternArrays() {
    const source = fs.readFileSync(VALIDATOR_PATH, "utf8");
    const patched = source.replace(
      /\}\(\)\);?\s*$/,
      "globalThis.__FAIR_HOUSING__ = FAIR_HOUSING_VIOLATIONS;\nglobalThis.__REBNY__ = REBNY_DESCRIPTION_VIOLATIONS;\n})());"
    );
    const sandbox = { globalThis: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(patched, sandbox);
    return {
      fairHousing: sandbox.globalThis.__FAIR_HOUSING__,
      rebny: sandbox.globalThis.__REBNY__,
    };
  }

  // Each row: [input text, expected category substring, validator group]
  const CASES = [
    // Fair Housing — Federal protected classes
    ["Perfect for young professionals", "Familial Status", "fairHousing"],
    ["Walking distance to church", "Religion", "fairHousing"],
    ["Wheelchair friendly bath", "Disability", "fairHousing"],
    ["Bachelor pad", "Sex/Gender", "fairHousing"],
    // NY State
    ["Veteran preferred", "Military Status", "fairHousing"],
    ["Married couples only", "Marital Status", "fairHousing"],
    // NYC Title 8
    ["No Section 8 vouchers accepted", "Source of Income", "fairHousing"],
    ["Background check required for all applicants", "Arrest/Conviction", "fairHousing"],
    // Steering
    ["Quiet, family-friendly neighborhood with good schools", "Steering", "fairHousing"],
    // Outdated
    ["Master bedroom with en-suite", "Outdated Term", "fairHousing"],
    // High pressure
    ["Won't last — act fast!", "High-Pressure", "fairHousing"],
    // REBNY — off-market
    ["Quiet sale, off-market opportunity", "Off-Market Language", "rebny"],
    // Clean text — should match nothing
    ["Sunny one-bedroom on a high floor with park views.", null, "fairHousing"],
  ];

  function run() {
    const groups = loadPatternArrays();
    if (!Array.isArray(groups.fairHousing) || !Array.isArray(groups.rebny)) {
      throw new Error("Pattern arrays not exported from validator file");
    }

    const results = [];
    for (const [text, expectedCategory, group] of CASES) {
      const patterns = groups[group];
      const fired = patterns.filter(p => p.pattern.test(text));
      if (expectedCategory === null) {
        if (fired.length === 0) {
          results.push({ pass: true, name: `clean:${text.slice(0, 30)}` });
        } else {
          results.push({
            pass: false,
            name: `clean:${text.slice(0, 30)}`,
            detail: `Unexpected match: ${fired.map(f => f.category).join(", ")}`,
          });
        }
      } else {
        const match = fired.find(f => f.category.includes(expectedCategory));
        if (match) {
          results.push({ pass: true, name: `${expectedCategory}:${text.slice(0, 30)}` });
        } else {
          results.push({
            pass: false,
            name: `${expectedCategory}:${text.slice(0, 30)}`,
            detail: `No pattern matched expected category "${expectedCategory}"`,
          });
        }
      }
    }
    return results;
  }

  module.exports = { run, CASES };
  ```

- [ ] **Step 2: Smoke-test independently**
  ```bash
  node -e "const r = require('./scripts/crm-tests/cases-description-compliance').run(); console.log('passed', r.filter(x=>x.pass).length, 'of', r.length); r.filter(x=>!x.pass).forEach(x=>console.error(x))"
  ```
  Expected: all cases pass. If any fail, the validator's regex coverage has regressed — investigate before continuing.

- [ ] **Step 3: Commit**
  ```bash
  git add scripts/crm-tests/cases-description-compliance.js
  git commit -m "test(crm): description-compliance pattern coverage cases"
  ```

## Task 3: Form validator test cases (JSDOM)

**Files:**
- Create: `scripts/crm-tests/cases-form-validators.js`

The sale/rental form validators (`19-form-validators-sale.js`, `20-form-validators-rental.js`, `22-date-and-listing-validators.js`) reference DOM globals (`document.getElementById`, etc.) that the form HTML pages provide. We mount those HTML pages in JSDOM, let the IIFEs register their handlers, then exercise representative scenarios.

- [ ] **Step 1: Inspect what each validator exposes**

  Read each file and identify what global functions they attach to `window` (e.g. `validateREBNYRequired`, `validateStatusChange`, `validateDates`). Record them in a comment at the top of the cases file.

- [ ] **Step 2: Write the JSDOM harness**

  ```javascript
  // scripts/crm-tests/cases-form-validators.js
  // Loads SALE-FORM-REDESIGN.html and RENTAL-FORM-REDESIGN.html in JSDOM,
  // injects the validator scripts so their IIFEs run, then exercises the
  // exposed window.* functions against synthetic inputs.
  const fs = require("fs");
  const path = require("path");
  const { JSDOM } = require("jsdom");

  const PUBLIC_CRM = path.resolve(__dirname, "..", "..", "public", "crm");

  function loadFormDom(formFile, validatorFiles) {
    const html = fs.readFileSync(path.join(PUBLIC_CRM, formFile), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
    // Inject validator scripts in order
    for (const f of validatorFiles) {
      const src = fs.readFileSync(path.join(PUBLIC_CRM, "tests", f), "utf8");
      const script = dom.window.document.createElement("script");
      script.textContent = src;
      dom.window.document.body.appendChild(script);
    }
    return dom;
  }

  function run() {
    const results = [];

    // ── Sale form ──────────────────────────────────────────────
    try {
      const saleDom = loadFormDom("SALE-FORM-REDESIGN.html", [
        "19-form-validators-sale.js",
        "21-description-compliance.js",
        "22-date-and-listing-validators.js",
      ]);
      // Validate that core functions registered. If they didn't, the form's
      // HTML structure changed in an incompatible way — flag the regression.
      const fns = ["validateREBNYRequired", "validateStatusChange", "validateDates"];
      for (const fn of fns) {
        const present = typeof saleDom.window[fn] === "function";
        results.push({
          pass: present,
          name: `sale:${fn} registered`,
          detail: present ? "" : "function missing on window",
        });
      }
      saleDom.window.close();
    } catch (err) {
      results.push({ pass: false, name: "sale:harness", detail: err.message });
    }

    // ── Rental form ────────────────────────────────────────────
    try {
      const rentalDom = loadFormDom("RENTAL-FORM-REDESIGN.html", [
        "20-form-validators-rental.js",
        "21-description-compliance.js",
        "22-date-and-listing-validators.js",
      ]);
      const fns = ["validateStatusChange", "checkDescriptionCompliance"];
      for (const fn of fns) {
        const present = typeof rentalDom.window[fn] === "function";
        results.push({
          pass: present,
          name: `rental:${fn} registered`,
          detail: present ? "" : "function missing on window",
        });
      }
      rentalDom.window.close();
    } catch (err) {
      results.push({ pass: false, name: "rental:harness", detail: err.message });
    }

    return results;
  }

  module.exports = { run };
  ```

  Note: the registered-function names above are best-effort. After reading each validator file in Step 1, **update the `fns` arrays here to exactly match what each IIFE actually attaches to window**. If a validator does not currently expose anything to `window`, treat that as a finding — open a small follow-up to expose it cleanly, but for now the test should match observed reality, not aspirational behavior. Document any "not exposed" cases in the test names so they show up in the run summary.

- [ ] **Step 3: Smoke-test**
  ```bash
  node -e "const r = require('./scripts/crm-tests/cases-form-validators').run(); console.log(JSON.stringify(r, null, 2))"
  ```

  Goal: every result row shows `pass: true`. If a function isn't on window because the IIFE didn't attach it, either:
  - (preferred) update the validator IIFE to attach it (small change), OR
  - (fallback) document the limitation in the test name and skip that assertion

- [ ] **Step 4: Commit**
  ```bash
  git add scripts/crm-tests/cases-form-validators.js
  git commit -m "test(crm): form-validator JSDOM harness"
  ```

## Task 4: Top-level runner + npm script

**Files:**
- Create: `scripts/crm-test-runner.js`
- Modify: `package.json`

- [ ] **Step 1: Write the runner**

  ```javascript
  // scripts/crm-test-runner.js
  // Top-level CRM test runner. Aggregates description-compliance pattern cases
  // and form-validator JSDOM cases. Prints a summary, exits 0 on all-pass.
  const descCompliance = require("./crm-tests/cases-description-compliance");
  const formValidators = require("./crm-tests/cases-form-validators");

  function colorize(text, code) {
    return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
  }

  function run() {
    const allResults = [
      ...descCompliance.run().map(r => ({ ...r, suite: "description-compliance" })),
      ...formValidators.run().map(r => ({ ...r, suite: "form-validators" })),
    ];

    const passed = allResults.filter(r => r.pass).length;
    const failed = allResults.length - passed;

    console.log("\n── CRM Test Runner ───────────────────────────────────────");
    for (const r of allResults) {
      const tag = r.pass ? colorize("PASS", "32") : colorize("FAIL", "31");
      console.log(`  ${tag}  [${r.suite}] ${r.name}${r.detail ? `  → ${r.detail}` : ""}`);
    }
    console.log(`\nResult: ${passed}/${allResults.length} passed (${failed} failed)\n`);

    if (failed > 0) process.exit(1);
  }

  run();
  ```

- [ ] **Step 2: Update `package.json` `crm:test` script**

  Replace:
  ```json
  "crm:test": "node public/crm/tests/05-test-suite-runner.js",
  ```
  With:
  ```json
  "crm:test": "node scripts/crm-test-runner.js",
  ```

- [ ] **Step 3: Run it**
  ```bash
  npm run crm:test
  ```
  Expected: exit 0, all-pass summary. If any FAIL appears, investigate (do NOT relax the assertions to make them pass).

- [ ] **Step 4: Commit**
  ```bash
  git add scripts/crm-test-runner.js package.json
  git commit -m "feat(crm-test): restore npm run crm:test (Node runner replaces deleted 05-test-suite-runner.js)"
  ```

## Task 5: CI wiring + meta-test

**Files:**
- Modify: `.github/workflows/pr-check.yml` (only if `crm:test` isn't already in the gate)
- Create: `tests/runtime/crm-test-runner.test.ts`

- [ ] **Step 1: Verify CI already calls crm:test**

  Read `.github/workflows/pr-check.yml`. If `npm run crm:test` is already a step, skip Step 2.

- [ ] **Step 2 (if needed): Add to CI**

  Add a step under the existing job:
  ```yaml
  - name: CRM tests
    run: npm run crm:test
  ```
  Place it after `npm run ucba:audit` and before `npm run build`.

- [ ] **Step 3: Add a meta-test in the runtime suite**

  This guarantees the runner stays callable. A future PR that breaks `crm:test` will trip this even if CI wiring drifts.

  ```typescript
  // tests/runtime/crm-test-runner.test.ts
  import { spawnSync } from "node:child_process";
  import { describe, it, expect } from "vitest";

  describe("npm run crm:test", () => {
    it("exits 0", () => {
      const result = spawnSync("npm", ["run", "crm:test"], {
        encoding: "utf8",
        shell: true,
      });
      if (result.status !== 0) {
        console.error("crm:test stdout:\n" + result.stdout);
        console.error("crm:test stderr:\n" + result.stderr);
      }
      expect(result.status).toBe(0);
    });
  });
  ```

- [ ] **Step 4: Run the runtime suite**
  ```bash
  npm run test:runtime  # or whatever command runs tests/runtime/
  ```
  Expected: the new test passes.

- [ ] **Step 5: Commit**
  ```bash
  git add .github/workflows/pr-check.yml tests/runtime/crm-test-runner.test.ts
  git commit -m "ci(crm-test): wire crm:test into pr-check + add meta-test"
  ```

## Task 6: Full gate suite + open PR

- [ ] **Step 1: Run all gates**
  ```bash
  npm run type-check
  npm run ucba:audit
  npm run rls:validate
  npm run idx:validate
  npm run crm:test
  npm run ops:health
  npm run ci
  ```
  All must be green.

- [ ] **Step 2: Push + open PR**
  ```bash
  git push -u origin chore/restore-crm-test-runner
  ```

  Open via gh:
  ```bash
  gh pr create --title "chore(crm-test): restore npm run crm:test (PR 11)" --body "$(cat <<'EOF'
  ## Root cause

  Commit `a0e00f03` (2026-03-24) deleted 18 duplicate test files including `public/crm/tests/05-test-suite-runner.js`. The npm script reference was left orphaned, so `npm run crm:test` has been silently broken on `main` ever since.

  ## Fix

  Replaces the deleted runner with a Node-side runner that exercises the in-tree validators that DO still exist (`19-form-validators-sale.js`, `20-form-validators-rental.js`, `21-description-compliance.js`, `22-date-and-listing-validators.js`) using the deterministic 126-listing fixture set in `offline-test-framework.js`.

  - `scripts/crm-test-runner.js` — top-level runner, exits 0/1
  - `scripts/crm-tests/cases-description-compliance.js` — Fair Housing + REBNY pattern coverage
  - `scripts/crm-tests/cases-form-validators.js` — JSDOM harness for sale + rental form validators
  - `scripts/crm-tests/fixtures.js` — vm-sandboxed fixture loader (re-uses the existing fixture data)

  Wired into `.github/workflows/pr-check.yml` and into `tests/runtime/` as a meta-test.

  ## Production Verification Note

  **Post-deploy URL to hit:** N/A (dev tooling only).
  **Metric to observe:** `npm run crm:test` exits 0 in CI on every PR going forward. Failures show specific suite + case names.
  **Rollback trigger:** Runner produces false positives or false negatives that mask real validator regressions.
  **Success criteria within 30 minutes:** PR `pr-check` workflow shows `crm:test` step green; future PR descriptions can include this gate.

  EOF
  )"
  ```

- [ ] **Step 3: Wait for CI green, request review, merge**

- [ ] **Step 4: Update `memory/REFACTOR-2026-04-25.md`** — change PR 11 status from `IN PROGRESS` to `MERGED — <commit-sha> · <date>`.

## Definition of Done

- [ ] `npm run crm:test` exits 0 on a clean checkout of main
- [ ] CI step `pr-check` includes the `crm:test` gate
- [ ] Meta-test in `tests/runtime/` asserts the runner returns 0
- [ ] No regressions in `ucba:audit`, `rls:validate`, `idx:validate`, `ops:health`
- [ ] PR merged + plan file updated
