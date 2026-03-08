// Quick test: does Trestle accept our $select fields?
const path = require('path');
const fs = require('fs');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const clientId = process.env.IDX_CLIENT_ID;
const clientSecret = process.env.IDX_CLIENT_SECRET;
const apiUrl = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function run() {
  // Get token
  const tokenRes = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api' }),
  });
  if (!tokenRes.ok) { console.error('Token failed:', tokenRes.status, await tokenRes.text()); return; }
  const { access_token } = await tokenRes.json();
  console.log('Token OK');

  // Test with our exact $select fields
  const select = [
    "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
    "StreetSuffix", "UnitNumber", "City", "CityRegion", "PostalCity",
    "PostalCode", "StateOrProvince", "CountyOrParish",
    "Latitude", "Longitude",
    "ListingId", "SourceSystemKey", "PropertyType", "PropertySubType",
    "CommonInterest", "OwnershipType",
    "StandardStatus", "MlsStatus", "ModificationTimestamp",
    "ListingContractDate", "OnMarketDate",
    "DaysOnMarket", "CumulativeDaysOnMarket",
    "OriginalListPrice", "PreviousListPrice",
    "AvailabilityDate", "CloseDate",
    "ListPrice", "ClosePrice", "LeaseAmount", "LeaseAmountFrequency",
    "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
    "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
    "BuildingName",
    "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",
    "ListAgentFullName", "ListOfficeName",
    "PhotosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded",
    "PublicRemarks",
    "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
    "PetsAllowed", "Furnished",
  ].join(',');

  const filter = "StandardStatus eq 'Active' and PropertyType ne 'ResidentialLease'";
  const url = `${apiUrl}/odata/Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=3&$orderby=${encodeURIComponent('ModificationTimestamp desc')}&$count=true`;

  console.log('Fetching...');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + access_token, Accept: 'application/json' } });
  console.log('Status:', res.status);
  if (!res.ok) {
    console.error('Error body:', await res.text());
    return;
  }
  const data = await res.json();
  console.log('Count:', data['@odata.count']);
  console.log('Records:', (data.value || []).length);
  if (data.value && data.value[0]) {
    const keys = Object.keys(data.value[0]);
    console.log('Fields returned:', keys.length, keys.join(', '));
  }
}
run().catch(e => console.error(e));
