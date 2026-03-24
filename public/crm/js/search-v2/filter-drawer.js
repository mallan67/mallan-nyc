// ═══════════════════════════════════════════════════════════════
// FILTER DRAWER — Slide-out panel with full search form
// Opens on "All Filters" click, pre-filled with current criteria
// ═══════════════════════════════════════════════════════════════
var FilterDrawer = (function() {
  'use strict';

  var _isOpen = false;
  var _updateCallbacks = [];
  var _backdrop = null;
  var _drawer = null;
  var _currentTab = 'sale';
  var _currentCriteria = {};

  var DRAWER_ID = 'sv2-drawer-panel';
  var BACKDROP_ID = 'sv2-drawer-backdrop';
  var DRAWER_FORM_ID = 'sv2-drawer-form';

  // ── Ensure DOM elements exist ─────────────────────────────────
  function _ensureDOM() {
    _backdrop = document.getElementById(BACKDROP_ID);
    _drawer = document.getElementById(DRAWER_ID);

    if (!_backdrop) {
      _backdrop = document.createElement('div');
      _backdrop.id = BACKDROP_ID;
      _backdrop.className = 'sv2-drawer-backdrop';
      document.body.appendChild(_backdrop);
    }

    if (!_drawer) {
      _drawer = document.createElement('div');
      _drawer.id = DRAWER_ID;
      _drawer.className = 'sv2-drawer';
      _drawer.innerHTML =
        '<div class="sv2-drawer-header">' +
          '<span class="sv2-drawer-title">All Filters</span>' +
          '<button type="button" class="sv2-drawer-close" data-sv2-drawer-close>&times;</button>' +
        '</div>' +
        '<div class="sv2-drawer-body" id="' + DRAWER_FORM_ID + '"></div>' +
        '<div class="sv2-drawer-footer">' +
          '<button type="button" class="sv2-btn-drawer-clear" style="padding:8px 16px;background:#F3F4F6;color:#374151;border:1px solid #D1D5DB;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">Clear All</button>' +
          '<button type="button" class="sv2-btn-drawer-apply" style="padding:8px 20px;background:#111827;color:white;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Apply Filters</button>' +
        '</div>';
      document.body.appendChild(_drawer);

      // Wire close button
      var closeBtn = _drawer.querySelector('[data-sv2-drawer-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', function() { close(); });
      }

      // Wire clear button
      var clearBtn = _drawer.querySelector('.sv2-btn-drawer-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          SearchForm.clear('#' + DRAWER_FORM_ID);
        });
      }

      // Wire apply button
      var applyBtn = _drawer.querySelector('.sv2-btn-drawer-apply');
      if (applyBtn) {
        applyBtn.addEventListener('click', function() {
          _collectAndUpdate();
          close();
        });
      }
    }

    // Wire backdrop click
    _backdrop.addEventListener('click', function() { close(); });
  }

  // ── Collect criteria from drawer form and fire update ─────────
  function _collectAndUpdate() {
    var newCriteria = CriteriaCollector.collect({
      tab: _currentTab,
      container: '#' + DRAWER_FORM_ID
    });
    _currentCriteria = newCriteria;
    _updateCallbacks.forEach(function(cb) { cb(newCriteria); });
  }

  // ── Open drawer ───────────────────────────────────────────────
  function open(criteria, tab) {
    _ensureDOM();
    _currentTab = tab || criteria._tab || 'sale';
    _currentCriteria = criteria || {};

    // Render search form into drawer body
    SearchForm.render({
      tab: _currentTab,
      container: '#' + DRAWER_FORM_ID,
      onSearch: function() {
        _collectAndUpdate();
        close();
      },
      onClear: function() {
        SearchForm.clear('#' + DRAWER_FORM_ID);
      }
    });

    // Pre-fill with current criteria
    SearchForm.populateFromCriteria(_currentCriteria, '#' + DRAWER_FORM_ID);

    // Show drawer + backdrop
    requestAnimationFrame(function() {
      _backdrop.classList.add('sv2-open');
      _drawer.classList.add('sv2-open');
      _isOpen = true;
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    });
  }

  // ── Close drawer ──────────────────────────────────────────────
  function close() {
    if (_backdrop) _backdrop.classList.remove('sv2-open');
    if (_drawer) _drawer.classList.remove('sv2-open');
    _isOpen = false;
    document.body.style.overflow = '';
  }

  // ── Keyboard: ESC to close ────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _isOpen) close();
  });

  return {
    open: open,
    close: close,
    isOpen: function() { return _isOpen; },
    onUpdate: function(callback) { _updateCallbacks.push(callback); }
  };
})();
