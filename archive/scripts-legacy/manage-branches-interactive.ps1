<#
manage-branches-interactive.ps1 (fixed)
Interactive branch reviewer: create PRs and optionally auto-merge, or merge locally, delete, or skip.
Run from repository root in Windows PowerShell.
#>

Set-StrictMode -Version Latest

# --- Branch list to process (edit if needed) ---
$branchesToProcess = @(
  "ci/pg-types-fix",
  "feat/bootstrap-db-if-needed",
  "fix/add-debug-persist",
  "fix/build-unblocked",
  "fix/cleanup-rotate-ci-20251118234605",
  "wip-backup-202511102231",
  "wip-backup-202511102247",
  "wip/prisma-schema-seed"
)

# Protected/default branch names
$Protected = @("main","master","develop","production","staging","release","dev")

# Default branch detection (uses gh if present)
if (Get-Command gh -ErrorAction SilentlyContinue) {
  try {
    $default = gh api repos/mallan67/mallan-nyc --jq .default_branch
  } catch {
    $default = "main"
  }
} else {
  $default = "main"
}
Write-Host ("`nDefault branch detected: {0}" -f $default) -ForegroundColor Cyan

# Ensure we have latest remote refs
git fetch origin --prune

function Show-BranchSummary($branch) {
  Write-Host ("`n========== Branch: {0} ==========" -f $branch) -ForegroundColor Yellow

  # does origin/branch exist?
  $exists = git ls-remote --heads origin $branch
  if (-not $exists) {
    Write-Host ("Remote branch origin/{0} not found. Skipping." -f $branch) -ForegroundColor Red
    return @{ Exists = $false }
  }

  $existsSha = ($exists -split "`t")[0].Trim()
  Write-Host ("Remote SHA: {0}" -f $existsSha)

  # commits unique to branch (origin/main..origin/branch)
  $uniqueCount = 0
  try { $uniqueCount = [int](git rev-list --count origin/$default..origin/$branch 2>$null) } catch { $uniqueCount = 0 }
  Write-Host ("Commits unique to origin/{0} vs origin/{1} : {2}" -f $branch, $default, $uniqueCount)

  if ($uniqueCount -gt 0) {
    Write-Host "`nMost recent unique commits (top 8):"
    git log --pretty=format:"%h %ad %an %s" --date=short origin/$default..origin/$branch -n 8 | ForEach-Object { Write-Host ("  {0}" -f $_) }
  } else {
    Write-Host "  No commits unique to this branch (may already be in $default)." -ForegroundColor Green
  }

  Write-Host "`nFiles changed vs origin/$default (sample up to 50):"
  $diffFiles = git diff --name-status origin/$default..origin/$branch 2>$null
  if (-not $diffFiles) {
    Write-Host "  <no file differences detected>" -ForegroundColor Gray
  } else {
    $diffFiles -split "`n" | Select-Object -First 50 | ForEach-Object { Write-Host ("  {0}" -f $_) }
  }

  return @{ Exists = $true; Sha = $existsSha; UniqueCount = $uniqueCount }
}

function CreateAndMaybeMergePR($branch, $autoMerge = $false) {
  Write-Host ""
  Write-Host ("Creating PR for {0} -> {1} ..." -f $branch, $default)
  try {
    # Use gh api to create the PR (works across gh versions)
    $apiCmd = "gh api -X POST repos/mallan67/mallan-nyc/pulls -f head='{0}' -f base='{1}' -f title='{2}' -f body='{3}'" -f $branch, $default, ("Merge {0} into {1}" -f $branch, $default), ("Automated PR: merging {0} into {1}. Review/CI required." -f $branch, $default)
    # Execute and parse JSON
    $out = Invoke-Expression $apiCmd
    $pr = $out | ConvertFrom-Json
    if (-not $pr.number) {
      Write-Host ("Failed to create PR for {0}: API did not return PR number." -f $branch) -ForegroundColor Red
      return $null
    }
    $prNumber = $pr.number
    $prUrl = $pr.html_url
    Write-Host ("PR created: #{0} -> {1}" -f $prNumber, $prUrl) -ForegroundColor Green
  } catch {
    $msg = $_.Exception.Message
    Write-Host ("Failed to create PR for {0}: {1}" -f $branch, $msg) -ForegroundColor Red
    return $null
  }

  if ($autoMerge) {
    Write-Host ("Attempting to merge PR #{0}..." -f $prNumber)
    try {
      # Use gh pr merge; if blocked this will throw
      gh pr merge $prNumber --merge --delete-branch --admin --body "Merged by automation"
      Write-Host ("PR #{0} merged and branch deleted (if allowed)." -f $prNumber) -ForegroundColor Green
    } catch {
      $msg = $_.Exception.Message
      Write-Host ("Auto-merge failed for PR #{0}: {1}" -f $prNumber, $msg) -ForegroundColor Yellow
      Write-Host ("Please review PR #{0} in the GitHub UI to resolve conflicts / policy checks." -f $prNumber)
    }
  }

  return $prNumber
}

function MergeLocallyIntoMain($branch) {
  Write-Host ""
  Write-Host ("Merging origin/{0} into local {1} (you may need to resolve conflicts)..." -f $branch, "main")
  git checkout main
  git pull origin main
  try {
    git merge --no-ff origin/$branch -m ("Merge origin/{0} into {1}" -f $branch, "main")
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Merge command returned non-zero exit. You may have conflicts to resolve." -ForegroundColor Yellow
      return $false
    }
    git push origin main
    Write-Host ("Merged origin/{0} into main and pushed." -f $branch) -ForegroundColor Green
    return $true
  } catch {
    $msg = $_.Exception.Message
    Write-Host ("Local merge failed: {0}" -f $msg) -ForegroundColor Red
    return $false
  }
}

function DeleteRemoteBranch($branch) {
  Write-Host ("Deleting remote branch origin/{0} ..." -f $branch)
  git push origin --delete $branch
  if ($LASTEXITCODE -eq 0) { Write-Host ("Deleted origin/{0}" -f $branch) -ForegroundColor Green } else { Write-Host ("Failed to delete origin/{0}" -f $branch) -ForegroundColor Red }
}

# Main interactive loop
foreach ($b in $branchesToProcess) {
  if ($Protected -contains $b -or $b -eq $default) {
    Write-Host ""
    Write-Host ("Skipping protected or default branch: {0}" -f $b) -ForegroundColor Yellow
    continue
  }

  $summary = Show-BranchSummary $b
  if (-not $summary.Exists) { continue }

  if ($summary.UniqueCount -eq 0) {
    Write-Host ""
    Write-Host "Recommendation: branch appears redundant (no unique commits). Safe to delete or skip." -ForegroundColor Cyan
  } else {
    Write-Host ""
    Write-Host ("Recommendation: branch has {0} unique commit(s). Consider creating a PR and merging." -f $summary.UniqueCount) -ForegroundColor Cyan
  }

  Write-Host ""
  Write-Host ("Choose action for {0}:" -f $b)
  Write-Host "  [M] Create PR and attempt to MERGE now (will try to delete branch on success)"
  Write-Host "  [P] Create PR only (do not merge)"
  Write-Host "  [L] Merge locally into main and push (may require you to resolve conflicts)"
  Write-Host "  [D] Delete remote branch (you have backups)"
  Write-Host "  [K] Keep / skip (do nothing for now)"
  $choice = Read-Host "Type M/P/L/D/K (default K)"

  switch ($choice.ToUpper()) {
    "M" {
      $am = Read-Host "Auto-merge the PR immediately after creation? (Y/N) (default Y)"
      if ($am.ToUpper() -in @("","Y")) { $prNum = CreateAndMaybeMergePR $b $true } else { $prNum = CreateAndMaybeMergePR $b $false }
    }
    "P" {
      $prNum = CreateAndMaybeMergePR $b $false
    }
    "L" {
      $ok = MergeLocallyIntoMain $b
      if (-not $ok) { Write-Host "Local merge did not complete cleanly; please resolve locally and then push." -ForegroundColor Yellow }
    }
    "D" {
      $confirm = Read-Host "Type YES to confirm deletion of origin/$b (backups exist). Anything else aborts."
      if ($confirm -eq "YES") { DeleteRemoteBranch $b } else { Write-Host "Aborted delete." }
    }
    default { Write-Host ("Keeping {0} unchanged." -f $b) }
  }

  Write-Host ("`n---- completed processing {0} ----`n" -f $b)
}

Write-Host "`nAll branches processed. If you created PRs, check GitHub for review/CI. If you merged locally, double-check and push completed state." -ForegroundColor Green
