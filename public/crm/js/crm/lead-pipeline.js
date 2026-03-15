/**
 * Lead Pipeline — CRM Module
 * Visual pipeline view: New → Contacted → Nurturing → Active → Showing → Offer → Deal → Closed → Past
 * Shows renter conversion candidates with financial flags.
 */
/* global MallanAPI */

var PIPELINE_STAGES = [
  { id: 'new', label: 'New', color: '#6b7280', icon: 'fa-star' },
  { id: 'contacted', label: 'Contacted', color: '#3b82f6', icon: 'fa-phone' },
  { id: 'nurturing', label: 'Nurturing', color: '#8b5cf6', icon: 'fa-seedling' },
  { id: 'active', label: 'Active', color: '#059669', icon: 'fa-bolt' },
  { id: 'showing', label: 'Showing', color: '#f59e0b', icon: 'fa-calendar' },
  { id: 'offer', label: 'Offer', color: '#f97316', icon: 'fa-gavel' },
  { id: 'deal', label: 'Deal', color: '#10b981', icon: 'fa-handshake' },
  { id: 'closed', label: 'Closed', color: '#059669', icon: 'fa-check-circle' },
  { id: 'past', label: 'Past Client', color: '#9ca3af', icon: 'fa-history' },
];

async function initLeadPipeline() {
  var c = document.getElementById('lead-pipeline');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading pipeline...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/pipeline');
    if (!res.pipeline) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; return; }
    renderPipeline(c, res.pipeline, res.stats);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load pipeline.</div>';
  }
}

function renderPipeline(container, pipeline, stats) {
  // Stage summary bar
  var stageBar = PIPELINE_STAGES.map(function(s) {
    var data = pipeline.find(function(p) { return p.stage === s.id; });
    var count = data ? data.count : 0;
    return '<div style="text-align:center;flex:1;min-width:0;">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:' + s.color + ';color:white;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;font-weight:800;font-size:13px;">' + count + '</div>' +
      '<p style="font-size:9px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + s.label + '</p>' +
    '</div>';
  }).join('<div style="color:#d1d5db;font-size:12px;padding-top:10px;">&rarr;</div>');

  // Build columns (only show stages with leads)
  var columns = pipeline.filter(function(p) { return p.count > 0; }).map(function(p) {
    var stageDef = PIPELINE_STAGES.find(function(s) { return s.id === p.stage; }) || { label: p.stage, color: '#6b7280', icon: 'fa-circle' };

    var cards = p.leads.map(function(l) {
      var gradeColor = l.grade === 'A' ? '#059669' : l.grade === 'B' ? '#3b82f6' : l.grade === 'C' ? '#f59e0b' : l.grade === 'D' ? '#f97316' : '#ef4444';
      var isRenter = l.role === 'tenant' || l.role === 'renter';
      var hasLeaseExpiry = isRenter && l.lease_end;
      var daysToExpiry = hasLeaseExpiry ? Math.ceil((new Date(l.lease_end).getTime() - Date.now()) / (1000*60*60*24)) : null;
      var isBuyerCandidate = isRenter && l.income >= 80000 && (l.credit === 'excellent' || l.credit === 'good');

      return '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:6px;' + (isBuyerCandidate ? 'border-left:3px solid #059669;' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
          '<div style="min-width:0;">' +
            '<p style="font-size:12px;font-weight:600;color:#111827;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + l.name + '</p>' +
            '<p style="font-size:10px;color:#6b7280;margin:1px 0 0;">' + (l.role || 'lead') + (l.source ? ' &middot; ' + l.source : '') + '</p>' +
          '</div>' +
          (l.grade ? '<span style="width:20px;height:20px;border-radius:50%;background:' + gradeColor + ';color:white;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + l.grade + '</span>' : '') +
        '</div>' +
        (l.next_follow_up ? '<p style="font-size:9px;color:#3b82f6;margin:4px 0 0;"><i class="fas fa-clock" style="margin-right:2px;"></i>Follow-up: ' + new Date(l.next_follow_up).toLocaleDateString() + '</p>' : '') +
        (hasLeaseExpiry ? '<p style="font-size:9px;margin:4px 0 0;color:' + (daysToExpiry <= 30 ? '#ef4444' : daysToExpiry <= 60 ? '#f59e0b' : '#6b7280') + ';"><i class="fas fa-calendar-times" style="margin-right:2px;"></i>Lease: ' + daysToExpiry + 'd left</p>' : '') +
        (isBuyerCandidate ? '<p style="font-size:9px;margin:4px 0 0;color:#059669;font-weight:600;"><i class="fas fa-arrow-up" style="margin-right:2px;"></i>Buyer conversion candidate</p>' : '') +
        (l.pre_approved ? '<p style="font-size:9px;margin:2px 0 0;color:#059669;"><i class="fas fa-check-circle" style="margin-right:2px;"></i>Pre-approved</p>' : '') +
      '</div>';
    }).join('');

    return '<div style="min-width:200px;max-width:260px;flex:1;">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;">' +
        '<i class="fas ' + stageDef.icon + '" style="font-size:11px;color:' + stageDef.color + ';"></i>' +
        '<span style="font-size:12px;font-weight:700;color:#374151;">' + stageDef.label + '</span>' +
        '<span style="font-size:10px;color:#9ca3af;font-weight:600;">' + p.count + '</span>' +
      '</div>' +
      '<div style="background:#f9fafb;border-radius:12px;padding:6px;min-height:100px;">' + cards + '</div>' +
    '</div>';
  }).join('');

  container.innerHTML = [
    '<div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">',
    '  <div style="display:flex;align-items:center;justify-content:space-between;">',
    '    <div><h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Lead Pipeline</h2>',
    '      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Visual pipeline — drag mentally, click to manage</p></div>',
    '    <div style="display:flex;gap:12px;">',
    '      <span style="font-size:12px;color:#374151;font-weight:600;">' + stats.total + ' total</span>',
    '      <span style="font-size:12px;color:#059669;font-weight:600;">' + stats.active + ' active</span>',
    '      <span style="font-size:12px;color:#3b82f6;font-weight:600;">' + stats.conversion_rate + '% conversion</span>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div style="padding:16px 24px;">',
    '  <div style="display:flex;gap:8px;margin-bottom:20px;padding:12px 16px;background:white;border:1px solid #e5e7eb;border-radius:12px;align-items:center;justify-content:center;">' + stageBar + '</div>',
    '  <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">' + columns + '</div>',
    '</div>'
  ].join('');
}

window.initLeadPipeline = initLeadPipeline;
