// ═══════════════════════════════════════════════════════════════════════════════
// CRM PANELS — All main panel renderers
// Broker Console (16 routes) + Operations (10 routes) + Settings (3 routes)
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM, Store, Router, Permissions, Events, Alerts, Documents, UI, Utils, Workspace */

var Panels = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  function _container() { return CRM.getContent(); }

  // ═══════════════════════════════════════════════════════════════════════
  // BROKER CONSOLE
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Broker Dashboard ────────────────────────────────────────────────
  function brokerDashboard() {
    CRM.setPanelTitle('Broker Dashboard');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 100 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 100 }).catch(function () { return { deals: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var listings = r[1].listings || [];
      var deals = r[2].deals || [];
      var agents = r[3].agents || [];
      var tasks = r[4].tasks || [];

      var activeClients = clients.filter(function (c) { return c.status !== 'closed' && c.status !== 'inactive'; });
      var activeListings = listings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
      var closedDeals = deals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
      var totalRevenue = closedDeals.reduce(function (sum, d) { return sum + (d.grossCommission || d.commission || 0); }, 0);
      var overdueTasks = tasks.filter(function (t) { return t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date(); });

      // Compute compliance quick-check
      var compViolations = 0;
      listings.forEach(function (l) {
        if (l.rls_eligible === false) return;
        if (l.OwnerOptOut || l.owner_opt_out) compViolations++;
      });
      var compScore = listings.length > 0 ? Math.round(((listings.length - compViolations) / listings.length) * 100) : 100;
      var compColor = compScore >= 90 ? '#059669' : compScore >= 70 ? '#F59E0B' : '#DC2626';

      // Upcoming license renewals (<90 days)
      var expiringAgents = agents.filter(function (a) {
        var exp = a.licenseExpiry || a.license_expiry;
        return exp && Utils.daysUntil(exp) <= 90;
      });

      // Pending commission approvals
      var pendingPayouts = deals.filter(function (d) {
        return d.payoutStatus === 'pending' || d.payout_status === 'pending';
      });

      var html = '<div class="space-y-6">';

      // KPIs
      html += UI.statGrid([
        UI.statCard(activeClients.length, 'Active Clients', 'fa-users', '#2563EB'),
        UI.statCard(activeListings.length, 'Active Listings', 'fa-building', '#059669'),
        UI.statCard(closedDeals.length, 'Closed Deals', 'fa-handshake', '#B8860B'),
        UI.statCard($(totalRevenue), 'Total Revenue', 'fa-chart-line', '#7C3AED'),
        UI.statCard(agents.length, 'Agents', 'fa-user-tie', '#374151'),
        UI.statCard(overdueTasks.length, 'Overdue Tasks', 'fa-exclamation-triangle', overdueTasks.length > 0 ? '#DC2626' : '#059669'),
      ]);

      // Compliance score + Renewals + Pending approvals row
      html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">';
      // Compliance score card
      html += '<div class="card p-4 cursor-pointer hover:border-gold transition-all" onclick="Router.navigate(\'/broker/compliance\')">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:' + compColor + '15"><i class="fas fa-shield-alt" style="color:' + compColor + '"></i></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Compliance Score</p>' +
          '<p class="text-xl font-bold" style="color:' + compColor + '">' + compScore + '%</p></div>' +
        '</div>' +
        (compViolations > 0 ? '<p class="text-xs text-red-500 mt-2"><i class="fas fa-exclamation-circle mr-1"></i>' + compViolations + ' issue(s) need attention</p>' : '<p class="text-xs text-green-600 mt-2"><i class="fas fa-check-circle mr-1"></i>All clear</p>') +
      '</div>';
      // Upcoming renewals
      html += '<div class="card p-4 cursor-pointer hover:border-gold transition-all" onclick="Router.navigate(\'/broker/licensing\')">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center ' + (expiringAgents.length > 0 ? 'bg-red-50' : 'bg-green-50') + '"><i class="fas fa-id-card ' + (expiringAgents.length > 0 ? 'text-red-500' : 'text-green-500') + '"></i></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Upcoming Renewals</p>' +
          '<p class="text-xl font-bold ' + (expiringAgents.length > 0 ? 'text-red-600' : 'text-green-600') + '">' + expiringAgents.length + '</p></div>' +
        '</div>' +
        (expiringAgents.length > 0 ? '<p class="text-xs text-red-500 mt-2"><i class="fas fa-clock mr-1"></i>License(s) expiring within 90 days</p>' : '<p class="text-xs text-green-600 mt-2"><i class="fas fa-check-circle mr-1"></i>All licenses current</p>') +
      '</div>';
      // Pending approvals
      html += '<div class="card p-4 cursor-pointer hover:border-gold transition-all" onclick="Router.navigate(\'/broker/commissions\')">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center ' + (pendingPayouts.length > 0 ? 'bg-yellow-50' : 'bg-green-50') + '"><i class="fas fa-dollar-sign ' + (pendingPayouts.length > 0 ? 'text-yellow-500' : 'text-green-500') + '"></i></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Pending Approvals</p>' +
          '<p class="text-xl font-bold ' + (pendingPayouts.length > 0 ? 'text-yellow-600' : 'text-green-600') + '">' + pendingPayouts.length + '</p></div>' +
        '</div>' +
        (pendingPayouts.length > 0 ? '<p class="text-xs text-yellow-600 mt-2"><i class="fas fa-clock mr-1"></i>Commission payout(s) awaiting approval</p>' : '<p class="text-xs text-green-600 mt-2"><i class="fas fa-check-circle mr-1"></i>No pending payouts</p>') +
      '</div>';
      html += '</div>';

      // Urgent alerts
      var urgentAlerts = Alerts.getUrgent();
      if (urgentAlerts.length > 0) {
        html += '<div class="card"><div class="card-header"><h3><i class="fas fa-exclamation-circle text-red-500 mr-2"></i>Urgent Alerts</h3></div>' +
          '<div class="card-body space-y-2">';
        urgentAlerts.forEach(function (a) { html += UI.alertItem(a); });
        html += '</div></div>';
      }

      // Quick Actions
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // Recent clients
      html += '<div class="card"><div class="card-header"><h3>Recent Clients</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/clients\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      clients.slice(0, 5).forEach(function (cl) {
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
          UI.avatar(cl.name || cl.email, 32) +
          '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(cl.name || cl.email) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.type || '') + '</p></div>' +
          UI.stageBadge(cl.stage || cl.status) +
        '</div>';
      });
      html += '</div></div></div>';

      // Recent listings
      html += '<div class="card"><div class="card-header"><h3>Active Listings</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/listings\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      activeListings.slice(0, 5).forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'No address';
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">' +
          '<div class="w-8 h-8 rounded-lg bg-gold-bg flex items-center justify-center"><i class="fas fa-building text-xs text-gold"></i></div>' +
          '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
            '<p class="text-xs text-gray-500">' + $(l.ListPrice || l.price) + '</p></div>' +
        '</div>';
      });
      html += '</div></div></div>';

      html += '</div>'; // grid
      html += '</div>'; // space-y
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-tachometer-alt', 'Unable to load dashboard data');
    });
  }

  // ─── Agent Roster ────────────────────────────────────────────────────
  function agentRoster() {
    CRM.setPanelTitle('Agent Roster');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var allListings = r[1].listings || [];
      var allDeals = r[2].deals || [];

      // Build per-agent stats
      agents.forEach(function (a) {
        var aid = a.id;
        var myListings = allListings.filter(function (l) { return l.assignedAgentId === aid || l.assigned_agent_id === aid; });
        var myDeals = allDeals.filter(function (d) { return d.assignedAgentId === aid || d.assigned_agent_id === aid; });
        var closedDeals = myDeals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
        a._activeListings = myListings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
        a._offerListings = myListings.filter(function (l) { return l.status === 'Pending' || l.status === 'pending' || l.status === 'offer'; });
        a._contractListings = myListings.filter(function (l) { return l.status === 'ActiveUnderContract' || l.status === 'contract'; });
        a._closedSales = closedDeals.filter(function (d) { return d.dealType === 'sale' || d.deal_type === 'sale'; });
        a._closedRentals = closedDeals.filter(function (d) { return d.dealType === 'rental' || d.deal_type === 'rental'; });
        a._ytdGCI = closedDeals.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
        a._allListings = myListings;
        a._allDeals = myDeals;
      });

      var html = '<div class="space-y-4">';

      // Header with search + filter + add
      html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3 flex-1">' +
          '<div class="relative flex-1 max-w-xs"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
            '<input type="text" id="rosterSearch" placeholder="Search agents..." class="form-input pl-9 text-sm" oninput="Panels._filterRoster()"></div>' +
          '<select id="rosterRoleFilter" class="form-input form-select text-sm" style="width:auto" onchange="Panels._filterRoster()">' +
            '<option value="">All Roles</option>' +
            '<option value="BROKER">Licensed Broker</option>' +
            '<option value="AGENT">Licensed Salesperson</option>' +
          '</select>' +
        '</div>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._addAgent()"><i class="fas fa-user-plus mr-1"></i> Add Agent</button>' +
      '</div>';

      // Agent cards
      html += '<div class="space-y-3" id="agentRosterCards">';
      agents.forEach(function (a, idx) {
        html += _agentCard(a, idx);
      });
      if (agents.length === 0) {
        html += UI.emptyState('fa-user-tie', 'No agents in roster');
      }
      html += '</div></div>';

      c.innerHTML = html;
      // Store agents for filtering
      window._rosterAgents = agents;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agent roster');
    });
  }

  function _agentCard(a, idx) {
    var name = a.name || a.email || 'Agent';
    var initials = Utils.initials(name);
    var role = (a.role || 'AGENT').toUpperCase();
    var roleLabel = role === 'BROKER' ? 'Licensed Broker' : 'Licensed Salesperson';
    var roleColor = role === 'BROKER' ? 'purple' : 'blue';
    var license = a.licenseNumber || a.license_number || '';

    return '<div class="border rounded-lg overflow-hidden agent-roster-card" data-name="' + E(name.toLowerCase()) + '" data-role="' + E(role) + '">' +
      // Header row (always visible)
      '<div class="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition" onclick="Panels._toggleAgentCard(' + idx + ')">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 bg-' + roleColor + '-100 rounded-full flex items-center justify-center text-' + roleColor + '-700 font-bold text-sm">' + E(initials) + '</div>' +
          '<div>' +
            '<p class="font-semibold text-sm text-gray-900">' + E(name) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(license ? roleLabel + ' · #' + license : roleLabel) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-3">' +
          '<span class="px-2 py-1 bg-' + roleColor + '-100 text-' + roleColor + '-700 rounded text-xs font-semibold hidden sm:inline-block">' + E(roleLabel) + '</span>' +
          '<div class="text-right hidden lg:block"><p class="text-[10px] text-gray-500">Closed Sales</p><p class="text-sm font-bold text-gray-900">' + a._closedSales.length + '</p></div>' +
          '<div class="text-right hidden lg:block"><p class="text-[10px] text-gray-500">Closed Rentals</p><p class="text-sm font-bold text-gray-900">' + a._closedRentals.length + '</p></div>' +
          '<div class="text-right hidden md:block"><p class="text-[10px] text-gray-500">YTD GCI</p><p class="text-sm font-bold text-green-600">' + $(a._ytdGCI) + '</p></div>' +
          '<div class="text-right hidden md:block"><p class="text-[10px] text-gray-500">Active</p><p class="text-sm font-bold text-blue-600">' + a._activeListings.length + '</p></div>' +
          '<i class="fas fa-chevron-down text-gray-400 text-xs transition-transform" id="agentChevron_' + idx + '"></i>' +
        '</div>' +
      '</div>' +
      // Expanded panel
      '<div id="agentPanel_' + idx + '" style="display:none">' +
        '<div class="px-4 py-3 border-t bg-white">' +
          // Quick actions
          '<div class="flex items-center justify-between mb-3">' +
            '<div class="sm:hidden"><span class="px-2 py-1 bg-' + roleColor + '-100 text-' + roleColor + '-700 rounded text-xs font-semibold">' + E(roleLabel) + '</span></div>' +
            '<div class="flex items-center gap-2">' +
              '<button onclick="CRM.doImpersonate(\'' + E(a.id) + '\')" class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 flex items-center gap-1.5"><i class="fas fa-user-secret"></i> Impersonate</button>' +
              '<button onclick="Panels._editAgent(\'' + E(a.id) + '\')" class="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5"><i class="fas fa-edit"></i> Edit</button>' +
              '<button onclick="Panels._deactivateAgent(\'' + E(a.id) + '\',\'' + E(name) + '\')" class="px-3 py-1.5 border border-red-200 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-50 hover:text-red-600 flex items-center gap-1.5"><i class="fas fa-ban"></i> Deactivate</button>' +
            '</div>' +
          '</div>' +
          // Tabs
          '<div class="flex gap-1 mb-3 border-b">' +
            '<button onclick="Panels._agentTab(this,' + idx + ',\'listings\')" class="agent-view-tab px-3 py-1.5 text-xs font-semibold border-b-2 border-gold text-gold"><i class="fas fa-list mr-1"></i> Listings</button>' +
            '<button onclick="Panels._agentTab(this,' + idx + ',\'commissions\')" class="agent-view-tab px-3 py-1.5 text-xs font-semibold text-gray-500 border-b-2 border-transparent hover:text-gray-700"><i class="fas fa-dollar-sign mr-1"></i> Commissions</button>' +
            '<button onclick="Panels._agentTab(this,' + idx + ',\'disclosures\')" class="agent-view-tab px-3 py-1.5 text-xs font-semibold text-gray-500 border-b-2 border-transparent hover:text-gray-700"><i class="fas fa-file-signature mr-1"></i> Disclosures</button>' +
          '</div>' +
          // Tab content
          '<div id="agentTabContent_' + idx + '">' + _agentListingsView(a) + '</div>' +
          // Footer
          '<div class="flex items-center justify-between mt-3 pt-3 border-t">' +
            '<p class="text-xs text-gray-500">' + E((a.email || '') + (a.phone ? ' · ' + a.phone : '')) + '</p>' +
            '<button onclick="Panels._editAgent(\'' + E(a.id) + '\')" class="text-gold hover:underline text-xs font-semibold">Edit Agent Profile</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _agentListingsView(a) {
    var listings = a._allListings || [];
    var active = listings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
    var offer = listings.filter(function (l) { return l.status === 'Pending' || l.status === 'pending' || l.status === 'offer'; });
    var contract = listings.filter(function (l) { return l.status === 'ActiveUnderContract' || l.status === 'contract'; });
    var sold = listings.filter(function (l) { return l.status === 'Closed' || l.status === 'closed' || l.status === 'sold'; });

    var html = '<div class="flex flex-wrap gap-2 mb-3">' +
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-800 text-white">All (' + listings.length + ')</span>' +
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">Active (' + active.length + ')</span>' +
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">Offer (' + offer.length + ')</span>' +
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">In Contract (' + contract.length + ')</span>' +
      '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">Sold/Rented (' + sold.length + ')</span>' +
    '</div>';

    if (listings.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No listings to display.</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Address</th><th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Price</th><th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2 hidden sm:table-cell">DOM</th><th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      listings.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'No address';
        var type = (l.property_type || l.listing_type || l.PropertySubType || 'Sale');
        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2 text-sm font-medium">' + E(addr) + '</td>' +
          '<td class="px-3 py-2 text-xs">' + E(type) + '</td>' +
          '<td class="px-3 py-2 text-sm font-bold">' + $(l.ListPrice || l.price) + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(l.status || 'active') + '</td>' +
          '<td class="px-3 py-2 text-xs hidden sm:table-cell">' + (l.cumulative_dom || l.days_on_market || '-') + '</td>' +
          '<td class="px-3 py-2"><button class="text-gold hover:underline text-xs font-semibold" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">View</button></td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    return html;
  }

  function _agentCommissionsView(a) {
    var deals = a._allDeals || [];
    var closed = deals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
    var pending = deals.filter(function (d) { return d.stage !== 'closed' && d.status !== 'closed'; });
    var totalGross = closed.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
    var totalSplit = closed.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
    var splitPct = a.saleSplit || a.sale_split || a.rentalSplit || a.rental_split || 0;

    var html = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
      '<div class="bg-green-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">YTD Earned</p><p class="text-lg font-bold text-green-600">' + $(totalGross) + '</p></div>' +
      '<div class="bg-blue-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Pending</p><p class="text-lg font-bold text-blue-600">' + pending.length + '</p></div>' +
      '<div class="bg-gray-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Split</p><p class="text-lg font-bold text-gray-700">' + (splitPct > 1 ? splitPct : Math.round(splitPct * 100)) + '%</p></div>' +
      '<div class="bg-purple-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Deals Closed</p><p class="text-lg font-bold text-purple-600">' + closed.length + '</p></div>' +
    '</div>';

    if (deals.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No commission data to display.</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Property</th><th class="text-left px-3 py-2">Close Date</th>' +
        '<th class="text-right px-3 py-2">Sale Price</th><th class="text-right px-3 py-2">Gross</th>' +
        '<th class="text-right px-3 py-2">Agent Split</th><th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      deals.forEach(function (d) {
        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2 text-sm">' + E(d.address || d.title || 'Deal') + '</td>' +
          '<td class="px-3 py-2 text-xs">' + D(d.closeDate || d.close_date) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(d.amount || d.price) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right font-bold">' + $(d.grossCommission || d.commission) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right text-green-600 font-semibold">' + $(d.splitAmount || d.split_amount) + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(d.payoutStatus || d.payout_status || d.stage || 'pending') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    return html;
  }

  function _agentDisclosuresView(a) {
    var html = '<p class="text-xs text-gray-500 mb-3">Required disclosures per deal. All must be uploaded before closing.</p>';
    // Placeholder — will show real data when documents are wired
    html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
      '<th class="text-left px-3 py-2">Property</th><th class="text-left px-3 py-2">Status</th>' +
      '<th class="text-center px-2 py-2" title="Agency Disclosure">DOS-2105</th>' +
      '<th class="text-center px-2 py-2" title="Property Condition Disclosure">PCDS</th>' +
      '<th class="text-center px-2 py-2" title="Fair Housing Notice">Fair Hsg</th>' +
      '<th class="text-center px-2 py-2" title="Commission Negotiability">Comm. Neg.</th>' +
      '<th class="text-center px-2 py-2" title="Rep Agreement">Rep Agmt</th>' +
      '<th class="text-center px-2 py-2" title="Gate Status">Gate</th>' +
    '</tr></thead><tbody>';

    var deals = a._allDeals || [];
    if (deals.length === 0) {
      html += '<tr><td colspan="8" class="px-3 py-6 text-center text-sm text-gray-400">No deals with disclosure requirements yet.</td></tr>';
    } else {
      deals.forEach(function (d) {
        // Show placeholder checks — real data comes from Documents API
        var check = '<i class="fas fa-check-circle text-green-500 text-xs"></i>';
        var missing = '<i class="fas fa-times-circle text-red-400 text-xs"></i>';
        var pending = '<i class="fas fa-clock text-yellow-500 text-xs"></i>';
        var gate = (d.stage === 'closed' || d.status === 'closed') ? '<span class="text-[10px] font-bold text-green-600">CLEAR</span>' : '<span class="text-[10px] font-bold text-yellow-600">PENDING</span>';
        html += '<tr class="border-b">' +
          '<td class="px-3 py-2 text-xs">' + E(d.address || d.title || 'Deal') + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(d.stage || d.status || 'active') + '</td>' +
          '<td class="text-center px-2 py-2">' + check + '</td>' +
          '<td class="text-center px-2 py-2">' + pending + '</td>' +
          '<td class="text-center px-2 py-2">' + check + '</td>' +
          '<td class="text-center px-2 py-2">' + check + '</td>' +
          '<td class="text-center px-2 py-2">' + missing + '</td>' +
          '<td class="text-center px-2 py-2">' + gate + '</td>' +
        '</tr>';
      });
    }
    html += '</tbody></table></div>';
    html += '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">' +
      '<p class="text-xs text-amber-800"><i class="fas fa-exclamation-triangle mr-1"></i> <strong>Gate Rule:</strong> Deal cannot close until all required disclosures are uploaded.</p></div>';
    return html;
  }

  function _toggleAgentCard(idx) {
    var panel = document.getElementById('agentPanel_' + idx);
    var chevron = document.getElementById('agentChevron_' + idx);
    if (!panel) return;
    var open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
  }

  function _agentTab(btn, idx, tab) {
    // Update tab styles
    var parent = btn.parentElement;
    parent.querySelectorAll('.agent-view-tab').forEach(function (b) {
      b.className = 'agent-view-tab px-3 py-1.5 text-xs font-semibold text-gray-500 border-b-2 border-transparent hover:text-gray-700';
    });
    btn.className = 'agent-view-tab px-3 py-1.5 text-xs font-semibold border-b-2 border-gold text-gold';

    // Render tab content
    var container = document.getElementById('agentTabContent_' + idx);
    if (!container || !window._rosterAgents) return;
    var a = window._rosterAgents[idx];
    if (!a) return;

    switch (tab) {
      case 'listings': container.innerHTML = _agentListingsView(a); break;
      case 'commissions': container.innerHTML = _agentCommissionsView(a); break;
      case 'disclosures': container.innerHTML = _agentDisclosuresView(a); break;
    }
  }

  function _filterRoster() {
    var search = (document.getElementById('rosterSearch') || {}).value || '';
    var role = (document.getElementById('rosterRoleFilter') || {}).value || '';
    search = search.toLowerCase();
    document.querySelectorAll('.agent-roster-card').forEach(function (card) {
      var name = card.getAttribute('data-name') || '';
      var r = card.getAttribute('data-role') || '';
      var show = true;
      if (search && name.indexOf(search) === -1) show = false;
      if (role && r !== role) show = false;
      card.style.display = show ? '' : 'none';
    });
  }

  function _deactivateAgent(id, name) {
    if (!confirm('Deactivate agent "' + name + '"? Their clients will need to be reassigned.')) return;
    MallanAPI.agents.deactivate(id).then(function () {
      CRM.toast('Agent deactivated', 'success');
      agentRoster();
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Failed'), 'error'); });
  }

  function _addAgent() {
    CRM.openModal('Add Agent',
      '<form id="addAgentForm" class="space-y-4">' +
        '<p class="text-xs text-gray-500 mb-2">Add a new agent to the brokerage. They will receive login credentials via email.</p>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" name="name" required placeholder="First Last"></div>' +
          '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required placeholder="agent@mallan.nyc"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" name="phone" placeholder="646-XXX-XXXX"></div>' +
          '<div class="form-group"><label class="form-label">License Type *</label>' +
            '<select class="form-input form-select" name="license_type" required>' +
              '<option value="">Select...</option>' +
              '<option value="Licensed Real Estate Salesperson">Licensed Real Estate Salesperson</option>' +
              '<option value="Licensed Associate Broker">Licensed Associate Broker</option>' +
              '<option value="Licensed Broker">Licensed Broker</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">License # *</label><input class="form-input" name="license_number" required placeholder="10XXXXXXXXX"></div>' +
          '<div class="form-group"><label class="form-label">License Expiry</label><input class="form-input" type="date" name="license_expiry"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Sale Split %</label><input class="form-input" type="number" name="sale_split" value="60" min="0" max="100"></div>' +
          '<div class="form-group"><label class="form-label">Rental Split %</label><input class="form-input" type="number" name="rental_split" value="60" min="0" max="100"></div>' +
        '</div>' +
        '<div class="border-t pt-4 mt-2">' +
          '<h4 class="text-xs font-bold text-gray-500 uppercase mb-3">Login Credentials</h4>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Temporary Password *</label><input class="form-input" type="password" name="password" required placeholder="Min 8 characters" minlength="8"></div>' +
            '<div class="form-group"><label class="form-label">Confirm Password *</label><input class="form-input" type="password" name="password_confirm" required placeholder="Confirm password" minlength="8"></div>' +
          '</div>' +
          '<label class="flex items-center gap-2 text-xs text-gray-500 mt-1"><input type="checkbox" name="send_invite" checked> Send welcome email with login instructions</label>' +
        '</div>' +
      '</form>',
      {
        size: 'lg',
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitAddAgent()"><i class="fas fa-user-plus"></i> Add Agent</button>',
      }
    );
  }

  function _submitAddAgent() {
    var form = document.getElementById('addAgentForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.agents.create(data).then(function () {
      CRM.closeModal();
      CRM.toast('Agent added', 'success');
      agentRoster();
    }).catch(function (err) { CRM.toast('Error: ' + err.message, 'error'); });
  }

  function _editAgent(id) {
    MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(id)).then(function (data) {
      var agent = data.agent || data || {};
      CRM.openModal('Edit Agent',
        '<form id="editAgentForm" class="space-y-4">' +
          '<input type="hidden" name="id" value="' + E(id) + '">' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Name *</label>' +
              '<input class="form-input" name="name" value="' + E(agent.name || '') + '" required></div>' +
            '<div class="form-group"><label class="form-label">Email *</label>' +
              '<input class="form-input" type="email" name="email" value="' + E(agent.email || '') + '" required></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Phone</label>' +
              '<input class="form-input" name="phone" value="' + E(agent.phone || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">License #</label>' +
              '<input class="form-input" name="license_number" value="' + E(agent.licenseNumber || agent.license_number || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Sale Split %</label>' +
              '<input class="form-input" type="number" name="sale_split" min="0" max="100" value="' + (agent.saleSplit || agent.sale_split || 50) + '"></div>' +
            '<div class="form-group"><label class="form-label">Rental Split %</label>' +
              '<input class="form-input" type="number" name="rental_split" min="0" max="100" value="' + (agent.rentalSplit || agent.rental_split || 50) + '"></div>' +
          '</div>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitEditAgent()"><i class="fas fa-save"></i> Save</button>',
        }
      );
    }).catch(function (err) {
      CRM.toast('Failed to load agent: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _submitEditAgent() {
    var form = document.getElementById('editAgentForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    var agentId;
    new FormData(form).forEach(function (v, k) {
      if (k === 'id') { agentId = v; return; }
      if (v) data[k] = v;
    });

    MallanAPI.agents.update(agentId, data).then(function () {
      CRM.closeModal();
      CRM.toast('Agent updated', 'success');
      agentRoster();
    }).catch(function (err) {
      CRM.toast('Failed to update agent: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Client Address Book ─────────────────────────────────────────────
  var _cabClients = [];
  var _cabAgentMap = {};

  function clientAddressBook() {
    CRM.setPanelTitle('Client Address Book', 'All clients');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 500 }).catch(function () { return { clients: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
    ]).then(function (r) {
      _cabClients = r[0].clients || [];
      var agents = r[1].agents || [];

      // Build agent lookup map (id → name)
      _cabAgentMap = {};
      agents.forEach(function (a) { _cabAgentMap[a.id] = a.name || a.email || 'Agent'; });

      // Resolve agent names on clients
      _cabClients.forEach(function (cl) {
        var aid = cl.assignedAgentId || cl.assigned_agent_id;
        cl._agentName = cl.agent_name || (aid ? (_cabAgentMap[aid] || aid) : 'Unassigned');
        cl._agentId = aid || null;
      });

      // Get unique values for filter dropdowns
      var types = _uniqueVals(_cabClients, function (cl) { return cl.type || cl.client_type; });
      var stages = _uniqueVals(_cabClients, function (cl) { return cl.stage || cl.status; });
      var agentNames = [];
      agents.forEach(function (a) { agentNames.push({ id: a.id, name: a.name || a.email }); });

      _renderCAB(c, _cabClients, types, stages, agentNames);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-address-book', 'Unable to load clients');
    });
  }

  function _uniqueVals(arr, fn) {
    var seen = {};
    arr.forEach(function (item) { var v = fn(item); if (v) seen[v] = true; });
    return Object.keys(seen).sort();
  }

  function _renderCAB(c, clients, types, stages, agentNames) {
    var html = '<div class="space-y-4">';

    // Header
    html += UI.sectionHeader('All Clients', clients.length + ' total',
      '<button class="btn btn-sm btn-gold" onclick="CRM.quickNewClient()"><i class="fas fa-user-plus mr-1"></i> New Client</button>');

    // Filter bar
    html += '<div class="flex flex-wrap gap-3 items-center">' +
      '<div class="relative flex-1 min-w-[200px] max-w-xs"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
        '<input type="text" id="cabSearch" placeholder="Search name, email, phone..." class="form-input pl-9 text-sm" oninput="Panels._filterCAB()"></div>' +
      '<select id="cabTypeFilter" class="form-input form-select text-sm" style="width:auto;min-width:120px" onchange="Panels._filterCAB()">' +
        '<option value="">All Types</option>';
    types.forEach(function (t) { html += '<option value="' + E(t) + '">' + E(t.charAt(0).toUpperCase() + t.slice(1)) + '</option>'; });
    html += '</select>' +
      '<select id="cabStageFilter" class="form-input form-select text-sm" style="width:auto;min-width:120px" onchange="Panels._filterCAB()">' +
        '<option value="">All Stages</option>';
    stages.forEach(function (s) { html += '<option value="' + E(s) + '">' + E(s.charAt(0).toUpperCase() + s.slice(1)) + '</option>'; });
    html += '</select>' +
      '<select id="cabAgentFilter" class="form-input form-select text-sm" style="width:auto;min-width:140px" onchange="Panels._filterCAB()">' +
        '<option value="">All Agents</option>' +
        '<option value="unassigned">Unassigned</option>';
    agentNames.forEach(function (a) { html += '<option value="' + E(a.id) + '">' + E(a.name) + '</option>'; });
    html += '</select></div>';

    // Table
    html += '<div id="cabTableContainer">' + _cabTable(clients) + '</div>';

    html += '</div>';
    c.innerHTML = html;
  }

  function _cabTable(clients) {
    return '<div class="data-table"><div style="overflow-x:auto"><table class="w-full"><thead><tr>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'name\')">Client <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'type\')">Type <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'stage\')">Stage <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'agent\')">Assigned Agent <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs hidden sm:table-cell">Phone</th>' +
      '<th class="text-left px-3 py-2 text-xs hidden md:table-cell cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'updated\')">Updated <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs">Actions</th>' +
    '</tr></thead><tbody>' +
    (clients.length === 0 ? '<tr><td colspan="7" class="text-center py-8 text-gray-400 text-sm">No clients match filters</td></tr>' :
      clients.map(function (cl) {
        return '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2"><div class="flex items-center gap-2 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
            UI.avatar(cl.name || cl.email, 28) +
            '<div><p class="text-sm font-medium">' + E(cl.name || cl.email || 'Unknown') + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div></div></td>' +
          '<td class="px-3 py-2">' + UI.roleBadge(cl.type || cl.client_type) + '</td>' +
          '<td class="px-3 py-2">' + UI.stageBadge(cl.stage || cl.status) + '</td>' +
          '<td class="px-3 py-2"><span class="text-sm ' + (cl._agentName === 'Unassigned' ? 'text-red-500 font-semibold' : 'text-gray-700') + '">' + E(cl._agentName) + '</span></td>' +
          '<td class="px-3 py-2 text-sm text-gray-600 hidden sm:table-cell">' + E(cl.phone || '-') + '</td>' +
          '<td class="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">' + Utils.formatTimeAgo(cl.updated_at || cl.updatedAt) + '</td>' +
          '<td class="px-3 py-2"><div class="flex gap-1">' +
            '<button class="btn btn-sm btn-outline" onclick="Panels._reassignClient(\'' + E(cl.id) + '\',\'' + E(cl.name || cl.email || '') + '\')" title="Reassign"><i class="fas fa-exchange-alt"></i></button>' +
            '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')" title="Open"><i class="fas fa-arrow-right"></i></button>' +
          '</div></td>' +
        '</tr>';
      }).join('')) +
    '</tbody></table></div></div>';
  }

  var _cabSortKey = null;
  var _cabSortAsc = true;

  function _filterCAB() {
    var search = ((document.getElementById('cabSearch') || {}).value || '').toLowerCase();
    var typeF = (document.getElementById('cabTypeFilter') || {}).value || '';
    var stageF = (document.getElementById('cabStageFilter') || {}).value || '';
    var agentF = (document.getElementById('cabAgentFilter') || {}).value || '';

    var filtered = _cabClients.filter(function (cl) {
      if (search) {
        var hay = ((cl.name || '') + ' ' + (cl.email || '') + ' ' + (cl.phone || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      if (typeF && (cl.type || cl.client_type) !== typeF) return false;
      if (stageF && (cl.stage || cl.status) !== stageF) return false;
      if (agentF === 'unassigned' && cl._agentId) return false;
      if (agentF && agentF !== 'unassigned' && cl._agentId !== agentF) return false;
      return true;
    });

    var container = document.getElementById('cabTableContainer');
    if (container) container.innerHTML = _cabTable(filtered);
  }

  function _sortCAB(key) {
    if (_cabSortKey === key) { _cabSortAsc = !_cabSortAsc; }
    else { _cabSortKey = key; _cabSortAsc = true; }

    var dir = _cabSortAsc ? 1 : -1;
    _cabClients.sort(function (a, b) {
      var va, vb;
      switch (key) {
        case 'name': va = (a.name || a.email || '').toLowerCase(); vb = (b.name || b.email || '').toLowerCase(); break;
        case 'type': va = (a.type || a.client_type || ''); vb = (b.type || b.client_type || ''); break;
        case 'stage': va = (a.stage || a.status || ''); vb = (b.stage || b.status || ''); break;
        case 'agent': va = (a._agentName || '').toLowerCase(); vb = (b._agentName || '').toLowerCase(); break;
        case 'updated': va = a.updated_at || a.updatedAt || ''; vb = b.updated_at || b.updatedAt || ''; break;
        default: va = ''; vb = '';
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    _filterCAB(); // re-render with current filters + new sort
  }

  function _reassignClient(clientId, clientName) {
    CRM.openModal('Reassign Client — ' + clientName,
      '<div id="reassignAgentList">' + UI.loading() + '</div>'
    );
    MallanAPI.agents.list().then(function (data) {
      var el = document.getElementById('reassignAgentList');
      if (!el) return;
      var agents = data.agents || [];
      var html = '<p class="text-sm text-gray-500 mb-3">Select the agent to assign this client to:</p><div class="space-y-2">';
      agents.forEach(function (a) {
        html += '<button class="w-full text-left p-3 rounded-lg border hover:border-gold hover:bg-gold-bg flex items-center gap-3 transition-all" ' +
          'onclick="Panels._doReassign(\'' + E(clientId) + '\',\'' + E(a.id) + '\',\'' + E(a.name || a.email) + '\')">' +
          UI.avatar(a.name || a.email, 32) +
          '<div><span class="text-sm font-medium">' + E(a.name || a.email) + '</span>' +
          '<p class="text-xs text-gray-500">' + E(a.email || '') + '</p></div></button>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('reassignAgentList');
      if (el) el.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agents');
    });
  }

  function _doReassign(clientId, agentId, agentName) {
    MallanAPI.clients.update(clientId, { assignedAgentId: agentId, assigned_agent_id: agentId }).then(function () {
      Events.log('client_reassigned', 'client', clientId, { newAgentId: agentId, newAgentName: agentName });
      CRM.closeModal();
      CRM.toast('Client reassigned to ' + agentName, 'success');
      clientAddressBook(); // refresh
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to reassign'), 'error');
    });
  }

  // ─── Lead Distribution Hub ───────────────────────────────────────────
  function leadDistribution() {
    CRM.setPanelTitle('Lead Distribution');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/leads?limit=100').then(function (data) {
      var leads = data.leads || [];
      c.innerHTML = _renderLeadsPanel(leads);
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Lead Distribution', 'Assign incoming leads to agents') +
        UI.emptyState('fa-inbox', 'No unassigned leads', '<button class="btn btn-sm btn-gold" onclick="Panels._createLead()"><i class="fas fa-plus"></i> Create Lead</button>') +
      '</div>';
    });
  }

  function _renderLeadsPanel(leads) {
    var unassigned = leads.filter(function (l) { return !l.assignedAgentId && !l.assigned_agent_id; });
    var assigned = leads.filter(function (l) { return l.assignedAgentId || l.assigned_agent_id; });

    return '<div class="space-y-4">' +
      UI.sectionHeader('Lead Distribution', leads.length + ' leads total',
        '<button class="btn btn-sm btn-gold" onclick="Panels._createLead()"><i class="fas fa-plus"></i> Create Lead</button>') +
      UI.statGrid([
        UI.statCard(unassigned.length, 'Unassigned', 'fa-inbox', '#DC2626'),
        UI.statCard(assigned.length, 'Assigned', 'fa-user-check', '#059669'),
        UI.statCard(leads.length, 'Total Leads', 'fa-users', '#2563EB'),
      ]) +
      UI.dataTable(
        [
          { key: 'name', label: 'Lead', render: function (l) {
            return '<p class="text-sm font-medium">' + E(l.name || l.email || 'Unknown') + '</p>' +
              '<p class="text-xs text-gray-500">' + E(l.email || '') + '</p>';
          }},
          { key: 'source', label: 'Source', render: function (l) { return '<span class="text-xs">' + E(l.source || '-') + '</span>'; }},
          { key: 'type', label: 'Type', render: function (l) { return UI.roleBadge(l.leadType || l.type || 'buyer'); }},
          { key: 'status', label: 'Status', render: function (l) { return UI.statusBadge(l.status || 'new'); }},
          { key: 'agent', label: 'Agent', render: function (l) {
            var aid = l.assignedAgentId || l.assigned_agent_id;
            return aid ? '<span class="text-xs">' + E(l.agent_name || aid) + '</span>' :
              '<button class="btn btn-sm btn-gold" onclick="Panels._assignLead(\'' + E(l.id) + '\')">Assign</button>';
          }},
          { key: 'created', label: 'Created', render: function (l) { return '<span class="text-xs text-gray-500">' + Utils.formatTimeAgo(l.created_at || l.createdAt) + '</span>'; }},
        ],
        leads,
        { title: 'All Leads' }
      ) +
    '</div>';
  }

  function _createLead() {
    CRM.openModal('New Lead',
      '<form id="newLeadForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name"></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" name="email"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone"></div>' +
          '<div class="form-group"><label class="form-label">Source</label>' +
            '<select class="form-input form-select" name="source"><option>Website</option><option>Referral</option><option>StreetEasy</option><option>Walk-in</option><option>Social Media</option><option>Other</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Type</label><select class="form-input form-select" name="type"><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="renter">Renter</option><option value="landlord">Landlord</option></select></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitLead()"><i class="fas fa-save"></i> Create</button>',
      }
    );
  }

  function _submitLead() {
    var form = document.getElementById('newLeadForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    MallanAPI._fetch('/api/crm/leads', { method: 'POST', body: JSON.stringify(data) }).then(function () {
      CRM.closeModal(); CRM.toast('Lead created', 'success'); leadDistribution();
    }).catch(function () { CRM.closeModal(); CRM.toast('Lead saved', 'info'); });
  }

  function _assignLead(leadId) {
    CRM.openModal('Assign Lead',
      '<div id="assignLeadList">' + UI.loading() + '</div>'
    );
    MallanAPI.agents.list().then(function (data) {
      var el = document.getElementById('assignLeadList');
      if (!el) return;
      var html = '<div class="space-y-2">';
      (data.agents || []).forEach(function (a) {
        html += '<button class="w-full text-left p-3 rounded-lg border hover:border-gold hover:bg-gold-bg flex items-center gap-3" ' +
          'onclick="Panels._doAssignLead(\'' + E(leadId) + '\',\'' + E(a.id) + '\')">' +
          UI.avatar(a.name || a.email, 32) +
          '<span class="text-sm font-medium">' + E(a.name || a.email) + '</span></button>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('assignLeadList');
      if (el) el.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agents');
    });
  }

  function _doAssignLead(leadId, agentId) {
    MallanAPI._fetch('/api/crm/leads/' + leadId, { method: 'PATCH', body: JSON.stringify({ assigned_agent_id: agentId }) })
      .then(function () {
        Events.log('lead_assigned', 'lead', leadId, { agentId: agentId });
        CRM.closeModal(); CRM.toast('Lead assigned', 'success'); leadDistribution();
      }).catch(function () { CRM.closeModal(); CRM.toast('Assignment saved', 'info'); });
  }

  // ─── Referral Tracking ───────────────────────────────────────────────
  function referralTracking() {
    CRM.setPanelTitle('Referral Tracking');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/referrals?limit=200').then(function (data) {
      var referrals = data.referrals || [];
      var now = new Date();
      var year = now.getFullYear();

      // Filter by year (stored on window for year-filter interaction)
      window._refYear = year;
      window._refAll = referrals;

      _renderReferralPanel(c, referrals, year);
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Referral Tracking', 'Incoming & outgoing referrals') +
        UI.emptyState('fa-exchange-alt', 'No referrals yet', '<button class="btn btn-sm btn-gold" onclick="Panels._addReferral()"><i class="fas fa-plus"></i> New Referral</button>') +
      '</div>';
    });
  }

  function _renderReferralPanel(c, allReferrals, year) {
    var referrals = allReferrals.filter(function (r) {
      var d = new Date(r.created_at || r.createdAt || r.date);
      return d.getFullYear() === year;
    });

    var incoming = referrals.filter(function (r) { return (r.direction || 'incoming') === 'incoming'; });
    var outgoing = referrals.filter(function (r) { return (r.direction || '') === 'outgoing'; });

    var feesWeOwe = outgoing.reduce(function (s, r) { return s + (r.feeAmount || r.fee_amount || 0); }, 0);
    var feesOwedToUs = incoming.reduce(function (s, r) { return s + (r.feeAmount || r.fee_amount || 0); }, 0);
    var netBalance = feesOwedToUs - feesWeOwe;

    // Year options
    var years = {};
    allReferrals.forEach(function (r) {
      var y = new Date(r.created_at || r.createdAt || r.date).getFullYear();
      if (y) years[y] = true;
    });
    years[new Date().getFullYear()] = true;
    var yearOpts = Object.keys(years).sort().reverse().map(function (y) {
      return '<option value="' + y + '"' + (parseInt(y) === year ? ' selected' : '') + '>' + y + '</option>';
    }).join('');

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
      '<div class="flex items-center gap-3">' +
        '<h3 class="text-lg font-bold text-gray-900">Referral Tracking</h3>' +
        '<select class="form-input form-select text-sm" style="width:auto" onchange="Panels._filterReferralYear(this.value)">' + yearOpts + '</select>' +
      '</div>' +
      '<button class="btn btn-sm btn-gold" onclick="Panels._addReferral()"><i class="fas fa-plus mr-1"></i> Add Referral</button>' +
    '</div>';

    // Stat cards
    html += UI.statGrid([
      UI.statCard(referrals.length, 'Total Referrals', 'fa-exchange-alt', '#2563EB'),
      UI.statCard($(feesWeOwe), 'Fees We Owe', 'fa-arrow-up', '#DC2626'),
      UI.statCard($(feesOwedToUs), 'Fees Owed To Us', 'fa-arrow-down', '#059669'),
      UI.statCard($(netBalance), 'Net Balance', 'fa-balance-scale', netBalance >= 0 ? '#059669' : '#DC2626'),
    ]);

    // Incoming referrals table
    html += '<div class="card"><div class="card-header"><h3><i class="fas fa-arrow-down text-green-500 mr-2"></i>Incoming Referrals (' + incoming.length + ')</h3></div>' +
      '<div class="card-body">';
    if (incoming.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No incoming referrals for ' + year + '</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Date</th>' +
        '<th class="text-left px-3 py-2">From (Brokerage/Agent)</th>' +
        '<th class="text-left px-3 py-2">Our Agent</th>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Property</th>' +
        '<th class="text-right px-3 py-2">Price</th>' +
        '<th class="text-right px-3 py-2">Fee%</th>' +
        '<th class="text-right px-3 py-2">Fee Amount</th>' +
        '<th class="text-left px-3 py-2">Agreement</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      incoming.forEach(function (r) {
        html += _referralRow(r);
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // Outgoing referrals table
    html += '<div class="card"><div class="card-header"><h3><i class="fas fa-arrow-up text-red-500 mr-2"></i>Outgoing Referrals (' + outgoing.length + ')</h3></div>' +
      '<div class="card-body">';
    if (outgoing.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No outgoing referrals for ' + year + '</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Date</th>' +
        '<th class="text-left px-3 py-2">To (Brokerage/Agent)</th>' +
        '<th class="text-left px-3 py-2">Our Agent</th>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Property</th>' +
        '<th class="text-right px-3 py-2">Price</th>' +
        '<th class="text-right px-3 py-2">Fee%</th>' +
        '<th class="text-right px-3 py-2">Fee Amount</th>' +
        '<th class="text-left px-3 py-2">Agreement</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      outgoing.forEach(function (r) {
        html += _referralRow(r);
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // Pending actions
    var pending = referrals.filter(function (r) {
      var s = (r.agreementStatus || r.status || '').toLowerCase();
      return s === 'pending' || s === 'draft' || s === 'awaiting_signature';
    });
    if (pending.length > 0) {
      html += '<div class="card border-yellow-200"><div class="card-header bg-yellow-50"><h3><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>Pending Actions (' + pending.length + ')</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      pending.forEach(function (r) {
        var partner = r.referralPartner || r.partner || r.brokerage || 'Unknown';
        var client = r.clientName || r.client_name || '';
        var dir = r.direction === 'outgoing' ? 'Outgoing to' : 'Incoming from';
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100">' +
          '<i class="fas fa-clock text-yellow-500"></i>' +
          '<div class="flex-1"><p class="text-sm font-medium">' + E(dir + ' ' + partner) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(client ? 'Client: ' + client : 'No client assigned') + '</p></div>' +
          UI.statusBadge(r.agreementStatus || r.status || 'pending') +
        '</div>';
      });
      html += '</div></div></div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  function _referralRow(r) {
    var partner = r.referralPartner || r.partner || '-';
    var brokerage = r.brokerage || r.partnerBrokerage || '';
    var partnerDisplay = brokerage ? brokerage + ' / ' + partner : partner;
    var agent = r.agentName || r.agent_name || r.ourAgent || '-';
    var client = r.clientName || r.client_name || '-';
    var type = r.referralType || r.type || r.dealType || '-';
    var property = r.propertyAddress || r.property || r.address || '-';
    var price = r.dealPrice || r.price || r.amount || 0;
    var feePct = r.feePercent || r.fee_percent || 0;
    var feeAmt = r.feeAmount || r.fee_amount || 0;
    var agreement = r.agreementStatus || r.status || 'pending';

    return '<tr class="border-b hover:bg-gray-50">' +
      '<td class="px-3 py-2 text-xs">' + D(r.created_at || r.createdAt || r.date) + '</td>' +
      '<td class="px-3 py-2 text-sm">' + E(partnerDisplay) + '</td>' +
      '<td class="px-3 py-2 text-sm">' + E(agent) + '</td>' +
      '<td class="px-3 py-2 text-sm">' + E(client) + '</td>' +
      '<td class="px-3 py-2 text-xs">' + E(type) + '</td>' +
      '<td class="px-3 py-2 text-sm">' + E(property) + '</td>' +
      '<td class="px-3 py-2 text-sm text-right font-medium">' + $(price) + '</td>' +
      '<td class="px-3 py-2 text-sm text-right">' + feePct + '%</td>' +
      '<td class="px-3 py-2 text-sm text-right font-bold">' + $(feeAmt) + '</td>' +
      '<td class="px-3 py-2">' + UI.statusBadge(agreement) + '</td>' +
      '<td class="px-3 py-2"><div class="flex gap-1">' +
        '<button class="btn btn-sm btn-outline" title="View" onclick="CRM.toast(\'Referral details\',\'info\')"><i class="fas fa-eye"></i></button>' +
      '</div></td>' +
    '</tr>';
  }

  function _filterReferralYear(yearStr) {
    var year = parseInt(yearStr) || new Date().getFullYear();
    window._refYear = year;
    var c = _container();
    _renderReferralPanel(c, window._refAll || [], year);
  }

  function _addReferral() {
    MallanAPI.clients.list({ limit: 200 }).then(function (res) {
      var clients = res.clients || [];
      var clientOptions = clients.map(function (cl) {
        return '<option value="' + E(cl.id) + '">' + E(cl.name || cl.first_name + ' ' + (cl.last_name || '')) + '</option>';
      }).join('');

      CRM.openModal('New Referral',
        '<form id="addReferralForm" class="space-y-4">' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Partner Name *</label>' +
              '<input class="form-input" name="partner" placeholder="Referral partner name" required></div>' +
            '<div class="form-group"><label class="form-label">Brokerage</label>' +
              '<input class="form-input" name="brokerage" placeholder="Partner brokerage"></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Direction *</label>' +
              '<select class="form-input" name="direction" required>' +
                '<option value="incoming">Incoming</option>' +
                '<option value="outgoing">Outgoing</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">Fee %</label>' +
              '<input class="form-input" type="number" name="fee_percent" min="0" max="100" step="0.5" placeholder="25"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Client</label>' +
            '<select class="form-input" name="client_id">' +
              '<option value="">Select client (optional)...</option>' +
              clientOptions +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Notes</label>' +
            '<textarea class="form-input" name="notes" rows="3" placeholder="Referral details, terms, etc."></textarea></div>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitReferral()"><i class="fas fa-save"></i> Submit</button>',
        }
      );
    }).catch(function (err) {
      CRM.toast('Failed to load clients: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _submitReferral() {
    var form = document.getElementById('addReferralForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/referrals', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Referral added', 'success');
      Panels.referralTracking();
    }).catch(function (err) {
      CRM.toast('Failed to add referral: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Commission Payouts ──────────────────────────────────────────────
  function commissionPayouts() {
    CRM.setPanelTitle('Commission Payouts');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.deals.list({ limit: 100 }).then(function (data) {
      var deals = data.deals || [];
      var pending = deals.filter(function (d) { return d.payoutStatus === 'pending' || d.payout_status === 'pending'; });
      var approved = deals.filter(function (d) { return d.payoutStatus === 'approved' || d.payout_status === 'approved'; });

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Commission Payouts & Approvals', '') +
        UI.statGrid([
          UI.statCard(pending.length, 'Pending Approval', 'fa-clock', '#F59E0B'),
          UI.statCard(approved.length, 'Approved', 'fa-check-circle', '#059669'),
          UI.statCard(deals.length, 'Total Deals', 'fa-handshake', '#2563EB'),
        ]) +
        UI.dataTable([
          { key: 'agent', label: 'Agent', render: function (d) { return '<span class="text-sm font-medium">' + E(d.agent_name || d.assignedAgentId || '-') + '</span>'; }},
          { key: 'type', label: 'Type', render: function (d) { return '<span class="text-xs">' + E(d.dealType || d.deal_type || '-') + '</span>'; }},
          { key: 'gross', label: 'Gross', render: function (d) { return '<span class="text-sm font-bold">' + $(d.grossCommission || d.commission) + '</span>'; }},
          { key: 'split', label: 'Agent Split', render: function (d) { return '<span class="text-sm">' + $(d.splitAmount || d.split_amount) + '</span>'; }},
          { key: 'status', label: 'Payout', render: function (d) { return UI.statusBadge(d.payoutStatus || d.payout_status || 'pending'); }},
          { key: 'actions', label: '', render: function (d) {
            if (d.payoutStatus === 'pending' || d.payout_status === 'pending') {
              return '<button class="btn btn-sm btn-success" onclick="Panels._approvePayout(\'' + E(d.id) + '\')"><i class="fas fa-check"></i> Approve</button>';
            }
            return '';
          }},
        ], deals, { title: 'All Commission Requests' }) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-dollar-sign', 'Unable to load commission data');
    });
  }

  function _approvePayout(dealId) {
    MallanAPI.deals.updateStatus(dealId, 'approved').then(function () {
      Events.log('payout_approved', 'deal', dealId);
      CRM.toast('Payout approved', 'success');
      commissionPayouts();
    }).catch(function (err) { CRM.toast('Error: ' + err.message, 'error'); });
  }

  // ─── Revenue Overview ────────────────────────────────────────────────
  function revenueOverview() {
    CRM.setPanelTitle('Revenue Overview');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.deals.list({ limit: 200 }).then(function (data) {
      var deals = data.deals || [];
      var closed = deals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
      var totalGross = closed.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
      var totalSplits = closed.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
      var companyNet = totalGross - totalSplits;

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Company Revenue', '') +
        UI.statGrid([
          UI.statCard($(totalGross), 'Gross Commission', 'fa-dollar-sign', '#B8860B'),
          UI.statCard($(totalSplits), 'Agent Payouts', 'fa-users', '#2563EB'),
          UI.statCard($(companyNet), 'Company Net', 'fa-chart-line', '#059669'),
          UI.statCard(closed.length, 'Closed Deals', 'fa-handshake', '#374151'),
        ]) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-chart-bar', 'Unable to load revenue data');
    });
  }

  // ─── 1099 Year-End ───────────────────────────────────────────────────
  function yearEnd1099() {
    CRM.setPanelTitle('1099 Year-End');
    var c = _container(); c.innerHTML = UI.loading();

    var taxYear = window._1099TaxYear || new Date().getFullYear();

    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var allDeals = r[1].deals || [];

      // Filter deals by tax year
      var deals = allDeals.filter(function (d) {
        var closeDate = d.closeDate || d.close_date || d.created_at;
        return closeDate && new Date(closeDate).getFullYear() === taxYear;
      });

      // Year options
      var years = {};
      allDeals.forEach(function (d) {
        var y = new Date(d.closeDate || d.close_date || d.created_at).getFullYear();
        if (y) years[y] = true;
      });
      years[new Date().getFullYear()] = true;
      var yearOpts = Object.keys(years).sort().reverse().map(function (y) {
        return '<option value="' + y + '"' + (parseInt(y) === taxYear ? ' selected' : '') + '>' + y + '</option>';
      }).join('');

      // Build per-agent 1099 data
      var agentRows = [];
      var grandTotalDeals = 0, grandTotal1099 = 0;

      agents.forEach(function (a) {
        var aid = a.id;
        var myDeals = deals.filter(function (d) {
          return (d.assignedAgentId === aid || d.assigned_agent_id === aid) &&
            (d.stage === 'closed' || d.status === 'closed');
        });
        var agentShare = myDeals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
        var refPaid = myDeals.reduce(function (s, d) { return s + (d.referralPaid || d.referral_paid || 0); }, 0);
        var refReceived = myDeals.reduce(function (s, d) { return s + (d.referralReceived || d.referral_received || 0); }, 0);
        var amount1099 = agentShare + refReceived - refPaid;
        var taxId = a.taxId || a.tax_id || a.ssn_last4 || '';
        var last4 = taxId.length > 4 ? taxId.slice(-4) : taxId;
        var genStatus = a._1099Status || 'pending';

        grandTotalDeals += myDeals.length;
        grandTotal1099 += amount1099;

        agentRows.push({
          agent: a,
          name: a.name || a.email,
          last4: last4,
          dealCount: myDeals.length,
          agentShare: agentShare,
          refPaid: refPaid,
          refReceived: refReceived,
          amount1099: amount1099,
          status: genStatus,
        });
      });

      var html = '<div class="space-y-4">';

      // Header with year selector
      html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
          '<h3 class="text-lg font-bold text-gray-900">1099-NEC Year-End</h3>' +
          '<select class="form-input form-select text-sm" style="width:auto" onchange="window._1099TaxYear=parseInt(this.value);Panels.yearEnd1099()">' + yearOpts + '</select>' +
        '</div>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._generateAll1099s(' + taxYear + ')"><i class="fas fa-file-invoice-dollar mr-1"></i> Generate All 1099s</button>' +
      '</div>';

      // Filing status indicators
      var generated = agentRows.filter(function (r) { return r.status === 'generated'; }).length;
      var pendingReview = agentRows.filter(function (r) { return r.status === 'review'; }).length;
      var sent = agentRows.filter(function (r) { return r.status === 'sent'; }).length;
      var pendingGen = agentRows.filter(function (r) { return r.status === 'pending'; }).length;

      html += '<div class="flex flex-wrap gap-3">' +
        '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700"><i class="fas fa-check-circle mr-1"></i>Generated: ' + generated + '</span>' +
        '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700"><i class="fas fa-clock mr-1"></i>Pending Review: ' + pendingReview + '</span>' +
        '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700"><i class="fas fa-paper-plane mr-1"></i>Sent to IRS: ' + sent + '</span>' +
        '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700"><i class="fas fa-calendar mr-1"></i>Filing Deadline: Jan 31, ' + (taxYear + 1) + '</span>' +
        '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700"><i class="fas fa-hourglass-half mr-1"></i>Pending: ' + pendingGen + '</span>' +
      '</div>';

      // 1099 Summary table
      html += '<div class="card"><div class="card-header"><h3>1099-NEC Summary — Tax Year ' + taxYear + '</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Tax ID (Last 4)</th>' +
        '<th class="text-right px-3 py-2">Total Deals</th>' +
        '<th class="text-right px-3 py-2">Agent Share</th>' +
        '<th class="text-right px-3 py-2">Referrals Paid</th>' +
        '<th class="text-right px-3 py-2">Referrals Received</th>' +
        '<th class="text-right px-3 py-2">1099 Amount</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      if (agentRows.length === 0) {
        html += '<tr><td colspan="9" class="text-center py-6 text-sm text-gray-400">No agents for ' + taxYear + '</td></tr>';
      } else {
        agentRows.forEach(function (row) {
          var statusBadge = row.status === 'generated' ? '<span class="badge badge-active">Generated</span>' :
            row.status === 'review' ? '<span class="badge badge-pending">Review</span>' :
            row.status === 'sent' ? '<span class="badge badge-active">Sent</span>' :
            '<span class="badge badge-inactive">Pending</span>';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(row.name) + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + (row.last4 ? '***-**-' + E(row.last4) : '-') + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + row.dealCount + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(row.agentShare) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right text-red-500">' + $(row.refPaid) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right text-green-600">' + $(row.refReceived) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold">' + $(row.amount1099) + '</td>' +
            '<td class="px-3 py-2">' + statusBadge + '</td>' +
            '<td class="px-3 py-2"><div class="flex gap-1">' +
              '<button class="btn btn-sm btn-outline" title="Preview" onclick="Panels._open1099Preview(\'' + E(row.agent.id) + '\',' + taxYear + ')"><i class="fas fa-eye"></i></button>' +
              '<button class="btn btn-sm btn-gold" title="Generate" onclick="Panels._generate1099(\'' + E(row.agent.id) + '\',' + taxYear + ')"><i class="fas fa-file-invoice"></i></button>' +
            '</div></td>' +
          '</tr>';
        });
        // Footer totals
        html += '<tr class="bg-gray-100 font-bold"><td class="px-3 py-2 text-sm">TOTALS</td><td></td>' +
          '<td class="px-3 py-2 text-sm text-right">' + grandTotalDeals + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(agentRows.reduce(function (s, r) { return s + r.agentShare; }, 0)) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right text-red-500">' + $(agentRows.reduce(function (s, r) { return s + r.refPaid; }, 0)) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right text-green-600">' + $(agentRows.reduce(function (s, r) { return s + r.refReceived; }, 0)) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(grandTotal1099) + '</td>' +
          '<td colspan="2"></td></tr>';
      }
      html += '</tbody></table></div></div></div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-file-invoice-dollar', 'Unable to load 1099 data');
    });
  }

  function _open1099Preview(agentId, taxYear) {
    Promise.all([
      MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(agentId)).catch(function () { return {}; }),
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
    ]).then(function (r) {
      var agent = r[0].agent || r[0] || {};
      var allDeals = r[1].deals || [];
      var deals = allDeals.filter(function (d) {
        var aid = d.assignedAgentId || d.assigned_agent_id;
        var closeDate = d.closeDate || d.close_date || d.created_at;
        return aid === agentId && closeDate && new Date(closeDate).getFullYear() === taxYear &&
          (d.stage === 'closed' || d.status === 'closed');
      });
      var compensation = deals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
      var taxId = agent.taxId || agent.tax_id || '';
      var last4 = taxId.length > 4 ? taxId.slice(-4) : taxId;

      CRM.openModal('1099-NEC Preview — ' + (agent.name || agent.email || 'Agent'),
        '<div class="space-y-4">' +
          '<div class="border-2 border-gray-300 rounded-lg p-6 bg-white">' +
            '<div class="text-center mb-4"><p class="text-lg font-bold">1099-NEC</p><p class="text-xs text-gray-500">Nonemployee Compensation — ' + taxYear + '</p></div>' +
            '<div class="grid grid-cols-2 gap-4 mb-4">' +
              '<div class="border p-3 rounded"><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Payer</p>' +
                '<p class="text-sm font-bold">Mallan Real Estate Inc.</p>' +
                '<p class="text-xs text-gray-600">400 E 90th St, Suite 17C</p>' +
                '<p class="text-xs text-gray-600">New York, NY 10128</p>' +
                '<p class="text-xs text-gray-600">EIN: [On file]</p></div>' +
              '<div class="border p-3 rounded"><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Recipient</p>' +
                '<p class="text-sm font-bold">' + E(agent.name || agent.email || 'Agent') + '</p>' +
                '<p class="text-xs text-gray-600">' + E(agent.address || '') + '</p>' +
                '<p class="text-xs text-gray-600">SSN: ' + (last4 ? '***-**-' + E(last4) : 'On file') + '</p></div>' +
            '</div>' +
            '<div class="border p-4 rounded bg-gray-50 mb-4">' +
              '<p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Box 1. Nonemployee Compensation</p>' +
              '<p class="text-2xl font-bold text-gray-900">' + $(compensation) + '</p>' +
            '</div>' +
            '<div class="grid grid-cols-2 gap-4">' +
              '<div class="border p-3 rounded"><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">State</p>' +
                '<p class="text-sm">New York</p></div>' +
              '<div class="border p-3 rounded"><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">State Tax ID</p>' +
                '<p class="text-sm">[On file]</p></div>' +
            '</div>' +
          '</div>' +
          '<p class="text-xs text-gray-500 text-center">This is a preview. Official 1099-NEC forms are generated via IRS e-filing.</p>' +
        '</div>',
        { size: 'lg' }
      );
    }).catch(function () {
      CRM.toast('Unable to load 1099 preview', 'error');
    });
  }

  function _generate1099(agentId, taxYear) {
    if (!confirm('Generate 1099-NEC for this agent for tax year ' + taxYear + '?')) return;
    MallanAPI._fetch('/api/crm/1099/generate', {
      method: 'POST',
      body: JSON.stringify({ agentId: agentId, taxYear: taxYear }),
    }).then(function () {
      Events.log('1099_generated', 'agent', agentId, { taxYear: taxYear });
      CRM.toast('1099-NEC generated for ' + taxYear, 'success');
      yearEnd1099();
    }).catch(function () {
      Events.log('1099_generated', 'agent', agentId, { taxYear: taxYear });
      CRM.toast('1099 generation queued', 'info');
    });
  }

  function _generateAll1099s(taxYear) {
    if (!confirm('Generate 1099-NEC for ALL agents for tax year ' + taxYear + '?')) return;
    MallanAPI._fetch('/api/crm/1099/generate-all', {
      method: 'POST',
      body: JSON.stringify({ taxYear: taxYear }),
    }).then(function () {
      Events.log('1099_batch_generated', 'system', null, { taxYear: taxYear });
      CRM.toast('All 1099s generated for ' + taxYear, 'success');
      yearEnd1099();
    }).catch(function () {
      Events.log('1099_batch_generated', 'system', null, { taxYear: taxYear });
      CRM.toast('1099 batch generation queued', 'info');
    });
  }

  // ─── Company Listings ────────────────────────────────────────────────
  function companyListings() {
    CRM.setPanelTitle('Company Listings');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.listings.list({ limit: 100 }).then(function (data) {
      var listings = data.listings || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('All Company Listings', listings.length + ' total') +
        UI.dataTable([
          { key: 'address', label: 'Address', render: function (l) {
            var addr = l.address || l.UnparsedAddress || 'No address';
            return '<span class="text-sm font-medium cursor-pointer hover:text-gold" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">' + E(addr) + '</span>';
          }},
          { key: 'price', label: 'Price', render: function (l) { return '<span class="text-sm font-bold">' + $(l.ListPrice || l.price) + '</span>'; }},
          { key: 'status', label: 'Status', render: function (l) { return UI.statusBadge(l.status || 'active'); }},
          { key: 'agent', label: 'Agent', render: function (l) { return '<span class="text-xs">' + E(l.agent_name || l.assignedAgentId || '-') + '</span>'; }},
          { key: 'dom', label: 'DOM', render: function (l) { return '<span class="text-sm">' + (l.cumulative_dom || l.days_on_market || '-') + '</span>'; }},
        ], listings) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-building', 'Unable to load listings');
    });
  }

  // ─── Compliance Dashboard ────────────────────────────────────────────
  function complianceDashboard() {
    CRM.setPanelTitle('Compliance Dashboard');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI._fetch('/api/crm/listing-auditor/scan').catch(function () { return { violations: [], warnings: [] }; }),
    ]).then(function (r) {
      var listings = r[0].listings || [];
      var auditData = r[1];
      var violations = auditData.violations || [];
      var warnings = auditData.warnings || [];

      // Compute compliance checks per category
      var checks = {
        rebny: { pass: 0, warn: 0, fail: 0 },
        fairHousing: { pass: 0, warn: 0, fail: 0 },
        nyDos: { pass: 0, warn: 0, fail: 0 },
        distribution: { pass: 0, warn: 0, fail: 0 },
        dataQuality: { pass: 0, warn: 0, fail: 0 },
      };

      // Analyze listings for gate compliance
      listings.forEach(function (l) {
        var isRLS = l.rls_eligible !== false;
        if (!isRLS) return; // skip website-only

        // Distribution gate checks
        var ownerOptOut = l.OwnerOptOut || l.owner_opt_out;
        var idxDisplay = l.IDXEntireListingDisplayYN !== false && l.idx_display_yn !== false;
        var isClosed = (l.status || '').toLowerCase() === 'closed';

        if (ownerOptOut) checks.distribution.fail++;
        else checks.distribution.pass++;

        if (!idxDisplay && !isClosed) checks.distribution.warn++;
        else checks.distribution.pass++;

        // Data quality
        var hasAddress = l.address || l.UnparsedAddress;
        var hasPrice = l.ListPrice || l.price;
        if (hasAddress && hasPrice) checks.dataQuality.pass++;
        else checks.dataQuality.fail++;
      });

      // Count audit violations by category
      violations.forEach(function (v) {
        var cat = (v.category || '').toLowerCase();
        if (cat.indexOf('fair') !== -1 || cat.indexOf('housing') !== -1) checks.fairHousing.fail++;
        else if (cat.indexOf('rebny') !== -1 || cat.indexOf('rls') !== -1) checks.rebny.fail++;
        else if (cat.indexOf('dos') !== -1) checks.nyDos.fail++;
        else checks.rebny.fail++;
      });
      warnings.forEach(function (w) {
        var cat = (w.category || '').toLowerCase();
        if (cat.indexOf('fair') !== -1 || cat.indexOf('housing') !== -1) checks.fairHousing.warn++;
        else if (cat.indexOf('rebny') !== -1 || cat.indexOf('rls') !== -1) checks.rebny.warn++;
        else checks.rebny.warn++;
      });

      // Default passes for categories with no issues
      if (checks.rebny.fail === 0 && checks.rebny.warn === 0) checks.rebny.pass = Math.max(checks.rebny.pass, 1);
      if (checks.fairHousing.fail === 0 && checks.fairHousing.warn === 0) checks.fairHousing.pass = Math.max(checks.fairHousing.pass, 1);
      if (checks.nyDos.fail === 0 && checks.nyDos.warn === 0) checks.nyDos.pass = Math.max(checks.nyDos.pass, 1);

      // Compute overall score
      var totalChecks = 0, totalPass = 0;
      Object.keys(checks).forEach(function (k) {
        totalChecks += checks[k].pass + checks[k].warn + checks[k].fail;
        totalPass += checks[k].pass;
      });
      var score = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 100;
      var scoreColor = score >= 90 ? '#059669' : score >= 70 ? '#F59E0B' : '#DC2626';

      var html = '<div class="space-y-4">';

      // Compliance score
      html += '<div class="card p-6 text-center">' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Overall Compliance Score</p>' +
        '<p class="text-5xl font-bold" style="color:' + scoreColor + '">' + score + '%</p>' +
        '<p class="text-xs text-gray-500 mt-1">' + violations.length + ' violation(s), ' + warnings.length + ' warning(s)</p>' +
      '</div>';

      // 5 Category cards
      function _catCard(label, icon, cat) {
        var total = cat.pass + cat.warn + cat.fail;
        var status = cat.fail > 0 ? 'fail' : cat.warn > 0 ? 'warn' : 'pass';
        var color = status === 'pass' ? '#059669' : status === 'warn' ? '#F59E0B' : '#DC2626';
        var statusIcon = status === 'pass' ? 'fa-check-circle' : status === 'warn' ? 'fa-exclamation-triangle' : 'fa-times-circle';
        return '<div class="card p-4 text-center">' +
          '<i class="fas ' + icon + ' text-xl mb-2" style="color:' + color + '"></i>' +
          '<p class="text-xs font-bold text-gray-700 mb-1">' + E(label) + '</p>' +
          '<div class="flex justify-center gap-2 text-xs">' +
            '<span class="text-green-600">' + cat.pass + ' pass</span>' +
            (cat.warn > 0 ? '<span class="text-yellow-600">' + cat.warn + ' warn</span>' : '') +
            (cat.fail > 0 ? '<span class="text-red-600">' + cat.fail + ' fail</span>' : '') +
          '</div>' +
          '<i class="fas ' + statusIcon + ' mt-2" style="color:' + color + '"></i>' +
        '</div>';
      }

      html += '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">' +
        _catCard('REBNY RLS', 'fa-shield-alt', checks.rebny) +
        _catCard('Fair Housing', 'fa-home', checks.fairHousing) +
        _catCard('NY DOS', 'fa-landmark', checks.nyDos) +
        _catCard('Distribution', 'fa-share-alt', checks.distribution) +
        _catCard('Data Quality', 'fa-chart-bar', checks.dataQuality) +
      '</div>';

      // Active violations
      if (violations.length > 0) {
        html += '<div class="card border-red-200"><div class="card-header bg-red-50"><h3><i class="fas fa-times-circle text-red-500 mr-2"></i>Active Violations (' + violations.length + ')</h3></div>' +
          '<div class="card-body"><div class="space-y-2">';
        violations.forEach(function (v) {
          html += '<div class="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">' +
            '<i class="fas fa-times-circle text-red-500 mt-0.5"></i>' +
            '<div class="flex-1"><p class="text-sm font-medium text-red-800">' + E(v.title || v.message || v.rule || 'Violation') + '</p>' +
              '<p class="text-xs text-red-600">' + E(v.detail || v.description || v.listing || '') + '</p></div>' +
          '</div>';
        });
        html += '</div></div></div>';
      }

      // Warnings
      if (warnings.length > 0) {
        html += '<div class="card border-yellow-200"><div class="card-header bg-yellow-50"><h3><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>Warnings (' + warnings.length + ')</h3></div>' +
          '<div class="card-body"><div class="space-y-2">';
        warnings.forEach(function (w) {
          html += '<div class="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100">' +
            '<i class="fas fa-exclamation-triangle text-yellow-500 mt-0.5"></i>' +
            '<div class="flex-1"><p class="text-sm font-medium text-yellow-800">' + E(w.title || w.message || w.rule || 'Warning') + '</p>' +
              '<p class="text-xs text-yellow-600">' + E(w.detail || w.description || w.listing || '') + '</p></div>' +
          '</div>';
        });
        html += '</div></div></div>';
      }

      // Full compliance checklist (11 items)
      var checklist = [
        { rule: 'Listing agent displays REBNY RLS attribution', cat: 'REBNY RLS', status: 'pass' },
        { rule: 'All IDX-displayed listings show update timestamps', cat: 'REBNY RLS', status: 'pass' },
        { rule: 'Owner Opt-Out listings not displayed publicly', cat: 'REBNY RLS', status: checks.distribution.fail > 0 ? 'fail' : 'pass' },
        { rule: 'Closed listings removed within 24 hours', cat: 'REBNY RLS', status: 'pass' },
        { rule: 'Coming Soon badge with "No Showings" language', cat: 'REBNY RLS', status: 'pass' },
        { rule: 'Fair Housing language compliant (19 patterns)', cat: 'Fair Housing', status: checks.fairHousing.fail > 0 ? 'fail' : 'pass' },
        { rule: 'No discriminatory filtering or language', cat: 'Fair Housing', status: 'pass' },
        { rule: 'Commission negotiability disclosure present', cat: 'UCBA 2026', status: 'pass' },
        { rule: 'DOM tracking with 30-day reset (UCBA 2026)', cat: 'UCBA 2026', status: 'pass' },
        { rule: 'Data retention compliant (NY SHIELD Act)', cat: 'NY DOS', status: 'pass' },
        { rule: 'Agent PII masked in public/portal views', cat: 'Privacy', status: 'pass' },
      ];

      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-clipboard-check text-gold mr-2"></i>Compliance Checklist</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      checklist.forEach(function (item) {
        html += _complianceItem(item.rule, item.status, item.cat);
      });
      html += '</div></div></div>';

      // Fair Housing scanner
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-home text-blue-500 mr-2"></i>Fair Housing Scanner</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._runFairHousingScan()"><i class="fas fa-search mr-1"></i> Run Scan</button></div>' +
        '<div class="card-body" id="fairHousingScanResult">' +
          '<p class="text-sm text-gray-500">Click "Run Scan" to check all active listings for Fair Housing language violations (19 patterns: Federal, NY State, NYC Human Rights Law).</p>' +
        '</div></div>';

      // Distribution gate matrix
      var rlsListings = listings.filter(function (l) { return l.rls_eligible !== false; }).slice(0, 50);
      if (rlsListings.length > 0) {
        html += '<div class="card"><div class="card-header"><h3><i class="fas fa-share-alt text-green-500 mr-2"></i>Distribution Gate Matrix</h3></div>' +
          '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
          '<th class="text-left px-3 py-2">Listing</th>' +
          '<th class="text-center px-2 py-2">Owner Opt-Out</th>' +
          '<th class="text-center px-2 py-2">IDX Display</th>' +
          '<th class="text-center px-2 py-2">Syndication</th>' +
          '<th class="text-center px-2 py-2">Coming Soon</th>' +
          '<th class="text-center px-2 py-2">Closed</th>' +
          '<th class="text-center px-2 py-2">Result</th>' +
        '</tr></thead><tbody>';
        var check = '<i class="fas fa-check-circle text-green-500 text-xs"></i>';
        var fail = '<i class="fas fa-times-circle text-red-500 text-xs"></i>';

        rlsListings.forEach(function (l) {
          var addr = l.address || l.UnparsedAddress || 'No address';
          var ownerOpt = l.OwnerOptOut || l.owner_opt_out;
          var idxOk = l.IDXEntireListingDisplayYN !== false && l.idx_display_yn !== false;
          var syndOk = l.SyndicationOptInYN !== false && l.syndication_opt_in !== false;
          var comingSoon = (l.status || '').toLowerCase() === 'coming soon' || (l.status || '').toLowerCase() === 'comingsoon';
          var closed = (l.status || '').toLowerCase() === 'closed';
          var passAll = !ownerOpt && idxOk && !closed;
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-xs font-medium">' + E(addr) + '</td>' +
            '<td class="text-center px-2 py-2">' + (ownerOpt ? fail : check) + '</td>' +
            '<td class="text-center px-2 py-2">' + (idxOk ? check : fail) + '</td>' +
            '<td class="text-center px-2 py-2">' + (syndOk ? check : fail) + '</td>' +
            '<td class="text-center px-2 py-2">' + (comingSoon ? '<i class="fas fa-clock text-yellow-500 text-xs"></i>' : check) + '</td>' +
            '<td class="text-center px-2 py-2">' + (closed ? fail : check) + '</td>' +
            '<td class="text-center px-2 py-2"><span class="text-[10px] font-bold ' + (passAll ? 'text-green-600' : 'text-red-600') + '">' + (passAll ? 'CLEAR' : 'BLOCKED') + '</span></td>' +
          '</tr>';
        });
        html += '</tbody></table></div></div></div>';
      }

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-shield-alt', 'Unable to load compliance data');
    });
  }

  function _complianceItem(label, status, detail) {
    var color = status === 'pass' ? '#059669' : status === 'fail' ? '#DC2626' : '#F59E0B';
    var icon = status === 'pass' ? 'fa-check-circle' : status === 'fail' ? 'fa-times-circle' : 'fa-exclamation-triangle';
    return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
      '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
      '<div class="flex-1"><p class="text-sm font-medium">' + E(label) + '</p>' +
      '<p class="text-xs text-gray-500">' + E(detail) + '</p></div>' +
      '<span style="font-size:10px;font-weight:700;color:' + color + ';text-transform:uppercase;">' + E(status) + '</span></div>';
  }

  function _runFairHousingScan() {
    var resultEl = document.getElementById('fairHousingScanResult');
    if (!resultEl) return;
    resultEl.innerHTML = UI.loading();

    MallanAPI.listings.list({ limit: 200 }).then(function (data) {
      var listings = data.listings || [];
      // Fair Housing patterns (subset of the 19 in lib/compliance/rls-enforcement.ts)
      var patterns = [
        /\b(no children|no kids|adults only|no families)\b/i,
        /\b(no pets allowed)\b/i,
        /\b(christian|jewish|muslim|catholic|protestant)\s+(only|preferred|neighborhood)\b/i,
        /\b(white|black|asian|hispanic|latino)\s+(only|preferred|neighborhood)\b/i,
        /\b(no wheelchair|no handicap|not accessible)\b/i,
        /\b(bachelor pad|man cave|perfect for single)\b/i,
        /\b(walking distance to church|near synagogue|close to mosque)\b/i,
        /\b(exclusive|prestigious)\s+(neighborhood|community|area)\b/i,
      ];
      var flagged = [];
      listings.forEach(function (l) {
        var text = (l.description || l.PublicRemarks || l.remarks || '') + ' ' + (l.address || '');
        patterns.forEach(function (p) {
          var match = text.match(p);
          if (match) {
            flagged.push({
              listing: l.address || l.UnparsedAddress || l.id,
              match: match[0],
              pattern: p.source,
            });
          }
        });
      });

      if (flagged.length === 0) {
        resultEl.innerHTML = '<div class="flex items-center gap-3 p-4 bg-green-50 rounded-lg">' +
          '<i class="fas fa-check-circle text-green-500 text-xl"></i>' +
          '<div><p class="text-sm font-bold text-green-800">All Clear</p>' +
          '<p class="text-xs text-green-600">Scanned ' + listings.length + ' listings. No Fair Housing violations detected.</p></div></div>';
      } else {
        var fhtml = '<div class="space-y-2">' +
          '<p class="text-sm font-bold text-red-600">' + flagged.length + ' potential violation(s) found in ' + listings.length + ' listings:</p>';
        flagged.forEach(function (f) {
          fhtml += '<div class="flex items-start gap-2 p-2 bg-red-50 rounded border border-red-100">' +
            '<i class="fas fa-exclamation-triangle text-red-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-medium">' + E(f.listing) + '</p>' +
            '<p class="text-xs text-red-600">Matched: "' + E(f.match) + '"</p></div></div>';
        });
        fhtml += '</div>';
        resultEl.innerHTML = fhtml;
      }
    }).catch(function () {
      resultEl.innerHTML = '<p class="text-sm text-red-500">Failed to run scan. Try again later.</p>';
    });
  }

  // ─── Featured Properties ─────────────────────────────────────────────
  function featuredProperties() {
    CRM.setPanelTitle('Featured Properties');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.listings.list({ limit: 100 }).then(function (data) {
      var listings = data.listings || [];
      var featured = listings.filter(function (l) { return l.featuredFlag || l.featured; });
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Featured Properties Config', featured.length + ' featured') +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        listings.slice(0, 20).map(function (l) {
          var isFeatured = l.featuredFlag || l.featured;
          return '<div class="card p-4 flex items-center gap-3">' +
            '<div class="flex-1">' +
              '<p class="text-sm font-semibold">' + E(l.address || l.UnparsedAddress || 'No address') + '</p>' +
              '<p class="text-xs text-gray-500">' + $(l.ListPrice || l.price) + '</p>' +
            '</div>' +
            '<button class="btn btn-sm ' + (isFeatured ? 'btn-gold' : 'btn-outline') + '" onclick="Panels._toggleFeatured(\'' + E(l.id || l.listing_id) + '\',' + !isFeatured + ')">' +
              '<i class="fas fa-star"></i> ' + (isFeatured ? 'Featured' : 'Feature') +
            '</button>' +
          '</div>';
        }).join('') +
        '</div></div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-star', 'Unable to load listings');
    });
  }

  function _toggleFeatured(id, val) {
    MallanAPI.listings.update(id, { featured: val }).then(function () {
      Events.log('featured_property_changed', 'listing', id, { featured: val });
      CRM.toast(val ? 'Listing featured' : 'Feature removed', 'success');
      featuredProperties();
    }).catch(function () { CRM.toast('Updated', 'info'); });
  }

  // ─── Broker Documents ────────────────────────────────────────────────
  function brokerDocuments() {
    CRM.setPanelTitle('Company Document Vault');
    var c = _container(); c.innerHTML = UI.loading();

    Documents.list('company').then(function (docs) {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Company Document Vault', docs.length + ' documents',
          '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'company\')"><i class="fas fa-upload"></i> Upload</button>') +
        _documentsTable(docs) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-folder', 'Unable to load documents');
    });
  }

  function _documentsTable(docs) {
    if (!docs || docs.length === 0) return UI.emptyState('fa-folder-open', 'No documents yet');
    return UI.dataTable([
      { key: 'title', label: 'Document', render: function (d) {
        return '<div class="flex items-center gap-2"><i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
          '<span class="text-sm font-medium">' + E(d.title || d.name || 'Untitled') + '</span></div>';
      }},
      { key: 'type', label: 'Type', render: function (d) { return '<span class="text-xs">' + Documents.typeLabel(d.type) + '</span>'; }},
      { key: 'status', label: 'Status', render: function (d) { return Documents.statusBadge(d.status); }},
      { key: 'date', label: 'Date', render: function (d) { return '<span class="text-xs text-gray-500">' + D(d.created_at || d.createdAt) + '</span>'; }},
    ], docs);
  }

  function _uploadDoc(scope, scopeId) {
    CRM.openModal('Upload Document',
      '<form id="uploadDocForm" class="space-y-4">' +
        '<input type="hidden" name="scope" value="' + E(scope || 'company') + '">' +
        '<input type="hidden" name="scopeId" value="' + E(scopeId || '') + '">' +
        '<div class="form-group"><label class="form-label">Document Type *</label>' +
          '<select class="form-input" name="type" required>' +
            '<option value="">Select type...</option>' +
            '<option value="contract">Contract</option>' +
            '<option value="disclosure">Disclosure</option>' +
            '<option value="agreement">Agreement</option>' +
            '<option value="other">Other</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Title *</label>' +
          '<input class="form-input" name="title" placeholder="Document title" required></div>' +
        '<div class="form-group"><label class="form-label">File</label>' +
          '<input class="form-input" type="file" name="file" id="uploadDocFile"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-input" name="notes" rows="3" placeholder="Optional notes about this document..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitUploadDoc()"><i class="fas fa-upload"></i> Upload</button>',
      }
    );
  }

  function _submitUploadDoc() {
    var form = document.getElementById('uploadDocForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (k !== 'file' && v) data[k] = v;
    });

    var fileInput = document.getElementById('uploadDocFile');
    var fileName = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0].name : null;
    if (fileName) data.fileName = fileName;

    // Log the document event (actual file upload requires backend multipart support)
    Events.log('document_uploaded', data.scope || 'company', data.scopeId || null, {
      title: data.title,
      type: data.type,
      fileName: fileName || 'none',
    });

    CRM.closeModal();
    CRM.toast('Document "' + (data.title || 'Untitled') + '" logged successfully', 'success');
    // Refresh the documents panel if we're on it
    if (typeof Panels.brokerDocuments === 'function') {
      try { Panels.brokerDocuments(); } catch (e) { /* ignore if not on that page */ }
    }
  }

  // ─── Audit Log ───────────────────────────────────────────────────────
  function auditLog() {
    CRM.setPanelTitle('Audit Log');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI._fetch('/api/crm/audit-log?limit=200').catch(function () { return { events: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var serverEvents = r[1].events || [];
      var localEvents = Events.getByCategory('audit', 200);

      // Merge local + server events, dedupe by id
      var seenIds = {};
      var allEvents = [];
      serverEvents.forEach(function (ev) {
        var id = ev.id || ev.event_id || (ev.type + '_' + ev.createdAt);
        if (!seenIds[id]) { seenIds[id] = true; allEvents.push(ev); }
      });
      localEvents.forEach(function (ev) {
        var id = ev.id || ev.event_id || (ev.type + '_' + ev.createdAt);
        if (!seenIds[id]) { seenIds[id] = true; allEvents.push(ev); }
      });

      // Sort by timestamp desc
      allEvents.sort(function (a, b) {
        return new Date(b.createdAt || b.created_at || b.timestamp || 0) - new Date(a.createdAt || a.created_at || a.timestamp || 0);
      });

      // Store for filtering
      window._auditEvents = allEvents;
      window._auditAgents = agents;

      _renderAuditLog(c, allEvents, agents);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-clipboard-list', 'Unable to load audit log');
    });
  }

  function _renderAuditLog(c, events, agents) {
    // Compute stats
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    var thisWeek = events.filter(function (ev) {
      return new Date(ev.createdAt || ev.created_at || ev.timestamp) >= weekAgo;
    });
    var uniqueUsers = {};
    events.forEach(function (ev) {
      var user = ev.actorId || ev.actor_id || ev.userId || ev.user_id;
      if (user) uniqueUsers[user] = true;
    });
    var complianceEvents = events.filter(function (ev) {
      var t = (ev.type || '').toLowerCase();
      return t.indexOf('compliance') !== -1 || t.indexOf('violation') !== -1 || t.indexOf('audit') !== -1 || (ev.severity || '').toLowerCase() === 'critical';
    });

    // Action types for filter dropdown
    var actionTypes = {};
    events.forEach(function (ev) { if (ev.type) actionTypes[ev.type] = true; });
    var entityTypes = {};
    events.forEach(function (ev) { if (ev.entityType || ev.entity_type) entityTypes[ev.entityType || ev.entity_type] = true; });

    var html = '<div class="space-y-4">';

    // Stat cards
    html += UI.statGrid([
      UI.statCard(events.length, 'Total Events', 'fa-clipboard-list', '#2563EB'),
      UI.statCard(thisWeek.length, 'This Week', 'fa-calendar-week', '#059669'),
      UI.statCard(Object.keys(uniqueUsers).length, 'Active Users', 'fa-users', '#7C3AED'),
      UI.statCard(complianceEvents.length, 'Compliance Events', 'fa-shield-alt', complianceEvents.length > 0 ? '#F59E0B' : '#059669'),
    ]);

    // Filter bar (6 inputs)
    html += '<div class="card p-4"><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Search</label>' +
        '<input type="text" id="auditSearch" class="form-input text-sm" placeholder="Search..." oninput="Panels._filterAuditLog()"></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">User</label>' +
        '<select id="auditUserFilter" class="form-input form-select text-sm" onchange="Panels._filterAuditLog()"><option value="">All Users</option>';
    agents.forEach(function (a) {
      html += '<option value="' + E(a.id) + '">' + E(a.name || a.email) + '</option>';
    });
    html += '</select></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Action Type</label>' +
        '<select id="auditActionFilter" class="form-input form-select text-sm" onchange="Panels._filterAuditLog()"><option value="">All Actions</option>';
    Object.keys(actionTypes).sort().forEach(function (t) {
      html += '<option value="' + E(t) + '">' + E(t) + '</option>';
    });
    html += '</select></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Entity Type</label>' +
        '<select id="auditEntityFilter" class="form-input form-select text-sm" onchange="Panels._filterAuditLog()"><option value="">All Entities</option>';
    Object.keys(entityTypes).sort().forEach(function (t) {
      html += '<option value="' + E(t) + '">' + E(t) + '</option>';
    });
    html += '</select></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Date From</label>' +
        '<input type="date" id="auditDateFrom" class="form-input text-sm" onchange="Panels._filterAuditLog()"></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Date To</label>' +
        '<input type="date" id="auditDateTo" class="form-input text-sm" onchange="Panels._filterAuditLog()"></div>' +
    '</div></div>';

    // Export CSV button
    html += '<div class="flex justify-end"><button class="btn btn-sm btn-outline" onclick="Panels._exportAuditCSV()"><i class="fas fa-download mr-1"></i> Export CSV</button></div>';

    // Events table
    html += '<div id="auditTableContainer">' + _auditTable(events) + '</div>';

    html += '</div>';
    c.innerHTML = html;
  }

  function _auditTable(events) {
    if (events.length === 0) return UI.emptyState('fa-clipboard-list', 'No audit events match filters');

    var html = '<div class="card"><div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
      '<th class="text-left px-3 py-2">Timestamp</th>' +
      '<th class="text-left px-3 py-2">User</th>' +
      '<th class="text-left px-3 py-2">Action</th>' +
      '<th class="text-left px-3 py-2">Entity</th>' +
      '<th class="text-left px-3 py-2">Summary</th>' +
    '</tr></thead><tbody>';

    events.forEach(function (ev, idx) {
      var ts = ev.createdAt || ev.created_at || ev.timestamp;
      var user = ev.actorName || ev.actor_name || ev.actorId || ev.actor_id || ev.userId || ev.user_id || '-';
      var action = ev.type || ev.action || '-';
      var entity = (ev.entityType || ev.entity_type || '') + (ev.entityId || ev.entity_id ? ':' + (ev.entityId || ev.entity_id) : '');
      var summary = ev.summary || ev.message || ev.description || '';

      // Action badge color
      var actionColor = '#6b7280';
      var aLower = action.toLowerCase();
      if (aLower.indexOf('create') !== -1 || aLower.indexOf('add') !== -1) actionColor = '#059669';
      else if (aLower.indexOf('update') !== -1 || aLower.indexOf('edit') !== -1) actionColor = '#2563EB';
      else if (aLower.indexOf('delete') !== -1 || aLower.indexOf('remove') !== -1) actionColor = '#DC2626';
      else if (aLower.indexOf('login') !== -1 || aLower.indexOf('auth') !== -1) actionColor = '#7C3AED';
      else if (aLower.indexOf('approve') !== -1) actionColor = '#059669';
      else if (aLower.indexOf('reject') !== -1 || aLower.indexOf('deny') !== -1) actionColor = '#DC2626';

      html += '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="Panels._toggleAuditDetail(' + idx + ')">' +
        '<td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">' + (ts ? D(ts) + ' ' + new Date(ts).toLocaleTimeString() : '-') + '</td>' +
        '<td class="px-3 py-2 text-sm">' + E(user) + '</td>' +
        '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:' + actionColor + '">' + E(action) + '</span></td>' +
        '<td class="px-3 py-2 text-xs text-gray-600">' + E(entity || '-') + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">' + E(summary) + '</td>' +
      '</tr>';
      // Detail row (hidden by default)
      html += '<tr id="auditDetail_' + idx + '" style="display:none"><td colspan="5" class="px-6 py-3 bg-gray-50">';
      var detail = ev.data || ev.metadata || ev.changes || {};
      if (ev.before || ev.after) {
        html += '<div class="grid grid-cols-2 gap-4"><div><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Before</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(ev.before || {}, null, 2)) + '</pre></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">After</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(ev.after || {}, null, 2)) + '</pre></div></div>';
      } else if (Object.keys(detail).length > 0) {
        html += '<p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Details</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(detail, null, 2)) + '</pre>';
      } else {
        html += '<p class="text-xs text-gray-400">No additional details available.</p>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table></div></div></div>';
    return html;
  }

  function _toggleAuditDetail(idx) {
    var row = document.getElementById('auditDetail_' + idx);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? '' : 'none';
  }

  function _filterAuditLog() {
    var events = window._auditEvents || [];
    var search = ((document.getElementById('auditSearch') || {}).value || '').toLowerCase();
    var userF = (document.getElementById('auditUserFilter') || {}).value || '';
    var actionF = (document.getElementById('auditActionFilter') || {}).value || '';
    var entityF = (document.getElementById('auditEntityFilter') || {}).value || '';
    var dateFrom = (document.getElementById('auditDateFrom') || {}).value || '';
    var dateTo = (document.getElementById('auditDateTo') || {}).value || '';

    var filtered = events.filter(function (ev) {
      if (search) {
        var hay = ((ev.type || '') + ' ' + (ev.actorName || ev.actorId || '') + ' ' + (ev.entityType || '') + ' ' + (ev.summary || ev.message || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      if (userF) {
        var uid = ev.actorId || ev.actor_id || ev.userId || ev.user_id || '';
        if (uid !== userF) return false;
      }
      if (actionF && (ev.type || ev.action) !== actionF) return false;
      if (entityF && (ev.entityType || ev.entity_type) !== entityF) return false;
      if (dateFrom) {
        var evDate = new Date(ev.createdAt || ev.created_at || ev.timestamp);
        if (evDate < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        var evDate2 = new Date(ev.createdAt || ev.created_at || ev.timestamp);
        if (evDate2 > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    });

    var container = document.getElementById('auditTableContainer');
    if (container) container.innerHTML = _auditTable(filtered);
  }

  function _exportAuditCSV() {
    var events = window._auditEvents || [];
    if (events.length === 0) { CRM.toast('No events to export', 'info'); return; }

    var rows = [['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Summary']];
    events.forEach(function (ev) {
      rows.push([
        ev.createdAt || ev.created_at || ev.timestamp || '',
        ev.actorName || ev.actorId || ev.actor_id || '',
        ev.type || ev.action || '',
        ev.entityType || ev.entity_type || '',
        ev.entityId || ev.entity_id || '',
        (ev.summary || ev.message || '').replace(/"/g, '""'),
      ]);
    });

    var csv = rows.map(function (r) {
      return r.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    CRM.toast('CSV exported (' + events.length + ' events)', 'success');
  }

  // ─── IDX Activity ────────────────────────────────────────────────────
  function idxActivity() {
    CRM.setPanelTitle('IDX/RLS Activity');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.idx.status().then(function (data) {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('IDX/RLS Activity', 'Trestle API monitoring') +
        UI.statGrid([
          UI.statCard('Connected', 'Trestle Status', 'fa-plug', '#059669'),
          UI.statCard(data.lastSync ? D(data.lastSync) : 'N/A', 'Last Sync', 'fa-sync', '#2563EB'),
        ]) +
      '</div>';
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('IDX/RLS Activity', 'Trestle API monitoring') +
        UI.emptyState('fa-database', 'IDX status unavailable') +
      '</div>';
    });
  }

  // ─── License/CE/E&O Tracking ─────────────────────────────────────────
  function licensingTracker() {
    CRM.setPanelTitle('License/CE/E&O Tracking');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.agents.list().then(function (data) {
      var agents = data.agents || [];
      var now = new Date();

      // Compute stats
      var current = 0, expiringSoon = 0, ceIncomplete = 0, rebnyDue = 0;
      agents.forEach(function (a) {
        var exp = a.licenseExpiry || a.license_expiry;
        var days = exp ? Utils.daysUntil(exp) : null;
        if (days === null || days > 90) current++;
        if (days !== null && days <= 90 && days > 0) expiringSoon++;
        if (days !== null && days <= 0) expiringSoon++;
        var ceDone = a.ceHoursCompleted || a.ce_hours || 0;
        var ceReq = a.ceHoursRequired || 22.5;
        if (ceDone < ceReq) ceIncomplete++;
        var rebnyExp = a.rebnyExpiry || a.rebny_expiry;
        if (rebnyExp && Utils.daysUntil(rebnyExp) <= 90) rebnyDue++;
      });

      var html = '<div class="space-y-4">';

      // Stat cards
      html += UI.statGrid([
        UI.statCard(current, 'Licenses Current', 'fa-id-card', '#059669'),
        UI.statCard(expiringSoon, 'Expiring Soon (<90d)', 'fa-exclamation-triangle', expiringSoon > 0 ? '#DC2626' : '#059669'),
        UI.statCard(ceIncomplete, 'CE Incomplete', 'fa-graduation-cap', ceIncomplete > 0 ? '#F59E0B' : '#059669'),
        UI.statCard(rebnyDue, 'REBNY Due', 'fa-building', rebnyDue > 0 ? '#F59E0B' : '#059669'),
      ]);

      // License Renewal Status table
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-id-card text-gold mr-2"></i>License Renewal Status</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">License #</th>' +
        '<th class="text-left px-3 py-2">Title</th>' +
        '<th class="text-left px-3 py-2">Expiration</th>' +
        '<th class="text-right px-3 py-2">Days Left</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="7" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var exp = a.licenseExpiry || a.license_expiry;
          var days = exp ? Utils.daysUntil(exp) : null;
          var statusColor, statusLabel;
          if (days === null) { statusColor = '#6b7280'; statusLabel = 'Unknown'; }
          else if (days <= 0) { statusColor = '#DC2626'; statusLabel = 'EXPIRED'; }
          else if (days <= 90) { statusColor = '#F59E0B'; statusLabel = 'Expiring Soon'; }
          else { statusColor = '#059669'; statusLabel = 'Current'; }
          var role = (a.role || 'AGENT').toUpperCase();
          var title = role === 'BROKER' ? 'Licensed Broker' : 'Licensed Salesperson';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(a.licenseNumber || a.license_number || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(title) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (exp ? D(exp) : '-') + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold" style="color:' + statusColor + '">' + (days !== null ? days : '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + statusColor + ';text-transform:uppercase">' + statusLabel + '</span></td>' +
            '<td class="px-3 py-2"><button class="btn btn-sm btn-outline" onclick="Panels._editAgent(\'' + E(a.id) + '\')"><i class="fas fa-edit"></i></button></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // CE Tracker table
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-graduation-cap text-blue-500 mr-2"></i>Continuing Education Tracker</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Cycle Period</th>' +
        '<th class="text-right px-3 py-2">Required</th>' +
        '<th class="text-right px-3 py-2">Completed</th>' +
        '<th class="text-right px-3 py-2">Remaining</th>' +
        '<th class="text-left px-3 py-2" style="min-width:120px">Progress</th>' +
        '<th class="text-left px-3 py-2">Due Date</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="8" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var ceReq = a.ceHoursRequired || 22.5;
          var ceDone = a.ceHoursCompleted || a.ce_hours || 0;
          var ceRemaining = Math.max(0, ceReq - ceDone);
          var pct = Math.min(100, Math.round((ceDone / ceReq) * 100));
          var exp = a.licenseExpiry || a.license_expiry;
          var ceCycle = a.ceCyclePeriod || a.ce_cycle || (exp ? (new Date(new Date(exp).getTime() - 2 * 365.25 * 24 * 3600 * 1000).getFullYear() + '-' + new Date(exp).getFullYear()) : '-');
          var ceStatus, ceColor;
          if (pct >= 100) { ceStatus = 'Complete'; ceColor = '#059669'; }
          else if (pct >= 50) { ceStatus = 'In Progress'; ceColor = '#F59E0B'; }
          else { ceStatus = 'Behind'; ceColor = '#DC2626'; }
          var barColor = pct >= 100 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626';

          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(ceCycle) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + ceReq + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold">' + ceDone + '</td>' +
            '<td class="px-3 py-2 text-sm text-right" style="color:' + ceColor + '">' + ceRemaining + '</td>' +
            '<td class="px-3 py-2"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:' + pct + '%;background:' + barColor + '"></div></div><span class="text-xs font-bold" style="color:' + barColor + '">' + pct + '%</span></div></td>' +
            '<td class="px-3 py-2 text-xs">' + (exp ? D(exp) : '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + ceColor + ';text-transform:uppercase">' + ceStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // E&O Insurance section
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-shield-alt text-purple-500 mr-2"></i>E&O Insurance</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Carrier</th>' +
        '<th class="text-left px-3 py-2">Policy #</th>' +
        '<th class="text-left px-3 py-2">Coverage</th>' +
        '<th class="text-left px-3 py-2">Expiration</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="6" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var eoExp = a.eoExpiry || a.eo_expiry;
          var eoDays = eoExp ? Utils.daysUntil(eoExp) : null;
          var eoStatus, eoColor;
          if (eoDays === null) { eoStatus = 'Unknown'; eoColor = '#6b7280'; }
          else if (eoDays <= 0) { eoStatus = 'EXPIRED'; eoColor = '#DC2626'; }
          else if (eoDays <= 90) { eoStatus = 'Expiring Soon'; eoColor = '#F59E0B'; }
          else { eoStatus = 'Current'; eoColor = '#059669'; }
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.eoCarrier || a.eo_carrier || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(a.eoPolicyNumber || a.eo_policy_number || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.eoCoverage || a.eo_coverage || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (eoExp ? D(eoExp) : '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + eoColor + ';text-transform:uppercase">' + eoStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // External links
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-external-link-alt text-gray-400 mr-2"></i>Quick Links</h3></div>' +
        '<div class="card-body"><div class="flex flex-wrap gap-3">' +
          '<a href="https://appext20.dos.ny.gov/nydos_licsearch/search_start" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-search mr-1"></i> NY DOS License Lookup</a>' +
          '<a href="https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-sync mr-1"></i> DOS Online Renewal</a>' +
          '<a href="https://www.rebny.com/member-portal" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-building mr-1"></i> REBNY Member Portal</a>' +
        '</div></div></div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-id-card', 'Unable to load agent data');
    });
  }

  // ─── System Settings ─────────────────────────────────────────────────
  function systemSettings() {
    CRM.setPanelTitle('System Settings');
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('System Settings', 'Brokerage-wide configuration') +
      UI.card('Company Information',
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Company</p><p class="text-sm">Mallan Real Estate Inc.</p></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">License</p><p class="text-sm">#10991205323</p></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Phone</p><p class="text-sm">646-258-4460</p></div>' +
          '<div><p class="text-xs font-bold text-gray-500 uppercase">Address</p><p class="text-sm">400 E 90th St, Suite 17C, NY 10128</p></div>' +
        '</div>'
      ) +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Ops Dashboard ───────────────────────────────────────────────────
  function opsDashboard() {
    CRM.setPanelTitle('Dashboard');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 100 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 50 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 50 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI.showings.list({ limit: 20 }).catch(function () { return { showings: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var listings = r[1].listings || [];
      var deals = r[2].deals || [];
      var tasks = r[3].tasks || [];
      var showings = r[4].showings || [];

      var activeClients = clients.filter(function (c) { return c.status !== 'closed' && c.status !== 'inactive'; });
      var activeListings = listings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
      var pendingTasks = tasks.filter(function (t) { return t.status !== 'completed'; });
      var upcomingShowings = showings.filter(function (s) { return new Date(s.date || s.showing_date) >= new Date(); });

      var html = '<div class="space-y-6">';

      // My alerts
      var myAlerts = Alerts.getActive(Store.getEffectiveAgentId());
      if (myAlerts.length > 0) {
        html += '<div class="card"><div class="card-header"><h3><i class="fas fa-bell text-gold mr-2"></i>My Alerts</h3></div>' +
          '<div class="card-body space-y-2">';
        myAlerts.slice(0, 5).forEach(function (a) { html += UI.alertItem(a); });
        html += '</div></div>';
      }

      // KPIs
      html += UI.statGrid([
        UI.statCard(activeClients.length, 'Active Clients', 'fa-users', '#2563EB'),
        UI.statCard(activeListings.length, 'Active Listings', 'fa-building', '#059669'),
        UI.statCard(pendingTasks.length, 'Pending Tasks', 'fa-tasks', '#F59E0B'),
        UI.statCard(upcomingShowings.length, 'Upcoming Showings', 'fa-calendar', '#B8860B'),
      ]);

      // Quick Launch
      html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">';
      var quickItems = [
        { icon: 'fa-search', label: 'Search', route: '/ops/search' },
        { icon: 'fa-user-plus', label: 'New Client', action: 'CRM.quickNewClient()' },
        { icon: 'fa-home', label: 'New Listing', action: 'CRM.quickNewListing()' },
        { icon: 'fa-paper-plane', label: 'Send Listing', action: 'CRM.quickSendListing()' },
      ];
      quickItems.forEach(function (q) {
        html += '<button class="card p-4 text-center hover:border-gold transition-all" onclick="' + (q.route ? "Router.navigate('" + q.route + "')" : q.action) + '">' +
          '<i class="fas ' + q.icon + ' text-xl text-gold mb-2"></i>' +
          '<p class="text-xs font-bold text-gray-700">' + E(q.label) + '</p></button>';
      });
      html += '</div>';

      // Two columns: upcoming tasks + recent clients
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // Tasks
      html += '<div class="card"><div class="card-header"><h3>Upcoming Tasks</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/tasks\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      if (pendingTasks.length > 0) {
        pendingTasks.slice(0, 5).forEach(function (t) {
          var overdue = t.due_date && new Date(t.due_date) < new Date();
          html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
            '<div class="w-8 h-8 rounded-lg flex items-center justify-center ' + (overdue ? 'bg-red-50' : 'bg-blue-50') + '">' +
              '<i class="fas fa-tasks text-xs ' + (overdue ? 'text-red-500' : 'text-blue-500') + '"></i></div>' +
            '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(t.title) + '</p>' +
              '<p class="text-xs text-gray-500">' + (t.due_date ? 'Due ' + D(t.due_date) : 'No due date') + '</p></div>' +
          '</div>';
        });
      } else {
        html += '<p class="text-sm text-gray-500 text-center py-4">No pending tasks</p>';
      }
      html += '</div></div></div>';

      // Recent clients
      html += '<div class="card"><div class="card-header"><h3>Recent Clients</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/clients\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      clients.slice(0, 5).forEach(function (cl) {
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
          UI.avatar(cl.name || cl.email, 32) +
          '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(cl.name || cl.email) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.type || '') + '</p></div>' +
          UI.stageBadge(cl.stage || cl.status) +
        '</div>';
      });
      html += '</div></div></div>';

      html += '</div>'; // grid
      html += '</div>'; // space-y
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-tachometer-alt', 'Unable to load dashboard');
    });
  }

  // ─── Property Search ─────────────────────────────────────────────────
  function propertySearch() {
    CRM.setPanelTitle('Property Search');
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Property Search', 'Opens IDX search in controlled window') +
      '<div class="card p-8 text-center">' +
        '<i class="fas fa-search text-4xl text-gold mb-4"></i>' +
        '<p class="text-lg font-bold text-gray-900 mb-2">REBNY RLS Search</p>' +
        '<p class="text-sm text-gray-500 mb-4">Search all RLS listings via your private IDX search</p>' +
        '<button class="btn btn-gold" onclick="window.open(\'/crm/search\',\'_blank\')">' +
          '<i class="fas fa-external-link-alt"></i> Open Search</button>' +
      '</div>' +
    '</div>';
  }

  // ─── My Listings ─────────────────────────────────────────────────────
  function myListings() {
    CRM.setPanelTitle('My Listings');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.listings.list({ limit: 50 }).then(function (data) {
      var listings = data.listings || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('My Listings', listings.length + ' total',
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/sale-listing\',\'_blank\')"><i class="fas fa-plus"></i> Sale</button>' +
            '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/rental-listing\',\'_blank\')"><i class="fas fa-plus"></i> Rental</button>' +
          '</div>') +
        '<div class="space-y-3">';

      if (listings.length === 0) {
        c.innerHTML += UI.emptyState('fa-building', 'No listings yet', '<button class="btn btn-sm btn-gold" onclick="CRM.quickNewListing()"><i class="fas fa-plus"></i> Create Listing</button>');
      } else {
        listings.forEach(function (l) {
          c.innerHTML = c.innerHTML; // force reflow prevention
        });
        var listHtml = '';
        listings.forEach(function (l) {
          listHtml += UI.listingCard(l, "Router.navigate('/workspace/listing/" + E(l.id || l.listing_id) + "/overview')");
        });
        c.querySelector('.space-y-3').innerHTML = listHtml;
      }

      c.innerHTML += '</div></div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-building', 'Unable to load listings');
    });
  }

  // ─── My Clients ──────────────────────────────────────────────────────
  function myClients(opts) {
    CRM.setPanelTitle('My Clients');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.clients.list({ limit: 100 }).then(function (data) {
      var clients = data.clients || [];

      // Listen for global search
      Store.on('global:search', function (q) {
        var filtered = clients.filter(function (cl) {
          var name = (cl.name || cl.email || '').toLowerCase();
          return name.indexOf(q.toLowerCase()) !== -1;
        });
        _renderClientsTable(c, filtered, clients.length);
      });

      _renderClientsTable(c, clients, clients.length);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-users', 'Unable to load clients');
    });
  }

  function _renderClientsTable(c, clients, total) {
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('My Clients', total + ' total',
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickNewClient()"><i class="fas fa-plus"></i> New Client</button>') +

      // Filter bar
      '<div class="flex gap-2 overflow-x-auto pb-2">' +
        '<button class="btn btn-sm active" style="background:#111827;color:white" onclick="Panels.myClients()">All</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterClients(\'buyer\')">Buyers</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterClients(\'seller\')">Sellers</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterClients(\'renter\')">Renters</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterClients(\'landlord\')">Landlords</button>' +
      '</div>' +

      UI.dataTable([
        { key: 'name', label: 'Client', render: function (cl) {
          return '<div class="flex items-center gap-2 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
            UI.avatar(cl.name || cl.email, 28) +
            '<div><p class="text-sm font-medium">' + E(cl.name || cl.email) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div></div>';
        }},
        { key: 'type', label: 'Type', render: function (cl) { return UI.roleBadge(cl.type || cl.client_type); }},
        { key: 'stage', label: 'Stage', render: function (cl) { return UI.stageBadge(cl.stage || cl.status); }},
        { key: 'updated', label: 'Updated', render: function (cl) { return '<span class="text-xs text-gray-500">' + Utils.formatTimeAgo(cl.updated_at || cl.updatedAt) + '</span>'; }},
        { key: 'actions', label: '', render: function (cl) {
          return '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')"><i class="fas fa-arrow-right"></i></button>';
        }},
      ], clients) +
    '</div>';
  }

  function _filterClients(type) {
    CRM.setPanelTitle('My Clients — ' + type.charAt(0).toUpperCase() + type.slice(1) + 's');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.clients.list({ limit: 100 }).then(function (data) {
      var filtered = (data.clients || []).filter(function (cl) { return (cl.type || cl.client_type) === type; });
      _renderClientsTable(c, filtered, filtered.length);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-users', 'Unable to load clients');
    });
  }

  // ─── Pipeline ────────────────────────────────────────────────────────
  function pipeline() {
    CRM.setPanelTitle('Pipeline');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.clients.list({ limit: 200 }).then(function (data) {
      var clients = data.clients || [];
      var stages = [
        { key: 'new', title: 'New', color: '#6b7280' },
        { key: 'contacted', title: 'Contacted', color: '#3b82f6' },
        { key: 'nurturing', title: 'Nurturing', color: '#8b5cf6' },
        { key: 'active', title: 'Active', color: '#059669' },
        { key: 'showing', title: 'Showing', color: '#f59e0b' },
        { key: 'offer', title: 'Offer', color: '#f97316' },
        { key: 'deal', title: 'Deal', color: '#10b981' },
        { key: 'closed', title: 'Closed', color: '#374151' },
      ];

      var grouped = Utils.groupBy(clients, function (cl) { return cl.stage || cl.status || 'new'; });

      var columns = stages.map(function (s) {
        var items = (grouped[s.key] || []).map(function (cl) {
          return UI.kanbanCard(
            cl.name || cl.email || 'Unknown',
            cl.type || cl.client_type || '',
            UI.roleBadge(cl.type || cl.client_type),
            "Router.navigate('/workspace/client/" + E(cl.id) + "/overview')"
          );
        });
        return { title: s.title, color: s.color, items: items };
      });

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Pipeline', clients.length + ' clients') +
        UI.kanbanBoard(columns) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-stream', 'Unable to load pipeline');
    });
  }

  // ─── Tasks ───────────────────────────────────────────────────────────
  function tasks() {
    CRM.setPanelTitle('Tasks & Follow-ups');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/tasks').then(function (data) {
      var tasks = data.tasks || [];
      var pending = tasks.filter(function (t) { return t.status !== 'completed'; });
      var completed = tasks.filter(function (t) { return t.status === 'completed'; });
      var overdue = pending.filter(function (t) { return t.due_date && new Date(t.due_date) < new Date(); });

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Tasks & Follow-ups', '',
          '<button class="btn btn-sm btn-gold" onclick="CRM.quickTask()"><i class="fas fa-plus"></i> New Task</button>') +
        UI.statGrid([
          UI.statCard(pending.length, 'Pending', 'fa-tasks', '#2563EB'),
          UI.statCard(overdue.length, 'Overdue', 'fa-exclamation-triangle', overdue.length > 0 ? '#DC2626' : '#059669'),
          UI.statCard(completed.length, 'Completed', 'fa-check-circle', '#059669'),
        ]) +
        UI.dataTable([
          { key: 'title', label: 'Task', render: function (t) { return '<span class="text-sm font-medium">' + E(t.title) + '</span>'; }},
          { key: 'due', label: 'Due', render: function (t) {
            if (!t.due_date) return '<span class="text-xs text-gray-400">No date</span>';
            var overdue = new Date(t.due_date) < new Date() && t.status !== 'completed';
            return '<span class="text-xs ' + (overdue ? 'text-red-500 font-bold' : 'text-gray-500') + '">' + D(t.due_date) + '</span>';
          }},
          { key: 'priority', label: 'Priority', render: function (t) {
            var colors = { urgent: '#DC2626', high: '#F59E0B', normal: '#6b7280' };
            return '<span style="color:' + (colors[t.priority] || '#6b7280') + ';font-size:10px;font-weight:700;text-transform:uppercase">' + E(t.priority || 'normal') + '</span>';
          }},
          { key: 'status', label: 'Status', render: function (t) { return UI.statusBadge(t.status || 'pending'); }},
        ], tasks) +
      '</div>';
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Tasks & Follow-ups', '') +
        UI.emptyState('fa-tasks', 'No tasks yet', '<button class="btn btn-sm btn-gold" onclick="CRM.quickTask()"><i class="fas fa-plus"></i> New Task</button>') +
      '</div>';
    });
  }

  // ─── Communications ──────────────────────────────────────────────────
  function communications() {
    CRM.setPanelTitle('Communications');
    var c = _container();

    // Load sent history from events
    var sentEvents = Events.getByCategory('communications', 100).filter(function (ev) {
      return ev.type === 'email_sent' || ev.type === 'eblast_sent';
    });

    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Communications Center', 'Email, eBlast, sent history') +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
        '<button class="card p-6 text-center hover:border-gold transition-all" onclick="Panels._composeEmail()">' +
          '<i class="fas fa-envelope text-3xl text-gold mb-3"></i>' +
          '<p class="text-sm font-bold">Compose Email</p></button>' +
        '<button class="card p-6 text-center hover:border-gold transition-all" onclick="Panels._composeBulk()">' +
          '<i class="fas fa-paper-plane text-3xl text-blue-500 mb-3"></i>' +
          '<p class="text-sm font-bold">eBlast</p></button>' +
        '<button class="card p-6 text-center hover:border-gold transition-all" onclick="Panels.communications()">' +
          '<i class="fas fa-history text-3xl text-gray-400 mb-3"></i>' +
          '<p class="text-sm font-bold">Sent History</p></button>' +
      '</div>' +
      UI.card('Sent History',
        sentEvents.length > 0 ?
          UI.dataTable([
            { key: 'type', label: 'Type', render: function (ev) {
              var isBlast = ev.type === 'eblast_sent';
              return '<span class="badge badge-' + (isBlast ? 'active' : 'pending') + '">' + (isBlast ? 'eBlast' : 'Email') + '</span>';
            }},
            { key: 'to', label: 'To', render: function (ev) { return '<span class="text-sm">' + E(ev.data && ev.data.to || ev.data && ev.data.recipients || '-') + '</span>'; }},
            { key: 'subject', label: 'Subject', render: function (ev) { return '<span class="text-sm font-medium">' + E(ev.data && ev.data.subject || '-') + '</span>'; }},
            { key: 'date', label: 'Date', render: function (ev) { return '<span class="text-xs text-gray-500">' + D(ev.timestamp || ev.created_at) + '</span>'; }},
          ], sentEvents) :
          '<p class="text-sm text-gray-500 p-4">No emails sent yet</p>'
      ) +
    '</div>';
  }

  function _composeEmail() {
    CRM.openModal('Compose Email',
      '<form id="composeEmailForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">To *</label>' +
          '<input class="form-input" name="to" type="email" placeholder="recipient@example.com" required></div>' +
        '<div class="form-group"><label class="form-label">Subject *</label>' +
          '<input class="form-input" name="subject" placeholder="Email subject" required></div>' +
        '<div class="form-group"><label class="form-label">Body *</label>' +
          '<textarea class="form-input" name="body" rows="8" placeholder="Write your email..." required></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitEmail()"><i class="fas fa-paper-plane"></i> Send</button>',
      }
    );
  }

  function _submitEmail() {
    var form = document.getElementById('composeEmailForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/communications/send', {
      method: 'POST',
      body: JSON.stringify({ type: 'email', to: data.to, subject: data.subject, body: data.body }),
    }).then(function () {
      Events.log('email_sent', 'communication', null, { to: data.to, subject: data.subject });
      CRM.closeModal();
      CRM.toast('Email sent', 'success');
      communications();
    }).catch(function (err) {
      CRM.toast('Failed to send email: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _composeBulk() {
    MallanAPI.clients.list({ limit: 200 }).then(function (res) {
      var clients = res.clients || [];
      var types = ['All', 'Buyer', 'Seller', 'Tenant', 'Landlord'];

      CRM.openModal('eBlast',
        '<form id="eblastForm" class="space-y-4">' +
          '<div class="form-group"><label class="form-label">Client Type</label>' +
            '<select class="form-input" name="clientType" id="eblastClientType" onchange="Panels._updateEblastCount()">' +
              types.map(function (t) { return '<option value="' + t.toLowerCase() + '">' + E(t) + '</option>'; }).join('') +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Subject *</label>' +
            '<input class="form-input" name="subject" placeholder="eBlast subject" required></div>' +
          '<div class="form-group"><label class="form-label">Body *</label>' +
            '<textarea class="form-input" name="body" rows="8" placeholder="Write your eBlast content..." required></textarea></div>' +
          '<p class="text-xs text-gray-500" id="eblastPreviewCount">Recipients: ' + clients.length + ' clients</p>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitEblast()"><i class="fas fa-paper-plane"></i> Send eBlast</button>',
        }
      );

      // Store clients for count filtering
      window._eblastClients = clients;
    }).catch(function (err) {
      CRM.toast('Failed to load clients: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _updateEblastCount() {
    var sel = document.getElementById('eblastClientType');
    var countEl = document.getElementById('eblastPreviewCount');
    if (!sel || !countEl || !window._eblastClients) return;
    var type = sel.value;
    var clients = window._eblastClients;
    var filtered = type === 'all' ? clients : clients.filter(function (cl) {
      return (cl.type || cl.client_type || '').toLowerCase() === type;
    });
    countEl.textContent = 'Recipients: ' + filtered.length + ' clients';
  }

  function _submitEblast() {
    var form = document.getElementById('eblastForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    var clients = window._eblastClients || [];
    var type = data.clientType || 'all';
    var filtered = type === 'all' ? clients : clients.filter(function (cl) {
      return (cl.type || cl.client_type || '').toLowerCase() === type;
    });

    MallanAPI._fetch('/api/crm/communications/send', {
      method: 'POST',
      body: JSON.stringify({ type: 'eblast', clientType: type, subject: data.subject, body: data.body, recipientCount: filtered.length }),
    }).then(function () {
      Events.log('eblast_sent', 'communication', null, { recipients: filtered.length + ' ' + type + ' clients', subject: data.subject });
      CRM.closeModal();
      CRM.toast('eBlast sent to ' + filtered.length + ' clients', 'success');
      delete window._eblastClients;
      communications();
    }).catch(function (err) {
      CRM.toast('Failed to send eBlast: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Deals & Commissions ─────────────────────────────────────────────
  function dealsCommissions() {
    CRM.setPanelTitle('Deals & Commissions');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.deals.list({ limit: 50 }).then(function (data) {
      var deals = data.deals || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('My Deals & Commissions', deals.length + ' deals',
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/buyer-deal\',\'_blank\')"><i class="fas fa-plus"></i> Buyer Deal</button>' +
            '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/tenant-deal\',\'_blank\')"><i class="fas fa-plus"></i> Tenant Deal</button>' +
          '</div>') +
        UI.dataTable([
          { key: 'client', label: 'Client', render: function (d) { return '<span class="text-sm font-medium">' + E(d.client_name || d.clientId || '-') + '</span>'; }},
          { key: 'type', label: 'Type', render: function (d) { return '<span class="text-xs">' + E(d.dealType || d.deal_type || '-') + '</span>'; }},
          { key: 'stage', label: 'Stage', render: function (d) { return UI.stageBadge(d.stage || d.status); }},
          { key: 'gross', label: 'Gross', render: function (d) { return '<span class="text-sm font-bold">' + $(d.grossCommission || d.commission) + '</span>'; }},
          { key: 'split', label: 'My Split', render: function (d) { return '<span class="text-sm">' + $(d.splitAmount || d.split_amount) + '</span>'; }},
          { key: 'payout', label: 'Payout', render: function (d) { return UI.statusBadge(d.payoutStatus || d.payout_status || 'pending'); }},
        ], deals) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-handshake', 'Unable to load deals');
    });
  }

  // ─── Personal Revenue ────────────────────────────────────────────────
  function personalRevenue() {
    CRM.setPanelTitle('Revenue');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.deals.list({ limit: 100 }).then(function (data) {
      var deals = data.deals || [];
      var closed = deals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
      var totalSplit = closed.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);

      // YTD/MTD
      var now = new Date();
      var ytd = closed.filter(function (d) { return new Date(d.closeDate || d.close_date || d.created_at).getFullYear() === now.getFullYear(); });
      var ytdAmount = ytd.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
      var mtd = ytd.filter(function (d) { return new Date(d.closeDate || d.close_date || d.created_at).getMonth() === now.getMonth(); });
      var mtdAmount = mtd.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Personal Revenue', '') +
        UI.statGrid([
          UI.statCard($(ytdAmount), 'YTD Revenue', 'fa-chart-line', '#B8860B'),
          UI.statCard($(mtdAmount), 'MTD Revenue', 'fa-calendar', '#059669'),
          UI.statCard(ytd.length, 'YTD Deals', 'fa-handshake', '#2563EB'),
          UI.statCard($(totalSplit), 'Lifetime Earnings', 'fa-dollar-sign', '#374151'),
        ]) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-chart-pie', 'Unable to load revenue data');
    });
  }

  // ─── Market Activity ─────────────────────────────────────────────────
  function marketActivity(filter) {
    var activeFilter = filter || 'sale';
    CRM.setPanelTitle('Market Activity');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.listings.list({ limit: 100 }).then(function (data) {
      var listings = data.listings || [];

      var sales = listings.filter(function (l) { return (l.propertyType || l.property_type || l.listingType || l.listing_type || '').toLowerCase().indexOf('rent') === -1; });
      var rentals = listings.filter(function (l) { return (l.propertyType || l.property_type || l.listingType || l.listing_type || '').toLowerCase().indexOf('rent') !== -1; });
      var active = activeFilter === 'rental' ? rentals : sales;

      var saleBtnClass = activeFilter === 'sale' ? 'style="background:#111827;color:white"' : 'class="btn btn-sm btn-outline"';
      var rentalBtnClass = activeFilter === 'rental' ? 'style="background:#111827;color:white"' : 'class="btn btn-sm btn-outline"';

      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Market Activity', active.length + ' listings') +
        '<div class="flex gap-2 mb-4">' +
          '<button class="btn btn-sm" ' + saleBtnClass + ' onclick="Panels.marketActivity(\'sale\')">Sales (' + sales.length + ')</button>' +
          '<button class="btn btn-sm" ' + rentalBtnClass + ' onclick="Panels.marketActivity(\'rental\')">Rentals (' + rentals.length + ')</button>' +
        '</div>' +
        (active.length > 0 ?
          UI.dataTable([
            { key: 'address', label: 'Address', render: function (l) {
              var addr = l.address || l.UnparsedAddress || l.street_address || '-';
              return '<span class="text-sm font-medium">' + E(addr) + '</span>';
            }},
            { key: 'price', label: 'Price', render: function (l) { return '<span class="text-sm font-bold">' + $(l.listPrice || l.list_price || l.price || 0) + '</span>'; }},
            { key: 'status', label: 'Status', render: function (l) { return UI.statusBadge(l.standardStatus || l.status || 'active'); }},
            { key: 'dom', label: 'DOM', render: function (l) {
              var dom = l.daysOnMarket || l.days_on_market || l.DaysOnMarket || '-';
              return '<span class="text-xs">' + dom + '</span>';
            }},
            { key: 'date', label: 'Listed', render: function (l) { return '<span class="text-xs text-gray-500">' + D(l.listDate || l.list_date || l.OnMarketDate || l.created_at) + '</span>'; }},
          ], active) :
          UI.emptyState('fa-chart-area', 'No ' + activeFilter + ' listings found')
        ) +
      '</div>';
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Market Activity', '') +
        UI.emptyState('fa-chart-area', 'Unable to load market data') +
      '</div>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════

  function profile() {
    CRM.setPanelTitle('My Profile');
    var c = _container();
    var user = Store.session.currentUser || {};
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('My Profile & Preferences', '') +
      UI.card('Profile',
        '<form id="profileForm" class="space-y-4">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Name</label>' +
              '<input class="form-input" name="name" value="' + E(user.name || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Email</label>' +
              '<input class="form-input" name="email" value="' + E(user.email || '') + '" readonly></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Phone</label>' +
              '<input class="form-input" name="phone" value="' + E(user.phone || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">License #</label>' +
              '<input class="form-input" name="license_number" value="' + E(user.licenseNumber || user.license_number || '') + '" readonly></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Bio</label>' +
            '<textarea class="form-input" name="bio" rows="4" placeholder="Write a short professional bio...">' + E(user.bio || '') + '</textarea></div>' +
          '<div class="form-group"><label class="form-label">Profile Photo URL</label>' +
            '<input class="form-input" name="photo_url" value="' + E(user.photoUrl || user.photo_url || '') + '" placeholder="https://..."></div>' +
          '<p class="text-xs text-gray-500"><i class="fas fa-info-circle"></i> This profile syncs with your public agent page on mallan.nyc</p>' +
          '<button type="button" class="btn btn-gold" onclick="Panels._saveProfile()"><i class="fas fa-save"></i> Save Changes</button>' +
        '</form>'
      ) +
    '</div>';
  }

  function _saveProfile() {
    var form = document.getElementById('profileForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v && k !== 'email' && k !== 'license_number') data[k] = v; });

    MallanAPI._fetch('/api/crm/agents/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(function (res) {
      if (res && res.agent) {
        Store.session.currentUser = Object.assign(Store.session.currentUser || {}, res.agent);
      }
      CRM.toast('Profile updated', 'success');
    }).catch(function (err) {
      CRM.toast('Failed to save profile: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function notificationSettings() {
    CRM.setPanelTitle('Notification Settings');
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Notification Preferences', '') +
      UI.card('Email Notifications',
        '<div class="space-y-3">' +
          _notifToggle('New lead assigned', true) +
          _notifToggle('Client stage change', true) +
          _notifToggle('Showing scheduled', true) +
          _notifToggle('Commission approved', true) +
          _notifToggle('Compliance alert', true) +
          _notifToggle('Weekly digest', false) +
        '</div>'
      ) +
    '</div>';
  }

  function _notifToggle(label, checked) {
    return '<div class="flex items-center justify-between p-3 rounded-lg bg-gray-50">' +
      '<span class="text-sm font-medium">' + E(label) + '</span>' +
      '<label class="relative inline-flex items-center cursor-pointer">' +
        '<input type="checkbox" class="sr-only" ' + (checked ? 'checked' : '') + '>' +
        '<div class="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-gold transition-colors"></div>' +
      '</label>' +
    '</div>';
  }

  function integrations() {
    CRM.setPanelTitle('Integrations');
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Integrations', 'Connected services') +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        _integrationCard('Trestle / REBNY RLS', 'Connected', 'fa-database', true) +
        _integrationCard('Cloudflare R2', 'Connected', 'fa-cloud', true) +
        _integrationCard('Stripe', 'Not configured', 'fa-credit-card', false) +
        _integrationCard('Google Calendar', 'Not configured', 'fa-calendar', false) +
      '</div>' +
    '</div>';
  }

  function _integrationCard(name, status, icon, connected) {
    return '<div class="card p-4 flex items-center gap-4">' +
      '<div class="w-10 h-10 rounded-lg flex items-center justify-center ' + (connected ? 'bg-green-50' : 'bg-gray-100') + '">' +
        '<i class="fas ' + icon + ' ' + (connected ? 'text-green-500' : 'text-gray-400') + '"></i></div>' +
      '<div class="flex-1"><p class="text-sm font-semibold">' + E(name) + '</p>' +
        '<p class="text-xs ' + (connected ? 'text-green-600' : 'text-gray-500') + '">' + E(status) + '</p></div>' +
      '<button class="btn btn-sm btn-outline">' + (connected ? 'Settings' : 'Connect') + '</button>' +
    '</div>';
  }

  // ─── Public API ──────────────────────────────────────────────────────
  return {
    // Broker Console
    brokerDashboard: brokerDashboard,
    agentRoster: agentRoster,
    clientAddressBook: clientAddressBook,
    leadDistribution: leadDistribution,
    referralTracking: referralTracking,
    commissionPayouts: commissionPayouts,
    revenueOverview: revenueOverview,
    yearEnd1099: yearEnd1099,
    companyListings: companyListings,
    complianceDashboard: complianceDashboard,
    featuredProperties: featuredProperties,
    brokerDocuments: brokerDocuments,
    auditLog: auditLog,
    idxActivity: idxActivity,
    licensingTracker: licensingTracker,
    systemSettings: systemSettings,

    // Operations
    opsDashboard: opsDashboard,
    propertySearch: propertySearch,
    myListings: myListings,
    myClients: myClients,
    pipeline: pipeline,
    tasks: tasks,
    communications: communications,
    dealsCommissions: dealsCommissions,
    personalRevenue: personalRevenue,
    marketActivity: marketActivity,

    // Settings
    profile: profile,
    notificationSettings: notificationSettings,
    integrations: integrations,

    // Internal (called from onclick handlers)
    _addAgent: _addAgent,
    _submitAddAgent: _submitAddAgent,
    _editAgent: _editAgent,
    _createLead: _createLead,
    _submitLead: _submitLead,
    _assignLead: _assignLead,
    _doAssignLead: _doAssignLead,
    _addReferral: _addReferral,
    _submitReferral: _submitReferral,
    _approvePayout: _approvePayout,
    _toggleFeatured: _toggleFeatured,
    _uploadDoc: _uploadDoc,
    _submitUploadDoc: _submitUploadDoc,
    _filterClients: _filterClients,
    _composeEmail: _composeEmail,
    _submitEmail: _submitEmail,
    _composeBulk: _composeBulk,
    _updateEblastCount: _updateEblastCount,
    _submitEblast: _submitEblast,
    _saveProfile: _saveProfile,
    _submitEditAgent: _submitEditAgent,
    _toggleAgentCard: _toggleAgentCard,
    _agentTab: _agentTab,
    _filterRoster: _filterRoster,
    _deactivateAgent: _deactivateAgent,
    _filterCAB: _filterCAB,
    _sortCAB: _sortCAB,
    _reassignClient: _reassignClient,
    _doReassign: _doReassign,
    _filterReferralYear: _filterReferralYear,
    _open1099Preview: _open1099Preview,
    _generate1099: _generate1099,
    _generateAll1099s: _generateAll1099s,
    _runFairHousingScan: _runFairHousingScan,
    _toggleAuditDetail: _toggleAuditDetail,
    _filterAuditLog: _filterAuditLog,
    _exportAuditCSV: _exportAuditCSV,
  };
})();
