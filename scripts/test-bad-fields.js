const fs = require('fs');
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
  var r = await fetch('https://api.cotality.com/trestle/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + process.env.IDX_CLIENT_ID + '&client_secret=' + process.env.IDX_CLIENT_SECRET + '&scope=api'
  });
  var t = await r.json();
  if (!t.access_token) { console.log('Auth failed'); return; }

  // Test each suspect field individually
  var suspects = [
    'MoveInCosts', 'MoveInCostsComments', 'MoveInCostsAmountTotal',
    'OngoingFees', 'TenantPaysDescription',
    'LeaseTerm', 'PetDeposit', 'SecurityDeposit', 'TenantPays',
    'MapURL', 'OriginatingSystemID', 'OriginatingSystemName',
    'OriginatingSystemKey', 'SourceSystemName', 'ListingKeyNumeric',
    'MajorChangeType', 'MajorChangeTimestamp', 'PreviousStandardStatus',
    'WaterfrontYN', 'CityRegion', 'PostalCity',
    'BuilderModel', 'BuilderName', 'DevelopmentStatus',
    'BuyerAgentOfficePhone', 'BuyerOfficeEmail',
    'PropertyCondition', 'ListingTerms',
    'SyndicationRemarks', 'Disclaimer', 'CopyrightNotice',
    'SyndicateTo', 'SpecialListingConditions',
  ];

  for (var field of suspects) {
    var url = 'https://api.cotality.com/trestle/odata/Property?$filter=ListingId eq \'RLS20071059\'&$select=ListingId,' + field + '&$top=1';
    var lr = await fetch(url, { headers: { Authorization: 'Bearer ' + t.access_token } });
    if (lr.ok) {
      var d = await lr.json();
      var val = d.value && d.value[0] ? d.value[0][field] : '(no data)';
      console.log('  ' + field + ': OK (val=' + JSON.stringify(val).substring(0, 40) + ')');
    } else {
      console.log('  ' + field + ': REJECTED (HTTP ' + lr.status + ')');
    }
  }
})();
