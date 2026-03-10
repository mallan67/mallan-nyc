/**
 * Lead Scoring — CRM Module
 * Lead quality scores, grades, and auto-assignment.
 */
/* global MallanAPI */

const LeadScoring = { scores: [], stats: null, rules: [] };
const GRADE_COLORS = { A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

async function initLeadScoring() {
  const c = document.getElementById('lead-scoring');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading lead scores...</div>';
  try {
    await Promise.all([loadLeadStats(), loadLeadScores()]);
    renderLeadScoring();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; }
}

async function loadLeadStats() {
  const res = await MallanAPI._fetch('/api/crm/lead-scoring/stats');
  if (res.ok) LeadScoring.stats = res.stats;
}

async function loadLeadScores() {
  const res = await MallanAPI._fetch('/api/crm/lead-scoring?limit=100');
  if (res.ok) LeadScoring.scores = res.items;
}

function renderLeadScoring() {
  const c = document.getElementById('lead-scoring');
  if (!c) return;
  const stats = LeadScoring.stats || {};
  const scores = LeadScoring.scores || [];

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${stats.total_scored || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Leads Scored</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${stats.avg_score || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Score</div>
      </div>
      ${Object.entries(stats.grade_counts || {}).map(([g, n]) => `
        <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:${GRADE_COLORS[g] || '#6b7280'};">${n}</div>
          <div style="font-size:12px;color:#6b7280;">Grade ${g}</div>
        </div>
      `).join('')}
    </div>

    <div style="padding:16px 24px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Lead</th>
          <th style="padding:8px 12px;text-align:center;">Score</th>
          <th style="padding:8px 12px;text-align:center;">Grade</th>
          <th style="padding:8px 12px;text-align:center;">Source</th>
          <th style="padding:8px 12px;text-align:center;">Engagement</th>
          <th style="padding:8px 12px;text-align:center;">Recency</th>
          <th style="padding:8px 12px;text-align:center;">Fit</th>
          <th style="padding:8px 12px;text-align:center;">Actions</th>
        </tr></thead>
        <tbody>
          ${scores.map(s => {
            const lead = s.lead || {};
            return `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:8px 12px;"><span style="font-weight:600;">${lead.first_name || ''} ${lead.last_name || ''}</span><br><span style="font-size:11px;color:#6b7280;">${lead.email || ''}</span></td>
              <td style="padding:8px 12px;text-align:center;font-weight:700;font-size:16px;">${s.score}</td>
              <td style="padding:8px 12px;text-align:center;"><span style="background:${GRADE_COLORS[s.grade] || '#6b7280'}22;color:${GRADE_COLORS[s.grade] || '#6b7280'};padding:2px 10px;border-radius:10px;font-weight:700;">${s.grade}</span></td>
              <td style="padding:8px 12px;text-align:center;font-size:12px;">${s.source_score}</td>
              <td style="padding:8px 12px;text-align:center;font-size:12px;">${s.engagement_score}</td>
              <td style="padding:8px 12px;text-align:center;font-size:12px;">${s.recency_score}</td>
              <td style="padding:8px 12px;text-align:center;font-size:12px;">${s.fit_score}</td>
              <td style="padding:8px 12px;text-align:center;"><button onclick="rescoreLead('${s.lead_id}')" style="background:none;border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">Rescore</button></td>
            </tr>`;
          }).join('')}
          ${scores.length === 0 ? '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;">No scored leads. Scoring runs daily via cron.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

async function rescoreLead(leadId) {
  try {
    await MallanAPI._fetch('/api/crm/lead-scoring/' + leadId, { method: 'POST' });
    await loadLeadScores();
    renderLeadScoring();
  } catch { alert('Failed to rescore'); }
}

window.initLeadScoring = initLeadScoring;
window.rescoreLead = rescoreLead;
