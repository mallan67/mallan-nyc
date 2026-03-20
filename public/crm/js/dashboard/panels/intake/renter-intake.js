// ═══════════════════════════════════════════════════════════════════════════════
// RENTER / TENANT INTAKE FORM — Full CRUD, auto-save, multi-person, guarantor
// Building type preferences with fee explanations, docs readiness, search history
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var RenterIntake = (function () {
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
        'onclick="RenterIntake._toggle(\'' + E(id) + '\')">' +
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

  function _checkboxes(name, label, selected, options, note) {
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
    html += '</div>';
    if (note) html += '<p class="text-xs text-gray-400 mt-1">' + note + '</p>';
    html += '</div>';
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
          { value: 'roommate', label: 'Roommate' },
          { value: 'co-applicant', label: 'Co-Applicant' },
          { value: 'partner', label: 'Partner' },
          { value: 'spouse', label: 'Spouse' },
          { value: 'parent', label: 'Parent' },
          { value: 'adult_child', label: 'Adult Child' },
        ]) +
      '</form>';

    CRM.openModal('Add Person', content, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RenterIntake._saveAddPerson(\'' + E(formId) + '\')"><i class="fas fa-plus mr-1"></i> Add</button>',
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="RenterIntake._removePerson(\'' + E(formId) + '\')"><i class="fas fa-trash-alt"></i></button>' +
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

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function render(client) {
    var c = client || {};
    var formId = 'renter-intake';
    var prefs = c.preferences || {};
    var docsReady = c.docs_readiness || {};

    var html = '<form id="' + formId + '" data-client-id="' + E(String(c.id || '')) + '" autocomplete="off">';

    // ── Header ──
    html += '<div class="flex items-center justify-between mb-4">' +
      '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-door-open text-[#B8860B] mr-2"></i>Renter Intake</h2>' +
      '<div class="flex items-center gap-3">' +
        '<span id="' + formId + '-save-status" class="text-xs font-semibold text-emerald-600">All changes saved</span>' +
        '<button type="button" class="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B8860B] hover:bg-[#996F0A] text-white text-xs font-bold rounded-lg shadow-sm transition-colors" ' +
          'onclick="RenterIntake.save(\'' + E(String(c.id || '')) + '\')">' +
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
          'onclick="RenterIntake._addPersonModal(\'' + formId + '\')">' +
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
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs" onclick="RenterIntake._removePerson(\'' + formId + '\')"><i class="fas fa-trash-alt"></i></button>' +
      '</div>';
    }
    contactHtml += '</div>';

    // ── Guarantor sub-section ──
    contactHtml += '<div class="border-t border-gray-100 pt-3 mt-3">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-shield-alt text-gray-400 mr-1"></i> Guarantor Information</label>' +
      _toggle_switch('guarantor_needed', 'Guarantor Needed', c.guarantor_needed) +
      '<div id="' + formId + '-guarantor-fields" class="mt-2 space-y-2' + (c.guarantor_needed ? '' : ' hidden') + '">' +
        '<div class="grid grid-cols-2 gap-3">' +
          _input('guarantor_name', 'Guarantor Name', c.guarantor_name || '', { placeholder: 'Full name' }) +
          _input('guarantor_relationship', 'Relationship', c.guarantor_relationship || '', { placeholder: 'Parent, relative, etc.' }) +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          _input('guarantor_email', 'Guarantor Email', c.guarantor_email || '', { type: 'email', placeholder: 'guarantor@email.com' }) +
          _input('guarantor_phone', 'Guarantor Phone', c.guarantor_phone || '', { type: 'tel', placeholder: '(555) 555-5555' }) +
        '</div>' +
        '<p class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i> Most co-op boards require guarantor income of 80-100x monthly rent.</p>' +
      '</div>' +
    '</div>';
    html += _section(formId + '-contact', 'Contact Information', 'fa-address-card', contactHtml, true);

    // ── 2. Entity (Corporate Housing) ──
    var entityHtml =
      '<p class="text-xs text-gray-500 mb-3">For corporate housing / relocation — enter the company name and authorized contact.</p>' +
      '<div class="grid grid-cols-2 gap-3">' +
        _input('entity_name', 'Company Name', c.entity_name, { placeholder: 'Corporation or relocation company' }) +
        _input('authorized_contact', 'Authorized Contact', '', { placeholder: 'Name of authorized contact person' }) +
      '</div>';
    html += _section(formId + '-entity', 'Corporate Housing', 'fa-briefcase', entityHtml, !!(c.entity_name));

    // ── 3. Building Type Preference ──
    var buildingTypes = c.building_type_pref || prefs.property_types || [];
    var btHtml =
      _checkboxes('building_type_pref', 'Building Type Preference', buildingTypes, [
        { value: 'condo', label: 'Condo' },
        { value: 'coop', label: 'Co-op' },
        { value: 'condop', label: 'Condop' },
        { value: 'rental', label: 'Rental Building' },
      ]) +
      '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">' +
        '<p class="text-xs font-semibold text-amber-800 mb-1"><i class="fas fa-lightbulb mr-1"></i> Fee Differences by Building Type</p>' +
        '<ul class="text-xs text-amber-700 space-y-0.5 ml-4 list-disc">' +
          '<li><strong>Condo:</strong> Generally more flexible with board approval. Owner pays common charges + RE taxes.</li>' +
          '<li><strong>Co-op:</strong> Stricter board approval process. May require financial package, guarantor, interview. Maintenance includes taxes.</li>' +
          '<li><strong>Condop:</strong> Mix of condo/co-op. Rules vary by building — clarify board requirements.</li>' +
          '<li><strong>Rental Building:</strong> Simplest process. Management company approval. First month + security typical.</li>' +
        '</ul>' +
      '</div>';
    html += _section(formId + '-building', 'Building Type Preference', 'fa-building', btHtml, true);

    // ── 4. Areas ──
    var areasHtml = _input('areas', 'Preferred Areas / Neighborhoods', (prefs.neighborhoods || []).join(', '), { placeholder: 'Upper East Side, West Village, Williamsburg...' });
    html += _section(formId + '-areas', 'Preferred Areas', 'fa-map-marked-alt', areasHtml, true);

    // ── 5. Budget ──
    var budgetHtml =
      _input('rent_per_month', 'Maximum Monthly Rent', c.rent_per_month, { type: 'number', placeholder: '$0' }) +
      '<div class="grid grid-cols-2 gap-3 mt-2">' +
        '<div>' + _toggle_switch('exclusive_acceptable', 'Exclusive (broker fee) OK', c.exclusive_acceptable !== false) + '</div>' +
        '<div>' + _toggle_switch('no_fee_only', 'No-Fee Only', c.no_fee_only) + '</div>' +
      '</div>' +
      _input('move_in_cost_awareness', 'Move-In Cost Awareness', '', { placeholder: 'First month, security, broker fee, application fee...' }) +
      '<p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i> Typical move-in costs: first month rent + 1 month security + broker fee (if applicable).</p>';
    html += _section(formId + '-budget', 'Budget', 'fa-wallet', budgetHtml, true);

    // ── 6. Search Criteria ──
    var critHtml =
      '<div class="grid grid-cols-2 gap-3">' +
        _input('beds', 'Bedrooms (min)', prefs.min_beds, { type: 'number', placeholder: '0' }) +
        _input('baths', 'Bathrooms (min)', prefs.min_baths, { type: 'number', placeholder: '0' }) +
      '</div>' +
      _textarea('must_haves', 'Must-Haves', (prefs.must_haves || []).join('\n'), { placeholder: 'Laundry in unit, doorman, elevator, dishwasher...', rows: 3 }) +
      _textarea('deal_breakers', 'Deal Breakers', (prefs.deal_breakers || []).join('\n'), { placeholder: 'Walk-up above 3rd floor, no natural light, noisy street...', rows: 3 }) +
      _input('pet_situation', 'Pet Situation', c.pet_situation || '', { placeholder: 'e.g., 1 small dog (15 lbs), 2 cats, no pets' });
    html += _section(formId + '-criteria', 'Search Criteria', 'fa-search', critHtml, true);

    // ── 7. Documents Readiness ──
    var docsHtml =
      '<p class="text-xs text-gray-500 mb-3"><i class="fas fa-exclamation-triangle text-amber-500 mr-1"></i> <strong>Critical for co-op applications.</strong> Having documents ready speeds up the application process significantly.</p>' +
      '<div class="space-y-2">' +
        _toggle_switch('docs_pay_stubs', 'Pay Stubs (recent 2-3 months)', docsReady.pay_stubs) +
        _toggle_switch('docs_tax_returns', 'Tax Returns (2 years)', docsReady.tax_returns) +
        _toggle_switch('docs_bank_statements', 'Bank Statements (2-3 months)', docsReady.bank_statements) +
        _toggle_switch('docs_reference_letters', 'Reference Letters (personal + professional)', docsReady.reference_letters) +
        _toggle_switch('docs_employment_letter', 'Employment Verification Letter', docsReady.employment_letter) +
      '</div>';
    html += _section(formId + '-docs', 'Documents Readiness', 'fa-folder-open', docsHtml, true);

    // ── 8. Move-in Timeline ──
    var moveHtml = _input('move_in_timeline', 'Target Move-in Timeline', prefs.notes || '', { placeholder: 'ASAP, within 30 days, lease starts June 1...' });
    html += _section(formId + '-timeline', 'Move-in Timeline', 'fa-calendar-alt', moveHtml, false);

    // ── 9. Previous Search History ──
    var histHtml =
      _textarea('criteria_drift', 'Previous Search History / Criteria Drift', c.criteria_drift || '', {
        placeholder: 'Notes on how criteria has changed over time...\ne.g., "Started looking for 2BR in UES under $4K, now considering 1BR in Murray Hill under $3.5K"',
        rows: 4,
      }) +
      '<p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i> Tracking search evolution helps calibrate expectations and find the right fit faster.</p>';
    html += _section(formId + '-history', 'Previous Search History', 'fa-history', histHtml, false);

    // ── 10. Source ──
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

    setTimeout(function () {
      _attachAutoSave(formId, c.id);
      _attachGuarantorToggle(formId);
    }, 50);
    return html;
  }

  // ─── Guarantor toggle visibility ─────────────────────────────────────
  function _attachGuarantorToggle(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var checkbox = form.querySelector('input[name="guarantor_needed"]');
    var fields = document.getElementById(formId + '-guarantor-fields');
    if (!checkbox || !fields) return;
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        fields.classList.remove('hidden');
      } else {
        fields.classList.add('hidden');
      }
    });
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
    var form = document.getElementById(formId || 'renter-intake');
    if (!form) return {};
    var fd = new FormData(form);
    var data = {};

    // String fields
    var strFields = ['first_name', 'last_name', 'email', 'phone', 'source', 'entity_name',
      'authorized_contact', 'move_in_cost_awareness', 'pet_situation', 'move_in_timeline',
      'criteria_drift', 'guarantor_name', 'guarantor_email', 'guarantor_phone', 'guarantor_relationship'];
    strFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v.trim() || null;
    });

    // Numeric fields
    var numFields = ['rent_per_month'];
    numFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v ? Number(v) : null;
    });

    // Boolean toggles
    data.no_fee_only = !!form.querySelector('input[name="no_fee_only"]:checked');
    data.exclusive_acceptable = !!form.querySelector('input[name="exclusive_acceptable"]:checked');
    data.guarantor_needed = !!form.querySelector('input[name="guarantor_needed"]:checked');

    // Building type checkboxes
    var btChecked = form.querySelectorAll('input[name="building_type_pref"]:checked');
    var btArr = [];
    for (var i = 0; i < btChecked.length; i++) btArr.push(btChecked[i].value);
    data.building_type_pref = btArr;

    // Preferences object
    var prefs = {};
    var areasVal = fd.get('areas');
    if (areasVal) prefs.neighborhoods = areasVal.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
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

    // Documents readiness (JSON)
    data.docs_readiness = {
      pay_stubs: !!form.querySelector('input[name="docs_pay_stubs"]:checked'),
      tax_returns: !!form.querySelector('input[name="docs_tax_returns"]:checked'),
      bank_statements: !!form.querySelector('input[name="docs_bank_statements"]:checked'),
      reference_letters: !!form.querySelector('input[name="docs_reference_letters"]:checked'),
      employment_letter: !!form.querySelector('input[name="docs_employment_letter"]:checked'),
    };

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════════
  function save(clientId) {
    var formId = 'renter-intake';
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
  };
})();
