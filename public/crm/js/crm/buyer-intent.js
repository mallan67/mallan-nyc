/**
 * Buyer Intent — CRM Module
 *
 * Buyer intent graph visualization, profile cards, intent stages,
 * personalized recommendations, and event recording.
 *
 * Uses MallanAPI._fetch() for all API calls (cookie auth).
 */

/* global MallanAPI */

// ── State ──
const BuyerIntent = {
  profiles: [],
  stats: null,
  currentProfile: null,
  filters: { stage: '', min_strength: '', sort: 'intent_strength', order: 'desc' },
};

// ── Stage Colors ──
const STAGE_COLORS = {
  browsing: { bg: '#f3f4f6', text: '#374151', label: 'Browsing' },
  exploring: { bg: '#dbeafe', text: '#1e40af', label: 'Exploring' },
  comparing: { bg: '#fef9c3', text: '#854d0e', label: 'Comparing' },
  ready: { bg: '#dcfce7', text: '#166534', label: 'Ready to Buy' },
};

// ── Init ──
async function initBuyerIntent() {
  const container = document.getElementById('buyer-intent');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading buyer intent data...</div>';

  try {
    await Promise.all([loadIntentStats(), loadIntentProfiles()]);
    renderBuyerIntent();
  } catch (err) {
    container.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load intent data.</div>';
    console.error('[buyer-intent]', err);
  }
}

async function loadIntentStats() {
  const res = await MallanAPI._fetch('/api/crm/intent/stats');
  if (res.ok) BuyerIntent.stats = res.stats;
}

async function loadIntentProfiles() {
  const f = BuyerIntent.filters;
  const params = new URLSearchParams();
  if (f.stage) params.set('stage', f.stage);
  if (f.min_strength) params.set('min_strength', f.min_strength);
  params.set('sort', f.sort);
  params.set('order', f.order);
  params.set('limit', '100');

  const res = await MallanAPI._fetch('/api/crm/intent/profiles?' + params.toString());
  if (res.ok) BuyerIntent.profiles = res.items;
}

// ── Render ──
function renderBuyerIntent() {
  const container = document.getElementById('buyer-intent');
  if (!container) return;

  const stats = BuyerIntent.stats || {};
  const profiles = BuyerIntent.profiles || [];

  container.innerHTML = `
    <!-- Stats Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.total_profiles || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Tracked Buyers</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#1e293b;">${stats.avg_strength || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Avg Intent Strength</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#166534;">${stats.stage_counts?.ready || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Ready to Buy</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#6b7280;">${stats.events_7d || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Events (7d)</div>
      </div>
    </div>

    <!-- Stage Pipeline -->
    <div style="display:flex;gap:8px;padding:16px 24px;flex-wrap:wrap;">
      ${Object.entries(STAGE_COLORS).map(([stage, c]) => {
        const count = stats.stage_counts?.[stage] || 0;
        return `<div style="background:${c.bg};color:${c.text};padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;" onclick="filterIntentByStage('${stage}')">
          ${c.label}: ${count}
        </div>`;
      }).join('')}
      <div style="background:#f3f4f6;color:#374151;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;" onclick="filterIntentByStage('')">All</div>
    </div>

    <!-- Filter Bar -->
    <div style="display:flex;gap:12px;padding:8px 24px 16px;flex-wrap:wrap;align-items:center;">
      <select id="bi-stage-filter" onchange="filterIntent()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Stages</option>
        <option value="browsing">Browsing</option>
        <option value="exploring">Exploring</option>
        <option value="comparing">Comparing</option>
        <option value="ready">Ready</option>
      </select>
      <input id="bi-min-strength" type="number" placeholder="Min Strength" min="0" max="100" onchange="filterIntent()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:120px;">
      <button onclick="showRecordEventModal()" style="margin-left:auto;background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ Record Event</button>
    </div>

    <!-- Ready Leads Highlight -->
    ${stats.ready_leads && stats.ready_leads.length > 0 ? `
      <div style="padding:0 24px 16px;">
        <h3 style="font-size:14px;font-weight:700;color:#166534;margin-bottom:8px;">Hot Leads — Ready to Buy</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${stats.ready_leads.map(r => `
            <div onclick="showIntentProfile('${r.lead_id}')" style="background:#dcfce7;border:1px solid #86efac;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;">
              <span style="font-weight:600;">${r.lead?.name || 'Unknown'}</span>
              <span style="color:#166534;margin-left:6px;">${r.intent_strength}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Profile Cards -->
    <div style="padding:0 24px 24px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">Intent Profiles (${profiles.length})</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">
        ${profiles.map(renderProfileCard).join('')}
      </div>
      ${profiles.length === 0 ? '<div style="color:#9ca3af;font-size:13px;">No intent profiles found. Events will automatically build profiles.</div>' : ''}
    </div>
  `;
}

function renderProfileCard(profile) {
  const stage = STAGE_COLORS[profile.intent_stage] || STAGE_COLORS.browsing;
  const lead = profile.lead || {};
  const strength = profile.intent_strength || 0;

  return `
    <div onclick="showIntentProfile('${profile.lead_id}')" style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;cursor:pointer;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:600;font-size:14px;color:#1e293b;">${lead.name || 'Unknown Lead'}</span>
        <span style="background:${stage.bg};color:${stage.text};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${stage.label}</span>
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:4px;">
          <span>Intent Strength</span>
          <span style="font-weight:600;">${strength}%</span>
        </div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${strength}%;background:${strength >= 75 ? '#059669' : strength >= 50 ? '#f59e0b' : strength >= 25 ? '#3b82f6' : '#9ca3af'};border-radius:3px;"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#6b7280;">
        ${(profile.preferred_neighborhoods || []).slice(0, 3).map(n => `<span style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${n}</span>`).join('')}
        ${profile.event_count ? `<span style="margin-left:auto;">${profile.event_count} events</span>` : ''}
      </div>
    </div>
  `;
}

// ── Filters ──
async function filterIntent() {
  const f = BuyerIntent.filters;
  f.stage = document.getElementById('bi-stage-filter')?.value || '';
  f.min_strength = document.getElementById('bi-min-strength')?.value || '';
  await loadIntentProfiles();
  renderBuyerIntent();
}

function filterIntentByStage(stage) {
  BuyerIntent.filters.stage = stage;
  const sel = document.getElementById('bi-stage-filter');
  if (sel) sel.value = stage;
  filterIntent();
}

// ── Profile Detail Modal ──
async function showIntentProfile(leadId) {
  const modal = document.createElement('div');
  modal.id = 'bi-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:650px;max-height:85vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  try {
    const [profileRes, recsRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/intent/profiles/' + leadId),
      MallanAPI._fetch('/api/crm/intent/recommendations/' + leadId),
    ]);

    if (!profileRes.ok) throw new Error(profileRes.error);

    const p = profileRes.item;
    const events = profileRes.events || [];
    const recs = recsRes.ok ? recsRes.items : [];
    const stage = STAGE_COLORS[p.intent_stage] || STAGE_COLORS.browsing;
    const lead = p.lead || {};

    modal.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('bi-detail-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">${lead.name || 'Unknown Lead'}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${lead.email || ''} ${lead.phone ? '| ' + lead.phone : ''}</div>

      <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:36px;font-weight:700;color:#1e293b;">${p.intent_strength}</div>
          <div style="font-size:12px;color:#6b7280;">Intent Strength</div>
        </div>
        <div style="text-align:center;">
          <div style="background:${stage.bg};color:${stage.text};padding:6px 16px;border-radius:20px;font-size:14px;font-weight:600;">${stage.label}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Stage</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#6b7280;">${p.event_count || 0}</div>
          <div style="font-size:12px;color:#6b7280;">Events</div>
        </div>
      </div>

      <!-- Preferences -->
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Preferences</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px;">
        <div><span style="color:#6b7280;">Price Range:</span> ${p.price_min ? '$' + Number(p.price_min).toLocaleString() : '?'} - ${p.price_max ? '$' + Number(p.price_max).toLocaleString() : '?'}</div>
        <div><span style="color:#6b7280;">Beds:</span> ${(p.preferred_beds || []).join(', ') || 'Any'}</div>
        <div><span style="color:#6b7280;">Types:</span> ${(p.preferred_types || []).join(', ') || 'Any'}</div>
        <div><span style="color:#6b7280;">Boroughs:</span> ${(p.preferred_boroughs || []).join(', ') || 'Any'}</div>
      </div>
      <div style="margin-bottom:16px;">
        <span style="color:#6b7280;font-size:13px;">Neighborhoods:</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
          ${(p.preferred_neighborhoods || []).map(n => `<span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px;">${n}</span>`).join('')}
          ${(p.preferred_neighborhoods || []).length === 0 ? '<span style="font-size:12px;color:#9ca3af;">None specified</span>' : ''}
        </div>
      </div>

      <!-- Recommendations -->
      ${recs.length > 0 ? `
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Recommended Listings (${recs.length})</h3>
        <div style="max-height:200px;overflow-y:auto;margin-bottom:16px;">
          ${recs.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
              <div>
                <span style="font-weight:600;">${r.address || r.listing_id}</span>
                <div style="font-size:11px;color:#6b7280;">${(r.match_reasons || []).join(' | ')}</div>
              </div>
              <span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">${r.score}%</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Recent Events -->
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Recent Events (${events.length})</h3>
      <div style="max-height:200px;overflow-y:auto;">
        ${events.slice(0, 30).map(e => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
            <span style="font-weight:500;">${e.event_type?.replace(/_/g, ' ')}</span>
            <span style="color:#6b7280;">${new Date(e.recorded_at).toLocaleDateString()}</span>
          </div>
        `).join('')}
        ${events.length === 0 ? '<div style="color:#9ca3af;font-size:12px;">No events recorded.</div>' : ''}
      </div>

      <div style="margin-top:16px;text-align:right;">
        <button onclick="recomputeProfile('${leadId}')" style="background:#3b82f6;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Recompute Profile</button>
      </div>
    `;
  } catch (err) {
    modal.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load intent profile.</div>';
  }
}

async function recomputeProfile(leadId) {
  try {
    const res = await MallanAPI._fetch('/api/crm/intent/profiles/' + leadId, { method: 'POST' });
    if (res.ok) {
      document.getElementById('bi-detail-modal')?.remove();
      await loadIntentProfiles();
      renderBuyerIntent();
    } else {
      alert(res.error || 'Failed to recompute');
    }
  } catch (err) {
    alert('Failed to recompute profile');
  }
}

// ── Record Event Modal ──
function showRecordEventModal() {
  const modal = document.createElement('div');
  modal.id = 'bi-event-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:420px;padding:24px;position:relative;">
      <button onclick="document.getElementById('bi-event-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Record Intent Event</h2>
      <div style="margin-bottom:12px;">
        <label for="bi-event-lead" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Lead ID</label>
        <input id="bi-event-lead" type="text" placeholder="Lead ID" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </div>
      <div style="margin-bottom:12px;">
        <label for="bi-event-type" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Event Type</label>
        <select id="bi-event-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
          <option value="search_query">Search Query</option>
          <option value="page_view">Page View</option>
          <option value="favorite">Favorite</option>
          <option value="map_interaction">Map Interaction</option>
          <option value="inquiry">Inquiry</option>
          <option value="showing_request">Showing Request</option>
          <option value="filter_change">Filter Change</option>
        </select>
      </div>
      <div style="margin-bottom:16px;">
        <label for="bi-event-payload" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Payload (JSON, optional)</label>
        <textarea id="bi-event-payload" rows="3" placeholder='{"neighborhood":"Upper East Side","beds":2}' style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:monospace;"></textarea>
      </div>
      <button onclick="recordIntentEvent()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Record Event</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function recordIntentEvent() {
  const lead_id = document.getElementById('bi-event-lead')?.value?.trim();
  const event_type = document.getElementById('bi-event-type')?.value;
  const payloadStr = document.getElementById('bi-event-payload')?.value?.trim();

  if (!lead_id) { alert('Lead ID is required'); return; }

  let payload = undefined;
  if (payloadStr) {
    try { payload = JSON.parse(payloadStr); }
    catch { alert('Invalid JSON payload'); return; }
  }

  try {
    const res = await MallanAPI._fetch('/api/crm/intent/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id, event_type, payload }),
    });
    if (res.ok) {
      document.getElementById('bi-event-modal')?.remove();
      await loadIntentProfiles();
      renderBuyerIntent();
    } else {
      alert(res.error || 'Failed to record event');
    }
  } catch (err) {
    alert('Failed to record event');
  }
}

// Expose globally
window.initBuyerIntent = initBuyerIntent;
window.filterIntent = filterIntent;
window.filterIntentByStage = filterIntentByStage;
window.showIntentProfile = showIntentProfile;
window.recomputeProfile = recomputeProfile;
window.showRecordEventModal = showRecordEventModal;
window.recordIntentEvent = recordIntentEvent;
