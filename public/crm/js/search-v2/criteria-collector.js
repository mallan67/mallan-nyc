// ═══════════════════════════════════════════════════════════════
// CRITERIA COLLECTOR — Reads form values via registry iteration
// Replaces the 400+ line hardcoded collectSearchCriteria()
// ═══════════════════════════════════════════════════════════════
var CriteriaCollector = (function() {
  'use strict';

  function _parseValue(raw, field) {
    var p = field.providers && field.providers.trestle;
    var dt = p ? p.datatype : 'string';
    switch (dt) {
      case 'integer': var v = parseInt(raw); return isNaN(v) ? null : v;
      case 'float': case 'number': var v = parseFloat(raw); return isNaN(v) ? null : v;
      case 'boolean': return raw === 'true' || raw === true;
      default: return raw;
    }
  }

  function _readRangeSelect(field, container) {
    var k = field.key;
    var minEl = container.querySelector('#' + k + '-min');
    var maxEl = container.querySelector('#' + k + '-max');
    var result = { min: null, max: null };
    if (minEl && minEl.value && minEl.value !== '') {
      if (minEl.value === 'custom') {
        var cEl = container.querySelector('#' + k + '-custom-min');
        if (cEl && cEl.value) result.min = _parseValue(cEl.value, field);
      } else {
        result.min = _parseValue(minEl.value, field);
      }
    }
    if (maxEl && maxEl.value && maxEl.value !== '') {
      if (maxEl.value === 'custom') {
        var cEl = container.querySelector('#' + k + '-custom-max');
        if (cEl && cEl.value) result.max = _parseValue(cEl.value, field);
      } else {
        result.max = _parseValue(maxEl.value, field);
      }
    }
    return (result.min !== null || result.max !== null) ? result : null;
  }

  function _readCheckboxGroup(field, container) {
    var checked = container.querySelectorAll('[data-field="' + field.key + '"]:checked');
    if (checked.length === 0) return null;
    return Array.from(checked).map(function(cb) {
      return cb.getAttribute('data-value') || cb.value;
    });
  }

  function _readBoolean(field, container) {
    var el = container.querySelector('#' + field.key);
    if (!el) return null;
    return el.checked ? true : null;
  }

  function _readText(field, container) {
    var el = container.querySelector('#' + field.key);
    if (!el || !el.value.trim()) return null;
    return el.value.trim();
  }

  function _readNumberRange(field, container) {
    var k = field.key;
    var minEl = container.querySelector('#' + k + '-min');
    var maxEl = container.querySelector('#' + k + '-max');
    var result = { min: null, max: null };
    if (minEl && minEl.value) { var v = parseFloat(minEl.value); if (!isNaN(v)) result.min = v; }
    if (maxEl && maxEl.value) { var v = parseFloat(maxEl.value); if (!isNaN(v)) result.max = v; }
    return (result.min !== null || result.max !== null) ? result : null;
  }

  function _readDateRange(field, container) {
    var k = field.key;
    var fromEl = container.querySelector('#' + k + '-from');
    var toEl = container.querySelector('#' + k + '-to');
    var result = { min: null, max: null };
    if (fromEl && fromEl.value) result.min = fromEl.value;
    if (toEl && toEl.value) result.max = toEl.value;
    return (result.min !== null || result.max !== null) ? result : null;
  }

  function _readSelect(field, container) {
    var el = container.querySelector('#' + field.key);
    if (!el || !el.value || el.value === '') return null;
    return el.value;
  }

  function _readRadioGroup(field, container) {
    var checked = container.querySelector('[data-field="' + field.key + '"]:checked');
    return checked ? checked.value : null;
  }

  function _readNeighborhood(field, container) {
    if (typeof getSelectedNeighborhoods === 'function') {
      var widget = container.querySelector('[data-custom-widget="neighborhood"]');
      var tagsId = widget ? widget.id.replace('-widget', '-tags') : null;
      var selected = getSelectedNeighborhoods(tagsId);
      return selected && selected.length > 0 ? selected : null;
    }
    return null;
  }

  function _readWidget(field, container) {
    switch (field.widget) {
      case 'range-select': return _readRangeSelect(field, container);
      case 'checkbox-group': return _readCheckboxGroup(field, container);
      case 'boolean': return _readBoolean(field, container);
      case 'text': return _readText(field, container);
      case 'number-range': return _readNumberRange(field, container);
      case 'date-range': return _readDateRange(field, container);
      case 'select': return _readSelect(field, container);
      case 'radio-group': return _readRadioGroup(field, container);
      case 'neighborhood': return _readNeighborhood(field, container);
      default: return null;
    }
  }

  function collect(options) {
    var tab = options.tab || 'sale';
    var container = options.container ? document.querySelector(options.container) : document;
    var criteria = { _tab: tab };
    var fields = SearchRegistry.getSearchableFields(tab);
    fields.forEach(function(field) {
      var value = _readWidget(field, container);
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && value.min !== undefined) {
          if (value.min !== null) criteria[field.key + '_min'] = value.min;
          if (value.max !== null) criteria[field.key + '_max'] = value.max;
        } else {
          criteria[field.key] = value;
        }
      }
    });
    return criteria;
  }

  function _formatDisplayValue(val, field) {
    if (val === null || val === undefined) return '';
    var p = field.providers && field.providers.trestle;
    if (p && (p.datatype === 'integer' || p.datatype === 'number')) {
      var n = Number(val);
      if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
      if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
      return '$' + n.toLocaleString();
    }
    return String(val);
  }

  function formatForPill(field, value) {
    if (!field) return String(value);
    var fmt = field.pill_format || (field.label + ': {value}');
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      fmt = fmt.replace('{min}', value.min != null ? _formatDisplayValue(value.min, field) : 'Any');
      fmt = fmt.replace('{max}', value.max != null ? _formatDisplayValue(value.max, field) : 'Any');
    } else if (Array.isArray(value)) {
      fmt = fmt.replace('{value}', value.join(', '));
    } else {
      fmt = fmt.replace('{value}', _formatDisplayValue(value, field));
    }
    return fmt;
  }

  function hasFilters(criteria) {
    return Object.keys(criteria).filter(function(k) { return k !== '_tab'; }).length > 0;
  }

  return {
    collect: collect,
    formatForPill: formatForPill,
    hasFilters: hasFilters,
    setCriterion: function(criteria, key, value) { criteria[key] = value; return criteria; },
    removeCriterion: function(criteria, key) {
      delete criteria[key];
      delete criteria[key + '_min'];
      delete criteria[key + '_max'];
      return criteria;
    }
  };
})();
