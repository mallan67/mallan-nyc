/**
 * Portal Manager — Dynamic renderer for all 4 client portal types
 *
 * Replaces hardcoded mock data in CRM portal tabs with live API data.
 * Each portal type (buyer, tenant, seller, landlord) has an init function
 * that fetches data and renders the appropriate dashboard.
 *
 * Design: Uses same Tailwind card patterns as original mockup.
 * Data: All from MallanAPI → /api/crm/ and /api/portal/ endpoints.
 *
 * COMPLIANCE:
 * - Buyer/Tenant portals: listing agent name masked (shows brokerage only)
 * - REBNY RLS attribution on all listing displays
 * - No compensation amounts displayed
 * - Fair Housing compliant language
 */
/* global MallanAPI, showToast */

// ─── State ────────────────────────────────────────────────

var _portalState = {
  buyerLoaded: false,
  tenantLoaded: false,
  sellerLoaded: false,
  landlordLoaded: false,
  currentClient: null
};

// ─── Shared Helpers ───────────────────────────────────────

function _pFmt(n) {
  if (!n && n !== 0) return '--';
  return '$' + Number(n).toLocaleString();
}

function _pDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function _pInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0,2);
}

function _pStatusBadge(status, color) {
  var colors = {
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    teal: 'bg-teal-100 text-teal-700',
    purple: 'bg-purple-100 text-purple-700'
  };
  return '<span class="px-2.5 py-1 ' + (colors[color] || colors.gray) + ' text-xs rounded-full font-semibold">' + (status || '--') + '</span>';
}

function _pLoading(msg) {
  return '<div class="flex items-center justify-center py-20 text-gray-400">' +
    '<i class="fas fa-spinner fa-spin text-2xl mr-3"></i>' +
    '<span class="text-sm">' + (msg || 'Loading...') + '</span></div>';
}

function _pEmpty(icon, title, subtitle) {
  return '<div class="flex flex-col items-center justify-center py-16 text-gray-400">' +
    '<i class="' + icon + ' text-4xl mb-3"></i>' +
    '<p class="font-semibold text-gray-500">' + title + '</p>' +
    (subtitle ? '<p class="text-sm mt-1">' + subtitle + '</p>' : '') +
    '</div>';
}

function _pStatCard(icon, iconBg, value, label) {
  return '<div class="bg-white rounded-xl shadow-sm border p-4">' +
    '<div class="flex items-center gap-3">' +
      '<div class="w-10 h-10 ' + iconBg + ' rounded-lg flex items-center justify-center">' +
        '<i class="' + icon + '"></i>' +
      '</div>' +
      '<div>' +
        '<p class="text-2xl font-bold">' + (value != null ? value : '--') + '</p>' +
        '<p class="text-xs text-gray-500">' + label + '</p>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _pListingAddress(l) {
  if (!l) return 'Address Unavailable';
  var addr = l.address || l.property_address || '';
  if (typeof addr === 'object') {
    return ((addr.StreetNumber || '') + ' ' + (addr.StreetName || '') + (addr.UnitNumber ? ' #' + addr.UnitNumber : '')).trim() || 'Address Unavailable';
  }
  return addr || 'Address Unavailable';
}

function _pRebnyDisclaimer() {
  return '<p class="text-[10px] text-gray-400 mt-6 leading-relaxed">' +
    'Listing data courtesy of the REBNY Residential Listing Service (RLS). ' +
    'Broker commissions are not set by law and are fully negotiable. Equal Housing Opportunity.</p>';
}

// ─── BUYER PORTAL ─────────────────────────────────────────

async function initBuyerPortal(clientId) {
  var c = document.getElementById('client-portal');
  if (!c) return;
  c.innerHTML = _pLoading('Loading buyer dashboard...');

  try {
    var data = {};
    // Fetch all data in parallel
    var promises = [
      MallanAPI._fetch('/api/portal/listings').then(function(r) { data.listings = r; }),
      MallanAPI._fetch('/api/portal/showings').then(function(r) { data.showings = r; }),
      MallanAPI._fetch('/api/portal/family').then(function(r) { data.family = r; }),
      MallanAPI._fetch('/api/portal/preferences').then(function(r) { data.prefs = r; }),
      MallanAPI._fetch('/api/portal/documents').then(function(r) { data.docs = r; })
    ];
    await Promise.allSettled(promises);

    var listings = (data.listings && data.listings.listings) || [];
    var showings = (data.showings && data.showings.showings) || [];
    var family = (data.family && data.family.members) || [];
    var prefs = (data.prefs && data.prefs.preferences) || null;
    var docs = (data.docs && data.docs.documents) || [];

    var liked = listings.filter(function(l) { return l.reactions && l.reactions.indexOf('liked') >= 0; });
    var upcoming = showings.filter(function(s) { return s.status === 'confirmed' || s.status === 'requested'; });

    c.innerHTML = _renderBuyerPortal(listings, showings, family, prefs, docs, liked, upcoming);
    _portalState.buyerLoaded = true;
  } catch (e) {
    c.innerHTML = '<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Failed to load buyer portal.</div>';
    console.error('[portal-manager] Buyer portal error:', e);
  }
}

function _renderBuyerPortal(listings, showings, family, prefs, docs, liked, upcoming) {
  var html = '';

  // Header
  html += '<div class="mb-6">';
  html += '<div class="flex items-center justify-between flex-wrap gap-3">';
  html += '<div>';
  html += '<h2 class="text-2xl font-bold text-gray-900">Buyer Portal</h2>';
  html += '<p class="text-gray-600">Manage your buyer clients\' property search</p>';
  html += '</div>';
  html += '<span class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">';
  html += '<i class="fas fa-user mr-2"></i> Buyer Portal</span>';
  html += '</div>';

  // Family members
  if (family.length > 0) {
    html += '<div class="mt-3 flex items-center gap-3 text-sm text-gray-600 flex-wrap">';
    html += '<span class="font-medium text-gray-500">Shared With:</span>';
    family.forEach(function(f) {
      html += '<div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">';
      html += '<div class="w-6 h-6 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold">' + _pInitials(f.name) + '</div>';
      html += '<span>' + (f.name || 'Family Member') + ' — <span class="text-gray-400">' + (f.relationship || '') + '</span></span>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Stats
  html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">';
  html += _pStatCard('fas fa-heart text-blue-600', 'bg-blue-100', liked.length, 'Saved Listings');
  html += _pStatCard('fas fa-search text-green-600', 'bg-green-100', prefs ? '1' : '0', 'Saved Searches');
  html += _pStatCard('fas fa-calendar text-purple-600', 'bg-purple-100', upcoming.length, 'Upcoming Tours');
  html += _pStatCard('fas fa-file-alt text-orange-600', 'bg-orange-100', docs.length, 'Documents');
  html += '</div>';

  // Preferences summary
  if (prefs) {
    html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
    html += '<h3 class="font-semibold mb-3"><i class="fas fa-sliders-h mr-2 text-blue-600"></i>Search Preferences</h3>';
    html += '<div class="flex flex-wrap gap-2">';
    if (prefs.neighborhoods && prefs.neighborhoods.length) {
      prefs.neighborhoods.forEach(function(n) {
        html += '<span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">' + n + '</span>';
      });
    }
    if (prefs.property_types && prefs.property_types.length) {
      prefs.property_types.forEach(function(t) {
        html += '<span class="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">' + t + '</span>';
      });
    }
    if (prefs.min_price || prefs.max_price) {
      html += '<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">' +
        _pFmt(prefs.min_price) + ' – ' + _pFmt(prefs.max_price) + '</span>';
    }
    if (prefs.min_beds) {
      html += '<span class="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">' + prefs.min_beds + '+ beds</span>';
    }
    html += '</div></div>';
  }

  // Listings
  html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<div class="flex items-center justify-between mb-4">';
  html += '<h3 class="font-semibold"><i class="fas fa-home mr-2 text-blue-600"></i>Properties (' + listings.length + ')</h3>';
  html += '</div>';

  if (listings.length === 0) {
    html += _pEmpty('fas fa-home', 'No listings yet', 'Share listings with this client from your search');
  } else {
    html += '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">';
    listings.forEach(function(l) {
      html += _renderListingCard(l, 'sale');
    });
    html += '</div>';
  }
  html += '</div>';

  // Showings
  html += _renderShowingsSection(showings, 'blue');

  // Documents
  html += _renderDocumentsSection(docs, 'blue');

  html += _pRebnyDisclaimer();
  return html;
}

// ─── TENANT PORTAL ────────────────────────────────────────

async function initTenantPortal(clientId) {
  var c = document.getElementById('tenant-portal');
  if (!c) return;
  c.innerHTML = _pLoading('Loading tenant dashboard...');

  try {
    var data = {};
    var promises = [
      MallanAPI._fetch('/api/portal/listings').then(function(r) { data.listings = r; }),
      MallanAPI._fetch('/api/portal/showings').then(function(r) { data.showings = r; }),
      MallanAPI._fetch('/api/portal/family').then(function(r) { data.family = r; }),
      MallanAPI._fetch('/api/portal/preferences').then(function(r) { data.prefs = r; }),
      MallanAPI._fetch('/api/portal/documents').then(function(r) { data.docs = r; })
    ];
    await Promise.allSettled(promises);

    var listings = (data.listings && data.listings.listings) || [];
    var showings = (data.showings && data.showings.showings) || [];
    var family = (data.family && data.family.members) || [];
    var prefs = (data.prefs && data.prefs.preferences) || null;
    var docs = (data.docs && data.docs.documents) || [];
    var saved = listings.filter(function(l) { return l.reactions && l.reactions.indexOf('liked') >= 0; });
    var upcoming = showings.filter(function(s) { return s.status === 'confirmed' || s.status === 'requested'; });

    var c2 = document.getElementById('tenant-portal');
    c2.innerHTML = _renderTenantPortal(listings, showings, family, prefs, docs, saved, upcoming);
    _portalState.tenantLoaded = true;
  } catch (e) {
    document.getElementById('tenant-portal').innerHTML = '<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Failed to load tenant portal.</div>';
  }
}

function _renderTenantPortal(listings, showings, family, prefs, docs, saved, upcoming) {
  var html = '';

  // Header
  html += '<div class="mb-6">';
  html += '<div class="flex items-center justify-between flex-wrap gap-3">';
  html += '<div><h2 class="text-2xl font-bold text-gray-900">Tenant Portal</h2>';
  html += '<p class="text-gray-600">Manage your renter clients\' property search</p></div>';
  html += '<span class="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold">';
  html += '<i class="fas fa-key mr-2"></i> Tenant Portal</span>';
  html += '</div>';

  if (family.length > 0) {
    html += '<div class="mt-3 flex items-center gap-3 text-sm text-gray-600 flex-wrap">';
    html += '<span class="font-medium text-gray-500">Shared With:</span>';
    family.forEach(function(f) {
      html += '<div class="flex items-center gap-2 px-3 py-1.5 bg-teal-50 rounded-full">';
      html += '<div class="w-6 h-6 bg-teal-200 text-teal-700 rounded-full flex items-center justify-center text-[10px] font-bold">' + _pInitials(f.name) + '</div>';
      html += '<span>' + (f.name || 'Co-Tenant') + ' — <span class="text-gray-400">' + (f.relationship || '') + '</span></span>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Stats
  html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">';
  html += _pStatCard('fas fa-heart text-teal-600', 'bg-teal-100', saved.length, 'Saved Rentals');
  html += _pStatCard('fas fa-file-alt text-green-600', 'bg-green-100', docs.length, 'Applications');
  html += _pStatCard('fas fa-calendar text-purple-600', 'bg-purple-100', upcoming.length, 'Upcoming Tours');
  html += _pStatCard('fas fa-search text-orange-600', 'bg-orange-100', prefs ? '1' : '0', 'Saved Searches');
  html += '</div>';

  // Preferences
  if (prefs) {
    html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
    html += '<h3 class="font-semibold mb-3"><i class="fas fa-sliders-h mr-2 text-teal-600"></i>Search Preferences</h3>';
    html += '<div class="flex flex-wrap gap-2">';
    if (prefs.neighborhoods && prefs.neighborhoods.length) {
      prefs.neighborhoods.forEach(function(n) {
        html += '<span class="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">' + n + '</span>';
      });
    }
    if (prefs.min_price || prefs.max_price) {
      html += '<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">' +
        _pFmt(prefs.min_price) + ' – ' + _pFmt(prefs.max_price) + '/mo</span>';
    }
    html += '</div></div>';
  }

  // Listings
  html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<h3 class="font-semibold mb-4"><i class="fas fa-building mr-2 text-teal-600"></i>Rental Listings (' + listings.length + ')</h3>';
  if (listings.length === 0) {
    html += _pEmpty('fas fa-building', 'No rentals yet', 'Share rental listings with this client from your search');
  } else {
    html += '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">';
    listings.forEach(function(l) { html += _renderListingCard(l, 'rent'); });
    html += '</div>';
  }
  html += '</div>';

  html += _renderShowingsSection(showings, 'teal');
  html += _renderDocumentsSection(docs, 'teal');
  html += _pRebnyDisclaimer();
  return html;
}

// ─── SELLER PORTAL ────────────────────────────────────────

async function initSellerPortal(clientId) {
  var c = document.getElementById('seller-portal');
  if (!c) return;
  c.innerHTML = _pLoading('Loading seller dashboard...');

  try {
    var data = {};
    var promises = [
      MallanAPI._fetch('/api/portal/listings').then(function(r) { data.listings = r; }),
      MallanAPI._fetch('/api/portal/showings').then(function(r) { data.showings = r; }),
      MallanAPI._fetch('/api/portal/documents').then(function(r) { data.docs = r; }),
      MallanAPI._fetch('/api/portal/offers').then(function(r) { data.offers = r; }),
      MallanAPI._fetch('/api/portal/family').then(function(r) { data.family = r; })
    ];
    await Promise.allSettled(promises);

    var listings = (data.listings && data.listings.listings) || [];
    var showings = (data.showings && data.showings.showings) || [];
    var docs = (data.docs && data.docs.documents) || [];
    var offers = (data.offers && data.offers.offers) || [];
    var family = (data.family && data.family.members) || [];

    c.innerHTML = _renderSellerPortal(listings, showings, docs, offers, family);
    _portalState.sellerLoaded = true;
  } catch (e) {
    c.innerHTML = '<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Failed to load seller portal.</div>';
  }
}

function _renderSellerPortal(listings, showings, docs, offers, family) {
  var html = '';

  // Header
  html += '<div class="mb-6">';
  html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">';
  html += '<div><h2 class="text-2xl font-bold text-gray-900">Seller Dashboard</h2>';
  html += '<p class="text-gray-600">Track listing performance and manage the sale</p></div>';
  html += '<div class="flex items-center gap-3">';
  html += '<button onclick="alert(\'Report download coming soon\')" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"><i class="fas fa-download mr-2"></i>Download Report</button>';
  html += '<span class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold"><i class="fas fa-home mr-2"></i>Seller Portal</span>';
  html += '</div></div></div>';

  // Property card(s)
  if (listings.length === 0) {
    html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
    html += _pEmpty('fas fa-home', 'No listings linked', 'Link a listing to this seller client to see their dashboard');
    html += '</div>';
  } else {
    listings.forEach(function(listing) {
      html += _renderSellerPropertyCard(listing);
    });
  }

  // Showings report
  html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<div class="flex items-center justify-between mb-4">';
  html += '<h3 class="font-semibold"><i class="fas fa-calendar-check mr-2 text-green-600"></i>Showings Report (' + showings.length + ')</h3>';
  html += '</div>';

  if (showings.length === 0) {
    html += _pEmpty('fas fa-calendar', 'No showings yet', 'Showings will appear here once scheduled');
  } else {
    html += '<div class="overflow-x-auto"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50"><tr>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Feedback</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Interest</th>';
    html += '</tr></thead><tbody class="divide-y">';

    showings.forEach(function(s) {
      var interestColor = { very_interested: 'green', interested: 'blue', neutral: 'gray', not_interested: 'red' };
      var ic = interestColor[s.interest_level] || 'gray';
      html += '<tr class="hover:bg-gray-50">';
      html += '<td class="px-4 py-3">' + _pDate(s.date) + (s.time ? ' ' + s.time : '') + '</td>';
      html += '<td class="px-4 py-3">' + _pStatusBadge(s.type || 'private', s.type === 'openhouse' ? 'purple' : 'blue') + '</td>';
      html += '<td class="px-4 py-3">' + _pStatusBadge(s.status, s.status === 'completed' ? 'green' : s.status === 'confirmed' ? 'blue' : 'orange') + '</td>';
      html += '<td class="px-4 py-3 text-xs text-gray-600">' + (s.feedback_notes || '--') + '</td>';
      html += '<td class="px-4 py-3">' + (s.interest_level ? _pStatusBadge(s.interest_level.replace('_', ' '), ic) : '--') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // Offers
  html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<h3 class="font-semibold mb-4"><i class="fas fa-gavel mr-2 text-green-600"></i>Offers (' + offers.length + ')</h3>';
  if (offers.length === 0) {
    html += _pEmpty('fas fa-gavel', 'No offers yet', 'Offers will appear here when submitted');
  } else {
    html += '<div class="overflow-x-auto"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50"><tr>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Buyer</th>';
    html += '<th class="px-4 py-2 text-right text-xs font-semibold text-gray-600">Amount</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Financing</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>';
    html += '</tr></thead><tbody class="divide-y">';
    offers.forEach(function(o) {
      html += '<tr class="hover:bg-gray-50">';
      html += '<td class="px-4 py-3 font-medium">' + (o.buyer_name || 'Anonymous') + '</td>';
      html += '<td class="px-4 py-3 text-right font-bold">' + _pFmt(o.amount) + '</td>';
      html += '<td class="px-4 py-3">' + (o.financing_type || '--') + '</td>';
      html += '<td class="px-4 py-3">' + _pDate(o.created_at) + '</td>';
      html += '<td class="px-4 py-3">' + _pStatusBadge(o.status, o.status === 'accepted' ? 'green' : o.status === 'rejected' ? 'red' : 'orange') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += _renderDocumentsSection(docs, 'green');
  html += _pRebnyDisclaimer();
  return html;
}

function _renderSellerPropertyCard(listing) {
  var addr = _pListingAddress(listing);
  var status = listing.status || listing.StandardStatus || 'Active';
  var statusColor = status === 'Active' ? 'green' : status === 'Pending' ? 'orange' : status === 'Closed' ? 'gray' : 'blue';
  var price = listing.list_price || listing.ListPrice || 0;
  var dom = listing.days_on_market || listing.DaysOnMarket || listing.CumulativeDaysOnMarket || 0;
  var beds = listing.bedrooms_total || listing.BedroomsTotal || '--';
  var baths = listing.bathrooms_full || listing.BathroomsFull || '--';
  var sqft = listing.living_area || listing.LivingArea || null;
  var neighborhood = listing.neighborhood || listing.MLSAreaMajor || '--';
  var propType = listing.property_type || listing.PropertySubType || '--';

  var html = '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<div class="flex flex-col sm:flex-row gap-6">';

  // Image placeholder
  html += '<div class="w-full sm:w-64 h-48 bg-gray-100 rounded-lg flex items-center justify-center">';
  html += '<i class="fas fa-home text-4xl text-gray-300"></i></div>';

  html += '<div class="flex-1">';
  html += '<div class="flex items-start justify-between">';
  html += '<div>';
  html += '<h3 class="text-xl font-bold">' + addr + '</h3>';
  html += '<p class="text-gray-600">' + neighborhood + '</p>';
  html += '</div>';
  html += _pStatusBadge(status, statusColor);
  html += '</div>';

  html += '<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">';
  html += '<div><p class="text-sm text-gray-500">Asking Price</p><p class="text-xl font-bold text-green-600">' + _pFmt(price) + '</p></div>';
  html += '<div><p class="text-sm text-gray-500">Days on Market</p><p class="text-xl font-bold">' + dom + '</p></div>';
  html += '<div><p class="text-sm text-gray-500">Type</p><p class="text-sm font-semibold">' + propType + '</p></div>';
  html += '<div><p class="text-sm text-gray-500">Size</p><p class="text-sm font-semibold">' + beds + ' BR / ' + baths + ' BA' + (sqft ? ' · ' + Number(sqft).toLocaleString() + ' SF' : '') + '</p></div>';
  html += '</div>';

  html += '</div></div></div>';
  return html;
}

// ─── LANDLORD PORTAL ──────────────────────────────────────

async function initLandlordPortal(clientId) {
  var c = document.getElementById('landlord-portal');
  if (!c) return;
  c.innerHTML = _pLoading('Loading landlord dashboard...');

  try {
    var data = {};
    var promises = [
      MallanAPI._fetch('/api/portal/listings').then(function(r) { data.listings = r; }),
      MallanAPI._fetch('/api/portal/showings').then(function(r) { data.showings = r; }),
      MallanAPI._fetch('/api/portal/documents').then(function(r) { data.docs = r; }),
      MallanAPI._fetch('/api/portal/family').then(function(r) { data.family = r; })
    ];
    await Promise.allSettled(promises);

    var listings = (data.listings && data.listings.listings) || [];
    var showings = (data.showings && data.showings.showings) || [];
    var docs = (data.docs && data.docs.documents) || [];
    var family = (data.family && data.family.members) || [];

    c.innerHTML = _renderLandlordPortal(listings, showings, docs, family);
    _portalState.landlordLoaded = true;
  } catch (e) {
    c.innerHTML = '<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Failed to load landlord portal.</div>';
  }
}

function _renderLandlordPortal(listings, showings, docs, family) {
  var html = '';

  // Header
  html += '<div class="mb-6">';
  html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">';
  html += '<div><h2 class="text-2xl font-bold text-gray-900">Landlord Dashboard</h2>';
  html += '<p class="text-gray-600">Manage rental properties and tenants</p></div>';
  html += '<div class="flex items-center gap-3">';
  html += '<button onclick="alert(\'Report download coming soon\')" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"><i class="fas fa-download mr-2"></i>Download Report</button>';
  html += '<span class="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold"><i class="fas fa-key mr-2"></i>Landlord Portal</span>';
  html += '</div></div></div>';

  // Property cards
  if (listings.length === 0) {
    html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
    html += _pEmpty('fas fa-building', 'No rental properties linked', 'Link a rental listing to this landlord to see their dashboard');
    html += '</div>';
  } else {
    listings.forEach(function(listing) {
      html += _renderLandlordPropertyCard(listing);
    });
  }

  // Showings / Inquiries
  html += '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<h3 class="font-semibold mb-4"><i class="fas fa-calendar-check mr-2 text-teal-600"></i>Showings & Inquiries (' + showings.length + ')</h3>';
  if (showings.length === 0) {
    html += _pEmpty('fas fa-calendar', 'No showings yet', 'Tenant inquiries and showings will appear here');
  } else {
    html += '<div class="overflow-x-auto"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50"><tr>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>';
    html += '<th class="px-4 py-2 text-left text-xs font-semibold text-gray-600">Notes</th>';
    html += '</tr></thead><tbody class="divide-y">';
    showings.forEach(function(s) {
      html += '<tr class="hover:bg-gray-50">';
      html += '<td class="px-4 py-3">' + _pDate(s.date) + '</td>';
      html += '<td class="px-4 py-3">' + _pStatusBadge(s.type || 'private', 'teal') + '</td>';
      html += '<td class="px-4 py-3">' + _pStatusBadge(s.status, s.status === 'completed' ? 'green' : 'blue') + '</td>';
      html += '<td class="px-4 py-3 text-xs text-gray-600">' + (s.notes || '--') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += _renderDocumentsSection(docs, 'teal');
  html += _pRebnyDisclaimer();
  return html;
}

function _renderLandlordPropertyCard(listing) {
  var addr = _pListingAddress(listing);
  var status = listing.status || 'Active';
  var price = listing.list_price || listing.ListPrice || 0;
  var dom = listing.days_on_market || listing.DaysOnMarket || 0;
  var beds = listing.bedrooms_total || listing.BedroomsTotal || '--';
  var baths = listing.bathrooms_full || listing.BathroomsFull || '--';
  var sqft = listing.living_area || listing.LivingArea || null;
  var neighborhood = listing.neighborhood || listing.MLSAreaMajor || '--';

  var html = '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<div class="flex flex-col sm:flex-row gap-6">';
  html += '<div class="w-full sm:w-64 h-48 bg-gray-100 rounded-lg flex items-center justify-center">';
  html += '<i class="fas fa-building text-4xl text-gray-300"></i></div>';
  html += '<div class="flex-1">';
  html += '<div class="flex items-start justify-between">';
  html += '<div><h3 class="text-xl font-bold">' + addr + '</h3>';
  html += '<p class="text-gray-600">' + neighborhood + '</p></div>';
  html += _pStatusBadge(status, 'green');
  html += '</div>';
  html += '<div class="mt-3 flex items-center gap-4 text-sm text-gray-600 flex-wrap">';
  html += '<span><i class="fas fa-bed mr-1"></i>' + beds + ' BR</span>';
  html += '<span><i class="fas fa-bath mr-1"></i>' + baths + ' BA</span>';
  if (sqft) html += '<span><i class="fas fa-ruler-combined mr-1"></i>' + Number(sqft).toLocaleString() + ' SF</span>';
  html += '<span class="font-semibold text-teal-700"><i class="fas fa-tag mr-1"></i>' + _pFmt(price) + '/mo</span>';
  html += '</div>';
  html += '<div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">';
  html += '<div><p class="text-xs text-gray-500">Days on Market</p><p class="text-lg font-bold">' + dom + '</p></div>';
  html += '</div>';
  html += '</div></div></div>';
  return html;
}

// ─── Shared Render Functions ──────────────────────────────

function _renderListingCard(listing, type) {
  var addr = _pListingAddress(listing);
  var price = listing.list_price || listing.ListPrice || 0;
  var beds = listing.bedrooms_total || listing.BedroomsTotal || 0;
  var baths = listing.bathrooms_full || listing.BathroomsFull || 0;
  var sqft = listing.living_area || listing.LivingArea || null;
  var dom = listing.days_on_market || listing.DaysOnMarket || 0;
  var neighborhood = listing.neighborhood || listing.MLSAreaMajor || '';
  var propType = listing.property_type || listing.PropertySubType || '';
  var reactions = listing.reactions || [];
  var isLiked = reactions.indexOf('liked') >= 0;
  var isDisliked = reactions.indexOf('disliked') >= 0;
  var priceLabel = type === 'rent' ? _pFmt(price) + '/mo' : _pFmt(price);
  var listingId = listing.listing_id || listing.id || '';

  var html = '<div class="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">';

  // Image area
  html += '<div class="relative h-40 bg-gray-100 flex items-center justify-center">';
  html += '<i class="fas fa-' + (type === 'rent' ? 'building' : 'home') + ' text-3xl text-gray-300"></i>';
  html += '<span class="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">' + (type === 'rent' ? 'RENTAL' : 'SALE') + '</span>';
  if (isLiked) html += '<span class="absolute top-2 right-2 text-red-500"><i class="fas fa-heart"></i></span>';
  html += '</div>';

  // Content
  html += '<div class="p-4">';
  html += '<p class="font-semibold text-sm truncate">' + addr + '</p>';
  html += '<p class="text-xs text-gray-500">' + neighborhood + (propType ? ' · ' + propType : '') + '</p>';
  html += '<p class="text-lg font-bold mt-1">' + priceLabel + '</p>';
  html += '<div class="flex items-center gap-3 mt-2 text-xs text-gray-500">';
  html += '<span>' + beds + ' bed</span><span>' + baths + ' bath</span>';
  if (sqft) html += '<span>' + Number(sqft).toLocaleString() + ' sqft</span>';
  html += '<span>' + dom + ' DOM</span>';
  html += '</div>';

  // Reaction buttons
  html += '<div class="flex items-center gap-2 mt-3 pt-3 border-t">';
  html += '<button onclick="MallanAPI.portal.react(\'' + listingId + '\',\'liked\')" class="flex-1 py-1.5 rounded text-xs font-semibold border ' + (isLiked ? 'bg-green-50 border-green-300 text-green-700' : 'hover:bg-gray-50') + '"><i class="far fa-thumbs-up mr-1"></i>Like</button>';
  html += '<button onclick="MallanAPI.portal.react(\'' + listingId + '\',\'disliked\')" class="flex-1 py-1.5 rounded text-xs font-semibold border ' + (isDisliked ? 'bg-red-50 border-red-300 text-red-700' : 'hover:bg-gray-50') + '"><i class="far fa-thumbs-down mr-1"></i>Pass</button>';
  html += '<button onclick="MallanAPI.portal.react(\'' + listingId + '\',\'discuss\')" class="flex-1 py-1.5 rounded text-xs font-semibold border hover:bg-gray-50"><i class="far fa-comment mr-1"></i>Discuss</button>';
  html += '</div>';

  html += '</div></div>';
  return html;
}

function _renderShowingsSection(showings, color) {
  var html = '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<h3 class="font-semibold mb-4"><i class="fas fa-calendar-check mr-2 text-' + color + '-600"></i>Showings (' + showings.length + ')</h3>';

  if (showings.length === 0) {
    html += _pEmpty('fas fa-calendar', 'No showings scheduled', 'Showings will appear here when requested or scheduled');
  } else {
    html += '<div class="space-y-3">';
    showings.forEach(function(s) {
      var statusColor = s.status === 'completed' ? 'green' : s.status === 'confirmed' ? 'blue' : s.status === 'cancelled' ? 'red' : 'orange';
      html += '<div class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">';
      html += '<div class="flex items-center gap-3">';
      html += '<div class="w-10 h-10 bg-' + color + '-100 rounded-lg flex items-center justify-center">';
      html += '<i class="fas fa-' + (s.type === 'openhouse' ? 'door-open' : 'calendar-day') + ' text-' + color + '-600"></i></div>';
      html += '<div>';
      html += '<p class="text-sm font-medium">' + _pDate(s.date) + (s.time ? ' at ' + s.time : '') + '</p>';
      html += '<p class="text-xs text-gray-500">' + (s.type === 'openhouse' ? 'Open House' : s.type === 'virtual' ? 'Virtual Tour' : 'Private Showing') + '</p>';
      html += '</div></div>';
      html += _pStatusBadge(s.status, statusColor);
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function _renderDocumentsSection(docs, color) {
  var html = '<div class="bg-white rounded-xl shadow-sm border p-6 mb-6">';
  html += '<h3 class="font-semibold mb-4"><i class="fas fa-folder-open mr-2 text-' + color + '-600"></i>Documents (' + docs.length + ')</h3>';

  if (docs.length === 0) {
    html += _pEmpty('fas fa-folder-open', 'No documents yet', 'Documents shared with this client will appear here');
  } else {
    html += '<div class="space-y-2">';
    docs.forEach(function(d) {
      var sigStatus = d.requires_signature ? (d.signed ? 'Signed' : 'Awaiting Signature') : 'N/A';
      var sigColor = d.signed ? 'green' : d.requires_signature ? 'orange' : 'gray';
      html += '<div class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">';
      html += '<div class="flex items-center gap-3">';
      html += '<i class="fas fa-file-pdf text-red-400"></i>';
      html += '<div>';
      html += '<p class="text-sm font-medium">' + (d.name || 'Document') + '</p>';
      html += '<p class="text-xs text-gray-500">' + (d.doc_type || '') + ' · ' + _pDate(d.created_at) + '</p>';
      html += '</div></div>';
      html += '<div class="flex items-center gap-2">';
      html += _pStatusBadge(sigStatus, sigColor);
      if (d.file_url) {
        html += '<a href="' + d.file_url + '" target="_blank" class="px-2 py-1 text-xs text-gray-500 border rounded hover:bg-gray-50"><i class="fas fa-eye mr-1"></i>View</a>';
      }
      html += '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ─── Portal Switch Handler ────────────────────────────────

/**
 * Called when agent switches to a portal tab.
 * Loads data on first view, cached after that.
 */
function onPortalTabSwitch(portalType) {
  switch (portalType) {
    case 'client':
    case 'buyer':
      if (!_portalState.buyerLoaded) initBuyerPortal();
      break;
    case 'tenant':
      if (!_portalState.tenantLoaded) initTenantPortal();
      break;
    case 'seller':
      if (!_portalState.sellerLoaded) initSellerPortal();
      break;
    case 'landlord':
      if (!_portalState.landlordLoaded) initLandlordPortal();
      break;
  }
}

// Export
window.initBuyerPortal = initBuyerPortal;
window.initTenantPortal = initTenantPortal;
window.initSellerPortal = initSellerPortal;
window.initLandlordPortal = initLandlordPortal;
window.onPortalTabSwitch = onPortalTabSwitch;
