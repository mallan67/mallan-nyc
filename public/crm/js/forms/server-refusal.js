// What the server's refusal of a listing says, in the form's own words.
//
// POST /api/crm/listings (and the update and status routes) refuse a listing with an answer that names what is wrong: the enforcement gate's `blockers` ([{ code, field, message }], one per
// Cotality field) and the validator's `validation.errors` (text such as "[REBNY] Required field missing: LivingAreaUnits"). The CRM client (js/core/api-client.js) puts that answer on the
// error as `details`. The forms used to show only the answer's one-line `error` ("Listing blocked by RLS enforcement gate"), so an agent could not tell which box to fix.
//
// words(err)  the message, then the boxes the refusal names: "Listing blocked by RLS enforcement gate: Special Listing Conditions, Property Condition"
// mark(err)   the controls those boxes are get a red border until they are changed, and the first is scrolled into view
// fields(details)  the Cotality field names a refusal names, once each
//
// A box is named by its label on the page; a field the page has no box for is named by its Cotality name with spaces between the words. The Fair Housing scan (code FH-001) names a
// free-text box by the name the form posts it under ("raw:saleBrokerComments", the id of the control) and says which phrase it found, so the refusal reads
// "Listing blocked by Fair Housing content gate: Broker Comments ("adults only")". The validator names a field in a few fixed shapes (LINE_FIELD below); the first refusal an agent meets is
// usually the validator's, because the create route answers with it before the gate runs. Two names that lead to the same box are one name (PublicRemarks and raw:rentalDescription are the
// same textarea). Nothing here writes to the CRM.
(function (global) {
  'use strict';

  var SHOWN = 8;
  var NAME = '([A-Za-z][A-Za-z0-9]*)';

  // The validator's lines (lib/compliance/rebny-validator.ts), each as a pattern and the Cotality field it names (a capture group, or a fixed name):
  //   [REBNY] Required field missing: ListPrice - ...                 [REBNY] Conditional field required: TaxLot - ...
  //   [REBNY] LivingArea: Value 0 is below minimum 1                   (every other REBNY line reads "<Field>: <what is wrong>")
  //   [Fair Housing] Prohibited terms found in PublicRemarks: "adults only", "no section 8". These terms ...
  //   [NYC] TaxLot is required for NYC properties    [NYC] County mismatch: ...    [NYC] YearBuilt 670 is before 1700 - invalid
  // A line of another shape (a [FORMAT] note, a [NYC] co-op suggestion) names no box.
  var LINE_FIELD = [
    { re: new RegExp('(?:Required field missing|Conditional field required):\\s*' + NAME), group: 1 },
    { re: new RegExp('^\\[REBNY\\] ' + NAME + ':'), group: 1 },
    { re: new RegExp('^\\[Fair Housing\\] Prohibited terms found in ' + NAME + ':'), group: 1 },
    { re: /^\[NYC\] TaxLot is required/, name: 'TaxLot' },
    { re: /^\[NYC\] County mismatch/, name: 'CountyOrParish' },
    { re: /^\[NYC\] YearBuilt \d/, name: 'YearBuilt' }
  ];

  // A field the pages hold in a box that does not carry its Cotality name in data-rls-field (the box is the form's own, or carries a name the field no longer has): the box the agent fills for it.
  // The first selector that finds a control on the page wins, so one table serves the Sale and the Rental form.
  var BOX_FOR = {
    ListPrice: '#salePrice, #rentalMonthlyRent',                                   // a rental's price is its monthly rent
    ListingContractDate: '#saleExclusiveStart, #rentalExclusiveStart',
    TaxLot: '#saleBldgTaxLot, #bldgTaxLot',
    PropertyType: 'input[name="salePropertyType"], input[name="rentalPropertyType"]',
    PropertySubType: 'input[name="salePropertyType"], input[name="rentalPropertyType"]',
    View: 'input[name="saleViewList"]'
  };

  function validatorField(line) {
    for (var i = 0; i < LINE_FIELD.length; i++) {
      var m = LINE_FIELD[i].re.exec(line);
      if (m) return LINE_FIELD[i].name || m[LINE_FIELD[i].group];
    }
    return null;
  }

  function fields(details) {
    var out = [];
    var add = function (name) { if (typeof name === 'string' && name && out.indexOf(name) < 0) out.push(name); };
    var blockers = details && Array.isArray(details.blockers) ? details.blockers : [];
    blockers.forEach(function (b) { if (b) add(b.field); });
    var errors = details && details.validation && Array.isArray(details.validation.errors) ? details.validation.errors : [];
    errors.forEach(function (e) { add(validatorField(String(e))); });
    return out;
  }

  // "SpecialListingConditions" -> "Special Listing Conditions"; a free-text box the scan named by the form's own name ("raw:agentRemarks") -> "Agent Remarks"
  function spaced(name) {
    return String(name).replace(/^raw:/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
  }

  // The Fair Housing scan names a free-text box by the key the form posted it under, which is the id (or the name) of the control: "raw:saleBrokerComments" -> #saleBrokerComments
  var RAW_FIELD = /^raw:(.+)$/;

  function controlFor(field) {
    var doc = global.document;
    if (!doc || !doc.querySelector) return null;
    var all = doc.querySelectorAll('[data-rls-field]');
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-rls-field') === field) return all[i];
    var raw = RAW_FIELD.exec(field);
    if (raw) { var key = raw[1].replace(/["\\]/g, ''); return doc.querySelector('[id="' + key + '"], [name="' + key + '"]'); }
    return BOX_FOR[field] ? doc.querySelector(BOX_FOR[field]) : null;
  }

  // The controls that answer together: the boxes of a group (they share a name), or the control alone
  function membersOf(control) {
    var doc = global.document;
    var name = control.getAttribute && control.getAttribute('name');
    if ((control.type === 'checkbox' || control.type === 'radio') && name && doc.querySelectorAll) {
      var group = doc.querySelectorAll('input[name="' + name.replace(/["\\]/g, '') + '"]');
      if (group.length) return Array.prototype.slice.call(group);
    }
    return [control];
  }

  // The label of the box: the nearest `.field-label` at or above the control, without its red star. A text area that stands alone in its card (the Rental form's "Listing Description") has no
  // label of its own: the heading of the card is its name.
  function labelOf(control) {
    for (var node = control; node && node.nodeType === 1; node = node.parentElement) {
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (child.classList && child.classList.contains('field-label') && child !== control) {
          var text = (child.textContent || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
          if (text) return text;
        }
      }
    }
    var card = control.tagName === 'TEXTAREA' && control.closest ? control.closest('.form-card') : null;
    var head = card && card.querySelectorAll('textarea').length === 1 ? card.querySelector('.form-card-header') : null;
    return head ? (head.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function label(field, control) {
    return (control && labelOf(control)) || spaced(field);
  }

  // What the Fair Housing scan found, by field. The gate's blocker message reads 'Fair Housing violation in PublicRemarks: "adults only" - violates NY HRL (Age).'; the validator's line reads
  // '[Fair Housing] Prohibited terms found in PublicRemarks: "adults only", "no section 8". These terms may violate ...'
  var FAIR_HOUSING_PHRASE = /^Fair Housing violation in .+?: "([^"]+)"/;
  var VALIDATOR_TERMS = new RegExp('^\\[Fair Housing\\] Prohibited terms found in ' + NAME + ': ((?:"[^"]*"(?:, )?)+)');

  function phrases(details) {
    var found = {};
    var add = function (field, phrase) { (found[field] || (found[field] = [])).push(phrase); };      // boxes() lists each phrase once per box
    var blockers = details && Array.isArray(details.blockers) ? details.blockers : [];
    blockers.forEach(function (b) {
      var m = b && b.code === 'FH-001' && typeof b.field === 'string' && typeof b.message === 'string' ? FAIR_HOUSING_PHRASE.exec(b.message) : null;
      if (m) add(b.field, m[1]);
    });
    var errors = details && details.validation && Array.isArray(details.validation.errors) ? details.validation.errors : [];
    errors.forEach(function (e) {
      var m = VALIDATOR_TERMS.exec(String(e));
      if (!m) return;
      (m[2].match(/"[^"]*"/g) || []).forEach(function (quoted) { add(m[1], quoted.slice(1, -1)); });
    });
    return found;
  }

  // One entry per BOX the refusal names: two names that lead to the same control (or, with no control on the page, to the same words) are one entry, with the phrases of both.
  function boxes(details) {
    var found = phrases(details);
    var out = [];
    fields(details).forEach(function (field) {
      var control = controlFor(field);
      var name = label(field, control);
      var entry = null;
      out.forEach(function (b) { if (control ? b.control === control : (!b.control && b.name === name)) entry = b; });
      if (!entry) { entry = { control: control, name: name, phrases: [] }; out.push(entry); }
      (found[field] || []).forEach(function (p) { if (entry.phrases.indexOf(p) < 0) entry.phrases.push(p); });
    });
    return out;
  }

  function words(err) {
    var message = err && err.message ? String(err.message) : '';
    var named = boxes(err && err.details);
    if (!named.length) return message;
    var shown = named.slice(0, SHOWN).map(function (b) {
      return b.phrases.length ? b.name + ' (' + b.phrases.map(function (p) { return '"' + p + '"'; }).join(', ') + ')' : b.name;
    });
    var more = named.length > SHOWN ? ' and ' + (named.length - SHOWN) + ' more' : '';
    return (message ? message + ': ' : '') + shown.join(', ') + more;
  }

  function mark(err) {
    var first = null;
    boxes(err && err.details).forEach(function (b) {
      var control = b.control;
      if (!control) return;
      var target = control.type === 'checkbox' || control.type === 'radio' ? (control.closest('[id$="Block"]') || control.parentElement || control) : control;
      if (target.classList) target.classList.add('border-red-500');
      if (target.style) target.style.outline = '2px solid #dc2626';
      // any box of a group takes the mark off (a group is answered by ticking one of its boxes, not necessarily the first)
      var members = membersOf(control);
      var clear = function () {
        if (target.classList) target.classList.remove('border-red-500');
        if (target.style) target.style.outline = '';
        members.forEach(function (m) { m.removeEventListener('change', clear); m.removeEventListener('input', clear); });
      };
      members.forEach(function (m) { m.addEventListener('change', clear); m.addEventListener('input', clear); });
      if (!first) first = target;
    });
    try { if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' }); } catch (e) { /* a page that cannot scroll still shows the names */ }
    return first !== null;
  }

  global.MallanServerRefusal = { fields: fields, words: words, mark: mark };
})(typeof window !== 'undefined' ? window : this);
