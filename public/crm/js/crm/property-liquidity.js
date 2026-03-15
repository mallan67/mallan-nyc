/**
 * Property Liquidity Score (#12) — CRM Module
 * Per-listing score: how easily could this specific listing sell.
 * Combines demand + price competitiveness + DOM + inventory.
 * Uses /api/crm/transaction-probability endpoint (same data, different view).
 */
/* global MallanAPI, showToast */

async function initPropertyLiquidity() {
  var c = document.getElementById('property-liquidity');
  if (!c) return;

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Property Liquidity Score</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">How easily a specific listing could sell — demand, pricing, and market context</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="pliq-id" type="text" placeholder="Listing ID" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:200px;">
          <button onclick="runPropertyLiquidity()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-tachometer-alt" style="margin-right:4px;"></i> Score
          </button>
        </div>
      </div>
    </div>
    <div id="pliq-result" style="padding:24px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-tachometer-alt" style="font-size:48px;margin-bottom:12px;display:block;"></i>
        <p style="font-size:14px;">Enter a listing ID to evaluate liquidity</p>
      </div>
    </div>
  `;
}

async function runPropertyLiquidity() {
  var id = (document.getElementById('pliq-id')?.value || '').trim();
  var result = document.getElementById('pliq-result');
  if (!result || !id) { showToast('Enter a listing ID', 'error'); return; }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Scoring...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/transaction-probability?listing_id=' + encodeURIComponent(id));
    if (!res.ok && res.error) { result.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>'; return; }

    // Derive liquidity from probability factors
    var avgScore = (res.factors || []).reduce(function(s, f) { return s + f.score; }, 0) / Math.max((res.factors || []).length, 1);
    var liqScore = Math.round(avgScore);
    var liqLabel = liqScore >= 75 ? 'Highly Liquid' : liqScore >= 55 ? 'Liquid' : liqScore >= 35 ? 'Moderate' : 'Illiquid';
    var liqColor = liqScore >= 75 ? '#059669' : liqScore >= 55 ? '#3b82f6' : liqScore >= 35 ? '#f59e0b' : '#ef4444';

    var factorsHtml = (res.factors || []).map(function(f) {
      var c = f.score >= 60 ? '#059669' : f.score >= 35 ? '#f59e0b' : '#ef4444';
      return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #f3f4f6;">' +
        '<div style="min-width:140px;font-size:13px;font-weight:600;color:#374151;">' + f.name + '</div>' +
        '<div style="flex:1;background:#f3f4f6;border-radius:9999px;height:6px;overflow:hidden;">' +
          '<div style="background:' + c + ';height:100%;width:' + f.score + '%;border-radius:9999px;"></div>' +
        '</div>' +
        '<div style="min-width:30px;text-align:right;font-size:12px;font-weight:700;color:' + c + ';">' + f.score + '</div>' +
      '</div>';
    }).join('');

    result.innerHTML = `
      <div style="display:flex;align-items:center;gap:24px;margin-bottom:24px;">
        <div style="width:120px;height:120px;border-radius:50%;border:5px solid ${liqColor};display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span style="font-size:32px;font-weight:800;color:${liqColor};">${liqScore}</span>
          <span style="font-size:10px;font-weight:600;color:#6b7280;">/ 100</span>
        </div>
        <div>
          <h3 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px;">${res.address}</h3>
          <p style="font-size:14px;font-weight:600;color:${liqColor};margin:0 0 4px;">${liqLabel}</p>
          <p style="font-size:12px;color:#6b7280;margin:0;">${res.property_type} &bull; $${res.list_price.toLocaleString()} &bull; ${res.neighborhood} &bull; ${res.days_on_market} DOM</p>
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;">Liquidity Factors</h4>
        ${factorsHtml}
      </div>
    `;
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to score liquidity.</div>';
  }
}

window.initPropertyLiquidity = initPropertyLiquidity;
window.runPropertyLiquidity = runPropertyLiquidity;
