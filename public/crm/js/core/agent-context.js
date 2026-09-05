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
    // THE REGULATED PROFESSIONAL DESIGNATION — seeded EMPTY, deliberately.
    //
    // This seeded a principal-broker designation, and the assignment below read
    // `u.licenseTitle || LOGGED_IN_AGENT.licenseTitle`, so the server's
    // deliberate `licenseTitle: null` fell straight back onto the seed. Every
    // agent whose licence class could not be resolved was then advertised as
    // the PRINCIPAL BROKER of the firm — on CMA reports, print headers and
    // footers, and outbound email signatures addressed to outside brokers.
    //
    // The designation is derived server-side from `Agent.license_type` alone,
    // by lib/agents/professional-title.ts — the ONE authority. The browser
    // holds no licence evidence of its own, so it may not supply a value here.
    // An empty designation is honest; a fabricated one is a false statement
    // about a licensee under NY DOS 19 NYCRR 175.25.
    licenseTitle: '',
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
            // Taken VERBATIM from the server, with no client fallback. A `null`
            // here is the server's considered answer — "this licensee's class
            // is not resolvable, assert nothing" — and it must survive into
            // every surface that reads AGENT_PROFILE.
            LOGGED_IN_AGENT.licenseTitle = u.licenseTitle || '';
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
