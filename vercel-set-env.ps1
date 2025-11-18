param(
    [Parameter(Mandatory=$false)]
    [string]$ProjectId,

    [Parameter(Mandatory=$false)]
    [string]$EnvName,

    [Parameter(Mandatory=$false)]
    [string]$EnvValue,

    [string]$Targets = "production,preview",
    [ValidateSet("encrypted","plain")]
    [string]$Type = "encrypted",

    [switch]$AutoYes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function PromptIfEmpty([string]$label, [string]$current, [bool]$secure=$false) {
    if (-not $current -or $current.Trim() -eq "") {
        if ($secure) {
            $s = Read-Host -Prompt "$label (input hidden)" -AsSecureString
            $b = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
            $val = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($b)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
            return $val
        } else {
            return Read-Host -Prompt $label
        }
    }
    return $current
}

# Get token (from env or prompt)
$token = $env:VERCEL_TOKEN
if (-not $token -or $token.Trim() -eq "") {
    Write-Host "VERCEL_TOKEN not found in environment — you will be prompted (hidden)..." -ForegroundColor Yellow
    $secureTok = Read-Host -Prompt "Enter VERCEL_TOKEN (will be used for the API)" -AsSecureString
    $b = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureTok)
    $token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($b)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
}

# Prompt for missing values
$ProjectId = PromptIfEmpty "Vercel Project ID (proj_...)" $ProjectId
$EnvName   = PromptIfEmpty "EnvName (e.g. DATABASE_URL or NEXT_PUBLIC_API_URL)" $EnvName
if (-not $EnvValue -or $EnvValue.Trim() -eq "") {
    $EnvValue = PromptIfEmpty "EnvValue (secret — input hidden)" $EnvValue -secure:$true
}

if (-not $ProjectId)   { Write-Error "ProjectId is required. Aborting."; exit 2 }
if (-not $EnvName)     { Write-Error "EnvName is required. Aborting."; exit 2 }
if (-not $EnvValue)    { Write-Error "EnvValue is required. Aborting."; exit 2 }

$targetsArray = $Targets -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
if ($targetsArray.Count -eq 0) { $targetsArray = @("production","preview") }

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

$baseUrl = "https://api.vercel.com/v9/projects/$ProjectId/env"

Write-Host "Fetching existing env vars for project $ProjectId..." -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Method Get -Uri $baseUrl -Headers $headers -ErrorAction Stop
} catch {
    Write-Error "Failed to list env vars: $($_.Exception.Message)"
    exit 3
}

# pick candidate list from response shapes
$candidates = @()
if ($resp -ne $null) {
    if ($resp.PSObject.Properties.Name -contains 'envs') { $candidates = $resp.envs }
    elseif ($resp.PSObject.Properties.Name -contains 'items') { $candidates = $resp.items }
    elseif ($resp -is [System.Array]) { $candidates = $resp }
    else { $candidates = @($resp) }
}

function Get-Name($it) {
    if ($null -ne $it.key) { return $it.key }
    if ($null -ne $it.name) { return $it.name }
    return $null
}
function Get-Targets($it) {
    if ($null -ne $it.target) { return @($it.target) }
    if ($null -ne $it.targets) { return @($it.targets) }
    return @()
}

# find existing
$match = $null
foreach ($it in $candidates) {
    $name = Get-Name $it
    if ($name -and $name -eq $EnvName) {
        $t = Get-Targets $it
        if ($t.Count -eq 0) { $match = $it; break }
        $overlap = $t | Where-Object { $targetsArray -contains $_ }
        if ($overlap.Count -gt 0) { $match = $it; break }
    }
}

if ($match) {
    $id = $match.id
    Write-Host "Found existing env var with id $id and name $EnvName. It will be updated." -ForegroundColor Yellow
    if (-not $AutoYes) {
        $yn = Read-Host -Prompt "Proceed with update? (y/N)"
        if ($yn.ToLower() -ne "y") { Write-Host "Aborted by user."; exit 0 }
    }

    $patchBody = @{ value = $EnvValue; target = $targetsArray; type = $Type } | ConvertTo-Json -Depth 10
    try {
        $patchUri = "https://api.vercel.com/v9/projects/$ProjectId/env/$id"
        $updated = Invoke-RestMethod -Method Patch -Uri $patchUri -Headers $headers -Body $patchBody -ErrorAction Stop
        Write-Host "Updated env var id=$id name=$EnvName (targets: $($targetsArray -join ','), type=$Type)" -ForegroundColor Green
        Write-Output $updated
        exit 0
    } catch {
        Write-Error "Failed to update env var: $($_.Exception.Message)"
        exit 4
    }
} else {
    Write-Host "No existing env var named $EnvName found for targets [$($targetsArray -join ',')]. Creating..." -ForegroundColor Cyan
    if (-not $AutoYes) {
        $yn = Read-Host -Prompt "Proceed with create? (y/N)"
        if ($yn.ToLower() -ne "y") { Write-Host "Aborted by user."; exit 0 }
    }

    $postBody = @{ key = $EnvName; value = $EnvValue; target = $targetsArray; type = $Type } | ConvertTo-Json -Depth 10
    try {
        $created = Invoke-RestMethod -Method Post -Uri $baseUrl -Headers $headers -Body $postBody -ErrorAction Stop
        Write-Host "Created env var name=$EnvName (targets: $($targetsArray -join ','), type=$Type)" -ForegroundColor Green
        Write-Output $created
        exit 0
    } catch {
        Write-Error "Failed to create env var: $($_.Exception.Message)"
        exit 5
    }
}
