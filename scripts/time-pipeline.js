// Time each step of the listing pipeline
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const apiUrl = process.env.TRESTLE_API_URL;
const cid = process.env.IDX_CLIENT_ID;
const csec = process.env.IDX_CLIENT_SECRET;

async function run() {
  // Step 1: Token
  let t = Date.now();
  const tokenRes = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cid, client_secret: csec, scope: 'api' }),
  });
  const { access_token } = await tokenRes.json();
  console.log('1. Token:', Date.now() - t + 'ms');

  // Step 2: Listing fetch with full CARD_SELECT_FIELDS
  t = Date.now();
  const select = [
    "StreetNumber","StreetName","StreetDirPrefix","StreetDirSuffix",
    "StreetSuffix","UnitNumber","City","CityRegion","PostalCity",
    "PostalCode","StateOrProvince","CountyOrParish","Latitude","Longitude",
    "ListingId","ListingKey","SourceSystemKey","PropertyType","PropertySubType",
    "CommonInterest","OwnershipType",
    "StandardStatus","MlsStatus","ModificationTimestamp",
    "ListingContractDate","OnMarketDate","DaysOnMarket","CumulativeDaysOnMarket",
    "OriginalListPrice","PreviousListPrice","AvailabilityDate",
    "ListPrice","ClosePrice","LeaseAmount","LeaseAmountFrequency","CloseDate",
    "BedroomsTotal","BathroomsFull","BathroomsHalf","BathroomsTotalInteger",
    "LivingArea","LotSizeArea","YearBuilt","RoomsTotal","StoriesTotal",
    "BuildingName",
    "AssociationFee","AssociationFeeFrequency","TaxAnnualAmount",
    "ListAgentFullName","ListOfficeName",
    "PhotosCount","VirtualTourURLBranded","VirtualTourURLUnbranded",
    "PublicRemarks",
    "InternetEntireListingDisplayYN","InternetAddressDisplayYN",
    "PetsAllowed","Furnished",
  ].join(',');
  const filter = "StandardStatus eq 'Active' and PropertyType ne 'ResidentialLease'";
  const params = new URLSearchParams({
    '$filter': filter,
    '$select': select,
    '$top': '120',
    '$count': 'true',
    '$orderby': 'ModificationTimestamp desc',
  });
  const listRes = await fetch(`${apiUrl}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const listData = await listRes.json();
  const records = listData.value || [];
  console.log('2. Listings:', Date.now() - t + 'ms', `(${records.length} records, count=${listData['@odata.count']})`);

  // Step 3: Media batch (for first 50 listings)
  // Trestle guidance (2026-04-07): use ListingKey (= Media.ResourceRecordKey)
  t = Date.now();
  const ids = records.slice(0, 50).map(r => r.ListingKey || r.SourceSystemKey || r.ListingId);
  const filterParts = ids.map(id => `ResourceRecordKey eq '${id}'`);
  const mFilter = `(${filterParts.join(' or ')}) and Order le 2`;
  const mParams = new URLSearchParams({
    '$filter': mFilter,
    '$select': 'ResourceRecordKey,MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN',
    '$orderby': 'Order asc',
    '$top': String(ids.length * 3),
  });
  const mRes = await fetch(`${apiUrl}/odata/Media?${mParams}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const mData = await mRes.json();
  console.log('3. Media batch (50 listings):', Date.now() - t + 'ms', `(${(mData.value || []).length} photos)`);

  // Step 4: Second token call (simulates cached vs uncached)
  t = Date.now();
  const tokenRes2 = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cid, client_secret: csec, scope: 'api' }),
  });
  await tokenRes2.json();
  console.log('4. Token (2nd call):', Date.now() - t + 'ms');
}
run().catch(e => console.error(e));
