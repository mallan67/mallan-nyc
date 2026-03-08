// Test script: fetch closed deals from Trestle for both listing agent and buyer agent
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TRESTLE_API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const CLIENT_ID = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;

async function getToken() {
  const res = await fetch(`${TRESTLE_API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'api',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchClosed(token, filterField, agentName) {
  const params = new URLSearchParams();
  params.set('$filter', `${filterField} eq '${agentName}' and StandardStatus eq 'Closed'`);
  params.set('$select', [
    'ListingId', 'ListingKey', 'CloseDate', 'ClosePrice', 'ListPrice',
    'StreetNumber', 'StreetDirPrefix', 'StreetName', 'StreetSuffix', 'StreetDirSuffix',
    'UnitNumber', 'City', 'PostalCode', 'PropertyType', 'PropertySubType', 'CommonInterest',
    'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf', 'LivingArea',
    'ListAgentFullName', 'ListOfficeName',
    'BuyerAgentFullName', 'BuyerOfficeName',
    'PhotosCount'
  ].join(','));
  params.set('$orderby', 'CloseDate desc');
  params.set('$top', '200');

  const res = await fetch(`${TRESTLE_API_URL}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} for ${filterField}`);
    return [];
  }
  const data = await res.json();
  return data.value || [];
}

(async () => {
  console.log('Getting token...');
  const token = await getToken();

  // 1. Listing agent (exclusives)
  console.log('\n=== EXCLUSIVE DEALS (ListAgentFullName) ===');
  const exclusives = await fetchClosed(token, 'ListAgentFullName', 'Maya Allan');
  console.log(`Found: ${exclusives.length}`);
  for (const r of exclusives) {
    const street = [r.StreetNumber, r.StreetDirPrefix, r.StreetName, r.StreetSuffix].filter(Boolean).join(' ');
    const isRental = r.PropertyType === 'ResidentialLease';
    console.log(`  ${isRental ? 'RENT' : 'SALE'} | $${(r.ClosePrice || r.ListPrice || 0).toLocaleString()} | ${street} ${r.UnitNumber || ''} | ${r.PropertyType} | ${r.CommonInterest || '-'} | Close: ${r.CloseDate || 'N/A'} | ListOffice: ${r.ListOfficeName} | Photos: ${r.PhotosCount}`);
  }

  // 2. Buyer agent (buyer rep)
  console.log('\n=== BUYER REP DEALS (BuyerAgentFullName) ===');
  const buyerRep = await fetchClosed(token, 'BuyerAgentFullName', 'Maya Allan');
  console.log(`Found: ${buyerRep.length}`);
  for (const r of buyerRep) {
    const street = [r.StreetNumber, r.StreetDirPrefix, r.StreetName, r.StreetSuffix].filter(Boolean).join(' ');
    const isRental = r.PropertyType === 'ResidentialLease';
    console.log(`  ${isRental ? 'RENT' : 'SALE'} | $${(r.ClosePrice || r.ListPrice || 0).toLocaleString()} | ${street} ${r.UnitNumber || ''} | ${r.PropertyType} | ${r.CommonInterest || '-'} | Close: ${r.CloseDate || 'N/A'} | ListOffice: ${r.ListOfficeName} | BuyerOffice: ${r.BuyerOfficeName} | Photos: ${r.PhotosCount}`);
  }

  // 3. Check for overlap (deals where Maya was both list + buyer agent)
  const exclusiveIds = new Set(exclusives.map(r => r.ListingId));
  const overlap = buyerRep.filter(r => exclusiveIds.has(r.ListingId));
  console.log(`\nOverlap (in both queries): ${overlap.length}`);
  for (const r of overlap) {
    console.log(`  ${r.ListingId} | ${r.StreetNumber} ${r.StreetName} ${r.UnitNumber || ''}`);
  }

  // 4. Summary
  const allSales = [...exclusives, ...buyerRep].filter(r => r.PropertyType !== 'ResidentialLease');
  const allRentals = [...exclusives, ...buyerRep].filter(r => r.PropertyType === 'ResidentialLease');
  console.log(`\nTotal unique: ${exclusives.length + buyerRep.length - overlap.length}`);
  console.log(`  Sales: ${allSales.length} | Rentals: ${allRentals.length}`);
})();
