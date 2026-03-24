// ═══════════════════════════════════════════════════════════════
// WIDGET RENDERERS — Generate HTML from registry field definitions
// Every ID is derived from field.key — NO hand-typed IDs
// ═══════════════════════════════════════════════════════════════
var WidgetRenderers = (function() {
  'use strict';

  function E(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function optionsHtml(options, prefix) {
    var h = '';
    (options || []).forEach(function(o) {
      h += '<option value="' + E(o.value) + '">' + E(o.label) + '</option>';
    });
    return h;
  }

  var renderers = {
    'range-select': function(field) {
      var k = field.key;
      var opts = field.options || [];
      var minOpts = '<option value="">Any Min</option>' + optionsHtml(opts);
      var maxOpts = '<option value="">Any Max</option>' + optionsHtml(opts);
      var h = '<div class="sv2-range">';
      h += '<select id="' + E(k) + '-min" class="sv2-select">' + minOpts + '</select>';
      h += '<span class="sv2-range-sep">&mdash;</span>';
      h += '<select id="' + E(k) + '-max" class="sv2-select">' + maxOpts + '</select>';
      h += '</div>';
      // Custom input row (hidden)
      var hasCustom = opts.some(function(o) { return o.value === 'custom'; });
      if (hasCustom) {
        h += '<div id="' + E(k) + '-custom-row" class="sv2-custom-row">';
        h += '<input type="number" id="' + E(k) + '-custom-min" class="sv2-input" placeholder="$ Min" min="0" step="1">';
        h += '<span class="sv2-range-sep">&mdash;</span>';
        h += '<input type="number" id="' + E(k) + '-custom-max" class="sv2-input" placeholder="$ Max" min="0" step="1">';
        h += '</div>';
      }
      return h;
    },

    'checkbox-group': function(field) {
      var k = field.key;
      var opts = field.options || [];
      var h = '<div class="sv2-checkbox-group">';
      var currentGroup = null;
      opts.forEach(function(o) {
        if (o.group && o.group !== currentGroup) {
          if (currentGroup) h += '</div>'; // close previous group
          h += '<div class="sv2-checkbox-subgroup" data-group="' + E(o.group) + '">';
          currentGroup = o.group;
        }
        h += '<label class="sv2-checkbox-label">';
        h += '<input type="checkbox" class="sv2-cb" data-field="' + E(k) + '" data-value="' + E(o.value) + '"';
        if (o.sub_status) h += ' data-sub-status="' + E(o.sub_status) + '"';
        if (o.checked_default) h += ' checked';
        h += '> ' + E(o.label);
        h += '</label>';
      });
      if (currentGroup) h += '</div>';
      h += '</div>';
      return h;
    },

    'boolean': function(field) {
      var k = field.key;
      return '<label class="sv2-checkbox-label"><input type="checkbox" id="' + E(k) + '" class="sv2-cb" data-field="' + E(k) + '" data-value="true"> ' + E(field.label) + '</label>';
    },

    'text': function(field) {
      var k = field.key;
      var ph = field.placeholder || field.label;
      return '<input type="text" id="' + E(k) + '" class="sv2-input" placeholder="' + E(ph) + '">';
    },

    'number-range': function(field) {
      var k = field.key;
      return '<div class="sv2-number-range">' +
        '<input type="number" id="' + E(k) + '-min" class="sv2-input" placeholder="Min">' +
        '<span class="sv2-range-sep">&mdash;</span>' +
        '<input type="number" id="' + E(k) + '-max" class="sv2-input" placeholder="Max">' +
        '</div>';
    },

    'date-range': function(field) {
      var k = field.key;
      var h = '';
      if (field.presets) {
        h += '<div class="sv2-date-presets">';
        field.presets.forEach(function(p) {
          h += '<button type="button" class="sv2-preset-btn" data-preset="' + E(p.value) + '" data-drp="' + E(k) + '">' + E(p.label) + '</button>';
        });
        h += '</div>';
      }
      h += '<div class="sv2-date-range">';
      h += '<input type="date" id="' + E(k) + '-from" class="sv2-input">';
      h += '<span class="sv2-range-sep">to</span>';
      h += '<input type="date" id="' + E(k) + '-to" class="sv2-input">';
      h += '</div>';
      return h;
    },

    'select': function(field) {
      var k = field.key;
      var opts = '<option value="">' + E(field.placeholder || 'Select...') + '</option>' + optionsHtml(field.options);
      return '<select id="' + E(k) + '" class="sv2-select">' + opts + '</select>';
    },

    'radio-group': function(field) {
      var k = field.key;
      var h = '<div class="sv2-radio-group">';
      (field.options || []).forEach(function(o) {
        h += '<label class="sv2-checkbox-label"><input type="radio" name="' + E(k) + '" data-field="' + E(k) + '" value="' + E(o.value) + '"> ' + E(o.label) + '</label>';
      });
      h += '</div>';
      return h;
    },

    'custom': function(field) {
      return '<div id="' + E(field.key) + '-widget" data-custom-widget="' + E(field.key) + '" class="sv2-custom-widget"></div>';
    },

    'calculator': function(field) {
      return '<div id="' + E(field.key) + '-calc" data-calculator="' + E(field.calculator_type || field.key) + '" class="sv2-calculator-placeholder"><i class="fas fa-calculator mr-2"></i>' + E(field.label) + '</div>';
    },

    'neighborhood': function(field) {
      return '<div id="' + E(field.key) + '-widget" data-custom-widget="neighborhood" class="sv2-custom-widget"></div>';
    }
  };

  return {
    render: function(field) {
      var renderer = renderers[field.widget];
      if (!renderer) return '<div class="text-red-500 text-xs">Unknown widget: ' + E(field.widget) + '</div>';
      return '<div class="sv2-field" data-field-key="' + E(field.key) + '">' +
        '<label class="sv2-field-label">' + E(field.label) + '</label>' +
        renderer(field) +
        '</div>';
    },
    escapeHtml: E
  };
})();
