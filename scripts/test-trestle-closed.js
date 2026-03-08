require('dotenv').config({ path: '.env.local' });

const CLIENT_ID = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const TOKEN_URL = `${BASE}/oidc/connect/token`;

async function getToken() {
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', CLIENT_ID);
  body.set('client_secret', CLIENT_SECRET);
  body.set('scope', 'api');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token error ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function query(token, filter, label) {
  const params = new URLSearchParams();
  params.set('$filter', filter);
  params.set('$select', 'ListingId,ListingKey,StandardStatus,CloseDate,ClosePrice,ListPrice,OriginalListPrice,StreetNumber,StreetName,UnitNumber,City,StateOrProvince,PostalCode,PropertyType,PropertySubType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,YearBuilt,ListOfficeName,ListAgentFullName,PhotosCount,ModificationTimestamp');
  params.set('$orderby', 'CloseDate desc');
  params.set('$top', '200');
  params.set('$count', 'true');

  const url = `${BASE}/odata/Property?${params.toString()}`;
  console.log(`\n=== ${label} ===`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Error:', res.status, text.substring(0, 300));
    return [];
  }

  const data = await res.json();
  console.log('Count:', data['@odata.count'], '| Returned:', (data.value || []).length);

  for (const r of (data.value || [])) {
    console.log(JSON.stringify({
      id: r.ListingId,
      closeDate: r.CloseDate,
      closePrice: r.ClosePrice,
      listPrice: r.ListPrice,
      addr: `${r.StreetNumber || ''} ${r.StreetName || ''}${r.UnitNumber ? ' #' + r.UnitNumber : ''}, ${r.City || ''} ${r.PostalCode || ''}`.trim(),
      type: r.PropertyType,
      interest: r.CommonInterest,
      beds: r.BedroomsTotal,
      bathF: r.BathroomsFull,
      bathH: r.BathroomsHalf,
      sqft: r.LivingArea,
      photos: r.PhotosCount,
      office: r.ListOfficeName,
      agent: r.ListAgentFullName,
    }));
  }
  return data.value || [];
}

async function main() {
  const token = await getToken();
  console.log('Token obtained');

  // 1. Closed by agent name
  await query(token, "ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'", 'Closed by Maya Allan');

  // 2. Closed by office
  await query(token, "ListOfficeName eq 'Mallan Real Estate Inc' and StandardStatus eq 'Closed'", 'Closed by Mallan Real Estate Inc');

  // 3. All statuses by office (to see what exists)
  await query(token, "ListOfficeName eq 'Mallan Real Estate Inc'", 'All statuses - Mallan Real Estate Inc');
}

main().catch(e => console.error('Fatal:', e.message));
