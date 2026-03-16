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
    if (amount == null || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
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
  };
})();
