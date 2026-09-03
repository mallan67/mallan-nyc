/**
 * LIVE PAIRED IDENTITY PROBE — Media relationship + OpenHouse relationship.
 *
 * Answers, from the live authenticated provider and nothing else:
 *   - Property.ListingKey -> WHICH exact Media relationship field?
 *   - Property.ListingId  -> WHICH exact Media relationship field, if any?
 *   - OpenHouse.ListingKey <-> Property.ListingKey, proven with paired values.
 *   - Is OpenHouseDate actually range-filterable, and does OpenHouse honour
 *     $count? (FIELD_REGISTRY.open_house currently says `needs_probe`.)
 *
 * Every probe records: resource, $select, $filter, HTTP status, count, sample,
 * timestamp. Three states never collapse: SUPPORTED / PROVIDER_REJECTED /
 * UNVERIFIED. An HTTP failure NEVER becomes 0/null/[].
 */
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const OUT = 'artifacts/p0-search-acceptance/identity-probes.json';

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
  if (!r.ok) throw new Error('token ' + r.status + ' ' + (await r.text()));
  return (await r.json()).access_token;
}

const results = [];

async function probe(label, resource, params, tok) {
  const qs = new URLSearchParams(params);
  const url = BASE + '/odata/' + resource + '?' + qs;
  const rec = { label, resource, params, at: new Date().toISOString() };
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    rec.httpStatus = r.status;
    const text = await r.text();
    if (!r.ok) {
      // A rejection is a RESULT, not an absence. It must never read as zero.
      rec.state = 'PROVIDER_REJECTED';
      rec.body = text.slice(0, 600);
    } else {
      const j = JSON.parse(text);
      rec.state = 'SUPPORTED';
      rec.odataCount = j['@odata.count'] ?? null;
      rec.rowsReturned = Array.isArray(j.value) ? j.value.length : null;
      rec.sample = Array.isArray(j.value) ? j.value.slice(0, 3) : null;
      rec.hasNextLink = Boolean(j['@odata.nextLink']);
    }
  } catch (e) {
    rec.state = 'UNVERIFIED';
    rec.error = String(e).slice(0, 400);
  }
  results.push(rec);
  const n = rec.odataCount ?? rec.rowsReturned;
  console.log('[' + rec.state + '] ' + label + ' :: HTTP ' + (rec.httpStatus ?? '-') + ' :: count=' + n);
  return rec;
}

const tok = await token();
console.log('token acquired\n');

// STEP 1 — a real Property that CLAIMS photos. Without PhotosCount > 0 the
// media probes below would prove nothing: "no media" would be a correct answer.
const seed = await probe('seed: Property with PhotosCount gt 0', 'Property', {
  $select: 'ListingKey,ListingId,PhotosCount,StandardStatus',
  $filter: "StandardStatus eq 'Active' and PhotosCount gt 0",
  $top: '3',
  $count: 'true',
}, tok);

const rows = seed.sample || [];
if (!rows.length) {
  console.error('\nSTOP: no seed row. Media identity CANNOT be probed; recorded as UNVERIFIED.');
} else {
  for (const row of rows) {
    const K = String(row.ListingKey);
    const I = String(row.ListingId);
    console.log('\n--- pair: ListingKey=' + K + '  ListingId=' + I + '  PhotosCount=' + row.PhotosCount + ' ---');
    // All FOUR combinations. Naming a winner without testing the losers would
    // be inference, and two of these are expected to come back zero.
    await probe('Media.ResourceRecordKey eq ListingKey(' + K + ')', 'Media',
      { $filter: "ResourceRecordKey eq '" + K + "'", $top: '2', $count: 'true',
        $select: 'ResourceRecordKey,ResourceRecordID,MediaURL,Order,MediaStatus' }, tok);
    await probe('Media.ResourceRecordID eq ListingId(' + I + ')', 'Media',
      { $filter: "ResourceRecordID eq '" + I + "'", $top: '2', $count: 'true',
        $select: 'ResourceRecordKey,ResourceRecordID,MediaURL,Order,MediaStatus' }, tok);
    await probe('Media.ResourceRecordID eq ListingKey(' + K + ')', 'Media',
      { $filter: "ResourceRecordID eq '" + K + "'", $top: '2', $count: 'true',
        $select: 'ResourceRecordKey,ResourceRecordID' }, tok);
    await probe('Media.ResourceRecordKey eq ListingId(' + I + ')', 'Media',
      { $filter: "ResourceRecordKey eq '" + I + "'", $top: '2', $count: 'true',
        $select: 'ResourceRecordKey,ResourceRecordID' }, tok);
  }
}

// STEP 2 — OpenHouse. Shape first, then the paired relationship.
const oh = await probe('OpenHouse shape', 'OpenHouse', {
  $select: 'ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseStatus,OpenHouseType,AppointmentRequiredYN',
  $top: '3', $count: 'true',
}, tok);

const ohRow = (oh.sample || [])[0];
if (ohRow) {
  const K = String(ohRow.ListingKey);
  console.log('\n--- OpenHouse pair: ListingKey=' + K + ' ListingId=' + ohRow.ListingId + ' ---');
  await probe('Property.ListingKey eq OpenHouse.ListingKey(' + K + ')', 'Property',
    { $filter: "ListingKey eq '" + K + "'", $select: 'ListingKey,ListingId', $top: '2', $count: 'true' }, tok);
  await probe('Property.ListingId eq OpenHouse.ListingKey(' + K + ') [expect 0]', 'Property',
    { $filter: "ListingId eq '" + K + "'", $select: 'ListingKey,ListingId', $top: '2', $count: 'true' }, tok);
}

// STEP 3 — the operators Search MUST have. `needs_probe` is not a plan.
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const in30 = new Date(today.getTime() + 30 * 864e5);
await probe('OpenHouseDate range ge/le', 'OpenHouse',
  { $filter: 'OpenHouseDate ge ' + iso(today) + ' and OpenHouseDate le ' + iso(in30),
    $select: 'ListingKey,OpenHouseDate', $top: '3', $count: 'true' }, tok);
await probe('OpenHouseDate range + OpenHouseStatus eq Active', 'OpenHouse',
  { $filter: 'OpenHouseDate ge ' + iso(today) + ' and OpenHouseDate le ' + iso(in30) + " and OpenHouseStatus eq 'Active'",
    $select: 'ListingKey,OpenHouseDate,OpenHouseStatus', $top: '3', $count: 'true' }, tok);
await probe('OpenHouse $orderby OpenHouseDate asc', 'OpenHouse',
  { $orderby: 'OpenHouseDate asc', $select: 'ListingKey,OpenHouseDate', $top: '3' }, tok);

const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify({ probedAt: new Date().toISOString(), base: BASE, results }, null, 2));
console.log('\nwrote ' + OUT + ' (' + results.length + ' probes)');
