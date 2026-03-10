/**
 * Market Pulse — CRM Module
 * Neighborhood market stats, trends, and comparisons.
 */
/* global MallanAPI */

const MarketPulse = { snapshots: [], stats: null, filters: { borough: '', listing_type: 'sale' } };

async function initMarketPulse() {
  const c = document.getElementById('market-pulse');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading market data...</div>';
  try {
    await Promise.all([loadMarketStats(), loadMarketSnapshots()]);
    renderMarketPulse();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load market data.</div>'; }
}

async function loadMarketStats() {
  const res = await MallanAPI._fetch('/api/crm/market-pulse/stats');
  if (res.ok) MarketPulse.stats = res.stats;
}

async function loadMarketSnapshots() {
  const f = MarketPulse.filters;
  const params = new URLSearchParams();
  if (f.borough) params.set('borough', f.borough);
  params.set('listing_type', f.listing_type);
  params.set('limit', '200');
  const res = await MallanAPI._fetch('/api/crm/market-pulse?' + params.toString());
  if (res.ok) MarketPulse.snapshots = res.items;
}

function renderMarketPulse() {
  const c = document.getElementById('market-pulse');
  if (!c) return;
  const stats = MarketPulse.stats || {};
  const snapshots = MarketPulse.snapshots || [];
  const isSale = MarketPulse.filters.listing_type === 'sale';
  const mkt = isSale ? stats.sales : stats.rentals;

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${stats.neighborhoods_tracked || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Neighborhoods</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${mkt?.avg_median_price ? '$' + mkt.avg_median_price.toLocaleString() : '-'}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Median Price</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${mkt?.avg_dom || '-'}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Days on Market</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${mkt?.total_inventory || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Active Inventory</div>
      </div>
    </div>

    <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;">
      <select id="mp-borough" onchange="filterMarket()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Boroughs</option>
        <option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option><option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
      </select>
      <select id="mp-type" onchange="filterMarket()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="sale">Sales</option><option value="rent">Rentals</option>
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
          <th style="padding:8px 12px;text-align:right;">New</th>
        </tr></thead>
        <tbody>
          ${snapshots.map(s => `<tr style="border-bottom:1px solid #f1f5f9;cursor:pointer;" onclick="showNeighborhoodPulse('${encodeURIComponent(s.neighborhood)}')">
            <td style="padding:8px 12px;font-weight:600;">${s.neighborhood}</td>
            <td style="padding:8px 12px;">${s.borough || '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${s.median_price ? '$' + Number(s.median_price).toLocaleString() : '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${s.price_per_sqft ? '$' + Number(s.price_per_sqft).toLocaleString() : '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${s.avg_dom ?? '-'}</td>
            <td style="padding:8px 12px;text-align:right;">${s.inventory}</td>
            <td style="padding:8px 12px;text-align:right;">${s.new_listings}</td>
          </tr>`).join('')}
          ${snapshots.length === 0 ? '<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;">No market data. Snapshots are computed monthly.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

async function filterMarket() {
  MarketPulse.filters.borough = document.getElementById('mp-borough')?.value || '';
  MarketPulse.filters.listing_type = document.getElementById('mp-type')?.value || 'sale';
  await loadMarketSnapshots();
  renderMarketPulse();
}

async function showNeighborhoodPulse(nh) {
  const m = document.createElement('div');
  m.id = 'mp-detail';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:600px;max-height:85vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const res = await MallanAPI._fetch('/api/crm/market-pulse/' + nh + '?listing_type=' + MarketPulse.filters.listing_type);
    if (!res.ok) throw new Error(res.error);
    const cur = res.current;
    const changes = res.changes;
    const history = res.history || [];

    m.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('mp-detail').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;">${res.neighborhood}</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;">$${cur.median_price ? Number(cur.median_price).toLocaleString() : '-'}</div><div style="font-size:11px;color:#6b7280;">Median Price</div>${changes?.price_change_pct != null ? `<div style="font-size:12px;color:${changes.price_change_pct >= 0 ? '#059669' : '#dc2626'};">${changes.price_change_pct > 0 ? '+' : ''}${changes.price_change_pct}%</div>` : ''}</div>
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;">${cur.avg_dom ?? '-'}</div><div style="font-size:11px;color:#6b7280;">Avg DOM</div></div>
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;">${cur.inventory}</div><div style="font-size:11px;color:#6b7280;">Inventory</div></div>
      </div>
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Historical (${history.length} months)</h3>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr style="background:#f8fafc;"><th style="padding:6px;text-align:left;">Period</th><th style="text-align:right;padding:6px;">Median</th><th style="text-align:right;padding:6px;">DOM</th><th style="text-align:right;padding:6px;">Inventory</th></tr>
        ${history.map(h => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px;">${h.period}</td><td style="text-align:right;padding:6px;">${h.median_price ? '$' + Number(h.median_price).toLocaleString() : '-'}</td><td style="text-align:right;padding:6px;">${h.avg_dom ?? '-'}</td><td style="text-align:right;padding:6px;">${h.inventory}</td></tr>`).join('')}
      </table>
    `;
  } catch { m.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load.</div>'; }
}

window.initMarketPulse = initMarketPulse;
window.filterMarket = filterMarket;
window.showNeighborhoodPulse = showNeighborhoodPulse;
