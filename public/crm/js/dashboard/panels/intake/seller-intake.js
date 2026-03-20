// ═══════════════════════════════════════════════════════════════════════════════
// SELLER INTAKE FORM — Full CRUD, auto-save, entity ownership, multi-person
// Home prep checklist, marketing strategy, disclosures, document collection
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var SellerIntake = (function () {
  'use strict';

  var E = Utils.esc;

  // ─── Debounce / Save status ──────────────────────────────────────────
  var _timers = {};
  function _debounce(key, fn, ms) {
    if (_timers[key]) clearTimeout(_timers[key]);
    _timers[key] = setTimeout(fn, ms || 800);
  }
  function _markUnsaved(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'Unsaved changes'; el.className = 'text-xs font-semibold text-amber-500'; }
  }
  function _markSaved(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'All changes saved'; el.className = 'text-xs font-semibold text-emerald-600'; }
  }
  function _markSaving(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'Saving...'; el.className = 'text-xs font-semibold text-gray-400'; }
  }

  // ─── Collapsible section ─────────────────────────────────────────────
  function _section(id, title, icon, content, open) {
    var openClass = open !== false ? '' : ' hidden';
    var chevron = open !== false ? 'fa-chevron-up' : 'fa-chevron-down';
    return '<div class="mb-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">' +
      '<button type="button" class="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" ' +
        'onclick="SellerIntake._toggle(\'' + E(id) + '\')">' +
        '<span class="flex items-center gap-2 text-sm font-bold text-gray-700">' +
          '<i class="fas ' + icon + ' text-[#B8860B]"></i> ' + E(title) +
        '</span>' +
        '<i id="' + E(id) + '-chevron" class="fas ' + chevron + ' text-gray-400 text-xs transition-transform"></i>' +
      '</button>' +
      '<div id="' + E(id) + '-body" class="px-5 py-4' + openClass + '">' + content + '</div>' +
    '</div>';
  }

  function _toggle(sectionId) {
    var body = document.getElementById(sectionId + '-body');
    var chevron = document.getElementById(sectionId + '-chevron');
    if (!body) return;
    body.classList.toggle('hidden');
    if (chevron) {
      chevron.classList.toggle('fa-chevron-down');
      chevron.classList.toggle('fa-chevron-up');
    }
  }

  // ─── Field helpers ───────────────────────────────────────────────────
  function _input(name, label, value, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    var ph = opts.placeholder || '';
    return '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<input class="form-input w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" ' +
        'name="' + E(name) + '" type="' + type + '" value="' + E(value || '') + '" placeholder="' + E(ph) + '">' +
    '</div>';
  }

  function _textarea(name, label, value, opts) {
    opts = opts || {};
    var rows = opts.rows || 3;
    var ph = opts.placeholder || '';
    return '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<textarea class="form-input w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" ' +
        'name="' + E(name) + '" rows="' + rows + '" placeholder="' + E(ph) + '">' + E(value || '') + '</textarea>' +
    '</div>';
  }

  function _select(name, label, value, options) {
    var html = '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<select class="form-input form-select w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" name="' + E(name) + '">';
    options.forEach(function (opt) {
      var val = typeof opt === 'string' ? opt : opt.value;
      var lbl = typeof opt === 'string' ? opt : opt.label;
      var sel = (value || '') === val ? ' selected' : '';
      html += '<option value="' + E(val) + '"' + sel + '>' + E(lbl) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function _toggle_switch(name, label, checked) {
    var checkedAttr = checked ? ' checked' : '';
    return '<div class="form-group flex items-center gap-3">' +
      '<label class="relative inline-flex items-center cursor-pointer">' +
        '<input type="checkbox" class="sr-only peer" name="' + E(name) + '"' + checkedAttr + '>' +
        '<div class="w-9 h-5 bg-gray-300 peer-checked:bg-[#B8860B] rounded-full transition-colors after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>' +
      '</label>' +
      '<span class="text-xs font-semibold text-gray-700">' + E(label) + '</span>' +
    '</div>';
  }

  // ─── Add Person modal ────────────────────────────────────────────────
  function _addPersonModal(formId) {
    var content =
      '<form id="' + formId + '-add-person-form" class="space-y-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
          _input('person_first_name', 'First Name', '', { placeholder: 'First name' }) +
          _input('person_last_name', 'Last Name', '', { placeholder: 'Last name' }) +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          _input('person_email', 'Email', '', { type: 'email', placeholder: 'email@example.com' }) +
          _input('person_phone', 'Phone', '', { type: 'tel', placeholder: '(555) 555-5555' }) +
        '</div>' +
        _select('person_relationship', 'Relationship', '', [
          { value: '', label: 'Select relationship...' },
          { value: 'spouse', label: 'Spouse' },
          { value: 'partner', label: 'Partner' },
          { value: 'co-owner', label: 'Co-Owner' },
          { value: 'parent', label: 'Parent' },
          { value: 'adult_child', label: 'Adult Child' },
        ]) +
      '</form>';

    CRM.openModal('Add Person', content, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="SellerIntake._saveAddPerson(\'' + E(formId) + '\')"><i class="fas fa-plus mr-1"></i> Add</button>',
    });
  }

  function _saveAddPerson(formId) {
    var form = document.getElementById(formId + '-add-person-form');
    if (!form) return;
    var fd = new FormData(form);
    var mainForm = document.getElementById(formId);
    if (!mainForm) return;
    var clientId = mainForm.getAttribute('data-client-id');
    if (!clientId) { CRM.toast('No client context', 'error'); return; }

    var updateData = {
      secondary_first_name: (fd.get('person_first_name') || '').trim() || null,
      secondary_last_name: (fd.get('person_last_name') || '').trim() || null,
      secondary_email: (fd.get('person_email') || '').trim() || null,
      secondary_phone: (fd.get('person_phone') || '').trim() || null,
      secondary_relationship: fd.get('person_relationship') || null,
    };
    if (!updateData.secondary_first_name && !updateData.secondary_email) {
      CRM.toast('Name or email is required', 'warning'); return;
    }

    MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(clientId), {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Person added', 'success');
      _refreshPersonList(formId, updateData);
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
    });
  }

  function _refreshPersonList(formId, sec) {
    var container = document.getElementById(formId + '-persons');
    if (!container || !sec) return;
    var fn = sec.secondary_first_name || '';
    var ln = sec.secondary_last_name || '';
    var rel = sec.secondary_relationship || '';
    container.innerHTML =
      '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-full bg-[#B8860B]/10 flex items-center justify-center"><i class="fas fa-user text-[#B8860B] text-xs"></i></div>' +
          '<div><div class="text-sm font-semibold text-gray-800">' + E(fn + ' ' + ln) + (rel ? ' <span class="text-xs text-gray-400">(' + E(rel) + ')</span>' : '') + '</div>' +
            '<div class="text-xs text-gray-500">' + E(sec.secondary_email || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="SellerIntake._removePerson(\'' + E(formId) + '\')"><i class="fas fa-trash-alt"></i></button>' +
      '</div>';
  }

  function _removePerson(formId) {
    var mainForm = document.getElementById(formId);
    if (!mainForm) return;
    var clientId = mainForm.getAttribute('data-client-id');
    if (!clientId) return;
    MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(clientId), {
      method: 'PATCH',
      body: JSON.stringify({
        secondary_first_name: null, secondary_last_name: null,
        secondary_email: null, secondary_phone: null, secondary_relationship: null,
      }),
    }).then(function () {
      var container = document.getElementById(formId + '-persons');
      if (container) container.innerHTML = '';
      CRM.toast('Person removed', 'success');
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Failed'), 'error'); });
  }

  // ─── Signatory management ────────────────────────────────────────────
  function _renderSignatories(formId, signatories) {
    var list = signatories || [];
    var html = '';
    list.forEach(function (s, i) {
      html += '<div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100 mb-2" data-sig-idx="' + i + '">' +
        '<div class="flex-1 grid grid-cols-4 gap-2">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_name_' + i + '" value="' + E(s.name || '') + '" placeholder="Name">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_title_' + i + '" value="' + E(s.title || '') + '" placeholder="Title">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_email_' + i + '" value="' + E(s.email || '') + '" placeholder="Email">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_phone_' + i + '" value="' + E(s.phone || '') + '" placeholder="Phone">' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="SellerIntake._removeSig(\'' + E(formId) + '\',' + i + ')"><i class="fas fa-times"></i></button>' +
      '</div>';
    });
    return html;
  }

  function _addSignatory(formId) {
    var container = document.getElementById(formId + '-signatories');
    if (!container) return;
    var count = container.querySelectorAll('[data-sig-idx]').length;
    var i = count;
    var row = document.createElement('div');
    row.className = 'flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100 mb-2';
    row.setAttribute('data-sig-idx', i);
    row.innerHTML =
      '<div class="flex-1 grid grid-cols-4 gap-2">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_name_' + i + '" placeholder="Name">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_title_' + i + '" placeholder="Title">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_email_' + i + '" placeholder="Email">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1" name="sig_phone_' + i + '" placeholder="Phone">' +
      '</div>' +
      '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="SellerIntake._removeSig(\'' + E(formId) + '\',' + i + ')"><i class="fas fa-times"></i></button>';
    container.appendChild(row);
    _markUnsaved(formId);
  }

  function _removeSig(formId, idx) {
    var container = document.getElementById(formId + '-signatories');
    if (!container) return;
    var el = container.querySelector('[data-sig-idx="' + idx + '"]');
    if (el) el.remove();
    _markUnsaved(formId);
  }

  // ─── Home Prep Checklist management ──────────────────────────────────
  function _renderPrepChecklist(formId, items) {
    var list = items || [];
    var html = '';
    list.forEach(function (item, i) {
      html += '<div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100 mb-2" data-prep-idx="' + i + '">' +
        '<div class="flex-1 grid grid-cols-3 gap-2">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_item_' + i + '" value="' + E(item.item || '') + '" placeholder="Item name">' +
          '<select class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_status_' + i + '">' +
            '<option value="pending"' + (item.status === 'pending' ? ' selected' : '') + '>Pending</option>' +
            '<option value="in_progress"' + (item.status === 'in_progress' ? ' selected' : '') + '>In Progress</option>' +
            '<option value="done"' + (item.status === 'done' ? ' selected' : '') + '>Done</option>' +
          '</select>' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_notes_' + i + '" value="' + E(item.notes || '') + '" placeholder="Notes">' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0" onclick="SellerIntake._removePrepItem(\'' + E(formId) + '\',' + i + ')" title="Remove"><i class="fas fa-times"></i></button>' +
      '</div>';
    });
    return html;
  }

  function _addPrepItem(formId) {
    var container = document.getElementById(formId + '-prep-items');
    if (!container) return;
    var count = container.querySelectorAll('[data-prep-idx]').length;
    var i = count;
    var row = document.createElement('div');
    row.className = 'flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100 mb-2';
    row.setAttribute('data-prep-idx', i);
    row.innerHTML =
      '<div class="flex-1 grid grid-cols-3 gap-2">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_item_' + i + '" placeholder="Item name">' +
        '<select class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_status_' + i + '">' +
          '<option value="pending">Pending</option>' +
          '<option value="in_progress">In Progress</option>' +
          '<option value="done">Done</option>' +
        '</select>' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="prep_notes_' + i + '" placeholder="Notes">' +
      '</div>' +
      '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0" onclick="SellerIntake._removePrepItem(\'' + E(formId) + '\',' + i + ')"><i class="fas fa-times"></i></button>';
    container.appendChild(row);
    _markUnsaved(formId);
  }

  function _removePrepItem(formId, idx) {
    var container = document.getElementById(formId + '-prep-items');
    if (!container) return;
    var el = container.querySelector('[data-prep-idx="' + idx + '"]');
    if (el) el.remove();
    _markUnsaved(formId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function render(client) {
    var c = client || {};
    var formId = 'seller-intake';
    var signatories = c.authorized_signatories || [];
    var bmr = c.building_mgmt_requirements || {};
    var prep = c.home_prep_checklist || [];
    var mktg = c.marketing_strategy || {};
    var disc = c.disclosures || {};
    var docs = c.documents_collected || {};

    var html = '<form id="' + formId + '" data-client-id="' + E(String(c.id || '')) + '" autocomplete="off">';

    // ── Header ──
    html += '<div class="flex items-center justify-between mb-4">' +
      '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-home text-[#B8860B] mr-2"></i>Seller Intake</h2>' +
      '<div class="flex items-center gap-3">' +
        '<span id="' + formId + '-save-status" class="text-xs font-semibold text-emerald-600">All changes saved</span>' +
        '<button type="button" class="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B8860B] hover:bg-[#996F0A] text-white text-xs font-bold rounded-lg shadow-sm transition-colors" ' +
          'onclick="SellerIntake.save(\'' + E(String(c.id || '')) + '\')">' +
          '<i class="fas fa-save"></i> Save All</button>' +
      '</div>' +
    '</div>';

    // ── 1. Contact ──
    var contactHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('first_name', 'First Name', c.first_name, { placeholder: 'First name' }) +
        _input('last_name', 'Last Name', c.last_name, { placeholder: 'Last name' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('email', 'Email', c.email, { type: 'email', placeholder: 'email@example.com' }) +
        _input('phone', 'Phone', c.phone, { type: 'tel', placeholder: '(646) 555-0100' }) +
      '</div>' +
      '<div class="mt-3">' +
        '<button type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[#B8860B] text-[#B8860B] text-xs font-semibold rounded-lg hover:bg-[#B8860B]/5 transition-colors" ' +
          'onclick="SellerIntake._addPersonModal(\'' + formId + '\')">' +
          '<i class="fas fa-user-plus"></i> Add Person</button>' +
      '</div>' +
      '<div id="' + formId + '-persons" class="mt-3 space-y-2">';
    if (c.secondary_first_name) {
      contactHtml += '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-full bg-[#B8860B]/10 flex items-center justify-center"><i class="fas fa-user text-[#B8860B] text-xs"></i></div>' +
          '<div><div class="text-sm font-semibold text-gray-800">' + E((c.secondary_first_name || '') + ' ' + (c.secondary_last_name || '')) +
            (c.secondary_relationship ? ' <span class="text-xs text-gray-400">(' + E(c.secondary_relationship) + ')</span>' : '') + '</div>' +
            '<div class="text-xs text-gray-500">' + E(c.secondary_email || '') + (c.secondary_phone ? ' &middot; ' + E(c.secondary_phone) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="SellerIntake._removePerson(\'' + formId + '\')"><i class="fas fa-trash-alt"></i></button>' +
      '</div>';
    }
    contactHtml += '</div>';
    html += _section(formId + '-contact', 'Contact Information', 'fa-address-card', contactHtml, true);

    // ── 2. Entity Ownership ──
    var entityHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('entity_name', 'Entity Name', c.entity_name, { placeholder: 'LLC, Trust, or Corporation name' }) +
        _select('entity_type', 'Entity Type', c.entity_type || '', [
          { value: '', label: 'Individual (no entity)' },
          { value: 'llc', label: 'LLC' },
          { value: 'trust', label: 'Trust' },
          { value: 'corp', label: 'Corporation' },
          { value: 'inc', label: 'Inc.' },
        ]) +
      '</div>' +
      '<div class="mt-3">' +
        '<label class="block text-xs font-semibold text-gray-700 mb-2">Authorized Signatories</label>' +
        '<div id="' + formId + '-signatories">' + _renderSignatories(formId, signatories) + '</div>' +
        '<button type="button" class="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-semibold rounded-lg hover:border-[#B8860B] hover:text-[#B8860B] transition-colors mt-1" ' +
          'onclick="SellerIntake._addSignatory(\'' + formId + '\')">' +
          '<i class="fas fa-plus"></i> Add Signatory</button>' +
      '</div>';
    html += _section(formId + '-entity', 'Entity Ownership', 'fa-building', entityHtml, !!(c.entity_name));

    // ── 3. Attorney ──
    var attHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('attorney_name', 'Attorney Name', c.attorney_name, { placeholder: 'Full name' }) +
        _input('attorney_firm', 'Firm', c.attorney_firm, { placeholder: 'Firm name' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('attorney_email', 'Attorney Email', c.attorney_email, { type: 'email', placeholder: 'attorney@firm.com' }) +
        _input('attorney_phone', 'Attorney Phone', c.attorney_phone, { type: 'tel', placeholder: '(212) 555-0100' }) +
      '</div>';
    html += _section(formId + '-attorney', 'Attorney', 'fa-gavel', attHtml, !!(c.attorney_name));

    // ── 4. Property ──
    var propHtml =
      _input('property_address', 'Property Address', c.property_address, { placeholder: '123 Main Street, New York, NY 10001' }) +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('unit_number', 'Unit Number', c.unit_number, { placeholder: 'Apt 4A' }) +
        _select('building_type', 'Building Type', '', [
          { value: '', label: 'Select...' },
          { value: 'condo', label: 'Condo' },
          { value: 'coop', label: 'Co-op' },
          { value: 'condop', label: 'Condop' },
          { value: 'townhouse', label: 'Townhouse' },
          { value: 'single_family', label: 'Single Family' },
          { value: 'multi_family', label: 'Multi-Family' },
        ]) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _select('ownership_type', 'Ownership Type', '', [
          { value: '', label: 'Select...' },
          { value: 'individual', label: 'Individual' },
          { value: 'joint', label: 'Joint Ownership' },
          { value: 'llc', label: 'LLC' },
          { value: 'trust', label: 'Trust' },
          { value: 'estate', label: 'Estate' },
        ]) +
        _input('legal_ownership_name', 'Legal Owner Name', c.legal_ownership_name, { placeholder: 'Name on deed' }) +
      '</div>';
    html += _section(formId + '-property', 'Property Details', 'fa-map-marker-alt', propHtml, true);

    // ── 5. Building Management ──
    var bldgHtml =
      _textarea('board_approval_process', 'Board Approval Process', bmr.board_approval_process, { placeholder: 'Describe the board approval process, timeline, requirements...', rows: 2 }) +
      _textarea('move_out_rules', 'Move-Out Rules', bmr.move_out_rules, { placeholder: 'Notice period, elevator reservation, move-out deposit...', rows: 2 }) +
      _input('flip_tax', 'Flip Tax', bmr.flip_tax, { placeholder: 'e.g., 2% of sale price paid by seller' }) +
      _textarea('sublet_policy', 'Sublet Policy', bmr.sublet_policy, { placeholder: 'Sublet rules if applicable...', rows: 2 }) +
      _textarea('required_docs_for_sale', 'Required Documents for Sale', bmr.required_docs_for_sale, { placeholder: 'Board application, financials, reference letters...', rows: 2 });
    html += _section(formId + '-bldg', 'Building Management Requirements', 'fa-city', bldgHtml, false);

    // ── 6. Financial ──
    var finHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('outstanding_liens', 'Outstanding Liens', c.outstanding_liens, { type: 'number', placeholder: '$0' }) +
        _input('mortgage_balance', 'Mortgage Balance', c.mortgage_balance, { type: 'number', placeholder: '$0' }) +
      '</div>' +
      _input('expected_net_proceeds', 'Expected Net Proceeds', c.expected_net_proceeds, { type: 'number', placeholder: '$0' }) +
      '<p class="text-xs text-gray-400 mt-1"><i class="fas fa-lock mr-1"></i> Financial data is private.</p>';
    html += _section(formId + '-financial', 'Financial', 'fa-dollar-sign', finHtml, false);

    // ── 7. Home Prep Checklist ──
    var prepHtml =
      '<p class="text-xs text-gray-500 mb-3">Track preparation tasks before listing goes live.</p>' +
      '<div id="' + formId + '-prep-items">' + _renderPrepChecklist(formId, prep) + '</div>' +
      '<button type="button" class="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-[#B8860B] text-[#B8860B] text-xs font-semibold rounded-lg hover:bg-[#B8860B]/5 transition-colors mt-1" ' +
        'onclick="SellerIntake._addPrepItem(\'' + formId + '\')">' +
        '<i class="fas fa-plus"></i> Add Item</button>';
    html += _section(formId + '-prep', 'Home Prep Checklist', 'fa-clipboard-check', prepHtml, prep.length > 0);

    // ── 8. Marketing Strategy ──
    var mktgHtml =
      '<div class="grid grid-cols-3 gap-3">' +
        _select('mktg_photo_shoot', 'Photo Shoot', mktg.photo_shoot || '', [
          { value: '', label: 'Not Started' },
          { value: 'not_started', label: 'Not Started' },
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'done', label: 'Done' },
        ]) +
        _select('mktg_staging', 'Staging', mktg.staging || '', [
          { value: '', label: 'Not Started' },
          { value: 'not_started', label: 'Not Started' },
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'done', label: 'Done' },
        ]) +
        _select('mktg_description', 'Description', mktg.description || '', [
          { value: '', label: 'Pending' },
          { value: 'pending', label: 'Pending' },
          { value: 'drafted', label: 'Drafted' },
          { value: 'approved', label: 'Approved' },
        ]) +
      '</div>' +
      _textarea('mktg_syndication_plan', 'Syndication Plan', mktg.syndication_plan, { placeholder: 'StreetEasy, Zillow, Realtor.com, social media, broker open house...', rows: 2 });
    html += _section(formId + '-marketing', 'Marketing Strategy', 'fa-bullhorn', mktgHtml, false);

    // ── 9. Disclosures ──
    var discHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _select('disc_property_condition', 'Property Condition Disclosure', disc.property_condition_disclosure || '', [
          { value: '', label: 'Not Provided' },
          { value: 'provided', label: 'Provided to Buyer' },
          { value: 'credit_in_lieu', label: '$500 Credit in Lieu' },
          { value: 'waived', label: 'Waived' },
        ]) +
        _select('disc_lead_paint', 'Lead Paint Disclosure', disc.lead_paint || '', [
          { value: '', label: 'Unknown' },
          { value: 'no_knowledge', label: 'No Known Lead Paint' },
          { value: 'known_present', label: 'Known Lead Paint' },
          { value: 'pre_1978', label: 'Pre-1978 (Disclosure Required)' },
        ]) +
      '</div>' +
      _textarea('disc_building_specific', 'Building-Specific Disclosures', disc.building_specific, { placeholder: 'Any building-specific issues: assessments, planned work, violations...', rows: 2 });
    html += _section(formId + '-disclosures', 'Disclosures', 'fa-file-alt', discHtml, false);

    // ── 10. Documents Collection ──
    var docHtml =
      '<p class="text-xs text-gray-500 mb-3">Track collected documents for the listing.</p>' +
      '<div class="space-y-2">' +
        _toggle_switch('doc_deed', 'Deed', docs.deed) +
        _toggle_switch('doc_mortgage_payoff', 'Mortgage Payoff Letter', docs.mortgage_payoff_letter) +
        _toggle_switch('doc_board_docs', 'Board / HOA Documents', docs.board_docs) +
        _toggle_switch('doc_tax_returns', 'Tax Returns (2 years)', docs.tax_returns_2yr) +
        _toggle_switch('doc_financials', 'Co-op / Condo Financials', docs.coop_condo_financials) +
      '</div>';
    html += _section(formId + '-documents', 'Documents Collection', 'fa-folder-open', docHtml, false);

    // ── 11. CMA / Pricing ──
    var cmaHtml =
      _input('target_price', 'Target Listing Price', c.target_price, { type: 'number', placeholder: '$0' }) +
      _textarea('comparable_analysis', 'Comparable Analysis', c.comparable_analysis, { placeholder: 'Comparable sales, price per sqft, market conditions...', rows: 3 }) +
      _textarea('pricing_strategy_notes', 'Pricing Strategy Notes', c.pricing_strategy_notes, { placeholder: 'Pricing approach, underpricing vs aspirational, timeline...', rows: 3 });
    html += _section(formId + '-cma', 'CMA / Pricing Strategy', 'fa-chart-bar', cmaHtml, false);

    html += '</form>';

    setTimeout(function () { _attachAutoSave(formId, c.id); }, 50);
    return html;
  }

  // ─── Auto-save ───────────────────────────────────────────────────────
  function _attachAutoSave(formId, clientId) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('input', function () {
      _markUnsaved(formId);
      _debounce(formId + '-autosave', function () { save(String(clientId)); }, 1200);
    });
    form.addEventListener('change', function () {
      _markUnsaved(formId);
      _debounce(formId + '-autosave', function () { save(String(clientId)); }, 600);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLLECT DATA
  // ═══════════════════════════════════════════════════════════════════════
  function collectData(formId) {
    var form = document.getElementById(formId || 'seller-intake');
    if (!form) return {};
    var fd = new FormData(form);
    var data = {};

    // String fields
    var strFields = ['first_name', 'last_name', 'email', 'phone', 'property_address', 'unit_number',
      'legal_ownership_name', 'attorney_name', 'attorney_firm', 'attorney_email', 'attorney_phone',
      'entity_name', 'entity_type', 'building_type', 'ownership_type'];
    strFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v.trim() || null;
    });

    // Numeric fields
    var numFields = ['outstanding_liens', 'mortgage_balance', 'expected_net_proceeds', 'target_price'];
    numFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v ? Number(v) : null;
    });

    // Building management requirements (JSON)
    data.building_mgmt_requirements = {
      board_approval_process: (fd.get('board_approval_process') || '').trim() || null,
      move_out_rules: (fd.get('move_out_rules') || '').trim() || null,
      flip_tax: (fd.get('flip_tax') || '').trim() || null,
      sublet_policy: (fd.get('sublet_policy') || '').trim() || null,
      required_docs_for_sale: (fd.get('required_docs_for_sale') || '').trim() || null,
    };

    // Home prep checklist (JSON array)
    var prepItems = [];
    var prepEls = form.querySelectorAll('[data-prep-idx]');
    for (var p = 0; p < prepEls.length; p++) {
      var pi = prepEls[p].getAttribute('data-prep-idx');
      var itemName = (fd.get('prep_item_' + pi) || '').trim();
      if (itemName) {
        prepItems.push({
          item: itemName,
          status: fd.get('prep_status_' + pi) || 'pending',
          notes: (fd.get('prep_notes_' + pi) || '').trim() || null,
        });
      }
    }
    data.home_prep_checklist = prepItems;

    // Marketing strategy (JSON)
    data.marketing_strategy = {
      photo_shoot: fd.get('mktg_photo_shoot') || null,
      staging: fd.get('mktg_staging') || null,
      description: fd.get('mktg_description') || null,
      syndication_plan: (fd.get('mktg_syndication_plan') || '').trim() || null,
    };

    // Disclosures (JSON)
    data.disclosures = {
      property_condition_disclosure: fd.get('disc_property_condition') || null,
      lead_paint: fd.get('disc_lead_paint') || null,
      building_specific: (fd.get('disc_building_specific') || '').trim() || null,
    };

    // Documents collected (JSON)
    data.documents_collected = {
      deed: !!form.querySelector('input[name="doc_deed"]:checked'),
      mortgage_payoff_letter: !!form.querySelector('input[name="doc_mortgage_payoff"]:checked'),
      board_docs: !!form.querySelector('input[name="doc_board_docs"]:checked'),
      tax_returns_2yr: !!form.querySelector('input[name="doc_tax_returns"]:checked'),
      coop_condo_financials: !!form.querySelector('input[name="doc_financials"]:checked'),
    };

    // CMA fields
    var ca = (fd.get('comparable_analysis') || '').trim();
    if (ca) data.comparable_analysis = ca;
    var psn = (fd.get('pricing_strategy_notes') || '').trim();
    if (psn) data.pricing_strategy_notes = psn;

    // Signatories
    var sigs = [];
    var sigEls = form.querySelectorAll('[data-sig-idx]');
    for (var s = 0; s < sigEls.length; s++) {
      var idx = sigEls[s].getAttribute('data-sig-idx');
      var sigName = (fd.get('sig_name_' + idx) || '').trim();
      var sigEmail = (fd.get('sig_email_' + idx) || '').trim();
      if (sigName || sigEmail) {
        sigs.push({
          name: sigName,
          title: (fd.get('sig_title_' + idx) || '').trim(),
          email: sigEmail,
          phone: (fd.get('sig_phone_' + idx) || '').trim(),
        });
      }
    }
    if (sigs.length > 0) data.authorized_signatories = sigs;

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════════
  function save(clientId) {
    var formId = 'seller-intake';
    if (!clientId) {
      var form = document.getElementById(formId);
      if (form) clientId = form.getAttribute('data-client-id');
    }
    if (!clientId) { CRM.toast('No client ID', 'error'); return Promise.reject(new Error('No client ID')); }

    _markSaving(formId);
    var data = collectData(formId);

    return MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(clientId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(function (res) {
      _markSaved(formId);
      return res;
    }).catch(function (err) {
      _markUnsaved(formId);
      CRM.toast('Save failed: ' + (err.message || 'Unknown error'), 'error');
      return Promise.reject(err);
    });
  }

  return {
    render: render,
    collectData: collectData,
    save: save,
    _toggle: _toggle,
    _addPersonModal: _addPersonModal,
    _saveAddPerson: _saveAddPerson,
    _removePerson: _removePerson,
    _addSignatory: _addSignatory,
    _removeSig: _removeSig,
    _addPrepItem: _addPrepItem,
    _removePrepItem: _removePrepItem,
  };
})();
