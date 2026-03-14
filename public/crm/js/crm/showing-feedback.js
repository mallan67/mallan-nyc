/**
 * Showing Feedback — CRM Module
 * Post-showing feedback collection with intent bridge.
 */
/* global MallanAPI */

const ShowingFeedback = { showings: [] };

const INTEREST_LABELS = {
  not_interested: { label: 'Not Interested', color: '#ef4444' },
  neutral: { label: 'Neutral', color: '#6b7280' },
  interested: { label: 'Interested', color: '#3b82f6' },
  very_interested: { label: 'Very Interested', color: '#059669' },
  ready_to_offer: { label: 'Ready to Offer', color: '#7c3aed' },
};

async function initShowingFeedback() {
  const c = document.getElementById('showing-feedback');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading showings...</div>';
  try {
    const res = await MallanAPI._fetch('/api/crm/showings?status=completed&limit=50');
    if (res.ok) ShowingFeedback.showings = res.items || [];
    renderShowingFeedback();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load showings.</div>'; }
}

function renderShowingFeedback() {
  const c = document.getElementById('showing-feedback');
  if (!c) return;
  const showings = ShowingFeedback.showings;

  c.innerHTML = `
    <div style="padding:16px 24px;font-size:13px;color:#6b7280;">${showings.length} completed showings</div>
    <div style="padding:0 24px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Date</th>
          <th style="padding:8px 12px;text-align:left;">Property</th>
          <th style="padding:8px 12px;text-align:left;">Client</th>
          <th style="padding:8px 12px;text-align:center;">Rating</th>
          <th style="padding:8px 12px;text-align:center;">Interest</th>
          <th style="padding:8px 12px;text-align:center;">Actions</th>
        </tr></thead>
        <tbody>
          ${showings.map(s => {
            const fb = s.feedback;
            const il = fb ? INTEREST_LABELS[fb.interest_level] || INTEREST_LABELS.neutral : null;
            return `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:8px 12px;">${new Date(s.date).toLocaleDateString()}</td>
              <td style="padding:8px 12px;">${s.listing?.address || s.listing_id || '-'}</td>
              <td style="padding:8px 12px;">${s.lead?.first_name || ''} ${s.lead?.last_name || ''}</td>
              <td style="padding:8px 12px;text-align:center;">${fb ? '&#9733;'.repeat(fb.rating) : '-'}</td>
              <td style="padding:8px 12px;text-align:center;">${il ? `<span style="color:${il.color};font-weight:600;">${il.label}</span>` : '-'}</td>
              <td style="padding:8px 12px;text-align:center;">
                <button onclick="showFeedbackModal('${s.id}')" style="background:none;border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">${fb ? 'Edit' : 'Add'} Feedback</button>
              </td>
            </tr>`;
          }).join('')}
          ${showings.length === 0 ? '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">No completed showings.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

function showFeedbackModal(showingId) {
  const m = document.createElement('div');
  m.id = 'fb-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:450px;padding:24px;position:relative;">
    <button onclick="document.getElementById('fb-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Showing Feedback</h2>
    <div style="margin-bottom:12px;">
      <label for="fb-rating" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Rating (1-5)</label>
      <input id="fb-rating" type="number" min="1" max="5" value="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
    </div>
    <div style="margin-bottom:12px;">
      <label for="fb-interest" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Interest Level</label>
      <select id="fb-interest" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        ${Object.entries(INTEREST_LABELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:12px;">
      <label for="fb-liked" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">What They Liked</label>
      <input id="fb-liked" type="text" placeholder="layout, light, location (comma-separated)" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
    </div>
    <div style="margin-bottom:12px;">
      <label for="fb-disliked" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">What They Disliked</label>
      <input id="fb-disliked" type="text" placeholder="size, price, condition" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
    </div>
    <div style="margin-bottom:12px;">
      <label for="fb-notes" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Notes</label>
      <textarea id="fb-notes" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"></textarea>
    </div>
    <button onclick="submitFeedback('${showingId}')" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Submit Feedback</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function submitFeedback(showingId) {
  const data = {
    rating: parseInt(document.getElementById('fb-rating')?.value) || 3,
    interest_level: document.getElementById('fb-interest')?.value || 'neutral',
    liked: (document.getElementById('fb-liked')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    disliked: (document.getElementById('fb-disliked')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    notes: document.getElementById('fb-notes')?.value || '',
  };
  try {
    const res = await MallanAPI._fetch('/api/crm/showings/' + showingId + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { document.getElementById('fb-modal')?.remove(); await initShowingFeedback(); }
    else alert(res.error || 'Failed');
  } catch { alert('Failed to submit feedback'); }
}

window.initShowingFeedback = initShowingFeedback;
window.showFeedbackModal = showFeedbackModal;
window.submitFeedback = submitFeedback;
