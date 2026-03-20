// ═══════════════════════════════════════════════════════════════════════════════
// INVESTOR INTAKE FORM — Extends BuyerIntake with investment-specific sections
// Full CRUD, auto-save, entity ownership, multi-person, portfolio management
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils, BuyerIntake */

var InvestorIntake = (function () {
  'use strict';

  var E = Utils.esc;

  // ─── Debounce / Save status helpers (mirror BuyerIntake) ─────────────
  var _timers = {};
  function _debounce(key, fn, ms) {
    if (_timers[key]) clearTimeout(_timers[key]);
    _timers[key] = setTimeout(fn, ms || 800);
  }
  function _markUnsaved(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'Unsaved changes'; el.className = 'text-xs font-semibold text-amber-500'; }
  }
  function _markSaved(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'All changes saved'; el.className = 'text-xs font-semibold text-emerald-600'; }
  }
  function _markSaving(formId) {
    var el = document.getElementById(formId + '-save-status');
    if (el) { el.textContent = 'Saving...'; el.className = 'text-xs font-semibold text-gray-400'; }
  }

  // ─── Collapsible section ─────────────────────────────────────────────
  function _section(id, title, icon, content, open) {
    var openClass = open !== false ? '' : ' hidden';
    var chevron = open !== false ? 'fa-chevron-up' : 'fa-chevron-down';
    return '<div class="mb-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">' +
      '<button type="button" class="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" ' +
        'onclick="InvestorIntake._toggle(\'' + E(id) + '\')">' +
        '<span class="flex items-center gap-2 text-sm font-bold text-gray-700">' +
          '<i class="fas ' + icon + ' text-[#B8860B]"></i> ' + E(title) +
        '</span>' +
        '<i id="' + E(id) + '-chevron" class="fas ' + chevron + ' text-gray-400 text-xs transition-transform"></i>' +
      '</button>' +
      '<div id="' + E(id) + '-body" class="px-5 py-4' + openClass + '">' + content + '</div>' +
    '</div>';
  }

  function _toggle(sectionId) {
    var body = document.getElementById(sectionId + '-body');
    var chevron = document.getElementById(sectionId + '-chevron');
    if (!body) return;
    if (body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-up'); }
    } else {
      body.classList.add('hidden');
      if (chevron) { chevron.classList.remove('fa-chevron-up'); chevron.classList.add('fa-chevron-down'); }
    }
  }

  // ─── Field helpers ───────────────────────────────────────────────────
  function _input(name, label, value, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    var ph = opts.placeholder || '';
    var step = opts.step ? ' step="' + opts.step + '"' : '';
    return '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<input class="form-input w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" ' +
        'name="' + E(name) + '" type="' + type + '" value="' + E(value || '') + '" placeholder="' + E(ph) + '"' + step + '>' +
    '</div>';
  }

  function _select(name, label, value, options) {
    var html = '<div class="form-group">' +
      '<label class="block text-xs font-semibold text-gray-700 mb-1">' + E(label) + '</label>' +
      '<select class="form-input form-select w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] transition-colors" name="' + E(name) + '">';
    options.forEach(function (opt) {
      var val = typeof opt === 'string' ? opt : opt.value;
      var lbl = typeof opt === 'string' ? opt : opt.label;
      var sel = (value || '') === val ? ' selected' : '';
      html += '<option value="' + E(val) + '"' + sel + '>' + E(lbl) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  // ─── Portfolio item management ───────────────────────────────────────
  function _renderPortfolio(formId, portfolio) {
    var list = portfolio || [];
    var html = '';
    list.forEach(function (item, i) {
      html += '<div class="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 mb-2" data-portfolio-idx="' + i + '">' +
        '<div class="flex-1 grid grid-cols-3 gap-2">' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_address_' + i + '" value="' + E(item.address || '') + '" placeholder="Property address">' +
          '<select class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_type_' + i + '">' +
            '<option value="">Type...</option>' +
            '<option value="condo"' + (item.type === 'condo' ? ' selected' : '') + '>Condo</option>' +
            '<option value="coop"' + (item.type === 'coop' ? ' selected' : '') + '>Co-op</option>' +
            '<option value="multi-family"' + (item.type === 'multi-family' ? ' selected' : '') + '>Multi-Family</option>' +
            '<option value="commercial"' + (item.type === 'commercial' ? ' selected' : '') + '>Commercial</option>' +
            '<option value="mixed-use"' + (item.type === 'mixed-use' ? ' selected' : '') + '>Mixed-Use</option>' +
            '<option value="single-family"' + (item.type === 'single-family' ? ' selected' : '') + '>Single-Family</option>' +
            '<option value="land"' + (item.type === 'land' ? ' selected' : '') + '>Land</option>' +
          '</select>' +
          '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_value_' + i + '" type="number" value="' + E(String(item.value || '')) + '" placeholder="Est. value $">' +
        '</div>' +
        '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0 mt-1" onclick="InvestorIntake._removePortfolioItem(\'' + E(formId) + '\',' + i + ')" title="Remove">' +
          '<i class="fas fa-times"></i></button>' +
      '</div>';
    });
    return html;
  }

  function _addPortfolioItem(formId) {
    var container = document.getElementById(formId + '-portfolio');
    if (!container) return;
    var count = container.querySelectorAll('[data-portfolio-idx]').length;
    var i = count;
    var row = document.createElement('div');
    row.className = 'flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 mb-2';
    row.setAttribute('data-portfolio-idx', i);
    row.innerHTML =
      '<div class="flex-1 grid grid-cols-3 gap-2">' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_address_' + i + '" placeholder="Property address">' +
        '<select class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_type_' + i + '">' +
          '<option value="">Type...</option>' +
          '<option value="condo">Condo</option>' +
          '<option value="coop">Co-op</option>' +
          '<option value="multi-family">Multi-Family</option>' +
          '<option value="commercial">Commercial</option>' +
          '<option value="mixed-use">Mixed-Use</option>' +
          '<option value="single-family">Single-Family</option>' +
          '<option value="land">Land</option>' +
        '</select>' +
        '<input class="form-input text-xs border border-gray-200 rounded px-2 py-1.5" name="portfolio_value_' + i + '" type="number" placeholder="Est. value $">' +
      '</div>' +
      '<button type="button" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0 mt-1" onclick="InvestorIntake._removePortfolioItem(\'' + E(formId) + '\',' + i + ')" title="Remove">' +
        '<i class="fas fa-times"></i></button>';
    container.appendChild(row);
    _markUnsaved(formId);
  }

  function _removePortfolioItem(formId, idx) {
    var container = document.getElementById(formId + '-portfolio');
    if (!container) return;
    var el = container.querySelector('[data-portfolio-idx="' + idx + '"]');
    if (el) el.remove();
    _markUnsaved(formId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER — Full investor intake form (buyer base + investment sections)
  // ═══════════════════════════════════════════════════════════════════════
  function render(client) {
    var c = client || {};
    var formId = 'investor-intake';
    var prefs = c.preferences || {};
    var portfolio = c.current_portfolio || [];
    var signatories = c.authorized_signatories || [];

    // Get the base buyer HTML and remap its form id
    var buyerHtml = BuyerIntake.render(c);
    // Replace the buyer-intake form id with investor-intake
    buyerHtml = buyerHtml
      .replace(/id="buyer-intake"/g, 'id="' + formId + '"')
      .replace(/data-client-id="[^"]*"/g, 'data-client-id="' + E(String(c.id || '')) + '"')
      .replace(/Buyer Intake/g, 'Investor Intake')
      .replace(/fa-user-tag/g, 'fa-chart-line')
      .replace(/BuyerIntake\.save\('[^']*'\)/g, 'InvestorIntake.save(\'' + E(String(c.id || '')) + '\')')
      .replace(/BuyerIntake\._/g, 'InvestorIntake._buyer_')
      .replace(/buyer-intake-save-status/g, formId + '-save-status');

    // Remove closing </form> to inject investor sections before it
    var closingIdx = buyerHtml.lastIndexOf('</form>');
    var beforeClose = buyerHtml.substring(0, closingIdx);
    var afterClose = buyerHtml.substring(closingIdx);

    // ── Investment Strategy Section ──
    var stratHtml =
      _select('investment_strategy', 'Investment Strategy', c.investment_strategy || '', [
        { value: '', label: 'Select strategy...' },
        { value: 'cash_flow', label: 'Cash Flow' },
        { value: 'appreciation', label: 'Appreciation' },
        { value: 'value_add', label: 'Value-Add' },
        { value: '1031_exchange', label: '1031 Exchange' },
      ]) +
      '<div class="grid grid-cols-2 gap-3 mt-3">' +
        _input('cap_rate_target', 'Cap Rate Target (%)', c.cap_rate_target, { type: 'number', placeholder: '5.0', step: '0.1' }) +
        _input('cash_on_cash_target', 'Cash-on-Cash Target (%)', c.cash_on_cash_target, { type: 'number', placeholder: '8.0', step: '0.1' }) +
      '</div>' +
      _input('holding_period_years', 'Holding Period (years)', c.holding_period_years, { type: 'number', placeholder: '5' });

    var investHtml = _section(formId + '-strategy', 'Investment Strategy', 'fa-chart-pie', stratHtml, true);

    // ── 1031 Exchange Section ──
    var ex = c.exchange_1031_status || 'none';
    var exIdDate = c.exchange_1031_deadline ? c.exchange_1031_deadline.substring(0, 10) : '';
    // The 1031 has two deadlines: 45 days for identification, 180 for exchange
    var exchangeHtml =
      _select('exchange_1031_status', '1031 Exchange Status', ex, [
        { value: 'none', label: 'None / Not Applicable' },
        { value: 'identifying', label: 'Identifying Replacement Properties' },
        { value: 'exchanging', label: 'In Exchange Period' },
        { value: 'completed', label: 'Completed' },
      ]) +
      '<div class="grid grid-cols-2 gap-3 mt-3">' +
        _input('identification_deadline', 'Identification Deadline (45 days)', exIdDate, { type: 'date' }) +
        _input('exchange_deadline', 'Exchange Deadline (180 days)', exIdDate, { type: 'date' }) +
      '</div>' +
      _input('relinquished_property', 'Relinquished Property Address', '', { placeholder: 'Address of property being sold' }) +
      '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-exclamation-triangle mr-1"></i> IRC Section 1031: 45-day identification period, 180-day exchange deadline. Consult tax attorney.</p>';
    investHtml += _section(formId + '-1031', '1031 Exchange', 'fa-exchange-alt', exchangeHtml, ex !== 'none');

    // ── Current Portfolio Section ──
    var portfolioHtml =
      '<div id="' + formId + '-portfolio">' +
        _renderPortfolio(formId, portfolio) +
      '</div>' +
      '<button type="button" class="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-[#B8860B] text-[#B8860B] text-xs font-semibold rounded-lg hover:bg-[#B8860B]/5 transition-colors mt-1" ' +
        'onclick="InvestorIntake._addPortfolioItem(\'' + formId + '\')">' +
        '<i class="fas fa-plus"></i> Add Property</button>' +
      '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i> Track existing portfolio for 1031 exchange planning and equity analysis.</p>';
    investHtml += _section(formId + '-portfolio-section', 'Current Portfolio', 'fa-th-list', portfolioHtml, portfolio.length > 0);

    return beforeClose + investHtml + afterClose;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLLECT DATA — Reads form DOM, returns combined buyer + investor data
  // ═══════════════════════════════════════════════════════════════════════
  function collectData(formId) {
    formId = formId || 'investor-intake';
    var form = document.getElementById(formId);
    if (!form) return {};

    // Collect base buyer data with our form id
    var data = BuyerIntake.collectData(formId);

    var fd = new FormData(form);

    // Investor flag
    data.is_investor = true;

    // Investment strategy fields
    var stratFields = ['investment_strategy', 'exchange_1031_status', 'relinquished_property'];
    stratFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v.trim() || null;
    });

    var decFields = ['cap_rate_target', 'cash_on_cash_target'];
    decFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v ? Number(v) : null;
    });

    var hpVal = fd.get('holding_period_years');
    if (hpVal !== null) data.holding_period_years = hpVal ? parseInt(hpVal, 10) : null;

    // 1031 deadlines
    var idDeadline = fd.get('identification_deadline');
    if (idDeadline) data.exchange_1031_deadline = idDeadline;
    var exDeadline = fd.get('exchange_deadline');
    if (exDeadline) data.exchange_1031_exchange_deadline = exDeadline;

    // Portfolio
    var portfolioItems = [];
    var pEls = form.querySelectorAll('[data-portfolio-idx]');
    for (var i = 0; i < pEls.length; i++) {
      var idx = pEls[i].getAttribute('data-portfolio-idx');
      var addr = (fd.get('portfolio_address_' + idx) || '').trim();
      var pType = (fd.get('portfolio_type_' + idx) || '').trim();
      var pVal = fd.get('portfolio_value_' + idx);
      if (addr) {
        portfolioItems.push({
          address: addr,
          type: pType || null,
          value: pVal ? Number(pVal) : null,
        });
      }
    }
    data.current_portfolio = portfolioItems;

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════════
  function save(clientId) {
    var formId = 'investor-intake';
    if (!clientId) {
      var form = document.getElementById(formId);
      if (form) clientId = form.getAttribute('data-client-id');
    }
    if (!clientId) { CRM.toast('No client ID', 'error'); return Promise.reject(new Error('No client ID')); }

    _markSaving(formId);
    var data = collectData(formId);

    return MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(clientId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(function (res) {
      _markSaved(formId);
      return res;
    }).catch(function (err) {
      _markUnsaved(formId);
      CRM.toast('Save failed: ' + (err.message || 'Unknown error'), 'error');
      return Promise.reject(err);
    });
  }

  // ─── Proxy buyer helpers for renamed onclick handlers ────────────────
  function _buyer_toggle(id) { BuyerIntake._toggle(id); }
  function _buyer_addPersonModal(fid) { BuyerIntake._addPersonModal(fid); }
  function _buyer_saveAddPerson(fid) { BuyerIntake._saveAddPerson(fid); }
  function _buyer_removePerson(fid) { BuyerIntake._removePerson(fid); }
  function _buyer_addSignatory(fid) { BuyerIntake._addSignatory(fid); }
  function _buyer_removeSig(fid, idx) { BuyerIntake._removeSig(fid, idx); }

  return {
    render: render,
    collectData: collectData,
    save: save,
    _toggle: _toggle,
    _addPortfolioItem: _addPortfolioItem,
    _removePortfolioItem: _removePortfolioItem,
    // Proxied buyer helpers
    _buyer_toggle: _buyer_toggle,
    _buyer_addPersonModal: _buyer_addPersonModal,
    _buyer_saveAddPerson: _buyer_saveAddPerson,
    _buyer_removePerson: _buyer_removePerson,
    _buyer_addSignatory: _buyer_addSignatory,
    _buyer_removeSig: _buyer_removeSig,
  };
})();
