# Plan: SEARCH-STANDALONE.html Modular Re-extraction

## Context

The 42,778-line monolithic `SEARCH-STANDALONE.html` needs to be split into a clean modular file structure. A previous extraction attempt (in `search-app/`) produced 82 files but the built output had JS errors, broken div balancing, and an incomplete build script. The original file is confirmed untouched (identical to backup).

This is a **multi-agent brokerage CRM** — each agent sees only their own clients/searches/listings. The broker sees everything. All modules must preserve `LOGGED_IN_AGENT` role scoping and REBNY/RESO compliance.

## Approach: Manual Phase-by-Phase with Verification Gates

**Key differences from previous attempt:**
1. **Manual extraction** — read specific line ranges, verify div balance, write each file by hand. No automated extraction scripts.
2. **Fresh directory** — `search-modular/` (keep broken `search-app/` for reference)
3. **Verification gate after each phase** — don't proceed until the phase passes
4. **PROGRESS.md tracking** — lets the next chat resume exactly where we left off
5. **Multi-agent scoping preserved** — every module respects `LOGGED_IN_AGENT` role (broker sees all, agent sees own)

**Source file:** `C:/Users/MayaAllan/Desktop/1/Old/SEARCH-STANDALONE.html` (42,778 lines — READ ONLY, never modified)
**Output directory:** `C:/Users/MayaAllan/Desktop/1/Old/search-modular/` (fresh, not reusing broken `search-app/`)
**Tracking file:** `C:/Users/MayaAllan/Desktop/1/Old/search-modular/PROGRESS.md`

---

## Phase 0: Setup (5 min)
- [x] Create fresh `search-modular/` directory structure
- [x] Create `PROGRESS.md` tracking file
- [x] Verify backup exists and matches original
- [x] Copy the two reference docs into `search-modular/docs/`

## Phase 1: CSS Extraction (lines 35–1091)
Extract the `<style>` block into 8 CSS files by concern:

| File | Content | Approx Lines |
|------|---------|-------------|
| `css/base.css` | Variables, reset, fonts, theme, animations | ~215 |
| `css/search-form.css` | DRP, CSD, search styling, form redesign | ~350 |
| `css/results.css` | Results section styles | ~10 |
| `css/crm.css` | Sidebar, client workspace, commission | ~245 |
| `css/manage.css` | Manage listings styles | ~5 |
| `css/modals.css` | Modal overlay styles | ~5 |
| `css/responsive.css` | All `@media` breakpoints | ~250 |
| `css/print.css` | `@media print` rules | ~17 |

**Gate:** All 8 CSS files created. Combined line count matches original style block (~1,056 lines of actual CSS).

---

## Phase 2: HTML Extraction
Extract HTML sections and modals. **This is the most critical phase** — div balancing must be exact.

### 2a: Header/Nav (lines 1096–1113)
→ `html/nav.html`

### 2b: Section-main WITHOUT modals (lines 1118–11451)
The key fix: extract 9 modals OUT of section-main, leaving only search form + comparable reports + results.
→ `html/search-form-and-results.html` (~7,800 lines after modal removal)

**Modals to extract from section-main:**

| Modal ID | Approx Line | Target File |
|----------|-------------|-------------|
| `clientDeliveryModal` | 8929 | `html/modals/client-delivery.html` |
| `gridLayoutsModal` | 9129 | `html/modals/grid-layouts.html` |
| `reportsModal` | 9175 | `html/modals/reports.html` |
| `addClientModal` | 9749 | `html/modals/add-edit-client.html` |
| `saveSearchModal` | 10034 | `html/modals/save-search.html` |
| `reportPreviewModal` | 10067 | `html/modals/report-preview.html` |
| `clientFeedbackReplyModal` | 10786 | `html/modals/client-feedback.html` |
| `clientReportViewModal` | 11098 | `html/modals/client-report-view.html` |
| `filterModal` | 11239 | `html/modals/filter.html` |

### 2c: Other sections
| Section | Lines | Target |
|---------|-------|--------|
| section-my | 11456–11487 | `html/my-searches.html` |
| section-client (WITHOUT modals) | 11491–11880 | `html/my-clients.html` |
| section-last | 11885–11902 | `html/last-search.html` |
| section-manage | 11904–12068 | `html/manage-listings.html` |

**Modals to extract from section-client:**

| Modal ID | Target File |
|----------|-------------|
| `inviteClientModal` | `html/modals/invite-client.html` |
| `scheduleShowingModal` | `html/modals/schedule-showing.html` |
| `portfolioCommentModal` | `html/modals/portfolio-comment.html` |

**Standalone modals (already outside sections):**

| Modal ID | Line | Target |
|----------|------|--------|
| `manageStatusModal` | 12071 | `html/modals/status-change.html` |
| `searchListingTypeInfoModal` | 41602 | `html/modals/listing-type-info.html` |

### 2d: Verification
- Count total divs opened vs closed in each HTML file
- Verify each modal has matching open/close div tags
- Verify section-main opens and closes exactly once

**Gate:** All HTML files created. Div balance = 0 in every file. Total HTML lines ≈ original HTML section lines.

---

## Phase 3: JS Extraction (lines 12092–42775)
Extract into 9 groups following the load order.

### Group 1: Core (MUST load first)
| File | Source Lines | Key Globals |
|------|-------------|------------|
| `js/core/agent-context.js` | 12093–12120 | `LOGGED_IN_AGENT`, `AGENT_PROFILE` |
| `js/core/nav.js` | 12121–12145 | `showSearchSection()` |
| `js/core/reso-field-map.js` | ~21252–21345 | `RESO_FIELD_MAP`, `resoData()`, `resoAttr()` |
| `js/core/data-loader.js` | ~21346+ | `listings[]`, `searchResultsState`, `reportState`, `_replaceListings()` |

### Group 2: Compliance
| File | Content |
|------|---------|
| `js/compliance/reso-mappers.js` | `resolveListingSubtype()`, `CRM_TO_RESO_STATUS`, commercial/building functions |
| `js/compliance/fair-housing.js` | `FAIR_HOUSING_VIOLATIONS[]`, `checkFairHousing()` |
| `js/compliance/content-scanners.js` | `scanAgentInfo()`, `scanOffMarket()`, `scanCompensation()` |
| `js/compliance/display-permissions.js` | `setupDisplayCascade()` (I29/I30/I31) |
| `js/compliance/date-validators.js` | `validateDates()` |
| `js/compliance/form-validation.js` | REBNY required fields, auto-save, validation |
| `js/compliance/status-validation.js` | `STATUS_TRANSITIONS`, `validateStatusChange()` |
| `js/compliance/rental-field-rules.js` | `resolveRentalListingSubtype()`, `applyRentalFieldRules()` |

### Group 3: Search
| File | Content |
|------|---------|
| `js/search/search-engine.js` | `performSearch()`, `filterListings()`, DRP, autocomplete |
| `js/search/search-actions.js` | `toggleResultsView()`, delivery menus, selection |
| `js/search/comparable-reports.js` | `openCompPage()`, `backToCompSelection()` |
| `js/search/field-dictionaries.js` | Sales/rental/building field dictionaries |
| `js/search/rebny-agents.js` | `rebnyAgents{}` (~148 firms), company dropdowns |
| `js/search/agent-functions.js` | Agent list/info for sale + rental forms |
| `js/search/building-database.js` | `buildingDatabase{}`, `searchBuildingByAddress()` |
| `js/search/form-ui-helpers.js` | Char count, quick search rows |

### Group 4: Render
| File | Content |
|------|---------|
| `js/render/shared-badges.js` | `fareActDisclosure()`, `comingSoonBadge()`, `participantOnlyBadge()` |
| `js/render/grid-column-defs.js` | `gridColumnDefs{}` with RESO tags |
| `js/render/render-grid.js` | `renderGridView()` |
| `js/render/render-gallery.js` | `renderGalleryView()` |
| `js/render/render-short-summary.js` | `renderShortSummaryView()` |
| `js/render/render-summary.js` | `renderSummaryView()` |
| `js/render/render-master-detail.js` | `renderMasterDetailView()` |
| `js/render/render-map.js` | `renderMapView()` |
| `js/render/view-mode-controls.js` | `toggleViewModeDropdown()`, `setViewMode()` |
| `js/render/render-dispatcher.js` | `getFilteredListings()`, `renderSearchResults()` |

### Groups 5–8: Listing, Manage, CRM, Output
(Same structure as previous extraction)

### Group 9: Init + Compliance Gates + Output
| File | Content |
|------|---------|
| `js/compliance/compliance-gates-and-output.js` | `checkListingCompliance()`, branded sheets, dashboard |
| `js/output/listing-sheets.js` | Reports, print, email — uses `AGENT_PROFILE` per logged-in agent |
| `js/init-hash-routing.js` | URL hash → section routing |
| `js/init-function-check.js` | Verify all functions loaded |
| `js/crm/no-vow-collections.js` | NO-VOW mode, localStorage collections (scoped by agentId) |

### Dead Code → `js/_dead-code/`
| Source Lines | What | Why Dead |
|-------------|------|----------|
| 16109–19306 | OLD sale form JS | Targets DOM in SALE-FORM-REDESIGN.html, not this file |
| 19574–19767 | OLD rental conditional | Targets DOM in RENTAL-FORM-STANDALONE.html |
| 19882–20150 | OLD form validation | Duplicate of form-file validation |
| 32196–34498 | REDESIGN rental form JS | Belongs in RENTAL-FORM-REDESIGN.html |
| 34499–37648 | REDESIGN sale form JS | Belongs in SALE-FORM-REDESIGN.html |

**Gate:** Every JS file passes `node --check`. No function is defined in 2 places.

---

## Phase 4: index.html Shell + Build Script
1. **`index.html`** — shell with head, CSS links, HTML partial placeholders, JS script imports
2. **`build.js`** — assembles `index-built.html` by inlining everything

**Gate:** `node build.js` runs without errors.

---

## Phase 5: Verification
1. Syntax check all JS
2. Line count comparison
3. Function inventory
4. Modal inventory (15 modals)
5. Div balance = 0
6. Agent/Broker scoping check
7. RESO chain check
8. Role scoping check

---

## Phase 6: Test Migration
Move test suite (lines 39363–42772) to `tests/`
