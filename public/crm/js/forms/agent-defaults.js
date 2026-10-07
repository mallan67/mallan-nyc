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
// directory's member is the agent the listing names (see compareNames: the same family name and given names that agree, an initial or a nickname of one); only when the
// member shares no family name with the agent is the agent key the listing was saved with removed (it cannot be this agent's; the office stays, it is the listing's own);
// a name too doubtful to tell (a family name with a given name that does not agree, a name of one word, another script) attaches nothing and removes nothing. When the
// member IS the agent, the member's agent key replaces any the listing was saved with (a listing saved by an older version can carry another agent's), and the member's
// office fills the listing's office only when the listing has none, or has that same office: the office on a saved listing is the listing's own. The form's own company slug
// ("mallan", which an older version submitted as ListOfficeKey) is not a Cotality key and is never sent as one. Every text is written with textContent: directory and
// profile text is never interpreted as markup.
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

  // The signed-in user may fill in what a saved listing lacks only when the listing's agent IS the signed-in user: the listing is theirs (agent_id) and it names nobody, or
  // names them (compareNames says 'same'). A broker can edit any listing, and a listing a broker owns can still name another agent: a name that is not clearly theirs
  // ('different', or too doubtful to tell) is not them, so nothing of theirs (contact details, licence, MLS ID) goes into somebody else's listing.
  function isSessionAgent(s, saved) {
    return ownedBySession(s) && (!saved.name || compareNames(saved.name, str(s.user.name)) === 'same');
  }

  // The whole identity from what is known now, or null while a saved listing is still on its way.
  function compute(prefix) {
    var s = state(prefix);
    var u = s.user || {};
    if (s.listing) {
      var a = savedAgent(s.listing);
      var me = isSessionAgent(s, a);
      return {
        // agent_id is the listing's owner, and the agent shown and submitted is the one the listing names: when the owner is the signed-in user and the listing names
        // somebody else, the owner's id is not that agent's (the agent picker would carry the broker's id for another person)
        id: ownedBySession(s) && !me ? '' : a.id,
        name: a.name || (me ? str(u.name) : ''), phone: a.phone || (me ? str(u.phone) : ''), email: a.email || (me ? str(u.email) : ''),
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
  // Two names are compared the way people compare names, not letter by letter: accents are folded ("José García" is "Jose Garcia"), so are the letters no accent folds
  // (Søren, Łukasz, Weiß) and the two spellings of a German umlaut (Müller is Muller and Mueller), apostrophes go ("O'Brien" is "OBrien"), and titles, suffixes and
  // credentials ("Dr.", "Jr.", "3rd", ", CPA", "(Mike)") are not part of a name; "Smith, John" is "John Smith".
  // What a name decides here is whose Cotality key a listing carries, and a wrong answer costs differently: a wrong 'same' attaches somebody else's key, a wrong 'different'
  // removes the right one, 'unknown' costs one message. So there are THREE answers, and every doubt goes to the cheap one:
  //   'same'       the same family name (a double or hyphenated one agrees when a part of it does), and given names that agree: the shorter list of them matches a run of the
  //                longer one word for word (a middle name may be left out), a word may be a nickname of the other ("Bob" for "Robert"), and an initial matches only the word
  //                at its own place ("J." is "John", but the middle initial of "Michael J." is not "Jennifer");
  //   'different'  no word of either name is, or nearly is, a word of the other's family part: nothing that could be the same person's name, however it is written;
  //   'unknown'    everything else: a name of one word or in another script, a family name with a given name that does not agree (relatives, a married name, a middle name
  //                used as the first), names too close to call. Nothing is attached and nothing is removed.
  function wordSet(list) { var t = Object.create(null); list.split(' ').forEach(function (w) { t[w] = true; }); return t; }
  var TITLES = wordSet('mr mrs ms miss mx dr');
  var SUFFIXES = wordSet('jr sr ii iii iv 2nd 3rd 4th esq md phd dds mba cpa jd crs gri abr cdpe e-pro sres srs realtor broker');
  // a particle belongs to the family name that follows it: Maria de la Cruz is Cruz, and so is Maria Cruz
  var PARTICLES = wordSet('de del della di da dos das du des la le van von der den ter bin ibn al el st');
  // The nicknames of each given name (one line each: the name, then what it is called). A nickname that can stand for two given names ("Chris": Christopher or Christina,
  // "Pat": Patrick or Patricia) is a nickname of both, and matches either; two different given names never match each other, and a spelling of a name is listed with it.
  // Add a nickname here when a real agent is not recognised under the name they use.
  var STANDS_FOR = Object.create(null);
  [
    'abigail abby abbie', 'albert al bert', 'alan al allan allen', 'alexander alex xander', 'alexandra alex lexi', 'alfred al alf alfie', 'andrew andy drew', 'anthony tony',
    'antonio tony toni', 'barbara barb barbie babs', 'benjamin ben benny benji', 'bernard bernie', 'charles charlie chuck chas', 'charlotte charlie lottie',
    'christina chris tina christy', 'christine chris chrissy tina', 'christopher chris topher kit', 'cynthia cindy cyndi', 'daniel dan danny', 'david dave davey',
    'deborah debbie deb debra', 'dennis denny', 'donald don donnie', 'dorothy dot dottie dolly', 'edward ed eddie ted teddy', 'edwin ed eddie',
    'elizabeth liz lizzie beth betty eliza libby betsy', 'frances fran frannie', 'francis frank fran', 'franklin frank', 'frederick fred freddie', 'geoffrey geoff',
    'gerald jerry gerry', 'gregory greg', 'harold hal harry', 'henry hank harry', 'isabella bella izzy', 'jacob jake', 'james jim jimmy jamie', 'jeffrey jeff',
    'jennifer jen jenny jenn', 'jeremy jerry jem', 'jessica jess jessie', 'john jack johnny jon', 'jonathan jon jonny', 'joseph joe joey', 'joshua josh',
    'katherine catherine kathryn katharine kathrine kate katie kathy cathy kat', 'kathleen kathy kate katie', 'kenneth ken kenny', 'kimberly kim kimmy',
    'lawrence larry laurence', 'leonard leo len lenny', 'madeline maddie maddy madeleine madelyn', 'margaret maggie meg peggy peg marge margie', 'matthew matt',
    'michael mike mikey mick micky', 'mohammed mohammad mohamed mohamad muhammad muhammed mohd md', 'natalie nat', 'nathan nate', 'nathaniel nate nat',
    'nicholas nick nicky', 'nicole nikki nicky nic', 'patricia pat patty trish tricia', 'patrick pat paddy', 'peter pete', 'philip phil phillip', 'rebecca becky becca',
    'richard rick rich ricky dick', 'robert rob robbie bob bobby bert', 'ronald ron ronnie', 'samantha sam sammy', 'samuel sam sammy', 'sandra sandy',
    'sean shawn shaun', 'stephen steven steve stevie', 'susan sue susie suzy', 'theodore theo ted teddy', 'thomas tom tommy', 'timothy tim timmy',
    'victoria vicky vicki tori', 'vincent vince vinny', 'walter walt wally', 'william will bill billy willy liam', 'zachary zach zack zac',
    'christian chris', 'eugene gene', 'raymond ray', 'russell russ', 'randall randy', 'randolph randy', 'stanley stan', 'bradley brad', 'cameron cam', 'dominic dom',
    'gabriel gabe', 'jacqueline jackie', 'josephine josie', 'melissa mel missy', 'olivia liv livvy', 'penelope penny', 'sebastian seb', 'vanessa nessa', 'virginia ginny',
  ].forEach(function (line) {
    var w = line.split(' ');
    w.slice(1).forEach(function (nick) { (STANDS_FOR[nick] || (STANDS_FOR[nick] = [])).push(w[0]); });
  });
  function givenNames(word) { return [word].concat(STANDS_FOR[word] || []); }

  var INITIAL = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]$/u;
  var LATIN = /^[\p{Script=Latin}\p{N}-]+$/u;
  var UNFOLDED = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ð': 'd', 'đ': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i', 'ħ': 'h' };

  // text -> letters and digits in lower case, accents folded (only on Latin letters: a mark can be part of another script's letter), apostrophes gone, every dash a hyphen,
  // every other mark a space. german: an umlaut is written as a vowel and an e (ü is ue) rather than as the vowel alone.
  function fold(text, german) {
    var s = text.normalize('NFC').toLowerCase();
    if (german) s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    return s.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
      .replace(/[ßæœøðđþłıħ]/g, function (c) { return UNFOLDED[c]; })
      .replace(/['’‘`´ʼʻ′]/g, '').replace(/\p{Pd}/gu, '-').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ');
  }
  function words(text, german) {
    return fold(text, german).split(/\s+/).map(function (w) { return w.replace(/^-+|-+$/g, ''); }).filter(Boolean);
  }
  function stripTitles(list) {
    var from = 0, to = list.length;
    while (from < to && TITLES[list[from]]) from++;
    while (to > from && SUFFIXES[list[to - 1]]) to--;
    return list.slice(from, to);
  }
  function unhyphen(w) { return w.replace(/-/g, ''); }
  function meaningful(w) { return !PARTICLES[w] && !INITIAL.test(w); }

  // A name as the comparison reads it, or null when it has no words (or too many to be a name): its words in order, the given names (a hyphenated one stays one word),
  // the family name (the last word, and the particles right before it; the first word is always a given name), and the word lists the comparisons use.
  function parse(raw, german) {
    var text = str(raw).slice(0, 200).replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
    var pieces = text.split(',').map(function (piece) { return stripTitles(words(piece, german)); }).filter(function (piece) { return piece.length; });
    if (!pieces.length || pieces.length > 2) return null;
    var list = pieces.length === 2 ? pieces[1].concat(pieces[0]) : pieces[0];             // "Smith, John" is "John Smith"
    if (list.length > 10) return null;
    var start = list.length - 1;
    while (start > 1 && PARTICLES[list[start - 1]]) start--;
    var family = list.slice(start);
    var split = function (tokens) { return tokens.join('-').split('-').filter(Boolean); };
    var familyParts = split(family).filter(function (w) { return !PARTICLES[w]; });
    return {
      list: list, latin: list.every(function (w) { return LATIN.test(w); }), size: list.filter(meaningful).length,
      given: list.slice(0, start).map(unhyphen), familyKey: family.map(unhyphen).join(''), familyParts: familyParts.length ? familyParts : split(family),
      flat: split(list), all: split(list).filter(meaningful), rest: split(list.slice(1)).filter(meaningful),
    };
  }

  // optimal string alignment: the edits that turn a into b, a swap of two neighbours counting as one
  function distance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  // one word is, or is a slip of the pen from, the other: a word of up to three letters has to be the same, of four to seven may be one edit away, of more two
  function near(p, q) {
    if (p === q) return true;
    var n = Math.min(p.length, q.length);
    if (n < 4) return false;
    return distance(p, q) <= (n >= 8 ? 2 : 1);
  }
  function overlap(as, bs) { return as.some(function (p) { return bs.some(function (q) { return near(p, q); }); }); }

  // two given names: the same word, or nicknames of one name, or an initial and a word that starts with it (only where both stand first)
  function wordMatch(p, q, first) {
    var pi = INITIAL.test(p), qi = INITIAL.test(q);
    if (pi || qi) return first && (pi && qi ? p === q : pi ? q.charAt(0) === p : p.charAt(0) === q);
    return p === q || givenNames(p).some(function (g) { return givenNames(q).indexOf(g) !== -1; });
  }
  function givenMatch(gx, gy) {
    if (gx.join('') === gy.join('')) return true;                                          // "Jean Marc" and "Jean-Marc" and "Jeanmarc"
    var s = gx.length <= gy.length ? gx : gy, l = s === gx ? gy : gx;
    for (var k = 0; k + s.length <= l.length; k++) {
      var i = 0;
      while (i < s.length && wordMatch(s[i], l[k + i], k === 0)) i++;
      if (i === s.length) return true;
    }
    return false;
  }
  function agree(x, y) {
    return x.familyKey === y.familyKey || x.familyParts.some(function (p) { return y.familyParts.indexOf(p) !== -1; });
  }
  // the shorter name, word for word, is a run of the longer one ("Maria Garcia" in "Maria Garcia Lopez"): at least two real words of it, so a family name alone proves nothing
  function contains(x, y) {
    var s = x.flat.length <= y.flat.length ? x : y, l = s === x ? y : x;
    if (s.size < 2) return false;
    for (var k = 0; k + s.flat.length <= l.flat.length; k++) {
      var i = 0;
      while (i < s.flat.length && s.flat[i] === l.flat[k + i]) i++;
      if (i === s.flat.length) return true;
    }
    return false;
  }
  // nothing in the family part of either name (every word but the first) is, or nearly is, anywhere in the other: not "Wei Li" and "Li Wei", not "Maria Garcia Lopez" and "Maria Garcia"
  function conflict(x, y) {
    return x.rest.length > 0 && y.rest.length > 0 && !overlap(x.rest, y.all) && !overlap(y.rest, x.all);
  }
  function compareFolded(a, b, german) {
    var x = parse(a, german), y = parse(b, german);
    if (!x || !y || x.latin !== y.latin) return 'unknown';
    // the same words are the same name, unless the name is one real word in Latin letters (Cher, Smith: nothing says whose), or has no real word at all
    if (x.list.join(' ') === y.list.join(' ')) return !x.latin || x.size > 1 ? 'same' : 'unknown';
    if (x.list.length < 2 || y.list.length < 2) return 'unknown';
    if (agree(x, y)) return givenMatch(x.given, y.given) ? 'same' : 'unknown';
    if (contains(x, y)) return 'same';
    return conflict(x, y) ? 'different' : 'unknown';
  }
  function compareNames(a, b) {
    var plain = compareFolded(a, b, false), german = compareFolded(a, b, true);
    if (plain === 'same' || german === 'same') return 'same';
    return plain === 'different' && german === 'different' ? 'different' : 'unknown';
  }
  // The name as the comparison reads it: two spellings of one name (a double space, a title, the order of "Smith, John") are one key.
  function nameKey(name) {
    var plain = parse(name, false), german = parse(name, true);
    return plain && german ? plain.list.join(' ') + '|' + german.list.join(' ') : str(name);
  }

  // What the last conclusive Cotality answer says about the agent now in the inputs. It outlives a refresh (apply and hydrate rewrite the inputs from what is known, and
  // the same agent must not lose the keys Cotality gave them in between).
  function applyVerdict(prefix) {
    var s = state(prefix);
    var v = s.verdict;
    s.clearAgentKey = false;
    if (!v || v.mls !== read(prefix, 'mlsId') || v.name !== nameKey(read(prefix, 'name'))) return;
    if (v.result === 'same') {
      if (v.key) write(prefix, 'key', v.key);                // the member's own key replaces whatever the listing was saved with
      // the office on a saved listing is the listing's own (the agent may have moved since): the member's office fills an office the listing lacks, or completes the one it has
      var officeKey = read(prefix, 'officeKey'), officeMlsId = read(prefix, 'officeMlsId');
      var thatOffice = (!!v.officeMlsId && officeMlsId === v.officeMlsId) || (!!v.officeKey && officeKey === v.officeKey);
      if (!(officeKey || officeMlsId) || thatOffice) {
        if (isCotalityId(v.officeKey)) write(prefix, 'officeKey', v.officeKey);
        if (v.officeMlsId) write(prefix, 'officeMlsId', v.officeMlsId);
      }
    } else {
      s.clearAgentKey = !!s.listing && !!savedAgent(s.listing).key;   // only a key the listing was saved with needs an explicit blank to be replaced
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
        s.verdict = { mls: mls, name: nameKey(who), result: 'different' };
        applyVerdict(prefix);
        say(prefix, 'warn', 'MLS ID ' + mls + ' belongs to ' + member + ' in Cotality, not to ' + who + ', so no Cotality key was attached'
          + (s.clearAgentKey ? ' and the agent key saved with this listing was removed' : '') + '.' + (s.me ? ' Ask a broker to correct your agent profile.' : ''));
        return null;
      }
      if (same === 'unknown') {
        say(prefix, 'warn', 'Cotality lists MLS ID ' + mls + ' under ' + member + ', but the name here (' + who + ') could not be confirmed as the same person, so no Cotality key was attached.'
          + (s.me ? ' Ask a broker to check your agent profile.' : ''));
        return null;
      }
      // the member IS the agent: Cotality's agent key replaces any the listing was saved with
      s.verdict = { mls: mls, name: nameKey(who), result: 'same', key: str(m.key), officeKey: str(m.officeKey), officeMlsId: str(m.officeMlsId) };
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
