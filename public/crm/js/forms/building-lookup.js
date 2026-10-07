// Address -> building, shared by the Sale and Rental Add / Edit forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html).
//
// An agent types the property's address; the form looks the building up (GET /api/buildings/search, the CRM's own building index fed by Cotality), picks the building when
// the address names exactly one, fills the area and the building's facts, and sets the property type from the building's Cotality CommonInterest (Condominium, Stock
// Cooperative, Condop, Rental Building). This module is the part both forms share:
//
//   normalizeAddress(text)           "200 East 66th Street" and "200 E 66th St" are the same address
//   splitAddress(text)               what an agent typed into the street box: { street, unit }. "200 East 66th Street Apt 12B" and "200 East 66th Street, New York, NY 10065" are
//                                    the street address 200 East 66th Street (and the first is unit 12B): the building index is asked for the street address, and the typed
//                                    address is compared by it. A word like "Unit" is a unit designator only after a street address ("1 Unit Street" is a street).
//   searchText(text)                 the street address of splitAddress
//   exactMatch(matches, typed)       the one candidate whose address IS the typed address, or null: none, or several candidates with that address (two buildings in two boroughs
//                                    can share one), is not a match. A lone candidate is a match only if its address is the typed one.
//   boroughValue(text)               the form's Borough option for a spelling the index may use ("Staten Island", "Kings", "manhattan"), or "" for what is not a borough
//   renderResults(box, matches, fn)  the candidates, written with DOM calls: a building's name, address and neighborhood come from the database and from what agents typed
//                                    (building names are saved from the forms), and are never markup. A click calls fn(building): the row the agent clicked, not "the building
//                                    with that address"
//   message(box, text) / unavailable(box)   a one-line message in the results box; the second says the index could not answer (that is not "no match": nothing was asked)
//   watch(prefix)                    the form's address box: remember that the agent typed in it (a lookup runs only for an address somebody typed, never for one the
//                                    form filled in from a saved listing or a draft), and release the property type again when the address no longer names the building
//   typed(prefix) / resolved(prefix) the two halves of that: should a lookup run, and the lookup has been answered (an address the index could not answer stays typed, so
//                                    leaving the box again asks again). What was typed counts only while the box still says it: a form that rewrites the box (a saved listing
//                                    loading after the agent typed) is not an agent typing
//   snapshot() / record(prefix, snapshot) / undo(prefix)   what a lookup wrote: the page takes a snapshot of every control before it applies a building and records the difference
//                                    after; undo puts back what the lookup wrote when another building replaces the building, or the address no longer names it, and leaves
//                                    every control the agent has changed since alone
//   setSelect(select, value)         write a <select> only with an option it has (a comma list takes the first member it has): an answer the control has no option for never
//                                    blanks what the agent chose
//   isApplied / hasApplied / markApplied / reset  which building the form last applied (by address, borough and zip). The same building applied again (the agent left the address box and
//                                    came back) must not overwrite what the agent has changed since in the Building tab, so a lookup that finds it again applies nothing; a
//                                    building the agent clicks in a list is applied again
//   forget(prefix)                   the form holds another record now (a draft restored, a saved listing loaded): no building is applied or locked, no address counts as typed,
//                                    and nothing the lookup wrote is left to take back (the record's own values stand)
//   lock(prefix, building) / unlock(prefix) / overridden   the property type a building's Cotality record names is LOCKED (the radios are disabled and a notice beside them
//                                    says so) until the agent presses Override, so a co-op's fields cannot be left half co-op, half condo by a stray click. Only a CommonInterest
//                                    classification locks: a type read from the property sub-type is a suggestion. The notice sits with the radios, not in the match banner,
//                                    because the banner is hidden by other things (an In-House listing type clears it) and the agent must always see why the type is fixed.
//                                    An Override is remembered for that building (until another building is applied): finding it again neither sets its type nor locks it.
(function (global) {
  'use strict';

  var DIRECTIONS = { east: 'e', west: 'w', north: 'n', south: 's', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
  var SUFFIXES = {
    street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', place: 'pl', court: 'ct', lane: 'ln', terrace: 'ter', parkway: 'pkwy', plaza: 'plz', circle: 'cir',
  };
  // The Cotality CommonInterest members that classify a building, with the label the agent sees.
  var CLASSIFICATIONS = { Condo: 'Condo', Coop: 'Co-op', Condop: 'Condop', RentalBuilding: 'Rental building' };
  var COMMON_INTEREST = { Condo: 'Condominium', Coop: 'StockCooperative', Condop: 'Condop', RentalBuilding: 'RentalBuilding' };
  // The five boroughs as the forms' Borough controls name them (the option values), with the other ways the index can spell one: a borough's own name, and its county
  // (Kings is Brooklyn, Richmond is Staten Island, New York County is Manhattan). "New York" alone is the city, not a borough, so it names none.
  var BOROUGHS = {
    manhattan: 'Manhattan', newyorkcounty: 'Manhattan', brooklyn: 'Brooklyn', kings: 'Brooklyn', kingscounty: 'Brooklyn', queens: 'Queens', queenscounty: 'Queens',
    bronx: 'Bronx', thebronx: 'Bronx', bronxcounty: 'Bronx', statenisland: 'StatenIsland', richmond: 'StatenIsland', richmondcounty: 'StatenIsland',
  };

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = content;
    return node;
  }
  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function str(value) { return String(value === undefined || value === null ? '' : value); }
  // A word of an address is looked up in a table of the module's own: "constructor" (and "__proto__") is a word of a street name, not a member of the table
  function own(table, key) { return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined; }

  function normalizeAddress(value) {
    return str(value).toLowerCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean).map(function (token) {
      token = token.replace(/^(\d+)(?:st|nd|rd|th)$/, '$1');
      return own(DIRECTIONS, token) || own(SUFFIXES, token) || token;
    }).join(' ');
  }

  // A unit designator closes a street address: "Apt 12B", "Unit 4", "#12B", "Ste 200", "Fl 3" (a floor of a street address is a unit too). It only counts after at least
  // two words of street address, so "1 Unit Street" stays a street.
  var DESIGNATOR = '(?:apt|apartment|unit|ste|suite|fl|floor|rm|room)\\.?\\s+#?\\s*';
  // (a designator that has its own "#" -- "Apt #12B", "Ste #200" -- is read before the bare "#", or the designator would stay in the street)
  var UNIT_TAIL = new RegExp('^(.*?\\S)\\s+(?:' + DESIGNATOR + '|#\\s*)([\\w-]+)\\s*$', 'i');
  var UNIT_PIECE = new RegExp('^(?:#\\s*|' + DESIGNATOR + ')([\\w-]+)$', 'i');
  function splitAddress(value) {
    var pieces = str(value).split(',');
    var street = pieces[0].replace(/\s+/g, ' ').trim();                                       // before the first comma: the rest is a unit, a city, a state and a zip
    var unit = '';
    if (pieces.length > 1) {
      var inPiece = UNIT_PIECE.exec(pieces[1].replace(/\s+/g, ' ').trim());
      if (inPiece) unit = inPiece[1];
    }
    var m = UNIT_TAIL.exec(street);
    if (m && m[1].trim().split(' ').length >= 2) { street = m[1].trim(); unit = unit || m[2]; }
    return { street: street, unit: unit };
  }
  function searchText(value) { return splitAddress(value).street; }

  function exactMatch(matches, typedAddress) {
    var want = normalizeAddress(searchText(typedAddress));
    if (!want || !Array.isArray(matches)) return null;
    var same = matches.filter(function (b) { return b && normalizeAddress(b.address) === want; });
    return same.length === 1 ? same[0] : null;
  }

  function boroughValue(value) {
    var key = str(value).toLowerCase().replace(/[^a-z]/g, '');
    if (/ny$/.test(key)) key = key.slice(0, -2);                                                              // "Manhattan, NY" (no borough's own name ends in "ny")
    return Object.prototype.hasOwnProperty.call(BOROUGHS, key) ? BOROUGHS[key] : '';
  }

  function badge(model) {
    return model === 'Coop' ? 'bg-purple-100 text-purple-700' : model === 'Condo' ? 'bg-blue-100 text-blue-700' : model === 'Condop' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700';
  }

  function message(box, line) {
    clear(box);
    box.appendChild(el('div', 'p-3 text-sm text-gray-500', line));
    box.classList.remove('hidden');
  }
  function unavailable(box) { message(box, 'Building lookup unavailable — edit the address to retry.'); }

  function renderResults(box, matches, onPick) {
    clear(box);
    matches.forEach(function (b) {
      var row = el('div', 'p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition');
      row.setAttribute('data-building', String(b.address));
      var line = el('div', 'flex justify-between items-center');
      var left = el('div');
      left.appendChild(el('p', 'font-semibold text-sm text-gray-800', b.address));
      var place = [b.neighborhood, b.borough].filter(Boolean).join(', ');
      var facts = [b.totalFloors ? b.totalFloors + ' stories' : '', b.yearBuilt ? 'built ' + b.yearBuilt : ''].filter(Boolean).join(' · ');
      left.appendChild(el('p', 'text-xs text-gray-500', [b.name, place, facts].filter(Boolean).join(' — ')));
      line.appendChild(left);
      if (b.model) line.appendChild(el('span', 'px-2 py-0.5 text-[10px] font-bold rounded-full ' + badge(b.model), b.model));
      row.appendChild(line);
      row.addEventListener('click', function () { onPick(b); });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
  }

  // ── the address box ──
  var locks = {};      // prefix -> the normalized address of the building the property type is locked to
  var applied = {};    // prefix -> the key of the building the form last applied
  var overrides = {};  // prefix -> the key of the building whose property type the agent overrode

  function address(prefix) { return byId(prefix + 'StreetAddress'); }

  function watch(prefix) {
    var box = address(prefix);
    if (!box || box.getAttribute('data-building-watch')) return;
    box.setAttribute('data-building-watch', '1');
    box.addEventListener('input', function () {
      box.setAttribute('data-typed', box.value);              // what was typed: it counts only while the box still says it (the form can rewrite the box later)
      if (locks[prefix] !== undefined && normalizeAddress(box.value) !== locks[prefix]) unlock(prefix);
    });
  }
  // A lookup runs for an address an agent typed since the last answered lookup, and still in the box.
  function typed(prefix) {
    var box = address(prefix);
    return !!box && box.getAttribute('data-typed') === box.value;
  }
  function resolved(prefix) {
    var box = address(prefix);
    if (box) box.removeAttribute('data-typed');
  }

  // ── which building is applied ──
  // A building is its address, borough and zip: two buildings in two boroughs can share an address. The borough is the form's option for it ("New York County" is Manhattan;
  // "New York", the city, names none) and the zip its five digits ("10065-1234" is 10065), so one building written two ways is one key.
  function buildingKey(b) {
    return b ? [normalizeAddress(b.address), boroughValue(b.borough), (str(b.zip).match(/\d{5}/) || [''])[0]].join('|') : '';
  }
  function isApplied(prefix, building) { return !!building && applied[prefix] !== undefined && applied[prefix] === buildingKey(building); }
  function markApplied(prefix, building) {
    var key = buildingKey(building);
    if (overrides[prefix] !== undefined && overrides[prefix] !== key) delete overrides[prefix];       // an Override is for the building it was made on
    applied[prefix] = key;
  }
  function overridden(prefix, building) { return !!building && overrides[prefix] !== undefined && overrides[prefix] === buildingKey(building); }
  function hasApplied(prefix) { return applied[prefix] !== undefined; }
  function reset(prefix) { delete applied[prefix]; delete overrides[prefix]; }
  // The form holds another record now (a draft restored, a saved listing loaded over what the agent had typed): no building is applied, nothing is locked, no address counts as
  // typed, and what the lookup wrote is no longer the lookup's to take back (the record's own values stand: putting "what was there before" back would erase them)
  function forget(prefix) { unlock(prefix); reset(prefix); delete writes[prefix]; resolved(prefix); }

  // ── what the lookup wrote ──
  // Applying a building writes into dozens of controls (the name, the year, the fee, the amenities, the parking, ...). Which ones, and what was there before? So that the facts of
  // a building the address no longer names are taken back (and the building the form moves to is not mixed with the last one), while what the agent changed since is never
  // touched: a control is put back only if it still holds what the lookup wrote. The page takes a snapshot of every control before it applies a building and records the
  // difference after, so no control the lookup writes (now or later) is missed.
  var writes = {};     // prefix -> [{ el, before, wrote }], in the order written
  function choice(el) { return el.type === 'checkbox' || el.type === 'radio'; }
  function stateOf(el) { return choice(el) ? el.checked : el.value; }
  function snapshot() {
    var list = [];
    document.querySelectorAll('input, select, textarea').forEach(function (el) { if (el.type !== 'file') list.push({ el: el, state: stateOf(el) }); });
    return list;
  }
  // kind: 'address' for everything an applied building writes (the address box, the area, the property type, the building's facts), 'facts' for the building's facts alone (the
  // Building tab's own pick writes only those, so it takes back only those).
  function record(prefix, before, kind) {
    var log = writes[prefix] || (writes[prefix] = []);
    var inGroup = function (a, b) { return a.el.type === 'radio' && a.el.name === b.el.name && a.el !== b.el; };
    before.forEach(function (b) {
      var now = stateOf(b.el);
      if (now === b.state) return;
      if (b.el.type === 'radio') {
        // A radio the lookup checked replaced the one that was checked in its group: the browser unchecked that one, the lookup did not write it. Taking the check back puts that one
        // back (and only while the agent has not chosen another).
        if (now) log.push({ el: b.el, before: false, wrote: true, replaced: before.filter(function (o) { return inGroup(o, b) && o.state; }).map(function (o) { return o.el; }), kind: kind || 'address' });
        return;
      }
      log.push({ el: b.el, before: b.state, wrote: now, kind: kind || 'address' });
    });
  }
  // Put back what the lookup wrote (of that kind, or all of it) and the agent has not changed since; true when there was anything to put back.
  function undo(prefix, kind) {
    var log = writes[prefix] || [];
    var undone = false;
    writes[prefix] = kind ? log.filter(function (w) { return w.kind !== kind; }) : [];
    for (var i = log.length - 1; i >= 0; i--) {
      var w = log[i];
      if (kind && w.kind !== kind) continue;
      undone = true;
      if (stateOf(w.el) !== w.wrote) continue;                       // the agent changed it since: it is theirs now
      if (choice(w.el)) w.el.checked = w.before; else w.el.value = w.before;
      (w.replaced || []).forEach(function (r) { r.checked = true; });  // the radio this one replaced is checked again
    }
    return undone;
  }

  // Write a value into a <select> only when the select has it (in any case; a list such as "HighRise,Apartment" takes the first member the select has): a value the control has
  // no option for would blank what the agent had chosen. True when it was written.
  function setSelect(select, value) {
    var wanted = str(value).split(',').map(function (m) { return m.trim().toLowerCase(); }).filter(Boolean);
    for (var i = 0; i < wanted.length; i++) {
      for (var j = 0; j < select.options.length; j++) {
        if (select.options[j].value.toLowerCase() === wanted[i]) { select.value = select.options[j].value; return true; }
      }
    }
    return false;
  }

  // ── the property type a building names ──
  function radios(prefix) { return document.querySelectorAll('input[name="' + prefix + 'PropertyType"]'); }
  function existingNotice(prefix) { return document.querySelector('[data-building-lock="' + prefix + '"]'); }
  // The notice sits right under the "Listing Classification" label, in the block that holds the radios; it is hidden while nothing is locked.
  function notice(prefix) {
    var found = existingNotice(prefix);
    if (found) return found;
    var first = radios(prefix)[0];
    var label = first && first.closest('label');
    var host = label && label.parentElement && label.parentElement.parentElement;
    if (!host) return null;
    var line = el('p', 'hidden mt-1 mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1');
    line.setAttribute('data-building-lock', prefix);
    var title = host.querySelector('label.field-label');
    if (title && title.nextSibling) host.insertBefore(line, title.nextSibling); else host.insertBefore(line, host.firstChild);
    return line;
  }

  function lock(prefix, building) {
    unlock(prefix);
    if (!building || !CLASSIFICATIONS[building.type] || building.commonInterestRaw !== COMMON_INTEREST[building.type]) return false;   // only a CommonInterest classification locks
    if (overridden(prefix, building)) return false;                                                                                  // the agent said no to this building
    var chosen = null;
    radios(prefix).forEach(function (r) { if (r.value === building.type && r.checked) chosen = r; });
    if (!chosen) return false;                                                                                                     // the form has no such type to hold
    radios(prefix).forEach(function (r) { r.disabled = true; r.setAttribute('data-locked-by-building', '1'); });
    locks[prefix] = normalizeAddress(building.address);
    var line = notice(prefix);
    if (line) {
      clear(line);
      line.classList.remove('hidden');
      line.appendChild(el('i', 'fas fa-lock mr-1'));
      line.appendChild(document.createTextNode('Property type is locked to '));
      line.appendChild(el('strong', '', CLASSIFICATIONS[building.type]));
      line.appendChild(document.createTextNode(' by this building’s Cotality record (' + building.commonInterestRaw + '). '));
      var button = el('button', 'underline font-semibold', 'Override');
      button.type = 'button';
      button.setAttribute('data-building-override', '1');
      button.addEventListener('click', function () {
        if (typeof global.confirm === 'function' && !global.confirm('Cotality records this building as ' + CLASSIFICATIONS[building.type] + '. Change the property type anyway?')) return;
        overrides[prefix] = buildingKey(building);
        unlock(prefix);
      });
      line.appendChild(button);
    }
    return true;
  }

  function unlock(prefix) {
    delete locks[prefix];
    radios(prefix).forEach(function (r) {
      if (r.getAttribute('data-locked-by-building')) { r.disabled = false; r.removeAttribute('data-locked-by-building'); }
    });
    var line = existingNotice(prefix);
    if (line) { clear(line); line.classList.add('hidden'); }
  }

  function isLocked(prefix) { return locks[prefix] !== undefined; }

  global.MallanBuildingLookup = {
    normalizeAddress: normalizeAddress, splitAddress: splitAddress, searchText: searchText, exactMatch: exactMatch, boroughValue: boroughValue,
    renderResults: renderResults, message: message, unavailable: unavailable,
    watch: watch, typed: typed, resolved: resolved, isApplied: isApplied, hasApplied: hasApplied, markApplied: markApplied, reset: reset, forget: forget, overridden: overridden,
    snapshot: snapshot, record: record, undo: undo, setSelect: setSelect,
    lock: lock, unlock: unlock, isLocked: isLocked,
  };
})(window);
