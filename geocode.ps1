# geocode.ps1
[CmdletBinding()]
param(
  [string]$In  = "addresses.csv",
  [string]$Out = "geoclient_addresses_out.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Script-constant for the API base (avoid any scope/strict-mode issues)
$Script:GeoBase = 'https://api.nyc.gov/geoclient/v2/address'

if (-not (Test-Path $In)) {
  throw "Input CSV not found: $In"
}
if (-not $env:NYC_GEOCLIENT_KEY) {
  throw "NYC_GEOCLIENT_KEY environment variable is missing."
}

function Invoke-NycGeoClient {
  param([hashtable]$q)

  $qs  = ($q.GetEnumerator() | ForEach-Object {
    '{0}={1}' -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
  }) -join '&'

  $uri = '{0}?{1}' -f $Script:GeoBase, $qs
  $hdr = @{ 'Ocp-Apim-Subscription-Key' = $env:NYC_GEOCLIENT_KEY }

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
