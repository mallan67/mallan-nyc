# Schema-Driven CRM Search Engine — Design Spec

**Date:** 2026-03-23
**Author:** Claude Opus 4.6 + Maya Allan
**Status:** Draft — awaiting review
**Scope:** CRM agent search only (`public/crm/`). Does NOT touch public frontend (`app/search/`).

---

## 1. Problem Statement

### 1a. Architecture Vulnerability
The CRM search form is 7,840 lines of hardcoded HTML with field definitions scattered across 4 tabs × 2 modes. Of 623 advanced form fields, only 275 (44%) are wired to the search engine. 52 field IDs were lost in a revert on March 21 and nobody noticed. Adding one search field requires changes in 7 files. The system is locked to Trestle field names in both HTML and JS.

Meanwhile, 1,447 Trestle fields exist across 12 data resources — the CRM uses 99 (7%). The OpenHouse resource (48 fields) is completely untapped. Custom Property (141 NYC-specific fields) is barely used (5 fields).

### 1b. UX Navigation Problem (CRITICAL)
The search form and results are separate views. When results display, the form disappears. To change ONE filter (e.g., add "doorman"), the agent must:
1. Click "Back to Search"
2. Scroll to find the right section (Attended Lobby)
3. Check the checkbox
4. Click Search
5. Wait for full reload
6. Lose scroll position in results

This back-and-forth is the #1 workflow friction. The existing "Refine" panel only has price, beds, baths, and status — not the full criteria. An agent sitting with a client who keeps refining criteria has to repeat this cycle for every change.

### 1c. Basic Form Design
The basic forms (Sale: 134 fields, Rental: 127 fields, Building: 83 fields) are comprehensive agent tools — NOT simple quick-search forms. They cover Quick Search, Price/Rooms, Status, Listing Activity, Ownership, Land Lease, Attended Lobby, Building Features, Building Age/Size, Building Style, Building Allows/Does Not Allow, Financing, Resale/New Dev, Keywords, and Management. This is the right set of fields for an agent with a client. The problem is not what's in the form — it's the navigation between form and results.

## 1d. UI/UX Requirements
1. **Never leave results to edit criteria** — filters must be adjustable from the results view
2. **Active criteria visible as pills/tags** — agent sees exactly what's filtering at a glance
3. **Any filter editable inline** — click a pill or filter icon to modify without full page switch
4. **Full criteria panel accessible** — for deep changes, a drawer/panel slides in over results
5. **Results update live** — changing a filter immediately updates results (no Search button needed for refinement)
6. **Basic mode preserved** — the comprehensive basic form stays as the initial search entry point
7. **Mobile friendly** — the filter interaction must work on phone screens

## 2. Design Goals

1. **Eliminate the vulnerability** — field definitions live in ONE schema file. No hand-typed HTML IDs. If a field exists in the schema, it renders, collects, filters, and alerts. If it doesn't, it doesn't.
2. **Provider-agnostic** — the schema defines abstract fields ("beds", "price"). Provider adapters translate to Trestle OData, Prisma queries, or any future MLS. If Trestle goes away, write a new adapter — the form, saved searches, and UI stay the same.
3. **All 1,447 fields registered** — every Trestle field across all 12 resources gets a registry entry. Not all are searchable, but all are catalogued for display, detail views, reports, and future use.
4. **All current form fields preserved** — every one of the 623 advanced form elements maps to a registry entry. Nothing is lost.
5. **Open House search** — first-class support for the OpenHouse resource via `$expand`.
6. **Change detection** — saved searches detect ALL field changes on matching listings (price, status, maint, sqft, photos, open house).
7. **Own listings** — exclusive listings and commercial (non-REBNY) searchable through the same form via the Prisma adapter.
8. **Flexible** — new fields, new sections, new providers added by editing JSON, not code.

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              search-registry.json                │
│         (THE single source of truth)             │
│                                                  │
│  Fields: 1,447 Trestle + own listing fields      │
│  Sections: collapsible UI groups                 │
│  Providers: trestle mapping + prisma mapping     │
│  Compliance: distribution gates, VOW flags       │
└──────────────┬──────────────────────────────────┘
               │ reads
    ┌──────────┴──────────┐
    │                     │
┌───▼────┐          ┌─────▼──────┐
│ Form   │          │ Criteria   │
│Renderer│          │ Collector  │
│        │          │            │
│ Schema │          │ Schema     │
│ → HTML │          │ + DOM      │
│ (one   │          │ → criteria │
│  form) │          │   object   │
└────────┘          └─────┬──────┘
                          │ criteria
                   ┌──────▼──────┐
                   │   Search    │
                   │   Router    │
                   │             │
                   │ Routes to   │
                   │ 1+ adapters │
                   └──┬──────┬──┘
                      │      │
              ┌───────▼┐  ┌──▼───────┐
              │Trestle │  │ Prisma   │
              │Adapter │  │ Adapter  │
              │        │  │          │
              │OData   │  │ Prisma   │
              │$filter │  │ where    │
              │$select │  │ select   │
              │$expand │  │ include  │
              └───┬────┘  └────┬─────┘
                  │            │
              ┌───▼────────────▼───┐
              │  Result Normalizer │
              │                    │
              │  Any provider →    │
              │  CRM flat shape    │
              └────────┬───────────┘
                       │ normalized listings
              ┌────────▼───────────┐
              │  Result Renderer   │
              │  (existing 5 views)│
              └────────────────────┘

## 3b. UI Flow — Search + Results Navigation

### The Three States

**State 1: Initial Search (full form)**
Agent opens CRM Search. Sees the full basic form (Sale/Rental/Building tabs) with all sections. Enters criteria. Clicks Search. This is the ENTRY POINT only — used for new searches.

**State 2: Results with Filter Bar (primary working state)**
Results display. Above results, a persistent FILTER BAR shows:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🏷 Chelsea × | 1+ BR × | < $1.5M × | Condo × | Active ✓ | 🔧+   │
│                                                                     │
│ 47 Results | Gallery ▾ | Sort: Price ▾ | ☰ More Filters            │
└─────────────────────────────────────────────────────────────────────┘
```

- Each active filter shows as a **removable pill** (click × to remove, results update)
- Click any **pill text** to edit inline (e.g., click "$1.5M" → dropdown appears to change max price)
- **🔧+ button** — quick-add common filters (doorman, elevator, pets, prewar, etc.)
- **☰ More Filters** — opens the full filter drawer (State 3)
- Changing ANY filter updates results immediately (no Search button)

**State 3: Filter Drawer (full criteria panel)**
Agent clicks "More Filters" → a slide-in panel appears over the right side of results (or full-screen on mobile). Contains ALL sections from the basic form + advanced sections. Agent makes changes → results update behind the drawer in real-time. Close drawer → back to State 2 with updated results.

The drawer is the SAME form as the initial search — same sections, same fields, same registry. It just renders in a drawer instead of a full page.

### Key Principle: No "Back to Search"
There is NO "Back to Search" button. The agent never leaves the results view. The filter bar and drawer handle all criteria changes. The initial search form (State 1) is only for starting a completely new search.

### Tab Switching in Filter Bar
Sale/Rental/Building tabs show in the filter bar. Switching tabs re-runs the search with the new tab's criteria. The filter drawer shows tab-appropriate sections.

### Mobile Behavior
On mobile (< 768px):
- Filter bar shows 2-3 pills + "N more" badge
- Tapping any pill opens the filter drawer full-screen
- Drawer has "Apply" and "Clear" at the bottom (sticky)
- Results are behind the drawer, not visible during editing
```

## 4. Registry Schema (`search-registry.json`)

### 4.1 Field Entry Structure

```json
{
  "key": "beds",
  "label": "Bedrooms",
  "section": "property-size",
  "widget": "range-select",
  "tabs": ["sale", "rent"],
  "options": [
    { "label": "Studio", "value": "0" },
    { "label": "1 BR", "value": "1" },
    { "label": "2 BR", "value": "2" },
    { "label": "3 BR", "value": "3" },
    { "label": "4 BR", "value": "4" },
    { "label": "5 BR", "value": "5" },
    { "label": "6 BR", "value": "6" },
    { "label": "7 BR", "value": "7" },
    { "label": "8+ BR", "value": "8" }
  ],
  "providers": {
    "trestle": {
      "resource": "Property",
      "field": "BedroomsTotal",
      "operator": "ge/le",
      "datatype": "integer"
    },
    "prisma": {
      "model": "Listing",
      "field": "beds",
      "operator": "gte/lte",
      "datatype": "integer"
    }
  },
  "compliance": {
    "distribution_gate": null,
    "vow_only": false,
    "website_only": false
  },
  "change_detection": true,
  "display_tiers": ["idx", "vow", "crm"]
}
```

### 4.2 Widget Types

| Widget | Renders As | Use Case |
|--------|-----------|----------|
| `range-select` | Min/Max dropdowns with Custom option | Price, beds, baths, rooms, sqft |
| `checkbox-group` | Multi-select checkboxes | Status, ownership, features, amenities |
| `boolean` | Single checkbox or toggle | LandLeaseYN, CoolingYN, GarageYN |
| `text` | Free text input | Address, keyword, building name, RLS ID |
| `number-range` | Min/Max number inputs | DOM, CDOM, year, floors, units, ceiling height |
| `date-range` | From/To date picker | Listed, contract, sold, lease dates |
| `neighborhood` | Map selector + autocomplete tags | Special component — not generated from options |
| `select` | Single dropdown | Listing activity type, financing % |
| `radio-group` | Radio buttons | Land lease (include/exclude), back on market |
| `transit` | Subway line buttons + checkboxes | Special component — transit line selector |
| `manhattan-grid` | Street boundary dropdowns | Special component — north/south/east/west selects |
| `calculator` | Calculator tool (not a search filter) | Mortgage, investment, rent vs buy |

### 4.3 Section Definitions

```json
{
  "sections": [
    { "key": "quick-search", "label": "Quick Search", "collapsed": false, "icon": "fa-search" },
    { "key": "price-financials", "label": "Price & Financials", "collapsed": false, "icon": "fa-dollar-sign" },
    { "key": "property-size", "label": "Property Size", "collapsed": false, "icon": "fa-ruler-combined" },
    { "key": "status-activity", "label": "Status & Activity", "collapsed": true, "icon": "fa-clock" },
    { "key": "location", "label": "Location", "collapsed": true, "icon": "fa-map-marker-alt" },
    { "key": "property-type", "label": "Property Type & Ownership", "collapsed": true, "icon": "fa-building" },
    { "key": "building-info", "label": "Building Information", "collapsed": true, "icon": "fa-city" },
    { "key": "unit-features", "label": "Unit Features & Interior", "collapsed": true, "icon": "fa-home" },
    { "key": "building-amenities", "label": "Building Amenities", "collapsed": true, "icon": "fa-concierge-bell" },
    { "key": "open-house", "label": "Open Houses", "collapsed": true, "icon": "fa-door-open" },
    { "key": "media", "label": "Media & Virtual Tours", "collapsed": true, "icon": "fa-camera" },
    { "key": "rental", "label": "Rental Details", "collapsed": true, "icon": "fa-key", "tabs": ["rent"] },
    { "key": "commercial", "label": "Commercial", "collapsed": true, "icon": "fa-store", "website_only": true },
    { "key": "agent-office", "label": "Agent & Office", "collapsed": true, "icon": "fa-user-tie" },
    { "key": "calculators", "label": "Calculators & Tools", "collapsed": true, "icon": "fa-calculator", "is_tool": true }
  ]
}
```

**One form, collapsible sections.** No basic/advanced split. Top 3 sections (Quick Search, Price, Property Size) open by default. Everything else collapsed but always accessible.

### 4.4 Trestle Resource Coverage

Each field entry specifies which Trestle resource it comes from. The adapter uses this to build the right `$select` and `$expand`:

| Resource | Fields | How Queried | Registry Entries |
|----------|--------|-------------|-----------------|
| **Property** | 759 | Direct `$select` | ~250 searchable + ~500 display-only |
| **CustomProperty** | 141 | `$expand=CustomProperty` | ~50 searchable (NYC-specific) |
| **Media** | 56 | `$expand=Media` | ~10 (photo count, floor plan, video detection) |
| **OpenHouse** | 48 | `$expand=OpenHouse` | ~12 searchable (date, time, type, status) |
| **PropertyRooms** | 40 | `$expand=PropertyRooms` | ~10 display (room dimensions) |
| **PropertyUnitTypes** | 53 | `$expand=PropertyUnitTypes` | ~15 display (unit mix) |
| **Member** | 95 | Agent lookup | ~8 searchable (agent name, phone, email) |
| **Office** | 84 | Office lookup | ~5 searchable (office name, MLS ID) |
| **Teams** | 48 | `$expand=Teams` | ~5 display |
| **TeamMembers** | 29 | Via Teams | ~3 display |
| **PropertyGreenVerification** | 39 | `$expand=PropertyGreenVerification` | ~5 display (green certifications) |
| **Building** | 2 | Building key | Key only (groups listings) |

**Total registry entries: ~1,447** (all Trestle fields catalogued). Of these, ~350 are searchable, ~600 display-only, ~500 internal/system.

### 4.5 Open House Fields (New)

```json
{
  "key": "open-house-date",
  "label": "Open House Date",
  "section": "open-house",
  "widget": "date-range",
  "tabs": ["sale", "rent"],
  "providers": {
    "trestle": {
      "resource": "OpenHouse",
      "field": "OpenHouseDate",
      "operator": "ge/le",
      "datatype": "date",
      "expand": true
    }
  },
  "presets": [
    { "label": "Today", "value": "today" },
    { "label": "This Weekend", "value": "weekend" },
    { "label": "Next 7 Days", "value": "7days" },
    { "label": "Next 30 Days", "value": "30days" }
  ]
},
{
  "key": "open-house-type",
  "label": "Open House Type",
  "section": "open-house",
  "widget": "checkbox-group",
  "tabs": ["sale", "rent"],
  "options": [
    { "label": "Public Open House", "value": "Public" },
    { "label": "Broker's Open", "value": "BrokersOpen" },
    { "label": "Virtual / Livestream", "value": "Virtual" }
  ],
  "providers": {
    "trestle": {
      "resource": "OpenHouse",
      "field": "OpenHouseType",
      "operator": "eq",
      "datatype": "string"
    }
  }
},
{
  "key": "open-house-appointment",
  "label": "Appointment Required",
  "section": "open-house",
  "widget": "boolean",
  "tabs": ["sale", "rent"],
  "providers": {
    "trestle": {
      "resource": "OpenHouse",
      "field": "AppointmentRequiredYN",
      "operator": "eq",
      "datatype": "boolean"
    }
  }
}
```

### 4.6 Own Listings (Prisma)

Fields for exclusive/commercial listings stored in Prisma `Listing` model:

```json
{
  "key": "listing-source",
  "label": "Listing Source",
  "section": "quick-search",
  "widget": "checkbox-group",
  "tabs": ["sale", "rent"],
  "options": [
    { "label": "REBNY RLS (IDX)", "value": "idx" },
    { "label": "My Exclusives", "value": "exclusive" },
    { "label": "Website Only", "value": "website" }
  ],
  "providers": {
    "trestle": { "field": "_source", "operator": "eq", "datatype": "string" },
    "prisma": { "field": "rls_eligible", "operator": "equals", "datatype": "boolean" }
  }
}
```

## 5. Form Renderer (`form-renderer.js`)

### 5.1 Core Function

```javascript
SearchForm.render(registry, {
  tab: 'sale',           // sale | rent | building
  container: '#searchFormContainer',
  onSearch: performSearch,
  onClear: clearSearch
});
```

The renderer:
1. Reads `registry.sections` → creates collapsible section wrappers
2. For each section, reads `registry.fields` where `section === sectionKey` and `tabs.includes(tab)`
3. For each field, creates the widget (range-select, checkbox-group, etc.)
4. Every element gets `id="${field.key}-min"` / `id="${field.key}-max"` / `id="${field.key}"` — derived from the registry, never hand-typed
5. Checkbox/radio elements get `data-field="${field.key}"` and `data-value="${option.value}"`

### 5.2 Widget Renderers

Each widget type has a render function:

```javascript
var WidgetRenderers = {
  'range-select': function(field) {
    // Returns HTML for min/max select dropdowns + custom input row
  },
  'checkbox-group': function(field) {
    // Returns HTML for checkbox list with data-field/data-value
  },
  'date-range': function(field) {
    // Returns HTML for from/to date inputs + preset buttons if field.presets
  },
  'text': function(field) {
    // Returns HTML for text input with placeholder
  },
  // ... etc
};
```

### 5.3 Special Widgets

Some widgets are too complex for generic rendering:

- **Neighborhood** — map selector + autocomplete tags. Renders a placeholder div; the existing `neighborhood-map.js` initializes into it.
- **Transit** — subway line buttons. Renders from a transit line data structure (line colors, routes).
- **Manhattan Grid** — street boundary selects. Renders 4 selects with Manhattan street names.
- **Calculators** — mortgage, investment, rent vs buy. Rendered as standalone tool panels within their section, not as search filters.

These use `widget: "custom"` with a `renderer` key pointing to the existing JS module.

## 6. Criteria Collector (`criteria-collector.js`)

### 6.1 Core Function

```javascript
var criteria = SearchCriteria.collect(registry, {
  tab: 'sale',
  container: '#searchFormContainer'
});
// Returns: { beds_min: 2, beds_max: 4, price_min: 500000, neighborhoods: ['Chelsea'], ... }
```

The collector:
1. Iterates `registry.fields` where `tabs.includes(currentTab)`
2. For each field, reads the DOM element by ID (`field.key + '-min'`, etc.)
3. Parses the value using `field.providers[provider].datatype`
4. Stores in criteria object using `field.key` as the key
5. For checkbox groups, collects all checked values into an array

### 6.2 No More Hardcoded ID Lookups

The current `collectSearchCriteria()` is 400+ lines of `getElementById('saleMinBeds')`. The new collector is ~50 lines that iterate the registry. Adding a field = adding a registry entry. The collector automatically picks it up.

## 7. Provider Adapters

### 7.1 Adapter Interface

```javascript
// Every adapter implements:
{
  buildQuery: function(criteria, registry) → provider-specific query,
  execute: function(query) → raw results,
  normalize: function(rawResults, registry) → CRM flat shape[]
}
```

### 7.2 Trestle Adapter

```javascript
TrestleAdapter.buildQuery(criteria, registry):
  1. For each criteria key:
     - Look up field in registry
     - Get trestle field name, operator, datatype, resource
  2. Group by resource:
     - Property fields → $filter parts
     - OpenHouse fields → $expand=OpenHouse($filter=...)
     - Media fields → $expand=Media($filter=...)
  3. Build $select from all fields needed for display
  4. Return { $filter, $select, $expand, $orderby, $top }
```

**Key improvement:** The adapter knows about `$expand` for sub-resources. Open House search becomes:

```
$expand=OpenHouse($filter=OpenHouseDate ge 2026-03-23 and OpenHouseType eq 'Public')
```

This is not possible with the current architecture (no `$expand` for OpenHouse).

### 7.3 Prisma Adapter

```javascript
PrismaAdapter.buildQuery(criteria, registry):
  1. For each criteria key:
     - Look up field in registry
     - Get prisma field name, operator
  2. Build Prisma where clause
  3. Return { where, select, orderBy, take }
```

Used for: own exclusive listings, commercial listings, historical data.

### 7.4 Search Router

```javascript
SearchRouter.search(criteria, registry):
  1. Determine which adapters to use:
     - If criteria.source includes 'idx' → TrestleAdapter
     - If criteria.source includes 'exclusive' → PrismaAdapter
     - Default: both (merge results)
  2. Execute queries in parallel
  3. Merge and deduplicate results
  4. Apply compliance gates (distribution gates, VOW/IDX tier)
  5. Return normalized results
```

## 8. Change Detection (Saved Search Alerts)

### 8.1 Snapshot Model

```sql
-- New table: SavedSearchSnapshot
CREATE TABLE saved_search_snapshots (
  id BIGSERIAL PRIMARY KEY,
  saved_search_id BIGINT REFERENCES saved_searches(id),
  listing_id TEXT NOT NULL,
  field_hash TEXT NOT NULL,        -- hash of all tracked field values
  field_data JSONB NOT NULL,       -- { price: 500000, status: "ACTIVE", ... }
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 8.2 Change Detection Flow

```
Cron runs (daily/weekly per saved search frequency):
  1. Execute saved search criteria → current results
  2. Load previous snapshot for this saved search
  3. For each listing in current results:
     a. Exists in previous snapshot?
        - NO → NEW LISTING alert
        - YES → compare field_data:
          - price changed → PRICE CHANGE alert (up/down, amount)
          - status changed → STATUS CHANGE alert (Active→Contract, etc.)
          - photos added → PHOTOS ADDED alert
          - open house scheduled → OPEN HOUSE alert (check client availability)
          - maintenance changed → MAINTENANCE CHANGE alert
          - sqft corrected → SQFT CHANGE alert
          - ANY field changed → include in digest
     b. In previous snapshot but NOT in current?
        → OFF MARKET alert
  4. Save new snapshot
  5. Send alert digest to agent (email + CRM notification)
```

### 8.3 Which Fields to Track

The registry marks each field with `"change_detection": true/false`. Fields like `ModificationTimestamp` change on every update and shouldn't trigger alerts. Fields like `ListPrice`, `StandardStatus`, `AssociationFee`, `PhotosCount`, `OpenHouseDate` should.

## 9. Compliance Integration

### 9.1 Distribution Gates (unchanged)

All 6 REBNY distribution gates continue to be enforced:
1. Owner Opt-Out
2. Participant Only
3. IDX/VOW display context
4. Syndication
5. Coming Soon
6. Closed > 24 hours

Gates are applied in the Result Normalizer after adapter results are returned, before rendering. Same server-side enforcement as today.

### 9.2 Display Tiers

Each field has `display_tiers: ["idx", "vow", "crm"]`:
- `idx` — visible on public frontend (if ever connected)
- `vow` — visible to logged-in portal clients
- `crm` — visible only to agents/brokers

The form renderer respects these tiers. Agent sees all fields. Client portal (future) would filter to VOW-tier only.

## 10. File Structure

```
public/crm/
  data/
    search-registry.json              ← THE source of truth (all 1,447 fields)
    section-definitions.json          ← UI section groupings
  js/search-v2/
    form-renderer.js                  ← reads registry → generates HTML
    widget-renderers.js               ← individual widget type renderers
    criteria-collector.js             ← reads registry + DOM → criteria object
    search-router.js                  ← routes criteria to adapters
    change-detector.js                ← saved search diff engine
    index.js                          ← orchestrator (init, search, clear, save)
  js/adapters/
    adapter-interface.js              ← shared contract
    trestle-adapter.js                ← OData $filter/$select/$expand builder
    prisma-adapter.js                 ← Prisma where/select builder
    result-normalizer.js              ← any provider → CRM flat shape

app/api/
  idx/search/route.ts                ← updated to accept registry-formatted criteria
  crm/saved-search-snapshots/        ← new: snapshot storage + diff API
```

## 11. Migration Plan

### Phase 1: Build Registry (1-2 days)
- Generate `search-registry.json` from:
  - `data/rebny-rls-property-fields.csv` (902 IDX Plus fields)
  - `artifacts/metadata.xml` (1,447 total Trestle fields)
  - Current advanced form HTML (623 form elements → map to registry keys)
  - `data/SEARCH_CONTROL_MAP.json` (existing field mappings)
- Verify every current form element has a registry entry
- Verify every registry entry has a valid Trestle field mapping

### Phase 2: Build Form Renderer (3-4 days)
- Implement `form-renderer.js` + `widget-renderers.js`
- Render into a hidden test div alongside the old form
- Visually compare: every field in old form should appear in new form
- Run both `collectSearchCriteria()` (old) and `SearchCriteria.collect()` (new) — outputs must match

### Phase 3: Build Adapters (2-3 days)
- Refactor `buildODataFilter()` from route.ts into `trestle-adapter.js`
- Build `prisma-adapter.js` for own listings
- Build `search-router.js` to merge results
- Add `$expand=OpenHouse` support to Trestle adapter

### Phase 4: Wire + Swap (1-2 days)
- Connect new form to search pipeline
- Test every section, every field, every tab
- Run 41-test e2e suite against live Trestle
- Swap: replace old form container with new renderer output
- Delete old 7,840-line HTML form

### Phase 5: Change Detection (2-3 days)
- Create `SavedSearchSnapshot` table
- Build `change-detector.js`
- Update search alert cron to use snapshot diffing
- Test: modify listing in Trestle, verify alert fires

### Total estimated timeline: 10-14 days

## 12. What This Preserves

Everything that works today continues to work:
- All 5 result view modes (gallery, grid, summary, short summary, master-detail)
- Map with clustering and neighborhood polygons
- Photo lazy loading pipeline
- Saved searches with client linking
- Reports system (9 formats, 5 outputs)
- REBNY compliance (6 distribution gates, attribution, address suppression)
- Listing detail page with all tabs
- Selection and bulk actions
- Refine panel
- All existing API endpoints

## 13. What This Enables (Future)

- **AI natural language search** — Claude parses "2BR condo Chelsea under $1.5M with doorman" into registry-format criteria
- **One-click provider swap** — write a new adapter, plug it in
- **Client portal search** — same registry with VOW-tier field visibility
- **Building profiles** — aggregate by BuildingKeyNumeric with PropertyRooms + PropertyUnitTypes data
- **Open house calendar** — query OpenHouse resource for scheduled events
- **Green building search** — PropertyGreenVerification resource
- **Team-based filtering** — Teams + TeamMembers resources
- **Automated field validation** — compare registry entries to live Trestle `$metadata` on deploy
