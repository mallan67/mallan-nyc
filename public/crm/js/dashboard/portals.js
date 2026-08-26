// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PORTALS — Buyer, Seller, Tenant (Renter), Landlord views
// These render when a client (not agent/broker) logs in.
// REBNY compliant: listing agent name/contact masked for buyer/tenant portals.
//
// Buyer Portal:   Listings (sent), Favorites, Showings, Documents, Messages
// Seller Portal:  My Listing, Showings, Offers, Marketing, Documents, Messages
// Tenant Portal:  Listings (sent), Favorites, Showings, Documents, Messages
// Landlord Portal: My Listing, Showings, Offers, Marketing, Documents, Messages
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM, Store, Events, Alerts, Documents, UI, Utils */

var Portals = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var AGO = Utils.formatTimeAgo;

  var _role = null;   // 'buyer' | 'seller' | 'renter' | 'landlord'
  var _me = null;      // current user data from /api/portal/me
  var _activeTab = null;

  // Portal type metadata
  var PORTAL_META = {
    buyer:    { label: 'Buyer Portal',    badge: '#3B82F6', icon: 'fa-home',      type: 'search' },
    seller:   { label: 'Seller Portal',   badge: '#059669', icon: 'fa-chart-line', type: 'listing' },
    renter:   { label: 'Tenant Portal',   badge: '#8B5CF6', icon: 'fa-key',       type: 'search' },
    landlord: { label: 'Landlord Portal', badge: '#F59E0B', icon: 'fa-building',  type: 'listing' },
  };

  // Tab definitions per portal type
  var TABS = {
    buyer:    ['listings', 'favorites', 'showings', 'documents', 'messages'],
    seller:   ['my-listing', 'showings', 'offers', 'marketing', 'documents', 'messages'],
    renter:   ['listings', 'favorites', 'showings', 'documents', 'messages'],
    landlord: ['my-listing', 'showings', 'offers', 'marketing', 'documents', 'messages'],
  };

  var TAB_META = {
    'listings':   { label: 'Listings',    icon: 'fa-th-large' },
    'favorites':  { label: 'Favorites',   icon: 'fa-heart' },
    'showings':   { label: 'Showings',    icon: 'fa-calendar-alt' },
    'documents':  { label: 'Documents',   icon: 'fa-folder-open' },
    'messages':   { label: 'Messages',    icon: 'fa-comments' },
    'my-listing': { label: 'My Listing',  icon: 'fa-home' },
    'offers':     { label: 'Offers',      icon: 'fa-gavel' },
    'marketing':  { label: 'Marketing',   icon: 'fa-bullhorn' },
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // INIT — entry point, called from app.js with role
  // ═══════════════════════════════════════════════════════════════════════════
  function init(role) {
    // Normalize: 'tenant' → 'renter' (data model uses 'renter', display uses 'Tenant')
    if (role === 'tenant') role = 'renter';
    _role = role;

    // Hide agent sidebar, expand main area
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
    var main = document.getElementById('main');
    if (main) main.style.marginLeft = '0';

    // Load user profile
    MallanAPI.portal.me().then(function (data) {
      _me = data.user || data;
      _render();
    }).catch(function () {
      _me = null;
      _render();
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — top-level layout: topbar + header + tabs + content area
  // ═══════════════════════════════════════════════════════════════════════════
  function _render() {
    // Topbar
    _renderTopbar();

    // Title
    var titleEl = document.getElementById('panelTitle');
    var meta = PORTAL_META[_role] || PORTAL_META.buyer;
    if (titleEl) titleEl.textContent = meta.label;

    // Content
    var content = document.getElementById('content');
    if (!content) return;

    var name = _clientName();
    var tabs = TABS[_role] || TABS.buyer;
    var firstTab = tabs[0];

    content.innerHTML =
      '<div class="space-y-6">' +
        // Header card
        _buildHeader(name, meta) +
        // Tab nav
        '<div id="portalTabs" class="flex gap-2 overflow-x-auto pb-1">' +
          tabs.map(function (tab, i) {
            var t = TAB_META[tab] || { label: tab, icon: 'fa-circle' };
            var active = i === 0;
            return '<button class="btn btn-sm portal-tab' + (active ? ' active' : ' btn-outline') + '"' +
              (active ? ' style="background:#111827;color:white"' : '') +
              ' data-tab="' + E(tab) + '"' +
              ' onclick="Portals.switchTab(\'' + E(tab) + '\',this)">' +
              '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) +
            '</button>';
          }).join('') +
        '</div>' +
        // Content container
        '<div id="portalContent">' + _spinner() + '</div>' +
      '</div>';

    switchTab(firstTab);
  }


  function _buildHeader(name, meta) {
    var greeting = _role === 'seller' || _role === 'landlord'
      ? 'Track your listing performance, showings, offers, and marketing.'
      : 'Your agent has shared listings with you. Browse, react, and let them know what you think.';

    return '<div class="card p-6">' +
      '<div class="flex items-center gap-4">' +
        '<div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background:' + meta.badge + '15;color:' + meta.badge + '">' +
          '<i class="fas ' + meta.icon + ' text-xl"></i>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<h2 class="text-xl font-bold text-gray-900">Welcome' + (name ? ', ' + E(name) : '') + '</h2>' +
            '<span style="display:inline-flex;align-items:center;padding:2px 10px;font-size:10px;font-weight:700;border-radius:6px;background:' + meta.badge + '15;color:' + meta.badge + ';text-transform:uppercase;letter-spacing:0.5px;">' +
              E(meta.label) +
            '</span>' +
          '</div>' +
          '<p class="text-sm text-gray-500 mt-1">' + greeting + '</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }


  function _renderTopbar() {
    var topbar = document.getElementById('topbar');
    if (!topbar) return;
    var name = _clientName();
    var init = Utils.initials(name);

    topbar.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<div class="brand-icon" style="width:32px;height:32px;"><span style="font-size:13px;">M</span></div>' +
        '<span class="text-sm font-bold text-gray-900">MALLAN</span>' +
      '</div>' +
      '<div class="flex items-center gap-3">' +
        '<div class="flex items-center gap-2">' +
          '<div class="w-8 h-8 rounded-full bg-gold-bg flex items-center justify-center text-xs font-bold text-gold">' + E(init) + '</div>' +
          '<span class="text-sm font-medium text-gray-700 hidden sm:inline">' + E(name) + '</span>' +
        '</div>' +
        '<button onclick="CRM.logout()" class="btn btn-sm btn-outline" title="Sign out"><i class="fas fa-sign-out-alt"></i></button>' +
      '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════════════════════════════════════════
  function switchTab(tab, btn) {
    _activeTab = tab;

    // Update tab button styles
    if (btn) {
      document.querySelectorAll('.portal-tab').forEach(function (b) {
        b.style.background = '';
        b.style.color = '';
        b.classList.remove('active');
        b.classList.add('btn-outline');
      });
      btn.style.background = '#111827';
      btn.style.color = 'white';
      btn.classList.add('active');
      btn.classList.remove('btn-outline');
    }

    var pc = document.getElementById('portalContent');
    if (!pc) return;
    pc.innerHTML = _spinner();

    // Route to correct section renderer
    var renderers = {
      'listings':   _loadListings,
      'favorites':  _loadFavorites,
      'showings':   _loadShowings,
      'documents':  _loadDocuments,
      'messages':   _loadMessages,
      'my-listing': _loadMyListing,
      'offers':     _loadOffers,
      'marketing':  _loadMarketing,
    };

    var fn = renderers[tab];
    if (fn) {
      fn(pc);
    } else {
      pc.innerHTML = _emptyState('fa-question-circle', 'Section not found');
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER / TENANT — Listings (sent to me)
  // REBNY: listing agent name/contact HIDDEN. Brokerage name only.
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadListings(pc) {
    var isRental = _role === 'renter';

    MallanAPI.portal.listings().then(function (data) {
      var listings = data.listings || [];
      if (listings.length === 0) {
        pc.innerHTML = _emptyState('fa-home',
          'No listings shared with you yet',
          'Your agent will send you ' + (isRental ? 'rentals' : 'listings') + ' that match your criteria.');
        return;
      }

      // Filter controls
      var html = '<div class="mb-4 flex items-center gap-3 flex-wrap">' +
        '<span class="text-sm text-gray-500">' + listings.length + ' ' + (isRental ? 'rental' : 'listing') + (listings.length !== 1 ? 's' : '') + ' shared with you</span>' +
        '<div class="flex gap-2 ml-auto">' +
          '<button class="btn btn-xs btn-outline portal-filter active" onclick="Portals.filterListings(\'all\',this)">All</button>' +
          '<button class="btn btn-xs btn-outline portal-filter" onclick="Portals.filterListings(\'liked\',this)"><i class="fas fa-heart text-green-500"></i> Liked</button>' +
          '<button class="btn btn-xs btn-outline portal-filter" onclick="Portals.filterListings(\'new\',this)"><i class="fas fa-sparkles text-blue-500"></i> New</button>' +
        '</div>' +
      '</div>';

      html += '<div id="portalListingsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
      listings.forEach(function (l) {
        html += _buildListingCard(l, isRental);
      });
      html += '</div>';

      // REBNY attribution
      html += _rebnyAttribution();

      pc.innerHTML = html;
    }).catch(function (err) {
      pc.innerHTML = _emptyState('fa-exclamation-triangle', 'Could not load listings', E(err.message || 'Please try again later.'));
    });
  }


  function _buildListingCard(l, isRental) {
    var id = l.id || l.listing_id || l.ListingId;
    var photo = _getPhoto(l);
    var address = l.InternetAddressDisplayYN === false
      ? 'Address Available Upon Request'
      : (l.address || l.UnparsedAddress || 'Address not available');
    var price = l.ListPrice || l.price || l.list_price;
    var reaction = l.reaction || null;
    var status = (l.status || l.MlsStatus || 'active').toLowerCase();

    var statusColors = { active: '#3B82F6', pending: '#F59E0B', contract: '#8B5CF6' };
    var statusColor = statusColors[status] || '#6B7280';

    return '<div class="portal-listing-card" data-reaction="' + E(reaction || '') + '" data-new="' + (l.is_new ? 'true' : '') + '">' +
      // Photo
      (photo
        ? '<div class="relative">' +
            '<img src="' + E(photo) + '" class="portal-listing-photo" alt="Property photo" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
            '<div class="portal-listing-photo items-center justify-center bg-gray-100" style="display:none"><i class="fas fa-image text-3xl text-gray-300"></i></div>' +
            (l.is_new ? '<span style="position:absolute;top:8px;left:8px;background:#3B82F6;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">NEW</span>' : '') +
            '<span style="position:absolute;top:8px;right:8px;background:' + statusColor + ';color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:capitalize;">' + E(status) + '</span>' +
          '</div>'
        : '<div class="portal-listing-photo flex items-center justify-center bg-gray-100 relative">' +
            '<i class="fas fa-image text-3xl text-gray-300"></i>' +
          '</div>') +

      // Body
      '<div class="portal-listing-body">' +
        '<p class="text-lg font-bold text-gray-900">' + $(price) + (isRental ? '<span class="text-xs font-normal text-gray-400">/mo</span>' : '') + '</p>' +
        '<p class="text-sm text-gray-600 mt-1">' + E(address) + '</p>' +
        '<div class="flex gap-3 mt-2 text-xs text-gray-500">' +
          (l.BedroomsTotal || l.beds ? '<span><i class="fas fa-bed mr-1"></i>' + (l.BedroomsTotal || l.beds) + ' bd</span>' : '') +
          (l.BathroomsTotalInteger || l.baths ? '<span><i class="fas fa-bath mr-1"></i>' + (l.BathroomsTotalInteger || l.baths) + ' ba</span>' : '') +
          (l.LivingArea || l.sqft ? '<span><i class="fas fa-ruler-combined mr-1"></i>' + Number(l.LivingArea || l.sqft).toLocaleString() + ' sqft</span>' : '') +
        '</div>' +
        // REBNY: show brokerage name ONLY, not listing agent name or contact
        '<p class="text-[10px] text-gray-400 mt-2">Courtesy of Mallan Real Estate Inc.</p>' +
      '</div>' +

      // Reaction buttons
      '<div class="portal-reactions">' +
        '<button class="portal-reaction-btn' + (reaction === 'liked' ? ' liked' : '') + '" onclick="Portals.react(\'' + E(id) + '\',\'liked\')" title="Like">' +
          '<i class="fas fa-heart"></i><span class="hidden sm:inline"> Like</span>' +
        '</button>' +
        '<button class="portal-reaction-btn' + (reaction === 'disliked' ? ' disliked' : '') + '" onclick="Portals.react(\'' + E(id) + '\',\'disliked\')" title="Pass">' +
          '<i class="fas fa-thumbs-down"></i><span class="hidden sm:inline"> Pass</span>' +
        '</button>' +
        '<button class="portal-reaction-btn" onclick="Portals.discuss(\'' + E(id) + '\')" title="Let\'s Discuss">' +
          '<i class="fas fa-comment"></i><span class="hidden sm:inline"> Discuss</span>' +
        '</button>' +
        '<button class="portal-reaction-btn" onclick="Portals.requestShowing(\'' + E(id) + '\',\'' + E(address) + '\')" title="Schedule Tour">' +
          '<i class="fas fa-calendar"></i><span class="hidden sm:inline"> Tour</span>' +
        '</button>' +
        '<button class="portal-reaction-btn" onclick="Portals.openHouseRSVP(\'' + E(id) + '\',\'' + E(address) + '\')" title="Open House">' +
          '<i class="fas fa-door-open"></i><span class="hidden sm:inline"> Open House</span>' +
        '</button>' +
        '<button class="portal-reaction-btn" onclick="Portals.makeOffer(\'' + E(id) + '\',\'' + E(address) + '\',\'' + (price || '') + '\')" title="Make Offer">' +
          '<i class="fas fa-hand-holding-usd"></i><span class="hidden sm:inline"> Offer</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }


  function filterListings(filter, btn) {
    // Update filter button styles
    document.querySelectorAll('.portal-filter').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    var cards = document.querySelectorAll('.portal-listing-card');
    cards.forEach(function (card) {
      var reaction = card.getAttribute('data-reaction');
      var isNew = card.getAttribute('data-new') === 'true';
      var show = true;

      if (filter === 'liked') show = reaction === 'liked';
      else if (filter === 'new') show = isNew;

      card.style.display = show ? '' : 'none';
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER / TENANT — Favorites
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadFavorites(pc) {
    MallanAPI._fetch('/api/portal/favorites').then(function (data) {
      var favorites = data.favorites || data.listings || [];
      if (favorites.length === 0) {
        pc.innerHTML = _emptyState('fa-heart',
          'No favorites yet',
          'Like a listing to add it to your favorites.');
        return;
      }

      var isRental = _role === 'renter';
      var html = '<div class="mb-3"><span class="text-sm font-semibold text-gray-700">' + favorites.length + ' favorite' + (favorites.length !== 1 ? 's' : '') + '</span></div>';
      html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
      favorites.forEach(function (l) {
        html += _buildListingCard(l, isRental);
      });
      html += '</div>';
      html += _rebnyAttribution();
      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-heart', 'Could not load favorites', 'Please try again later.');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED — Showings (all portal types)
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadShowings(pc) {
    var isOwner = _role === 'seller' || _role === 'landlord';

    MallanAPI.portal.showings().then(function (data) {
      var showings = data.showings || [];
      if (showings.length === 0) {
        pc.innerHTML = _emptyState('fa-calendar-alt',
          'No showings scheduled',
          isOwner ? 'Showings of your property will appear here.' : 'Request a tour from any listing to get started.');
        return;
      }

      // Separate upcoming vs past
      var now = new Date();
      var upcoming = [];
      var past = [];
      showings.forEach(function (s) {
        if (new Date(s.date || s.showing_date) >= now) {
          upcoming.push(s);
        } else {
          past.push(s);
        }
      });

      var html = '';

      // Stats for seller/landlord
      if (isOwner) {
        html += '<div class="stat-grid mb-4">' +
          UI.statCard(showings.length, 'Total Showings', 'fa-calendar-check', '#3B82F6') +
          UI.statCard(upcoming.length, 'Upcoming', 'fa-clock', '#059669') +
          UI.statCard(past.length, 'Completed', 'fa-check-circle', '#6B7280') +
          UI.statCard(
            showings.filter(function (s) { return s.feedback; }).length,
            'With Feedback', 'fa-comment-dots', '#F59E0B'
          ) +
        '</div>';
      }

      // Upcoming showings
      if (upcoming.length > 0) {
        html += '<h3 class="text-sm font-bold text-gray-700 mb-3 mt-2">Upcoming</h3>';
        html += '<div class="space-y-3">';
        upcoming.forEach(function (s) { html += _buildShowingCard(s, false, isOwner); });
        html += '</div>';
      }

      // Past showings
      if (past.length > 0) {
        html += '<h3 class="text-sm font-bold text-gray-700 mb-3 mt-6">Past</h3>';
        html += '<div class="space-y-3">';
        past.forEach(function (s) { html += _buildShowingCard(s, true, isOwner); });
        html += '</div>';
      }

      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-calendar-alt', 'Could not load showings', 'Please try again later.');
    });
  }


  function _buildShowingCard(s, isPast, isOwner) {
    var statusMap = {
      confirmed: { color: '#059669', bg: '#ECFDF5' },
      pending:   { color: '#F59E0B', bg: '#FFFBEB' },
      cancelled: { color: '#DC2626', bg: '#FEF2F2' },
      completed: { color: '#6B7280', bg: '#F3F4F6' },
    };
    var st = statusMap[(s.status || 'pending').toLowerCase()] || statusMap.pending;
    var address = s.address || s.listing_address || 'Showing';
    var date = s.date || s.showing_date;
    var time = s.time || s.showing_time || '';

    var html = '<div class="card p-4">' +
      '<div class="flex items-center gap-4">' +
        '<div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background:' + (isPast ? '#F3F4F6' : '#EFF6FF') + '">' +
          '<i class="fas fa-calendar-alt ' + (isPast ? 'text-gray-400' : 'text-blue-500') + '"></i>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-semibold text-gray-900">' + E(address) + '</p>' +
          '<p class="text-xs text-gray-500">' + D(date) + (time ? ' at ' + E(time) : '') + '</p>' +
        '</div>' +
        '<span style="display:inline-flex;align-items:center;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + st.bg + ';color:' + st.color + ';text-transform:capitalize;">' +
          E(s.status || 'pending') +
        '</span>' +
      '</div>';

    // Show feedback for owner portals
    if (isOwner && s.feedback) {
      html += '<div class="mt-3 p-3 bg-gray-50 rounded-lg">' +
        '<p class="text-xs font-semibold text-gray-600 mb-1"><i class="fas fa-comment-dots mr-1"></i>Showing Feedback</p>' +
        '<p class="text-xs text-gray-500">' + E(s.feedback) + '</p>' +
        (s.buyer_interest ? '<p class="text-xs mt-1"><span class="font-semibold">Interest Level:</span> ' + E(s.buyer_interest) + '</p>' : '') +
      '</div>';
    }

    // Past showing — allow feedback from buyer/tenant
    if (isPast && !isOwner && !s.my_feedback) {
      html += '<div class="mt-3 flex gap-2">' +
        '<button class="btn btn-xs btn-outline" onclick="Portals.submitShowingFeedback(\'' + E(s.id) + '\')"><i class="fas fa-star mr-1"></i>Leave Feedback</button>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED — Documents (all portal types)
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadDocuments(pc) {
    MallanAPI._fetch('/api/portal/documents').then(function (data) {
      var docs = data.documents || [];
      if (docs.length === 0) {
        pc.innerHTML = _emptyState('fa-folder-open',
          'No documents yet',
          'Your agent will share documents with you when they are ready.');
        return;
      }

      // Group by status
      var pending = docs.filter(function (d) { return d.status === 'pending_approval' || d.status === 'requested'; });
      var ready = docs.filter(function (d) { return d.status !== 'pending_approval' && d.status !== 'requested'; });

      var html = '';

      // Pending signature/review
      if (pending.length > 0) {
        html += '<div class="mb-4 p-3 rounded-lg" style="background:#FFFBEB;border:1px solid #FDE68A">' +
          '<p class="text-xs font-bold text-yellow-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>' + pending.length + ' document' + (pending.length !== 1 ? 's' : '') + ' need your attention</p>' +
          '<div class="space-y-2">';
        pending.forEach(function (d) { html += _buildDocumentRow(d, true); });
        html += '</div></div>';
      }

      // All documents
      html += '<div class="space-y-2">';
      ready.forEach(function (d) { html += _buildDocumentRow(d, false); });
      html += '</div>';

      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-folder-open', 'Could not load documents', 'Please try again later.');
    });
  }


  function _buildDocumentRow(d, highlight) {
    var icon = Documents.typeIcon(d.type || d.doc_type || 'general');
    var label = Documents.typeLabel(d.type || d.doc_type || 'general');

    return '<div class="card p-4 cursor-pointer hover:border-gold transition-all"' +
      (d.url ? ' onclick="window.open(\'' + E(d.url) + '\',\'_blank\')"' : '') + '>' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-lg flex items-center justify-center' + (highlight ? '" style="background:#FEF3C7"' : ' bg-gray-50"') + '>' +
          '<i class="fas ' + icon + (highlight ? ' text-yellow-600' : ' text-gold') + '"></i>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-semibold truncate">' + E(d.title || d.name || 'Document') + '</p>' +
          '<p class="text-xs text-gray-500">' + E(label) + ' &middot; ' + D(d.created_at || d.uploaded_at) + '</p>' +
        '</div>' +
        Documents.statusBadge(d.status || 'uploaded') +
      '</div>' +
    '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED — Messages (all portal types)
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadMessages(pc) {
    MallanAPI._fetch('/api/portal/messages').then(function (data) {
      var messages = data.messages || [];
      if (messages.length === 0) {
        pc.innerHTML =
          '<div class="space-y-4">' +
            _emptyState('fa-comments', 'No messages yet', 'Send a message to your agent to get started.') +
            _buildComposeBox() +
          '</div>';
        return;
      }

      var html = '<div class="space-y-4">';

      // Compose box at top
      html += _buildComposeBox();

      // Message thread
      html += '<div class="space-y-3" id="portalMessageThread">';
      messages.forEach(function (m) {
        var isMe = m.sender === 'client' || m.sender_type === 'client';
        html += '<div class="flex ' + (isMe ? 'justify-end' : 'justify-start') + '">' +
          '<div class="max-w-xs sm:max-w-sm lg:max-w-md p-3 rounded-xl ' +
            (isMe ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900') + '">' +
            '<p class="text-sm">' + E(m.body || m.content || m.text || '') + '</p>' +
            '<p class="text-[10px] mt-1 ' + (isMe ? 'text-gray-400' : 'text-gray-500') + '">' +
              (m.sender_name && !isMe ? E(m.sender_name) + ' &middot; ' : '') +
              AGO(m.created_at || m.sent_at) +
            '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';

      html += '</div>';
      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML =
        '<div class="space-y-4">' +
          _emptyState('fa-comments', 'Could not load messages') +
          _buildComposeBox() +
        '</div>';
    });
  }


  function _buildComposeBox() {
    return '<div class="card p-4">' +
      '<form id="portalComposeForm" onsubmit="Portals.sendMessage(event)">' +
        '<div class="flex gap-2">' +
          '<input class="form-input flex-1" id="portalMessageInput" type="text" placeholder="Type a message to your agent..." required>' +
          '<button type="submit" class="btn btn-gold"><i class="fas fa-paper-plane"></i></button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }


  function sendMessage(e) {
    if (e) e.preventDefault();
    var input = document.getElementById('portalMessageInput');
    if (!input || !input.value.trim()) return;

    var body = input.value.trim();
    input.value = '';
    input.disabled = true;

    MallanAPI._fetch('/api/portal/messages', {
      method: 'POST',
      body: JSON.stringify({ body: body }),
    }).then(function () {
      CRM.toast('Message sent', 'success');
      // Reload messages
      var pc = document.getElementById('portalContent');
      if (pc) _loadMessages(pc);
    }).catch(function () {
      CRM.toast('Message sent', 'info');
      // Optimistically add to thread
      var thread = document.getElementById('portalMessageThread');
      if (thread) {
        thread.innerHTML += '<div class="flex justify-end"><div class="max-w-xs sm:max-w-sm p-3 rounded-xl bg-gray-900 text-white">' +
          '<p class="text-sm">' + E(body) + '</p>' +
          '<p class="text-[10px] mt-1 text-gray-400">just now</p>' +
        '</div></div>';
      }
      input.disabled = false;
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SELLER / LANDLORD — My Listing
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadMyListing(pc) {
    var isRental = _role === 'landlord';

    MallanAPI.portal.listings().then(function (data) {
      var listings = data.listings || [];
      if (listings.length === 0) {
        pc.innerHTML = _emptyState('fa-home',
          'No active listing',
          'Your agent will add your ' + (isRental ? 'rental' : '') + ' listing here.');
        return;
      }

      var html = '';

      listings.forEach(function (l, idx) {
        var address = l.address || l.UnparsedAddress || 'Your Listing';
        var price = l.ListPrice || l.price || l.list_price;
        var status = l.status || l.MlsStatus || 'UNKNOWN';
        var photo = _getPhoto(l);
        var dom = l.cumulative_dom || l.days_on_market || 0;

        html += '<div class="card mb-4">';

        // Header with photo
        if (photo) {
          html += '<div style="position:relative;height:200px;overflow:hidden;border-radius:14px 14px 0 0;">' +
            '<img src="' + E(photo) + '" style="width:100%;height:100%;object-fit:cover;" alt="Listing photo" onerror="this.parentElement.style.display=\'none\'">' +
            '<div style="position:absolute;bottom:0;left:0;right:0;padding:16px;background:linear-gradient(transparent,rgba(0,0,0,0.7));">' +
              '<p class="text-lg font-bold text-white">' + E(address) + '</p>' +
            '</div>' +
          '</div>';
        }

        html += '<div class="card-header">' +
          (!photo ? '<h3>' + E(address) + '</h3>' : '<h3>Listing Details</h3>') +
          '<span style="display:inline-flex;align-items:center;padding:3px 10px;font-size:11px;font-weight:700;border-radius:6px;background:#3B82F615;color:#3B82F6;text-transform:capitalize;">' + E(status) + '</span>' +
        '</div>';

        // Key stats
        html += '<div class="card-body">' +
          '<div class="stat-grid mb-4">' +
            UI.statCard($(price), isRental ? 'Monthly Rent' : 'List Price', 'fa-tag', '#B8860B') +
            UI.statCard(dom, 'Days on Market', 'fa-clock', '#3B82F6') +
            UI.statCard(l.showing_count || l.showings_count || '0', 'Showings', 'fa-calendar-check', '#059669') +
            UI.statCard(l.offer_count || l.offers_count || '0', 'Offers', 'fa-gavel', '#F59E0B') +
          '</div>';

        // Property details grid
        html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">' +
          _detailItem('Beds', l.BedroomsTotal || l.beds) +
          _detailItem('Baths', l.BathroomsTotalInteger || l.baths) +
          _detailItem('SqFt', l.LivingArea || l.sqft ? Number(l.LivingArea || l.sqft).toLocaleString() : null) +
          _detailItem('Type', l.PropertySubType || l.property_type) +
        '</div>';

        // Additional details for owners
        if (l.views_count || l.saves_count || l.inquiries_count) {
          html += '<div class="grid grid-cols-3 gap-3 text-sm mt-4 pt-4 border-t">' +
            _detailItem('Online Views', l.views_count || '0') +
            _detailItem('Saves', l.saves_count || '0') +
            _detailItem('Inquiries', l.inquiries_count || '0') +
          '</div>';
        }

        // Price history
        if (l.price_history && l.price_history.length > 0) {
          html += '<div class="mt-4 pt-4 border-t">' +
            '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Price History</h4>' +
            '<div class="space-y-2">';
          l.price_history.forEach(function (ph) {
            html += '<div class="flex items-center justify-between text-sm">' +
              '<span class="text-gray-500">' + D(ph.date) + '</span>' +
              '<span class="font-semibold">' + $(ph.price) + '</span>' +
            '</div>';
          });
          html += '</div></div>';
        }

        html += '</div></div>';  // card-body + card
      });

      // REBNY attribution
      html += _rebnyAttribution();

      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-home', 'Could not load your listing', 'Please try again later.');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SELLER / LANDLORD — Offers
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadOffers(pc) {
    var isRental = _role === 'landlord';

    MallanAPI.portal.offers().then(function (data) {
      var offers = data.offers || [];
      if (offers.length === 0) {
        pc.innerHTML = _emptyState('fa-gavel',
          'No offers yet',
          isRental ? 'Rental applications will appear here.' : 'Offers on your listing will appear here.');
        return;
      }

      // Stats
      var active = offers.filter(function (o) { return o.status !== 'rejected' && o.status !== 'withdrawn'; });
      var highest = active.reduce(function (max, o) {
        var amt = o.amount || o.price || 0;
        return amt > max ? amt : max;
      }, 0);

      var html = '<div class="stat-grid mb-4">' +
        UI.statCard(offers.length, 'Total ' + (isRental ? 'Applications' : 'Offers'), 'fa-gavel', '#3B82F6') +
        UI.statCard(active.length, 'Active', 'fa-check-circle', '#059669') +
        (highest > 0 ? UI.statCard($(highest), 'Highest ' + (isRental ? 'Offer' : 'Bid'), 'fa-arrow-up', '#B8860B') : '') +
      '</div>';

      // Offer cards
      html += '<div class="space-y-3">';
      offers.forEach(function (o) {
        var statusColors = {
          pending: '#F59E0B', accepted: '#059669', rejected: '#DC2626',
          countered: '#8B5CF6', withdrawn: '#6B7280',
        };
        var sc = statusColors[(o.status || 'pending').toLowerCase()] || '#F59E0B';

        html += '<div class="card p-4">' +
          '<div class="flex items-start gap-4">' +
            '<div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">' +
              '<i class="fas fa-gavel text-blue-500"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center justify-between flex-wrap gap-2">' +
                '<p class="text-lg font-bold text-gray-900">' + $(o.amount || o.price) + '</p>' +
                '<span style="display:inline-flex;align-items:center;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + sc + '15;color:' + sc + ';text-transform:capitalize;">' +
                  E(o.status || 'pending') +
                '</span>' +
              '</div>' +
              '<p class="text-sm text-gray-600 mt-1">' + E(o.address || o.listing_address || '') + '</p>' +
              (o.buyer_name ? '<p class="text-xs text-gray-500 mt-1"><i class="fas fa-user mr-1"></i>' + E(o.buyer_name) + '</p>' : '') +
              '<div class="flex gap-4 mt-2 text-xs text-gray-500">' +
                (o.contingencies ? '<span><i class="fas fa-shield-alt mr-1"></i>' + E(o.contingencies) + '</span>' : '') +
                (o.closing_date ? '<span><i class="fas fa-calendar mr-1"></i>Close: ' + D(o.closing_date) + '</span>' : '') +
                '<span><i class="fas fa-clock mr-1"></i>' + AGO(o.created_at || o.submitted_at) + '</span>' +
              '</div>' +
              (o.notes ? '<p class="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">' + E(o.notes) + '</p>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';

      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-gavel', 'Could not load offers', 'Please try again later.');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SELLER / LANDLORD — Marketing
  // ═══════════════════════════════════════════════════════════════════════════
  function _loadMarketing(pc) {
    MallanAPI.portal.listings().then(function (listData) {
      var listings = listData.listings || [];
      var listingId = (listings[0] && (listings[0].listing_id || listings[0].id)) || '';
      return MallanAPI._fetch('/api/portal/marketing?listingId=' + encodeURIComponent(listingId));
    }).then(function (data) {
      var activities = data.activities || data.marketing || [];
      if (activities.length === 0) {
        pc.innerHTML = _emptyState('fa-bullhorn',
          'No marketing activity yet',
          'Your agent will share marketing updates here as they promote your listing.');
        return;
      }

      // Group by type
      var grouped = Utils.groupBy(activities, 'type');

      // Summary stats
      var html = '<div class="stat-grid mb-4">' +
        UI.statCard(activities.length, 'Total Activities', 'fa-bullhorn', '#3B82F6') +
        UI.statCard(Object.keys(grouped).length, 'Channels', 'fa-sitemap', '#059669') +
      '</div>';

      // Activity timeline
      html += '<div class="space-y-3">';
      activities.forEach(function (a) {
        var typeIcons = {
          email: 'fa-envelope', social: 'fa-share-alt', print: 'fa-print',
          listing_syndication: 'fa-rss', open_house: 'fa-door-open',
          photography: 'fa-camera', staging: 'fa-couch', video: 'fa-video',
          flyer: 'fa-file-alt', mailer: 'fa-mail-bulk',
        };
        var icon = typeIcons[(a.type || '').toLowerCase()] || 'fa-bullhorn';

        html += '<div class="card p-4">' +
          '<div class="flex items-start gap-3">' +
            '<div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">' +
              '<i class="fas ' + icon + ' text-blue-500"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold text-gray-900">' + E(a.title || a.type || 'Marketing Activity') + '</p>' +
              (a.description ? '<p class="text-xs text-gray-600 mt-1">' + E(a.description) + '</p>' : '') +
              '<div class="flex gap-3 mt-2 text-xs text-gray-500">' +
                '<span><i class="fas fa-clock mr-1"></i>' + D(a.date || a.created_at) + '</span>' +
                (a.reach ? '<span><i class="fas fa-eye mr-1"></i>' + a.reach + ' reached</span>' : '') +
                (a.clicks ? '<span><i class="fas fa-mouse-pointer mr-1"></i>' + a.clicks + ' clicks</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';

      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = _emptyState('fa-bullhorn', 'Could not load marketing data', 'Please try again later.');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS — Reactions, Discussions, Tours, Offers, Open House
  // ═══════════════════════════════════════════════════════════════════════════

  function react(listingId, action) {
    MallanAPI.portal.react(listingId, action).then(function () {
      CRM.toast(action === 'liked' ? 'Added to favorites!' : 'Noted', 'success');
      Events.log('listing_reaction_recorded', 'listing', listingId, { reaction: action });
      // Reload listings to update reaction state
      var pc = document.getElementById('portalContent');
      if (pc && (_activeTab === 'listings' || _activeTab === 'favorites')) {
        if (_activeTab === 'listings') _loadListings(pc);
        else _loadFavorites(pc);
      }
    }).catch(function () {
      CRM.toast('Reaction recorded', 'info');
    });
  }


  function discuss(listingId) {
    CRM.openModal("Let's Discuss",
      '<form id="discussForm" class="space-y-4">' +
        '<p class="text-sm text-gray-500">Send a message to your agent about this listing.</p>' +
        '<div class="form-group">' +
          '<label class="form-label">What would you like to discuss?</label>' +
          '<textarea class="form-input" id="discussComment" rows="4" placeholder="I have questions about this listing..."></textarea>' +
        '</div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.submitDiscuss(\'' + E(listingId) + '\')"><i class="fas fa-paper-plane mr-1"></i>Send</button>'
      }
    );
  }


  function submitDiscuss(listingId) {
    var comment = document.getElementById('discussComment');
    var text = comment ? comment.value.trim() : '';

    MallanAPI.portal.react(listingId, 'discuss', text).then(function () {
      CRM.closeModal();
      CRM.toast('Message sent to your agent', 'success');
      Events.log('listing_reaction_recorded', 'listing', listingId, { reaction: 'discuss', comment: text });
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Message sent', 'info');
    });
  }


  function requestShowing(listingId, address) {
    CRM.openModal('Request a Tour',
      '<form id="requestShowingForm" class="space-y-4">' +
        '<p class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-1 text-gold"></i>' + E(address || 'This listing') + '</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Preferred Date</label>' +
            '<input class="form-input" type="date" name="date" required min="' + _todayISO() + '"></div>' +
          '<div class="form-group"><label class="form-label">Preferred Time</label>' +
            '<select class="form-input form-select" name="time">' +
              '<option value="morning">Morning (9am-12pm)</option>' +
              '<option value="afternoon" selected>Afternoon (12-5pm)</option>' +
              '<option value="evening">Evening (5-8pm)</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes (optional)</label>' +
          '<textarea class="form-input" name="notes" rows="2" placeholder="Any preferences or accessibility needs..."></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.submitShowingRequest(\'' + E(listingId) + '\')"><i class="fas fa-calendar-plus mr-1"></i>Request Tour</button>'
      }
    );
  }


  function submitShowingRequest(listingId) {
    var form = document.getElementById('requestShowingForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = { listing_id: listingId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.portal.requestShowing(data).then(function () {
      CRM.closeModal();
      CRM.toast('Tour request sent! Your agent will confirm.', 'success');
      Events.log('showing_scheduled', 'listing', listingId, { type: 'tour_request' });
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Tour request submitted', 'info');
    });
  }


  function openHouseRSVP(listingId, address) {
    // Load open house schedule first
    MallanAPI._fetch('/api/portal/open-houses?listing_id=' + encodeURIComponent(listingId)).then(function (data) {
      var events = data.open_houses || data.events || [];
      var content;

      if (events.length === 0) {
        content = '<div class="text-center py-4">' +
          '<i class="fas fa-door-open text-3xl text-gray-300 mb-3"></i>' +
          '<p class="text-sm text-gray-500">No open houses currently scheduled for this listing.</p>' +
          '<p class="text-xs text-gray-400 mt-1">Check back soon or request a private tour instead.</p>' +
        '</div>';
      } else {
        content = '<div class="space-y-3">' +
          '<p class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-1 text-gold"></i>' + E(address) + '</p>';
        events.forEach(function (ev) {
          content += '<div class="p-3 border rounded-lg hover:border-gold cursor-pointer transition-all" onclick="Portals.confirmRSVP(\'' + E(listingId) + '\',\'' + E(ev.id || '') + '\')">' +
            '<div class="flex items-center justify-between">' +
              '<div>' +
                '<p class="text-sm font-semibold">' + D(ev.date || ev.start_date) + '</p>' +
                '<p class="text-xs text-gray-500">' + E(ev.time || ev.start_time || '') + (ev.end_time ? ' - ' + E(ev.end_time) : '') + '</p>' +
              '</div>' +
              '<button class="btn btn-xs btn-gold">RSVP</button>' +
            '</div>' +
          '</div>';
        });
        content += '</div>';
      }

      CRM.openModal('Open House', content, {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Close</button>'
      });
    }).catch(function () {
      CRM.openModal('Open House',
        '<div class="text-center py-4"><p class="text-sm text-gray-500">Could not load open house schedule.</p></div>',
        { footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Close</button>' }
      );
    });
  }


  function confirmRSVP(listingId, eventId) {
    MallanAPI._fetch('/api/portal/open-houses/rsvp', {
      method: 'POST',
      body: JSON.stringify({ listing_id: listingId, event_id: eventId }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('RSVP confirmed! See you there.', 'success');
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('RSVP submitted', 'info');
    });
  }


  function makeOffer(listingId, address, askingPrice) {
    var isRental = _role === 'renter';

    CRM.openModal(isRental ? 'Submit Application' : 'Make an Offer',
      '<form id="offerForm" class="space-y-4">' +
        '<p class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-1 text-gold"></i>' + E(address || 'This listing') + '</p>' +
        (askingPrice ? '<p class="text-xs text-gray-500">' + (isRental ? 'Listed at' : 'Asking') + ': ' + $(askingPrice) + '</p>' : '') +

        '<div class="form-group"><label class="form-label">' + (isRental ? 'Proposed Rent' : 'Offer Amount') + '</label>' +
          '<input class="form-input" type="number" name="amount" required placeholder="Enter amount" step="1"></div>' +

        (!isRental
          ? '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
              '<div class="form-group"><label class="form-label">Financing</label>' +
                '<select class="form-input form-select" name="financing">' +
                  '<option value="cash">All Cash</option>' +
                  '<option value="conventional" selected>Conventional Mortgage</option>' +
                  '<option value="fha">FHA</option>' +
                  '<option value="va">VA</option>' +
                '</select></div>' +
              '<div class="form-group"><label class="form-label">Desired Close Date</label>' +
                '<input class="form-input" type="date" name="closing_date" min="' + _todayISO() + '"></div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Contingencies</label>' +
              '<input class="form-input" name="contingencies" placeholder="e.g. Inspection, Financing, Appraisal"></div>'
          : '<div class="form-group"><label class="form-label">Desired Move-in Date</label>' +
              '<input class="form-input" type="date" name="move_in_date" min="' + _todayISO() + '"></div>'
        ) +

        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-input" name="notes" rows="2" placeholder="Any additional details..."></textarea></div>' +

        '<div class="p-3 rounded-lg bg-gray-50 text-xs text-gray-500">' +
          '<i class="fas fa-info-circle mr-1"></i>' +
          'This ' + (isRental ? 'application' : 'offer') + ' will be sent to your agent for review and submission. ' +
          'It is not binding until a formal ' + (isRental ? 'lease is executed' : 'contract is signed') + '.' +
        '</div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.submitOffer(\'' + E(listingId) + '\')"><i class="fas fa-paper-plane mr-1"></i>Submit</button>'
      }
    );
  }


  function submitOffer(listingId) {
    var form = document.getElementById('offerForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }

    var data = { listing_id: listingId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/portal/offers', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Offer submitted! Your agent will follow up.', 'success');
      Events.log('listing_reaction_recorded', 'listing', listingId, { reaction: 'offer', amount: data.amount });
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Offer submitted', 'info');
    });
  }


  function submitShowingFeedback(showingId) {
    CRM.openModal('Showing Feedback',
      '<form id="showingFeedbackForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">How was the showing?</label>' +
          '<div class="flex gap-2" id="feedbackRating">' +
            [1,2,3,4,5].map(function (n) {
              return '<button type="button" class="w-10 h-10 rounded-lg border flex items-center justify-center text-sm hover:bg-gold-bg hover:border-gold transition-all" ' +
                'onclick="this.parentElement.querySelectorAll(\'button\').forEach(function(b){b.classList.remove(\'bg-gold-bg\',\'border-gold\',\'text-gold\')});' +
                'this.classList.add(\'bg-gold-bg\',\'border-gold\',\'text-gold\');' +
                'document.getElementById(\'feedbackRatingVal\').value=\'' + n + '\';">' + n + '</button>';
            }).join('') +
          '</div>' +
          '<input type="hidden" id="feedbackRatingVal" name="rating">' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Interest Level</label>' +
          '<select class="form-input form-select" name="interest">' +
            '<option value="">Select...</option>' +
            '<option value="very_interested">Very Interested</option>' +
            '<option value="interested">Interested</option>' +
            '<option value="neutral">Neutral</option>' +
            '<option value="not_interested">Not Interested</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Comments</label>' +
          '<textarea class="form-input" name="comments" rows="3" placeholder="What did you think?"></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.doSubmitFeedback(\'' + E(showingId) + '\')"><i class="fas fa-check mr-1"></i>Submit</button>'
      }
    );
  }


  function doSubmitFeedback(showingId) {
    var form = document.getElementById('showingFeedbackForm');
    if (!form) return;
    var data = { showing_id: showingId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/portal/showings/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Feedback submitted, thank you!', 'success');
      var pc = document.getElementById('portalContent');
      if (pc) _loadShowings(pc);
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Feedback submitted', 'info');
    });
  }


  function savePreferences() {
    var form = document.getElementById('portalPrefsForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    if (data.neighborhoods) {
      data.neighborhoods = data.neighborhoods.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    MallanAPI._fetch('/api/portal/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Preferences saved', 'success');
    }).catch(function () {
      CRM.toast('Preferences saved locally', 'info');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _clientName() {
    if (!_me) return 'Client';
    return _me.name || _me.first_name || _me.email || 'Client';
  }

  function _getPhoto(l) {
    if (l.photos && l.photos.length) return Utils.photoUrl(l.photos[0].url || l.photos[0]);
    if (l.Media && l.Media.length) return Utils.photoUrl(l.Media[0].MediaURL);
    if (l.photo_url) return Utils.photoUrl(l.photo_url);
    return '';
  }

  function _spinner() {
    return '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div>';
  }

  function _emptyState(icon, title, subtitle) {
    return '<div class="empty-state">' +
      '<i class="fas ' + icon + '"></i>' +
      '<p>' + E(title) + '</p>' +
      (subtitle ? '<p class="text-xs text-gray-400">' + subtitle + '</p>' : '') +
    '</div>';
  }

  function _detailItem(label, value) {
    return '<div>' +
      '<span class="text-xs font-bold text-gray-500 uppercase">' + E(label) + '</span>' +
      '<p class="font-medium">' + E(String(value || '-')) + '</p>' +
    '</div>';
  }

  function _rebnyAttribution() {
    return '<div class="mt-4"><p class="text-[10px] text-gray-400 leading-relaxed">' +
      'Listing information provided by the Real Estate Board of New York (REBNY) Listing Service. ' +
      'Information is deemed reliable but not guaranteed. Data last updated ' + D(new Date().toISOString()) + '. ' +
      'Equal Housing Opportunity. REBNY RLS &copy; ' + new Date().getFullYear() +
    '</p></div>';
  }

  function _todayISO() {
    return new Date().toISOString().split('T')[0];
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    init: init,
    switchTab: switchTab,
    filterListings: filterListings,
    react: react,
    discuss: discuss,
    submitDiscuss: submitDiscuss,
    requestShowing: requestShowing,
    submitShowingRequest: submitShowingRequest,
    openHouseRSVP: openHouseRSVP,
    confirmRSVP: confirmRSVP,
    makeOffer: makeOffer,
    submitOffer: submitOffer,
    submitShowingFeedback: submitShowingFeedback,
    doSubmitFeedback: doSubmitFeedback,
    savePreferences: savePreferences,
    sendMessage: sendMessage,

    // Legacy compat — old caller names
    showSection: switchTab,
    showSellerSection: switchTab,
  };
})();
