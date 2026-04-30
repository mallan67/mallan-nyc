var HomeScreen = (function () {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;

  function render() {
    CRM.setPanelTitle('Dashboard');
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    var isBroker = typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT.role === 'broker';

    Promise.all([
      MallanAPI._fetch('/api/crm/sales/sellers').catch(function () { return { sellers: [] }; }),
      MallanAPI._fetch('/api/crm/sales/buyers').catch(function () { return { buyers: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/landlords').catch(function () { return { landlords: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/tenants').catch(function () { return { tenants: [] }; }),
      MallanAPI._fetch('/api/crm/rentals/prospects').catch(function () { return { prospects: [] }; }),
      MallanAPI.deals.list({ limit: 200 }).catch(function () { return { deals: [] }; }),
      // Broker only: unassigned self-signup leads
      isBroker
        ? MallanAPI._fetch('/api/crm/unassigned-leads').catch(function () { return { leads: [], agents: [] }; })
        : Promise.resolve({ leads: [], agents: [] }),
      MallanAPI._fetch('/api/crm/growth-tools').catch(function () { return { growth_tools: {} }; }),
    ]).then(function (results) {
      _renderCards(c, results, isBroker);
    }).catch(function () {
      c.innerHTML = '<div class="text-center py-20 text-gray-500">Unable to load dashboard data</div>';
    });
  }

  function _renderCards(c, results, isBroker) {
    var sellers = results[0].sellers || [];
    var buyers = results[1].buyers || results[1].clients || [];
    var landlords = results[2].landlords || results[2].clients || [];
    var tenants = results[3].tenants || results[3].clients || [];
    var prospects = results[4].prospects || results[4].clients || [];
    var deals = results[5].deals || [];
    var unassignedLeads = results[6].leads || [];
    var agentRoster = results[6].agents || [];
    var growth = (results[7] && (results[7].growth_tools || results[7])) || {};

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

    // BROKER ONLY: Unassigned Leads Card
    if (isBroker && unassignedLeads.length > 0) {
      html += '<div class="max-w-5xl mx-auto mt-6">';
      html += '<div class="bg-white rounded-2xl border-2 border-red-200 shadow-sm overflow-hidden">';
      html += '<div class="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4 flex items-center justify-between">';
      html += '<div class="flex items-center gap-3"><div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i class="fas fa-user-plus text-white text-lg"></i></div>';
      html += '<div><h2 class="text-lg font-bold text-white">Unassigned Leads</h2><p class="text-red-200 text-xs">Self-registered on mallan.nyc — awaiting distribution</p></div></div>';
      html += '<span class="text-3xl font-black text-white">' + unassignedLeads.length + '</span>';
      html += '</div>';
      html += '<div class="p-6">';
      html += '<div class="space-y-3" id="unassigned-leads-list">';

      unassignedLeads.forEach(function (lead) {
        var roleColor = { buyer: 'blue', tenant: 'purple', seller: 'green', landlord: 'teal' }[lead.portal_role] || 'gray';
        var roleLabel = lead.portal_role === 'tenant' ? 'Renter'
          : lead.portal_role ? (lead.portal_role.charAt(0).toUpperCase() + lead.portal_role.slice(1)) : 'Unknown';
        var urgency = lead.hours_since_signup <= 1 ? '🔴 Just now'
          : lead.hours_since_signup <= 24 ? '🟡 ' + lead.hours_since_signup + 'h ago'
          : '⚪ ' + Math.floor(lead.hours_since_signup / 24) + 'd ago';

        html += '<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">';

        // Lead info
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="flex items-center gap-2">';
        html += '<span class="font-semibold text-gray-900">' + E(lead.first_name + ' ' + lead.last_name) + '</span>';
        html += '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-' + roleColor + '-100 text-' + roleColor + '-700">' + E(roleLabel) + '</span>';
        html += '<span class="text-[10px] text-gray-400">' + urgency + '</span>';
        html += '</div>';
        html += '<div class="text-xs text-gray-500 mt-0.5">' + E(lead.email) + ' · ' + E(lead.phone) + '</div>';
        if (lead.notes) {
          html += '<div class="text-xs text-gray-600 mt-1 italic truncate">' + E(lead.notes.replace('[Sign-up message]: ', '').split('\n')[0]) + '</div>';
        }
        var inheritedCount = (lead.portal_activity_count || 0) + (lead.external_listing_count || 0) + (lead.saved_search_count || 0) + (lead.listing_action_count || 0) + (lead.activity_count || 0);
        if (inheritedCount) {
          html += '<div class="text-[11px] text-gray-500 mt-1"><i class="fas fa-share-alt mr-1 text-gray-400"></i>Agent inherits ' + inheritedCount + ' saved activity items</div>';
        }
        html += '</div>';

        // Agent selector + assign button
        html += '<div class="flex items-center gap-2 flex-shrink-0">';
        html += '<select id="assign-agent-' + E(lead.id) + '" class="border rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white min-w-[160px]">';
        html += '<option value="">— Select Agent —</option>';
        agentRoster.forEach(function (agent) {
          html += '<option value="' + E(agent.id) + '">' + E(agent.name) + ' (' + agent.active_lead_count + ' leads)</option>';
        });
        html += '</select>';
        html += '<input type="text" id="assign-note-' + E(lead.id) + '" placeholder="Note to agent (optional)" class="border rounded-lg px-2 py-1.5 text-xs w-40 hidden">';
        html += '<button onclick="HomeScreen.assignLead(\'' + E(lead.id) + '\')" class="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors">Assign</button>';
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
      html += '<div class="mt-3 flex justify-end"><button onclick="Router.navigate(\'/broker/leads\')" class="text-xs text-red-600 hover:text-red-800 font-semibold"><i class="fas fa-external-link-alt mr-1"></i>Full Distribution Panel</button></div>';
      html += '</div></div></div>';
    }

    html += _growthToolsSection(growth);

    c.innerHTML = html;
  }

  function _growthToolsSection(growth) {
    var counts = growth.counts || {};
    var sellerItems = (growth.seller_signal_queue || []).slice(0, 5);
    var marketingItems = (growth.marketing_queue || []).slice(0, 5);
    var pipelineItems = (growth.pipeline_queue || []).slice(0, 5);
    var gaps = growth.tool_gaps || [];

    var html = '<div class="max-w-5xl mx-auto mt-6 space-y-4">';
    html += '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">';
    html += '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">';
    html += '<div class="flex items-center gap-3"><div class="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><i class="fas fa-bolt text-amber-600"></i></div>';
    html += '<div><h2 class="text-lg font-bold text-gray-900">Growth Tools</h2><p class="text-xs text-gray-500">Seller signals, marketing cadence, and pipeline cleanup</p></div></div>';
    html += '<div class="flex gap-2 text-xs">';
    html += '<span class="px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold">' + Number(counts.urgent_actions || 0) + ' urgent</span>';
    html += '<span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">' + Number(counts.high_actions || 0) + ' high</span>';
    html += '</div></div>';

    html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 bg-gray-50 border-b border-gray-100">';
    html += _miniMetric('Buyers', counts.buyers || 0, 'fa-user-check');
    html += _miniMetric('Sellers', counts.sellers || 0, 'fa-home');
    html += _miniMetric('Landlords', counts.landlords || 0, 'fa-key');
    html += _miniMetric('Tenants', counts.tenants || 0, 'fa-file-signature');
    html += '</div>';

    html += '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">';
    html += _growthList('Potential Sellers', 'fa-chart-line', sellerItems, 'No seller signals need attention.');
    html += _growthList('Marketing', 'fa-envelope-open-text', marketingItems, 'No marketing cadence items due.');
    html += _growthList('Pipeline', 'fa-stream', pipelineItems, 'No pipeline cleanup items due.');
    html += '</div>';

    if (gaps.length) {
      html += '<div class="px-6 pb-6">';
      html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">';
      gaps.forEach(function (gap) {
        html += '<div class="rounded-xl border border-gray-100 bg-gray-50 p-3">';
        html += '<div class="flex items-center justify-between"><span class="text-xs font-bold text-gray-700">' + E(gap.segment || 'segment') + '</span><span class="text-lg font-black text-gray-900">' + Number(gap.count || 0) + '</span></div>';
        html += '<div class="text-xs text-gray-600 mt-1">' + E(gap.tool || '') + '</div>';
        html += '<div class="text-[11px] text-gray-500 mt-1">' + E(gap.next_action || '') + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  function _miniMetric(label, value, icon) {
    return '<div class="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">' +
      '<div><div class="text-[11px] uppercase tracking-wide text-gray-400 font-bold">' + E(label) + '</div><div class="text-xl font-black text-gray-900">' + Number(value || 0) + '</div></div>' +
      '<i class="fas ' + icon + ' text-gray-300"></i>' +
    '</div>';
  }

  function _growthList(title, icon, items, emptyText) {
    var html = '<div class="rounded-xl border border-gray-100 overflow-hidden">';
    html += '<div class="px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm font-bold text-gray-800"><i class="fas ' + icon + ' mr-2 text-gray-400"></i>' + E(title) + '</div>';
    html += '<div class="divide-y divide-gray-100">';
    if (!items.length) {
      html += '<div class="p-4 text-sm text-gray-400">' + E(emptyText) + '</div>';
    }
    items.forEach(function (item) {
      var open = item.lead_id ? " onclick=\"Router.navigate('/workspace/client/" + E(item.lead_id) + "/overview')\" role=\"button\"" : "";
      html += '<div class="p-4 hover:bg-gray-50 ' + (item.lead_id ? 'cursor-pointer' : '') + '"' + open + '>';
      html += '<div class="flex items-start justify-between gap-3">';
      html += '<div class="min-w-0"><div class="text-sm font-semibold text-gray-900 truncate">' + E(item.title || 'Action') + '</div>';
      html += '<div class="text-xs text-gray-500 mt-0.5">' + E(item.detail || '') + '</div>';
      html += '<div class="text-[11px] text-gray-500 mt-1"><i class="fas fa-arrow-right mr-1"></i>' + E(item.next_action || '') + '</div></div>';
      html += '<span class="' + _priorityClass(item.priority) + '">' + E(item.priority || 'normal') + '</span>';
      html += '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  function _priorityClass(priority) {
    if (priority === 'urgent') return 'px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase';
    if (priority === 'high') return 'px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase';
    return 'px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold uppercase';
  }

  function assignLead(leadId) {
    var sel = document.getElementById('assign-agent-' + leadId);
    var noteEl = document.getElementById('assign-note-' + leadId);
    var agentId = sel ? sel.value : '';
    if (!agentId) { CRM.toast('Please select an agent', 'warning'); return; }

    var body = { assigned_agent_id: agentId };
    var note = noteEl ? noteEl.value.trim() : '';
    if (note) body.broker_note = note;

    MallanAPI._fetch('/api/crm/leads/' + leadId, { method: 'PATCH', body: JSON.stringify(body) })
      .then(function () {
        CRM.toast('Lead assigned — agent notified', 'success');
        // Remove the row
        var row = sel ? sel.closest('.flex.items-center.gap-4') : null;
        if (row) {
          row.style.transition = 'opacity 0.3s';
          row.style.opacity = '0';
          setTimeout(function () { row.remove(); }, 300);
        }
      })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
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

  return { render: render, assignLead: assignLead };
})();
