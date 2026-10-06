// The agent (or broker) who starts a listing is its listing agent, and the listing carries that agent's Cotality identity.
//
// Both Add / Edit forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html) keep the signed-in agent in hidden <prefix>UpdatingAgent* inputs and show the
// same agent in the Contacts tab. The two forms did this twice, differently, and neither submitted the agent's Cotality MLS ID: those hidden inputs sit outside
// the area the save routine sweeps, so ListAgentMlsId reached the server blank on every listing. This module is the one place that
//
//   apply(prefix, user, opts)       fills the hidden identity, the header, the Listing Agent display and, for a new listing, the Contacts tab;
//   hydrate(prefix, listing, opts)  restores the identity a saved listing carries (a saved identity is never replaced by the session's);
//   identity(prefix)                the provider keys the form submits: ListAgentMlsId / ListAgentKey / ListAgentFullName / ListAgentEmail /
//                                   ListAgentDirectPhone and ListOfficeName / ListOfficeKey / ListOfficeMlsId;
//   verify(prefix)                  asks the live Cotality Member directory (MallanDirectory.lookupMember) for the agent's MemberKey and office and says what it found.
//
// Provider facts come only from live Cotality. A Cotality key or office id that the directory did not return is left out, never guessed, and the form's own
// company slug ("mallan", which an older version submitted as ListOfficeKey) is not a Cotality key and is never sent as one. Every text is written with
// textContent: directory and profile text is never interpreted as markup.
(function (global) {
  'use strict';

  // <prefix> + suffix is the id of the hidden input that holds each part of the identity
  var HIDDEN = {
    id: 'UpdatingAgent', name: 'UpdatingAgentName', phone: 'UpdatingAgentPhone', email: 'UpdatingAgentEmail', license: 'UpdatingAgentLicense',
    mlsId: 'UpdatingAgentMlsId', key: 'UpdatingAgentKey', officeKey: 'UpdatingAgentOfficeKey', officeMlsId: 'UpdatingAgentOfficeMlsId',
    companyKey: 'UpdatingAgentCompanyKey', companyName: 'UpdatingAgentCompanyName',
  };
  var checks = {};   // prefix -> sequence number of the latest Cotality check, so a slow older answer never overwrites a newer one

  function byId(id) { return document.getElementById(id); }
  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  // Cotality office keys and MLS ids are digit strings (Property.ListOfficeKey 5671398 is Office.OfficeKey). Anything else in an office key is not one.
  function isCotalityId(v) { return /^\d+$/.test(str(v)); }

  function hiddenEl(prefix, part) { return byId(prefix + HIDDEN[part]); }
  function read(prefix, part) { var el = hiddenEl(prefix, part); return el ? str(el.value) : ''; }
  function isEmpty(part, current) { return !current || (part === 'officeKey' && !isCotalityId(current)); }
  function write(prefix, part, value, onlyWhenEmpty) {
    var el = hiddenEl(prefix, part);
    var s = str(value);
    if (!el || !s) return;
    if (onlyWhenEmpty && !isEmpty(part, str(el.value))) return;
    el.value = s;
  }
  function text(id, value) { var el = byId(id); if (el) el.textContent = value; }

  function say(prefix, kind, message) {
    var el = byId(prefix + 'AgentCotalityStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'text-[11px] mt-1 ' + (kind === 'ok' ? 'text-green-700' : kind === 'warn' ? 'text-amber-700' : 'text-gray-500');
  }

  // The provider keys the form submits for the listing agent. The first five are always present (a blank is filled from the session by the server);
  // the Cotality keys are present only when the directory returned them.
  function identity(prefix) {
    var out = {
      ListAgentMlsId: read(prefix, 'mlsId'),
      ListAgentFullName: read(prefix, 'name'),
      ListAgentEmail: read(prefix, 'email'),
      ListAgentDirectPhone: read(prefix, 'phone'),
      ListOfficeName: read(prefix, 'companyName'),
    };
    var key = read(prefix, 'key');
    if (key) out.ListAgentKey = key;
    var officeKey = read(prefix, 'officeKey');
    if (isCotalityId(officeKey)) out.ListOfficeKey = officeKey;
    var officeMlsId = read(prefix, 'officeMlsId');
    if (officeMlsId) out.ListOfficeMlsId = officeMlsId;
    return out;
  }

  // Contacts tab: the REBNY company, the agent, the contact panel and the contacts table, all for the listing agent.
  function renderContacts(prefix, a, opts) {
    var company = byId(prefix + 'ListingCompany');
    if (company && a.companyKey) company.value = a.companyKey;
    var companySearch = byId(prefix + 'ListingCompanySearch');
    if (companySearch && a.companyName) companySearch.value = a.companyName;
    var agent = byId(prefix + 'ListingAgent');
    if (agent && a.agentValue) {
      agent.value = a.agentValue;
      agent.dataset.company = a.companyKey || 'mallan';
    }
    var search = byId(prefix + 'ListingAgentSearch');
    if (search) { search.value = a.name || ''; search.disabled = false; }
    var panel = byId(prefix + 'ListingAgentInfo');
    if (panel) {
      panel.style.display = 'block';
      text(prefix + 'ListingAgentId', a.mlsId || '--');
      text(prefix + 'ListingAgentPhone', a.phone || '--');
      text(prefix + 'ListingAgentEmail', a.email || '--');
      text(prefix + 'ListingAgentLicense', a.license || '--');
    }
    if (opts && typeof opts.updateTable === 'function' && (a.agentValue || a.name)) {
      opts.updateTable('listing', a.mlsId || '--', a.name || '', a.companyName || '', a.phone || '--', a.email || '--');
    }
  }

  // Ask live Cotality which Member this MLS ID is, and keep the agent's MemberKey and office (OfficeKey / OfficeMlsId) for the submission.
  function verify(prefix) {
    var mls = read(prefix, 'mlsId');
    if (!mls) {
      say(prefix, 'warn', 'Your agent profile has no Cotality MLS ID, so this listing cannot be matched to your Cotality agent record. Ask a broker to add it to your profile.');
      return Promise.resolve(null);
    }
    var directory = global.MallanDirectory;
    if (!directory || typeof directory.lookupMember !== 'function') {
      say(prefix, 'warn', 'The Cotality directory is not available, so MLS ID ' + mls + ' was not checked.');
      return Promise.resolve(null);
    }
    var mine = checks[prefix] = (checks[prefix] || 0) + 1;
    say(prefix, 'info', 'Checking MLS ID ' + mls + ' in Cotality...');
    return Promise.resolve().then(function () { return directory.lookupMember(mls); }).then(function (m) {
      if (mine !== checks[prefix]) return null;
      if (!m) {
        say(prefix, 'warn', 'No Cotality member was found for MLS ID ' + mls + '. The listing will be saved without a Cotality agent key.');
        return null;
      }
      write(prefix, 'key', m.key, true);
      write(prefix, 'officeKey', m.officeKey, true);
      write(prefix, 'officeMlsId', m.officeMlsId, true);
      var parts = ['Cotality agent: ' + (m.fullName || mls) + ' (MLS ID ' + mls + ')'];
      if (m.officeName) parts.push('office ' + m.officeName + (m.officeMlsId ? ' (MLS ID ' + m.officeMlsId + ')' : ''));
      var inactive = !!m.status && String(m.status).toLowerCase() !== 'active';
      if (inactive) parts.push('status: ' + m.status);
      say(prefix, inactive ? 'warn' : 'ok', parts.join(' · '));
      return m;
    }).catch(function (err) {
      if (mine === checks[prefix]) say(prefix, 'warn', 'Could not check MLS ID ' + mls + ' in Cotality (' + str(err && err.message ? err.message : err) + ').');
      return null;
    });
  }

  // The signed-in agent: hidden identity, header, the Listing Agent display and (new listing, or an edit with no agent yet) the Contacts tab.
  // opts: { editMode: boolean | () => boolean, updateTable: (type, id, name, company, phone, email) => void, toast: (message, kind) => void }
  function apply(prefix, user, opts) {
    opts = opts || {};
    if (!user) {
      say(prefix, 'warn', 'Could not load your agent profile. Check the Listing Agent before saving.');
      if (typeof opts.toast === 'function') opts.toast('Could not load agent profile. Please verify Listing Agent manually.', 'warning');
      return Promise.resolve(null);
    }
    var editing = typeof opts.editMode === 'function' ? !!opts.editMode() : !!opts.editMode;

    // A saved listing keeps the identity it was saved with: while editing, the session fills only what is empty.
    ['id', 'name', 'phone', 'email', 'license', 'mlsId', 'companyKey', 'companyName'].forEach(function (part) { write(prefix, part, user[part], editing); });

    var headerName = byId('headerAgentName');
    var headerCompany = byId('headerCompanyName');
    if (headerName && user.name) headerName.textContent = user.name;
    if (headerCompany && user.companyName) headerCompany.textContent = user.companyName;

    // the display says what the form will submit: the saved agent while editing, the signed-in agent otherwise
    var display = byId(prefix + 'UpdatingAgentDisplay');
    var mlsId = read(prefix, 'mlsId');
    var shownName = read(prefix, 'name');
    if (display && shownName) display.value = shownName + (mlsId ? ' · MLS ID ' + mlsId : '');

    var listed = byId(prefix + 'ListingAgent');
    if (!(editing && listed && listed.value)) {
      renderContacts(prefix, {
        agentValue: str(user.id), name: str(user.name), phone: str(user.phone), email: str(user.email), license: str(user.license), mlsId: mlsId,
        companyKey: str(user.companyKey), companyName: str(user.companyName),
      }, opts);
    }
    return verify(prefix);
  }

  // A saved listing: its identity goes back into the hidden inputs and the Contacts tab (typed columns first, then agent_info, then raw_data).
  function hydrate(prefix, listing, opts) {
    opts = opts || {};
    listing = obj(listing);
    var raw = obj(listing.raw_data);
    var info = obj(listing.agent_info);
    var pick = function (typed, key) { return str((typed && listing[typed]) || info[key] || raw[key]); };
    var saved = {
      name: pick('list_agent_full_name', 'ListAgentFullName'), phone: pick('list_agent_direct_phone', 'ListAgentDirectPhone'), email: pick('list_agent_email', 'ListAgentEmail'),
      mlsId: pick('list_agent_mls_id', 'ListAgentMlsId'), key: pick(null, 'ListAgentKey'), officeKey: pick(null, 'ListOfficeKey'),
      officeMlsId: pick('list_office_mls_id', 'ListOfficeMlsId'), companyName: pick('list_office_name', 'ListOfficeName'),
    };
    if (!isCotalityId(saved.officeKey)) saved.officeKey = '';   // an older version saved the form's company slug here
    Object.keys(saved).forEach(function (part) { write(prefix, part, saved[part], false); });
    if (saved.name || saved.mlsId) {
      renderContacts(prefix, {
        // the agent dropdown's value must be set even when the listing carries no agent id: a set value is how apply() knows the saved agent owns the tab
        agentValue: str(listing.agent_id) || str(raw[prefix + 'ListingAgent']) || saved.mlsId || read(prefix, 'id') || saved.name,
        name: saved.name || read(prefix, 'name'), phone: saved.phone || read(prefix, 'phone'), email: saved.email || read(prefix, 'email'),
        license: read(prefix, 'license'), mlsId: saved.mlsId || read(prefix, 'mlsId'),
        companyKey: read(prefix, 'companyKey') || 'mallan', companyName: saved.companyName || read(prefix, 'companyName'),
      }, opts);
    }
    var display = byId(prefix + 'UpdatingAgentDisplay');
    var shownName = saved.name || read(prefix, 'name');
    var shownMls = saved.mlsId || read(prefix, 'mlsId');
    if (display && shownName) display.value = shownName + (shownMls ? ' · MLS ID ' + shownMls : '');
    return verify(prefix);
  }

  global.MallanAgentDefaults = { apply: apply, hydrate: hydrate, identity: identity, verify: verify, renderContacts: renderContacts };
})(window);
