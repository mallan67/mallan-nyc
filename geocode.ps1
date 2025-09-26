param(
  [string]$In  = "addresses.csv",
  [string]$Out = "geoclient_addresses_out.csv"
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $In)) { throw "Input CSV not found: $In" }
if (-not $env:NYC_GEOCLIENT_KEY) { throw "NYC_GEOCLIENT_KEY environment variable is missing." }

function Invoke-NycGeoClient {
  param([hashtable]$q)
  $base = 'https://api.nyc.gov/geoclient/v2/address'
  $qs   = ($q.GetEnumerator() | ForEach-Object {
      '{0}={1}' -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
  }) -join '&'
  $uri  = "$base?$qs"
  $h    = @{ 'Ocp-Apim-Subscription-Key' = $env:NYC_GEOCLIENT_KEY }
  (Invoke-RestMethod -Headers $h -Uri $uri -ErrorAction Stop).address
}

Import-Csv $In | ForEach-Object {
  $addr = Invoke-NycGeoClient @{
    houseNumber = $_.houseNumber
    street      = $_.street
    borough     = $_.borough
    zip         = $_.zip
  }
  [pscustomobject]@{
    BBL       = $addr.bbl
    BIN       = $addr.buildingIdentificationNumber
    Borough   = $addr.firstBoroughName
    Latitude  = $addr.latitude
    Longitude = $addr.longitude
    Precinct  = $addr.policePrecinct
  }
} | Export-Csv $Out -NoTypeInformation -Encoding UTF8
