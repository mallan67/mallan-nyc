// ═══════════════════════════════════════════════════════════════════════════════
// PARTIES PANEL — All parties on a transaction
//
// Shared component used by ALL workspace types:
// Buyer, Seller, Renter, Landlord, Investor
//
// Supports: co-buyers, spouses, partners, guarantors, LLC/Trust/Corp members,
// trustees, family members, observers.
// Each party has: signing authority, deed/lease/board appearance flags,
// entity info (if buying under LLC/Trust/Corp), financial qualification fields.
//
// API: GET/POST/PUT/DELETE /api/crm/leads/[id]/parties
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM, MallanAPI */

var PartiesPanel = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  // ── Role display config ────────────────────────────────────────────────────
  var ROLES = {
    co_buyer:              { label: 'Co-Buyer',              color: '#3B82F6', bg: '#EFF6FF' },
    co_renter:             { label: 'Co-Renter',             color: '#8B5CF6', bg: '#F5F3FF' },
    co_seller:             { label: 'Co-Seller',             color: '#059669', bg: '#ECFDF5' },
    co_owner:              { label: 'Co-Owner',              color: '#0891B2', bg: '#ECFEFF' },
    spouse:                { label: 'Spouse',                color: '#EC4899', bg: '#FDF2F8' },
    partner:               { label: 'Partner',               color: '#D97706', bg: '#FFFBEB' },
    parent:                { label: 'Parent',                color: '#6B7280', bg: '#F9FAFB' },
    child:                 { label: 'Child/Adult Child',     color: '#6B7280', bg: '#F9FAFB' },
    family_member:         { label: 'Family Member',         color: '#6B7280', bg: '#F9FAFB' },
    guarantor:             { label: 'Guarantor',             color: '#DC2626', bg: '#FEF2F2' },
    co_signer:             { label: 'Co-Signer',             color: '#B45309', bg: '#FFFBEB' },
    authorized_signatory:  { label: 'Authorized Signatory',  color: '#7C3AED', bg: '#F5F3FF' },
    trustee:               { label: 'Trustee',               color: '#0F766E', bg: '#F0FDFA' },
    managing_member:       { label: 'Managing Member (LLC)', color: '#1D4ED8', bg: '#EFF6FF' },
    llc_member:            { label: 'LLC Member',            color: '#1D4ED8', bg: '#EFF6FF' },
    corporate_officer:     { label: 'Corporate Officer',     color: '#1D4ED8', bg: '#EFF6FF' },
    observer:              { label: 'Observer',              color: '#9CA3AF', bg: '#F9FAFB' },
  };

  var ENTITY_TYPES = {
    llc:  'LLC',
    trust: 'Trust',
    corp: 'Corporation',
    inc:  'Inc.',
    lp:   'Limited Partnership',
    lllp: 'LLLP',
  };

  var SIGNING_CAPACITIES = {
    individually:              'Individually',
    as_trustee:                'As Trustee',
    as_managing_member:        'As Managing Member',
    as_authorized_signatory:   'As Authorized Signatory',
    as_guarantor:              'As Guarantor',
    as_corporate_officer:      'As Corporate Officer',
  };

  // ── Role badge ─────────────────────────────────────────────────────────────
  function _roleBadge(role) {
    var r = ROLES[role] || { label: role, color: '#6B7280', bg: '#F9FAFB' };
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;' +
      'background:' + r.bg + ';color:' + r.color + ';">' + E(r.label) + '</span>';
  }

  // ── Render the parties panel ───────────────────────────────────────────────
  function render(el, leadId, opts) {
    opts = opts || {};
    el.innerHTML = '<div class="flex items-center justify-center py-6"><i class="fas fa-spinner fa-spin text-gold text-xl"></i></div>';

    MallanAPI._fetch('/api/crm/leads/' + leadId + '/parties')
      .then(function (data) {
        _renderParties(el, leadId, data.parties || [], opts);
      })
      .catch(function (err) {
        el.innerHTML = '<p class="text-xs text-red-500 p-4">Failed to load parties: ' + E(err.message || '') + '</p>';
      });
  }

  function _renderParties(el, leadId, parties, opts) {
    var roleLabel = opts.roleLabel || 'Client';
    var h = '<div class="space-y-4">';

    // Header
    h += '<div class="flex items-center justify-between">';
    h += '<div>';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-users text-gold mr-2"></i>All Parties on Transaction</h3>';
    h += '<p class="text-xs text-gray-400 mt-0.5">Everyone who appears on the contract, deed, lease, or board application</p>';
    h += '</div>';
    h += '<button class="btn btn-sm btn-gold" onclick="PartiesPanel.openAddModal(\'' + leadId + '\')">' +
      '<i class="fas fa-plus mr-1"></i>Add Party</button>';
    h += '</div>';

    if (parties.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">';
      h += '<i class="fas fa-users text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-500">No additional parties added yet</p>';
      h += '<p class="text-xs text-gray-400 mt-1">Add co-buyers, spouses, guarantors, LLC members, trustees...</p>';
      h += '</div>';
    } else {
      h += '<div class="space-y-3">';
      parties.forEach(function (p) {
        h += _partyCard(p, leadId);
      });
      h += '</div>';
    }

    // Entity purchase section
    h += '<div class="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">';
    h += '<div class="flex items-center justify-between mb-3">';
    h += '<div class="flex items-center gap-2">';
    h += '<i class="fas fa-building text-purple-600"></i>';
    h += '<h4 class="text-sm font-bold text-gray-900">Entity Purchase</h4>';
    h += '<span class="text-[10px] text-purple-600 font-medium">LLC / Trust / Corp / Inc</span>';
    h += '</div>';
    h += '<button class="btn btn-xs btn-outline text-purple-600 border-purple-300" onclick="PartiesPanel.openEntityModal(\'' + leadId + '\')">';
    h += '<i class="fas fa-edit mr-1"></i>Configure</button>';
    h += '</div>';
    h += '<p class="text-xs text-gray-500">If purchasing under a company name, configure the entity here. ';
    h += 'Add the managing member, trustee, or authorized officer as a party above.</p>';
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;
  }

  function _partyCard(p, leadId) {
    var name = E(p.first_name + ' ' + p.last_name);
    var flags = [];
    if (p.signs_documents) flags.push('<span class="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">Signs</span>');
    if (p.appears_on_deed) flags.push('<span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">Deed</span>');
    if (p.appears_on_lease) flags.push('<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold">Lease</span>');
    if (p.appears_on_board) flags.push('<span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">Board</span>');

    var h = '<div class="bg-white border border-gray-200 rounded-xl p-4 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-start justify-between gap-4">';

    // Avatar + name
    h += '<div class="flex items-center gap-3 min-w-0">';
    var initials = (p.first_name[0] + p.last_name[0]).toUpperCase();
    h += '<div style="width:36px;height:36px;border-radius:50%;background:#B8860B15;color:#B8860B;' +
      'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">' + E(initials) + '</div>';
    h += '<div class="min-w-0">';
    h += '<div class="font-semibold text-gray-900 text-sm">' + name + '</div>';
    h += '<div class="flex items-center gap-1.5 mt-0.5 flex-wrap">';
    h += _roleBadge(p.role);
    if (p.is_entity && p.entity_type) {
      h += '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#F3E8FF;color:#7C3AED;">' +
        E(ENTITY_TYPES[p.entity_type] || p.entity_type) + ': ' + E(p.entity_name || '') + '</span>';
    }
    if (p.signing_capacity) {
      h += '<span class="text-[10px] text-gray-400">' + E(SIGNING_CAPACITIES[p.signing_capacity] || p.signing_capacity) + '</span>';
    }
    h += '</div>';
    if (flags.length > 0) {
      h += '<div class="flex items-center gap-1 mt-1.5">' + flags.join('') + '</div>';
    }
    h += '</div></div>';

    // Contact + actions
    h += '<div class="flex items-start gap-3 flex-shrink-0">';
    h += '<div class="text-right text-xs text-gray-500">';
    if (p.email) h += '<div><i class="fas fa-envelope mr-1 text-gray-300"></i>' + E(p.email) + '</div>';
    if (p.phone) h += '<div><i class="fas fa-phone mr-1 text-gray-300"></i>' + E(p.phone) + '</div>';
    h += '</div>';
    h += '<div class="flex gap-1">';
    h += '<button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" ' +
      'onclick="PartiesPanel.editParty(\'' + leadId + '\',\'' + E(p.id) + '\')" title="Edit"><i class="fas fa-edit text-xs"></i></button>';
    h += '<button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" ' +
      'onclick="PartiesPanel.removeParty(\'' + leadId + '\',\'' + E(p.id) + '\',\'' + E(p.first_name + ' ' + p.last_name) + '\')" title="Remove">' +
      '<i class="fas fa-times text-xs"></i></button>';
    h += '</div></div></div>';

    // Financial info (for co-buyers and guarantors)
    if (p.annual_income || p.credit_score_range || p.employer) {
      h += '<div class="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">';
      if (p.employer) h += '<span><i class="fas fa-briefcase mr-1 text-gray-300"></i>' + E(p.employer) + (p.work_title ? ' · ' + E(p.work_title) : '') + '</span>';
      if (p.annual_income) h += '<span><i class="fas fa-dollar-sign mr-1 text-gray-300"></i>' + $(Number(p.annual_income)) + '/yr</span>';
      if (p.credit_score_range) h += '<span><i class="fas fa-star mr-1 text-gray-300"></i>Credit: ' + E(p.credit_score_range) + '</span>';
      h += '</div>';
    }
    if (p.notes) {
      h += '<div class="mt-2 text-xs text-gray-500 italic">' + E(p.notes) + '</div>';
    }
    h += '</div>';
    return h;
  }

  // ── Add Party Modal ────────────────────────────────────────────────────────
  var _currentLeadId = null;
  var _editingPartyId = null;

  function openAddModal(leadId) {
    _currentLeadId = leadId;
    _editingPartyId = null;
    _openPartyModal(null);
  }

  function editParty(leadId, partyId) {
    _currentLeadId = leadId;
    _editingPartyId = partyId;
    MallanAPI._fetch('/api/crm/leads/' + leadId + '/parties')
      .then(function (data) {
        var party = (data.parties || []).find(function (p) { return p.id === partyId; });
        _openPartyModal(party);
      })
      .catch(function (err) { CRM.toast('Failed to load party: ' + (err.message || ''), 'error'); });
  }

  function _openPartyModal(party) {
    var existing = document.getElementById('partiesModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'partiesModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4';
    modal.onclick = function (e) { if (e.target === modal) _closePartyModal(); };

    var isEdit = Boolean(party);
    var p = party || {};

    var roleOptions = Object.keys(ROLES).map(function (k) {
      return '<option value="' + k + '"' + (p.role === k ? ' selected' : '') + '>' + ROLES[k].label + '</option>';
    }).join('');

    var entityTypeOptions = Object.keys(ENTITY_TYPES).map(function (k) {
      return '<option value="' + k + '"' + (p.entity_type === k ? ' selected' : '') + '>' + ENTITY_TYPES[k] + '</option>';
    }).join('');

    var signingOptions = '<option value="">None</option>' + Object.keys(SIGNING_CAPACITIES).map(function (k) {
      return '<option value="' + k + '"' + (p.signing_capacity === k ? ' selected' : '') + '>' + SIGNING_CAPACITIES[k] + '</option>';
    }).join('');

    var creditOptions = ['excellent (750+)', 'good (700-749)', 'fair (650-699)', 'poor (<650)'].map(function (v) {
      return '<option value="' + v + '"' + (p.credit_score_range === v ? ' selected' : '') + '>' + v + '</option>';
    }).join('');

    modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">' +
      '<div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">' +
        '<h3 class="text-base font-bold text-gray-900">' + (isEdit ? 'Edit Party' : 'Add Party to Transaction') + '</h3>' +
        '<button onclick="PartiesPanel._closePartyModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times text-lg"></i></button>' +
      '</div>' +
      '<form id="partyForm" class="p-6 space-y-5">' +

        // Name + role
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">First Name *</label>' +
            '<input id="pf-first" type="text" value="' + E(p.first_name || '') + '" required class="w-full border rounded-lg px-3 py-2 text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Last Name *</label>' +
            '<input id="pf-last" type="text" value="' + E(p.last_name || '') + '" required class="w-full border rounded-lg px-3 py-2 text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Role *</label>' +
            '<select id="pf-role" required class="w-full border rounded-lg px-3 py-2 text-sm">' + roleOptions + '</select>' +
          '</div>' +
        '</div>' +

        // Contact
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Email</label>' +
            '<input id="pf-email" type="email" value="' + E(p.email || '') + '" class="w-full border rounded-lg px-3 py-2 text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Phone</label>' +
            '<input id="pf-phone" type="tel" value="' + E(p.phone || '') + '" class="w-full border rounded-lg px-3 py-2 text-sm">' +
          '</div>' +
        '</div>' +

        // Signing authority
        '<div class="p-4 bg-blue-50 border border-blue-200 rounded-xl">' +
          '<div class="text-xs font-bold text-blue-700 mb-3">Signing Authority</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Signing Capacity</label>' +
              '<select id="pf-signing" class="w-full border rounded-lg px-3 py-2 text-sm">' + signingOptions + '</select>' +
            '</div>' +
            '<div class="space-y-2 pt-5">' +
              _checkbox('pf-signs-docs', 'Signs documents / contracts', p.signs_documents) +
              _checkbox('pf-on-deed', 'Appears on deed / title', p.appears_on_deed) +
              _checkbox('pf-on-lease', 'Appears on lease', p.appears_on_lease) +
              _checkbox('pf-on-board', 'On board application', p.appears_on_board) +
            '</div>' +
          '</div>' +
        '</div>' +

        // Entity purchase
        '<div class="p-4 bg-purple-50 border border-purple-200 rounded-xl">' +
          '<label class="flex items-center gap-2 cursor-pointer mb-3">' +
            '<input type="checkbox" id="pf-is-entity" ' + (p.is_entity ? 'checked' : '') + ' onchange="PartiesPanel._toggleEntityFields()" class="rounded">' +
            '<span class="text-xs font-bold text-purple-700">Buying as Entity (LLC / Trust / Corp / Inc)</span>' +
          '</label>' +
          '<div id="pf-entity-fields" class="grid grid-cols-1 sm:grid-cols-2 gap-3" style="display:' + (p.is_entity ? 'grid' : 'none') + '">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Entity Type</label>' +
              '<select id="pf-entity-type" class="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select type</option>' + entityTypeOptions + '</select>' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Entity Name</label>' +
              '<input id="pf-entity-name" type="text" value="' + E(p.entity_name || '') + '" placeholder="e.g. 123 Main LLC" class="w-full border rounded-lg px-3 py-2 text-sm">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">EIN / Tax ID</label>' +
              '<input id="pf-entity-ein" type="text" value="' + E(p.entity_ein || '') + '" placeholder="XX-XXXXXXX" class="w-full border rounded-lg px-3 py-2 text-sm">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">State of Formation</label>' +
              '<input id="pf-entity-state" type="text" value="' + E(p.entity_state || '') + '" placeholder="NY, DE, etc." class="w-full border rounded-lg px-3 py-2 text-sm">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Financial (for co-buyers/guarantors)
        '<div class="p-4 bg-green-50 border border-green-200 rounded-xl">' +
          '<div class="text-xs font-bold text-green-700 mb-3">Financial Qualification (co-buyers &amp; guarantors)</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Annual Income</label>' +
              '<input id="pf-income" type="number" value="' + E(p.annual_income || '') + '" placeholder="0" class="w-full border rounded-lg px-3 py-2 text-sm">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Credit Score Range</label>' +
              '<select id="pf-credit" class="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select</option>' + creditOptions + '</select>' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Employer / Work Title</label>' +
              '<input id="pf-employer" type="text" value="' + E((p.employer || '') + (p.work_title ? ' / ' + p.work_title : '')) + '" placeholder="Company / Title" class="w-full border rounded-lg px-3 py-2 text-sm">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<label class="block text-xs font-semibold text-gray-700 mb-1">Notes</label>' +
          '<textarea id="pf-notes" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Any notes about this party...">' + E(p.notes || '') + '</textarea>' +
        '</div>' +

      '</form>' +
      '<div class="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3">' +
        '<button onclick="PartiesPanel._closePartyModal()" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>' +
        '<button onclick="PartiesPanel._submitParty()" class="px-6 py-2 bg-gold text-white rounded-lg text-sm font-semibold hover:bg-gold/90">' +
          (isEdit ? 'Save Changes' : 'Add Party') +
        '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
  }

  function _checkbox(id, label, checked) {
    return '<label class="flex items-center gap-2 cursor-pointer text-xs">' +
      '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' class="rounded border-gray-300">' +
      '<span class="text-gray-700">' + E(label) + '</span>' +
    '</label>';
  }

  function _toggleEntityFields() {
    var cb = document.getElementById('pf-is-entity');
    var fields = document.getElementById('pf-entity-fields');
    if (fields) fields.style.display = (cb && cb.checked) ? 'grid' : 'none';
  }

  function _closePartyModal() {
    var modal = document.getElementById('partiesModal');
    if (modal) modal.remove();
  }

  function _gv(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function _gc(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function _submitParty() {
    var body = {
      first_name:        _gv('pf-first'),
      last_name:         _gv('pf-last'),
      role:              _gv('pf-role'),
      email:             _gv('pf-email') || null,
      phone:             _gv('pf-phone') || null,
      signing_capacity:  _gv('pf-signing') || null,
      signs_documents:   _gc('pf-signs-docs'),
      appears_on_deed:   _gc('pf-on-deed'),
      appears_on_lease:  _gc('pf-on-lease'),
      appears_on_board:  _gc('pf-on-board'),
      is_entity:         _gc('pf-is-entity'),
      entity_type:       _gv('pf-entity-type') || null,
      entity_name:       _gv('pf-entity-name') || null,
      entity_ein:        _gv('pf-entity-ein') || null,
      entity_state:      _gv('pf-entity-state') || null,
      annual_income:     _gv('pf-income') ? Number(_gv('pf-income')) : null,
      credit_score_range: _gv('pf-credit') || null,
      notes:             _gv('pf-notes') || null,
    };

    // Parse employer / work_title from combined field
    var empField = _gv('pf-employer');
    if (empField.includes('/')) {
      var parts = empField.split('/');
      body.employer = parts[0].trim();
      body.work_title = parts.slice(1).join('/').trim();
    } else {
      body.employer = empField || null;
      body.work_title = null;
    }

    if (!body.first_name || !body.last_name || !body.role) {
      CRM.toast('First name, last name, and role are required', 'warning');
      return;
    }

    var url = '/api/crm/leads/' + _currentLeadId + '/parties';
    var method = _editingPartyId ? 'PUT' : 'POST';
    if (_editingPartyId) url += '?party_id=' + _editingPartyId;

    MallanAPI._fetch(url, { method: method, body: JSON.stringify(body) })
      .then(function () {
        _closePartyModal();
        CRM.toast(_editingPartyId ? 'Party updated' : 'Party added', 'success');
        // Re-render the parties panel
        var panelEl = document.getElementById('parties-panel-content');
        if (panelEl && _currentLeadId) PartiesPanel.render(panelEl, _currentLeadId);
      })
      .catch(function (err) {
        CRM.toast('Failed: ' + (err.message || ''), 'error');
      });
  }

  // Entity modal (for Lead-level entity config, separate from party-level entity)
  function openEntityModal(leadId) {
    CRM.toast('Entity configuration — edit via the client intake form', 'info');
  }

  function removeParty(leadId, partyId, name) {
    if (!confirm('Remove ' + name + ' from this transaction?')) return;
    MallanAPI._fetch('/api/crm/leads/' + leadId + '/parties?party_id=' + partyId, { method: 'DELETE' })
      .then(function () {
        CRM.toast('Removed', 'success');
        var panelEl = document.getElementById('parties-panel-content');
        if (panelEl) PartiesPanel.render(panelEl, leadId);
      })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  return {
    render: render,
    openAddModal: openAddModal,
    editParty: editParty,
    removeParty: removeParty,
    openEntityModal: openEntityModal,
    _closePartyModal: _closePartyModal,
    _toggleEntityFields: _toggleEntityFields,
    _submitParty: _submitParty,
  };

})();
