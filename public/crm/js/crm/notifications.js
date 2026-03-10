/**
 * Notifications — CRM Module
 * In-app notification center with preferences.
 */
/* global MallanAPI */

const NotificationCenter = { notifications: [], unread: 0, prefs: null };

async function initNotifications() {
  const c = document.getElementById('notification-center');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading notifications...</div>';
  try {
    const [notifRes, prefRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/notifications?limit=50'),
      MallanAPI._fetch('/api/crm/notifications/preferences'),
    ]);
    if (notifRes.ok) { NotificationCenter.notifications = notifRes.items; NotificationCenter.unread = notifRes.unread; }
    if (prefRes.ok) NotificationCenter.prefs = prefRes.item;
    renderNotifications();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load notifications.</div>'; }
}

function renderNotifications() {
  const c = document.getElementById('notification-center');
  if (!c) return;
  const notifs = NotificationCenter.notifications;
  const prefs = NotificationCenter.prefs || {};

  c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #e2e8f0;">
      <div>
        <span style="font-size:14px;font-weight:600;">${NotificationCenter.unread} unread</span>
        <span style="font-size:13px;color:#6b7280;margin-left:12px;">${notifs.length} total</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="markAllNotificationsRead()" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;">Mark All Read</button>
        <button onclick="showNotifPrefsModal()" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;">Preferences</button>
      </div>
    </div>
    <div style="padding:0 24px 24px;max-height:600px;overflow-y:auto;">
      ${notifs.map(n => `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;${!n.read_at ? 'background:#fffbeb;margin:0 -12px;padding-left:12px;padding-right:12px;border-radius:4px;' : ''}" onclick="markNotifRead('${n.id}')">
          <div style="min-width:8px;height:8px;border-radius:50%;margin-top:6px;background:${!n.read_at ? '#C4A052' : 'transparent'};"></div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;color:#1e293b;">${n.title}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${n.body}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${new Date(n.created_at).toLocaleString()} | ${n.type.replace(/_/g, ' ')}</div>
          </div>
        </div>
      `).join('')}
      ${notifs.length === 0 ? '<div style="padding:24px;text-align:center;color:#9ca3af;">No notifications.</div>' : ''}
    </div>
  `;
}

async function markNotifRead(id) {
  await MallanAPI._fetch('/api/crm/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  await initNotifications();
}

async function markAllNotificationsRead() {
  await MallanAPI._fetch('/api/crm/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_all_read' }) });
  await initNotifications();
}

function showNotifPrefsModal() {
  const p = NotificationCenter.prefs || {};
  const m = document.createElement('div');
  m.id = 'notif-prefs-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:400px;padding:24px;position:relative;">
    <button onclick="document.getElementById('notif-prefs-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Notification Preferences</h2>
    ${[['new_match','New Listing Matches'], ['price_drop','Price Drops'], ['showing_updates','Showing Updates'], ['offer_updates','Offer Updates']].map(([k, l]) =>
      `<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;cursor:pointer;"><input type="checkbox" id="pref-${k}" ${p[k] !== false ? 'checked' : ''}> ${l}</label>`
    ).join('')}
    <div style="margin:12px 0;">
      <label for="pref-email-digest" style="font-size:12px;font-weight:600;">Email Digest</label>
      <select id="pref-email-digest" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-top:4px;">
        ${['none','instant','daily','weekly'].map(v => `<option value="${v}" ${p.email_digest === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;cursor:pointer;"><input type="checkbox" id="pref-sms" ${p.sms_enabled ? 'checked' : ''}> SMS Notifications (TCPA consent required)</label>
    <button onclick="saveNotifPrefs()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Save</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function saveNotifPrefs() {
  const data = {
    new_match: document.getElementById('pref-new_match')?.checked,
    price_drop: document.getElementById('pref-price_drop')?.checked,
    showing_updates: document.getElementById('pref-showing_updates')?.checked,
    offer_updates: document.getElementById('pref-offer_updates')?.checked,
    email_digest: document.getElementById('pref-email-digest')?.value,
    sms_enabled: document.getElementById('pref-sms')?.checked,
  };
  await MallanAPI._fetch('/api/crm/notifications/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  document.getElementById('notif-prefs-modal')?.remove();
  await initNotifications();
}

window.initNotifications = initNotifications;
window.initNotificationCenter = initNotifications;
window.markNotifRead = markNotifRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.showNotifPrefsModal = showNotifPrefsModal;
window.saveNotifPrefs = saveNotifPrefs;
