/**
 * Follow-Up Tasks — CRM Module
 * Agent task management: reminders, follow-ups, renewals, conversions.
 */
/* global MallanAPI, showToast */

async function initAgentTasks() {
  var c = document.getElementById('agent-tasks');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading tasks...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/tasks?status=all&limit=100');
    if (!res.tasks) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load tasks.</div>'; return; }
    renderAgentTasks(c, res.tasks, res.stats);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load tasks.</div>';
  }
}

function renderAgentTasks(container, tasks, stats) {
  var overdue = tasks.filter(function(t) { return t.status === 'overdue'; });
  var today = tasks.filter(function(t) {
    var d = new Date(t.due_date);
    return d.toDateString() === new Date().toDateString() && t.status === 'pending';
  });
  var upcoming = tasks.filter(function(t) { return t.status === 'pending' && !today.includes(t) && t.status !== 'overdue'; });
  var completed = tasks.filter(function(t) { return t.status === 'completed'; });

  var typeIcons = {
    follow_up: 'fa-phone', call: 'fa-phone-alt', email: 'fa-envelope', showing: 'fa-calendar',
    meeting: 'fa-handshake', review: 'fa-clipboard-check', renewal_check: 'fa-sync', buyer_conversion: 'fa-exchange-alt'
  };

  function renderTaskList(items, emptyMsg) {
    if (items.length === 0) return '<p style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">' + emptyMsg + '</p>';
    return items.map(function(t) {
      var icon = typeIcons[t.task_type] || 'fa-tasks';
      var prioColor = t.priority === 'urgent' ? '#ef4444' : t.priority === 'high' ? '#f59e0b' : t.priority === 'medium' ? '#3b82f6' : '#9ca3af';
      var statusBg = t.status === 'overdue' ? 'background:#fef2f2;border-left:4px solid #ef4444;' :
                     t.status === 'completed' ? 'background:#f0fdf4;' : '';
      return '<div style="padding:12px 16px;border-top:1px solid #f3f4f6;display:flex;align-items:center;gap:12px;' + statusBg + '">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="fas ' + icon + '" style="font-size:12px;color:#6b7280;"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<p style="font-size:13px;font-weight:600;color:#111827;margin:0;">' + t.title + '</p>' +
          '<p style="font-size:11px;color:#6b7280;margin:2px 0 0;">' +
            t.lead_name + ' (' + (t.lead_role || 'lead') + ')' +
            ' &middot; Due ' + new Date(t.due_date).toLocaleDateString() +
          '</p>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + prioColor + ';"></span>' +
          (t.status !== 'completed' ? '<button onclick="completeTask(\'' + t.id + '\')" style="padding:4px 10px;background:#059669;color:white;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">Done</button>' : '<span style="color:#059669;font-size:10px;font-weight:600;">Completed</span>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  container.innerHTML = [
    '<div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">',
    '  <div style="display:flex;align-items:center;justify-content:space-between;">',
    '    <div><h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Follow-Up Tasks</h2>',
    '      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Manage your client follow-ups, calls, and reminders</p></div>',
    '    <div style="display:flex;gap:8px;">',
    '      <span style="padding:4px 10px;background:#fef2f2;color:#ef4444;border-radius:9999px;font-size:11px;font-weight:600;">' + (stats?.overdue || 0) + ' Overdue</span>',
    '      <span style="padding:4px 10px;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:11px;font-weight:600;">' + (stats?.today || 0) + ' Today</span>',
    '      <span style="padding:4px 10px;background:#f0fdf4;color:#059669;border-radius:9999px;font-size:11px;font-weight:600;">' + (stats?.pending || 0) + ' Pending</span>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div style="padding:16px 24px;">',
    overdue.length > 0 ? '<div style="margin-bottom:16px;"><h3 style="font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Overdue</h3><div style="background:white;border:1px solid #fecaca;border-radius:12px;overflow:hidden;">' + renderTaskList(overdue, '') + '</div></div>' : '',
    today.length > 0 ? '<div style="margin-bottom:16px;"><h3 style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Today</h3><div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">' + renderTaskList(today, '') + '</div></div>' : '',
    '<div style="margin-bottom:16px;"><h3 style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Upcoming</h3><div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">' + renderTaskList(upcoming, 'No upcoming tasks') + '</div></div>',
    completed.length > 0 ? '<div><h3 style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Completed</h3><div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">' + renderTaskList(completed.slice(0, 10), '') + '</div></div>' : '',
    '</div>'
  ].join('');
}

async function completeTask(taskId) {
  try {
    await MallanAPI._fetch('/api/crm/tasks/' + taskId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    showToast('Task completed', 'success');
    initAgentTasks();
  } catch (e) {
    showToast('Failed to complete task', 'error');
  }
}

window.initAgentTasks = initAgentTasks;
window.completeTask = completeTask;
