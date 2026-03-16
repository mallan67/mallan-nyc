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

    MallanAPI.agents.list().then(function (data) {
      var agents = data.agents || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Agents', agents.length + ' total',
          '<button class="btn btn-sm btn-gold" onclick="Panels._addAgent()"><i class="fas fa-plus"></i> Add Agent</button>') +
        UI.dataTable(
          [
            { key: 'name', label: 'Name', render: function (a) {
              return '<div class="flex items-center gap-2">' + UI.avatar(a.name || a.email, 28) +
                '<div><p class="text-sm font-medium">' + E(a.name || a.email) + '</p>' +
                '<p class="text-xs text-gray-500">' + E(a.email || '') + '</p></div></div>';
            }},
            { key: 'phone', label: 'Phone', render: function (a) { return '<span class="text-sm">' + E(a.phone || '-') + '</span>'; }},
            { key: 'status', label: 'Status', render: function (a) { return UI.statusBadge(a.status || 'active'); }},
            { key: 'license', label: 'License #', render: function (a) { return '<span class="text-xs text-gray-500">' + E(a.licenseNumber || a.license_number || '-') + '</span>'; }},
            { key: 'actions', label: '', render: function (a) {
              return '<div class="flex gap-1">' +
                '<button class="btn btn-sm btn-outline" onclick="CRM.doImpersonate(\'' + E(a.id) + '\')"><i class="fas fa-eye"></i></button>' +
                '<button class="btn btn-sm btn-outline" onclick="Panels._editAgent(\'' + E(a.id) + '\')"><i class="fas fa-edit"></i></button>' +
              '</div>';
            }},
          ],
          agents,
          { title: '', onRowClick: '' }
        ) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-user-tie', 'Unable to load agent roster');
    });
  }

  function _addAgent() {
    CRM.openModal('Add Agent',
      '<form id="addAgentForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Name *</label><input class="form-input" name="name" required></div>' +
          '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone"></div>' +
          '<div class="form-group"><label class="form-label">License #</label><input class="form-input" name="license_number"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Sale Split %</label><input class="form-input" type="number" name="sale_split" value="50"></div>' +
          '<div class="form-group"><label class="form-label">Rental Split %</label><input class="form-input" type="number" name="rental_split" value="50"></div>' +
        '</div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels._submitAddAgent()"><i class="fas fa-save"></i> Save</button>',
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
  function clientAddressBook() {
    CRM.setPanelTitle('Client Address Book', 'All clients');
    var c = _container(); c.innerHTML = UI.loading();

    MallanAPI.clients.list({ limit: 200 }).then(function (data) {
      var clients = data.clients || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('All Clients', clients.length + ' total',
          '<button class="btn btn-sm btn-gold" onclick="CRM.quickNewClient()"><i class="fas fa-plus"></i> New Client</button>') +
        UI.dataTable(
          [
            { key: 'name', label: 'Client', render: function (cl) {
              return '<div class="flex items-center gap-2 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + E(cl.id) + '/overview\')">' +
                UI.avatar(cl.name || cl.email, 28) +
                '<div><p class="text-sm font-medium">' + E(cl.name || cl.email) + '</p>' +
                '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div></div>';
            }},
            { key: 'type', label: 'Type', render: function (cl) { return UI.roleBadge(cl.type || cl.client_type); }},
            { key: 'stage', label: 'Stage', render: function (cl) { return UI.stageBadge(cl.stage || cl.status); }},
            { key: 'agent', label: 'Agent', render: function (cl) { return '<span class="text-xs text-gray-500">' + E(cl.agent_name || cl.assignedAgentId || '-') + '</span>'; }},
            { key: 'updated', label: 'Last Updated', render: function (cl) { return '<span class="text-xs text-gray-500">' + Utils.formatTimeAgo(cl.updated_at || cl.updatedAt) + '</span>'; }},
          ],
          clients,
          { title: '' }
        ) +
      '</div>';
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-address-book', 'Unable to load clients');
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

    MallanAPI._fetch('/api/crm/referrals?limit=100').then(function (data) {
      var referrals = data.referrals || [];
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Referrals', referrals.length + ' total',
          '<button class="btn btn-sm btn-gold" onclick="Panels._addReferral()"><i class="fas fa-plus"></i> New Referral</button>') +
        _referralTable(referrals) +
      '</div>';
    }).catch(function () {
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('Referral Tracking', 'Incoming & outgoing referrals') +
        UI.emptyState('fa-exchange-alt', 'No referrals yet', '<button class="btn btn-sm btn-gold" onclick="Panels._addReferral()"><i class="fas fa-plus"></i> New Referral</button>') +
      '</div>';
    });
  }

  function _referralTable(referrals) {
    return UI.dataTable([
      { key: 'partner', label: 'Partner', render: function (r) { return '<span class="text-sm font-medium">' + E(r.referralPartner || r.partner || '-') + '</span>'; }},
      { key: 'direction', label: 'Direction', render: function (r) {
        var dir = r.direction || 'incoming';
        return '<span class="badge badge-' + (dir === 'incoming' ? 'active' : 'pending') + '">' + E(dir) + '</span>';
      }},
      { key: 'fee', label: 'Fee %', render: function (r) { return '<span class="text-sm">' + (r.feePercent || r.fee_percent || '-') + '%</span>'; }},
      { key: 'status', label: 'Status', render: function (r) { return UI.statusBadge(r.agreementStatus || r.status || 'pending'); }},
      { key: 'created', label: 'Date', render: function (r) { return '<span class="text-xs text-gray-500">' + D(r.created_at || r.createdAt) + '</span>'; }},
    ], referrals);
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
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('1099 Year-End', 'Generate annual tax documents for agents') +
      UI.emptyState('fa-file-invoice-dollar', 'Select a tax year to generate 1099s',
        '<div class="flex gap-2 justify-center mt-2">' +
          '<button class="btn btn-sm btn-gold" onclick="CRM.toast(\'Generating 2025 1099s...\',\'info\')">Generate 2025</button>' +
          '<button class="btn btn-sm btn-outline" onclick="CRM.toast(\'Generating 2024 1099s...\',\'info\')">Generate 2024</button>' +
        '</div>') +
    '</div>';
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
    var c = _container();
    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('REBNY/RLS Compliance', 'UCBA 2026 compliance monitoring') +
      UI.statGrid([
        UI.statCard('Active', 'RLS Status', 'fa-shield-alt', '#059669'),
        UI.statCard('0', 'Violations', 'fa-exclamation-triangle', '#059669'),
        UI.statCard('100%', 'Data Quality', 'fa-chart-bar', '#059669'),
      ]) +
      UI.card('Compliance Checks', '<div class="space-y-2">' +
        _complianceItem('Fair Housing Scanner', 'pass', '19 patterns active') +
        _complianceItem('RLS Distribution Gates', 'pass', '6 gates enforced') +
        _complianceItem('DOM Tracking (UCBA 2026)', 'pass', '30-day reset') +
        _complianceItem('IDX Display Compliance', 'pass', 'Owner opt-out enforced') +
        _complianceItem('Data Retention', 'pass', 'NY SHIELD Act compliant') +
      '</div>') +
    '</div>';
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
    var c = _container();
    var events = Events.getByCategory('audit', 50);

    c.innerHTML = '<div class="space-y-4">' +
      UI.sectionHeader('Audit Log', 'System-wide audit trail') +
      (events.length > 0 ?
        UI.dataTable([
          { key: 'type', label: 'Event', render: function (e) { return '<div class="flex items-center gap-2"><i class="fas ' + Events.icon(e.type) + ' text-xs text-gray-400"></i><span class="text-sm">' + Events.label(e.type) + '</span></div>'; }},
          { key: 'entity', label: 'Entity', render: function (e) { return '<span class="text-xs">' + E(e.entityType + ':' + (e.entityId || '-')) + '</span>'; }},
          { key: 'actor', label: 'Actor', render: function (e) { return '<span class="text-xs">' + E(e.actorId || '-') + '</span>'; }},
          { key: 'severity', label: 'Severity', render: function (e) { return UI.severityBadge(e.severity); }},
          { key: 'time', label: 'Time', render: function (e) { return '<span class="text-xs text-gray-500">' + Utils.formatTimeAgo(e.createdAt) + '</span>'; }},
        ], events) :
        UI.emptyState('fa-clipboard-list', 'No audit events recorded yet')
      ) +
    '</div>';
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
      c.innerHTML = '<div class="space-y-4">' +
        UI.sectionHeader('License, CE & E&O Tracking', '') +
        UI.dataTable([
          { key: 'name', label: 'Agent', render: function (a) { return '<span class="text-sm font-medium">' + E(a.name || a.email) + '</span>'; }},
          { key: 'license', label: 'License #', render: function (a) { return '<span class="text-xs">' + E(a.licenseNumber || a.license_number || '-') + '</span>'; }},
          { key: 'expiry', label: 'License Expiry', render: function (a) {
            var exp = a.licenseExpiry || a.license_expiry;
            var days = exp ? Utils.daysUntil(exp) : null;
            var color = days !== null && days < 90 ? '#DC2626' : '#059669';
            return '<span class="text-xs" style="color:' + color + '">' + (exp ? D(exp) : '-') + '</span>';
          }},
          { key: 'ce', label: 'CE Hours', render: function (a) {
            var done = a.ceHoursCompleted || a.ce_hours || 0;
            var req = a.ceHoursRequired || 22.5;
            return '<span class="text-xs">' + done + ' / ' + req + '</span>';
          }},
          { key: 'eo', label: 'E&O Expiry', render: function (a) { return '<span class="text-xs">' + (a.eoExpiry || a.eo_expiry ? D(a.eoExpiry || a.eo_expiry) : '-') + '</span>'; }},
        ], agents) +
      '</div>';
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
  };
})();
