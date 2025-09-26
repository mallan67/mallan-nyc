# geocode.ps1
[CmdletBinding()]
param(
  [string]$In  = "addresses.csv",
  [string]$Out = "geoclient_addresses_out.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$base = 'https://api.nyc.gov/geoclient/v2/address.json'

if (-not (Test-Path $In)) { throw "Input CSV not found: $In" }
if (-not $env:NYC_GEOCLIENT_KEY) { throw "NYC_GEOCLIENT_KEY environment variable is missing." }

function Invoke-NycGeoClient {
  param([hashtable]$q)

  $pairs = foreach ($kv in $q.GetEnumerator()) {
    '{0}={1}' -f [uri]::EscapeDataString($kv.Key),
                  [uri]::EscapeDataString([string]$kv.Value)
  }

  $ub = [System.UriBuilder]$base
  $ub.Query = ($pairs -join '&')
  $uri = $ub.Uri.AbsoluteUri

  $h = @{ 'Ocp-Apim-Subscription-Key' = $env:NYC_GEOCLIENT_KEY }

  Write-Host ('GET ' + $ub.Uri.Scheme + '://' + $ub.Host + $ub.Path + '?…')

  (Invoke-RestMethod -Headers $h -Uri $uri -ErrorAction Stop).address
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
