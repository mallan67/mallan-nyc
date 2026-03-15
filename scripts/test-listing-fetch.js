const fs = require('fs');

// Load .env.local
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(function(l) {
  var idx = l.indexOf('=');
  if (idx > 0) {
    var k = l.substring(0, idx).trim();
    var v = l.substring(idx + 1).trim().replace(/^"|"$/g, '');
    process.env[k] = v;
  }
});

(async () => {
  // Get token
  var r = await fetch('https://api.cotality.com/trestle/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + process.env.IDX_CLIENT_ID + '&client_secret=' + process.env.IDX_CLIENT_SECRET + '&scope=api'
  });
  var t = await r.json();
  if (!t.access_token) { console.log('Auth failed:', JSON.stringify(t)); return; }
  console.log('Token OK');

  // Fetch known active listing
  var listingId = process.argv[2] || 'RLS20071059';
  var url = 'https://api.cotality.com/trestle/odata/Property?$filter=ListingId eq \'' + listingId + '\'&$select=ListingId,StandardStatus,InternetEntireListingDisplayYN,IDXEntireListingDisplayYN,InternetAddressDisplayYN,StreetNumber,StreetName,UnitNumber,City,PostalCode&$top=1';
  var lr = await fetch(url, { headers: { Authorization: 'Bearer ' + t.access_token } });
  console.log('Listing HTTP:', lr.status);
  var d = await lr.json();
  console.log(JSON.stringify(d, null, 2));
})();
