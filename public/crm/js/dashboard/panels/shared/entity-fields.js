// =================================================================================
// SHARED -- Entity Fields
// Entity ownership + multi-person form components.
// Provides: entity form, signatory rows, add-person modal, data collectors.
// =================================================================================
/* global Utils, CRM */

var EntityFields = (function () {
  'use strict';

  var E = Utils.esc;

  // Entity type dropdown options
  var ENTITY_TYPES = ['Individual', 'LLC', 'Trust', 'Corp', 'Inc'];

  // Signatory title options
  var SIGNATORY_TITLES = [
    'Managing Member', 'Member', 'Trustee', 'President', 'Vice President',
    'Secretary', 'Treasurer', 'Executor', 'Director', 'Authorized Agent',
    'General Partner', 'Officer',
  ];

  // Relationship dropdown options
  var RELATIONSHIPS = [
    'spouse', 'partner', 'co-buyer', 'roommate', 'co-owner',
    'parent', 'adult_child', 'executor',
  ];

  // ---------------------------------------------------------------------------
  // 1. renderEntityForm(client) -- entity name + type + signatories
  // ---------------------------------------------------------------------------
  function renderEntityForm(client) {
    var cl = client || {};
    var sigs = cl.authorized_signatories || [];

    var html = '<div id="ef" class="space-y-4 p-4">';

    // Entity name
    html += '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">Entity Name</label>' +
      '<input id="ef_entity_name" type="text" value="' + E(cl.entity_name || '') + '" ' +
        'placeholder="e.g. 123 Main Street LLC" ' +
        'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
    '</div>';

    // Entity type
    html += '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">Entity Type</label>' +
      '<select id="ef_entity_type" ' +
        'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
        '<option value="">Select type...</option>';
    ENTITY_TYPES.forEach(function (t) {
      var sel = (cl.entity_type || '').toLowerCase() === t.toLowerCase() ? ' selected' : '';
      html += '<option value="' + E(t) + '"' + sel + '>' + E(t) + '</option>';
    });
    html += '</select></div>';

    // Legal ownership name
    html += '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">Legal Ownership Name</label>' +
      '<input id="ef_legal_ownership" type="text" value="' + E(cl.legal_ownership_name || '') + '" ' +
        'placeholder="Name as it appears on deed / formation docs" ' +
        'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
    '</div>';

    // Authorized signatories
    html += '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-2">Authorized Signatories</label>' +
      '<div id="ef_signatories" class="space-y-3">';

    if (sigs.length === 0) {
      html += '<p class="text-xs text-gray-400 text-center py-2">No signatories -- click Add below</p>';
    } else {
      sigs.forEach(function (sig, idx) {
        html += renderSignatoryRow(sig, idx);
      });
    }

    html += '</div>' +
      '<button type="button" class="btn btn-sm btn-outline mt-2" onclick="EntityFields._addSignatoryRow()">' +
        '<i class="fas fa-plus mr-1"></i>Add Signatory' +
      '</button>' +
    '</div>';

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // 2. renderSignatoryRow(sig, index) -- one signatory row
  // ---------------------------------------------------------------------------
  function renderSignatoryRow(sig, index) {
    sig = sig || {};
    var idx = index != null ? index : 0;
    var prefix = 'sig_';

    var html = '<div class="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2" data-sig-index="' + idx + '">';

    // Row 1: Name + Title
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Name</label>' +
        '<input id="' + prefix + 'name_' + idx + '" type="text" value="' + E(sig.name || '') + '" ' +
          'placeholder="Full name" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none bg-white">' +
      '</div>' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Title</label>' +
        '<select id="' + prefix + 'title_' + idx + '" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none bg-white">' +
          '<option value="">Select title...</option>';
    SIGNATORY_TITLES.forEach(function (t) {
      var sel = (sig.title || '') === t ? ' selected' : '';
      html += '<option value="' + E(t) + '"' + sel + '>' + E(t) + '</option>';
    });
    html += '</select></div></div>';

    // Row 2: Email + Phone + Remove
    html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Email</label>' +
        '<input id="' + prefix + 'email_' + idx + '" type="email" value="' + E(sig.email || '') + '" ' +
          'placeholder="email@example.com" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none bg-white">' +
      '</div>' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label>' +
        '<input id="' + prefix + 'phone_' + idx + '" type="tel" value="' + E(sig.phone || '') + '" ' +
          'placeholder="(555) 123-4567" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none bg-white">' +
      '</div>' +
      '<div class="flex items-end">' +
        '<button type="button" class="btn btn-sm btn-outline text-red-500 hover:bg-red-50 w-full" ' +
          'onclick="EntityFields._removeSignatoryRow(this,' + idx + ')">' +
          '<i class="fas fa-trash-alt mr-1"></i>Remove' +
        '</button>' +
      '</div>' +
    '</div>';

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // 3. renderAddPersonModal(leadId, existing) -- add/edit family member form
  // ---------------------------------------------------------------------------
  function renderAddPersonModal(leadId, existing) {
    var m = existing || {};
    var isEdit = !!m.first_name;

    var html = '<div id="ap" class="space-y-4 p-4">';

    // Row 1: First + Last name
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">First Name <span class="text-red-400">*</span></label>' +
        '<input id="ap_first_name" type="text" value="' + E(m.first_name || '') + '" ' +
          'placeholder="First name" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
      '</div>' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Last Name</label>' +
        '<input id="ap_last_name" type="text" value="' + E(m.last_name || '') + '" ' +
          'placeholder="Last name" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
      '</div>' +
    '</div>';

    // Row 2: Email + Phone
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Email</label>' +
        '<input id="ap_email" type="email" value="' + E(m.email || '') + '" ' +
          'placeholder="email@example.com" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
      '</div>' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label>' +
        '<input id="ap_phone" type="tel" value="' + E(m.phone || '') + '" ' +
          'placeholder="(555) 123-4567" ' +
          'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
      '</div>' +
    '</div>';

    // Row 3: Relationship
    html += '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">Relationship</label>' +
      '<select id="ap_relationship" ' +
        'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
        '<option value="">Select relationship...</option>';
    RELATIONSHIPS.forEach(function (r) {
      var display = r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ');
      var sel = (m.relationship || '') === r ? ' selected' : '';
      html += '<option value="' + E(r) + '"' + sel + '>' + E(display) + '</option>';
    });
    html += '</select></div>';

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // 4. collectEntityData(formId) -- read entity form from DOM
  // ---------------------------------------------------------------------------
  function collectEntityData(formId) {
    var prefix = formId || 'ef';
    var data = {
      entity_name: _val(prefix + '_entity_name'),
      entity_type: _val(prefix + '_entity_type'),
      legal_ownership_name: _val(prefix + '_legal_ownership'),
      authorized_signatories: [],
    };

    // Collect all signatory rows
    var container = document.getElementById(prefix + '_signatories');
    if (container) {
      var rows = container.querySelectorAll('[data-sig-index]');
      for (var i = 0; i < rows.length; i++) {
        var idx = rows[i].getAttribute('data-sig-index');
        var name = _val('sig_name_' + idx);
        if (!name) continue; // skip empty rows
        data.authorized_signatories.push({
          name: name,
          title: _val('sig_title_' + idx),
          email: _val('sig_email_' + idx),
          phone: _val('sig_phone_' + idx),
        });
      }
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // 5. collectPersonData(formId) -- read add-person form from DOM
  // ---------------------------------------------------------------------------
  function collectPersonData(formId) {
    var prefix = formId || 'ap';
    return {
      first_name: _val(prefix + '_first_name'),
      last_name: _val(prefix + '_last_name'),
      email: _val(prefix + '_email'),
      phone: _val(prefix + '_phone'),
      relationship: _val(prefix + '_relationship'),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------
  function _val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /** Counter for dynamic signatory rows */
  var _sigCounter = 100;

  /** Add a new empty signatory row to the form */
  function _addSignatoryRow() {
    var container = document.getElementById('ef_signatories');
    if (!container) return;

    // Remove empty-state message if present
    var emptyMsg = container.querySelector('p.text-center');
    if (emptyMsg) emptyMsg.remove();

    var idx = _sigCounter++;
    var tmp = document.createElement('div');
    tmp.innerHTML = renderSignatoryRow({}, idx);
    container.appendChild(tmp.firstChild);
  }

  /** Remove a signatory row from the form */
  function _removeSignatoryRow(btn, idx) {
    var row = btn.closest('[data-sig-index]');
    if (row) row.remove();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    renderEntityForm: renderEntityForm,
    renderSignatoryRow: renderSignatoryRow,
    renderAddPersonModal: renderAddPersonModal,
    collectEntityData: collectEntityData,
    collectPersonData: collectPersonData,

    // Internal methods exposed for onclick handlers
    _addSignatoryRow: _addSignatoryRow,
    _removeSignatoryRow: _removeSignatoryRow,
  };
})();
