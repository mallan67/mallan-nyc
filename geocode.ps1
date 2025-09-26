# geocode.ps1
[CmdletBinding()]
param(
  [string]$In  = ".\addresses.csv",
  [string]$Out = ".\geoclient_addresses_out.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $In)) { throw "Input CSV not found: $In" }

# Trim the secret to remove accidental spaces/newlines
$Key = ($env:NYC_GEOCLIENT_KEY ?? '').Trim()
if ([string]::IsNullOrWhiteSpace($Key)) { throw "NYC_GEOCLIENT_KEY environment variable is missing." }
if ($Key.Length -ne 32) { Write-Warning "NYC_GEOCLIENT_KEY length is $($Key.Length); expected 32. Check for extra spaces/newlines." }

$base    = 'https://api.nyc.gov/geoclient/v2/address.json'
$headers = @{ 'Ocp-Apim-Subscription-Key' = $Key }

$rows   = Import-Csv $In
$result = foreach ($r in $rows) {
  $q = @{
    houseNumber = $r.houseNumber
    street      = $r.street
    borough     = $r.borough
    zip         = $r.zip
  }
  $qs  = ($q.GetEnumerator() | ForEach-Object { '{0}={1}' -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value) }) -join '&'
  $uri = "$base`?$qs"
  Write-Host "GET $uri"

  $resp = Invoke-RestMethod -Headers $headers -Uri $uri -ErrorAction Stop
  $a = $resp.address
  [pscustomobject]@{
    BBL       = $a.bbl
    BIN       = $a.buildingIdentificationNumber
    Borough   = $a.firstBoroughName
    Latitude  = $a.latitude
    Longitude = $a.longitude
    Precinct  = $a.policePrecinct
  }
}

$result | Export-Csv $Out -NoTypeInformation -Encoding UTF8
Write-Host "Wrote '$Out' with $($result.Count) rows."
