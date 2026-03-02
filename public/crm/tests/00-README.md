# MALLAN NYC — Complete Test & Validation Toolkit

All test tools, compliance validators, diagnostics, and form doctors for the MALLAN NYC CRM system.

**Total Files:** 27 | **Total Lines:** 9,915
**Browser Tests:** 67 (REBNY Test Suite) | **Node Checks:** 30 (validate-standalone)
**Enforcement:** Binary PASS/FAIL only — no WARN, no thresholds, no fallbacks

---

## File Index

### A. REBNY Test Suite (67 browser tests) — from SEARCH-STANDALONE.html

| # | File | Lines | Tests | Description |
|---|------|-------|-------|-------------|
| 01 | `01-compliance-doctor.js` | 425 | 10 | REBNY Compliance Doctor (Tests 1-10) + badge + modal |
| 02 | `02-wiring-test.js` | 205 | 7 | Data Integrity & Feed Conformance (W1-W7) |
| 03 | `03-behavior-test.js` | 87 | 6 | Edge Cases & UI (B1-B6) |
| 04 | `04-compliance-extended.js` | 114 | 7 | Security & REBNY Hardening (C1-C7) |
| 05 | `05-test-suite-runner.js` | 111 | — | REBNYTestSuite master runner + runActiveTests + history |
| 06 | `06-test-modal.js` | 90 | — | 8-tab test results modal UI |
| 07 | `07-strict-guards.js` | 144 | — | Guard infrastructure: _strictGuards, markFallbackUsed, computeDatasetHash, setupStrictGuards, teardownStrictGuards, safeSuiteCall |
| 08 | `08-strict-integrity-tests.js` | 114 | 7 | Integrity guards (GUARD-01, GUARD-02, INT-01, INT-03, INT-04, INT-05, INT-06) |
| 09 | `09-source-integrity-tests.js` | 63 | 3 | Source data checks (SRC-01, SRC-02, SRC-03) |
| 10 | `10-no-vow-drift-tests.js` | 101 | 5 | No-VOW Drift (NV1-NV5) |
| 11 | `11-allowlist-leak-tests.js` | 120 | 5 | Allowlist Leak Detection (AL1-AL5) |
| 12 | `12-search-correctness-tests.js` | 73 | 4 | Search Filter Correctness (S1-S4) |
| 13 | `13-security-hardening-tests.js` | 104 | 3 | XSS/SQLi/TCPA Hardening (X1-X3) |
| 14 | `14-a11y-reso-perf-tests.js` | 144 | 7 | Accessibility, RESO, Performance (A11Y1-2, RESO1-3, PERF1-2) |
| 15 | `15-mutation-regression-tests.js` | 102 | 3 | Mutation & Regression (R1-R3) |
| 16 | `16-page-init.js` | 31 | — | DOMContentLoaded init + 33-function validation |

### B. Compliance Infrastructure — from SEARCH-STANDALONE.html

| # | File | Lines | Description |
|---|------|-------|-------------|
| 17 | `17-compliance-gates.js` | 368 | checkListingCompliance() + logAuditEntry() — IDX/address opt-out gates |
| 18 | `18-fair-housing-scanner.js` | 266 | FAIR_HOUSING_VIOLATIONS array + checkFairHousing() + performFairHousingCheck() |
| 19 | `19-form-validators-sale.js` | 281 | validateREBNYRequired() + validateStatusChange() + validateDates() (sale form) |
| 20 | `20-form-validators-rental.js` | 181 | validateStatusChange() + checkDescriptionCompliance() + checkFairHousing() (rental form) |
| 21 | `21-description-compliance.js` | 181 | checkDescriptionCompliance() + _performComplianceCheck() (real-time scanner) |
| 22 | `22-date-and-listing-validators.js` | 443 | validateDates() + validateSalesListing() (full submission validation) |

### C. Standalone Doctor Modules (external JS files)

| File | Lines | Description |
|------|-------|-------------|
| `sale-form-doctor.js` | 1,390 | Sale form diagnostic: DQ (10), CF (6), UN (5), RESO (4), NYC (3) checks |
| `rental-form-doctor.js` | 1,574 | Rental form diagnostic: validation, Fair Housing, SOI, content scan, bug report |
| `search-doctor.js` | 1,183 | Search diagnostic module |
| `search-core.js` | 1,102 | Core search functions extracted for testing |

### D. Node.js CLI Validation

| File | Lines | Description |
|------|-------|-------------|
| `validate-standalone.js` | 794 | 30-check Node.js validator: file structure, function presence, compliance, parity |

---

## Test Suite Architecture

```
REBNYTestSuite (master runner — 05)
├── setupStrictGuards() (07)       — console intercept, MutationObserver, Object.freeze, hash
├── safeSuiteCall() (07) wrapper for each:
│   ├── REBNYComplianceDoctor (01) — 10 tests (Tests 1-10)
│   ├── REBNYWiringTest (02)       — 7 tests (W1-W7)
│   ├── REBNYBehaviorTest (03)     — 6 tests (B1-B6)
│   ├── REBNYComplianceExtended (04) — 7 tests (C1-C7)
│   ├── NoVOWDriftTests (10)       — 5 tests (NV1-NV5)
│   ├── AllowlistLeakTests (11)    — 5 tests (AL1-AL5)
│   ├── SearchCorrectnessTests (12) — 4 tests (S1-S4)
│   ├── SecurityHardeningV2Tests (13) — 3 tests (X1-X3)
│   ├── AccessibilityRESOPerfTests (14) — 7 tests (A11Y1-2, RESO1-3, PERF1-2)
│   └── MutationRegressionTests (15) — 3 tests (R1-R3)
├── teardownStrictGuards() (07)    — restore console, disconnect observer, after-hash
├── StrictIntegrityTests (08)      — 7 tests (GUARD-01/02, INT-01/03-06)
└── SourceIntegrityTests (09)      — 3 tests (SRC-01, SRC-02, SRC-03)

Compliance Gates (17)              — checkListingCompliance(), logAuditEntry()
Fair Housing Scanner (18)          — FAIR_HOUSING_VIOLATIONS, checkFairHousing()
Description Compliance (21)        — checkDescriptionCompliance(), _performComplianceCheck()
Form Validators (19, 20, 22)       — validateREBNYRequired(), validateStatusChange(), validateDates(), validateSalesListing()

Doctor Modules (standalone JS)
├── sale-form-doctor.js            — SaleFormDoctor() IIFE: validate, compliance, field audit, Fair Housing
├── rental-form-doctor.js          — RentalFormDoctor() IIFE: validate, Fair Housing, SOI, content scan
├── search-doctor.js               — Search diagnostic module
└── search-core.js                 — Core search functions
```

## 8-Tab Modal Display

| Tab | Icon | Tests |
|-----|------|-------|
| 1. Wiring | fa-plug | W1-W7 |
| 2. Behavior | fa-mouse-pointer | B1-B6 |
| 3. Compliance | fa-shield-alt | Tests 1-10, C1-C7 |
| 4. No-VOW | fa-lock | NV1-NV5 |
| 5. Allowlist | fa-filter | AL1-AL5 |
| 6. Search+ | fa-search | S1-S4 |
| 7. Hardening | fa-lock | X1-X3, A11Y, RESO, PERF, R1-R3 |
| 8. Integrity | fa-fingerprint | GUARD-01/02, INT-01/03-06, SRC-01-03 |

---

## Enforcement Rules (v1.2 / v2.0)

1. **No fallback/default values** — missing data = FAIL
2. **No leniency or thresholds** — zero tolerance, binary PASS/FAIL
3. **No auto-correcting** bad input inside tests
4. **No conditional assertion skips** — every code path hits an assertion
5. **No in-test mutation** — tests must not modify the SUT
6. **No WARN status** — zero `'WARN'` strings in entire codebase
7. **Fallback Tripwire** — `markFallbackUsed()` global; any call = suite FAIL
8. **Console Ban** — console.warn/error during tests = FAIL
9. **Dataset Checksum** — hash before/after must match
10. **Object.freeze** — PROHIBITED_DISPLAY_FIELDS, PROHIBITED_LEAK_FIELDS frozen

---

## Key Constants

| Constant | Value |
|----------|-------|
| `COMPLIANCE_DOCTOR_VERSION` | `1.0.0` |
| `TEST_SUITE_VERSION` | `1.2.0` |
| `EXTENDED_SUITE_VERSION` | `1.1.0` |
| `PROHIBITED_DISPLAY_FIELDS` | 9 fields (compensation, private remarks, owner info) |
| `PROHIBITED_LEAK_FIELDS` | 15 fields (display fields + MLS IDs, system keys) |

---

## Running Tests

### In Browser (67 tests)
1. Open `SEARCH-STANDALONE.html` in browser
2. Tests run automatically on page load (verbose to console)
3. Click the compliance badge (bottom-right) or "Run Active Tests" in modal
4. Results shown in 8-tab modal

### Form Doctor Modules
1. Load `sale-form-doctor.js` or `rental-form-doctor.js` into the respective form page
2. Diagnostic panel renders automatically
3. Use `_runValidate()`, `_runCompliance()`, `_runFieldAudit()`, `_runFairHousing()` APIs

### Node.js Validation (30 checks)
```bash
cd mallan-nyc
node scripts/validate-standalone.js validate search
```
Expected: 29/30 PASS (1 WARN for P1 mockListings parity — expected)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-02-13 | Original 30 tests (Compliance Doctor + Wiring + Behavior + Extended) |
| v1.1.0 | 2026-02-15 | +27 extended tests (NV, AL, S, X, A11Y/RESO/PERF, R) |
| v1.2.0 | 2026-02-15 | STRICT NO-SUBSTITUTE: all WARN->FAIL, thresholds removed |
| v2.0 | 2026-02-15 | STRICT INTEGRITY: +10 guard/integrity/source tests (67 total) |
