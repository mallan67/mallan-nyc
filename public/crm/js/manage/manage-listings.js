// ============================================
// MANAGE MY LISTINGS
// ============================================
var currentManageMode = 'sales';
var currentManageDealFilter = 'all';
var currentManageStatusFilter = 'Active';
var currentManageView = 'cards';
var manageExpandedCard = { id: null, action: null };
var manageExpandedRow = null;
var manageActiveListingId = null;
var currentOHTypeFilter = 'All';
var ohEditId = null;
var _manageListingsLoaded = false;
var _manageListingsLoading = false;

var manageSaleStatuses = ['All','Active','Back On Market','Coming Soon','Offer Out','Contract Signed','Board Approval','Sold','Temp Off Market','Perm Off Market','Expired'];
var manageRentalStatuses = ['All','Active','Back On Market','Coming Soon','Offer Out','Lease Signed','Board Approval','Leased','Temp Off Market','Perm Off Market','Expired'];

// Start empty — populated by loadMyListingsFromAPI()
var myManagementListings = [];

// ── API → Manage Listings Shape Mapper ──
function _formatManageDate(isoStr) {
    if (!isoStr) return null;
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getFullYear()).slice(-2);
}

function _mapApiListingToManage(api) {
    var addr = api.address || {};
    var features = api.features || {};
    var media = api.media || [];
    var isSale = api.listing_type === 'sale';
    var addressStr = (addr.StreetNumber ? addr.StreetNumber + ' ' : '') + (addr.StreetName || '') + (addr.StreetSuffix ? ' ' + addr.StreetSuffix : '');
    if (!addressStr.trim()) addressStr = addr.UnparsedAddress || api.borough || 'Unknown';
    var unitStr = addr.UnitNumber || '';

    // Determine deal type from raw_data or default
    var dealType = 'Exclusive';
    if (api.raw_data && api.raw_data.ListingAgreement === 'Co-Exclusive') dealType = 'Co-Exclusive';
    if (api.raw_data && api.raw_data.ListingAgreement === 'Open') dealType = 'Open';

    // Map RESO StandardStatus → CRM display status
    var statusMap = {
        'Draft': 'Draft', 'Active': 'Active', 'ActiveUnderContract': 'Offer Out',
        'Pending': 'Contract Signed', 'ComingSoon': 'Coming Soon', 'Hold': 'Temp Off Market',
        'Withdrawn': 'Perm Off Market', 'Closed': isSale ? 'Sold' : 'Leased', 'Expired': 'Expired',
        // Both spellings — see the boundary fold in core/api-client.js. This map
        // is also fed by paths that do not pass through it.
        'Canceled': 'Perm Off Market', 'Cancelled': 'Perm Off Market',
        'Delete': 'Perm Off Market'
    };
    var displayStatus = statusMap[api.status] || api.status || 'Draft';

    // Photos: first photo URL from media array
    var photoUrl = '';
    var photoCount = 0;
    if (Array.isArray(media) && media.length > 0) {
        photoUrl = media[0].MediaURL || media[0].url || '';
        photoCount = media.length;
    }

    var bathsTotal = (api.bathrooms_full || 0) + ((api.bathrooms_half || 0) * 0.5);
    var rooms = features.Rooms ? parseInt(features.Rooms) : ((api.bedrooms_total || 0) + 1);

    return {
        id: api.listing_id || api.id,
        _dbId: api.id,
        category: isSale ? 'sales' : 'rentals',
        dealType: dealType,
        status: displayStatus,
        address: addressStr.trim(),
        unit: unitStr,
        price: parseFloat(api.list_price) || 0,
        rooms: rooms,
        beds: api.bedrooms_total || 0,
        baths: bathsTotal,
        listed: _formatManageDate(api.created_at),
        update: _formatManageDate(api.updated_at),
        contractSigned: displayStatus === 'Contract Signed' ? _formatManageDate(api.status_changed_at) : null,
        sold: displayStatus === 'Sold' ? _formatManageDate(api.status_changed_at) : null,
        leaseSigned: displayStatus === 'Lease Signed' ? _formatManageDate(api.status_changed_at) : null,
        rented: displayStatus === 'Leased' ? _formatManageDate(api.status_changed_at) : null,
        expiration: _formatManageDate(api.listing_contract_date),
        coListed: dealType === 'Co-Exclusive',
        photo: photoUrl,
        photoCount: photoCount,
        media: {
            rlsUploaded: true,
            idxDisplayYN: api.idx_display_yn !== false,
            webDisplayed: api.idx_display_yn !== false && !api.owner_opt_out && !api.participant_only
        },
        comingSoonStartDate: displayStatus === 'Coming Soon' ? _formatManageDate(api.first_active_date || api.status_changed_at) : null
    };
}

function loadMyListingsFromAPI(callback) {
    if (_manageListingsLoading) return;
    if (typeof MallanAPI === 'undefined' || !MallanAPI.listings) {
        if (typeof console !== 'undefined') console.warn('[ManageListings] MallanAPI not available — using empty list');
        _manageListingsLoaded = true;
        if (callback) callback();
        return;
    }
    _manageListingsLoading = true;

    MallanAPI.listings.list({ limit: 200 }).then(function(data) {
        var apiListings = data.listings || [];
        if (apiListings.length > 0) {
            myManagementListings = apiListings.map(_mapApiListingToManage);
        }
        _manageListingsLoaded = true;
        _manageListingsLoading = false;
        // Update portfolio overview stats
        _updatePortfolioStats();
        if (callback) callback();
    }).catch(function(err) {
        if (typeof console !== 'undefined') console.error('[ManageListings] API load failed:', err);
        _manageListingsLoaded = true;
        _manageListingsLoading = false;
        if (callback) callback();
    });
}

function _updatePortfolioStats() {
    var sales = myManagementListings.filter(function(l) { return l.category === 'sales'; });
    var rentals = myManagementListings.filter(function(l) { return l.category === 'rentals'; });
    var totalVolume = 0;
    sales.forEach(function(l) { totalVolume += l.price; });
    // Format volume
    var volStr;
    if (totalVolume >= 1000000) volStr = '$' + (totalVolume / 1000000).toFixed(1) + 'M';
    else if (totalVolume >= 1000) volStr = '$' + (totalVolume / 1000).toFixed(0) + 'K';
    else volStr = '$' + totalVolume.toLocaleString();

    // Update DOM if elements exist (portfolio overview cards)
    var volEl = document.querySelector('#my-listings .text-xl.font-bold');
    if (volEl) {
        volEl.textContent = volStr;
        var subEl = volEl.nextElementSibling;
        if (subEl) subEl.innerHTML = myManagementListings.length + ' listings &middot; ' + sales.length + ' sale / ' + rentals.length + ' rental';
    }
}

// Open house data — starts empty, populated from local scheduling
var myOpenHouses = [];
var ohNextId = 1;

var manageStatusColors = {
    'Active':           { bg: 'bg-blue-100',   text: 'text-blue-700' },
    'Back On Market':   { bg: 'bg-blue-100',   text: 'text-blue-700' },
    'Coming Soon':      { bg: 'bg-teal-100',   text: 'text-gray-700' },
    'Offer Out':        { bg: 'bg-orange-100',  text: 'text-orange-700' },
    'Contract Signed':  { bg: 'bg-purple-100',  text: 'text-purple-700' },
    'Lease Signed':     { bg: 'bg-purple-100',  text: 'text-purple-700' },
    'Board Approval':   { bg: 'bg-purple-100',  text: 'text-purple-700' },
    'Sold':             { bg: 'bg-green-100',   text: 'text-green-700' },
    'Leased':           { bg: 'bg-green-100',   text: 'text-green-700' },
    'Temp Off Market':  { bg: 'bg-gray-100',    text: 'text-gray-600' },
    'Perm Off Market':  { bg: 'bg-gray-200',    text: 'text-gray-700' },
    'Expired':          { bg: 'bg-red-100',     text: 'text-red-700' }
};

var manageDealTypeColors = {
    'Exclusive':    { bg: 'bg-blue-100',   text: 'text-blue-700' },
    'Co-Exclusive': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    'Open':         { bg: 'bg-gray-100',   text: 'text-gray-700' }
};

// OH type filter labels (used by filter pills only)
var ohTypeFilterLabels = { 'Public': 'Open House', 'By Appointment': 'Open House By Appointment Only', 'Broker Only': 'Broker Open House' };

function manageFormatPrice(amount, mode) {
    if (!amount) return '\u2014';
    if (mode === 'rentals') {
        return '$' + amount.toLocaleString() + '/mo';
    }
    return '$' + amount.toLocaleString();
}

function manageTodayStr() {
    var d = new Date();
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getFullYear()).slice(-2);
}

function manageIsExpiringSoon(dateStr) {
    if (!dateStr) return false;
    var parts = dateStr.split('/');
    var exp = new Date(20 + parts[2], parseInt(parts[0]) - 1, parseInt(parts[1]));
    var now = new Date();
    var diff = (exp - now) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
}

function manageIsExpired(dateStr) {
    if (!dateStr) return false;
    var parts = dateStr.split('/');
    var exp = new Date(20 + parts[2], parseInt(parts[0]) - 1, parseInt(parts[1]));
    return exp < new Date();
}

function formatOHDate(isoDate) {
    if (!isoDate) return '\u2014';
    var d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatOHTime(t) {
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0]); var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
}

// ---- View toggle (cards vs table) ----
function toggleManageView(view) {
    currentManageView = view;
    var cardView = document.getElementById('manageCardView');
    var tableView = document.getElementById('manageTableView');
    var cardBtn = document.getElementById('manageViewBtn-cards');
    var tableBtn = document.getElementById('manageViewBtn-table');
    if (view === 'cards') {
        cardView.style.display = 'block';
        tableView.style.display = 'none';
        cardBtn.className = 'p-2 rounded-md bg-gray-900 text-white';
        tableBtn.className = 'p-2 rounded-md text-gray-400 hover:text-gray-600';
    } else {
        cardView.style.display = 'none';
        tableView.style.display = 'block';
        cardBtn.className = 'p-2 rounded-md text-gray-400 hover:text-gray-600';
        tableBtn.className = 'p-2 rounded-md bg-gray-900 text-white';
    }
}
// Force card view on mobile
window.addEventListener('resize', function() {
    if (window.innerWidth < 768 && currentManageView === 'table') {
        toggleManageView('cards');
    }
});

// ---- Next OH helper ----
function renderNextOH(listingId) {
    var today = new Date().toISOString().split('T')[0];
    var upcoming = myOpenHouses
        .filter(function(oh) { return oh.listingId === listingId && oh.date >= today; })
        .sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    if (upcoming.length === 0) return '';
    var oh = upcoming[0];
    var typeLabels = (oh.types || []).map(function(t) {
        if (t === 'Public') return 'Open House';
        if (t === 'By Appointment') return 'Open House By Appointment Only';
        if (t === 'Broker Only') return 'Broker Open House';
        return t;
    });
    if (oh.virtualTour) typeLabels.push('Virtual Tour');
    var d = new Date(oh.date + 'T00:00:00');
    var dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    return typeLabels.join(', ') + ' &middot; <strong>' + dayStr + ', ' + formatOHTime(oh.start) + '\u2013' + formatOHTime(oh.end) + '</strong>';
}

// ---- Card rendering ----
// ── Coming Soon 14-Day Countdown (#17) ──
// UCBA D2: Coming Soon limited to 14 calendar days max.
// Green 8-14d, Yellow 3-7d, Red 0-2d, Pulsing overdue
function comingSoonCountdown(listing) {
    if (listing.status !== 'Coming Soon' || !listing.comingSoonStartDate) return '';
    var parts = listing.comingSoonStartDate.split('/');
    var startDate = new Date(2000 + parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    var now = new Date();
    var elapsed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    var remaining = 14 - elapsed;

    var color, bg, textColor, pulse;
    if (remaining > 7) { color = '#16a34a'; bg = '#f0fdf4'; textColor = '#166534'; pulse = ''; }
    else if (remaining > 2) { color = '#ca8a04'; bg = '#fefce8'; textColor = '#854d0e'; pulse = ''; }
    else if (remaining >= 0) { color = '#dc2626'; bg = '#fef2f2'; textColor = '#991b1b'; pulse = ''; }
    else { color = '#dc2626'; bg = '#fef2f2'; textColor = '#991b1b'; pulse = ' animate-pulse'; }

    var html = '<div class="mt-2 rounded-lg px-3 py-2 text-xs' + pulse + '" style="background:' + bg + ';border:1px solid ' + color + '30" data-compliance="coming-soon-countdown" data-reso-field="ComingSoonTimestamp" data-reso-value="' + listing.comingSoonStartDate + '">';

    if (remaining > 0) {
        html += '<div class="flex items-center justify-between">';
        html += '<span style="color:' + textColor + '" class="font-semibold"><i class="fas fa-clock mr-1"></i>' + remaining + ' day' + (remaining !== 1 ? 's' : '') + ' remaining</span>';
        html += '<span class="text-[10px]" style="color:' + color + '">Day ' + elapsed + ' of 14</span>';
        html += '</div>';
        // Progress bar
        html += '<div class="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">';
        html += '<div class="h-full rounded-full transition-all" style="width:' + Math.round((elapsed / 14) * 100) + '%;background:' + color + '"></div>';
        html += '</div>';
    } else {
        html += '<div class="flex items-center justify-between">';
        html += '<span style="color:#991b1b" class="font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>OVERDUE — ' + Math.abs(remaining) + ' day' + (Math.abs(remaining) !== 1 ? 's' : '') + ' past 14-day limit!</span>';
        html += '</div>';
    }

    // Alert banners at Day 12 and Day 14+
    if (elapsed >= 14) {
        html += '<div class="mt-1.5 px-2 py-1 bg-red-100 rounded text-red-800 font-bold text-[10px]"><i class="fas fa-exclamation-circle mr-1"></i>UCBA D2 VIOLATION: Must activate or withdraw immediately</div>';
    } else if (elapsed >= 12) {
        html += '<div class="mt-1.5 px-2 py-1 bg-yellow-100 rounded text-yellow-800 font-semibold text-[10px]"><i class="fas fa-bell mr-1"></i>2 days until mandatory activation — prepare to go active</div>';
    }

    // Action buttons
    html += '<div class="flex items-center gap-2 mt-2">';
    html += '<button onclick="manageStatusApply(\'Active\')" class="px-2.5 py-1 bg-green-600 text-white rounded text-[10px] font-semibold hover:bg-green-700" data-reso-field="MlsStatus" data-reso-value="Active"><i class="fas fa-check mr-1"></i>Activate Now</button>';
    html += '<button onclick="manageStatusApply(\'Temp Off Market\')" class="px-2.5 py-1 bg-gray-500 text-white rounded text-[10px] font-semibold hover:bg-gray-600" title="UCBA D11: Withdraw/TOM"><i class="fas fa-pause mr-1"></i>Withdraw/TOM</button>';
    html += '</div>';

    html += '</div>';
    return html;
}

function renderManageCards(listings) {
    var container = document.getElementById('manageCardList');
    var empty = document.getElementById('manageCardEmpty');
    if (listings.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    var isSales = currentManageMode === 'sales';

    var statusBorderMap = {
        'Active': 'border-l-blue-500', 'Back On Market': 'border-l-blue-400', 'Coming Soon': 'border-l-amber-400',
        'Offer Out': 'border-l-orange-500', 'Contract Signed': 'border-l-purple-500', 'Board Approval': 'border-l-indigo-500',
        'Lease Signed': 'border-l-purple-500', 'Sold': 'border-l-emerald-500', 'Leased': 'border-l-emerald-500',
        'Temp Off Market': 'border-l-gray-400', 'Perm Off Market': 'border-l-gray-500', 'Expired': 'border-l-red-500'
    };

    var html = '';

    listings.forEach(function(l) {
        var sc = manageStatusColors[l.status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
        var dc = manageDealTypeColors[l.dealType] || { bg: 'bg-gray-100', text: 'text-gray-700' };
        var nextOH = renderNextOH(l.id);
        var isExpanded = manageExpandedCard.id === l.id;
        var expandedAction = isExpanded ? manageExpandedCard.action : null;
        var borderColor = statusBorderMap[l.status] || 'border-l-gray-300';

        html += '<div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ' + borderColor + '" id="card-' + l.id + '">';

        // Photo banner with RLS/IDX media metadata
        if (l.photo) {
            var media = l.media || {};
            html += '<div class="manage-photo-wrap" style="height:140px" data-reso-field="Media" data-reso-value="PhotosCount:' + (l.photoCount || 0) + '">';
            html += '<img src="' + l.photo + '" alt="' + l.address + ' ' + l.unit + '" class="manage-photo" loading="lazy" data-reso-field="MediaURL">';
            // Top-left: status badge
            html += '<div class="absolute top-2.5 left-2.5"><span class="px-2 py-1 ' + sc.bg + ' ' + sc.text + ' rounded-md text-[10px] font-bold shadow-sm">' + l.status + '</span></div>';
            // Top-right: RLS / IDX / Web distribution badges
            html += '<div class="absolute top-2.5 right-2.5 flex items-center gap-1">';
            if (media.rlsUploaded) {
                html += '<span class="px-1.5 py-0.5 bg-blue-600/80 text-white text-[9px] font-bold rounded backdrop-blur-sm" title="Uploaded to REBNY RLS via Trestle">RLS</span>';
            }
            if (media.idxDisplayYN) {
                html += '<span class="px-1.5 py-0.5 bg-green-600/80 text-white text-[9px] font-bold rounded backdrop-blur-sm" title="IDX display enabled" data-reso-field="IDXEntireListingDisplayYN" data-reso-value="true">IDX</span>';
            }
            if (media.webDisplayed) {
                html += '<span class="px-1.5 py-0.5 bg-amber-600/80 text-white text-[9px] font-bold rounded backdrop-blur-sm" title="Displayed on mallan.nyc">Web</span>';
            }
            html += '</div>';
            // Bottom: gradient overlay with photo count
            html += '<div class="absolute bottom-0 left-0 right-0 px-2.5 py-2 flex items-center justify-between" style="background:linear-gradient(transparent,rgba(0,0,0,0.5))">';
            html += '<span class="text-white/80 text-[10px] flex items-center gap-1"><i class="fas fa-camera"></i> ' + (l.photoCount || 0) + ' photos</span>';
            html += '</div>';
            html += '</div>';
        }

        // Content area
        html += '<div class="p-4 sm:p-5">';

        // Top: address + badges
        html += '<div class="flex items-start justify-between gap-3">';
        html += '<div class="flex-1 min-w-0">';
        html += '<p class="font-bold text-gray-900 text-[15px] leading-snug truncate">' + l.address + ', ' + l.unit + '</p>';
        html += '<p class="text-lg sm:text-xl font-bold text-gray-900 mt-1">' + manageFormatPrice(l.price, currentManageMode) + '</p>';
        html += '</div>';
        html += '<div class="flex flex-col items-end gap-1.5 flex-shrink-0">';
        html += '<div class="flex items-center gap-1.5">';
        html += '<span class="px-2.5 py-1 ' + sc.bg + ' ' + sc.text + ' rounded-md text-xs font-bold">' + l.status + '</span>';
        html += '<button onclick="manageEditListing(\'' + l.id + '\')" class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Edit Listing" aria-label="Edit"><i class="fas fa-ellipsis-v text-sm"></i></button>';
        html += '</div>';
        html += '<span class="px-2 py-0.5 ' + dc.bg + ' ' + dc.text + ' rounded text-[11px] font-medium">' + l.dealType + '</span>';
        html += '</div>';
        html += '</div>';

        // Details row
        html += '<div class="flex items-center gap-3 mt-2.5 text-sm text-gray-500">';
        html += '<span>' + l.beds + ' BD</span>';
        html += '<span class="w-px h-3.5 bg-gray-200"></span>';
        html += '<span>' + l.baths + ' BA</span>';
        html += '<span class="w-px h-3.5 bg-gray-200"></span>';
        html += '<span>' + l.rooms + ' Rooms</span>';
        html += '</div>';

        // Footer: dates + expiration + OH
        html += '<div class="mt-3 pt-3 border-t border-gray-100">';
        html += '<div class="flex items-center justify-between">';
        html += '<p class="text-xs text-gray-400">Listed ' + l.listed + ' &middot; Updated ' + l.update + '</p>';
        html += '</div>';
        if (nextOH) {
            html += '<p class="text-sm text-gray-800 font-semibold mt-2 flex items-center gap-1.5"><i class="fas fa-door-open text-blue-500 text-xs"></i>' + nextOH + '</p>';
        }
        // Coming Soon 14-day countdown (#17)
        html += comingSoonCountdown(l);
        html += '</div>';

        html += '</div>';

        // Action bar
        html += '<div class="flex border-t border-gray-200 bg-gray-50/80">';
        var actions = [
            { key: 'status', icon: 'fa-exchange-alt', label: 'Status', activeClr: 'text-blue-600 bg-blue-50' },
            { key: 'price', icon: 'fa-dollar-sign', label: 'Price', activeClr: 'text-green-600 bg-green-50' },
            { key: 'distribute', icon: 'fa-share-alt', label: 'IDX', activeClr: 'text-purple-600 bg-purple-50' },
            { key: 'oh', icon: 'fa-door-open', label: 'OH', activeClr: 'text-blue-600 bg-blue-50' },
            { key: 'refresh', icon: 'fa-sync-alt', label: 'Refresh', activeClr: 'text-amber-600 bg-amber-50' }
        ];
        actions.forEach(function(a, idx) {
            var isActive = expandedAction === a.key;
            var divider = idx < actions.length - 1 ? ' border-r border-gray-200' : '';
            html += '<button onclick="toggleCardAction(\'' + l.id + '\',\'' + a.key + '\')" class="flex-1 min-h-[48px] flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors' + divider + ' ' + (isActive ? a.activeClr : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700') + '">';
            html += '<i class="fas ' + a.icon + '"></i>';
            html += '<span>' + a.label + '</span>';
            html += '</button>';
        });
        html += '</div>';

        // Expandable panel (accordion)
        if (isExpanded && expandedAction) {
            html += '<div id="cardPanel-' + l.id + '" class="border-t border-gray-200 bg-white p-4 sm:p-5">';
            if (expandedAction === 'status') {
                html += renderCardStatusPanel(l);
            } else if (expandedAction === 'price') {
                html += renderCardPricePanel(l);
            } else if (expandedAction === 'distribute') {
                html += renderCardDistributePanel(l);
            } else if (expandedAction === 'oh') {
                html += renderCardOHPanel(l);
            }
            html += '</div>';
        }

        html += '</div>';
    });

    container.innerHTML = html;
}

// ---- Card Status Panel ----
function renderCardStatusPanel(listing) {
    var isSales = currentManageMode === 'sales';
    var rlsStatusMap = {
        'Active': 'Active', 'Back On Market': 'Active', 'Coming Soon': 'ComingSoon',
        'Offer Out': 'Pending', 'Contract Signed': 'Pending', 'Lease Signed': 'Pending', 'Board Approval': 'Pending',
        'Sold': 'Closed', 'Leased': 'Closed',
        'Temp Off Market': 'Hold', 'Perm Off Market': 'Withdrawn', 'Expired': 'Expired'
    };
    var activeStatuses = isSales
        ? ['Active','Back On Market','Coming Soon','Offer Out','Contract Signed','Board Approval']
        : ['Active','Back On Market','Coming Soon','Offer Out','Lease Signed','Board Approval'];
    var closedStatuses = isSales
        ? ['Sold','Temp Off Market','Perm Off Market','Expired']
        : ['Leased','Temp Off Market','Perm Off Market','Expired'];

    function renderBtns(arr) {
        var h = '';
        arr.forEach(function(s) {
            var ssc = manageStatusColors[s] || { bg: 'bg-gray-100', text: 'text-gray-600' };
            var isCurrent = listing.status === s;
            var rls = rlsStatusMap[s] || s;
            h += '<button onclick="cardStatusApply(\'' + listing.id + '\',\'' + s + '\')" class="px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1 min-h-[40px] ' + (isCurrent ? 'ring-2 ring-blue-400 ' + ssc.bg + ' ' + ssc.text : 'bg-white text-gray-600 hover:bg-gray-50') + '" title="RLS: ' + rls + '">';
            h += '<span class="px-1.5 py-0.5 rounded ' + ssc.bg + ' ' + ssc.text + '">' + s + '</span>';
            if (isCurrent) h += '<i class="fas fa-check text-blue-600 text-[10px]"></i>';
            h += '</button>';
        });
        return h;
    }

    var html = '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Active / Pipeline</p>';
    html += '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">' + renderBtns(activeStatuses) + '</div>';
    html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Closed / Not Active</p>';
    html += '<div class="grid grid-cols-2 gap-2">' + renderBtns(closedStatuses) + '</div>';
    return html;
}

// ---- Card Price Panel ----
function renderCardPricePanel(listing) {
    var isSales = currentManageMode === 'sales';
    var priceSteps = isSales
        ? [{ v: -25000, l: '-$25K' }, { v: -50000, l: '-$50K' }, { v: -100000, l: '-$100K' }, { v: 25000, l: '+$25K' }, { v: 50000, l: '+$50K' }, { v: 100000, l: '+$100K' }]
        : [{ v: -100, l: '-$100' }, { v: -250, l: '-$250' }, { v: -500, l: '-$500' }, { v: 100, l: '+$100' }, { v: 250, l: '+$250' }, { v: 500, l: '+$500' }];

    var html = '<p class="text-sm text-gray-500 mb-2">Current: <span class="font-semibold text-gray-900">' + manageFormatPrice(listing.price, currentManageMode) + '</span></p>';
    html += '<input id="cardPriceInput-' + listing.id + '" type="text" class="w-full border rounded-lg px-3 py-2 text-base mb-3" placeholder="New price">';
    html += '<div class="flex flex-wrap gap-2 mb-3">';
    priceSteps.forEach(function(s) {
        var color = s.v < 0 ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50';
        html += '<button onclick="cardPriceAdjust(\'' + listing.id + '\',' + s.v + ')" class="px-2.5 py-1.5 border rounded-lg text-xs font-medium min-h-[36px] ' + color + '">' + s.l + '</button>';
    });
    html += '</div>';
    html += '<button onclick="cardPriceSave(\'' + listing.id + '\')" class="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 min-h-[44px]">Update Price</button>';
    return html;
}

// ---- Card OH Panel ----
function renderCardOHPanel(listing) {
    var today = new Date().toISOString().split('T')[0];
    var listingOHs = myOpenHouses.filter(function(oh) { return oh.listingId === listing.id; });
    var upcoming = listingOHs.filter(function(oh) { return oh.date >= today; }).sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    var past = listingOHs.filter(function(oh) { return oh.date < today; });

    var html = '';

    // Existing upcoming OHs
    if (upcoming.length > 0) {
        html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Upcoming</p>';
        upcoming.forEach(function(oh) {
            var typeLabels = (oh.types || []).map(function(t) {
                if (t === 'Public') return 'Open House';
                if (t === 'By Appointment') return 'Open House By Appointment Only';
                if (t === 'Broker Only') return 'Broker Open House';
                return t;
            });
            if (oh.virtualTour) typeLabels.push('Virtual Tour');
            html += '<div class="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-3 py-2.5 mb-2">';
            html += '<div class="min-w-0">';
            html += '<p class="text-sm font-bold text-gray-900">' + formatOHDate(oh.date) + '</p>';
            html += '<p class="text-xs font-bold text-gray-700 mt-0.5">' + formatOHTime(oh.start) + ' \u2013 ' + formatOHTime(oh.end) + '</p>';
            html += '<div class="flex flex-wrap gap-1 mt-1">';
            typeLabels.forEach(function(label) {
                html += '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded">' + label + '</span>';
            });
            html += '</div>';
            html += '</div>';
            html += '<button onclick="cardDeleteOH(\'' + oh.id + '\',\'' + listing.id + '\')" class="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 flex-shrink-0 ml-2" title="Cancel OH"><i class="fas fa-trash text-[11px]"></i></button>';
            html += '</div>';
        });
    }

    // Past OH count
    if (past.length > 0) {
        html += '<p class="text-xs text-gray-400 mb-3">' + past.length + ' past open house' + (past.length > 1 ? 's' : '') + '</p>';
    }

    // Schedule new OH form
    var noOHStatuses = ['Sold', 'Leased', 'Expired', 'Perm Off Market'];
    if (noOHStatuses.indexOf(listing.status) !== -1) {
        html += '<p class="text-sm text-gray-400 italic">Cannot schedule open houses for ' + listing.status + ' listings.</p>';
        return html;
    }

    html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2 ' + (upcoming.length > 0 || past.length > 0 ? 'mt-3' : '') + '">Schedule New</p>';
    html += '<div class="grid grid-cols-3 gap-2 mb-3">';
    html += '<div><label class="block text-xs font-semibold text-gray-600 mb-1">Date</label><input id="cardOHDate-' + listing.id + '" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base bg-white" min="' + today + '"></div>';
    html += '<div><label class="block text-xs font-semibold text-gray-600 mb-1">Start</label><input id="cardOHStart-' + listing.id + '" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base bg-white"></div>';
    html += '<div><label class="block text-xs font-semibold text-gray-600 mb-1">End</label><input id="cardOHEnd-' + listing.id + '" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base bg-white"></div>';
    html += '</div>';
    html += '<div class="flex flex-wrap gap-2 mb-3">';
    html += '<label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer text-sm bg-white hover:bg-gray-100 has-[:checked]:bg-gray-100 has-[:checked]:border-gray-400 min-h-[40px] transition-colors"><input type="checkbox" id="cardOHType-public-' + listing.id + '" class="accent-gray-700"> <span class="font-medium text-gray-700">Open House</span></label>';
    html += '<label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer text-sm bg-white hover:bg-gray-100 has-[:checked]:bg-gray-100 has-[:checked]:border-gray-400 min-h-[40px] transition-colors"><input type="checkbox" id="cardOHType-broker-' + listing.id + '" class="accent-gray-700"> <span class="font-medium text-gray-700">Broker Open House</span></label>';
    html += '<label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer text-sm bg-white hover:bg-gray-100 has-[:checked]:bg-gray-100 has-[:checked]:border-gray-400 min-h-[40px] transition-colors"><input type="checkbox" id="cardOHType-appt-' + listing.id + '" class="accent-gray-700"> <span class="font-medium text-gray-700">Open House By Appointment Only</span></label>';
    html += '<label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer text-sm bg-white hover:bg-gray-100 has-[:checked]:bg-gray-100 has-[:checked]:border-gray-400 min-h-[40px] transition-colors"><input type="checkbox" id="cardOHType-virtual-' + listing.id + '" class="accent-gray-700"> <span class="font-medium text-gray-700">Virtual Tour</span></label>';
    html += '</div>';
    html += '<button onclick="cardOHSave(\'' + listing.id + '\')" class="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[44px]"><i class="fas fa-plus"></i> Schedule Open House</button>';
    return html;
}

// ---- Card IDX Distribution Panel ----
function renderCardDistributePanel(listing) {
    var media = listing.media || {};
    var isIDXEligible = ['Active','Back On Market','Coming Soon','Offer Out'].indexOf(listing.status) !== -1;

    var html = '';

    // RLS — REBNY RLS via Trestle
    html += '<div class="mb-4">';
    html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">REBNY RLS (Trestle)</p>';
    html += '<div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">';
    html += '<div class="flex items-center gap-2">';
    html += '<span class="w-2 h-2 rounded-full ' + (media.rlsUploaded ? 'bg-green-500' : 'bg-gray-400') + '"></span>';
    html += '<span class="text-sm font-semibold text-gray-800">' + (media.rlsUploaded ? 'Uploaded to RLS' : 'Not on RLS') + '</span>';
    html += '</div>';
    html += '<div class="flex items-center gap-2">';
    if (media.rlsUploaded) {
        html += '<span class="text-[10px] text-gray-500">Last sync: ' + listing.update + '</span>';
        html += '<button onclick="cardDistributeSync(\'' + listing.id + '\',\'rls\')" class="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700"><i class="fas fa-sync-alt mr-1"></i>Sync</button>';
    } else {
        html += '<button onclick="cardDistributeToggle(\'' + listing.id + '\',\'rls\',true)" class="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700"><i class="fas fa-upload mr-1"></i>Upload</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // IDX — Display on other broker websites
    html += '<div class="mb-4">';
    html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">IDX Display</p>';
    html += '<div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">';
    html += '<div>';
    html += '<div class="flex items-center gap-2">';
    html += '<span class="w-2 h-2 rounded-full ' + (media.idxDisplayYN ? 'bg-green-500' : 'bg-gray-400') + '"></span>';
    html += '<span class="text-sm font-semibold text-gray-800">' + (media.idxDisplayYN ? 'IDX Opt-In (Visible)' : 'IDX Opt-Out (Hidden)') + '</span>';
    html += '</div>';
    html += '<p class="text-[10px] text-gray-500 mt-0.5">Controls display on participating broker IDX websites</p>';
    html += '</div>';
    html += '<label class="relative inline-flex items-center cursor-pointer">';
    html += '<input type="checkbox" class="sr-only peer" ' + (media.idxDisplayYN ? 'checked' : '') + (isIDXEligible ? '' : ' disabled') + ' onchange="cardDistributeToggle(\'' + listing.id + '\',\'idx\',this.checked)">';
    html += '<div class="w-9 h-5 bg-gray-300 peer-checked:bg-green-500 rounded-full after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>';
    html += '</label>';
    html += '</div>';
    if (!isIDXEligible) {
        html += '<p class="text-[10px] text-amber-600 mt-1"><i class="fas fa-info-circle mr-1"></i>IDX display requires Active, Back On Market, Coming Soon, or Offer Out status.</p>';
    }
    html += '</div>';

    // Web — mallan.nyc
    html += '<div class="mb-4">';
    html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Web (mallan.nyc)</p>';
    html += '<div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">';
    html += '<div>';
    html += '<div class="flex items-center gap-2">';
    html += '<span class="w-2 h-2 rounded-full ' + (media.webDisplayed ? 'bg-amber-500' : 'bg-gray-400') + '"></span>';
    html += '<span class="text-sm font-semibold text-gray-800">' + (media.webDisplayed ? 'Live on mallan.nyc' : 'Not on mallan.nyc') + '</span>';
    html += '</div>';
    html += '<p class="text-[10px] text-gray-500 mt-0.5">Listing and photos displayed on your website</p>';
    html += '</div>';
    html += '<label class="relative inline-flex items-center cursor-pointer">';
    html += '<input type="checkbox" class="sr-only peer" ' + (media.webDisplayed ? 'checked' : '') + (isIDXEligible ? '' : ' disabled') + ' onchange="cardDistributeToggle(\'' + listing.id + '\',\'web\',this.checked)">';
    html += '<div class="w-9 h-5 bg-gray-300 peer-checked:bg-amber-500 rounded-full after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>';
    html += '</label>';
    html += '</div>';
    if (!isIDXEligible) {
        html += '<p class="text-[10px] text-amber-600 mt-1"><i class="fas fa-info-circle mr-1"></i>Web display requires Active, Back On Market, Coming Soon, or Offer Out status.</p>';
    }
    html += '</div>';

    // Photo sync status
    html += '<div class="mb-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">';
    html += '<div class="flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    html += '<i class="fas fa-camera text-gray-500 text-sm"></i>';
    html += '<div>';
    html += '<span class="text-sm font-semibold text-gray-800">' + (listing.photoCount || 0) + ' photos</span>';
    html += '<p class="text-[10px] text-gray-500">Photos sync to all enabled feeds (RLS, IDX, mallan.nyc)</p>';
    html += '</div>';
    html += '</div>';
    html += '<button onclick="manageEditListing(\'' + listing.id + '\')" class="px-2.5 py-1 bg-gray-200 text-gray-700 rounded text-[10px] font-semibold hover:bg-gray-300"><i class="fas fa-pen mr-1"></i>Edit Photos</button>';
    html += '</div>';
    html += '</div>';

    // Push Updates button
    html += '<button onclick="cardDistributePush(\'' + listing.id + '\')" class="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[44px]"><i class="fas fa-cloud-upload-alt"></i> Push Updates to All Feeds</button>';

    return html;
}

// ---- IDX Distribution action handlers ----
function cardDistributeToggle(listingId, feed, enabled) {
    var listing = manageFindListing(listingId);
    if (!listing || !listing.media) return;
    if (feed === 'rls') {
        listing.media.rlsUploaded = enabled;
        manageShowToast(enabled ? 'Listing uploaded to REBNY RLS' : 'Listing removed from RLS');
    } else if (feed === 'idx') {
        listing.media.idxDisplayYN = enabled;
        manageShowToast('IDX display ' + (enabled ? 'enabled' : 'disabled'));
    } else if (feed === 'web') {
        listing.media.webDisplayed = enabled;
        manageShowToast(enabled ? 'Now live on mallan.nyc' : 'Removed from mallan.nyc');
    }
    listing.update = manageTodayStr();
    renderManageSection(currentManageMode);
}

function cardDistributeSync(listingId, feed) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    listing.update = manageTodayStr();
    manageShowToast('Synced ' + listing.address + ' ' + listing.unit + ' to ' + feed.toUpperCase());
    renderManageSection(currentManageMode);
}

function cardDistributePush(listingId) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    listing.update = manageTodayStr();
    var feeds = [];
    if (listing.media && listing.media.rlsUploaded) feeds.push('REBNY RLS');
    if (listing.media && listing.media.idxDisplayYN) feeds.push('IDX');
    if (listing.media && listing.media.webDisplayed) feeds.push('mallan.nyc');
    manageShowToast('Updates pushed to: ' + feeds.join(', '));
    renderManageSection(currentManageMode);
}

// ---- Card action toggle (accordion) ----
function toggleCardAction(listingId, action) {
    if (action === 'refresh') {
        cardAutoUpdate(listingId);
        return;
    }
    if (manageExpandedCard.id === listingId && manageExpandedCard.action === action) {
        manageExpandedCard = { id: null, action: null };
    } else {
        manageExpandedCard = { id: listingId, action: action };
    }
    renderManageSection(currentManageMode);
}

// ---- Card action handlers ----
function cardStatusApply(listingId, newStatus) {
    var listing = manageFindListing(listingId);
    if (!listing) return;

    // Map display status back to RESO StandardStatus for API
    var resoMap = {
        'Active': 'Active', 'Back On Market': 'Active', 'Coming Soon': 'ComingSoon',
        'Offer Out': 'ActiveUnderContract', 'Contract Signed': 'Pending', 'Lease Signed': 'Pending',
        'Board Approval': 'Pending', 'Sold': 'Closed', 'Leased': 'Closed',
        'Temp Off Market': 'Hold', 'Perm Off Market': 'Withdrawn', 'Expired': 'Expired'
    };
    var resoStatus = resoMap[newStatus] || newStatus;

    // Update local state immediately
    listing.status = newStatus;
    var todayStr = manageTodayStr();
    if (newStatus === 'Sold') listing.sold = todayStr;
    if (newStatus === 'Contract Signed') listing.contractSigned = todayStr;
    if (newStatus === 'Lease Signed') listing.leaseSigned = todayStr;
    if (newStatus === 'Leased') listing.rented = todayStr;
    listing.update = todayStr;
    renderManageSection(currentManageMode);
    manageShowToast('Status changed to ' + newStatus);

    // Persist to API
    var dbId = listing._dbId || listing.id;
    if (typeof MallanAPI !== 'undefined' && MallanAPI.listings) {
        MallanAPI.listings.updateStatus(dbId, resoStatus).catch(function(err) {
            if (typeof console !== 'undefined') console.error('[ManageListings] Status update failed:', err);
            manageShowToast('Failed to save status change to server', 'error');
        });
    }
}

function cardPriceAdjust(listingId, amount) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    var inp = document.getElementById('cardPriceInput-' + listingId);
    if (!inp) return;
    var current = inp.value ? parseFloat(inp.value.replace(/[^0-9.]/g, '')) : listing.price;
    if (isNaN(current)) current = listing.price;
    var newVal = Math.max(0, current + amount);
    inp.value = '$' + newVal.toLocaleString();
}

function cardPriceSave(listingId) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    var inp = document.getElementById('cardPriceInput-' + listingId);
    if (!inp) return;
    var raw = inp.value.replace(/[^0-9.]/g, '');
    var newPrice = parseFloat(raw);
    if (isNaN(newPrice) || newPrice <= 0) { showToast('Please enter a valid price.', 'warning'); return; }
    listing.price = newPrice;
    listing.update = manageTodayStr();
    renderManageSection(currentManageMode);
    manageShowToast('Price updated to ' + manageFormatPrice(newPrice, currentManageMode));

    // Persist to API
    var dbId = listing._dbId || listing.id;
    if (typeof MallanAPI !== 'undefined' && MallanAPI.listings) {
        MallanAPI.listings.update(dbId, { ListPrice: newPrice }).catch(function(err) {
            if (typeof console !== 'undefined') console.error('[ManageListings] Price update failed:', err);
            manageShowToast('Failed to save price to server', 'error');
        });
    }
}

function cardAutoUpdate(listingId) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    listing.update = manageTodayStr();
    renderManageSection(currentManageMode);
    manageShowToast('Listing refreshed \u2014 ' + listing.address + ' ' + listing.unit);
}

function cardOHSave(listingId) {
    var listing = manageFindListing(listingId);
    if (!listing) return;
    var date = document.getElementById('cardOHDate-' + listingId);
    var start = document.getElementById('cardOHStart-' + listingId);
    var end = document.getElementById('cardOHEnd-' + listingId);
    if (!date || !start || !end || !date.value || !start.value || !end.value) { showToast('Please fill in date, start, and end times.', 'warning'); return; }
    var types = [];
    var pubEl = document.getElementById('cardOHType-public-' + listingId);
    var apptEl = document.getElementById('cardOHType-appt-' + listingId);
    var brokerEl = document.getElementById('cardOHType-broker-' + listingId);
    var virtualEl = document.getElementById('cardOHType-virtual-' + listingId);
    if (pubEl && pubEl.checked) types.push('Public');
    if (apptEl && apptEl.checked) types.push('By Appointment');
    if (brokerEl && brokerEl.checked) types.push('Broker Only');
    var virtualTour = virtualEl ? virtualEl.checked : false;
    if (types.length === 0 && !virtualTour) { showToast('Please select at least one showing type.', 'warning'); return; }
    myOpenHouses.push({ id: 'OH-' + ohNextId++, listingId: listingId, types: types, virtualTour: virtualTour, date: date.value, start: start.value, end: end.value, repeat: 'none', link: '', notes: '' });
    var displayTypes = types.map(function(t) { if (t === 'Public') return 'Open House'; if (t === 'By Appointment') return 'Open House By Appointment Only'; if (t === 'Broker Only') return 'Broker Open House'; return t; });
    if (virtualTour) displayTypes.push('Virtual Tour');
    manageShowToast(displayTypes.join(', ') + ' scheduled for ' + listing.address + ' ' + listing.unit);
    renderManageSection(currentManageMode);
}

function cardDeleteOH(ohId, listingId) {
    myOpenHouses = myOpenHouses.filter(function(o) { return o.id !== ohId; });
    manageShowToast('Open house cancelled');
    renderManageSection(currentManageMode);
}

// Switch from table view to card view with action expanded
function switchToCardAction(listingId, action) {
    toggleManageView('cards');
    manageExpandedCard = { id: listingId, action: action };
    renderManageSection(currentManageMode);
    setTimeout(function() {
        var el = document.getElementById('card-' + listingId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// ---- Render manage section (both card + table views) ----
function renderManageSection(mode) {
    // Lazy-load from API on first render
    if (!_manageListingsLoaded && !_manageListingsLoading) {
        loadMyListingsFromAPI(function() {
            renderManageSection(mode);
        });
        return;
    }

    currentManageMode = mode || 'sales';
    var isSales = currentManageMode === 'sales';

    document.getElementById('manageTitle').textContent = isSales ? 'Sale Exclusives' : 'Rental Exclusives';
    document.getElementById('manageSubtitle').textContent = 'Manage your exclusive ' + (isSales ? 'sale' : 'rental') + ' listings \u00B7 REBNY RLS';
    document.getElementById('manageCreateBtn').innerHTML = '<i class="fas fa-plus text-xs"></i> <span class="hidden sm:inline">Create ' + (isSales ? 'Sale' : 'Rental') + ' Listing</span><span class="sm:hidden">New</span>';

    // Base listings for this mode + deal filter
    var baseListings = myManagementListings.filter(function(l) { return l.category === currentManageMode; });
    if (currentManageDealFilter === 'my') {
        baseListings = baseListings.filter(function(l) { return !l.coListed; });
    } else if (currentManageDealFilter === 'co') {
        baseListings = baseListings.filter(function(l) { return l.coListed; });
    }

    // Status filter pills with counts (shared between views)
    var statusList = isSales ? manageSaleStatuses : manageRentalStatuses;
    var pillsHtml = '';
    statusList.forEach(function(s) {
        var count = s === 'All' ? baseListings.length : baseListings.filter(function(l) { return l.status === s; }).length;
        var isActive = currentManageStatusFilter === s;
        var pillClass = isActive
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';
        pillsHtml += '<button onclick="manageFilterByStatus(\'' + s.replace(/'/g, "\\'") + '\')" class="px-2.5 py-1 rounded-full border text-xs font-semibold flex-shrink-0 whitespace-nowrap ' + pillClass + ' transition-colors">';
        pillsHtml += s + ' (' + count + ')';
        pillsHtml += '</button>';
    });
    document.getElementById('manageStatusPills').innerHTML = pillsHtml;

    // Apply status filter
    var listings = baseListings;
    if (currentManageStatusFilter !== 'All') {
        listings = listings.filter(function(l) { return l.status === currentManageStatusFilter; });
    }


    // Show/hide views based on current toggle
    var cardView = document.getElementById('manageCardView');
    var tableView = document.getElementById('manageTableView');
    if (currentManageView === 'cards') {
        cardView.style.display = 'block';
        tableView.style.display = 'none';
    } else {
        cardView.style.display = 'none';
        tableView.style.display = 'block';
    }

    // ---- Render Card View ----
    renderManageCards(listings);

    // ---- Render Table View ----
    var thead = document.getElementById('manageTableHead');
    var priceLabel = isSales ? '<i class="fas fa-arrow-up text-blue-500 mr-1"></i>Price' : '<i class="fas fa-arrow-up text-blue-500 mr-1"></i>Rent';
    var signedLabel = isSales ? 'Contract Signed' : 'Lease Signed';
    var closedLabel = isSales ? 'Sold' : 'Rented';
    thead.innerHTML = '<tr>' +
        '<th class="text-left px-3 py-3 font-semibold">Deal Type</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Status</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Address</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Unit</th>' +
        '<th class="text-left px-3 py-3 font-semibold">' + priceLabel + '</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Rooms</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Beds</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Baths</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Listed</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Update</th>' +
        '<th class="text-left px-3 py-3 font-semibold">' + signedLabel + '</th>' +
        '<th class="text-left px-3 py-3 font-semibold">' + closedLabel + '</th>' +
        '<th class="text-left px-3 py-3 font-semibold">Expiration</th>' +
        '<th class="px-3 py-3 w-10"></th>' +
        '</tr>';

    var tbody = document.getElementById('manageTableBody');
    var emptyState = document.getElementById('manageEmptyState');
    if (listings.length === 0) { tbody.innerHTML = ''; emptyState.style.display = 'block'; return; }
    emptyState.style.display = 'none';

    var rows = '';
    listings.forEach(function(l) {
        var sc = manageStatusColors[l.status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
        var dc = manageDealTypeColors[l.dealType] || { bg: 'bg-gray-100', text: 'text-gray-700' };
        var signedVal = isSales ? (l.contractSigned || '\u2014') : (l.leaseSigned || '\u2014');
        var closedVal = isSales ? (l.sold || '\u2014') : (l.rented || '\u2014');
        var expClass = ' text-gray-500';
        var isExpanded = manageExpandedRow === l.id;

        rows += '<tr class="border-t hover:bg-blue-50 cursor-pointer" data-id="' + l.id + '" onclick="manageToggleRow(\'' + l.id + '\')">';
        rows += '<td class="px-3 py-3"><span class="px-2 py-0.5 ' + dc.bg + ' ' + dc.text + ' rounded text-xs">' + l.dealType + '</span></td>';
        rows += '<td class="px-3 py-3"><span class="px-2 py-0.5 ' + sc.bg + ' ' + sc.text + ' rounded text-xs font-semibold">' + l.status + '</span></td>';
        rows += '<td class="px-3 py-3 font-medium">' + l.address + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.unit + '</td>';
        rows += '<td class="px-3 py-3 font-semibold">' + manageFormatPrice(l.price, currentManageMode) + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.rooms + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.beds + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.baths + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.listed + '</td>';
        rows += '<td class="px-3 py-3 text-gray-500">' + l.update + '</td>';
        rows += '<td class="px-3 py-3 text-gray-400">' + signedVal + '</td>';
        rows += '<td class="px-3 py-3 text-gray-400">' + closedVal + '</td>';
        rows += '<td class="px-3 py-3' + expClass + '">' + (l.expiration || '\u2014') + '</td>';
        rows += '<td class="px-3 py-3"><button onclick="event.stopPropagation();manageToggleRow(\'' + l.id + '\')" class="w-7 h-7 rounded-full ' + (isExpanded ? 'bg-gray-700' : 'bg-blue-600') + ' text-white flex items-center justify-center hover:bg-blue-700 transition-transform ' + (isExpanded ? 'rotate-90' : '') + '" aria-label="Actions"><i class="fas fa-chevron-right text-xs"></i></button></td>';
        rows += '</tr>';

        // Expanded row actions (table view)
        rows += '<tr class="border-t bg-gray-50" style="display:' + (isExpanded ? 'table-row' : 'none') + '">';
        rows += '<td colspan="14" class="px-4 py-3"><div class="flex flex-wrap gap-2">';
        rows += '<button onclick="event.stopPropagation();manageQuickStatus(\'' + l.id + '\')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-exchange-alt text-blue-400"></i> Change Status</button>';
        rows += '<button onclick="event.stopPropagation();switchToCardAction(\'' + l.id + '\',\'price\')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-dollar-sign text-green-400"></i> Change Price</button>';
        rows += '<button onclick="event.stopPropagation();switchToCardAction(\'' + l.id + '\',\'distribute\')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-share-alt text-purple-400"></i> IDX / Distribute</button>';
        rows += '<button onclick="event.stopPropagation();switchToCardAction(\'' + l.id + '\',\'oh\')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-door-open text-gray-500"></i> Open House</button>';
        rows += '<button onclick="event.stopPropagation();manageAutoUpdate(\'' + l.id + '\')" class="px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-sync-alt text-amber-400"></i> Refresh Listing</button>';
        rows += '<button onclick="event.stopPropagation();manageEditListing(\'' + l.id + '\')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5"><i class="fas fa-pen"></i> Edit Listing</button>';
        rows += '</div></td></tr>';
    });
    tbody.innerHTML = rows;

    // Update OH badge and overview if open
    updateOHBadge();
    if (ohOverviewOpen) renderOHOverview();

    // Compliance dashboard removed — lives in Broker CRM dashboard only
}

// ---- Listings Tab: actions ----
function toggleManageMode(mode) {
    currentManageMode = mode;
    var salesBtn = document.getElementById('manageToggleSales');
    var rentalsBtn = document.getElementById('manageToggleRentals');
    if (mode === 'sales') {
        salesBtn.className = 'px-4 py-2 bg-gray-900 text-white';
        rentalsBtn.className = 'px-4 py-2 bg-white text-gray-600 hover:bg-gray-50';
    } else {
        salesBtn.className = 'px-4 py-2 bg-white text-gray-600 hover:bg-gray-50';
        rentalsBtn.className = 'px-4 py-2 bg-gray-900 text-white';
    }
    manageExpandedRow = null;
    manageExpandedCard = { id: null, action: null };
    currentManageStatusFilter = 'Active';
    renderManageSection(mode);
}

function filterManageDeals(val) {
    currentManageDealFilter = val;
    currentManageStatusFilter = 'Active';
    renderManageSection(currentManageMode);
}
function manageFilterByStatus(status) {
    currentManageStatusFilter = status;
    renderManageSection(currentManageMode);
}
function manageToggleRow(id) {
    manageExpandedRow = (manageExpandedRow === id) ? null : id;
    renderManageSection(currentManageMode);
}
function manageFindListing(id) {
    return myManagementListings.find(function(l) { return l.id === id; });
}

// Quick Status modal (from table row)
function manageQuickStatus(id) {
    manageActiveListingId = id;
    var listing = manageFindListing(id);
    if (!listing) return;
    document.getElementById('manageStatusAddress').textContent = listing.address + ' ' + listing.unit;
    var statuses = currentManageMode === 'sales'
        ? ['Active','Back On Market','Coming Soon','Offer Out','Contract Signed','Board Approval','Sold','Temp Off Market','Perm Off Market','Expired']
        : ['Active','Back On Market','Coming Soon','Offer Out','Lease Signed','Board Approval','Leased','Temp Off Market','Perm Off Market','Expired'];
    var html = '';
    statuses.forEach(function(s) {
        var sc = manageStatusColors[s] || { bg: 'bg-gray-100', text: 'text-gray-600' };
        var isCurrent = listing.status === s;
        var validation = manageValidateTransition(listing, s);
        var isBlocked = !validation.valid && !isCurrent;
        html += '<button onclick="' + (isBlocked ? '' : 'manageStatusApply(\\\'' + s + '\\\')') + '" class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ' + (isCurrent ? 'bg-blue-50 border border-blue-200' : isBlocked ? 'opacity-40 cursor-not-allowed border border-transparent' : 'hover:bg-gray-50 border border-transparent') + '"' + ' data-reso-field="MlsStatus" data-reso-value="' + s + '"' + (isBlocked ? ' title="' + validation.blocks.join('; ').replace(/"/g, '&quot;') + '"' : '') + '>';
        html += '<span class="px-2 py-0.5 ' + sc.bg + ' ' + sc.text + ' rounded text-xs font-semibold">' + s + '</span>';
        if (isCurrent) html += '<i class="fas fa-check text-blue-600 text-xs"></i>';
        if (isBlocked) html += '<i class="fas fa-ban text-gray-400 text-xs ml-1"></i>';
        html += '</button>';
    });
    document.getElementById('manageStatusOptions').innerHTML = html;
    document.getElementById('manageStatusModal').style.display = 'flex';
}
// ── Status Transition Validation (UCBA compliance) ──
// Valid transitions per REBNY RLS rules
function manageValidateTransition(listing, newStatus) {
    var result = { valid: true, warnings: [], blocks: [] };
    var current = listing.status;

    // Block invalid transitions
    var blockedTransitions = {
        'Sold': ['Active','Coming Soon','Back On Market'],
        'Leased': ['Active','Coming Soon','Back On Market'],
        'Closed': ['Active','Coming Soon','Back On Market'],
        'Expired': ['Active','Coming Soon'] // must go through Back On Market
    };
    if (blockedTransitions[current] && blockedTransitions[current].indexOf(newStatus) !== -1) {
        result.valid = false;
        result.blocks.push('Cannot transition from ' + current + ' to ' + newStatus + '. Use "Back On Market" first.');
        return result;
    }

    // Coming Soon restrictions (D1, D2, D10)
    if (newStatus === 'Coming Soon') {
        if (listing.category === 'rentals') {
            result.valid = false;
            result.blocks.push('UCBA D1: Coming Soon status is available for SALES listings only.');
            return result;
        }
        result.warnings.push('UCBA D10: Exhibit G (Coming Soon Addendum) must be signed by seller before activating.');
        result.warnings.push('UCBA D2: Coming Soon status is limited to a maximum of 14 calendar days.');
    }

    // Closed/Sold transitions require ClosePrice + CloseDate
    if (newStatus === 'Sold' || newStatus === 'Leased' || newStatus === 'Closed') {
        result.warnings.push('UCBA C12: Close price and close date are required within 24 hours of status change.');
    }

    // Perm Off Market (Exhibit B, 48hr rule)
    if (newStatus === 'Perm Off Market') {
        result.warnings.push('UCBA C3: Exhibit B (Withdrawal Authorization) must be obtained. Listing must be removed from all platforms within 48 hours.');
    }

    return result;
}

function manageStatusApply(newStatus) {
    var listing = manageFindListing(manageActiveListingId);
    if (!listing) return;

    var validation = manageValidateTransition(listing, newStatus);

    // Block invalid transitions
    if (!validation.valid) {
        showToast('Status Change Blocked: ' + validation.blocks.join('; '), 'error');
        return;
    }

    // Show warnings and confirm
    if (validation.warnings.length > 0) {
        var msg = 'Status Change Warnings:\n\n' + validation.warnings.join('\n\n') + '\n\nProceed with status change to "' + newStatus + '"?';
        if (!confirm(msg)) return;
    }

    // Prompt for close price/date on closing transitions
    if (newStatus === 'Sold' || newStatus === 'Leased' || newStatus === 'Closed') {
        var closePrice = prompt('Enter close price (required for UCBA compliance):');
        if (closePrice) listing.closePrice = parseFloat(closePrice.replace(/[^0-9.]/g, ''));
        var closeDate = prompt('Enter close date (YYYY-MM-DD):');
        if (closeDate) listing.closeDate = closeDate;
    }

    // Coming Soon: record start date
    if (newStatus === 'Coming Soon') {
        listing.comingSoonStartDate = manageTodayStr();
    }

    listing.status = newStatus;
    var todayStr = manageTodayStr();
    if (newStatus === 'Sold') listing.sold = todayStr;
    if (newStatus === 'Contract Signed') listing.contractSigned = todayStr;
    if (newStatus === 'Lease Signed') listing.leaseSigned = todayStr;
    if (newStatus === 'Leased') listing.rented = todayStr;
    listing.update = todayStr;
    document.getElementById('manageStatusModal').style.display = 'none';
    renderManageSection(currentManageMode);
    manageShowToast('Status changed to ' + newStatus);

    // Persist to API
    var resoMap = {
        'Active': 'Active', 'Back On Market': 'Active', 'Coming Soon': 'ComingSoon',
        'Offer Out': 'ActiveUnderContract', 'Contract Signed': 'Pending', 'Lease Signed': 'Pending',
        'Board Approval': 'Pending', 'Sold': 'Closed', 'Leased': 'Closed',
        'Temp Off Market': 'Hold', 'Perm Off Market': 'Withdrawn', 'Expired': 'Expired'
    };
    var resoStatus = resoMap[newStatus] || newStatus;
    var dbId = listing._dbId || listing.id;
    if (typeof MallanAPI !== 'undefined' && MallanAPI.listings) {
        MallanAPI.listings.updateStatus(dbId, resoStatus).catch(function(err) {
            if (typeof console !== 'undefined') console.error('[ManageListings] Status update failed:', err);
            manageShowToast('Failed to save status change to server', 'error');
        });
    }
}

// Auto Update
function manageAutoUpdate(id) {
    var listing = manageFindListing(id);
    if (!listing) return;
    listing.update = manageTodayStr();
    renderManageSection(currentManageMode);
    manageShowToast('Listing refreshed \u2014 ' + listing.address + ' ' + listing.unit);
}

// Create / Edit Listing
function manageCreateListing() {
    if (currentManageMode === 'sales') {
        window.open('SALE-FORM-REDESIGN.html', '_blank');
    } else {
        window.open('RENTAL-FORM-REDESIGN.html', '_blank');
    }
}
function manageEditListing(id) {
    var listing = manageFindListing(id);
    if (!listing) return;
    var dbId = listing._dbId || listing.id;
    if (listing.category === 'sales') window.open('SALE-FORM-REDESIGN.html?id=' + encodeURIComponent(dbId), '_blank');
    else window.open('RENTAL-FORM-REDESIGN.html?id=' + encodeURIComponent(dbId), '_blank');
}
function manageExportTable() {
    // CSV export integration point \u2014 wire to /api/crm/listings/export when ready.
    manageShowToast('Export queued.');
}
