/**
 * Market Pulse — CRM Module
 * Neighborhood market stats from LIVE Trestle RLS data.
 * Now powered by /api/crm/market-intelligence/query (replaces empty DB tables).
 */
/* global MallanAPI */

const MarketPulse = { data: null, filters: { borough: '', listing_type: 'sale' } };

async function initMarketPulse() {
  const c = document.getElementById('market-pulse');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading live market data from RLS...</div>';
  try {
    await loadMarketIntelligence();
    renderMarketPulse();
  } catch (e) {
    console.error('[market-pulse]', e);
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load market data. Please try again.</div>';
  }
}

async function loadMarketIntelligence() {
  var f = MarketPulse.filters;
  var body = { listing_type: f.listing_type };
  if (f.borough) body.borough = f.borough;
  var res = await MallanAPI._fetch('/api/crm/market-intelligence/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) MarketPulse.data = res.data;
  else throw new Error(res.error || 'API error');
}

function renderMarketPulse() {
  var c = document.getElementById('market-pulse');
  if (!c) return;
  var d = MarketPulse.data;
  if (!d) { c.innerHTML = '<div style="padding:24px;color:#9ca3af;">No data available.</div>'; return; }

  var s = d.summary || {};
  var neighborhoods = d.neighborhood_stats || [];

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${s.neighborhoodsTracked || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Neighborhoods</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${s.medianPrice ? '$' + s.medianPrice.toLocaleString() : '-'}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Median Price</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${s.avgDom || '-'}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Days on Market</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${s.totalActive || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Active Inventory</div>
      </div>
    </div>

    <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;">
      <select id="mp-borough" onchange="filterMarket()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Boroughs</option>
        <option value="Manhattan" ${MarketPulse.filters.borough==='Manhattan'?'selected':''}>Manhattan</option>
        <option value="Brooklyn" ${MarketPulse.filters.borough==='Brooklyn'?'selected':''}>Brooklyn</option>
        <option value="Queens" ${MarketPulse.filters.borough==='Queens'?'selected':''}>Queens</option>
        <option value="Bronx" ${MarketPulse.filters.borough==='Bronx'?'selected':''}>Bronx</option>
        <option value="Staten Island" ${MarketPulse.filters.borough==='Staten Island'?'selected':''}>Staten Island</option>
      </select>
      <select id="mp-type" onchange="filterMarket()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="sale" ${MarketPulse.filters.listing_type==='sale'?'selected':''}>Sales</option>
        <option value="rent" ${MarketPulse.filters.listing_type==='rent'?'selected':''}>Rentals</option>
      </select>
    </div>

    <div style="padding:0 24px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Neighborhood</th>
          <th style="padding:8px 12px;text-align:left;">Borough</th>
          <th style="padding:8px 12px;text-align:right;">Median Price</th>
          <th style="padding:8px 12px;text-align:right;">$/sqft</th>
          <th style="padding:8px 12px;text-align:right;">Avg DOM</th>
          <th style="padding:8px 12px;text-align:right;">Inventory</th>
          <th style="padding:8px 12px;text-align:right;">New (30d)</th>
        </tr></thead>
        <tbody>
          ${neighborhoods.map(n => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px;font-weight:600;">${n.neighborhood}</td>
            <td style="padding:8px 12px;">${n.borough || '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${n.medianPrice ? '$' + n.medianPrice.toLocaleString() : '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${n.avgPricePerSqft ? '$' + n.avgPricePerSqft.toLocaleString() : '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${n.avgDom ?? '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${n.activeCount}</td>
            <td style="padding:8px 12px;text-align:right;">${n.newListings30d}</td>
          </tr>`).join('')}
          ${neighborhoods.length === 0 ? '<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;">No listings found for this filter. Try a different borough.</td></tr>' : ''}
        </tbody>
      </table>
      <p style="font-size:10px;color:#9ca3af;margin-top:16px;line-height:1.5;">${d.disclaimer || ''}</p>
    </div>
  `;
}

async function filterMarket() {
  MarketPulse.filters.borough = document.getElementById('mp-borough')?.value || '';
  MarketPulse.filters.listing_type = document.getElementById('mp-type')?.value || 'sale';
  var c = document.getElementById('market-pulse');
  if (c) c.querySelector('tbody').innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Refreshing...</td></tr>';
  await loadMarketIntelligence();
  renderMarketPulse();
}

window.initMarketPulse = initMarketPulse;
window.filterMarket = filterMarket;
