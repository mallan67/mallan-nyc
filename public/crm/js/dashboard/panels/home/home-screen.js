var HomeScreen = (function () {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;

  function render() {
    CRM.setPanelTitle('Dashboard');
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    // Fetch data for both cards
    Promise.all([
      MallanAPI._fetch('/api/crm/sales/sellers').catch(function () { return { sellers: [] }; }),
      MallanAPI._fetch('/api/crm/sales/buyers').catch(function () { return { buyers: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/landlords').catch(function () { return { landlords: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/tenants').catch(function () { return { tenants: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/prospects').catch(function () { return { prospects: [] }; }),
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
    ]).then(function (results) {
      _renderCards(c, results);
    }).catch(function () {
      c.innerHTML = '<div class="text-center py-20 text-gray-500">Unable to load dashboard data</div>';
    });
  }

  function _renderCards(c, results) {
    var sellers = results[0].sellers || [];
    var buyers = results[1].buyers || results[1].clients || [];
    var landlords = results[2].landlords || results[2].clients || [];
    var tenants = results[3].tenants || results[3].clients || [];
    var prospects = results[4].prospects || results[4].clients || [];
    var deals = results[5].deals || [];

    // Calculate counts for Sales card
    var sellersNeedingResponse = sellers.filter(function (s) { return s.unread_comments > 0 || s.pending_approvals > 0; }).length;
    var buyersViewedToday = buyers.filter(function (b) {
      var d = b.last_viewed_listing_at || b.last_login_at;
      return d && new Date(d).toDateString() === new Date().toDateString();
    }).length;
    var quietBuyers = buyers.filter(function (b) {
      var d = b.last_login_at;
      if (!d) return true;
      return (Date.now() - new Date(d).getTime()) > 7 * 86400000; // 7 days
    }).length;
    var pendingOffers = deals.filter(function (d) { return d.status === 'submitted' || d.status === 'pending'; }).length;

    // Calculate counts for Rentals card
    var now = Date.now();
    var landlordRelist = landlords.filter(function (l) {
      return l.relist_reminder_date && new Date(l.relist_reminder_date).getTime() < now;
    }).length;
    var tenants90d = tenants.filter(function (t) {
      var end = t.lease_end_date;
      if (!end) return false;
      var diff = (new Date(end).getTime() - now) / 86400000;
      return diff > 0 && diff <= 90;
    }).length;
    var prospectsToReengage = prospects.filter(function (p) {
      var d30 = p.outreach_30d_date;
      return d30 && new Date(d30).getTime() < now && !p.last_response_at;
    }).length;
    var nonRenewing = tenants.filter(function (t) { return t.renewal_status === 'not_renewing'; }).length;

    // Build HTML — two large cards
    var html = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">';

    // SALES CARD
    html += '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onclick="Router.navigate(\'/sales/sellers\')">' +
      '<div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i class="fas fa-home text-white text-lg"></i></div>' +
          '<div><h2 class="text-lg font-bold text-white">Seller / Buyer</h2><p class="text-blue-200 text-xs">Sales CRM</p></div>' +
        '</div>' +
      '</div>' +
      '<div class="p-6 space-y-3">';

    // Sales stats
    html += _statRow('fa-exclamation-circle', 'text-red-500', 'Sellers needing response', sellersNeedingResponse, sellersNeedingResponse > 0 ? 'text-red-600 font-bold' : '');
    html += _statRow('fa-eye', 'text-blue-500', 'Buyers who viewed listings today', buyersViewedToday, buyersViewedToday > 0 ? 'text-blue-600 font-bold' : '');
    html += _statRow('fa-moon', 'text-gray-400', 'Quiet buyers (no login 7d+)', quietBuyers, quietBuyers > 5 ? 'text-amber-600 font-bold' : '');
    html += _statRow('fa-gavel', 'text-green-500', 'Pending offers', pendingOffers, pendingOffers > 0 ? 'text-green-600 font-bold' : '');
    html += _statRow('fa-users', 'text-gray-500', 'Total sellers', sellers.length, '');
    html += _statRow('fa-user-tag', 'text-gray-500', 'Total buyers', buyers.length, '');

    html += '</div></div>';

    // RENTALS CARD
    html += '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onclick="Router.navigate(\'/rentals/landlords\')">' +
      '<div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i class="fas fa-key text-white text-lg"></i></div>' +
          '<div><h2 class="text-lg font-bold text-white">Landlord / Tenant</h2><p class="text-emerald-200 text-xs">Rentals CRM</p></div>' +
        '</div>' +
      '</div>' +
      '<div class="p-6 space-y-3">';

    // Rental stats
    html += _statRow('fa-bell', 'text-amber-500', 'Landlords needing relist', landlordRelist, landlordRelist > 0 ? 'text-amber-600 font-bold' : '');
    html += _statRow('fa-calendar-alt', 'text-blue-500', 'Tenants in 90-day window', tenants90d, tenants90d > 0 ? 'text-blue-600 font-bold' : '');
    html += _statRow('fa-redo', 'text-purple-500', 'Prospects to re-engage', prospectsToReengage, prospectsToReengage > 0 ? 'text-purple-600 font-bold' : '');
    html += _statRow('fa-times-circle', 'text-red-500', 'Non-renewing tenants', nonRenewing, nonRenewing > 0 ? 'text-red-600 font-bold' : '');
    html += _statRow('fa-key', 'text-gray-500', 'Total landlords', landlords.length, '');
    html += _statRow('fa-user-check', 'text-gray-500', 'Total tenants', tenants.length, '');

    html += '</div></div>';
    html += '</div>';

    c.innerHTML = html;
  }

  function _statRow(icon, iconColor, label, value, valueClass) {
    return '<div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">' +
      '<div class="flex items-center gap-3">' +
        '<i class="fas ' + icon + ' ' + iconColor + ' text-sm w-5 text-center"></i>' +
        '<span class="text-sm text-gray-600">' + E(label) + '</span>' +
      '</div>' +
      '<span class="text-lg font-bold ' + (valueClass || 'text-gray-900') + '">' + value + '</span>' +
    '</div>';
  }

  return { render: render };
})();
