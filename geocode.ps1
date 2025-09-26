[CmdletBinding()]
param(
  [string]$Input  = ".\addresses.csv",
  [string]$OutCsv = ".\geoclient_addresses_out.csv",
  [string]$OutXlsx = ".\geoclient_addresses_out.xlsx",
  [string]$Key    # optional: if not set, will use env var NYC_GEOCLIENT_SUBSCRIPTION_KEY
)

# ---- Minimal helpers (no profile/module required) ----
function Invoke-NycGeoClient {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,   # address|search|bbl|bin|intersection|place
    [Parameter(Mandatory)][object]$Query,  # hashtable or raw query string
    [string]$Key,
    [string]$Base = 'https://api.nyc.gov/geoclient/v2'
  )

  if (-not $Key) { $Key = $script:Key }
  if (-not $Key) { $Key = $env:NYC_GEOCLIENT_SUBSCRIPTION_KEY }
  if (-not $Key) { throw "No API key. Pass -Key or set `$env:NYC_GEOCLIENT_SUBSCRIPTION_KEY." }

  if ($Query -is [string]) {
    $qs = $Query
  } elseif ($Query -is [hashtable]) {
    Add-Type -AssemblyName System.Web
    $nv = [System.Web.HttpUtility]::ParseQueryString([string]::Empty)
    foreach ($k in $Query.Keys) {
      $nv[[string]$k] = [string]$Query[$k]
    }
    $qs = $nv.ToString()
  } else { throw "Query must be hashtable or string." }

  $url = ("{0}/{1}?{2}" -f $Base.TrimEnd('/'), $Path.Trim('/'), $qs)
  $headers = @{ 'Ocp-Apim-Subscription-Key' = $Key }

  try {
    $r = Invoke-WebRequest -Headers $headers -Uri $url -ErrorAction Stop
    $r.Content | ConvertFrom-Json
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $body = $sr.ReadToEnd(); $sr.Close()
      throw "HTTP $([int]$resp.StatusCode) – $body"
    }
    throw
  }
}

function New-NycQuery {
  param([string]$HouseNumber,[string]$Street,[string]$Borough,[string]$Zip)
  @{ houseNumber=$HouseNumber; street=$Street; borough=$Borough; zip=$Zip }
}

# ---- Run ----
if (-not (Test-Path $Input)) { throw "Input not found: $Input" }

$rows = Import-Csv $Input
$results = foreach ($r in $rows) {
  try {
    $addr = (Invoke-NycGeoClient -Path address -Query (New-NycQuery $r.houseNumber $r.street $r.borough $r.zip) -Key $Key).address
    # Prefix BBL/BIN with ' in CSV to preserve leading zeros everywhere
    [pscustomobject]@{
      BBL        = "'" + $addr.bbl
      BIN        = "'" + $addr.buildingIdentificationNumber
      Borough    = $addr.firstBoroughName
      Latitude   = $addr.latitude
      Longitude  = $addr.longitude
      Precinct   = $addr.policePrecinct
    }
  } catch {
    [pscustomobject]@{
      BBL="'"; BIN="'"; Borough=$null; Latitude=$null; Longitude=$null; Precinct=$null
      Error=$_.Exception.Message
    }
  }
  Start-Sleep -Milliseconds 150  # be polite to the API
}

$results | Export-Csv $OutCsv -NoTypeInformation

# Optional XLSX if ImportExcel is installed
if (Get-Module -ListAvailable -Name ImportExcel) {
  $results | Export-Excel $OutXlsx -WorksheetName Geo -AutoSize `
            -NoNumberConversion BBL,BIN -TableName Geo -TableStyle Medium6
  Write-Host "Wrote Excel: $OutXlsx"
} else {
  Write-Host "ImportExcel module not found. CSV written to $OutCsv"
}
