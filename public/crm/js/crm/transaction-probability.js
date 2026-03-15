/**
 * Transaction Probability — CRM Module
 * Predict likelihood of sale/rent within 30/60/90 days.
 */
/* global MallanAPI, showToast */

async function initTransactionProbability() {
  var c = document.getElementById('transaction-probability');
  if (!c) return;

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Transaction Probability</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Predict likelihood of closing within 30, 60, or 90 days</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="tp-listing-id" type="text" placeholder="Listing ID (e.g. RLS20071059)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:220px;">
          <button onclick="runTransactionProb()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-chart-line" style="margin-right:4px;"></i> Analyze
          </button>
          <button onclick="runPortfolioProb()" style="padding:8px 16px;background:#059669;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-layer-group" style="margin-right:4px;"></i> My Portfolio
          </button>
        </div>
      </div>
    </div>
    <div id="tp-result" style="padding:24px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-chart-line" style="font-size:48px;margin-bottom:12px;display:block;"></i>
        <p style="font-size:14px;">Enter a listing ID or analyze your full portfolio</p>
      </div>
    </div>
  `;
}

async function runTransactionProb() {
  var id = (document.getElementById('tp-listing-id')?.value || '').trim();
  var result = document.getElementById('tp-result');
  if (!result) return;
  if (!id) { showToast('Enter a listing ID', 'error'); return; }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Computing probability...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/transaction-probability?listing_id=' + encodeURIComponent(id));
    if (!res.ok && res.error) {
      result.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>';
      return;
    }
    renderSingleProb(result, res);
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to compute probability.</div>';
  }
}

async function runPortfolioProb() {
  var result = document.getElementById('tp-result');
  if (!result) return;
  var ctx = MallanAPI.getContext();
  var agentId = ctx?.user?.id;
  if (!agentId) { showToast('Not logged in', 'error'); return; }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Analyzing portfolio...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/transaction-probability?agent_id=' + agentId);
    if (!res.ok && res.error) {
      result.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>';
      return;
    }
    if (!res.listings || res.listings.length === 0) {
      result.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">No active listings found in your portfolio.</div>';
      return;
    }
    renderPortfolioProb(result, res.listings);
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to analyze portfolio.</div>';
  }
}

function probColor(p) {
  if (p >= 70) return '#059669';
  if (p >= 50) return '#3b82f6';
  if (p >= 30) return '#f59e0b';
  return '#ef4444';
}

function impactIcon(impact) {
  if (impact === 'positive') return '<i class="fas fa-arrow-up" style="color:#059669;margin-right:4px;"></i>';
  if (impact === 'negative') return '<i class="fas fa-arrow-down" style="color:#ef4444;margin-right:4px;"></i>';
  return '<i class="fas fa-minus" style="color:#9ca3af;margin-right:4px;"></i>';
}

function renderSingleProb(container, r) {
  var confBadge = r.confidence === 'high' ? 'background:#dcfce7;color:#166534;' :
                  r.confidence === 'medium' ? 'background:#fef3c7;color:#92400e;' :
                  'background:#fee2e2;color:#991b1b;';

  var factorsHtml = (r.factors || []).map(function(f) {
    var barColor = f.score >= 60 ? '#059669' : f.score >= 35 ? '#f59e0b' : '#ef4444';
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:600;color:#374151;">${impactIcon(f.impact)}${f.name}</span>
        <span style="font-size:12px;color:#6b7280;">${f.detail}</span>
      </div>
      <div style="background:#f3f4f6;border-radius:9999px;height:6px;overflow:hidden;">
        <div style="background:${barColor};height:100%;width:${f.score}%;border-radius:9999px;transition:width 0.5s;"></div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
        <h3 style="font-size:18px;font-weight:700;color:#111827;margin:0;">${r.address}</h3>
        <span style="padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;${confBadge}">${r.confidence} confidence</span>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0;">${r.property_type} in ${r.neighborhood}, ${r.borough} &bull; $${r.list_price.toLocaleString()} &bull; ${r.days_on_market} DOM</p>
    </div>

    <!-- Probability Gauges -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      <div style="background:white;border:2px solid ${probColor(r.prob_30)};border-radius:12px;padding:20px;text-align:center;">
        <p style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 8px;">30 Days</p>
        <p style="font-size:36px;font-weight:800;color:${probColor(r.prob_30)};margin:0;">${r.prob_30}%</p>
      </div>
      <div style="background:white;border:2px solid ${probColor(r.prob_60)};border-radius:12px;padding:20px;text-align:center;">
        <p style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 8px;">60 Days</p>
        <p style="font-size:36px;font-weight:800;color:${probColor(r.prob_60)};margin:0;">${r.prob_60}%</p>
      </div>
      <div style="background:white;border:2px solid ${probColor(r.prob_90)};border-radius:12px;padding:20px;text-align:center;">
        <p style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 8px;">90 Days</p>
        <p style="font-size:36px;font-weight:800;color:${probColor(r.prob_90)};margin:0;">${r.prob_90}%</p>
      </div>
    </div>

    <!-- Factor Breakdown -->
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Contributing Factors</h3>
      ${factorsHtml}
    </div>

    <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
      <i class="fas fa-info-circle" style="margin-right:4px;"></i>
      Model combines DOM aging, price competitiveness, buyer momentum, neighborhood demand, and market inventory. Not a guarantee.
    </p>
  `;
}

function renderPortfolioProb(container, listings) {
  var sorted = listings.sort(function(a, b) { return b.prob_30 - a.prob_30; });

  var rows = sorted.map(function(l) {
    return `<tr style="border-top:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-size:13px;font-weight:500;">${l.address}</td>
      <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${l.neighborhood}</td>
      <td style="padding:10px 12px;font-size:13px;">$${l.list_price.toLocaleString()}</td>
      <td style="padding:10px 12px;font-size:13px;text-align:center;">${l.days_on_market}</td>
      <td style="padding:10px 12px;text-align:center;"><span style="font-weight:700;color:${probColor(l.prob_30)};">${l.prob_30}%</span></td>
      <td style="padding:10px 12px;text-align:center;"><span style="font-weight:700;color:${probColor(l.prob_60)};">${l.prob_60}%</span></td>
      <td style="padding:10px 12px;text-align:center;"><span style="font-weight:700;color:${probColor(l.prob_90)};">${l.prob_90}%</span></td>
      <td style="padding:10px 12px;text-align:center;">
        <button onclick="document.getElementById('tp-listing-id').value='${l.listing_id}';runTransactionProb();" style="padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;">Detail</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0;">Portfolio Probability Analysis</h3>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">${listings.length} active listings analyzed</p>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Address</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Neighborhood</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Price</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">DOM</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">30d</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">60d</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">90d</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Export for CRM
window.initTransactionProbability = initTransactionProbability;
window.runTransactionProb = runTransactionProb;
window.runPortfolioProb = runPortfolioProb;
