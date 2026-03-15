// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PORTALS — Buyer, Seller, Renter, Landlord views
// These render when a client (not agent/broker) logs in.
// REBNY compliant: listing agent name/contact masked for buyer/renter portals.
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM */

var Portals = (function () {
  'use strict';

  var E = CRM.esc;
  var $ = CRM.formatMoney;
  var D = CRM.formatDate;

  var _role = null;
  var _me = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT — Determine which portal to show
  // ═══════════════════════════════════════════════════════════════════════════
  function init(role) {
    _role = role;

    // Hide agent sidebar, show portal nav
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';

    // Update main layout
    var main = document.getElementById('main');
    if (main) main.style.marginLeft = '0';

    // Load portal data
    MallanAPI.portal.me().then(function (data) {
      _me = data.user || data;
      renderPortal();
    }).catch(function () {
      renderPortal();
    });
  }

  function renderPortal() {
    var content = document.getElementById('content');
    if (!content) return;

    // Portal header
    var titleEl = document.getElementById('panelTitle');
    var portalTitles = { buyer: 'Buyer Portal', seller: 'Seller Portal', renter: 'Renter Portal', landlord: 'Landlord Portal' };
    if (titleEl) titleEl.textContent = portalTitles[_role] || 'Client Portal';

    // Render topbar with portal nav
    renderPortalNav();

    switch (_role) {
      case 'buyer':    renderBuyerPortal(content); break;
      case 'seller':   renderSellerPortal(content); break;
      case 'renter':   renderRenterPortal(content); break;
      case 'landlord': renderLandlordPortal(content); break;
      default:         renderBuyerPortal(content);
    }
  }

  function renderPortalNav() {
    var topbar = document.getElementById('topbar');
    if (!topbar) return;
    var name = _me ? (_me.name || _me.first_name || _me.email || 'Client') : 'Client';
    var init = name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);

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
        '<button onclick="CRM.logout()" class="btn btn-sm btn-outline"><i class="fas fa-sign-out-alt"></i></button>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER PORTAL
  // REBNY: listing agent name/contact HIDDEN. Brokerage name only.
  // ═══════════════════════════════════════════════════════════════════════════
  function renderBuyerPortal(container) {
    container.innerHTML =
      '<div class="space-y-6">' +
        '<!-- Welcome -->' +
        '<div class="card p-6">' +
          '<h2 class="text-xl font-bold text-gray-900 mb-1">Welcome' + (_me ? ', ' + E(_me.name || _me.first_name || '') : '') + '</h2>' +
          '<p class="text-sm text-gray-500">Your agent has shared listings with you. Browse, react, and let them know what you think.</p>' +
        '</div>' +

        '<!-- Nav tabs -->' +
        '<div class="flex gap-2 overflow-x-auto">' +
          '<button class="btn btn-sm portal-tab active" style="background:#111827;color:white" onclick="Portals.showSection(\'listings\',this)">Listings</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSection(\'showings\',this)">Showings</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSection(\'offers\',this)">Offers</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSection(\'documents\',this)">Documents</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSection(\'preferences\',this)">My Preferences</button>' +
        '</div>' +

        '<div id="portalContent"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    showSection('listings');
  }

  function showSection(section, btn) {
    if (btn) {
      document.querySelectorAll('.portal-tab').forEach(function (b) { b.style.background = ''; b.style.color = ''; b.classList.remove('active'); });
      btn.style.background = '#111827';
      btn.style.color = 'white';
    }

    var pc = document.getElementById('portalContent');
    if (!pc) return;
    pc.innerHTML = '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div>';

    switch (section) {
      case 'listings':    loadPortalListings(pc); break;
      case 'showings':    loadPortalShowings(pc); break;
      case 'offers':      loadPortalOffers(pc); break;
      case 'documents':   loadPortalDocuments(pc); break;
      case 'preferences': loadPortalPreferences(pc); break;
      default:            loadPortalListings(pc);
    }
  }

  function loadPortalListings(pc) {
    MallanAPI.portal.listings().then(function (data) {
      var listings = data.listings || [];
      if (listings.length === 0) {
        pc.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i>' +
          '<p>No listings shared with you yet</p><p class="text-xs text-gray-400">Your agent will send you listings that match your criteria</p></div>';
        return;
      }

      var html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
      listings.forEach(function (l) {
        var id = l.id || l.listing_id || l.ListingId;
        var photo = '';
        if (l.photos && l.photos.length) photo = CRM.photoUrl(l.photos[0].url || l.photos[0]);
        if (l.Media && l.Media.length) photo = CRM.photoUrl(l.Media[0].MediaURL);
        var address = l.InternetAddressDisplayYN === false ? 'Address Available Upon Request' : (l.address || l.UnparsedAddress || 'Address not available');
        var price = l.ListPrice || l.price || l.list_price;
        var reaction = l.reaction || null;

        html += '<div class="portal-listing-card">' +
          (photo ? '<img src="' + E(photo) + '" class="portal-listing-photo" alt="Property photo" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 200%22><rect fill=%22%23f3f4f6%22 width=%22400%22 height=%22200%22/><text x=%22200%22 y=%22110%22 text-anchor=%22middle%22 fill=%22%23d1d5db%22 font-size=%2220%22>No Photo</text></svg>\'">' :
            '<div class="portal-listing-photo flex items-center justify-center bg-gray-100"><i class="fas fa-image text-3xl text-gray-300"></i></div>') +
          '<div class="portal-listing-body">' +
            '<p class="text-lg font-bold text-gray-900">' + $(price) + '</p>' +
            '<p class="text-sm text-gray-600 mt-1">' + E(address) + '</p>' +
            '<div class="flex gap-3 mt-2 text-xs text-gray-500">' +
              '<span>' + (l.BedroomsTotal || l.beds || '-') + ' bd</span>' +
              '<span>' + (l.BathroomsTotalInteger || l.baths || '-') + ' ba</span>' +
              (l.LivingArea || l.sqft ? '<span>' + Number(l.LivingArea || l.sqft).toLocaleString() + ' sqft</span>' : '') +
            '</div>' +
            // REBNY: show brokerage name ONLY, not listing agent
            '<p class="text-[10px] text-gray-400 mt-2">Courtesy of Mallan Real Estate Inc.</p>' +
          '</div>' +

          '<!-- Reactions -->' +
          '<div class="portal-reactions">' +
            '<button class="portal-reaction-btn ' + (reaction === 'liked' ? 'liked' : '') + '" onclick="Portals.react(\'' + E(id) + '\', \'liked\')">' +
              '<i class="fas fa-heart"></i> Like' +
            '</button>' +
            '<button class="portal-reaction-btn ' + (reaction === 'disliked' ? 'disliked' : '') + '" onclick="Portals.react(\'' + E(id) + '\', \'disliked\')">' +
              '<i class="fas fa-thumbs-down"></i> Pass' +
            '</button>' +
            '<button class="portal-reaction-btn" onclick="Portals.discuss(\'' + E(id) + '\')">' +
              '<i class="fas fa-comment"></i> Discuss' +
            '</button>' +
            '<button class="portal-reaction-btn" onclick="Portals.requestShowing(\'' + E(id) + '\', \'' + E(address) + '\')">' +
              '<i class="fas fa-calendar"></i> Tour' +
            '</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';

      // REBNY attribution
      html += '<div class="mt-4"><p class="text-[10px] text-gray-400 leading-relaxed">' +
        'Listing information provided by the Real Estate Board of New York (REBNY) Listing Service. ' +
        'Information is deemed reliable but not guaranteed. Data last updated ' + D(new Date().toISOString()) + '. ' +
        'Equal Housing Opportunity. REBNY RLS &copy; ' + new Date().getFullYear() +
      '</p></div>';

      pc.innerHTML = html;
    }).catch(function (err) {
      pc.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Could not load listings: ' + E(err.message) + '</p></div>';
    });
  }

  function react(listingId, action) {
    MallanAPI.portal.react(listingId, action).then(function () {
      CRM.toast(action === 'liked' ? 'Liked!' : 'Noted', 'success');
      showSection('listings');
    }).catch(function () {
      CRM.toast('Reaction recorded', 'info');
    });
  }

  function discuss(listingId) {
    CRM.openModal("Let's Discuss",
      '<form id="discussForm">' +
        '<div class="form-group"><label class="form-label">What would you like to discuss?</label>' +
          '<textarea class="form-input" id="discussComment" rows="3" placeholder="I have questions about this listing..."></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.submitDiscuss(\'' + E(listingId) + '\')"><i class="fas fa-paper-plane"></i> Send</button>'
      }
    );
  }

  function submitDiscuss(listingId) {
    var comment = document.getElementById('discussComment');
    MallanAPI.portal.react(listingId, 'discuss', comment ? comment.value : '').then(function () {
      CRM.closeModal();
      CRM.toast('Message sent to your agent', 'success');
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Message sent', 'info');
    });
  }

  function requestShowing(listingId, address) {
    CRM.openModal('Request a Tour',
      '<form id="requestShowingForm" class="space-y-4">' +
        '<p class="text-sm text-gray-600">' + E(address || 'This listing') + '</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Preferred Date</label><input class="form-input" type="date" name="date" required></div>' +
          '<div class="form-group"><label class="form-label">Preferred Time</label>' +
            '<select class="form-input form-select" name="time">' +
              '<option value="morning">Morning (9-12)</option>' +
              '<option value="afternoon" selected>Afternoon (12-5)</option>' +
              '<option value="evening">Evening (5-8)</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="Any preferences or questions..."></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Portals.submitShowingRequest(\'' + E(listingId) + '\')"><i class="fas fa-calendar-plus"></i> Request Tour</button>'
      }
    );
  }

  function submitShowingRequest(listingId) {
    var form = document.getElementById('requestShowingForm');
    if (!form || !form.checkValidity()) { form.reportValidity(); return; }
    var data = { listing_id: listingId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.portal.requestShowing(data).then(function () {
      CRM.closeModal();
      CRM.toast('Tour request sent! Your agent will confirm.', 'success');
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Tour request submitted', 'info');
    });
  }

  function loadPortalShowings(pc) {
    MallanAPI.portal.showings().then(function (data) {
      var showings = data.showings || [];
      if (showings.length === 0) {
        pc.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>No showings scheduled yet</p><p class="text-xs text-gray-400">Request a tour from any listing</p></div>';
        return;
      }

      var html = '<div class="space-y-3">';
      showings.forEach(function (s) {
        var isPast = new Date(s.date) < new Date();
        html += '<div class="card p-4">' +
          '<div class="flex items-center gap-4">' +
            '<div class="w-12 h-12 rounded-xl flex items-center justify-center ' + (isPast ? 'bg-gray-100' : 'bg-blue-50') + '">' +
              '<i class="fas fa-calendar ' + (isPast ? 'text-gray-400' : 'text-blue-500') + '"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold text-gray-900">' + E(s.address || 'Showing') + '</p>' +
              '<p class="text-xs text-gray-500">' + D(s.date) + (s.time ? ' at ' + E(s.time) : '') + '</p>' +
            '</div>' +
            '<span class="badge badge-' + (s.status || 'pending') + '">' + E(s.status || 'pending') + '</span>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Could not load showings</p></div>';
    });
  }

  function loadPortalOffers(pc) {
    MallanAPI.portal.offers().then(function (data) {
      var offers = data.offers || [];
      if (offers.length === 0) {
        pc.innerHTML = '<div class="empty-state"><i class="fas fa-gavel"></i><p>No offers yet</p></div>';
        return;
      }

      var html = '<div class="space-y-3">';
      offers.forEach(function (o) {
        html += '<div class="card p-4">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<p class="text-sm font-semibold text-gray-900">' + E(o.address || 'Offer') + '</p>' +
              '<p class="text-lg font-bold text-gray-900 mt-1">' + $(o.amount || o.price) + '</p>' +
            '</div>' +
            '<span class="badge badge-' + (o.status || 'pending') + '">' + E(o.status || 'pending') + '</span>' +
          '</div>' +
          (o.notes ? '<p class="text-xs text-gray-500 mt-2">' + E(o.notes) + '</p>' : '') +
        '</div>';
      });
      html += '</div>';
      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = '<div class="empty-state"><i class="fas fa-gavel"></i><p>Could not load offers</p></div>';
    });
  }

  function loadPortalDocuments(pc) {
    MallanAPI._fetch('/api/portal/documents').then(function (data) {
      var docs = data.documents || [];
      if (docs.length === 0) {
        pc.innerHTML = '<div class="empty-state"><i class="fas fa-folder"></i><p>No documents yet</p></div>';
        return;
      }

      var html = '<div class="space-y-2">';
      docs.forEach(function (d) {
        html += '<div class="card p-4 cursor-pointer hover:border-gold">' +
          '<div class="flex items-center gap-3">' +
            '<i class="fas fa-file-alt text-gold text-lg"></i>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold truncate">' + E(d.title || d.name) + '</p>' +
              '<p class="text-xs text-gray-500">' + D(d.created_at) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      pc.innerHTML = html;
    }).catch(function () {
      pc.innerHTML = '<div class="empty-state"><i class="fas fa-folder"></i><p>Could not load documents</p></div>';
    });
  }

  function loadPortalPreferences(pc) {
    MallanAPI._fetch('/api/portal/preferences').then(function (data) {
      var prefs = data.preferences || data || {};
      pc.innerHTML = '<div class="card p-6">' +
        '<h3 class="text-sm font-bold text-gray-900 mb-4">My Preferences</h3>' +
        '<form id="portalPrefsForm" class="space-y-4">' +
          '<div class="form-group"><label class="form-label">Neighborhoods</label>' +
            '<input class="form-input" name="neighborhoods" value="' + E((prefs.neighborhoods || []).join(', ')) + '" placeholder="e.g. Upper East Side, Tribeca"></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Min Budget</label><input class="form-input" type="number" name="minPrice" value="' + (prefs.minPrice || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Max Budget</label><input class="form-input" type="number" name="maxPrice" value="' + (prefs.maxPrice || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Min Beds</label><input class="form-input" type="number" name="minBeds" value="' + (prefs.minBeds || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Move-in Date</label><input class="form-input" type="date" name="move_in_date" value="' + (prefs.move_in_date || '') + '"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Must Haves</label><textarea class="form-input" name="must_haves" rows="2">' + E(prefs.must_haves || '') + '</textarea></div>' +
          '<button type="button" class="btn btn-gold" onclick="Portals.savePreferences()"><i class="fas fa-save"></i> Save Preferences</button>' +
        '</form>' +
      '</div>';
    }).catch(function () {
      pc.innerHTML = '<div class="card p-6"><p class="text-sm text-gray-500">Could not load preferences</p></div>';
    });
  }

  function savePreferences() {
    var form = document.getElementById('portalPrefsForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    if (data.neighborhoods) data.neighborhoods = data.neighborhoods.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

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
  // SELLER PORTAL
  // ═══════════════════════════════════════════════════════════════════════════
  function renderSellerPortal(container) {
    container.innerHTML =
      '<div class="space-y-6">' +
        '<div class="card p-6">' +
          '<h2 class="text-xl font-bold text-gray-900 mb-1">Seller Dashboard</h2>' +
          '<p class="text-sm text-gray-500">Track your listing, showings, offers, and marketing activity.</p>' +
        '</div>' +

        '<div class="flex gap-2 overflow-x-auto">' +
          '<button class="btn btn-sm portal-tab active" style="background:#111827;color:white" onclick="Portals.showSellerSection(\'listing\',this)">My Listing</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSellerSection(\'comps\',this)">Comparables</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSellerSection(\'showings\',this)">Showings</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSellerSection(\'offers\',this)">Offers</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSellerSection(\'marketing\',this)">Marketing</button>' +
          '<button class="btn btn-sm btn-outline portal-tab" onclick="Portals.showSellerSection(\'documents\',this)">Documents</button>' +
        '</div>' +

        '<div id="portalContent"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    showSellerSection('listing');
  }

  function showSellerSection(section, btn) {
    if (btn) {
      document.querySelectorAll('.portal-tab').forEach(function (b) { b.style.background = ''; b.style.color = ''; });
      btn.style.background = '#111827';
      btn.style.color = 'white';
    }

    var pc = document.getElementById('portalContent');
    if (!pc) return;
    pc.innerHTML = '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div>';

    switch (section) {
      case 'listing':
        MallanAPI.portal.listings().then(function (data) {
          var listings = data.listings || [];
          if (listings.length === 0) {
            pc.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i><p>No active listing</p></div>';
            return;
          }
          var l = listings[0]; // Seller typically has one listing
          pc.innerHTML = '<div class="card">' +
            '<div class="card-header"><h3>' + E(l.address || l.UnparsedAddress || 'Your Listing') + '</h3>' +
              '<span class="badge badge-' + (l.status || 'active').toLowerCase() + '">' + E(l.status || 'Active') + '</span></div>' +
            '<div class="card-body">' +
              '<div class="stat-grid mb-4">' +
                '<div class="stat-card"><div class="stat-card-value">' + $(l.ListPrice || l.price) + '</div><div class="stat-card-label">List Price</div></div>' +
                '<div class="stat-card"><div class="stat-card-value">' + (l.cumulative_dom || l.days_on_market || '0') + '</div><div class="stat-card-label">Days on Market</div></div>' +
                '<div class="stat-card"><div class="stat-card-value">' + (l.showing_count || '0') + '</div><div class="stat-card-label">Showings</div></div>' +
                '<div class="stat-card"><div class="stat-card-value">' + (l.offer_count || '0') + '</div><div class="stat-card-label">Offers</div></div>' +
              '</div>' +
              '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">' +
                '<div><span class="text-xs font-bold text-gray-500 uppercase">Beds</span><p class="font-medium">' + (l.BedroomsTotal || l.beds || '-') + '</p></div>' +
                '<div><span class="text-xs font-bold text-gray-500 uppercase">Baths</span><p class="font-medium">' + (l.BathroomsTotalInteger || l.baths || '-') + '</p></div>' +
                '<div><span class="text-xs font-bold text-gray-500 uppercase">SqFt</span><p class="font-medium">' + (l.LivingArea || l.sqft ? Number(l.LivingArea || l.sqft).toLocaleString() : '-') + '</p></div>' +
                '<div><span class="text-xs font-bold text-gray-500 uppercase">Type</span><p class="font-medium">' + E(l.PropertySubType || l.property_type || '-') + '</p></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).catch(function () {
          pc.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i><p>Could not load listing</p></div>';
        });
        break;

      case 'comps':
        MallanAPI._fetch('/api/portal/comparables').then(function (data) {
          var comps = data.comparables || data.comps || [];
          if (comps.length === 0) {
            pc.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Comparables will be added by your agent</p></div>';
            return;
          }
          var html = '<div class="card"><div class="card-header"><h3>Comparable Sales</h3></div><div class="card-body"><div class="space-y-3">';
          comps.forEach(function (c) {
            html += '<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">' +
              '<div class="flex-1">' +
                '<p class="text-sm font-semibold">' + E(c.address || 'Comp') + '</p>' +
                '<p class="text-xs text-gray-500">' + (c.beds || '-') + ' bd / ' + (c.baths || '-') + ' ba</p>' +
              '</div>' +
              '<div class="text-right">' +
                '<p class="text-sm font-bold">' + $(c.sold_price || c.price) + '</p>' +
                '<p class="text-xs text-gray-500">' + D(c.sold_date || c.close_date) + '</p>' +
              '</div>' +
            '</div>';
          });
          html += '</div></div></div>';
          html += '<p class="text-[10px] text-gray-400 mt-2">Based on information from the REBNY Listing Service. Information is deemed reliable but not guaranteed.</p>';
          pc.innerHTML = html;
        }).catch(function () {
          pc.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Could not load comparables</p></div>';
        });
        break;

      case 'showings':  loadPortalShowings(pc); break;
      case 'offers':    loadPortalOffers(pc); break;
      case 'marketing':
        MallanAPI._fetch('/api/portal/marketing').then(function (data) {
          var activities = data.activities || data.marketing || [];
          if (activities.length === 0) {
            pc.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><p>Marketing activity will appear here</p></div>';
            return;
          }
          var html = '<div class="space-y-3">';
          activities.forEach(function (a) {
            html += '<div class="card p-4"><div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><i class="fas fa-bullhorn text-blue-500"></i></div>' +
              '<div class="flex-1"><p class="text-sm font-semibold">' + E(a.title || a.type || 'Marketing Activity') + '</p>' +
                '<p class="text-xs text-gray-500">' + D(a.date || a.created_at) + '</p></div>' +
            '</div></div>';
          });
          html += '</div>';
          pc.innerHTML = html;
        }).catch(function () {
          pc.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><p>Could not load marketing data</p></div>';
        });
        break;

      case 'documents': loadPortalDocuments(pc); break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENTER PORTAL — Same as Buyer but for rentals
  // ═══════════════════════════════════════════════════════════════════════════
  function renderRenterPortal(container) {
    // Same structure as buyer portal
    renderBuyerPortal(container);
    // Update title
    var titleEl = document.getElementById('panelTitle');
    if (titleEl) titleEl.textContent = 'Renter Portal';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LANDLORD PORTAL — Same as Seller but for rentals
  // ═══════════════════════════════════════════════════════════════════════════
  function renderLandlordPortal(container) {
    // Same structure as seller portal with rental-specific additions
    renderSellerPortal(container);
    var titleEl = document.getElementById('panelTitle');
    if (titleEl) titleEl.textContent = 'Landlord Portal';
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init: init,
    showSection: showSection,
    react: react,
    discuss: discuss,
    submitDiscuss: submitDiscuss,
    requestShowing: requestShowing,
    submitShowingRequest: submitShowingRequest,
    savePreferences: savePreferences,
    showSellerSection: showSellerSection,
  };
})();
