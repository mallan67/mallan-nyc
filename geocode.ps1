# geocode.ps1
[CmdletBinding()]
param(
  [string]$In  = "addresses.csv",
  [string]$Out = "geoclient_addresses_out.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Use the JSON endpoint and keep it as a proper Uri
$Script:GeoBase = 'https://api.nyc.gov/geoclient/v2/address.json'

if (-not (Test-Path $In)) {
  throw "Input CSV not found: $In"
}
if (-not $env:NYC_GEOCLIENT_KEY) {
  throw "NYC_GEOCLIENT_KEY environment variable is missing."
}

function Invoke-NycGeoClient {
  param([hashtable]$q)

  # Build query string safely
  $pairs = foreach ($kv in $q.GetEnumerator()) {
    '{0}={1}' -f [uri]::EscapeDataString($kv.Key),
                  [uri]::EscapeDataString([string]$kv.Value)
  }

  # Combine with UriBuilder to avoid malformed URIs
  $ub = [System.UriBuilder]$Script:GeoBase
  $ub.Query = ($pairs -join '&')
  $uri = $ub.Uri.AbsoluteUri

  $hdr = @{ 'Ocp-Apim-Subscription-Key' = $env:NYC_GEOCLIENT_KEY }

  # Optional: log the path without the query (keeps logs clean)
  Write-Host 'GET ' + ($uri -replace '\?.*$', '?…')

  (Invoke-RestMethod -Headers $hdr -Uri $uri -ErrorAction Stop).address
}

$rows   = Import-Csv $In
$result = foreach ($r in $rows) {
  $addr = Invoke-NycGeoClient @{
    houseNumber = $r.houseNumber
    street      = $r.street
    borough     = $r.borough
    zip         = $r.zip
  }

  [pscustomobject]@{
    BBL       = $addr.bbl
    BIN       = $addr.buildingIdentificationNumber
    Borough   = $addr.firstBoroughName
    Latitude  = $addr.latitude
    Longitude = $addr.longitude
    Precinct  = $addr.policePrecinct
  }
}

$result | Export-Csv $Out -NoTypeInformation -Encoding UTF8
Write-Host "Wrote '$Out' with $($result.Count) rows."
