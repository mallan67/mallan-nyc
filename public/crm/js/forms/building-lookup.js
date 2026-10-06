// Address -> building, shared by the Sale and Rental Add / Edit forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html).
//
// An agent types the property's address; the form looks the building up (GET /api/buildings/search, the CRM's own building index fed by Cotality), picks the building when
// the address names exactly one, fills the area and the building's facts, and sets the property type from the building's Cotality CommonInterest (Condominium, Stock
// Cooperative, Condop, Rental Building). This module is the part both forms share:
//
//   normalizeAddress(text)           "200 East 66th Street" and "200 E 66th St" are the same address
//   exactMatch(matches, typed)       the one candidate whose address IS the typed address, or null
//   renderResults(box, matches, fn)  the candidates, written with DOM calls: a building's name, address and neighborhood come from the database and from what agents typed
//                                    (building names are saved from the forms), and are never markup
//   message(box, text)               a one-line message in the results box
//   watch(prefix)                    the form's address box: remember that the agent typed in it (a lookup runs only for an address somebody typed, never for one the
//                                    form filled in from a saved listing or a draft), and release the property type again when the address no longer names the building
//   typed(prefix) / resolved(prefix, building)   the two halves of that: should a lookup run, and the building it found
//   lock(prefix, building) / unlock(prefix)      the property type a building's Cotality record names is LOCKED (the radios are disabled and a notice beside them says so)
//                                    until the agent presses Override, so a co-op's fields cannot be left half co-op, half condo by a stray click. Only a CommonInterest
//                                    classification locks: a type read from the property sub-type is a suggestion. The notice sits with the radios, not in the match banner,
//                                    because the banner is hidden by other things (an In-House listing type clears it) and the agent must always see why the type is fixed.
(function (global) {
  'use strict';

  var DIRECTIONS = { east: 'e', west: 'w', north: 'n', south: 's', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
  var SUFFIXES = {
    street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', place: 'pl', court: 'ct', lane: 'ln', terrace: 'ter', parkway: 'pkwy', plaza: 'plz', circle: 'cir',
  };
  // The Cotality CommonInterest members that classify a building, with the label the agent sees.
  var CLASSIFICATIONS = { Condo: 'Condo', Coop: 'Co-op', Condop: 'Condop', RentalBuilding: 'Rental building' };
  var COMMON_INTEREST = { Condo: 'Condominium', Coop: 'StockCooperative', Condop: 'Condop', RentalBuilding: 'RentalBuilding' };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function normalizeAddress(text) {
    return String(text === undefined || text === null ? '' : text).toLowerCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean).map(function (token) {
      token = token.replace(/^(\d+)(?:st|nd|rd|th)$/, '$1');
      return DIRECTIONS[token] || SUFFIXES[token] || token;
    }).join(' ');
  }

  function exactMatch(matches, typedAddress) {
    var want = normalizeAddress(typedAddress);
    if (!want || !Array.isArray(matches)) return null;
    var same = matches.filter(function (b) { return b && normalizeAddress(b.address) === want; });
    return same.length === 1 ? same[0] : null;
  }

  function badge(model) {
    return model === 'Coop' ? 'bg-purple-100 text-purple-700' : model === 'Condo' ? 'bg-blue-100 text-blue-700' : model === 'Condop' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700';
  }

  function message(box, text) {
    clear(box);
    box.appendChild(el('div', 'p-3 text-sm text-gray-500', text));
    box.classList.remove('hidden');
  }

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
  var locks = {};   // prefix -> the normalized address of the building the property type is locked to

  function address(prefix) { return byId(prefix + 'StreetAddress'); }

  function watch(prefix) {
    var box = address(prefix);
    if (!box || box.getAttribute('data-building-watch')) return;
    box.setAttribute('data-building-watch', '1');
    box.addEventListener('input', function () {
      box.setAttribute('data-typed', '1');
      if (locks[prefix] !== undefined && normalizeAddress(box.value) !== locks[prefix]) unlock(prefix);
    });
  }
  // A lookup runs for an address an agent typed since the last lookup.
  function typed(prefix) {
    var box = address(prefix);
    return !!box && box.getAttribute('data-typed') === '1';
  }
  function resolved(prefix) {
    var box = address(prefix);
    if (box) box.removeAttribute('data-typed');
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
    normalizeAddress: normalizeAddress, exactMatch: exactMatch, renderResults: renderResults, message: message,
    watch: watch, typed: typed, resolved: resolved, lock: lock, unlock: unlock, isLocked: isLocked,
  };
})(window);
