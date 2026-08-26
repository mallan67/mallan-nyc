// ═══════════════════════════════════════════════════════════════════════════════
// CRM UTILS — Shared utility functions
// ═══════════════════════════════════════════════════════════════════════════════

var Utils = (function () {
  'use strict';

  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatMoney(amount) {
    // UNKNOWN IS NOT ZERO.
    //
    // This returned '$0' for null, undefined and NaN, which re-invented in the
    // renderer exactly what the mapper was stripped of: an unknown fee becoming
    // $0. "Not published" and "free" are opposite facts, and a broker reading
    // "$0 maintenance" on a listing whose maintenance is simply unpublished will
    // quote that to a client.
    //
    // A REAL zero survives as $0. Turning 0 into an em dash would be the same
    // defect pointed the other way — a $0 common charge is a genuine value.
    if (amount === null || amount === undefined || amount === '') return '—';
    var n = Number(amount);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return formatDate(dateStr);
  }

  function formatPercent(val) {
    if (val == null || isNaN(val)) return '0%';
    return Number(val).toFixed(1) + '%';
  }

  function photoUrl(url) {
    if (!url) return '';
    if (url.indexOf('trestle') !== -1 || url.indexOf('corelogic') !== -1 || url.indexOf('cotality') !== -1) {
      return '/api/media/proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function groupBy(arr, key) {
    var result = {};
    (arr || []).forEach(function (item) {
      var k = typeof key === 'function' ? key(item) : (item[key] || 'other');
      if (!result[k]) result[k] = [];
      result[k].push(item);
    });
    return result;
  }

  function sortBy(arr, key, dir) {
    dir = dir === 'desc' ? -1 : 1;
    return (arr || []).slice().sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function pluralize(n, singular, plural) {
    return n === 1 ? singular : (plural || singular + 's');
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  }

  function daysAgo(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function queryString(params) {
    var qs = [];
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== '') {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return qs.length ? '?' + qs.join('&') : '';
  }

  function withRequestState(opts) {
    var btn = opts.button;
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (opts.loadingText || 'Saving...'); }

    var idempotencyKey = 'idem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    opts.request(idempotencyKey).then(function (result) {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
      if (opts.onSuccess) opts.onSuccess(result);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
      if (opts.onError) opts.onError(err);
    });
  }

  // ─── Offline Queue ──────────────────────────────────────────────────
  var _offlineQueue = [];

  function queueOfflineAction(action) {
    _offlineQueue.push({ action: action, timestamp: Date.now() });
    try { localStorage.setItem('mallan_crm_offline_queue', JSON.stringify(_offlineQueue)); } catch(e) {}
  }

  function getOfflineQueue() {
    try { _offlineQueue = JSON.parse(localStorage.getItem('mallan_crm_offline_queue') || '[]'); } catch(e) {}
    return _offlineQueue;
  }

  function clearOfflineQueue() {
    _offlineQueue = [];
    try { localStorage.removeItem('mallan_crm_offline_queue'); } catch(e) {}
  }

  function processOfflineQueue() {
    var queue = getOfflineQueue();
    if (queue.length === 0) return Promise.resolve();

    var promises = queue.map(function(item) {
      return MallanAPI._fetch(item.action.url, item.action.options).catch(function() { return null; });
    });

    return Promise.all(promises).then(function(results) {
      var failed = results.filter(function(r) { return r === null; });
      if (failed.length === 0) clearOfflineQueue();
      return { processed: results.length, failed: failed.length };
    });
  }

  return {
    esc: esc,
    formatMoney: formatMoney,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    formatTimeAgo: formatTimeAgo,
    formatPercent: formatPercent,
    photoUrl: photoUrl,
    uid: uid,
    debounce: debounce,
    groupBy: groupBy,
    sortBy: sortBy,
    pluralize: pluralize,
    initials: initials,
    daysUntil: daysUntil,
    daysAgo: daysAgo,
    truncate: truncate,
    queryString: queryString,
    withRequestState: withRequestState,
    queueOfflineAction: queueOfflineAction,
    getOfflineQueue: getOfflineQueue,
    clearOfflineQueue: clearOfflineQueue,
    processOfflineQueue: processOfflineQueue,
  };
})();
