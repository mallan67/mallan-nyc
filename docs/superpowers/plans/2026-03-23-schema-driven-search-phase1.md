# Schema-Driven CRM Search — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7,840-line hardcoded CRM search form with a schema-driven system where one JSON registry generates the form, collects criteria, builds queries, and renders filter pills — eliminating the vulnerability of lost field IDs and the UX friction of back-and-forth navigation.

**Architecture:** A `search-registry.json` file defines every searchable field. A `FormRenderer` generates HTML from the registry. A `CriteriaCollector` reads the form by iterating registry entries (not hardcoded IDs). A `TrestleAdapter` translates criteria to OData. A `FilterBar` shows active criteria as pills and provides inline editing + a filter drawer for full access. Results update live when any filter changes.

**Tech Stack:** Vanilla JS (matches existing CRM), JSON registry, OData 4.0 (Trestle), Prisma (own listings). No React, no build tools beyond the existing `build.js` inliner.

**Spec:** `docs/superpowers/specs/2026-03-23-schema-driven-search-design.md`

**Scope:** CRM agent search only (`public/crm/`). Does NOT touch public frontend (`app/search/`).

---

## File Structure

```
public/crm/
  data/
    search-registry.json              ← CREATE: all field definitions (source of truth)
  js/search-v2/
    registry-loader.js                ← CREATE: loads + validates registry, provides lookup API
    widget-renderers.js               ← CREATE: HTML generators per widget type
    form-renderer.js                  ← CREATE: reads registry → generates full form HTML
    criteria-collector.js             ← CREATE: reads registry + DOM → criteria object
    filter-bar.js                     ← CREATE: pill display, inline edit, quick-add, drawer toggle
    filter-drawer.js                  ← CREATE: slide-in panel with full form
    search-orchestrator.js            ← CREATE: ties everything together (init, search, update)
  js/adapters/
    trestle-adapter.js                ← CREATE: criteria → OData $filter/$select/$expand
    prisma-adapter.js                 ← CREATE: criteria → Prisma where/select
    result-normalizer.js              ← CREATE: any provider response → CRM flat shape
    search-router.js                  ← CREATE: routes to adapters, merges results
  html/
    search-v2.html                    ← CREATE: minimal shell (containers for renderer output)
  css/
    search-v2.css                     ← CREATE: filter bar, pills, drawer, widget styles

app/api/
  idx/search-v2/route.ts              ← CREATE: new API endpoint accepting registry-format criteria
```

**Existing files preserved (not modified until swap):**
- `public/crm/html/search-form-and-results.html` — old form (kept during migration)
- `public/crm/js/search/search-engine.js` — old search engine (kept during migration)
- `app/api/idx/search/route.ts` — old API (kept, new endpoint added alongside)

---

## Task 1: Generate Search Registry from Trestle Metadata

**Files:**
- Create: `public/crm/data/search-registry.json`
- Create: `scripts/generate-search-registry.js`
- Read: `data/rebny-rls-property-fields.csv`, `artifacts/metadata.xml`, `data/SEARCH_CONTROL_MAP.json`
- Read: `public/crm/html/search-form-and-results.html` (extract current form field structure)

- [ ] **Step 1: Write the registry generator script**

Create `scripts/generate-search-registry.js` that:
1. Reads `artifacts/metadata.xml` → extracts all field names + types for each entity
2. Reads `data/rebny-rls-property-fields.csv` → maps IDX Plus fields with resource + type
3. Reads `data/SEARCH_CONTROL_MAP.json` → gets existing DOM ID → Trestle field mappings
4. Reads the current advanced form HTML → extracts all sections, field labels, checkbox values
5. Merges into a single registry with the schema from spec section 4.1
6. Writes `public/crm/data/search-registry.json`

- [ ] **Step 2: Run the generator**

Run: `node scripts/generate-search-registry.js`
Expected: `search-registry.json` created with 1,447+ field entries

- [ ] **Step 3: Validate the registry**

Write a validation script that checks:
- Every field has `key`, `label`, `section`, `widget`, `tabs`
- Every searchable field has at least one provider mapping
- Every current form element (623 from advanced) has a matching registry entry
- Every Trestle field name in providers.trestle.field exists in metadata.xml
- No duplicate keys

Run: `node scripts/validate-search-registry.js`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-search-registry.js scripts/validate-search-registry.js public/crm/data/search-registry.json
git commit -m "feat: generate search-registry.json from Trestle metadata (1,447 fields)"
```

---

## Task 2: Registry Loader

**Files:**
- Create: `public/crm/js/search-v2/registry-loader.js`
- Test: manual browser console test

- [ ] **Step 1: Implement registry loader**

```javascript
// registry-loader.js
var SearchRegistry = (function() {
  var _registry = null;
  var _fieldIndex = {};  // key → field entry (fast lookup)
  var _sectionIndex = {}; // sectionKey → [fields]

  function load(registryData) {
    _registry = registryData;
    // Build indexes
    _registry.fields.forEach(function(f) {
      _fieldIndex[f.key] = f;
      if (!_sectionIndex[f.section]) _sectionIndex[f.section] = [];
      _sectionIndex[f.section].push(f);
    });
  }

  function getField(key) { return _fieldIndex[key] || null; }
  function getSection(sectionKey) { return _sectionIndex[sectionKey] || []; }
  function getSections() { return _registry.sections; }
  function getFieldsForTab(tab) {
    return _registry.fields.filter(function(f) {
      return !f.tabs || f.tabs.includes(tab);
    });
  }
  function getSearchableFields(tab) {
    return getFieldsForTab(tab).filter(function(f) {
      return f.providers && Object.keys(f.providers).length > 0 && f.widget !== 'calculator';
    });
  }

  return {
    load: load,
    getField: getField,
    getSection: getSection,
    getSections: getSections,
    getFieldsForTab: getFieldsForTab,
    getSearchableFields: getSearchableFields,
    getRegistry: function() { return _registry; }
  };
})();
```

- [ ] **Step 2: Verify in browser console**

Load registry JSON via fetch, call `SearchRegistry.load(data)`, verify `SearchRegistry.getField('beds')` returns the correct entry.

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/registry-loader.js
git commit -m "feat: registry loader with field/section indexing"
```

---

## Task 3: Widget Renderers

**Files:**
- Create: `public/crm/js/search-v2/widget-renderers.js`

- [ ] **Step 1: Implement all widget renderers**

Each renderer takes a field definition and returns an HTML string. Widget types:
- `range-select` — min/max dropdowns with Custom option + companion input row
- `checkbox-group` — checkbox list with data-field/data-value attributes
- `boolean` — single checkbox
- `text` — text input with placeholder
- `number-range` — min/max number inputs
- `date-range` — from/to date inputs + preset buttons (if field.presets exists)
- `select` — single dropdown
- `radio-group` — radio button group
- `custom` — renders a placeholder div with `data-custom-widget` for JS module init

Every rendered element gets IDs derived from `field.key`:
- `${field.key}-min`, `${field.key}-max` for range widgets
- `${field.key}` for single-value widgets
- Checkboxes get `data-field="${field.key}"` and `data-value="${option.value}"`

- [ ] **Step 2: Test each renderer manually**

Create a test HTML page that renders one of each widget type and verify the HTML output is correct.

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/widget-renderers.js
git commit -m "feat: widget renderers for all 12 widget types"
```

---

## Task 4: Form Renderer

**Files:**
- Create: `public/crm/js/search-v2/form-renderer.js`

- [ ] **Step 1: Implement form renderer**

`SearchForm.render(registry, options)`:
1. Reads `registry.sections` → creates collapsible section wrappers (collapsed/open per section def)
2. For each section, filters fields by `section === sectionKey` AND `tabs.includes(options.tab)`
3. Calls the appropriate widget renderer for each field
4. Wraps in section containers with toggle headers (icon + label + collapse button)
5. Adds Sale/Rental/Building tab bar at the top
6. Adds Search + Clear buttons at the bottom
7. Injects into `options.container`

- [ ] **Step 2: Render alongside old form for comparison**

Add a temporary test div to the CRM page. Render the new form into it. Visually compare every section against the old form. Count fields — must match or exceed the old form's field count.

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/form-renderer.js
git commit -m "feat: form renderer generates full search form from registry"
```

---

## Task 5: Criteria Collector

**Files:**
- Create: `public/crm/js/search-v2/criteria-collector.js`

- [ ] **Step 1: Implement criteria collector**

`SearchCriteria.collect(registry, options)`:
1. Iterates `registry.fields` where `tabs.includes(options.tab)`
2. For each field, reads DOM element by derived ID (`field.key + '-min'`, etc.)
3. Parses value using `field.providers[provider].datatype` (parseInt, parseFloat, string, boolean, date→ISO)
4. For `range-select`: reads min/max, handles 'custom' companion input
5. For `checkbox-group`: collects all checked `data-value` attributes
6. For `boolean`: reads checked state
7. For `date-range`: reads from/to values, converts to ISO
8. Returns criteria object with `field.key` as keys

- [ ] **Step 2: Compare output to old collectSearchCriteria()**

Fill in identical values in both old and new forms. Run both collectors. Diff the output. They must produce equivalent criteria for the same user input.

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/criteria-collector.js
git commit -m "feat: criteria collector reads form via registry iteration"
```

---

## Task 6: Trestle Adapter

**Files:**
- Create: `public/crm/js/adapters/trestle-adapter.js`
- Create: `public/crm/js/adapters/result-normalizer.js`

- [ ] **Step 1: Implement Trestle OData query builder**

`TrestleAdapter.buildQuery(criteria, registry)`:
1. For each criteria key, look up field in registry → get `providers.trestle`
2. Group by resource (Property, OpenHouse, Media, CustomProperty)
3. Property fields → `$filter` parts (using field's operator + datatype)
4. Sub-resource fields → `$expand=Resource($filter=...)`
5. Build `$select` from all display-tier fields
6. Handle special cases: address search (StreetNumber + StreetDirPrefix + StreetName), multi-value checkboxes (OR), status mapping
7. Return `{ filter, select, expand, orderby, top }`

- [ ] **Step 2: Implement result normalizer**

`ResultNormalizer.normalize(rawTrestleRecord, registry)`:
1. For each field in registry with `providers.trestle`
2. Read `raw[field.providers.trestle.field]`
3. Map to `result[field.key]` with proper type conversion
4. Apply compliance gates (distribution gates, address suppression)
5. Return CRM flat shape object

- [ ] **Step 3: Test against live Trestle**

Use the existing `scripts/test-search-e2e.js` pattern to verify the adapter generates valid OData for each filter type.

- [ ] **Step 4: Commit**

```bash
git add public/crm/js/adapters/trestle-adapter.js public/crm/js/adapters/result-normalizer.js
git commit -m "feat: Trestle adapter with OData builder + result normalizer"
```

---

## Task 7: Prisma Adapter

**Files:**
- Create: `public/crm/js/adapters/prisma-adapter.js`

- [ ] **Step 1: Implement Prisma query builder**

`PrismaAdapter.buildQuery(criteria, registry)`:
1. For each criteria key, look up field → get `providers.prisma`
2. Build Prisma `where` clause (gte/lte for ranges, equals for exact, contains for text)
3. Build `select` from display fields
4. Return `{ where, select, orderBy, take }`

Note: The Prisma adapter runs server-side (in the API route), not client-side. The client sends criteria JSON; the API route uses the adapter to query Postgres.

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/adapters/prisma-adapter.js
git commit -m "feat: Prisma adapter for own listing search"
```

---

## Task 8: Search Router

**Files:**
- Create: `public/crm/js/adapters/search-router.js`

- [ ] **Step 1: Implement search router**

`SearchRouter.search(criteria, registry)`:
1. Determine adapters: check `criteria.listing-source` → idx/exclusive/both
2. Build queries via each adapter
3. Call API endpoints in parallel (Trestle via `/api/idx/search-v2`, Prisma via existing `/api/crm/listings`)
4. Merge results, deduplicate by listing ID
5. Apply client-side compliance gates (`filterListings()` equivalent)
6. Sort by criteria
7. Return merged results array

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/adapters/search-router.js
git commit -m "feat: search router merges Trestle + Prisma results"
```

---

## Task 9: Filter Bar + Pills

**Files:**
- Create: `public/crm/js/search-v2/filter-bar.js`
- Create: `public/crm/css/search-v2.css`

- [ ] **Step 1: Implement filter bar**

`FilterBar.render(criteria, registry, container)`:
1. For each non-empty criteria key, create a pill: label + value + × remove button
2. Format pill text using registry field label + human-readable value (e.g., "Beds: 2+" not "beds_min: 2")
3. Click × → remove that criteria key → trigger re-search
4. Click pill text → show inline editor (dropdown for select fields, input for text/number)
5. Add 🔧+ quick-add button → dropdown of common filters not yet active
6. Add ☰ More Filters button → opens filter drawer
7. Show result count + view mode toggle + sort dropdown

- [ ] **Step 2: Style the filter bar**

CSS for: pill layout (flex-wrap), pill styling (rounded, removable), inline edit dropdowns, responsive (mobile: 2-3 pills + "N more"), drawer trigger button.

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/filter-bar.js public/crm/css/search-v2.css
git commit -m "feat: filter bar with pills, inline edit, quick-add"
```

---

## Task 10: Filter Drawer

**Files:**
- Create: `public/crm/js/search-v2/filter-drawer.js`

- [ ] **Step 1: Implement filter drawer**

`FilterDrawer.open(registry, currentCriteria, tab)`:
1. Create a slide-in panel (right side on desktop, full-screen on mobile)
2. Render the SAME form as the initial search using `SearchForm.render()` into the drawer
3. Pre-populate all fields with `currentCriteria` values
4. On any field change → collect criteria → update results behind drawer in real-time
5. Close button / click outside → close drawer
6. Tab switching works inside drawer

`FilterDrawer.close()`:
1. Slide out
2. Results already updated (live updates happened during editing)

- [ ] **Step 2: Wire to filter bar**

☰ More Filters button → `FilterDrawer.open()`
Drawer close → `FilterDrawer.close()`

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/search-v2/filter-drawer.js
git commit -m "feat: filter drawer with live result updates"
```

---

## Task 11: Search Orchestrator

**Files:**
- Create: `public/crm/js/search-v2/search-orchestrator.js`
- Create: `public/crm/html/search-v2.html`

- [ ] **Step 1: Implement orchestrator**

`SearchV2.init()`:
1. Fetch `search-registry.json` → `SearchRegistry.load(data)`
2. Render initial search form via `SearchForm.render()` into `#searchFormV2`
3. Wire Search button → `SearchV2.performSearch()`
4. Wire Clear button → `SearchV2.clearSearch()`

`SearchV2.performSearch()`:
1. `SearchCriteria.collect()` → criteria
2. `SearchRouter.search(criteria)` → results
3. Hide initial form, show results container
4. `FilterBar.render(criteria)` → show filter bar above results
5. Render results using existing render dispatcher (`renderSearchResults()`)

`SearchV2.updateFilter(key, value)` (called by filter bar pill edit / drawer change):
1. Update criteria object
2. Re-run search with updated criteria
3. Update filter bar pills
4. Update results

- [ ] **Step 2: Create minimal HTML shell**

`search-v2.html` — contains only container divs:
- `#searchFormV2` — initial search form container
- `#filterBarV2` — filter bar container
- `#filterDrawerV2` — drawer container
- `#searchResultsV2` — results container (reuses existing result renderers)

- [ ] **Step 3: Wire into existing CRM**

Add a feature flag / toggle to switch between old and new search. Both coexist during migration.

- [ ] **Step 4: Commit**

```bash
git add public/crm/js/search-v2/search-orchestrator.js public/crm/html/search-v2.html
git commit -m "feat: search orchestrator ties registry + form + adapters + filter bar"
```

---

## Task 12: API Endpoint (v2)

**Files:**
- Create: `app/api/idx/search-v2/route.ts`

- [ ] **Step 1: Create new API endpoint**

`GET /api/idx/search-v2`:
1. Accept registry-format criteria as query params (JSON-encoded `criteria` param)
2. Load registry server-side
3. Use Trestle adapter to build OData query (including `$expand` for OpenHouse)
4. Use Prisma adapter if `listing-source` includes 'exclusive'
5. Execute queries, normalize results, merge
6. Apply server-side compliance gates
7. Return normalized results array

This runs alongside the old `/api/idx/search` endpoint. Same auth, same compliance.

- [ ] **Step 2: Test with curl / e2e script**

Verify the new endpoint returns equivalent results to the old one for the same search criteria.

- [ ] **Step 3: Commit**

```bash
git add app/api/idx/search-v2/route.ts
git commit -m "feat: search-v2 API endpoint with registry-driven OData builder"
```

---

## Task 13: Integration Testing + Swap

**Files:**
- Modify: `public/crm/html/search-form-and-results.html` (add v2 toggle)
- Modify: `public/crm/js/init/init-ui.js` (init v2 when toggled)

- [ ] **Step 1: Side-by-side testing**

Add a toggle button "Try New Search (Beta)" that:
1. Hides old search form
2. Shows new v2 search form
3. Both use the same results container and result renderers

- [ ] **Step 2: Run full test matrix**

For each tab (Sale, Rental, Building):
- Test every section in the form renders correctly
- Test price range (including Custom)
- Test beds/baths/rooms/sqft
- Test neighborhood selector
- Test status checkboxes
- Test all date range pickers
- Test keyword search
- Test building info filters
- Test checkbox filters (ownership, features, amenities)
- Test filter bar pills (add, remove, edit)
- Test filter drawer (open, change filter, close)
- Test saved search (save, load, delete)
- Test comparables
- Test all 5 result view modes

- [ ] **Step 3: Run e2e Trestle test**

Run: `node scripts/test-search-e2e.js` (adapted for v2 endpoint)
Expected: 41/41 pass

- [ ] **Step 4: Swap**

When v2 passes all tests:
1. Make v2 the default
2. Keep old search behind a "Classic Search" toggle for fallback
3. After 1 week of v2 being default with no issues, remove old search code

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: schema-driven search v2 — live with filter bar + drawer"
```

---

## Task 14: Build + Deploy

- [ ] **Step 1: Build CRM**

Run: `cd public/crm && node build.js`
Expected: All JS inlined, div tags balanced, no errors

- [ ] **Step 2: Smoke test**

Run: `node scripts/smoke-test-crm.js`
Expected: 183+ PASS, 0 FAIL

- [ ] **Step 3: Next.js build**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 4: Deploy**

Run: `vercel --prod`
Expected: Aliased to mallan.nyc

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "deploy: schema-driven search v2 live on mallan.nyc"
```
