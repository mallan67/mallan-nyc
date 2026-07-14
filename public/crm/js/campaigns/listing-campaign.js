// ═══════════════════════════════════════════════════════════════════════════
// LISTING EMAIL CAMPAIGN — "Create Eblast" from a listing.
//
// Flow (single modal, 3 steps):
//   1. Compose + live preview   → POST /api/crm/listing-campaigns  (mode:preview)
//   2. Recipients upload+review → POST /api/crm/listing-campaigns/recipients
//   3. Review + send            → POST /api/crm/listing-campaigns  (dry_run/test/live)
//
// The form starts from a server-owned profile (GET /api/crm/listing-campaigns),
// NOT a browser-side map, so approved copy + economics live in one typed place.
//
// Campaign type drives the whole form: investor/1031 content (cap rate, rent,
// lease, calculator links) shows ONLY for Investor. All compliance gating (REBNY
// distribution, Fair Housing, suppression, the economics-confirmation gate, and
// fail-closed live send) is enforced SERVER-SIDE; this UI only composes.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var esc = (typeof escapeHtml === 'function')
    ? escapeHtml
    : function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var state = null;
  var previewTimer = null;

  // Editing any of these clears a prior confirmation (server enforces this too).
  var ECONOMIC_KEYS = ['currentRent', 'scheduledRent', 'scheduledRentEffective', 'maintenance', 'leaseExpiration'];

  var CONFIRMATION_TEXT =
    'I reviewed the current lease, rent schedule, maintenance and lease expiration ' +
    'for this listing and confirm that the figures shown are current as of today.';

  function fresh(listingId) {
    return {
      listingId: listingId,
      step: 1,
      fields: {
        campaignType: 'investor',
        campaignLabel: '', headline: '', subject: '', intro: '', bullets: '',
        location: '', purchaseStructure: '', campaignDetails: '',
        currentRent: '', scheduledRent: '', scheduledRentEffective: '',
        maintenance: '', leaseExpiration: '', sourceRef: '',
      },
      previewHtml: '', listingSummary: null,
      metrics: null, economics: null, economicsFingerprint: '', requiresConfirmation: false,
      confirmed: false, confirmedAt: '',
      recipients: [], counts: null, sendResult: null,
      busy: false, error: '',
    };
  }

  // ─── Fetch helpers (same-origin, session cookie) ──────────────────────────
  function getJson(path) {
    return fetch(path, { credentials: 'include' }).then(readResponse);
  }
  function postJson(path, body) {
    return fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(body),
    }).then(readResponse);
  }
  function postForm(path, formData) {
    return fetch(path, { method: 'POST', credentials: 'include', body: formData }).then(readResponse);
  }
  function readResponse(res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        var msg = data.error || ('Request failed: ' + res.status);
        if (data.gate_blocks) msg += ' [gate: ' + data.gate_blocks.join(', ') + ']';
        if (data.fair_housing_violations) {
          msg += ' [Fair Housing: ' + data.fair_housing_violations.map(function (v) { return v.field; }).join(', ') + ']';
        }
        var e = new Error(msg); e.data = data; throw e;
      }
      return data;
    });
  }

  // ─── Public entry point (My Listings → Create Eblast) ─────────────────────
  window.openListingCampaign = function (listingId) {
    if (!listingId) { alert('This listing has no listing ID — cannot start a campaign.'); return; }
    state = fresh(listingId);
    mountModal();
    loadProfile();
  };

  function closeCampaign() {
    var m = document.getElementById('listingCampaignModal');
    if (m) m.remove();
    state = null;
  }
  window.closeListingCampaign = closeCampaign;

  // Hydrate compose fields from the SERVER-owned profile, then preview.
  function loadProfile() {
    getJson('/api/crm/listing-campaigns?listing_id=' + encodeURIComponent(state.listingId)).then(function (data) {
      var pf = data.profile || {};
      var f = state.fields;
      f.campaignType = pf.campaignType || 'investor';
      f.campaignLabel = pf.campaignLabel || '';
      f.headline = pf.headline || '';
      f.subject = pf.subject || '';
      f.intro = pf.intro || '';
      f.bullets = (pf.benefitBullets || []).join('\n');
      f.purchaseStructure = pf.purchaseStructure || '';
      f.location = pf.locationBlurb || '';
      f.currentRent = pf.currentRent || '';
      f.scheduledRent = pf.scheduledRent || '';
      f.scheduledRentEffective = pf.scheduledRentEffective || '';
      f.maintenance = pf.maintenance || '';
      f.leaseExpiration = pf.leaseExpiration || '';
      loadPreview();
    }).catch(function (e) { state.error = e.message; render(); });
  }

  function mountModal() {
    var existing = document.getElementById('listingCampaignModal');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = 'listingCampaignModal';
    wrap.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4';
    wrap.innerHTML =
      '<div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">' +
        '<div class="flex items-center justify-between px-5 py-3 border-b bg-gray-50">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas fa-paper-plane text-amber-600"></i>' +
            '<h2 class="font-bold text-sm">Create Eblast — <span class="text-gray-500">' + esc(state.listingId) + '</span></h2>' +
          '</div>' +
          '<button onclick="closeListingCampaign()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div id="lcSteps" class="px-5 pt-3"></div>' +
        '<div id="lcBody" class="px-5 py-4 overflow-y-auto flex-1"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    render();
  }

  function stepBar() {
    var labels = ['1 · Compose', '2 · Recipients', '3 · Review & Send'];
    return '<div class="flex items-center gap-2 text-[11px] font-semibold mb-1">' +
      labels.map(function (l, i) {
        var active = state.step === (i + 1);
        var done = state.step > (i + 1);
        var cls = active ? 'bg-amber-600 text-white' : (done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500');
        return '<span class="px-2.5 py-1 rounded ' + cls + '">' + l + '</span>';
      }).join('<span class="text-gray-300">→</span>') + '</div>';
  }

  function errorBanner() {
    if (!state.error) return '';
    return '<div class="mb-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">' +
      '<i class="fas fa-exclamation-triangle mr-1"></i>' + esc(state.error) + '</div>';
  }

  function render() {
    var steps = document.getElementById('lcSteps');
    var body = document.getElementById('lcBody');
    if (!steps || !body) return;
    steps.innerHTML = stepBar();
    if (state.step === 1) body.innerHTML = renderCompose();
    else if (state.step === 2) body.innerHTML = renderRecipients();
    else body.innerHTML = renderReview();
  }

  // ─── Step 1: compose + preview ────────────────────────────────────────────
  function field(label, key, ph, type) {
    var v = esc(state.fields[key] || '');
    var econAttr = ECONOMIC_KEYS.indexOf(key) > -1 ? ' oninput="window._lcEconEdited()"' : '';
    var input = (type === 'textarea')
      ? '<textarea id="lc_' + key + '" rows="2" class="w-full border rounded px-2 py-1 text-xs" placeholder="' + esc(ph || '') + '"' + econAttr + '>' + v + '</textarea>'
      : '<input id="lc_' + key + '" value="' + v + '" class="w-full border rounded px-2 py-1 text-xs" placeholder="' + esc(ph || '') + '"' + econAttr + '>';
    return '<label class="block text-[11px] font-semibold text-gray-600 mb-0.5">' + esc(label) + '</label>' + input;
  }

  function typeSelector() {
    var t = state.fields.campaignType || 'investor';
    var opts = [['investor', 'Investor / 1031'], ['buyer', 'Buyer Marketing'], ['agent', 'Agent / Broker Eblast']];
    return '<label class="block text-[11px] font-semibold text-gray-600 mb-0.5">Campaign type <span class="text-red-500">*</span></label>' +
      '<select id="lc_campaignType" onchange="window._lcTypeChange()" class="w-full border rounded px-2 py-1 text-xs bg-white">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (t === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select>';
  }

  function renderCompose() {
    var s = state.listingSummary;
    var isInvestor = state.fields.campaignType === 'investor';
    var isAgent = state.fields.campaignType === 'agent';

    var left = typeSelector() +
      field('Subject', 'subject', 'Investment Opportunity — …') +
      field('Campaign label (eyebrow)', 'campaignLabel', isInvestor ? 'Potential 1031 Replacement Opportunity' : 'New to Market') +
      field('Main headline', 'headline', 'Tenant-Occupied Manhattan Investment Opportunity') +
      field('Intro', 'intro', 'A rare chance to acquire an income-producing residence…', 'textarea') +
      field('Key highlight bullets (one per line)', 'bullets', 'Existing rental income from closing\nSteps to the United Nations', 'textarea') +
      field('Location blurb', 'location', 'Turtle Bay / Midtown East…', 'textarea');

    if (isInvestor) {
      left += field('Purchase structure (building-specific)', 'purchaseStructure', 'Ownership structure, board process, Right of First Refusal / waiver terms — specific to this building', 'textarea') +
        '<div class="mt-1 p-2 rounded border border-amber-200 bg-amber-50">' +
          '<div class="text-[11px] font-semibold text-amber-800 mb-1">Rent schedule &amp; economics ' +
            '<span class="font-normal text-amber-700">— a future rent is shown as “scheduled”, never “current”.</span></div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div>' + field('Current in-place rent (verify from lease)', 'currentRent', 'e.g. $3,900/mo') + '</div>' +
            '<div>' + field('Maintenance / common charges', 'maintenance', '$1,748.65/mo') + '</div>' +
            '<div>' + field('Scheduled rent', 'scheduledRent', '$4,305/mo') + '</div>' +
            '<div>' + field('Scheduled rent effective date', 'scheduledRentEffective', '2026-08-15') + '</div>' +
            '<div>' + field('Lease expires', 'leaseExpiration', 'August 14, 2027') + '</div>' +
          '</div>' +
        '</div>';
    }
    if (isAgent) {
      left += field('Details (co-broke, showing instructions, open houses)', 'campaignDetails',
        'Co-broke 50%. By appointment — text listing agent. Open house Sun 12–1:30pm.', 'textarea');
    }

    left += '<p class="text-[10px] text-gray-400 mt-1">Sender is your signed-in agent identity (name, licensed title, license #, phone, email) — not editable here.</p>' +
      '<button onclick="window._lcUpdatePreview()" class="mt-1 px-3 py-1.5 bg-gray-800 text-white rounded text-xs"><i class="fas fa-sync mr-1"></i>Update preview</button>';

    var right = '<div class="text-[11px] font-semibold text-gray-600">Live preview' +
        (s ? ' — <span class="text-gray-400">' + esc(s.address) + ' · ' + esc(s.price) + ' · ' + s.photoCount + ' photos</span>' : '') + '</div>' +
      '<iframe title="preview" class="w-full border rounded bg-white" style="height:360px" srcdoc="' + esc(state.previewHtml) + '"></iframe>' +
      (isInvestor ? investmentSummary() : '');

    return errorBanner() +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="space-y-2">' + left + '</div>' +
        '<div class="space-y-2">' + right + '</div>' +
      '</div>' +
      '<div class="flex justify-end mt-4 pt-3 border-t">' +
        '<button onclick="window._lcGoRecipients()" ' + (state.previewHtml ? '' : 'disabled') +
          ' class="px-4 py-2 bg-amber-600 text-white rounded text-xs font-semibold disabled:opacity-40">Next: Recipients <i class="fas fa-arrow-right ml-1"></i></button>' +
      '</div>';
  }

  // Read-only Calculated Investment Summary (from the server-computed metrics).
  function investmentSummary() {
    var m = state.metrics;
    if (!m || !m.rows || !m.rows.length) {
      return '<div class="mt-2 text-[11px] text-gray-400">Enter rent + maintenance to see the calculated investment summary.</div>';
    }
    var rows = m.rows.map(function (r) {
      return '<tr class="' + (r.emphasis ? 'font-semibold text-gray-800' : 'text-gray-600') + '">' +
        '<td class="px-2 py-0.5 border-r">' + esc(r.label) + '</td>' +
        '<td class="px-2 py-0.5 text-right tabular-nums">' + esc(r.value) + '</td></tr>';
    }).join('');
    var note = (state.economics && state.economics.analysisRentBasis && state.economics.analysisRentBasis.indexOf('scheduled') === 0)
      ? '<div class="text-[10px] text-amber-700 mt-1">Cap rate is illustrative, computed on the ' + esc(state.economics.analysisRentBasis) + '.</div>'
      : '';
    return '<div class="mt-2">' +
      '<div class="text-[11px] font-semibold text-gray-600 mb-1">Calculated Investment Summary <span class="font-normal text-gray-400">(illustrative)</span></div>' +
      '<table class="text-[11px] border rounded w-full"><tbody>' + rows + '</tbody></table>' + note +
      '</div>';
  }

  function collectFields() {
    Object.keys(state.fields).forEach(function (k) {
      var elm = document.getElementById('lc_' + k);
      if (elm) state.fields[k] = elm.value;
    });
  }

  function bodyFromFields(mode) {
    var f = state.fields;
    var bullets = (f.bullets || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var body = {
      listing_id: state.listingId,
      mode: mode,
      campaignType: f.campaignType || 'investor',
      campaignLabel: f.campaignLabel || undefined,
      headline: f.headline || undefined,
      subject: f.subject || undefined,
      intro: f.intro || undefined,
      benefitBullets: bullets.length ? bullets : undefined,
      purchaseStructure: f.purchaseStructure || undefined,
      locationBlurb: f.location || undefined,
      campaignDetails: f.campaignDetails || undefined,
      currentRent: f.currentRent || undefined,
      scheduledRent: f.scheduledRent || undefined,
      scheduledRentEffective: f.scheduledRentEffective || undefined,
      maintenance: f.maintenance || undefined,
      leaseExpiration: f.leaseExpiration || undefined,
      // Sender identity is intentionally NOT sent — the server derives it from the
      // authenticated agent and ignores any body identity fields.
    };
    if (mode === 'dry_run' || mode === 'test' || mode === 'live') {
      body.confirmation = state.confirmed
        ? { confirmed: true, fingerprint: state.economicsFingerprint, confirmedAt: state.confirmedAt, sourceRef: f.sourceRef || undefined }
        : { confirmed: false };
    }
    return body;
  }

  function loadPreview() {
    if (state.step === 1) collectFields();
    state.error = '';
    // Any preview refresh re-derives the economics fingerprint, so a prior
    // confirmation no longer applies — the agent must confirm the fresh figures.
    state.confirmed = false;
    postJson('/api/crm/listing-campaigns', bodyFromFields('preview')).then(function (data) {
      state.previewHtml = data.html || '';
      state.listingSummary = data.listing || null;
      state.metrics = data.metrics || null;
      state.economics = data.economics || null;
      state.economicsFingerprint = data.economicsFingerprint || '';
      state.requiresConfirmation = !!data.requiresConfirmation;
      render();
    }).catch(function (e) {
      state.error = e.message; state.previewHtml = ''; render();
    });
  }
  window._lcUpdatePreview = loadPreview;

  // Economic-field edit: clear confirmation immediately, then debounce a preview
  // (which refreshes the summary + fingerprint).
  window._lcEconEdited = function () {
    state.confirmed = false;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () { loadPreview(); }, 500);
  };

  window._lcTypeChange = function () {
    collectFields();
    var sel = document.getElementById('lc_campaignType');
    if (sel) state.fields.campaignType = sel.value;
    state.confirmed = false;
    loadPreview();
  };

  window._lcGoRecipients = function () { collectFields(); state.step = 2; state.error = ''; render(); };

  // ─── Step 2: recipients upload + review ───────────────────────────────────
  function renderRecipients() {
    var c = state.counts;
    return errorBanner() +
      '<div class="text-xs text-gray-600 mb-2">Upload a CSV or XLSX with an <b>email</b> column (optional name column). ' +
        'Duplicates, invalid rows, and unsubscribed contacts are removed automatically.</div>' +
      '<input type="file" id="lcFile" accept=".csv,.tsv,.txt,.xlsx" class="text-xs mb-2">' +
      '<button onclick="window._lcUpload()" class="ml-2 px-3 py-1.5 bg-gray-800 text-white rounded text-xs"><i class="fas fa-upload mr-1"></i>Upload &amp; review</button>' +
      (c ? countsTable(c) : '') +
      '<div class="flex justify-between mt-4 pt-3 border-t">' +
        '<button onclick="window._lcBack(1)" class="px-3 py-2 bg-gray-100 rounded text-xs"><i class="fas fa-arrow-left mr-1"></i>Back</button>' +
        '<button onclick="window._lcGoReview()" ' + (c && c.deliverable > 0 ? '' : 'disabled') +
          ' class="px-4 py-2 bg-amber-600 text-white rounded text-xs font-semibold disabled:opacity-40">Next: Review &amp; Send <i class="fas fa-arrow-right ml-1"></i></button>' +
      '</div>';
  }

  function countsTable(c) {
    var rows = [
      ['Rows received', c.received], ['Valid', c.valid], ['Duplicates removed', c.duplicate],
      ['Invalid removed', c.invalid], ['Missing email', c.missing || 0],
      ['Unsubscribed (suppressed)', c.suppressed], ['Deliverable', c.deliverable],
    ];
    return '<table class="mt-3 text-xs border rounded w-full max-w-sm"><tbody>' +
      rows.map(function (r, i) {
        var strong = r[0] === 'Deliverable';
        return '<tr class="' + (i % 2 ? 'bg-gray-50' : '') + (strong ? ' font-bold text-green-700' : '') + '">' +
          '<td class="px-3 py-1 border-r">' + esc(r[0]) + '</td><td class="px-3 py-1 text-right">' + Number(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  window._lcUpload = function () {
    var input = document.getElementById('lcFile');
    if (!input || !input.files || !input.files[0]) { state.error = 'Choose a file first.'; render(); return; }
    var fd = new FormData(); fd.append('file', input.files[0]);
    state.error = '';
    postForm('/api/crm/listing-campaigns/recipients', fd).then(function (data) {
      state.recipients = data.recipients || [];
      state.counts = data.counts || null;
      render();
    }).catch(function (e) { state.error = e.message; render(); });
  };

  window._lcBack = function (step) { state.step = step; state.error = ''; render(); };
  window._lcGoReview = function () { state.step = 3; state.error = ''; render(); };

  // ─── Step 3: review + confirm + send ──────────────────────────────────────
  function renderReview() {
    var c = state.counts || { deliverable: 0 };
    var r = state.sendResult;
    var needConfirm = state.requiresConfirmation;
    var canSend = !needConfirm || state.confirmed;
    var confirmBox = needConfirm
      ? '<div class="px-3 py-3 rounded border ' + (state.confirmed ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50') + ' mb-3">' +
          '<label class="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">' +
            '<input type="checkbox" id="lcConfirm" ' + (state.confirmed ? 'checked' : '') + ' onchange="window._lcToggleConfirm()" class="mt-0.5">' +
            '<span>' + esc(CONFIRMATION_TEXT) + '</span>' +
          '</label>' +
          '<div class="mt-2"><input id="lc_sourceRef" value="' + esc(state.fields.sourceRef || '') + '" ' +
            'onchange="window._lcSourceRef()" class="w-full border rounded px-2 py-1 text-[11px]" ' +
            'placeholder="Source / document reference (optional) — e.g. Lease PDF p.3"></div>' +
          '<div class="text-[10px] text-gray-500 mt-1">Editing any figure clears this confirmation. This is an attestation you checked the lease + listing — not a substitute for accurate data.</div>' +
        '</div>'
      : '';

    return errorBanner() +
      '<div class="px-4 py-3 rounded bg-amber-50 border border-amber-200 text-sm mb-3">' +
        'This campaign will be sent to <b class="text-lg text-amber-700">' + Number(c.deliverable) + '</b> deliverable recipient(s) ' +
        'for listing <b>' + esc(state.listingId) + '</b>.</div>' +
      confirmBox +
      (r ? '<div class="px-4 py-3 rounded bg-gray-50 border text-xs mb-3">' +
            '<b>Result (' + esc(r.mode) + '):</b> sent ' + r.result.sent + ' · failed ' + r.result.failed + ' · skipped ' + r.result.skipped +
            (r.campaign_id ? '<div class="text-gray-400 mt-1">campaign_id: ' + esc(r.campaign_id) + '</div>' : '') + '</div>' : '') +
      '<div class="flex flex-wrap gap-2 items-center">' +
        '<button onclick="window._lcSend(\'dry_run\')" ' + (canSend ? '' : 'disabled') + ' class="px-3 py-2 bg-gray-800 text-white rounded text-xs disabled:opacity-40"><i class="fas fa-vial mr-1"></i>Dry run (no delivery)</button>' +
        '<div class="flex items-center gap-1">' +
          '<input id="lcTestList" class="border rounded px-2 py-1 text-xs" placeholder="test@ (comma-separated)">' +
          '<button onclick="window._lcSend(\'test\')" ' + (canSend ? '' : 'disabled') + ' class="px-3 py-2 bg-gray-800 text-white rounded text-xs disabled:opacity-40"><i class="fas fa-flask mr-1"></i>Send test</button>' +
        '</div>' +
        '<button onclick="window._lcSend(\'live\')" ' + (canSend ? '' : 'disabled') + ' class="px-3 py-2 bg-red-600 text-white rounded text-xs disabled:opacity-40"><i class="fas fa-paper-plane mr-1"></i>Send live</button>' +
      '</div>' +
      (needConfirm && !state.confirmed ? '<div class="text-[11px] text-amber-700 mt-2"><i class="fas fa-lock mr-1"></i>Confirm the figures above to enable Dry run / Test / Live.</div>' : '') +
      '<div class="text-[11px] text-gray-400 mt-2">Live sending is disabled until an administrator enables it (CAMPAIGN_LIVE_SEND_ENABLED). Use Dry run / Send test meanwhile.</div>' +
      '<div class="flex justify-between mt-4 pt-3 border-t">' +
        '<button onclick="window._lcBack(2)" class="px-3 py-2 bg-gray-100 rounded text-xs"><i class="fas fa-arrow-left mr-1"></i>Back</button>' +
        '<button onclick="closeListingCampaign()" class="px-3 py-2 bg-gray-100 rounded text-xs">Done</button>' +
      '</div>';
  }

  window._lcToggleConfirm = function () {
    var cb = document.getElementById('lcConfirm');
    state.confirmed = !!(cb && cb.checked);
    if (state.confirmed) state.confirmedAt = new Date().toISOString();
    render();
  };
  window._lcSourceRef = function () {
    var el = document.getElementById('lc_sourceRef');
    if (el) state.fields.sourceRef = el.value;
  };

  window._lcSend = function (mode) {
    if (state.busy) return;
    if (state.requiresConfirmation && !state.confirmed) {
      state.error = 'Confirm the listing figures are current before sending.'; render(); return;
    }
    var body = bodyFromFields(mode);
    body.recipients = state.recipients;
    if (mode === 'test') {
      var listEl = document.getElementById('lcTestList');
      body.testAllowlist = (listEl && listEl.value ? listEl.value : '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    }
    if (mode === 'live') {
      body.confirmedCount = state.counts ? state.counts.deliverable : 0;
      if (!confirm('Send LIVE to ' + body.confirmedCount + ' recipients? This cannot be undone.')) return;
    }
    state.busy = true; state.error = '';
    postJson('/api/crm/listing-campaigns', body).then(function (data) {
      state.busy = false; state.sendResult = data;
      if (data.counts) state.counts = data.counts;
      render();
    }).catch(function (e) { state.busy = false; state.error = e.message; render(); });
  };
})();
