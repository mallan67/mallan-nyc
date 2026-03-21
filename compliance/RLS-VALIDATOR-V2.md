# RLS Compliance Validator v2 — Deterministic (Production Files)

> **Status:** IN PROGRESS | **Date:** 2026-02-25
> **Target:** 6 production HTML files in `public/crm/`
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## Overview

The RLS Compliance Validator v2 is a deterministic, attribute-first validation engine that checks all 6 production HTML files for REBNY RLS compliance. It replaces the v1 heuristic-based validator that silently skipped unresolvable elements and produced false passes.

**Key difference from v1:** Every form element must be explicitly classified. No silent skips. Unknown elements are hard errors.

---

## Architecture

### Three-Bucket Classification (every element, no exceptions)

| Bucket | Meaning | Action |
|--------|---------|--------|
| **RLS_BOUND** | Mapped to a canonical RLS field | Full validation suite applied |
| **INTERNAL_ONLY** | Explicitly marked as CRM/UI-only | Skipped — no RLS assertions |
| **UNKNOWN** | No classification found | **HARD ERROR** — exit code 1 |

### 4-Layer Resolution Pipeline

```
Layer 0: data-rls-ignore="true"  → INTERNAL_ONLY (skip validation)
Layer 1: data-rls-field="X"      → RLS_BOUND to field X (authoritative)
Layer 2: rls-field-aliases.json   → explicit alias lookup (fallback)
Layer 3: Prefix normalization     → strip sale/rental/bldg/TH/comm/oh + match registry
Layer 4: FAIL                     → UNKNOWN (hard error, exit code 1)
```

Layer 1 (`data-rls-field`) is the authoritative source. Layers 2-3 are fallbacks for elements not yet tagged with HTML attributes.

### Two-Pass Architecture

**Pass A — Discovery:** Parse all form elements in all 6 HTML files. Classify each element using the 4-layer pipeline.

**Pass B — Validation:** For each RLS_BOUND element, run the appropriate validation suite based on file category.

### File Categories

| Category | Files | Validation Suite |
|----------|-------|-----------------|
| **Submission** | `SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html` | Required fields + picklists + conditionals + payload mapping |
| **CRM** | `MALLAN-NYC-CRM-FINAL2.html` | Picklist validity + binding completeness (CRM overlays acknowledged) |
| **Viewer** | `SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html` | Picklist/enum validity + binding completeness + no-submit lockdown |
| **Search** | `index-built.html` | Internal-only hygiene only (no RLS assertions) |

---

## 10 Validation Sections

| # | Section | Submission | CRM | Viewer | Search |
|---|---------|-----------|-----|--------|--------|
| 1 | Picklist Values | ERROR | ERROR+overlay | ERROR | skip |
| 2 | Required Fields (48) | ERROR | skip | skip | skip |
| 3 | RESO-to-RLS Renames (23) | PASS/FAIL | PASS/FAIL | PASS/FAIL | skip |
| 4 | Distribution Gates (6) | PASS/FAIL | PASS/FAIL | PASS/FAIL | skip |
| 5 | Field Map Integrity | PASS/FAIL | PASS/FAIL | PASS/FAIL | skip |
| 6 | Mock Data | PASS/FAIL | skip | PASS/FAIL | skip |
| 7 | Conditional Rules | ERROR | skip | skip | skip |
| 8 | Role Masking | skip | skip | ERROR | skip |
| 9 | RLS Field Coverage | PASS/FAIL | PASS/FAIL | PASS/FAIL | skip |
| 10 | Viewer Lockdown | skip | skip | ERROR | skip |

**Section 10 (Viewer Lockdown)** checks viewer files for:
- No `<form action="...">` submission routes
- No `required` attributes on form elements
- No "Save"/"Submit" buttons wired to POST/PUT/fetch
- No hidden RLS payload generation (`buildRLSPayload`, `submitToRLS`)

---

## Scripts & Commands

| Script | npm Command | Purpose |
|--------|-------------|---------|
| `scripts/validate-rls-compliance.js` | `npm run rls:validate` | Run full 10-section compliance check |
| `scripts/test-rls-bindings.js` | `npm run test:rls` | Run 42 regression tests |
| `scripts/audit-form-fields.js` | `npm run rls:generate` | Audit all form elements against RLS fields |
| `scripts/inject-rls-attributes.js` | `npm run rls:inject` | Inject `data-rls-*` attributes into HTML |

### Workflow

```bash
# 1. Generate binding map (after any HTML changes)
npm run rls:generate

# 2. Inject attributes into production HTML files
npm run rls:inject

# 3. Validate compliance
npm run rls:validate

# 4. Run regression tests
npm run test:rls

# Generate HTML report
node scripts/validate-rls-compliance.js --html
# → public/rls-report.html
```

---

## Data Files

| File | Contents | Size |
|------|----------|------|
| `data/rls-form-bindings.json` | Complete element classification map | 2,516 elements |
| `data/rls-field-aliases.json` | Form element ID → RLS field name | 239 aliases |
| `data/rls-internal-only.json` | Internal-only field identifiers | 491 entries |
| `data/rls-crm-overlays.json` | CRM pipeline overlay values | 5 fields, 40 values |
| `data/rebny-rls-property-fields.csv` | RLS field definitions (source of truth) | 902 IDX Plus fields |
| `data/rebny-rls-property-lookup.csv` | Official REBNY picklist values | 2,066 values |

---

## HTML Attributes (Production Files)

All form elements in the 6 production files have been tagged with explicit attributes:

```html
<!-- RLS-bound element -->
<select id="saleStatus" data-rls-field="MlsStatus" class="field-input">

<!-- Internal-only element -->
<input id="saleCalcTerm" data-rls-ignore="true" type="number">

<!-- Viewer body tag -->
<body data-rls-viewer="true">
```

### Attribute Counts (2026-02-25)

| Production File | `data-rls-field` | `data-rls-ignore` | Other |
|-------------|-------------------|--------------------|-------|
| `SALE-FORM-REDESIGN.html` | 185 | 168 | Submission form |
| `RENTAL-FORM-REDESIGN.html` | 247 | 168 | Submission form |
| `MALLAN-NYC-CRM-FINAL2.html` | 415 | 364 | CRM hub |
| `SALE-FORM-WITH-TOOLS.html` | 175 | 197 | Viewer + `data-rls-viewer` |
| `RENTAL-FORM-WITH-TOOLS.html` | 240 | 196 | Viewer + `data-rls-viewer` |
| `index-built.html` | 13 | 148 | Search/UI |

---

## Regression Tests (42 Assertions)

| Category | Tests | What It Checks |
|----------|-------|----------------|
| Binding Resolution | 12 | Known form IDs resolve to correct RLS fields |
| Internal-Only Classification | 7 | UI/calculator/admin fields marked internal |
| No Silent Skip | 2 | Unknown field IDs throw hard errors |
| Attribute-First (Layer 0+1) | 4 | `data-rls-field` overrides heuristic, `data-rls-ignore` overrides RLS |
| Viewer Detection | 5 | WITH-TOOLS = viewer, REDESIGN = not viewer |
| JSON Config Integrity | 5 | Alias count, internal count, overlay count, binding stats |
| Binding Map Completeness | 4 | Per-file RLS-bound counts, 0 unknowns |
| Attribute Injection Verification | 3 | HTML attributes present, viewer tags correct |

---

## Current Results (2026-02-25)

```
CLASSIFICATION SUMMARY
  RLS_BOUND:     1,275 elements across 6 files
  INTERNAL_ONLY: 1,241 elements across 6 files
  UNKNOWN:       0 elements (MUST be 0 for CI pass)

VALIDATION RESULTS
  Section  1: PICKLIST VALUES .................... PASS
  Section  2: REQUIRED FIELDS .................... PASS
  Section  3: RESO→RLS RENAMES ................... PASS
  Section  4: DISTRIBUTION GATES ................. PASS
  Section  5: FIELD MAP INTEGRITY ................ PASS
  Section  6: MOCK DATA .......................... PASS
  Section  7: CONDITIONAL RULES .................. PASS
  Section  8: ROLE MASKING ....................... PASS
  Section  9: RLS FIELD COVERAGE ................. PASS
  Section 10: VIEWER LOCKDOWN .................... PASS

  TOTAL: 0 ERRORS, 0 WARNINGS, 0 UNKNOWN
  42/42 regression tests pass
```

---

## Bugs Found During Rebuild

The v1 validator falsely passed these due to loose substring matching:

| Field | Issue | Fix |
|-------|-------|-----|
| `BathroomsTotal` | Missing from sale + rental forms (only had BathroomsFull + BathroomsHalf) | Added auto-computed readonly field to all 4 form/viewer production files |
| `NewDevelopmentYN` | Not a standalone boolean — only appeared as radio value for BuildingStatus | Added checkbox to Building Status in all 4 form/viewer production files |

---

## Remaining Work

- [ ] Wire `rls:validate` + `test:rls` into CI pipeline (`npm run ci`)
- [ ] Add conditional rules behavioral enforcement (Section 7 — currently checks field presence only)
- [ ] Integrate with production build workflow
- [ ] Add auto-validation on form save (production JS)
