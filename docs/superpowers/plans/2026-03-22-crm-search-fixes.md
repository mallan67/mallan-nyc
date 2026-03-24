# CRM Search Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 18 issues found in the CRM search audit — broken filters, map layout, compliance gaps, stubs, and dead code.

**Architecture:** All fixes are in the CRM's vanilla JS/HTML/CSS stack (`public/crm/`). No Next.js or React changes. After all fixes, rebuild `index-built.html` via `node public/crm/build.js`. One server-side fix in `app/api/crm/listing-sends/route.ts`.

**Tech Stack:** Vanilla JS, HTML, CSS, Node.js API routes, Prisma, MapLibre GL

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/crm/js/search/search-engine.js` | Modify | Fix `collectSearchCriteria()` — add PropertySubType, Open House dates, Borough collection |
| `public/crm/js/search/search-actions.js` | Modify | Wire client delivery stubs to Reports modal, fix `clearSearchForm()` neighborhoods |
| `public/crm/js/search/pagination.js` | Modify | Fix `emailListingDetail()` compliance + PII masking, fix `shareListing()` event ref, implement `toggleAveragesExpanded()`, make building amenities data-driven |
| `public/crm/js/render/results-map.js` | Modify | Fix map layout (split view), wire card→map panning |
| `public/crm/js/render/render-gallery.js` | Modify | Add `panToListing()` call on card click |
| `public/crm/js/render/render-grid.js` | Modify | Add `panToListing()` call on row click |
| `public/crm/js/render/render-summary.js` | Modify | Add `panToListing()` call on card click |
| `public/crm/js/render/render-short-summary.js` | Modify | Add `panToListing()` call on card click |
| `public/crm/js/render/render-master-detail.js` | Modify | Add `panToListing()` call on card click |
| `app/api/crm/listing-sends/route.ts` | Modify | Add server-side distribution gate check |

---

### Task 1: Fix PropertySubType checkboxes (BROKEN — checked but never collected)

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — `collectSearchCriteria()` function (~line 152+)

- [ ] **Step 1: Find the PropertySubType checkboxes in the HTML**

They use `data-field="PropertySubType"` in all 3 basic forms and advanced mode. The collection logic must read checked values from the active form.

- [ ] **Step 2: Add PropertySubType collection to `collectSearchCriteria()`**

Add after the CommonInterest/ownership checkbox collection block (around line 230):

```javascript
// PropertySubType checkboxes (Townhouse, Conversion, Single Family, etc.)
var propertySubTypeChecked = [];
var pstSelector = isAdvanced
    ? '#searchAdvancedMode input[data-field="PropertySubType"]:checked'
    : '#' + activeFormId + ' input[data-field="PropertySubType"]:checked';
document.querySelectorAll(pstSelector).forEach(function(cb) {
    propertySubTypeChecked.push(cb.value);
});
if (propertySubTypeChecked.length > 0) {
    criteria.propertySubType = propertySubTypeChecked.join(',');
}
```

- [ ] **Step 3: Verify `_serverSearch()` already sends `propertySubType`**

Confirm that `_serverSearch()` already has: `if (criteria.propertySubType) params.propertySubType = criteria.propertySubType;` — it should already be there since the param slot exists.

- [ ] **Step 4: Add local filter in `filterListings()` for PropertySubType**

Add after the CommonInterest filter block:

```javascript
// PropertySubType filter
if (criteria.propertySubType) {
    var pstValues = criteria.propertySubType.split(',').map(function(v) { return v.toLowerCase(); });
    filtered = filtered.filter(function(l) {
        var sub = (l.propertySubType || '').toLowerCase();
        return pstValues.some(function(v) { return sub.indexOf(v) !== -1; });
    });
}
```

- [ ] **Step 5: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 2: Fix Open House date filter (BROKEN — collected but never read)

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — `collectSearchCriteria()` function

- [ ] **Step 1: Add Open House date collection to `collectSearchCriteria()`**

Add after the existing date range collection blocks (around line 280):

```javascript
// Open House date range
var ohDrpId = (currentSearchTab === 'rent') ? 'rentalOpenHouse' : 'saleOpenHouse';
var ohWrapper = document.querySelector('.drp-wrapper[data-drp="' + ohDrpId + '"]');
if (ohWrapper) {
    var ohFrom = ohWrapper.getAttribute('data-from');
    var ohTo = ohWrapper.getAttribute('data-to');
    if (ohFrom) criteria.openHouseDateFrom = ohFrom;
    if (ohTo) criteria.openHouseDateTo = ohTo;
}
```

- [ ] **Step 2: Add Open House filter to `_serverSearch()`**

Add the API params:

```javascript
if (criteria.openHouseDateFrom) params.openHouseDateFrom = criteria.openHouseDateFrom;
if (criteria.openHouseDateTo) params.openHouseDateTo = criteria.openHouseDateTo;
```

- [ ] **Step 3: Add local filter in `filterListings()`**

```javascript
// Open House date filter
if (criteria.openHouseDateFrom || criteria.openHouseDateTo) {
    var ohFrom = criteria.openHouseDateFrom ? new Date(criteria.openHouseDateFrom) : null;
    var ohTo = criteria.openHouseDateTo ? new Date(criteria.openHouseDateTo) : null;
    filtered = filtered.filter(function(l) {
        if (!l.openHouseDate) return false;
        var ohDate = new Date(l.openHouseDate);
        if (ohFrom && ohDate < ohFrom) return false;
        if (ohTo && ohDate > ohTo) return false;
        return true;
    });
}
```

- [ ] **Step 4: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 3: Fix Borough filter (dead code — never collected)

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — `collectSearchCriteria()`

- [ ] **Step 1: Add borough collection**

The neighborhood autocomplete shows borough badges. When all neighborhoods from a borough are selected, or when the user types a borough name, the borough should be captured. Add:

```javascript
// Borough — derive from selected neighborhoods if all are from one borough
var selectedNeighborhoods = getSelectedNeighborhoods(activeTagsId);
if (selectedNeighborhoods.length > 0) {
    var boroughs = selectedNeighborhoods.map(function(n) { return _findBoroughForNeighborhood(n); }).filter(Boolean);
    var uniqueBoroughs = boroughs.filter(function(b, i, arr) { return arr.indexOf(b) === i; });
    if (uniqueBoroughs.length === 1) {
        criteria.borough = uniqueBoroughs[0];
    }
}
```

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 4: Fix `clearSearchForm()` not clearing neighborhood tags

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — `clearSearchForm()`

- [ ] **Step 1: Add neighborhood tag clearing**

Add at the end of `clearSearchForm()`, before `_clearSearchState()`:

```javascript
// Clear neighborhood tags from all 4 tag containers
['saleNeighborhoodTags', 'rentalNeighborhoodTags', 'buildingNeighborhoodTags', 'advancedNeighborhoodTags'].forEach(function(id) {
    var container = document.getElementById(id);
    if (container) container.innerHTML = '';
});
// Reset the internal selection state in neighborhood-autocomplete
if (typeof _neighborhoodSelected !== 'undefined') {
    for (var key in _neighborhoodSelected) {
        delete _neighborhoodSelected[key];
    }
}
```

- [ ] **Step 2: Check if `_neighborhoodSelected` is accessible**

The neighborhood-autocomplete.js uses an IIFE. If `_neighborhoodSelected` isn't on `window`, we need to expose a `clearAllNeighborhoods()` function from the IIFE and call that instead.

Check: `grep -n "_neighborhoodSelected\|_selected" public/crm/js/search/neighborhood-autocomplete.js`

If it's local to the IIFE, add a `window.clearAllNeighborhoods` function inside the IIFE:

```javascript
window.clearAllNeighborhoods = function() {
    for (var key in _selected) { delete _selected[key]; }
    ['saleNeighborhoodTags', 'rentalNeighborhoodTags', 'buildingNeighborhoodTags', 'advancedNeighborhoodTags'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
};
```

Then in `clearSearchForm()`, just call: `if (typeof clearAllNeighborhoods === 'function') clearAllNeighborhoods();`

- [ ] **Step 3: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 5: Fix map layout (above results → side-by-side split)

**Files:**
- Modify: `public/crm/js/render/results-map.js` — `toggleResultsMap()` function

- [ ] **Step 1: Fix `toggleResultsMap()` to use flex split instead of stacking**

Replace the current block-above logic (around line 471) with proper flex split:

```javascript
function toggleResultsMap() {
    var wrapper = document.getElementById('resultsSplitWrapper');
    var mapWrapper = document.getElementById('resultsMapWrapper');
    var mapContainer = document.getElementById('resultsMapContainer');
    var resultsContainer = document.getElementById('resultsContainer');
    var btn = document.getElementById('resultsMapToggleBtn');

    if (!wrapper || !mapWrapper) return;

    _mapOpen = !_mapOpen;

    if (_mapOpen) {
        // Enable flex split layout
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'stretch';
        mapWrapper.style.display = 'block';
        mapWrapper.style.width = '45%';
        mapWrapper.style.minWidth = '360px';
        mapWrapper.style.flexShrink = '0';
        mapWrapper.style.position = 'relative';
        mapWrapper.style.borderLeft = '1px solid #e5e7eb';
        if (resultsContainer) {
            resultsContainer.style.flex = '1';
            resultsContainer.style.minWidth = '0';
            resultsContainer.style.overflowY = 'auto';
        }
        if (mapContainer) {
            mapContainer.style.position = 'sticky';
            mapContainer.style.top = '0';
            mapContainer.style.height = 'calc(100vh - 120px)';
        }
        if (btn) btn.classList.add('bg-blue-100', 'text-blue-700');
        ensureMapLibre(function() {
            initMap(mapContainer);
            refreshMapPins();
        });
    } else {
        // Collapse map
        mapWrapper.style.display = 'none';
        if (resultsContainer) {
            resultsContainer.style.flex = '';
            resultsContainer.style.minWidth = '';
            resultsContainer.style.overflowY = '';
        }
        if (btn) btn.classList.remove('bg-blue-100', 'text-blue-700');
    }
}
```

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 6: Wire card click → map pan

**Files:**
- Modify: `public/crm/js/render/render-gallery.js`
- Modify: `public/crm/js/render/render-grid.js`
- Modify: `public/crm/js/render/render-summary.js`
- Modify: `public/crm/js/render/render-short-summary.js`
- Modify: `public/crm/js/render/render-master-detail.js`

- [ ] **Step 1: Add pan-on-click to all 5 renderers**

In each renderer's card/row click handler, add a check for map open state and pan:

```javascript
// After the existing onclick logic (openListingInNewTab or showListingInDetailPanel):
if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) {
    panToListing(listing.id);
}
```

Find the card onclick in each renderer and add the pan call. The exact location varies per renderer — look for `onclick` or `addEventListener('click'` on the card/row element.

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 7: Fix `emailListingDetail()` — compliance gate + PII masking

**Files:**
- Modify: `public/crm/js/search/pagination.js` — `emailListingDetail()` (~line 1578)

- [ ] **Step 1: Add compliance gate check**

Wrap the existing email logic with a distribution gate check:

```javascript
function emailListingDetail() {
    var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
    if (!listing) return;

    // REBNY compliance gate — do not email non-displayable listings
    if (listing.ownerOptOut === true || listing.internetDisplayYN === false) {
        showToast('This listing cannot be shared — owner has opted out of display.', 'error');
        return;
    }
```

- [ ] **Step 2: Mask listing agent PII in email body**

Replace the agent info section in the mailto body. Instead of exposing listing agent details, show the sending agent's info:

```javascript
var _agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', licenseTitle: 'Licensed Real Estate Broker', phone: '', email: '', company: 'Mallan Real Estate Inc.', companyLicense: '#10991205323', license: '' };

// Use sending agent info, NOT listing agent info
var agentBlock = _agent.name + '\\n' +
    (_agent.licenseTitle || 'Licensed Real Estate Salesperson') + '\\n' +
    (_agent.company || 'Mallan Real Estate Inc.') + '\\n' +
    (_agent.phone ? 'Phone: ' + _agent.phone + '\\n' : '') +
    (_agent.email ? 'Email: ' + _agent.email + '\\n' : '') +
    '\\nEqual Housing Opportunity';
```

Remove any references to `listing.agentName`, `listing.agentPhone`, `listing.agentEmail` from the body.

- [ ] **Step 3: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 8: Fix `shareListing()` implicit event reference

**Files:**
- Modify: `public/crm/js/search/pagination.js` — `shareListing()` (~line 1170)

- [ ] **Step 1: Add event parameter to function signature**

Change from:
```javascript
function shareListing() {
```
To:
```javascript
function shareListing(e) {
```

And update the `event` reference:
```javascript
var btn = e && e.currentTarget;
```

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 9: Wire client delivery stubs to Reports modal

**Files:**
- Modify: `public/crm/js/search/search-actions.js` — lines 44-46

- [ ] **Step 1: Replace empty stubs with working implementations**

```javascript
// Client delivery — route through Reports modal (which handles format, client, email)
function toggleClientDeliveryMenu() {
    var ids = (typeof getSelectedListingIds === 'function') ? getSelectedListingIds() : [];
    if (ids.length === 0) {
        showToast('Please select at least one listing first.', 'warning');
        return;
    }
    openReportsModal(ids, 'email');
}

function openDeliveryModal() {
    toggleClientDeliveryMenu();
}

function closeDeliveryModal() {
    var modal = document.getElementById('reportsModal');
    if (modal) modal.style.display = 'none';
}
```

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 10: Implement `toggleAveragesExpanded()` and compute real averages

**Files:**
- Modify: `public/crm/js/search/pagination.js` — `toggleAveragesExpanded()` (~line 22)

- [ ] **Step 1: Implement the toggle**

```javascript
function toggleAveragesExpanded() {
    var row = document.getElementById('averagesRow');
    if (!row) return;
    var isHidden = row.style.display === 'none';
    row.style.display = isHidden ? '' : 'none';
    var btn = document.getElementById('toggleAveragesBtn');
    if (btn) btn.textContent = isHidden ? 'Hide Averages' : 'Show Averages';
}
```

- [ ] **Step 2: Add `updateAveragesRow()` function to compute from results**

```javascript
function updateAveragesRow() {
    var filtered = getFilteredListings(true);
    if (!filtered || filtered.length === 0) return;
    var prices = filtered.map(function(l) { return parseFloat(l.price) || 0; }).filter(function(p) { return p > 0; });
    var sqfts = filtered.map(function(l) { return parseFloat(l.sqft) || 0; }).filter(function(s) { return s > 0; });
    var ppsf = prices.length > 0 && sqfts.length > 0
        ? prices.reduce(function(a,b){return a+b;},0) / sqfts.reduce(function(a,b){return a+b;},0)
        : 0;
    var avgPrice = prices.length > 0 ? prices.reduce(function(a,b){return a+b;},0) / prices.length : 0;
    var avgSqft = sqfts.length > 0 ? sqfts.reduce(function(a,b){return a+b;},0) / sqfts.length : 0;

    var fmt = function(n) { return '$' + Math.round(n).toLocaleString(); };
    var el = function(id) { return document.getElementById(id); };
    if (el('avgPrice')) el('avgPrice').textContent = fmt(avgPrice);
    if (el('avgPpsf')) el('avgPpsf').textContent = fmt(ppsf);
    if (el('avgSqft')) el('avgSqft').textContent = Math.round(avgSqft).toLocaleString() + ' sqft';
    if (el('resultsTotalCount')) el('resultsTotalCount').textContent = filtered.length;
}
```

- [ ] **Step 3: Call `updateAveragesRow()` from `renderSearchResults()` after rendering**

Add at the end of `renderSearchResults()`:
```javascript
if (typeof updateAveragesRow === 'function') updateAveragesRow();
```

- [ ] **Step 4: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 11: Fix filter modal mock result count

**Files:**
- Modify: `public/crm/js/search/filter-modal.js` — `updateFilterSummary()` (~line 200)

- [ ] **Step 1: Replace mock count with real filtered count**

Replace:
```javascript
var resultCount = Math.max(50, 400 - activeFilters.length * 50);
```
With:
```javascript
var resultCount = (typeof getFilteredListings === 'function') ? getFilteredListings(true).length : 0;
```

- [ ] **Step 2: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 12: Add server-side distribution gate check to listing-sends API

**Files:**
- Modify: `app/api/crm/listing-sends/route.ts`

- [ ] **Step 1: Add gate check after fetching listings**

After the listings are fetched from DB, filter out non-displayable ones:

```typescript
// REBNY compliance: server-side distribution gate check
const displayable = listings.filter(l =>
    l.idx_display_yn !== false &&
    l.internet_entire_listing_display_yn !== false &&
    l.owner_opt_out !== true &&
    l.participant_only !== true
);

if (displayable.length === 0) {
    return NextResponse.json(
        { success: false, error: 'None of the selected listings are eligible for distribution.' },
        { status: 400 }
    );
}

// Continue with displayable listings only
```

- [ ] **Step 2: Verify the route has the correct Prisma select fields**

Ensure the listing query includes: `idx_display_yn`, `internet_entire_listing_display_yn`, `owner_opt_out`, `participant_only`.

---

### Task 13: Remove dead code and clean up

**Files:**
- Modify: `public/crm/js/search/search-actions.js` — remove legacy `toggleResultsView()`
- Modify: `public/crm/js/search/search-engine.js` — remove unreachable `expandCanonicalToVariants()`

- [ ] **Step 1: Mark `toggleResultsView()` as deprecated with comment**

Add comment above: `// DEPRECATED: Superseded by setViewMode(). Kept for onclick compatibility.`
Do NOT delete — HTML buttons may still reference it.

- [ ] **Step 2: Mark `expandCanonicalToVariants()` as deprecated**

Add comment: `// DEPRECATED: Neighborhood variant expansion handled server-side. Kept for potential future use.`

- [ ] **Step 3: Remove `selectAllResults()` from search-actions.js**

Replace with a redirect to the real implementation:
```javascript
function selectAllResults() {
    if (typeof toggleSelectAll === 'function') return toggleSelectAll();
}
```

- [ ] **Step 4: Rebuild and verify**

Run: `node public/crm/build.js`

---

### Task 14: Final rebuild + deploy

**Files:**
- Rebuild: `public/crm/index-built.html`

- [ ] **Step 1: Run full build**

```bash
node public/crm/build.js
```

- [ ] **Step 2: Run smoke test**

```bash
node scripts/smoke-test-crm.js
```

- [ ] **Step 3: Verify build output**

Check that `index-built.html` contains the new code:
- `criteria.propertySubType` — Task 1
- `openHouseDateFrom` — Task 2
- `clearAllNeighborhoods` — Task 4
- `compliance gate` comment in emailListingDetail — Task 7

- [ ] **Step 4: Deploy preview**

```bash
vercel deploy
```

- [ ] **Step 5: Test on preview URL, then promote to production**

```bash
vercel --prod
```
