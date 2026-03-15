/**
 * Buyer Preference Graph (#3) — CRM Module
 * Clusters buyers by price segment, neighborhoods, and property type.
 */
/* global MallanAPI */

async function initBuyerClusters() {
  var c = document.getElementById('buyer-clusters');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Clustering buyers...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/buyer-clusters');
    if (!res.ok) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; return; }
    renderBuyerClusters(c, res);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load buyer clusters.</div>';
  }
}

var CLUSTER_COLORS = ['#059669', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

function renderBuyerClusters(container, data) {
  var clusters = data.clusters || [];

  if (clusters.length === 0) {
    container.innerHTML = `
      <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Buyer Preference Graph</h2>
        <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Buyer segments by price, neighborhood, and property type</p>
      </div>
      <div style="padding:40px;text-align:center;color:#9ca3af;">No buyer intent profiles yet. Data populates from daily Intent Profiles cron.</div>
    `;
    return;
  }

  var cards = clusters.map(function(cl, i) {
    var color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    var priceLabel = cl.price_range.max > 0 ?
      '$' + (cl.price_range.min / 1000).toFixed(0) + 'k – $' + (cl.price_range.max >= 1000000 ? (cl.price_range.max / 1000000).toFixed(1) + 'M' : (cl.price_range.max / 1000).toFixed(0) + 'k') :
      '$' + (cl.price_range.min / 1000000).toFixed(0) + 'M+';

    var nhTags = cl.top_neighborhoods.map(function(n) {
      return '<span style="padding:2px 8px;background:#f3f4f6;border-radius:9999px;font-size:10px;color:#374151;">' + n + '</span>';
    }).join(' ');

    var typeTags = cl.top_types.map(function(t) {
      return '<span style="padding:2px 8px;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:10px;">' + t + '</span>';
    }).join(' ');

    var bedLabels = cl.top_beds.map(function(b) { return b === 0 ? 'Studio' : b + 'BR'; }).join(', ');

    var stageBar = '';
    var totalStage = Object.values(cl.stages).reduce(function(s, v) { return s + v; }, 0);
    if (totalStage > 0) {
      var stageColors = { browsing: '#d1d5db', exploring: '#93c5fd', comparing: '#fbbf24', ready: '#34d399' };
      stageBar = '<div style="display:flex;height:6px;border-radius:9999px;overflow:hidden;margin-top:8px;">';
      Object.entries(cl.stages).forEach(function(e) {
        var pct = (e[1] / totalStage * 100).toFixed(1);
        stageBar += '<div style="width:' + pct + '%;background:' + (stageColors[e[0]] || '#d1d5db') + ';" title="' + e[0] + ': ' + e[1] + '"></div>';
      });
      stageBar += '</div>';
    }

    return `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;border-top:4px solid ${color};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div>
            <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0;">${cl.name}</h3>
            <p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${cl.description}</p>
          </div>
          <div style="text-align:center;">
            <span style="display:inline-block;width:44px;height:44px;border-radius:50%;background:${color};color:white;font-weight:800;font-size:16px;line-height:44px;">${cl.count}</span>
            <p style="font-size:10px;color:#6b7280;margin:2px 0 0;">buyers</p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div><span style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Budget</span><p style="font-size:13px;font-weight:600;color:#111827;margin:2px 0 0;">${priceLabel}</p></div>
          <div><span style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Avg Intent</span><p style="font-size:13px;font-weight:600;color:${color};margin:2px 0 0;">${cl.avg_intent}/100</p></div>
        </div>

        <div style="margin-bottom:8px;">
          <span style="font-size:10px;font-weight:600;color:#6b7280;">Preferred Areas:</span>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${nhTags || '<span style="color:#9ca3af;font-size:11px;">—</span>'}</div>
        </div>

        <div style="margin-bottom:8px;">
          <span style="font-size:10px;font-weight:600;color:#6b7280;">Property Types:</span>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${typeTags || '<span style="color:#9ca3af;font-size:11px;">—</span>'}</div>
        </div>

        <div>
          <span style="font-size:10px;font-weight:600;color:#6b7280;">Preferred Layout:</span>
          <span style="font-size:12px;color:#374151;margin-left:4px;">${bedLabels || '—'}</span>
        </div>

        ${stageBar}
        <div style="display:flex;gap:8px;margin-top:4px;">
          <span style="font-size:9px;color:#9ca3af;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d1d5db;margin-right:2px;"></span>Browsing</span>
          <span style="font-size:9px;color:#9ca3af;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#93c5fd;margin-right:2px;"></span>Exploring</span>
          <span style="font-size:9px;color:#9ca3af;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#fbbf24;margin-right:2px;"></span>Comparing</span>
          <span style="font-size:9px;color:#9ca3af;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;margin-right:2px;"></span>Ready</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Buyer Preference Graph</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Buyer segments clustered by price, neighborhood, and property type preferences</p>
        </div>
        <div style="padding:6px 14px;background:#8b5cf6;color:white;border-radius:9999px;font-size:13px;font-weight:600;">
          ${data.total_buyers} Total Buyers
        </div>
      </div>
    </div>
    <div style="padding:16px 24px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">
        ${cards}
      </div>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Clusters based on buyer intent profiles. Use for listing targeting, marketing segmentation, and recommendation matching.
      </p>
    </div>
  `;
}

window.initBuyerClusters = initBuyerClusters;
