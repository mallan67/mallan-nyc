// Search on any Cotality field.
//
// Data-driven from window.COTALITY_SEARCH_FIELDS (search-field-catalog.js, generated from the live Cotality contract):
// every Property field, CustomProperty field and CustomFields key is listed, with the input and operators its type allows and,
// for an enumeration, the live picklist members. The page sends the result as `fieldFilters` (a JSON list of { f, op, v });
// the server (lib/search/field-filters.ts) checks it against the same contract again.
//
//   s = 1  Cotality filters the field itself (whole result set)
//   s = 0  Cotality cannot filter it (provider-blocked Property field, CustomProperty field, CustomFields key):
//          it narrows the fetched page, and the row says so.
var CotalityFieldFilters = (function () {
  var rows = [];            // [{ f, op, v }]
  var byName = null;

  var OPS = {
    boolean:  [['eq', 'is'], ['isnull', 'is empty'], ['notnull', 'is not empty']],
    number:   [['eq', '='], ['ge', '≥'], ['le', '≤'], ['between', 'between'], ['isnull', 'is empty'], ['notnull', 'is not empty']],
    date:     [['eq', 'on'], ['ge', 'on or after'], ['le', 'on or before'], ['between', 'between'], ['isnull', 'is empty'], ['notnull', 'is not empty']],
    datetime: [['ge', 'on or after'], ['le', 'on or before'], ['between', 'between'], ['isnull', 'is empty'], ['notnull', 'is not empty']],
    string:   [['eq', 'equals'], ['contains', 'contains'], ['startswith', 'starts with'], ['isnull', 'is empty'], ['notnull', 'is not empty']],
    enum:     [['in', 'is any of'], ['isnull', 'is empty'], ['notnull', 'is not empty']]
  };

  function catalog() { return window.COTALITY_SEARCH_FIELDS || []; }
  function index() {
    if (byName) return byName;
    byName = {};
    catalog().forEach(function (f) { byName[f.n] = f; });
    return byName;
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function spaced(n) { return n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); }

  function add(name) {
    var f = index()[name];
    if (!f) return false;
    rows.push({ f: name, op: kindDefault(f), v: undefined });
    render();
    return true;
  }
  function kindDefault(f) { return f.k === 'enum' ? 'in' : (f.k === 'string' ? 'contains' : (f.k === 'boolean' ? 'eq' : 'ge')); }

  function remove(i) { rows.splice(i, 1); render(); }

  function valueInput(i, r, f) {
    var op = r.op;
    if (op === 'isnull' || op === 'notnull') return '';
    var id = 'cff_v_' + i;
    if (f.k === 'boolean') {
      return '<select id="' + id + '" class="field-input text-xs" onchange="CotalityFieldFilters.setValue(' + i + ',this.value)">' +
        '<option value="">Select</option><option value="true"' + (r.v === true ? ' selected' : '') + '>Yes</option><option value="false"' + (r.v === false ? ' selected' : '') + '>No</option></select>';
    }
    if (f.k === 'enum') {
      var chosen = Array.isArray(r.v) ? r.v : [];
      var opts = ((window.COTALITY_SEARCH_ENUMS || {})[f.e] || []).map(function (m) { return '<option value="' + esc(m) + '"' + (chosen.indexOf(m) !== -1 ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
      return '<select id="' + id + '" multiple size="5" class="field-input text-xs" onchange="CotalityFieldFilters.setMulti(' + i + ',this)">' + opts + '</select>';
    }
    var type = f.k === 'number' ? 'number' : (f.k === 'date' ? 'date' : (f.k === 'datetime' ? 'date' : 'text'));
    if (op === 'between') {
      var lo = Array.isArray(r.v) ? r.v[0] : '', hi = Array.isArray(r.v) ? r.v[1] : '';
      return '<input id="' + id + '_a" type="' + type + '" step="any" value="' + esc(lo == null ? '' : lo) + '" class="field-input text-xs" onchange="CotalityFieldFilters.setPair(' + i + ',0,this.value)"> ' +
        '<span class="text-xs text-gray-400">and</span> ' +
        '<input id="' + id + '_b" type="' + type + '" step="any" value="' + esc(hi == null ? '' : hi) + '" class="field-input text-xs" onchange="CotalityFieldFilters.setPair(' + i + ',1,this.value)">';
    }
    return '<input id="' + id + '" type="' + type + '" step="any" value="' + esc(r.v == null ? '' : r.v) + '" class="field-input text-xs" onchange="CotalityFieldFilters.setValue(' + i + ',this.value)">';
  }

  function render() {
    var host = el('cotalityFieldFilterRows');
    if (!host) return;
    var idx = index();
    host.innerHTML = rows.map(function (r, i) {
      var f = idx[r.f];
      if (!f) return '';
      var ops = OPS[f.k].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === r.op ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
      var onPage = !f.s || (f.k === 'string' && /(Remarks|Description|Comments|Instructions|Directions|Considerations|Requirements|Terms|Disclosures|Notes)$/.test(f.n) && (r.op === 'contains' || r.op === 'startswith'));
      return '<div class="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-100" data-cff-row="' + i + '">' +
        '<span class="text-xs font-semibold text-gray-700 min-w-[10rem]" title="' + esc(f.n) + '">' + esc(spaced(f.n)) + '</span>' +
        '<select class="field-input text-xs" onchange="CotalityFieldFilters.setOp(' + i + ',this.value)">' + ops + '</select>' +
        valueInput(i, r, f) +
        (onPage ? '<span class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5" title="Cotality cannot filter this field itself; it narrows the results already fetched">fetched results</span>' : '') +
        '<button type="button" class="ml-auto text-xs text-red-500 hover:text-red-700" onclick="CotalityFieldFilters.remove(' + i + ')" aria-label="Remove filter"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');
    var count = el('cotalityFieldFilterCount');
    if (count) count.textContent = rows.length ? rows.length + ' field filter' + (rows.length === 1 ? '' : 's') : 'No field filters';
  }

  function init() {
    var list = el('cotalityFieldList');
    if (list && !list.getAttribute('data-ready')) {
      list.innerHTML = catalog().map(function (f) { return '<option value="' + esc(f.n) + '">' + esc(spaced(f.n)) + (f.s ? '' : ' (fetched results)') + '</option>'; }).join('');
      list.setAttribute('data-ready', '1');
    }
    var total = el('cotalityFieldTotal');
    if (total) {
      var c = catalog();
      total.textContent = c.length + ' Cotality fields (' + c.filter(function (f) { return f.s; }).length + ' filtered by Cotality itself, ' + c.filter(function (f) { return !f.s; }).length + ' on the fetched results)';
    }
    render();
  }

  return {
    init: init,
    render: render,
    add: add,
    addFromInput: function () {
      var input = el('cotalityFieldInput');
      if (!input) return;
      var name = input.value.trim();
      if (add(name)) input.value = '';
      else input.classList.add('border-red-400');
      setTimeout(function () { input.classList.remove('border-red-400'); }, 1200);
    },
    remove: remove,
    setOp: function (i, op) { rows[i].op = op; rows[i].v = undefined; render(); },
    setValue: function (i, v) {
      var f = index()[rows[i].f];
      if (f.k === 'boolean') rows[i].v = v === 'true' ? true : (v === 'false' ? false : undefined);
      else rows[i].v = v === '' ? undefined : (f.k === 'number' ? Number(v) : v);
    },
    setPair: function (i, which, v) {
      var f = index()[rows[i].f];
      var cur = Array.isArray(rows[i].v) ? rows[i].v.slice() : [undefined, undefined];
      cur[which] = v === '' ? undefined : (f.k === 'number' ? Number(v) : v);
      rows[i].v = cur;
    },
    setMulti: function (i, select) {
      rows[i].v = Array.prototype.filter.call(select.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
    },
    // The filters that are complete enough to send: a value (or a pair with at least one end) unless the operator needs none.
    get: function () {
      return rows.filter(function (r) {
        if (r.op === 'isnull' || r.op === 'notnull') return true;
        if (r.op === 'between') return Array.isArray(r.v) && (r.v[0] != null || r.v[1] != null);
        if (r.op === 'in') return Array.isArray(r.v) && r.v.length > 0;
        return r.v !== undefined && r.v !== null && r.v !== '';
      }).map(function (r) { return { f: r.f, op: r.op, v: r.v }; });
    },
    set: function (list) {
      rows = (Array.isArray(list) ? list : []).filter(function (r) { return r && index()[r.f]; }).map(function (r) { return { f: r.f, op: r.op, v: r.v }; });
      render();
    },
    // Checkbox / select controls whose Cotality field is not one the older checkbox path sends (Furnished, attendance, building rules,
    // sponsor unit, financing %, year built, stories, building pets / laundry / pool / security ...). Each is turned into a filter on the live field;
    // what it returns is { rows, remaining }: rows go to fieldFilters, remaining stays in checkboxFilters. Values were checked against live
    // Cotality 2026-10-16 (CustomFields text such as "DoormanFullTime,ConciergeFullTime"; Property enumerations by their live members).
    bridge: function (cb) {
      var out = []; var left = {};
      var enums = window.COTALITY_SEARCH_ENUMS || {};
      function member(enumKey, v) {                 // a live picklist member, matched without regard to case; null when there is none
        var list = enums[enumKey] || []; var low = String(v).toLowerCase();
        for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === low) return list[i];
        return null;
      }
      function flat(vals) { var a = []; (vals || []).forEach(function (v) { String(v).split(",").forEach(function (x) { x = x.trim(); if (x && a.indexOf(x) === -1) a.push(x); }); }); return a; }
      var ATTENDANCE_ANY = { DoormanYes: ["DoormanYes", "DoormanFullTime", "DoormanPartTime"], ConciergeYes: ["ConciergeYes", "ConciergeFullTime", "ConciergePartTime"],
        VideoDoormanYes: ["VideoDoormanYes", "VideoDoormanFullTime", "VideoDoormanPartTime"], ElevatorAttendanceYes: ["ElevatorAttendanceYes", "ElevatorAttendanceFullTime", "ElevatorAttendancePartTime"],
        LobbyAttendantYes: ["LobbyAttendantYes", "LobbyAttendantFullTime", "LobbyAttendantPartTime"] };
      var SIMPLE_IN = { BuildingRules: "BuildingRules" };                       // CustomFields text; value is a member of the list
      Object.keys(cb || {}).forEach(function (key) {
        var vals = flat(cb[key]); var handled = false;
        if (key === "AttendanceType") {
          var want = [];
          vals.forEach(function (v) {
            if (v === "Any") Object.keys(ATTENDANCE_ANY).forEach(function (k) { want = want.concat(ATTENDANCE_ANY[k]); });
            else want = want.concat(ATTENDANCE_ANY[v] || [v]);
          });
          if (want.length) { out.push({ f: "AttendanceType", op: "in", v: want.filter(function (x, i) { return want.indexOf(x) === i; }) }); handled = true; }
        } else if (SIMPLE_IN[key]) {
          out.push({ f: SIMPLE_IN[key], op: "in", v: vals }); handled = true;
        } else if (key === "Furnished" || key === "Concessions") {
          var ms = vals.map(function (v) { return member(key, v); }).filter(Boolean);
          if (ms.length) { out.push({ f: key, op: "in", v: ms }); handled = true; }
        } else if (key === "BuildingPetsAllowed") {
          var pm = vals.map(function (v) { return member("PetsAllowed", v); }).filter(Boolean);
          if (pm.length) { out.push({ f: "PetsAllowed", op: "in", v: pm }); handled = true; }
        } else if (key === "BuildingLaundryFeatures" || key === "BuildingPoolFeatures") {
          var target = key === "BuildingLaundryFeatures" ? "LaundryFeatures" : "PoolFeatures";
          if (vals.indexOf("Any") !== -1) {
            var bm = (enums[target] || []).filter(function (m) { return /^Building/.test(m) && m !== "BuildingNone"; });
            if (bm.length) { out.push({ f: target, op: "in", v: bm }); handled = true; }
          }
        } else if (key === "BuildingSecurityFeatures") {
          if (vals.indexOf("Any") !== -1) { out.push({ f: "SecurityFeatures", op: "notnull" }); handled = true; }
        } else if (key === "SponsorUnit") {
          if (vals.indexOf("true") !== -1 || vals.indexOf("Yes") !== -1) { out.push({ f: "SponsorUnitYN", op: "eq", v: true }); handled = true; }
        } else if (key === "YearBuilt" || key === "StoriesTotal" || key === "MaximumFinancingPercent") {
          var OPS = { lte: "le", gte: "ge", lt: "lt", gt: "gt", eq: "eq" }; var parsed = [];
          vals.forEach(function (v) { var m = /^(lte|gte|lt|gt|eq):(-?\d+(?:\.\d+)?)$/.exec(v); if (m) parsed.push({ f: key, op: OPS[m[1]], v: Number(m[2]) }); });
          // Pre-War and Post-War together mean every year: no filter. Otherwise the one range asked for.
          if (parsed.length === 1) { out.push(parsed[0]); handled = true; }
          else if (parsed.length > 1) handled = true;
        }
        if (!handled) left[key] = cb[key];
      });
      return { rows: out, remaining: left };
    },
    clear: function () { rows = []; render(); },
    // Filters the server refused (named no Cotality field, or carried a value Cotality does not have).
    report: function (meta) {
      var host = el('cotalityFieldFilterNotes');
      if (!host) return;
      var ff = meta && meta.fieldFilters;
      if (!ff || !ff.rejected || !ff.rejected.length) { host.textContent = ''; return; }
      host.textContent = 'Not applied: ' + ff.rejected.map(function (r) { return (r.field ? r.field + ' – ' : '') + r.reason; }).join('; ');
    }
  };
})();
window.CotalityFieldFilters = CotalityFieldFilters;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', CotalityFieldFilters.init); else CotalityFieldFilters.init();
