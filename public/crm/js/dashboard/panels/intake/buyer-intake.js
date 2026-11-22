// ═══════════════════════════════════════════════════════════════════════════════
// BUYER INTAKE FORM — Full CRUD, auto-save, entity ownership, multi-person
// Renders inside workspace client detail. Saves via PATCH /api/crm/clients/{id}
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var BuyerIntake = (function () {
  'use strict';

  var E = Utils.esc;

  // ─── Debounce helper ─────────────────────────────────────────────────
  var _timers = {};
  function _debounce(key, fn, ms) {
    if (_timers[key]) clearTimeout(_timers[key]);
    _timers[key] = setTimeout(fn, ms || 800);
  }

  // ─── Save indicator ──────────────────────────────────────────────────
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

  // ─── Collapsible Section Helper ──────────────────────────────────────
  function _section(id, title, icon, content, open) {
    var openClass = open !== false ? '' : ' hidden';
    var chevron = open !== false ? 'fa-chevron-up' : 'fa-chevron-down';
    return '<div class="mb-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">' +
      '<button type="button" class="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" ' +
        'onclick="BuyerIntake._toggle(\'' + E(id) + '\')">' +
        '<span class="flex items-center gap-2 text-sm font-bold text-gray-700">' +
          '<i class="fas ' + icon + ' text-[#B8860B]"></i> ' + E(title) +
        '</span>' +
        '<i id="' + E(id) + '-chevron" class="fas ' + chevron + ' text-gray-400 text-xs transition-transform"></i>' +
      '</button>' +
      '<div id="' + E(id) + '-body" class="px-5 py-4' + openClass + '">' + content + '</div>' +
    '</div>';
  }

  // ─── Toggle section collapse ─────────────────────────────────────────
  function _toggle(sectionId) {
    var body = document.getElementById(sectionId + '-body');
    var chevron = document.getElementById(sectionId + '-chevron');
    if (!body) return;
    if (body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-up'); }
    } else {
      body.classList.add('hidden');
      if (chevron) { chevron.classList.remove('fa-chevron-up'); chevron.classList.add('fa-chevron-down'); }
    }
  }

  // ─── Field helpers ───────────────────────────────────────────────────
  function _input(name, label, value, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    var ph = opts.placeholder || '';
    var cls = opts.cls || '';
    var extra = opts.readonly ? ' readonly' : '';
    return '<div class="form-group ' + cls + '">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<input class="form-input w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" ' +
        'name="' + E(name) + '" type="' + type + '" value="' + E(value || '') + '" placeholder="' + E(ph) + '"' + extra + '>' +
    '</div>';
  }

  function _textarea(name, label, value, opts) {
    opts = opts || {};
    var ph = opts.placeholder || '';
    var rows = opts.rows || 3;
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

  function _checkboxes(name, label, selected, options) {
    var html = '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-2">' + E(label) + '</label>' +
      '<div class="flex flex-wrap gap-3">';
    options.forEach(function (opt) {
      var val = typeof opt === 'string' ? opt : opt.value;
      var lbl = typeof opt === 'string' ? opt : opt.label;
      var chk = (selected || []).indexOf(val) !== -1 ? ' checked' : '';
      html += '<label class="inline-flex items-center gap-1.5 text-sm cursor-pointer">' +
        '<input type="checkbox" name="' + E(name) + '" value="' + E(val) + '"' + chk + ' class="accent-[#B8860B] rounded">' +
        ' ' + E(lbl) + '</label>';
    });
    html += '</div></div>';
    return html;
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
          { value: 'co-buyer', label: 'Co-Buyer' },
          { value: 'roommate', label: 'Roommate' },
          { value: 'co-owner', label: 'Co-Owner' },
          { value: 'parent', label: 'Parent' },
          { value: 'adult_child', label: 'Adult Child' },
        ]) +
      '</form>';

    CRM.openModal('Add Person', content, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="BuyerIntake._saveAddPerson(\'' + E(formId) + '\')"><i class="fas fa-plus mr-1"></i> Add</button>',
    });
  }

  function _saveAddPerson(formId) {
    var form = document.getElementById(formId + '-add-person-form');
    if (!form) return;
    var fd = new FormData(form);
    var personData = {
      first_name: (fd.get('person_first_name') || '').trim(),
      last_name: (fd.get('person_last_name') || '').trim(),
      email: (fd.get('person_email') || '').trim(),
      phone: (fd.get('person_phone') || '').trim(),
      relationship: fd.get('person_relationship') || '',
    };
    if (!personData.first_name && !personData.email) {
      CRM.toast('Name or email is required', 'warning');
      return;
    }

    // Read the clientId from the form
    var mainForm = document.getElementById(formId);
    if (!mainForm) return;
    var clientId = mainForm.getAttribute('data-client-id');
    if (!clientId) { CRM.toast('No client context', 'error'); return; }

    // Save as secondary person on Lead (first additional), or use FamilyMember
    var updateData = {
      secondary_first_name: personData.first_name,
      secondary_last_name: personData.last_name,
      secondary_email: personData.email,
      secondary_phone: personData.phone,
      secondary_relationship: personData.relationship,
    };

    MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(clientId), {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Person added', 'success');
      // Re-render person list
      _renderPersonList(formId, Object.assign({}, updateData, { id: 'secondary' }));
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed to add person'), 'error');
    });
  }

  // ─── Render person list in contact section ───────────────────────────
  function _renderPersonList(formId, secondary) {
    var container = document.getElementById(formId + '-persons');
    if (!container || !secondary) return;
    if (!secondary.secondary_first_name && !secondary.first_name) return;
    var fn = secondary.secondary_first_name || secondary.first_name || '';
    var ln = secondary.secondary_last_name || secondary.last_name || '';
    var rel = secondary.secondary_relationship || secondary.relationship || '';
    var em = secondary.secondary_email || secondary.email || '';
    var ph = secondary.secondary_phone || secondary.phone || '';

    container.innerHTML =
      '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-full bg-[#B8860B]/10 flex items-center justify-center"><i class="fas fa-user text-[#B8860B] text-xs"></i></div>' +
          '<div>' +
            '<div class="text-sm font-semibold text-gray-800">' + E(fn + ' ' + ln) + (rel ? ' <span class="text-xs text-gray-400">(' + E(rel) + ')</span>' : '') + '</div>' +
            '<div class="text-xs text-gray-500">' + E(em) + (ph ? ' &middot; ' + E(ph) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="BuyerIntake._removePerson(\'' + E(formId) + '\')" title="Remove"><i class="fas fa-trash-alt"></i></button>' +
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
        secondary_first_name: null,
        secondary_last_name: null,
        secondary_email: null,
        secondary_phone: null,
        secondary_relationship: null,
      }),
    }).then(function () {
      var container = document.getElementById(formId + '-persons');
      if (container) container.innerHTML = '';
      CRM.toast('Person removed', 'success');
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
    });
  }

  // ─── Entity signatories management ───────────────────────────────────
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0" onclick="BuyerIntake._removeSig(\'' + E(formId) + '\',' + i + ')" title="Remove"><i class="fas fa-times"></i></button>' +
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
      '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0" onclick="BuyerIntake._removeSig(\'' + E(formId) + '\',' + i + ')" title="Remove"><i class="fas fa-times"></i></button>';
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

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER — Full buyer intake form
  // ═══════════════════════════════════════════════════════════════════════
  function render(client) {
    var c = client || {};
    var formId = 'buyer-intake';
    var prefs = c.preferences || {};
    var signatories = c.authorized_signatories || [];

    var html = '<form id="' + formId + '" data-client-id="' + E(String(c.id || '')) + '" autocomplete="off">';

    // ── Header with save status ──
    html += '<div class="flex items-center justify-between mb-4">' +
      '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-user-tag text-[#B8860B] mr-2"></i>Buyer Intake</h2>' +
      '<div class="flex items-center gap-3">' +
        '<span id="' + formId + '-save-status" class="text-xs font-semibold text-emerald-600">All changes saved</span>' +
        '<button type="button" class="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B8860B] hover:bg-[#996F0A] text-white text-xs font-bold rounded-lg shadow-sm transition-colors" ' +
          'onclick="BuyerIntake.save(\'' + E(String(c.id || '')) + '\')">' +
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
          'onclick="BuyerIntake._addPersonModal(\'' + formId + '\')">' +
          '<i class="fas fa-user-plus"></i> Add Person</button>' +
      '</div>' +
      '<div id="' + formId + '-persons" class="mt-3 space-y-2">';
    // Render existing secondary person
    if (c.secondary_first_name) {
      contactHtml += '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-full bg-[#B8860B]/10 flex items-center justify-center"><i class="fas fa-user text-[#B8860B] text-xs"></i></div>' +
          '<div>' +
            '<div class="text-sm font-semibold text-gray-800">' + E((c.secondary_first_name || '') + ' ' + (c.secondary_last_name || '')) +
              (c.secondary_relationship ? ' <span class="text-xs text-gray-400">(' + E(c.secondary_relationship) + ')</span>' : '') + '</div>' +
            '<div class="text-xs text-gray-500">' + E(c.secondary_email || '') + (c.secondary_phone ? ' &middot; ' + E(c.secondary_phone) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="BuyerIntake._removePerson(\'' + formId + '\')" title="Remove"><i class="fas fa-trash-alt"></i></button>' +
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
        '<div id="' + formId + '-signatories">' +
          _renderSignatories(formId, signatories) +
        '</div>' +
        '<button type="button" class="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-semibold rounded-lg hover:border-[#B8860B] hover:text-[#B8860B] transition-colors mt-1" ' +
          'onclick="BuyerIntake._addSignatory(\'' + formId + '\')">' +
          '<i class="fas fa-plus"></i> Add Signatory</button>' +
      '</div>';
    html += _section(formId + '-entity', 'Entity Ownership', 'fa-building', entityHtml, !!(c.entity_name));

    // ── 3. Financial ──
    var finHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('annual_income', 'Annual Income', c.annual_income, { type: 'number', placeholder: '$0' }) +
        _input('bonuses', 'Annual Bonuses', c.bonuses, { type: 'number', placeholder: '$0' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _select('credit_score_range', 'Credit Score Range', c.credit_score_range || '', [
          { value: '', label: 'Unknown' },
          { value: 'Excellent (740+)', label: 'Excellent (740+)' },
          { value: 'Good (670-739)', label: 'Good (670-739)' },
          { value: 'Fair (580-669)', label: 'Fair (580-669)' },
          { value: 'Poor (below 580)', label: 'Poor (below 580)' },
        ]) +
        _input('down_payment', 'Down Payment', c.down_payment, { type: 'number', placeholder: '$0' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('available_funds', 'Available Funds / Liquid Assets', c.available_funds, { type: 'number', placeholder: '$0' }) +
        _input('monthly_debt', 'Monthly Debt Payments', c.monthly_debt, { type: 'number', placeholder: '$0' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('employer', 'Employer', c.employer, { placeholder: 'Company name' }) +
        _input('work_title', 'Work Title', c.work_title, { placeholder: 'Job title' }) +
      '</div>' +
      '<div class="border-t border-gray-100 pt-3 mt-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
          _toggle_switch('pre_approved', 'Mortgage Pre-Approved', c.pre_approved) +
          _input('pre_approved_amount', 'Pre-Approved Amount', c.pre_approved_amount, { type: 'number', placeholder: '$0' }) +
        '</div>' +
      '</div>' +
      '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-lock mr-1"></i> Financial data is private — never shared with the client.</p>';
    html += _section(formId + '-financial', 'Financial Qualification', 'fa-dollar-sign', finHtml, true);

    // ── 4. Search Criteria ──
    var buildingTypes = c.building_type_pref || prefs.property_types || [];
    var searchHtml =
      _checkboxes('building_type_pref', 'Building Type Preference', buildingTypes, [
        { value: 'condo', label: 'Condo' },
        { value: 'coop', label: 'Co-op' },
        { value: 'condop', label: 'Condop' },
      ]) +
      _input('areas', 'Preferred Areas / Neighborhoods', (prefs.neighborhoods || []).join(', '), { placeholder: 'Upper East Side, Tribeca, Park Slope...' }) +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('min_price', 'Min Price', prefs.min_price, { type: 'number', placeholder: '$0' }) +
        _input('max_price', 'Max Price', prefs.max_price, { type: 'number', placeholder: '$0' }) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('beds', 'Bedrooms (min)', prefs.min_beds, { type: 'number', placeholder: '0' }) +
        _input('baths', 'Bathrooms (min)', prefs.min_baths, { type: 'number', placeholder: '0' }) +
      '</div>' +
      _textarea('must_haves', 'Must-Haves', (prefs.must_haves || []).join('\n'), { placeholder: 'Doorman, laundry in unit, outdoor space...', rows: 3 }) +
      _textarea('deal_breakers', 'Deal Breakers', (prefs.deal_breakers || []).join('\n'), { placeholder: 'Walk-up, no natural light...', rows: 3 });
    html += _section(formId + '-search', 'Search Criteria', 'fa-search', searchHtml, true);

    // ── 5. Attorney ──
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

    // ── 6. Buyer Rep Agreement ──
    var bra = c.buyer_rep_agreement_date ? c.buyer_rep_agreement_date.substring(0, 10) : '';
    var braHtml =
      _toggle_switch('buyer_rep_agreement', 'Buyer Rep Agreement on File', c.buyer_rep_agreement) +
      '<div class="mt-2">' +
        _input('buyer_rep_agreement_date', 'Agreement Date', bra, { type: 'date' }) +
      '</div>' +
      '<p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i> UCBA E7 requires a buyer representation agreement.</p>';
    html += _section(formId + '-bra', 'Buyer Rep Agreement', 'fa-file-signature', braHtml, c.buyer_rep_agreement);

    // ── 7. Move-in Timeline ──
    var moveHtml = _input('move_in_timeline', 'Target Move-in Timeline', prefs.notes || '', { placeholder: 'e.g., Within 3 months, flexible, ASAP...' });
    html += _section(formId + '-timeline', 'Move-in Timeline', 'fa-calendar-alt', moveHtml, false);

    // ── 8. Source Tracking ──
    var srcHtml = _select('source', 'Lead Source', c.source || '', [
      { value: '', label: 'Select source...' },
      { value: 'website', label: 'Website (mallan.nyc)' },
      { value: 'referral', label: 'Referral' },
      { value: 'manual', label: 'Manual Entry' },
      { value: 'streetEasy', label: 'StreetEasy' },
      { value: 'zillow', label: 'Zillow' },
      { value: 'realtor.com', label: 'Realtor.com' },
    ]);
    html += _section(formId + '-source', 'Source Tracking', 'fa-route', srcHtml, false);

    html += '</form>';

    // After render, attach auto-save handlers
    setTimeout(function () { _attachAutoSave(formId, c.id); }, 50);

    return html;
  }

  // ─── Attach blur/change auto-save with debounce ──────────────────────
  function _attachAutoSave(formId, clientId) {
    var form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('input', function () {
      _markUnsaved(formId);
      _debounce(formId + '-autosave', function () {
        save(String(clientId));
      }, 1200);
    });

    form.addEventListener('change', function () {
      _markUnsaved(formId);
      _debounce(formId + '-autosave', function () {
        save(String(clientId));
      }, 600);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLLECT DATA — reads form DOM, returns data object
  // ═══════════════════════════════════════════════════════════════════════
  function collectData(formId) {
    var form = document.getElementById(formId || 'buyer-intake');
    if (!form) return {};
    var fd = new FormData(form);
    var data = {};

    // String fields
    var strFields = ['first_name', 'last_name', 'email', 'phone', 'employer', 'work_title',
      'credit_score_range', 'attorney_name', 'attorney_firm', 'attorney_email', 'attorney_phone',
      'entity_name', 'entity_type', 'source', 'move_in_timeline'];
    strFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v.trim() || null;
    });

    // Numeric fields
    var numFields = ['annual_income', 'bonuses', 'down_payment', 'available_funds', 'monthly_debt', 'pre_approved_amount'];
    numFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v ? Number(v) : null;
    });

    // Boolean toggles
    data.pre_approved = !!form.querySelector('input[name="pre_approved"]:checked');
    data.buyer_rep_agreement = !!form.querySelector('input[name="buyer_rep_agreement"]:checked');

    // Date
    var braDate = fd.get('buyer_rep_agreement_date');
    if (braDate) data.buyer_rep_agreement_date = braDate;

    // Building type checkboxes
    var btChecked = form.querySelectorAll('input[name="building_type_pref"]:checked');
    var btArr = [];
    for (var i = 0; i < btChecked.length; i++) btArr.push(btChecked[i].value);
    data.building_type_pref = btArr;

    // Preferences object for ClientPreference
    var prefs = {};
    var areasVal = fd.get('areas');
    if (areasVal) prefs.neighborhoods = areasVal.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var minP = fd.get('min_price');
    if (minP) prefs.min_price = Number(minP);
    var maxP = fd.get('max_price');
    if (maxP) prefs.max_price = Number(maxP);
    var beds = fd.get('beds');
    if (beds) prefs.min_beds = Number(beds);
    var baths = fd.get('baths');
    if (baths) prefs.min_baths = Number(baths);
    var mh = fd.get('must_haves');
    if (mh) prefs.must_haves = mh.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var db = fd.get('deal_breakers');
    if (db) prefs.deal_breakers = db.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    prefs.property_types = btArr;
    var timeline = fd.get('move_in_timeline');
    if (timeline) prefs.notes = timeline.trim();
    data.preferences = prefs;

    // Authorized signatories
    var sigs = [];
    var sigEls = form.querySelectorAll('[data-sig-idx]');
    for (var s = 0; s < sigEls.length; s++) {
      var idx = sigEls[s].getAttribute('data-sig-idx');
      var sigName = (fd.get('sig_name_' + idx) || '').trim();
      var sigTitle = (fd.get('sig_title_' + idx) || '').trim();
      var sigEmail = (fd.get('sig_email_' + idx) || '').trim();
      var sigPhone = (fd.get('sig_phone_' + idx) || '').trim();
      if (sigName || sigEmail) {
        sigs.push({ name: sigName, title: sigTitle, email: sigEmail, phone: sigPhone });
      }
    }
    if (sigs.length > 0) data.authorized_signatories = sigs;

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE — collects data and PATCHes to API
  // ═══════════════════════════════════════════════════════════════════════
  function save(clientId) {
    var formId = 'buyer-intake';
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

  // ─── Public API ──────────────────────────────────────────────────────
  return {
    render: render,
    collectData: collectData,
    save: save,
    // Exposed for onclick handlers
    _toggle: _toggle,
    _addPersonModal: _addPersonModal,
    _saveAddPerson: _saveAddPerson,
    _removePerson: _removePerson,
    _addSignatory: _addSignatory,
    _removeSig: _removeSig,
  };
})();
