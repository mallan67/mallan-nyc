// =================================================================================
// SHARED -- Workspace Shell
// Reusable workspace container for client/listing detail pages.
// Provides: header, contact card, alerts, tabs, action bar, content area,
// entity ownership, multi-person, document tracker, checklist, disclosures.
// =================================================================================
/* global Utils, UI, Router, MallanAPI, CRM */

var WorkspaceShell = (function () {
  'use strict';

  var E = Utils.esc;
  var D = Utils.formatDate;

  // ---------------------------------------------------------------------------
  // 1. render(opts) -- full workspace page
  // ---------------------------------------------------------------------------
  /**
   * @param {Object} opts
   * @param {string}  opts.backRoute   - route for back button (default '/ops/dashboard')
   * @param {string}  opts.backLabel   - back button text (default 'Dashboard')
   * @param {Object}  opts.client      - client/entity object (name, email, phone, etc.)
   * @param {string}  opts.avatarName  - name for avatar initials
   * @param {string}  opts.displayName - display name in header
   * @param {string}  opts.role        - role badge label (buyer/seller/landlord/tenant)
   * @param {string}  opts.stage       - stage badge label (new/active/showing/etc.)
   * @param {string}  opts.entityBadge - entity type label (LLC/Trust/etc.) or falsy
   * @param {boolean} opts.isInvestor  - show investor badge
   * @param {Array}   opts.alerts      - array of alert objects {severity, title, description, actionUrl, id}
   * @param {Array}   opts.tabs        - [{id, label, icon}]
   * @param {string}  opts.activeTab   - currently active tab id
   * @param {string}  opts.onTab       - global function name for tab click (receives tab id)
   * @param {Array}   opts.actions     - [{label, icon, onclick, cls}] for action bar
   * @param {string}  opts.headerExtra - extra HTML after header badges (optional)
   */
  function render(opts) {
    opts = opts || {};
    var cl = opts.client || {};
    var backRoute = opts.backRoute || '/ops/dashboard';
    var backLabel = opts.backLabel || 'Dashboard';
    var avatarName = opts.avatarName || opts.displayName || 'Client';
    var displayName = opts.displayName || avatarName;
    var role = opts.role || cl.type || cl.client_type || 'buyer';
    var stage = opts.stage || cl.pipeline_stage || cl.stage || cl.status || 'new';

    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary
      ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim()
      : '';

    var html = '<div class="space-y-0">';

    // -- Back navigation
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'' + E(backRoute) + '\')">' +
        '<i class="fas fa-arrow-left mr-1"></i> ' + E(backLabel) +
      '</button>' +
    '</div>';

    // -- Header with avatar, name, badges
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(avatarName, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1 flex-wrap">' +
              UI.roleBadge(role) +
              UI.stageBadge(stage) +
              (opts.isInvestor ? '<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor</span>' : '') +
              (opts.entityBadge ? '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(opts.entityBadge) + '</span>' : '') +
              (hasSecondary ? '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">' + E(cl.secondary_relationship || 'partner') + '</span>' : '') +
            '</div>' +
          '</div>' +
          (hasSecondary ? UI.avatar(secondaryName, 40) : '') +
        '</div>' +
        (opts.headerExtra || '') +
      '</div>' +

      // -- Contact info row
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        (cl.email ? '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>' : '') +
        (cl.phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>' : '') +
        (hasSecondary && cl.secondary_email ? '<span class="text-gray-400">|</span><span><i class="fas fa-envelope mr-1"></i>' + E(cl.secondary_email) + '</span>' : '') +
        (hasSecondary && cl.secondary_phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.secondary_phone) + '</span>' : '') +
        (cl.source ? '<span><i class="fas fa-tag mr-1"></i>Source: ' + E(cl.source) + '</span>' : '') +
      '</div>' +
    '</div>';

    // -- Smart Alerts
    var alerts = opts.alerts || [];
    if (alerts.length > 0) {
      html += '<div class="space-y-2 my-3">';
      alerts.forEach(function (a) {
        html += UI.alertItem(a);
      });
      html += '</div>';
    }

    // -- Tab bar
    if (opts.tabs && opts.tabs.length > 0 && opts.onTab) {
      html += UI.tabs(opts.tabs, opts.activeTab || opts.tabs[0].id, opts.onTab);
    }

    // -- Action bar
    if (opts.actions && opts.actions.length > 0) {
      html += '<div class="workspace-action-bar">' +
        '<div class="action-group">';
      opts.actions.forEach(function (a) {
        var cls = a.cls || 'btn btn-sm btn-outline';
        html += '<button class="' + cls + '" onclick="' + E(a.onclick || '') + '">' +
          (a.icon ? '<i class="fas ' + a.icon + ' mr-1"></i>' : '') +
          '<span class="hidden sm:inline">' + E(a.label) + '</span>' +
        '</button>';
      });
      html += '</div></div>';
    }

    // -- Content area
    html += '<div id="workspace-content" class="workspace-content">' + UI.loading() + '</div>';

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // 2. renderContactCard(client) -- editable contact info card
  // ---------------------------------------------------------------------------
  function renderContactCard(client) {
    var cl = client || {};
    var id = cl.id || '';
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;

    var html = '<div class="card" id="ws-contact-card">';

    // Header
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-address-book mr-1.5 text-gray-400"></i>Contact Information</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="WorkspaceShell._editContactCard(\'' + E(id) + '\')">' +
        '<i class="fas fa-edit mr-1"></i>Edit' +
      '</button>' +
    '</div>';

    html += '<div class="card-body">';

    // Primary person
    html += '<div class="mb-3">' +
      '<p class="text-xs font-semibold text-gray-500 uppercase mb-1">Primary Contact</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
        _contactField('Name', ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim()) +
        _contactField('Email', cl.email) +
        _contactField('Phone', cl.phone) +
        _contactField('Home Address', cl.home_address) +
      '</div>' +
    '</div>';

    // Secondary person
    if (hasSecondary) {
      var secName = ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim();
      html += '<div class="pt-3 border-t border-gray-100">' +
        '<p class="text-xs font-semibold text-gray-500 uppercase mb-1">Secondary Contact' +
          '<span class="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">' + E(cl.secondary_relationship || 'partner') + '</span>' +
        '</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
          _contactField('Name', secName) +
          _contactField('Email', cl.secondary_email) +
          _contactField('Phone', cl.secondary_phone) +
        '</div>' +
      '</div>';
    }

    // Entity info
    if (cl.entity_name) {
      html += '<div class="pt-3 border-t border-gray-100">' +
        '<p class="text-xs font-semibold text-gray-500 uppercase mb-1">Entity</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
          _contactField('Entity Name', cl.entity_name) +
          _contactField('Entity Type', cl.entity_type) +
          _contactField('Legal Ownership', cl.legal_ownership_name) +
        '</div>' +
      '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function _contactField(label, value) {
    return '<div>' +
      '<span class="text-xs font-semibold text-gray-700">' + E(label) + '</span>' +
      '<p class="text-sm text-gray-900 mt-0.5">' + (value ? E(value) : '<span class="text-gray-400">--</span>') + '</p>' +
    '</div>';
  }

  /** Internal: switch contact card to edit mode */
  function _editContactCard(clientId) {
    var card = document.getElementById('ws-contact-card');
    if (!card) return;

    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;

      var html = '<div class="card-header">' +
        '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-address-book mr-1.5 text-gray-400"></i>Edit Contact</h3>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-gold" onclick="WorkspaceShell._saveContactCard(\'' + E(clientId) + '\')"><i class="fas fa-check mr-1"></i>Save</button>' +
          '<button class="btn btn-sm btn-outline" onclick="WorkspaceShell._cancelContactEdit(\'' + E(clientId) + '\')">Cancel</button>' +
        '</div>' +
      '</div>';

      html += '<div class="card-body">';

      html += '<div class="mb-3">' +
        '<p class="text-xs font-semibold text-gray-500 uppercase mb-2">Primary Contact</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          _editField('ws_first_name', 'First Name', cl.first_name) +
          _editField('ws_last_name', 'Last Name', cl.last_name) +
          _editField('ws_email', 'Email', cl.email, 'email') +
          _editField('ws_phone', 'Phone', cl.phone, 'tel') +
          _editField('ws_home_address', 'Home Address', cl.home_address) +
        '</div>' +
      '</div>';

      if (hasSecondary) {
        html += '<div class="pt-3 border-t border-gray-100">' +
          '<p class="text-xs font-semibold text-gray-500 uppercase mb-2">Secondary Contact</p>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            _editField('ws_sec_first_name', 'First Name', cl.secondary_first_name) +
            _editField('ws_sec_last_name', 'Last Name', cl.secondary_last_name) +
            _editField('ws_sec_email', 'Email', cl.secondary_email, 'email') +
            _editField('ws_sec_phone', 'Phone', cl.secondary_phone, 'tel') +
            _selectField('ws_sec_relationship', 'Relationship', cl.secondary_relationship, [
              'spouse', 'partner', 'co-buyer', 'roommate', 'co-owner', 'parent', 'adult_child', 'executor'
            ]) +
          '</div>' +
        '</div>';
      }

      html += '</div>';
      card.innerHTML = html;
    }).catch(function () {
      CRM.toast('Could not load contact for editing', 'error');
    });
  }

  function _editField(id, label, value, type) {
    type = type || 'text';
    return '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">' + E(label) + '</label>' +
      '<input id="' + E(id) + '" type="' + type + '" value="' + E(value || '') + '" ' +
        'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
    '</div>';
  }

  function _selectField(id, label, value, options) {
    var html = '<div>' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">' + E(label) + '</label>' +
      '<select id="' + E(id) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
        '<option value="">Select...</option>';
    options.forEach(function (opt) {
      var sel = value === opt ? ' selected' : '';
      var display = opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ');
      html += '<option value="' + E(opt) + '"' + sel + '>' + E(display) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function _saveContactCard(clientId) {
    var payload = {
      first_name: _val('ws_first_name'),
      last_name: _val('ws_last_name'),
      email: _val('ws_email'),
      phone: _val('ws_phone'),
      home_address: _val('ws_home_address'),
    };

    // Secondary fields (only send if they exist in DOM)
    if (document.getElementById('ws_sec_first_name')) {
      payload.secondary_first_name = _val('ws_sec_first_name');
      payload.secondary_last_name = _val('ws_sec_last_name');
      payload.secondary_email = _val('ws_sec_email');
      payload.secondary_phone = _val('ws_sec_phone');
      payload.secondary_relationship = _val('ws_sec_relationship');
    }

    MallanAPI._fetch('/api/crm/clients/' + clientId, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(function (data) {
      CRM.toast('Contact saved', 'success');
      _cancelContactEdit(clientId);
    }).catch(function (err) {
      CRM.toast('Save failed: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _cancelContactEdit(clientId) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var card = document.getElementById('ws-contact-card');
      if (card) {
        var tmp = document.createElement('div');
        tmp.innerHTML = renderContactCard(cl);
        card.parentNode.replaceChild(tmp.firstChild, card);
      }
    });
  }

  function _val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ---------------------------------------------------------------------------
  // 3. renderEntitySection(client) -- entity ownership display
  // ---------------------------------------------------------------------------
  function renderEntitySection(client) {
    var cl = client || {};
    var id = cl.id || '';
    var sigs = cl.authorized_signatories || [];

    var html = '<div class="card" id="ws-entity-section">';
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-building mr-1.5 text-gray-400"></i>Entity Ownership</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="WorkspaceShell._editEntity(\'' + E(id) + '\')">' +
        '<i class="fas fa-edit mr-1"></i>Edit' +
      '</button>' +
    '</div>';
    html += '<div class="card-body">';

    if (!cl.entity_name) {
      html += '<div class="text-center py-6">' +
        '<p class="text-sm text-gray-400 mb-2">No entity information on file</p>' +
        '<button class="btn btn-sm btn-outline" onclick="WorkspaceShell._editEntity(\'' + E(id) + '\')">' +
          '<i class="fas fa-plus mr-1"></i>Add Entity' +
        '</button>' +
      '</div>';
    } else {
      html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">' +
        _contactField('Entity Name', cl.entity_name) +
        _contactField('Entity Type', cl.entity_type) +
        _contactField('Legal Ownership', cl.legal_ownership_name) +
      '</div>';

      // Authorized signatories table
      html += '<p class="text-xs font-semibold text-gray-500 uppercase mb-2">Authorized Signatories</p>';
      if (sigs.length === 0) {
        html += '<p class="text-xs text-gray-400 mb-2">No signatories added</p>';
      } else {
        html += '<div class="data-table"><div style="overflow-x:auto"><table><thead><tr>' +
          '<th>Name</th><th>Title</th><th>Email</th><th>Phone</th><th style="width:60px"></th>' +
        '</tr></thead><tbody>';
        sigs.forEach(function (sig, idx) {
          html += '<tr>' +
            '<td class="text-sm">' + E(sig.name || '') + '</td>' +
            '<td class="text-sm">' + E(sig.title || '') + '</td>' +
            '<td class="text-sm">' + E(sig.email || '') + '</td>' +
            '<td class="text-sm">' + E(sig.phone || '') + '</td>' +
            '<td>' +
              '<button class="btn btn-sm btn-outline text-red-500" onclick="WorkspaceShell._removeSignatory(\'' + E(id) + '\',' + idx + ')">' +
                '<i class="fas fa-trash-alt text-xs"></i>' +
              '</button>' +
            '</td>' +
          '</tr>';
        });
        html += '</tbody></table></div></div>';
      }

      html += '<button class="btn btn-sm btn-outline mt-2" onclick="WorkspaceShell._addSignatory(\'' + E(id) + '\')">' +
        '<i class="fas fa-plus mr-1"></i>Add Signatory' +
      '</button>';
    }

    html += '</div></div>';
    return html;
  }

  function _editEntity(clientId) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      CRM.openModal('Edit Entity', EntityFields.renderEntityForm(cl), function () {
        var payload = EntityFields.collectEntityData('ef');
        MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }).then(function () {
          CRM.toast('Entity saved', 'success');
          CRM.closeModal();
          _refreshEntitySection(clientId);
        }).catch(function (err) {
          CRM.toast('Save failed: ' + (err.message || ''), 'error');
        });
      });
    });
  }

  function _addSignatory(clientId) {
    CRM.openModal('Add Signatory', EntityFields.renderSignatoryRow({}, 0), function () {
      var name = _val('sig_name_0');
      var title = _val('sig_title_0');
      var email = _val('sig_email_0');
      var phone = _val('sig_phone_0');
      if (!name) { CRM.toast('Name is required', 'error'); return; }
      MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
        var cl = data.client || data;
        var sigs = cl.authorized_signatories || [];
        sigs.push({ name: name, title: title, email: email, phone: phone });
        return MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify({ authorized_signatories: sigs }),
        });
      }).then(function () {
        CRM.toast('Signatory added', 'success');
        CRM.closeModal();
        _refreshEntitySection(clientId);
      }).catch(function (err) {
        CRM.toast('Failed: ' + (err.message || ''), 'error');
      });
    });
  }

  function _removeSignatory(clientId, index) {
    if (!confirm('Remove this signatory?')) return;
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var sigs = cl.authorized_signatories || [];
      sigs.splice(index, 1);
      return MallanAPI._fetch('/api/crm/clients/' + clientId, {
        method: 'PATCH',
        body: JSON.stringify({ authorized_signatories: sigs }),
      });
    }).then(function () {
      CRM.toast('Signatory removed', 'success');
      _refreshEntitySection(clientId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _refreshEntitySection(clientId) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var el = document.getElementById('ws-entity-section');
      if (el) {
        var tmp = document.createElement('div');
        tmp.innerHTML = renderEntitySection(cl);
        el.parentNode.replaceChild(tmp.firstChild, el);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. renderMultiPerson(client, familyMembers)
  // ---------------------------------------------------------------------------
  function renderMultiPerson(client, familyMembers) {
    var cl = client || {};
    var id = cl.id || '';
    var members = familyMembers || [];
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;

    var html = '<div class="card" id="ws-multi-person">';
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-users mr-1.5 text-gray-400"></i>People</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="WorkspaceShell._addPerson(\'' + E(id) + '\')">' +
        '<i class="fas fa-user-plus mr-1"></i>Add Person' +
      '</button>' +
    '</div>';
    html += '<div class="card-body">';

    // Primary
    html += _personRow(
      ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      'Primary',
      cl.email,
      cl.phone,
      null, // no delete for primary
      null  // no edit callback id
    );

    // Secondary
    if (hasSecondary) {
      var secName = ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim();
      html += _personRow(
        secName,
        cl.secondary_relationship || 'Partner',
        cl.secondary_email,
        cl.secondary_phone,
        null, // secondary is on main record -- edit via contact card
        null
      );
    }

    // Family members
    members.forEach(function (fm) {
      var m = fm.member || fm;
      var mName = ((m.first_name || '') + ' ' + (m.last_name || '')).trim();
      html += _personRow(
        mName,
        fm.relationship || 'Related',
        m.email,
        m.phone,
        'WorkspaceShell._deletePerson(\'' + E(id) + '\',\'' + E(m.id || '') + '\')',
        'WorkspaceShell._editPerson(\'' + E(id) + '\',\'' + E(m.id || '') + '\')'
      );
    });

    if (!hasSecondary && members.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No additional people linked</p>';
    }

    html += '</div></div>';
    return html;
  }

  function _personRow(name, relationship, email, phone, deleteOnclick, editOnclick) {
    var rel = relationship || '';
    var relDisplay = rel.charAt(0).toUpperCase() + rel.slice(1).replace(/_/g, ' ');

    var html = '<div class="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">' +
      '<div class="flex items-center gap-3">' +
        UI.avatar(name || '?', 36) +
        '<div>' +
          '<p class="text-sm font-medium text-gray-900">' + E(name || 'Unknown') + '</p>' +
          '<div class="flex items-center gap-2 text-xs text-gray-500">' +
            '<span class="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded font-semibold">' + E(relDisplay) + '</span>' +
            (email ? '<span><i class="fas fa-envelope mr-0.5 text-[9px]"></i>' + E(email) + '</span>' : '') +
            (phone ? '<span><i class="fas fa-phone mr-0.5 text-[9px]"></i>' + E(phone) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-1">' +
        (editOnclick ? '<button class="btn btn-sm btn-outline" onclick="' + editOnclick + '"><i class="fas fa-edit text-xs"></i></button>' : '') +
        (deleteOnclick ? '<button class="btn btn-sm btn-outline text-red-500" onclick="' + deleteOnclick + '"><i class="fas fa-trash-alt text-xs"></i></button>' : '') +
      '</div>' +
    '</div>';
    return html;
  }

  function _addPerson(leadId) {
    CRM.openModal('Add Person', EntityFields.renderAddPersonModal(leadId), function () {
      var person = EntityFields.collectPersonData('ap');
      if (!person.first_name) { CRM.toast('First name is required', 'error'); return; }
      MallanAPI._fetch('/api/crm/clients/' + leadId + '/family', {
        method: 'POST',
        body: JSON.stringify(person),
      }).then(function () {
        CRM.toast('Person added', 'success');
        CRM.closeModal();
        _refreshMultiPerson(leadId);
      }).catch(function (err) {
        CRM.toast('Failed: ' + (err.message || ''), 'error');
      });
    });
  }

  function _editPerson(leadId, memberId) {
    MallanAPI._fetch('/api/crm/clients/' + leadId + '/family/' + memberId).then(function (data) {
      var m = data.member || data;
      CRM.openModal('Edit Person', EntityFields.renderAddPersonModal(leadId, m), function () {
        var person = EntityFields.collectPersonData('ap');
        MallanAPI._fetch('/api/crm/clients/' + leadId + '/family/' + memberId, {
          method: 'PATCH',
          body: JSON.stringify(person),
        }).then(function () {
          CRM.toast('Person updated', 'success');
          CRM.closeModal();
          _refreshMultiPerson(leadId);
        }).catch(function (err) {
          CRM.toast('Failed: ' + (err.message || ''), 'error');
        });
      });
    });
  }

  function _deletePerson(leadId, memberId) {
    if (!confirm('Remove this person?')) return;
    MallanAPI._fetch('/api/crm/clients/' + leadId + '/family/' + memberId, {
      method: 'DELETE',
    }).then(function () {
      CRM.toast('Person removed', 'success');
      _refreshMultiPerson(leadId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _refreshMultiPerson(leadId) {
    MallanAPI._fetch('/api/crm/clients/' + leadId).then(function (cData) {
      var cl = cData.client || cData;
      return MallanAPI._fetch('/api/crm/clients/' + leadId + '/family').then(function (fData) {
        var members = fData.members || [];
        var el = document.getElementById('ws-multi-person');
        if (el) {
          var tmp = document.createElement('div');
          tmp.innerHTML = renderMultiPerson(cl, members);
          el.parentNode.replaceChild(tmp.firstChild, el);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 5. renderDocumentTracker(docs) -- collected vs missing
  // ---------------------------------------------------------------------------
  function renderDocumentTracker(docs) {
    docs = docs || {};
    var keys = Object.keys(docs);

    var html = '<div class="card" id="ws-doc-tracker">';
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-folder-open mr-1.5 text-gray-400"></i>Document Tracker</h3>' +
      _docSummary(docs) +
    '</div>';
    html += '<div class="card-body">';

    if (keys.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No documents tracked</p>';
    } else {
      html += '<div class="space-y-1">';
      keys.forEach(function (key) {
        var collected = !!docs[key];
        var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        var icon = collected ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400';
        var bgCls = collected ? 'bg-green-50' : 'bg-red-50';

        html += '<div class="flex items-center justify-between px-3 py-2 rounded-lg ' + bgCls + '">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas ' + icon + ' text-sm"></i>' +
            '<span class="text-sm font-medium text-gray-900">' + E(label) + '</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-outline text-xs" onclick="WorkspaceShell._toggleDoc(\'' + E(key) + '\',' + (collected ? 'false' : 'true') + ')">' +
            (collected ? 'Mark Missing' : 'Mark Collected') +
          '</button>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function _docSummary(docs) {
    var keys = Object.keys(docs);
    var collected = keys.filter(function (k) { return !!docs[k]; }).length;
    var total = keys.length;
    var pct = total > 0 ? Math.round((collected / total) * 100) : 0;
    var color = pct >= 100 ? '#059669' : pct >= 50 ? '#F59E0B' : '#EF4444';
    return '<span class="text-xs font-bold" style="color:' + color + '">' + collected + '/' + total + ' (' + pct + '%)</span>';
  }

  /** Toggle called from doc tracker buttons -- emits event for parent to handle */
  function _toggleDoc(key, newValue) {
    // Dispatch custom event so the parent workspace can handle persistence
    var event = new CustomEvent('ws:doc-toggle', { detail: { key: key, value: newValue === 'true' || newValue === true } });
    document.dispatchEvent(event);
  }

  // ---------------------------------------------------------------------------
  // 6. renderChecklistSection(title, items)
  // ---------------------------------------------------------------------------
  function renderChecklistSection(title, items) {
    items = items || [];
    var sectionId = 'ws-checklist-' + (title || '').replace(/\s+/g, '-').toLowerCase();

    var html = '<div class="card" id="' + E(sectionId) + '">';
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-clipboard-check mr-1.5 text-gray-400"></i>' + E(title || 'Checklist') + '</h3>' +
      _checklistSummary(items) +
    '</div>';
    html += '<div class="card-body">';

    if (items.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No items</p>';
    } else {
      html += '<div class="space-y-2">';
      items.forEach(function (item, idx) {
        var statusColors = {
          pending: 'bg-gray-100 text-gray-600',
          in_progress: 'bg-blue-100 text-blue-700',
          done: 'bg-green-100 text-green-700',
        };
        var statusCls = statusColors[item.status] || statusColors.pending;

        html += '<div class="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200">' +
          // Status dropdown
          '<select class="text-[10px] font-bold px-2 py-1 rounded-md border-0 ' + statusCls + ' focus:ring-2 focus:ring-gold/30 focus:outline-none" ' +
            'onchange="WorkspaceShell._updateChecklistItem(' + idx + ',\'status\',this.value)">' +
            '<option value="pending"' + (item.status === 'pending' ? ' selected' : '') + '>Pending</option>' +
            '<option value="in_progress"' + (item.status === 'in_progress' ? ' selected' : '') + '>In Progress</option>' +
            '<option value="done"' + (item.status === 'done' ? ' selected' : '') + '>Done</option>' +
          '</select>' +
          // Item text
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-gray-900' + (item.status === 'done' ? ' line-through text-gray-400' : '') + '">' + E(item.item || '') + '</p>' +
            '<input type="text" value="' + E(item.notes || '') + '" placeholder="Notes..." ' +
              'class="w-full mt-1 text-xs px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold/30 focus:outline-none bg-transparent text-gray-500" ' +
              'onchange="WorkspaceShell._updateChecklistItem(' + idx + ',\'notes\',this.value)">' +
          '</div>' +
          // Delete
          '<button class="text-gray-300 hover:text-red-500 transition-colors" onclick="WorkspaceShell._deleteChecklistItem(' + idx + ')">' +
            '<i class="fas fa-trash-alt text-xs"></i>' +
          '</button>' +
        '</div>';
      });
      html += '</div>';
    }

    // Add item button
    html += '<button class="btn btn-sm btn-outline mt-3 w-full" onclick="WorkspaceShell._addChecklistItem(\'' + E(sectionId) + '\')">' +
      '<i class="fas fa-plus mr-1"></i>Add Item' +
    '</button>';

    html += '</div></div>';
    return html;
  }

  function _checklistSummary(items) {
    var done = items.filter(function (i) { return i.status === 'done'; }).length;
    var total = items.length;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    var color = pct >= 100 ? '#059669' : pct >= 50 ? '#F59E0B' : '#9CA3AF';
    return '<span class="text-xs font-bold" style="color:' + color + '">' + done + '/' + total + '</span>';
  }

  /** Dispatch custom events for parent to handle persistence */
  function _updateChecklistItem(index, field, value) {
    document.dispatchEvent(new CustomEvent('ws:checklist-update', {
      detail: { index: index, field: field, value: value },
    }));
  }

  function _deleteChecklistItem(index) {
    if (!confirm('Delete this checklist item?')) return;
    document.dispatchEvent(new CustomEvent('ws:checklist-delete', {
      detail: { index: index },
    }));
  }

  function _addChecklistItem(sectionId) {
    document.dispatchEvent(new CustomEvent('ws:checklist-add', {
      detail: { sectionId: sectionId },
    }));
  }

  // ---------------------------------------------------------------------------
  // 7. renderDisclosureSection(disclosures)
  // ---------------------------------------------------------------------------
  function renderDisclosureSection(disclosures) {
    disclosures = disclosures || {};
    var keys = Object.keys(disclosures);

    var html = '<div class="card" id="ws-disclosures">';
    html += '<div class="card-header">' +
      '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-file-contract mr-1.5 text-gray-400"></i>Disclosures</h3>' +
      _disclosureSummary(disclosures) +
    '</div>';
    html += '<div class="card-body">';

    if (keys.length === 0) {
      html += '<p class="text-sm text-gray-400 text-center py-4">No disclosures tracked</p>';
    } else {
      html += '<div class="space-y-1">';
      keys.forEach(function (key) {
        var status = disclosures[key] || 'pending';
        var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });

        var statusConfig = {
          completed: { cls: 'bg-green-100 text-green-700', icon: 'fa-check', text: 'Completed' },
          pending: { cls: 'bg-yellow-100 text-yellow-700', icon: 'fa-clock', text: 'Pending' },
          waived: { cls: 'bg-gray-100 text-gray-500', icon: 'fa-minus', text: 'Waived' },
          na: { cls: 'bg-gray-100 text-gray-400', icon: 'fa-ban', text: 'N/A' },
        };
        var cfg = statusConfig[status] || statusConfig.pending;

        html += '<div class="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100">' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-sm font-medium text-gray-900">' + E(label) + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-[10px] font-bold px-2 py-0.5 rounded ' + cfg.cls + '">' +
              '<i class="fas ' + cfg.icon + ' mr-1"></i>' + cfg.text +
            '</span>' +
            '<button class="btn btn-sm btn-outline text-xs" onclick="WorkspaceShell._editDisclosure(\'' + E(key) + '\')">' +
              '<i class="fas fa-edit text-[10px]"></i>' +
            '</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function _disclosureSummary(disclosures) {
    var keys = Object.keys(disclosures);
    var completed = keys.filter(function (k) { return disclosures[k] === 'completed'; }).length;
    var total = keys.length;
    var color = completed === total && total > 0 ? '#059669' : '#F59E0B';
    return '<span class="text-xs font-bold" style="color:' + color + '">' + completed + '/' + total + ' completed</span>';
  }

  function _editDisclosure(key) {
    var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });

    var modalHtml = '<div class="space-y-3 p-4">' +
      '<p class="text-sm font-bold text-gray-900">' + E(label) + '</p>' +
      '<div>' +
        '<label class="text-xs font-semibold text-gray-700 block mb-1">Status</label>' +
        '<select id="ws_disc_status" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="pending">Pending</option>' +
          '<option value="completed">Completed</option>' +
          '<option value="waived">Waived</option>' +
          '<option value="na">N/A</option>' +
        '</select>' +
      '</div>' +
    '</div>';

    CRM.openModal('Edit Disclosure', modalHtml, function () {
      var status = _val('ws_disc_status');
      document.dispatchEvent(new CustomEvent('ws:disclosure-update', {
        detail: { key: key, status: status },
      }));
      CRM.closeModal();
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    render: render,
    renderContactCard: renderContactCard,
    renderEntitySection: renderEntitySection,
    renderMultiPerson: renderMultiPerson,
    renderDocumentTracker: renderDocumentTracker,
    renderChecklistSection: renderChecklistSection,
    renderDisclosureSection: renderDisclosureSection,

    // Internal methods exposed for onclick handlers
    _editContactCard: _editContactCard,
    _saveContactCard: _saveContactCard,
    _cancelContactEdit: _cancelContactEdit,
    _editEntity: _editEntity,
    _addSignatory: _addSignatory,
    _removeSignatory: _removeSignatory,
    _addPerson: _addPerson,
    _editPerson: _editPerson,
    _deletePerson: _deletePerson,
    _toggleDoc: _toggleDoc,
    _updateChecklistItem: _updateChecklistItem,
    _deleteChecklistItem: _deleteChecklistItem,
    _addChecklistItem: _addChecklistItem,
    _editDisclosure: _editDisclosure,
  };
})();
