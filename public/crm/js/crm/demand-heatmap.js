/**
 * Demand Heatmap — CRM Module
 *
 * Building-level demand index visualization, neighborhood scoring,
 * alert configuration, and demand trend dashboard.
 *
 * Uses MallanAPI._fetch() for all API calls (cookie auth).
 */

/* global MallanAPI */

// ── State ──
const DemandHeatmap = {
  indices: [],
  stats: null,
  alerts: [],
  currentNeighborhood: null,
  filters: { borough: '', min_score: '', trend: '', sort: 'score', order: 'desc' },
};

// ── Trend Icons ──
const TREND_ICONS = {
  up: { symbol: '\u2191', color: '#059669', label: 'Rising' },
  down: { symbol: '\u2193', color: '#dc2626', label: 'Falling' },
  stable: { symbol: '\u2194', color: '#6b7280', label: 'Stable' },
};

// ── Score Colors ──
function scoreColor(score) {
  if (score >= 80) return { bg: '#dcfce7', text: '#166534' };
  if (score >= 60) return { bg: '#dbeafe', text: '#1e40af' };
  if (score >= 40) return { bg: '#fef9c3', text: '#854d0e' };
  if (score >= 20) return { bg: '#fed7aa', text: '#9a3412' };
  return { bg: '#f3f4f6', text: '#374151' };
}

// ── Init ──
async function initDemandHeatmap() {
  const container = document.getElementById('demand-heatmap');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading demand data from live RLS...</div>';

  try {
    await loadDemandFromTrestle();
    renderDemandHeatmap();
  } catch (err) {
    container.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load demand data.</div>';
    console.error('[demand-heatmap]', err);
  }
}

async function loadDemandFromTrestle() {
  var body = { listing_type: 'sale' };
  var f = DemandHeatmap.filters;
  if (f.borough) body.borough = f.borough;
  var res = await MallanAPI._fetch('/api/crm/market-intelligence/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(res.error || 'API error');
  var d = res.data;
  // Map neighborhood stats to DemandIndex-like format for existing renderer
  var nhStats = d.neighborhood_stats || [];
  var sentiments = d.sentiment || [];
  DemandHeatmap.indices = nhStats.map(function(nh, i) {
    var sent = sentiments.find(function(s) { return s.neighborhood === nh.neighborhood; }) || {};
    return {
      neighborhood: nh.neighborhood,
      borough: nh.borough,
      score: sent.score || 50,
      trend: nh.newListings30d > nh.activeCount * 0.2 ? 'up' : nh.avgDom > 60 ? 'down' : 'stable',
      trend_delta: 0
    };
  });
  // Build stats
  var scores = DemandHeatmap.indices.map(function(x) { return x.score; });
  var avgScore = scores.length > 0 ? Math.round(scores.reduce(function(a,b){return a+b;},0) / scores.length) : 0;
  var upCount = DemandHeatmap.indices.filter(function(x){return x.trend==='up';}).length;
  DemandHeatmap.stats = {
    total_neighborhoods: DemandHeatmap.indices.length,
    avg_score: avgScore,
    trend_counts: { up: upCount, down: DemandHeatmap.indices.filter(function(x){return x.trend==='down';}).length, stable: DemandHeatmap.indices.filter(function(x){return x.trend==='stable';}).length },
    signals_7d: d.summary?.newListings30d || 0,
    top_neighborhoods: DemandHeatmap.indices.sort(function(a,b){return b.score-a.score;}).slice(0,5)
  };
  DemandHeatmap.alerts = [];
}

// ── Render ──
function renderDemandHeatmap() {
  const container = document.getElementById('demand-heatmap');
  if (!container) return;

  const stats = DemandHeatmap.stats || {};
  const indices = DemandHeatmap.indices || [];

  container.innerHTML = `
    <!-- Stats Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.total_neighborhoods || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Neighborhoods Tracked</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.avg_score || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Demand Score</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#059669;">${stats.trend_counts?.up || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Rising Markets</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#6b7280;">${stats.signals_7d || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Signals (7d)</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;align-items:center;">
      <select id="dh-borough-filter" onchange="filterDemand()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Boroughs</option>
        <option value="Manhattan">Manhattan</option>
        <option value="Brooklyn">Brooklyn</option>
        <option value="Queens">Queens</option>
        <option value="Bronx">Bronx</option>
        <option value="Staten Island">Staten Island</option>
      </select>
      <select id="dh-trend-filter" onchange="filterDemand()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Trends</option>
        <option value="up">Rising</option>
        <option value="stable">Stable</option>
        <option value="down">Falling</option>
      </select>
      <input id="dh-min-score" type="number" placeholder="Min Score" min="0" max="100" onchange="filterDemand()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:100px;">
      <button onclick="showCreateAlertModal()" style="margin-left:auto;background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ Alert</button>
    </div>

    <!-- Top Neighborhoods (mini heatmap) -->
    ${renderTopNeighborhoods(stats.top_neighborhoods || [])}

    <!-- Neighborhood Grid -->
    <div style="padding:0 24px 24px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">All Neighborhoods (${indices.length})</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
        ${indices.map(renderNeighborhoodCard).join('')}
      </div>
    </div>

    <!-- Alerts Section -->
    <div style="padding:0 24px 24px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">My Alerts (${DemandHeatmap.alerts.length})</h3>
      ${DemandHeatmap.alerts.length === 0
        ? '<div style="color:#9ca3af;font-size:13px;">No demand alerts configured.</div>'
        : DemandHeatmap.alerts.map(renderAlertRow).join('')}
    </div>
  `;
}

function renderTopNeighborhoods(top) {
  if (!top || top.length === 0) return '';
  return `
    <div style="padding:0 24px 16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">Top Demand Neighborhoods</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${top.map(n => {
          const c = scoreColor(n.score);
          const t = TREND_ICONS[n.trend] || TREND_ICONS.stable;
          return `<div style="background:${c.bg};color:${c.text};padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;" onclick="showNeighborhoodDetail('${n.neighborhood}')">
            ${n.neighborhood} <span style="font-weight:700;">${n.score}</span> <span style="color:${t.color};">${t.symbol}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderNeighborhoodCard(idx) {
  const c = scoreColor(idx.score);
  const t = TREND_ICONS[idx.trend] || TREND_ICONS.stable;
  return `
    <div onclick="showNeighborhoodDetail('${idx.neighborhood}')" style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;cursor:pointer;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:600;font-size:14px;color:#1e293b;">${idx.neighborhood}</span>
        <span style="background:${c.bg};color:${c.text};padding:2px 10px;border-radius:12px;font-size:13px;font-weight:700;">${idx.score}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;color:#6b7280;">
        <span>${idx.borough || 'N/A'}</span>
        <span style="color:${t.color};font-weight:600;">${t.symbol} ${t.label}</span>
        ${idx.trend_delta ? `<span>(${idx.trend_delta > 0 ? '+' : ''}${Math.round(idx.trend_delta)}%)</span>` : ''}
      </div>
    </div>
  `;
}

function renderAlertRow(alert) {
  const nh = alert.demand_index?.neighborhood || 'Unknown';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;background:white;">
      <div>
        <span style="font-weight:600;font-size:13px;">${nh}</span>
        <span style="color:#6b7280;font-size:12px;margin-left:8px;">${alert.alert_type.replace('_', ' ')}</span>
        ${alert.threshold ? `<span style="color:#6b7280;font-size:12px;"> (threshold: ${alert.threshold})</span>` : ''}
      </div>
      <span style="font-size:12px;color:${alert.enabled ? '#059669' : '#9ca3af'};">${alert.enabled ? 'Active' : 'Paused'}</span>
    </div>
  `;
}

// ── Filters ──
async function filterDemand() {
  const f = DemandHeatmap.filters;
  f.borough = document.getElementById('dh-borough-filter')?.value || '';
  f.trend = document.getElementById('dh-trend-filter')?.value || '';
  f.min_score = document.getElementById('dh-min-score')?.value || '';
  await loadDemandFromTrestle();
  // Apply client-side filters for trend and min_score
  if (f.trend) DemandHeatmap.indices = DemandHeatmap.indices.filter(function(x){return x.trend===f.trend;});
  if (f.min_score) DemandHeatmap.indices = DemandHeatmap.indices.filter(function(x){return x.score>=parseInt(f.min_score);});
  renderDemandHeatmap();
}

// ── Neighborhood Detail ──
async function showNeighborhoodDetail(neighborhood) {
  const modal = document.createElement('div');
  modal.id = 'dh-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:600px;max-height:80vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  try {
    const res = await MallanAPI._fetch('/api/crm/demand/' + encodeURIComponent(neighborhood));
    if (!res.ok) throw new Error(res.error);

    const idx = res.item;
    const signals = res.signals || [];
    const c = scoreColor(idx.score);
    const t = TREND_ICONS[idx.trend] || TREND_ICONS.stable;
    const components = idx.components || [];

    modal.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('dh-detail-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">${idx.neighborhood}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${idx.borough || 'N/A'}</div>

      <div style="display:flex;gap:16px;margin-bottom:20px;">
        <div style="background:${c.bg};color:${c.text};padding:16px 24px;border-radius:10px;text-align:center;">
          <div style="font-size:32px;font-weight:700;">${idx.score}</div>
          <div style="font-size:12px;">Demand Score</div>
        </div>
        <div style="padding:16px;text-align:center;">
          <div style="font-size:24px;color:${t.color};font-weight:700;">${t.symbol} ${t.label}</div>
          <div style="font-size:12px;color:#6b7280;">${idx.trend_delta > 0 ? '+' : ''}${Math.round(idx.trend_delta || 0)}% change</div>
        </div>
      </div>

      ${Array.isArray(components) && components.length > 0 ? `
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Signal Components</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px;">
          <tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;">Signal</th><th style="text-align:right;padding:6px 8px;">Value</th><th style="text-align:right;padding:6px 8px;">Normalized</th><th style="text-align:right;padding:6px 8px;">Weight</th><th style="text-align:right;padding:6px 8px;">Contribution</th></tr>
          ${components.map(c => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 8px;">${c.signal_type?.replace(/_/g, ' ')}</td><td style="text-align:right;padding:6px 8px;">${c.value}</td><td style="text-align:right;padding:6px 8px;">${(c.normalized * 100).toFixed(0)}%</td><td style="text-align:right;padding:6px 8px;">${(c.weight * 100).toFixed(0)}%</td><td style="text-align:right;padding:6px 8px;">${(c.contribution * 100).toFixed(1)}%</td></tr>`).join('')}
        </table>
      ` : ''}

      ${signals.length > 0 ? `
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Recent Signals (${signals.length})</h3>
        <div style="max-height:200px;overflow-y:auto;">
          ${signals.map(s => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
            <span>${s.signal_type?.replace(/_/g, ' ')}</span>
            <span style="color:#6b7280;">${s.source} | ${new Date(s.collected_at).toLocaleDateString()}</span>
          </div>`).join('')}
        </div>
      ` : ''}
    `;
  } catch (err) {
    modal.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load neighborhood detail.</div>';
  }
}

// ── Create Alert Modal ──
function showCreateAlertModal() {
  const modal = document.createElement('div');
  modal.id = 'dh-alert-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:420px;padding:24px;position:relative;">
      <button onclick="document.getElementById('dh-alert-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Create Demand Alert</h2>
      <div style="margin-bottom:12px;">
        <label for="dh-alert-nh" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Neighborhood</label>
        <input id="dh-alert-nh" type="text" placeholder="e.g. Upper East Side" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </div>
      <div style="margin-bottom:12px;">
        <label for="dh-alert-type" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Alert Type</label>
        <select id="dh-alert-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
          <option value="score_above">Score Above Threshold</option>
          <option value="score_below">Score Below Threshold</option>
          <option value="trend_change">Trend Direction Change</option>
          <option value="spike">Sudden Spike</option>
        </select>
      </div>
      <div style="margin-bottom:16px;">
        <label for="dh-alert-threshold" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Threshold (optional)</label>
        <input id="dh-alert-threshold" type="number" placeholder="e.g. 70" min="0" max="100" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </div>
      <button onclick="createDemandAlert()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Create Alert</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function createDemandAlert() {
  const neighborhood = document.getElementById('dh-alert-nh')?.value?.trim();
  const alert_type = document.getElementById('dh-alert-type')?.value;
  const threshold = parseInt(document.getElementById('dh-alert-threshold')?.value) || null;

  if (!neighborhood) { alert('Neighborhood is required'); return; }

  try {
    const res = await MallanAPI._fetch('/api/crm/demand/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neighborhood, alert_type, threshold }),
    });
    if (res.ok) {
      document.getElementById('dh-alert-modal')?.remove();
      await loadDemandAlerts();
      renderDemandHeatmap();
    } else {
      alert(res.error || 'Failed to create alert');
    }
  } catch (err) {
    alert('Failed to create alert');
  }
}

// Expose globally
window.initDemandHeatmap = initDemandHeatmap;
window.filterDemand = filterDemand;
window.showNeighborhoodDetail = showNeighborhoodDetail;
window.showCreateAlertModal = showCreateAlertModal;
window.createDemandAlert = createDemandAlert;
