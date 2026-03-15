/**
 * Neighborhood Sentiment — CRM Module
 * Now powered by /api/crm/market-intelligence/query (live Trestle data).
 */
/* global MallanAPI */

async function initNeighborhoodSentiment() {
  var c = document.getElementById('neighborhood-sentiment');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Analyzing neighborhood sentiment from live data...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/market-intelligence/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_type: 'sale' })
    });
    if (!res.ok) throw new Error(res.error);
    renderSentiment(c, res.data.sentiment || [], res.data.disclaimer);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load sentiment data.</div>';
  }
}

function sentColor(label) {
  if (label === 'Hot') return { bg: '#fef2f2', text: '#dc2626', badge: '#fee2e2' };
  if (label === 'Warm') return { bg: '#fffbeb', text: '#d97706', badge: '#fef3c7' };
  if (label === 'Neutral') return { bg: '#f9fafb', text: '#6b7280', badge: '#f3f4f6' };
  if (label === 'Cool') return { bg: '#eff6ff', text: '#2563eb', badge: '#dbeafe' };
  return { bg: '#f9fafb', text: '#6b7280', badge: '#f3f4f6' };
}

function renderSentiment(container, sentiments, disclaimer) {
  if (sentiments.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">No sentiment data available. Try refreshing.</div>';
    return;
  }

  var sorted = sentiments.sort(function(a, b) { return b.score - a.score; });

  var cards = sorted.map(function(s) {
    var sc = sentColor(s.label);
    var signals = (s.signals || []).map(function(sig) {
      return '<span style="display:inline-block;padding:2px 8px;background:#f3f4f6;border-radius:4px;font-size:11px;color:#374151;margin:2px;">' + sig + '</span>';
    }).join('');

    return '<div style="background:' + sc.bg + ';border:1px solid #e5e7eb;border-radius:10px;padding:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span style="font-size:14px;font-weight:700;">' + s.neighborhood + '</span>' +
        '<span style="padding:3px 10px;background:' + sc.badge + ';color:' + sc.text + ';border-radius:9999px;font-size:11px;font-weight:700;">' + s.label + ' (' + s.score + ')</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<div style="flex:1;background:#e5e7eb;border-radius:9999px;height:6px;overflow:hidden;">' +
          '<div style="background:' + sc.text + ';height:100%;width:' + s.score + '%;border-radius:9999px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#6b7280;">' + s.borough + '</div>' +
      (signals ? '<div style="margin-top:8px;">' + signals + '</div>' : '') +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div style="padding:20px 24px;">' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Neighborhood Sentiment</h3>' +
      '<p style="font-size:12px;color:#6b7280;margin-bottom:16px;">Market mood for each neighborhood based on inventory, absorption speed, price movements, and buyer activity.</p>' +
    '</div>' +
    '<div style="padding:0 24px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">' +
      cards +
    '</div>' +
    '<p style="font-size:10px;color:#9ca3af;padding:0 24px 16px;line-height:1.5;">' + (disclaimer || '') + '</p>';
}

window.initNeighborhoodSentiment = initNeighborhoodSentiment;
