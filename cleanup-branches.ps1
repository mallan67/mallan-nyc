<#
cleanup-branches.ps1
Purpose: Safe removal of merged/stale remote branches for a repo.
Usage (example):
  .\cleanup-branches.ps1 -Owner "mallan67" -Repo "mallan-nyc" -GHToken $env:GITHUB_TOKEN -AgeDays 90 -AutoConfirm:$false

Default owner/repo are set for convenience.
#>

param(
  [string]$Owner = "mallan67",
  [string]$Repo  = "mallan-nyc",
  [string]$GHToken = $env:GITHUB_TOKEN,
  [int]$AgeDays = 90,
  [switch]$AutoConfirm = $false,
  [string]$CloneDir = "$env:TEMP\$Repo-cleanup"
)

function Fail([string]$msg) {
  Write-Error $msg
  exit 1
}

if (-not $GHToken) {
  Fail "GITHUB_TOKEN (or -GHToken) is required for branch protection checks. Export GITHUB_TOKEN or pass -GHToken."
}

$protected = @("main","master","production","release","develop","staging","dev")
Write-Host "Protected branches: $($protected -join ', ')"

# Ensure clean directory
if (Test-Path $CloneDir) {
  Write-Host "Removing existing clone dir: $CloneDir"
  Remove-Item -Recurse -Force $CloneDir
}
Write-Host "Cloning https://github.com/$Owner/$Repo.git -> $CloneDir (shallow)"
$cloneCmd = "git clone https://github.com/$Owner/$Repo.git `"$CloneDir`" --depth 1"
$rc = cmd /c $cloneCmd
if ($LASTEXITCODE -ne 0) {
  Fail "git clone failed. Ensure git is installed and you have network access."
}

Push-Location $CloneDir
git fetch --all --prune

# Get all remote branches and committer dates
$raw = git for-each-ref --format='%(refname:short)|%(committerdate:iso8601)' refs/remotes/origin/ 2>$null
$branches = @()
foreach ($line in $raw) {
  if (-not $line) { continue }
  $parts = $line -split '\|'
  if ($parts.Count -lt 2) { continue }
  $ref = $parts[0]
  # skip HEAD alias
  if ($ref -match '^origin/HEAD') { continue }
  $bname = $ref -replace '^origin/',''
  $committerdate = $null
  try { $committerdate = Get-Date $parts[1] } catch { $committerdate = Get-Date }
  $branches += [pscustomobject]@{ FullRef=$ref; Name=$bname; CommitterDate=$committerdate }
}

# filter out protected branches
$branches = $branches | Where-Object { $protected -notcontains $_.Name }

# Determine merged branches (merged into origin/main if present)
Write-Host "`nDetermining branches merged into origin/main..."
$merged = @()
try {
  $mergedListRaw = git branch -r --merged origin/main 2>$null
  foreach ($l in $mergedListRaw) {
    $ln = $l.Trim()
    if ($ln -and -not ($ln -match 'origin/HEAD') -and -not ($ln -match 'origin/main') -and -not ($ln -match 'origin/master')) {
      $merged += ($ln -replace '^origin/','')
    }
  }
} catch {
  Write-Warning "Could not determine merged branches into origin/main. origin/main may not exist. Continuing with age-based candidates."
}

# Build plan: merged branches + old branches
$cutoff = (Get-Date).AddDays(-$AgeDays)
$oldBranches = $branches | Where-Object { $_.CommitterDate -lt $cutoff } | Select-Object -ExpandProperty Name

$toDelete = @()
$toDelete += ($merged | ForEach-Object { $_ })
$toDelete += ($oldBranches | ForEach-Object { $_ })
$toDelete = $toDelete | Where-Object { $_ } | Sort-Object -Unique

# Remove any protected or empty
$toDelete = $toDelete | Where-Object { $protected -notcontains $_ -and $_ -ne "" }

if ($toDelete.Count -eq 0) {
  Write-Host "No branches candidate for deletion (merged or older than $AgeDays days)."
  Pop-Location
  exit 0
}

Write-Host "`nCandidate branches for deletion (merged OR older than $AgeDays days):"
$toDelete | ForEach-Object { Write-Host " - $_" }

# Double-check protection via GitHub API and confirm
$finalDelete = @()
foreach ($b in $toDelete) {
  $url = "https://api.github.com/repos/$Owner/$Repo/branches/$b"
  try {
    $hdr = @{ Authorization = "token $GHToken"; 'User-Agent' = 'cleanup-branches-script' }
    $resp = Invoke-RestMethod -Headers $hdr -Uri $url -Method Get -ErrorAction Stop
    if ($resp.protected -eq $true) {
      Write-Host "[SKIP - protected] $b"
    } else {
      $finalDelete += $b
    }
  } catch {
    Write-Warning "[WARN] Could not fetch branch metadata for $b; skipping. $_"
  }
}

if ($finalDelete.Count -eq 0) {
  Write-Host "Nothing safe to delete after protection checks."
  Pop-Location
  exit 0
}

Write-Host "`nFinal delete candidates (after protection check):"
$finalDelete | ForEach-Object { Write-Host " * $_" }

if (-not $AutoConfirm) {
  $ok = Read-Host "Type 'YES' to delete these $($finalDelete.Count) remote branches"
  if ($ok -ne "YES") {
    Write-Host "Aborted by user. No branches deleted."
    Pop-Location
    exit 0
  }
}

# Perform deletion
foreach ($b in $finalDelete) {
  Write-Host "`nDeleting remote branch: $b"
  $pushCmd = "git push origin --delete `"$b`""
  $out = cmd /c $pushCmd
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Deleted origin/$b"
  } else {
    Write-Warning "[WARN] Failed to delete origin/$b. Command output: $out"
  }
}

# cleanup local remote refs
git remote prune origin

Pop-Location
Write-Host "`nDone."
