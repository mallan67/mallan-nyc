// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS PANEL
//
// Allows agents to add any field they need to any client record —
// no code change, no migration. Just type a name and value.
//
// Stored as JSON in lead.custom_fields: { "Field Name": "value", ... }
// Works with any Lead, ActiveLease, or Listing via API PATCH.
//
// Usage:
//   CustomFields.render(containerEl, entityId, currentFields, patchUrl)
//   e.g. CustomFields.render(el, cl.id, cl.custom_fields, '/api/crm/clients/' + cl.id)
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM, MallanAPI */

var CustomFields = (function () {
  'use strict';

  var E = Utils.esc;

  function render(el, entityId, currentFields, patchUrl) {
    var fields = currentFields || {};
    var keys = Object.keys(fields);

    var h = '<div class="space-y-3">';
    h += '<div class="flex items-center justify-between">';
    h += '<h4 class="text-xs font-bold text-gray-700 uppercase tracking-wide">' +
      '<i class="fas fa-sliders-h mr-1.5 text-gray-400"></i>Custom Fields</h4>';
    h += '<button onclick="CustomFields.openAddDialog(\'' + E(entityId) + '\',\'' + E(patchUrl) + '\')" ' +
      'class="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold">' +
      '<i class="fas fa-plus text-[10px]"></i> Add Field</button>';
    h += '</div>';

    if (keys.length === 0) {
      h += '<p class="text-xs text-gray-400 italic">No custom fields yet. Click "Add Field" to store any additional information.</p>';
    } else {
      h += '<div class="space-y-1.5">';
      keys.forEach(function (key) {
        var val = fields[key];
        h += '<div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group">';
        h += '<div class="flex-1 min-w-0">';
        h += '<div class="text-[10px] font-bold text-gray-500 uppercase tracking-wide truncate">' + E(key) + '</div>';
        h += '<div class="text-sm text-gray-800 mt-0.5 break-words">' + E(String(val || '')) + '</div>';
        h += '</div>';
        h += '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">';
        h += '<button onclick="CustomFields.openEditDialog(\'' + E(entityId) + '\',\'' + E(patchUrl) + '\',\'' + E(key) + '\',\'' + E(String(val || '')) + '\')" ' +
          'class="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors">' +
          '<i class="fas fa-pen text-[9px]"></i></button>';
        h += '<button onclick="CustomFields.removeField(\'' + E(entityId) + '\',\'' + E(patchUrl) + '\',\'' + E(key) + '\')" ' +
          'class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors">' +
          '<i class="fas fa-times text-[9px]"></i></button>';
        h += '</div></div>';
      });
      h += '</div>';
    }

    h += '</div>';
    el.innerHTML = h;

    // Store reference for updates
    el.dataset.entityId = entityId;
    el.dataset.patchUrl = patchUrl;
    el.dataset.fields = JSON.stringify(fields);
  }

  var _currentEntityId = null;
  var _currentPatchUrl = null;
  var _currentFieldKey = null; // null = new field, otherwise editing existing

  function openAddDialog(entityId, patchUrl) {
    _currentEntityId = entityId;
    _currentPatchUrl = patchUrl;
    _currentFieldKey = null;
    _openDialog('Add Custom Field', '', '');
  }

  function openEditDialog(entityId, patchUrl, key, value) {
    _currentEntityId = entityId;
    _currentPatchUrl = patchUrl;
    _currentFieldKey = key;
    _openDialog('Edit: ' + key, key, value);
  }

  function _openDialog(title, key, value) {
    var existing = document.getElementById('customFieldDialog');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'customFieldDialog';
    modal.className = 'fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">' +
      '<div class="px-5 py-4 border-b flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-900">' + E(title) + '</h3>' +
        '<button onclick="document.getElementById(\'customFieldDialog\').remove()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="p-5 space-y-3">' +
        '<div>' +
          '<label class="block text-xs font-semibold text-gray-700 mb-1">Field Name</label>' +
          '<input id="cf-key" type="text" value="' + E(key) + '" placeholder="e.g. Guarantor Required, Pet Deposit, Special Terms..." ' +
          (_currentFieldKey ? 'readonly class="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"' :
            'class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200"') + '>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-semibold text-gray-700 mb-1">Value</label>' +
          '<textarea id="cf-value" rows="3" placeholder="Enter value..." ' +
          'class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 resize-none">' + E(value) + '</textarea>' +
        '</div>' +
      '</div>' +
      '<div class="px-5 py-3 border-t flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'customFieldDialog\').remove()" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>' +
        '<button onclick="CustomFields._saveField()" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Save</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
    setTimeout(function () {
      var input = _currentFieldKey
        ? document.getElementById('cf-value')
        : document.getElementById('cf-key');
      if (input) input.focus();
    }, 50);
  }

  function _saveField() {
    var keyEl = document.getElementById('cf-key');
    var valEl = document.getElementById('cf-value');
    if (!keyEl || !valEl) return;

    var key = keyEl.value.trim();
    var val = valEl.value.trim();

    if (!key) { CRM.toast('Field name is required', 'warning'); keyEl.focus(); return; }

    // Load current fields from the container
    var container = document.querySelector('[data-entity-id="' + _currentEntityId + '"]');
    var current = {};
    try { if (container) current = JSON.parse(container.dataset.fields || '{}'); } catch (e) {}

    current[key] = val;
    _persist(current, function () {
      document.getElementById('customFieldDialog')?.remove();
      CRM.toast('Field saved', 'success');
      if (container) {
        container.dataset.fields = JSON.stringify(current);
        render(container, _currentEntityId, current, _currentPatchUrl);
      }
    });
  }

  function removeField(entityId, patchUrl, key) {
    if (!confirm('Remove field "' + key + '"?')) return;
    _currentEntityId = entityId;
    _currentPatchUrl = patchUrl;

    var container = document.querySelector('[data-entity-id="' + entityId + '"]');
    var current = {};
    try { if (container) current = JSON.parse(container.dataset.fields || '{}'); } catch (e) {}

    delete current[key];
    _persist(current, function () {
      CRM.toast('Field removed', 'success');
      if (container) {
        container.dataset.fields = JSON.stringify(current);
        render(container, entityId, current, patchUrl);
      }
    });
  }

  function _persist(fields, onSuccess) {
    MallanAPI._fetch(_currentPatchUrl, {
      method: 'PATCH',
      body: JSON.stringify({ custom_fields: fields }),
    }).then(onSuccess)
      .catch(function (err) { CRM.toast('Failed to save: ' + (err.message || ''), 'error'); });
  }

  return { render: render, openAddDialog: openAddDialog, openEditDialog: openEditDialog, removeField: removeField, _saveField: _saveField };

})();
