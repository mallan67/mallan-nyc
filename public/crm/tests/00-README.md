# MALLAN NYC — Test & Validation Toolkit

**Updated:** 2026-03-24
**Browser Tests:** 67 (bundled in `js/compliance/compliance-gates-and-output.js`)
**IDX Validator:** 32 sections (`npm run idx:validate`)
**Enforcement:** Binary PASS/FAIL — no WARN, no thresholds

---

## Architecture

All 67 browser tests (compliance doctor, wiring, behavior, extended, no-VOW, allowlist, search, security, a11y/RESO/perf, regression, integrity) are **bundled in** `public/crm/js/compliance/compliance-gates-and-output.js` (3,199 lines). They run automatically on page load (broker-only, silent — badge only, no modal).

The standalone source files (01-18) were **removed 2026-03-24** as duplicates — they were never loaded by any HTML file.

---

## Files in This Directory

### Form Validators (browser — loaded by form HTML files)

| File | Lines | Description |
|------|-------|-------------|
| `19-form-validators-sale.js` | 285 | Sale form: validateREBNYRequired(), validateStatusChange(), validateDates() |
| `20-form-validators-rental.js` | 185 | Rental form: validateStatusChange(), checkDescriptionCompliance() |
| `21-description-compliance.js` | 189 | Real-time Fair Housing + REBNY description scanner |
| `22-date-and-listing-validators.js` | 443 | Date validation + full listing submission validator |

### Doctor Modules (browser — loaded by standalone form HTML)

| File | Lines | Description |
|------|-------|-------------|
| `sale-form-doctor.js` | 1,390 | Sale form diagnostic: DQ, CF, UN, RESO, NYC checks |
| `rental-form-doctor.js` | 1,574 | Rental form diagnostic: validation, Fair Housing, SOI, content scan |
| `search-doctor.js` | 1,186 | Search diagnostic: wiring, Fair Housing, REBNY compliance |
| `search-core.js` | 1,102 | Core search functions + reference data (STATUS_MAP, OWNERSHIP_MAP) |

### Node.js CLI

| File | Lines | Description |
|------|-------|-------------|
| `validate-standalone.js` | 760 | 30-check Node.js validator: file structure, function presence, parity |

### Test Framework

| File | Lines | Description |
|------|-------|-------------|
| `offline-test-framework.js` | 1,125 | Deterministic 126-listing fixture dataset for offline testing |

---

## Running Tests

### Browser (67 tests — automatic)
Tests run on CRM page load for broker role only (silent). Click the badge at bottom-right for details.

### IDX Plus Validator (32 sections — CLI)
```bash
npm run idx:validate          # Full 32-section audit
npm run idx:validate --fails  # Show only failures
npm run idx:validate --json   # Machine-readable output
npm run idx:validate --section 7  # Run specific section
```

### Form Doctors
Load `sale-form-doctor.js` or `rental-form-doctor.js` in the respective form page. Diagnostic panel renders automatically.

### Node.js Validation
```bash
node scripts/validate-standalone.js validate search
```

---

## Bundled Test Suite (in compliance-gates-and-output.js)

```
REBNYTestSuite (master runner)
├── setupStrictGuards()
├── REBNYComplianceDoctor        — 10 tests
├── REBNYWiringTest              — 7 tests (W1-W7)
├── REBNYBehaviorTest            — 6 tests (B1-B6)
├── REBNYComplianceExtended      — 7 tests (C1-C7)
├── NoVOWDriftTests              — 5 tests (NV1-NV5)
├── AllowlistLeakTests           — 5 tests (AL1-AL5)
├── SearchCorrectnessTests       — 4 tests (S1-S4)
├── SecurityHardeningV2Tests     — 3 tests (X1-X3)
├── AccessibilityRESOPerfTests   — 7 tests (A11Y, RESO, PERF)
├── MutationRegressionTests      — 3 tests (R1-R3)
├── teardownStrictGuards()
├── StrictIntegrityTests         — 7 tests
└── SourceIntegrityTests         — 3 tests
                                   ─────
                                   67 total
```
