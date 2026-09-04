// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CONTEXT — must be loaded AFTER api-client.js
// Identity comes from /api/auth/me via MallanAPI (session token).
// NO URL PARAMETERS. NO PII IN URLS.
//
// Globals LOGGED_IN_AGENT and AGENT_PROFILE are kept for backward compatibility.
// They start with dev defaults, then update when MallanAPI.init() resolves.
// ═══════════════════════════════════════════════════════════════════════════════

// API BASE URL — deliberately NOT set here.
//
// This file used to sniff the host and repoint the API at Production on any
// origin without the literal "mallan.nyc", which made every *.vercel.app
// Preview and every branch alias read and write PRODUCTION — and, because the
// CRM CSP is `connect-src 'self'`, made /api/auth/me fail, which app.js turned
// into a /crm/login.html redirect loop.
//
// The CRM and the API are served by the same deployment, so the base URL is
// resolved once, same-origin, by api-client.js (loaded before this file).
// See the governed-resolver note at the top of js/core/api-client.js.

// Defaults — overwritten by server data when MallanAPI.init() resolves
var LOGGED_IN_AGENT = {
    id: '',
    name: '',
    phone: '',
    email: '',
    license: '',
    licenseTitle: 'Licensed Real Estate Broker',
    companyKey: 'mallan',
    companyName: 'Mallan Real Estate Inc.',
    role: ''
};

var AGENT_PROFILE = {
    name: LOGGED_IN_AGENT.name,
    license: '#' + LOGGED_IN_AGENT.license,
    licenseTitle: LOGGED_IN_AGENT.licenseTitle,
    title: LOGGED_IN_AGENT.licenseTitle,
    phone: LOGGED_IN_AGENT.phone,
    email: LOGGED_IN_AGENT.email,
    company: LOGGED_IN_AGENT.companyName,
    companyLicense: '',
    address: '',
    website: 'mallan.nyc',
    photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=85&auto=format&fit=crop&crop=face'
};

// Override with server data when MallanAPI is available
if (typeof MallanAPI !== 'undefined') {
    MallanAPI.init().then(function (data) {
        if (data.authenticated && data.user) {
            var u = data.user;
            LOGGED_IN_AGENT.id = u.id || LOGGED_IN_AGENT.id;
            LOGGED_IN_AGENT.name = u.name || LOGGED_IN_AGENT.name;
            LOGGED_IN_AGENT.phone = u.phone || LOGGED_IN_AGENT.phone;
            LOGGED_IN_AGENT.email = u.email || LOGGED_IN_AGENT.email;
            LOGGED_IN_AGENT.license = u.license || LOGGED_IN_AGENT.license;
            LOGGED_IN_AGENT.licenseTitle = u.licenseTitle || LOGGED_IN_AGENT.licenseTitle;
            LOGGED_IN_AGENT.companyKey = u.companyKey || LOGGED_IN_AGENT.companyKey;
            LOGGED_IN_AGENT.companyName = u.companyName || LOGGED_IN_AGENT.companyName;
            LOGGED_IN_AGENT.role = (data.role || 'agent').toLowerCase();

            AGENT_PROFILE.name = LOGGED_IN_AGENT.name;
            AGENT_PROFILE.license = '#' + LOGGED_IN_AGENT.license;
            AGENT_PROFILE.licenseTitle = LOGGED_IN_AGENT.licenseTitle;
            AGENT_PROFILE.title = LOGGED_IN_AGENT.licenseTitle;
            AGENT_PROFILE.phone = LOGGED_IN_AGENT.phone;
            AGENT_PROFILE.email = LOGGED_IN_AGENT.email;
            AGENT_PROFILE.company = LOGGED_IN_AGENT.companyName;
            if (u.companyLicense) AGENT_PROFILE.companyLicense = '#' + u.companyLicense;
            if (u.companyAddress) AGENT_PROFILE.address = u.companyAddress;
            if (u.companyPhone) AGENT_PROFILE.companyPhone = u.companyPhone;
            if (u.photo) AGENT_PROFILE.photo = u.photo;
        } else {
            // Not authenticated — redirect to admin login
            window.location.href = '/crm/login.html';
        }
    });
    // Handle 401 events from API calls
    window.addEventListener('mallan:auth:unauthorized', function() {
        window.location.href = '/crm/login.html';
    });
}
