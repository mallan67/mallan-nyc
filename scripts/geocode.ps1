# geocode.ps1
[CmdletBinding()]
param(
  [string]$In  = "addresses.csv",
  [string]$Out = "geoclient_addresses_out.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $In)) { throw "Input CSV not found: $In" }
if (-not $env:NYC_GEOCLIENT_KEY) { throw "NYC_GEOCLIENT_KEY environment variable is missing." }

function Invoke-NycGeoClient {
  param([hashtable]$q)

  $base = 'https://api.nyc.gov/geoclient/v2/address.json'
  $qs   = ($q.GetEnumerator() |
           ForEach-Object { '{0}={1}' -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value) }) -join '&'
  $uri = "$base" + "?" + "$qs"

  $key  = $env:NYC_GEOCLIENT_KEY.Trim()     # guard against trailing newline in secret
  $h    = @{ 'Ocp-Apim-Subscription-Key' = $key }

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
