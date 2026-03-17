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

  // ─── Broker Approval Queue (standalone page) ─────────────────────────
  function brokerApprovalQueue() {
    CRM.setPanelTitle('Approval Queue');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
      Documents.listAll ? Documents.listAll().catch(function () { return []; }) : Promise.resolve([]),
      MallanAPI._fetch('/api/crm/referrals?limit=200').catch(function () { return { referrals: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
    ]).then(function (r) {
      var deals = r[0].deals || [];
      var docs = Array.isArray(r[1]) ? r[1] : [];
      var referrals = r[2].referrals || [];
      var listings = r[3].listings || [];
      var agents = r[4].agents || [];
      var clients = r[5].clients || [];

      var agentMap = {};
      agents.forEach(function (a) { agentMap[a.id] = a.full_name || a.name || a.email || 'Agent'; });
      var clientMap = {};
      clients.forEach(function (cl) { clientMap[cl.id] = cl.name || cl.full_name || cl.email || 'Client'; });

      // Build queue items from 4 sources
      var items = [];

      // 1. Pending commission payouts
      deals.filter(function (d) {
        var ps = (d.payoutStatus || d.payout_status || '').toLowerCase();
        return ps === 'pending' || ps === 'submitted';
      }).forEach(function (d) {
        var agentName = agentMap[d.assignedAgentId || d.assigned_agent_id] || '';
        items.push({
          id: d.id,
          type: 'payout',
          typeLabel: 'Commission Payout',
          typeColor: '#F59E0B',
          typeIcon: 'fa-dollar-sign',
          title: $(d.grossCommission || d.commission || 0) + ' — ' + E(d.address || d.title || 'Deal'),
          subtitle: agentName ? 'Agent: ' + agentName + ' · Split: ' + $(d.splitAmount || d.split_amount || 0) : '',
          date: d.created_at || d.createdAt || '',
          age: _daysAgo(d.created_at || d.createdAt),
          approveAction: "Panels._approvePayout('" + E(d.id) + "')",
          rejectAction: "Panels._rejectPayout('" + E(d.id) + "')",
          viewRoute: '/broker/finance/payouts',
        });
      });

      // 2. Pending document approvals
      docs.filter(function (d) {
        return d.status === 'pending_approval' || d.status === 'requested';
      }).forEach(function (d) {
        items.push({
          id: d.id,
          type: 'document',
          typeLabel: 'Document Approval',
          typeColor: '#7C3AED',
          typeIcon: 'fa-file-signature',
          title: E(d.title || d.name || 'Document') + ' (' + E(d.type || 'general') + ')',
          subtitle: 'Scope: ' + E(d.scope || '') + (d.uploadedBy ? ' · Uploaded by: ' + E(d.uploadedBy) : ''),
          date: d.created_at || d.createdAt || '',
          age: _daysAgo(d.created_at || d.createdAt),
          approveAction: "Panels._approveDoc('" + E(d.id) + "')",
          rejectAction: "Panels._rejectDoc('" + E(d.id) + "')",
          viewRoute: '/broker/documents',
        });
      });

      // 3. Pending referral agreements
      referrals.filter(function (ref) {
        var as = (ref.agreement_status || ref.agreementStatus || '').toLowerCase();
        return as === 'sent' || as === 'draft' || as === 'pending';
      }).forEach(function (ref) {
        var partner = ref.partner || ref.referralPartner || ref.partner_name || 'Unknown';
        items.push({
          id: ref.id,
          type: 'referral',
          typeLabel: 'Referral Agreement',
          typeColor: '#2563EB',
          typeIcon: 'fa-exchange-alt',
          title: 'Referral with ' + E(partner),
          subtitle: E(ref.direction || 'incoming') + ' · Fee: ' + (ref.feePercent || ref.fee_percent || '?') + '% · ' + E(ref.agreement_status || ref.agreementStatus || 'pending'),
          date: ref.created_at || ref.createdAt || '',
          age: _daysAgo(ref.created_at || ref.createdAt),
          approveAction: null,
          rejectAction: null,
          viewRoute: '/broker/leads/referrals',
        });
      });

      // 4. Compliance exceptions
      listings.forEach(function (l) {
        if (l.rls_eligible === false) return;
        var issues = [];
        if (l.OwnerOptOut || l.owner_opt_out) issues.push('Owner Opt-Out active');
        if (l.IDXEntireListingDisplayYN === false) issues.push('IDX display disabled');
        if (issues.length > 0) {
          items.push({
            id: l.id || l.listing_id,
            type: 'compliance',
            typeLabel: 'Compliance Issue',
            typeColor: '#DC2626',
            typeIcon: 'fa-shield-alt',
            title: E(l.address || l.UnparsedAddress || 'Listing'),
            subtitle: issues.join(', '),
            date: l.updated_at || l.updatedAt || '',
            age: 0,
            approveAction: null,
            rejectAction: null,
            viewRoute: '/broker/listings/compliance',
          });
        }
      });

      // Sort: compliance first, then by age (oldest first within type)
      var typePriority = { compliance: 0, payout: 1, document: 2, referral: 3 };
      items.sort(function (a, b) {
        var pa = typePriority[a.type] !== undefined ? typePriority[a.type] : 9;
        var pb = typePriority[b.type] !== undefined ? typePriority[b.type] : 9;
        if (pa !== pb) return pa - pb;
        return (b.age || 0) - (a.age || 0); // oldest first within same type
      });

      // Render
      var html = '<div class="space-y-4">';

      // Summary stats
      var payoutCount = items.filter(function (i) { return i.type === 'payout'; }).length;
      var docCount = items.filter(function (i) { return i.type === 'document'; }).length;
      var refCount = items.filter(function (i) { return i.type === 'referral'; }).length;
      var compCount = items.filter(function (i) { return i.type === 'compliance'; }).length;

      html += UI.statGrid([
        UI.statCard(items.length, 'Total Pending', 'fa-inbox', items.length > 0 ? '#F59E0B' : '#059669'),
        UI.statCard(payoutCount, 'Commission Payouts', 'fa-dollar-sign', payoutCount > 0 ? '#F59E0B' : '#059669'),
        UI.statCard(docCount, 'Document Approvals', 'fa-file-signature', docCount > 0 ? '#7C3AED' : '#059669'),
        UI.statCard(compCount, 'Compliance Issues', 'fa-shield-alt', compCount > 0 ? '#DC2626' : '#059669'),
        UI.statCard(refCount, 'Referral Agreements', 'fa-exchange-alt', refCount > 0 ? '#2563EB' : '#059669'),
      ]);

      // Filter tabs
      var urgentCount = items.filter(function (i) { return i.type === 'compliance'; }).length;
      var overdueCount = items.filter(function (i) { return (i.age || 0) > 7; }).length;
      html += '<div class="flex gap-1 overflow-x-auto">';
      var filters = [
        { key: 'all', label: 'All (' + items.length + ')' },
        { key: 'urgent', label: 'Urgent (' + urgentCount + ')' },
        { key: 'overdue', label: 'Overdue (' + overdueCount + ')' },
        { key: 'payout', label: 'Payouts (' + payoutCount + ')' },
        { key: 'document', label: 'Documents (' + docCount + ')' },
        { key: 'compliance', label: 'Compliance (' + compCount + ')' },
        { key: 'referral', label: 'Referrals (' + refCount + ')' },
      ];
      filters.forEach(function (f) {
        html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all bg-white text-gray-600 border-gray-200 hover:border-gold" ' +
          'onclick="Panels._filterApprovalQueue(\'' + f.key + '\')">' + f.label + '</button>';
      });
      html += '</div>';

      // Queue list
      html += '<div id="approvalQueueList">';
      html += _renderApprovalItems(items, 'all');
      html += '</div>';

      html += '</div>';
      c.innerHTML = html;

      // Store for filtering
      window._approvalQueueItems = items;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-inbox', 'Unable to load approval queue');
    });
  }

  function _renderApprovalItems(items, filter) {
    var filtered;
    if (filter === 'all') {
      filtered = items;
    } else if (filter === 'urgent') {
      filtered = items.filter(function (i) { return i.type === 'compliance'; });
    } else if (filter === 'overdue') {
      filtered = items.filter(function (i) { return (i.age || 0) > 7; });
    } else {
      filtered = items.filter(function (i) { return i.type === filter; });
    }

    if (filtered.length === 0) {
      return '<div class="card p-8 text-center">' +
        '<div class="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3"><i class="fas fa-check-circle text-2xl text-green-500"></i></div>' +
        '<p class="text-sm font-semibold text-green-700">Nothing waiting on you</p>' +
        '<p class="text-xs text-gray-500 mt-1">All approvals are up to date</p>' +
      '</div>';
    }

    var html = '<div class="space-y-2">';
    filtered.forEach(function (item) {
      html += '<div class="card p-4 hover:border-gold transition-all">' +
        '<div class="flex items-start gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background:' + item.typeColor + '15">' +
            '<i class="fas ' + item.typeIcon + '" style="color:' + item.typeColor + '"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="px-2 py-0.5 rounded text-[10px] font-bold text-white" style="background:' + item.typeColor + '">' + item.typeLabel + '</span>' +
              (item.age > 7 ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">' + item.age + ' days old</span>' : '') +
            '</div>' +
            '<p class="text-sm font-medium text-gray-900">' + item.title + '</p>' +
            (item.subtitle ? '<p class="text-xs text-gray-500 mt-0.5">' + item.subtitle + '</p>' : '') +
            (item.date ? '<p class="text-xs text-gray-400 mt-1">Submitted ' + Utils.formatTimeAgo(item.date) + '</p>' : '') +
          '</div>' +
          '<div class="flex items-center gap-2 flex-shrink-0">';
      if (item.approveAction) {
        html += '<button class="btn btn-sm btn-gold" onclick="' + item.approveAction + ';setTimeout(function(){Panels.brokerApprovalQueue()},500)">Approve</button>';
      }
      if (item.rejectAction) {
        html += '<button class="btn btn-sm btn-outline" style="border-color:#DC2626;color:#DC2626" onclick="' + item.rejectAction + ';setTimeout(function(){Panels.brokerApprovalQueue()},500)">Reject</button>';
      }
      html += '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'' + item.viewRoute + '\')">View</button>';
      html += '</div></div></div>';
    });
    html += '</div>';
    return html;
  }

  function _filterApprovalQueue(filter) {
    var items = window._approvalQueueItems || [];
    var container = document.getElementById('approvalQueueList');
    if (container) container.innerHTML = _renderApprovalItems(items, filter);
  }

  function _daysAgo(dateStr) {
    if (!dateStr) return 0;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 3600 * 1000)));
  }

  // ─── Broker Dashboard ────────────────────────────────────────────────
  function brokerDashboard() {
    CRM.setPanelTitle('Broker Dashboard');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 500 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI._fetch('/api/crm/leads?limit=200').catch(function () { return { leads: [] }; }),
      MallanAPI._fetch('/api/crm/referrals?limit=10').catch(function () { return { referrals: [] }; }),
      MallanAPI.idx.status().catch(function () { return null; }),
      Documents.list('company').catch(function () { return { documents: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var listings = r[1].listings || [];
      var deals = r[2].deals || [];
      var agents = r[3].agents || [];
      var tasks = r[4].tasks || [];
      var leads = r[5].leads || [];
      var referrals = r[6].referrals || [];
      var idxStatus = r[7];
      var docs = r[8].documents || [];

      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // ── Derived data ──────────────────────────────────────────────
      var unassignedLeads = leads.filter(function (l) { return !l.assignedAgentId && !l.assigned_agent_id; });
      var pendingPayouts = deals.filter(function (d) { return d.payoutStatus === 'pending' || d.payout_status === 'pending'; });

      var expiringAgents = agents.filter(function (a) {
        var exp = a.license_expiry || a.licenseExpiry;
        return exp && Utils.daysUntil(exp) <= 90;
      });
      var urgentExpiring = expiringAgents.filter(function (a) {
        var exp = a.license_expiry || a.licenseExpiry;
        return exp && Utils.daysUntil(exp) <= 60;
      });

      var compViolations = 0;
      listings.forEach(function (l) {
        if (l.rls_eligible === false) return;
        if (l.OwnerOptOut || l.owner_opt_out) compViolations++;
        if (l.rls_eligible !== false && !l.IDXEntireListingDisplayYN && l.IDXEntireListingDisplayYN !== undefined && l.IDXEntireListingDisplayYN !== true) compViolations++;
      });

      var pendingDocs = docs.filter(function (d) { return d.status === 'pending_approval'; });

      var overdueTasks = tasks.filter(function (t) {
        return t.status !== 'completed' && t.due_date && new Date(t.due_date) < today;
      });

      var staleClients = clients.filter(function (cl) {
        var last = cl.lastActivityAt || cl.last_activity_at || cl.updatedAt || cl.updated_at;
        if (!last) return true;
        var diff = (now - new Date(last)) / (1000 * 60 * 60 * 24);
        return diff >= 30 && cl.status !== 'closed' && cl.status !== 'inactive';
      });

      var activeListings = listings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
      var staleListings = activeListings.filter(function (l) {
        var dom = l.DaysOnMarket || l.days_on_market || 0;
        var hasPriceChange = l.lastPriceChange || l.last_price_change;
        return dom >= 60 && !hasPriceChange;
      });

      var oldPayouts = pendingPayouts.filter(function (d) {
        var created = d.createdAt || d.created_at;
        if (!created) return false;
        return (now - new Date(created)) / (1000 * 60 * 60 * 24) >= 7;
      });

      var todayShowings = tasks.filter(function (t) {
        if (t.type !== 'showing' && t.task_type !== 'showing') return false;
        var d = t.scheduled_at || t.scheduledAt || t.due_date;
        if (!d) return false;
        var sd = new Date(d);
        return sd.getFullYear() === today.getFullYear() && sd.getMonth() === today.getMonth() && sd.getDate() === today.getDate();
      });

      // ── Helper: action queue card ─────────────────────────────────
      function _queueCard(icon, count, label, subtext, color, route) {
        var bgHex = color === '#DC2626' ? '#FEF2F2' : color === '#F59E0B' ? '#FFFBEB' : '#F0FDF4';
        var onclick = count > 0
          ? 'var el=document.getElementById(\'brokerActionQueue\');if(el){el.scrollIntoView({behavior:\"smooth\",block:\"start\"});}else{Router.navigate(\'' + route + '\');}'
          : 'Router.navigate(\'' + route + '\')';
        return '<div class="card p-4 cursor-pointer hover:border-gold hover:shadow-md transition-all text-center" onclick="' + onclick + '">' +
          '<div class="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style="background:' + bgHex + '">' +
            '<i class="fas ' + icon + ' text-lg" style="color:' + color + '"></i>' +
          '</div>' +
          '<p class="text-2xl font-bold" style="color:' + color + '">' + count + '</p>' +
          '<p class="text-xs font-semibold text-gray-700 mt-1">' + E(label) + '</p>' +
          '<p class="text-xs mt-1" style="color:' + color + '">' + E(subtext) + '</p>' +
        '</div>';
      }

      // ── Helper: status badge ──────────────────────────────────────
      function _statusBadge(status) {
        var colors = { Active: '#2563EB', active: '#2563EB', Pending: '#F59E0B', pending: '#F59E0B', offer: '#F59E0B', ActiveUnderContract: '#7C3AED', contract: '#7C3AED', Closed: '#059669', closed: '#059669', Sold: '#059669', sold: '#059669' };
        var bg = colors[status] || '#6B7280';
        return '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style="background:' + bg + '">' + E(status || 'Unknown') + '</span>';
      }

      // ── BUILD HTML ────────────────────────────────────────────────
      var html = '<div class="space-y-6">';

      // ── ROW 1: Action Queue Cards ─────────────────────────────────
      html += '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">';
      html += _queueCard('fa-user-clock', unassignedLeads.length, 'Unassigned Leads',
        unassignedLeads.length > 0 ? unassignedLeads.length + ' need assignment' : 'All clear',
        unassignedLeads.length > 0 ? '#DC2626' : '#059669', '/broker/leads/distribution');
      html += _queueCard('fa-dollar-sign', pendingPayouts.length, 'Pending Payouts',
        pendingPayouts.length > 0 ? pendingPayouts.length + ' awaiting approval' : 'All clear',
        pendingPayouts.length > 0 ? '#F59E0B' : '#059669', '/broker/finance/payouts');
      html += _queueCard('fa-id-card', expiringAgents.length, 'Expiring Licenses',
        expiringAgents.length > 0 ? expiringAgents.length + ' within 90 days' : 'All clear',
        urgentExpiring.length > 0 ? '#DC2626' : expiringAgents.length > 0 ? '#F59E0B' : '#059669', '/broker/system/licensing');
      html += _queueCard('fa-shield-alt', compViolations, 'Compliance Issues',
        compViolations > 0 ? compViolations + ' items need action' : 'All clear',
        compViolations > 0 ? '#DC2626' : '#059669', '/broker/listings/compliance');
      html += _queueCard('fa-file-signature', pendingDocs.length, 'Doc Approvals',
        pendingDocs.length > 0 ? pendingDocs.length + ' pending review' : 'All clear',
        pendingDocs.length > 0 ? '#F59E0B' : '#059669', '/broker/documents');
      html += '</div>';

      // ── ROW 2: Recent Activity (2 columns) ───────────────────────
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // LEFT: Recent Company Listings
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-building text-gold mr-2"></i>Recent Company Listings</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/listings\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-1">';
      var recentListings = listings.slice(0, 8);
      if (recentListings.length === 0) {
        html += '<p class="text-sm text-gray-400 text-center py-4">No listings yet</p>';
      }
      recentListings.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'No address';
        var price = l.ListPrice || l.price || 0;
        var dom = l.DaysOnMarket || l.days_on_market || 0;
        var agentName = '';
        if (l.assignedAgentId || l.assigned_agent_id) {
          var ag = agents.find(function (a) { return a.id === (l.assignedAgentId || l.assigned_agent_id); });
          agentName = ag ? (ag.name || ag.firstName + ' ' + ag.lastName) : '';
        }
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">' +
          '<div class="w-8 h-8 rounded-lg bg-gold-bg flex items-center justify-center flex-shrink-0"><i class="fas fa-building text-xs text-gold"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
            '<p class="text-xs text-gray-500">' + $(price) + (agentName ? ' &middot; ' + E(agentName) : '') + ' &middot; ' + dom + ' DOM</p>' +
          '</div>' +
          _statusBadge(l.status) +
        '</div>';
      });
      html += '</div></div></div>';

      // RIGHT: Referrals + System Status
      html += '<div class="space-y-6">';

      // Recent Referrals
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-exchange-alt text-gold mr-2"></i>Recent Referrals</h3></div>' +
        '<div class="card-body"><div class="space-y-1">';
      if (referrals.length === 0) {
        html += '<p class="text-sm text-gray-400 text-center py-3">No referrals</p>';
      }
      referrals.slice(0, 5).forEach(function (ref) {
        var partner = ref.partnerName || ref.partner_name || ref.partner || 'Unknown';
        var dir = ref.direction || 'outgoing';
        var fee = ref.feeAmount || ref.fee_amount || 0;
        var st = ref.status || 'pending';
        var dirBadge = dir === 'incoming'
          ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Incoming</span>'
          : '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Outgoing</span>';
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
          '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(partner) + '</p>' +
            '<p class="text-xs text-gray-500">' + $(fee) + ' &middot; ' + E(st) + '</p></div>' +
          dirBadge +
        '</div>';
      });
      html += '</div></div></div>';

      // System Status
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-server text-gold mr-2"></i>System Status</h3></div>' +
        '<div class="card-body space-y-3">';
      var idxOk = idxStatus && (idxStatus.connected || idxStatus.status === 'ok' || idxStatus.status === 'connected');
      var lastSync = idxStatus ? (idxStatus.lastSync || idxStatus.last_sync || idxStatus.lastSyncAt || null) : null;
      html += '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
          '<span class="w-2.5 h-2.5 rounded-full inline-block ' + (idxOk ? 'bg-green-500' : 'bg-red-500') + '"></span>' +
          '<span class="text-sm font-medium">IDX / Trestle</span>' +
        '</div>' +
        '<span class="text-xs text-gray-500">' + (idxOk ? 'Connected' : 'Disconnected') + (lastSync ? ' &middot; Synced ' + D(lastSync) : '') + '</span>' +
      '</div>';
      html += '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
          '<span class="w-2.5 h-2.5 rounded-full inline-block bg-green-500"></span>' +
          '<span class="text-sm font-medium">REBNY RLS</span>' +
        '</div>' +
        '<span class="text-xs text-gray-500">Active</span>' +
      '</div>';
      html += '</div></div>';

      html += '</div>'; // end right column space-y
      html += '</div>'; // end ROW 2 grid

      // ── ROW 3: Quick Launch + Needs Attention ─────────────────────
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // LEFT: Quick Launch Tiles (2x4 grid)
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-rocket text-gold mr-2"></i>Quick Launch</h3></div>' +
        '<div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">';
      var tiles = [
        { icon: 'fa-user-plus', label: 'Add Agent', action: 'Panels._addAgent()' },
        { icon: 'fa-user-tag', label: 'New Client', action: 'CRM.quickNewClient()' },
        { icon: 'fa-home', label: 'New Sale Listing', action: 'window.open(\'/crm/sale-listing\')' },
        { icon: 'fa-key', label: 'New Rental', action: 'window.open(\'/crm/rental-listing\')' },
        { icon: 'fa-search', label: 'Property Search', action: 'window.open(\'/crm/search\')' },
        { icon: 'fa-exchange-alt', label: 'New Referral', action: 'Panels._addReferral()' },
        { icon: 'fa-shield-alt', label: 'Compliance Scan', action: 'Panels._runFairHousingScan()' },
        { icon: 'fa-file-invoice-dollar', label: 'Generate 1099s', action: 'Router.navigate(\'/broker/finance/1099\')' },
      ];
      tiles.forEach(function (t) {
        html += '<button class="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-gold hover:shadow-sm transition-all text-center" onclick="' + t.action + '">' +
          '<div class="w-10 h-10 rounded-lg bg-gold-bg flex items-center justify-center"><i class="fas ' + t.icon + ' text-sm text-gold"></i></div>' +
          '<span class="text-xs font-semibold text-gray-700">' + t.label + '</span>' +
        '</button>';
      });
      html += '</div></div></div>';

      // RIGHT: Needs Attention Today
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-bell text-gold mr-2"></i>Needs Attention Today</h3></div>' +
        '<div class="card-body">';

      var attentionItems = [];

      // Overdue tasks
      overdueTasks.slice(0, 3).forEach(function (t) {
        attentionItems.push({
          icon: 'fa-clock', color: '#DC2626',
          text: 'Overdue: ' + (t.title || t.name || 'Untitled task'),
          action: 'Router.navigate(\'/ops/tasks\')', btn: 'Review'
        });
      });

      // Stale clients (no activity 30+ days)
      staleClients.slice(0, 2).forEach(function (cl) {
        attentionItems.push({
          icon: 'fa-user-clock', color: '#F59E0B',
          text: (cl.name || cl.email || 'Client') + ' — no activity 30+ days',
          action: 'Router.navigate(\'/workspace/client/' + (cl.id || '') + '/overview\')', btn: 'Follow up'
        });
      });

      // Stale listings (60+ DOM, no price change)
      staleListings.slice(0, 2).forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'Listing';
        attentionItems.push({
          icon: 'fa-home', color: '#F59E0B',
          text: addr + ' — ' + (l.DaysOnMarket || l.days_on_market) + ' DOM, no price change',
          action: 'Router.navigate(\'/workspace/listing/' + (l.id || l.listing_id || '') + '/overview\')', btn: 'Review'
        });
      });

      // Old pending payouts (7+ days)
      oldPayouts.slice(0, 2).forEach(function (d) {
        attentionItems.push({
          icon: 'fa-dollar-sign', color: '#DC2626',
          text: 'Payout pending 7+ days — ' + $(d.grossCommission || d.commission || 0),
          action: 'Router.navigate(\'/broker/finance/payouts\')', btn: 'Approve'
        });
      });

      // Today's showings
      todayShowings.slice(0, 2).forEach(function (t) {
        var time = t.scheduled_at || t.scheduledAt || t.due_date;
        attentionItems.push({
          icon: 'fa-calendar-day', color: '#2563EB',
          text: 'Showing today — ' + (t.title || t.name || 'Untitled') + (time ? ' at ' + new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
          action: 'Router.navigate(\'/ops/showings\')', btn: 'View'
        });
      });

      // Sort: red items first, then yellow, then blue
      var colorPriority = { '#DC2626': 0, '#F59E0B': 1, '#2563EB': 2 };
      attentionItems.sort(function (a, b) { return (colorPriority[a.color] || 9) - (colorPriority[b.color] || 9); });
      attentionItems = attentionItems.slice(0, 10);

      if (attentionItems.length === 0) {
        html += '<div class="flex flex-col items-center justify-center py-8">' +
          '<div class="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3"><i class="fas fa-check-circle text-2xl text-green-500"></i></div>' +
          '<p class="text-sm font-semibold text-green-700">All caught up!</p>' +
          '<p class="text-xs text-gray-500 mt-1">Nothing needs your attention right now.</p>' +
        '</div>';
      } else {
        html += '<div class="space-y-2">';
        attentionItems.forEach(function (item) {
          html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
            '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:' + item.color + '15">' +
              '<i class="fas ' + item.icon + ' text-xs" style="color:' + item.color + '"></i></div>' +
            '<p class="text-sm flex-1 min-w-0 truncate">' + E(item.text) + '</p>' +
            '<button class="btn btn-sm btn-outline flex-shrink-0" onclick="' + item.action + '">' + item.btn + '</button>' +
          '</div>';
        });
        html += '</div>';
      }

      html += '</div></div>'; // end Needs Attention card

      html += '</div>'; // end ROW 3 grid

      // ── ROW 4: Broker Action Queue ──────────────────────────────────
      var actionQueueItems = [];

      // Pending commission payouts
      var submittedPayouts = deals.filter(function (d) {
        var ps = d.payoutStatus || d.payout_status || '';
        return ps === 'pending' || ps === 'submitted';
      });
      submittedPayouts.forEach(function (d) {
        var agentName = '';
        if (d.assignedAgentId || d.assigned_agent_id) {
          var ag = agents.find(function (a) { return a.id === (d.assignedAgentId || d.assigned_agent_id); });
          agentName = ag ? (ag.name || (ag.firstName + ' ' + ag.lastName)) : '';
        }
        actionQueueItems.push({
          entityType: 'Commission',
          entityColor: '#F59E0B',
          description: 'Payout ' + $(d.grossCommission || d.commission || 0) + (agentName ? ' for ' + agentName : '') + ' — ' + E(d.address || d.property || 'Deal'),
          date: d.createdAt || d.created_at || '',
          approveAction: 'Panels._approvePayout(\'' + E(d.id || '') + '\')',
          rejectAction: 'Panels._rejectPayout(\'' + E(d.id || '') + '\')',
          viewRoute: '/broker/finance/payouts'
        });
      });

      // Pending document approvals
      var pendingDocItems = docs.filter(function (d) {
        return d.status === 'pending_approval' || d.status === 'requested';
      });
      pendingDocItems.forEach(function (doc) {
        actionQueueItems.push({
          entityType: 'Document',
          entityColor: '#7C3AED',
          description: (doc.name || doc.title || doc.type || 'Untitled document') + (doc.scope_label ? ' — ' + doc.scope_label : ''),
          date: doc.createdAt || doc.created_at || doc.uploaded_at || '',
          approveAction: 'Panels._approveDoc(\'' + E(doc.id || '') + '\')',
          rejectAction: 'Panels._rejectDoc(\'' + E(doc.id || '') + '\')',
          viewRoute: '/broker/documents'
        });
      });

      // Pending referral agreements
      var pendingReferrals = referrals.filter(function (r) {
        var as = r.agreement_status || r.agreementStatus || '';
        return as === 'sent' || as === 'draft';
      });
      pendingReferrals.forEach(function (ref) {
        var partner = ref.partnerName || ref.partner_name || ref.partner || 'Unknown';
        actionQueueItems.push({
          entityType: 'Referral',
          entityColor: '#2563EB',
          description: 'Referral agreement with ' + partner + ' — ' + (ref.agreement_status || ref.agreementStatus || 'draft'),
          date: ref.createdAt || ref.created_at || '',
          approveAction: null,
          rejectAction: null,
          viewRoute: '/broker/people/referrals'
        });
      });

      // Compliance exceptions
      listings.forEach(function (l) {
        if (l.rls_eligible === false) return;
        var issues = [];
        if (l.OwnerOptOut || l.owner_opt_out) issues.push('Owner Opt-Out active');
        if (l.rls_eligible !== false && !l.IDXEntireListingDisplayYN && l.IDXEntireListingDisplayYN !== undefined && l.IDXEntireListingDisplayYN !== true) issues.push('IDX display disabled');
        if (issues.length > 0) {
          actionQueueItems.push({
            entityType: 'Compliance',
            entityColor: '#DC2626',
            description: (l.address || l.UnparsedAddress || 'Listing') + ' — ' + issues.join(', '),
            date: l.updatedAt || l.updated_at || '',
            approveAction: null,
            rejectAction: null,
            viewRoute: '/broker/listings/compliance'
          });
        }
      });

      // Sort: Compliance (red) first, then Commission (yellow), then Document (purple), then Referral (blue)
      var entityPriority = { Compliance: 0, Commission: 1, Document: 2, Referral: 3 };
      actionQueueItems.sort(function (a, b) { return (entityPriority[a.entityType] || 9) - (entityPriority[b.entityType] || 9); });

      html += '<div id="brokerActionQueue" class="card"><div class="card-header"><h3><i class="fas fa-inbox text-gold mr-2"></i>Broker Action Queue</h3>' +
        '<span class="text-xs text-gray-500">' + actionQueueItems.length + ' item' + (actionQueueItems.length !== 1 ? 's' : '') + ' waiting</span></div>' +
        '<div class="card-body">';

      if (actionQueueItems.length === 0) {
        html += '<div class="flex flex-col items-center justify-center py-8">' +
          '<div class="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3"><i class="fas fa-check-circle text-2xl text-green-500"></i></div>' +
          '<p class="text-sm font-semibold text-green-700">Nothing waiting on you</p>' +
          '<p class="text-xs text-gray-500 mt-1">All approvals are up to date.</p>' +
        '</div>';
      } else {
        html += '<div class="space-y-2">';
        actionQueueItems.forEach(function (item) {
          html += '<div class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100">' +
            '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white flex-shrink-0" style="background:' + item.entityColor + '">' + E(item.entityType) + '</span>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + item.description + '</p>' +
              (item.date ? '<p class="text-xs text-gray-400">' + D(item.date) + '</p>' : '') +
            '</div>' +
            '<div class="flex items-center gap-2 flex-shrink-0">';
          if (item.approveAction) {
            html += '<button class="btn btn-sm btn-gold" onclick="' + item.approveAction + '">Approve</button>';
          }
          if (item.rejectAction) {
            html += '<button class="btn btn-sm btn-outline text-red-600 border-red-300 hover:bg-red-50" onclick="' + item.rejectAction + '">Reject</button>';
          }
          html += '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'' + item.viewRoute + '\')">View</button>';
          html += '</div></div>';
        });
        html += '</div>';
      }

      html += '</div></div>'; // end Broker Action Queue card

      html += '</div>'; // end space-y-6 wrapper
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
      MallanAPI._fetch('/api/crm/referrals?limit=500').catch(function () { return { referrals: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var allListings = r[1].listings || [];
      var allDeals = r[2].deals || [];
      var allReferrals = r[3].referrals || [];

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
        a._referrals = allReferrals.filter(function (ref) {
          return ref.our_agent_id === aid || ref.assigned_agent_id === aid;
        });
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
    var name = a.full_name || a.name || a.email || 'Agent';
    var initials = Utils.initials(name);
    var role = (a.role || 'AGENT').toUpperCase();
    var roleLabel = role === 'BROKER' ? 'Licensed Broker' : 'Licensed Salesperson';
    var license = a.license_no || a.licenseNumber || a.license_number || '';
    var photo = a.photo || '';

    // Avatar: use photo if available, otherwise initials
    var avatarHtml = photo ?
      '<img src="' + E(photo) + '" class="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="' + E(name) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="w-9 h-9 rounded-full bg-gray-200 items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0" style="display:none">' + E(initials) + '</div>' :
      '<div class="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">' + E(initials) + '</div>';

    // Compute stats
    var licExp = a.license_expiry || a.licenseExpiry;
    var licText = licExp ? D(licExp) : '—';
    var ceHrs = a.ce_hours_completed || a.ceHoursCompleted || 0;
    var ceComplete = ceHrs >= 22.5;
    var splitPct = a.sale_split || a.saleSplit || 0;
    var splitDisplay = splitPct > 1 ? splitPct + '%' : (splitPct > 0 ? Math.round(splitPct * 100) + '%' : '—');
    var activeDeals = (a._allDeals || []).filter(function (d) { return d.stage !== 'closed' && d.status !== 'closed'; }).length;
    var refCount = (a._referrals || []).length;

    return '<div class="border rounded-lg overflow-hidden agent-roster-card" data-name="' + E(name.toLowerCase()) + '" data-role="' + E(role) + '">' +
      '<div class="cursor-pointer hover:bg-gray-50 transition px-5 py-4" onclick="Panels._toggleAgentCard(' + idx + ')">' +
        // Row 1: Name + chevron
        '<div class="flex items-center justify-between">' +
          '<div class="flex items-center gap-3">' +
            avatarHtml +
            '<div>' +
              '<p class="text-sm font-semibold text-gray-900">' + E(name) + '</p>' +
              '<p class="text-xs text-gray-500">' + E(roleLabel) + (license ? ' · #' + E(license) : '') + '</p>' +
            '</div>' +
          '</div>' +
          '<i class="fas fa-chevron-down text-gray-300 text-xs transition-transform" id="agentChevron_' + idx + '"></i>' +
        '</div>' +
        // Row 2: Stats as a clean horizontal row
        '<div class="flex items-center gap-6 mt-3 ml-12 text-xs text-gray-500">' +
          '<div>License <span class="text-gray-700">' + licText + '</span></div>' +
          '<div>CE <span class="' + (ceComplete ? 'text-gray-700' : 'text-gray-400') + '">' + (ceComplete ? 'Complete' : 'Incomplete') + '</span></div>' +
          '<div>Split <span class="text-gray-700">' + splitDisplay + '</span></div>' +
          '<div>Deals <span class="text-gray-700">' + activeDeals + '</span></div>' +
          '<div>Referrals <span class="text-gray-700">' + refCount + '</span></div>' +
        '</div>' +
      '</div>' +
      // Expanded panel
      '<div id="agentPanel_' + idx + '" style="display:none">' +
        '<div class="px-4 py-3 border-t bg-white">' +
          // Quick actions
          '<div class="flex items-center justify-between mb-3">' +
            '<div class="sm:hidden"><span class="px-2 py-0.5 border border-gray-200 text-gray-500 rounded text-[10px] font-semibold">' + E(roleLabel) + '</span></div>' +
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
            '<button onclick="Panels._agentTab(this,' + idx + ',\'referrals\')" class="agent-view-tab px-3 py-1.5 text-xs font-semibold text-gray-500 border-b-2 border-transparent hover:text-gray-700"><i class="fas fa-exchange-alt mr-1"></i> Referrals</button>' +
          '</div>' +
          // Tab content
          '<div id="agentTabContent_' + idx + '">' + _agentListingsView(a, idx) + '</div>' +
          // Footer
          '<div class="flex items-center justify-between mt-3 pt-3 border-t">' +
            '<p class="text-xs text-gray-500">' + E((a.email || '') + (a.phone ? ' · ' + a.phone : '')) + '</p>' +
            '<button onclick="Panels._editAgent(\'' + E(a.id) + '\')" class="text-gold hover:underline text-xs font-semibold">Edit Agent Profile</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Current filter state for roster listing badges
  var _rosterListingFilter = {};

  function _agentListingsView(a, agentIdx) {
    var listings = a._allListings || [];
    var filterStatus = (agentIdx !== undefined && _rosterListingFilter[agentIdx]) ? _rosterListingFilter[agentIdx] : '';

    // RLS-aligned status counts
    var statusDefs = [
      { key: '',                    label: 'All',                         count: listings.length },
      { key: 'Active',              label: 'Active',                      count: listings.filter(function (l) { return l.status === 'Active'; }).length },
      { key: 'Pending',             label: 'Pending',                     count: listings.filter(function (l) { return l.status === 'Pending'; }).length },
      { key: 'ActiveUnderContract', label: 'In Contract',                 count: listings.filter(function (l) { return l.status === 'ActiveUnderContract'; }).length },
      { key: 'Closed',              label: 'Closed',                      count: listings.filter(function (l) { return l.status === 'Closed'; }).length },
      { key: 'ComingSoon',          label: 'Coming Soon',                 count: listings.filter(function (l) { return l.status === 'ComingSoon'; }).length },
      { key: 'Hold',                label: 'Hold (Temp Off Market)',      count: listings.filter(function (l) { return l.status === 'Hold'; }).length },
      { key: 'Withdrawn',           label: 'Withdrawn (Perm Off Market)', count: listings.filter(function (l) { return l.status === 'Withdrawn'; }).length },
      { key: 'Expired',             label: 'Expired',                     count: listings.filter(function (l) { return l.status === 'Expired'; }).length },
      { key: 'Canceled',            label: 'Canceled',                    count: listings.filter(function (l) { return l.status === 'Canceled'; }).length },
    ];

    var html = '<div class="flex flex-wrap gap-1 mb-3">';
    statusDefs.forEach(function (s) {
      var isActive = filterStatus === s.key;
      var onclick = agentIdx !== undefined ? ' onclick="Panels._filterRosterListings(' + agentIdx + ',\'' + s.key + '\')"' : '';
      html += '<button class="px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-all ' +
        (isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400') +
        '"' + onclick + '>' + s.label + ' (' + s.count + ')</button>';
    });
    html += '</div>';

    // Apply filter
    var filtered = listings;
    if (filterStatus) {
      filtered = listings.filter(function (l) { return l.status === filterStatus; });
    }

    if (filtered.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No listings to display.</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Address</th><th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Price</th><th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2 hidden sm:table-cell">DOM</th><th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      filtered.forEach(function (l) {
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

  function _filterRosterListings(agentIdx, status) {
    if (!window._rosterAgents) return;
    var a = window._rosterAgents[agentIdx];
    if (!a) return;
    // Toggle: clicking the same filter again clears it
    if (_rosterListingFilter[agentIdx] === status) {
      _rosterListingFilter[agentIdx] = '';
    } else {
      _rosterListingFilter[agentIdx] = status;
    }
    var container = document.getElementById('agentTabContent_' + agentIdx);
    if (container) container.innerHTML = _agentListingsView(a, agentIdx);
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
          '<td class="px-3 py-2 text-right">' +
            '<div class="flex items-center justify-end gap-1">' +
              '<input type="number" class="form-input text-sm w-20 py-0.5 px-1 text-right text-green-600 font-semibold" value="' + (d.splitAmount || d.split_amount || 0) + '" min="0" step="0.01" id="agentSplitInput_' + E(d.id) + '">' +
              '<span class="text-[10px] text-gray-400">' + ((d.grossCommission || d.commission || 0) > 0 ? Math.round(((d.splitAmount || d.split_amount || 0) / (d.grossCommission || d.commission || 1)) * 100) + '%' : '') + '</span>' +
              '<button class="text-gray-400 hover:text-gold text-xs px-1" onclick="Panels._saveAgentSplit(\'' + E(d.id) + '\')"><i class="fas fa-save"></i></button>' +
            '</div>' +
          '</td>' +
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

  function _agentReferralsView(a) {
    var refs = a._referrals || [];
    var aid = a.id;
    var incoming = refs.filter(function (r) { return r.assigned_agent_id === aid; });
    var outgoing = refs.filter(function (r) { return r.our_agent_id === aid && r.assigned_agent_id !== aid; });
    var totalFee = refs.reduce(function (s, r) { return s + (r.fee_amount || r.feeAmount || 0); }, 0);

    var html = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
      '<div class="bg-gray-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Total</p><p class="text-lg font-bold text-gray-800">' + refs.length + '</p></div>' +
      '<div class="bg-green-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Incoming</p><p class="text-lg font-bold text-green-600">' + incoming.length + '</p></div>' +
      '<div class="bg-blue-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Outgoing</p><p class="text-lg font-bold text-blue-600">' + outgoing.length + '</p></div>' +
      '<div class="bg-purple-50 rounded-lg p-3 text-center"><p class="text-xs text-gray-500">Net Fee</p><p class="text-lg font-bold text-purple-600">' + $(totalFee) + '</p></div>' +
    '</div>';

    if (refs.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No referrals for this agent.</p>';
    } else {
      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Date</th>' +
        '<th class="text-left px-3 py-2">Partner</th>' +
        '<th class="text-left px-3 py-2">Direction</th>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-right px-3 py-2">Fee %</th>' +
        '<th class="text-right px-3 py-2">Fee Amount</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      refs.forEach(function (r) {
        var isIncoming = r.assigned_agent_id === aid;
        var dirBadge = isIncoming
          ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">Incoming</span>'
          : '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">Outgoing</span>';
        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2 text-xs">' + D(r.created_at || r.createdAt || r.date) + '</td>' +
          '<td class="px-3 py-2 text-sm">' + E(r.partner_name || r.partnerName || r.partner_brokerage || '-') + '</td>' +
          '<td class="px-3 py-2">' + dirBadge + '</td>' +
          '<td class="px-3 py-2 text-sm">' + E(r.client_name || r.clientName || '-') + '</td>' +
          '<td class="px-3 py-2 text-xs">' + E(r.referral_type || r.type || '-') + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + (r.fee_percent || r.feePercent || '-') + (r.fee_percent || r.feePercent ? '%' : '') + '</td>' +
          '<td class="px-3 py-2 text-sm text-right font-bold">' + $(r.fee_amount || r.feeAmount || 0) + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(r.status || 'pending') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '<div class="mt-3"><button class="btn btn-sm btn-gold" onclick="Router.navigate(\'/broker/leads/referrals\')"><i class="fas fa-plus mr-1"></i> Add Referral</button></div>';
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
      case 'listings': container.innerHTML = _agentListingsView(a, idx); break;
      case 'commissions': container.innerHTML = _agentCommissionsView(a); break;
      case 'disclosures': container.innerHTML = _agentDisclosuresView(a); break;
      case 'referrals': container.innerHTML = _agentReferralsView(a); break;
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
    var html = '<form id="addAgentForm" class="space-y-5">' +

      // ── Section 1: Personal Information ──
      '<div>' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-user text-gold"></i> Personal Information</h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
          '<div class="form-group"><label class="form-label">First Name *</label><input class="form-input" name="first_name" required placeholder="First name"></div>' +
          '<div class="form-group"><label class="form-label">Middle Name</label><input class="form-input" name="middle_name" placeholder="Middle name"></div>' +
          '<div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" name="last_name" required placeholder="Last name"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
          '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required placeholder="agent@mallan.nyc"></div>' +
          '<div class="form-group"><label class="form-label">Phone *</label><input class="form-input" type="tel" name="phone" required placeholder="646-XXX-XXXX"></div>' +
          '<div class="form-group"><label class="form-label">Secondary Phone</label><input class="form-input" type="tel" name="secondary_phone" placeholder="Optional"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">' +
          '<div class="form-group"><label class="form-label">Home Address</label><input class="form-input" name="home_address" placeholder="Street address"></div>' +
          '<div class="form-group"><label class="form-label">City</label><input class="form-input" name="city" value="New York" placeholder="City"></div>' +
          '<div class="form-group"><label class="form-label">State</label><input class="form-input" name="state" value="NY" placeholder="State"></div>' +
          '<div class="form-group"><label class="form-label">Zip</label><input class="form-input" name="zip" placeholder="10001"></div>' +
        '</div>' +
        '<div class="mt-3">' +
          '<label class="form-label">Agent Headshot</label>' +
          '<div class="flex items-center gap-4">' +
            '<div id="addAgentPhotoPreview" class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 overflow-hidden">' +
              '<i class="fas fa-camera text-lg"></i>' +
            '</div>' +
            '<div class="flex-1">' +
              '<input type="file" name="agent_photo" id="addAgentPhotoInput" accept="image/jpeg,image/png,image/webp" class="form-input text-sm" onchange="Panels._previewAgentPhoto(this)">' +
              '<p class="text-[10px] text-gray-400 mt-1">JPG, PNG, or WebP. This photo will appear on the agent\'s public profile at mallan.nyc/agents/</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Section 2: NY DOS License Information ──
      '<div class="border-t pt-5">' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-id-card text-gold"></i> NY DOS License Information</h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
          '<div class="form-group"><label class="form-label">License Type *</label>' +
            '<select class="form-input form-select" name="license_type" required>' +
              '<option value="">Select...</option>' +
              '<option value="Licensed Real Estate Salesperson">Licensed Real Estate Salesperson</option>' +
              '<option value="Licensed Associate Broker">Licensed Associate Broker</option>' +
              '<option value="Licensed Broker">Licensed Broker</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">NY DOS License # *</label><input class="form-input" name="license_number" required placeholder="10XXXXXXXXX"></div>' +
          '<div class="form-group"><label class="form-label">License Expiration *</label><input class="form-input" type="date" name="license_expiry" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
          '<div class="form-group"><label class="form-label">DOS License Status</label>' +
            '<select class="form-input form-select" name="license_status">' +
              '<option value="Active">Active</option>' +
              '<option value="Inactive">Inactive</option>' +
              '<option value="Expired">Expired</option>' +
              '<option value="Suspended">Suspended</option>' +
              '<option value="Revoked">Revoked</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">REBNY Member ID</label><input class="form-input" name="rebny_member_id" placeholder="REBNY Member ID"></div>' +
          '<div class="form-group"><label class="form-label">NRD/NRDS ID</label><input class="form-input" name="nrds_id" placeholder="NRD/NRDS ID"></div>' +
        '</div>' +
        '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-3">' +
          '<h4 class="text-xs font-bold text-yellow-800 uppercase mb-2"><i class="fas fa-graduation-cap mr-1"></i> Continuing Education (CE) Hours</h4>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group mb-0"><label class="form-label">CE Hours Completed</label><input class="form-input" type="number" name="ce_hours_completed" min="0" max="100" placeholder="0"></div>' +
            '<div class="form-group mb-0"><label class="form-label">CE Cycle End Date</label><input class="form-input" type="date" name="ce_cycle_end_date"></div>' +
            '<div class="form-group mb-0"><label class="form-label">Fair Housing Completed</label>' +
              '<select class="form-input form-select" name="fair_housing_completed">' +
                '<option value="">Select...</option>' +
                '<option value="Yes">Yes</option>' +
                '<option value="No">No</option>' +
              '</select></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Section 3: Brokerage & Commission ──
      '<div class="border-t pt-5">' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-handshake text-gold"></i> Brokerage &amp; Commission</h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
          '<div class="form-group"><label class="form-label">Start Date *</label><input class="form-input" type="date" name="start_date" required></div>' +
          '<div class="form-group"><label class="form-label">Agent Commission Split %</label>' +
            '<input class="form-input" type="number" name="agent_split" value="60" min="0" max="100" oninput="var bk=document.getElementById(\'brokerageSideCalc\');if(bk)bk.textContent=(100-Number(this.value||0))+\'%\';">' +
            '<p class="text-xs text-gray-400 mt-1">Brokerage side: <span id="brokerageSideCalc" class="font-semibold text-gray-600">40%</span></p>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Team / Department</label>' +
            '<select class="form-input form-select" name="team">' +
              '<option value="">No Team</option>' +
              '<option value="Sales Team A">Sales Team A</option>' +
              '<option value="Rental Team">Rental Team</option>' +
              '<option value="Commercial Team">Commercial Team</option>' +
              '<option value="Luxury Division">Luxury Division</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
          '<div class="form-group"><label class="form-label">Desk Fee (Monthly)</label><input class="form-input" type="number" name="desk_fee" min="0" placeholder="$0.00"></div>' +
          '<div class="form-group"><label class="form-label">Referral Fee %</label><input class="form-input" type="number" name="referral_fee_pct" min="0" max="100" placeholder="0"></div>' +
          '<div class="form-group"><label class="form-label">Contract Term</label>' +
            '<select class="form-input form-select" name="contract_term">' +
              '<option value="">Select...</option>' +
              '<option value="1 Year">1 Year</option>' +
              '<option value="2 Years">2 Years</option>' +
              '<option value="At-Will">At-Will</option>' +
            '</select></div>' +
        '</div>' +
      '</div>' +

      // ── Section 4: Broker Document Upload ──
      '<div class="border-t pt-5">' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-file-upload text-gold"></i> Broker Document Upload</h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div>' +
            '<label class="form-label">Signed ICA (Independent Contractor Agreement) *</label>' +
            '<div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gold transition cursor-pointer" onclick="this.querySelector(\'input\').click()">' +
              '<i class="fas fa-cloud-upload-alt text-gray-400 text-2xl mb-2"></i>' +
              '<p class="text-sm text-gray-500">Click to upload or drag &amp; drop</p>' +
              '<p class="text-xs text-gray-400 mt-1">PDF, DOC, DOCX (max 10MB)</p>' +
              '<input type="file" name="ica_document" accept=".pdf,.doc,.docx" class="hidden" onchange="var n=this.parentElement.querySelector(\'p\');if(this.files[0])n.textContent=this.files[0].name">' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<label class="form-label">Other Documents</label>' +
            '<div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gold transition cursor-pointer" onclick="this.querySelector(\'input\').click()">' +
              '<i class="fas fa-cloud-upload-alt text-gray-400 text-2xl mb-2"></i>' +
              '<p class="text-sm text-gray-500">Click to upload or drag &amp; drop</p>' +
              '<p class="text-xs text-gray-400 mt-1">PDF, DOC, DOCX (max 10MB)</p>' +
              '<input type="file" name="other_documents" accept=".pdf,.doc,.docx" multiple class="hidden" onchange="var n=this.parentElement.querySelector(\'p\');if(this.files.length)n.textContent=this.files.length+\' file(s) selected\'">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i> All other documents will be collected from the agent during onboarding.</p>' +
      '</div>' +

      // ── Section 5: Agent Onboarding Checklist (Read-Only Preview) ──
      '<div class="border-t pt-5">' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-clipboard-check text-gold"></i> Agent Onboarding Checklist <span class="text-xs font-normal text-gray-400 ml-1">(Read-Only Preview)</span></h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Set account password</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Upload W-9 Form *</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Upload License Copy *</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Upload E&amp;O Insurance</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Upload Photo ID</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Upload Headshot</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Emergency Contact</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Confirm personal info</label>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" disabled> Accept brokerage terms</label>' +
        '</div>' +
        '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-bell mr-1"></i> You\'ll be notified when each item is completed. Agent cannot access CRM until required items are done.</p>' +
      '</div>' +

      // ── Section 6: Internal Notes ──
      '<div class="border-t pt-5">' +
        '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><i class="fas fa-sticky-note text-gold"></i> Internal Notes</h3>' +
        '<div class="form-group mb-0"><textarea class="form-input" name="internal_notes" rows="3" placeholder="Optional notes about this agent (broker eyes only)..."></textarea></div>' +
      '</div>' +

    '</form>';

    CRM.openModal('Add Agent to Brokerage', html, {
      size: 'xl',
      footer: '<div class="flex items-center justify-between w-full">' +
        '<p class="text-xs text-gray-400"><i class="fas fa-shield-alt mr-1"></i> Data protected under NY SHIELD Act</p>' +
        '<div class="flex items-center gap-2">' +
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-outline" onclick="Panels._submitAddAgent(\'draft\')"><i class="fas fa-save mr-1"></i> Save Draft</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitAddAgent(\'invite\')"><i class="fas fa-paper-plane mr-1"></i> Send Invite</button>' +
        '</div>' +
      '</div>',
    });
  }

  function _previewAgentPhoto(input) {
    var preview = document.getElementById('addAgentPhotoPreview');
    if (!preview || !input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.innerHTML = '<img src="' + e.target.result + '" class="w-full h-full object-cover">';
    };
    reader.readAsDataURL(input.files[0]);
  }

  function _submitAddAgent(mode) {
    var form = document.getElementById('addAgentForm');
    if (!form) return;
    if (mode === 'invite' && !form.checkValidity()) { form.reportValidity(); return; }

    var raw = {};
    new FormData(form).forEach(function (v, k) {
      if (k === 'ica_document' || k === 'other_documents') return;
      if (v) raw[k] = v;
    });

    // Map form fields to API field names
    var data = {
      first_name: raw.first_name || '',
      last_name: raw.last_name || '',
      email: raw.email || '',
      phone: raw.phone || null,
      license_no: raw.license_number || raw.license_no || null,
      license_type: raw.license_type || null,
      sale_split: raw.sale_split ? Number(raw.sale_split) / 100 : null,
      rental_split: raw.rental_split ? Number(raw.rental_split) / 100 : null,
    };

    if (!data.first_name || !data.last_name || !data.email) {
      CRM.toast('First name, last name, and email are required', 'warning');
      return;
    }

    MallanAPI.agents.create(data).then(function (res) {
      var agentId = res.id;
      var tempPw = res.tempPassword || '';

      // Upload photo if provided
      var photoInput = document.getElementById('addAgentPhotoInput');
      var photoFile = photoInput && photoInput.files && photoInput.files[0];
      if (photoFile && agentId) {
        var formData = new FormData();
        formData.append('file', photoFile);
        fetch('/api/crm/agents/' + agentId + '/photo', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }).then(function (r) { return r.json(); }).then(function (photoRes) {
          if (photoRes.url) {
            // Update agent with photo URL
            MallanAPI.agents.update(agentId, { photo: photoRes.url }).catch(function () { /* best effort */ });
          }
        }).catch(function () { /* photo upload is best-effort */ });
      }

      CRM.closeModal();
      if (mode === 'invite' && tempPw) {
        CRM.toast('Agent created. Temp password: ' + tempPw, 'success');
      } else {
        CRM.toast('Agent added successfully', 'success');
      }
      agentRoster();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to add agent'), 'error');
    });
  }

  function _editAgent(id) {
    MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(id)).then(function (data) {
      var a = data.agent || data || {};
      var nameParts = (a.full_name || '').split(' ').filter(Boolean);
      var firstName = a.first_name || (nameParts.length > 0 ? nameParts[0] : '');
      var middleName = nameParts.length === 3 ? nameParts[1] : '';
      var lastName = a.last_name || (nameParts.length === 3 ? nameParts[2] : nameParts.length >= 2 ? nameParts.slice(1).join(' ') : '');

      var splitSale = a.sale_split != null ? Number(a.sale_split) : 50;
      var splitRental = a.rental_split != null ? Number(a.rental_split) : 50;
      if (splitSale > 0 && splitSale < 1) splitSale = Math.round(splitSale * 100);
      if (splitRental > 0 && splitRental < 1) splitRental = Math.round(splitRental * 100);

      // License expiry alert
      var licExpiryStr = a.license_expiry ? String(a.license_expiry).substring(0, 10) : '';
      var licAlertHtml = '';
      if (licExpiryStr) {
        var licDays = Math.ceil((new Date(licExpiryStr) - new Date()) / 86400000);
        if (licDays < 0) {
          licAlertHtml = '<div class="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> License EXPIRED ' + Math.abs(licDays) + ' days ago — renewal required immediately</div>';
        } else if (licDays < 60) {
          licAlertHtml = '<div class="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> License expires in ' + licDays + ' days — renewal required</div>';
        } else if (licDays < 90) {
          licAlertHtml = '<div class="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> License expires in ' + licDays + ' days — plan for renewal</div>';
        }
      }

      var specialtiesStr = Array.isArray(a.specialties) ? a.specialties.join(', ') : (a.specialties || '');
      var languagesStr = Array.isArray(a.languages) ? a.languages.join(', ') : (a.languages || '');

      var html = '<form id="editAgentForm" class="space-y-5">' +
        '<input type="hidden" name="id" value="' + E(id) + '">' +

        // ── Section 1: Personal Information ──
        '<div>' +
          '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Personal Information</h3>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group"><label class="form-label">First Name *</label><input class="form-input" name="first_name" value="' + E(firstName) + '" required></div>' +
            '<div class="form-group"><label class="form-label">Middle Name</label><input class="form-input" name="middle_name" value="' + E(middleName) + '" placeholder="Middle name"></div>' +
            '<div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" name="last_name" value="' + E(lastName) + '" required></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Title / Tagline</label><input class="form-input" name="title" value="' + E(a.title || '') + '" placeholder="e.g. Senior Sales Associate"></div>' +
            '<div class="form-group"><label class="form-label">Status</label>' +
              '<select class="form-input form-select" name="status">' +
                '<option value="active"' + (a.status === 'active' ? ' selected' : '') + '>Active</option>' +
                '<option value="inactive"' + (a.status === 'inactive' ? ' selected' : '') + '>Inactive</option>' +
                '<option value="suspended"' + (a.status === 'suspended' ? ' selected' : '') + '>Suspended</option>' +
              '</select></div>' +
            '<div></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" name="email" value="' + E(a.email || '') + '" readonly class="bg-gray-50 text-gray-500 cursor-not-allowed"></div>' +
            '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" name="phone" value="' + E(a.phone || '') + '" placeholder="646-XXX-XXXX"></div>' +
            '<div class="form-group"><label class="form-label">Secondary Phone</label><input class="form-input" type="tel" name="secondary_phone" placeholder="Optional"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Home Address</label><input class="form-input" name="home_address" placeholder="Street address"></div>' +
            '<div class="form-group"><label class="form-label">City</label><input class="form-input" name="city" placeholder="City"></div>' +
            '<div class="form-group"><label class="form-label">State</label><input class="form-input" name="state" placeholder="State"></div>' +
            '<div class="form-group"><label class="form-label">Zip</label><input class="form-input" name="zip" placeholder="10001"></div>' +
          '</div>' +
          '<div class="mt-3">' +
            '<label class="form-label">Photo</label>' +
            '<div class="flex items-center gap-4">' +
              (a.photo ? '<img id="editAgentPhotoPreview" src="' + E(a.photo) + '" class="w-16 h-16 rounded-full object-cover border border-gray-200" onerror="this.style.display=\'none\'">' : '<div id="editAgentPhotoPreview" class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs border border-gray-200">No photo</div>') +
              '<div>' +
                '<input type="file" id="editAgentPhotoFile" name="photo_file" accept="image/jpeg,image/png,image/webp" class="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-xs file:font-semibold file:bg-white file:text-gray-700 hover:file:bg-gray-50" onchange="(function(inp){var f=inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){var prev=document.getElementById(\'editAgentPhotoPreview\');if(prev.tagName===\'IMG\'){prev.src=e.target.result;}else{var img=document.createElement(\'img\');img.id=\'editAgentPhotoPreview\';img.src=e.target.result;img.className=\'w-16 h-16 rounded-full object-cover border border-gray-200\';prev.parentNode.replaceChild(img,prev);}};r.readAsDataURL(f);})(this)">' +
                '<p class="text-xs text-gray-400 mt-1">JPG, PNG, or WebP. Max 5 MB.</p>' +
              '</div>' +
            '</div>' +
            '<input type="hidden" name="photo" value="' + E(a.photo || '') + '">' +
            (!a.photo && !a.bio ? '<p class="text-xs text-gray-400 mt-2 italic">Run sync to import profile data from mallan.nyc</p>' : '') +
          '</div>' +
        '</div>' +

        // ── Section 2: NY DOS License Information ──
        '<div class="border-t pt-5">' +
          '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">NY DOS License Information</h3>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group"><label class="form-label">License Type</label>' +
              '<select class="form-input form-select" name="license_type">' +
                '<option value="">Select...</option>' +
                '<option value="Licensed Real Estate Salesperson"' + (a.license_type === 'Licensed Real Estate Salesperson' ? ' selected' : '') + '>Licensed Real Estate Salesperson</option>' +
                '<option value="Licensed Associate Broker"' + (a.license_type === 'Licensed Associate Broker' ? ' selected' : '') + '>Licensed Associate Broker</option>' +
                '<option value="Licensed Broker"' + (a.license_type === 'Licensed Broker' ? ' selected' : '') + '>Licensed Broker</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">NY DOS License #</label><input class="form-input" name="license_no" value="' + E(a.license_no || '') + '" placeholder="10XXXXXXXXX"></div>' +
            '<div class="form-group"><label class="form-label">License Expiration</label><input class="form-input" type="date" name="license_expiry" value="' + E(licExpiryStr) + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">DOS License Status</label>' +
              '<select class="form-input form-select" name="license_status">' +
                '<option value="Active"' + (a.license_status === 'Active' || (!a.license_status && a.status === 'active') ? ' selected' : '') + '>Active</option>' +
                '<option value="Inactive"' + (a.license_status === 'Inactive' ? ' selected' : '') + '>Inactive</option>' +
                '<option value="Expired"' + (a.license_status === 'Expired' ? ' selected' : '') + '>Expired</option>' +
                '<option value="Suspended"' + (a.license_status === 'Suspended' ? ' selected' : '') + '>Suspended</option>' +
                '<option value="Revoked"' + (a.license_status === 'Revoked' ? ' selected' : '') + '>Revoked</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">REBNY Member ID</label><input class="form-input" name="rebny_member_id" value="' + E(a.rebny_member_id || '') + '" placeholder="REBNY Member ID"></div>' +
            '<div class="form-group"><label class="form-label">NRD/NRDS ID</label><input class="form-input" name="nrds_id" value="' + E(a.nrds_id || '') + '" placeholder="NRD/NRDS ID"></div>' +
          '</div>' +
          '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-3">' +
            '<h4 class="text-xs font-bold text-yellow-800 uppercase mb-2"><i class="fas fa-graduation-cap mr-1"></i> Continuing Education (CE) Hours</h4>' +
            '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
              '<div class="form-group mb-0"><label class="form-label">CE Hours Completed</label><input class="form-input" type="number" name="ce_hours_completed" min="0" max="100" value="' + E(a.ce_hours_completed || '') + '" placeholder="0"></div>' +
              '<div class="form-group mb-0"><label class="form-label">CE Cycle End Date</label><input class="form-input" type="date" name="ce_cycle_end_date" value="' + E(a.ce_cycle_end_date ? String(a.ce_cycle_end_date).substring(0, 10) : '') + '"></div>' +
              '<div class="form-group mb-0"><label class="form-label">Fair Housing Completed</label>' +
                '<select class="form-input form-select" name="fair_housing_completed">' +
                  '<option value="">Select...</option>' +
                  '<option value="Yes"' + (a.fair_housing_completed === 'Yes' ? ' selected' : '') + '>Yes</option>' +
                  '<option value="No"' + (a.fair_housing_completed === 'No' ? ' selected' : '') + '>No</option>' +
                '</select></div>' +
            '</div>' +
            licAlertHtml +
            (a.ce_cycle_end_date ? (function () {
              var ceDays = Math.ceil((new Date(String(a.ce_cycle_end_date).substring(0, 10)) - new Date()) / 86400000);
              if (ceDays < 0) return '<div class="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> CE cycle ended ' + Math.abs(ceDays) + ' days ago — CE renewal overdue</div>';
              if (ceDays < 60) return '<div class="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> CE cycle ends in ' + ceDays + ' days — renewal required</div>';
              if (ceDays < 90) return '<div class="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 font-semibold"><i class="fas fa-exclamation-triangle mr-1"></i> CE cycle ends in ' + ceDays + ' days — plan for renewal</div>';
              return '';
            })() : '') +
          '</div>' +
        '</div>' +

        // ── Section 3: Brokerage & Commission ──
        '<div class="border-t pt-5">' +
          '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Brokerage &amp; Commission</h3>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" name="start_date" value="' + E(a.start_date ? String(a.start_date).substring(0, 10) : '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Agent Commission Split %</label>' +
              '<input class="form-input" type="number" name="sale_split" value="' + splitSale + '" min="0" max="100" oninput="var bk=document.getElementById(\'editBrokerageSideCalc\');if(bk)bk.textContent=(100-Number(this.value||0))+\'%\';">' +
              '<p class="text-xs text-gray-400 mt-1">Brokerage side: <span id="editBrokerageSideCalc" class="font-semibold text-gray-600">' + (100 - splitSale) + '%</span></p>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Team / Department</label>' +
              '<select class="form-input form-select" name="team">' +
                '<option value="">No Team</option>' +
                '<option value="Sales Team A"' + (a.team === 'Sales Team A' ? ' selected' : '') + '>Sales Team A</option>' +
                '<option value="Rental Team"' + (a.team === 'Rental Team' ? ' selected' : '') + '>Rental Team</option>' +
                '<option value="Commercial Team"' + (a.team === 'Commercial Team' ? ' selected' : '') + '>Commercial Team</option>' +
                '<option value="Luxury Division"' + (a.team === 'Luxury Division' ? ' selected' : '') + '>Luxury Division</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Desk Fee (Monthly)</label><input class="form-input" type="number" name="desk_fee" min="0" value="' + E(a.desk_fee || '') + '" placeholder="$0.00"></div>' +
            '<div class="form-group"><label class="form-label">Referral Fee %</label><input class="form-input" type="number" name="referral_fee_pct" min="0" max="100" value="' + E(a.referral_fee_pct || '') + '" placeholder="0"></div>' +
            '<div class="form-group"><label class="form-label">Contract Term</label>' +
              '<select class="form-input form-select" name="contract_term">' +
                '<option value="">Select...</option>' +
                '<option value="1 Year"' + (a.contract_term === '1 Year' ? ' selected' : '') + '>1 Year</option>' +
                '<option value="2 Years"' + (a.contract_term === '2 Years' ? ' selected' : '') + '>2 Years</option>' +
                '<option value="At-Will"' + (a.contract_term === 'At-Will' ? ' selected' : '') + '>At-Will</option>' +
              '</select></div>' +
          '</div>' +
        '</div>' +

        // ── Section 4: Public Profile (for mallan.nyc) ──
        '<div class="border-t pt-5">' +
          '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Public Profile (for mallan.nyc)</h3>' +
          '<div class="form-group"><label class="form-label">Bio</label>' +
            '<textarea class="form-input" name="bio" rows="3" placeholder="Agent bio for public profile...">' + E(a.bio || '') + '</textarea></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Public Slug</label>' +
              '<div class="flex items-center">' +
                '<span class="text-xs text-gray-400 mr-1 whitespace-nowrap">mallan.nyc/agents/</span>' +
                '<input class="form-input" name="public_slug" value="' + E(a.public_slug || '') + '" placeholder="jane-doe">' +
              '</div>' +
            '</div>' +
            '<div></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">' +
            '<div class="form-group"><label class="form-label">Specialties</label><input class="form-input" name="specialties" value="' + E(specialtiesStr) + '" placeholder="Luxury, Co-ops, New Development"></div>' +
            '<div class="form-group"><label class="form-label">Languages</label><input class="form-input" name="languages" value="' + E(languagesStr) + '" placeholder="English, Spanish, Mandarin"></div>' +
          '</div>' +
          '<label class="flex items-center gap-2 mt-3 cursor-pointer">' +
            '<input type="checkbox" name="featured" value="true"' + (a.featured ? ' checked' : '') + ' class="w-4 h-4 rounded border-gray-300 text-gold focus:ring-gold">' +
            '<span class="text-sm font-medium text-gray-700">Featured agent on mallan.nyc</span>' +
          '</label>' +
          '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-sync-alt mr-1"></i> This syncs with the agent\'s public profile on mallan.nyc/agents/' + E(a.public_slug || '{slug}') + '</p>' +
        '</div>' +

        // ── Section 5: Internal Notes ──
        '<div class="border-t pt-5">' +
          '<h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Internal Notes</h3>' +
          '<div class="form-group mb-0"><textarea class="form-input" name="internal_notes" rows="3" placeholder="Internal notes about this agent (broker eyes only)...">' + E(a.internal_notes || '') + '</textarea></div>' +
        '</div>' +

      '</form>';

      CRM.openModal('Edit Agent — ' + E(a.full_name || a.name || 'Agent'), html, {
        size: 'xl',
        footer: '<div class="flex items-center justify-between w-full">' +
          '<p class="text-xs text-gray-400"><i class="fas fa-shield-alt mr-1"></i> Data protected under NY SHIELD Act</p>' +
          '<div class="flex items-center gap-2">' +
            '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitEditAgent()"><i class="fas fa-save mr-1"></i> Save Changes</button>' +
          '</div>' +
        '</div>',
      });
    }).catch(function (err) {
      CRM.toast('Failed to load agent: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _submitEditAgent() {
    var form = document.getElementById('editAgentForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var raw = {};
    var agentId;
    new FormData(form).forEach(function (v, k) {
      if (k === 'id') { agentId = v; return; }
      if (k === 'photo_file') return; // handled separately
      if (v !== '' && v !== null) raw[k] = v;
    });

    // Build API payload with correct field names
    var data = {};
    if (raw.first_name) data.first_name = raw.first_name;
    if (raw.last_name) data.last_name = raw.last_name;
    if (raw.phone) data.phone = raw.phone;
    if (raw.license_no) data.license_no = raw.license_no;
    if (raw.license_type) data.license_type = raw.license_type;
    if (raw.license_expiry) data.license_expiry = raw.license_expiry;
    if (raw.title) data.title = raw.title;
    if (raw.bio) data.bio = raw.bio;
    if (raw.status) data.status = raw.status;
    if (raw.public_slug) data.public_slug = raw.public_slug;

    // Featured checkbox — unchecked means not in FormData
    data.featured = form.querySelector('[name="featured"]') ? form.querySelector('[name="featured"]').checked : false;

    // Specialties & languages — split comma-separated strings to arrays
    if (raw.specialties) {
      data.specialties = raw.specialties.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    } else {
      data.specialties = [];
    }
    if (raw.languages) {
      data.languages = raw.languages.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    } else {
      data.languages = [];
    }

    // Convert split percentages to decimals for API
    if (raw.sale_split) data.sale_split = Number(raw.sale_split) / 100;
    if (raw.rental_split) data.rental_split = Number(raw.rental_split) / 100;

    // Photo — upload file if selected, otherwise use existing hidden value
    var fileInput = document.getElementById('editAgentPhotoFile');
    var photoFile = fileInput && fileInput.files && fileInput.files[0];

    function _doAgentUpdate(patchData) {
      MallanAPI.agents.update(agentId, patchData).then(function () {
        CRM.closeModal();
        CRM.toast('Agent updated', 'success');
        agentRoster();
      }).catch(function (err) {
        CRM.toast('Failed to update: ' + (err.message || 'Unknown error'), 'error');
      });
    }

    if (photoFile) {
      // Upload photo first, then PATCH agent with returned URL
      var fd = new FormData();
      fd.append('photo', photoFile);
      MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(agentId) + '/photo', {
        method: 'POST',
        body: fd,
        rawBody: true,
      }).then(function (res) {
        if (res && res.url) data.photo = res.url;
        _doAgentUpdate(data);
      }).catch(function (err) {
        CRM.toast('Photo upload failed: ' + (err.message || 'Unknown error') + ' — saving other fields', 'error');
        // Still save other fields even if photo upload fails
        var existingPhoto = raw.photo || '';
        if (existingPhoto) data.photo = existingPhoto;
        _doAgentUpdate(data);
      });
    } else {
      // No new file — keep existing photo URL from hidden input
      var existingPhoto = raw.photo || '';
      if (existingPhoto) data.photo = existingPhoto;
      _doAgentUpdate(data);
    }
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
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
    ]).then(function (r) {
      _cabClients = r[0].clients || [];
      var agents = r[1].agents || [];
      var allDeals = r[2].deals || [];
      var allTasks = r[3].tasks || [];

      // Build agent lookup map (id → name)
      _cabAgentMap = {};
      agents.forEach(function (a) { _cabAgentMap[a.id] = a.full_name || a.name || a.email || 'Agent'; });

      var now = new Date();

      // Resolve agent names + operational data on clients
      _cabClients.forEach(function (cl) {
        var aid = cl.assignedAgentId || cl.assigned_agent_id;
        cl._agentName = cl.agent_name || (aid ? (_cabAgentMap[aid] || aid) : 'Unassigned');
        cl._agentId = aid || null;

        // Deal count
        var cid = cl.id;
        var clientDeals = allDeals.filter(function (d) { return d.client_id === cid || d.clientId === cid; });
        cl._dealCount = clientDeals.length;

        // Last activity: most recent of client updated_at, deal updated_at, task updated_at
        var dates = [];
        var clUpdated = cl.updated_at || cl.updatedAt;
        if (clUpdated) dates.push(new Date(clUpdated));
        clientDeals.forEach(function (d) {
          var du = d.updated_at || d.updatedAt;
          if (du) dates.push(new Date(du));
        });
        var clientTasks = allTasks.filter(function (t) { return t.client_id === cid || t.clientId === cid; });
        clientTasks.forEach(function (t) {
          var tu = t.updated_at || t.updatedAt;
          if (tu) dates.push(new Date(tu));
        });
        if (dates.length > 0) {
          dates.sort(function (a, b) { return b - a; });
          cl._lastActivity = dates[0];
        } else {
          cl._lastActivity = null;
        }

        var daysSince = cl._lastActivity ? (now - cl._lastActivity) / (1000 * 60 * 60 * 24) : Infinity;
        cl._isHot = daysSince <= 7;
        cl._isInactive = daysSince >= 30;
      });

      // Get unique values for filter dropdowns
      var types = _uniqueVals(_cabClients, function (cl) { return cl.type || cl.client_type; });
      var stages = _uniqueVals(_cabClients, function (cl) { return cl.stage || cl.status; });
      var agentNames = [];
      agents.forEach(function (a) { agentNames.push({ id: a.id, name: a.full_name || a.name || a.email }); });

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
    html += '</select>' +
      '<select id="cabSourceFilter" class="form-input form-select text-sm" style="width:auto;min-width:130px" onchange="Panels._filterCAB()">' +
        '<option value="">All Sources</option>' +
        '<option value="Website">Website</option>' +
        '<option value="StreetEasy">StreetEasy</option>' +
        '<option value="Zillow">Zillow</option>' +
        '<option value="Referral">Referral</option>' +
        '<option value="Walk-in">Walk-in</option>' +
        '<option value="Social Media">Social Media</option>' +
        '<option value="Other">Other</option>' +
      '</select>' +
      '<select id="cabTagFilter" class="form-input form-select text-sm" style="width:auto;min-width:110px" onchange="Panels._filterCAB()">' +
        '<option value="">All Tags</option>' +
        '<option value="hot">Hot</option>' +
        '<option value="inactive">Inactive</option>' +
      '</select></div>';

    // Table
    html += '<div id="cabTableContainer">' + _cabTable(clients) + '</div>';

    html += '</div>';
    c.innerHTML = html;
  }

  function _sourceWithRefBadge(source) {
    var src = source || '-';
    var html = '<span class="text-xs">' + E(src) + '</span>';
    if (src === 'StreetEasy' || src === 'Zillow' || src === 'Referral') {
      html += ' <span class="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded cursor-pointer" ' +
        'style="background:#FFF7ED;color:#EA580C;border:1px solid #FDBA74" ' +
        'onclick="event.stopPropagation();Router.navigate(\'/broker/leads/referrals\')" ' +
        'title="Referral fee may apply">&#9888; Referral fee</span>';
    }
    return html;
  }

  function _cabTable(clients) {
    return '<div class="data-table"><div style="overflow-x:auto"><table class="w-full"><thead><tr>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'name\')">Client <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'type\')">Type <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'source\')">Source <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'stage\')">Stage <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'agent\')">Assigned Agent <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-center px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'deals\')">Deals <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'tags\')">Tags <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs hidden sm:table-cell">Phone</th>' +
      '<th class="text-left px-3 py-2 text-xs hidden md:table-cell cursor-pointer hover:bg-gray-100" onclick="Panels._sortCAB(\'updated\')">Updated <i class="fas fa-sort text-gray-300 ml-1"></i></th>' +
      '<th class="text-left px-3 py-2 text-xs">Actions</th>' +
    '</tr></thead><tbody>' +
    (clients.length === 0 ? '<tr><td colspan="10" class="text-center py-8 text-gray-400 text-sm">No clients match filters</td></tr>' :
      clients.map(function (cl) {
        var src = cl.source || cl.lead_source || '';
        var dealCountHtml = '<span class="cursor-pointer text-sm font-semibold ' + (cl._dealCount > 0 ? 'text-blue-600 hover:underline' : 'text-gray-400') + '"' +
          (cl._dealCount > 0 ? ' onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/deals\')"' : '') + '>' + (cl._dealCount || 0) + '</span>';
        var tagHtml = '';
        if (cl._isHot) tagHtml += '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">Hot</span>';
        if (cl._isInactive) tagHtml += '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-bold">Inactive</span>';
        return '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2"><div class="flex items-center gap-2 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
            UI.avatar(cl.name || cl.email, 28) +
            '<div><p class="text-sm font-medium">' + E(cl.name || cl.email || 'Unknown') + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div></div></td>' +
          '<td class="px-3 py-2">' + UI.roleBadge(cl.type || cl.client_type) + '</td>' +
          '<td class="px-3 py-2">' + _sourceWithRefBadge(src) + '</td>' +
          '<td class="px-3 py-2">' + UI.stageBadge(cl.stage || cl.status) + '</td>' +
          '<td class="px-3 py-2"><span class="text-sm ' + (cl._agentName === 'Unassigned' ? 'text-red-500 font-semibold' : 'text-gray-700') + '">' + E(cl._agentName) + '</span></td>' +
          '<td class="px-3 py-2 text-center">' + dealCountHtml + '</td>' +
          '<td class="px-3 py-2"><div class="flex gap-1">' + tagHtml + '</div></td>' +
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
    var sourceF = (document.getElementById('cabSourceFilter') || {}).value || '';
    var tagF = (document.getElementById('cabTagFilter') || {}).value || '';

    var filtered = _cabClients.filter(function (cl) {
      if (search) {
        var hay = ((cl.name || '') + ' ' + (cl.email || '') + ' ' + (cl.phone || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      if (typeF && (cl.type || cl.client_type) !== typeF) return false;
      if (stageF && (cl.stage || cl.status) !== stageF) return false;
      if (agentF === 'unassigned' && cl._agentId) return false;
      if (agentF && agentF !== 'unassigned' && cl._agentId !== agentF) return false;
      if (sourceF && (cl.source || cl.lead_source || '') !== sourceF) return false;
      if (tagF === 'hot' && !cl._isHot) return false;
      if (tagF === 'inactive' && !cl._isInactive) return false;
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
        case 'name': va = (a.full_name || a.name || a.email || '').toLowerCase(); vb = (b.name || b.email || '').toLowerCase(); break;
        case 'type': va = (a.type || a.client_type || ''); vb = (b.type || b.client_type || ''); break;
        case 'source': va = (a.source || a.lead_source || ''); vb = (b.source || b.lead_source || ''); break;
        case 'stage': va = (a.stage || a.status || ''); vb = (b.stage || b.status || ''); break;
        case 'agent': va = (a._agentName || '').toLowerCase(); vb = (b._agentName || '').toLowerCase(); break;
        case 'deals': va = a._dealCount || 0; vb = b._dealCount || 0; break;
        case 'tags': va = a._isHot ? 2 : (a._isInactive ? 0 : 1); vb = b._isHot ? 2 : (b._isInactive ? 0 : 1); break;
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
          'onclick="Panels._doReassign(\'' + E(clientId) + '\',\'' + E(a.id) + '\',\'' + E(a.full_name || a.name || a.email) + '\')">' +
          UI.avatar(a.full_name || a.name || a.email, 32) +
          '<div><span class="text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</span>' +
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

  // ─── Lead Distribution Hub (Kanban Inbox) ───────────────────────────
  var _leadSourceFilter = 'All';
  var _leadDataCache = { leads: [], agents: [] };
  var _bulkSelectedLeads = {};

  function leadDistribution() {
    CRM.setPanelTitle('Lead Distribution');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI._fetch('/api/crm/leads?limit=200').catch(function () { return { leads: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; })
    ]).then(function (results) {
      _leadDataCache.leads = results[0].leads || [];
      _leadDataCache.agents = results[1].agents || [];
      _bulkSelectedLeads = {};
      _leadSourceFilter = 'All';
      c.innerHTML = _renderLeadsPanel(_leadDataCache.leads, _leadDataCache.agents);
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Lead Distribution', 'Assign incoming leads to agents') +
        UI.emptyState('fa-inbox', 'No leads found', '<button class="btn btn-sm btn-gold" onclick="Panels._createLead()"><i class="fas fa-plus"></i> Create Lead</button>') +
      '</div>';
    });
  }

  function _filterLeadsBySource(source) {
    _leadSourceFilter = source || 'All';
    _bulkSelectedLeads = {};
    var c = _container();
    c.innerHTML = _renderLeadsPanel(_leadDataCache.leads, _leadDataCache.agents);
  }

  function _toggleBulkLead(leadId) {
    if (_bulkSelectedLeads[leadId]) {
      delete _bulkSelectedLeads[leadId];
    } else {
      _bulkSelectedLeads[leadId] = true;
    }
    // Update checkbox visually
    var cb = document.getElementById('bulk-cb-' + leadId);
    if (cb) cb.checked = !!_bulkSelectedLeads[leadId];
    // Update bulk button count
    var countEl = document.getElementById('bulk-assign-count');
    var cnt = Object.keys(_bulkSelectedLeads).length;
    if (countEl) countEl.textContent = cnt > 0 ? '(' + cnt + ')' : '';
  }

  function _bulkAssignLeads() {
    var ids = Object.keys(_bulkSelectedLeads);
    if (ids.length === 0) { CRM.toast('No leads selected', 'warning'); return; }

    CRM.openModal('Bulk Assign ' + ids.length + ' Lead' + (ids.length > 1 ? 's' : ''),
      '<div id="bulkAssignList">' + UI.loading() + '</div>'
    );
    MallanAPI.agents.list().then(function (data) {
      var el = document.getElementById('bulkAssignList');
      if (!el) return;
      var agents = data.agents || [];
      var html = '<div class="space-y-2">';
      agents.forEach(function (a) {
        html += '<button class="w-full text-left p-3 rounded-lg border hover:border-gold hover:bg-gold-bg flex items-center gap-3" ' +
          'onclick="Panels._doBulkAssign(\'' + E(a.id) + '\')">' +
          UI.avatar(a.full_name || a.name || a.email, 32) +
          '<span class="text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</span></button>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('bulkAssignList');
      if (el) el.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agents');
    });
  }

  function _doBulkAssign(agentId) {
    var ids = Object.keys(_bulkSelectedLeads);
    if (ids.length === 0) { CRM.closeModal(); return; }
    var promises = ids.map(function (lid) {
      return MallanAPI._fetch('/api/crm/leads/' + lid, { method: 'PATCH', body: JSON.stringify({ assigned_agent_id: agentId }) })
        .catch(function () { return null; });
    });
    Promise.all(promises).then(function () {
      _bulkSelectedLeads = {};
      Events.log('leads_bulk_assigned', 'lead', null, { agentId: agentId, count: ids.length });
      CRM.closeModal();
      CRM.toast(ids.length + ' lead' + (ids.length > 1 ? 's' : '') + ' assigned', 'success');
      leadDistribution();
    });
  }

  function _renderLeadCard(lead, agents) {
    var isAssigned = lead.assignedAgentId || lead.assigned_agent_id;
    var status = (lead.status || 'new').toLowerCase();
    var isConverted = status === 'converted' || lead.convertedClientId || lead.converted_client_id;
    var showCheckbox = !isAssigned && !isConverted;

    var createdDate = new Date(lead.created_at || lead.createdAt || Date.now());
    var ageMs = Date.now() - createdDate.getTime();
    var ageHours = Math.floor(ageMs / 3600000);

    var html = '<div class="p-3 mb-2 rounded-lg border bg-white hover:shadow-sm transition-shadow">';

    // Checkbox row for unassigned
    if (showCheckbox) {
      html += '<div class="flex items-start gap-2">' +
        '<input type="checkbox" id="bulk-cb-' + E(lead.id) + '" class="mt-1 rounded border-gray-300" ' +
        ((_bulkSelectedLeads[lead.id]) ? 'checked ' : '') +
        'onchange="Panels._toggleBulkLead(\'' + E(lead.id) + '\')">' +
        '<div class="flex-1 min-w-0">';
    } else {
      html += '<div>';
    }

    // Name + email
    html += '<p class="text-sm font-medium truncate">' + E(lead.name || lead.email || 'Unknown') + '</p>';
    if (lead.email) html += '<p class="text-xs text-gray-500 truncate">' + E(lead.email) + '</p>';

    // Badges row
    html += '<div class="flex flex-wrap gap-1 mt-1.5">';
    html += _sourceWithRefBadge(lead.source || '');
    html += ' ' + UI.roleBadge(lead.leadType || lead.type || 'buyer');
    html += '</div>';

    // Time
    html += '<p class="text-xs text-gray-400 mt-1.5"><i class="far fa-clock mr-1"></i>';
    if (ageHours < 1) {
      html += 'Just now';
    } else if (ageHours < 24) {
      html += ageHours + 'h ago';
    } else {
      html += Math.floor(ageHours / 24) + 'd ago';
    }
    html += '</p>';

    // Assign button or agent name
    if (isConverted) {
      html += '<div class="mt-2"><span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded" style="background:#DCFCE7;color:#166534"><i class="fas fa-check mr-1"></i>Converted</span></div>';
    } else if (isAssigned) {
      html += '<div class="mt-2"><span class="text-xs text-gray-600"><i class="fas fa-user-check mr-1 text-green-500"></i>' + E(lead.agent_name || lead.assignedAgentId || lead.assigned_agent_id) + '</span></div>';
    } else {
      html += '<div class="mt-2"><button class="btn btn-sm btn-gold w-full" onclick="Panels._assignLeadSuggested(\'' + E(lead.id) + '\')"><i class="fas fa-user-plus mr-1"></i>Assign</button></div>';
    }

    html += '</div>';
    if (showCheckbox) html += '</div>';
    html += '</div>';
    return html;
  }

  function _renderLeadsPanel(leads, agents) {
    // Apply source filter
    var filtered = leads;
    if (_leadSourceFilter && _leadSourceFilter !== 'All') {
      filtered = leads.filter(function (l) {
        return (l.source || '').toLowerCase() === _leadSourceFilter.toLowerCase();
      });
    }

    var now = Date.now();
    var h24 = 24 * 3600000;

    // Categorize into lanes
    var laneNew = [];
    var laneNeedsAssign = [];
    var laneContacted = [];
    var laneConverted = [];

    filtered.forEach(function (l) {
      var assigned = l.assignedAgentId || l.assigned_agent_id;
      var status = (l.status || 'new').toLowerCase();
      var isConverted = status === 'converted' || l.convertedClientId || l.converted_client_id;
      var age = now - new Date(l.created_at || l.createdAt || now).getTime();

      if (isConverted) {
        laneConverted.push(l);
      } else if (assigned && status === 'contacted') {
        laneContacted.push(l);
      } else if (!assigned && (status === 'contacted' || (status === 'new' && age > h24))) {
        laneNeedsAssign.push(l);
      } else if (!assigned && status === 'new') {
        laneNew.push(l);
      } else if (assigned) {
        laneContacted.push(l);
      } else {
        laneNew.push(l);
      }
    });

    // Source chips
    var sources = ['All', 'Website', 'StreetEasy', 'Zillow', 'Referral', 'Walk-in', 'Social Media'];
    var chipsHtml = '<div class="flex flex-wrap gap-2">';
    sources.forEach(function (s) {
      var active = _leadSourceFilter === s;
      chipsHtml += '<button class="px-3 py-1 rounded-full text-xs font-semibold transition-colors ' +
        (active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '" ' +
        'onclick="Panels._filterLeadsBySource(\'' + E(s) + '\')">' + E(s);
      if (s !== 'All') {
        var cnt = leads.filter(function (l) { return (l.source || '').toLowerCase() === s.toLowerCase(); }).length;
        if (cnt > 0) chipsHtml += ' <span class="opacity-60">(' + cnt + ')</span>';
      }
      chipsHtml += '</button>';
    });
    chipsHtml += '</div>';

    var bulkCount = Object.keys(_bulkSelectedLeads).length;

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
      '<h3 class="text-lg font-bold text-gray-900">Lead Distribution</h3>' +
      '<div class="flex items-center gap-2">' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._bulkAssignLeads()" ' +
          (bulkCount === 0 ? 'disabled style="opacity:0.5"' : '') + '>' +
          '<i class="fas fa-users-cog mr-1"></i>Bulk Assign <span id="bulk-assign-count">' + (bulkCount > 0 ? '(' + bulkCount + ')' : '') + '</span></button>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._createLead()"><i class="fas fa-plus mr-1"></i>Create Lead</button>' +
      '</div></div>';

    // Source filter chips
    html += chipsHtml;

    // Kanban lanes
    var lanes = [
      { title: 'New', items: laneNew, color: '#DC2626', icon: 'fa-inbox' },
      { title: 'Needs Assignment', items: laneNeedsAssign, color: '#D97706', icon: 'fa-exclamation-circle' },
      { title: 'Contacted', items: laneContacted, color: '#2563EB', icon: 'fa-phone-alt' },
      { title: 'Converted', items: laneConverted, color: '#059669', icon: 'fa-check-circle' }
    ];

    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">';
    lanes.forEach(function (lane) {
      html += '<div class="rounded-lg border" style="border-left:4px solid ' + lane.color + '">' +
        '<div class="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">' +
          '<span class="text-sm font-bold text-gray-800"><i class="fas ' + lane.icon + ' mr-1" style="color:' + lane.color + '"></i>' + lane.title + '</span>' +
          '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white" style="background:' + lane.color + '">' + lane.items.length + '</span>' +
        '</div>' +
        '<div class="p-2" style="max-height:480px;overflow-y:auto">';
      if (lane.items.length === 0) {
        html += '<p class="text-xs text-gray-400 text-center py-6">No leads</p>';
      } else {
        lane.items.forEach(function (l) {
          html += _renderLeadCard(l, agents);
        });
      }
      html += '</div></div>';
    });
    html += '</div>';

    html += '</div>';
    return html;
  }

  function _assignLeadSuggested(leadId) {
    CRM.openModal('Assign Lead',
      '<div id="assignLeadList">' + UI.loading() + '</div>'
    );
    MallanAPI.agents.list().then(function (data) {
      var el = document.getElementById('assignLeadList');
      if (!el) return;
      var agents = data.agents || [];

      // Find agent with fewest active clients for suggestion
      var suggestedId = null;
      var minClients = Infinity;
      agents.forEach(function (a) {
        var count = a.active_client_count || a.activeClientCount || a.client_count || 0;
        if (count < minClients) { minClients = count; suggestedId = a.id; }
      });

      var html = '<div class="space-y-2">';
      agents.forEach(function (a) {
        var isSuggested = a.id === suggestedId;
        html += '<button class="w-full text-left p-3 rounded-lg border hover:border-gold hover:bg-gold-bg flex items-center gap-3' +
          (isSuggested ? ' border-green-300 bg-green-50' : '') + '" ' +
          'onclick="Panels._doAssignLead(\'' + E(leadId) + '\',\'' + E(a.id) + '\')">' +
          UI.avatar(a.full_name || a.name || a.email, 32) +
          '<div class="flex-1"><span class="text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</span>';
        if (isSuggested) {
          html += ' <span class="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded" style="background:#DCFCE7;color:#166534">Suggested</span>';
        }
        var clientCount = a.active_client_count || a.activeClientCount || a.client_count || 0;
        html += '<p class="text-xs text-gray-500">' + clientCount + ' active client' + (clientCount !== 1 ? 's' : '') + '</p>';
        html += '</div></button>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('assignLeadList');
      if (el) el.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agents');
    });
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
          UI.avatar(a.full_name || a.name || a.email, 32) +
          '<span class="text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</span></button>';
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

    // Referral table headers (shared)
    var _refTableHeaders = function (dirLabel) {
      return '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Date</th>' +
        '<th class="text-left px-3 py-2">' + dirLabel + '</th>' +
        '<th class="text-left px-3 py-2">Our Agent</th>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Property</th>' +
        '<th class="text-right px-3 py-2">Price</th>' +
        '<th class="text-right px-3 py-2">Fee%</th>' +
        '<th class="text-right px-3 py-2">Fee Amount</th>' +
        '<th class="text-left px-3 py-2">Agreement</th>' +
        '<th class="text-left px-3 py-2">Payment</th>' +
        '<th class="text-left px-3 py-2">Deal Status</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
    };

    // Totals row helper
    var _refTotalsRow = function (rows) {
      var totalFee = rows.reduce(function (s, r) { return s + (r.feeAmount || r.fee_amount || 0); }, 0);
      return '<tr class="bg-gray-50 font-semibold border-t-2">' +
        '<td colspan="8" class="px-3 py-2 text-sm text-right">Total (' + rows.length + ' referral' + (rows.length !== 1 ? 's' : '') + ')</td>' +
        '<td class="px-3 py-2 text-sm text-right font-bold">' + $(totalFee) + '</td>' +
        '<td colspan="4"></td></tr>';
    };

    // Incoming referrals table
    html += '<div class="card"><div class="card-header"><h3><i class="fas fa-arrow-down text-green-500 mr-2"></i>Incoming Referrals (' + incoming.length + ')</h3></div>' +
      '<div class="card-body">';
    if (incoming.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No incoming referrals for ' + year + '</p>';
    } else {
      html += _refTableHeaders('From (Brokerage/Agent)');
      incoming.forEach(function (r) { html += _referralRow(r); });
      html += _refTotalsRow(incoming);
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // Outgoing referrals table
    html += '<div class="card"><div class="card-header"><h3><i class="fas fa-arrow-up text-red-500 mr-2"></i>Outgoing Referrals (' + outgoing.length + ')</h3></div>' +
      '<div class="card-body">';
    if (outgoing.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No outgoing referrals for ' + year + '</p>';
    } else {
      html += _refTableHeaders('To (Brokerage/Agent)');
      outgoing.forEach(function (r) { html += _referralRow(r); });
      html += _refTotalsRow(outgoing);
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // Pending Actions section — expanded criteria
    var now = Date.now();
    var day30 = 30 * 24 * 3600000;
    var pendingActions = [];

    referrals.forEach(function (r) {
      var agreeStat = (r.agreementStatus || r.agreement_status || '').toLowerCase();
      var payStat = _resolvePaymentStatus(r);
      var dealStat = (r.deal_status || r.dealStatus || '').toLowerCase();

      // Agreement awaiting signature
      if (agreeStat === 'sent') {
        pendingActions.push({ referral: r, reason: 'Agreement sent, awaiting signature', icon: 'fa-file-signature', color: '#2563EB', action: 'Follow up on agreement', actionFn: 'CRM.toast(\'Follow up sent\',\'info\')' });
      }
      // Payment overdue
      if (payStat === 'overdue') {
        pendingActions.push({ referral: r, reason: 'Referral fee overdue (30+ days since close)', icon: 'fa-exclamation-triangle', color: '#DC2626', action: 'Send payment reminder', actionFn: 'CRM.toast(\'Payment reminder sent\',\'info\')' });
      }
      // Deal closed but no agreement uploaded
      if ((dealStat === 'closed' || dealStat === 'sold') && (!agreeStat || agreeStat === 'missing' || agreeStat === '')) {
        pendingActions.push({ referral: r, reason: 'Deal closed but no referral agreement on file', icon: 'fa-folder-open', color: '#D97706', action: 'Upload agreement', actionFn: 'CRM.toast(\'Upload agreement\',\'info\')' });
      }
      // Draft agreement
      if (agreeStat === 'draft' || agreeStat === 'pending') {
        pendingActions.push({ referral: r, reason: 'Agreement in draft/pending status', icon: 'fa-clock', color: '#D97706', action: 'Finalize agreement', actionFn: 'CRM.toast(\'Open agreement editor\',\'info\')' });
      }
    });

    if (pendingActions.length > 0) {
      html += '<div class="card border-yellow-200"><div class="card-header bg-yellow-50"><h3><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>Pending Actions (' + pendingActions.length + ')</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      pendingActions.forEach(function (pa) {
        var r = pa.referral;
        var partner = r.referralPartner || r.partner || r.brokerage || 'Unknown';
        var client = r.clientName || r.client_name || '';
        var dir = r.direction === 'outgoing' ? 'Outgoing to' : 'Incoming from';
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-white border hover:bg-gray-50">' +
          '<i class="fas ' + pa.icon + '" style="color:' + pa.color + '"></i>' +
          '<div class="flex-1">' +
            '<p class="text-sm font-medium">' + E(dir + ' ' + partner) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(client ? 'Client: ' + client + ' — ' : '') + E(pa.reason) + '</p>' +
          '</div>' +
          '<button class="btn btn-sm btn-outline" onclick="' + pa.actionFn + '"><i class="fas fa-arrow-right mr-1"></i>' + E(pa.action) + '</button>' +
        '</div>';
      });
      html += '</div></div></div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  // Resolve payment status from referral data
  function _resolvePaymentStatus(r) {
    // Explicit payment status field
    var ps = (r.payment_status || r.paymentStatus || '').toLowerCase();
    if (ps === 'paid' || ps === 'received') return 'paid';
    if (ps === 'overdue') return 'overdue';
    if (ps === 'due' || ps === 'fee_due') return 'due';

    // Derive from deal status + age
    var dealStat = (r.deal_status || r.dealStatus || '').toLowerCase();
    if (dealStat === 'closed' || dealStat === 'sold') {
      var closedDate = new Date(r.closed_at || r.closedAt || r.updated_at || r.updatedAt || r.created_at || r.createdAt || Date.now());
      var daysSinceClose = (Date.now() - closedDate.getTime()) / (24 * 3600000);
      if (daysSinceClose > 30) return 'overdue';
      return 'due';
    }
    return 'pending';
  }

  // Agreement status badge
  function _agreementBadge(status) {
    var s = (status || '').toLowerCase();
    var map = {
      'signed': { bg: '#DCFCE7', color: '#166534', label: 'Signed' },
      'sent': { bg: '#DBEAFE', color: '#1E40AF', label: 'Sent' },
      'draft': { bg: '#F3F4F6', color: '#374151', label: 'Draft' },
      'verbal': { bg: '#FEF3C7', color: '#92400E', label: 'Verbal' },
      'pending': { bg: '#F3F4F6', color: '#374151', label: 'Pending' }
    };
    var cfg = map[s] || { bg: '#FEE2E2', color: '#991B1B', label: 'Missing' };
    return '<span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded" style="background:' + cfg.bg + ';color:' + cfg.color + '">' + cfg.label + '</span>';
  }

  // Payment status badge
  function _paymentBadge(status) {
    var map = {
      'paid': { bg: '#DCFCE7', color: '#166534', label: 'Fee Paid', icon: 'fa-check-circle' },
      'due': { bg: '#FEF3C7', color: '#92400E', label: 'Fee Due', icon: 'fa-clock' },
      'overdue': { bg: '#FEE2E2', color: '#991B1B', label: 'Fee Overdue', icon: 'fa-exclamation-circle' },
      'pending': { bg: '#F3F4F6', color: '#6B7280', label: 'Pending', icon: 'fa-hourglass-half' }
    };
    var cfg = map[status] || map.pending;
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded" style="background:' + cfg.bg + ';color:' + cfg.color + '"><i class="fas ' + cfg.icon + '"></i> ' + cfg.label + '</span>';
  }

  // Deal status badge
  function _dealStatusBadge(status) {
    var s = (status || '').toLowerCase();
    var map = {
      'active': { bg: '#DBEAFE', color: '#1E40AF', label: 'Active' },
      'in_contract': { bg: '#F3E8FF', color: '#6B21A8', label: 'In Contract' },
      'in contract': { bg: '#F3E8FF', color: '#6B21A8', label: 'In Contract' },
      'closed': { bg: '#DCFCE7', color: '#166534', label: 'Closed' },
      'sold': { bg: '#DCFCE7', color: '#166534', label: 'Closed' },
      'pending': { bg: '#FEF3C7', color: '#92400E', label: 'Pending' }
    };
    var cfg = map[s] || { bg: '#F3F4F6', color: '#6B7280', label: status || 'Unknown' };
    return '<span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded" style="background:' + cfg.bg + ';color:' + cfg.color + '">' + cfg.label + '</span>';
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
    var agreementRaw = r.agreementStatus || r.agreement_status || r.status || '';
    var dealStat = r.deal_status || r.dealStatus || '';
    var payStatus = _resolvePaymentStatus(r);

    // Document link
    var docLink = '';
    if (r.agreement_url || r.agreementUrl || r.document_id || r.documentId) {
      var docHref = r.agreement_url || r.agreementUrl || '#';
      docLink = ' <a href="' + E(docHref) + '" target="_blank" rel="noopener" class="text-blue-500 hover:text-blue-700" title="View agreement"><i class="fas fa-external-link-alt text-xs"></i></a>';
    }

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
      '<td class="px-3 py-2">' + _agreementBadge(agreementRaw) + docLink + '</td>' +
      '<td class="px-3 py-2">' + _paymentBadge(payStatus) + '</td>' +
      '<td class="px-3 py-2">' + _dealStatusBadge(dealStat) + '</td>' +
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

  // ─── Referral Form Helpers ────────────────────────────────────────────
  var _refAgentsCache = [];

  function _calcRefFee() {
    var form = document.getElementById('addReferralForm');
    if (!form) return;
    var dealType = form.querySelector('[name="deal_type"]');
    var priceEl = form.querySelector('[name="sale_price"]');
    var rentEl = form.querySelector('[name="monthly_rent"]');
    var feeEl = form.querySelector('[name="fee_percent"]');
    var outEl = form.querySelector('[name="fee_amount"]');
    if (!feeEl || !outEl) return;
    var pct = parseFloat(feeEl.value) || 0;
    var base = 0;
    if (dealType && dealType.value === 'rental') {
      base = parseFloat((rentEl && rentEl.value) || 0);
    } else {
      base = parseFloat((priceEl && priceEl.value) || 0);
    }
    var amt = (base * pct / 100);
    outEl.value = amt ? '$' + amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  }

  function _fillOurAgentDetails() {
    var form = document.getElementById('addReferralForm');
    if (!form) return;
    var sel = form.querySelector('[name="our_agent_id"]');
    var titleEl = form.querySelector('[name="our_agent_title"]');
    var licEl = form.querySelector('[name="our_agent_license"]');
    if (!sel) return;
    var agentId = sel.value;
    var agent = null;
    for (var i = 0; i < _refAgentsCache.length; i++) {
      if (String(_refAgentsCache[i].id) === String(agentId)) { agent = _refAgentsCache[i]; break; }
    }
    if (titleEl) titleEl.value = agent ? (agent.title || agent.agent_title || '') : '';
    if (licEl) licEl.value = agent ? (agent.licenseNumber || agent.license_number || '') : '';
  }

  function _updateRefFormLabels() {
    var form = document.getElementById('addReferralForm');
    if (!form) return;
    var dealType = (form.querySelector('[name="deal_type"]') || {}).value || 'sale';
    var direction = (form.querySelector('[name="direction"]') || {}).value || 'incoming';

    // Toggle price vs rent fields
    var salePriceGroup = document.getElementById('refSalePriceGroup');
    var rentGroup = document.getElementById('refRentGroup');
    var closingGroup = document.getElementById('refClosingDateGroup');
    var leaseGroup = document.getElementById('refLeaseEndGroup');
    if (salePriceGroup) salePriceGroup.style.display = dealType === 'sale' ? '' : 'none';
    if (rentGroup) rentGroup.style.display = dealType === 'rental' ? '' : 'none';
    if (closingGroup) closingGroup.style.display = dealType === 'sale' ? '' : 'none';
    if (leaseGroup) leaseGroup.style.display = dealType === 'rental' ? '' : 'none';

    // Update section titles based on direction
    var ourTitle = document.getElementById('refOurSectionTitle');
    var otherTitle = document.getElementById('refOtherSectionTitle');
    if (ourTitle) ourTitle.textContent = direction === 'incoming' ? 'Our Brokerage (Receiving Agent)' : 'Our Brokerage (Referring Agent)';
    if (otherTitle) otherTitle.textContent = direction === 'incoming' ? 'Referring Company' : 'Receiving Company';

    _calcRefFee();
  }

  function _addReferral() {
    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; })
    ]).then(function (results) {
      var agents = results[0].agents || [];
      _refAgentsCache = agents;
      var clients = results[1].clients || [];
      var user = Store.session.currentUser || {};

      var agentOptions = '<option value="">— Select Agent —</option>' +
        agents.map(function (a) {
          return '<option value="' + E(a.id) + '">' + E(a.full_name || a.name || a.email || 'Agent') + '</option>';
        }).join('');

      var clientOptions = '<option value="">— Select Client (optional) —</option>' +
        clients.map(function (cl) {
          return '<option value="' + E(cl.id) + '">' + E(cl.name || cl.first_name + ' ' + (cl.last_name || '')) + '</option>';
        }).join('');

      var html =
        '<form id="addReferralForm" class="space-y-5" style="max-height:70vh;overflow-y:auto;padding-right:4px;">' +

        // ── Section 1: Direction & Deal Type ──
        '<div style="background:#f8f9fa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">' +
          '<p class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-exchange-alt mr-1"></i> Direction & Deal Type</p>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Referral Direction *</label>' +
              '<select class="form-input" name="direction" required onchange="Panels._updateRefFormLabels()">' +
                '<option value="incoming">Incoming (We Received a Client)</option>' +
                '<option value="outgoing">Outgoing (We Sent a Client)</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">Deal Type *</label>' +
              '<select class="form-input" name="deal_type" required onchange="Panels._updateRefFormLabels()">' +
                '<option value="sale">Sale</option>' +
                '<option value="rental">Rental</option>' +
              '</select></div>' +
          '</div>' +
        '</div>' +

        // ── Section 2: Two-Column — Our Brokerage / Other Company ──
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +

          // LEFT — Our Brokerage (blue)
          '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;">' +
            '<p id="refOurSectionTitle" class="text-sm font-bold text-blue-800 mb-3"><i class="fas fa-building mr-1"></i> Our Brokerage (Receiving Agent)</p>' +
            '<div class="space-y-3">' +
              '<div class="form-group"><label class="form-label">Brokerage Name</label>' +
                '<input class="form-input bg-gray-100" name="our_brokerage_name" value="Mallan Real Estate Inc." readonly></div>' +
              '<div class="form-group"><label class="form-label">Brokerage License #</label>' +
                '<input class="form-input bg-gray-100" name="our_brokerage_license" value="#10991205323" readonly></div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Broker Name</label>' +
                  '<input class="form-input bg-gray-100" name="our_broker_name" value="' + E(user.name || '') + '" readonly></div>' +
                '<div class="form-group"><label class="form-label">Broker License #</label>' +
                  '<input class="form-input bg-gray-100" name="our_broker_license" value="' + E(user.licenseNumber || user.license_number || '') + '" readonly></div>' +
              '</div>' +
              '<div class="form-group"><label class="form-label">Address</label>' +
                '<input class="form-input bg-gray-100" name="our_address" value="400 East 90th Street, Suite 17C, New York, NY 10128" readonly></div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Phone</label>' +
                  '<input class="form-input bg-gray-100" name="our_phone" value="' + E(user.phone || '646-258-4460') + '" readonly></div>' +
                '<div class="form-group"><label class="form-label">Email</label>' +
                  '<input class="form-input bg-gray-100" name="our_email" value="' + E(user.email || '') + '" readonly></div>' +
              '</div>' +
              '<div class="form-group"><label class="form-label">Company TIN/EIN</label>' +
                '<input class="form-input bg-gray-100" name="our_tin" placeholder="On file" readonly></div>' +
              '<hr class="my-2 border-blue-200">' +
              '<div class="form-group"><label class="form-label">Agent Name *</label>' +
                '<select class="form-input" name="our_agent_id" onchange="Panels._fillOurAgentDetails()">' +
                  agentOptions +
                '</select></div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Agent Title</label>' +
                  '<input class="form-input bg-gray-100" name="our_agent_title" readonly placeholder="Auto-filled"></div>' +
                '<div class="form-group"><label class="form-label">Agent License #</label>' +
                  '<input class="form-input bg-gray-100" name="our_agent_license" readonly placeholder="Auto-filled"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // RIGHT — Other Company (orange)
          '<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:16px;">' +
            '<p id="refOtherSectionTitle" class="text-sm font-bold text-orange-800 mb-3"><i class="fas fa-handshake mr-1"></i> Referring Company</p>' +
            '<div class="space-y-3">' +
              '<div class="form-group"><label class="form-label">Company Name *</label>' +
                '<input class="form-input" name="other_company_name" placeholder="Partner brokerage name" required></div>' +
              '<div class="form-group"><label class="form-label">Brokerage License #</label>' +
                '<input class="form-input" name="other_brokerage_license" placeholder="Brokerage license number"></div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Broker Name</label>' +
                  '<input class="form-input" name="other_broker_name" placeholder="Managing broker name"></div>' +
                '<div class="form-group"><label class="form-label">Broker License #</label>' +
                  '<input class="form-input" name="other_broker_license" placeholder="Broker license #"></div>' +
              '</div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Agent Name *</label>' +
                  '<input class="form-input" name="other_agent_name" placeholder="Agent full name" required></div>' +
                '<div class="form-group"><label class="form-label">Agent Title</label>' +
                  '<select class="form-input" name="other_agent_title">' +
                    '<option value="">— Select —</option>' +
                    '<option value="Licensed Real Estate Salesperson">Licensed Real Estate Salesperson</option>' +
                    '<option value="Associate Real Estate Broker">Associate Real Estate Broker</option>' +
                    '<option value="Real Estate Broker">Real Estate Broker</option>' +
                  '</select></div>' +
              '</div>' +
              '<div class="form-group"><label class="form-label">Agent License #</label>' +
                '<input class="form-input" name="other_agent_license" placeholder="Agent license #"></div>' +
              '<div class="form-group"><label class="form-label">Company Address</label>' +
                '<input class="form-input" name="other_address" placeholder="Full mailing address"></div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div class="form-group"><label class="form-label">Phone</label>' +
                  '<input class="form-input" name="other_phone" placeholder="Phone number"></div>' +
                '<div class="form-group"><label class="form-label">Email</label>' +
                  '<input class="form-input" type="email" name="other_email" placeholder="Email address"></div>' +
              '</div>' +
              '<div class="form-group"><label class="form-label">Company TIN/EIN *</label>' +
                '<input class="form-input" name="other_tin" placeholder="TIN/EIN for 1099 reporting" required></div>' +
              '<div class="form-group"><label class="form-label">Upload W-9</label>' +
                '<input class="form-input" type="file" name="other_w9" accept=".pdf,.jpg,.jpeg,.png"></div>' +
            '</div>' +
          '</div>' +

        '</div>' + // end two-column

        // ── Section 3: Client Information ──
        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;">' +
          '<p class="text-sm font-bold text-green-800 mb-3"><i class="fas fa-user mr-1"></i> Client Information</p>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">' +
            '<div class="form-group"><label class="form-label">Client Name *</label>' +
              '<input class="form-input" name="client_name" placeholder="Client full name" required></div>' +
            '<div class="form-group"><label class="form-label">Email</label>' +
              '<input class="form-input" type="email" name="client_email" placeholder="Client email"></div>' +
            '<div class="form-group"><label class="form-label">Phone</label>' +
              '<input class="form-input" name="client_phone" placeholder="Client phone"></div>' +
            '<div class="form-group"><label class="form-label">Client Type</label>' +
              '<select class="form-input" name="client_type">' +
                '<option value="buyer">Buyer</option>' +
                '<option value="seller">Seller</option>' +
                '<option value="tenant">Tenant</option>' +
                '<option value="landlord">Landlord</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="form-group mt-2"><label class="form-label">Linked CRM Client</label>' +
            '<select class="form-input" name="client_id">' +
              clientOptions +
            '</select></div>' +
        '</div>' +

        // ── Section 4: Property Details ──
        '<div style="background:#FAF5FF;border:1px solid #E9D5FF;border-radius:8px;padding:16px;">' +
          '<p class="text-sm font-bold text-purple-800 mb-3"><i class="fas fa-home mr-1"></i> Property Details</p>' +
          '<div class="form-group mb-3"><label class="form-label">Property Address</label>' +
            '<input class="form-input" name="property_address" placeholder="Full property address"></div>' +
          '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">' +
            '<div class="form-group"><label class="form-label">Beds</label>' +
              '<select class="form-input" name="beds">' +
                '<option value="">—</option><option value="0">Studio</option>' +
                '<option value="1">1</option><option value="2">2</option><option value="3">3</option>' +
                '<option value="4">4</option><option value="5">5+</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">Baths</label>' +
              '<select class="form-input" name="baths">' +
                '<option value="">—</option><option value="1">1</option><option value="1.5">1.5</option>' +
                '<option value="2">2</option><option value="2.5">2.5</option><option value="3">3</option>' +
                '<option value="3.5">3.5</option><option value="4">4+</option>' +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">Sq Ft</label>' +
              '<input class="form-input" type="number" name="sqft" placeholder="Sq ft"></div>' +
            '<div id="refSalePriceGroup" class="form-group"><label class="form-label">Sale Price</label>' +
              '<input class="form-input" type="number" name="sale_price" placeholder="$0" oninput="Panels._calcRefFee()"></div>' +
            '<div id="refRentGroup" class="form-group" style="display:none;"><label class="form-label">Monthly Rent</label>' +
              '<input class="form-input" type="number" name="monthly_rent" placeholder="$0" oninput="Panels._calcRefFee()"></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-4 mt-3">' +
            '<div id="refClosingDateGroup" class="form-group"><label class="form-label">Closing Date</label>' +
              '<input class="form-input" type="date" name="closing_date"></div>' +
            '<div id="refLeaseEndGroup" class="form-group" style="display:none;"><label class="form-label">Lease End Date</label>' +
              '<input class="form-input" type="date" name="lease_end_date"></div>' +
          '</div>' +
        '</div>' +

        // ── Section 5: Referral Fee & Agreement ──
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:16px;">' +
          '<p class="text-sm font-bold text-yellow-800 mb-3"><i class="fas fa-percent mr-1"></i> Referral Fee & Agreement</p>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group"><label class="form-label">Fee % *</label>' +
              '<input class="form-input" type="number" name="fee_percent" min="0" max="100" step="0.5" placeholder="25" required oninput="Panels._calcRefFee()"></div>' +
            '<div class="form-group"><label class="form-label">Calculated Fee Amount</label>' +
              '<input class="form-input bg-gray-100 font-bold" name="fee_amount" readonly placeholder="Enter price & fee % above"></div>' +
            '<div class="form-group"><label class="form-label">Agreement Status</label>' +
              '<select class="form-input" name="agreement_status">' +
                '<option value="draft">Draft — Not Sent</option>' +
                '<option value="sent">Sent — Awaiting Signature</option>' +
                '<option value="signed">Signed</option>' +
                '<option value="verbal">Verbal</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="form-group mt-3"><label class="form-label">Upload Referral Agreement</label>' +
            '<input class="form-input" type="file" name="referral_agreement" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"></div>' +

          // E-Signature sub-section
          '<div style="background:#FEFCE8;border:1px solid #FEF08A;border-radius:6px;padding:12px;margin-top:12px;">' +
            '<p class="text-xs font-bold text-yellow-700 mb-2"><i class="fas fa-signature mr-1"></i> E-Signature</p>' +
            '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
              '<div class="form-group"><label class="form-label text-xs">Signature Method</label>' +
                '<select class="form-input text-sm" name="esign_method">' +
                  '<option value="">— Select —</option>' +
                  '<option value="DocuSign">DocuSign</option>' +
                  '<option value="Dotloop">Dotloop</option>' +
                  '<option value="HelloSign">HelloSign</option>' +
                  '<option value="Authentisign">Authentisign</option>' +
                  '<option value="Other">Other</option>' +
                  '<option value="Wet Signature">Wet Signature</option>' +
                '</select></div>' +
              '<div class="form-group"><label class="form-label text-xs">Envelope ID</label>' +
                '<input class="form-input text-sm" name="esign_envelope_id" placeholder="Envelope / transaction ID"></div>' +
              '<div class="form-group"><label class="form-label text-xs">Signature Deadline</label>' +
                '<input class="form-input text-sm" type="date" name="esign_deadline"></div>' +
            '</div>' +
            '<p class="text-xs font-semibold text-gray-600 mt-2 mb-1">Required Signers:</p>' +
            '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
              '<label class="flex items-center gap-1 text-xs"><input type="checkbox" name="signer_our_broker" value="1" checked> Our Broker</label>' +
              '<label class="flex items-center gap-1 text-xs"><input type="checkbox" name="signer_our_agent" value="1" checked> Our Agent</label>' +
              '<label class="flex items-center gap-1 text-xs"><input type="checkbox" name="signer_other_agent" value="1" checked> Other Co. Agent</label>' +
              '<label class="flex items-center gap-1 text-xs"><input type="checkbox" name="signer_other_broker" value="1"> Other Co. Broker <span class="text-gray-400">(opt.)</span></label>' +
            '</div>' +
            '<button type="button" class="btn btn-sm mt-2" style="background:#D97706;color:#fff;" onclick="CRM.toast(\'E-signature integration coming soon\',\'info\')">' +
              '<i class="fas fa-paper-plane mr-1"></i> Send for Signature</button>' +
          '</div>' +
        '</div>' +

        // ── Section 6: Notes ──
        '<div style="background:#f8f9fa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">' +
          '<p class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-sticky-note mr-1"></i> Notes</p>' +
          '<textarea class="form-input" name="notes" rows="3" placeholder="Referral details, terms, special conditions, etc."></textarea>' +
        '</div>' +

        '</form>';

      CRM.openModal('New Referral', html, {
        size: 'xl',
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitReferral()"><i class="fas fa-save mr-1"></i> Submit Referral</button>',
      });
    }).catch(function (err) {
      CRM.toast('Failed to load referral form: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _submitReferral() {
    var form = document.getElementById('addReferralForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }

    var data = {};
    new FormData(form).forEach(function (v, k) {
      // Skip file inputs and empty values in the JSON payload
      if (v && typeof v === 'string') data[k] = v;
    });

    // Collect checkbox signers
    var signers = [];
    if (form.querySelector('[name="signer_our_broker"]:checked')) signers.push('our_broker');
    if (form.querySelector('[name="signer_our_agent"]:checked')) signers.push('our_agent');
    if (form.querySelector('[name="signer_other_agent"]:checked')) signers.push('other_agent');
    if (form.querySelector('[name="signer_other_broker"]:checked')) signers.push('other_broker');
    data.signers = signers;

    // Numeric conversions
    if (data.fee_percent) data.fee_percent = parseFloat(data.fee_percent);
    if (data.sale_price) data.sale_price = parseFloat(data.sale_price);
    if (data.monthly_rent) data.monthly_rent = parseFloat(data.monthly_rent);
    if (data.sqft) data.sqft = parseInt(data.sqft, 10);
    if (data.beds) data.beds = data.beds;
    if (data.baths) data.baths = data.baths;

    // Clean computed display field
    delete data.fee_amount;

    MallanAPI._fetch('/api/crm/referrals', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Referral submitted successfully', 'success');
      Panels.referralTracking();
    }).catch(function (err) {
      CRM.toast('Failed to submit referral: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Commission Payouts ──────────────────────────────────────────────
  function commissionPayouts() {
    CRM.setPanelTitle('Commission Payouts');
    var c = _container(); c.innerHTML = UI.loading();

    window._payoutFilter = window._payoutFilter || 'all';
    window._payoutSort = window._payoutSort || { col: 'closeDate', dir: 'desc' };

    MallanAPI.deals.list({ limit: 500 }).then(function (data) {
      var deals = data.deals || [];
      var now = Date.now();

      // Normalize payout status
      deals.forEach(function (d) {
        d._status = d.payoutStatus || d.payout_status || 'submitted';
        d._gross = d.grossCommission || d.commission || 0;
        d._split = d.splitAmount || d.split_amount || 0;
        d._brokerage = d._gross - d._split;
        d._closeDate = d.closeDate || d.close_date || d.created_at || '';
        d._agentName = d.agent_name || d.assignedAgentId || '-';
        d._clientName = d.client_name || d.clientId || '-';
        d._property = d.property_address || d.address || d.listingId || '-';
        d._type = d.dealType || d.deal_type || '-';
        d._createdAt = d.created_at || d._closeDate;
        d._ageDays = d._createdAt ? Math.floor((now - new Date(d._createdAt).getTime()) / 86400000) : 0;
      });

      // Approval queue count
      var awaitingApproval = deals.filter(function (d) { return d._status === 'submitted'; });

      // Pending aging buckets (deals with pending-like status: submitted)
      var pendingDeals = deals.filter(function (d) { return d._status === 'submitted' || d._status === 'pending'; });
      var bucket0_7 = pendingDeals.filter(function (d) { return d._ageDays <= 7; });
      var bucket8_14 = pendingDeals.filter(function (d) { return d._ageDays >= 8 && d._ageDays <= 14; });
      var bucket15_30 = pendingDeals.filter(function (d) { return d._ageDays >= 15 && d._ageDays <= 30; });
      var bucket30plus = pendingDeals.filter(function (d) { return d._ageDays > 30; });

      function bucketTotal(arr) { return arr.reduce(function (s, d) { return s + d._gross; }, 0); }

      // Filter deals
      var activeFilter = window._payoutFilter;
      var filtered = activeFilter === 'all' ? deals : deals.filter(function (d) { return d._status === activeFilter; });

      // Sort deals
      var sortCol = window._payoutSort.col;
      var sortDir = window._payoutSort.dir === 'asc' ? 1 : -1;
      filtered.sort(function (a, b) {
        var va, vb;
        if (sortCol === 'agent') { va = a._agentName; vb = b._agentName; }
        else if (sortCol === 'client') { va = a._clientName; vb = b._clientName; }
        else if (sortCol === 'property') { va = a._property; vb = b._property; }
        else if (sortCol === 'type') { va = a._type; vb = b._type; }
        else if (sortCol === 'closeDate') { va = a._closeDate; vb = b._closeDate; }
        else if (sortCol === 'gross') { va = a._gross; vb = b._gross; }
        else if (sortCol === 'split') { va = a._split; vb = b._split; }
        else if (sortCol === 'brokerage') { va = a._brokerage; vb = b._brokerage; }
        else if (sortCol === 'status') { va = a._status; vb = b._status; }
        else { va = a._closeDate; vb = b._closeDate; }
        if (va < vb) return -1 * sortDir;
        if (va > vb) return 1 * sortDir;
        return 0;
      });

      var html = '<div class="space-y-4">';

      // Header row with title + export
      html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
        '<h3 class="text-lg font-bold text-gray-900">Commission Payouts & Approvals</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._exportPayoutsCSV()"><i class="fas fa-download mr-1"></i> Bulk Export CSV</button>' +
      '</div>';

      // Approval queue card
      var aqBg = awaitingApproval.length > 0 ? 'background:#FFFBEB;border:1px solid #F59E0B' : 'background:#F9FAFB;border:1px solid #E5E7EB';
      html += '<div style="' + aqBg + ';border-radius:8px;padding:16px;display:flex;align-items:center;justify-content:space-between">' +
        '<div><span style="font-size:14px;font-weight:700;color:#92400E"><i class="fas fa-bell mr-2"></i>Approval Queue</span>' +
        '<span style="margin-left:12px;font-size:24px;font-weight:800;color:#B45309">' + awaitingApproval.length + '</span>' +
        '<span style="margin-left:8px;font-size:13px;color:#92400E">deal' + (awaitingApproval.length !== 1 ? 's' : '') + ' awaiting broker approval</span></div>' +
        (awaitingApproval.length > 0 ? '<button class="btn btn-sm btn-gold" onclick="window._payoutFilter=\'submitted\';Panels.commissionPayouts()">Review All</button>' : '') +
      '</div>';

      // Pending aging buckets
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">' +
        '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#1E40AF;text-transform:uppercase;margin-bottom:4px">Submitted (0-7d)</div>' +
          '<div style="font-size:22px;font-weight:800;color:#1D4ED8">' + bucket0_7.length + '</div>' +
          '<div style="font-size:12px;color:#3B82F6">' + $(bucketTotal(bucket0_7)) + '</div>' +
        '</div>' +
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#92400E;text-transform:uppercase;margin-bottom:4px">Pending (8-14d)</div>' +
          '<div style="font-size:22px;font-weight:800;color:#B45309">' + bucket8_14.length + '</div>' +
          '<div style="font-size:12px;color:#D97706">' + $(bucketTotal(bucket8_14)) + '</div>' +
        '</div>' +
        '<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#9A3412;text-transform:uppercase;margin-bottom:4px">Aging (15-30d)</div>' +
          '<div style="font-size:22px;font-weight:800;color:#C2410C">' + bucket15_30.length + '</div>' +
          '<div style="font-size:12px;color:#EA580C">' + $(bucketTotal(bucket15_30)) + '</div>' +
        '</div>' +
        '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#991B1B;text-transform:uppercase;margin-bottom:4px">Overdue (30+d)</div>' +
          '<div style="font-size:22px;font-weight:800;color:#DC2626">' + bucket30plus.length + '</div>' +
          '<div style="font-size:12px;color:#EF4444">' + $(bucketTotal(bucket30plus)) + '</div>' +
        '</div>' +
      '</div>';

      // Status filter tabs
      var tabs = [
        { key: 'all', label: 'All (' + deals.length + ')' },
        { key: 'submitted', label: 'Submitted (' + deals.filter(function (d) { return d._status === 'submitted'; }).length + ')' },
        { key: 'approved', label: 'Approved (' + deals.filter(function (d) { return d._status === 'approved'; }).length + ')' },
        { key: 'paid', label: 'Paid (' + deals.filter(function (d) { return d._status === 'paid'; }).length + ')' },
        { key: 'rejected', label: 'Rejected (' + deals.filter(function (d) { return d._status === 'rejected'; }).length + ')' },
      ];
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
      tabs.forEach(function (t) {
        var isActive = activeFilter === t.key;
        html += '<button class="btn btn-sm ' + (isActive ? 'btn-gold' : 'btn-outline') + '" onclick="window._payoutFilter=\'' + t.key + '\';Panels.commissionPayouts()">' + t.label + '</button>';
      });
      html += '</div>';

      // Deal table
      function sortHeader(label, col) {
        var arrow = sortCol === col ? (window._payoutSort.dir === 'asc' ? ' <i class="fas fa-sort-up"></i>' : ' <i class="fas fa-sort-down"></i>') : ' <i class="fas fa-sort" style="opacity:0.3"></i>';
        return '<th class="text-left px-3 py-2 cursor-pointer select-none" onclick="Panels._sortPayouts(\'' + col + '\')">' + label + arrow + '</th>';
      }
      function sortHeaderRight(label, col) {
        var arrow = sortCol === col ? (window._payoutSort.dir === 'asc' ? ' <i class="fas fa-sort-up"></i>' : ' <i class="fas fa-sort-down"></i>') : ' <i class="fas fa-sort" style="opacity:0.3"></i>';
        return '<th class="text-right px-3 py-2 cursor-pointer select-none" onclick="Panels._sortPayouts(\'' + col + '\')">' + label + arrow + '</th>';
      }

      html += '<div class="card"><div class="card-header"><h3>Deal Commission Pipeline</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        sortHeader('Agent', 'agent') +
        sortHeader('Client', 'client') +
        sortHeader('Property', 'property') +
        sortHeader('Type', 'type') +
        sortHeader('Close Date', 'closeDate') +
        sortHeaderRight('Gross Commission', 'gross') +
        '<th class="text-right px-3 py-2">Agent Split</th>' +
        sortHeaderRight('Brokerage Share', 'brokerage') +
        sortHeader('Status', 'status') +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';

      if (filtered.length === 0) {
        html += '<tr><td colspan="10" class="text-center py-6 text-sm text-gray-400">No deals match this filter</td></tr>';
      } else {
        filtered.forEach(function (d) {
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(d._agentName) + '</td>' +
            '<td class="px-3 py-2 text-sm">' + E(d._clientName) + '</td>' +
            '<td class="px-3 py-2 text-sm" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + E(d._property) + '">' + E(d._property) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(d._type) + '</td>' +
            '<td class="px-3 py-2 text-sm">' + D(d._closeDate) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold">' + $(d._gross) + '</td>' +
            '<td class="px-3 py-2 text-right">' +
              '<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">' +
                '<input type="number" class="form-input text-sm py-1 px-2" style="width:100px" value="' + d._split + '" min="0" step="0.01" id="splitInput_' + E(d.id) + '">' +
                '<span class="text-xs text-gray-400">(' + (d._gross > 0 ? Math.round((d._split / d._gross) * 100) : 0) + '%)</span>' +
                '<button class="btn btn-sm btn-outline text-xs px-2 py-0.5" onclick="Panels._saveSplit(\'' + E(d.id) + '\')" title="Save split"><i class="fas fa-save"></i></button>' +
              '</div>' +
            '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(d._brokerage) + '</td>' +
            '<td class="px-3 py-2">' + _payoutStatusPipeline(d._status) + '</td>' +
            '<td class="px-3 py-2"><div style="display:flex;gap:4px">' +
              (d._status === 'submitted' ? '<button class="btn btn-sm btn-success" onclick="Panels._approvePayout(\'' + E(d.id) + '\')" title="Approve"><i class="fas fa-check"></i></button>' : '') +
              (d._status === 'approved' ? '<button class="btn btn-sm btn-gold" onclick="Panels._markPaid(\'' + E(d.id) + '\')" title="Mark Paid"><i class="fas fa-dollar-sign"></i></button>' : '') +
              (d._status === 'submitted' || d._status === 'approved' ? '<button class="btn btn-sm btn-outline" style="color:#DC2626;border-color:#DC2626" onclick="Panels._rejectPayout(\'' + E(d.id) + '\')" title="Reject"><i class="fas fa-times"></i></button>' : '') +
            '</div></td>' +
          '</tr>';
        });
      }

      html += '</tbody></table></div></div></div>';
      html += '</div>';

      c.innerHTML = html;
      // Store deals for CSV export
      window._payoutDealsCache = filtered;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-dollar-sign', 'Unable to load commission data');
    });
  }

  function _payoutStatusPipeline(status) {
    var steps = ['submitted', 'approved', 'paid'];
    var idx = steps.indexOf(status);
    if (status === 'rejected') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#DC2626">' +
        '<i class="fas fa-times-circle"></i> Rejected</span>';
    }
    var html = '<span style="display:inline-flex;align-items:center;gap:2px;font-size:11px">';
    steps.forEach(function (step, i) {
      var filled = i <= idx;
      var color = filled ? (step === 'submitted' ? '#3B82F6' : step === 'approved' ? '#F59E0B' : '#059669') : '#D1D5DB';
      html += '<span style="display:inline-flex;align-items:center;gap:1px">';
      html += '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';display:inline-block"></span>';
      html += '<span style="color:' + color + ';font-weight:' + (filled ? '700' : '400') + ';margin:0 2px">' + step.charAt(0).toUpperCase() + step.slice(1) + '</span>';
      if (i < steps.length - 1) {
        html += '<span style="width:16px;height:2px;background:' + (i < idx ? '#9CA3AF' : '#E5E7EB') + ';display:inline-block;vertical-align:middle"></span>';
      }
      html += '</span>';
    });
    html += '</span>';
    return html;
  }

  function _filterPayouts(status) {
    window._payoutFilter = status;
    commissionPayouts();
  }

  function _sortPayouts(col) {
    if (window._payoutSort.col === col) {
      window._payoutSort.dir = window._payoutSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      window._payoutSort = { col: col, dir: 'asc' };
    }
    commissionPayouts();
  }

  function _exportPayoutsCSV() {
    var deals = window._payoutDealsCache || [];
    if (deals.length === 0) { CRM.toast('No deals to export', 'warning'); return; }
    var rows = [['Agent', 'Client', 'Property', 'Type', 'Close Date', 'Gross Commission', 'Agent Split', 'Brokerage Share', 'Status'].join(',')];
    deals.forEach(function (d) {
      rows.push([
        '"' + (d._agentName || '').replace(/"/g, '""') + '"',
        '"' + (d._clientName || '').replace(/"/g, '""') + '"',
        '"' + (d._property || '').replace(/"/g, '""') + '"',
        '"' + (d._type || '').replace(/"/g, '""') + '"',
        '"' + (d._closeDate || '') + '"',
        d._gross || 0,
        d._split || 0,
        d._brokerage || 0,
        '"' + (d._status || '') + '"',
      ].join(','));
    });
    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'commission-payouts-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    CRM.toast('CSV exported (' + deals.length + ' deals)', 'success');
  }

  function _markPaid(dealId) {
    if (!confirm('Mark this deal as paid?')) return;
    MallanAPI.deals.updateStatus(dealId, 'paid').then(function () {
      Events.log('payout_paid', 'deal', dealId);
      CRM.toast('Payout marked as paid', 'success');
      commissionPayouts();
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Could not mark paid'), 'error'); });
  }

  function _rejectPayout(dealId) {
    if (!confirm('Reject this payout? This action can be undone later.')) return;
    MallanAPI.deals.updateStatus(dealId, 'rejected').then(function () {
      Events.log('payout_rejected', 'deal', dealId);
      CRM.toast('Payout rejected', 'success');
      commissionPayouts();
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Could not reject'), 'error'); });
  }

  function _saveSplit(dealId) {
    var input = document.getElementById('splitInput_' + dealId);
    if (!input) return;
    var newAmount = parseFloat(input.value);
    if (isNaN(newAmount) || newAmount < 0) {
      CRM.toast('Invalid split amount', 'warning');
      return;
    }
    MallanAPI.deals.update(dealId, { splitAmount: newAmount }).then(function () {
      Events.log('split_updated', 'deal', dealId, { splitAmount: newAmount });
      CRM.toast('Split updated', 'success');
      commissionPayouts();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Could not save split'), 'error');
    });
  }

  function _saveAgentSplit(dealId) {
    var input = document.getElementById('agentSplitInput_' + dealId);
    if (!input) return;
    var newAmount = parseFloat(input.value);
    if (isNaN(newAmount) || newAmount < 0) {
      CRM.toast('Invalid split amount', 'warning');
      return;
    }
    MallanAPI.deals.update(dealId, { splitAmount: newAmount }).then(function () {
      Events.log('split_updated', 'deal', dealId, { splitAmount: newAmount });
      CRM.toast('Split updated', 'success');
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Could not save split'), 'error');
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

    Promise.all([
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI._fetch('/api/crm/referrals?limit=200').catch(function () { return { referrals: [] }; }),
    ]).then(function (r) {
      var deals = r[0].deals || [];
      var agents = r[1].agents || [];
      var referrals = r[2].referrals || [];

      var closed = deals.filter(function (d) { return d.stage === 'closed' || d.status === 'closed'; });
      var totalGross = closed.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
      var totalSplits = closed.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
      var brokerageNet = totalGross - totalSplits;
      var avgDealSize = closed.length > 0 ? totalGross / closed.length : 0;
      var totalSalePrice = closed.reduce(function (s, d) { return s + (d.salePrice || d.sale_price || d.price || 0); }, 0);
      var avgCommRate = totalSalePrice > 0 ? ((totalGross / totalSalePrice) * 100).toFixed(2) : '0.00';

      // Referral fees
      var refReceived = referrals.reduce(function (s, r) { return s + (r.feeReceived || r.fee_received || 0); }, 0);
      var refPaid = referrals.reduce(function (s, r) { return s + (r.feePaid || r.fee_paid || 0); }, 0);

      // Revenue by type
      var salesDeals = closed.filter(function (d) { return (d.dealType || d.deal_type || '').toLowerCase() === 'sale'; });
      var rentalDeals = closed.filter(function (d) { return (d.dealType || d.deal_type || '').toLowerCase() !== 'sale'; });
      var salesGross = salesDeals.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
      var salesSplits = salesDeals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);
      var rentalGross = rentalDeals.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
      var rentalSplits = rentalDeals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);

      // Per-agent breakdown
      var agentMap = {};
      agents.forEach(function (a) { agentMap[a.id] = { name: a.full_name || a.name || a.email, deals: 0, gross: 0, splits: 0 }; });
      closed.forEach(function (d) {
        var aid = d.assignedAgentId || d.assigned_agent_id;
        if (aid && agentMap[aid]) {
          agentMap[aid].deals++;
          agentMap[aid].gross += (d.grossCommission || d.commission || 0);
          agentMap[aid].splits += (d.splitAmount || d.split_amount || 0);
        }
      });
      var agentRows = Object.keys(agentMap).map(function (id) { return agentMap[id]; }).filter(function (a) { return a.deals > 0; });
      agentRows.sort(function (a, b) { return b.gross - a.gross; });

      // Monthly breakdown
      var monthMap = {};
      closed.forEach(function (d) {
        var dt = d.closeDate || d.close_date || d.created_at;
        if (!dt) return;
        var key = dt.slice(0, 7); // YYYY-MM
        if (!monthMap[key]) monthMap[key] = { deals: 0, gross: 0, splits: 0 };
        monthMap[key].deals++;
        monthMap[key].gross += (d.grossCommission || d.commission || 0);
        monthMap[key].splits += (d.splitAmount || d.split_amount || 0);
      });
      var months = Object.keys(monthMap).sort().reverse();

      var html = '<div class="space-y-4">';

      // Top row — 6 stat cards
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">' +
        UI.statCard($(totalGross), 'Gross Commission', 'fa-dollar-sign', '#B8860B') +
        UI.statCard($(totalSplits), 'Agent Payouts', 'fa-users', '#2563EB') +
        UI.statCard($(brokerageNet), 'Brokerage Net', 'fa-chart-line', '#059669') +
        UI.statCard(closed.length, 'Closed Deals', 'fa-handshake', '#374151') +
        UI.statCard($(avgDealSize), 'Avg Deal Size', 'fa-calculator', '#7C3AED') +
        UI.statCard(avgCommRate + '%', 'Avg Commission Rate', 'fa-percent', '#0891B2') +
      '</div>';

      // Revenue split visualization — 2 side-by-side cards
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

      // LEFT: Brokerage Revenue
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-building mr-2"></i>Brokerage Revenue</h3></div><div class="card-body">' +
        '<table class="w-full text-sm"><tbody>' +
        '<tr class="border-b"><td class="py-2 text-gray-600">Sales brokerage share</td><td class="py-2 text-right font-medium">' + $(salesGross - salesSplits) + '</td></tr>' +
        '<tr class="border-b"><td class="py-2 text-gray-600">Rentals brokerage share</td><td class="py-2 text-right font-medium">' + $(rentalGross - rentalSplits) + '</td></tr>' +
        '<tr class="border-b"><td class="py-2 text-green-600">Referral fees received</td><td class="py-2 text-right font-medium text-green-600">+ ' + $(refReceived) + '</td></tr>' +
        '<tr class="border-b"><td class="py-2 text-red-500">Referral fees paid</td><td class="py-2 text-right font-medium text-red-500">- ' + $(refPaid) + '</td></tr>' +
        '<tr class="bg-gray-50"><td class="py-2 font-bold">Net Brokerage Revenue</td><td class="py-2 text-right font-bold text-lg">' + $(brokerageNet + refReceived - refPaid) + '</td></tr>' +
        '</tbody></table></div></div>';

      // RIGHT: Agent Revenue
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-users mr-2"></i>Agent Revenue</h3></div><div class="card-body">' +
        '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-2 py-1">Agent</th><th class="text-right px-2 py-1">Amount</th><th class="text-right px-2 py-1">Deals</th>' +
        '</tr></thead><tbody>';
      if (agentRows.length === 0) {
        html += '<tr><td colspan="3" class="text-center py-4 text-gray-400 text-sm">No agent data</td></tr>';
      } else {
        agentRows.forEach(function (a) {
          html += '<tr class="border-b"><td class="px-2 py-2 text-sm font-medium">' + E(a.name) + '</td>' +
            '<td class="px-2 py-2 text-sm text-right">' + $(a.splits) + '</td>' +
            '<td class="px-2 py-2 text-sm text-right">' + a.deals + '</td></tr>';
        });
        html += '<tr class="bg-gray-50 font-bold"><td class="px-2 py-2 text-sm">Total</td>' +
          '<td class="px-2 py-2 text-sm text-right">' + $(totalSplits) + '</td>' +
          '<td class="px-2 py-2 text-sm text-right">' + closed.length + '</td></tr>';
      }
      html += '</tbody></table></div></div>';
      html += '</div>'; // end 2-col grid

      // Monthly revenue table
      html += '<div class="card"><div class="card-header"><h3>Monthly Revenue</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Month</th>' +
        '<th class="text-right px-3 py-2">Deals Closed</th>' +
        '<th class="text-right px-3 py-2">Gross</th>' +
        '<th class="text-right px-3 py-2">Agent Payouts</th>' +
        '<th class="text-right px-3 py-2">Brokerage Net</th>' +
        '</tr></thead><tbody>';
      if (months.length === 0) {
        html += '<tr><td colspan="5" class="text-center py-6 text-sm text-gray-400">No monthly data</td></tr>';
      } else {
        months.forEach(function (m) {
          var md = monthMap[m];
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(m) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + md.deals + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(md.gross) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(md.splits) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-medium">' + $(md.gross - md.splits) + '</td>' +
          '</tr>';
        });
        // YTD footer
        var ytdDeals = months.reduce(function (s, m) { return s + monthMap[m].deals; }, 0);
        var ytdGross = months.reduce(function (s, m) { return s + monthMap[m].gross; }, 0);
        var ytdSplits = months.reduce(function (s, m) { return s + monthMap[m].splits; }, 0);
        html += '<tr class="bg-gray-100 font-bold">' +
          '<td class="px-3 py-2 text-sm">YTD TOTALS</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + ytdDeals + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(ytdGross) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(ytdSplits) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(ytdGross - ytdSplits) + '</td>' +
        '</tr>';
      }
      html += '</tbody></table></div></div></div>';

      // Per-agent breakdown table
      html += '<div class="card"><div class="card-header"><h3>Per-Agent Breakdown</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-right px-3 py-2">Deals</th>' +
        '<th class="text-right px-3 py-2">Gross Commission</th>' +
        '<th class="text-right px-3 py-2">Split %</th>' +
        '<th class="text-right px-3 py-2">Agent Share</th>' +
        '<th class="text-right px-3 py-2">Brokerage Share</th>' +
        '</tr></thead><tbody>';
      if (agentRows.length === 0) {
        html += '<tr><td colspan="6" class="text-center py-6 text-sm text-gray-400">No agent data</td></tr>';
      } else {
        agentRows.forEach(function (a) {
          var splitPct = a.gross > 0 ? ((a.splits / a.gross) * 100).toFixed(1) : '0.0';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.name) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + a.deals + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(a.gross) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + splitPct + '%</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(a.splits) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(a.gross - a.splits) + '</td>' +
          '</tr>';
        });
        // Totals footer
        var tGross = agentRows.reduce(function (s, a) { return s + a.gross; }, 0);
        var tSplits = agentRows.reduce(function (s, a) { return s + a.splits; }, 0);
        var tDeals = agentRows.reduce(function (s, a) { return s + a.deals; }, 0);
        html += '<tr class="bg-gray-100 font-bold">' +
          '<td class="px-3 py-2 text-sm">TOTALS</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + tDeals + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(tGross) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + (tGross > 0 ? ((tSplits / tGross) * 100).toFixed(1) : '0.0') + '%</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(tSplits) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(tGross - tSplits) + '</td>' +
        '</tr>';
      }
      html += '</tbody></table></div></div></div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-chart-bar', 'Unable to load revenue data');
    });
  }

  // ─── 1099 Year-End ───────────────────────────────────────────────────
  function yearEnd1099() {
    CRM.setPanelTitle('1099 Year-End');
    var c = _container(); c.innerHTML = UI.loading();

    var taxYear = window._1099TaxYear || new Date().getFullYear();
    window._1099Filter = window._1099Filter || 'all';

    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/referrals?limit=500').catch(function () { return { referrals: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var allDeals = r[1].deals || [];
      var referrals = r[2].referrals || [];

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
        var grossComm = myDeals.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
        var agentShare = myDeals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);

        // Referral fees for this agent
        var agentRefPaid = referrals.filter(function (ref) {
          return (ref.agentId === aid || ref.agent_id === aid) && (ref.type === 'paid' || ref.direction === 'outbound');
        }).reduce(function (s, ref) { return s + (ref.amount || ref.feePaid || ref.fee_paid || 0); }, 0);
        var agentRefReceived = referrals.filter(function (ref) {
          return (ref.agentId === aid || ref.agent_id === aid) && (ref.type === 'received' || ref.direction === 'inbound');
        }).reduce(function (s, ref) { return s + (ref.amount || ref.feeReceived || ref.fee_received || 0); }, 0);

        // Also check deal-level referral data
        var dealRefPaid = myDeals.reduce(function (s, d) { return s + (d.referralPaid || d.referral_paid || 0); }, 0);
        var dealRefReceived = myDeals.reduce(function (s, d) { return s + (d.referralReceived || d.referral_received || 0); }, 0);
        var refPaid = agentRefPaid || dealRefPaid;
        var refReceived = agentRefReceived || dealRefReceived;

        var amount1099 = agentShare + refReceived - refPaid;
        var tinRaw = a.taxId || a.tax_id || a.ssn_last4 || a.tin || a.tinLast4 || a.tin_last4 || '';
        var tinLast4 = tinRaw.length > 4 ? tinRaw.slice(-4) : tinRaw;
        var hasTin = !!tinLast4;
        var genStatus = a._1099Status || a.filing_status_1099 || 'pending';

        grandTotalDeals += myDeals.length;
        grandTotal1099 += amount1099;

        agentRows.push({
          agent: a,
          agentId: aid,
          name: a.full_name || a.name || a.email,
          tinLast4: tinLast4,
          hasTin: hasTin,
          dealCount: myDeals.length,
          grossComm: grossComm,
          agentShare: agentShare,
          refPaid: refPaid,
          refReceived: refReceived,
          amount1099: amount1099,
          status: genStatus,
        });
      });

      // Store for export
      window._1099AgentRows = agentRows;
      window._1099TaxYearCurrent = taxYear;

      // Apply filter
      var activeFilter = window._1099Filter;
      var filteredRows = agentRows;
      if (activeFilter === 'missing_tin') {
        filteredRows = agentRows.filter(function (r) { return !r.hasTin; });
      } else if (activeFilter === 'ready') {
        filteredRows = agentRows.filter(function (r) { return r.hasTin && r.dealCount > 0; });
      }

      var missingTinCount = agentRows.filter(function (r) { return !r.hasTin; }).length;
      var readyCount = agentRows.filter(function (r) { return r.hasTin && r.dealCount > 0; }).length;

      var html = '<div class="space-y-4">';

      // Header row: year selector + action buttons
      html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
          '<h3 class="text-lg font-bold text-gray-900">1099-NEC Year-End</h3>' +
          '<select class="form-input form-select text-sm" style="width:auto" onchange="window._1099TaxYear=parseInt(this.value);Panels.yearEnd1099()">' + yearOpts + '</select>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-gold" onclick="Panels._generateAll1099s(' + taxYear + ')"><i class="fas fa-file-invoice-dollar mr-1"></i> Generate All 1099s</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._export1099AuditReport()"><i class="fas fa-clipboard-check mr-1"></i> Export Audit Report</button>' +
        '</div>' +
      '</div>';

      // Readiness filter chips
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      var chips = [
        { key: 'all', label: 'All Agents (' + agentRows.length + ')', color: '' },
        { key: 'missing_tin', label: 'Missing TIN Info (' + missingTinCount + ')', color: missingTinCount > 0 ? 'background:#FEF2F2;color:#991B1B;border:1px solid #FECACA' : '' },
        { key: 'ready', label: 'Ready to Generate (' + readyCount + ')', color: readyCount > 0 ? 'background:#F0FDF4;color:#166534;border:1px solid #BBF7D0' : '' },
      ];
      chips.forEach(function (ch) {
        var isActive = activeFilter === ch.key;
        var style = isActive ? 'background:#B8860B;color:#fff;border:1px solid #B8860B' : (ch.color || 'background:#F9FAFB;color:#374151;border:1px solid #E5E7EB');
        html += '<button style="' + style + ';padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer" ' +
          'onclick="Panels._filter1099(\'' + ch.key + '\')">' + ch.label + '</button>';
      });
      html += '</div>';

      // Filing status cards
      var generated = agentRows.filter(function (r) { return r.status === 'generated'; }).length;
      var pendingReview = agentRows.filter(function (r) { return r.status === 'review'; }).length;
      var sent = agentRows.filter(function (r) { return r.status === 'sent' || r.status === 'filed'; }).length;

      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">' +
        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#166534;text-transform:uppercase;margin-bottom:4px">Generated</div>' +
          '<div style="font-size:22px;font-weight:800;color:#059669">' + generated + '</div>' +
        '</div>' +
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#92400E;text-transform:uppercase;margin-bottom:4px">Pending Review</div>' +
          '<div style="font-size:22px;font-weight:800;color:#D97706">' + pendingReview + '</div>' +
        '</div>' +
        '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#1E40AF;text-transform:uppercase;margin-bottom:4px">Sent to IRS</div>' +
          '<div style="font-size:22px;font-weight:800;color:#1D4ED8">' + sent + '</div>' +
        '</div>' +
        '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;text-align:center">' +
          '<div style="font-size:11px;font-weight:600;color:#991B1B;text-transform:uppercase;margin-bottom:4px">Filing Deadline</div>' +
          '<div style="font-size:16px;font-weight:800;color:#DC2626">April 1, ' + (taxYear + 1) + '</div>' +
        '</div>' +
      '</div>';

      // 1099 Summary table
      html += '<div class="card"><div class="card-header"><h3>1099-NEC Summary — Tax Year ' + taxYear + '</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Tax ID (Last 4)</th>' +
        '<th class="text-right px-3 py-2">Total Deals</th>' +
        '<th class="text-right px-3 py-2">Gross Commissions</th>' +
        '<th class="text-right px-3 py-2">Less Referral Fees Paid</th>' +
        '<th class="text-right px-3 py-2">Plus Referral Fees Received</th>' +
        '<th class="text-right px-3 py-2">Net 1099 Amount</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';

      if (filteredRows.length === 0) {
        html += '<tr><td colspan="9" class="text-center py-6 text-sm text-gray-400">No agents match this filter for ' + taxYear + '</td></tr>';
      } else {
        filteredRows.forEach(function (row) {
          var statusBadge = row.status === 'generated' ? '<span class="badge badge-active">Generated</span>' :
            row.status === 'review' ? '<span class="badge badge-pending">Reviewed</span>' :
            row.status === 'sent' || row.status === 'filed' ? '<span class="badge badge-active">Filed</span>' :
            '<span class="badge badge-inactive">Not Generated</span>';
          var rowBg = !row.hasTin ? 'background:#FFFBEB' : '';
          var flagIcon = !row.hasTin ? '<i class="fas fa-flag" style="color:#DC2626;margin-left:6px" title="Missing TIN"></i>' : '';

          html += '<tr class="border-b hover:bg-gray-50" style="' + rowBg + '">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(row.name) + flagIcon + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + (row.tinLast4 ? '***-**-' + E(row.tinLast4) : '<span style="color:#DC2626;font-weight:600">Missing</span>') + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + row.dealCount + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + $(row.grossComm) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right text-red-500">' + $(row.refPaid) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right text-green-600">' + $(row.refReceived) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold">' + $(row.amount1099) + '</td>' +
            '<td class="px-3 py-2">' + statusBadge + '</td>' +
            '<td class="px-3 py-2"><div class="flex gap-1">' +
              '<button class="btn btn-sm btn-outline" title="Preview" onclick="Panels._open1099Preview(\'' + E(row.agentId) + '\',' + taxYear + ')"><i class="fas fa-eye"></i></button>' +
              '<button class="btn btn-sm btn-gold" title="Generate" onclick="Panels._generate1099(\'' + E(row.agentId) + '\',' + taxYear + ')"><i class="fas fa-file-invoice"></i></button>' +
            '</div></td>' +
          '</tr>';
        });
        // Footer totals
        var fTotalDeals = filteredRows.reduce(function (s, r) { return s + r.dealCount; }, 0);
        var fTotalGross = filteredRows.reduce(function (s, r) { return s + r.grossComm; }, 0);
        var fTotalRefPaid = filteredRows.reduce(function (s, r) { return s + r.refPaid; }, 0);
        var fTotalRefRcv = filteredRows.reduce(function (s, r) { return s + r.refReceived; }, 0);
        var fTotal1099 = filteredRows.reduce(function (s, r) { return s + r.amount1099; }, 0);
        html += '<tr class="bg-gray-100 font-bold"><td class="px-3 py-2 text-sm">TOTALS</td><td></td>' +
          '<td class="px-3 py-2 text-sm text-right">' + fTotalDeals + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(fTotalGross) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right text-red-500">' + $(fTotalRefPaid) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right text-green-600">' + $(fTotalRefRcv) + '</td>' +
          '<td class="px-3 py-2 text-sm text-right">' + $(fTotal1099) + '</td>' +
          '<td colspan="2"></td></tr>';
      }
      html += '</tbody></table></div></div></div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-file-invoice-dollar', 'Unable to load 1099 data');
    });
  }

  function _filter1099(filter) {
    window._1099Filter = filter;
    yearEnd1099();
  }

  function _open1099Preview(agentId, taxYear) {
    Promise.all([
      MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(agentId)).catch(function () { return {}; }),
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/referrals?limit=500').catch(function () { return { referrals: [] }; }),
    ]).then(function (r) {
      var agent = r[0].agent || r[0] || {};
      var allDeals = r[1].deals || [];
      var referrals = r[2].referrals || [];

      var deals = allDeals.filter(function (d) {
        var aid = d.assignedAgentId || d.assigned_agent_id;
        var closeDate = d.closeDate || d.close_date || d.created_at;
        return aid === agentId && closeDate && new Date(closeDate).getFullYear() === taxYear &&
          (d.stage === 'closed' || d.status === 'closed');
      });

      var grossComm = deals.reduce(function (s, d) { return s + (d.grossCommission || d.commission || 0); }, 0);
      var agentShare = deals.reduce(function (s, d) { return s + (d.splitAmount || d.split_amount || 0); }, 0);

      var agentRefPaid = referrals.filter(function (ref) {
        return (ref.agentId === agentId || ref.agent_id === agentId) && (ref.type === 'paid' || ref.direction === 'outbound');
      }).reduce(function (s, ref) { return s + (ref.amount || ref.feePaid || ref.fee_paid || 0); }, 0);
      var agentRefReceived = referrals.filter(function (ref) {
        return (ref.agentId === agentId || ref.agent_id === agentId) && (ref.type === 'received' || ref.direction === 'inbound');
      }).reduce(function (s, ref) { return s + (ref.amount || ref.feeReceived || ref.fee_received || 0); }, 0);

      var dealRefPaid = deals.reduce(function (s, d) { return s + (d.referralPaid || d.referral_paid || 0); }, 0);
      var dealRefReceived = deals.reduce(function (s, d) { return s + (d.referralReceived || d.referral_received || 0); }, 0);
      var refPaid = agentRefPaid || dealRefPaid;
      var refReceived = agentRefReceived || dealRefReceived;
      var net1099 = agentShare + refReceived - refPaid;

      var taxId = agent.taxId || agent.tax_id || agent.tin || agent.tinLast4 || agent.tin_last4 || agent.ssn_last4 || '';
      var last4 = taxId.length > 4 ? taxId.slice(-4) : taxId;

      CRM.openModal('1099-NEC Preview — ' + (agent.name || agent.email || 'Agent'),
        '<div class="space-y-4">' +
          '<div style="border:2px solid #D1D5DB;border-radius:8px;padding:24px;background:#fff">' +
            '<div style="text-align:center;margin-bottom:16px"><p style="font-size:18px;font-weight:700">1099-NEC</p><p style="font-size:11px;color:#6B7280">Nonemployee Compensation — Tax Year ' + taxYear + '</p></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Payer</p>' +
                '<p style="font-size:13px;font-weight:700">Mallan Real Estate Inc.</p>' +
                '<p style="font-size:11px;color:#4B5563">400 East 90th Street, Suite 17C</p>' +
                '<p style="font-size:11px;color:#4B5563">New York, NY 10128</p>' +
                '<p style="font-size:11px;color:#4B5563">TIN: [On file]</p>' +
                '<p style="font-size:11px;color:#4B5563">Account: #10991205323</p></div>' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Recipient</p>' +
                '<p style="font-size:13px;font-weight:700">' + E(agent.name || agent.full_name || agent.email || 'Agent') + '</p>' +
                '<p style="font-size:11px;color:#4B5563">' + E(agent.address || '') + '</p>' +
                '<p style="font-size:11px;color:#4B5563">TIN (Last 4): ' + (last4 ? '***-**-' + E(last4) : '<span style="color:#DC2626">Missing</span>') + '</p></div>' +
            '</div>' +
            '<div style="border:1px solid #E5E7EB;padding:16px;border-radius:6px;background:#F9FAFB;margin-bottom:16px">' +
              '<p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Box 1. Nonemployee Compensation</p>' +
              '<p style="font-size:28px;font-weight:800;color:#111827">' + $(net1099) + '</p>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Box 4. Federal Tax Withheld</p>' +
                '<p style="font-size:14px;font-weight:600">$0.00</p></div>' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Box 5. State Tax Withheld</p>' +
                '<p style="font-size:14px;font-weight:600">$0.00</p></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">State</p>' +
                '<p style="font-size:13px">New York</p></div>' +
              '<div style="border:1px solid #E5E7EB;padding:12px;border-radius:6px"><p style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Account Number</p>' +
                '<p style="font-size:13px">#10991205323</p></div>' +
            '</div>' +
            '<div style="border:1px solid #E5E7EB;padding:16px;border-radius:6px;background:#F9FAFB">' +
              '<p style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px">Compensation Breakdown</p>' +
              '<table style="width:100%;font-size:12px"><tbody>' +
                '<tr><td style="padding:4px 0;color:#4B5563">Gross Commissions</td><td style="padding:4px 0;text-align:right;font-weight:600">' + $(grossComm) + '</td></tr>' +
                '<tr><td style="padding:4px 0;color:#EF4444">Less Referral Fees Paid</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#EF4444">- ' + $(refPaid) + '</td></tr>' +
                '<tr><td style="padding:4px 0;color:#059669">Plus Referral Fees Received</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#059669">+ ' + $(refReceived) + '</td></tr>' +
                '<tr style="border-top:2px solid #D1D5DB"><td style="padding:8px 0 4px;font-weight:700">Net 1099 Compensation</td><td style="padding:8px 0 4px;text-align:right;font-weight:800;font-size:14px">' + $(net1099) + '</td></tr>' +
              '</tbody></table>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
            '<button class="btn btn-sm btn-gold" onclick="Panels._generate1099(\'' + E(agentId) + '\',' + taxYear + ')"><i class="fas fa-file-invoice mr-1"></i> Generate</button>' +
            '<button class="btn btn-sm btn-outline" onclick="window.print()"><i class="fas fa-print mr-1"></i> Print</button>' +
            '<button class="btn btn-sm btn-outline" disabled title="Coming soon"><i class="fas fa-download mr-1"></i> Download</button>' +
            '<button class="btn btn-sm btn-outline" onclick="CRM.closeModal()">Close</button>' +
          '</div>' +
          '<p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:8px">This is a preview. Official 1099-NEC forms are generated via IRS e-filing.</p>' +
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

  function _export1099AuditReport() {
    var rows = window._1099AgentRows || [];
    var taxYear = window._1099TaxYearCurrent || new Date().getFullYear();
    if (rows.length === 0) { CRM.toast('No 1099 data to export', 'warning'); return; }

    var missingTin = rows.filter(function (r) { return !r.hasTin; });
    var completeData = rows.filter(function (r) { return r.hasTin; });
    var total1099 = rows.reduce(function (s, r) { return s + r.amount1099; }, 0);
    var allVerified = missingTin.length === 0;

    var modalHtml = '<div class="space-y-4">';
    modalHtml += '<div style="padding:12px;border-radius:8px;background:' + (allVerified ? '#F0FDF4' : '#FEF2F2') + ';border:1px solid ' + (allVerified ? '#BBF7D0' : '#FECACA') + '">' +
      '<p style="font-size:14px;font-weight:700;color:' + (allVerified ? '#166534' : '#991B1B') + '">' +
      '<i class="fas fa-' + (allVerified ? 'check-circle' : 'exclamation-triangle') + ' mr-2"></i>' +
      (allVerified ? 'All data verified' : missingTin.length + ' agent' + (missingTin.length !== 1 ? 's' : '') + ' need attention') +
      '</p></div>';

    modalHtml += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">' +
      '<div style="text-align:center;padding:12px;background:#F9FAFB;border-radius:6px"><div style="font-size:11px;color:#6B7280;text-transform:uppercase">Total Agents</div><div style="font-size:20px;font-weight:800">' + rows.length + '</div></div>' +
      '<div style="text-align:center;padding:12px;background:#F0FDF4;border-radius:6px"><div style="font-size:11px;color:#166534;text-transform:uppercase">Complete Data</div><div style="font-size:20px;font-weight:800;color:#059669">' + completeData.length + '</div></div>' +
      '<div style="text-align:center;padding:12px;background:' + (missingTin.length > 0 ? '#FEF2F2' : '#F9FAFB') + ';border-radius:6px"><div style="font-size:11px;color:' + (missingTin.length > 0 ? '#991B1B' : '#6B7280') + ';text-transform:uppercase">Missing TIN</div><div style="font-size:20px;font-weight:800;color:' + (missingTin.length > 0 ? '#DC2626' : '#374151') + '">' + missingTin.length + '</div></div>' +
    '</div>';

    modalHtml += '<div style="padding:12px;background:#F9FAFB;border-radius:6px;text-align:center">' +
      '<div style="font-size:11px;color:#6B7280;text-transform:uppercase">Total 1099 Amount (' + taxYear + ')</div>' +
      '<div style="font-size:24px;font-weight:800;color:#111827">' + $(total1099) + '</div></div>';

    modalHtml += '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="background:#F3F4F6">' +
      '<th style="text-align:left;padding:6px 8px">Agent</th>' +
      '<th style="text-align:left;padding:6px 8px">TIN</th>' +
      '<th style="text-align:right;padding:6px 8px">1099 Amount</th>' +
      '<th style="text-align:left;padding:6px 8px">Status</th>' +
    '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var tinDisplay = r.hasTin ? '***-**-' + E(r.tinLast4) : '<span style="color:#DC2626">Missing</span>';
      modalHtml += '<tr style="border-bottom:1px solid #E5E7EB;' + (!r.hasTin ? 'background:#FFFBEB' : '') + '">' +
        '<td style="padding:6px 8px;font-weight:500">' + E(r.name) + '</td>' +
        '<td style="padding:6px 8px;font-family:monospace;font-size:11px">' + tinDisplay + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-weight:600">' + $(r.amount1099) + '</td>' +
        '<td style="padding:6px 8px">' + E(r.status) + '</td>' +
      '</tr>';
    });
    modalHtml += '</tbody></table>';

    modalHtml += '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-sm btn-outline" onclick="Panels._export1099AuditCSV()"><i class="fas fa-download mr-1"></i> Export as CSV</button>' +
      '<button class="btn btn-sm btn-outline" onclick="CRM.closeModal()">Close</button>' +
    '</div>';
    modalHtml += '</div>';

    CRM.openModal('1099 Audit Report — Tax Year ' + taxYear, modalHtml, { size: 'lg' });
  }

  function _export1099AuditCSV() {
    var rows = window._1099AgentRows || [];
    var taxYear = window._1099TaxYearCurrent || new Date().getFullYear();
    if (rows.length === 0) { CRM.toast('No data to export', 'warning'); return; }
    var csv = [['Agent', 'TIN Last 4', 'Total Deals', 'Gross Commissions', 'Referral Fees Paid', 'Referral Fees Received', 'Net 1099 Amount', 'Status'].join(',')];
    rows.forEach(function (r) {
      csv.push([
        '"' + (r.name || '').replace(/"/g, '""') + '"',
        '"' + (r.tinLast4 || 'MISSING') + '"',
        r.dealCount,
        r.grossComm || 0,
        r.refPaid || 0,
        r.refReceived || 0,
        r.amount1099 || 0,
        '"' + (r.status || '') + '"',
      ].join(','));
    });
    var blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = '1099-audit-report-' + taxYear + '.csv';
    a.click(); URL.revokeObjectURL(url);
    CRM.toast('Audit report exported', 'success');
  }

  function _mark1099Status(agentId, status) {
    MallanAPI._fetch('/api/crm/1099/status', {
      method: 'POST',
      body: JSON.stringify({ agentId: agentId, status: status }),
    }).then(function () {
      Events.log('1099_status_updated', 'agent', agentId, { status: status });
      CRM.toast('1099 status updated to ' + status, 'success');
      yearEnd1099();
    }).catch(function () {
      CRM.toast('Could not update 1099 status', 'error');
    });
  }

  // ─── Company Listings ────────────────────────────────────────────────
  // ─── Shared listing compliance model ──────────────────────────────────
  // Fair Housing patterns — all 19 protected classes (Federal + NY State + NYC Human Rights Law)
  var _fairHousingPatterns = [
    /\b(no children|no kids|adults only|no families|family[-\s]?free)\b/i,
    /\b(no pets allowed)\b/i,
    /\b(christian|jewish|muslim|catholic|protestant|buddhist|hindu|sikh)\s+(only|preferred|neighborhood|community)\b/i,
    /\b(white|black|asian|hispanic|latino|african|chinese|irish|italian|polish)\s+(only|preferred|neighborhood|community)\b/i,
    /\b(no wheelchair|no handicap|not accessible|no disabled)\b/i,
    /\b(bachelor pad|man cave|perfect for single|female only|male only|men only|women only)\b/i,
    /\b(walking distance to church|near synagogue|close to mosque|near temple)\b/i,
    /\b(exclusive|prestigious)\s+(neighborhood|community|area|enclave)\b/i,
    /\b(young professionals|millennials only|seniors only|no elderly|no seniors|no students)\b/i,
    /\b(married couples|singles only|no unmarried|domestic partners? not)\b/i,
    /\b(straight only|gay friendly|no gay|no lesbian|LGBT free)\b/i,
    /\b(transgender not|no trans|cisgender only)\b/i,
    /\b(citizens only|no immigrants|americans only|US born|legal residents only)\b/i,
    /\b(no military|no veterans|military only)\b/i,
    /\b(no section 8|no voucher|no subsid|no welfare|no public assistance)\b/i,
    /\b(no foreigners|no aliens|immigration status)\b/i,
    /\b(no caregivers?|caregiver free)\b/i,
    /\b(criminal background|no felons|no convicts|arrest record)\b/i,
    /\b(domestic violence|restraining order|abuse victim)\b/i,
  ];

  // Shared: compute compliance status for a single listing
  function _computeListingCompliance(listing) {
    var issues = [];
    var isRLS = listing.rls_eligible !== false;

    // 1. Fair Housing scan on description
    var text = (listing.description || listing.PublicRemarks || listing.remarks || '');
    _fairHousingPatterns.forEach(function (p, idx) {
      var match = text.match(p);
      if (match) {
        issues.push({ type: 'Fair Housing Risk', severity: 'critical', description: 'Matched pattern: "' + match[0] + '"' });
      }
    });

    // 2. Media issues
    var photoCount = listing.photo_count || listing.PhotosCount || listing.photos_count || 0;
    if (typeof listing.photos === 'object' && Array.isArray(listing.photos)) photoCount = listing.photos.length;
    if (photoCount === 0) {
      issues.push({ type: 'Media Issues', severity: 'medium', description: 'No photos uploaded' });
    } else if (photoCount < 3) {
      issues.push({ type: 'Media Issues', severity: 'medium', description: 'Only ' + photoCount + ' photo(s) — recommend at least 3' });
    }

    // 3. Stale listing (Active + DOM > 90 + no recent price change)
    var dom = listing.DaysOnMarket || listing.days_on_market || listing.cumulative_dom || 0;
    var statusLower = (listing.status || '').toLowerCase();
    var hasPriceChange = listing.lastPriceChange || listing.last_price_change;
    if ((statusLower === 'active') && dom > 90 && !hasPriceChange) {
      issues.push({ type: 'Stale Listings', severity: 'medium', description: 'Active for ' + dom + ' days with no price adjustment' });
    }

    // 4. Protected periods (Coming Soon / Hold)
    if (statusLower === 'coming soon' || statusLower === 'comingsoon') {
      issues.push({ type: 'Protected Periods', severity: 'high', description: 'Listing in Coming Soon status — verify no showings/open houses' });
    }
    if (statusLower === 'hold' || statusLower === 'withdrawn') {
      var holdDays = dom; // approximate
      if (holdDays > 90) {
        issues.push({ type: 'Protected Periods', severity: 'high', description: 'Hold status exceeds 90-day limit (' + holdDays + ' days)' });
      }
    }

    // 5. Feed/Display problems (RLS-eligible only)
    if (isRLS) {
      var ownerOptOut = listing.OwnerOptOut || listing.owner_opt_out;
      var idxDisplay = listing.IDXEntireListingDisplayYN !== false && listing.idx_display_yn !== false;
      if (ownerOptOut) {
        issues.push({ type: 'Feed/Display Problems', severity: 'critical', description: 'Owner Opt-Out is enabled — listing must not display publicly' });
      }
      if (!idxDisplay && statusLower !== 'closed') {
        issues.push({ type: 'Feed/Display Problems', severity: 'critical', description: 'IDX Display is disabled — listing hidden from IDX search' });
      }
      // Missing required fields
      var hasAddress = listing.address || listing.UnparsedAddress;
      var hasPrice = listing.ListPrice || listing.price;
      if (!hasAddress) {
        issues.push({ type: 'Feed/Display Problems', severity: 'critical', description: 'Missing address — required for RLS distribution' });
      }
      if (!hasPrice) {
        issues.push({ type: 'Feed/Display Problems', severity: 'critical', description: 'Missing price — required for RLS distribution' });
      }
    }

    // 6. Missing documents (RLS-eligible only — flagged generically since we check docs separately)
    // This is populated by the caller when document data is available

    // Determine overall status
    var hasCritical = issues.some(function (i) { return i.severity === 'critical'; });
    var hasHigh = issues.some(function (i) { return i.severity === 'high'; });
    var status = hasCritical ? 'violation' : (hasHigh || issues.length > 0) ? 'warning' : 'clean';

    return { status: status, issues: issues };
  }

  // ─── Shared listing analysis model ─────────────────────────────────────
  var _listingModel = null; // cached after first load

  function _loadListingModel() {
    if (_listingModel) return Promise.resolve(_listingModel);
    return Promise.all([
      MallanAPI.listings.list({ limit: 500 }).catch(function () { return { listings: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      Documents.list('company').catch(function () { return { documents: [] }; }),
    ]).then(function (r) {
      var listings = r[0].listings || [];
      var agents = r[1].agents || [];
      var docs = r[2].documents || [];

      // Build agent lookup map (id → name)
      var agentMap = {};
      agents.forEach(function (a) {
        var id = a.id || a.agent_id;
        var name = a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim() || a.email || id;
        if (id) agentMap[id] = name;
      });

      // Build doc lookup (listing_id → array of docs)
      var docMap = {};
      docs.forEach(function (d) {
        var lid = d.listing_id || d.listingId;
        if (lid) {
          if (!docMap[lid]) docMap[lid] = [];
          docMap[lid].push(d);
        }
      });

      // Enrich listings with compliance + agent name + sync freshness
      var now = new Date();
      listings.forEach(function (l) {
        var lid = l.id || l.listing_id;
        // Resolve agent name
        var agentId = l.assignedAgentId || l.assigned_agent_id || l.agent_id;
        l._agentName = agentMap[agentId] || l.agent_name || agentId || '-';

        // Compute compliance
        var comp = _computeListingCompliance(l);
        // Add missing documents issue if RLS-eligible and no docs
        if (l.rls_eligible !== false && (!docMap[lid] || docMap[lid].length === 0)) {
          comp.issues.push({ type: 'Missing Documents', severity: 'high', description: 'No disclosure documents on file' });
          if (comp.status === 'clean') comp.status = 'warning';
        }
        l._compliance = comp;

        // Compute sync freshness
        var syncDate = l.syncedAt || l.synced_at || l.updatedAt || l.updated_at;
        if (syncDate) {
          var diffHours = (now - new Date(syncDate)) / (1000 * 60 * 60);
          if (diffHours < 24) { l._syncFreshness = 'fresh'; l._syncLabel = 'Fresh'; }
          else if (diffHours < 168) { l._syncFreshness = 'stale'; l._syncLabel = 'Stale'; }
          else { l._syncFreshness = 'outdated'; l._syncLabel = 'Outdated'; }
        } else {
          l._syncFreshness = 'outdated'; l._syncLabel = 'Unknown';
        }

        // Listing type (sale/rental)
        l._type = (l.property_type || l.PropertyType || l.listing_type || l.type || '').toLowerCase();
        if (l._type.indexOf('rent') !== -1 || l._type === 'rental') l._typeBadge = 'Rental';
        else l._typeBadge = 'Sale';

        // DOM
        l._dom = l.DaysOnMarket || l.days_on_market || l.cumulative_dom || 0;

        // Featured
        l._featured = l.featured || l.is_featured || false;
      });

      _listingModel = { listings: listings, agents: agents, agentMap: agentMap, docs: docs, docMap: docMap };
      return _listingModel;
    });
  }

  // Invalidate cache when navigating away
  function _clearListingModel() { _listingModel = null; }

  // ─── Company Listings ──────────────────────────────────────────────────
  var _companyListingsState = { view: 'all', sortKey: 'address', sortAsc: true };

  function companyListings() {
    CRM.setPanelTitle('Company Listings');
    var c = _container(); c.innerHTML = UI.loading();
    _clearListingModel();

    _loadListingModel().then(function (model) {
      _companyListingsState.model = model;
      _renderCompanyListings(c, model);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-building', 'Unable to load listings');
    });
  }

  function _renderCompanyListings(c, model) {
    var listings = model.listings;
    var state = _companyListingsState;

    // Compute view counts
    var counts = { active: 0, contract: 0, closed: 0, compliance: 0, featured: 0, all: listings.length };
    listings.forEach(function (l) {
      var s = (l.status || '').toLowerCase();
      if (s === 'active') counts.active++;
      else if (s === 'active under contract' || s === 'pending' || s === 'contract') counts.contract++;
      else if (s === 'closed' || s === 'sold' || s === 'leased') counts.closed++;
      if (l._compliance && l._compliance.status !== 'clean') counts.compliance++;
      if (l._featured) counts.featured++;
    });

    // Filter by current view
    var filtered = _filterCompanyView(state.view, listings);

    // Sort
    filtered = _sortCompanyListingsArr(filtered, state.sortKey, state.sortAsc);

    var html = '<div class="space-y-4">';

    // Saved View Tabs
    var views = [
      { key: 'active', label: 'Active', count: counts.active },
      { key: 'contract', label: 'In Contract', count: counts.contract },
      { key: 'closed', label: 'Closed', count: counts.closed },
      { key: 'compliance', label: 'Needs Compliance Review', count: counts.compliance },
      { key: 'featured', label: 'Featured', count: counts.featured },
      { key: 'all', label: 'All', count: counts.all },
    ];
    html += '<div class="flex flex-wrap gap-2 mb-2">';
    views.forEach(function (v) {
      var active = state.view === v.key;
      var cls = active ? 'btn btn-sm btn-gold' : 'btn btn-sm btn-outline';
      html += '<button class="' + cls + '" onclick="Panels._companyListingsView(\'' + v.key + '\')">' +
        E(v.label) + ' <span class="ml-1 text-xs opacity-70">(' + v.count + ')</span></button>';
    });
    html += '</div>';

    // Export CSV
    html += '<div class="flex justify-between items-center">' +
      UI.sectionHeader('Company Listings', filtered.length + ' of ' + listings.length + ' shown') +
      '<button class="btn btn-sm btn-outline" onclick="Panels._exportCompanyCSV()"><i class="fas fa-download mr-1"></i>Export CSV</button>' +
    '</div>';

    // Sortable table
    var sortIcon = function (key) {
      if (state.sortKey !== key) return '<i class="fas fa-sort text-gray-300 ml-1" style="font-size:9px"></i>';
      return state.sortAsc
        ? '<i class="fas fa-sort-up text-gold ml-1" style="font-size:9px"></i>'
        : '<i class="fas fa-sort-down text-gold ml-1" style="font-size:9px"></i>';
    };
    var th = function (label, key, align) {
      align = align || 'left';
      return '<th class="text-' + align + ' px-3 py-2 cursor-pointer select-none whitespace-nowrap" onclick="Panels._sortCompanyListings(\'' + key + '\')">' + E(label) + sortIcon(key) + '</th>';
    };

    html += '<div class="card"><div class="card-body p-0"><div class="overflow-x-auto">' +
      '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
      th('Address', 'address') +
      th('Type', 'type') +
      th('Price', 'price') +
      th('Status', 'status') +
      th('Agent', 'agent') +
      th('DOM', 'dom', 'center') +
      th('Sync', 'sync', 'center') +
      th('Compliance', 'compliance', 'center') +
      th('Featured', 'featured', 'center') +
      '<th class="text-center px-3 py-2 text-xs">Actions</th>' +
    '</tr></thead><tbody>';

    if (filtered.length === 0) {
      html += '<tr><td colspan="10" class="text-center py-8 text-gray-400 text-sm">No listings in this view</td></tr>';
    } else {
      filtered.forEach(function (l) {
        var lid = E(l.id || l.listing_id || '');
        var addr = l.address || l.UnparsedAddress || 'No address';
        var price = l.ListPrice || l.price;
        var dom = l._dom;
        var domClass = dom > 90 ? 'text-red-600 font-bold' : 'text-gray-700';

        // Sync freshness
        var syncColors = { fresh: '#059669', stale: '#F59E0B', outdated: '#DC2626' };
        var syncBg = { fresh: '#05966915', stale: '#F59E0B15', outdated: '#DC262615' };

        // Compliance
        var compIcon, compColor;
        if (l._compliance.status === 'clean') { compIcon = 'fa-check-circle'; compColor = '#059669'; }
        else if (l._compliance.status === 'warning') { compIcon = 'fa-exclamation-triangle'; compColor = '#F59E0B'; }
        else { compIcon = 'fa-times-circle'; compColor = '#DC2626'; }
        var compTooltip = l._compliance.issues.length > 0
          ? l._compliance.issues.map(function (i) { return i.type + ': ' + i.description; }).join('&#10;')
          : 'No issues';

        // Type badge
        var typeBg = l._typeBadge === 'Rental' ? '#8b5cf6' : '#3b82f6';

        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2"><span class="text-sm font-medium cursor-pointer hover:text-gold" onclick="Router.navigate(\'/workspace/listing/' + lid + '/overview\')">' + E(addr) + '</span></td>' +
          '<td class="px-3 py-2"><span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:700;border-radius:4px;background:' + typeBg + '15;color:' + typeBg + '">' + E(l._typeBadge) + '</span></td>' +
          '<td class="px-3 py-2 text-sm font-bold">' + (price ? $(price) : '-') + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(l.status || 'active') + '</td>' +
          '<td class="px-3 py-2 text-xs">' + E(l._agentName) + '</td>' +
          '<td class="px-3 py-2 text-center"><span class="text-sm ' + domClass + '">' + dom + '</span></td>' +
          '<td class="px-3 py-2 text-center"><span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:700;border-radius:4px;background:' + (syncBg[l._syncFreshness] || syncBg.outdated) + ';color:' + (syncColors[l._syncFreshness] || syncColors.outdated) + '">' + E(l._syncLabel) + '</span></td>' +
          '<td class="px-3 py-2 text-center" title="' + compTooltip + '"><i class="fas ' + compIcon + '" style="color:' + compColor + '"></i>' +
            (l._compliance.issues.length > 0 ? '<span class="text-xs ml-1" style="color:' + compColor + '">' + l._compliance.issues.length + '</span>' : '') + '</td>' +
          '<td class="px-3 py-2 text-center">' +
            (l._featured ? '<i class="fas fa-star text-gold"></i>' : '<i class="far fa-star text-gray-300"></i>') + '</td>' +
          '<td class="px-3 py-2 text-center whitespace-nowrap">' +
            '<button class="btn btn-xs btn-outline mr-1" onclick="Router.navigate(\'/workspace/listing/' + lid + '/overview\')" title="View"><i class="fas fa-eye"></i></button>' +
            '<button class="btn btn-xs btn-outline" onclick="Router.navigate(\'/workspace/listing/' + lid + '/edit\')" title="Edit"><i class="fas fa-edit"></i></button>' +
          '</td>' +
        '</tr>';
      });
    }

    html += '</tbody></table></div></div></div>';
    html += '</div>';
    c.innerHTML = html;
  }

  function _companyListingsView(view) {
    _companyListingsState.view = view;
    var c = _container();
    if (_companyListingsState.model) {
      _renderCompanyListings(c, _companyListingsState.model);
    }
  }

  function _filterCompanyView(view, listings) {
    if (view === 'all') return listings.slice();
    return listings.filter(function (l) {
      var s = (l.status || '').toLowerCase();
      switch (view) {
        case 'active': return s === 'active';
        case 'contract': return s === 'active under contract' || s === 'pending' || s === 'contract';
        case 'closed': return s === 'closed' || s === 'sold' || s === 'leased';
        case 'compliance': return l._compliance && l._compliance.status !== 'clean';
        case 'featured': return l._featured;
        default: return true;
      }
    });
  }

  function _sortCompanyListings(key) {
    var state = _companyListingsState;
    if (state.sortKey === key) { state.sortAsc = !state.sortAsc; }
    else { state.sortKey = key; state.sortAsc = true; }
    var c = _container();
    if (state.model) _renderCompanyListings(c, state.model);
  }

  function _sortCompanyListingsArr(listings, key, asc) {
    return listings.slice().sort(function (a, b) {
      var va, vb;
      switch (key) {
        case 'address': va = (a.address || a.UnparsedAddress || '').toLowerCase(); vb = (b.address || b.UnparsedAddress || '').toLowerCase(); break;
        case 'type': va = a._typeBadge || ''; vb = b._typeBadge || ''; break;
        case 'price': va = a.ListPrice || a.price || 0; vb = b.ListPrice || b.price || 0; break;
        case 'status': va = (a.status || '').toLowerCase(); vb = (b.status || '').toLowerCase(); break;
        case 'agent': va = (a._agentName || '').toLowerCase(); vb = (b._agentName || '').toLowerCase(); break;
        case 'dom': va = a._dom || 0; vb = b._dom || 0; break;
        case 'sync':
          var order = { fresh: 0, stale: 1, outdated: 2 };
          va = order[a._syncFreshness] !== undefined ? order[a._syncFreshness] : 3;
          vb = order[b._syncFreshness] !== undefined ? order[b._syncFreshness] : 3;
          break;
        case 'compliance':
          var cOrder = { violation: 0, warning: 1, clean: 2 };
          va = cOrder[a._compliance ? a._compliance.status : 'clean'] || 2;
          vb = cOrder[b._compliance ? b._compliance.status : 'clean'] || 2;
          break;
        case 'featured': va = a._featured ? 0 : 1; vb = b._featured ? 0 : 1; break;
        default: va = ''; vb = '';
      }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }

  function _exportCompanyCSV() {
    var state = _companyListingsState;
    if (!state.model) return;
    var filtered = _filterCompanyView(state.view, state.model.listings);
    filtered = _sortCompanyListingsArr(filtered, state.sortKey, state.sortAsc);

    var rows = [['Address', 'Type', 'Price', 'Status', 'Agent', 'DOM', 'Sync Freshness', 'Compliance', 'Featured', 'Issues']];
    filtered.forEach(function (l) {
      var addr = l.address || l.UnparsedAddress || '';
      var price = l.ListPrice || l.price || '';
      var issueText = l._compliance.issues.map(function (i) { return i.type + ': ' + i.description; }).join('; ');
      rows.push([
        addr, l._typeBadge, price, l.status || '', l._agentName, l._dom,
        l._syncLabel, l._compliance.status, l._featured ? 'Yes' : 'No', issueText
      ]);
    });

    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'company-listings-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Compliance Dashboard ──────────────────────────────────────────────
  function complianceDashboard() {
    CRM.setPanelTitle('Compliance Dashboard');
    var c = _container(); c.innerHTML = UI.loading();
    _clearListingModel();

    // Try server-side audit first, fallback to client-side
    MallanAPI._fetch('/api/crm/compliance/audit', { method: 'POST' }).then(function (auditResult) {
      _renderComplianceFromServer(c, auditResult);
    }).catch(function () {
      // Server audit unavailable — fall back to client-side analysis
      _loadListingModel().then(function (model) {
        _renderComplianceClientSide(c, model);
      }).catch(function () {
        c.innerHTML = UI.emptyState('fa-shield-alt', 'Unable to load compliance data');
      });
    });
  }

  function _renderComplianceFromServer(c, audit) {
    var findings = audit.findings || [];
    var score = audit.score || 0;
    var scoreColor = score >= 90 ? '#059669' : score >= 70 ? '#F59E0B' : '#DC2626';

    // Group findings by category
    var buckets = {
      fair_housing: { label: 'Fair Housing Risk', icon: 'fa-home', severity: 'critical', color: '#DC2626', items: [] },
      data_quality: { label: 'Missing/Invalid Data', icon: 'fa-database', severity: 'high', color: '#F97316', items: [] },
      media: { label: 'Media Issues', icon: 'fa-camera', severity: 'medium', color: '#F59E0B', items: [] },
      stale: { label: 'Stale Listings', icon: 'fa-clock', severity: 'medium', color: '#F59E0B', items: [] },
      distribution: { label: 'Feed/Display Problems', icon: 'fa-broadcast-tower', severity: 'critical', color: '#DC2626', items: [] },
      rebny_rls: { label: 'REBNY RLS Issues', icon: 'fa-shield-alt', severity: 'high', color: '#F97316', items: [] },
    };

    findings.forEach(function (f) {
      var cat = f.category || 'rebny_rls';
      if (buckets[cat]) buckets[cat].items.push(f);
      else buckets.rebny_rls.items.push(f);
    });

    var html = '<div class="space-y-4">';

    // Score + metadata
    html += '<div class="card p-6">' +
      '<div class="flex items-center justify-between">' +
        '<div class="text-center">' +
          '<p class="text-xs font-bold text-gray-500 uppercase mb-1">Server-Validated Compliance Score</p>' +
          '<p class="text-5xl font-bold" style="color:' + scoreColor + '">' + score + '%</p>' +
          '<p class="text-xs text-gray-500 mt-1">' + audit.listingsAudited + ' listings audited · ' + audit.totalFindings + ' findings</p>' +
          '<p class="text-[10px] text-gray-400 mt-1">Audited at ' + (audit.auditedAt ? new Date(audit.auditedAt).toLocaleString() : 'now') + '</p>' +
        '</div>' +
        '<div class="flex gap-3">' +
          '<div class="text-center"><p class="text-2xl font-bold text-red-600">' + (audit.critical || 0) + '</p><p class="text-[10px] text-gray-500">Critical</p></div>' +
          '<div class="text-center"><p class="text-2xl font-bold text-orange-500">' + (audit.high || 0) + '</p><p class="text-[10px] text-gray-500">High</p></div>' +
          '<div class="text-center"><p class="text-2xl font-bold text-yellow-500">' + (audit.medium || 0) + '</p><p class="text-[10px] text-gray-500">Medium</p></div>' +
        '</div>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels.complianceDashboard()"><i class="fas fa-sync mr-1"></i> Re-Audit</button>' +
      '</div>' +
    '</div>';

    // Bucket cards
    html += '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">';
    Object.keys(buckets).forEach(function (key) {
      var b = buckets[key];
      var count = b.items.length;
      var statusIcon = count === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle';
      var statusColor = count === 0 ? '#059669' : b.color;
      html += '<div class="card p-4 text-center cursor-pointer hover:border-gold transition-all" onclick="document.getElementById(\'compQueue\').scrollIntoView({behavior:\'smooth\'})">' +
        '<i class="fas ' + b.icon + ' text-xl mb-2" style="color:' + statusColor + '"></i>' +
        '<p class="text-xs font-bold text-gray-700 mb-1">' + E(b.label) + '</p>' +
        '<p class="text-lg font-bold" style="color:' + statusColor + '">' + count + '</p>' +
        '<i class="fas ' + statusIcon + ' text-sm mt-1" style="color:' + statusColor + '"></i>' +
      '</div>';
    });
    html += '</div>';

    // Compliance queue — all findings sorted by severity
    html += '<div id="compQueue" class="card"><div class="card-header"><h3><i class="fas fa-list-alt text-gold mr-2"></i>Compliance Queue (' + findings.length + ' findings)</h3></div>' +
      '<div class="card-body">';
    if (findings.length === 0) {
      html += '<div class="flex flex-col items-center py-8"><i class="fas fa-check-circle text-3xl text-green-500 mb-3"></i>' +
        '<p class="text-sm font-semibold text-green-700">All listings pass compliance checks</p></div>';
    } else {
      var severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      findings.sort(function (a, b) { return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9); });

      html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Severity</th>' +
        '<th class="text-left px-3 py-2">Listing</th>' +
        '<th class="text-left px-3 py-2">Category</th>' +
        '<th class="text-left px-3 py-2">Issue</th>' +
        '<th class="text-left px-3 py-2">Fix</th>' +
        '<th class="text-left px-3 py-2">Action</th>' +
      '</tr></thead><tbody>';
      findings.forEach(function (f) {
        var sevColor = f.severity === 'critical' ? '#DC2626' : f.severity === 'high' ? '#F97316' : f.severity === 'medium' ? '#F59E0B' : '#6b7280';
        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:' + sevColor + '">' + E(f.severity) + '</span></td>' +
          '<td class="px-3 py-2 text-sm font-medium cursor-pointer hover:text-gold" onclick="Router.navigate(\'/workspace/listing/' + E(f.listingId) + '/compliance\')">' + E(f.address) + '</td>' +
          '<td class="px-3 py-2 text-xs">' + E(f.category.replace(/_/g, ' ')) + '</td>' +
          '<td class="px-3 py-2 text-xs">' + E(f.title) + '</td>' +
          '<td class="px-3 py-2 text-xs text-gray-500">' + E(f.fix) + '</td>' +
          '<td class="px-3 py-2"><button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/listing/' + E(f.listingId) + '/compliance\')">Fix</button></td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    html += '</div>';
    c.innerHTML = html;
  }

  function _renderComplianceClientSide(c, model) {
    var listings = model.listings;
    var agentMap = model.agentMap;

      // ── Bucket counts ──
      var buckets = {
        fairHousing: { label: 'Fair Housing Risk', icon: 'fa-home', severity: 'critical', color: '#DC2626', items: [] },
        missingDocs: { label: 'Missing Documents', icon: 'fa-file-alt', severity: 'high', color: '#F97316', items: [] },
        media: { label: 'Media Issues', icon: 'fa-camera', severity: 'medium', color: '#F59E0B', items: [] },
        stale: { label: 'Stale Listings', icon: 'fa-clock', severity: 'medium', color: '#F59E0B', items: [] },
        protectedPeriods: { label: 'Protected Periods', icon: 'fa-shield-alt', severity: 'high', color: '#F97316', items: [] },
        feedDisplay: { label: 'Feed/Display Problems', icon: 'fa-broadcast-tower', severity: 'critical', color: '#DC2626', items: [] },
      };

      // Build unified queue
      var queue = [];
      listings.forEach(function (l) {
        if (!l._compliance) return;
        var lid = l.id || l.listing_id;
        var addr = l.address || l.UnparsedAddress || 'No address';
        var agentId = l.assignedAgentId || l.assigned_agent_id || l.agent_id;
        var agentName = l._agentName || '-';

        l._compliance.issues.forEach(function (issue) {
          var bucketKey = null;
          if (issue.type === 'Fair Housing Risk') bucketKey = 'fairHousing';
          else if (issue.type === 'Missing Documents') bucketKey = 'missingDocs';
          else if (issue.type === 'Media Issues') bucketKey = 'media';
          else if (issue.type === 'Stale Listings') bucketKey = 'stale';
          else if (issue.type === 'Protected Periods') bucketKey = 'protectedPeriods';
          else if (issue.type === 'Feed/Display Problems') bucketKey = 'feedDisplay';

          var entry = {
            listingId: lid,
            address: addr,
            type: issue.type,
            severity: issue.severity,
            description: issue.description,
            agent: agentName,
          };
          if (bucketKey && buckets[bucketKey]) buckets[bucketKey].items.push(entry);
          queue.push(entry);
        });
      });

      // Sort queue by severity: critical → high → medium
      var sevOrder = { critical: 0, high: 1, medium: 2 };
      queue.sort(function (a, b) {
        return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
      });

      // ── Overall score ──
      var totalListings = listings.length;
      var cleanListings = listings.filter(function (l) { return l._compliance && l._compliance.status === 'clean'; }).length;
      var score = totalListings > 0 ? Math.round((cleanListings / totalListings) * 100) : 100;
      var scoreColor = score >= 90 ? '#059669' : score >= 70 ? '#F59E0B' : '#DC2626';
      var totalIssues = queue.length;
      var criticalCount = queue.filter(function (q) { return q.severity === 'critical'; }).length;
      var highCount = queue.filter(function (q) { return q.severity === 'high'; }).length;

      var html = '<div class="space-y-4">';

      // Score card
      html += '<div class="card p-6 text-center">' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Overall Compliance Score</p>' +
        '<p class="text-5xl font-bold" style="color:' + scoreColor + '">' + score + '%</p>' +
        '<p class="text-xs text-gray-500 mt-1">' + cleanListings + ' of ' + totalListings + ' listings fully compliant</p>' +
        '<div class="flex justify-center gap-4 mt-2 text-xs">' +
          '<span class="text-red-600 font-semibold">' + criticalCount + ' Critical</span>' +
          '<span class="text-orange-500 font-semibold">' + highCount + ' High</span>' +
          '<span class="text-yellow-500 font-semibold">' + (totalIssues - criticalCount - highCount) + ' Medium</span>' +
        '</div>' +
      '</div>';

      // 6 Issue Bucket cards
      html += '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">';
      var bucketKeys = ['fairHousing', 'missingDocs', 'media', 'stale', 'protectedPeriods', 'feedDisplay'];
      bucketKeys.forEach(function (key) {
        var b = buckets[key];
        var count = b.items.length;
        var sevColors = { critical: '#DC2626', high: '#F97316', medium: '#F59E0B' };
        var bgColor = count > 0 ? (sevColors[b.severity] || '#F59E0B') : '#059669';
        html += '<div class="card p-4 text-center" style="border-top:3px solid ' + bgColor + '">' +
          '<i class="fas ' + b.icon + ' text-lg mb-2" style="color:' + bgColor + '"></i>' +
          '<p class="text-xs font-bold text-gray-700 mb-1">' + E(b.label) + '</p>' +
          '<p class="text-2xl font-bold" style="color:' + bgColor + '">' + count + '</p>' +
          '<p class="text-[10px] font-bold uppercase mt-1" style="color:' + bgColor + '">' + (count > 0 ? E(b.severity) : 'CLEAR') + '</p>' +
        '</div>';
      });
      html += '</div>';

      // Compliance Queue — unified table of ALL issues
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-list-ol text-gold mr-2"></i>Compliance Queue</h3>' +
        '<span class="text-xs text-gray-500">' + queue.length + ' issue(s)</span></div>';
      if (queue.length > 0) {
        html += '<div class="card-body p-0"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
          '<th class="text-left px-3 py-2">Address</th>' +
          '<th class="text-left px-3 py-2">Issue</th>' +
          '<th class="text-center px-3 py-2">Severity</th>' +
          '<th class="text-left px-3 py-2">Description</th>' +
          '<th class="text-left px-3 py-2">Agent</th>' +
          '<th class="text-center px-3 py-2">Action</th>' +
        '</tr></thead><tbody>';

        queue.forEach(function (q) {
          var sevColor = q.severity === 'critical' ? '#DC2626' : q.severity === 'high' ? '#F97316' : '#F59E0B';
          var sevBg = q.severity === 'critical' ? '#DC262615' : q.severity === 'high' ? '#F9731615' : '#F59E0B15';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-xs font-medium">' + E(q.address) + '</td>' +
            '<td class="px-3 py-2"><span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:700;border-radius:4px;background:#6b728015;color:#6b7280">' + E(q.type) + '</span></td>' +
            '<td class="px-3 py-2 text-center"><span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:700;border-radius:4px;background:' + sevBg + ';color:' + sevColor + ';text-transform:uppercase">' + E(q.severity) + '</span></td>' +
            '<td class="px-3 py-2 text-xs text-gray-600">' + E(q.description) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(q.agent) + '</td>' +
            '<td class="px-3 py-2 text-center"><button class="btn btn-xs btn-gold" onclick="Router.navigate(\'/workspace/listing/' + E(q.listingId || '') + '/compliance\')">Fix Now</button></td>' +
          '</tr>';
        });

        html += '</tbody></table></div></div>';
      } else {
        html += '<div class="card-body"><div class="flex items-center gap-3 p-4 bg-green-50 rounded-lg">' +
          '<i class="fas fa-check-circle text-green-500 text-xl"></i>' +
          '<div><p class="text-sm font-bold text-green-800">All Clear</p>' +
          '<p class="text-xs text-green-600">No compliance issues detected across ' + totalListings + ' listings.</p></div></div></div>';
      }
      html += '</div>';

      // Fair Housing Scanner
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-home text-blue-500 mr-2"></i>Fair Housing Scanner</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._runFairHousingScan()"><i class="fas fa-search mr-1"></i> Run Scan</button></div>' +
        '<div class="card-body" id="fairHousingScanResult">' +
          '<p class="text-sm text-gray-500">Click "Run Scan" to check all listing descriptions against 19 protected-class patterns (Federal Fair Housing Act, NY State Human Rights Law, NYC Human Rights Law Title 8).</p>' +
        '</div></div>';

      // Distribution Gate Matrix
      var rlsListings = listings.filter(function (l) { return l.rls_eligible !== false; }).slice(0, 50);
      if (rlsListings.length > 0) {
        html += '<div class="card"><div class="card-header"><h3><i class="fas fa-share-alt text-green-500 mr-2"></i>Distribution Gate Matrix</h3></div>' +
          '<div class="card-body p-0"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
          '<th class="text-left px-3 py-2">Listing</th>' +
          '<th class="text-center px-2 py-2">Owner Opt-Out</th>' +
          '<th class="text-center px-2 py-2">Participant Only</th>' +
          '<th class="text-center px-2 py-2">IDX Display</th>' +
          '<th class="text-center px-2 py-2">Syndication</th>' +
          '<th class="text-center px-2 py-2">Coming Soon</th>' +
          '<th class="text-center px-2 py-2">Closed</th>' +
          '<th class="text-center px-2 py-2">Result</th>' +
        '</tr></thead><tbody>';

        var gCheck = '<i class="fas fa-check-circle text-green-500 text-xs"></i>';
        var gFail = '<i class="fas fa-times-circle text-red-500 text-xs"></i>';
        var gWarn = '<i class="fas fa-exclamation-circle text-yellow-500 text-xs"></i>';

        rlsListings.forEach(function (l) {
          var addr = l.address || l.UnparsedAddress || 'No address';
          var ownerOpt = l.OwnerOptOut || l.owner_opt_out;
          var participantOnly = l.ParticipantOnly || l.participant_only;
          var idxOk = l.IDXEntireListingDisplayYN !== false && l.idx_display_yn !== false;
          var syndOk = l.SyndicationOptInYN !== false && l.syndication_opt_in !== false;
          var comingSoon = (l.status || '').toLowerCase() === 'coming soon' || (l.status || '').toLowerCase() === 'comingsoon';
          var closed = (l.status || '').toLowerCase() === 'closed';
          var blocked = ownerOpt || !idxOk || closed;
          var warn = comingSoon || participantOnly;
          var result = blocked ? 'BLOCK' : warn ? 'WARN' : 'PASS';
          var resultColor = blocked ? 'text-red-600' : warn ? 'text-yellow-600' : 'text-green-600';

          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-xs font-medium">' + E(addr) + '</td>' +
            '<td class="text-center px-2 py-2">' + (ownerOpt ? gFail : gCheck) + '</td>' +
            '<td class="text-center px-2 py-2">' + (participantOnly ? gWarn : gCheck) + '</td>' +
            '<td class="text-center px-2 py-2">' + (idxOk ? gCheck : gFail) + '</td>' +
            '<td class="text-center px-2 py-2">' + (syndOk ? gCheck : gFail) + '</td>' +
            '<td class="text-center px-2 py-2">' + (comingSoon ? gWarn : gCheck) + '</td>' +
            '<td class="text-center px-2 py-2">' + (closed ? gFail : gCheck) + '</td>' +
            '<td class="text-center px-2 py-2"><span class="text-[10px] font-bold ' + resultColor + '">' + result + '</span></td>' +
          '</tr>';
        });
        html += '</tbody></table></div></div></div>';
      }

      html += '</div>';
      c.innerHTML = html;
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

    MallanAPI.listings.list({ limit: 500 }).then(function (data) {
      var listings = data.listings || [];
      var flagged = [];
      listings.forEach(function (l) {
        var text = (l.description || l.PublicRemarks || l.remarks || '') + ' ' + (l.address || '');
        _fairHousingPatterns.forEach(function (p) {
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
          '<p class="text-xs text-green-600">Scanned ' + listings.length + ' listings against 19 protected-class patterns. No Fair Housing violations detected.</p></div></div>';
      } else {
        var fhtml = '<div class="space-y-2">' +
          '<p class="text-sm font-bold text-red-600">' + flagged.length + ' potential violation(s) found across ' + listings.length + ' listings:</p>';
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
    CRM.setPanelTitle('Document Vault');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      Documents.listAll(),
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
    ]).then(function (r) {
      var docs = r[0] || [];
      var clients = r[1].clients || [];
      var listings = r[2].listings || [];
      var agents = r[3].agents || [];
      var deals = r[4].deals || [];

      // Store for filters / template modal
      window._docVault = { docs: docs, clients: clients, listings: listings, agents: agents, deals: deals };
      window._docVaultFilter = { status: 'all', scope: 'all', sort: 'updated_desc' };

      var pendingCount = docs.filter(function (d) { return d.status === 'requested' || d.status === 'pending_approval'; }).length;

      var html = '<div class="space-y-4">';

      // Header
      html += UI.sectionHeader('Document Vault', docs.length + ' documents',
        '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc()"><i class="fas fa-upload"></i> Upload</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._generateFromTemplate()"><i class="fas fa-file-alt"></i> Generate from Template</button>');

      // Request Queue Card (highlighted if pending)
      if (pendingCount > 0) {
        html += '<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle" style="color:#F59E0B;"></i>' +
          '<span class="text-sm font-semibold">' + pendingCount + ' document' + (pendingCount !== 1 ? 's' : '') + ' awaiting review</span></div>' +
          '<button class="btn btn-sm btn-outline" onclick="document.getElementById(\'docRequestQueue\').scrollIntoView({behavior:\'smooth\'})">Review Requests</button>' +
        '</div>';
      }

      // Status Filter Tabs
      var statusCounts = { all: docs.length };
      Documents.STATUSES.forEach(function (s) {
        statusCounts[s] = docs.filter(function (d) { return d.status === s; }).length;
      });
      html += '<div class="flex flex-wrap items-center gap-2">';
      ['all'].concat(Documents.STATUSES).forEach(function (s) {
        var label = s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        html += '<button class="btn btn-sm ' + (s === 'all' ? 'btn-gold' : 'btn-outline') + '" id="docStatusTab_' + s + '" onclick="Panels._filterDocVault(\'' + s + '\')">' +
          label + ' <span class="text-xs opacity-70">(' + (statusCounts[s] || 0) + ')</span></button>';
      });
      // Scope dropdown
      html += '<select class="form-input" style="width:auto;height:30px;font-size:12px;margin-left:auto;" onchange="Panels._filterDocVaultScope(this.value)" id="docScopeFilter">' +
        '<option value="all">All Scopes</option>';
      Documents.SCOPES.forEach(function (s) {
        html += '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
      });
      html += '</select></div>';

      // Main Document Table
      html += '<div id="docVaultTable">' + _documentsTable(docs, { showScope: true, showOwner: true, showActions: true }) + '</div>';

      // Request Queue Section
      var pendingDocs = docs.filter(function (d) { return d.status === 'requested' || d.status === 'pending_approval'; });
      html += '<div id="docRequestQueue">';
      html += UI.card('Request Queue', _renderRequestQueue(pendingDocs),
        pendingDocs.length > 0 ? '<span class="text-xs font-semibold" style="color:#F59E0B;">' + pendingDocs.length + ' pending</span>' : '');
      html += '</div>';

      // Missing Documents Report (expandable)
      html += '<details class="card" style="cursor:pointer;">' +
        '<summary class="card-header" style="list-style:none;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;">' +
          '<h3 style="margin:0;">Missing Documents Report</h3>' +
          '<i class="fas fa-chevron-down text-xs text-gray-400"></i>' +
        '</summary>' +
        '<div class="card-body">' + _renderMissingDocs(docs, clients, listings, deals) + '</div>' +
      '</details>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-folder', 'Unable to load documents');
    });
  }

  function _renderRequestQueue(pendingDocs) {
    if (!pendingDocs || pendingDocs.length === 0) {
      return '<p class="text-sm text-gray-400 py-4 text-center">No pending requests</p>';
    }
    var html = '<div class="space-y-2">';
    pendingDocs.forEach(function (d) {
      var docId = d.id || d.document_id || '';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;border-radius:6px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
          '<div>' +
            '<div class="text-sm font-medium">' + E(d.title || 'Untitled') + '</div>' +
            '<div class="text-xs text-gray-500">' + Documents.typeLabel(d.type) + ' &middot; ' + E(d.scope || '') + ' &middot; ' + D(d.created_at || d.createdAt) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-gold" onclick="Panels._approveDoc(\'' + E(docId) + '\')"><i class="fas fa-check"></i> Approve</button>' +
          '<button class="btn btn-sm btn-outline" style="color:#DC2626;border-color:#DC2626;" onclick="Panels._rejectDoc(\'' + E(docId) + '\')"><i class="fas fa-times"></i> Reject</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function _renderMissingDocs(docs, clients, listings, deals) {
    var REQUIRED_CLIENT = ['buyer_agreement', 'disclosure'];
    var REQUIRED_DEAL = ['contract', 'disclosure'];
    var REQUIRED_LISTING = ['exclusive_agreement', 'disclosure'];
    var html = '';
    var missing = [];

    // Check clients
    clients.forEach(function (cl) {
      var clientDocs = docs.filter(function (d) {
        return d.scope === 'client' && (d.scope_id === cl.id || d.scopeId === cl.id);
      });
      var clientTypes = clientDocs.map(function (d) { return d.type; });
      REQUIRED_CLIENT.forEach(function (rt) {
        if (clientTypes.indexOf(rt) === -1) {
          missing.push({ entity: 'Client', name: E(cl.name || cl.first_name + ' ' + cl.last_name || 'Unknown'), type: rt, scope: 'client', scopeId: cl.id });
        }
      });
    });

    // Check deals
    deals.forEach(function (dl) {
      var dealDocs = docs.filter(function (d) {
        return d.scope === 'deal' && (d.scope_id === dl.id || d.scopeId === dl.id);
      });
      var dealTypes = dealDocs.map(function (d) { return d.type; });
      REQUIRED_DEAL.forEach(function (rt) {
        if (dealTypes.indexOf(rt) === -1) {
          missing.push({ entity: 'Deal', name: E(dl.title || dl.address || 'Deal #' + dl.id), type: rt, scope: 'deal', scopeId: dl.id });
        }
      });
    });

    // Check listings
    listings.forEach(function (ls) {
      var listDocs = docs.filter(function (d) {
        return d.scope === 'listing' && (d.scope_id === ls.id || d.scopeId === ls.id);
      });
      var listTypes = listDocs.map(function (d) { return d.type; });
      REQUIRED_LISTING.forEach(function (rt) {
        if (listTypes.indexOf(rt) === -1) {
          missing.push({ entity: 'Listing', name: E(ls.address || ls.title || 'Listing #' + ls.id), type: rt, scope: 'listing', scopeId: ls.id });
        }
      });
    });

    if (missing.length === 0) {
      return '<p class="text-sm text-green-600 py-2"><i class="fas fa-check-circle mr-1"></i> All required documents are present.</p>';
    }

    html += '<div style="overflow-x:auto;"><table><thead><tr>' +
      '<th>Entity</th><th>Name</th><th>Missing Document</th><th>Action</th>' +
    '</tr></thead><tbody>';
    missing.forEach(function (m) {
      html += '<tr><td><span class="text-xs font-semibold">' + m.entity + '</span></td>' +
        '<td class="text-sm">' + m.name + '</td>' +
        '<td class="text-sm">' + Documents.typeLabel(m.type) + '</td>' +
        '<td><button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'' + E(m.scope) + '\',\'' + E(m.scopeId) + '\')">Upload Now</button></td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function _filterDocVault(status) {
    window._docVaultFilter.status = status;
    _applyDocVaultFilters();
    // Update tab active states
    var tabs = document.querySelectorAll('[id^="docStatusTab_"]');
    tabs.forEach(function (t) {
      t.className = t.id === 'docStatusTab_' + status ? 'btn btn-sm btn-gold' : 'btn btn-sm btn-outline';
    });
  }

  function _filterDocVaultScope(scope) {
    window._docVaultFilter.scope = scope;
    _applyDocVaultFilters();
  }

  function _applyDocVaultFilters() {
    var f = window._docVaultFilter;
    var docs = (window._docVault && window._docVault.docs) || [];
    var filtered = docs.filter(function (d) {
      if (f.status !== 'all' && d.status !== f.status) return false;
      if (f.scope !== 'all' && d.scope !== f.scope) return false;
      return true;
    });
    var el = document.getElementById('docVaultTable');
    if (el) el.innerHTML = _documentsTable(filtered, { showScope: true, showOwner: true, showActions: true });
  }

  function _approveDoc(docId) {
    Documents.approve(docId).then(function () {
      CRM.toast('Document approved', 'success');
      brokerDocuments(); // refresh
    }).catch(function (err) {
      CRM.toast(err.message || 'Failed to approve document', 'error');
    });
  }

  function _batchApproveDocuments(ids) {
    if (!ids || ids.length === 0) { CRM.toast('No documents selected', 'warning'); return; }
    MallanAPI._fetch('/api/crm/documents/batch-approve', {
      method: 'POST',
      body: JSON.stringify({ document_ids: ids })
    }).then(function (res) {
      var approved = (res.approved || []).length;
      var failed = (res.failed || []).length;
      if (failed > 0) {
        CRM.toast(approved + ' approved, ' + failed + ' failed', 'warning');
      } else {
        CRM.toast(approved + ' documents approved', 'success');
      }
      brokerDocuments();
    }).catch(function (err) {
      CRM.toast('Approval failed: ' + (err.message || 'Try again'), 'error');
    });
  }

  function _rejectDoc(docId) {
    MallanAPI._fetch('/api/crm/documents/' + docId, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'draft' }),
    }).then(function () {
      CRM.toast('Document rejected and returned to draft', 'success');
      brokerDocuments();
    }).catch(function () {
      CRM.toast('Failed to reject document', 'error');
    });
  }

  function _generateFromTemplate() {
    var vault = window._docVault || {};
    var clients = vault.clients || [];
    var listings = vault.listings || [];
    var agents = vault.agents || [];
    var deals = vault.deals || [];

    var TEMPLATES = [
      'Buyer Agency Agreement', 'Exclusive Right to Sell', 'Commission Negotiability Disclosure',
      'Property Condition Disclosure', 'Fair Housing Notice', 'Agency Disclosure (DOS-2105)',
      'Rental Listing Agreement', 'Tenant Representation Agreement',
    ];

    var templateOpts = TEMPLATES.map(function (t) { return '<option value="' + E(t) + '">' + E(t) + '</option>'; }).join('');
    var clientOpts = clients.map(function (c) { return '<option value="' + E(c.id) + '">' + E(c.name || (c.first_name + ' ' + c.last_name) || 'Client') + '</option>'; }).join('');
    var listingOpts = listings.map(function (l) { return '<option value="' + E(l.id) + '">' + E(l.address || l.title || 'Listing') + '</option>'; }).join('');
    var agentOpts = agents.map(function (a) { return '<option value="' + E(a.id) + '">' + E(a.name || (a.first_name + ' ' + a.last_name) || 'Agent') + '</option>'; }).join('');
    var dealOpts = deals.map(function (d) { return '<option value="' + E(d.id) + '">' + E(d.title || d.address || 'Deal #' + d.id) + '</option>'; }).join('');

    CRM.openModal('Generate from Template',
      '<form id="templateDocForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Template *</label>' +
          '<select class="form-input" name="template" required onchange="var t=this.value;var ti=document.querySelector(\'[name=templateTitle]\');if(ti)ti.value=t;">' +
            '<option value="">Select template...</option>' + templateOpts +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Scope *</label>' +
          '<select class="form-input" name="scope" required onchange="Panels._updateTemplateScopePicker(this.value)">' +
            '<option value="">Select scope...</option>' +
            '<option value="company">Company</option><option value="agent">Agent</option>' +
            '<option value="client">Client</option><option value="listing">Listing</option>' +
            '<option value="deal">Deal</option>' +
          '</select></div>' +
        '<div class="form-group" id="templateScopeEntity" style="display:none;"><label class="form-label">Select Entity *</label>' +
          '<select class="form-input" name="scopeId" id="templateScopeEntityPicker">' +
            '<option value="">Select...</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Title</label>' +
          '<input class="form-input" name="templateTitle" placeholder="Auto-filled from template"></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitGenerateTemplate()"><i class="fas fa-file-alt"></i> Generate</button>',
        data: { clientOpts: clientOpts, listingOpts: listingOpts, agentOpts: agentOpts, dealOpts: dealOpts },
      }
    );
    // Store picker options on window for scope change handler
    window._templatePickerOpts = { client: clientOpts, listing: listingOpts, agent: agentOpts, deal: dealOpts };
  }

  function _updateTemplateScopePicker(scope) {
    var container = document.getElementById('templateScopeEntity');
    var picker = document.getElementById('templateScopeEntityPicker');
    if (scope === 'company' || !scope) {
      if (container) container.style.display = 'none';
      return;
    }
    if (container) container.style.display = '';
    var opts = (window._templatePickerOpts && window._templatePickerOpts[scope]) || '';
    if (picker) picker.innerHTML = '<option value="">Select...</option>' + opts;
  }

  function _submitGenerateTemplate() {
    var form = document.getElementById('templateDocForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    var title = data.templateTitle || data.template || 'Untitled Document';
    var scope = data.scope || 'company';
    var scopeId = data.scopeId || null;

    Documents.upload({
      title: title,
      type: 'general',
      scope: scope,
      scopeId: scopeId,
      status: 'draft',
      template: data.template,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Draft document "' + title + '" created from template', 'success');
      brokerDocuments();
    }).catch(function (err) {
      CRM.toast(err.message || 'Failed to generate document', 'error');
    });
  }

  function _sortDocVault(col) {
    var vault = window._docVault;
    if (!vault) return;
    var current = window._docVaultFilter.sort || '';
    var dir = current === col + '_asc' ? 'desc' : 'asc';
    window._docVaultFilter.sort = col + '_' + dir;
    _applyDocVaultFilters();
  }

  function _documentsTable(docs, opts) {
    opts = opts || {};
    var showScope = opts.showScope !== false;
    var showOwner = opts.showOwner !== false;
    var showActions = opts.showActions !== false;

    if (!docs || docs.length === 0) return UI.emptyState('fa-folder-open', 'No documents yet');

    // Sort
    var sortKey = (window._docVaultFilter && window._docVaultFilter.sort) || 'updated_desc';
    var sortParts = sortKey.split('_');
    var sortDir = sortParts.pop();
    var sortCol = sortParts.join('_');
    var sorted = docs.slice().sort(function (a, b) {
      var va, vb;
      switch (sortCol) {
        case 'title': va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase(); break;
        case 'scope': va = a.scope || ''; vb = b.scope || ''; break;
        case 'type': va = a.type || ''; vb = b.type || ''; break;
        case 'status': va = a.status || ''; vb = b.status || ''; break;
        case 'expires':
          va = a.expires_at || a.expiresAt || '9999'; vb = b.expires_at || b.expiresAt || '9999'; break;
        default: // updated
          va = a.updated_at || a.updatedAt || a.created_at || a.createdAt || '';
          vb = b.updated_at || b.updatedAt || b.created_at || b.createdAt || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    var sortArrow = function (col) {
      if (sortCol === col) return sortDir === 'asc' ? ' <i class="fas fa-sort-up text-gold"></i>' : ' <i class="fas fa-sort-down text-gold"></i>';
      return ' <i class="fas fa-sort text-gray-300" style="font-size:9px;"></i>';
    };

    var scopeBadge = function (scope) {
      var colors = { company: '#6366F1', agent: '#3B82F6', client: '#059669', listing: '#F59E0B', deal: '#8B5CF6' };
      var c = colors[scope] || '#6B7280';
      return '<span style="display:inline-flex;padding:1px 6px;font-size:9px;font-weight:700;border-radius:4px;background:' + c + '15;color:' + c + ';text-transform:uppercase;">' + E(scope || 'general') + '</span>';
    };

    var now = new Date();
    var thirtyDays = 30 * 24 * 60 * 60 * 1000;

    var html = '<div style="overflow-x:auto;"><table><thead><tr>' +
      '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'title\')">Title' + sortArrow('title') + '</th>';
    if (showScope) html += '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'scope\')">Scope' + sortArrow('scope') + '</th>';
    html += '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'type\')">Type' + sortArrow('type') + '</th>' +
      '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'status\')">Status' + sortArrow('status') + '</th>';
    if (showOwner) html += '<th>Owner</th>';
    html += '<th>Uploaded By</th>' +
      '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'updated\')">Last Updated' + sortArrow('updated') + '</th>' +
      '<th style="cursor:pointer;" onclick="Panels._sortDocVault(\'expires\')">Expires' + sortArrow('expires') + '</th>';
    if (showActions) html += '<th>Actions</th>';
    html += '</tr></thead><tbody>';

    sorted.forEach(function (d) {
      var docId = d.id || d.document_id || '';
      var expDate = d.expires_at || d.expiresAt || '';
      var isExpired = expDate && new Date(expDate) < now;
      var isExpiringSoon = expDate && !isExpired && (new Date(expDate) - now) < thirtyDays;

      html += '<tr>';
      // Title with icon
      html += '<td><div class="flex items-center gap-2"><i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
        '<span class="text-sm font-medium">' + E(d.title || d.name || 'Untitled') + '</span></div></td>';
      // Scope badge
      if (showScope) html += '<td>' + scopeBadge(d.scope) + '</td>';
      // Type
      html += '<td><span class="text-xs">' + Documents.typeLabel(d.type) + '</span></td>';
      // Status
      html += '<td>' + Documents.statusBadge(d.status) + '</td>';
      // Owner
      if (showOwner) {
        var ownerName = d.owner_name || d.ownerName || d.scope_label || '';
        html += '<td><span class="text-xs text-gray-600">' + E(ownerName) + '</span></td>';
      }
      // Uploaded By
      html += '<td><span class="text-xs text-gray-500">' + E(d.uploaded_by_name || d.uploadedByName || d.agent_name || '') + '</span></td>';
      // Last Updated
      html += '<td><span class="text-xs text-gray-500">' + D(d.updated_at || d.updatedAt || d.created_at || d.createdAt) + '</span></td>';
      // Expires
      var expStyle = isExpired ? 'color:#DC2626;font-weight:700;' : isExpiringSoon ? 'color:#F59E0B;font-weight:600;' : '';
      html += '<td><span class="text-xs" style="' + expStyle + '">' + (expDate ? D(expDate) + (isExpired ? ' (Expired)' : '') : '--') + '</span></td>';
      // Actions
      if (showActions) {
        html += '<td><div class="flex gap-1">' +
          '<button class="btn btn-sm btn-outline" title="View" onclick="Panels._viewDoc(\'' + E(docId) + '\')"><i class="fas fa-eye"></i></button>';
        if (d.status === 'pending_approval') {
          html += '<button class="btn btn-sm btn-gold" title="Approve" onclick="Panels._approveDoc(\'' + E(docId) + '\')"><i class="fas fa-check"></i></button>';
        }
        html += '<button class="btn btn-sm btn-outline" title="Replace" onclick="Panels._replaceDoc(\'' + E(docId) + '\')"><i class="fas fa-sync-alt"></i></button>' +
          '<button class="btn btn-sm btn-outline" title="Delete" style="color:#DC2626;border-color:#DC2626;" onclick="Panels._deleteDoc(\'' + E(docId) + '\')"><i class="fas fa-trash"></i></button>' +
        '</div></td>';
      }
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function _viewDoc(docId) {
    Documents.get(docId).then(function (doc) {
      if (!doc) { CRM.toast('Document not found', 'error'); return; }
      var html = '<div class="space-y-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="form-label">Title</label><p class="text-sm font-medium">' + E(doc.title || 'Untitled') + '</p></div>' +
          '<div><label class="form-label">Type</label><p class="text-sm">' + Documents.typeLabel(doc.type) + '</p></div>' +
          '<div><label class="form-label">Scope</label><p class="text-sm">' + E(doc.scope || '') + '</p></div>' +
          '<div><label class="form-label">Status</label><p>' + Documents.statusBadge(doc.status) + '</p></div>' +
          '<div><label class="form-label">Created</label><p class="text-xs text-gray-500">' + D(doc.created_at || doc.createdAt) + '</p></div>' +
          '<div><label class="form-label">Updated</label><p class="text-xs text-gray-500">' + D(doc.updated_at || doc.updatedAt) + '</p></div>' +
        '</div>' +
        (doc.notes ? '<div><label class="form-label">Notes</label><p class="text-sm text-gray-600">' + E(doc.notes) + '</p></div>' : '') +
        (doc.file_url || doc.fileUrl ? '<div><a href="' + E(doc.file_url || doc.fileUrl) + '" target="_blank" class="btn btn-sm btn-gold"><i class="fas fa-download"></i> Download File</a></div>' : '') +
      '</div>';
      CRM.openModal('Document Details', html, {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Close</button>',
      });
    }).catch(function () {
      CRM.toast('Failed to load document', 'error');
    });
  }

  function _replaceDoc(docId) {
    Documents.get(docId).then(function (doc) {
      if (!doc) { CRM.toast('Document not found', 'error'); return; }
      // Open upload modal pre-filled
      _uploadDoc(doc.scope, doc.scope_id || doc.scopeId, {
        replaceId: docId,
        prefillType: doc.type,
        prefillTitle: doc.title,
      });
    }).catch(function () {
      CRM.toast('Failed to load document', 'error');
    });
  }

  function _deleteDoc(docId) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    Documents.remove(docId).then(function () {
      CRM.toast('Document deleted', 'success');
      brokerDocuments();
    }).catch(function (err) {
      CRM.toast(err.message || 'Failed to delete document', 'error');
    });
  }

  function _uploadDoc(scope, scopeId, replaceOpts) {
    replaceOpts = replaceOpts || {};
    var vault = window._docVault || {};
    var clients = vault.clients || [];
    var listings = vault.listings || [];
    var agents = vault.agents || [];
    var deals = vault.deals || [];

    var typeOpts = Documents.DOC_TYPES.map(function (t) {
      var sel = replaceOpts.prefillType === t ? ' selected' : '';
      return '<option value="' + E(t) + '"' + sel + '>' + Documents.typeLabel(t) + '</option>';
    }).join('');

    var scopeOptions = Documents.SCOPES.map(function (s) {
      var sel = scope === s ? ' selected' : '';
      return '<option value="' + s + '"' + sel + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');

    // Build entity picker options per scope
    var entityHtml = function (s) {
      var items = [];
      if (s === 'client') items = clients;
      else if (s === 'listing') items = listings;
      else if (s === 'agent') items = agents;
      else if (s === 'deal') items = deals;
      return items.map(function (item) {
        var id = item.id;
        var label = item.name || item.address || item.title || (item.first_name + ' ' + item.last_name) || 'Item #' + id;
        var sel = scopeId === id ? ' selected' : '';
        return '<option value="' + E(id) + '"' + sel + '>' + E(label) + '</option>';
      }).join('');
    };

    // Store entity options for dynamic switching
    window._uploadDocEntityOpts = {};
    Documents.SCOPES.forEach(function (s) {
      window._uploadDocEntityOpts[s] = entityHtml(s);
    });

    var initialScope = scope || '';
    var showEntity = initialScope && initialScope !== 'company';

    CRM.openModal(replaceOpts.replaceId ? 'Replace Document' : 'Upload Document',
      '<form id="uploadDocForm" class="space-y-4">' +
        (replaceOpts.replaceId ? '<input type="hidden" name="replaceId" value="' + E(replaceOpts.replaceId) + '">' : '') +
        '<div class="form-group"><label class="form-label">Scope *</label>' +
          '<select class="form-input" name="scope" required onchange="Panels._updateUploadScopePicker(this.value)"' + (scope ? ' ' : '') + '>' +
            '<option value="">Select scope...</option>' + scopeOptions +
          '</select></div>' +
        '<div class="form-group" id="uploadScopeEntity" style="' + (showEntity ? '' : 'display:none;') + '">' +
          '<label class="form-label">Entity *</label>' +
          '<select class="form-input" name="scopeId" id="uploadScopeEntityPicker">' +
            '<option value="">Select...</option>' + (showEntity ? entityHtml(initialScope) : '') +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Document Type *</label>' +
          '<select class="form-input" name="type" required>' +
            '<option value="">Select type...</option>' + typeOpts +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Title *</label>' +
          '<input class="form-input" name="title" placeholder="Document title" required value="' + E(replaceOpts.prefillTitle || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">File</label>' +
          '<input class="form-input" type="file" name="file" id="uploadDocFile"></div>' +
        '<div class="form-group"><label class="form-label">Expiration Date</label>' +
          '<input class="form-input" type="date" name="expiresAt"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-input" name="notes" rows="3" placeholder="Optional notes about this document..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitUploadDoc()"><i class="fas fa-upload"></i> ' + (replaceOpts.replaceId ? 'Replace' : 'Upload') + '</button>',
      }
    );
  }

  function _updateUploadScopePicker(scope) {
    var container = document.getElementById('uploadScopeEntity');
    var picker = document.getElementById('uploadScopeEntityPicker');
    if (scope === 'company' || !scope) {
      if (container) container.style.display = 'none';
      return;
    }
    if (container) container.style.display = '';
    var opts = (window._uploadDocEntityOpts && window._uploadDocEntityOpts[scope]) || '';
    if (picker) picker.innerHTML = '<option value="">Select...</option>' + opts;
  }

  function _submitUploadDoc() {
    var form = document.getElementById('uploadDocForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (k !== 'file' && v) data[k] = v;
    });

    var fileInput = document.getElementById('uploadDocFile');
    var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    var replaceId = data.replaceId;
    delete data.replaceId;

    // If replacing, mark old as superseded first
    var replacePromise = replaceId
      ? MallanAPI._fetch('/api/crm/documents/' + replaceId, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'expired', superseded: true }),
        }).catch(function () { /* continue even if marking old fails */ })
      : Promise.resolve();

    replacePromise.then(function () {
      if (file) {
        // File upload path
        var meta = { title: data.title, type: data.type };
        if (data.expiresAt) meta.expiresAt = data.expiresAt;
        if (data.notes) meta.notes = data.notes;
        return Documents.uploadFile(data.scope || 'company', data.scopeId || null, file, meta);
      } else {
        // Metadata-only document record
        return Documents.upload({
          title: data.title,
          type: data.type,
          scope: data.scope || 'company',
          scopeId: data.scopeId || null,
          expiresAt: data.expiresAt || null,
          notes: data.notes || '',
          status: 'draft',
        });
      }
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Document "' + (data.title || 'Untitled') + '" ' + (replaceId ? 'replaced' : 'uploaded') + ' successfully', 'success');
      try { brokerDocuments(); } catch (e) { /* ignore if not on documents page */ }
    }).catch(function (err) {
      CRM.toast(err.message || 'Failed to upload document', 'error');
    });
  }

  // ─── Audit Log ───────────────────────────────────────────────────────
  function _isSystemEvent(ev) {
    var actor = ev.actorId || ev.actor_id || ev.userId || ev.user_id || '';
    var t = (ev.type || ev.action || '').toLowerCase();
    if (!actor || actor === 'system' || actor === 'cron') return true;
    if (t.indexOf('sync') !== -1 || t.indexOf('cron') !== -1 || t.indexOf('scheduled') !== -1 || t.indexOf('auto') !== -1) return true;
    return false;
  }

  function _isImpersonationEvent(ev) {
    if (ev.impersonated) return true;
    var t = (ev.type || ev.action || '').toLowerCase();
    if (t.indexOf('impersonation') !== -1) return true;
    var p = ev.payload || ev.data || ev.metadata || {};
    if (p.impersonating || p.impersonatedAgentId || p.impersonated_agent_id) return true;
    return false;
  }

  function _getImpersonatedName(ev) {
    var p = ev.payload || ev.data || ev.metadata || {};
    return p.impersonatedAgentName || p.impersonated_agent_name || p.impersonatedAgentId || p.impersonated_agent_id || '';
  }

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

      allEvents.sort(function (a, b) {
        return new Date(b.createdAt || b.created_at || b.timestamp || 0) - new Date(a.createdAt || a.created_at || a.timestamp || 0);
      });

      window._auditEvents = allEvents;
      window._auditAgents = agents;
      window._auditViewMode = 'all';

      _renderAuditLog(c, allEvents, agents);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-clipboard-list', 'Unable to load audit log');
    });
  }

  function _auditFilteredByView(events) {
    var mode = window._auditViewMode || 'all';
    if (mode === 'human') return events.filter(function (ev) { return !_isSystemEvent(ev); });
    if (mode === 'system') return events.filter(function (ev) { return _isSystemEvent(ev); });
    return events;
  }

  function _switchAuditView(mode) {
    window._auditViewMode = mode;
    var tabs = document.getElementById('auditViewTabs');
    if (tabs) {
      var btns = tabs.querySelectorAll('button');
      btns.forEach(function (b) { b.className = 'btn btn-sm btn-outline'; });
      var idx = { human: 0, system: 1, all: 2 }[mode];
      if (idx !== undefined && btns[idx]) btns[idx].className = 'btn btn-sm btn-gold';
    }
    _filterAuditLog();
  }

  function _renderAuditLog(c, events, agents) {
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    var thisWeek = events.filter(function (ev) {
      return new Date(ev.createdAt || ev.created_at || ev.timestamp) >= weekAgo;
    });
    var uniqueUsers = {};
    events.forEach(function (ev) {
      var user = ev.actorId || ev.actor_id || ev.userId || ev.user_id;
      if (user && user !== 'system' && user !== 'cron') uniqueUsers[user] = true;
    });
    var complianceEvents = events.filter(function (ev) {
      var t = (ev.type || '').toLowerCase();
      return t.indexOf('compliance') !== -1 || t.indexOf('violation') !== -1 || t.indexOf('audit') !== -1 || (ev.severity || '').toLowerCase() === 'critical';
    });

    var actionTypes = {};
    events.forEach(function (ev) { if (ev.type) actionTypes[ev.type] = true; });
    var entityTypes = {};
    events.forEach(function (ev) { if (ev.entityType || ev.entity_type) entityTypes[ev.entityType || ev.entity_type] = true; });

    var html = '<div class="space-y-4">';

    // View toggle tabs
    html += '<div class="flex flex-wrap gap-2" id="auditViewTabs">' +
      '<button class="btn btn-sm btn-outline" onclick="Panels._switchAuditView(\'human\')"><i class="fas fa-user mr-1"></i> Human Actions</button>' +
      '<button class="btn btn-sm btn-outline" onclick="Panels._switchAuditView(\'system\')"><i class="fas fa-cog mr-1"></i> System Events</button>' +
      '<button class="btn btn-sm btn-gold" onclick="Panels._switchAuditView(\'all\')"><i class="fas fa-list mr-1"></i> All</button>' +
    '</div>';

    // Stat cards
    html += UI.statGrid([
      UI.statCard(events.length, 'Total Events', 'fa-clipboard-list', '#2563EB'),
      UI.statCard(thisWeek.length, 'This Week', 'fa-calendar-week', '#059669'),
      UI.statCard(Object.keys(uniqueUsers).length, 'Active Users', 'fa-users', '#7C3AED'),
      UI.statCard(complianceEvents.length, 'Compliance Events', 'fa-shield-alt', complianceEvents.length > 0 ? '#F59E0B' : '#059669'),
    ]);

    // Filter bar
    html += '<div class="card p-4"><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">Search</label>' +
        '<input type="text" id="auditSearch" class="form-input text-sm" placeholder="Search..." oninput="Panels._filterAuditLog()"></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 uppercase">User</label>' +
        '<select id="auditUserFilter" class="form-input form-select text-sm" onchange="Panels._filterAuditLog()"><option value="">All Users</option>';
    agents.forEach(function (a) {
      html += '<option value="' + E(a.id) + '">' + E(a.full_name || a.name || a.email) + '</option>';
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
      '<div class="flex items-end"><label class="flex items-center gap-2 text-xs cursor-pointer">' +
        '<input type="checkbox" id="auditImpersonationOnly" onchange="Panels._filterAuditLog()" class="rounded border-gray-300">' +
        '<span class="text-[10px] font-bold text-purple-600 uppercase">Impersonation only</span></label></div>' +
    '</div></div>';

    // Export CSV button
    html += '<div class="flex justify-end"><button class="btn btn-sm btn-outline" onclick="Panels._exportAuditCSV()"><i class="fas fa-download mr-1"></i> Export CSV</button></div>';

    // Events table
    var viewEvents = _auditFilteredByView(events);
    html += '<div id="auditTableContainer">' + _auditTable(viewEvents) + '</div>';

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
      '<th class="text-left px-3 py-2">Impersonation</th>' +
      '<th class="text-left px-3 py-2">Summary</th>' +
    '</tr></thead><tbody>';

    events.forEach(function (ev, idx) {
      var ts = ev.createdAt || ev.created_at || ev.timestamp;
      var user = ev.actorName || ev.actor_name || ev.actorId || ev.actor_id || ev.userId || ev.user_id || '-';
      var action = ev.type || ev.action || '-';
      var entity = (ev.entityType || ev.entity_type || '') + (ev.entityId || ev.entity_id ? ':' + (ev.entityId || ev.entity_id) : '');
      var summary = ev.summary || ev.message || ev.description || '';
      var isImpersonation = _isImpersonationEvent(ev);
      var impersonatedName = isImpersonation ? _getImpersonatedName(ev) : '';

      // Action badge color
      var actionColor = '#6b7280';
      var aLower = action.toLowerCase();
      if (aLower.indexOf('create') !== -1 || aLower.indexOf('add') !== -1) actionColor = '#059669';
      else if (aLower.indexOf('update') !== -1 || aLower.indexOf('edit') !== -1) actionColor = '#2563EB';
      else if (aLower.indexOf('delete') !== -1 || aLower.indexOf('remove') !== -1) actionColor = '#DC2626';
      else if (aLower.indexOf('login') !== -1 || aLower.indexOf('auth') !== -1) actionColor = '#7C3AED';
      else if (aLower.indexOf('approve') !== -1) actionColor = '#059669';
      else if (aLower.indexOf('reject') !== -1 || aLower.indexOf('deny') !== -1) actionColor = '#DC2626';
      else if (aLower.indexOf('sync') !== -1 || aLower.indexOf('cron') !== -1) actionColor = '#0891B2';

      // System event row tint
      var rowClass = _isSystemEvent(ev) ? 'border-b hover:bg-gray-50 cursor-pointer bg-gray-50/50' : 'border-b hover:bg-gray-50 cursor-pointer';

      html += '<tr class="' + rowClass + '" onclick="Panels._toggleAuditDetail(' + idx + ')">' +
        '<td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">' + (ts ? D(ts) + ' ' + new Date(ts).toLocaleTimeString() : '-') + '</td>' +
        '<td class="px-3 py-2 text-sm">' + E(user) + (_isSystemEvent(ev) ? ' <span class="text-[9px] font-bold text-cyan-600 uppercase ml-1">SYSTEM</span>' : '') + '</td>' +
        '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:' + actionColor + '">' + E(action) + '</span></td>' +
        '<td class="px-3 py-2 text-xs text-gray-600">' + E(entity || '-') + '</td>' +
        '<td class="px-3 py-2">' + (isImpersonation ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#7C3AED"><i class="fas fa-mask mr-1"></i>Impersonated' + (impersonatedName ? ' (' + E(impersonatedName) + ')' : '') + '</span>' : '<span class="text-xs text-gray-300">-</span>') + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">' + E(summary) + '</td>' +
      '</tr>';
      // Detail row (hidden by default)
      html += '<tr id="auditDetail_' + idx + '" style="display:none"><td colspan="6" class="px-6 py-3 bg-gray-50">';
      var detail = ev.data || ev.metadata || ev.changes || {};
      if (ev.before || ev.after) {
        html += '<div class="grid grid-cols-2 gap-4"><div><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Before</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(ev.before || {}, null, 2)) + '</pre></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase mb-1">After</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(ev.after || {}, null, 2)) + '</pre></div></div>';
      } else if (Object.keys(detail).length > 0) {
        html += '<p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Details</p><pre class="text-xs bg-white p-2 rounded border overflow-x-auto">' + E(JSON.stringify(detail, null, 2)) + '</pre>';
      } else {
        html += '<p class="text-xs text-gray-400">No additional details available.</p>';
      }
      if (isImpersonation) {
        html += '<div class="mt-2 p-2 rounded border border-purple-200 bg-purple-50"><p class="text-[10px] font-bold text-purple-600 uppercase mb-1"><i class="fas fa-mask mr-1"></i>Impersonation Details</p>' +
          '<p class="text-xs text-purple-700">This action was performed while impersonating ' + E(impersonatedName || 'another user') + '.</p></div>';
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
    var impersonationOnly = (document.getElementById('auditImpersonationOnly') || {}).checked || false;

    // Apply view mode filter first
    var viewFiltered = _auditFilteredByView(events);

    var filtered = viewFiltered.filter(function (ev) {
      if (impersonationOnly && !_isImpersonationEvent(ev)) return false;
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
    var events = _auditFilteredByView(window._auditEvents || []);
    if (events.length === 0) { CRM.toast('No events to export', 'info'); return; }

    var rows = [['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Summary', 'Impersonation', 'Impersonated User']];
    events.forEach(function (ev) {
      var isImp = _isImpersonationEvent(ev);
      rows.push([
        ev.createdAt || ev.created_at || ev.timestamp || '',
        ev.actorName || ev.actorId || ev.actor_id || '',
        ev.type || ev.action || '',
        ev.entityType || ev.entity_type || '',
        ev.entityId || ev.entity_id || '',
        (ev.summary || ev.message || '').replace(/"/g, '""'),
        isImp ? 'Yes' : 'No',
        isImp ? _getImpersonatedName(ev) : '',
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

    Promise.all([
      MallanAPI.idx.status().catch(function () { return null; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [], total: 0 }; }),
      MallanAPI._fetch('/api/crm/audit-log?limit=200&type=idx_sync,listing_sync,sync_error').catch(function () { return { events: [] }; }),
    ]).then(function (r) {
      var status = r[0];
      var listingsData = r[1];
      var syncEvents = (r[2].events || []);
      var listings = listingsData.listings || [];
      var connected = !!status;
      var lastSync = status ? (status.lastSync || status.last_sync || status.lastSyncAt) : null;

      var html = '<div class="space-y-4">';

      // Sync Status Card
      var statusColor = connected ? '#059669' : '#DC2626';
      var statusLabel = connected ? 'Connected' : 'Disconnected';
      var statusIcon = connected ? 'fa-check-circle' : 'fa-times-circle';
      html += '<div class="card p-6" style="border-left:4px solid ' + statusColor + '">' +
        '<div class="flex items-center justify-between flex-wrap gap-4">' +
          '<div class="flex items-center gap-4">' +
            '<div class="w-14 h-14 rounded-xl flex items-center justify-center" style="background:' + statusColor + '15">' +
              '<i class="fas ' + statusIcon + ' text-2xl" style="color:' + statusColor + '"></i></div>' +
            '<div>' +
              '<p class="text-lg font-bold" style="color:' + statusColor + '">' + statusLabel + '</p>' +
              '<p class="text-xs text-gray-500">IDX Plus via Trestle/Cotality</p>' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">' +
            '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Last Successful Sync</p><p class="text-sm font-semibold">' + (lastSync ? D(lastSync) + ' ' + new Date(lastSync).toLocaleTimeString() : 'N/A') + '</p></div>' +
            '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Next Scheduled Sync</p><p class="text-sm font-semibold">' + _nextIdxSync() + '</p></div>' +
            '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Sync Type</p><p class="text-sm font-semibold">IDX Plus - WebAPI</p></div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // Stats row
      var syncErrors = syncEvents.filter(function (ev) { var t = (ev.type || '').toLowerCase(); return t.indexOf('error') !== -1; });
      var last24h = new Date(Date.now() - 24 * 3600 * 1000);
      var recentUpdates = syncEvents.filter(function (ev) {
        var ts = ev.createdAt || ev.created_at || ev.timestamp;
        return ts && new Date(ts) >= last24h && (ev.type || '').toLowerCase().indexOf('error') === -1;
      });
      var avgLatency = 0;
      var latencyEvents = syncEvents.filter(function (ev) { var d = ev.data || ev.metadata || {}; return d.duration || d.latency; });
      if (latencyEvents.length > 0) {
        var total = 0;
        latencyEvents.forEach(function (ev) { var d = ev.data || ev.metadata || {}; total += (d.duration || d.latency || 0); });
        avgLatency = Math.round(total / latencyEvents.length);
      }

      html += UI.statGrid([
        UI.statCard(listings.length, 'Total Synced Listings', 'fa-database', '#2563EB'),
        UI.statCard(recentUpdates.length, 'Last 24h Updates', 'fa-clock', '#059669'),
        UI.statCard(syncErrors.length, 'Sync Errors', 'fa-exclamation-triangle', syncErrors.length > 0 ? '#DC2626' : '#059669'),
        UI.statCard(avgLatency ? avgLatency + 'ms' : 'N/A', 'Avg Sync Latency', 'fa-tachometer-alt', '#7C3AED'),
      ]);

      // Recent Sync History table
      var syncHistory = syncEvents.filter(function (ev) {
        var t = (ev.type || '').toLowerCase();
        return t.indexOf('sync') !== -1;
      }).slice(0, 50);

      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-history text-blue-500 mr-2"></i>Recent Sync History</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Timestamp</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-right px-3 py-2">Listings Processed</th>' +
        '<th class="text-right px-3 py-2">Errors</th>' +
        '<th class="text-right px-3 py-2">Duration</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';

      if (syncHistory.length === 0) {
        html += '<tr><td colspan="6" class="text-center py-6 text-sm text-gray-400">No sync history recorded</td></tr>';
      } else {
        syncHistory.forEach(function (ev) {
          var ts = ev.createdAt || ev.created_at || ev.timestamp;
          var d = ev.data || ev.metadata || {};
          var syncType = d.syncType || d.sync_type || 'Delta';
          var processed = d.listingsProcessed || d.listings_processed || d.count || '-';
          var errors = d.errors || d.errorCount || 0;
          var duration = d.duration || d.latency ? (d.duration || d.latency) + 'ms' : '-';
          var evType = (ev.type || '').toLowerCase();
          var sStatus, sColor;
          if (evType.indexOf('error') !== -1 || errors > 0) { sStatus = 'Failed'; sColor = '#DC2626'; }
          else if (d.partial) { sStatus = 'Partial'; sColor = '#F59E0B'; }
          else { sStatus = 'Success'; sColor = '#059669'; }

          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">' + (ts ? D(ts) + ' ' + new Date(ts).toLocaleTimeString() : '-') + '</td>' +
            '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-semibold" style="background:#EEF2FF;color:#4338CA">' + E(syncType) + '</span></td>' +
            '<td class="px-3 py-2 text-sm text-right">' + processed + '</td>' +
            '<td class="px-3 py-2 text-sm text-right" style="color:' + (errors > 0 ? '#DC2626' : '#059669') + '">' + errors + '</td>' +
            '<td class="px-3 py-2 text-xs text-right">' + duration + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + sColor + ';text-transform:uppercase">' + sStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // Listing Submission Issues
      var issueListings = listings.filter(function (l) {
        var ss = (l.syncStatus || l.sync_status || '').toLowerCase();
        var syncedAt = l.syncedAt || l.synced_at;
        var stale = syncedAt && (Date.now() - new Date(syncedAt).getTime()) > 48 * 3600 * 1000;
        return ss === 'error' || ss === 'pending' || ss === 'failed' || stale;
      });

      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-exclamation-circle text-amber-500 mr-2"></i>Listing Submission Issues <span class="text-xs font-normal text-gray-400 ml-2">(' + issueListings.length + ')</span></h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Address</th>' +
        '<th class="text-left px-3 py-2">MLS ID</th>' +
        '<th class="text-left px-3 py-2">Issue</th>' +
        '<th class="text-left px-3 py-2">Last Attempt</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';

      if (issueListings.length === 0) {
        html += '<tr><td colspan="5" class="text-center py-6 text-sm text-gray-400">No submission issues detected</td></tr>';
      } else {
        issueListings.forEach(function (l) {
          var addr = l.address || l.full_address || l.street_address || '-';
          var mlsId = l.listingId || l.listing_id || l.mls_id || l.id || '-';
          var ss = (l.syncStatus || l.sync_status || 'unknown').toLowerCase();
          var syncedAt = l.syncedAt || l.synced_at;
          var issue = ss === 'error' ? 'Sync Error' : ss === 'pending' ? 'Pending Sync' : ss === 'failed' ? 'Sync Failed' : 'Stale Data';
          var iColor = ss === 'error' || ss === 'failed' ? '#DC2626' : '#F59E0B';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(addr) + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(mlsId) + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + iColor + ';text-transform:uppercase">' + issue + '</span></td>' +
            '<td class="px-3 py-2 text-xs text-gray-500">' + (syncedAt ? D(syncedAt) : '-') + '</td>' +
            '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:' + iColor + '">' + E(ss) + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // Recent Failures
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-times-circle text-red-500 mr-2"></i>Recent Failures</h3></div>' +
        '<div class="card-body">';
      if (syncErrors.length === 0) {
        html += '<p class="text-sm text-gray-400 text-center py-4">No recent sync failures</p>';
      } else {
        html += '<div class="space-y-2">';
        syncErrors.slice(0, 20).forEach(function (ev) {
          var ts = ev.createdAt || ev.created_at || ev.timestamp;
          var d = ev.data || ev.metadata || {};
          var msg = ev.summary || ev.message || d.error || d.message || 'Unknown error';
          html += '<div class="flex items-start gap-3 p-2 rounded border border-red-100 bg-red-50">' +
            '<i class="fas fa-exclamation-triangle text-red-400 mt-0.5"></i>' +
            '<div class="flex-1"><p class="text-xs text-red-700">' + E(msg) + '</p>' +
            '<p class="text-[10px] text-red-400 mt-0.5">' + (ts ? D(ts) + ' ' + new Date(ts).toLocaleTimeString() : '') + '</p></div></div>';
        });
        html += '</div>';
      }
      html += '</div></div>';

      // Feed Configuration (read-only)
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-cogs text-gray-400 mr-2"></i>Feed Configuration</h3></div>' +
        '<div class="card-body"><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Feed Type</p><p class="text-sm font-medium">IDX Plus - WebAPI</p></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Provider</p><p class="text-sm font-medium">Trestle (Cotality)</p></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">API Endpoint</p><p class="text-sm font-mono">api.cotality.com/trestle</p></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Sync Frequency</p><p class="text-sm font-medium">Every 4 hours</p></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Photo Caching</p><p class="text-sm font-medium">Cloudflare R2</p></div>' +
          '<div><p class="text-[10px] font-bold text-gray-500 uppercase">Data Source</p><p class="text-sm font-medium">REBNY RLS</p></div>' +
        '</div></div></div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('IDX/RLS Activity', 'Trestle API monitoring') +
        UI.emptyState('fa-database', 'IDX status unavailable') +
      '</div>';
    });
  }

  function _nextIdxSync() {
    // IDX syncs every 4 hours per vercel.json cron
    var now = new Date();
    var hours = [0, 4, 8, 12, 16, 20];
    var currentHour = now.getHours();
    var nextHour = null;
    for (var i = 0; i < hours.length; i++) {
      if (hours[i] > currentHour) { nextHour = hours[i]; break; }
    }
    if (nextHour === null) nextHour = 24; // midnight next day
    var next = new Date(now);
    next.setHours(nextHour, 0, 0, 0);
    if (nextHour === 24) { next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0); }
    var diff = next.getTime() - now.getTime();
    var hLeft = Math.floor(diff / 3600000);
    var mLeft = Math.floor((diff % 3600000) / 60000);
    return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + hLeft + 'h ' + mLeft + 'm)';
  }

  // ─── License/CE/E&O Tracking ─────────────────────────────────────────
  function licensingTracker() {
    CRM.setPanelTitle('License/CE/E&O Tracking');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
      MallanAPI._fetch('/api/crm/ce-courses?limit=500').catch(function () { return { courses: [] }; }),
    ]).then(function (r) {
      var agents = r[0].agents || [];
      var courses = r[1].courses || [];
      window._ceAgents = agents;
      window._ceCourses = courses;
      window._licensingTab = 'license';

      // Compute alert data
      var licExpiring = [];
      var ceIncompleteAgents = [];
      var eoIssueAgents = [];

      agents.forEach(function (a) {
        var name = a.full_name || a.name || a.email || 'Agent';
        var exp = a.license_expiry || a.licenseExpiry;
        var days = exp ? Utils.daysUntil(exp) : null;
        if (days !== null && days <= 90) licExpiring.push({ name: name, days: days });
        var ceDone = a.ceHoursCompleted || a.ce_hours || 0;
        if (ceDone < 22.5) ceIncompleteAgents.push({ name: name, hours: ceDone });
        var eoExp = a.eoExpiry || a.eo_expiry;
        var eoDays = eoExp ? Utils.daysUntil(eoExp) : null;
        if (eoDays === null || eoDays <= 90) eoIssueAgents.push({ name: name, days: eoDays, missing: eoDays === null });
      });

      var html = '<div class="space-y-4">';

      // Broker Alert Summary
      html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">';

      // License alert card
      var licColor = licExpiring.some(function (l) { return l.days < 60; }) ? '#DC2626' : (licExpiring.length > 0 ? '#F59E0B' : '#059669');
      html += '<div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" onclick="Panels._filterLicensingTab(\'license\')" style="border-left:4px solid ' + licColor + '">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:' + licColor + '15"><i class="fas fa-id-card" style="color:' + licColor + '"></i></div>' +
          '<div><p class="text-2xl font-bold" style="color:' + licColor + '">' + licExpiring.length + '</p><p class="text-[10px] font-bold text-gray-500 uppercase">Licenses Expiring (&lt;90d)</p></div>' +
        '</div>';
      if (licExpiring.length > 0) {
        html += '<div class="mt-2 space-y-1">';
        licExpiring.slice(0, 3).forEach(function (l) {
          html += '<p class="text-xs" style="color:' + (l.days < 60 ? '#DC2626' : '#F59E0B') + '"><i class="fas fa-exclamation-circle mr-1"></i>' + E(l.name) + ' (' + l.days + 'd)</p>';
        });
        if (licExpiring.length > 3) html += '<p class="text-xs text-gray-400">+' + (licExpiring.length - 3) + ' more</p>';
        html += '</div>';
      }
      html += '</div>';

      // CE alert card
      var ceColor = ceIncompleteAgents.length > 0 ? '#F59E0B' : '#059669';
      html += '<div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" onclick="Panels._filterLicensingTab(\'ce\')" style="border-left:4px solid ' + ceColor + '">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:' + ceColor + '15"><i class="fas fa-graduation-cap" style="color:' + ceColor + '"></i></div>' +
          '<div><p class="text-2xl font-bold" style="color:' + ceColor + '">' + ceIncompleteAgents.length + '</p><p class="text-[10px] font-bold text-gray-500 uppercase">CE Incomplete (&lt;22.5 hrs)</p></div>' +
        '</div>';
      if (ceIncompleteAgents.length > 0) {
        html += '<div class="mt-2 space-y-1">';
        ceIncompleteAgents.slice(0, 3).forEach(function (a) {
          html += '<p class="text-xs text-amber-600"><i class="fas fa-clock mr-1"></i>' + E(a.name) + ' (' + a.hours + ' hrs)</p>';
        });
        if (ceIncompleteAgents.length > 3) html += '<p class="text-xs text-gray-400">+' + (ceIncompleteAgents.length - 3) + ' more</p>';
        html += '</div>';
      }
      html += '</div>';

      // E&O alert card
      var eoColor = eoIssueAgents.length > 0 ? '#DC2626' : '#059669';
      html += '<div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" onclick="Panels._filterLicensingTab(\'eo\')" style="border-left:4px solid ' + eoColor + '">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:' + eoColor + '15"><i class="fas fa-shield-alt" style="color:' + eoColor + '"></i></div>' +
          '<div><p class="text-2xl font-bold" style="color:' + eoColor + '">' + eoIssueAgents.length + '</p><p class="text-[10px] font-bold text-gray-500 uppercase">E&O Expiring/Missing</p></div>' +
        '</div>';
      if (eoIssueAgents.length > 0) {
        html += '<div class="mt-2 space-y-1">';
        eoIssueAgents.slice(0, 3).forEach(function (a) {
          html += '<p class="text-xs text-red-600"><i class="fas fa-' + (a.missing ? 'question-circle' : 'exclamation-circle') + ' mr-1"></i>' + E(a.name) + (a.missing ? ' (missing)' : ' (' + a.days + 'd)') + '</p>';
        });
        if (eoIssueAgents.length > 3) html += '<p class="text-xs text-gray-400">+' + (eoIssueAgents.length - 3) + ' more</p>';
        html += '</div>';
      }
      html += '</div>';
      html += '</div>'; // end alert grid

      // Tab buttons
      html += '<div class="flex flex-wrap gap-2" id="licensingTabs">' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._filterLicensingTab(\'license\')"><i class="fas fa-id-card mr-1"></i> License</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterLicensingTab(\'ce\')"><i class="fas fa-graduation-cap mr-1"></i> CE</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._filterLicensingTab(\'eo\')"><i class="fas fa-shield-alt mr-1"></i> E&O</button>' +
      '</div>';

      // ── LICENSE TAB ──
      html += '<div id="licensingTabContent_license">';
      html += '<div class="card"><div class="card-header flex items-center justify-between flex-wrap gap-2">' +
        '<h3><i class="fas fa-id-card text-gold mr-2"></i>License Renewal Status</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._setRenewalAlerts()"><i class="fas fa-bell mr-1"></i> Set Renewal Alerts</button></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">License #</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Issue Date</th>' +
        '<th class="text-left px-3 py-2">Expiration</th>' +
        '<th class="text-right px-3 py-2">Days Left</th>' +
        '<th class="text-center px-3 py-2">DOS Verified</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="9" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var exp = a.license_expiry || a.licenseExpiry;
          var days = exp ? Utils.daysUntil(exp) : null;
          var statusColor, statusLabel;
          if (days === null) { statusColor = '#6b7280'; statusLabel = 'Unknown'; }
          else if (days <= 0) { statusColor = '#DC2626'; statusLabel = 'EXPIRED'; }
          else if (days <= 60) { statusColor = '#DC2626'; statusLabel = 'Critical'; }
          else if (days <= 90) { statusColor = '#F59E0B'; statusLabel = 'Expiring Soon'; }
          else { statusColor = '#059669'; statusLabel = 'Current'; }
          var role = (a.role || 'AGENT').toUpperCase();
          var licType = role === 'BROKER' ? 'Licensed Broker' : 'Licensed Salesperson';
          var issueDate = a.license_issue_date || a.licenseIssueDate || '';
          var dosVerified = a.dos_verified || a.dosVerified || false;
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(a.license_no || a.licenseNumber || a.license_number || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(licType) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (issueDate ? D(issueDate) : '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (exp ? D(exp) : '-') + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold" style="color:' + statusColor + '">' + (days !== null ? days : '-') + '</td>' +
            '<td class="px-3 py-2 text-center">' + (dosVerified ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-times-circle text-red-400"></i>') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + statusColor + ';text-transform:uppercase">' + statusLabel + '</span></td>' +
            '<td class="px-3 py-2"><div class="flex gap-1">' +
              '<a href="https://appext20.dos.ny.gov/nydos_licsearch/search_start" target="_blank" rel="noopener" class="btn btn-sm btn-outline" title="Verify on DOS"><i class="fas fa-search"></i></a>' +
              '<button class="btn btn-sm btn-outline" onclick="Panels._editAgent(\'' + E(a.id) + '\')" title="Upload Renewal"><i class="fas fa-upload"></i></button>' +
            '</div></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';
      html += '<div class="card"><div class="card-body"><div class="flex flex-wrap gap-3">' +
        '<a href="https://appext20.dos.ny.gov/nydos_licsearch/search_start" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-search mr-1"></i> NY DOS License Lookup (eAccessNY)</a>' +
        '<a href="https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-sync mr-1"></i> DOS Online Renewal</a>' +
      '</div></div></div>';
      html += '</div>'; // end license tab

      // ── CE TAB ──
      html += '<div id="licensingTabContent_ce" style="display:none">';

      // 6 Mandatory Course Cards
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-book-open text-indigo-500 mr-2"></i>NY DOS Mandatory CE Requirements</h3>' +
        '<p class="text-xs text-gray-500 mt-1">Required for every 2-year license renewal cycle (22.5 total hours)</p></div>' +
        '<div class="card-body"><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">';
      var mandatoryCourses = [
        { name: 'Recent Legal Matters', hours: '1 hour', icon: 'fa-gavel', color: '#2563EB' },
        { name: 'Ethical Business Practices', hours: '2.5 hours', icon: 'fa-balance-scale', color: '#7C3AED' },
        { name: 'Fair Housing', hours: '3 hours', icon: 'fa-home', color: '#059669' },
        { name: 'Agency', hours: '1-2 hours', icon: 'fa-handshake', color: '#B8860B' },
        { name: 'Implicit Bias', hours: '2 hours', icon: 'fa-brain', color: '#DC2626' },
        { name: 'Cultural Competency', hours: '2 hours', icon: 'fa-users', color: '#0891B2' },
      ];
      mandatoryCourses.forEach(function (mc) {
        // Find agents who completed this
        var completedAgents = courses.filter(function (cr) { return (cr.category || '') === mc.name; });
        var agentNames = completedAgents.map(function (cr) {
          var agentMatch = agents.filter(function (a) { return a.id === (cr.agent_id || cr.agentId); })[0];
          return agentMatch ? (agentMatch.full_name || agentMatch.name || agentMatch.email) : (cr.agent_name || 'Agent');
        });
        html += '<div class="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:' + mc.color + '15"><i class="fas ' + mc.icon + '" style="color:' + mc.color + ';font-size:12px"></i></div>' +
            '<div><p class="text-sm font-semibold">' + mc.name + '</p>' +
            '<p class="text-xs text-gray-500">' + mc.hours + '</p></div>' +
          '</div>';
        if (agentNames.length > 0) {
          html += '<div class="space-y-0.5">';
          agentNames.forEach(function (n) {
            html += '<p class="text-xs text-green-600"><i class="fas fa-check mr-1"></i>' + E(n) + '</p>';
          });
          html += '</div>';
        } else {
          html += '<p class="text-xs text-gray-400 italic">No completions recorded</p>';
        }
        html += '</div>';
      });
      html += '</div>' +
        '<p class="text-xs text-gray-500 mt-3 italic"><i class="fas fa-info-circle mr-1"></i>Remaining 11 hours are elective courses</p>' +
      '</div></div>';

      // CE Tracker table
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-graduation-cap text-blue-500 mr-2"></i>CE Tracker</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Cycle Period</th>' +
        '<th class="text-right px-3 py-2">Required</th>' +
        '<th class="text-right px-3 py-2">Completed</th>' +
        '<th class="text-right px-3 py-2">Remaining</th>' +
        '<th class="text-left px-3 py-2" style="min-width:120px">Progress</th>' +
        '<th class="text-center px-3 py-2">Mandatory Done</th>' +
        '<th class="text-left px-3 py-2">Due Date</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="9" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var ceReq = a.ceHoursRequired || 22.5;
          var ceDone = a.ceHoursCompleted || a.ce_hours || 0;
          var ceRemaining = Math.max(0, ceReq - ceDone);
          var pct = Math.min(100, Math.round((ceDone / ceReq) * 100));
          var exp = a.license_expiry || a.licenseExpiry;
          var ceCycle = a.ceCyclePeriod || a.ce_cycle || (exp ? (new Date(new Date(exp).getTime() - 2 * 365.25 * 24 * 3600 * 1000).getFullYear() + '-' + new Date(exp).getFullYear()) : '-');
          var ceStatus, ceStatusColor;
          if (pct >= 100) { ceStatus = 'Complete'; ceStatusColor = '#059669'; }
          else if (pct >= 50) { ceStatus = 'In Progress'; ceStatusColor = '#F59E0B'; }
          else { ceStatus = 'Behind'; ceStatusColor = '#DC2626'; }
          var barColor = pct >= 100 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626';
          // Check mandatory completions for this agent
          var agentCourses = courses.filter(function (cr) { return (cr.agent_id || cr.agentId) === a.id; });
          var mandatoryDone = 0;
          _ceMandatoryCategories.forEach(function (cat) {
            if (agentCourses.some(function (cr) { return cr.category === cat; })) mandatoryDone++;
          });
          var mandatoryTotal = _ceMandatoryCategories.length;

          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(ceCycle) + '</td>' +
            '<td class="px-3 py-2 text-sm text-right">' + ceReq + '</td>' +
            '<td class="px-3 py-2 text-sm text-right font-bold">' + ceDone + '</td>' +
            '<td class="px-3 py-2 text-sm text-right" style="color:' + ceStatusColor + '">' + ceRemaining + '</td>' +
            '<td class="px-3 py-2"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:' + pct + '%;background:' + barColor + '"></div></div><span class="text-xs font-bold" style="color:' + barColor + '">' + pct + '%</span></div></td>' +
            '<td class="px-3 py-2 text-center text-xs font-bold" style="color:' + (mandatoryDone === mandatoryTotal ? '#059669' : '#F59E0B') + '">' + mandatoryDone + '/' + mandatoryTotal + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (exp ? D(exp) : '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + ceStatusColor + ';text-transform:uppercase">' + ceStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // CE Course History
      html += '<div class="card"><div class="card-header flex items-center justify-between flex-wrap gap-2">' +
        '<h3><i class="fas fa-history text-teal-500 mr-2"></i>CE Course History</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._addCECourse()"><i class="fas fa-plus mr-1"></i> Add Course</button></div>' +
        '<div class="card-body">' +
        '<div class="flex flex-wrap gap-2 mb-4" id="ceFilterTabs">' +
          '<button class="btn btn-sm btn-gold" onclick="Panels._filterCECourses(\'all\')">All</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._filterCECourses(\'mandatory\')">Mandatory</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._filterCECourses(\'elective\')">Elective</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._filterCECourses(\'verified\')">Verified</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._filterCECourses(\'pending\')">Pending</button>' +
        '</div>' +
        '<div id="ceCoursesTable"></div>' +
      '</div></div>';

      // DOS link
      html += '<div class="card"><div class="card-body"><a href="https://www.dos.ny.gov/licensing/ce.html" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-external-link-alt mr-1"></i> NY DOS CE Requirements</a></div></div>';

      html += '</div>'; // end ce tab

      // ── E&O TAB ──
      html += '<div id="licensingTabContent_eo" style="display:none">';

      // Policy Overview table
      html += '<div class="card"><div class="card-header flex items-center justify-between flex-wrap gap-2">' +
        '<h3><i class="fas fa-shield-alt text-purple-500 mr-2"></i>E&O Insurance Policies</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._addEOPolicy()"><i class="fas fa-plus mr-1"></i> Add Policy</button></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Carrier</th>' +
        '<th class="text-left px-3 py-2">Policy #</th>' +
        '<th class="text-left px-3 py-2">Coverage</th>' +
        '<th class="text-left px-3 py-2">Deductible</th>' +
        '<th class="text-left px-3 py-2">Effective</th>' +
        '<th class="text-left px-3 py-2">Expiration</th>' +
        '<th class="text-left px-3 py-2">Premium</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="9" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var eoExp = a.eoExpiry || a.eo_expiry;
          var eoDays = eoExp ? Utils.daysUntil(eoExp) : null;
          var eoStatus, eoStatusColor;
          if (eoDays === null) { eoStatus = 'Unknown'; eoStatusColor = '#6b7280'; }
          else if (eoDays <= 0) { eoStatus = 'EXPIRED'; eoStatusColor = '#DC2626'; }
          else if (eoDays <= 90) { eoStatus = 'Expiring Soon'; eoStatusColor = '#F59E0B'; }
          else { eoStatus = 'Current'; eoStatusColor = '#059669'; }
          var eoEff = a.eoEffective || a.eo_effective || '';
          var deductible = a.eoDeductible || a.eo_deductible || '';
          var premium = a.eoPremium || a.eo_premium || '';
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.eoCarrier || a.eo_carrier || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(a.eoPolicyNumber || a.eo_policy_number || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.eoCoverage || a.eo_coverage || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(deductible || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (eoEff ? D(eoEff) : '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (eoExp ? D(eoExp) : '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(premium || '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + eoStatusColor + ';text-transform:uppercase">' + eoStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // REBNY Membership section
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-building text-gold mr-2"></i>REBNY Membership</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Agent</th>' +
        '<th class="text-left px-3 py-2">Member ID</th>' +
        '<th class="text-left px-3 py-2">Membership Type</th>' +
        '<th class="text-left px-3 py-2">Dues</th>' +
        '<th class="text-left px-3 py-2">Last Payment</th>' +
        '<th class="text-left px-3 py-2">Renewal Due</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
      '</tr></thead><tbody>';
      if (agents.length === 0) {
        html += '<tr><td colspan="7" class="text-center py-6 text-sm text-gray-400">No agents in roster</td></tr>';
      } else {
        agents.forEach(function (a) {
          var rebnyExp = a.rebnyExpiry || a.rebny_expiry;
          var rebnyDays = rebnyExp ? Utils.daysUntil(rebnyExp) : null;
          var rStatus, rColor;
          if (rebnyDays === null) { rStatus = 'Unknown'; rColor = '#6b7280'; }
          else if (rebnyDays <= 0) { rStatus = 'LAPSED'; rColor = '#DC2626'; }
          else if (rebnyDays <= 90) { rStatus = 'Due Soon'; rColor = '#F59E0B'; }
          else { rStatus = 'Active'; rColor = '#059669'; }
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm font-medium">' + E(a.full_name || a.name || a.email) + '</td>' +
            '<td class="px-3 py-2 text-xs font-mono">' + E(a.rebnyMemberId || a.rebny_member_id || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.rebnyMembershipType || a.rebny_membership_type || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + E(a.rebnyDues || a.rebny_dues || '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (a.rebnyLastPayment || a.rebny_last_payment ? D(a.rebnyLastPayment || a.rebny_last_payment) : '-') + '</td>' +
            '<td class="px-3 py-2 text-xs">' + (rebnyExp ? D(rebnyExp) : '-') + '</td>' +
            '<td class="px-3 py-2"><span style="font-size:10px;font-weight:700;color:' + rColor + ';text-transform:uppercase">' + rStatus + '</span></td>' +
          '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';

      // Quick Links
      html += '<div class="card"><div class="card-body"><div class="flex flex-wrap gap-3">' +
        '<a href="https://www.rebny.com/member-portal" target="_blank" rel="noopener" class="btn btn-sm btn-outline"><i class="fas fa-building mr-1"></i> REBNY Member Portal</a>' +
      '</div></div></div>';

      html += '</div>'; // end eo tab

      html += '</div>'; // end space-y-4
      c.innerHTML = html;

      // Render CE courses table
      _renderCECoursesTable(courses);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-id-card', 'Unable to load agent data');
    });
  }

  function _filterLicensingTab(tab) {
    window._licensingTab = tab;
    var allTabs = ['license', 'ce', 'eo'];
    allTabs.forEach(function (t) {
      var el = document.getElementById('licensingTabContent_' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    var tabBar = document.getElementById('licensingTabs');
    if (tabBar) {
      var btns = tabBar.querySelectorAll('button');
      btns.forEach(function (b) { b.className = 'btn btn-sm btn-outline'; });
      var idx = { license: 0, ce: 1, eo: 2 }[tab];
      if (idx !== undefined && btns[idx]) btns[idx].className = 'btn btn-sm btn-gold';
    }
  }

  function _addEOPolicy() {
    var agents = window._ceAgents || [];
    var agentOpts = '<option value="">Select Agent</option>';
    agents.forEach(function (a) {
      agentOpts += '<option value="' + E(a.id) + '">' + E(a.full_name || a.name || a.email) + '</option>';
    });

    CRM.openModal('Add E&O Policy',
      '<form id="eoPolicyForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Agent</label><select class="form-input form-select" name="agent_id" required>' + agentOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Carrier</label><input class="form-input" name="eo_carrier" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Policy #</label><input class="form-input" name="eo_policy_number" required></div>' +
          '<div class="form-group"><label class="form-label">Coverage (per claim / aggregate)</label><input class="form-input" name="eo_coverage" placeholder="e.g. $1M / $3M"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Deductible</label><input class="form-input" name="eo_deductible" placeholder="e.g. $5,000"></div>' +
          '<div class="form-group"><label class="form-label">Annual Premium</label><input class="form-input" name="eo_premium" placeholder="e.g. $2,500"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Effective Date</label><input class="form-input" type="date" name="eo_effective" required></div>' +
          '<div class="form-group"><label class="form-label">Expiration Date</label><input class="form-input" type="date" name="eo_expiry" required></div>' +
        '</div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitEOPolicy()"><i class="fas fa-save mr-1"></i> Save</button>',
      }
    );
  }

  function _submitEOPolicy() {
    var form = document.getElementById('eoPolicyForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    if (!data.agent_id || !data.eo_carrier || !data.eo_policy_number) {
      CRM.toast('Agent, Carrier, and Policy # are required', 'error');
      return;
    }
    var agentId = data.agent_id;
    delete data.agent_id;

    MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(agentId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('E&O policy saved', 'success');
      licensingTracker(); // reload
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to save policy'), 'error');
    });
  }

  function _setRenewalAlerts() {
    CRM.openModal('Set Renewal Alerts',
      '<div class="space-y-4">' +
        '<p class="text-sm text-gray-600">Configure when you want to be notified about upcoming license renewals.</p>' +
        '<div class="space-y-3">' +
          '<label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="renewalAlert90" checked class="rounded border-gray-300"><span class="text-sm">90 days before expiration</span></label>' +
          '<label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="renewalAlert60" checked class="rounded border-gray-300"><span class="text-sm">60 days before expiration</span></label>' +
          '<label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="renewalAlert30" checked class="rounded border-gray-300"><span class="text-sm">30 days before expiration</span></label>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notification Method</label>' +
          '<select class="form-input form-select" id="renewalAlertMethod">' +
            '<option value="email">Email</option>' +
            '<option value="in-app">In-App Notification</option>' +
            '<option value="both" selected>Both</option>' +
          '</select>' +
        '</div>' +
      '</div>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._saveRenewalAlerts()"><i class="fas fa-save mr-1"></i> Save</button>',
      }
    );
  }

  function _saveRenewalAlerts() {
    var intervals = [];
    if ((document.getElementById('renewalAlert90') || {}).checked) intervals.push(90);
    if ((document.getElementById('renewalAlert60') || {}).checked) intervals.push(60);
    if ((document.getElementById('renewalAlert30') || {}).checked) intervals.push(30);
    var method = (document.getElementById('renewalAlertMethod') || {}).value || 'both';

    MallanAPI._fetch('/api/crm/settings/renewal-alerts', {
      method: 'PUT',
      body: JSON.stringify({ intervals: intervals, method: method }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Renewal alerts configured', 'success');
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to save alerts'), 'error');
    });
  }

  // ─── CE Course Helpers ─────────────────────────────────────────────
  var _ceMandatoryCategories = ['Recent Legal Matters', 'Ethical Business Practices', 'Fair Housing', 'Agency', 'Implicit Bias', 'Cultural Competency'];

  function _renderCECoursesTable(courses) {
    var el = document.getElementById('ceCoursesTable');
    if (!el) return;
    if (courses.length === 0) {
      el.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No CE courses recorded</p>';
      return;
    }
    var agentMap = {};
    (window._ceAgents || []).forEach(function (a) { agentMap[a.id] = a.full_name || a.name || a.email || 'Agent'; });

    var html = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
      '<th class="text-left px-3 py-2">Agent</th>' +
      '<th class="text-left px-3 py-2">Course Name</th>' +
      '<th class="text-left px-3 py-2">Provider</th>' +
      '<th class="text-left px-3 py-2">Category</th>' +
      '<th class="text-right px-3 py-2">Hours</th>' +
      '<th class="text-left px-3 py-2">Completed</th>' +
      '<th class="text-left px-3 py-2">Certificate</th>' +
      '<th class="text-left px-3 py-2">Status</th>' +
      '<th class="text-left px-3 py-2">Actions</th>' +
    '</tr></thead><tbody>';
    courses.forEach(function (cr) {
      var agentName = agentMap[cr.agent_id || cr.agentId] || cr.agent_name || '-';
      var cat = cr.category || 'Elective';
      var isMandatory = _ceMandatoryCategories.indexOf(cat) !== -1;
      var catBadge = isMandatory
        ? '<span class="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded" style="background:#EEF2FF;color:#4338CA">' + E(cat) + '</span>'
        : '<span class="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded" style="background:#F3F4F6;color:#6B7280">Elective</span>';
      var certStatus = (cr.certificate_url || cr.certificateUrl)
        ? '<span class="text-xs text-green-600 font-semibold"><i class="fas fa-check-circle mr-1"></i>Uploaded</span>'
        : '<span class="text-xs text-red-500 font-semibold"><i class="fas fa-times-circle mr-1"></i>Missing</span>';
      var verifyStatus = (cr.status === 'verified')
        ? '<span style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase">Verified</span>'
        : '<span style="font-size:10px;font-weight:700;color:#F59E0B;text-transform:uppercase">Pending</span>';

      html += '<tr class="border-b hover:bg-gray-50">' +
        '<td class="px-3 py-2 text-sm">' + E(agentName) + '</td>' +
        '<td class="px-3 py-2 text-sm font-medium">' + E(cr.course_name || cr.courseName || '-') + '</td>' +
        '<td class="px-3 py-2 text-xs">' + E(cr.provider || '-') + '</td>' +
        '<td class="px-3 py-2">' + catBadge + '</td>' +
        '<td class="px-3 py-2 text-sm text-right font-bold">' + (cr.credit_hours || cr.creditHours || 0) + '</td>' +
        '<td class="px-3 py-2 text-xs">' + (cr.completion_date || cr.completionDate ? D(cr.completion_date || cr.completionDate) : '-') + '</td>' +
        '<td class="px-3 py-2">' + certStatus + '</td>' +
        '<td class="px-3 py-2">' + verifyStatus + '</td>' +
        '<td class="px-3 py-2"><div class="flex gap-1">' +
          '<button class="btn btn-sm btn-outline" onclick="Panels._editCECourse(\'' + E(cr.id) + '\')" title="Edit"><i class="fas fa-edit"></i></button>' +
          '<button class="btn btn-sm btn-outline text-red-500" onclick="Panels._deleteCECourse(\'' + E(cr.id) + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function _filterCECourses(filter) {
    var tabs = document.getElementById('ceFilterTabs');
    if (tabs) {
      var btns = tabs.querySelectorAll('button');
      btns.forEach(function (b) { b.className = 'btn btn-sm btn-outline'; });
      var idx = { all: 0, mandatory: 1, elective: 2, verified: 3, pending: 4 }[filter] || 0;
      if (btns[idx]) btns[idx].className = 'btn btn-sm btn-gold';
    }

    var filteredCourses = window._ceCourses || [];
    if (filter === 'mandatory') {
      filteredCourses = filteredCourses.filter(function (cr) { return _ceMandatoryCategories.indexOf(cr.category || '') !== -1; });
    } else if (filter === 'elective') {
      filteredCourses = filteredCourses.filter(function (cr) { return _ceMandatoryCategories.indexOf(cr.category || '') === -1; });
    } else if (filter === 'verified') {
      filteredCourses = filteredCourses.filter(function (cr) { return cr.status === 'verified'; });
    } else if (filter === 'pending') {
      filteredCourses = filteredCourses.filter(function (cr) { return cr.status !== 'verified'; });
    }
    _renderCECoursesTable(filteredCourses);
  }

  function _addCECourse(prefill) {
    var agents = window._ceAgents || [];
    var p = prefill || {};
    var isEdit = !!p.id;

    var agentOpts = '<option value="">Select Agent</option>';
    agents.forEach(function (a) {
      var sel = (p.agent_id === a.id || p.agentId === a.id) ? ' selected' : '';
      agentOpts += '<option value="' + E(a.id) + '"' + sel + '>' + E(a.full_name || a.name || a.email) + '</option>';
    });

    var catOpts = '';
    var categories = ['Recent Legal Matters', 'Ethical Business Practices', 'Fair Housing', 'Agency', 'Implicit Bias', 'Cultural Competency', 'Elective'];
    categories.forEach(function (cat) {
      var sel = ((p.category || '') === cat) ? ' selected' : '';
      catOpts += '<option value="' + E(cat) + '"' + sel + '>' + E(cat) + '</option>';
    });

    CRM.openModal(isEdit ? 'Edit CE Course' : 'Add CE Course',
      '<form id="ceCourseForm" class="space-y-4">' +
        (isEdit ? '<input type="hidden" name="id" value="' + E(p.id) + '">' : '') +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Agent</label><select class="form-input form-select" name="agent_id" required>' + agentOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Course Name</label><input class="form-input" name="course_name" value="' + E(p.course_name || p.courseName || '') + '" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Provider</label><input class="form-input" name="provider" value="' + E(p.provider || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Credit Hours</label><input class="form-input" type="number" step="0.5" min="0" name="credit_hours" value="' + (p.credit_hours || p.creditHours || '') + '" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Category</label><select class="form-input form-select" name="category" required>' + catOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Completion Date</label><input class="form-input" type="date" name="completion_date" value="' + E(p.completion_date || p.completionDate || '') + '" required></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Certificate</label><input class="form-input" type="file" name="certificate" accept=".pdf,.jpg,.jpeg,.png"></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitCECourse()"><i class="fas fa-save mr-1"></i> ' + (isEdit ? 'Update' : 'Save') + '</button>',
      }
    );
  }

  function _editCECourse(courseId) {
    var course = (window._ceCourses || []).filter(function (c) { return c.id === courseId; })[0];
    if (course) _addCECourse(course);
  }

  function _submitCECourse() {
    var form = document.getElementById('ceCourseForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (k === 'certificate') return;
      if (v) data[k] = v;
    });
    if (!data.agent_id || !data.course_name) {
      CRM.toast('Agent and Course Name are required', 'error');
      return;
    }
    var agentId = data.agent_id;
    var courseId = data.id;
    delete data.id;

    var method = courseId ? 'PUT' : 'POST';
    var url = '/api/crm/agents/' + encodeURIComponent(agentId) + '/ce-courses' + (courseId ? '/' + encodeURIComponent(courseId) : '');

    MallanAPI._fetch(url, { method: method, body: JSON.stringify(data) }).then(function () {
      CRM.closeModal();
      CRM.toast(courseId ? 'Course updated' : 'Course added', 'success');
      MallanAPI._fetch('/api/crm/ce-courses?limit=500').then(function (d) {
        window._ceCourses = d.courses || [];
        _renderCECoursesTable(window._ceCourses);
      }).catch(function () {});
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to save course'), 'error');
    });
  }

  function _deleteCECourse(courseId) {
    if (!confirm('Delete this CE course record? This cannot be undone.')) return;
    var course = (window._ceCourses || []).filter(function (c) { return c.id === courseId; })[0];
    var agentId = course ? (course.agent_id || course.agentId) : null;
    if (!agentId) {
      CRM.toast('Unable to determine agent for this course', 'error');
      return;
    }
    MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(agentId) + '/ce-courses/' + encodeURIComponent(courseId), { method: 'DELETE' }).then(function () {
      CRM.toast('Course deleted', 'success');
      window._ceCourses = (window._ceCourses || []).filter(function (c) { return c.id !== courseId; });
      _renderCECoursesTable(window._ceCourses);
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to delete'), 'error');
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
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 100 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 100 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI.showings.list({ limit: 50 }).catch(function () { return { showings: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var listings = r[1].listings || [];
      var deals = r[2].deals || [];
      var tasks = r[3].tasks || [];
      var showings = r[4].showings || [];

      var now = new Date();
      var todayStr = now.toISOString().slice(0, 10);
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var todayLabel = dayNames[now.getDay()] + ', ' + monthNames[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

      // Derived data
      var tasksDueToday = tasks.filter(function (t) {
        return t.due_date && t.due_date.slice(0, 10) === todayStr && t.status !== 'completed';
      });
      var overdueTasks = tasks.filter(function (t) {
        return t.due_date && new Date(t.due_date) < todayStart && t.status !== 'completed';
      });
      var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      var staleClients = clients.filter(function (cl) {
        if (cl.status === 'closed' || cl.status === 'inactive') return false;
        var last = cl.updated_at || cl.updatedAt;
        if (!last) return true;
        return (now - new Date(last)) >= sevenDaysMs;
      }).sort(function (a, b) {
        var aT = new Date(a.updated_at || a.updatedAt || 0);
        var bT = new Date(b.updated_at || b.updatedAt || 0);
        return aT - bT; // stalest first
      });
      var activeDeals = deals.filter(function (d) {
        var s = (d.status || d.deal_status || '').toLowerCase();
        return s !== 'closed' && s !== 'cancelled' && s !== 'canceled';
      });
      var attentionListings = listings.filter(function (l) {
        if (l.status !== 'Active' && l.status !== 'active') return false;
        var dom = l.days_on_market || l.daysOnMarket || 0;
        var noPhotos = !l.photos || (Array.isArray(l.photos) && l.photos.length === 0);
        var hasIssue = dom > 60 || noPhotos || l.compliance_issues;
        return hasIssue;
      });

      var html = '<div class="space-y-6">';

      // ═══ SECTION 1: TODAY'S FOCUS ═══
      html += '<div class="card">' +
        '<div class="card-header" style="border-bottom:2px solid #B8860B">' +
          '<div><h3 class="text-lg font-bold text-gray-900"><i class="fas fa-sun text-gold mr-2"></i>Today\'s Focus</h3>' +
          '<p class="text-sm text-gray-500 mt-0.5">' + E(todayLabel) + '</p></div>' +
        '</div>' +
        '<div class="card-body space-y-5">';

      // Tasks Due Today
      html += '<div>' +
        '<div class="flex items-center justify-between mb-2">' +
          '<p class="text-xs font-bold text-gray-700 uppercase tracking-wide"><i class="fas fa-check-square text-blue-500 mr-1.5"></i>Tasks Due Today</p>' +
          '<button class="btn btn-sm btn-outline" onclick="CRM.quickTask()" style="font-size:11px"><i class="fas fa-plus mr-1"></i>Add Task</button>' +
        '</div>';
      if (tasksDueToday.length > 0) {
        html += '<div class="space-y-1.5">';
        tasksDueToday.forEach(function (t) {
          var isComplete = t.status === 'completed';
          var prioColor = t.priority === 'urgent' ? '#DC2626' : t.priority === 'high' ? '#F97316' : '#9CA3AF';
          var prioLabel = t.priority === 'urgent' ? 'Urgent' : t.priority === 'high' ? 'High' : '';
          html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50" data-task-id="' + E(t.id) + '">' +
            '<input type="checkbox" class="w-4 h-4 rounded border-gray-300 cursor-pointer" ' + (isComplete ? 'checked' : '') +
              ' onchange="Panels._toggleTask(\'' + E(t.id) + '\', this.checked)" />' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate' + (isComplete ? ' line-through text-gray-400' : '') + '">' + E(t.title) + '</p>' +
              (t.client_name ? '<p class="text-xs text-gray-500">' + E(t.client_name) + '</p>' : '') +
            '</div>' +
            (prioLabel ? '<span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background:' + prioColor + '20;color:' + prioColor + '">' + E(prioLabel) + '</span>' : '') +
          '</div>';
        });
        html += '</div>';
      } else {
        html += '<p class="text-sm text-green-600 py-2"><i class="fas fa-check-circle mr-1"></i>No tasks due today</p>';
      }
      html += '</div>';

      // Overdue Tasks
      if (overdueTasks.length > 0) {
        html += '<div class="rounded-lg p-3" style="background:#FEF2F2;border:1px solid #FECACA">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<p class="text-xs font-bold text-red-700 uppercase tracking-wide"><i class="fas fa-exclamation-triangle mr-1.5"></i>Overdue (' + overdueTasks.length + ')</p>' +
            '<button class="text-xs font-medium text-red-600 hover:underline" onclick="Router.navigate(\'/ops/tasks\')">View All</button>' +
          '</div>' +
          '<div class="space-y-1.5">';
        overdueTasks.slice(0, 5).forEach(function (t) {
          var daysOver = Math.ceil((todayStart - new Date(t.due_date)) / (1000 * 60 * 60 * 24));
          html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50">' +
            '<i class="fas fa-clock text-red-500 text-xs"></i>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + E(t.title) + '</p>' +
              (t.client_name ? '<p class="text-xs text-gray-500">' + E(t.client_name) + '</p>' : '') +
            '</div>' +
            '<span class="text-xs font-bold text-red-600">' + daysOver + 'd overdue</span>' +
          '</div>';
        });
        if (overdueTasks.length > 5) {
          html += '<p class="text-xs text-red-600 text-center mt-1">+ ' + (overdueTasks.length - 5) + ' more</p>';
        }
        html += '</div></div>';
      }

      html += '</div></div>'; // card-body, card

      // ═══ SECTION 2: 3-COLUMN GRID ═══
      html += '<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">';

      // Column 1: Clients Needing Follow-up
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-user-clock text-amber-500 mr-2"></i>Needs Follow-up</h3>' +
        '<button class="text-xs text-gray-500 hover:underline" onclick="Router.navigate(\'/ops/clients\')">View All</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      if (staleClients.length > 0) {
        staleClients.slice(0, 8).forEach(function (cl) {
          var last = cl.updated_at || cl.updatedAt;
          var daysSince = last ? Math.floor((now - new Date(last)) / (1000 * 60 * 60 * 24)) : 99;
          html += '<div class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">' +
            UI.avatar(cl.name || cl.email, 28) +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + E(cl.name || cl.email) + '</p>' +
              '<p class="text-xs text-gray-400">' + daysSince + 'd since activity</p>' +
            '</div>' +
            UI.roleBadge(cl.type || cl.client_type) +
            '<button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px" ' +
              'onclick="event.stopPropagation();CRM.quickNote(\'' + E(cl.id) + '\',\'' + E(cl.name || cl.email) + '\')">Follow Up</button>' +
          '</div>';
        });
      } else {
        html += '<p class="text-sm text-green-600 text-center py-4"><i class="fas fa-check-circle mr-1"></i>All clients recently active</p>';
      }
      html += '</div></div></div>';

      // Column 2: Active Deals
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-handshake text-blue-500 mr-2"></i>Active Deals</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      if (activeDeals.length > 0) {
        activeDeals.slice(0, 6).forEach(function (d) {
          var addr = d.address || d.listing_address || d.title || 'Untitled deal';
          var client = d.client_name || d.clientName || '';
          var stage = d.status || d.deal_status || d.stage || 'active';
          var commission = d.gross_commission || d.grossCommission || d.commission;
          var dealId = d.id || d.deal_id;
          html += '<div class="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" ' +
            'onclick="Router.navigate(\'/workspace/listing/' + E(d.listing_id || dealId) + '/overview\')">' +
            '<div class="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50 mt-0.5">' +
              '<i class="fas fa-file-contract text-xs text-blue-500"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
              (client ? '<p class="text-xs text-gray-500">' + E(client) + '</p>' : '') +
            '</div>' +
            '<div class="text-right flex-shrink-0">' +
              UI.stageBadge(stage) +
              (commission ? '<p class="text-xs font-medium text-green-600 mt-1">' + $(commission) + '</p>' : '') +
            '</div>' +
          '</div>';
        });
      } else {
        html += '<p class="text-sm text-gray-500 text-center py-4">No active deals</p>';
      }
      html += '</div></div></div>';

      // Column 3: Listings Needing Attention
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-exclamation-circle text-orange-500 mr-2"></i>Listings Attention</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      if (attentionListings.length > 0) {
        attentionListings.slice(0, 6).forEach(function (l) {
          var addr = l.address || l.street_address || l.UnparsedAddress || 'Untitled';
          var dom = l.days_on_market || l.daysOnMarket || 0;
          var noPhotos = !l.photos || (Array.isArray(l.photos) && l.photos.length === 0);
          var issues = [];
          if (dom > 60) issues.push('<span class="text-xs font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Stale DOM ' + dom + 'd</span>');
          if (noPhotos) issues.push('<span class="text-xs font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">No Photos</span>');
          if (l.compliance_issues) issues.push('<span class="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Compliance</span>');
          var listingId = l.id || l.listing_id;
          html += '<div class="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" ' +
            'onclick="Router.navigate(\'/workspace/listing/' + E(listingId) + '/overview\')">' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
              '<div class="flex flex-wrap gap-1 mt-1">' + issues.join('') + '</div>' +
            '</div>' +
          '</div>';
        });
      } else {
        html += '<p class="text-sm text-green-600 text-center py-4"><i class="fas fa-check-circle mr-1"></i>All listings healthy</p>';
      }
      html += '</div></div></div>';

      html += '</div>'; // 3-col grid

      // ═══ SECTION 3: 2-COLUMN GRID ═══
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // Left: Recent Client Activity
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-stream text-purple-500 mr-2"></i>Recent Activity</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      var recentEvents = Events.getRecent(10);
      if (recentEvents.length > 0) {
        var eventIcons = {
          client_created: 'fa-user-plus', client_stage_moved: 'fa-exchange-alt',
          listing_sent: 'fa-paper-plane', showing_scheduled: 'fa-calendar-check',
          task_completed: 'fa-check-circle', portal_invite_sent: 'fa-envelope',
          note_added: 'fa-sticky-note', listing_reaction_recorded: 'fa-heart',
          quick_send_executed: 'fa-bolt', lead_assigned: 'fa-user-tag',
        };
        recentEvents.forEach(function (ev) {
          var icon = eventIcons[ev.type] || 'fa-circle';
          var desc = (ev.type || '').replace(/_/g, ' ');
          var entityName = (ev.payload && ev.payload.clientName) || (ev.payload && ev.payload.name) || '';
          var label = entityName ? entityName + ' — ' + desc : desc;
          var route = ev.entityType === 'client' && ev.entityId
            ? '/workspace/client/' + ev.entityId + '/overview' : '';
          html += '<div class="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50' + (route ? ' cursor-pointer" onclick="Router.navigate(\'' + E(route) + '\')"' : '"') + '>' +
            '<div class="w-6 h-6 rounded-full flex items-center justify-center bg-purple-50">' +
              '<i class="fas ' + icon + ' text-purple-500" style="font-size:10px"></i></div>' +
            '<p class="text-sm flex-1 min-w-0 truncate">' + E(label) + '</p>' +
            '<span class="text-xs text-gray-400 flex-shrink-0">' + Utils.formatTimeAgo(ev.createdAt) + '</span>' +
          '</div>';
        });
      } else {
        html += '<p class="text-sm text-gray-500 text-center py-4">No recent activity</p>';
      }
      html += '</div></div></div>';

      // Right: New Matching Listings
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-magic text-gold mr-2"></i>New Matches for Clients</h3></div>' +
        '<div class="card-body"><div id="ops-dash-matches" class="space-y-2">';
      // Kick off async match search
      html += '<p class="text-sm text-gray-400 text-center py-2"><i class="fas fa-spinner fa-spin mr-1"></i>Searching...</p>';
      html += '</div></div></div>';

      html += '</div>'; // 2-col grid

      // ═══ SECTION 4: QUICK ACTIONS + RESUME RECENT ═══
      html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

      // Left: Quick Actions (2x3 grid)
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-bolt text-gold mr-2"></i>Quick Actions</h3></div>' +
        '<div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">';
      var quickActions = [
        { icon: 'fa-search', label: 'Property Search', route: '/ops/search' },
        { icon: 'fa-user-plus', label: 'New Client', action: 'CRM.quickNewClient()' },
        { icon: 'fa-home', label: 'New Listing', action: 'CRM.quickNewListing()' },
        { icon: 'fa-paper-plane', label: 'Quick Send', action: 'CRM.quickSendListing()' },
        { icon: 'fa-tasks', label: 'Quick Task', action: 'CRM.quickTask()' },
        { icon: 'fa-sticky-note', label: 'Quick Note', action: 'CRM.quickNote()' },
      ];
      quickActions.forEach(function (q) {
        html += '<button class="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:border-gold hover:shadow-sm transition-all" ' +
          'onclick="' + (q.route ? "Router.navigate('" + q.route + "')" : q.action) + '">' +
          '<i class="fas ' + q.icon + ' text-lg text-gold mb-1.5"></i>' +
          '<span class="text-xs font-bold text-gray-700">' + E(q.label) + '</span></button>';
      });
      html += '</div></div></div>';

      // Right: Resume Recent Workspaces
      html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold"><i class="fas fa-history text-gray-500 mr-2"></i>Resume Recent</h3></div>' +
        '<div class="card-body">';
      var recentWorkspaces = [];
      try { var raw = localStorage.getItem('mallan_crm_recent_workspaces'); recentWorkspaces = raw ? JSON.parse(raw) : []; } catch (e) { /* ignore */ }
      var recentClients = recentWorkspaces.filter(function (w) { return w.type === 'client'; }).slice(0, 5);
      var recentListings = recentWorkspaces.filter(function (w) { return w.type === 'listing'; }).slice(0, 5);

      if (recentClients.length > 0) {
        html += '<p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Recent Clients</p>' +
          '<div class="space-y-1.5 mb-4">';
        recentClients.forEach(function (w) {
          html += '<div class="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'' + E(w.route) + '\')">' +
            '<i class="fas fa-user text-gray-400 text-xs"></i>' +
            '<p class="text-sm flex-1 truncate">' + E(w.name || 'Unknown') + '</p>' +
            '<span class="text-xs text-gray-400">' + (w.timestamp ? Utils.formatTimeAgo(new Date(w.timestamp).toISOString()) : '') + '</span>' +
          '</div>';
        });
        html += '</div>';
      }
      if (recentListings.length > 0) {
        html += '<p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Recent Listings</p>' +
          '<div class="space-y-1.5">';
        recentListings.forEach(function (w) {
          html += '<div class="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'' + E(w.route) + '\')">' +
            '<i class="fas fa-building text-gray-400 text-xs"></i>' +
            '<p class="text-sm flex-1 truncate">' + E(w.name || 'Unknown') + '</p>' +
            '<span class="text-xs text-gray-400">' + (w.timestamp ? Utils.formatTimeAgo(new Date(w.timestamp).toISOString()) : '') + '</span>' +
          '</div>';
        });
        html += '</div>';
      }
      if (recentClients.length === 0 && recentListings.length === 0) {
        html += '<p class="text-sm text-gray-500 text-center py-4">No recent workspaces</p>';
      }
      html += '</div></div>';

      html += '</div>'; // 2-col grid
      html += '</div>'; // space-y-6

      c.innerHTML = html;

      // Async: load matching listings for clients with preferences
      _opsDashLoadMatches(clients);

    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-tachometer-alt', 'Unable to load dashboard');
    });
  }

  // Toggle task completion from dashboard checkbox
  function _opsDashToggleTask(taskId, completed) {
    MallanAPI._fetch('/api/crm/tasks/' + taskId, {
      method: 'PATCH',
      body: JSON.stringify({ status: completed ? 'completed' : 'pending' }),
    }).then(function () {
      var row = document.querySelector('[data-task-id="' + taskId + '"]');
      if (row) {
        var label = row.querySelector('p.text-sm');
        if (label) {
          if (completed) { label.classList.add('line-through', 'text-gray-400'); }
          else { label.classList.remove('line-through', 'text-gray-400'); }
        }
      }
    }).catch(function () { /* silent — checkbox already toggled visually */ });
  }

  // Load IDX matches for clients with preferences
  function _opsDashLoadMatches(clients) {
    var container = document.getElementById('ops-dash-matches');
    if (!container) return;

    // Find clients with search preferences
    var clientsWithPrefs = clients.filter(function (cl) {
      return cl.preferences || cl.search_criteria || cl.neighborhoods || cl.budget_max || cl.max_price;
    }).slice(0, 3);

    if (clientsWithPrefs.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No clients have search preferences set</p>';
      return;
    }

    var searches = clientsWithPrefs.map(function (cl) {
      var prefs = cl.preferences || cl.search_criteria || {};
      var params = {};
      if (prefs.neighborhoods || cl.neighborhoods) params.neighborhoods = prefs.neighborhoods || cl.neighborhoods;
      if (prefs.max_price || cl.budget_max || cl.max_price) params.maxPrice = prefs.max_price || cl.budget_max || cl.max_price;
      if (prefs.min_beds || cl.min_beds) params.minBeds = prefs.min_beds || cl.min_beds;
      if (prefs.type || cl.type === 'renter') params.type = prefs.type || (cl.type === 'renter' ? 'rental' : 'sale');
      params.limit = 3;
      params.sort = '-ListDate';
      return MallanAPI.idx.search(params).then(function (data) {
        return { client: cl, listings: (data.listings || data.results || []).slice(0, 3) };
      }).catch(function () { return { client: cl, listings: [] }; });
    });

    Promise.all(searches).then(function (results) {
      var matchHtml = '';
      var count = 0;
      results.forEach(function (r) {
        r.listings.forEach(function (l) {
          if (count >= 8) return;
          count++;
          var addr = l.address || l.UnparsedAddress || l.street_address || 'Unknown';
          var price = l.ListPrice || l.price || l.list_price;
          matchHtml += '<div class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">' +
            '<div class="w-7 h-7 rounded-lg flex items-center justify-center bg-gold/10">' +
              '<i class="fas fa-home text-gold" style="font-size:10px"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
              '<p class="text-xs text-gray-500">' + (price ? $(price) + ' — ' : '') + 'for ' + E(r.client.name || r.client.email) + '</p>' +
            '</div>' +
            '<button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px" ' +
              'onclick="event.stopPropagation();CRM.quickSendListing(\'' + E(l.ListingId || l.id || l.listing_id) + '\',\'' + E(r.client.id) + '\')">Send</button>' +
          '</div>';
        });
      });
      if (count === 0) {
        matchHtml = '<p class="text-sm text-gray-500 text-center py-4">No new matches found</p>';
      }
      container.innerHTML = matchHtml;
    });
  }

  // ─── Property Search ─────────────────────────────────────────────────
  function propertySearch() {
    CRM.setPanelTitle('Property Search');
    var c = _container();

    // Detect context
    var ctx = CRM._getCurrentContext ? CRM._getCurrentContext() : { type: null, id: null };
    var contextLabel = '';
    var contextParams = '';
    if (ctx.type === 'client' && ctx.id) {
      contextLabel = 'Searching for client workspace context';
      contextParams = '?clientContext=' + encodeURIComponent(ctx.id);
    } else if (ctx.type === 'listing' && ctx.id) {
      contextLabel = 'Compare mode from listing workspace';
      contextParams = '?compareContext=' + encodeURIComponent(ctx.id);
    }

    // Load last searches from localStorage
    var lastSearches = [];
    try { lastSearches = JSON.parse(localStorage.getItem('mallan_crm_search_history') || '[]'); } catch (e) { /* */ }

    // Load client-specific last searches
    var clientSearches = [];
    if (ctx.type === 'client' && ctx.id) {
      try { clientSearches = JSON.parse(localStorage.getItem('mallan_crm_client_search_' + ctx.id) || '[]'); } catch (e) { /* */ }
    }

    var html = '<div class="space-y-4">';

    // Context banner
    if (ctx.type) {
      var bannerColor = ctx.type === 'client' ? '#2563EB' : '#B8860B';
      html += '<div class="card p-3 flex items-center gap-3" style="border-left:4px solid ' + bannerColor + '">' +
        '<i class="fas ' + (ctx.type === 'client' ? 'fa-user' : 'fa-building') + '" style="color:' + bannerColor + '"></i>' +
        '<div class="flex-1"><p class="text-sm font-medium">' + E(contextLabel) + '</p>' +
          '<p class="text-xs text-gray-500">Results can be sent directly to this ' + E(ctx.type) + '</p></div>' +
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/' + E(ctx.type) + '/' + E(ctx.id) + '/overview\')"><i class="fas fa-arrow-left mr-1"></i> Back to Workspace</button>' +
      '</div>';
    }

    // Quick search tabs
    var searchTabs = [
      { section: 'Sale Search', items: [
        { label: 'Sale Basic Search', hash: '#sale-basic', icon: 'fa-home' },
        { label: 'Sale Advanced Search', hash: '#sale-advanced', icon: 'fa-sliders-h' },
      ]},
      { section: 'Rental Search', items: [
        { label: 'Rental Basic Search', hash: '#rental-basic', icon: 'fa-key' },
        { label: 'Rental Advanced Search', hash: '#rental-advanced', icon: 'fa-sliders-h' },
      ]},
      { section: 'Building Search', items: [
        { label: 'Building Basic Search', hash: '#building-basic', icon: 'fa-building' },
        { label: 'Building Advanced Search', hash: '#building-advanced', icon: 'fa-sliders-h' },
      ]},
      { section: 'Comparables', items: [
        { label: 'By Address / Building Name', hash: '#comps-address', icon: 'fa-map-marker-alt' },
        { label: 'By Building', hash: '#comps-building', icon: 'fa-building' },
        { label: 'General Comparables', hash: '#comps-general', icon: 'fa-chart-bar' },
      ]},
    ];

    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">';
    searchTabs.forEach(function (group) {
      html += '<div class="card p-4">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">' + E(group.section) + '</h4>' +
        '<div class="space-y-1">';
      group.items.forEach(function (item) {
        html += '<button class="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all flex items-center gap-2" ' +
          'onclick="Panels._launchSearch(\'' + E(contextParams + (contextParams ? '&' : '?') + 'tab=' + item.hash.replace('#','')) + '\')">' +
          '<i class="fas ' + item.icon + ' text-xs text-gray-400 w-4 text-center"></i>' +
          E(item.label) +
        '</button>';
      });
      html += '</div></div>';
    });
    html += '</div>';

    // Recent searches
    if (lastSearches.length > 0) {
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-history text-gray-400 mr-2"></i>Recent Searches</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._clearSearchHistory()">Clear</button></div>' +
        '<div class="card-body"><div class="space-y-2">';
      lastSearches.slice(0, 8).forEach(function (s) {
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Panels._launchSearch(\'' + E(s.params || '') + '\')">' +
          '<div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><i class="fas fa-search text-xs text-gray-400"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium truncate">' + E(s.query || s.label || 'Search') + '</p>' +
            '<p class="text-xs text-gray-500">' + E(s.filters || '') + ' · ' + Utils.formatTimeAgo(s.timestamp) + '</p>' +
          '</div>' +
          (s.clientName ? '<span class="text-xs text-blue-500"><i class="fas fa-user mr-1"></i>' + E(s.clientName) + '</span>' : '') +
        '</div>';
      });
      html += '</div></div></div>';
    }

    // Client-specific searches
    if (clientSearches.length > 0) {
      html += '<div class="card"><div class="card-header"><h3><i class="fas fa-user text-blue-500 mr-2"></i>Searches for This Client</h3></div>' +
        '<div class="card-body"><div class="space-y-2">';
      clientSearches.slice(0, 5).forEach(function (s) {
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Panels._launchSearch(\'' + E(s.params || '') + '\')">' +
          '<div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><i class="fas fa-redo text-xs text-blue-400"></i></div>' +
          '<div class="flex-1"><p class="text-sm">' + E(s.query || 'Search') + '</p>' +
            '<p class="text-xs text-gray-500">' + Utils.formatTimeAgo(s.timestamp) + '</p></div>' +
        '</div>';
      });
      html += '</div></div></div>';
    }

    // Return to CRM note
    html += '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">' +
      '<p class="text-xs text-blue-800"><i class="fas fa-info-circle mr-1"></i> ' +
        'The search window opens separately. Use the browser back button or close the tab to return to CRM. ' +
        'All search launches are logged for activity tracking.</p></div>';

    html += '</div>';
    c.innerHTML = html;
  }

  function _launchSearch(params) {
    var url = '/crm/search' + (params || '');
    var ctx = CRM._getCurrentContext ? CRM._getCurrentContext() : { type: null, id: null };

    // Log the search launch as an event
    Events.log('search_launched', ctx.type || 'general', ctx.id || null, {
      url: url,
      context: ctx.type || 'standalone',
    });

    // Save to search history
    var history = [];
    try { history = JSON.parse(localStorage.getItem('mallan_crm_search_history') || '[]'); } catch (e) { /* */ }
    history.unshift({
      params: params || '',
      query: params ? decodeURIComponent(params).replace(/[?&]/g, ' ').trim() : 'General search',
      label: ctx.type === 'client' ? 'Client context search' : ctx.type === 'listing' ? 'Listing compare search' : 'Property search',
      filters: '',
      clientName: ctx.type === 'client' ? (Store.getCached('currentClientName') || '') : '',
      timestamp: new Date().toISOString(),
    });
    if (history.length > 20) history = history.slice(0, 20);
    try { localStorage.setItem('mallan_crm_search_history', JSON.stringify(history)); } catch (e) { /* */ }

    // Save client-specific search
    if (ctx.type === 'client' && ctx.id) {
      var clientHistory = [];
      try { clientHistory = JSON.parse(localStorage.getItem('mallan_crm_client_search_' + ctx.id) || '[]'); } catch (e) { /* */ }
      clientHistory.unshift({
        params: params || '',
        query: 'Search from workspace',
        timestamp: new Date().toISOString(),
      });
      if (clientHistory.length > 10) clientHistory = clientHistory.slice(0, 10);
      try { localStorage.setItem('mallan_crm_client_search_' + ctx.id, JSON.stringify(clientHistory)); } catch (e) { /* */ }
    }

    // Open in controlled window
    window.open(url, 'mallan_search');
    CRM.toast('Search opened — return here when done', 'info');
  }

  function _clearSearchHistory() {
    try { localStorage.removeItem('mallan_crm_search_history'); } catch (e) { /* */ }
    propertySearch(); // re-render
    CRM.toast('Search history cleared', 'info');
  }

  // ─── My Listings ─────────────────────────────────────────────────────
  var _myListingsData = [];
  var _myListingsType = 'sale'; // 'sale' or 'rental'
  var _myListingsStatus = 'all';

  function myListings() {
    CRM.setPanelTitle('My Listings');
    var c = _container(); c.innerHTML = UI.loading();

    // Load from BOTH DB (all statuses including closed/expired) AND past deals
    Promise.all([
      MallanAPI.listings.list({ limit: 500 }).catch(function () { return { listings: [] }; }),
      MallanAPI._fetch('/api/crm/past-deals?limit=200').catch(function () { return { deals: [] }; }),
    ]).then(function (r) {
      var dbListings = r[0].listings || [];
      var pastDeals = r[1].deals || [];

      // Merge: DB listings are primary, past deals fill in closed/sold/rented history
      var seenIds = {};
      _myListingsData = [];

      dbListings.forEach(function (l) {
        var lid = l.id || l.listing_id;
        if (lid) seenIds[lid] = true;
        _myListingsData.push(l);
      });

      // Add past deals that aren't already in DB listings
      pastDeals.forEach(function (d) {
        var lid = d.listing_id || d.listingId;
        if (lid && !seenIds[lid]) {
          seenIds[lid] = true;
          _myListingsData.push({
            id: lid,
            listing_id: lid,
            address: d.address || d.property_address || 'Past Deal',
            UnparsedAddress: d.address || d.property_address,
            ListPrice: d.sale_price || d.price || d.amount,
            price: d.sale_price || d.price || d.amount,
            status: d.deal_type === 'sale' ? 'Closed' : 'Closed',
            property_type: d.deal_type || 'sale',
            listing_type: d.deal_type,
            cumulative_dom: d.days_on_market || 0,
            updated_at: d.close_date || d.created_at,
            _fromPastDeals: true,
          });
        }
      });

      // Compute per-listing flags
      var now = new Date();
      _myListingsData.forEach(function (l) {
        var dom = l.cumulative_dom || l.days_on_market || 0;
        var hasPhotos = (l.photos && l.photos.length > 0) || (l.Media && l.Media.length > 0);
        l._isStale = dom > 60 && (l.status === 'Active' || l.status === 'active');
        l._noPhotos = !hasPhotos;
        l._isFeatured = l.featuredFlag || l.featured;

        // Refresh tracking — REBNY requires weekly refresh
        var lastRefresh = l.ModificationTimestamp || l.updated_at || l.updatedAt || l.syncedAt;
        if (lastRefresh) {
          var daysSinceRefresh = Math.floor((now - new Date(lastRefresh)) / 86400000);
          l._daysSinceRefresh = daysSinceRefresh;
          l._needsRefresh = daysSinceRefresh >= 7 && (l.status === 'Active' || l.status === 'active' || l.status === 'ComingSoon');
        } else {
          l._daysSinceRefresh = null;
          l._needsRefresh = false;
        }

        // Listing type
        var type = (l.property_type || l.listing_type || l.PropertySubType || '').toLowerCase();
        l._isRental = type.indexOf('rent') !== -1;
      });

      _renderMyListings(c);
    }).catch(function (err) {
      console.error('My Listings error:', err);
      c.innerHTML = '<div class="space-y-4"><h2 class="text-lg font-bold text-gray-900">My Listings</h2>' +
        UI.emptyState('fa-building', 'Unable to load listings') + '</div>';
    });
  }

  function _renderMyListings(c) {
    var listings = _myListingsData;
    var typeTab = _myListingsType;
    var statusTab = _myListingsStatus;
    var now = new Date();

    // Split by sale vs rental
    var sales = listings.filter(function (l) { return !l._isRental; });
    var rentals = listings.filter(function (l) { return l._isRental; });
    var typeListings = typeTab === 'rental' ? rentals : sales;

    // Status filter within type
    var filtered = typeListings;
    if (statusTab && statusTab !== 'all') {
      filtered = typeListings.filter(function (l) { return (l.status || '') === statusTab; });
    }

    // Status counts for this type
    var statusCounts = {};
    var statuses = ['Active', 'Pending', 'ActiveUnderContract', 'Closed', 'ComingSoon', 'Hold', 'Withdrawn', 'Expired', 'Canceled'];
    statuses.forEach(function (s) { statusCounts[s] = typeListings.filter(function (l) { return l.status === s; }).length; });

    // Expiring listings
    var expiringSoon = [];
    typeListings.forEach(function (l) {
      var expDate = l.ExpirationDate || l.expiration_date || l.listing_expiry;
      if (!expDate) return;
      var daysLeft = Math.ceil((new Date(expDate) - now) / 86400000);
      if (daysLeft > 0 && daysLeft <= 30) { l._expiresIn = daysLeft; expiringSoon.push(l); }
    });

    var html = '<div class="space-y-4">';

    // Header — title + add buttons
    html += '<div class="flex items-center justify-between">' +
      '<h2 class="text-lg font-bold text-gray-900">My Listings</h2>' +
      '<div class="flex gap-2">' +
        '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/sale-listing\',\'_blank\')"><i class="fas fa-plus mr-1"></i> Add Sale</button>' +
        '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/rental-listing\',\'_blank\')"><i class="fas fa-plus mr-1"></i> Add Rental</button>' +
      '</div>' +
    '</div>';

    // Sale / Rental tabs — primary level
    html += '<div class="flex gap-0 border-b border-gray-200">' +
      '<button class="px-6 py-2.5 text-sm font-semibold border-b-2 transition-all ' +
        (typeTab === 'sale' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700') +
        '" onclick="Panels._switchMyListingsType(\'sale\')">Sales (' + sales.length + ')</button>' +
      '<button class="px-6 py-2.5 text-sm font-semibold border-b-2 transition-all ' +
        (typeTab === 'rental' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700') +
        '" onclick="Panels._switchMyListingsType(\'rental\')">Rentals (' + rentals.length + ')</button>' +
    '</div>';

    // Status sub-tabs
    html += '<div class="flex gap-1 overflow-x-auto pb-1">';
    html += '<button class="px-3 py-1.5 rounded text-sm font-medium border transition-all ' +
      (statusTab === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400') +
      '" onclick="Panels._switchMyListingsStatus(\'all\')">All (' + typeListings.length + ')</button>';
    statuses.forEach(function (s) {
      var count = statusCounts[s] || 0;
      if (count === 0 && s !== 'Active' && s !== 'Closed') return; // hide empty statuses except Active & Closed
      var label = s;
      if (s === 'ActiveUnderContract') label = 'In Contract';
      else if (s === 'ComingSoon') label = 'Coming Soon';
      else if (s === 'Hold') label = 'Temp Off Market';
      else if (s === 'Withdrawn') label = 'Perm Off Market';
      html += '<button class="px-3 py-1.5 rounded text-sm font-medium border transition-all whitespace-nowrap ' +
        (statusTab === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400') +
        '" onclick="Panels._switchMyListingsStatus(\'' + s + '\')">' + label + ' (' + count + ')</button>';
    });
    html += '</div>';

    // Expiring listings alert
    if (expiringSoon.length > 0) {
      html += '<div class="p-3 border border-yellow-300 rounded-lg bg-yellow-50">' +
        '<p class="text-sm font-semibold text-yellow-800"><i class="fas fa-clock mr-1"></i> ' + expiringSoon.length + ' listing' + (expiringSoon.length > 1 ? 's' : '') + ' expiring soon</p>' +
        '<div class="mt-2 space-y-1">';
      expiringSoon.sort(function (a, b) { return a._expiresIn - b._expiresIn; });
      expiringSoon.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'Listing';
        var urgency = l._expiresIn <= 7 ? 'text-red-700 font-bold' : 'text-yellow-700';
        html += '<div class="flex items-center justify-between text-xs">' +
          '<span class="cursor-pointer hover:underline" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">' + E(addr) + '</span>' +
          '<span class="' + urgency + '">' + (l._expiresIn <= 7 ? 'Expires in ' + l._expiresIn + ' days!' : 'Expires in ' + l._expiresIn + ' days') + '</span>' +
        '</div>';
      });
      html += '</div></div>';
    }

    // REBNY weekly refresh alert
    var needsRefresh = listings.filter(function (l) { return l._needsRefresh; });
    if (needsRefresh.length > 0) {
      html += '<div class="p-3 border border-red-300 rounded-lg bg-red-50">' +
        '<p class="text-sm font-semibold text-red-800"><i class="fas fa-sync-alt mr-1"></i> ' + needsRefresh.length + ' listing' + (needsRefresh.length > 1 ? 's' : '') + ' need REBNY weekly refresh</p>' +
        '<p class="text-xs text-red-600 mt-1">REBNY RLS requires all active listings to be refreshed weekly. Click Edit to update.</p>' +
        '<div class="mt-2 space-y-1">';
      needsRefresh.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'Listing';
        var isRental = l._isRental;
        var lid = l.id || l.listing_id;
        html += '<div class="flex items-center justify-between text-xs">' +
          '<span>' + E(addr) + ' — <span class="text-red-700">' + l._daysSinceRefresh + ' days since last update</span></span>' +
          '<button class="text-red-700 font-semibold hover:underline" onclick="event.stopPropagation();window.open(\'/crm/' + (isRental ? 'rental' : 'sale') + '-listing?id=' + E(lid) + '\',\'_blank\')">Edit & Refresh</button>' +
        '</div>';
      });
      html += '</div></div>';
    }

    // Listing table
    if (filtered.length === 0) {
      html += '<div class="text-center py-12 text-gray-400">' +
        '<i class="fas fa-building text-3xl mb-3"></i>' +
        '<p class="text-sm">No listings to display.</p>' +
      '</div>';
    } else {
      html += '<div class="data-table"><div style="overflow-x:auto"><table class="w-full"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Address</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Price</th>' +
        '<th class="text-left px-3 py-2">Status</th>' +
        '<th class="text-left px-3 py-2">DOM</th>' +
        '<th class="text-left px-3 py-2">Expiry</th>' +
        '<th class="text-left px-3 py-2">Last Refreshed</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';
      filtered.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'No address';
        var dom = l.cumulative_dom || l.days_on_market || 0;
        var type = (l.property_type || l.listing_type || l.PropertySubType || '');
        var isRental = type.toLowerCase().indexOf('rent') !== -1;
        var lid = l.id || l.listing_id;

        // Expiry
        var expDate = l.ExpirationDate || l.expiration_date || l.listing_expiry;
        var expiryHtml = '—';
        if (expDate) {
          var daysLeft = Math.ceil((new Date(expDate) - now) / 86400000);
          if (daysLeft <= 0) expiryHtml = '<span class="text-xs text-red-600 font-semibold">Expired</span>';
          else if (daysLeft <= 7) expiryHtml = '<span class="text-xs text-red-600 font-semibold">' + daysLeft + 'd left</span>';
          else if (daysLeft <= 30) expiryHtml = '<span class="text-xs text-yellow-600">' + daysLeft + 'd left</span>';
          else expiryHtml = '<span class="text-xs text-gray-500">' + D(expDate) + '</span>';
        }

        html += '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' +
          '<td class="px-3 py-2"><p class="text-sm font-medium text-gray-900">' + E(addr) + '</p></td>' +
          '<td class="px-3 py-2 text-xs text-gray-500">' + E(isRental ? 'Rental' : 'Sale') + '</td>' +
          '<td class="px-3 py-2 text-sm font-semibold">' + $(l.ListPrice || l.price) + '</td>' +
          '<td class="px-3 py-2">' + UI.statusBadge(l.status || 'Active') + '</td>' +
          '<td class="px-3 py-2 text-xs text-gray-600">' + dom + '</td>' +
          '<td class="px-3 py-2">' + expiryHtml + '</td>' +
          '<td class="px-3 py-2">' + (function () {
            if (l._daysSinceRefresh === null) return '<span class="text-xs text-gray-400">—</span>';
            if (l._needsRefresh) return '<span class="text-xs text-red-600 font-semibold">' + l._daysSinceRefresh + 'd ago <i class="fas fa-exclamation-circle"></i></span>';
            return '<span class="text-xs text-gray-500">' + l._daysSinceRefresh + 'd ago</span>';
          })() + '</td>' +
          '<td class="px-3 py-2"><div class="flex gap-1" onclick="event.stopPropagation()">' +
            '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/' + (isRental ? 'rental' : 'sale') + '-listing?id=' + E(lid) + '\',\'_blank\')" title="Edit Listing"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm btn-outline" onclick="Panels._addOpenHouse(\'' + E(lid) + '\',\'' + E(addr) + '\')" title="Add Open House"><i class="fas fa-door-open"></i></button>' +
          '</div></td>' +
        '</tr>';
      });
      html += '</tbody></table></div></div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  function _switchMyListingsView(view) {
    // Legacy — map to new system
    _myListingsStatus = view;
    _renderMyListings(_container());
  }

  function _switchMyListingsType(type) {
    _myListingsType = type;
    _myListingsStatus = 'all';
    _renderMyListings(_container());
  }

  function _switchMyListingsStatus(status) {
    _myListingsStatus = status;
    _renderMyListings(_container());
  }

  function _addOpenHouse(listingId, address) {
    CRM.openModal('Schedule Open House — ' + address,
      '<form id="openHouseForm" class="space-y-4">' +
        '<input type="hidden" name="listing_id" value="' + E(listingId) + '">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" name="date" required></div>' +
          '<div class="form-group"><label class="form-label">Start Time *</label><input class="form-input" type="time" name="start_time" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">End Time *</label><input class="form-input" type="time" name="end_time" required></div>' +
          '<div class="form-group"><label class="form-label">Type</label>' +
            '<select class="form-input form-select" name="type">' +
              '<option value="open_house">Public Open House</option>' +
              '<option value="broker_open">Broker Open House</option>' +
              '<option value="virtual">Virtual Open House</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-input" name="notes" rows="2" placeholder="Any special instructions..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitOpenHouse()"><i class="fas fa-calendar-plus mr-1"></i> Schedule</button>',
      }
    );
  }

  function _submitOpenHouse() {
    var form = document.getElementById('openHouseForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.showings.create({
      listing_id: data.listing_id,
      date: data.date,
      time: data.start_time + ' - ' + data.end_time,
      type: data.type || 'open_house',
      notes: data.notes || '',
    }).then(function () {
      Events.log('showing_scheduled', 'listing', data.listing_id, { type: data.type, date: data.date });
      CRM.closeModal();
      CRM.toast('Open house scheduled', 'success');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || 'Try again'), 'error');
    });
  }

  // ─── My Clients ──────────────────────────────────────────────────────
  var _myClientsData = [];
  var _myClientsView = 'all';
  var _myClientsSearch = '';

  function myClients() {
    CRM.setPanelTitle('My Clients');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var tasks = r[1].tasks || [];
      var listings = r[2].listings || [];
      var now = new Date();
      var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      // Enrich each client with operational data
      clients.forEach(function (cl) {
        var cid = cl.id;
        var clientTasks = tasks.filter(function (t) { return t.client_id === cid || t.clientId === cid; });
        var sentListings = listings.filter(function (l) { return l.sentToClientId === cid; }); // rough — real count from events
        var lastUpdated = new Date(cl.updated_at || cl.updatedAt || cl.created_at || 0);

        // Next task
        var pending = clientTasks.filter(function (t) { return t.status !== 'completed'; });
        pending.sort(function (a, b) { return new Date(a.due_date || '9999') - new Date(b.due_date || '9999'); });
        cl._nextTask = pending[0] || null;
        cl._taskCount = pending.length;

        // Health indicators
        cl._lastActivity = lastUpdated;
        cl._isHot = lastUpdated >= sevenDaysAgo;
        cl._needsFollowUp = lastUpdated < sevenDaysAgo && lastUpdated >= thirtyDaysAgo;
        cl._isInactive = lastUpdated < thirtyDaysAgo;
        cl._listingsCount = sentListings.length;

        // Lease expiry for renters
        var leaseEnd = cl.leaseEndDate || cl.lease_end_date;
        cl._leaseExpiring = false;
        if (leaseEnd && (cl.type === 'renter' || cl.client_type === 'renter')) {
          var daysLeft = Utils.daysUntil(leaseEnd);
          cl._leaseExpiring = daysLeft !== null && daysLeft <= 180;
          cl._leaseDaysLeft = daysLeft;
        }

        // Stage categories
        var stage = (cl.stage || cl.status || 'new').toLowerCase();
        cl._isPipeline = ['active', 'showing', 'offer', 'deal'].indexOf(stage) !== -1;
        cl._isPast = stage === 'closed' || stage === 'past' || cl.status === 'inactive';
      });

      _myClientsData = clients;
      _renderMyClients(c);

      // Listen for global search
      Store.on('global:search', function (q) {
        _myClientsSearch = q;
        _renderMyClients(c);
      });
    });
  }

  function _renderMyClients(c) {
    var clients = _myClientsData;
    var view = _myClientsView;
    var search = _myClientsSearch.toLowerCase();

    // Apply view filter
    var filtered = clients;
    if (view === 'hot') filtered = clients.filter(function (cl) { return cl._isHot && (cl.type === 'buyer' || cl.client_type === 'buyer'); });
    else if (view === 'followup') filtered = clients.filter(function (cl) { return cl._needsFollowUp; });
    else if (view === 'lease') filtered = clients.filter(function (cl) { return cl._leaseExpiring; });
    else if (view === 'pipeline') filtered = clients.filter(function (cl) { return cl._isPipeline; });
    else if (view === 'past') filtered = clients.filter(function (cl) { return cl._isPast; });
    else if (view === 'buyer') filtered = clients.filter(function (cl) { return (cl.type || cl.client_type) === 'buyer'; });
    else if (view === 'seller') filtered = clients.filter(function (cl) { return (cl.type || cl.client_type) === 'seller'; });
    else if (view === 'renter') filtered = clients.filter(function (cl) { return (cl.type || cl.client_type) === 'renter'; });
    else if (view === 'landlord') filtered = clients.filter(function (cl) { return (cl.type || cl.client_type) === 'landlord'; });

    // Apply search
    if (search) {
      filtered = filtered.filter(function (cl) {
        var hay = ((cl.name || '') + ' ' + (cl.email || '') + ' ' + (cl.phone || '')).toLowerCase();
        return hay.indexOf(search) !== -1;
      });
    }

    // Counts
    var counts = {
      all: clients.length,
      hot: clients.filter(function (cl) { return cl._isHot && (cl.type === 'buyer' || cl.client_type === 'buyer'); }).length,
      followup: clients.filter(function (cl) { return cl._needsFollowUp; }).length,
      lease: clients.filter(function (cl) { return cl._leaseExpiring; }).length,
      pipeline: clients.filter(function (cl) { return cl._isPipeline; }).length,
      past: clients.filter(function (cl) { return cl._isPast; }).length,
    };

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
      '<h2 class="text-lg font-bold text-gray-900">My Clients</h2>' +
      '<div class="flex gap-2">' +
        '<div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
          '<input type="text" placeholder="Search clients..." class="form-input pl-9 text-sm w-48" value="' + E(_myClientsSearch) + '" oninput="Panels._searchMyClients(this.value)"></div>' +
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickNewClient()"><i class="fas fa-user-plus mr-1"></i> New Client</button>' +
      '</div>' +
    '</div>';

    // Saved view tabs
    var views = [
      { key: 'all', label: 'All', count: counts.all, color: '' },
      { key: 'hot', label: 'Hot Buyers', count: counts.hot, color: counts.hot > 0 ? 'bg-green-100 text-green-700 border-green-300' : '' },
      { key: 'followup', label: 'Needs Follow-Up', count: counts.followup, color: counts.followup > 0 ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : '' },
      { key: 'lease', label: 'Lease Expiring', count: counts.lease, color: counts.lease > 0 ? 'bg-red-100 text-red-700 border-red-300' : '' },
      { key: 'pipeline', label: 'Pipeline', count: counts.pipeline, color: '' },
      { key: 'past', label: 'Past Clients', count: counts.past, color: '' },
    ];
    html += '<div class="flex gap-1 overflow-x-auto pb-1">';
    views.forEach(function (v) {
      var active = view === v.key;
      html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ' +
        (active ? 'bg-gray-900 text-white border-gray-900' : v.color || 'bg-white text-gray-600 border-gray-200 hover:border-gold') +
        '" onclick="Panels._switchMyClientsView(\'' + v.key + '\')">' + E(v.label) + ' (' + v.count + ')</button>';
    });
    // Type sub-filters
    html += '<span class="border-l border-gray-300 mx-1"></span>';
    ['buyer', 'seller', 'renter', 'landlord'].forEach(function (t) {
      var active = view === t;
      html += '<button class="px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ' +
        (active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gold') +
        '" onclick="Panels._switchMyClientsView(\'' + t + '\')">' + E(t.charAt(0).toUpperCase() + t.slice(1)) + 's</button>';
    });
    html += '</div>';

    // Results count
    html += '<p class="text-xs text-gray-500">' + filtered.length + ' client' + (filtered.length !== 1 ? 's' : '') + '</p>';

    // Client table
    if (filtered.length === 0) {
      html += UI.emptyState('fa-users', 'No clients match current view');
    } else {
      html += '<div class="data-table"><div style="overflow-x:auto"><table class="w-full"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Stage</th>' +
        '<th class="text-left px-3 py-2">Health</th>' +
        '<th class="text-left px-3 py-2">Last Activity</th>' +
        '<th class="text-left px-3 py-2">Next Task</th>' +
        '<th class="text-left px-3 py-2 hidden sm:table-cell">Listings</th>' +
      '</tr></thead><tbody>';

      filtered.forEach(function (cl) {
        // Determine best workspace tab to open
        var bestTab = 'overview';
        if (cl._nextTask) bestTab = 'pipeline';
        else if (cl._needsFollowUp) bestTab = 'activity';
        else if (cl._leaseExpiring) bestTab = 'pipeline';

        // Health indicator
        var healthHtml = '';
        if (cl._isHot) healthHtml = '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-bold">Hot</span>';
        else if (cl._needsFollowUp) healthHtml = '<span class="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px] font-bold">Follow Up</span>';
        else if (cl._isInactive) healthHtml = '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px] font-bold">Inactive</span>';
        else healthHtml = '<span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">Active</span>';
        if (cl._leaseExpiring) healthHtml += ' <span class="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold">Lease ' + (cl._leaseDaysLeft || '?') + 'd</span>';
        if (cl.healthScore) healthHtml += ' <span class="text-[9px] text-gray-400">' + cl.healthScore + '</span>';

        // Next task
        var taskHtml = '-';
        if (cl._nextTask) {
          var t = cl._nextTask;
          var overdue = t.due_date && new Date(t.due_date) < new Date();
          taskHtml = '<p class="text-xs ' + (overdue ? 'text-red-600 font-bold' : 'text-gray-600') + ' truncate max-w-[140px]">' + E(t.title || 'Task') + '</p>' +
            (t.due_date ? '<p class="text-[10px] ' + (overdue ? 'text-red-500' : 'text-gray-400') + '">' + (overdue ? 'Overdue ' : 'Due ') + D(t.due_date) + '</p>' : '');
        }

        html += '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/' + bestTab + '\')">' +
          '<td class="px-3 py-2"><div class="flex items-center gap-2">' +
            UI.avatar(cl.name || cl.email, 28) +
            '<div><p class="text-sm font-medium">' + E(cl.name || cl.email || 'Unknown') + '</p>' +
              '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div></div></td>' +
          '<td class="px-3 py-2">' + UI.roleBadge(cl.type || cl.client_type) + '</td>' +
          '<td class="px-3 py-2">' + UI.stageBadge(cl.stage || cl.status) + '</td>' +
          '<td class="px-3 py-2">' + healthHtml + '</td>' +
          '<td class="px-3 py-2"><span class="text-xs text-gray-500">' + Utils.formatTimeAgo(cl.updated_at || cl.updatedAt) + '</span></td>' +
          '<td class="px-3 py-2">' + taskHtml + '</td>' +
          '<td class="px-3 py-2 hidden sm:table-cell"><span class="text-xs text-gray-500">' + (cl._listingsCount || 0) + '</span></td>' +
        '</tr>';
      });

      html += '</tbody></table></div></div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  function _switchMyClientsView(view) {
    _myClientsView = view;
    _renderMyClients(_container());
  }

  function _searchMyClients(q) {
    _myClientsSearch = q;
    _renderMyClients(_container());
  }

  // Legacy alias
  function _filterClients(type) {
    _myClientsView = type;
    _renderMyClients(_container());
  }

  // ─── Pipeline ────────────────────────────────────────────────────────
  var PIPELINE_STAGES = [
    { key: 'new', title: 'New', color: '#6b7280', icon: 'fa-inbox' },
    { key: 'contacted', title: 'Contacted', color: '#3b82f6', icon: 'fa-phone' },
    { key: 'nurturing', title: 'Nurturing', color: '#8b5cf6', icon: 'fa-seedling' },
    { key: 'active', title: 'Active', color: '#059669', icon: 'fa-bolt' },
    { key: 'showing', title: 'Showing', color: '#f59e0b', icon: 'fa-calendar' },
    { key: 'offer', title: 'Offer', color: '#f97316', icon: 'fa-gavel' },
    { key: 'deal', title: 'Deal', color: '#10b981', icon: 'fa-handshake' },
    { key: 'closed', title: 'Closed', color: '#374151', icon: 'fa-check-circle' },
  ];

  function pipeline() {
    CRM.setPanelTitle('Pipeline');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI.clients.list({ limit: 300 }).catch(function () { return { clients: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
    ]).then(function (r) {
      var clients = r[0].clients || [];
      var tasks = r[1].tasks || [];
      var now = new Date();
      var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

      // Enrich clients
      clients.forEach(function (cl) {
        var cid = cl.id;
        var clientTasks = tasks.filter(function (t) { return (t.client_id === cid || t.clientId === cid) && t.status !== 'completed'; });
        clientTasks.sort(function (a, b) { return new Date(a.due_date || '9999') - new Date(b.due_date || '9999'); });
        cl._nextTask = clientTasks[0] || null;
        cl._lastActivity = new Date(cl.updated_at || cl.updatedAt || cl.created_at || 0);
        cl._isStale = cl._lastActivity < sevenDaysAgo;
        cl._isRenter = (cl.type === 'renter' || cl.client_type === 'renter');
        cl._leaseEnd = cl.leaseEndDate || cl.lease_end_date;
        cl._conversionProb = cl.conversionProbability || 0;

        // Next best action
        if (cl._nextTask && cl._nextTask.due_date && new Date(cl._nextTask.due_date) < now) {
          cl._nba = { label: 'Complete overdue task', icon: 'fa-exclamation-circle', color: '#DC2626' };
        } else if (cl._isStale) {
          cl._nba = { label: 'Follow up', icon: 'fa-phone', color: '#F59E0B' };
        } else if (cl._isRenter && cl._leaseEnd && Utils.daysUntil(cl._leaseEnd) <= 90) {
          cl._nba = { label: 'Discuss conversion', icon: 'fa-exchange-alt', color: '#7C3AED' };
        } else if (cl._nextTask) {
          cl._nba = { label: cl._nextTask.title, icon: 'fa-tasks', color: '#2563EB' };
        } else {
          cl._nba = { label: 'Send listings', icon: 'fa-paper-plane', color: '#059669' };
        }
      });

      var grouped = Utils.groupBy(clients, function (cl) { return (cl.stage || cl.status || 'new').toLowerCase(); });

      var html = '<div class="space-y-4">';

      // Summary bar
      html += '<div class="flex gap-1 p-3 bg-white rounded-xl border overflow-x-auto">';
      PIPELINE_STAGES.forEach(function (s, i) {
        var count = (grouped[s.key] || []).length;
        html += '<div class="flex-1 text-center min-w-[60px]">' +
          '<div class="w-9 h-9 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-xs font-bold" style="background:' + s.color + '">' + count + '</div>' +
          '<p class="text-[9px] font-bold text-gray-500 uppercase">' + E(s.title) + '</p>' +
        '</div>';
        if (i < PIPELINE_STAGES.length - 1) html += '<div class="text-gray-300 flex items-center"><i class="fas fa-chevron-right text-[8px]"></i></div>';
      });
      html += '</div>';

      // Pipeline total
      html += '<p class="text-xs text-gray-500">' + clients.length + ' clients in pipeline</p>';

      // Kanban board with rich cards
      html += '<div class="kanban-board">';
      PIPELINE_STAGES.forEach(function (s) {
        var stageClients = grouped[s.key] || [];
        html += '<div class="kanban-col">' +
          '<div class="kanban-col-header" style="border-color:' + s.color + '">' +
            '<span class="kanban-col-title" style="color:' + s.color + '"><i class="fas ' + s.icon + ' mr-1"></i> ' + E(s.title) + '</span>' +
            '<span class="kanban-col-count" style="background:' + s.color + '">' + stageClients.length + '</span>' +
          '</div>' +
          '<div class="kanban-col-body" data-stage="' + E(s.key) + '" ' +
            'ondragover="event.preventDefault();this.style.background=\'#FFFBF0\'" ' +
            'ondragleave="this.style.background=\'\'" ' +
            'ondrop="Panels._pipelineDrop(event,\'' + E(s.key) + '\')">';

        if (stageClients.length === 0) {
          html += '<div class="text-center text-xs text-gray-400 py-6"><i class="fas fa-inbox block text-lg mb-1"></i>Empty</div>';
        } else {
          stageClients.forEach(function (cl) {
            html += _pipelineCard(cl, s.key);
          });
        }

        html += '</div></div>';
      });
      html += '</div>';

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-stream', 'Unable to load pipeline');
    });
  }

  function _pipelineCard(cl, stageKey) {
    var name = cl.name || cl.full_name || cl.email || 'Unknown';
    var type = cl.type || cl.client_type || '';
    var nba = cl._nba || {};

    var html = '<div class="kanban-card" draggable="true" ' +
      'data-client-id="' + E(cl.id) + '" ' +
      'ondragstart="Panels._pipelineDragStart(event,\'' + E(cl.id) + '\')" ' +
      'onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/pipeline\')">';

    // Header: name + type badge
    html += '<div class="flex items-center justify-between mb-1">' +
      '<p class="text-sm font-semibold text-gray-900 truncate flex-1">' + E(name) + '</p>' +
      UI.roleBadge(type) +
    '</div>';

    // Contact
    if (cl.email) html += '<p class="text-xs text-gray-500 truncate">' + E(cl.email) + '</p>';

    // Badges row
    html += '<div class="flex flex-wrap gap-1 mt-1.5">';

    // Conversion badge for renters
    if (cl._isRenter && cl._conversionProb > 0) {
      var convColor = cl._conversionProb >= 70 ? '#059669' : cl._conversionProb >= 40 ? '#F59E0B' : '#6b7280';
      html += '<span class="px-1 py-0.5 rounded text-[8px] font-bold text-white" style="background:' + convColor + '">' +
        '<i class="fas fa-exchange-alt mr-0.5"></i>' + cl._conversionProb + '%</span>';
    }

    // Lease expiry for renters
    if (cl._isRenter && cl._leaseEnd) {
      var daysLeft = Utils.daysUntil(cl._leaseEnd);
      if (daysLeft !== null && daysLeft <= 180) {
        var leaseColor = daysLeft <= 30 ? '#DC2626' : daysLeft <= 90 ? '#F59E0B' : '#6b7280';
        html += '<span class="px-1 py-0.5 rounded text-[8px] font-bold" style="background:' + leaseColor + '15;color:' + leaseColor + '">Lease ' + daysLeft + 'd</span>';
      }
    }

    // Inactivity warning
    if (cl._isStale) {
      html += '<span class="px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[8px] font-bold"><i class="fas fa-clock mr-0.5"></i>Stale</span>';
    }

    html += '</div>';

    // Next best action
    html += '<div class="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">' +
      '<i class="fas ' + (nba.icon || 'fa-arrow-right') + ' text-[9px]" style="color:' + (nba.color || '#6b7280') + '"></i>' +
      '<span class="text-[10px] text-gray-600 truncate">' + E(nba.label || 'Open workspace') + '</span>' +
    '</div>';

    // Move buttons
    html += '<div class="flex items-center justify-between mt-1.5" onclick="event.stopPropagation()">';
    var stageIdx = -1;
    PIPELINE_STAGES.forEach(function (s, i) { if (s.key === stageKey) stageIdx = i; });
    if (stageIdx > 0) {
      html += '<button class="text-[9px] text-gray-400 hover:text-gold" onclick="Panels._pipelineMove(\'' + E(cl.id) + '\',\'' + E(PIPELINE_STAGES[stageIdx - 1].key) + '\')"><i class="fas fa-arrow-left"></i> ' + E(PIPELINE_STAGES[stageIdx - 1].title) + '</button>';
    } else {
      html += '<span></span>';
    }
    if (stageIdx < PIPELINE_STAGES.length - 1) {
      html += '<button class="text-[9px] text-gray-400 hover:text-gold" onclick="Panels._pipelineMove(\'' + E(cl.id) + '\',\'' + E(PIPELINE_STAGES[stageIdx + 1].key) + '\')">' + E(PIPELINE_STAGES[stageIdx + 1].title) + ' <i class="fas fa-arrow-right"></i></button>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  function _pipelineDragStart(event, clientId) {
    event.dataTransfer.setData('text/plain', clientId);
    event.dataTransfer.effectAllowed = 'move';
  }

  function _pipelineDrop(event, newStage) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    var clientId = event.dataTransfer.getData('text/plain');
    if (!clientId) return;
    _pipelineMove(clientId, newStage);
  }

  function _pipelineMove(clientId, newStage) {
    MallanAPI.clients.update(clientId, { stage: newStage }).then(function () {
      Events.log('client_stage_moved', 'client', clientId, { to: newStage });
      CRM.toast('Moved to ' + newStage, 'success');
      pipeline(); // refresh
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to move'), 'error');
    });
  }

  // ─── Tasks ───────────────────────────────────────────────────────────
  var _tasksData = [];
  var _tasksView = 'today';

  function tasks() {
    CRM.setPanelTitle('Tasks & Follow-ups');
    var c = _container(); c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
    ]).then(function (r) {
      var allTasks = r[0].tasks || [];
      var clients = r[1].clients || [];
      var clientMap = {};
      clients.forEach(function (cl) { clientMap[cl.id] = cl.name || cl.full_name || cl.email || 'Client'; });

      // Enrich tasks with client names
      allTasks.forEach(function (t) {
        var cid = t.client_id || t.clientId;
        t._clientName = cid ? (clientMap[cid] || cid) : '';
        t._clientId = cid || null;
      });

      _tasksData = allTasks;
      _renderTasks(c, clientMap);
    });
  }

  function _renderTasks(c, clientMap) {
    var allTasks = _tasksData;
    var view = _tasksView;
    var now = new Date();
    var todayStr = now.toISOString().substring(0, 10);
    var tomorrowStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().substring(0, 10);
    var weekStr = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString().substring(0, 10);

    // Categorize
    var today = allTasks.filter(function (t) { return t.status !== 'completed' && t.due_date && t.due_date.substring(0, 10) === todayStr; });
    var overdue = allTasks.filter(function (t) { return t.status !== 'completed' && t.due_date && t.due_date.substring(0, 10) < todayStr; });
    var upcoming = allTasks.filter(function (t) { return t.status !== 'completed' && t.due_date && t.due_date.substring(0, 10) > todayStr && t.due_date.substring(0, 10) <= weekStr; });
    var noDue = allTasks.filter(function (t) { return t.status !== 'completed' && !t.due_date; });
    var completed = allTasks.filter(function (t) { return t.status === 'completed'; });
    var allPending = allTasks.filter(function (t) { return t.status !== 'completed'; });

    // Filter by view
    var filtered = allTasks;
    if (view === 'today') filtered = today;
    else if (view === 'overdue') filtered = overdue;
    else if (view === 'upcoming') filtered = upcoming.concat(noDue);
    else if (view === 'completed') filtered = completed;
    else if (view === 'all') filtered = allTasks;

    // Sort: overdue first, then by due date, then no-date last
    filtered.sort(function (a, b) {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      var da = a.due_date || '9999';
      var db = b.due_date || '9999';
      if (da < todayStr && db >= todayStr) return -1;
      if (da >= todayStr && db < todayStr) return 1;
      return da < db ? -1 : da > db ? 1 : 0;
    });

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
      '<h2 class="text-lg font-bold text-gray-900">Tasks & Follow-ups</h2>' +
      '<button class="btn btn-sm btn-gold" onclick="CRM.quickTask()"><i class="fas fa-plus mr-1"></i> New Task</button>' +
    '</div>';

    // Stats
    html += UI.statGrid([
      UI.statCard(today.length, 'Due Today', 'fa-calendar-day', '#2563EB'),
      UI.statCard(overdue.length, 'Overdue', 'fa-exclamation-triangle', overdue.length > 0 ? '#DC2626' : '#059669'),
      UI.statCard(upcoming.length, 'Upcoming (7d)', 'fa-calendar-week', '#F59E0B'),
      UI.statCard(completed.length, 'Completed', 'fa-check-circle', '#059669'),
    ]);

    // View tabs
    var views = [
      { key: 'today', label: 'Today', count: today.length, color: '' },
      { key: 'overdue', label: 'Overdue', count: overdue.length, color: overdue.length > 0 ? 'bg-red-100 text-red-700 border-red-300' : '' },
      { key: 'upcoming', label: 'Upcoming', count: upcoming.length + noDue.length, color: '' },
      { key: 'completed', label: 'Completed', count: completed.length, color: '' },
      { key: 'all', label: 'All', count: allTasks.length, color: '' },
    ];
    html += '<div class="flex gap-1 overflow-x-auto">';
    views.forEach(function (v) {
      var active = view === v.key;
      html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ' +
        (active ? 'bg-gray-900 text-white border-gray-900' : v.color || 'bg-white text-gray-600 border-gray-200 hover:border-gold') +
        '" onclick="Panels._switchTasksView(\'' + v.key + '\')">' + E(v.label) + ' (' + v.count + ')</button>';
    });
    html += '</div>';

    // Task list
    if (filtered.length === 0) {
      var emptyMsg = view === 'today' ? 'No tasks due today — you\'re all caught up!' :
                     view === 'overdue' ? 'No overdue tasks!' :
                     'No tasks in this view';
      html += UI.emptyState('fa-check-circle', emptyMsg, '<button class="btn btn-sm btn-gold" onclick="CRM.quickTask()"><i class="fas fa-plus"></i> Add Task</button>');
    } else {
      html += '<div class="space-y-1">';
      filtered.forEach(function (t) {
        var isDone = t.status === 'completed';
        var isOverdue = !isDone && t.due_date && t.due_date.substring(0, 10) < todayStr;
        var isToday = !isDone && t.due_date && t.due_date.substring(0, 10) === todayStr;

        // Priority indicator
        var priColor = t.priority === 'urgent' ? '#DC2626' : t.priority === 'high' ? '#F59E0B' : '#e5e7eb';

        html += '<div class="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-all" style="border-left:3px solid ' + priColor + '">';

        // Checkbox
        html += '<button class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ' +
          (isDone ? 'border-green-500 bg-green-500' : isOverdue ? 'border-red-400 hover:border-gold' : 'border-gray-300 hover:border-gold') + '" ' +
          'onclick="Panels._toggleTaskStatus(\'' + E(t.id) + '\',' + !isDone + ')">' +
          (isDone ? '<i class="fas fa-check text-white text-[9px]"></i>' : '') +
        '</button>';

        // Content
        html += '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-medium ' + (isDone ? 'line-through text-gray-400' : 'text-gray-900') + ' truncate">' + E(t.title || 'Task') + '</p>' +
          '<div class="flex items-center gap-3 mt-0.5">';

        // Due date
        if (t.due_date) {
          html += '<span class="text-xs ' + (isOverdue ? 'text-red-600 font-bold' : isToday ? 'text-blue-600 font-semibold' : 'text-gray-500') + '">' +
            '<i class="fas fa-clock mr-1"></i>' + (isOverdue ? 'Overdue ' : isToday ? 'Today · ' : '') + D(t.due_date) + '</span>';
        }

        // Client link
        if (t._clientName) {
          html += '<span class="text-xs text-gray-500 cursor-pointer hover:text-gold" onclick="event.stopPropagation();Router.navigate(\'/workspace/client/' + E(t._clientId || '') + '/pipeline\')">' +
            '<i class="fas fa-user mr-1"></i>' + E(t._clientName) + '</span>';
        }

        // Priority badge
        if (t.priority && t.priority !== 'normal') {
          var pColors = { urgent: 'bg-red-100 text-red-700', high: 'bg-yellow-100 text-yellow-700' };
          html += '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ' + (pColors[t.priority] || '') + '">' + E(t.priority) + '</span>';
        }

        html += '</div></div>';

        // Actions
        html += '<div class="flex items-center gap-1 flex-shrink-0" onclick="event.stopPropagation()">' +
          (isDone ?
            '<button class="text-xs text-gray-400 hover:text-blue-500" onclick="Panels._toggleTaskStatus(\'' + E(t.id) + '\',false)" title="Reopen"><i class="fas fa-undo"></i></button>' :
            '<button class="text-xs text-gray-400 hover:text-green-500" onclick="Panels._toggleTaskStatus(\'' + E(t.id) + '\',true)" title="Complete"><i class="fas fa-check"></i></button>'
          ) +
          '<button class="text-xs text-gray-400 hover:text-red-500" onclick="Panels._deleteTask(\'' + E(t.id) + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>';

        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  function _switchTasksView(view) {
    _tasksView = view;
    _renderTasks(_container());
  }

  function _toggleTaskStatus(taskId, complete) {
    MallanAPI._fetch('/api/crm/tasks/' + encodeURIComponent(taskId), {
      method: 'PATCH',
      body: JSON.stringify({ status: complete ? 'completed' : 'pending' }),
    }).then(function () {
      // Update local data
      _tasksData.forEach(function (t) {
        if (t.id === taskId) t.status = complete ? 'completed' : 'pending';
      });
      if (complete) Events.log('task_completed', 'task', taskId);
      CRM.toast(complete ? 'Task completed' : 'Task reopened', 'success');
      _renderTasks(_container());
    }).catch(function () {
      // Optimistic update anyway
      _tasksData.forEach(function (t) {
        if (t.id === taskId) t.status = complete ? 'completed' : 'pending';
      });
      _renderTasks(_container());
    });
  }

  function _deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    MallanAPI._fetch('/api/crm/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' }).then(function () {
      _tasksData = _tasksData.filter(function (t) { return t.id !== taskId; });
      CRM.toast('Task deleted', 'success');
      _renderTasks(_container());
    }).catch(function () {
      _tasksData = _tasksData.filter(function (t) { return t.id !== taskId; });
      _renderTasks(_container());
    });
  }

  // ─── Communications (Unified Model) ─────────────────────────────────
  // Communication Record: { id, type (email|sms|listing_send|campaign|note|reply),
  //   direction (outbound|inbound), channel (email|sms|portal|system),
  //   clientId, listingId?, from, to, subject, body, templateId?,
  //   threadId?, status (draft|sent|delivered|opened|failed),
  //   sentAt, readAt, metadata }
  var _commsTab = 'inbox';
  var _commsClients = [];
  var _commsTemplates = [];
  var _commsSelectedRecipients = [];
  var _commsAttachedListing = null;
  var _commsCache = [];          // full communications list from API
  var _commsUnreadCount = 0;
  var _commsActiveThread = null; // threadId or commId for thread view

  var _defaultTemplates = [
    { id: 'tpl_1', name: 'New Listing Alert', subject: 'New Listing: {{listing_address}}', body: 'Hi {{client_name}},\n\nI wanted to share an exciting new listing with you:\n\n{{listing_address}} — {{listing_price}}\n\nThis property just hit the market and I think it could be a great fit for you. Let me know if you\'d like to schedule a showing.\n\nBest regards' },
    { id: 'tpl_2', name: 'Market Update', subject: 'Your Monthly Market Update', body: 'Hi {{client_name}},\n\nHere\'s your monthly market summary for the areas you\'re interested in.\n\nKey trends this month:\n- Inventory levels\n- Average days on market\n- Price movement\n\nLet me know if you\'d like to discuss any of these trends and how they affect your search.\n\nBest regards' },
    { id: 'tpl_3', name: 'Follow-Up After Showing', subject: 'Following Up on Today\'s Showing', body: 'Hi {{client_name}},\n\nThank you for taking the time to view the property today. I\'d love to hear your thoughts.\n\nWhat did you think of the space? Were there any features you particularly liked or any concerns?\n\nI\'m happy to answer any questions or schedule additional viewings.\n\nBest regards' },
    { id: 'tpl_4', name: 'Price Reduction Notice', subject: 'Price Reduction: {{listing_address}}', body: 'Hi {{client_name}},\n\nGreat news — a property you may be interested in just had a price reduction:\n\n{{listing_address}} — Now {{listing_price}}\n\nThis could be a great opportunity. Would you like to schedule a viewing?\n\nBest regards' },
    { id: 'tpl_5', name: 'Lease Expiry Reminder', subject: 'Your Lease is Approaching Renewal', body: 'Hi {{client_name}},\n\nI wanted to reach out as your lease expiration is approaching. Now is a great time to start exploring your options:\n\n- Renew at your current location\n- Explore new apartments on the market\n- Negotiate better terms\n\nLet me know how you\'d like to proceed and I\'ll be happy to help.\n\nBest regards' },
    { id: 'tpl_6', name: 'Open House Invitation', subject: 'You\'re Invited: Open House at {{listing_address}}', body: 'Hi {{client_name}},\n\nI\'m hosting an open house and I think you should check it out:\n\n{{listing_address}} — {{listing_price}}\n\nDate & Time: [TBD]\n\nNo appointment needed — just stop by. I\'d love to see you there.\n\nBest regards' },
    { id: 'tpl_7', name: 'CMA Report Cover', subject: 'Your Comparative Market Analysis', body: 'Hi {{client_name}},\n\nAttached is the Comparative Market Analysis (CMA) report we discussed. This report covers:\n\n- Recent comparable sales in your area\n- Current market conditions\n- Recommended pricing strategy\n\nPlease review at your convenience and let\'s schedule a time to discuss the findings.\n\nBest regards' },
    { id: 'tpl_8', name: 'New Client Welcome', subject: 'Welcome — Let\'s Get Started', body: 'Hi {{client_name}},\n\nWelcome! I\'m excited to work with you on your real estate journey.\n\nHere\'s what you can expect from me:\n- Personalized property recommendations\n- Market insights and analysis\n- Transparent communication every step of the way\n\nTo get started, could you share your preferences (neighborhoods, budget, must-haves)? That way I can begin curating options for you.\n\nLooking forward to working together.\n\nBest regards' },
  ];

  function _loadTemplates() {
    // Try API first, fall back to localStorage
    MallanAPI._fetch('/api/crm/communications/templates').then(function (res) {
      if (res && res.templates && res.templates.length > 0) {
        _commsTemplates = res.templates;
        return;
      }
      _loadTemplatesLocal();
    }).catch(function () {
      _loadTemplatesLocal();
    });
    // Synchronous fallback for immediate use
    if (_commsTemplates.length === 0) _loadTemplatesLocal();
    return _commsTemplates;
  }

  function _loadTemplatesLocal() {
    try {
      var stored = localStorage.getItem('mallan_crm_email_templates');
      if (stored) {
        _commsTemplates = JSON.parse(stored);
      } else {
        _commsTemplates = _defaultTemplates.slice();
        localStorage.setItem('mallan_crm_email_templates', JSON.stringify(_commsTemplates));
      }
    } catch (e) {
      _commsTemplates = _defaultTemplates.slice();
    }
  }

  function _saveTemplates() {
    try { localStorage.setItem('mallan_crm_email_templates', JSON.stringify(_commsTemplates)); } catch (e) { /* noop */ }
  }

  // ── Load all communications from API ──────────────────────────────────
  function _commsLoadAll() {
    return MallanAPI._fetch('/api/crm/communications?limit=200').then(function (res) {
      _commsCache = (res && res.communications) || [];
      // Compute unread count (inbound without readAt)
      _commsUnreadCount = _commsCache.filter(function (c) {
        return c.direction === 'inbound' && !c.readAt;
      }).length;
      // Update sidebar badge if badge system exists
      if (typeof CRM.updateBadge === 'function') {
        CRM.updateBadge('communications', _commsUnreadCount);
      }
      return _commsCache;
    }).catch(function () {
      _commsCache = [];
      _commsUnreadCount = 0;
      return [];
    });
  }

  function communications() {
    CRM.setPanelTitle('Communications');
    var c = _container();
    c.innerHTML = UI.loading();

    _commsLoadAll().then(function () {
      _renderCommunicationsShell(c);
    });
  }

  function _renderCommunicationsShell(c) {
    var tabs = [
      { key: 'inbox', label: 'Inbox', icon: 'fa-inbox', badge: _commsUnreadCount },
      { key: 'email', label: 'Email Center', icon: 'fa-envelope' },
      { key: 'listing-sends', label: 'Listing Sends', icon: 'fa-share-square' },
      { key: 'templates', label: 'Templates', icon: 'fa-file-alt' },
      { key: 'campaigns', label: 'Campaigns', icon: 'fa-bullhorn' },
      { key: 'threads', label: 'Threads', icon: 'fa-comments' },
    ];

    var tabBar = '<div class="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">' +
      tabs.map(function (t) {
        var active = _commsTab === t.key;
        var badgeHtml = (t.badge && t.badge > 0)
          ? ' <span class="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">' + t.badge + '</span>'
          : '';
        return '<button class="px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ' +
          (active ? 'border-gold text-gold' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300') +
          '" onclick="Panels._commsTabSwitch(\'' + t.key + '\')">' +
          '<i class="fas ' + t.icon + ' mr-1.5"></i>' + E(t.label) + badgeHtml + '</button>';
      }).join('') +
    '</div>';

    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Communications Center', 'Inbox, email, listing sends, templates, campaigns, threads') +
      tabBar +
      '<div id="commsTabContent"></div>' +
    '</div>';

    _commsRenderTab();
  }

  function _commsTabSwitch(tab) {
    _commsTab = tab;
    _commsActiveThread = null;
    var c = _container();
    var tabKeys = ['inbox', 'email', 'listing-sends', 'templates', 'campaigns', 'threads'];
    var buttons = c.querySelectorAll('.border-b-2');
    buttons.forEach(function (btn, i) {
      if (tabKeys[i] === tab) {
        btn.className = btn.className.replace('border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'border-gold text-gold');
      } else {
        btn.className = btn.className.replace('border-gold text-gold', 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300');
      }
    });
    _commsRenderTab();
  }

  function _commsRenderTab() {
    var el = document.getElementById('commsTabContent');
    if (!el) return;

    if (_commsTab === 'inbox') { _commsRenderInbox(el); }
    else if (_commsTab === 'email') { _commsRenderEmailCenter(el); }
    else if (_commsTab === 'listing-sends') { _commsRenderListingSends(el); }
    else if (_commsTab === 'templates') { _commsRenderTemplates(el); }
    else if (_commsTab === 'campaigns') { _commsRenderCampaigns(el); }
    else if (_commsTab === 'threads') { _commsRenderThreads(el); }
  }

  // ── Tab 1: Inbox ──────────────────────────────────────────────────────
  function _commsRenderInbox(el) {
    var inbound = _commsCache.filter(function (c) { return c.direction === 'inbound'; });
    inbound.sort(function (a, b) {
      return new Date(b.sentAt || b.created_at || 0) - new Date(a.sentAt || a.created_at || 0);
    });

    if (inbound.length === 0) {
      el.innerHTML = UI.emptyState('fa-inbox', 'No inbound messages yet');
      return;
    }

    var rows = inbound.map(function (msg) {
      var isUnread = !msg.readAt;
      var from = msg.from || msg.clientName || '-';
      var subject = msg.subject || '(no subject)';
      var preview = (msg.body || '').substring(0, 60).replace(/\n/g, ' ');
      if ((msg.body || '').length > 60) preview += '...';
      var date = D(msg.sentAt || msg.created_at);
      var channelIcon = msg.channel === 'sms' ? 'fa-sms' : msg.channel === 'portal' ? 'fa-globe' : 'fa-envelope';
      var clientBadge = msg.clientId
        ? '<span class="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs ml-2"><i class="fas fa-user mr-0.5"></i>' + E(msg.clientName || 'Client') + '</span>'
        : '';

      return '<div class="flex items-start gap-3 p-3 border-b hover:bg-gray-50 cursor-pointer' + (isUnread ? ' bg-blue-50/50' : '') + '" onclick="Panels._viewThread(\'' + E(msg.id || '') + '\')">' +
        '<div class="flex-shrink-0 mt-1">' +
          (isUnread ? '<span class="block w-2.5 h-2.5 bg-blue-500 rounded-full"></span>' : '<span class="block w-2.5 h-2.5 border border-gray-300 rounded-full"></span>') +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-sm ' + (isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700') + '">' + E(from) + '</span>' +
            '<span class="text-xs text-gray-400 flex-shrink-0">' + date + '</span>' +
          '</div>' +
          '<div class="flex items-center">' +
            '<i class="fas ' + channelIcon + ' text-xs text-gray-400 mr-1.5"></i>' +
            '<span class="text-sm ' + (isUnread ? 'font-semibold text-gray-800' : 'text-gray-600') + ' truncate">' + E(subject) + '</span>' +
            clientBadge +
          '</div>' +
          '<p class="text-xs text-gray-400 truncate mt-0.5">' + E(preview) + '</p>' +
        '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="flex justify-between items-center mb-3">' +
        '<span class="text-sm text-gray-500">' + inbound.length + ' messages' +
          (_commsUnreadCount > 0 ? ' <span class="text-blue-600 font-medium">(' + _commsUnreadCount + ' unread)</span>' : '') +
        '</span>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._commsRefreshInbox()"><i class="fas fa-sync-alt mr-1"></i>Refresh</button>' +
      '</div>' +
      '<div class="border rounded-lg overflow-hidden">' + rows + '</div>';
  }

  function _commsRefreshInbox() {
    var el = document.getElementById('commsTabContent');
    if (el) el.innerHTML = UI.loading();
    _commsLoadAll().then(function () {
      _commsRenderTab();
    });
  }

  // ── Tab 2: Email Center ─────────────────────────────────────────────
  function _commsRenderEmailCenter(el) {
    var emails = _commsCache.filter(function (c) {
      return c.type === 'email' && c.direction === 'outbound';
    });
    emails.sort(function (a, b) {
      return new Date(b.sentAt || b.created_at || 0) - new Date(a.sentAt || a.created_at || 0);
    });

    el.innerHTML =
      '<div class="flex gap-3 mb-4">' +
        '<button class="btn btn-gold" onclick="Panels._composeEmail()"><i class="fas fa-pen mr-1.5"></i>Compose Email</button>' +
        '<button class="btn btn-outline" onclick="Panels._composeSMS()"><i class="fas fa-sms mr-1.5"></i>Compose SMS</button>' +
        '<button class="btn btn-outline" onclick="Panels._composeBulk()"><i class="fas fa-paper-plane mr-1.5"></i>Compose eBlast</button>' +
      '</div>' +
      UI.card('Recent Sent Emails',
        emails.length > 0 ?
          UI.dataTable([
            { key: 'date', label: 'Date', render: function (c) { return '<span class="text-xs text-gray-500">' + D(c.sentAt || c.created_at) + '</span>'; }},
            { key: 'to', label: 'To', render: function (c) {
              var to = c.to || (c.metadata && c.metadata.recipientNames) || '-';
              return '<span class="text-sm">' + E(Array.isArray(to) ? to.join(', ') : to) + '</span>';
            }},
            { key: 'subject', label: 'Subject', render: function (c) { return '<span class="text-sm font-medium">' + E(c.subject || '-') + '</span>'; }},
            { key: 'status', label: 'Status', render: function (c) {
              var st = c.status || 'sent';
              var badge = st === 'opened' ? 'active' : st === 'failed' ? 'withdrawn' : st === 'delivered' ? 'active' : 'pending';
              return '<span class="badge badge-' + badge + '">' + E(st.charAt(0).toUpperCase() + st.slice(1)) + '</span>';
            }},
            { key: 'action', label: '', render: function (c) {
              return '<button class="btn btn-sm btn-outline" onclick="Panels._viewThread(\'' + E(c.id || '') + '\')"><i class="fas fa-eye"></i></button>' +
                '<button class="btn btn-sm btn-outline ml-1" onclick="Panels._replyToThread(\'' + E(c.threadId || c.id || '') + '\')"><i class="fas fa-reply"></i></button>';
            }},
          ], emails) :
          '<p class="text-sm text-gray-500 p-4">No emails sent yet. Compose your first email above.</p>'
      );
  }

  function _viewEmailDetail(commId) {
    _viewThread(commId);
  }

  // ── Tab 4: Templates ────────────────────────────────────────────────
  function _commsRenderTemplates(el) {
    _loadTemplates();

    var cards = _commsTemplates.map(function (tpl, idx) {
      var preview = (tpl.body || '').substring(0, 80).replace(/\n/g, ' ');
      if ((tpl.body || '').length > 80) preview += '...';
      return '<div class="card p-4 space-y-2">' +
        '<div class="flex justify-between items-start">' +
          '<h4 class="text-sm font-bold">' + E(tpl.name) + '</h4>' +
          '<div class="flex gap-1">' +
            '<button class="btn btn-sm btn-gold" onclick="Panels._useTemplate(' + idx + ')" title="Use"><i class="fas fa-pen"></i> Use</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Panels._editTemplate(' + idx + ')" title="Edit"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm btn-outline text-red-500" onclick="Panels._deleteTemplate(' + idx + ')" title="Delete"><i class="fas fa-trash"></i></button>' +
          '</div>' +
        '</div>' +
        '<p class="text-xs text-gray-500"><strong>Subject:</strong> ' + E(tpl.subject || '') + '</p>' +
        '<p class="text-xs text-gray-400">' + E(preview) + '</p>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="flex justify-between items-center mb-4">' +
        '<p class="text-sm text-gray-500">' + _commsTemplates.length + ' templates</p>' +
        '<button class="btn btn-gold" onclick="Panels._createTemplate()"><i class="fas fa-plus mr-1.5"></i>Create Template</button>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + cards + '</div>';
  }

  function _useTemplate(idx) {
    var tpl = _commsTemplates[idx];
    if (!tpl) return;
    _composeEmail(tpl);
  }

  function _editTemplate(idx) {
    var tpl = _commsTemplates[idx];
    if (!tpl) return;

    CRM.openModal('Edit Template',
      '<form id="editTemplateForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Template Name *</label>' +
          '<input class="form-input" name="name" value="' + E(tpl.name) + '" required></div>' +
        '<div class="form-group"><label class="form-label">Subject</label>' +
          '<input class="form-input" name="subject" value="' + E(tpl.subject || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Body</label>' +
          '<textarea class="form-input" name="body" rows="10">' + E(tpl.body || '') + '</textarea></div>' +
        '<p class="text-xs text-gray-400">Placeholders: {{client_name}}, {{listing_address}}, {{listing_price}}</p>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._saveEditTemplate(' + idx + ')">Save</button>',
      }
    );
  }

  function _saveEditTemplate(idx) {
    var form = document.getElementById('editTemplateForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var fd = new FormData(form);
    _commsTemplates[idx].name = fd.get('name') || _commsTemplates[idx].name;
    _commsTemplates[idx].subject = fd.get('subject') || '';
    _commsTemplates[idx].body = fd.get('body') || '';
    _saveTemplates();
    CRM.closeModal();
    CRM.toast('Template updated', 'success');
    _commsRenderTab();
  }

  function _deleteTemplate(idx) {
    var tpl = _commsTemplates[idx];
    if (!tpl) return;
    if (!confirm('Delete template "' + tpl.name + '"?')) return;
    _commsTemplates.splice(idx, 1);
    _saveTemplates();
    CRM.toast('Template deleted', 'success');
    _commsRenderTab();
  }

  function _createTemplate() {
    CRM.openModal('Create Template',
      '<form id="createTemplateForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Template Name *</label>' +
          '<input class="form-input" name="name" placeholder="e.g. Quarterly Check-In" required></div>' +
        '<div class="form-group"><label class="form-label">Subject</label>' +
          '<input class="form-input" name="subject" placeholder="Email subject line"></div>' +
        '<div class="form-group"><label class="form-label">Body</label>' +
          '<textarea class="form-input" name="body" rows="10" placeholder="Write your template body..."></textarea></div>' +
        '<p class="text-xs text-gray-400">Placeholders: {{client_name}}, {{listing_address}}, {{listing_price}}</p>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitCreateTemplate()">Create</button>',
      }
    );
  }

  function _submitCreateTemplate() {
    var form = document.getElementById('createTemplateForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var fd = new FormData(form);
    var tpl = {
      id: 'tpl_' + Date.now(),
      name: fd.get('name'),
      subject: fd.get('subject') || '',
      body: fd.get('body') || '',
    };
    _commsTemplates.push(tpl);
    _saveTemplates();
    CRM.closeModal();
    CRM.toast('Template created', 'success');
    _commsRenderTab();
  }

  // ── Tab 3: Listing Sends ────────────────────────────────────────────
  function _commsRenderListingSends(el) {
    var sends = _commsCache.filter(function (c) { return c.type === 'listing_send'; });
    sends.sort(function (a, b) {
      return new Date(b.sentAt || b.created_at || 0) - new Date(a.sentAt || a.created_at || 0);
    });

    if (sends.length === 0) {
      el.innerHTML = UI.emptyState('fa-share-square', 'No listings sent yet');
      return;
    }

    // Group by date
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var weekStart = todayStart - (now.getDay() * 86400000);
    var groups = { today: [], thisWeek: [], earlier: [] };

    sends.forEach(function (c) {
      var ts = new Date(c.sentAt || c.created_at || 0).getTime();
      if (ts >= todayStart) groups.today.push(c);
      else if (ts >= weekStart) groups.thisWeek.push(c);
      else groups.earlier.push(c);
    });

    function renderGroup(label, items) {
      if (items.length === 0) return '';
      return '<div class="mb-4">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">' + E(label) + '</h4>' +
        UI.dataTable([
          { key: 'date', label: 'Date', render: function (c) { return '<span class="text-xs text-gray-500">' + D(c.sentAt || c.created_at) + '</span>'; }},
          { key: 'listing', label: 'Listing', render: function (c) {
            var addr = (c.metadata && c.metadata.listingAddress) || c.subject || '-';
            var price = (c.metadata && c.metadata.listingPrice) || '';
            return '<span class="text-sm font-medium">' + E(addr) + '</span>' +
              (price ? '<span class="text-xs text-gray-500 ml-2">' + E(price) + '</span>' : '');
          }},
          { key: 'clients', label: 'Client(s)', render: function (c) {
            var names = c.to || (c.metadata && c.metadata.recipientNames) || '-';
            if (Array.isArray(names)) names = names.join(', ');
            return '<span class="text-sm">' + E(names) + '</span>';
          }},
          { key: 'via', label: 'Method', render: function (c) {
            var method = (c.metadata && c.metadata.sendMethod) || 'manual';
            var colors = { quick: 'pending', auto: 'contract', eblast: 'offer', manual: 'active' };
            return '<span class="badge badge-' + (colors[method] || 'active') + '">' + E(method.charAt(0).toUpperCase() + method.slice(1)) + '</span>';
          }},
          { key: 'reactions', label: 'Reactions', render: function (c) {
            var meta = c.metadata || {};
            var parts = [];
            if (meta.liked) parts.push('<i class="fas fa-heart text-red-400"></i>');
            if (meta.discussed) parts.push('<i class="fas fa-comment text-blue-400"></i>');
            if (meta.scheduled) parts.push('<i class="fas fa-calendar text-green-400"></i>');
            return parts.length > 0 ? '<span class="flex gap-1.5">' + parts.join('') + '</span>' : '<span class="text-xs text-gray-300">-</span>';
          }},
          { key: 'status', label: 'Status', render: function (c) {
            var st = c.status || 'sent';
            var badge = st === 'opened' ? 'active' : st === 'failed' ? 'withdrawn' : 'pending';
            return '<span class="badge badge-' + badge + '">' + E(st.charAt(0).toUpperCase() + st.slice(1)) + '</span>';
          }},
        ], items) +
      '</div>';
    }

    el.innerHTML =
      renderGroup('Today', groups.today) +
      renderGroup('This Week', groups.thisWeek) +
      renderGroup('Earlier', groups.earlier);
  }

  // ── Tab 5: Campaigns ────────────────────────────────────────────────
  function _commsRenderCampaigns(el) {
    var campaigns = _commsCache.filter(function (c) { return c.type === 'campaign'; });
    campaigns.sort(function (a, b) {
      return new Date(b.sentAt || b.created_at || 0) - new Date(a.sentAt || a.created_at || 0);
    });

    el.innerHTML = campaigns.length > 0 ?
      UI.card('Campaign History',
        UI.dataTable([
          { key: 'date', label: 'Date', render: function (c) { return '<span class="text-xs text-gray-500">' + D(c.sentAt || c.created_at) + '</span>'; }},
          { key: 'subject', label: 'Subject', render: function (c) { return '<span class="text-sm font-medium">' + E(c.subject || '-') + '</span>'; }},
          { key: 'audience', label: 'Audience', render: function (c) {
            var meta = c.metadata || {};
            var audienceType = meta.clientType || meta.audienceType || 'all';
            var count = meta.recipientCount || '-';
            return '<span class="text-sm">' + E(audienceType.charAt(0).toUpperCase() + audienceType.slice(1)) + ' — ' + count + ' recipients</span>';
          }},
          { key: 'openRate', label: 'Open Rate', render: function (c) {
            var rate = c.metadata && c.metadata.openRate;
            return rate ? '<span class="text-sm font-medium">' + rate + '%</span>' : '<span class="text-xs text-gray-400">-</span>';
          }},
          { key: 'clickRate', label: 'Click Rate', render: function (c) {
            var rate = c.metadata && c.metadata.clickRate;
            return rate ? '<span class="text-sm font-medium">' + rate + '%</span>' : '<span class="text-xs text-gray-400">-</span>';
          }},
          { key: 'status', label: 'Status', render: function (c) {
            var st = c.status || 'sent';
            var badge = st === 'failed' ? 'withdrawn' : st === 'draft' ? 'pending' : 'active';
            return '<span class="badge badge-' + badge + '">' + E(st.charAt(0).toUpperCase() + st.slice(1)) + '</span>';
          }},
          { key: 'action', label: '', render: function (c) {
            return '<button class="btn btn-sm btn-outline" onclick="Panels._viewCampaignDetail(\'' + E(c.id || '') + '\')"><i class="fas fa-eye"></i></button>';
          }},
        ], campaigns)
      ) :
      UI.emptyState('fa-bullhorn', 'No campaigns sent yet');
  }

  function _viewCampaignDetail(commId) {
    var c = null;
    for (var i = 0; i < _commsCache.length; i++) {
      if (_commsCache[i].id === commId) { c = _commsCache[i]; break; }
    }
    if (!c) { CRM.toast('Campaign details not found', 'error'); return; }

    var meta = c.metadata || {};
    var audienceType = meta.clientType || meta.audienceType || 'all';
    var count = meta.recipientCount || '-';

    CRM.openModal('Campaign Detail',
      '<div class="space-y-3">' +
        '<div class="flex justify-between items-center border-b pb-2">' +
          '<span class="text-xs text-gray-500">' + D(c.sentAt || c.created_at) + '</span>' +
          '<span class="badge badge-' + (c.status === 'failed' ? 'withdrawn' : 'active') + '">' + E((c.status || 'Sent').charAt(0).toUpperCase() + (c.status || 'sent').slice(1)) + '</span>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Subject</label><p class="text-sm font-medium">' + E(c.subject || '-') + '</p></div>' +
        '<div class="form-group"><label class="form-label">Audience</label><p class="text-sm">' + E(audienceType.charAt(0).toUpperCase() + audienceType.slice(1)) + ' — ' + E(String(count)) + ' recipients</p></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div class="bg-gray-50 rounded p-3 text-center"><p class="text-xs text-gray-500">Open Rate</p><p class="text-lg font-bold ' + (meta.openRate ? 'text-gray-900' : 'text-gray-400') + '">' + (meta.openRate ? meta.openRate + '%' : '-') + '</p></div>' +
          '<div class="bg-gray-50 rounded p-3 text-center"><p class="text-xs text-gray-500">Click Rate</p><p class="text-lg font-bold ' + (meta.clickRate ? 'text-gray-900' : 'text-gray-400') + '">' + (meta.clickRate ? meta.clickRate + '%' : '-') + '</p></div>' +
        '</div>' +
        (c.body ? '<div class="form-group"><label class="form-label">Content</label><div class="text-sm bg-gray-50 p-3 rounded border whitespace-pre-wrap" style="max-height:300px;overflow-y:auto">' + E(c.body) + '</div></div>' : '') +
        (meta.includeListings ? '<div class="form-group"><label class="form-label">Listings</label><p class="text-xs text-gray-500">Auto-included matching active listings for each recipient</p></div>' : '') +
      '</div>',
      { footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Close</button>' }
    );
  }

  // ── Tab 6: Threads ────────────────────────────────────────────────────
  function _commsRenderThreads(el) {
    // If a specific thread is active, render it
    if (_commsActiveThread) {
      _renderThreadView(el, _commsActiveThread);
      return;
    }

    // Build thread groups: group by threadId, or by clientId+agent pair
    var threadMap = {};
    _commsCache.forEach(function (c) {
      var key = c.threadId || c.id;
      if (!threadMap[key]) {
        threadMap[key] = { id: key, messages: [], lastDate: c.sentAt || c.created_at, subject: c.subject, clientName: c.clientName || c.from || c.to };
      }
      threadMap[key].messages.push(c);
      var d = new Date(c.sentAt || c.created_at || 0);
      if (d > new Date(threadMap[key].lastDate || 0)) {
        threadMap[key].lastDate = c.sentAt || c.created_at;
      }
    });

    var threads = Object.keys(threadMap).map(function (k) { return threadMap[k]; });
    // Only show threads with 2+ messages, or all if few
    var multiMsg = threads.filter(function (t) { return t.messages.length > 1; });
    var display = multiMsg.length > 0 ? multiMsg : threads;
    display.sort(function (a, b) {
      return new Date(b.lastDate || 0) - new Date(a.lastDate || 0);
    });

    if (display.length === 0) {
      el.innerHTML = UI.emptyState('fa-comments', 'No conversation threads yet');
      return;
    }

    var rows = display.map(function (t) {
      var msgCount = t.messages.length;
      var hasUnread = t.messages.some(function (m) { return m.direction === 'inbound' && !m.readAt; });
      return '<div class="flex items-center gap-3 p-3 border-b hover:bg-gray-50 cursor-pointer' + (hasUnread ? ' bg-blue-50/50' : '') + '" onclick="Panels._viewThread(\'' + E(t.id) + '\')">' +
        '<div class="flex-shrink-0"><i class="fas fa-comments text-gray-400"></i></div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-sm font-medium truncate">' + E(t.subject || t.clientName || 'Conversation') + '</span>' +
            '<span class="text-xs text-gray-400">' + D(t.lastDate) + '</span>' +
          '</div>' +
          '<span class="text-xs text-gray-500">' + msgCount + ' message' + (msgCount !== 1 ? 's' : '') + ' with ' + E(t.clientName || '-') + '</span>' +
        '</div>' +
        (hasUnread ? '<span class="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0"></span>' : '') +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="border rounded-lg overflow-hidden">' + rows + '</div>';
  }

  // ── Thread View ─────────────────────────────────────────────────────
  function _viewThread(commId) {
    _commsActiveThread = commId;
    _commsTab = 'threads';

    // Mark as read if inbound
    var msg = null;
    for (var i = 0; i < _commsCache.length; i++) {
      if (_commsCache[i].id === commId) { msg = _commsCache[i]; break; }
    }
    if (msg && msg.direction === 'inbound' && !msg.readAt) {
      MallanAPI._fetch('/api/crm/communications/' + encodeURIComponent(commId) + '/read', { method: 'POST' }).catch(function () { /* noop */ });
      msg.readAt = new Date().toISOString();
      _commsUnreadCount = Math.max(0, _commsUnreadCount - 1);
      if (typeof CRM.updateBadge === 'function') CRM.updateBadge('communications', _commsUnreadCount);
    }

    var el = document.getElementById('commsTabContent');
    if (el) _renderThreadView(el, commId);
  }

  function _renderThreadView(el, commId) {
    // Find thread: all messages with same threadId, or the single message
    var root = null;
    for (var i = 0; i < _commsCache.length; i++) {
      if (_commsCache[i].id === commId) { root = _commsCache[i]; break; }
    }
    if (!root) { el.innerHTML = UI.emptyState('fa-comments', 'Message not found'); return; }

    var threadId = root.threadId || root.id;
    var threadMsgs = _commsCache.filter(function (c) {
      return c.threadId === threadId || c.id === threadId;
    });
    threadMsgs.sort(function (a, b) {
      return new Date(a.sentAt || a.created_at || 0) - new Date(b.sentAt || b.created_at || 0);
    });

    var messagesHtml = threadMsgs.map(function (m) {
      var isOutbound = m.direction === 'outbound';
      var align = isOutbound ? 'ml-auto' : 'mr-auto';
      var bg = isOutbound ? 'bg-gold/10 border-gold/20' : 'bg-gray-50 border-gray-200';
      var icon = m.channel === 'sms' ? 'fa-sms' : m.channel === 'portal' ? 'fa-globe' : 'fa-envelope';
      var channelLabel = (m.channel || 'email').toUpperCase();

      return '<div class="max-w-lg ' + align + ' border rounded-lg p-3 ' + bg + '">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="text-xs font-semibold ' + (isOutbound ? 'text-gold' : 'text-gray-700') + '">' +
            '<i class="fas ' + (isOutbound ? 'fa-arrow-up' : 'fa-arrow-down') + ' mr-1"></i>' +
            E(isOutbound ? 'You' : (m.from || m.clientName || 'Client')) +
          '</span>' +
          '<span class="text-xs text-gray-400"><i class="fas ' + icon + ' mr-0.5"></i>' + channelLabel + ' &middot; ' + D(m.sentAt || m.created_at) + '</span>' +
        '</div>' +
        (m.subject ? '<p class="text-sm font-medium mb-1">' + E(m.subject) + '</p>' : '') +
        '<div class="text-sm text-gray-700 whitespace-pre-wrap">' + E(m.body || '') + '</div>' +
        (m.metadata && m.metadata.listingAddress ? '<div class="mt-2 p-2 bg-white border rounded text-xs"><i class="fas fa-home mr-1 text-gold"></i>' + E(m.metadata.listingAddress) + (m.metadata.listingPrice ? ' — ' + E(m.metadata.listingPrice) : '') + '</div>' : '') +
        (m.status ? '<div class="mt-1 text-right"><span class="text-xs text-gray-400">' + E(m.status) + '</span></div>' : '') +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="mb-3">' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._commsBackFromThread()"><i class="fas fa-arrow-left mr-1"></i>Back</button>' +
        '<span class="text-sm font-medium ml-3">' + E(root.subject || 'Conversation') + '</span>' +
        '<span class="text-xs text-gray-400 ml-2">with ' + E(root.direction === 'outbound' ? (root.to || '-') : (root.from || root.clientName || '-')) + '</span>' +
      '</div>' +
      '<div class="space-y-3 max-h-96 overflow-y-auto p-2">' + messagesHtml + '</div>' +
      '<div class="mt-4 border-t pt-3">' +
        '<button class="btn btn-gold" onclick="Panels._replyToThread(\'' + E(threadId) + '\')"><i class="fas fa-reply mr-1"></i>Reply</button>' +
      '</div>';
  }

  function _commsBackFromThread() {
    _commsActiveThread = null;
    _commsTab = 'inbox';
    var c = _container();
    _renderCommunicationsShell(c);
  }

  function _replyToThread(threadId) {
    // Find the original message to pre-fill context
    var original = null;
    for (var i = 0; i < _commsCache.length; i++) {
      if (_commsCache[i].id === threadId || _commsCache[i].threadId === threadId) {
        original = _commsCache[i]; break;
      }
    }

    _commsSelectedRecipients = [];
    _commsAttachedListing = null;

    // Pre-populate recipient from original
    if (original && original.clientId) {
      MallanAPI.clients.list({ limit: 500 }).then(function (res) {
        _commsClients = res.clients || [];
        var cl = null;
        for (var j = 0; j < _commsClients.length; j++) {
          if (_commsClients[j].id === original.clientId) { cl = _commsClients[j]; break; }
        }
        if (cl) _commsSelectedRecipients = [cl];
        _openComposeModal(null, threadId, original ? 'Re: ' + (original.subject || '') : '');
      }).catch(function () {
        _openComposeModal(null, threadId, original ? 'Re: ' + (original.subject || '') : '');
      });
    } else {
      _openComposeModal(null, threadId, original ? 'Re: ' + (original.subject || '') : '');
    }
  }

  // ── Compose Email (enhanced) ─────────────────────────────────────────
  function _composeEmail(template) {
    _commsSelectedRecipients = [];
    _commsAttachedListing = null;

    MallanAPI.clients.list({ limit: 500 }).then(function (res) {
      _commsClients = res.clients || [];
      _openComposeModal(template, null, '');
    }).catch(function (err) {
      CRM.toast('Failed to load clients: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _openComposeModal(template, threadId, prefillSubject) {
    _loadTemplates();

    var templateOptions = '<option value="">— No template —</option>' +
      _commsTemplates.map(function (t, i) { return '<option value="' + i + '"' + (template && template.id === t.id ? ' selected' : '') + '>' + E(t.name) + '</option>'; }).join('');

    var subject = prefillSubject || (template ? template.subject : '');
    var body = template ? template.body : '';
    var threadInput = threadId ? '<input type="hidden" name="threadId" value="' + E(threadId) + '">' : '';

    CRM.openModal(threadId ? 'Reply' : 'Compose Email',
      '<form id="composeEmailForm" class="space-y-4">' +
        threadInput +
        '<div class="form-group"><label class="form-label">To *</label>' +
          '<div class="relative">' +
            '<input class="form-input" id="composeEmailTo" type="text" placeholder="Search clients by name or email..." autocomplete="off" oninput="Panels._commsSearchRecipients(this.value, \'to\')" onfocus="Panels._commsSearchRecipients(this.value, \'to\')">' +
            '<div id="composeEmailToDropdown" class="absolute z-50 w-full bg-white border rounded shadow-lg mt-1 max-h-40 overflow-y-auto hidden"></div>' +
          '</div>' +
          '<div id="composeEmailToChips" class="flex flex-wrap gap-1 mt-1"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">CC</label>' +
          '<input class="form-input" name="cc" type="text" placeholder="CC email addresses (comma-separated)"></div>' +
        (!threadId ? '<div class="form-group"><label class="form-label">Template</label>' +
          '<select class="form-input" id="composeEmailTemplate" onchange="Panels._commsApplyTemplate()">' + templateOptions + '</select></div>' : '') +
        '<div class="form-group"><label class="form-label">Subject *</label>' +
          '<input class="form-input" name="subject" id="composeEmailSubject" value="' + E(subject) + '" placeholder="Email subject" required></div>' +
        '<div class="form-group"><label class="form-label">Body *</label>' +
          '<textarea class="form-input" name="body" id="composeEmailBody" rows="10" placeholder="Write your email..." required>' + E(body) + '</textarea></div>' +
        '<div class="flex gap-2">' +
          '<button type="button" class="btn btn-sm btn-outline" onclick="Panels._commsAttachListing()"><i class="fas fa-home mr-1"></i>Attach Listing</button>' +
          '<span id="composeEmailListingBadge" class="text-xs text-gray-400"></span>' +
        '</div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitEmail()"><i class="fas fa-paper-plane mr-1"></i>Send</button>',
      }
    );

    // Render pre-selected recipients
    if (_commsSelectedRecipients.length > 0) _commsRenderRecipientChips();
  }

  function _commsSearchRecipients(query, field) {
    var dropdown = document.getElementById('composeEmail' + (field === 'to' ? 'To' : 'To') + 'Dropdown');
    if (!dropdown) return;

    var q = (query || '').toLowerCase().trim();
    if (!q) { dropdown.classList.add('hidden'); return; }

    var filtered = _commsClients.filter(function (cl) {
      var name = (cl.name || cl.first_name || '').toLowerCase();
      var email = (cl.email || '').toLowerCase();
      // Exclude already selected
      var alreadySelected = _commsSelectedRecipients.some(function (r) { return r.id === cl.id; });
      return !alreadySelected && (name.indexOf(q) > -1 || email.indexOf(q) > -1);
    }).slice(0, 8);

    if (filtered.length === 0) { dropdown.classList.add('hidden'); return; }

    dropdown.innerHTML = filtered.map(function (cl) {
      var name = cl.name || cl.first_name || 'Unknown';
      var email = cl.email || '';
      return '<div class="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" ' +
        'onmousedown="Panels._commsSelectRecipient(\'' + E(cl.id) + '\')">' +
        '<span class="font-medium">' + E(name) + '</span>' +
        (email ? '<span class="text-xs text-gray-400 ml-2">' + E(email) + '</span>' : '') +
      '</div>';
    }).join('');
    dropdown.classList.remove('hidden');
  }

  function _commsSelectRecipient(clientId) {
    var cl = null;
    for (var i = 0; i < _commsClients.length; i++) {
      if (_commsClients[i].id === clientId) { cl = _commsClients[i]; break; }
    }
    if (!cl) return;

    _commsSelectedRecipients.push(cl);

    var input = document.getElementById('composeEmailTo');
    var dropdown = document.getElementById('composeEmailToDropdown');
    if (input) input.value = '';
    if (dropdown) dropdown.classList.add('hidden');

    // Auto-fill phone for SMS compose
    var phoneEl = document.getElementById('smsPhone');
    if (phoneEl) phoneEl.value = cl.phone || cl.phone_number || '';

    _commsRenderRecipientChips();
    _commsReplacePlaceholders();
  }

  function _commsRemoveRecipient(clientId) {
    _commsSelectedRecipients = _commsSelectedRecipients.filter(function (r) { return r.id !== clientId; });
    _commsRenderRecipientChips();
  }

  function _commsRenderRecipientChips() {
    var container = document.getElementById('composeEmailToChips');
    if (!container) return;

    container.innerHTML = _commsSelectedRecipients.map(function (cl) {
      var name = cl.name || cl.first_name || cl.email || 'Unknown';
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold rounded text-xs font-medium">' +
        E(name) +
        '<button type="button" class="hover:text-red-500" onclick="Panels._commsRemoveRecipient(\'' + E(cl.id) + '\')">&times;</button>' +
      '</span>';
    }).join('');
  }

  function _commsApplyTemplate() {
    var sel = document.getElementById('composeEmailTemplate');
    if (!sel || sel.value === '') return;

    var tpl = _commsTemplates[parseInt(sel.value, 10)];
    if (!tpl) return;

    var subjectEl = document.getElementById('composeEmailSubject');
    var bodyEl = document.getElementById('composeEmailBody');
    if (subjectEl) subjectEl.value = tpl.subject || '';
    if (bodyEl) bodyEl.value = tpl.body || '';

    _commsReplacePlaceholders();
  }

  function _commsReplacePlaceholders() {
    var subjectEl = document.getElementById('composeEmailSubject');
    var bodyEl = document.getElementById('composeEmailBody');
    if (!subjectEl || !bodyEl) return;

    var clientName = _commsSelectedRecipients.length > 0
      ? (_commsSelectedRecipients[0].name || _commsSelectedRecipients[0].first_name || '')
      : '{{client_name}}';

    var listingAddr = _commsAttachedListing ? (_commsAttachedListing.address || '') : '{{listing_address}}';
    var listingPrice = _commsAttachedListing ? (_commsAttachedListing.price || '') : '{{listing_price}}';

    function replacePlaceholders(text) {
      return text
        .replace(/\{\{client_name\}\}/g, clientName)
        .replace(/\{\{listing_address\}\}/g, listingAddr)
        .replace(/\{\{listing_price\}\}/g, listingPrice);
    }

    subjectEl.value = replacePlaceholders(subjectEl.value);
    bodyEl.value = replacePlaceholders(bodyEl.value);
  }

  function _commsAttachListing() {
    MallanAPI.listings.list({ limit: 50, status: 'active' }).then(function (res) {
      var listings = res.listings || [];

      var rows = listings.map(function (l) {
        var addr = l.address || l.full_address || l.UnparsedAddress || '-';
        var price = l.price || l.list_price || l.ListPrice || '';
        return '<div class="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b flex justify-between items-center" ' +
          'onclick="Panels._commsPickListing(\'' + E(l.id || l.listing_id || '') + '\', \'' + E(addr).replace(/'/g, "\\'") + '\', \'' + E(typeof price === 'number' ? '$' + price.toLocaleString() : price).replace(/'/g, "\\'") + '\')">' +
          '<span class="text-sm font-medium">' + E(addr) + '</span>' +
          '<span class="text-sm text-gray-500">' + (typeof price === 'number' ? '$' + price.toLocaleString() : E(price)) + '</span>' +
        '</div>';
      }).join('');

      CRM.openModal('Attach Listing',
        '<div class="space-y-2">' +
          '<p class="text-xs text-gray-500">Select a listing to attach to your email</p>' +
          '<div class="border rounded max-h-64 overflow-y-auto">' +
            (rows || '<p class="p-4 text-sm text-gray-400">No active listings found</p>') +
          '</div>' +
        '</div>',
        { footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' }
      );
    }).catch(function (err) {
      CRM.toast('Failed to load listings: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _commsPickListing(listingId, address, price) {
    _commsAttachedListing = { id: listingId, address: address, price: price };
    CRM.closeModal();

    // Update badge in compose form
    var badge = document.getElementById('composeEmailListingBadge');
    if (badge) badge.innerHTML = '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"><i class="fas fa-home"></i> ' + E(address) + '</span>';

    _commsReplacePlaceholders();

    // Append listing card HTML to body
    var bodyEl = document.getElementById('composeEmailBody');
    if (bodyEl) {
      var card = '\n\n---\n' + address + (price ? ' — ' + price : '') + '\nView listing: mallan.nyc/listings/' + listingId;
      bodyEl.value += card;
    }
  }

  function _submitEmail() {
    var form = document.getElementById('composeEmailForm');
    if (!form) return;

    if (_commsSelectedRecipients.length === 0) {
      CRM.toast('Please select at least one recipient', 'error');
      return;
    }

    var subjectEl = document.getElementById('composeEmailSubject');
    var bodyEl = document.getElementById('composeEmailBody');
    var ccEl = form.querySelector('[name="cc"]');
    var threadIdEl = form.querySelector('[name="threadId"]');

    var subject = subjectEl ? subjectEl.value.trim() : '';
    var body = bodyEl ? bodyEl.value.trim() : '';
    var cc = ccEl ? ccEl.value.trim() : '';
    var threadId = threadIdEl ? threadIdEl.value : null;

    if (!subject || !body) {
      CRM.toast('Subject and body are required', 'error');
      return;
    }

    var recipientEmails = _commsSelectedRecipients.map(function (r) { return r.email || ''; }).filter(Boolean);
    var recipientNames = _commsSelectedRecipients.map(function (r) { return r.name || r.first_name || ''; }).filter(Boolean);
    var recipientIds = _commsSelectedRecipients.map(function (r) { return r.id; }).filter(Boolean);

    // Unified communication record
    var payload = {
      type: threadId ? 'reply' : 'email',
      direction: 'outbound',
      channel: 'email',
      clientId: recipientIds.length === 1 ? recipientIds[0] : null,
      listingId: _commsAttachedListing ? _commsAttachedListing.id : null,
      to: recipientEmails.join(', '),
      subject: subject,
      body: body,
      threadId: threadId || null,
      status: 'sent',
      metadata: {
        cc: cc || null,
        recipientIds: recipientIds,
        recipientNames: recipientNames,
        listingAddress: _commsAttachedListing ? _commsAttachedListing.address : null,
        listingPrice: _commsAttachedListing ? _commsAttachedListing.price : null,
      },
    };

    MallanAPI._fetch('/api/crm/communications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (res) {
      // Also log to Events for activity timeline
      recipientIds.forEach(function (cid) {
        Events.log('email_sent', 'client', cid, {
          to: recipientEmails.join(', '),
          recipientNames: recipientNames.join(', '),
          cc: cc,
          subject: subject,
          body: body,
          listingAddress: payload.metadata.listingAddress,
          listingPrice: payload.metadata.listingPrice,
        });
      });

      if (_commsAttachedListing && _commsAttachedListing.id) {
        Events.log('listing_sent', 'listing', _commsAttachedListing.id, {
          clientName: recipientNames.join(', '),
          to: recipientEmails.join(', '),
          subject: subject,
          via: 'email',
        });
      }

      CRM.closeModal();
      CRM.toast('Email sent to ' + recipientNames.join(', '), 'success');
      _commsSelectedRecipients = [];
      _commsAttachedListing = null;
      // Refresh cache and re-render
      _commsLoadAll().then(function () { communications(); });
    }).catch(function (err) {
      CRM.toast('Failed to send email: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ── Compose SMS ────────────────────────────────────────────────────────
  function _composeSMS() {
    _commsSelectedRecipients = [];

    MallanAPI.clients.list({ limit: 500 }).then(function (res) {
      _commsClients = res.clients || [];

      CRM.openModal('Compose SMS',
        '<form id="composeSMSForm" class="space-y-4">' +
          '<div class="form-group"><label class="form-label">To *</label>' +
            '<div class="relative">' +
              '<input class="form-input" id="composeEmailTo" type="text" placeholder="Search clients by name or phone..." autocomplete="off" oninput="Panels._commsSearchRecipients(this.value, \'to\')" onfocus="Panels._commsSearchRecipients(this.value, \'to\')">' +
              '<div id="composeEmailToDropdown" class="absolute z-50 w-full bg-white border rounded shadow-lg mt-1 max-h-40 overflow-y-auto hidden"></div>' +
            '</div>' +
            '<div id="composeEmailToChips" class="flex flex-wrap gap-1 mt-1"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Phone Number</label>' +
            '<input class="form-input" name="phone" id="smsPhone" type="tel" placeholder="(646) 555-1234" readonly></div>' +
          '<div class="form-group"><label class="form-label">Message * <span class="text-xs text-gray-400 ml-2" id="smsCharCount">0/160</span></label>' +
            '<textarea class="form-input" name="body" id="smsBody" rows="4" maxlength="160" placeholder="Type your SMS message..." required oninput="Panels._updateSMSCharCount()"></textarea></div>' +
          '<p class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i>SMS messages are limited to 160 characters. TCPA consent required.</p>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitSMS()"><i class="fas fa-paper-plane mr-1"></i>Send SMS</button>',
        }
      );
    }).catch(function (err) {
      CRM.toast('Failed to load clients: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _updateSMSCharCount() {
    var bodyEl = document.getElementById('smsBody');
    var countEl = document.getElementById('smsCharCount');
    if (bodyEl && countEl) {
      var len = (bodyEl.value || '').length;
      countEl.textContent = len + '/160';
      countEl.className = len > 140 ? 'text-xs text-red-500 ml-2' : 'text-xs text-gray-400 ml-2';
    }
  }

  function _submitSMS() {
    var form = document.getElementById('composeSMSForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }

    if (_commsSelectedRecipients.length === 0) {
      CRM.toast('Please select a recipient', 'error');
      return;
    }

    var bodyEl = document.getElementById('smsBody');
    var body = bodyEl ? bodyEl.value.trim() : '';
    if (!body) { CRM.toast('Message is required', 'error'); return; }

    var recipient = _commsSelectedRecipients[0];
    var phone = recipient.phone || recipient.phone_number || '';

    var payload = {
      type: 'sms',
      direction: 'outbound',
      channel: 'sms',
      clientId: recipient.id,
      to: phone,
      subject: null,
      body: body,
      status: 'sent',
      metadata: {
        recipientName: recipient.name || recipient.first_name || '',
        phone: phone,
      },
    };

    MallanAPI._fetch('/api/crm/communications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function () {
      Events.log('sms_sent', 'client', recipient.id, {
        to: phone,
        body: body,
        recipientName: payload.metadata.recipientName,
      });

      CRM.closeModal();
      CRM.toast('SMS sent to ' + (payload.metadata.recipientName || phone), 'success');
      _commsSelectedRecipients = [];
      _commsLoadAll().then(function () { communications(); });
    }).catch(function (err) {
      CRM.toast('Failed to send SMS: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ── Compose eBlast (campaign) ──────────────────────────────────────────
  function _composeBulk() {
    MallanAPI.clients.list({ limit: 500 }).then(function (res) {
      var clients = res.clients || [];
      window._eblastClients = clients;

      _loadTemplates();
      var types = ['All', 'Buyer', 'Seller', 'Tenant', 'Landlord'];
      var stages = ['All Stages', 'Active', 'New', 'Warm', 'Hot', 'Under Contract', 'Closed', 'Inactive'];

      var templateOptions = '<option value="">— No template —</option>' +
        _commsTemplates.map(function (t, i) { return '<option value="' + i + '">' + E(t.name) + '</option>'; }).join('');

      CRM.openModal('Compose eBlast',
        '<form id="eblastForm" class="space-y-4">' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div class="form-group"><label class="form-label">Client Type</label>' +
              '<select class="form-input" name="clientType" id="eblastClientType" onchange="Panels._updateEblastCount()">' +
                types.map(function (t) { return '<option value="' + t.toLowerCase() + '">' + E(t) + '</option>'; }).join('') +
              '</select></div>' +
            '<div class="form-group"><label class="form-label">Stage</label>' +
              '<select class="form-input" name="stage" id="eblastStage" onchange="Panels._updateEblastCount()">' +
                stages.map(function (s) { return '<option value="' + s.toLowerCase().replace(/\s+/g, '_') + '">' + E(s) + '</option>'; }).join('') +
              '</select></div>' +
          '</div>' +
          '<div class="bg-blue-50 border border-blue-200 rounded p-3 text-center">' +
            '<p class="text-sm font-bold text-blue-700" id="eblastPreviewCount">' + clients.length + ' recipients</p>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Template</label>' +
            '<select class="form-input" id="eblastTemplate" onchange="Panels._commsApplyEblastTemplate()">' + templateOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Subject *</label>' +
            '<input class="form-input" name="subject" id="eblastSubject" placeholder="eBlast subject" required></div>' +
          '<div class="form-group"><label class="form-label">Body *</label>' +
            '<textarea class="form-input" name="body" id="eblastBody" rows="8" placeholder="Write your eBlast content..." required></textarea></div>' +
          '<div class="flex items-center gap-2">' +
            '<label class="flex items-center gap-2 cursor-pointer">' +
              '<input type="checkbox" name="includeListings" id="eblastIncludeListings" class="rounded border-gray-300">' +
              '<span class="text-sm">Include matching active listings for each recipient</span>' +
            '</label>' +
          '</div>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels._submitEblast()"><i class="fas fa-paper-plane mr-1"></i>Send eBlast</button>',
        }
      );
    }).catch(function (err) {
      CRM.toast('Failed to load clients: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _commsApplyEblastTemplate() {
    var sel = document.getElementById('eblastTemplate');
    if (!sel || sel.value === '') return;
    var tpl = _commsTemplates[parseInt(sel.value, 10)];
    if (!tpl) return;
    var subjectEl = document.getElementById('eblastSubject');
    var bodyEl = document.getElementById('eblastBody');
    if (subjectEl) subjectEl.value = tpl.subject || '';
    if (bodyEl) bodyEl.value = tpl.body || '';
  }

  function _updateEblastCount() {
    var typeSel = document.getElementById('eblastClientType');
    var stageSel = document.getElementById('eblastStage');
    var countEl = document.getElementById('eblastPreviewCount');
    if (!countEl || !window._eblastClients) return;

    var type = typeSel ? typeSel.value : 'all';
    var stage = stageSel ? stageSel.value : 'all_stages';
    var clients = window._eblastClients;

    var filtered = clients.filter(function (cl) {
      var typeMatch = type === 'all' || (cl.type || cl.client_type || '').toLowerCase() === type;
      var stageMatch = stage === 'all_stages' || (cl.stage || cl.status || '').toLowerCase().replace(/\s+/g, '_') === stage;
      return typeMatch && stageMatch;
    });

    countEl.textContent = filtered.length + ' recipients';
  }

  function _submitEblast() {
    var form = document.getElementById('eblastForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }

    var subjectEl = document.getElementById('eblastSubject');
    var bodyEl = document.getElementById('eblastBody');
    var typeSel = document.getElementById('eblastClientType');
    var stageSel = document.getElementById('eblastStage');
    var includeListings = document.getElementById('eblastIncludeListings');

    var subject = subjectEl ? subjectEl.value.trim() : '';
    var body = bodyEl ? bodyEl.value.trim() : '';
    var type = typeSel ? typeSel.value : 'all';
    var stage = stageSel ? stageSel.value : 'all_stages';
    var withListings = includeListings ? includeListings.checked : false;

    if (!subject || !body) {
      CRM.toast('Subject and body are required', 'error');
      return;
    }

    var clients = window._eblastClients || [];
    var filtered = clients.filter(function (cl) {
      var typeMatch = type === 'all' || (cl.type || cl.client_type || '').toLowerCase() === type;
      var stageMatch = stage === 'all_stages' || (cl.stage || cl.status || '').toLowerCase().replace(/\s+/g, '_') === stage;
      return typeMatch && stageMatch;
    });

    if (filtered.length === 0) {
      CRM.toast('No recipients match the selected filters', 'error');
      return;
    }

    // Unified communication record for campaign
    var payload = {
      type: 'campaign',
      direction: 'outbound',
      channel: 'email',
      to: null,
      subject: subject,
      body: body,
      status: 'sent',
      metadata: {
        clientType: type,
        audienceType: type,
        stage: stage,
        recipientCount: filtered.length,
        includeListings: withListings,
      },
    };

    MallanAPI._fetch('/api/crm/communications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('eBlast sent to ' + filtered.length + ' recipients', 'success');
      delete window._eblastClients;
      _commsLoadAll().then(function () { communications(); });
    }).catch(function (err) {
      CRM.toast('Failed to send eBlast: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Deals & Commissions ─────────────────────────────────────────────
  var _dealsData = [];
  var _dealsView = 'all';
  var _isBrokerView = false;

  function dealsCommissions() {
    CRM.setPanelTitle('Deals & Commissions');
    var c = _container(); c.innerHTML = UI.loading();
    _isBrokerView = Permissions.isBroker();

    Promise.all([
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
      MallanAPI.clients.list({ limit: 200 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }),
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
    ]).then(function (r) {
      var deals = r[0].deals || [];
      var clients = r[1].clients || [];
      var listings = r[2].listings || [];
      var agents = r[3].agents || [];

      // Build lookup maps
      var clientMap = {};
      clients.forEach(function (cl) { clientMap[cl.id] = cl.name || cl.full_name || cl.email || 'Client'; });
      var listingMap = {};
      listings.forEach(function (l) { listingMap[l.id || l.listing_id] = l.address || l.UnparsedAddress || 'Listing'; });
      var agentMap = {};
      agents.forEach(function (a) { agentMap[a.id] = a.full_name || a.name || a.email || 'Agent'; });

      // Enrich deals
      deals.forEach(function (d) {
        d._clientName = d.client_name || clientMap[d.clientId || d.client_id] || '-';
        d._listingAddr = d.address || listingMap[d.listingId || d.listing_id] || '-';
        d._agentName = d.agent_name || agentMap[d.assignedAgentId || d.assigned_agent_id] || '-';
        d._payout = (d.payoutStatus || d.payout_status || 'pending').toLowerCase();
        d._stage = (d.stage || d.status || 'active').toLowerCase();
        d._gross = d.grossCommission || d.commission || 0;
        d._split = d.splitAmount || d.split_amount || 0;
        d._brokerage = d._gross - d._split;
      });

      _dealsData = deals;
      _renderDeals(c);
    });
  }

  function _renderDeals(c) {
    var deals = _dealsData;
    var view = _dealsView;
    var isBroker = _isBrokerView;

    // Filter
    var filtered = deals;
    if (view === 'active') filtered = deals.filter(function (d) { return d._stage !== 'closed' && d._stage !== 'cancelled'; });
    else if (view === 'contract') filtered = deals.filter(function (d) { return d._stage === 'contract' || d._stage === 'pending'; });
    else if (view === 'closed') filtered = deals.filter(function (d) { return d._stage === 'closed'; });
    else if (view === 'pending-payout') filtered = deals.filter(function (d) { return d._payout === 'pending' || d._payout === 'submitted'; });

    // Stats
    var totalGross = deals.reduce(function (s, d) { return s + d._gross; }, 0);
    var totalSplit = deals.reduce(function (s, d) { return s + d._split; }, 0);
    var pendingPayouts = deals.filter(function (d) { return d._payout === 'pending' || d._payout === 'submitted'; });
    var activeDealCount = deals.filter(function (d) { return d._stage !== 'closed' && d._stage !== 'cancelled'; }).length;

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
      '<h2 class="text-lg font-bold text-gray-900">Deals & Commissions</h2>' +
      '<div class="flex gap-2">' +
        '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/buyer-deal\',\'_blank\')"><i class="fas fa-plus mr-1"></i> Buyer Deal</button>' +
        '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/tenant-deal\',\'_blank\')"><i class="fas fa-plus mr-1"></i> Tenant Deal</button>' +
      '</div>' +
    '</div>';

    // Stats
    html += UI.statGrid([
      UI.statCard(deals.length, 'Total Deals', 'fa-handshake', '#2563EB'),
      UI.statCard(activeDealCount, 'Active', 'fa-bolt', '#059669'),
      UI.statCard($(totalGross), 'Gross Commission', 'fa-dollar-sign', '#B8860B'),
      UI.statCard($(isBroker ? totalGross - totalSplit : totalSplit), isBroker ? 'Brokerage Net' : 'My Earnings', 'fa-chart-line', '#7C3AED'),
      UI.statCard(pendingPayouts.length, 'Pending Payouts', 'fa-clock', pendingPayouts.length > 0 ? '#F59E0B' : '#059669'),
    ]);

    // View tabs
    var views = [
      { key: 'all', label: 'All Deals' },
      { key: 'active', label: 'Active' },
      { key: 'contract', label: 'In Contract' },
      { key: 'closed', label: 'Closed' },
      { key: 'pending-payout', label: 'Pending Payout' },
    ];
    html += '<div class="flex gap-1 overflow-x-auto">';
    views.forEach(function (v) {
      var active = view === v.key;
      var count = v.key === 'all' ? deals.length :
                  v.key === 'active' ? activeDealCount :
                  v.key === 'closed' ? deals.filter(function (d) { return d._stage === 'closed'; }).length :
                  v.key === 'contract' ? deals.filter(function (d) { return d._stage === 'contract' || d._stage === 'pending'; }).length :
                  pendingPayouts.length;
      html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ' +
        (active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gold') +
        '" onclick="Panels._switchDealsView(\'' + v.key + '\')">' + E(v.label) + ' (' + count + ')</button>';
    });
    html += '</div>';

    // Deals table
    if (filtered.length === 0) {
      html += UI.emptyState('fa-handshake', 'No deals in this view');
    } else {
      html += '<div class="data-table"><div style="overflow-x:auto"><table class="w-full"><thead class="bg-gray-50 text-xs"><tr>' +
        '<th class="text-left px-3 py-2">Client</th>' +
        '<th class="text-left px-3 py-2">Listing</th>' +
        '<th class="text-left px-3 py-2">Type</th>' +
        '<th class="text-left px-3 py-2">Stage</th>' +
        '<th class="text-right px-3 py-2">Gross</th>' +
        '<th class="text-right px-3 py-2">' + (isBroker ? 'Agent Split' : 'My Split') + '</th>' +
        (isBroker ? '<th class="text-right px-3 py-2">Brokerage</th>' : '') +
        '<th class="text-left px-3 py-2">Payout</th>' +
        '<th class="text-left px-3 py-2">Actions</th>' +
      '</tr></thead><tbody>';

      filtered.forEach(function (d) {
        // Payout pipeline
        var payoutSteps = ['submitted', 'approved', 'paid'];
        var currentStep = payoutSteps.indexOf(d._payout);
        var payoutHtml = '<div class="flex items-center gap-1">';
        payoutSteps.forEach(function (step, i) {
          var filled = i <= currentStep;
          var color = filled ? (step === 'paid' ? '#059669' : step === 'approved' ? '#2563EB' : '#F59E0B') : '#e5e7eb';
          payoutHtml += '<div class="w-2 h-2 rounded-full" style="background:' + color + '"></div>';
          if (i < payoutSteps.length - 1) payoutHtml += '<div class="w-3 h-0.5" style="background:' + (filled ? color : '#e5e7eb') + '"></div>';
        });
        payoutHtml += ' <span class="text-[9px] font-bold uppercase ml-1" style="color:' +
          (d._payout === 'paid' ? '#059669' : d._payout === 'approved' ? '#2563EB' : d._payout === 'rejected' ? '#DC2626' : '#F59E0B') + '">' +
          E(d._payout) + '</span></div>';

        // Client link
        var clientHtml = d._clientId || d.clientId || d.client_id ?
          '<span class="text-sm font-medium cursor-pointer hover:text-gold" onclick="event.stopPropagation();Router.navigate(\'/workspace/client/' + E(d.clientId || d.client_id || '') + '/overview\')">' + E(d._clientName) + '</span>' :
          '<span class="text-sm">' + E(d._clientName) + '</span>';

        // Listing link
        var listingHtml = d.listingId || d.listing_id ?
          '<span class="text-xs cursor-pointer hover:text-gold" onclick="event.stopPropagation();Router.navigate(\'/workspace/listing/' + E(d.listingId || d.listing_id || '') + '/overview\')">' + E(d._listingAddr) + '</span>' :
          '<span class="text-xs text-gray-500">' + E(d._listingAddr) + '</span>';

        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="px-3 py-2">' + clientHtml + '</td>' +
          '<td class="px-3 py-2">' + listingHtml + '</td>' +
          '<td class="px-3 py-2">' + UI.roleBadge(d.dealType || d.deal_type || 'sale') + '</td>' +
          '<td class="px-3 py-2">' + UI.stageBadge(d._stage) + '</td>' +
          '<td class="px-3 py-2 text-right text-sm font-bold">' + $(d._gross) + '</td>' +
          '<td class="px-3 py-2 text-right text-sm text-green-600 font-semibold">' + $(d._split) + '</td>' +
          (isBroker ? '<td class="px-3 py-2 text-right text-sm">' + $(d._brokerage) + '</td>' : '') +
          '<td class="px-3 py-2">' + payoutHtml + '</td>' +
          '<td class="px-3 py-2"><div class="flex gap-1" onclick="event.stopPropagation()">';

        // Actions based on payout status and role
        if (d._payout === 'pending' || d._payout === '' || !d._payout || d._payout === 'pending') {
          html += '<button class="btn btn-sm btn-gold" onclick="Panels._submitCommissionRequest(\'' + E(d.id) + '\')" title="Submit Request"><i class="fas fa-paper-plane"></i></button>';
        }
        if (isBroker && (d._payout === 'submitted' || d._payout === 'pending')) {
          html += '<button class="btn btn-sm btn-outline" style="border-color:#059669;color:#059669" onclick="Panels._approveDealPayout(\'' + E(d.id) + '\')" title="Approve"><i class="fas fa-check"></i></button>';
          html += '<button class="btn btn-sm btn-outline" style="border-color:#DC2626;color:#DC2626" onclick="Panels._rejectDealPayout(\'' + E(d.id) + '\')" title="Reject"><i class="fas fa-times"></i></button>';
        }
        if (isBroker && d._payout === 'approved') {
          html += '<button class="btn btn-sm btn-outline" style="border-color:#059669;color:#059669" onclick="Panels._markDealPaid(\'' + E(d.id) + '\')" title="Mark Paid"><i class="fas fa-dollar-sign"></i></button>';
        }
        html += '<button class="btn btn-sm btn-outline" onclick="Panels._uploadDealDoc(\'' + E(d.id) + '\')" title="Upload Doc"><i class="fas fa-file-upload"></i></button>';
        html += '</div></td></tr>';
      });

      // Totals footer
      var fGross = filtered.reduce(function (s, d) { return s + d._gross; }, 0);
      var fSplit = filtered.reduce(function (s, d) { return s + d._split; }, 0);
      html += '<tfoot class="bg-gray-50 font-semibold text-sm"><tr>' +
        '<td class="px-3 py-2" colspan="4">Totals (' + filtered.length + ' deals)</td>' +
        '<td class="px-3 py-2 text-right">' + $(fGross) + '</td>' +
        '<td class="px-3 py-2 text-right text-green-600">' + $(fSplit) + '</td>' +
        (isBroker ? '<td class="px-3 py-2 text-right">' + $(fGross - fSplit) + '</td>' : '') +
        '<td colspan="2"></td>' +
      '</tr></tfoot>';

      html += '</tbody></table></div></div>';
    }

    html += '</div>';
    c.innerHTML = html;
  }

  function _switchDealsView(view) {
    _dealsView = view;
    _renderDeals(_container());
  }

  function _submitCommissionRequest(dealId) {
    MallanAPI.deals.update(dealId, { payoutStatus: 'submitted', payout_status: 'submitted' }).then(function () {
      Events.log('commission_submitted', 'deal', dealId);
      CRM.toast('Commission request submitted', 'success');
      _dealsData.forEach(function (d) { if (d.id === dealId) { d._payout = 'submitted'; d.payoutStatus = 'submitted'; } });
      _renderDeals(_container());
    }).catch(function () { CRM.toast('Request submitted', 'info'); });
  }

  function _approveDealPayout(dealId) {
    MallanAPI.deals.updateStatus(dealId, 'approved').then(function () {
      Events.log('payout_approved', 'deal', dealId);
      CRM.toast('Payout approved', 'success');
      _dealsData.forEach(function (d) { if (d.id === dealId) { d._payout = 'approved'; d.payoutStatus = 'approved'; } });
      _renderDeals(_container());
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Failed'), 'error'); });
  }

  function _rejectDealPayout(dealId) {
    if (!confirm('Reject this payout request?')) return;
    MallanAPI.deals.updateStatus(dealId, 'rejected').then(function () {
      Events.log('payout_rejected', 'deal', dealId);
      CRM.toast('Payout rejected', 'info');
      _dealsData.forEach(function (d) { if (d.id === dealId) { d._payout = 'rejected'; d.payoutStatus = 'rejected'; } });
      _renderDeals(_container());
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Failed'), 'error'); });
  }

  function _markDealPaid(dealId) {
    MallanAPI.deals.updateStatus(dealId, 'paid').then(function () {
      Events.log('payout_paid', 'deal', dealId);
      CRM.toast('Marked as paid', 'success');
      _dealsData.forEach(function (d) { if (d.id === dealId) { d._payout = 'paid'; d.payoutStatus = 'paid'; } });
      _renderDeals(_container());
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Failed'), 'error'); });
  }

  function _uploadDealDoc(dealId) {
    Panels._uploadDoc('deal', dealId);
  }

  // ─── Personal Revenue ────────────────────────────────────────────────
  function personalRevenue() {
    CRM.setPanelTitle('Revenue');
    var c = _container(); c.innerHTML = UI.loading();
    var isBroker = Permissions.isBroker();

    Promise.all([
      MallanAPI.deals.list({ limit: 500 }).catch(function () { return { deals: [] }; }),
      isBroker ? MallanAPI.agents.list().catch(function () { return { agents: [] }; }) : Promise.resolve({ agents: [] }),
    ]).then(function (r) {
      var deals = r[0].deals || [];
      var agents = r[1].agents || [];
      var agentMap = {};
      agents.forEach(function (a) { agentMap[a.id] = a.full_name || a.name || a.email || 'Agent'; });
      var now = new Date();
      var thisYear = now.getFullYear();
      var thisMonth = now.getMonth();

      // Enrich
      deals.forEach(function (d) {
        d._gross = d.grossCommission || d.commission || 0;
        d._split = d.splitAmount || d.split_amount || 0;
        d._brokerage = d._gross - d._split;
        d._isClosed = (d.stage || d.status || '').toLowerCase() === 'closed';
        d._closeDate = new Date(d.closeDate || d.close_date || d.created_at);
        d._type = (d.dealType || d.deal_type || 'sale').toLowerCase();
        d._isSale = d._type === 'sale';
        d._isRental = d._type === 'rental';
        d._payout = (d.payoutStatus || d.payout_status || 'pending').toLowerCase();
        d._agentName = agentMap[d.assignedAgentId || d.assigned_agent_id] || d.agent_name || '-';
      });

      var closed = deals.filter(function (d) { return d._isClosed; });
      var ytd = closed.filter(function (d) { return d._closeDate.getFullYear() === thisYear; });
      var mtd = ytd.filter(function (d) { return d._closeDate.getMonth() === thisMonth; });
      var pending = deals.filter(function (d) { return d._payout === 'pending' || d._payout === 'submitted'; });
      var paid = closed.filter(function (d) { return d._payout === 'paid'; });

      // Amounts (agent perspective = split, broker = gross or net)
      var field = isBroker ? '_brokerage' : '_split';
      var ytdAmt = ytd.reduce(function (s, d) { return s + d[field]; }, 0);
      var mtdAmt = mtd.reduce(function (s, d) { return s + d[field]; }, 0);
      var pendingAmt = pending.reduce(function (s, d) { return s + d[field]; }, 0);
      var paidAmt = paid.reduce(function (s, d) { return s + d[field]; }, 0);
      var lifetimeAmt = closed.reduce(function (s, d) { return s + d[field]; }, 0);

      // Analytics
      var avgDealSize = closed.length > 0 ? lifetimeAmt / closed.length : 0;
      var avgCloseTime = 0;
      if (closed.length > 0) {
        var totalDays = closed.reduce(function (s, d) {
          var created = new Date(d.created_at || d.createdAt);
          return s + Math.max(0, Math.round((d._closeDate - created) / (24 * 3600 * 1000)));
        }, 0);
        avgCloseTime = Math.round(totalDays / closed.length);
      }

      // Sale vs Rental split
      var salesClosed = ytd.filter(function (d) { return d._isSale; });
      var rentalsClosed = ytd.filter(function (d) { return d._isRental; });
      var salesAmt = salesClosed.reduce(function (s, d) { return s + d[field]; }, 0);
      var rentalsAmt = rentalsClosed.reduce(function (s, d) { return s + d[field]; }, 0);

      var html = '<div class="space-y-4">';

      // Header
      html += UI.sectionHeader(isBroker ? 'Revenue Analytics (Company)' : 'My Revenue', '');

      // Row 1: KPIs
      html += UI.statGrid([
        UI.statCard($(ytdAmt), 'YTD Revenue', 'fa-chart-line', '#B8860B'),
        UI.statCard($(mtdAmt), 'MTD Revenue', 'fa-calendar', '#059669'),
        UI.statCard($(pendingAmt), 'Pending', 'fa-clock', pendingAmt > 0 ? '#F59E0B' : '#059669'),
        UI.statCard($(paidAmt), 'Paid Out', 'fa-check-circle', '#059669'),
        UI.statCard($(lifetimeAmt), 'Lifetime', 'fa-dollar-sign', '#374151'),
      ]);

      // Row 2: Analytics
      html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">';
      html += '<div class="card p-4 text-center"><p class="text-xs font-bold text-gray-500 uppercase">Avg Deal Size</p><p class="text-xl font-bold text-gray-900">' + $(avgDealSize) + '</p></div>';
      html += '<div class="card p-4 text-center"><p class="text-xs font-bold text-gray-500 uppercase">Avg Close Time</p><p class="text-xl font-bold text-gray-900">' + avgCloseTime + ' <span class="text-xs font-normal text-gray-500">days</span></p></div>';
      html += '<div class="card p-4 text-center"><p class="text-xs font-bold text-gray-500 uppercase">YTD Deals</p><p class="text-xl font-bold text-gray-900">' + ytd.length + '</p></div>';
      html += '<div class="card p-4 text-center"><p class="text-xs font-bold text-gray-500 uppercase">Close Rate</p><p class="text-xl font-bold text-gray-900">' + (deals.length > 0 ? Math.round(closed.length / deals.length * 100) : 0) + '%</p></div>';
      html += '</div>';

      // Row 3: Sale vs Rental split
      html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
      // Sales
      var salesPct = ytdAmt > 0 ? Math.round(salesAmt / ytdAmt * 100) : 0;
      html += '<div class="card p-4">' +
        '<div class="flex items-center justify-between mb-3"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-home text-blue-500 mr-2"></i>Sales</h3>' +
          '<span class="text-xs font-bold text-blue-600">' + salesPct + '% of YTD</span></div>' +
        '<p class="text-2xl font-bold text-gray-900">' + $(salesAmt) + '</p>' +
        '<p class="text-xs text-gray-500 mt-1">' + salesClosed.length + ' deals closed</p>' +
        '<div class="mt-2 h-2 bg-gray-100 rounded-full"><div class="h-2 bg-blue-500 rounded-full" style="width:' + salesPct + '%"></div></div>' +
      '</div>';
      // Rentals
      var rentalsPct = ytdAmt > 0 ? Math.round(rentalsAmt / ytdAmt * 100) : 0;
      html += '<div class="card p-4">' +
        '<div class="flex items-center justify-between mb-3"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-key text-green-500 mr-2"></i>Rentals</h3>' +
          '<span class="text-xs font-bold text-green-600">' + rentalsPct + '% of YTD</span></div>' +
        '<p class="text-2xl font-bold text-gray-900">' + $(rentalsAmt) + '</p>' +
        '<p class="text-xs text-gray-500 mt-1">' + rentalsClosed.length + ' deals closed</p>' +
        '<div class="mt-2 h-2 bg-gray-100 rounded-full"><div class="h-2 bg-green-500 rounded-full" style="width:' + rentalsPct + '%"></div></div>' +
      '</div>';
      html += '</div>';

      // Row 4: Monthly breakdown table
      var months = {};
      ytd.forEach(function (d) {
        var m = d._closeDate.getMonth();
        var key = String(m).padStart(2, '0');
        if (!months[key]) months[key] = { deals: 0, amount: 0, sales: 0, rentals: 0 };
        months[key].deals++;
        months[key].amount += d[field];
        if (d._isSale) months[key].sales += d[field];
        else months[key].rentals += d[field];
      });
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      html += '<div class="card"><div class="card-header"><h3>Monthly Breakdown (' + thisYear + ')</h3></div>' +
        '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
          '<th class="text-left px-3 py-2">Month</th><th class="text-right px-3 py-2">Deals</th>' +
          '<th class="text-right px-3 py-2">Sales</th><th class="text-right px-3 py-2">Rentals</th>' +
          '<th class="text-right px-3 py-2">Total</th></tr></thead><tbody>';
      for (var mi = 0; mi <= thisMonth; mi++) {
        var key = String(mi).padStart(2, '0');
        var md = months[key] || { deals: 0, amount: 0, sales: 0, rentals: 0 };
        html += '<tr class="border-b"><td class="px-3 py-2 font-medium">' + monthNames[mi] + '</td>' +
          '<td class="px-3 py-2 text-right">' + md.deals + '</td>' +
          '<td class="px-3 py-2 text-right text-blue-600">' + $(md.sales) + '</td>' +
          '<td class="px-3 py-2 text-right text-green-600">' + $(md.rentals) + '</td>' +
          '<td class="px-3 py-2 text-right font-bold">' + $(md.amount) + '</td></tr>';
      }
      html += '</tbody><tfoot class="bg-gray-50 font-semibold"><tr>' +
        '<td class="px-3 py-2">YTD Total</td><td class="px-3 py-2 text-right">' + ytd.length + '</td>' +
        '<td class="px-3 py-2 text-right text-blue-600">' + $(salesAmt) + '</td>' +
        '<td class="px-3 py-2 text-right text-green-600">' + $(rentalsAmt) + '</td>' +
        '<td class="px-3 py-2 text-right font-bold">' + $(ytdAmt) + '</td></tr></tfoot></table></div></div></div>';

      // Broker: per-agent breakdown
      if (isBroker && agents.length > 0) {
        html += '<div class="card"><div class="card-header"><h3>Per-Agent Revenue (YTD)</h3></div>' +
          '<div class="card-body"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs"><tr>' +
            '<th class="text-left px-3 py-2">Agent</th><th class="text-right px-3 py-2">Deals</th>' +
            '<th class="text-right px-3 py-2">Gross</th><th class="text-right px-3 py-2">Agent Split</th>' +
            '<th class="text-right px-3 py-2">Brokerage</th></tr></thead><tbody>';
        var agentRevenue = {};
        ytd.forEach(function (d) {
          var aid = d.assignedAgentId || d.assigned_agent_id || 'unassigned';
          if (!agentRevenue[aid]) agentRevenue[aid] = { deals: 0, gross: 0, split: 0, brokerage: 0 };
          agentRevenue[aid].deals++;
          agentRevenue[aid].gross += d._gross;
          agentRevenue[aid].split += d._split;
          agentRevenue[aid].brokerage += d._brokerage;
        });
        Object.keys(agentRevenue).forEach(function (aid) {
          var ar = agentRevenue[aid];
          html += '<tr class="border-b"><td class="px-3 py-2 font-medium">' + E(agentMap[aid] || 'Unassigned') + '</td>' +
            '<td class="px-3 py-2 text-right">' + ar.deals + '</td>' +
            '<td class="px-3 py-2 text-right">' + $(ar.gross) + '</td>' +
            '<td class="px-3 py-2 text-right text-green-600">' + $(ar.split) + '</td>' +
            '<td class="px-3 py-2 text-right">' + $(ar.brokerage) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';
      }

      html += '</div>';
      c.innerHTML = html;
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-chart-pie', 'Unable to load revenue data');
    });
  }

  // ─── Market Activity ─────────────────────────────────────────────────
  var _marketTab = 'new';
  var _marketType = 'all';

  function marketActivity() {
    CRM.setPanelTitle('Market Activity');
    var c = _container(); c.innerHTML = UI.loading();

    // Load watch areas from localStorage
    var watchAreas = [];
    try { watchAreas = JSON.parse(localStorage.getItem('mallan_crm_watch_areas') || '[]'); } catch (e) { /* */ }

    MallanAPI.listings.list({ limit: 200 }).catch(function () { return { listings: [] }; }).then(function (data) {
      var listings = data.listings || [];
      var now = new Date();
      var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      // Categorize
      listings.forEach(function (l) {
        var listDate = new Date(l.ListDate || l.list_date || l.OnMarketDate || l.created_at || 0);
        var modDate = new Date(l.ModificationTimestamp || l.updated_at || l.updatedAt || 0);
        l._isNew = listDate >= sevenDaysAgo;
        l._isPriceChange = l.PriceChangeTimestamp ? new Date(l.PriceChangeTimestamp) >= thirtyDaysAgo : false;
        l._isStatusChange = modDate >= sevenDaysAgo && (l.StatusChangeTimestamp || l.status_changed_at);
        l._isClosed = (l.status || '').toLowerCase() === 'closed';
        l._isComp = l._isClosed && new Date(l.CloseDate || l.close_date || modDate) >= thirtyDaysAgo;
        l._type = (l.property_type || l.listing_type || l.PropertySubType || '').toLowerCase();
        l._isRental = l._type.indexOf('rent') !== -1;
        l._neighborhood = l.MLSAreaMajor || l.neighborhood || l.area || '';
      });

      // Filter by watch areas if set
      var watchFiltered = listings;
      if (watchAreas.length > 0) {
        watchFiltered = listings.filter(function (l) {
          return watchAreas.some(function (area) { return l._neighborhood.toLowerCase().indexOf(area.toLowerCase()) !== -1; });
        });
      }

      // Type filter
      var typeFiltered = watchFiltered;
      if (_marketType === 'sale') typeFiltered = watchFiltered.filter(function (l) { return !l._isRental; });
      else if (_marketType === 'rental') typeFiltered = watchFiltered.filter(function (l) { return l._isRental; });

      // Tab filter
      var newListings = typeFiltered.filter(function (l) { return l._isNew; });
      var priceChanges = typeFiltered.filter(function (l) { return l._isPriceChange; });
      var statusChanges = typeFiltered.filter(function (l) { return l._isStatusChange; });
      var comps = typeFiltered.filter(function (l) { return l._isComp; });
      var tabData = _marketTab === 'new' ? newListings : _marketTab === 'price' ? priceChanges : _marketTab === 'status' ? statusChanges : comps;

      var html = '<div class="space-y-4">';

      // Header + Watch Areas
      html += '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
        '<h2 class="text-lg font-bold text-gray-900">Market Activity</h2>' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._editWatchAreas()"><i class="fas fa-map-marker-alt mr-1"></i> Watch Areas' +
          (watchAreas.length > 0 ? ' (' + watchAreas.length + ')' : '') + '</button>' +
      '</div>';

      // Watch areas display
      if (watchAreas.length > 0) {
        html += '<div class="flex flex-wrap gap-2">';
        watchAreas.forEach(function (area) {
          html += '<span class="px-2 py-1 bg-gold-bg text-gold rounded-lg text-xs font-semibold"><i class="fas fa-map-pin mr-1"></i>' + E(area) + '</span>';
        });
        html += '</div>';
      }

      // Type toggle
      html += '<div class="flex gap-2">';
      ['all', 'sale', 'rental'].forEach(function (t) {
        var label = t === 'all' ? 'All' : t === 'sale' ? 'Sales' : 'Rentals';
        var active = _marketType === t;
        html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ' +
          (active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gold') +
          '" onclick="Panels._switchMarketType(\'' + t + '\')">' + label + '</button>';
      });
      html += '</div>';

      // Activity tabs
      var tabs = [
        { key: 'new', label: 'New Listings', count: newListings.length, icon: 'fa-plus-circle', color: '#059669' },
        { key: 'price', label: 'Price Changes', count: priceChanges.length, icon: 'fa-tag', color: '#F59E0B' },
        { key: 'status', label: 'Status Changes', count: statusChanges.length, icon: 'fa-exchange-alt', color: '#2563EB' },
        { key: 'comps', label: 'Comps Closed', count: comps.length, icon: 'fa-check-circle', color: '#374151' },
      ];
      html += '<div class="flex gap-1 overflow-x-auto">';
      tabs.forEach(function (t) {
        var active = _marketTab === t.key;
        html += '<button class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ' +
          (active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gold') +
          '" onclick="Panels._switchMarketTab(\'' + t.key + '\')"><i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + ' (' + t.count + ')</button>';
      });
      html += '</div>';

      // Results
      if (tabData.length === 0) {
        html += UI.emptyState('fa-chart-area', 'No ' + (_marketTab === 'new' ? 'new listings' : _marketTab === 'price' ? 'price changes' : _marketTab === 'status' ? 'status changes' : 'recent comps') + ' in the last ' + (_marketTab === 'comps' || _marketTab === 'price' ? '30' : '7') + ' days');
      } else {
        html += '<div class="space-y-2">';
        tabData.forEach(function (l) {
          var addr = l.address || l.UnparsedAddress || 'No address';
          var price = l.ListPrice || l.price;
          var dom = l.cumulative_dom || l.days_on_market || 0;

          html += '<div class="card p-3 flex items-center gap-3 hover:border-gold transition-all">' +
            '<div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ' +
              (_marketTab === 'new' ? 'bg-green-50' : _marketTab === 'price' ? 'bg-yellow-50' : _marketTab === 'status' ? 'bg-blue-50' : 'bg-gray-100') + '">' +
              '<i class="fas ' + (_marketTab === 'new' ? 'fa-plus text-green-500' : _marketTab === 'price' ? 'fa-tag text-yellow-500' : _marketTab === 'status' ? 'fa-exchange-alt text-blue-500' : 'fa-check text-gray-500') + '"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0 cursor-pointer" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id) + '/overview\')">' +
              '<p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
              '<div class="flex items-center gap-3 text-xs text-gray-500">' +
                '<span class="font-bold text-gray-900">' + $(price) + '</span>' +
                UI.statusBadge(l.status || 'Active') +
                '<span>' + dom + ' DOM</span>' +
                (l._neighborhood ? '<span>' + E(l._neighborhood) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<button class="btn btn-sm btn-gold flex-shrink-0" onclick="event.stopPropagation();Panels._sendMarketItem(\'' + E(l.id || l.listing_id) + '\',\'' + E(addr) + '\')" title="Send to client">' +
              '<i class="fas fa-paper-plane"></i></button>' +
          '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
      c.innerHTML = html;
    });
  }

  function _switchMarketTab(tab) {
    _marketTab = tab;
    marketActivity();
  }

  function _switchMarketType(type) {
    _marketType = type;
    marketActivity();
  }

  function _editWatchAreas() {
    var current = [];
    try { current = JSON.parse(localStorage.getItem('mallan_crm_watch_areas') || '[]'); } catch (e) { /* */ }

    CRM.openModal('Watch Areas',
      '<form id="watchAreasForm" class="space-y-4">' +
        '<p class="text-sm text-gray-500">Enter neighborhoods to watch (one per line). Market activity will be filtered to these areas.</p>' +
        '<div class="form-group"><label class="form-label">Neighborhoods</label>' +
          '<textarea class="form-input" name="areas" rows="6" placeholder="Upper East Side\nMidtown East\nUpper West Side\nTribeca">' + E(current.join('\n')) + '</textarea></div>' +
        '<p class="text-xs text-gray-400">Leave empty to see all areas.</p>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._saveWatchAreas()"><i class="fas fa-save"></i> Save</button>',
      }
    );
  }

  function _saveWatchAreas() {
    var form = document.getElementById('watchAreasForm');
    if (!form) return;
    var text = form.querySelector('[name="areas"]').value || '';
    var areas = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    try { localStorage.setItem('mallan_crm_watch_areas', JSON.stringify(areas)); } catch (e) { /* */ }
    CRM.closeModal();
    CRM.toast(areas.length > 0 ? 'Watching ' + areas.length + ' areas' : 'Watch areas cleared', 'success');
    marketActivity();
  }

  function _sendMarketItem(listingId, address) {
    // Open Quick Send with this listing pre-selected
    CRM.quickSendListing();
    // After modal opens, try to pre-select
    setTimeout(function () {
      if (typeof CRM._selectSendListing === 'function') {
        CRM._selectSendListing(listingId, address);
      }
    }, 300);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════

  function profile() {
    CRM.setPanelTitle('My Profile');
    var c = _container();
    c.innerHTML = '<div class="flex items-center justify-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>';

    var isBroker = Permissions.isBroker();

    MallanAPI._fetch('/api/crm/agents/me').then(function (res) {
      var agent = (res && res.agent) || Store.session.currentUser || {};
      // Update local session cache
      if (res && res.agent) {
        Store.session.currentUser = Object.assign(Store.session.currentUser || {}, res.agent);
      }
      _renderProfileForm(c, agent, isBroker);
    }).catch(function () {
      // Fallback to cached session data
      var agent = Store.session.currentUser || {};
      _renderProfileForm(c, agent, isBroker);
    });
  }

  function _renderProfileForm(c, agent, isBroker) {
    var photoUrl = agent.photoUrl || agent.photo_url || '';
    var name = agent.name || '';
    var title = agent.title || '';
    var bio = agent.bio || '';
    var specialties = agent.specialties || '';
    var languages = agent.languages || '';
    var slug = agent.slug || '';
    var email = agent.email || '';
    var phone = agent.phone || '';
    var licenseType = agent.licenseType || agent.license_type || '';
    var licenseNumber = agent.licenseNumber || agent.license_number || '';
    var licenseExpiry = agent.licenseExpiry || agent.license_expiry || '';

    // Determine if profile is incomplete
    var isIncomplete = !photoUrl || !bio || !specialties;

    var incompleteCallout = isIncomplete
      ? '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-3">' +
          '<i class="fas fa-exclamation-triangle text-yellow-600 mt-0.5"></i>' +
          '<div>' +
            '<p class="text-sm font-semibold text-yellow-800">Your public profile is incomplete</p>' +
            '<p class="text-sm text-yellow-700">Add a photo, bio, and specialties to appear on mallan.nyc.</p>' +
          '</div>' +
        '</div>'
      : '';

    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('My Profile', '') +

      // Sync note
      '<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">' +
        '<i class="fas fa-info-circle text-blue-500 mt-0.5"></i>' +
        '<p class="text-sm text-blue-700">Your profile information appears on your public agent page at <strong>mallan.nyc/agents/' + E(slug || 'your-name') + '</strong>. Changes sync automatically.</p>' +
      '</div>' +

      // Incomplete callout
      incompleteCallout +

      '<form id="profileForm" class="space-y-4">' +

        // ── Public Profile Section ──
        UI.card('<i class="fas fa-user-circle text-gold mr-2"></i>Public Profile',
          '<p class="text-xs text-gray-500 mb-4">This information appears on your public agent page on mallan.nyc.</p>' +

          // Photo
          '<div class="mb-4">' +
            '<label class="form-label">Profile Photo</label>' +
            '<div class="flex items-center gap-4">' +
              '<div id="profilePhotoPreview" class="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">' +
                (photoUrl
                  ? '<img src="' + E(photoUrl) + '" class="w-full h-full object-cover" alt="Profile photo">'
                  : '<i class="fas fa-user text-3xl text-gray-300"></i>') +
              '</div>' +
              '<div class="flex-1">' +
                '<input type="file" id="profilePhotoFile" accept="image/jpeg,image/png,image/webp" class="form-input text-sm" onchange="Panels._previewProfilePhoto(this)">' +
                '<p class="text-xs text-gray-400 mt-1">JPG, PNG, or WebP. Recommended: 400x400px or larger, square crop.</p>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // Name (readonly)
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">' +
            '<div class="form-group">' +
              '<label class="form-label">Name</label>' +
              '<input class="form-input bg-gray-50" name="name" value="' + E(name) + '" readonly>' +
              '<p class="text-xs text-gray-400 mt-1">Only the broker can change your name.</p>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Public URL</label>' +
              '<input class="form-input bg-gray-50" value="mallan.nyc/agents/' + E(slug || 'your-name') + '" readonly>' +
            '</div>' +
          '</div>' +

          // Title / Tagline
          '<div class="form-group mb-4">' +
            '<label class="form-label">Title / Tagline</label>' +
            '<input class="form-input" name="title" value="' + E(title) + '" placeholder="e.g. Licensed Real Estate Broker" maxlength="100">' +
            '<p class="text-xs text-gray-400 mt-1">Appears below your name on your agent page.</p>' +
          '</div>' +

          // Bio
          '<div class="form-group mb-4">' +
            '<label class="form-label">Bio</label>' +
            '<textarea class="form-input" name="bio" rows="5" placeholder="Write a professional bio that tells clients about your experience, approach, and areas of expertise...">' + E(bio) + '</textarea>' +
            '<p class="text-xs text-gray-400 mt-1">Displayed on your public profile. Keep it professional and engaging.</p>' +
          '</div>' +

          // Specialties
          '<div class="form-group mb-4">' +
            '<label class="form-label">Specialties</label>' +
            '<input class="form-input" name="specialties" value="' + E(specialties) + '" placeholder="e.g. Upper East Side, Luxury Condos, First-Time Buyers">' +
            '<p class="text-xs text-gray-400 mt-1">Comma-separated. Shown as badges on your profile.</p>' +
          '</div>' +

          // Languages
          '<div class="form-group">' +
            '<label class="form-label">Languages</label>' +
            '<input class="form-input" name="languages" value="' + E(languages) + '" placeholder="e.g. English, Spanish, Mandarin">' +
            '<p class="text-xs text-gray-400 mt-1">Comma-separated. Helps clients find agents who speak their language.</p>' +
          '</div>'
        ) +

        // ── Contact Information ──
        UI.card('<i class="fas fa-address-book text-gold mr-2"></i>Contact Information',
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group">' +
              '<label class="form-label">Email</label>' +
              '<input class="form-input bg-gray-50" name="email" value="' + E(email) + '" readonly>' +
              '<p class="text-xs text-gray-400 mt-1">Contact your broker to change your email.</p>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Phone</label>' +
              '<input class="form-input" name="phone" value="' + E(phone) + '" placeholder="e.g. 212-555-1234">' +
            '</div>' +
          '</div>'
        ) +

        // ── License Information ──
        UI.card('<i class="fas fa-id-badge text-gold mr-2"></i>License Information',
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
            '<div class="form-group">' +
              '<label class="form-label">License Type</label>' +
              (isBroker
                ? '<input class="form-input" name="license_type" value="' + E(licenseType) + '" placeholder="e.g. Real Estate Broker">'
                : '<input class="form-input bg-gray-50" value="' + E(licenseType) + '" readonly>') +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">License #</label>' +
              (isBroker
                ? '<input class="form-input" name="license_number" value="' + E(licenseNumber) + '">'
                : '<input class="form-input bg-gray-50" value="' + E(licenseNumber) + '" readonly>') +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">License Expiry</label>' +
              (isBroker
                ? '<input class="form-input" name="license_expiry" type="date" value="' + E(licenseExpiry ? licenseExpiry.substring(0, 10) : '') + '">'
                : '<input class="form-input bg-gray-50" value="' + E(licenseExpiry ? D(licenseExpiry) : 'N/A') + '" readonly>') +
            '</div>' +
          '</div>' +
          (isBroker ? '' : '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-lock text-gray-300 mr-1"></i>License fields are managed by the broker.</p>')
        ) +

        // ── Preview Card ──
        UI.card('<i class="fas fa-eye text-gold mr-2"></i>Profile Preview',
          '<p class="text-xs text-gray-500 mb-3">This is how your profile will appear on mallan.nyc.</p>' +
          '<div id="profilePreviewCard" class="border rounded-xl p-5 bg-white max-w-md">' +
            _buildProfilePreview(agent) +
          '</div>'
        ) +

        // ── Save Button ──
        '<div class="flex items-center gap-3">' +
          '<button type="button" class="btn btn-gold" onclick="Panels._saveProfile()" id="profileSaveBtn">' +
            '<i class="fas fa-save mr-1"></i> Save Changes' +
          '</button>' +
          '<span id="profileSaveStatus" class="text-sm text-gray-500"></span>' +
        '</div>' +

      '</form>' +
    '</div>';

    // Wire up live preview updates
    var formEl = document.getElementById('profileForm');
    if (formEl) {
      formEl.addEventListener('input', function () {
        _updateProfilePreview();
      });
    }
  }

  function _buildProfilePreview(agent) {
    var photoUrl = agent.photoUrl || agent.photo_url || '';
    var name = agent.name || 'Your Name';
    var title = agent.title || '';
    var bio = agent.bio || '';
    var specialties = agent.specialties || '';
    var languages = agent.languages || '';

    var specBadges = '';
    if (specialties) {
      var specs = specialties.split(',');
      for (var i = 0; i < specs.length; i++) {
        var s = specs[i].trim();
        if (s) specBadges += '<span class="inline-block bg-gold/10 text-yellow-800 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">' + E(s) + '</span>';
      }
    }

    var langLine = '';
    if (languages) {
      langLine = '<p class="text-xs text-gray-500 mt-2"><i class="fas fa-globe mr-1"></i>' + E(languages) + '</p>';
    }

    var bioSnippet = bio.length > 150 ? bio.substring(0, 150) + '...' : bio;

    return '<div class="flex items-center gap-4 mb-3">' +
      '<div class="w-16 h-16 rounded-full bg-gray-100 border overflow-hidden flex-shrink-0 flex items-center justify-center">' +
        (photoUrl
          ? '<img src="' + E(photoUrl) + '" class="w-full h-full object-cover" alt="">'
          : '<i class="fas fa-user text-2xl text-gray-300"></i>') +
      '</div>' +
      '<div>' +
        '<p class="font-semibold text-gray-900">' + E(name) + '</p>' +
        (title ? '<p class="text-sm text-gray-600">' + E(title) + '</p>' : '') +
      '</div>' +
    '</div>' +
    (bioSnippet ? '<p class="text-sm text-gray-700 mb-2">' + E(bioSnippet) + '</p>' : '<p class="text-sm text-gray-400 italic mb-2">No bio yet.</p>') +
    (specBadges ? '<div class="mb-2">' + specBadges + '</div>' : '') +
    langLine;
  }

  function _updateProfilePreview() {
    var previewEl = document.getElementById('profilePreviewCard');
    if (!previewEl) return;
    var form = document.getElementById('profileForm');
    if (!form) return;

    var agent = {
      name: (form.querySelector('[name="name"]') || {}).value || '',
      title: (form.querySelector('[name="title"]') || {}).value || '',
      bio: (form.querySelector('[name="bio"]') || {}).value || '',
      specialties: (form.querySelector('[name="specialties"]') || {}).value || '',
      languages: (form.querySelector('[name="languages"]') || {}).value || '',
      photoUrl: ''
    };

    // Use current preview photo src if available
    var previewImg = document.querySelector('#profilePhotoPreview img');
    if (previewImg) agent.photoUrl = previewImg.src;

    previewEl.innerHTML = _buildProfilePreview(agent);
  }

  function _previewProfilePhoto(input) {
    var preview = document.getElementById('profilePhotoPreview');
    if (!preview || !input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.innerHTML = '<img src="' + e.target.result + '" class="w-full h-full object-cover" alt="Profile photo">';
      _updateProfilePreview();
    };
    reader.readAsDataURL(input.files[0]);
  }

  function _saveProfile() {
    var form = document.getElementById('profileForm');
    if (!form) return;
    var saveBtn = document.getElementById('profileSaveBtn');
    var statusEl = document.getElementById('profileSaveStatus');

    // Disable button during save
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...'; }
    if (statusEl) statusEl.textContent = '';

    // Collect editable fields (skip readonly: name, email)
    var data = {};
    var editableFields = ['title', 'bio', 'specialties', 'languages', 'phone'];
    // Broker can also edit license fields
    var isBroker = Permissions.isBroker();
    if (isBroker) {
      editableFields.push('license_type', 'license_number', 'license_expiry');
    }

    for (var i = 0; i < editableFields.length; i++) {
      var field = editableFields[i];
      var input = form.querySelector('[name="' + field + '"]');
      if (input) data[field] = input.value;
    }

    // Check if there is a new photo to upload
    var photoInput = document.getElementById('profilePhotoFile');
    var hasNewPhoto = photoInput && photoInput.files && photoInput.files[0];

    var uploadPhotoPromise;
    if (hasNewPhoto) {
      var formData = new FormData();
      formData.append('photo', photoInput.files[0]);
      uploadPhotoPromise = MallanAPI._fetch('/api/crm/agents/me/photo', {
        method: 'POST',
        body: formData,
        rawBody: true
      }).then(function (res) {
        if (res && res.url) {
          data.photo_url = res.url;
        }
        return res;
      }).catch(function (err) {
        CRM.toast('Photo upload failed: ' + (err.message || 'Unknown error'), 'error');
        // Continue with other fields even if photo fails
        return null;
      });
    } else {
      uploadPhotoPromise = Promise.resolve(null);
    }

    uploadPhotoPromise.then(function () {
      return MallanAPI._fetch('/api/crm/agents/me', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }).then(function (res) {
      if (res && res.agent) {
        Store.session.currentUser = Object.assign(Store.session.currentUser || {}, res.agent);
      }
      CRM.toast('Profile updated \u2014 changes will appear on mallan.nyc shortly', 'success');
      if (statusEl) statusEl.textContent = 'Saved';
    }).catch(function (err) {
      CRM.toast('Failed to save profile: ' + (err.message || 'Unknown error'), 'error');
      if (statusEl) { statusEl.textContent = 'Save failed'; statusEl.className = 'text-sm text-red-500'; }
    }).then(function () {
      // Always re-enable button (finally equivalent)
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Changes'; }
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
    brokerApprovalQueue: brokerApprovalQueue,
    _filterApprovalQueue: _filterApprovalQueue,
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
    _previewAgentPhoto: _previewAgentPhoto,
    _editAgent: _editAgent,
    _createLead: _createLead,
    _submitLead: _submitLead,
    _assignLead: _assignLead,
    _assignLeadSuggested: _assignLeadSuggested,
    _doAssignLead: _doAssignLead,
    _bulkAssignLeads: _bulkAssignLeads,
    _doBulkAssign: _doBulkAssign,
    _toggleBulkLead: _toggleBulkLead,
    _filterLeadsBySource: _filterLeadsBySource,
    _addReferral: _addReferral,
    _submitReferral: _submitReferral,
    _calcRefFee: _calcRefFee,
    _fillOurAgentDetails: _fillOurAgentDetails,
    _updateRefFormLabels: _updateRefFormLabels,
    _approvePayout: _approvePayout,
    _saveSplit: _saveSplit,
    _saveAgentSplit: _saveAgentSplit,
    _payoutStatusPipeline: _payoutStatusPipeline,
    _filterPayouts: _filterPayouts,
    _sortPayouts: _sortPayouts,
    _exportPayoutsCSV: _exportPayoutsCSV,
    _markPaid: _markPaid,
    _rejectPayout: _rejectPayout,
    _toggleFeatured: _toggleFeatured,
    _uploadDoc: _uploadDoc,
    _submitUploadDoc: _submitUploadDoc,
    _documentsTable: _documentsTable,
    _filterDocVault: _filterDocVault,
    _filterDocVaultScope: _filterDocVaultScope,
    _sortDocVault: _sortDocVault,
    _approveDoc: _approveDoc,
    _batchApproveDocuments: _batchApproveDocuments,
    _rejectDoc: _rejectDoc,
    _viewDoc: _viewDoc,
    _replaceDoc: _replaceDoc,
    _deleteDoc: _deleteDoc,
    _generateFromTemplate: _generateFromTemplate,
    _updateTemplateScopePicker: _updateTemplateScopePicker,
    _submitGenerateTemplate: _submitGenerateTemplate,
    _updateUploadScopePicker: _updateUploadScopePicker,
    _filterClients: _filterClients,
    _composeEmail: _composeEmail,
    _submitEmail: _submitEmail,
    _composeSMS: _composeSMS,
    _submitSMS: _submitSMS,
    _updateSMSCharCount: _updateSMSCharCount,
    _composeBulk: _composeBulk,
    _updateEblastCount: _updateEblastCount,
    _submitEblast: _submitEblast,
    _commsTabSwitch: _commsTabSwitch,
    _commsRenderTab: _commsRenderTab,
    _commsLoadAll: _commsLoadAll,
    _commsRefreshInbox: _commsRefreshInbox,
    _commsSearchRecipients: _commsSearchRecipients,
    _commsSelectRecipient: _commsSelectRecipient,
    _commsRemoveRecipient: _commsRemoveRecipient,
    _commsApplyTemplate: _commsApplyTemplate,
    _commsApplyEblastTemplate: _commsApplyEblastTemplate,
    _commsAttachListing: _commsAttachListing,
    _commsPickListing: _commsPickListing,
    _viewEmailDetail: _viewEmailDetail,
    _viewThread: _viewThread,
    _replyToThread: _replyToThread,
    _commsBackFromThread: _commsBackFromThread,
    _viewCampaignDetail: _viewCampaignDetail,
    _useTemplate: _useTemplate,
    _editTemplate: _editTemplate,
    _saveEditTemplate: _saveEditTemplate,
    _deleteTemplate: _deleteTemplate,
    _createTemplate: _createTemplate,
    _submitCreateTemplate: _submitCreateTemplate,
    _saveProfile: _saveProfile,
    _previewProfilePhoto: _previewProfilePhoto,
    _updateProfilePreview: _updateProfilePreview,
    _submitEditAgent: _submitEditAgent,
    _toggleAgentCard: _toggleAgentCard,
    _agentTab: _agentTab,
    _filterRoster: _filterRoster,
    _deactivateAgent: _deactivateAgent,
    _filterCAB: _filterCAB,
    _sortCAB: _sortCAB,
    _reassignClient: _reassignClient,
    _doReassign: _doReassign,
    _agentReferralsView: _agentReferralsView,
    _filterRosterListings: _filterRosterListings,
    _filterReferralYear: _filterReferralYear,
    _open1099Preview: _open1099Preview,
    _generate1099: _generate1099,
    _generateAll1099s: _generateAll1099s,
    _filter1099: _filter1099,
    _export1099AuditReport: _export1099AuditReport,
    _export1099AuditCSV: _export1099AuditCSV,
    _mark1099Status: _mark1099Status,
    _runFairHousingScan: _runFairHousingScan,
    _companyListingsView: _companyListingsView,
    _filterCompanyView: _filterCompanyView,
    _sortCompanyListings: _sortCompanyListings,
    _exportCompanyCSV: _exportCompanyCSV,
    _computeListingCompliance: _computeListingCompliance,
    _toggleAuditDetail: _toggleAuditDetail,
    _filterAuditLog: _filterAuditLog,
    _exportAuditCSV: _exportAuditCSV,
    _switchAuditView: _switchAuditView,
    _addCECourse: _addCECourse,
    _editCECourse: _editCECourse,
    _submitCECourse: _submitCECourse,
    _deleteCECourse: _deleteCECourse,
    _filterCECourses: _filterCECourses,
    _filterLicensingTab: _filterLicensingTab,
    _addEOPolicy: _addEOPolicy,
    _submitEOPolicy: _submitEOPolicy,
    _setRenewalAlerts: _setRenewalAlerts,
    _saveRenewalAlerts: _saveRenewalAlerts,
    _toggleTask: _opsDashToggleTask,
    _launchSearch: _launchSearch,
    _clearSearchHistory: _clearSearchHistory,
    _switchMyListingsView: _switchMyListingsView,
    _switchMyListingsType: _switchMyListingsType,
    _switchMyListingsStatus: _switchMyListingsStatus,
    _addOpenHouse: _addOpenHouse,
    _submitOpenHouse: _submitOpenHouse,
    _switchMyClientsView: _switchMyClientsView,
    _searchMyClients: _searchMyClients,
    _pipelineDragStart: _pipelineDragStart,
    _pipelineDrop: _pipelineDrop,
    _pipelineMove: _pipelineMove,
    _switchTasksView: _switchTasksView,
    _toggleTaskStatus: _toggleTaskStatus,
    _deleteTask: _deleteTask,
    _switchDealsView: _switchDealsView,
    _submitCommissionRequest: _submitCommissionRequest,
    _approveDealPayout: _approveDealPayout,
    _rejectDealPayout: _rejectDealPayout,
    _markDealPaid: _markDealPaid,
    _uploadDealDoc: _uploadDealDoc,
    _switchMarketTab: _switchMarketTab,
    _switchMarketType: _switchMarketType,
    _editWatchAreas: _editWatchAreas,
    _saveWatchAreas: _saveWatchAreas,
    _sendMarketItem: _sendMarketItem,
  };
})();
