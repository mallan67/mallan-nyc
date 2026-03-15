/**
 * Transaction Probability — CRM Module
 * Predict likelihood of sale/rent within 30/60/90 days.
 * Auto-loads agent's portfolio on init — no manual ID entry needed.
 */
/* global MallanAPI, showToast */

async function initTransactionProbability() {
  var c = document.getElementById('transaction-probability');
  if (!c) return;

  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Analyzing your portfolio...</div>';

  // Auto-load portfolio
  try {
    var ctx = MallanAPI.getContext();
    var agentId = ctx?.user?.id;
    if (!agentId) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Not logged in.</div>'; return; }

    var res = await MallanAPI._fetch('/api/crm/transaction-probability?agent_id=' + agentId);
    if (!res.ok && res.error) {
      c.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>';
      return;
    }

    var listings = res.listings || [];
    renderTPDashboard(c, listings);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load probability data.</div>';
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

function renderTPDashboard(container, listings) {
  if (listings.length === 0) {
    container.innerHTML = `
      <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Transaction Probability</h2>
        <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Predict likelihood of closing within 30, 60, or 90 days</p>
      </div>
      <div style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-chart-line" style="font-size:48px;margin-bottom:12px;display:block;"></i>
        <p style="font-size:14px;">No active listings in your portfolio</p>
        <p style="font-size:12px;">Create a listing to see transaction probability analysis</p>
      </div>`;
    return;
  }

  var sorted = listings.sort(function(a, b) { return b.prob_30 - a.prob_30; });

  var cards = sorted.map(function(l) {
    var factorsHtml = (l.factors || []).map(function(f) {
      var barColor = f.score >= 60 ? '#059669' : f.score >= 35 ? '#f59e0b' : '#ef4444';
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<span style="width:100px;font-size:10px;color:#6b7280;white-space:nowrap;">' + impactIcon(f.impact) + f.name + '</span>' +
        '<div style="flex:1;background:#f3f4f6;border-radius:9999px;height:4px;overflow:hidden;">' +
          '<div style="background:' + barColor + ';height:100%;width:' + f.score + '%;border-radius:9999px;"></div>' +
        '</div>' +
        '<span style="width:20px;text-align:right;font-size:10px;font-weight:600;color:' + barColor + ';">' + f.score + '</span>' +
      '</div>';
    }).join('');

    return '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">' +
      '<div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="min-width:0;">' +
          '<p style="font-size:14px;font-weight:700;color:#111827;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + l.address + '</p>' +
          '<p style="font-size:11px;color:#6b7280;margin:2px 0 0;">' + l.property_type + ' &middot; ' + l.neighborhood + ' &middot; $' + l.list_price.toLocaleString() + ' &middot; ' + l.days_on_market + ' DOM</p>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<div style="flex:1;text-align:center;padding:8px;border-radius:8px;border:2px solid ' + probColor(l.prob_30) + ';">' +
          '<p style="font-size:9px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0;">30d</p>' +
          '<p style="font-size:22px;font-weight:800;color:' + probColor(l.prob_30) + ';margin:0;">' + l.prob_30 + '%</p>' +
        '</div>' +
        '<div style="flex:1;text-align:center;padding:8px;border-radius:8px;border:2px solid ' + probColor(l.prob_60) + ';">' +
          '<p style="font-size:9px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0;">60d</p>' +
          '<p style="font-size:22px;font-weight:800;color:' + probColor(l.prob_60) + ';margin:0;">' + l.prob_60 + '%</p>' +
        '</div>' +
        '<div style="flex:1;text-align:center;padding:8px;border-radius:8px;border:2px solid ' + probColor(l.prob_90) + ';">' +
          '<p style="font-size:9px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0;">90d</p>' +
          '<p style="font-size:22px;font-weight:800;color:' + probColor(l.prob_90) + ';margin:0;">' + l.prob_90 + '%</p>' +
        '</div>' +
      '</div>' +
      factorsHtml +
    '</div>';
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Transaction Probability</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">${listings.length} active listing${listings.length !== 1 ? 's' : ''} analyzed</p>
        </div>
      </div>
    </div>
    <div style="padding:16px 24px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
        ${cards}
      </div>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Combines DOM aging, price competitiveness, buyer momentum, demand, and inventory. Not a guarantee.
      </p>
    </div>
  `;
}

// Also callable from client profile for a specific listing
window.analyzeListingProb = async function(listingId, targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = '<span style="color:#6b7280;font-size:11px;"><i class="fas fa-spinner fa-spin"></i> Analyzing...</span>';
  try {
    var res = await MallanAPI._fetch('/api/crm/transaction-probability?listing_id=' + encodeURIComponent(listingId));
    if (!res.ok && res.error) { targetEl.innerHTML = '<span style="color:#ef4444;font-size:11px;">Error</span>'; return; }
    targetEl.innerHTML = '<div style="display:flex;gap:6px;margin-top:4px;">' +
      '<span style="font-size:11px;font-weight:700;color:' + probColor(res.prob_30) + ';">30d: ' + res.prob_30 + '%</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + probColor(res.prob_60) + ';">60d: ' + res.prob_60 + '%</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + probColor(res.prob_90) + ';">90d: ' + res.prob_90 + '%</span>' +
    '</div>';
  } catch (e) {
    targetEl.innerHTML = '<span style="color:#ef4444;font-size:11px;">Failed</span>';
  }
};

window.initTransactionProbability = initTransactionProbability;
window.runTransactionProb = function() { initTransactionProbability(); };
window.runPortfolioProb = function() { initTransactionProbability(); };
