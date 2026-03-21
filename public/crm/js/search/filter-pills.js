// ── ACTIVE FILTER PILLS ──────────────────────────────────────────────
// Renders pills above results showing active filters.
// Each pill has × to remove that filter and re-run search.

var PILL_LABELS = {
    priceMin:  function(v){ return 'Min $'+Number(v).toLocaleString(); },
    priceMax:  function(v){ return 'Max $'+Number(v).toLocaleString(); },
    bedsMin:   function(v){ return v === 0 ? 'Studio+' : v+'+ Beds'; },
    bedsMax:   function(v){ return 'Max '+v+' Beds'; },
    bathsMin:  function(v){ return v+'+ Baths'; },
    roomsMin:  function(v){ return v+'+ Rooms'; },
    sqftMin:   function(v){ return Number(v).toLocaleString()+' SF+'; },
    sqftMax:   function(v){ return 'Max '+Number(v).toLocaleString()+' SF'; },
    domMax:    function(v){ return 'DOM \u2264'+v; },
    keyword:   function(v){ return '"'+v+'"'; },
    statuses:  function(v){ return Array.isArray(v) ? v.join('/') : v; },
    ownership: function(v){ return Array.isArray(v) ? v.join('/') : v; },
    yearBuiltFrom: function(v){ return 'Built '+v+'+'; },
};

function renderFilterPills() {
    var container = document.getElementById('activeFilterPills');
    if (!container) return;
    var c = (typeof activeSearchCriteria !== 'undefined') ? activeSearchCriteria : null;
    if (!c) { container.innerHTML = ''; return; }

    var pills = [];
    Object.keys(PILL_LABELS).forEach(function(key) {
        var val = c[key];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) return;
        pills.push({ key: key, label: PILL_LABELS[key](val) });
    });

    // Neighborhoods
    if (c.neighborhoods && c.neighborhoods.length > 0) {
        c.neighborhoods.forEach(function(nb) {
            pills.push({ key: 'neighborhood_'+nb, label: nb });
        });
    }

    if (pills.length === 0) { container.innerHTML = ''; return; }

    var E = typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); };
    container.innerHTML = pills.map(function(p) {
        return '<span class="filter-pill">' +
            '<span>' + E(p.label) + '</span>' +
            '<button class="filter-pill-remove" onclick="removePillFilter(\'' + p.key + '\')" title="Remove">&times;</button>' +
            '</span>';
    }).join('');
}

function removePillFilter(key) {
    if (typeof activeSearchCriteria === 'undefined' || !activeSearchCriteria) return;
    if (key.indexOf('neighborhood_') === 0) {
        var nb = key.replace('neighborhood_', '');
        if (activeSearchCriteria.neighborhoods) {
            activeSearchCriteria.neighborhoods = activeSearchCriteria.neighborhoods.filter(function(n){ return n !== nb; });
        }
    } else {
        delete activeSearchCriteria[key];
    }
    renderFilterPills();
    if (typeof performSearch === 'function') performSearch();
}
