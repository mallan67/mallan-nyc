/**
 * AUDIT THE REMAINING DISABLED CONTROLS AGAINST THE LIVE PROVIDER.
 *
 * Open House was disabled with the reason "not supported by the search
 * backend". That was true of the backend and FALSE as a provider claim — the
 * OpenHouse resource answers every query the feature needed.
 *
 * Several controls are still disabled with reasons that make PROVIDER claims:
 *
 *   "REBNY IDX feed does not provide listing coordinates"   (transit, grid)
 *   "Cotality filter/sort behaviour unproven"               (Days on Market)
 *   "AssociationFee alone is not canonical monthly cost"    (carrying cost)
 *
 * A provider claim is only ever settled by the provider, so each is probed
 * here. The point is NOT to re-enable anything automatically — several are
 * legitimate product decisions — but to separate the three cases honestly:
 *
 *   PROVIDER GENUINELY REFUSES        -> blocked with a verified reason
 *   PROVIDER ANSWERS, MALLAN DOESN'T  -> a gap, like Open House was
 *   PROVIDER ANSWERS, PRODUCT DECLINED -> a product decision, stated as one
 *
 * SUPPORTED / PROVIDER_REJECTED / UNVERIFIED never collapse, and an HTTP
 * failure never becomes 0.
 */
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const OUT = 'artifacts/p0-search-acceptance/disabled-control-claims.json';

async function token() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.IDX_CLIENT_ID,
    client_secret: process.env.IDX_CLIENT_SECRET,
    scope: 'api',
  });
  const r = await fetch(BASE + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

const results = [];

async function probe(claim, label, resource, params, tok) {
  const rec = { claim, label, resource, params, at: new Date().toISOString() };
  try {
    const r = await fetch(BASE + '/odata/' + resource + '?' + new URLSearchParams(params), {
      headers: { Authorization: 'Bearer ' + tok },
    });
    rec.httpStatus = r.status;
    const text = await r.text();
    if (!r.ok) {
      rec.state = 'PROVIDER_REJECTED';
      rec.body = text.slice(0, 400);
    } else {
      const j = JSON.parse(text);
      rec.state = 'SUPPORTED';
      rec.odataCount = j['@odata.count'] ?? null;
      rec.rowsReturned = Array.isArray(j.value) ? j.value.length : null;
      rec.sample = Array.isArray(j.value) ? j.value.slice(0, 2) : null;
    }
  } catch (e) {
    rec.state = 'UNVERIFIED';
    rec.error = String(e).slice(0, 300);
  }
  results.push(rec);
  console.log(
    '[' + rec.state.padEnd(17) + '] ' + label +
    '  HTTP ' + (rec.httpStatus ?? '-') +
    '  count=' + (rec.odataCount ?? rec.rowsReturned),
  );
  return rec;
}

const tok = await token();
console.log('token acquired\n');

// ── CLAIM 1: "REBNY IDX feed does not provide listing coordinates" ──────────
console.log('--- CLAIM: no listing coordinates (transit search, Manhattan grid) ---');
await probe('no_coordinates', 'Property: Latitude/Longitude present at all', 'Property',
  { $select: 'ListingKey,Latitude,Longitude', $filter: "StandardStatus eq 'Active'",
    $top: '5', $count: 'true' }, tok);
await probe('no_coordinates', 'Property: Latitude ne null (populated count)', 'Property',
  { $select: 'ListingKey,Latitude,Longitude',
    $filter: "StandardStatus eq 'Active' and Latitude ne null",
    $top: '3', $count: 'true' }, tok);
await probe('no_coordinates', 'Property: Latitude range filter (a real map query)', 'Property',
  { $select: 'ListingKey,Latitude,Longitude',
    $filter: "StandardStatus eq 'Active' and Latitude ge 40.70 and Latitude le 40.80",
    $top: '3', $count: 'true' }, tok);

// ── CLAIM 2: "Days on Market — Cotality filter/sort behaviour unproven" ─────
console.log('\n--- CLAIM: Days on Market filter/sort unproven ---');
await probe('dom_unproven', 'DaysOnMarket range filter', 'Property',
  { $select: 'ListingKey,DaysOnMarket',
    $filter: "StandardStatus eq 'Active' and DaysOnMarket le 30",
    $top: '3', $count: 'true' }, tok);
await probe('dom_unproven', 'DaysOnMarket $orderby', 'Property',
  { $select: 'ListingKey,DaysOnMarket', $filter: "StandardStatus eq 'Active'",
    $orderby: 'DaysOnMarket desc', $top: '3' }, tok);

// ── CLAIM 3: "AssociationFee alone is not canonical monthly cost" ───────────
console.log('\n--- CLAIM: carrying cost unreconciled ---');
await probe('carrying_cost', 'AssociationFee range filter', 'Property',
  { $select: 'ListingKey,AssociationFee,AssociationFeeFrequency',
    $filter: "StandardStatus eq 'Active' and AssociationFee ge 500 and AssociationFee le 2000",
    $top: '3', $count: 'true' }, tok);
await probe('carrying_cost', 'AssociationFeeFrequency vocabulary sample', 'Property',
  { $select: 'ListingKey,AssociationFee,AssociationFeeFrequency',
    $filter: "StandardStatus eq 'Active' and AssociationFee ne null",
    $top: '5' }, tok);

const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify({ probedAt: new Date().toISOString(), base: BASE, results }, null, 2));
console.log('\nwrote ' + OUT);
