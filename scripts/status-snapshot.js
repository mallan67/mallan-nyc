/**
 * scripts/status-snapshot.js
 * Read-only status snapshot of mallan.nyc vs live Trestle feed.
 * Runs a battery of OData $count queries in parallel + checks your DB + public site,
 * then prints a single-screen status report.
 *
 * Usage: node scripts/status-snapshot.js
 */
require('dotenv').config({ path: '.env.local' });

const API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const PUBLIC_SITE = 'https://mallan.nyc';

async function getToken() {
  const r = await fetch(`${API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IDX_CLIENT_ID,
      client_secret: process.env.IDX_CLIENT_SECRET,
      scope: 'api',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Token: ' + JSON.stringify(j));
  return j.access_token;
}

async function odataCount(token, entity, filter) {
  const qs = filter
    ? `?$top=0&$count=true&$filter=${encodeURIComponent(filter)}`
    : `?$top=0&$count=true`;
  const url = `${API}/odata/${entity}${qs}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: `${r.status} ${r.statusText}`, url };
  const j = await r.json();
  return { count: j['@odata.count'] ?? null, url };
}

async function odataMax(token, entity, field, filter) {
  // OData v4 doesn't have aggregate without $apply; use orderby desc + top 1
  const fParam = filter ? `&$filter=${encodeURIComponent(filter)}` : '';
  const url = `${API}/odata/${entity}?$select=${field}&$orderby=${field} desc&$top=1${fParam}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: `${r.status}` };
  const j = await r.json();
  return { value: j.value?.[0]?.[field] ?? null };
}

async function fetchPublic(path) {
  try {
    const r = await fetch(`${PUBLIC_SITE}${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, ok: r.ok, headers: Object.fromEntries(r.headers) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function fetchPublicJson(path) {
  try {
    const r = await fetch(`${PUBLIC_SITE}${path}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return { error: `${r.status}` };
    const j = await r.json();
    return { json: j };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function fmt(n) {
  if (n === null || n === undefined) return 'n/a';
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

function ago(iso) {
  if (!iso) return 'n/a';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

(async () => {
  console.log('Acquiring Trestle token...');
  const token = await getToken();
  console.log('TOKEN_OK\n');

  const t0 = Date.now();
  // Run queries in parallel
  const [
    propTotal,
    propActive,
    propActiveResi,
    propActiveRent,
    propClosed30d,
    propIDXOff,
    propAddrOff,
    propOptOut,
    propPartOnly,
    propAVMOff,
    propCommentOff,
    propAuction,
    propComingSoon,
    propLatest,
    mediaCount,
    memberCount,
    officeCount,
    openhouseCount,
    historyCount,
    customPropCount,
    site_root,
    site_search,
    api_listings,
    api_health,
  ] = await Promise.all([
    odataCount(token, 'Property'),
    odataCount(token, 'Property', `StandardStatus eq 'Active'`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and PropertyType eq 'Residential'`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'`),
    odataCount(token, 'Property', `StandardStatus eq 'Closed' and CloseDate ge ${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and InternetEntireListingDisplayYN eq false`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and InternetAddressDisplayYN eq false`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and OwnerOptOut eq true`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and ParticipantOnly eq true`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and InternetAutomatedValuationDisplayYN eq false`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and InternetConsumerCommentYN eq false`),
    odataCount(token, 'Property', `StandardStatus eq 'Active' and AuctionYN eq true`).catch(() => ({ count: null })),
    odataCount(token, 'Property', `MlsStatus eq 'Coming Soon'`).catch(() => ({ count: null })),
    odataMax(token, 'Property', 'ModificationTimestamp', `StandardStatus eq 'Active'`),
    odataCount(token, 'Media'),
    odataCount(token, 'Member'),
    odataCount(token, 'Office'),
    odataCount(token, 'OpenHouse'),
    odataCount(token, 'HistoryTransactional').catch(() => ({ count: null, error: 'not accessible' })),
    odataCount(token, 'CustomProperty'),
    fetchPublic('/'),
    fetchPublic('/search'),
    fetchPublicJson('/api/listings?limit=1'),
    fetchPublicJson('/api/health').catch(() => ({ error: 'no-route' })),
  ]);
  const elapsed = Date.now() - t0;

  // Build report
  console.log('='.repeat(76));
  console.log(`mallan.nyc — Live Status Snapshot (${new Date().toISOString()})`);
  console.log('='.repeat(76));

  console.log('\n┌─ Trestle / Cotality (live) ───────────────────────────────────────┐');
  console.log(`│ Total listings (all statuses)        : ${fmt(propTotal.count).padStart(12)}        │`);
  console.log(`│   Active total                       : ${fmt(propActive.count).padStart(12)}        │`);
  console.log(`│     Active Residential (sale)        : ${fmt(propActiveResi.count).padStart(12)}        │`);
  console.log(`│     Active Residential Lease (rent)  : ${fmt(propActiveRent.count).padStart(12)}        │`);
  console.log(`│   Closed in last 30 days             : ${fmt(propClosed30d.count).padStart(12)}        │`);
  console.log(`│   Coming Soon                        : ${fmt(propComingSoon.count).padStart(12)}        │`);
  console.log(`│ Latest active ModificationTimestamp  : ${(ago(propLatest.value)).padStart(12)}        │`);
  console.log('└───────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Distribution gates (UCBA Art. III) ──────────────────────────────┐');
  console.log(`│ Active listings BLOCKED from public display:                      │`);
  console.log(`│   InternetEntireListingDisplayYN = false : ${fmt(propIDXOff.count).padStart(8)}              │`);
  console.log(`│   InternetAddressDisplayYN       = false : ${fmt(propAddrOff.count).padStart(8)}              │`);
  console.log(`│   OwnerOptOut                    = true  : ${fmt(propOptOut.count).padStart(8)}              │`);
  console.log(`│   ParticipantOnly                = true  : ${fmt(propPartOnly.count).padStart(8)}              │`);
  console.log(`│   InternetAVM                    = false : ${fmt(propAVMOff.count).padStart(8)}              │`);
  console.log(`│   InternetConsumerComment        = false : ${fmt(propCommentOff.count).padStart(8)}              │`);
  console.log(`│   AuctionYN                      = true  : ${fmt(propAuction.count).padStart(8)}              │`);
  console.log('└───────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Other Trestle resources ─────────────────────────────────────────┐');
  console.log(`│ Media                                : ${fmt(mediaCount.count).padStart(12)}        │`);
  console.log(`│ Member (agents)                      : ${fmt(memberCount.count).padStart(12)}        │`);
  console.log(`│ Office (firms)                       : ${fmt(officeCount.count).padStart(12)}        │`);
  console.log(`│ OpenHouse                            : ${fmt(openhouseCount.count).padStart(12)}        │`);
  console.log(`│ CustomProperty (REBNY extensions)    : ${fmt(customPropCount.count).padStart(12)}        │`);
  console.log(`│ HistoryTransactional                 : ${fmt(historyCount.count ?? historyCount.error).padStart(12)}        │`);
  console.log('└───────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ mallan.nyc public site ──────────────────────────────────────────┐');
  console.log(`│ GET /                                : ${String(site_root.status || site_root.error).padStart(12)}        │`);
  console.log(`│ GET /search                          : ${String(site_search.status || site_search.error).padStart(12)}        │`);
  console.log(`│ GET /api/listings?limit=1            : ${String(api_listings.json ? 'OK' : api_listings.error).padStart(12)}        │`);
  if (api_listings.json) {
    const j = api_listings.json;
    const total = j.total ?? j.count ?? j.pagination?.total ?? (Array.isArray(j) ? j.length : 'n/a');
    console.log(`│   /api/listings reports total        : ${fmt(total).padStart(12)}        │`);
  }
  console.log(`│ GET /api/health                      : ${String(api_health.json ? 'OK' : api_health.error).padStart(12)}        │`);
  console.log('└───────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Quick parity check ──────────────────────────────────────────────┐');
  if (propActive.count !== null && api_listings.json) {
    const trestleActive = propActive.count;
    const trestleDisplayable = propActive.count - (propIDXOff.count || 0) - (propOptOut.count || 0) - (propPartOnly.count || 0);
    const total = api_listings.json.total ?? api_listings.json.count ?? api_listings.json.pagination?.total ?? null;
    console.log(`│ Trestle active total                 : ${fmt(trestleActive).padStart(12)}        │`);
    console.log(`│ Trestle expected displayable         : ${fmt(trestleDisplayable).padStart(12)}        │`);
    console.log(`│ mallan.nyc /api/listings total       : ${fmt(total).padStart(12)}        │`);
    if (total !== null && trestleDisplayable !== null) {
      const delta = trestleDisplayable - total;
      const sign = delta > 0 ? '+' : '';
      console.log(`│ Delta (Trestle expected − public)    : ${(sign + fmt(delta)).padStart(12)}        │`);
      if (Math.abs(delta) <= Math.max(2, trestleDisplayable * 0.02)) {
        console.log(`│ Parity                               : ${'WITHIN 2%'.padStart(12)}        │`);
      } else if (delta > 0) {
        console.log(`│ Parity                               : ${'public LOWER'.padStart(12)}        │`);
      } else {
        console.log(`│ Parity                               : ${'public HIGHER'.padStart(12)}        │`);
      }
    }
  }
  console.log('└───────────────────────────────────────────────────────────────────┘');

  console.log(`\nQueries completed in ${elapsed}ms`);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
