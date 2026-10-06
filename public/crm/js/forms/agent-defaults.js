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
//   - a page opened with ?id= is editing a saved listing from its first moment: until the listing arrives nobody is shown or submitted as the agent. (MallanAPI.onReady
//     calls back at once when the auth gate has already resolved, which is before the page looks at its own address, so the module reads ?id= itself, as the pages do;
//     beginEdit(prefix) is a page saying the same thing, and wipes what an earlier apply showed.)
// Provider facts come only from live Cotality. A Cotality key or office id the directory did not return is left out, never guessed. A key is attached only when the
// directory's member is the agent the listing names (see compareNames: the same family name and a given name that is the same, an initial of it, or a nickname of it);
// when Cotality says the MLS ID belongs to somebody else, the agent key the listing was saved with is removed (it cannot be this agent's; the office stays, it is the
// listing's own); when the directory's member IS the agent, the member's keys replace any the listing was saved with (a listing saved by an older version can carry another
// agent's). The form's own company slug ("mallan", which an older version submitted as ListOfficeKey) is not a Cotality key and is never sent as one. Every text is
// written with textContent: directory and profile text is never interpreted as markup.
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
  // prefix -> { user, listing, editing, me (the signed-in user is the listing agent), legacyOfficeKey, verdict (what Cotality last said about the agent in the inputs),
  //             clearAgentKey (Cotality says the MLS ID is somebody else's and the listing was saved with an agent key: the save must replace it with a blank) }
  var states = {};

  function state(prefix) {
    return states[prefix] || (states[prefix] = { user: null, listing: null, editing: false, me: false, legacyOfficeKey: false, verdict: null, clearAgentKey: false });
  }
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

  // The page was opened with ?id=: a saved listing is on its way, whether or not the page has said so yet.
  function editPage() {
    try { return !!new global.URLSearchParams(global.location.search).get('id'); } catch (e) { return false; }
  }

  // The provider keys the form submits for the listing agent. The first five are always present (a blank is filled from the session by the server); the Cotality keys are
  // present only when the directory returned them (or the saved listing carries them). A saved office key that is not a Cotality key (the old company slug) is cleared.
  function identity(prefix) {
    var s = state(prefix);
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
    else if (s.legacyOfficeKey) out.ListOfficeKey = '';
    var officeMlsId = read(prefix, 'officeMlsId');
    if (officeMlsId) out.ListOfficeMlsId = officeMlsId;
    // Cotality says the MLS ID is somebody else's: the agent key the listing was saved with is not this agent's. An explicit blank replaces it (a save merges into what is
    // stored, so leaving the key out would keep it).
    if (s.clearAgentKey) out.ListAgentKey = '';
    return out;
  }

  // The agent a saved listing carries: typed columns first, then agent_info, then raw_data (each read as text before the next is tried: an object in a typed column
  // is not a value, and must not hide the one behind it).
  function savedAgent(listing) {
    var raw = obj(listing.raw_data);
    var info = obj(listing.agent_info);
    var pick = function (typed, key) { return (typed && str(listing[typed])) || str(info[key]) || str(raw[key]); };
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
  // agent, it does not name somebody else. (A broker can edit any listing; a listing a broker owns can still name another agent.) A name too short to tell is not a
  // contradiction: the listing being theirs is the evidence.
  function isSessionAgent(s, saved) {
    return ownedBySession(s) && compareNames(saved.name, str(s.user.name)) !== 'different';
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
    if (s.editing || editPage() || !s.user) return null;
    return {
      id: str(u.id), name: str(u.name), phone: str(u.phone), email: str(u.email), license: str(u.license), mlsId: str(u.mlsId), key: '', officeKey: '', officeMlsId: '',
      companyKey: str(u.companyKey), companyName: str(u.companyName), legacyOfficeKey: false, mine: true,
    };
  }

  // The listing-agent dropdown lists the agents of a company: the listing agent is one of them, so the agent can be picked again after the company is. (The buyer's and
  // the tenant's agent dropdowns read their own list, rebnyAgents: the listing agent is not offered there as the other side's agent.)
  function registerAgent(a) {
    var directory = global.rebnyListingAgents;
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

  // The tab shows nobody: a listing whose agent is not known to this page. (The panel is hidden, but the page reads its text: "use the exclusive agent's contact" copies it
  // into the showing instructions.)
  function clearContacts(prefix) {
    var agent = byId(prefix + 'ListingAgent');
    if (agent) agent.value = '';
    var search = byId(prefix + 'ListingAgentSearch');
    if (search) search.value = '';
    var panel = byId(prefix + 'ListingAgentInfo');
    if (panel) panel.style.display = 'none';
    ['ListingAgentId', 'ListingAgentPhone', 'ListingAgentEmail', 'ListingAgentLicense'].forEach(function (suffix) { text(prefix + suffix, '--'); });
  }

  // ── comparing names ──
  // Two names are compared the way people compare names, not letter by letter: accents are folded ("José García" is "Jose Garcia"), punctuation goes ("O'Brien" is
  // "OBrien") and titles and suffixes ("Dr.", "Jr.", "Esq.") are not part of a name. What a name decides here is whose Cotality key a listing carries, so a name has THREE
  // answers: 'same' (the same family name, and a given name that is the same, an initial of it, or a nickname of it), 'different', and 'unknown' (not enough to tell: a name
  // of one word, or no letters at all).
  var NOT_NAMES = { mr: 1, mrs: 1, ms: 1, miss: 1, dr: 1, jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, esq: 1, md: 1, phd: 1 };
  // The nicknames of each given name. A nickname that can stand for two given names ("Chris": Christopher or Christina, "Pat": Patrick or Patricia) is a nickname of both,
  // and matches either; two different given names never match each other. Add a nickname here when a real agent is refused for the name they use.
  var NICKNAMES = {
    alexander: 'xander', alexandra: 'lexi', andrew: 'andy drew', anthony: 'tony', barbara: 'barb barbie', benjamin: 'ben benny', charles: 'charlie chuck', christopher: 'chris topher',
    christina: 'chris tina', daniel: 'dan danny', david: 'dave davey', deborah: 'debbie deb debra', donald: 'don donnie', edward: 'ed eddie ted', elizabeth: 'liz lizzie beth betty eliza libby',
    frederick: 'fred freddie', geoffrey: 'geoff', gregory: 'greg', henry: 'hank harry', jacob: 'jake', james: 'jim jimmy jamie', jeffrey: 'jeff', jennifer: 'jen jenny',
    jessica: 'jess jessie', john: 'jack johnny', joseph: 'joe joey', joshua: 'josh', katherine: 'catherine kathryn katharine kate katie kathy cathy kat', kenneth: 'ken kenny',
    lawrence: 'larry', margaret: 'maggie meg peggy marge margie', matthew: 'matt', michael: 'mike mikey mick', nicholas: 'nick nicky', patricia: 'pat patty trish', patrick: 'pat paddy',
    peter: 'pete', rebecca: 'becky becca', richard: 'rick rich ricky dick', robert: 'rob robbie bob bobby', ronald: 'ron ronnie', samuel: 'sam sammy', samantha: 'sam sammy',
    stephen: 'steven steve', susan: 'sue susie suzy', theodore: 'theo ted', thomas: 'tom tommy', timothy: 'tim timmy', victoria: 'vicky vicki tori', walter: 'walt wally',
    william: 'will bill billy willy liam', zachary: 'zach zack',
  };
  var STANDS_FOR = (function () {
    var of = {};
    Object.keys(NICKNAMES).forEach(function (given) {
      NICKNAMES[given].split(' ').forEach(function (nick) { (of[nick] = of[nick] || []).push(given); });
    });
    return of;
  })();
  function givenNames(word) { return [word].concat(STANDS_FOR[word] || []); }

  function words(name) {
    return str(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’`]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter(function (w) { return w && !NOT_NAMES[w]; });
  }
  function sameGiven(p, q) {
    if (p.length === 1) return q.charAt(0) === p;            // "J." is "John"
    if (q.length === 1) return p.charAt(0) === q;
    var gq = givenNames(q);
    return givenNames(p).some(function (g) { return gq.indexOf(g) !== -1; });
  }
  function compareNames(a, b) {
    var x = words(a), y = words(b);
    if (!x.length || !y.length) return 'unknown';
    if (x.length === 1 && y.length === 1) return x[0] === y[0] ? 'same' : 'different';
    if (x.length === 1 || y.length === 1) {
      // one word is a family name or a given name: it can agree with a longer name, never prove it
      var one = x.length === 1 ? x[0] : y[0], many = x.length === 1 ? y : x;
      return one === many[many.length - 1] || many.slice(0, -1).some(function (given) { return sameGiven(one, given); }) ? 'unknown' : 'different';
    }
    if (x[x.length - 1] !== y[y.length - 1]) return 'different';
    var gx = x.slice(0, -1), gy = y.slice(0, -1);
    return gx.some(function (p) { return gy.some(function (q) { return sameGiven(p, q); }); }) ? 'same' : 'different';
  }

  // What the last conclusive Cotality answer says about the agent now in the inputs. It outlives a refresh (apply and hydrate rewrite the inputs from what is known, and
  // the same agent must not lose the keys Cotality gave them in between).
  function applyVerdict(prefix) {
    var s = state(prefix);
    var v = s.verdict;
    var clearing = s.clearAgentKey;                         // applied twice in a row (a refresh, then the answer), the second call must not forget the first found a key
    s.clearAgentKey = false;
    if (!v || v.mls !== read(prefix, 'mlsId') || v.name !== read(prefix, 'name')) return;
    if (v.result === 'same') {
      if (v.key) write(prefix, 'key', v.key);
      if (isCotalityId(v.officeKey)) write(prefix, 'officeKey', v.officeKey);
      if (v.officeMlsId) write(prefix, 'officeMlsId', v.officeMlsId);
    } else {
      s.clearAgentKey = clearing || !!read(prefix, 'key');   // only a key the listing was saved with needs an explicit blank to be replaced
      write(prefix, 'key', '');
    }
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
        say(prefix, 'warn', 'No Cotality member was found for MLS ID ' + mls + ', so no Cotality agent key was confirmed for this listing.');
        return null;
      }
      var member = str(m.fullName);
      // an MLS ID with no name on the listing, or a member with none: nothing contradicts the directory
      var same = who && member ? compareNames(who, member) : 'same';
      if (same === 'different') {
        var had = s.clearAgentKey || !!read(prefix, 'key');
        s.verdict = { mls: mls, name: who, result: 'different' };
        applyVerdict(prefix);
        say(prefix, 'warn', 'MLS ID ' + mls + ' belongs to ' + member + ' in Cotality, not to ' + who + ', so no Cotality key was attached'
          + (had ? ' and the agent key saved with this listing was removed' : '') + '.' + (s.me ? ' Ask a broker to correct your agent profile.' : ''));
        return null;
      }
      if (same === 'unknown') {
        say(prefix, 'warn', 'Cotality lists MLS ID ' + mls + ' under ' + member + ', but the name here (' + who + ') is too short to confirm it is the same person, so no Cotality key was attached.'
          + (s.me ? ' Ask a broker to complete your agent profile.' : ''));
        return null;
      }
      // the member IS the agent: Cotality's keys replace any the listing was saved with
      s.verdict = { mls: mls, name: who, result: 'same', key: str(m.key), officeKey: str(m.officeKey), officeMlsId: str(m.officeMlsId) };
      applyVerdict(prefix);
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
    applyVerdict(prefix);
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

  // A saved listing is on its way (a page that says so itself: the module already knows it when the address carries ?id=): nobody is its listing agent until it arrives
  // (a signed-in user who got here first must not be shown, or submitted, as the agent of a listing that may be somebody else's).
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

  global.MallanAgentDefaults = { apply: apply, hydrate: hydrate, beginEdit: beginEdit, identity: identity, verify: verify, renderContacts: renderContacts, compareNames: compareNames };
})(window);
