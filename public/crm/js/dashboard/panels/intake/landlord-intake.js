// ═══════════════════════════════════════════════════════════════════════════════
// LANDLORD INTAKE FORM — Full CRUD, auto-save, entity ownership, multi-person
// Property disclosures, building requirements, lease terms, fee structure
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var LandlordIntake = (function () {
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
        'onclick="LandlordIntake._toggle(\'' + E(id) + '\')">' +
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
          { value: 'co-owner', label: 'Co-Owner' },
          { value: 'partner', label: 'Business Partner' },
          { value: 'property_manager', label: 'Property Manager' },
          { value: 'spouse', label: 'Spouse' },
          { value: 'parent', label: 'Parent' },
          { value: 'adult_child', label: 'Adult Child' },
        ]) +
      '</form>';

    CRM.openModal('Add Person', content, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="LandlordIntake._saveAddPerson(\'' + E(formId) + '\')"><i class="fas fa-plus mr-1"></i> Add</button>',
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="LandlordIntake._removePerson(\'' + E(formId) + '\')"><i class="fas fa-trash-alt"></i></button>' +
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="LandlordIntake._removeSig(\'' + E(formId) + '\',' + i + ')"><i class="fas fa-times"></i></button>' +
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
      '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="LandlordIntake._removeSig(\'' + E(formId) + '\',' + i + ')"><i class="fas fa-times"></i></button>';
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
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function render(client) {
    var c = client || {};
    var formId = 'landlord-intake';
    var signatories = c.authorized_signatories || [];
    var pd = c.property_disclosures || {};
    var lt = c.lease_terms || {};

    var html = '<form id="' + formId + '" data-client-id="' + E(String(c.id || '')) + '" autocomplete="off">';

    // ── Header ──
    html += '<div class="flex items-center justify-between mb-4">' +
      '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-key text-[#B8860B] mr-2"></i>Landlord Intake</h2>' +
      '<div class="flex items-center gap-3">' +
        '<span id="' + formId + '-save-status" class="text-xs font-semibold text-emerald-600">All changes saved</span>' +
        '<button type="button" class="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B8860B] hover:bg-[#996F0A] text-white text-xs font-bold rounded-lg shadow-sm transition-colors" ' +
          'onclick="LandlordIntake.save(\'' + E(String(c.id || '')) + '\')">' +
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
          'onclick="LandlordIntake._addPersonModal(\'' + formId + '\')">' +
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="LandlordIntake._removePerson(\'' + formId + '\')"><i class="fas fa-trash-alt"></i></button>' +
      '</div>';
    }
    contactHtml += '</div>' +
      '<div class="border-t border-gray-100 pt-3 mt-3">' +
        '<label class="block text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-building text-gray-400 mr-1"></i> Property Management Company</label>' +
        '<div class="grid grid-cols-2 gap-3">' +
          _input('mgmt_company_name', 'Management Company', c.mgmt_company_name || '', { placeholder: 'Company name' }) +
          _input('mgmt_company_phone', 'Company Phone', c.mgmt_company_phone || '', { type: 'tel', placeholder: '(212) 555-0100' }) +
        '</div>' +
      '</div>';
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
          'onclick="LandlordIntake._addSignatory(\'' + formId + '\')">' +
          '<i class="fas fa-plus"></i> Add Signatory</button>' +
      '</div>';
    html += _section(formId + '-entity', 'Entity Ownership', 'fa-building', entityHtml, !!(c.entity_name));

    // ── 3. Property ──
    var propHtml =
      _input('property_address', 'Property Address', c.property_address, { placeholder: '123 Main Street, New York, NY 10001' }) +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('unit_number', 'Unit(s)', c.unit_number, { placeholder: 'Apt 4A (or multiple: 4A, 4B, 5C)' }) +
        _select('building_type', 'Building Type', '', [
          { value: '', label: 'Select...' },
          { value: 'condo', label: 'Condo' },
          { value: 'coop', label: 'Co-op' },
          { value: 'condop', label: 'Condop' },
          { value: 'rental', label: 'Rental Building' },
          { value: 'townhouse', label: 'Townhouse' },
          { value: 'multi_family', label: 'Multi-Family' },
        ]) +
      '</div>' +
      _select('current_unit_status', 'Current Status', '', [
        { value: '', label: 'Select...' },
        { value: 'vacant', label: 'Vacant' },
        { value: 'rented', label: 'Currently Rented' },
        { value: 'relisting', label: 'Relisting (tenant moving out)' },
      ]) +
      _input('legal_ownership_name', 'Legal Owner Name', c.legal_ownership_name, { placeholder: 'Name on deed / LLC name' }) +
      _input('home_address', 'Owner Home Address', c.home_address, { placeholder: 'Owner\'s personal home address' });
    html += _section(formId + '-property', 'Property Details', 'fa-map-marker-alt', propHtml, true);

    // ── 4. Property Disclosures ──
    var discHtml =
      '<p class="text-xs text-gray-500 mb-3">NYC landlords must disclose the following to prospective tenants.</p>' +
      '<div class="space-y-2">' +
        _toggle_switch('disc_lead_paint', 'Lead-Based Paint (Pre-1978)', pd.lead_paint) +
        _toggle_switch('disc_bed_bugs', 'Bed Bug History (past year)', pd.bed_bugs) +
        _toggle_switch('disc_flooding', 'Flooding History', pd.flooding_history) +
        _toggle_switch('disc_violations', 'Building Violations (active)', pd.building_violations) +
        _toggle_switch('disc_mold', 'Mold Issues', pd.mold) +
      '</div>' +
      '<p class="text-xs text-gray-400 mt-3"><i class="fas fa-exclamation-triangle mr-1"></i> NYC Local Law 18: Bed bug disclosure is mandatory. Lead paint for pre-1978 buildings.</p>';
    html += _section(formId + '-disclosures', 'Property Disclosures', 'fa-exclamation-circle', discHtml, true);

    // ── 5. Building Requirements ──
    var bldgHtml =
      _textarea('board_approval_for_tenants', 'Board Approval for Tenants', c.board_approval_for_tenants || '', { placeholder: 'Board application process, fees, required documents for tenant approval...', rows: 2 }) +
      _textarea('move_in_rules', 'Move-In Rules', c.move_in_rules || '', { placeholder: 'Move-in deposit, elevator reservation, hours, insurance requirements...', rows: 2 }) +
      _input('move_in_fees', 'Move-In Fees', c.move_in_fees || '', { placeholder: 'e.g., $500 refundable deposit + $250 non-refundable' });
    html += _section(formId + '-building', 'Building Requirements', 'fa-city', bldgHtml, false);

    // ── 6. Lease Terms ──
    var leaseHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _select('lease_standard_length', 'Standard Lease Length', lt.standard_length || '', [
          { value: '', label: 'Select...' },
          { value: '1_year', label: '1 Year' },
          { value: '2_year', label: '2 Years' },
          { value: '6_month', label: '6 Months' },
          { value: 'month_to_month', label: 'Month-to-Month' },
          { value: 'flexible', label: 'Flexible' },
        ]) +
        _select('lease_pet_policy', 'Pet Policy', lt.pet_policy || '', [
          { value: '', label: 'Select...' },
          { value: 'no_pets', label: 'No Pets' },
          { value: 'cats_only', label: 'Cats Only' },
          { value: 'small_dogs', label: 'Small Dogs OK' },
          { value: 'dogs_ok', label: 'Dogs OK' },
          { value: 'all_pets', label: 'All Pets Welcome' },
          { value: 'case_by_case', label: 'Case by Case' },
        ]) +
      '</div>' +
      _textarea('lease_subletting_rules', 'Subletting Rules', lt.subletting_rules || '', { placeholder: 'Subletting policy, restrictions, fees...', rows: 2 }) +
      _textarea('lease_utilities_included', 'Utilities Included', lt.utilities_included || '', { placeholder: 'Heat, hot water, gas, electric, internet...', rows: 2 });
    html += _section(formId + '-lease', 'Lease Terms', 'fa-file-contract', leaseHtml, false);

    // ── 7. Fee Structure ──
    var feeHtml =
      _select('fee_structure', 'Broker Fee Structure', c.fee_structure || '', [
        { value: '', label: 'Select...' },
        { value: 'owner_pay', label: 'Owner Pays (OP)' },
        { value: 'tenant_pay', label: 'Tenant Pays (TP)' },
        { value: 'no_fee', label: 'No Fee' },
      ]) +
      '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i> UCBA 2026: Commission negotiability disclosure required in all listing/buyer agreements.</p>';
    html += _section(formId + '-fees', 'Fee Structure', 'fa-hand-holding-usd', feeHtml, true);

    // ── 8. Current Tenant Info ──
    var leaseStart = c.lease_start_date ? c.lease_start_date.substring(0, 10) : '';
    var leaseEnd = c.lease_end_date ? c.lease_end_date.substring(0, 10) : '';
    var tenantHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('lease_start_date', 'Lease Start Date', leaseStart, { type: 'date' }) +
        _input('lease_end_date', 'Lease End Date', leaseEnd, { type: 'date' }) +
      '</div>' +
      _select('renewal_likelihood', 'Renewal Likelihood', c.renewal_status || '', [
        { value: '', label: 'Unknown' },
        { value: 'renewing', label: 'Likely Renewing' },
        { value: 'not_renewing', label: 'Not Renewing' },
        { value: 'month_to_month', label: 'Month-to-Month' },
        { value: 'pending', label: 'Pending Decision' },
      ]) +
      '<p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i> Tracking current tenant lease helps plan relisting timeline.</p>';
    html += _section(formId + '-tenant', 'Current Tenant Information', 'fa-users', tenantHtml, !!(leaseEnd));

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
    var form = document.getElementById(formId || 'landlord-intake');
    if (!form) return {};
    var fd = new FormData(form);
    var data = {};

    // String fields
    var strFields = ['first_name', 'last_name', 'email', 'phone', 'property_address', 'unit_number',
      'legal_ownership_name', 'home_address', 'entity_name', 'entity_type', 'fee_structure',
      'building_type', 'current_unit_status', 'mgmt_company_name', 'mgmt_company_phone',
      'board_approval_for_tenants', 'move_in_rules', 'move_in_fees'];
    strFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v.trim() || null;
    });

    // Date fields
    var dateFields = ['lease_start_date', 'lease_end_date'];
    dateFields.forEach(function (f) {
      var v = fd.get(f);
      if (v) data[f] = v;
    });

    // Renewal likelihood maps to renewal_status
    var rl = fd.get('renewal_likelihood');
    if (rl !== null) data.renewal_status = rl || null;

    // Property disclosures (JSON)
    data.property_disclosures = {
      lead_paint: !!form.querySelector('input[name="disc_lead_paint"]:checked'),
      bed_bugs: !!form.querySelector('input[name="disc_bed_bugs"]:checked'),
      flooding_history: !!form.querySelector('input[name="disc_flooding"]:checked'),
      building_violations: !!form.querySelector('input[name="disc_violations"]:checked'),
      mold: !!form.querySelector('input[name="disc_mold"]:checked'),
    };

    // Lease terms (JSON)
    data.lease_terms = {
      standard_length: fd.get('lease_standard_length') || null,
      pet_policy: fd.get('lease_pet_policy') || null,
      subletting_rules: (fd.get('lease_subletting_rules') || '').trim() || null,
      utilities_included: (fd.get('lease_utilities_included') || '').trim() || null,
    };

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
    var formId = 'landlord-intake';
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
  };
})();
