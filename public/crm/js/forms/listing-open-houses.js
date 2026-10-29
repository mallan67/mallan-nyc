/* js/forms/listing-open-houses.js: the open houses of an Add / Edit listing form (the Open Houses sub-tab).
 *
 * One manager per form:
 *
 *   var openHouses = MallanOpenHouses.create({ prefix: 'rental', listingId: function () { return the id of the saved listing, '' for a new one; },
 *                                              listingKeys: function () { return [the listing's own id, its numeric id]; }, toast: showToast, alert: alert });
 *   openHouses.showForm() / openHouses.cancelForm()     the "Add Open House" button and the form's Cancel
 *   openHouses.save()                                   the form's Save: POST /api/crm/showings, tied to the saved listing
 *   openHouses.remove(id, from)                         a card's Remove: PATCH /api/crm/showings/<id> to cancelled (no hard delete: audit and retention)
 *   openHouses.load(listingKeys)                        a saved listing's upcoming open houses: GET /api/crm/showings, a type and a page at a time (see fetchType), shown by date
 *
 * The controls it uses: <prefix>OpenHouseList (the cards), <prefix>OpenHouseEmpty (the line shown when there are none), <prefix>AddOpenHouseForm (the form) and in it
 * <prefix>NewOHDate, <prefix>NewOHStart, <prefix>NewOHEnd, <prefix>NewOHType, <prefix>NewOHNotes.
 *
 * An open house is a `showing` of the listing, so it is saved with the listing's id: a listing that is not saved yet has none (the agent is told to save it first: options.unsavedMessage words that for a
 * page where Save Draft does not create the listing). Public, Virtual and By
 * Appointment are public events (type 'openhouse'); only Broker Only is internal (type 'brokersopen', never on a public page). The type the agent chose is kept in the notes as "[Type] ..."
 * so it comes back when the listing is opened. Built with DOM calls: a note or a time that came back from the server is text here, never markup.
 *
 * A viewer (the Tools pages) lists a listing's open houses and changes none: create({ prefix: 'sale', readOnly: true, showInternal: <may this reader see internal events?> }) and load() the
 * listing's keys. A read-only list has cards with no Remove button, says "No upcoming open houses found." when there are none, and adds and removes nothing (no form, no request).
 * showInternal: false leaves the internal events (Broker Only) out; it is true unless the page says otherwise. While the list is being asked for the list says so, and when it cannot be had
 * (the route refused, the network is down, or there are more than can be listed) it says "Open houses could not be loaded." rather than that there are none.
 */
(function (global) {
  'use strict';

  var EMPTY_TEXT = 'No open houses scheduled yet. Click "Add Open House" to create one.';
  var TYPE_BADGE = { Public: 'bg-green-100 text-green-700', BrokerOnly: 'bg-blue-100 text-blue-700', ByAppointment: 'bg-yellow-100 text-yellow-700', Virtual: 'bg-purple-100 text-purple-700' };

  // The 24-hour form a time box gives ("14:00", with seconds "14:00:30"), hours up to 23 and minutes up to 59: { h, m } or null. Any other text (a browser without time boxes gives what was typed:
  // "1:00 PM", "noon") is not read as a time: "1:00 PM" read as 1:00 would be printed "1:00 AM", and "11:00 AM" to "1:00 PM" would be refused as ending before it began.
  function clock(t) {
    var m = String(t == null ? '' : t).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), minutes = parseInt(m[2], 10);
    return h <= 23 && minutes <= 59 ? { h: h, m: minutes, text: m[2] } : null;
  }

  // "14:00" -> "2:00 PM": the time the public feed reads ("start - end"); text that is not a time is left as it was typed
  function time12h(t) {
    if (!t) return '';
    var c = clock(t);
    if (!c) return t;
    var ampm = c.h >= 12 ? 'PM' : 'AM';
    var h12 = (c.h % 12 === 0) ? 12 : (c.h % 12);
    return h12 + ':' + c.text + ' ' + ampm;
  }

  // "14:00" -> 840, the minutes since midnight (seconds are not counted, as time12h does not print them); null for what is not a time of day, which is sent as the agent gave it and not judged
  function minutesOfDay(t) {
    var c = clock(t);
    return c ? c.h * 60 + c.m : null;
  }

  // The form's type -> the showing's type and whether the event is public. Public, Virtual and By Appointment are public events (By Appointment is a public open house that needs an RSVP);
  // only Broker Only stays internal. A type nobody knows is internal: it is never put on a public page by mistake.
  function showingType(formType) {
    switch (formType) {
      case 'Public': return { type: 'openhouse', isPublic: true };
      case 'Virtual': return { type: 'openhouse', isPublic: true };
      case 'ByAppointment': return { type: 'openhouse', isPublic: true };
      case 'BrokerOnly': return { type: 'brokersopen', isPublic: false };
      default: return { type: 'brokersopen', isPublic: false };
    }
  }

  function element(tag, className, text) {
    var el = global.document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function create(options) {
    var prefix = options.prefix;
    var savedId = options.listingId || function () { return ''; };
    var toast = options.toast || function () {};
    var tell = options.alert || function (message) { global.alert(message); };
    var ask = options.confirm || function (message) { return global.confirm(message); };
    var request = options.fetch || function (url, init) { return global.fetch(url, init); };
    var blocked = options.blocked || function () { return ''; };      // a reason the form cannot schedule one now (a Coming Soon listing), or ''
    var readOnly = !!options.readOnly;                                 // a viewer: cards without Remove, and nothing added or removed
    var showInternal = options.showInternal !== false;                 // an internal event (Broker Only) is listed unless the page says not to
    var emptyText = readOnly ? 'No upcoming open houses found.' : EMPTY_TEXT;

    function control(suffix) { return global.document.getElementById(prefix + suffix); }
    function value(suffix) { var el = control(suffix); return el ? el.value : ''; }
    function errorText(err) { return (err && err.message) || 'network error'; }

    function showForm() { var form = control('AddOpenHouseForm'); if (form && !readOnly) form.style.display = 'block'; }
    function cancelForm() { var form = control('AddOpenHouseForm'); if (form) form.style.display = 'none'; }

    // A line of its own in place of the cards: the list is being asked for, it could not be had, or it holds none
    function showMessage(list, message) {
      list.textContent = '';
      var line = element('p', 'text-sm text-gray-500 italic py-4 text-center', message);
      line.id = prefix + 'OpenHouseEmpty';
      list.appendChild(line);
    }
    function showEmpty(list) { showMessage(list, emptyText); }

    // A saved open house as a card that carries the showing's id (for its removal)
    function renderCard(oh) {
      var list = control('OpenHouseList');
      if (!list) return;
      var empty = control('OpenHouseEmpty');
      if (empty) empty.remove();
      var label = String(oh.type || 'Public').replace('ByAppointment', 'By Appt').replace('BrokerOnly', 'Broker Only');
      var date = new Date(oh.date + 'T00:00');
      var dateLabel = isNaN(date.getTime()) ? String(oh.date || '') : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      var row = element('div', 'border rounded-lg p-4 bg-white flex items-center justify-between');
      row.setAttribute('data-showing-id', String(oh.id || ''));
      var left = element('div', 'flex items-center gap-4');
      var when = element('div', 'text-center');
      when.appendChild(element('div', 'text-lg font-bold text-gray-800', dateLabel));
      when.appendChild(element('div', 'text-xs text-gray-500', String(oh.time || '')));
      left.appendChild(when);
      var what = element('div');
      what.appendChild(element('span', 'px-2 py-1 rounded text-xs font-medium ' + (TYPE_BADGE[oh.type] || 'bg-gray-100 text-gray-700'), label));
      if (oh.isPublic === false) what.appendChild(element('span', 'ml-1 text-[10px] text-gray-400', '(internal)'));
      if (oh.notes) what.appendChild(element('p', 'text-xs text-gray-500 mt-1', String(oh.notes)));
      left.appendChild(what);
      row.appendChild(left);
      if (!readOnly) {
        var remove = element('button', 'text-red-600 hover:text-red-700 text-xs');
        remove.type = 'button';
        remove.appendChild(element('i', 'fas fa-times mr-1'));
        remove.appendChild(global.document.createTextNode(' Remove'));
        remove.addEventListener('click', function () { removeOpenHouse(oh.id, remove); });
        row.appendChild(remove);
      }
      list.appendChild(row);
    }

    function save() {
      if (readOnly) return Promise.resolve(null);
      var date = value('NewOHDate'), start = value('NewOHStart'), end = value('NewOHEnd');
      var type = value('NewOHType') || 'Public';
      var notes = value('NewOHNotes');
      if (!date || !start || !end) { tell('Please fill in Date, Start Time, and End Time.'); return Promise.resolve(null); }
      // the public feed prints "start - end": an open house that ends when it begins, or before, is not one (it would be shown as "2:00 PM - 1:00 PM")
      var from = minutesOfDay(start), to = minutesOfDay(end);
      if (from !== null && to !== null && to <= from) { tell('The end time must be after the start time.'); return Promise.resolve(null); }
      var reason = blocked();
      if (reason) { tell(reason); return Promise.resolve(null); }
      var id = savedId();
      if (!id) { tell(options.unsavedMessage || 'Save the listing first (as a draft), then add open houses — they attach to the saved listing.'); return Promise.resolve(null); }
      var info = showingType(type);
      var timeText = time12h(start) + ' - ' + time12h(end);
      var saveButton = global.document.querySelector('#' + prefix + 'AddOpenHouseForm button[data-oh-save]');
      if (saveButton) saveButton.disabled = true;
      var done = function () { if (saveButton) saveButton.disabled = false; };
      return request('/api/crm/showings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ listing_id: String(id), date: date, time: timeText, type: info.type, notes: '[' + type + '] ' + (notes || '') }),
      }).then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) { toast('Could not save open house: ' + ((body && body.error) || response.status), 'error'); return null; });
        }
        return response.json().then(function (body) {
          var saved = (body && (body.showing || body)) || {};
          renderCard({ id: saved.id || '', date: date, time: timeText, type: type, notes: notes, isPublic: info.isPublic });
          toast('Open house saved' + (info.isPublic ? '' : ' (internal — not shown publicly)'), 'success');
          ['NewOHDate', 'NewOHStart', 'NewOHEnd', 'NewOHNotes'].forEach(function (suffix) { control(suffix).value = ''; });
          control('NewOHType').value = 'Public';
          cancelForm();
          return saved;
        });
      }).catch(function (err) { toast('Could not save open house: ' + errorText(err), 'error'); return null; }).then(function (result) { done(); return result; });
    }

    // Removing an open house cancels the showing (confirmed -> cancelled); the public feed leaves cancelled ones out. The card goes once the server has done it.
    function removeOpenHouse(showingId, from) {
      if (readOnly || !ask('Remove this open house?')) return Promise.resolve(false);
      if (!showingId) { toast('This open house has no id, so it cannot be cancelled here.', 'error'); return Promise.resolve(false); }
      var row = from.closest('[data-showing-id]');
      return request('/api/crm/showings/' + encodeURIComponent(showingId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: 'cancelled' }),
      }).then(function (response) {
        if (!response.ok) { toast('Could not remove open house (HTTP ' + response.status + ')', 'error'); return false; }
        if (row) row.remove();
        toast('Open house removed', 'success');
        var list = control('OpenHouseList');
        if (list && list.children.length === 0) showEmpty(list);
        return true;
      }).catch(function (err) { toast('Could not remove open house: ' + errorText(err), 'error'); return false; });
    }

    // Today, as the route reads a date (year-month-day, the agent's own calendar day)
    function today() {
      var now = options.now ? options.now() : new Date();
      function two(n) { return (n < 10 ? '0' : '') + n; }
      return now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate());
    }

    // Every showing of one type from today on. The route answers at most 200 at a time, the oldest first (and an agent's own only, unless the reader is a broker): asked for all of them it would
    // answer with the old ones, and a listing's open houses could be past the 200th. So it is asked for one type from today on, page after page until it has said how many there are (a route that
    // does not say is asked again while its page is full). Ten pages at most: a list that is longer than that cannot be had whole, and is not shown as if it were.
    var PAGE = 200, PAGES = 10;
    function fetchType(type) {
      var rows = [];
      function page(offset, pagesLeft) {
        return request('/api/crm/showings?type=' + type + '&date_from=' + today() + '&limit=' + PAGE + '&offset=' + offset, { credentials: 'include' }).then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        }).then(function (body) {
          var got = (body && (body.showings || body.data)) || (Array.isArray(body) ? body : []);
          if (!Array.isArray(got)) got = [];
          rows = rows.concat(got);
          var more = got.length > 0 && (body && typeof body.total === 'number' ? rows.length < body.total : got.length >= PAGE);
          if (!more) return rows;
          if (pagesLeft <= 1) throw new Error('more open houses than can be listed');
          return page(rows.length, pagesLeft - 1);
        });
      }
      return page(0, PAGES);
    }

    // The listing's upcoming (not cancelled) open houses. Broker Only events are a type of their own and are asked for too (they must come back, and be cancellable), unless the page says not to list them.
    function load(keys) {
      var list = control('OpenHouseList');
      if (!list) return Promise.resolve();
      var wanted = (keys || []).filter(function (k) { return k !== undefined && k !== null && k !== ''; }).map(String);
      if (wanted.length === 0) { showEmpty(list); return Promise.resolve(); }
      showMessage(list, 'Loading open houses...');
      // (started inside a promise: a request that throws before it is sent is a list that could not be had, not an error in the page that asked)
      return new Promise(function (resolve) { resolve(Promise.all((showInternal ? ['openhouse', 'brokersopen'] : ['openhouse']).map(fetchType))); }).then(function (lists) {
        var seen = {};
        var mine = [].concat.apply([], lists).filter(function (s) {
          if (!s || typeof s !== 'object' || s.status === 'cancelled') return false;
          if (s.type !== 'openhouse' && s.type !== 'brokersopen') return false;
          if (s.type === 'brokersopen' && !showInternal) return false;
          var own = (s.listing && s.listing.listing_id) || '';
          if (wanted.indexOf(String(own)) < 0 && wanted.indexOf(String(s.listing_id)) < 0) return false;
          if (s.id === undefined || s.id === null) return true;
          if (seen[String(s.id)]) return false;                                        // the same showing, asked for twice
          seen[String(s.id)] = true;
          return true;
        });
        showEmpty(list);
        // by date (each type came back by date, but the two together did not); the ones of one day stay in the order they came in
        mine.map(function (s, index) { return { s: s, day: String(s.date || '').split('T')[0], index: index }; }).sort(function (a, b) {
          return a.day < b.day ? -1 : (a.day > b.day ? 1 : a.index - b.index);
        }).forEach(function (entry) {
          var s = entry.s;
          var m = String(s.notes || '').match(/^\[([A-Za-z]+)\]\s*([\s\S]*)$/);          // the type the agent chose, kept in the notes
          renderCard({
            id: s.id, date: entry.day, time: s.time || '',
            type: m ? m[1] : (s.type === 'brokersopen' ? 'BrokerOnly' : 'Public'),
            notes: m ? m[2] : (s.notes || ''), isPublic: s.type === 'openhouse',
          });
        });
      }).catch(function () { if (global.document) showMessage(list, 'Open houses could not be loaded.'); });       // (a page that was closed while the list was out has nothing to write to: it is not an error)
    }

    return { showForm: showForm, cancelForm: cancelForm, save: save, remove: removeOpenHouse, load: load, render: renderCard };
  }

  global.MallanOpenHouses = { create: create, time12h: time12h, showingType: showingType };
})(typeof window !== 'undefined' ? window : this);
