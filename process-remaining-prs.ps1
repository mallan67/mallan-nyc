<#
process-remaining-prs.ps1

Creates tmp cherry branches from origin/main for feature branches,
cherry-picks commits (oldest->newest), auto-resolves conflicts by taking THEIRS,
pushes tmp branches and creates PRs (tmp -> main).

Usage:
  # Dry run (default)
  .\process-remaining-prs.ps1

  # Actually perform changes (push & create PRs)
  .\process-remaining-prs.ps1 -Execute

  # Execute and auto-merge created PRs (requires gh & rights)
  .\process-remaining-prs.ps1 -Execute -AutoMerge
#>
Set-StrictMode -Version Latest

param(
  [string[]]$Branches = @(
    "feat/bootstrap-db-if-needed",
    "fix/cleanup-rotate-ci-20251118234605",
    "wip/prisma-schema-seed"
  ),
  [switch]$DryRun = $true,
  [switch]$Execute = $false,
  [switch]$AutoResolveConflicts = $true,
  [switch]$AutoMerge = $false,
  [string]$Owner = "mallan67",
  [string]$Repo  = "mallan-nyc"
)

function Write-Info([string]$m){ Write-Host $m -ForegroundColor Cyan }
function Write-Warn([string]$m){ Write-Host $m -ForegroundColor Yellow }
function Write-Err([string]$m){ Write-Host $m -ForegroundColor Red }

# preflight
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err "git not found in PATH. Aborting."
  exit 2
}
$HasGh = (Get-Command gh -ErrorAction SilentlyContinue) -ne $null
if (-not $HasGh -and -not $env:GITHUB_TOKEN) {
  Write-Warn "gh not available and GITHUB_TOKEN not set. PR creation via REST will fail if attempted."
}

Write-Info "Fetching origin..."
git fetch origin --prune

# helper: sanitize branch name for backup
function Sanit([string]$s) {
  return ($s -replace '[^A-Za-z0-9\-_\.]','-' -replace '/','-').Trim('-')
}

# helper: create backup local branch and optionally push
function Create-Backup([string]$branch, [string]$sha) {
  $san = Sanit($branch)
  $local = "backup-$san-backup-$(Get-Date -Format yyyyMMdd)"
  Write-Info (" -> creating local branch {0} -> {1}" -f $local, $sha)
  git branch -f $local $sha
  if ($DryRun) {
    Write-Warn ("DRYRUN: would push {0} to origin" -f $local)
    return $true
  }
  git push -u origin $local
  if ($LASTEXITCODE -ne 0) { Write-Err ("Failed pushing backup {0}" -f $local); return $false }
  return $true
}

# helper: create PR (prefer gh api, fallback to REST)
function Create-PR([string]$head, [string]$base, [string]$title, [string]$body) {
  Write-Info (" -> Creating PR {0} -> {1}" -f $head, $base)
  $out = $null
  $raw = $null
  try {
    if ($HasGh) {
      # Use gh api (returns JSON)
      $cmd = "gh api -X POST repos/$Owner/$Repo/pulls -f head=`"$head`" -f base=`"$base`" -f title=`"$title`" -f body=`"$body`""
      $raw = Invoke-Expression $cmd 2>&1
      if ($raw) {
        try { $out = $raw | ConvertFrom-Json } catch { $out = $null }
      }
    } else {
      if (-not $env:GITHUB_TOKEN) { throw "No gh and no GITHUB_TOKEN." }
      $bodyJson = @{ head=$head; base=$base; title=$title; body=$body } | ConvertTo-Json -Depth 10
      $out = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/pulls" -Method Post -Headers @{ Authorization = ("token {0}" -f $env:GITHUB_TOKEN); 'User-Agent' = 'branch-agent' } -Body $bodyJson -ContentType 'application/json'
    }
    return $out
  } catch {
    $errMsg = $_.Exception.Message
    Write-Warn ("PR creation failed for {0}: {1}" -f $head, $errMsg)
    if ($raw) { Write-Warn $raw }
    return $null
  }
}

# helper: get PR number by head ref (safe PowerShell)
function Get-PR-NumberByHead([string]$head) {
  if (-not $HasGh -and -not $env:GITHUB_TOKEN) {
    return $null
  }
  try {
    if ($HasGh) {
      $raw = gh pr list --state open --json number,headRefName 2>$null
      if ($raw) {
        $arr = $raw | ConvertFrom-Json
        $match = $arr | Where-Object { $_.headRefName -eq $head }
        if ($match) { return $match.number }
      }
    } else {
      # REST: use pulls endpoint filtering by head=owner:head
      $uri = "https://api.github.com/repos/$Owner/$Repo/pulls?state=open&head=$Owner`:$head"
      $resp = Invoke-RestMethod -Uri $uri -Method Get -Headers @{ Authorization = ("token {0}" -f $env:GITHUB_TOKEN); 'User-Agent'='branch-agent' }
      if ($resp -and $resp.Count -gt 0) { return $resp[0].number }
    }
  } catch {
    return $null
  }
  return $null
}

# main loop
$Protected = @("main","master","develop","production","staging","release","dev")
foreach ($branch in $Branches) {
  Write-Host ""
  Write-Info ("=== Processing branch: {0} ===" -f $branch)

  if ($Protected -contains $branch) {
    Write-Warn ("Skipping protected branch {0}" -f $branch)
    continue
  }

  # ensure remote branch exists
  $exists = git ls-remote --heads origin $branch
  if (-not $exists) {
    Write-Warn ("origin/{0} not found. Skipping." -f $branch)
    continue
  }
  $sha = ($exists -split "`t")[0].Trim()
  Write-Info ("origin/{0} -> {1}" -f $branch, $sha)

  # count unique commits vs origin/main
  $uniqueCount = 0
  try { $uniqueCount = [int](git rev-list --count origin/main..origin/$branch 2>$null) } catch { $uniqueCount = 0 }
  Write-Info ("Unique commits vs origin/main: {0}" -f $uniqueCount)
  if ($uniqueCount -eq 0) {
    Write-Info "No unique commits; branch appears redundant. Skipping."
    continue
  }

  # ensure backup exists on origin
  $backupName = "backup-$($branch -replace '/','-')-backup-$(Get-Date -Format yyyyMMdd)"
  $remoteBackupExists = (git ls-remote --heads origin $backupName)
  if (-not $remoteBackupExists) {
    Write-Info ("Backup not found on origin. Creating backup for {0}..." -f $branch)
    if (-not $DryRun -and $Execute) {
      $ok = Create-Backup $branch $sha
      if (-not $ok) { Write-Err ("Backup failed for {0}; skipping." -f $branch); continue }
    } else {
      Write-Warn ("DRYRUN: would create backup {0} for {1}" -f $backupName, $branch)
    }
  } else {
    Write-Info ("Backup already exists: {0}" -f $backupName)
  }

  # create tmp branch
  $ts = Get-Date -Format "yyyyMMddHHmmss"
  $tmp = "tmp/cherry-$($branch -replace '/','-')-$ts"
  Write-Info ("Will create tmp branch: {0}" -f $tmp)
  if ($DryRun) {
    Write-Warn ("DRYRUN: would checkout -B {0} origin/main" -f $tmp)
  } else {
    git checkout -B $tmp origin/main
    if ($LASTEXITCODE -ne 0) { Write-Err ("Failed to create tmp branch {0}" -f $tmp); continue }
  }

  # cherry-pick commits oldest->newest
  $shas = (git rev-list --reverse origin/main..origin/$branch) -split "`n" | Where-Object { $_ -ne "" }
  foreach ($s in $shas) {
    Write-Info ("Cherry-pick {0}" -f $s)
    if ($DryRun) {
      Write-Warn ("DRYRUN: would run 'git cherry-pick {0}'" -f $s)
      continue
    }

    git cherry-pick $s
    if ($LASTEXITCODE -eq 0) {
      Write-Info "Cherry-pick succeeded."
    } else {
      Write-Warn "Cherry-pick produced conflicts."
      if ($AutoResolveConflicts) {
        $conflicts = git diff --name-only --diff-filter=U
        if ($conflicts) {
          foreach ($f in $conflicts) {
            Write-Info ("  Accepting THEIRS for {0}" -f $f)
            git checkout --theirs -- $f
            git add $f
          }
          git cherry-pick --continue
          if ($LASTEXITCODE -ne 0) { Write-Err ("Auto-resolve failed for {0}. Stopping this branch." -f $s); break }
          Write-Info "Auto-resolve continued cherry-pick."
        } else {
          Write-Err "No conflicted files listed but cherry-pick failed. Stopping."
          break
        }
      } else {
        Write-Err ("Manual conflict resolution required for {0}. Leaving tmp branch for review: {1}" -f $s, $tmp)
        break
      }
    }
  } # commits loop

  # after cherry-picks: push & create PR
  if ($DryRun -or -not $Execute) {
    Write-Warn ("DRYRUN or not Execute: would push {0} and create PR for {1} -> main" -f $tmp, $branch)
    continue
  }

  Write-Info ("Pushing {0} -> origin/{0}" -f $tmp)
  git push -u origin $tmp
  if ($LASTEXITCODE -ne 0) { Write-Err ("Push failed for {0}. Skipping PR creation." -f $tmp); continue }

  # create PR
  $title = ("Merge {0} into main (cherry-pick)" -f $branch)
  $body  = ("Cherry-pick of commits from {0} -> {1} (auto-resolved conflicts to feature version)." -f $branch, $tmp)

  $prObj = Create-PR $tmp "main" $title $body
  if ($prObj -ne $null) {
    # gh api returned JSON object; REST returned object - both have .number/html_url
    $prNum = $null
    $prUrl = $null
    try {
      if ($prObj.number) { $prNum = $prObj.number }
      if ($prObj.html_url) { $prUrl = $prObj.html_url }
    } catch {}

    if (-not $prNum) {
      # try to resolve by listing PRs
      $prNum = Get-PR-NumberByHead $tmp
    }
    if ($prNum) {
      Write-Info ("PR created: #{0} -> {1}" -f $prNum, ($prUrl -ne $null) ? $prUrl : "<no-url-returned>")
      if ($AutoMerge) {
        Write-Info ("Attempting to merge PR #{0} ..." -f $prNum)
        try {
          gh pr merge $prNum --merge --delete-branch --admin --body "Merged by automation (cherry-pick)" 2>&1 | Out-Null
          Write-Info ("Merged PR #{0}" -f $prNum)
        } catch {
          $m = $_.Exception.Message
          Write-Warn ("Auto-merge failed for PR #{0}: {1}" -f $prNum, $m)
        }
      }
    } else {
      Write-Warn "PR created but number could not be determined. Please inspect origin/$tmp in GitHub UI."
    }
  } else {
    Write-Warn ("PR creation returned no object for {0}. Leave tmp branch for manual review." -f $tmp)
  }

} # end foreach branch

Write-Host ""
Write-Info ("All done. DryRun={0} Execute={1} AutoMerge={2}" -f $DryRun, $Execute, $AutoMerge)
