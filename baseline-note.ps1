param(
  [switch]$DryRun = $true,
  [switch]$Execute = $false,
  [switch]$CreatePr = $false,
  [string]$UploadedPath = "",                         # Local path if you downloaded the uploaded file
  [string]$NoteFilename = "baseline-note-from-session.txt",
  [string]$BaselineBranch = "baseline/clean-main-20251120",
  [string]$BaselineTag = "baseline-clean-main-20251120",
  [string]$Owner = "mallan67",
  [string]$Repo  = "mallan-nyc"
)

Set-StrictMode -Version Latest
function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Warn($m){ Write-Host $m -ForegroundColor Yellow }
function Err($m){ Write-Host $m -ForegroundColor Red }

Info "DryRun=$DryRun Execute=$Execute CreatePr=$CreatePr"

# 1. Ensure we're in a git repo
try {
  $inside = git rev-parse --is-inside-work-tree 2>$null
} catch {
  Err "Not a git repository or git not in PATH. Run from repo root."
  exit 2
}

# 2. Fetch and checkout baseline branch (create local if needed)
Info "Fetching origin..."
git fetch origin --prune

if ( (git ls-remote --heads origin $BaselineBranch) -ne $null ) {
  Info "Checking out existing remote baseline branch: $BaselineBranch"
  git checkout -B $BaselineBranch origin/$BaselineBranch
} else {
  Info "Baseline branch not on origin; creating local baseline branch from origin/main"
  git checkout -B $BaselineBranch origin/main
}

# 3. Create the note file content
$dst = Join-Path (Get-Location) $NoteFilename
$contentWritten = $false

if ($UploadedPath -and (Test-Path $UploadedPath)) {
  Info "Copying uploaded file from '$UploadedPath' -> '$dst'"
  Copy-Item -Path $UploadedPath -Destination $dst -Force
  $contentWritten = $true
} else {
  Warn "No local uploaded file found at '$UploadedPath'."
  Info "If you downloaded the uploaded file to your machine, re-run with -UploadedPath '<path>'."
  Info "Alternatively, paste the file content now. After pasting press Ctrl+Z then Enter to finish."
  $pasted = [Console]::In.ReadToEnd()
  if ($pasted -and $pasted.Trim().Length -gt 0) {
    Set-Content -Path $dst -Value $pasted -Encoding UTF8
    $contentWritten = $true
    Info "Wrote pasted content to $dst"
  } else {
    Warn "No content pasted. Aborting."
    exit 1
  }
}

if (-not $contentWritten) {
  Err "Failed to create note file."
  exit 3
}

# 4. Stage and commit
git add $NoteFilename
$haveChanges = (git status --porcelain) -ne $null -and (git status --porcelain).Trim() -ne ""
if (-not $haveChanges) {
  Info "Nothing to commit."
} else {
  $msg = "chore(baseline): add baseline note from session ($NoteFilename)"
  if ($DryRun) {
    Warn "DRYRUN: would commit with message: $msg"
  } else {
    Info "Committing: $msg"
    git commit -m $msg
  }
}

# 5. Tag locally
Info "Creating/updating tag $BaselineTag (local)"
git tag -f $BaselineTag

# 6. Push if requested
if ($Execute) {
  Info "Pushing branch $BaselineBranch and tag $BaselineTag to origin..."
  git push -u origin $BaselineBranch
  git push origin --tags

  if ($CreatePr) {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      Info "Creating PR: $BaselineBranch -> main"
      try {
        gh pr create --base main --head $BaselineBranch --title "Adopt baseline clean-main-20251120" --body "Adopt clean-main as canonical baseline. Build verified." 2>$null
        Info "PR creation attempted via gh CLI. Check gh output for URL."
      } catch {
        Warn "gh pr create failed. Please create the PR manually from $BaselineBranch -> main."
      }
    } else {
      Warn "gh CLI not available; create the PR via GitHub web UI from $BaselineBranch -> main."
    }
  }
} else {
  Warn "DRY RUN: No push performed. Re-run with -Execute to push and -CreatePr to create PR."
}

Info "Done. DryRun=$DryRun Execute=$Execute CreatePr=$CreatePr"
