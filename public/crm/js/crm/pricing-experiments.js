/**
 * Pricing Experiments — CRM Module
 *
 * A/B testing dashboard for listing marketing strategies.
 * Internal only — no public claims, seller consent required.
 *
 * Uses MallanAPI._fetch() for all API calls (cookie auth).
 */

/* global MallanAPI */

// ── State ──
const PricingExperiments = {
  experiments: [],
  stats: null,
  currentExperiment: null,
  filters: { status: '', type: '' },
};

// ── Constants ──
const EXP_TYPE_LABELS = {
  exposure_level: 'Marketing Exposure',
  showing_strategy: 'Showing Strategy',
  photo_order: 'Photo Order',
  description_variant: 'Description Variant',
};

const EXP_STATUS_COLORS = {
  draft: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  active: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  concluded: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  archived: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};

const EXP_STATUS_LABELS = {
  draft: 'Draft', active: 'Active', concluded: 'Concluded', archived: 'Archived',
};

// ── API ──

async function fetchExperiments() {
  const p = new URLSearchParams();
  if (PricingExperiments.filters.status) p.set('status', PricingExperiments.filters.status);
  if (PricingExperiments.filters.type) p.set('type', PricingExperiments.filters.type);
  p.set('limit', '100');
  const res = await MallanAPI._fetch(`/api/crm/experiments?${p}`);
  if (res.ok) PricingExperiments.experiments = res.items;
  return res;
}

async function fetchExperimentDetail(id) {
  const res = await MallanAPI._fetch(`/api/crm/experiments/${id}`);
  if (res.ok) PricingExperiments.currentExperiment = res.item;
  return res;
}

async function fetchExperimentMetrics(id) {
  return MallanAPI._fetch(`/api/crm/experiments/${id}/metrics`);
}

async function fetchExperimentStats() {
  const res = await MallanAPI._fetch('/api/crm/experiments/stats');
  if (res.ok) PricingExperiments.stats = res.stats;
  return res;
}

// ══════════════════════════════════════════════════════════
// Render
// ══════════════════════════════════════════════════════════

async function initPricingExperiments() {
  const container = document.getElementById('pricing-experiments-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Loading experiments...</div>';
  await Promise.all([fetchExperiments(), fetchExperimentStats()]);
  renderExperimentsDashboard();
}

function renderExperimentsDashboard() {
  const container = document.getElementById('pricing-experiments-content');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">
      ${renderExpStatsBar()}
      ${renderExpFilters()}
      ${renderExpList()}
    </div>
  `;
  attachExpListeners();
}

function renderExpStatsBar() {
  const s = PricingExperiments.stats;
  if (!s) return '';

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1a1a1a;">${s.total}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Total</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#2563eb;">${s.by_status.active}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Active</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#059669;">${s.by_status.concluded}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Concluded</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:${s.avg_lift_pct > 0 ? '#059669' : s.avg_lift_pct < 0 ? '#ef4444' : '#64748b'};">${s.avg_lift_pct > 0 ? '+' : ''}${s.avg_lift_pct}%</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Avg Lift</div>
      </div>
    </div>
  `;
}

function renderExpFilters() {
  return `
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <select id="pe-filter-status" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Statuses</option>
        ${Object.entries(EXP_STATUS_LABELS).map(([k, v]) =>
          `<option value="${k}" ${PricingExperiments.filters.status === k ? 'selected' : ''}>${v}</option>`
        ).join('')}
      </select>
      <select id="pe-filter-type" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Types</option>
        ${Object.entries(EXP_TYPE_LABELS).map(([k, v]) =>
          `<option value="${k}" ${PricingExperiments.filters.type === k ? 'selected' : ''}>${v}</option>`
        ).join('')}
      </select>
      <div style="flex:1;"></div>
      <button id="pe-create-btn" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
        + New Experiment
      </button>
    </div>
  `;
}

function renderExpList() {
  if (PricingExperiments.experiments.length === 0) {
    return '<div style="text-align:center;padding:40px;color:#94a3b8;">No experiments yet. Create your first one.</div>';
  }

  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${PricingExperiments.experiments.map(renderExpCard).join('')}
    </div>
  `;
}

function renderExpCard(exp) {
  const sc = EXP_STATUS_COLORS[exp.status] || EXP_STATUS_COLORS.draft;
  const controlArm = exp.arms?.find(a => a.is_control);
  const treatmentArm = exp.arms?.find(a => !a.is_control);
  const controlCount = controlArm?._count?.listings ?? 0;
  const treatmentCount = treatmentArm?._count?.listings ?? 0;

  // If concluded, show lift from result_summary
  let liftHtml = '';
  if (exp.status === 'concluded' && exp.result_summary) {
    const lift = exp.result_summary.lift?.composite ?? 0;
    const color = lift > 0 ? '#059669' : lift < 0 ? '#ef4444' : '#64748b';
    liftHtml = `<span style="font-size:16px;font-weight:700;color:${color};">${lift > 0 ? '+' : ''}${lift.toFixed(1)}%</span>`;
  }

  return `
    <div class="pe-exp-card" data-exp-id="${exp.id}"
         style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;cursor:pointer;transition:box-shadow 0.15s;"
         onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
         onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">${peEscape(exp.name)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${EXP_TYPE_LABELS[exp.experiment_type] || exp.experiment_type}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${liftHtml}
          <span style="background:${sc.bg};color:${sc.text};border:1px solid ${sc.border};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">
            ${EXP_STATUS_LABELS[exp.status] || exp.status}
          </span>
        </div>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:#64748b;">
        <span>Control: ${controlCount} listings</span>
        <span>Treatment: ${treatmentCount} listings</span>
        ${exp.start_date ? `<span>Started: ${new Date(exp.start_date).toLocaleDateString()}</span>` : ''}
      </div>
    </div>
  `;
}

// ── Detail Modal ──

async function openExpDetailModal(expId) {
  await fetchExperimentDetail(expId);
  const exp = PricingExperiments.currentExperiment;
  if (!exp) return;

  let metricsHtml = '';
  if (exp.status === 'active' || exp.status === 'concluded') {
    const metricsRes = await fetchExperimentMetrics(expId);
    if (metricsRes.ok) {
      metricsHtml = renderMetricsComparison(metricsRes.result);
    }
  }

  const sc = EXP_STATUS_COLORS[exp.status] || EXP_STATUS_COLORS.draft;
  const controlArm = exp.arms?.find(a => a.is_control);
  const treatmentArm = exp.arms?.find(a => !a.is_control);

  const modal = document.createElement('div');
  modal.id = 'pe-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;border-radius:12px;max-width:800px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <!-- Header -->
      <div style="padding:20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;">${peEscape(exp.name)}</h3>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${EXP_TYPE_LABELS[exp.experiment_type] || exp.experiment_type}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="background:${sc.bg};color:${sc.text};border:1px solid ${sc.border};padding:3px 10px;border-radius:5px;font-size:11px;font-weight:600;">
            ${EXP_STATUS_LABELS[exp.status]}
          </span>
          <button id="pe-close-modal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;" aria-label="Close">&times;</button>
        </div>
      </div>

      ${exp.description ? `<div style="padding:12px 20px;font-size:13px;color:#374151;background:#f8fafc;border-bottom:1px solid #e2e8f0;">${peEscape(exp.description)}</div>` : ''}

      <!-- Arms Side by Side -->
      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${renderArmPanel(controlArm, 'Control')}
        ${renderArmPanel(treatmentArm, 'Treatment')}
      </div>

      <!-- Metrics Comparison -->
      ${metricsHtml}

      <!-- Actions -->
      <div style="padding:16px 20px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;">
        ${exp.status === 'draft' ? `
          <button id="pe-add-listing-btn" style="padding:6px 14px;background:#C4A052;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;">Add Listing</button>
          <button id="pe-activate-btn" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;">Activate</button>
        ` : ''}
        ${exp.status === 'active' ? `
          <button id="pe-conclude-btn" style="padding:6px 14px;background:#059669;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;">Conclude</button>
        ` : ''}
        ${exp.status !== 'archived' ? `
          <button id="pe-archive-btn" style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;">Archive</button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  attachExpDetailListeners(exp);
}

function renderArmPanel(arm, label) {
  if (!arm) return `<div style="color:#94a3b8;text-align:center;padding:20px;">No ${label} arm</div>`;

  const listings = arm.listings || [];
  return `
    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <div style="padding:10px 14px;background:${arm.is_control ? '#f8fafc' : '#faf5ff'};border-bottom:1px solid #e2e8f0;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:${arm.is_control ? '#475569' : '#7c3aed'};">${peEscape(arm.name)}</div>
        <div style="font-size:11px;color:#94a3b8;">${listings.length} listing(s)</div>
      </div>
      <div style="padding:10px;max-height:200px;overflow-y:auto;">
        ${listings.length === 0
          ? '<div style="font-size:12px;color:#94a3b8;text-align:center;padding:12px;">No listings assigned</div>'
          : listings.map(l => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
                <span style="color:#374151;">${peEscape(l.listing_address || l.listing_id)}</span>
                <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${l.seller_consent ? '#dcfce7' : '#fef2f2'};color:${l.seller_consent ? '#166534' : '#991b1b'};">
                  ${l.seller_consent ? 'Consented' : 'Pending'}
                </span>
              </div>
            `).join('')
        }
      </div>
    </div>
  `;
}

function renderMetricsComparison(result) {
  if (!result) return '';

  const c = result.control_metrics;
  const t = result.treatment_metrics;
  const lift = result.lift;

  const metricRow = (label, cVal, tVal, liftPct) => {
    const color = liftPct > 0 ? '#059669' : liftPct < 0 ? '#ef4444' : '#64748b';
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:6px 10px;font-size:12px;color:#374151;">${label}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;color:#374151;">${typeof cVal === 'number' ? cVal.toFixed(cVal < 1 ? 3 : 0) : cVal}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;color:#374151;">${typeof tVal === 'number' ? tVal.toFixed(tVal < 1 ? 3 : 0) : tVal}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600;color:${color};">${liftPct > 0 ? '+' : ''}${liftPct.toFixed(1)}%</td>
      </tr>
    `;
  };

  return `
    <div style="padding:0 20px 20px;">
      <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Results</h4>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;">Metric</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;">Control</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;">Treatment</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;">Lift</th>
          </tr>
        </thead>
        <tbody>
          ${metricRow('Page Views', c.page_views, t.page_views, c.page_views > 0 ? ((t.page_views - c.page_views) / c.page_views * 100) : 0)}
          ${metricRow('Inquiries', c.inquiries, t.inquiries, c.inquiries > 0 ? ((t.inquiries - c.inquiries) / c.inquiries * 100) : 0)}
          ${metricRow('Inquiry Rate', c.inquiry_rate, t.inquiry_rate, lift.inquiry_rate)}
          ${metricRow('Showing Requests', c.showing_requests, t.showing_requests, c.showing_requests > 0 ? ((t.showing_requests - c.showing_requests) / c.showing_requests * 100) : 0)}
          ${metricRow('Saves', c.saves, t.saves, c.saves > 0 ? ((t.saves - c.saves) / c.saves * 100) : 0)}
          ${metricRow('Avg Time on Page', c.avg_time_on_page, t.avg_time_on_page, lift.avg_time_on_page)}
        </tbody>
      </table>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:12px;">
        <div style="padding:8px 14px;background:${result.is_significant ? '#dcfce7' : '#fef9c3'};border-radius:6px;border:1px solid ${result.is_significant ? '#86efac' : '#fde047'};">
          <span style="font-weight:600;color:${result.is_significant ? '#166534' : '#854d0e'};">
            ${result.is_significant ? 'Statistically Significant' : 'Not Yet Significant'}
          </span>
          <span style="color:#64748b;margin-left:6px;">(p=${result.p_value})</span>
        </div>
        <div style="padding:8px 14px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
          <span style="color:#64748b;">Sample: ${result.sample_size} events</span>
        </div>
        <div style="padding:8px 14px;background:${lift.composite > 0 ? '#f0fdf4' : '#fef2f2'};border-radius:6px;border:1px solid ${lift.composite > 0 ? '#86efac' : '#fca5a5'};">
          <span style="font-weight:700;color:${lift.composite > 0 ? '#059669' : '#ef4444'};">
            Composite Lift: ${lift.composite > 0 ? '+' : ''}${lift.composite.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  `;
}

// ── Create Experiment Modal ──

function openCreateExpModal() {
  const modal = document.createElement('div');
  modal.id = 'pe-create-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;border-radius:10px;max-width:550px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;">
      <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;">New Pricing Experiment</h3>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;margin-bottom:16px;">
        <p style="font-size:11px;color:#991b1b;margin:0;">Experiments are internal marketing tests. No public claims. Seller consent required before activation.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label for="pe-new-name" style="font-size:11px;font-weight:600;color:#64748b;">Name *</label>
          <input id="pe-new-name" type="text" placeholder="e.g., Extended Exposure Test Q1" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="pe-new-type" style="font-size:11px;font-weight:600;color:#64748b;">Type *</label>
          <select id="pe-new-type" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            ${Object.entries(EXP_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="pe-new-desc" style="font-size:11px;font-weight:600;color:#64748b;">Description</label>
          <textarea id="pe-new-desc" rows="2" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;resize:vertical;"></textarea>
        </div>
        <div>
          <label for="pe-new-sample" style="font-size:11px;font-weight:600;color:#64748b;">Target Sample Size</label>
          <input id="pe-new-sample" type="number" value="100" min="30" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label for="pe-new-control" style="font-size:11px;font-weight:600;color:#64748b;">Control Arm Name</label>
            <input id="pe-new-control" type="text" value="Control" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
          </div>
          <div>
            <label for="pe-new-treatment" style="font-size:11px;font-weight:600;color:#64748b;">Treatment Arm Name</label>
            <input id="pe-new-treatment" type="text" value="Treatment" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button id="pe-create-cancel" style="padding:6px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">Cancel</button>
          <button id="pe-create-save" style="padding:6px 14px;background:#7c3aed;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Create Experiment</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('pe-create-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  document.getElementById('pe-create-save')?.addEventListener('click', async () => {
    const name = document.getElementById('pe-new-name').value.trim();
    if (!name) { window.alert('Name is required'); return; }

    const res = await MallanAPI._fetch('/api/crm/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        experiment_type: document.getElementById('pe-new-type').value,
        description: document.getElementById('pe-new-desc').value.trim() || undefined,
        target_sample_size: parseInt(document.getElementById('pe-new-sample').value) || 100,
        control_arm: { name: document.getElementById('pe-new-control').value.trim() || 'Control', config: {} },
        treatment_arm: { name: document.getElementById('pe-new-treatment').value.trim() || 'Treatment', config: {} },
      }),
    });

    if (!res.ok) { window.alert(res.error || 'Failed to create'); return; }
    modal.remove();
    await Promise.all([fetchExperiments(), fetchExperimentStats()]);
    renderExperimentsDashboard();
  });
}

// ── Add Listing to Experiment Modal ──

function openAddListingModal(exp) {
  const controlArm = exp.arms?.find(a => a.is_control);
  const treatmentArm = exp.arms?.find(a => !a.is_control);

  const modal = document.createElement('div');
  modal.id = 'pe-add-listing-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;border-radius:10px;max-width:450px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;">
      <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;">Add Listing to Experiment</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label for="pe-al-id" style="font-size:11px;font-weight:600;color:#64748b;">Listing ID *</label>
          <input id="pe-al-id" type="text" placeholder="e.g., SL-12345" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="pe-al-addr" style="font-size:11px;font-weight:600;color:#64748b;">Address (display)</label>
          <input id="pe-al-addr" type="text" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="pe-al-arm" style="font-size:11px;font-weight:600;color:#64748b;">Assign to Arm *</label>
          <select id="pe-al-arm" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            ${controlArm ? `<option value="${controlArm.id}">${peEscape(controlArm.name)} (Control)</option>` : ''}
            ${treatmentArm ? `<option value="${treatmentArm.id}">${peEscape(treatmentArm.name)} (Treatment)</option>` : ''}
          </select>
        </div>

        <!-- Seller Consent -->
        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px;">
          <p style="font-size:11px;color:#854d0e;margin:0 0 6px;font-weight:600;">Seller Consent Required</p>
          <p style="font-size:11px;color:#854d0e;margin:0 0 8px;">This is an experimental marketing program. No guarantees of results. The listing's MLS/RLS data will NOT be modified. The seller may withdraw at any time.</p>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#854d0e;cursor:pointer;">
            <input id="pe-al-consent" type="checkbox"> Seller has been informed and consents to participate
          </label>
          <label for="pe-al-consent-method" style="font-size:10px;font-weight:600;color:#854d0e;margin-top:6px;display:block;">Consent Method</label>
          <select id="pe-al-consent-method" style="width:100%;padding:4px 6px;border:1px solid #fde047;border-radius:3px;font-size:11px;margin-top:2px;">
            <option value="seller_portal">Seller Portal</option>
            <option value="email">Email</option>
            <option value="in_person">In Person</option>
          </select>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
          <button id="pe-al-cancel" style="padding:6px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">Cancel</button>
          <button id="pe-al-save" style="padding:6px 14px;background:#C4A052;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Add & Record Consent</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('pe-al-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  document.getElementById('pe-al-save')?.addEventListener('click', async () => {
    const listingId = document.getElementById('pe-al-id').value.trim();
    if (!listingId) { window.alert('Listing ID required'); return; }

    // Add listing to arm
    const addRes = await MallanAPI._fetch(`/api/crm/experiments/${exp.id}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arm_id: document.getElementById('pe-al-arm').value,
        listing_id: listingId,
        listing_address: document.getElementById('pe-al-addr').value.trim() || undefined,
      }),
    });

    if (!addRes.ok) { window.alert(addRes.error || 'Failed to add listing'); return; }

    // Record consent if checked
    if (document.getElementById('pe-al-consent').checked) {
      await MallanAPI._fetch(`/api/crm/experiments/${exp.id}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experiment_listing_id: addRes.item.id,
          consent_method: document.getElementById('pe-al-consent-method').value,
        }),
      });
    }

    modal.remove();
    document.getElementById('pe-detail-modal')?.remove();
    await fetchExperiments();
    renderExperimentsDashboard();
    openExpDetailModal(exp.id);
  });
}

// ── Event Listeners ──

function attachExpListeners() {
  document.getElementById('pe-filter-status')?.addEventListener('change', async (e) => {
    PricingExperiments.filters.status = e.target.value;
    await fetchExperiments();
    renderExperimentsDashboard();
  });

  document.getElementById('pe-filter-type')?.addEventListener('change', async (e) => {
    PricingExperiments.filters.type = e.target.value;
    await fetchExperiments();
    renderExperimentsDashboard();
  });

  document.getElementById('pe-create-btn')?.addEventListener('click', openCreateExpModal);

  document.querySelectorAll('.pe-exp-card').forEach(card => {
    card.addEventListener('click', () => openExpDetailModal(card.dataset.expId));
  });
}

function attachExpDetailListeners(exp) {
  document.getElementById('pe-close-modal')?.addEventListener('click', () => {
    document.getElementById('pe-detail-modal')?.remove();
  });

  document.getElementById('pe-detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'pe-detail-modal') e.target.remove();
  });

  document.getElementById('pe-add-listing-btn')?.addEventListener('click', () => {
    openAddListingModal(exp);
  });

  document.getElementById('pe-activate-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Activate this experiment? All assigned listings must have seller consent.')) return;
    const res = await MallanAPI._fetch(`/api/crm/experiments/${exp.id}/activate`, { method: 'POST' });
    if (!res.ok) { window.alert(res.error || 'Activation failed'); return; }
    document.getElementById('pe-detail-modal')?.remove();
    await Promise.all([fetchExperiments(), fetchExperimentStats()]);
    renderExperimentsDashboard();
  });

  document.getElementById('pe-conclude-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Conclude this experiment? Final results will be computed.')) return;
    const res = await MallanAPI._fetch(`/api/crm/experiments/${exp.id}/conclude`, { method: 'POST' });
    if (!res.ok) { window.alert(res.error || 'Conclusion failed'); return; }
    document.getElementById('pe-detail-modal')?.remove();
    await Promise.all([fetchExperiments(), fetchExperimentStats()]);
    renderExperimentsDashboard();
  });

  document.getElementById('pe-archive-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Archive this experiment? It can still be viewed but not modified.')) return;
    await MallanAPI._fetch(`/api/crm/experiments/${exp.id}`, { method: 'DELETE' });
    document.getElementById('pe-detail-modal')?.remove();
    await Promise.all([fetchExperiments(), fetchExperimentStats()]);
    renderExperimentsDashboard();
  });
}

// ── Utility ──

function peEscape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

window.initPricingExperiments = initPricingExperiments;
