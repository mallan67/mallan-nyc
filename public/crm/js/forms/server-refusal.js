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
// "Listing blocked by Fair Housing content gate: Broker Comments ("adults only")". Nothing here writes to the CRM.
(function (global) {
  'use strict';

  var FIELD_IN_ERROR = /(?:Required field missing|Conditional field required):\s*([A-Za-z][A-Za-z0-9]*)/;
  var SHOWN = 8;

  function fields(details) {
    var out = [];
    var add = function (name) { if (typeof name === 'string' && name && out.indexOf(name) < 0) out.push(name); };
    var blockers = details && Array.isArray(details.blockers) ? details.blockers : [];
    blockers.forEach(function (b) { if (b) add(b.field); });
    var errors = details && details.validation && Array.isArray(details.validation.errors) ? details.validation.errors : [];
    errors.forEach(function (e) { var m = FIELD_IN_ERROR.exec(String(e)); if (m) add(m[1]); });
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
    return null;
  }

  // The label of the box: the nearest `.field-label` at or above the control, without its red star.
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
    return '';
  }

  function label(field) {
    var control = controlFor(field);
    return (control && labelOf(control)) || spaced(field);
  }

  // What the Fair Housing scan found, by field: the blocker's message reads 'Fair Housing violation in PublicRemarks: "adults only" - violates NY HRL (Age).'
  var FAIR_HOUSING_PHRASE = /^Fair Housing violation in .+?: "([^"]+)"/;

  function phrases(details) {
    var found = {};
    var blockers = details && Array.isArray(details.blockers) ? details.blockers : [];
    blockers.forEach(function (b) {
      var m = b && b.code === 'FH-001' && typeof b.field === 'string' && typeof b.message === 'string' ? FAIR_HOUSING_PHRASE.exec(b.message) : null;
      if (!m) return;
      var list = found[b.field] || (found[b.field] = []);
      if (list.indexOf(m[1]) < 0) list.push(m[1]);
    });
    return found;
  }

  function words(err) {
    var message = err && err.message ? String(err.message) : '';
    var named = fields(err && err.details);
    if (!named.length) return message;
    var found = phrases(err.details);
    var shown = named.slice(0, SHOWN).map(function (field) {
      var name = label(field);
      return found[field] ? name + ' (' + found[field].map(function (p) { return '"' + p + '"'; }).join(', ') + ')' : name;
    });
    var more = named.length > SHOWN ? ' and ' + (named.length - SHOWN) + ' more' : '';
    return (message ? message + ': ' : '') + shown.join(', ') + more;
  }

  function mark(err) {
    var first = null;
    fields(err && err.details).forEach(function (field) {
      var control = controlFor(field);
      if (!control) return;
      var target = control.type === 'checkbox' || control.type === 'radio' ? (control.closest('[id$="Block"]') || control.parentElement || control) : control;
      if (target.classList) target.classList.add('border-red-500');
      if (target.style) target.style.outline = '2px solid #dc2626';
      var clear = function () { if (target.classList) target.classList.remove('border-red-500'); if (target.style) target.style.outline = ''; control.removeEventListener('change', clear); control.removeEventListener('input', clear); };
      control.addEventListener('change', clear);
      control.addEventListener('input', clear);
      if (!first) first = target;
    });
    try { if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' }); } catch (e) { /* a page that cannot scroll still shows the names */ }
    return first !== null;
  }

  global.MallanServerRefusal = { fields: fields, words: words, mark: mark };
})(typeof window !== 'undefined' ? window : this);
