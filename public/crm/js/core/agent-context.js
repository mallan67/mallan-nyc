// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CONTEXT — must be loaded AFTER api-client.js
// Identity comes from /api/auth/me via MallanAPI (session token).
// NO URL PARAMETERS. NO PII IN URLS.
//
// Globals LOGGED_IN_AGENT and AGENT_PROFILE are kept for backward compatibility.
// They start with dev defaults, then update when MallanAPI.init() resolves.
// ═══════════════════════════════════════════════════════════════════════════════

// Configure API base URL for cross-origin access (GitHub Pages → mallan.nyc)
(function() {
    if (typeof MallanAPI !== 'undefined') {
        var origin = window.location.origin;
        if (origin.indexOf('mallan.nyc') === -1) {
            MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });
        }
    }
})();

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
    companyLicense: '#10991205323',
    address: '400 East 90th Street, Suite 17C, New York, NY 10128',
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
            if (u.photo) AGENT_PROFILE.photo = u.photo;
        } else {
            // Not authenticated — show banner instead of hard redirect
            // (prevents boot-out loop when API is slow or session expired during mockup testing)
            console.warn('[Auth] Not authenticated — using demo mode');
            LOGGED_IN_AGENT.id = 'demo';
            LOGGED_IN_AGENT.name = 'Demo User';
            LOGGED_IN_AGENT.role = 'agent';
        }
    });
    // Handle 401 events from API calls — log only, don't redirect during mockup
    window.addEventListener('mallan:auth:unauthorized', function() {
        console.warn('[Auth] Session expired — using cached data');
    });
}
