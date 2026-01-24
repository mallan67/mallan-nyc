<#
manage-branches-auto.ps1

Safe, non-interactive branch processor:
- DryRun by default (no changes). Use -Execute to perform changes.
- Creates remote backups for branches with unique commits.
- Attempts to create PRs via gh api, falls back to cherry-pick -> tmp branch -> PR when needed.
- Optionally attempts to merge PRs via gh.

Requirements:
- gh CLI logged in (or set GITHUB_TOKEN env)
- git available
- Run from repo root (PowerShell)
#>

param(
  [string]$Owner = "mallan67",
  [string]$Repo  = "mallan-nyc",
  [string[]]$branchesToProcess = @(
    "ci/pg-types-fix",
    "feat/bootstrap-db-if-needed",
    "fix/add-debug-persist",
    "fix/build-unblocked",
    "fix/cleanup-rotate-ci-20251118234605",
    "wip-backup-202511102231",
    "wip-backup-202511102247",
    "wip/prisma-schema-seed"
  ),
  [switch]$DryRun = $true,
  [switch]$Execute = $false,
  [switch]$AutoMerge = $false,
  [switch]$AutoResolveConflicts = $false
)

function Write-Info($m){ Write-Host $m -ForegroundColor Cyan }
function Write-Warn($m){ Write-Host $m -ForegroundColor Yellow }
function Write-Err($m){ Write-Host $m -ForegroundColor Red }

# preflight
git fetch origin --prune
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Warn "gh not found. Script will try to use REST via GITHUB_TOKEN for PR creation, but gh is preferred."
}

# helper: make a safe branch-name
function Sanit($s){ return ($s -replace '[^A-Za-z0-9\-_\.]','-' -replace '/','-').Trim('-') }

# helper: create remote backup (creates a local branch and pushes it)
function Create-Backup($branch, $sha) {
  $san = Sanit($branch)
  $local = "backup-$san-backup-$(Get-Date -Format yyyyMMdd)"
  Write-Info (" -> creating local branch {0} -> {1}" -f $local, $sha)
  git branch -f $local $sha
  if ($DryRun) { Write-Warn "DRYRUN: would push $local to origin" ; return }
  git push -u origin $local
  if ($LASTEXITCODE -ne 0) { Write-Err ("Failed pushing backup {0}" -f $local) ; return $false }
  return $true
}

# helper: create PR via gh api or REST if gh missing
function Create-PR($head, $base, $title, $body) {
  Write-Info (" -> Creating PR {0} -> {1}" -f $head, $base)
  $out = $null
  $raw = $null
  try {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      $cmd = "gh api -X POST repos/$Owner/$Repo/pulls -f head=`"$head`" -f base=`"$base`" -f title=`"$title`" -f body=`"$body`""
      $raw = Invoke-Expression $cmd 2>&1
      $out = $raw | ConvertFrom-Json
    } else {
      $token = $env:GITHUB_TOKEN
      if (-not $token) { throw "No GITHUB_TOKEN and gh not installed." }
      $bodyJson = @{ head=$head; base=$base; title=$title; body=$body } | ConvertTo-Json -Depth 10
      $out = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/pulls" -Method Post -Headers @{ Authorization = "token $token"; 'User-Agent' = 'branch-agent' } -Body $bodyJson -ContentType 'application/json'
    }
    return $out
  } catch {
    $msg = $_.Exception.Message
    Write-Warn ("PR creation failed for {0} -> {1}: {2}" -f $head, $base, $msg)
    if ($raw) { Write-Warn $raw }
    return $null
  }
}

# helper: merge PR by number
function Merge-PR($num) {
  if ($DryRun) { Write-Warn ("DRYRUN: would attempt to merge PR #{0}" -f $num); return $true }
  try {
    gh pr merge $num --merge --delete-branch --admin --body "Merged by manage-branches-auto"
    return $true
  } catch {
    $msg = $_.Exception.Message
    Write-Warn ("Auto-merge failed for PR #{0}: {1}" -f $num, $msg)
    return $false
  }
}

# helper: create tmp branch from origin/main and cherry-pick unique commits
function Create-Temp-CherryPR($branch) {
  $ts = Get-Date -Format "yyyyMMddHHmmss"
  $tmp = "tmp/merge-$($branch -replace '/','-')-$ts"
  Write-Info (" -> Creating tmp branch {0} from origin/main" -f $tmp)
  git fetch origin --prune
  git checkout -B $tmp origin/main

  # find unique commits from branch relative to origin/main (oldest -> newest)
  $shas = (git rev-list --reverse origin/main..origin/$branch) -split "`n" | Where-Object { $_ -ne "" }
  if (-not $shas -or $shas.Count -eq 0) {
    Write-Warn ("No unique commits found for {0}, aborting tmp branch creation." -f $branch)
    return $null
  }

  foreach ($s in $shas) {
    Write-Info ("   cherry-picking {0}" -f $s)
    git cherry-pick $s
    if ($LASTEXITCODE -ne 0) {
      Write-Warn ("Cherry-pick conflict on {0}" -f $s)
      if ($AutoResolveConflicts) {
        $conflicts = git diff --name-only --diff-filter=U
        if ($conflicts) {
          $conflicts | ForEach-Object { git checkout --theirs -- $_; git add $_ }
          git cherry-pick --continue
          if ($LASTEXITCODE -ne 0) {
            Write-Err ("Auto-resolve failed for {0}. Stopping tmp creation." -f $s)
            return $null
          }
        } else {
          Write-Err "No conflicted files but cherry-pick still failed. Stopping."
          return $null
        }
      } else {
        Write-Warn ("Automated flow won't continue: manual conflict resolution required for {0}. Leaving tmp branch for inspection: {1}" -f $s, $tmp)
        return $tmp
      }
    }
  }

  # push tmp branch
  if ($DryRun) {
    Write-Warn ("DRYRUN: would push tmp branch {0}" -f $tmp)
    return $tmp
  }
  git push -u origin $tmp
  if ($LASTEXITCODE -ne 0) {
    Write-Err ("Failed to push tmp branch {0}" -f $tmp)
    return $null
  }
  return $tmp
}

# main loop
$Protected = @("main","master","develop","production","staging","release","dev")
foreach ($b in $branchesToProcess) {
  Write-Host ""
  Write-Host ("========== Processing: {0} ==========" -f $b) -ForegroundColor Yellow

  # skip protected/default
  if ($Protected -contains $b) { Write-Warn ("Skipping protected branch {0}" -f $b); continue }

  # check remote exists
  $exists = git ls-remote --heads origin $b
  if (-not $exists) { Write-Warn ("origin/{0} not found, skipping." -f $b); continue }
  $sha = ($exists -split "`t")[0].Trim()

  # count unique commits and print sample
  $uniqueCount = 0
  try { $uniqueCount = [int](git rev-list --count origin/main..origin/$b 2>$null) } catch { $uniqueCount = 0 }
  Write-Info ("Remote SHA: {0} ; unique commits vs origin/main: {1}" -f $sha, $uniqueCount)

  if ($uniqueCount -eq 0) {
    Write-Info "No unique commits; branch appears redundant. Recommend deletion (kept remote backup if needed)."
    if ($Execute -and -not $DryRun) {
      Write-Info ("Deleting origin/{0}..." -f $b)
      git push origin --delete $b
    } else {
      Write-Warn "DRYRUN or not Execute: skipping delete."
    }
    continue
  }

  # ensure backup exists (push backup local branch if not present)
  $backupName = "backup-$($b -replace '/','-')-backup-$(Get-Date -Format yyyyMMdd)"
  $remoteBackupExists = (git ls-remote --heads origin $backupName)
  if (-not $remoteBackupExists) {
    Write-Info ("Backup not found on origin. Creating backup for {0}..." -f $b)
    if (-not $DryRun -and $Execute) {
      $ok = Create-Backup $b $sha
      if (-not $ok) { Write-Err ("Backup failed for {0}; skipping." -f $b) ; continue }
    } else {
      Write-Warn ("DRYRUN: would create backup {0} for {1}" -f $backupName, $b)
    }
  } else {
    Write-Info ("Backup already exists: {0}" -f $backupName)
  }

  # Try to create PR directly
  $title = ("Merge {0} into main" -f $b)
  $body  = ("Automated PR merging {0} into main (review/CI required)." -f $b)
  if ($DryRun) {
    Write-Warn ("DRYRUN: would create PR for {0} -> main" -f $b)
    continue
  }

  $pr = Create-PR $b "main" $title $body
  if ($pr -ne $null -and $pr.number) {
    $prNum = $pr.number
    Write-Info ("PR created: #{0} -> {1}" -f $prNum, $pr.html_url)
    if ($Execute -and $AutoMerge) { Merge-PR $prNum | Out-Null }
    continue
  } else {
    Write-Warn ("Direct PR creation failed or returned no PR for {0}. Will attempt cherry-pick onto tmp branch and PR that." -f $b)
    $tmp = Create-Temp-CherryPR $b
    if (-not $tmp) { Write-Err ("Failed to create tmp branch for {0}; manual review required." -f $b); continue }
    # create PR from tmp -> main
    $pr2 = Create-PR $tmp "main" ("Merge {0} into main (cherry-pick)" -f $b) ("Cherry-pick of commits from {0} -> {1} for merge into main." -f $b, $tmp)
    if ($pr2 -ne $null -and $pr2.number) {
      Write-Info ("PR created from {0}: #{1} {2}" -f $tmp, $pr2.number, $pr2.html_url)
      if ($Execute -and $AutoMerge) { Merge-PR $pr2.number | Out-Null }
    } else {
      Write-Warn ("Failed to create PR from tmp branch {0}. Leave it for manual review." -f $tmp)
    }
  }
}

Write-Host ("`nAll done. DryRun={0} Execute={1} AutoMerge={2}" -f $DryRun, $Execute, $AutoMerge) -ForegroundColor Green
