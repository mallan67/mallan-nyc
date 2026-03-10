// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SERVICE — EmailJS integration for real email delivery
// Sends actual emails via EmailJS (free: 200/month, works client-side)
// Config stored in localStorage — no backend required
// ═══════════════════════════════════════════════════════════════════════════════

// ── Migrate old unscoped key → scoped key (one-time) ──
(function() {
    try {
        var old = localStorage.getItem('emailjs_config');
        if (old && !localStorage.getItem('mallan_emailjs_config')) {
            localStorage.setItem('mallan_emailjs_config', old);
        }
        if (old) localStorage.removeItem('emailjs_config');
    } catch(e) {}
})();

// ── Load stored config ──
var EMAIL_CONFIG = (function() {
    try {
        var stored = localStorage.getItem('mallan_emailjs_config');
        return stored ? JSON.parse(stored) : null;
    } catch(e) { return null; }
})();

function isEmailConfigured() {
    return !!(EMAIL_CONFIG && EMAIL_CONFIG.publicKey && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templateId);
}

function getConfiguredAgentEmail() {
    return (EMAIL_CONFIG && EMAIL_CONFIG.agentEmail) ? EMAIL_CONFIG.agentEmail : '';
}

function initEmailService() {
    if (isEmailConfigured() && typeof emailjs !== 'undefined') {
        emailjs.init({ publicKey: EMAIL_CONFIG.publicKey });
    }
    // Update AGENT_PROFILE with configured email if available
    var realEmail = getConfiguredAgentEmail();
    if (realEmail) {
        if (typeof AGENT_PROFILE !== 'undefined') AGENT_PROFILE.email = realEmail;
        if (typeof LOGGED_IN_AGENT !== 'undefined') LOGGED_IN_AGENT.email = realEmail;
    }
}

// ── Send email via EmailJS (returns a Promise) ──
function sendViaEmailJS(params) {
    if (!isEmailConfigured()) return Promise.reject(new Error('Email not configured'));
    if (typeof emailjs === 'undefined') return Promise.reject(new Error('EmailJS SDK not loaded'));
    return emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateId, params);
}

// ── Settings Modal ──
function openEmailSettings() {
    var existing = document.getElementById('emailSettingsModal');
    if (existing) existing.remove();

    var c = EMAIL_CONFIG || {};
    var configured = isEmailConfigured();
    var modal = document.createElement('div');
    modal.id = 'emailSettingsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    modal.onclick = function(e) { if (e.target === modal) closeEmailSettings(); };

    modal.innerHTML = '<div style="background:#fff;border-radius:16px;width:540px;max-width:92vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">' +
            '<div><h3 style="font-size:18px;font-weight:700;color:#1a1a1a;margin:0;">Email Settings</h3>' +
            '<p style="font-size:12px;color:#6b7280;margin:4px 0 0;">Configure EmailJS for real email delivery</p></div>' +
            '<button onclick="closeEmailSettings()" style="width:32px;height:32px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;font-size:18px;color:#6b7280;line-height:32px;">&times;</button>' +
        '</div>' +
        '<div style="padding:16px 24px;background:#fffbeb;border-bottom:1px solid #fde68a;">' +
            '<p style="font-size:13px;font-weight:600;color:#92400e;margin:0 0 8px;">Quick Setup (free, 2 minutes):</p>' +
            '<ol style="margin:0;padding-left:20px;font-size:12px;color:#78350f;line-height:1.8;">' +
                '<li>Go to <a href="https://www.emailjs.com" target="_blank" style="color:#2563eb;text-decoration:underline;">emailjs.com</a> &rarr; Create free account</li>' +
                '<li>Add an <strong>Email Service</strong> (connect your Gmail or Outlook)</li>' +
                '<li>Create an <strong>Email Template</strong> &mdash; set the content to just: <code style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:11px;">{{{message_html}}}</code><br>' +
                    'And add these template variables: <code style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:11px;">to_email, to_name, from_name, subject, message_html</code></li>' +
                '<li>Copy your <strong>Service ID</strong>, <strong>Template ID</strong>, and <strong>Public Key</strong> below</li>' +
            '</ol>' +
        '</div>' +
        '<div style="padding:24px;">' +
            '<div style="margin-bottom:16px;">' +
                '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Your Email Address <span style="color:#ef4444;">*</span></label>' +
                '<input id="emailSettingsAgentEmail" type="email" value="' + (c.agentEmail || '').replace(/"/g, '&quot;') + '" placeholder="your-real-email@gmail.com" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
                '<p style="font-size:11px;color:#9ca3af;margin:4px 0 0;">This appears as sender and receives test emails. Must match your EmailJS service email.</p>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
                '<div>' +
                    '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Service ID <span style="color:#ef4444;">*</span></label>' +
                    '<input id="emailSettingsServiceId" type="text" value="' + (c.serviceId || '').replace(/"/g, '&quot;') + '" placeholder="service_xxxxxxx" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:monospace;box-sizing:border-box;">' +
                '</div>' +
                '<div>' +
                    '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Template ID <span style="color:#ef4444;">*</span></label>' +
                    '<input id="emailSettingsTemplateId" type="text" value="' + (c.templateId || '').replace(/"/g, '&quot;') + '" placeholder="template_xxxxxxx" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:monospace;box-sizing:border-box;">' +
                '</div>' +
            '</div>' +
            '<div style="margin-bottom:20px;">' +
                '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Public Key <span style="color:#ef4444;">*</span></label>' +
                '<input id="emailSettingsPublicKey" type="text" value="' + (c.publicKey || '').replace(/"/g, '&quot;') + '" placeholder="your_public_key" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:monospace;box-sizing:border-box;">' +
            '</div>' +
            '<div id="emailSettingsStatus" style="margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;' +
                (configured ? 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;' : 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;') + '">' +
                (configured ? '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Connected &mdash; emails will be delivered' : '<i class="fas fa-info-circle" style="margin-right:6px;"></i>Not configured &mdash; emails are simulated only') +
            '</div>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                '<button onclick="testEmailSettings()" style="padding:10px 16px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;color:#374151;background:#fff;cursor:pointer;transition:all .15s;"><i class="fas fa-paper-plane" style="margin-right:6px;color:#6b7280;"></i>Send Test</button>' +
                '<button onclick="saveEmailSettings()" style="padding:10px 20px;border:none;border-radius:8px;font-size:13px;font-weight:600;color:#fff;background:linear-gradient(135deg,#B8860B,#d4a017);cursor:pointer;box-shadow:0 2px 8px rgba(184,134,11,.25);transition:all .15s;"><i class="fas fa-check" style="margin-right:6px;"></i>Save Settings</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    document.body.appendChild(modal);
}

function saveEmailSettings() {
    var serviceId = (document.getElementById('emailSettingsServiceId') || {}).value || '';
    var templateId = (document.getElementById('emailSettingsTemplateId') || {}).value || '';
    var publicKey = (document.getElementById('emailSettingsPublicKey') || {}).value || '';
    var agentEmail = (document.getElementById('emailSettingsAgentEmail') || {}).value || '';
    serviceId = serviceId.trim();
    templateId = templateId.trim();
    publicKey = publicKey.trim();
    agentEmail = agentEmail.trim();

    var status = document.getElementById('emailSettingsStatus');
    if (!serviceId || !templateId || !publicKey) {
        if (status) {
            status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;';
            status.innerHTML = '<i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>Please fill in all 3 EmailJS fields.';
        }
        return;
    }

    EMAIL_CONFIG = { serviceId: serviceId, templateId: templateId, publicKey: publicKey, agentEmail: agentEmail };
    localStorage.setItem('mallan_emailjs_config', JSON.stringify(EMAIL_CONFIG));

    // Re-initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init({ publicKey: publicKey });
    }

    // Update agent email globally
    if (agentEmail) {
        if (typeof AGENT_PROFILE !== 'undefined') AGENT_PROFILE.email = agentEmail;
        if (typeof LOGGED_IN_AGENT !== 'undefined') LOGGED_IN_AGENT.email = agentEmail;
    }

    if (status) {
        status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;';
        status.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Settings saved! Emails will now be delivered.';
    }
}

function closeEmailSettings() {
    var modal = document.getElementById('emailSettingsModal');
    if (modal) modal.remove();
}

function testEmailSettings() {
    var agentEmail = ((document.getElementById('emailSettingsAgentEmail') || {}).value || '').trim();
    var status = document.getElementById('emailSettingsStatus');

    if (!agentEmail) {
        if (status) {
            status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;';
            status.innerHTML = '<i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>Enter your email address first to receive the test.';
        }
        return;
    }

    // Save first, then send test
    saveEmailSettings();
    if (!isEmailConfigured()) return;

    if (status) {
        status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;';
        status.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Sending test email to ' + agentEmail + '...';
    }

    var agentName = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT.name) ? LOGGED_IN_AGENT.name : 'Agent';

    sendViaEmailJS({
        to_email: agentEmail,
        to_name: agentName,
        from_name: agentName + ' — Mallan Real Estate',
        subject: 'Test Email — Mallan Real Estate CRM',
        message_html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">' +
            '<div style="background:#1a1a1a;padding:20px 24px;border-radius:8px 8px 0 0;">' +
                '<span style="font-size:20px;font-weight:700;color:#C4A052;letter-spacing:2px;">MALLAN</span>' +
                '<span style="font-size:20px;font-weight:300;color:#fff;letter-spacing:2px;margin-left:6px;">NYC</span>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">' +
                '<h2 style="font-size:18px;color:#1a1a1a;margin:0 0 12px;">Email Integration Test</h2>' +
                '<p style="font-size:14px;color:#374151;line-height:1.6;">This confirms your CRM email system is working correctly. Property reports and listing emails will now be delivered directly to your clients.</p>' +
                '<div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">' +
                    '<p style="margin:0;font-size:14px;color:#166534;font-weight:600;">&#10003; Email delivery is active</p>' +
                '</div>' +
                '<p style="font-size:12px;color:#9ca3af;margin:20px 0 0;">Sent via Mallan Real Estate CRM &middot; ' + new Date().toLocaleString() + '</p>' +
            '</div>' +
        '</div>'
    }).then(function() {
        if (status) {
            status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;';
            status.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Test email sent! Check ' + agentEmail + ' (including spam folder).';
        }
    }).catch(function(err) {
        if (status) {
            status.style.cssText = 'margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;';
            status.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Error: ' + escapeHtml(err.text || err.message || JSON.stringify(err));
        }
    });
}

// Auto-init on page load
initEmailService();
