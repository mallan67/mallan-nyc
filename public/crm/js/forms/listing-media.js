/* js/forms/listing-media.js: the photos and floor plans of an Add / Edit listing form (the Media and Documents panel).
 *
 * One manager per form:
 *
 *   var media = MallanListingMedia.create({ prefix: 'rental', listingId: function () { return the id of the saved listing, '' for a new one; }, toast: showToast });
 *   media.bind();                           the two file boxes (<prefix>PhotoInput, <prefix>FloorplanInput) and their drop zones hand their files to the manager
 *   media.uploadPending(id, options)        saves the files chosen so far to the listing, one after the other: POST /api/crm/listings/<id>/media/upload
 *   media.render(id, fallbackId)            shows the saved photos and floor plans: GET /api/crm/listings/<id>/media, as tiles with a cover, move and remove
 *   media.saveMedia()                       the panel's Save Media button; a listing that is not saved yet is told options.unsavedMessage ('Save the listing first before uploading media.' unless the page words it)
 *   media.hasPending() / media.reset()      files chosen and not saved yet / forget them (another record is in the form)
 *
 * The controls it uses: <prefix>PhotoInput, <prefix>FloorplanInput (file boxes), <prefix>PhotoPreview, <prefix>FloorplanPreview (where the tiles go), <prefix>PhotoCount (the count).
 *
 * Built with DOM calls throughout: a file name, a stored address, id or key is text and an attribute value here, never markup (a file can be called <img src=x onerror=...>.jpg). A stored
 * media address counts only when it is a web address (http, https, or from this site's own root); anything else shows no picture. A removal is shown only once the server has done it.
 */
(function (global) {
  'use strict';

  var MAX_BYTES = 10 * 1024 * 1024;     // the upload route refuses an image over 10MB (lib/images/optimize: validateImage)
  var MAX_PHOTOS = 100;
  var MOVE_BUTTON_CLASS = 'bg-black/60 hover:bg-black/80 text-white rounded w-6 h-6 text-xs leading-none flex items-center justify-center';

  function webAddress(value) { return (typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(value.trim())) ? value.trim() : ''; }
  function mediaText(value) { return typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : ''); }
  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function isPdf(file) { return file.type === 'application/pdf' || String(file.name).toLowerCase().slice(-4) === '.pdf'; }

  function element(tag, className, text) {
    var el = global.document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(className, label, onClick, title) {
    var b = element('button', className, label);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }
  function image(url, className) {
    var img = global.document.createElement('img');
    img.src = url;
    img.draggable = false;               // the tile, not the picture, is what is dragged
    img.className = className;
    return img;
  }

  function create(options) {
    var prefix = options.prefix;
    var savedId = options.listingId || function () { return ''; };
    var toast = options.toast || function () {};
    var ask = options.confirm || function (message) { return global.confirm(message); };
    var request = options.fetch || function (url, init) { return global.fetch(url, init); };
    var previewUrl = options.createObjectURL || function (file) { return global.URL.createObjectURL(file); };
    var pending = [];                    // the files chosen and not saved yet: { file, type, order, uploaded, _removed }
    var uploading = false;
    var inFlight = null;                 // the upload that is sending now (a promise): files chosen meanwhile are sent when it is done
    var queued = null;                   // the upload that waits for it (one, for all the files chosen meanwhile)
    var savedPhotos = 0;                 // the photos the listing has saved, as the last redraw saw them

    function control(suffix) { return global.document.getElementById(prefix + suffix); }
    function mediaUrl(id, tail) { return '/api/crm/listings/' + encodeURIComponent(id) + '/media' + (tail || ''); }
    function errorText(err) { return (err && err.message) || 'network error'; }

    // the photos the listing has and the ones still waiting to be saved (a file that has been saved is among the first: the redraw counted it)
    function countPhotos() {
      var count = control('PhotoCount');
      var waiting = pending.filter(function (m) { return m.type === 'photo' && !m._removed && !m.uploaded; }).length;
      if (count) count.textContent = (savedPhotos + waiting) + ' / ' + MAX_PHOTOS + ' uploaded';
    }

    // ── files the agent has chosen ──
    function addFiles(files, mediaType) {
      if (!files || files.length === 0) return;
      var preview = control(mediaType === 'photo' ? 'PhotoPreview' : 'FloorplanPreview');
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.size > MAX_BYTES) { toast('File "' + file.name + '" exceeds 10MB limit.', 'error'); continue; }
        if (isPdf(file) && mediaType === 'floorplan') toast('PDF floor plans are preview-only. Upload as JPG/PNG image for full support.', 'warning');      // the upload route takes images only
        var duplicate = pending.some(function (existing) { return !existing._removed && existing.file.name === file.name && existing.file.size === file.size; });
        if (duplicate) { toast('Skipping duplicate: ' + file.name, 'info'); continue; }
        var entry = { file: file, type: mediaType, order: pending.length, uploaded: false };
        pending.push(entry);
        // a browser that cannot make a preview still takes the file: its tile shows the name and can be removed, so no file is queued that the agent cannot see
        var shown = '';
        try { shown = previewUrl(file); } catch (err) { shown = ''; }
        if (preview) preview.appendChild(pendingTile(entry, pending.length - 1, shown));
      }
      countPhotos();
      // A listing that is already saved takes the files at once, so they are tiles that can be moved and made the cover straight away; a new one keeps them until it is saved.
      var id = savedId();
      var plans = mediaType === 'floorplan';
      var kind = plans ? 'floor plan' : 'photo';
      if (id && (!options.canUpload || options.canUpload())) {
        toast(files.length + ' ' + kind + '(s) added — uploading' + (inFlight ? ' as soon as the current upload is done' : '') + '…', 'info');
        uploadSoon(id);
      } else {
        toast(files.length + ' ' + kind + '(s) added. Save the listing to upload' + (plans ? '.' : ', then drag or use ◀/▶ to reorder.'), 'success');
      }
    }

    // Sends the files that are waiting to the saved listing: at once, or when the upload that is out is done. The files chosen meanwhile ride on the ONE upload that follows it (it takes
    // what is waiting when it begins), so none is left where nobody sends it, and the listing is redrawn and told once for them.
    function uploadSoon(id) {
      if (queued) return;
      var start = function () {
        queued = null;
        var batch = pending.filter(function (m) { return !m.uploaded && !m._removed; });
        var plans = batch.filter(function (m) { return m.type === 'floorplan'; }).length;
        // what the files are called: floor plans, photos (which can be reordered), or both
        var uploadedText = plans === batch.length ? ' floor plan(s) uploaded.' : plans === 0 ? ' photo(s) uploaded — drag or use ◀/▶ to reorder.' : ' file(s) uploaded.';
        return uploadPending(id, { appendAfterExisting: true }).then(function (result) {
          render(id);
          if (result.uploaded > 0) toast(result.uploaded + uploadedText, 'success');
          if (result.failed > 0) toast(result.failed + ' upload(s) failed.', 'warning');
        }).catch(function (err) { toast('Upload failed: ' + errorText(err), 'error'); });
      };
      if (inFlight) queued = inFlight.then(start, start);      // (an upload that failed outright is told by whoever began it; it does not stop the files that follow)
      else start();
    }

    // The preview tile of a file chosen and not saved yet. Its buttons act on this file and this tile, whatever else is chosen in the same batch.
    function pendingTile(entry, index, url) {
      var div = element('div', 'relative group');
      div.setAttribute('data-media-index', String(index));
      var remove = button('absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-[10px] opacity-0 group-hover:opacity-100 transition', '×', function () { removePending(index, this); });
      if (isPdf(entry.file)) {
        var box = element('div', 'w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center');
        box.appendChild(element('i', 'fas fa-file-pdf text-3xl text-red-400'));
        div.appendChild(box);
        div.appendChild(element('p', 'text-[10px] text-gray-500 truncate mt-1', entry.file.name));
        div.appendChild(remove);
        return div;
      }
      div.appendChild(url ? image(url, 'w-full h-24 object-cover rounded-lg') : element('div', 'w-full h-24 bg-gray-100 rounded-lg'));
      if (entry.type === 'photo') {
        var move = element('div', 'absolute bottom-6 left-1 right-1 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition z-10');
        move.appendChild(button(MOVE_BUTTON_CLASS, '◀', function () { movePending(div, -1); }, 'Move earlier'));
        move.appendChild(button(MOVE_BUTTON_CLASS, '▶', function () { movePending(div, 1); }, 'Move later'));
        div.appendChild(move);
      }
      div.appendChild(element('p', 'text-[10px] text-gray-500 truncate mt-1', entry.file.name));
      div.appendChild(remove);
      return div;
    }

    // Moves a preview among the previews of unsaved files only (a saved photo's tile has a key, and its order is the server's), and keeps the order the files will be saved in.
    function movePending(tile, direction) {
      var container = tile && tile.parentElement;
      if (!container) return;
      var neighbour = direction < 0 ? tile.previousElementSibling : tile.nextElementSibling;
      while (neighbour && neighbour.getAttribute('data-media-index') === null) neighbour = direction < 0 ? neighbour.previousElementSibling : neighbour.nextElementSibling;
      if (!neighbour) return;                                  // already at the edge of the unsaved ones
      if (direction < 0) container.insertBefore(tile, neighbour); else container.insertBefore(neighbour, tile);
      var position = 0;
      Array.prototype.slice.call(container.children).forEach(function (child) {
        var entry = pending[parseInt(child.getAttribute('data-media-index'), 10)];       // a saved tile has no index: NaN finds no file
        if (entry) entry.order = position++;
      });
    }

    function removePending(index, from) {
      if (pending[index]) pending[index]._removed = true;
      var tile = from && from.closest && from.closest('[data-media-index]');
      if (tile) tile.remove();
      countPhotos();
    }

    // ── saving the chosen files ──
    function uploadPending(id, opts) {
      var waiting = pending.filter(function (m) { return !m.uploaded && !m._removed; });
      if (waiting.length === 0) return Promise.resolve({ uploaded: 0, failed: 0 });
      // The save of a new listing, the upload of files added to a saved one and the Save Media button all send the same files: while one is sending, another does not.
      if (uploading) { toast('Media upload already in progress — please wait.', 'info'); return Promise.resolve({ uploaded: 0, failed: 0, busy: true }); }
      uploading = true;
      var uploaded = 0, failed = 0;
      var chain = Promise.resolve();
      // Files added to a saved listing go where the route puts them (after the photos it has, in the order they arrive), so they are sent in the order the agent arranged them in; a new
      // listing sends the place of each file with it, and the sequence of its requests does not matter.
      var sequence = (opts && opts.appendAfterExisting) ? waiting.slice().sort(function (a, b) { return a.order - b.order; }) : waiting;
      sequence.forEach(function (entry) {
        chain = chain.then(function () {
          if (isPdf(entry.file)) {                             // the upload route takes images only
            toast('Skipping PDF "' + entry.file.name + '" — upload as JPG/PNG image instead.', 'warning');
            entry._removed = true;
            return null;
          }
          var form = new global.FormData();
          form.append('file', entry.file);
          // Files added to a saved listing leave out the order, so the route puts them after the photos it has; a new listing sends the order the agent arranged.
          if (!(opts && opts.appendAfterExisting)) form.append('order', String(entry.order));
          form.append('caption', entry.type === 'floorplan' ? 'Floor Plan' : '');
          return request(mediaUrl(id, '/upload'), { method: 'POST', body: form, credentials: 'same-origin' }).then(function (response) {
            if (response.ok || response.status === 409) {                                            // 409: the same picture is there already
              entry.uploaded = true;
              uploaded++;
              return null;
            }
            return response.json().catch(function () { return {}; }).then(function (body) {
              toast('Upload failed for ' + entry.file.name + ': ' + ((body && body.error) || response.status), 'error');
              failed++;
            });
          }).catch(function (err) { toast('Upload failed for ' + entry.file.name + ': ' + errorText(err), 'error'); failed++; });
        });
      });
      var done = function () { uploading = false; inFlight = null; };
      inFlight = chain.then(function () { done(); return { uploaded: uploaded, failed: failed }; }, function (err) { done(); throw err; });
      return inFlight;
    }

    function saveMedia() {
      var id = savedId();
      if (!id) { toast(options.unsavedMessage || 'Save the listing first before uploading media.', 'warning'); return Promise.resolve(null); }
      var waiting = pending.filter(function (m) { return !m.uploaded && !m._removed; });
      if (waiting.length === 0) { toast('No new media to upload.', 'info'); return Promise.resolve(null); }
      // an upload is out: it is not started again, and the agent is not told "Uploading…" and then "0 uploaded"
      if (uploading) { toast('Media upload already in progress — please wait.', 'info'); return Promise.resolve({ uploaded: 0, failed: 0, busy: true }); }
      toast('Uploading ' + waiting.length + ' file(s)...', 'info');
      // the listing is saved, so the files go after the photos it has (their own places were counted among the files chosen, not among the listing's photos)
      return uploadPending(id, { appendAfterExisting: true }).then(function (result) {
        toast(result.uploaded + ' uploaded' + (result.failed > 0 ? ', ' + result.failed + ' failed' : ''), result.failed > 0 ? 'warning' : 'success');
        // what was saved is the listing's own tile now: shown in place of its preview
        return (result.uploaded > 0 ? render(id) : Promise.resolve()).then(function () { return result; });
      });
    }

    // ── the listing's saved photos and floor plans ──
    function fetchMedia(id) {
      if (!id) return Promise.resolve({ ok: false, body: null });
      return request(mediaUrl(id), { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) return { ok: false, body: null };
        return response.json().catch(function () { return null; }).then(function (body) { return { ok: !!(body && Array.isArray(body.media)), body: body }; });
      }).catch(function () { return { ok: false, body: null }; });
    }

    function render(id, fallbackId) {
      if (!id && !fallbackId) return Promise.resolve();
      var photos = control('PhotoPreview'), floors = control('FloorplanPreview');
      if (!photos && !floors) return Promise.resolve();
      return fetchMedia(id).then(function (found) {
        // an edit session keyed by the numeric id still gets its tiles when the listing's own id does not answer
        if (!found.ok && fallbackId && fallbackId !== id) return fetchMedia(fallbackId);
        return found;
      }).then(function (found) {
        if (!found.ok) { toast('Media manager could not load — showing the saved preview. Reload to retry.', 'warning'); return; }
        // The tiles act on the listing's own id as the server answers it: the order route knows no other, and a numeric id would not find it.
        var actionId = String((found.body && found.body.listing_id) || id || '');
        // The saved tiles are drawn again. The previews of files that are still waiting to be saved stay, after them: those files are still queued, and the agent must be able to see (and remove)
        // what will be sent. A file that was saved is its saved tile now, and one the upload dropped (a PDF) is gone.
        var waitingTiles = function (box) {
          if (!box) return [];
          return Array.prototype.slice.call(box.children).filter(function (tile) {
            var entry = pending[parseInt(tile.getAttribute('data-media-index'), 10)];       // a saved tile has no index: NaN finds no file
            return !!entry && !entry.uploaded && !entry._removed;
          });
        };
        var keepPhotos = waitingTiles(photos), keepPlans = waitingTiles(floors);
        if (photos) photos.innerHTML = '';
        if (floors) floors.innerHTML = '';
        // an entry that is not a record, or has no key (a text or a number: it could not be moved or removed), shows nothing
        var rows = found.body.media.filter(function (m) { return m && typeof m === 'object' && (typeof m.media_key === 'number' || (typeof m.media_key === 'string' && m.media_key !== '')); });
        var pictures = rows.filter(function (m) { return m.media_type !== 'FloorPlan'; });
        var plans = rows.filter(function (m) { return m.media_type === 'FloorPlan'; });
        pictures.forEach(function (m, index) { renderTile(photos, m, index, actionId); });
        plans.forEach(function (m, index) { renderTile(floors, m, index, actionId); });
        keepPhotos.forEach(function (tile) { photos.appendChild(tile); });
        keepPlans.forEach(function (tile) { floors.appendChild(tile); });
        savedPhotos = pictures.length;
        countPhotos();
      });
    }

    function renderTile(container, m, index, id) {
      if (!container) return;                                  // the page has no box for this kind
      var key = mediaText(m.media_key);
      var isFloor = m.media_type === 'FloorPlan';
      var div = element('div', 'relative group');
      div.setAttribute('data-media-key', key);
      if (!isFloor) {
        div.draggable = true;
        div.ondragstart = function (e) { e.dataTransfer.setData('text/plain', key); };
        div.ondragover = function (e) { e.preventDefault(); this.style.outline = '2px solid #B8860B'; };
        div.ondragleave = function () { this.style.outline = ''; };
        div.ondrop = function (e) { e.preventDefault(); this.style.outline = ''; dropOn(e, this, id, container); };
      }
      var url = webAddress(m.url);                             // a row whose address is not a web address keeps its tile (it can still be removed), without a picture
      div.appendChild(url ? image(url, 'w-full h-24 object-cover rounded-lg border') : element('div', 'w-full h-24 bg-gray-100 rounded-lg border'));
      if (m.preferred_photo_yn) {
        div.appendChild(element('div', 'absolute top-1 left-1 bg-[#B8860B] text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow', '★ COVER'));
      } else if (!isFloor) {
        div.appendChild(button('absolute top-1 left-1 bg-white/90 text-[#7a6a3a] text-[9px] font-semibold px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow', '☆ Set cover', function () { setCover(id, key); }));
      }
      if (!isFloor) {                                          // click-to-move: no drag needed, works on every device
        var move = element('div', 'absolute bottom-6 left-1 right-1 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition z-10');
        move.appendChild(button(MOVE_BUTTON_CLASS, '◀', function () { moveTile(id, key, -1); }, 'Move earlier'));
        move.appendChild(button(MOVE_BUTTON_CLASS, '▶', function () { moveTile(id, key, 1); }, 'Move later'));
        div.appendChild(move);
      }
      div.appendChild(button('absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-[10px] opacity-0 group-hover:opacity-100', '×', function () { removeSaved(this, id, key); }));
      div.appendChild(element('p', 'text-[10px] text-gray-500 truncate mt-1', isFloor ? 'Floor Plan' : 'Photo ' + (index + 1)));
      container.appendChild(div);
    }

    function orderedKeys(container) {
      return Array.prototype.slice.call(container.children).map(function (c) { return c.getAttribute('data-media-key'); }).filter(Boolean);
    }

    function dropOn(e, target, id, container) {
      var fromKey = e.dataTransfer.getData('text/plain');
      var from = container.querySelector('[data-media-key="' + cssEscape(fromKey) + '"]');
      if (!from || from === target) return;
      var items = Array.prototype.slice.call(container.children);
      if (items.indexOf(from) < items.indexOf(target)) container.insertBefore(from, target.nextSibling); else container.insertBefore(from, target);
      saveOrder(id, orderedKeys(container));
    }

    function saveOrder(id, keys) {
      request(mediaUrl(id).replace(/\/media$/, '/media-order'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_media_ids: keys }), credentials: 'include' }).then(function (response) {
        if (response.ok) toast('Photo order saved', 'success');
        else toast('Photo order NOT saved (HTTP ' + response.status + '). Reload to see actual order.', 'error');
      }).catch(function (err) { toast('Photo order NOT saved: ' + errorText(err), 'error'); });
    }

    // Moves a photo past its neighbour among the SAVED tiles only: an unsaved preview has no key, and the order sent (which leaves keyless tiles out) would not be the order shown.
    function moveTile(id, key, direction) {
      var container = control('PhotoPreview');
      if (!container) return;
      var tile = container.querySelector('[data-media-key="' + cssEscape(key) + '"]');
      if (!tile) return;
      var neighbour = direction < 0 ? tile.previousElementSibling : tile.nextElementSibling;
      while (neighbour && !neighbour.getAttribute('data-media-key')) neighbour = direction < 0 ? neighbour.previousElementSibling : neighbour.nextElementSibling;
      if (!neighbour) return;                                  // already at the edge of the saved ones
      if (direction < 0) container.insertBefore(tile, neighbour); else container.insertBefore(neighbour, tile);
      var number = 0;
      Array.prototype.slice.call(container.children).forEach(function (child) {
        if (child.getAttribute('data-media-key')) child.querySelector('p').textContent = 'Photo ' + (++number);     // an unsaved preview shows its file name, whatever the name is
      });
      saveOrder(id, orderedKeys(container));
    }

    function setCover(id, key) {
      request(mediaUrl(id, '/' + encodeURIComponent(key)), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferred_photo_yn: true }), credentials: 'include' }).then(function (response) {
        if (response.ok) { toast('Main photo set', 'success'); render(id); }
        else toast('Could not set main photo (HTTP ' + response.status + ')', 'error');
      }).catch(function (err) { toast('Could not set main photo: ' + errorText(err), 'error'); });
    }

    // The tile goes once the server has removed the picture; a removal that failed leaves the tile (the picture is still there) and says so.
    function removeSaved(from, id, key) {
      if (!ask('Remove this photo?')) return;
      var tile = from.closest('.group');
      request(mediaUrl(id, '/' + encodeURIComponent(key)), { method: 'DELETE', credentials: 'same-origin' }).then(function (response) {
        if (response.ok || response.status === 404) { if (tile) tile.remove(); toast('Photo removed', 'success'); }
        else toast('Could not remove the photo (HTTP ' + response.status + ')', 'error');
      }).catch(function (err) { toast('Could not remove the photo: ' + errorText(err), 'error'); });
    }

    // ── the file boxes ──
    function bind() {
      [['PhotoInput', 'photo'], ['FloorplanInput', 'floorplan']].forEach(function (pair) {
        var input = control(pair[0]);
        if (!input || input.getAttribute('data-media-bound')) return;
        input.setAttribute('data-media-bound', '1');
        input.addEventListener('change', function (event) { addFiles(event.target.files, pair[1]); event.target.value = ''; });
        // "Drag and drop photos here": a file dropped on the box is taken, and is not opened by the browser in place of the form
        var zone = input.parentElement;
        if (zone) {
          zone.addEventListener('dragover', function (event) { event.preventDefault(); });
          zone.addEventListener('drop', function (event) { event.preventDefault(); addFiles(event.dataTransfer && event.dataTransfer.files, pair[1]); });
        }
      });
    }

    // Another record is in the form: the files chosen for the last one are forgotten, previews and all, and so are its saved tiles (they act on the last listing's photos: they must not be
    // left to move or remove them, nor to stay if the next record's photos cannot be loaded). The next render draws the tiles of the record in the form.
    function reset() {
      pending = [];
      savedPhotos = 0;
      ['PhotoPreview', 'FloorplanPreview'].forEach(function (suffix) {
        var box = control(suffix);
        if (box) box.innerHTML = '';
      });
      countPhotos();
    }

    return {
      bind: bind, addFiles: addFiles, uploadPending: uploadPending, saveMedia: saveMedia, render: render, reset: reset,
      hasPending: function () { return pending.some(function (m) { return !m.uploaded && !m._removed; }); },
      pending: function () { return pending.slice(); },
    };
  }

  global.MallanListingMedia = { create: create, webAddress: webAddress };
})(typeof window !== 'undefined' ? window : this);
