// The agent (or broker) who starts a listing is its listing agent, and the listing carries that agent's Cotality identity.
//
// Both Add / Edit forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html) keep the listing agent in hidden <prefix>UpdatingAgent* inputs and show the same agent in
// the Contacts tab. The two forms did this twice, differently, and neither submitted the agent's Cotality MLS ID: those hidden inputs sit outside the area the save
// routine sweeps, so ListAgentMlsId reached the server blank on every listing. This module is the one place that
//
//   apply(prefix, user, opts)       the signed-in user arrived: the header, and (new listing) the listing agent, which is that user;
//   hydrate(prefix, listing, opts)  a saved listing arrived: the listing agent is the one the listing carries;
//   identity(prefix)                the provider keys the form submits: ListAgentMlsId / ListAgentKey / ListAgentFullName / ListAgentEmail / ListAgentDirectPhone and
//                                   ListOfficeName / ListOfficeKey / ListOfficeMlsId;
//   verify(prefix)                  asks the live Cotality Member directory (MallanDirectory.lookupMember) for the agent's MemberKey and office and says what it found.
//
// Who the listing agent is, whichever of the two arrives first (every change recomputes the whole identity from what is known, so no order leaves a trace):
//   - a NEW listing: the signed-in user;
//   - a SAVED listing: the agent the listing carries (typed columns, then agent_info, then raw_data), never the signed-in user's. A broker may edit any listing, so the
//     signed-in user is used to fill what the listing lacks ONLY when the listing IS the signed-in user's own (listing.agent_id) and does not name another agent.
//   - beginEdit(prefix), called when the page is opened with ?id=, says "a saved listing is on its way": until it arrives nobody is shown or submitted as the agent.
// Provider facts come only from live Cotality. A Cotality key or office id the directory did not return is left out, never guessed; a key is attached only when the
// directory's member carries the name of the agent the listing names; and the form's own company slug ("mallan", which an older version submitted as ListOfficeKey) is
// not a Cotality key and is never sent as one. Every text is written with textContent: directory and profile text is never interpreted as markup.
(function (global) {
  'use strict';

  // <prefix> + suffix is the id of the hidden input that holds each part of the identity
  var HIDDEN = {
    id: 'UpdatingAgent', name: 'UpdatingAgentName', phone: 'UpdatingAgentPhone', email: 'UpdatingAgentEmail', license: 'UpdatingAgentLicense',
    mlsId: 'UpdatingAgentMlsId', key: 'UpdatingAgentKey', officeKey: 'UpdatingAgentOfficeKey', officeMlsId: 'UpdatingAgentOfficeMlsId',
    companyKey: 'UpdatingAgentCompanyKey', companyName: 'UpdatingAgentCompanyName',
  };
  var PARTS = Object.keys(HIDDEN);
  var checks = {};   // prefix -> sequence number of the latest Cotality check, so a slow older answer never overwrites a newer one
  var states = {};   // prefix -> { user, listing, editing, me (the signed-in user is the listing agent), legacyOfficeKey }

  function state(prefix) { return states[prefix] || (states[prefix] = { user: null, listing: null, editing: false, me: false, legacyOfficeKey: false }); }
  function byId(id) { return document.getElementById(id); }
  function str(v) { return v === undefined || v === null || typeof v === 'object' ? '' : String(v).trim(); }
  function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  // Cotality office keys and MLS ids are digit strings (Property.ListOfficeKey 5671398 is Office.OfficeKey). Anything else in an office key is not one.
  function isCotalityId(v) { return /^\d+$/.test(str(v)); }

  function hiddenEl(prefix, part) { return byId(prefix + HIDDEN[part]); }
  function read(prefix, part) { var el = hiddenEl(prefix, part); return el ? str(el.value) : ''; }
  function write(prefix, part, value) { var el = hiddenEl(prefix, part); if (el) el.value = str(value); }
  function text(id, value) { var el = byId(id); if (el) el.textContent = value; }

  function say(prefix, kind, message) {
    var el = byId(prefix + 'AgentCotalityStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'text-[11px] mt-1 ' + (kind === 'ok' ? 'text-green-700' : kind === 'warn' ? 'text-amber-700' : 'text-gray-500');
    el.style.overflowWrap = 'anywhere';
  }

  // The provider keys the form submits for the listing agent. The first five are always present (a blank is filled from the session by the server); the Cotality keys are
  // present only when the directory returned them (or the saved listing carries them). A saved office key that is not a Cotality key (the old company slug) is cleared.
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
    else if (state(prefix).legacyOfficeKey) out.ListOfficeKey = '';
    var officeMlsId = read(prefix, 'officeMlsId');
    if (officeMlsId) out.ListOfficeMlsId = officeMlsId;
    return out;
  }

  // The agent a saved listing carries: typed columns first, then agent_info, then raw_data.
  function savedAgent(listing) {
    var raw = obj(listing.raw_data);
    var info = obj(listing.agent_info);
    var pick = function (typed, key) { return str((typed && listing[typed]) || info[key] || raw[key]); };
    var officeKey = pick(null, 'ListOfficeKey');
    return {
      id: str(listing.agent_id),
      name: pick('list_agent_full_name', 'ListAgentFullName'), phone: pick('list_agent_direct_phone', 'ListAgentDirectPhone'), email: pick('list_agent_email', 'ListAgentEmail'),
      mlsId: pick('list_agent_mls_id', 'ListAgentMlsId'), key: pick(null, 'ListAgentKey'),
      officeKey: isCotalityId(officeKey) ? officeKey : '', officeMlsId: pick('list_office_mls_id', 'ListOfficeMlsId'), companyName: pick('list_office_name', 'ListOfficeName'),
      legacyOfficeKey: !!officeKey && !isCotalityId(officeKey),   // an older version saved the form's company slug here
    };
  }

  function ownedBySession(s) { return !!(s.user && s.listing && str(s.listing.agent_id) && str(s.listing.agent_id) === str(s.user.id)); }

  // The signed-in user may fill in what a saved listing lacks only when the listing's agent IS the signed-in user: the listing is theirs (agent_id) and, when it names an
  // agent, it names them. (A broker can edit any listing; a listing a broker owns can still name another agent.)
  function isSessionAgent(s, saved) {
    return ownedBySession(s) && sameAgent(saved.name, str(s.user.name));
  }

  // The whole identity from what is known now, or null while a saved listing is still on its way.
  function compute(prefix) {
    var s = state(prefix);
    var u = s.user || {};
    if (s.listing) {
      var a = savedAgent(s.listing);
      var me = isSessionAgent(s, a);
      return {
        id: a.id, name: a.name || (me ? str(u.name) : ''), phone: a.phone || (me ? str(u.phone) : ''), email: a.email || (me ? str(u.email) : ''),
        license: me ? str(u.license) : '', mlsId: a.mlsId || (me ? str(u.mlsId) : ''),
        key: a.key, officeKey: a.officeKey, officeMlsId: a.officeMlsId,
        companyKey: str(u.companyKey) || 'mallan', companyName: a.companyName || (me ? str(u.companyName) : ''),
        legacyOfficeKey: a.legacyOfficeKey, mine: me,
      };
    }
    if (s.editing || !s.user) return null;
    return {
      id: str(u.id), name: str(u.name), phone: str(u.phone), email: str(u.email), license: str(u.license), mlsId: str(u.mlsId), key: '', officeKey: '', officeMlsId: '',
      companyKey: str(u.companyKey), companyName: str(u.companyName), legacyOfficeKey: false, mine: true,
    };
  }

  // The agent dropdown lists the agents of a company: the listing agent is one of them, so the agent can be picked again after the company is.
  function registerAgent(a) {
    var directory = global.rebnyAgents;
    if (!directory || !a.companyKey || !a.agentValue) return;
    var list = directory[a.companyKey];
    if (!Array.isArray(list)) list = directory[a.companyKey] = [];
    var entry = { id: a.agentValue, mlsId: a.mlsId || '', name: a.name || '', phone: a.phone || '', email: a.email || '', license: a.license || '' };
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === entry.id) { list[i] = entry; return; }
    list.push(entry);
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
    registerAgent(a);
    if (opts && typeof opts.updateTable === 'function' && (a.agentValue || a.name)) {
      opts.updateTable('listing', a.mlsId || '--', a.name || '', a.companyName || '', a.phone || '--', a.email || '--');
    }
  }

  // The tab shows nobody: a listing whose agent is not known to this page.
  function clearContacts(prefix) {
    var agent = byId(prefix + 'ListingAgent');
    if (agent) agent.value = '';
    var search = byId(prefix + 'ListingAgentSearch');
    if (search) search.value = '';
    var panel = byId(prefix + 'ListingAgentInfo');
    if (panel) panel.style.display = 'none';
  }

  // A normalised name's words, for comparing a Cotality member with the agent a listing names: the same family name and the same first initial ("Mike Smith" and
  // "Michael Smith" are one person, "Dara Dixon" and "Paeder Varnam" are not).
  function words(name) { return str(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); }
  function sameAgent(a, b) {
    var x = words(a), y = words(b);
    if (!x.length || !y.length) return true;                       // nothing to compare
    if (x.length === 1 || y.length === 1) return x[0] === y[0] || x[x.length - 1] === y[y.length - 1];
    return x[x.length - 1] === y[y.length - 1] && x[0].charAt(0) === y[0].charAt(0);
  }

  // Ask live Cotality which Member this MLS ID is, and keep the agent's MemberKey and office (OfficeKey / OfficeMlsId) for the submission.
  function verify(prefix) {
    var mine = checks[prefix] = (checks[prefix] || 0) + 1;     // every call supersedes the one before it, including a call that ends without asking
    var s = state(prefix);
    var mls = read(prefix, 'mlsId');
    if (!mls) {
      say(prefix, 'warn', s.listing && !s.me
        ? 'This listing has no Cotality MLS ID for its agent, so it cannot be matched to that agent in Cotality.'
        : 'Your agent profile has no Cotality MLS ID, so this listing cannot be matched to your Cotality agent record. Ask a broker to add it to your profile.');
      return Promise.resolve(null);
    }
    if (!isCotalityId(mls)) {
      say(prefix, 'warn', 'MLS ID "' + mls + '" is not a Cotality MLS ID (digits only), so it was not checked.');
      return Promise.resolve(null);
    }
    var directory = global.MallanDirectory;
    if (!directory || typeof directory.lookupMember !== 'function') {
      say(prefix, 'warn', 'The Cotality directory is not available, so MLS ID ' + mls + ' was not checked.');
      return Promise.resolve(null);
    }
    var who = read(prefix, 'name');
    say(prefix, 'info', 'Checking MLS ID ' + mls + ' in Cotality...');
    return Promise.resolve().then(function () { return directory.lookupMember(mls); }).then(function (m) {
      if (mine !== checks[prefix]) return null;
      if (!m) {
        say(prefix, 'warn', 'No Cotality member was found for MLS ID ' + mls + '. The listing will be saved without a Cotality agent key.');
        return null;
      }
      if (!sameAgent(who, m.fullName)) {
        say(prefix, 'warn', 'MLS ID ' + mls + ' belongs to ' + str(m.fullName) + ' in Cotality, not to ' + who + ', so no Cotality key was attached.');
        return null;
      }
      if (!read(prefix, 'key')) write(prefix, 'key', m.key);
      if (!isCotalityId(read(prefix, 'officeKey'))) write(prefix, 'officeKey', m.officeKey);
      if (!read(prefix, 'officeMlsId')) write(prefix, 'officeMlsId', m.officeMlsId);
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

  // Put the identity that is known now into the hidden inputs, the display and the Contacts tab, then check it with Cotality.
  function refresh(prefix, opts) {
    var s = state(prefix);
    var parts = compute(prefix);
    if (!parts) return Promise.resolve(null);
    s.me = !!parts.mine;
    s.legacyOfficeKey = !!parts.legacyOfficeKey;
    PARTS.forEach(function (part) { write(prefix, part, parts[part]); });
    var display = byId(prefix + 'UpdatingAgentDisplay');
    if (display) display.value = parts.name ? parts.name + (parts.mlsId ? ' · MLS ID ' + parts.mlsId : '') : '';
    if (parts.name || parts.mlsId) {
      renderContacts(prefix, {
        // the agent dropdown's value must be set even when the listing carries no agent id: a set value is how the page knows the tab is filled
        agentValue: parts.id || parts.mlsId || parts.name, name: parts.name, phone: parts.phone, email: parts.email, license: parts.license, mlsId: parts.mlsId,
        companyKey: parts.companyKey, companyName: parts.companyName,
      }, opts);
    } else {
      clearContacts(prefix);
    }
    return verify(prefix);
  }

  // The signed-in user arrived. The header is always theirs; the listing agent is theirs only on a new listing (or a saved one they own).
  // opts: { updateTable: (type, id, name, company, phone, email) => void, toast: (message, kind) => void }
  function apply(prefix, user, opts) {
    opts = opts || {};
    var s = state(prefix);
    if (!user) {
      say(prefix, 'warn', 'Could not load your agent profile. Check the Listing Agent before saving.');
      if (typeof opts.toast === 'function') opts.toast('Could not load agent profile. Please verify Listing Agent manually.', 'warning');
      return Promise.resolve(null);
    }
    s.user = user;
    var headerName = byId('headerAgentName');
    var headerCompany = byId('headerCompanyName');
    if (headerName && user.name) headerName.textContent = user.name;
    if (headerCompany && user.companyName) headerCompany.textContent = user.companyName;
    return refresh(prefix, opts);
  }

  // The page was opened to edit a saved listing, which has not arrived yet: nobody is its listing agent until it does (a signed-in user who got here first must not
  // be shown, or submitted, as the agent of a listing that may be somebody else's).
  function beginEdit(prefix) {
    state(prefix).editing = true;
    checks[prefix] = (checks[prefix] || 0) + 1;                // a Cotality check still on its way was about the agent that was just taken away
    PARTS.forEach(function (part) { write(prefix, part, ''); });
    var display = byId(prefix + 'UpdatingAgentDisplay');
    if (display) display.value = '';
    text(prefix + 'AgentCotalityStatus', '');
    clearContacts(prefix);
  }

  // A saved listing arrived: its own agent is the listing agent.
  function hydrate(prefix, listing, opts) {
    state(prefix).listing = obj(listing);
    return refresh(prefix, opts || {});
  }

  global.MallanAgentDefaults = { apply: apply, hydrate: hydrate, beginEdit: beginEdit, identity: identity, verify: verify, renderContacts: renderContacts };
})(window);
