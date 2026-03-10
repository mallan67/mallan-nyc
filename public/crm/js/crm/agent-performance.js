/**
 * Agent Performance — CRM Module
 *
 * Agent performance index, leaderboard with tier badges,
 * monthly metrics detail, and broker-level stats dashboard.
 *
 * Uses MallanAPI._fetch() for all API calls (cookie auth).
 */

/* global MallanAPI */

// ── State ──
const AgentPerformance = {
  indices: [],
  leaderboard: [],
  stats: null,
  currentAgent: null,
  filters: { tier: '' },
  isBroker: false,
};

// ── Tier Config ──
const TIER_CONFIG = {
  platinum: { bg: '#f0f0f0', text: '#1a1a1a', border: '#c0c0c0', badge: '#e5e5e5', label: 'Platinum', icon: '\u2666' },
  gold: { bg: '#fef9c3', text: '#854d0e', border: '#fde047', badge: '#fbbf24', label: 'Gold', icon: '\u2605' },
  silver: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', badge: '#94a3b8', label: 'Silver', icon: '\u25CF' },
  bronze: { bg: '#fed7aa', text: '#9a3412', border: '#fdba74', badge: '#f97316', label: 'Bronze', icon: '\u25CB' },
};

// ── Init ──
async function initAgentPerformance() {
  const container = document.getElementById('agent-performance');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading performance data...</div>';

  try {
    // Try broker stats first to determine role
    const statsRes = await MallanAPI._fetch('/api/crm/performance/stats');
    if (statsRes.ok) {
      AgentPerformance.stats = statsRes.stats;
      AgentPerformance.isBroker = true;
    }

    await Promise.all([loadPerformanceIndices(), loadLeaderboard()]);
    renderAgentPerformance();
  } catch (err) {
    container.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load performance data.</div>';
    console.error('[agent-performance]', err);
  }
}

async function loadPerformanceIndices() {
  const f = AgentPerformance.filters;
  const params = new URLSearchParams();
  if (f.tier) params.set('tier', f.tier);
  params.set('limit', '100');

  const res = await MallanAPI._fetch('/api/crm/performance?' + params.toString());
  if (res.ok) AgentPerformance.indices = res.items;
}

async function loadLeaderboard() {
  const params = new URLSearchParams();
  if (AgentPerformance.filters.tier) params.set('tier', AgentPerformance.filters.tier);
  params.set('limit', '25');

  const res = await MallanAPI._fetch('/api/crm/performance/leaderboard?' + params.toString());
  if (res.ok) AgentPerformance.leaderboard = res.items;
}

// ── Render ──
function renderAgentPerformance() {
  const container = document.getElementById('agent-performance');
  if (!container) return;

  const stats = AgentPerformance.stats;
  const leaderboard = AgentPerformance.leaderboard || [];

  container.innerHTML = `
    <!-- Stats Bar (broker only) -->
    ${stats ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.total_agents || 0}</div>
          <div style="font-size:12px;color:#6b7280;">Active Agents</div>
        </div>
        <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.avg_score || 0}</div>
          <div style="font-size:12px;color:#6b7280;">Avg Performance</div>
        </div>
        ${Object.entries(stats.tier_counts || {}).map(([tier, count]) => {
          const tc = TIER_CONFIG[tier] || TIER_CONFIG.bronze;
          return `<div style="background:${tc.bg};border-radius:8px;padding:16px;border:1px solid ${tc.border};text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${tc.text};">${count}</div>
            <div style="font-size:12px;color:${tc.text};">${tc.icon} ${tc.label}</div>
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    <!-- Filter Bar -->
    <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;align-items:center;">
      <select id="ap-tier-filter" onchange="filterPerformance()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Tiers</option>
        <option value="platinum">Platinum</option>
        <option value="gold">Gold</option>
        <option value="silver">Silver</option>
        <option value="bronze">Bronze</option>
      </select>
      <div style="margin-left:auto;font-size:12px;color:#9ca3af;">Performance index updated weekly</div>
    </div>

    <!-- Leaderboard -->
    <div style="padding:0 24px 24px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">Leaderboard</h3>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px;text-align:left;font-weight:600;">Rank</th>
              <th style="padding:10px 14px;text-align:left;font-weight:600;">Agent</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Score</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Tier</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Contact</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Conversion</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Compliance</th>
              <th style="padding:10px 14px;text-align:center;font-weight:600;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${leaderboard.map(renderLeaderboardRow).join('')}
            ${leaderboard.length === 0 ? '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;">No performance data yet.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top Performers (broker only) -->
    ${stats && stats.top_agents ? `
      <div style="padding:0 24px 24px;">
        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">Top Performers</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${stats.top_agents.map((a, i) => {
            const tc = TIER_CONFIG[a.tier] || TIER_CONFIG.bronze;
            return `<div style="background:${tc.bg};border:1px solid ${tc.border};border-radius:10px;padding:16px;min-width:200px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:${tc.text};">#${a.rank || (i + 1)}</div>
              <div style="font-weight:600;font-size:14px;margin:4px 0;">${a.agent_name || 'Agent'}</div>
              <div style="font-size:24px;font-weight:700;color:${tc.text};">${a.index_score}</div>
              <div style="font-size:12px;color:${tc.text};">${tc.icon} ${tc.label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderLeaderboardRow(entry) {
  const tc = TIER_CONFIG[entry.tier] || TIER_CONFIG.bronze;
  const components = entry.components || {};
  const isSelf = entry.is_self;

  return `
    <tr style="border-bottom:1px solid #f1f5f9;${isSelf ? 'background:#fffbeb;' : ''}" ${entry.agent_id ? `onclick="showAgentDetail('${entry.agent_id}')"` : ''} style="cursor:pointer;">
      <td style="padding:10px 14px;font-weight:700;font-size:16px;">${entry.rank || '-'}</td>
      <td style="padding:10px 14px;">
        <span style="font-weight:600;">${entry.agent_name || 'Anonymous'}</span>
        ${isSelf ? '<span style="background:#fbbf24;color:#854d0e;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">YOU</span>' : ''}
      </td>
      <td style="padding:10px 14px;text-align:center;font-weight:700;font-size:16px;">${entry.index_score}</td>
      <td style="padding:10px 14px;text-align:center;">
        <span style="background:${tc.bg};color:${tc.text};border:1px solid ${tc.border};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${tc.icon} ${tc.label}</span>
      </td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;">${components.time_to_contact ?? '-'}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;">${components.conversion ?? '-'}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;">${components.compliance ?? '-'}</td>
      <td style="padding:10px 14px;text-align:center;">
        <button onclick="event.stopPropagation();showAgentDetail('${entry.agent_id}')" style="background:none;border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Detail</button>
      </td>
    </tr>
  `;
}

// ── Filters ──
async function filterPerformance() {
  AgentPerformance.filters.tier = document.getElementById('ap-tier-filter')?.value || '';
  await Promise.all([loadPerformanceIndices(), loadLeaderboard()]);
  renderAgentPerformance();
}

// ── Agent Detail Modal ──
async function showAgentDetail(agentId) {
  const modal = document.createElement('div');
  modal.id = 'ap-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:650px;max-height:85vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  try {
    const res = await MallanAPI._fetch('/api/crm/performance/' + agentId);
    if (!res.ok) throw new Error(res.error);

    const idx = res.item;
    const metrics = res.monthly_metrics || [];
    const tc = TIER_CONFIG[idx.tier] || TIER_CONFIG.bronze;
    const components = idx.components || {};

    modal.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('ap-detail-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">${idx.agent?.full_name || 'Agent'}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${idx.agent?.email || ''}</div>

      <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="background:${tc.bg};border:1px solid ${tc.border};padding:16px 24px;border-radius:10px;text-align:center;">
          <div style="font-size:36px;font-weight:700;color:${tc.text};">${idx.index_score}</div>
          <div style="font-size:12px;color:${tc.text};">${tc.icon} ${tc.label}</div>
        </div>
        <div style="text-align:center;padding:16px;">
          <div style="font-size:24px;font-weight:700;">#${idx.rank || 'N/A'}</div>
          <div style="font-size:12px;color:#6b7280;">Rank</div>
        </div>
        <div style="text-align:center;padding:16px;">
          <div style="font-size:24px;font-weight:700;">${idx.months_included}</div>
          <div style="font-size:12px;color:#6b7280;">Months</div>
        </div>
      </div>

      <!-- Component Breakdown -->
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Performance Components</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        ${renderComponentBar('Time to Contact', components.time_to_contact)}
        ${renderComponentBar('Conversion', components.conversion)}
        ${renderComponentBar('Closing Speed', components.closing_speed)}
        ${renderComponentBar('Compliance', components.compliance)}
        ${renderComponentBar('Responsiveness', components.responsiveness)}
        ${renderComponentBar('Volume', components.volume)}
      </div>

      <!-- Monthly Metrics -->
      ${metrics.length > 0 ? `
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Monthly Metrics</h3>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr style="background:#f8fafc;">
            <th style="padding:6px 8px;text-align:left;">Month</th>
            <th style="padding:6px 8px;text-align:right;">Deals</th>
            <th style="padding:6px 8px;text-align:right;">Showings</th>
            <th style="padding:6px 8px;text-align:right;">Leads</th>
            <th style="padding:6px 8px;text-align:right;">Response %</th>
            <th style="padding:6px 8px;text-align:right;">Compliance</th>
          </tr>
          ${metrics.map(m => {
            const met = m.metrics || {};
            return `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:6px 8px;">${met.month || new Date(m.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</td>
              <td style="padding:6px 8px;text-align:right;">${met.deals_closed ?? 0}</td>
              <td style="padding:6px 8px;text-align:right;">${met.showings_conducted ?? 0}</td>
              <td style="padding:6px 8px;text-align:right;">${met.leads_contacted ?? 0}</td>
              <td style="padding:6px 8px;text-align:right;">${met.response_rate ?? 0}%</td>
              <td style="padding:6px 8px;text-align:right;">${met.compliance_score ?? 0}%</td>
            </tr>`;
          }).join('')}
        </table>
      ` : '<div style="color:#9ca3af;font-size:13px;">No monthly metrics available yet.</div>'}
    `;
  } catch (err) {
    modal.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load agent detail.</div>';
  }
}

function renderComponentBar(label, value) {
  const v = value ?? 0;
  const color = v >= 80 ? '#059669' : v >= 60 ? '#3b82f6' : v >= 40 ? '#f59e0b' : '#ef4444';
  return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
        <span style="color:#374151;">${label}</span>
        <span style="font-weight:600;">${v}</span>
      </div>
      <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${v}%;background:${color};border-radius:3px;"></div>
      </div>
    </div>
  `;
}

// Expose globally
window.initAgentPerformance = initAgentPerformance;
window.filterPerformance = filterPerformance;
window.showAgentDetail = showAgentDetail;
