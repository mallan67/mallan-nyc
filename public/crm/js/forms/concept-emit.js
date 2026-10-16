// A control that claims a Cotality field (data-concept="X") sends X.
//
// The Add forms keep every answer under the control's own id (saleTaxMonthly, rentalMaxLease ...) and the collectors then copy the answers the server
// needs into Cotality-named keys by hand. A control tagged with a live Cotality field but not copied by hand claimed a field it never sent. This fills those
// in: after a collector has built its payload, emitConceptValues(data) adds, for every control tagged data-concept="X", the key X with the control's value
// converted to X's type (js/forms/concept-kinds.js, generated from the live contract):
//
//   i whole number · n decimal · b Yes/No -> true/false · d date · t date-time · s text · e picklist value · m list of picklist values
//
// What the collector already sent is never replaced. Address pieces the page parses itself and the listing's own description are left to their collectors.
// A control the agent left empty adds nothing, so a blank box never overwrites a stored value with "".
(function (global) {
  'use strict';

  // The control holds something other than the field's own value: the street line (the page splits it into number / name / suffix), the unit line, the building's
  // postal code and borough (read from the address), the building / townhouse description (the listing's PublicRemarks is the listing's own text), keys and
  // timestamps the page does not ask the agent for.
  var SKIP = {
    StreetName: 1, StreetNumber: 1, UnitNumber: 1, PostalCode: 1, CityRegion: 1, SubdivisionName: 1, PublicRemarks: 1,
    ListTeamMlsId: 1, PhotosChangeTimestamp: 1
  };

  // A Yes/No field the page asks with a longer list: what each answer says about the Yes/No question. An answer with no Yes/No meaning ("Case by Case") sends nothing.
  var BOOLEAN_ANSWERS = {
    GuarantorsAcceptedYN: { Allowed: true, Required: true, NotAllowed: false }
  };

  // A unit or a frequency means nothing without the amount it belongs to: it is sent only with that amount (the create gate refuses a unit alone).
  var COMPANION = {
    LivingAreaUnits: 'LivingArea', BuildingAreaUnits: 'BuildingAreaTotal', LotSizeUnits: 'LotSizeArea', FoundationAreaUnits: 'FoundationArea',
    LandLeaseAmountFrequency: 'LandLeaseAmount', AdditionalFeeFrequency: 'AdditionalFee', AssociationFeeFrequency: 'AssociationFee', LeaseAmountFrequency: 'LeaseAmount'
  };

  function present(v) { return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0); }

  function toNumber(raw, whole) {
    var s = String(raw).replace(/[$,%\s]/g, '');
    if (s === '') return undefined;
    var n = whole ? parseInt(s, 10) : parseFloat(s);
    return isNaN(n) ? undefined : n;
  }

  function toBoolean(raw) {
    if (raw === true || raw === 'true' || raw === 'Yes') return true;
    if (raw === false || raw === 'false' || raw === 'No') return false;
    return undefined;
  }

  // The value a control holds, or undefined when it holds none (an unchecked box, an unticked radio, an empty box).
  function readControl(el, kind) {
    var tag = el.tagName.toLowerCase();
    var type = (el.type || '').toLowerCase();
    if (type === 'checkbox') {
      if (!el.checked) return undefined;
      // a lone box for a Yes/No field says Yes; a box that is one member of a list says its value
      if (kind === 'b') return true;
      var v = el.getAttribute('value');
      return v && v !== 'on' ? v : undefined;
    }
    if (type === 'radio') {
      // a radio group is one answer: the ticked member's value, whichever radio of the group carries the claim
      if (el.checked) return el.value;
      var group = el.name && global.document ? global.document.querySelectorAll('input[type="radio"][name="' + String(el.name).replace(/["\\]/g, '') + '"]') : [];
      for (var g = 0; g < group.length; g++) if (group[g].checked) return group[g].value;
      return undefined;
    }
    if (tag === 'select' && el.multiple) {
      var chosen = [];
      for (var i = 0; i < el.options.length; i++) if (el.options[i].selected && el.options[i].value) chosen.push(el.options[i].value);
      return chosen.length ? chosen : undefined;
    }
    if (tag === 'select') {
      // a hidden or disabled option only lets an old stored value show ("Fair"); it is not an answer
      var picked = el.options[el.selectedIndex];
      if (picked && (picked.hidden || picked.disabled)) return undefined;
    }
    var raw = typeof el.value === 'string' ? el.value.trim() : el.value;
    return raw === '' ? undefined : raw;
  }

  function convert(raw, kind, concept) {
    if (raw === undefined) return undefined;
    if (kind === 'i') return toNumber(raw, true);
    if (kind === 'n') return toNumber(raw, false);
    if (kind === 'b') {
      var words = BOOLEAN_ANSWERS[concept];
      if (words && Object.prototype.hasOwnProperty.call(words, raw)) return words[raw];
      return toBoolean(raw);
    }
    // a date-time box answering a date field (the first showing date): the day
    if (kind === 'd' && typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
    return raw;
  }

  function emitConceptValues(data, root) {
    var kinds = global.COTALITY_FIELD_KINDS || {};
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) return data;
    var controls = scope.querySelectorAll('[data-concept]');
    var lists = {};
    var seen = {};
    var deferred = [];
    for (var i = 0; i < controls.length; i++) {
      var el = controls[i];
      var concept = el.getAttribute('data-concept');
      var kind = kinds[concept];
      if (!kind || SKIP[concept]) continue;                         // not a live Cotality field (a Mallan concept), or one a collector owns
      if (el.disabled || (el.type || '').toLowerCase() === 'hidden') continue;
      if (COMPANION[concept]) { deferred.push(el); continue; }      // decided after the amounts are known
      if (present(data[concept]) && !lists[concept]) continue;      // the collector already sent it
      var raw = readControl(el, kind);
      if (raw === undefined) continue;
      if (kind === 'm') {
        var more = Array.isArray(raw) ? raw : [raw];
        lists[concept] = (lists[concept] || []).concat(more.filter(function (x) { return lists[concept] ? lists[concept].indexOf(x) === -1 : true; }));
        continue;
      }
      if (seen[concept]) continue;                                  // two controls claim the same field: the first one filled wins
      var value = convert(raw, kind, concept);
      if (value === undefined) continue;
      data[concept] = value;
      seen[concept] = true;
    }
    Object.keys(lists).forEach(function (c) { if (lists[c].length) data[c] = lists[c]; });
    for (var d = 0; d < deferred.length; d++) {
      var unitEl = deferred[d];
      var unit = unitEl.getAttribute('data-concept');
      if (present(data[unit]) || seen[unit] || !present(data[COMPANION[unit]])) continue;
      var uraw = readControl(unitEl, kinds[unit]);
      if (uraw !== undefined) { data[unit] = convert(uraw, kinds[unit], unit); seen[unit] = true; }
    }
    return data;
  }

  global.emitConceptValues = emitConceptValues;
})(typeof window !== 'undefined' ? window : this);
