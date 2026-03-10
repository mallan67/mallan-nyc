/**
 * Seller Outreach — CRM Module
 *
 * Predictive Seller Readiness kanban board, lead detail modal,
 * outreach logging, and KPI dashboard for the CRM.
 *
 * Uses MallanAPI._fetch() for all API calls (cookie auth).
 */

/* global MallanAPI */

// ── State ──
const SellerOutreach = {
  leads: [],
  stats: null,
  currentLead: null,
  filters: { status: '', grade: '', sort: 'readiness_score', order: 'desc' },
  templates: [],
};

// ── Templates (loaded from config) ──
const OUTREACH_TEMPLATES = [
  {
    id: 'intro_letter',
    name: 'Introduction Letter',
    channel: 'letter',
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name', 'agent_phone'],
  },
  {
    id: 'market_update',
    name: 'Market Update Email',
    channel: 'email',
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
  {
    id: 'renovation_followup',
    name: 'Post-Renovation Follow-up',
    channel: 'email',
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
  {
    id: 'cma_followup',
    name: 'CMA Request Follow-up',
    channel: 'email',
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name', 'agent_phone'],
  },
  {
    id: 'long_term_owner',
    name: 'Long-Term Owner Outreach',
    channel: 'letter',
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
];

// ── Grade Colors ──
const GRADE_COLORS = {
  A: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  B: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  C: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  D: { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' },
  F: { bg: '#fecaca', text: '#991b1b', border: '#fca5a5' },
};

// ── Status Labels ──
const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  signed: 'Signed',
  declined: 'Declined',
};

const STATUS_COLORS = {
  new: '#6366f1',
  contacted: '#f59e0b',
  replied: '#10b981',
  meeting: '#8b5cf6',
  signed: '#059669',
  declined: '#ef4444',
};

// ══════════════════════════════════════════════════════════
// API Calls
// ══════════════════════════════════════════════════════════

async function fetchSellerLeads() {
  const params = new URLSearchParams();
  if (SellerOutreach.filters.status) params.set('status', SellerOutreach.filters.status);
  if (SellerOutreach.filters.grade) params.set('grade', SellerOutreach.filters.grade);
  params.set('sort', SellerOutreach.filters.sort);
  params.set('order', SellerOutreach.filters.order);
  params.set('limit', '100');

  const res = await MallanAPI._fetch(`/api/crm/seller-leads?${params}`);
  if (res.ok) {
    SellerOutreach.leads = res.items;
  }
  return res;
}

async function fetchSellerLeadDetail(id) {
  const res = await MallanAPI._fetch(`/api/crm/seller-leads/${id}`);
  if (res.ok) {
    SellerOutreach.currentLead = res.item;
  }
  return res;
}

async function createSellerLead(data) {
  return MallanAPI._fetch('/api/crm/seller-leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function updateSellerLead(id, data) {
  return MallanAPI._fetch(`/api/crm/seller-leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function scoreSellerLead(id) {
  return MallanAPI._fetch('/api/crm/seller-leads/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seller_lead_id: id }),
  });
}

async function logOutreachEvent(leadId, data) {
  return MallanAPI._fetch(`/api/crm/seller-leads/${leadId}/outreach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function fetchSellerStats() {
  const res = await MallanAPI._fetch('/api/crm/seller-leads/stats');
  if (res.ok) {
    SellerOutreach.stats = res.stats;
  }
  return res;
}

// ══════════════════════════════════════════════════════════
// Render Functions
// ══════════════════════════════════════════════════════════

/**
 * Initialize the seller outreach tab. Called when tab is shown.
 */
async function initSellerOutreach() {
  const container = document.getElementById('seller-outreach-content');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Loading seller leads...</div>';

  await Promise.all([fetchSellerLeads(), fetchSellerStats()]);
  renderSellerOutreach();
}

function renderSellerOutreach() {
  const container = document.getElementById('seller-outreach-content');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">
      ${renderStatsBar()}
      ${renderFiltersBar()}
      ${renderKanbanBoard()}
    </div>
  `;

  attachSellerOutreachListeners();
}

function renderStatsBar() {
  const s = SellerOutreach.stats;
  if (!s) return '';

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
      <div class="stat-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1a1a1a;">${s.total_leads}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Total Leads</div>
      </div>
      <div class="stat-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#059669;">${s.avg_score}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Avg Score</div>
      </div>
      <div class="stat-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#6366f1;">${s.by_grade.A + s.by_grade.B}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">A+B Leads</div>
      </div>
      <div class="stat-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#f59e0b;">${s.outreach_30d}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Outreach (30d)</div>
      </div>
      <div class="stat-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#059669;">${s.by_status.signed || 0}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Signed</div>
      </div>
    </div>
  `;
}

function renderFiltersBar() {
  return `
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <select id="so-filter-status" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Statuses</option>
        ${Object.entries(STATUS_LABELS).map(([k, v]) =>
          `<option value="${k}" ${SellerOutreach.filters.status === k ? 'selected' : ''}>${v}</option>`
        ).join('')}
      </select>
      <select id="so-filter-grade" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Grades</option>
        ${['A', 'B', 'C', 'D', 'F'].map(g =>
          `<option value="${g}" ${SellerOutreach.filters.grade === g ? 'selected' : ''}>${g}</option>`
        ).join('')}
      </select>
      <div style="flex:1;"></div>
      <button id="so-add-lead-btn" style="padding:8px 16px;background:#C4A052;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
        + Add Lead
      </button>
      <button id="so-batch-score-btn" style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
        Re-Score All
      </button>
    </div>
  `;
}

function renderKanbanBoard() {
  const statuses = ['new', 'contacted', 'replied', 'meeting', 'signed', 'declined'];
  const leadsByStatus = {};
  for (const s of statuses) leadsByStatus[s] = [];
  for (const lead of SellerOutreach.leads) {
    if (leadsByStatus[lead.status]) leadsByStatus[lead.status].push(lead);
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;overflow-x:auto;min-width:900px;">
      ${statuses.map(status => `
        <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;min-height:200px;">
          <div style="padding:12px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:${STATUS_COLORS[status]};">
              ${STATUS_LABELS[status]}
            </span>
            <span style="font-size:11px;color:#94a3b8;background:#f1f5f9;padding:2px 8px;border-radius:10px;">
              ${leadsByStatus[status].length}
            </span>
          </div>
          <div style="padding:8px;display:flex;flex-direction:column;gap:8px;">
            ${leadsByStatus[status].map(lead => renderLeadCard(lead)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLeadCard(lead) {
  const grade = GRADE_COLORS[lead.score_grade] || GRADE_COLORS.F;

  return `
    <div class="so-lead-card" data-lead-id="${lead.id}"
         style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px;cursor:pointer;transition:box-shadow 0.15s;"
         onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
         onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
        <div style="font-size:12px;font-weight:600;color:#1a1a1a;line-height:1.3;max-width:80%;">
          ${escapeForHtml(lead.address)}${lead.unit ? ` #${escapeForHtml(lead.unit)}` : ''}
        </div>
        <div style="background:${grade.bg};color:${grade.text};border:1px solid ${grade.border};font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;">
          ${lead.score_grade}
        </div>
      </div>
      ${lead.owner_name ? `<div style="font-size:11px;color:#64748b;">${escapeForHtml(lead.owner_name)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <div style="font-size:11px;color:#94a3b8;">${lead.neighborhood || lead.borough || ''}</div>
        <div style="font-size:18px;font-weight:700;color:${grade.text};">${lead.readiness_score}</div>
      </div>
    </div>
  `;
}

// ── Lead Detail Modal ──

async function openLeadDetailModal(leadId) {
  await fetchSellerLeadDetail(leadId);
  const lead = SellerOutreach.currentLead;
  if (!lead) return;

  const grade = GRADE_COLORS[lead.score_grade] || GRADE_COLORS.F;

  const modal = document.createElement('div');
  modal.id = 'so-lead-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:700px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="padding:20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;">
            ${escapeForHtml(lead.address)}${lead.unit ? ` #${escapeForHtml(lead.unit)}` : ''}
          </h3>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            ${lead.neighborhood || ''} ${lead.borough || ''} ${lead.postal_code || ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="background:${grade.bg};color:${grade.text};border:1px solid ${grade.border};padding:4px 12px;border-radius:6px;font-weight:700;">
            ${lead.score_grade} — ${lead.readiness_score}/100
          </div>
          <button id="so-close-modal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">&times;</button>
        </div>
      </div>

      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <!-- Owner Info -->
        <div>
          <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Owner</h4>
          <div style="font-size:13px;color:#1a1a1a;">${escapeForHtml(lead.owner_name || 'Unknown')}</div>
          ${lead.owner_email ? `<div style="font-size:12px;color:#6366f1;">${escapeForHtml(lead.owner_email)}</div>` : ''}
          ${lead.owner_phone ? `<div style="font-size:12px;color:#64748b;">${escapeForHtml(lead.owner_phone)}</div>` : ''}
        </div>

        <!-- Status / Assignment -->
        <div>
          <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Pipeline</h4>
          <select id="so-status-select" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;width:100%;">
            ${Object.entries(STATUS_LABELS).map(([k, v]) =>
              `<option value="${k}" ${lead.status === k ? 'selected' : ''}>${v}</option>`
            ).join('')}
          </select>
          ${lead.consent_given
            ? `<div style="font-size:11px;color:#059669;margin-top:4px;">Consent given ${lead.consent_date ? new Date(lead.consent_date).toLocaleDateString() : ''}</div>`
            : `<div style="font-size:11px;color:#ef4444;margin-top:4px;">No consent on file</div>`
          }
        </div>
      </div>

      <!-- Signals -->
      <div style="padding:0 20px 20px;">
        <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Readiness Signals</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
          ${(lead.signals || []).map(sig => {
            const pct = Math.round(sig.normalized * 100);
            return `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:600;color:#374151;text-transform:capitalize;">
                  ${sig.signal_type.replace(/_/g, ' ')}
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                  <div style="flex:1;height:4px;background:#e2e8f0;border-radius:2px;">
                    <div style="height:100%;width:${pct}%;background:${pct > 70 ? '#059669' : pct > 40 ? '#f59e0b' : '#94a3b8'};border-radius:2px;"></div>
                  </div>
                  <span style="font-size:11px;font-weight:600;color:#374151;">${pct}%</span>
                </div>
                ${sig.raw_value ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${escapeForHtml(sig.raw_value)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <button id="so-rescore-btn" data-id="${lead.id}" style="margin-top:8px;padding:6px 12px;background:#6366f1;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">
          Re-Score Now
        </button>
      </div>

      <!-- Outreach History -->
      <div style="padding:0 20px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0;">Outreach History</h4>
          <button id="so-log-outreach-btn" data-id="${lead.id}" style="padding:4px 10px;background:#C4A052;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">
            + Log Outreach
          </button>
        </div>
        ${(lead.outreach_events || []).length === 0
          ? '<div style="font-size:12px;color:#94a3b8;padding:12px 0;">No outreach logged yet</div>'
          : `<div style="display:flex;flex-direction:column;gap:6px;">
              ${lead.outreach_events.map(e => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:4px;border:1px solid #e2e8f0;">
                  <span style="font-size:11px;font-weight:600;color:#374151;text-transform:capitalize;min-width:60px;">${e.channel}</span>
                  <span style="font-size:11px;color:#64748b;flex:1;">${e.subject || e.template_id || '—'}</span>
                  <span style="font-size:10px;color:#94a3b8;">${new Date(e.created_at).toLocaleDateString()}</span>
                  <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${e.outcome === 'replied' ? '#dcfce7' : '#f1f5f9'};color:${e.outcome === 'replied' ? '#166534' : '#64748b'};">${e.outcome || 'sent'}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      <!-- Notes -->
      <div style="padding:0 20px 20px;">
        <h4 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Notes</h4>
        <textarea id="so-notes" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;resize:vertical;box-sizing:border-box;">${escapeForHtml(lead.notes || '')}</textarea>
        <button id="so-save-notes" data-id="${lead.id}" style="margin-top:4px;padding:4px 10px;background:#374151;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">
          Save Notes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  attachLeadModalListeners(lead);
}

function attachLeadModalListeners(lead) {
  document.getElementById('so-close-modal')?.addEventListener('click', () => {
    document.getElementById('so-lead-modal')?.remove();
  });

  document.getElementById('so-lead-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'so-lead-modal') e.target.remove();
  });

  document.getElementById('so-status-select')?.addEventListener('change', async (e) => {
    await updateSellerLead(lead.id, { status: e.target.value });
    await fetchSellerLeads();
    renderSellerOutreach();
  });

  document.getElementById('so-rescore-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('so-rescore-btn');
    btn.textContent = 'Scoring...';
    btn.disabled = true;
    await scoreSellerLead(lead.id);
    document.getElementById('so-lead-modal')?.remove();
    await Promise.all([fetchSellerLeads(), fetchSellerStats()]);
    renderSellerOutreach();
    openLeadDetailModal(lead.id);
  });

  document.getElementById('so-save-notes')?.addEventListener('click', async () => {
    const notes = document.getElementById('so-notes')?.value || '';
    await updateSellerLead(lead.id, { notes });
  });

  document.getElementById('so-log-outreach-btn')?.addEventListener('click', () => {
    openOutreachModal(lead.id);
  });
}

// ── Outreach Logging Modal ──

function openOutreachModal(leadId) {
  const modal = document.createElement('div');
  modal.id = 'so-outreach-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:10px;max-width:450px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;">
      <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;">Log Outreach</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label for="so-out-channel" style="font-size:11px;font-weight:600;color:#64748b;">Channel</label>
          <select id="so-out-channel" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            <option value="email">Email</option>
            <option value="letter">Letter</option>
            <option value="phone">Phone</option>
            <option value="door_knock">Door Knock</option>
          </select>
        </div>
        <div>
          <label for="so-out-template" style="font-size:11px;font-weight:600;color:#64748b;">Template</label>
          <select id="so-out-template" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            <option value="">None (custom)</option>
            ${OUTREACH_TEMPLATES.map(t => `<option value="${t.id}">${t.name} (${t.channel})</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="so-out-subject" style="font-size:11px;font-weight:600;color:#64748b;">Subject</label>
          <input id="so-out-subject" type="text" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-out-outcome" style="font-size:11px;font-weight:600;color:#64748b;">Outcome</label>
          <select id="so-out-outcome" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
            <option value="declined">Declined</option>
          </select>
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;">
            <input id="so-out-consent" type="checkbox"> Consent verified (TCPA)
          </label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button id="so-out-cancel" style="padding:6px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">Cancel</button>
          <button id="so-out-save" style="padding:6px 14px;background:#C4A052;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Log Outreach</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('so-out-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  document.getElementById('so-out-save')?.addEventListener('click', async () => {
    const data = {
      channel: document.getElementById('so-out-channel').value,
      template_id: document.getElementById('so-out-template').value || undefined,
      subject: document.getElementById('so-out-subject').value || undefined,
      outcome: document.getElementById('so-out-outcome').value,
      consent_verified: document.getElementById('so-out-consent').checked,
    };

    const res = await logOutreachEvent(leadId, data);
    if (!res.ok) {
      window.alert(res.error || 'Failed to log outreach');
      return;
    }

    modal.remove();
    // Refresh the lead detail modal
    document.getElementById('so-lead-modal')?.remove();
    await Promise.all([fetchSellerLeads(), fetchSellerStats()]);
    renderSellerOutreach();
    openLeadDetailModal(leadId);
  });
}

// ── Add Lead Modal ──

function openAddLeadModal() {
  const modal = document.createElement('div');
  modal.id = 'so-add-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:10px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:24px;">
      <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;">Add Seller Lead</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="grid-column:span 2;">
          <label for="so-add-address" style="font-size:11px;font-weight:600;color:#64748b;">Address *</label>
          <input id="so-add-address" type="text" placeholder="123 Main St" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-unit" style="font-size:11px;font-weight:600;color:#64748b;">Unit</label>
          <input id="so-add-unit" type="text" placeholder="4A" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-borough" style="font-size:11px;font-weight:600;color:#64748b;">Borough</label>
          <select id="so-add-borough" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;">
            <option value="">Select</option>
            <option value="Manhattan">Manhattan</option>
            <option value="Brooklyn">Brooklyn</option>
            <option value="Queens">Queens</option>
            <option value="Bronx">Bronx</option>
            <option value="Staten Island">Staten Island</option>
          </select>
        </div>
        <div>
          <label for="so-add-neighborhood" style="font-size:11px;font-weight:600;color:#64748b;">Neighborhood</label>
          <input id="so-add-neighborhood" type="text" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-zip" style="font-size:11px;font-weight:600;color:#64748b;">ZIP</label>
          <input id="so-add-zip" type="text" maxlength="5" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-bbl" style="font-size:11px;font-weight:600;color:#64748b;">BBL (10-digit)</label>
          <input id="so-add-bbl" type="text" maxlength="10" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-bin" style="font-size:11px;font-weight:600;color:#64748b;">BIN</label>
          <input id="so-add-bin" type="text" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div style="grid-column:span 2;">
          <label for="so-add-owner" style="font-size:11px;font-weight:600;color:#64748b;">Owner Name</label>
          <input id="so-add-owner" type="text" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-email" style="font-size:11px;font-weight:600;color:#64748b;">Owner Email</label>
          <input id="so-add-email" type="email" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
        <div>
          <label for="so-add-phone" style="font-size:11px;font-weight:600;color:#64748b;">Owner Phone</label>
          <input id="so-add-phone" type="tel" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;box-sizing:border-box;">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button id="so-add-cancel" style="padding:6px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">Cancel</button>
        <button id="so-add-save" style="padding:6px 14px;background:#C4A052;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Create Lead</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('so-add-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  document.getElementById('so-add-save')?.addEventListener('click', async () => {
    const address = document.getElementById('so-add-address').value.trim();
    if (!address) { window.alert('Address is required'); return; }

    const data = {
      address,
      unit: document.getElementById('so-add-unit').value.trim() || undefined,
      borough: document.getElementById('so-add-borough').value || undefined,
      neighborhood: document.getElementById('so-add-neighborhood').value.trim() || undefined,
      postal_code: document.getElementById('so-add-zip').value.trim() || undefined,
      bbl: document.getElementById('so-add-bbl').value.trim() || undefined,
      bin: document.getElementById('so-add-bin').value.trim() || undefined,
      owner_name: document.getElementById('so-add-owner').value.trim() || undefined,
      owner_email: document.getElementById('so-add-email').value.trim() || undefined,
      owner_phone: document.getElementById('so-add-phone').value.trim() || undefined,
    };

    const res = await createSellerLead(data);
    if (!res.ok) {
      window.alert(res.error || 'Failed to create lead');
      return;
    }

    modal.remove();

    // Auto-score the new lead
    if (data.bbl) {
      await scoreSellerLead(res.item.id);
    }

    await Promise.all([fetchSellerLeads(), fetchSellerStats()]);
    renderSellerOutreach();
  });
}

// ── Event Listeners ──

function attachSellerOutreachListeners() {
  // Filter changes
  document.getElementById('so-filter-status')?.addEventListener('change', async (e) => {
    SellerOutreach.filters.status = e.target.value;
    await fetchSellerLeads();
    renderSellerOutreach();
  });

  document.getElementById('so-filter-grade')?.addEventListener('change', async (e) => {
    SellerOutreach.filters.grade = e.target.value;
    await fetchSellerLeads();
    renderSellerOutreach();
  });

  // Add lead
  document.getElementById('so-add-lead-btn')?.addEventListener('click', openAddLeadModal);

  // Batch score
  document.getElementById('so-batch-score-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('so-batch-score-btn');
    btn.textContent = 'Scoring...';
    btn.disabled = true;
    await MallanAPI._fetch('/api/crm/seller-leads/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: true }),
    });
    await Promise.all([fetchSellerLeads(), fetchSellerStats()]);
    renderSellerOutreach();
  });

  // Lead card clicks
  document.querySelectorAll('.so-lead-card').forEach(card => {
    card.addEventListener('click', () => {
      openLeadDetailModal(card.dataset.leadId);
    });
  });
}

// ── Utility ──

function escapeForHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
