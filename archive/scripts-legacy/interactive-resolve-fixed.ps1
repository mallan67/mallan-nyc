Set-StrictMode -Version Latest

$conflicts = git diff --name-only --diff-filter=U
if (-not $conflicts -or $conflicts.Count -eq 0) {
  Write-Host "No conflicted files found." -ForegroundColor Green
  return
}

foreach ($f in $conflicts) {
  Write-Host "`n========================"
  Write-Host ("File: {0}" -f $f) -ForegroundColor Cyan

  Write-Host "`n--- OURS (index 2) ---" -ForegroundColor Yellow
  try { git show (":2:$f") | Select-Object -First 200 | ForEach-Object { Write-Host $_ } } catch { Write-Host "  <no OURS preview>" }

  Write-Host "`n--- THEIRS (index 3) ---" -ForegroundColor Yellow
  try { git show (":3:$f") | Select-Object -First 200 | ForEach-Object { Write-Host $_ } } catch { Write-Host "  <no THEIRS preview>" }

  Write-Host ""
  Write-Host ("Choose action for {0}: [O]urs / [T]heirs / [E]dit (default T)" -f $f) -ForegroundColor Cyan
  $choice = Read-Host "Type O/T/E"

  switch ($choice.ToUpper()) {
    "O" {
      git checkout --ours -- $f
      git add $f
      Write-Host ("Selected OURS for {0}" -f $f) -ForegroundColor Green
    }
    "E" {
      Write-Host ("Opening {0} in Notepad -- edit and save, then close Notepad when done." -f $f) -ForegroundColor Cyan
      notepad $f
      git add $f
      Write-Host ("Staged edited {0}" -f $f) -ForegroundColor Green
    }
    default {
      git checkout --theirs -- $f
      git add $f
      Write-Host ("Selected THEIRS for {0}" -f $f) -ForegroundColor Green
    }
  }
}

Write-Host "`nAll conflicted files staged. Status:" -ForegroundColor Cyan
git status --porcelain

# Continue a cherry-pick/merge if in progress
$inCherry = (git rev-parse --verify --quiet CHERRY_PICK_HEAD) -eq 0
$inMerge  = (git rev-parse --verify --quiet MERGE_HEAD) -eq 0

if ($inCherry) {
  Write-Host "Continuing cherry-pick..." -ForegroundColor Cyan
  git cherry-pick --continue
} elseif ($inMerge) {
  Write-Host "Continuing merge..." -ForegroundColor Cyan
  git merge --continue
} else {
  Write-Host "Committing resolved files..." -ForegroundColor Cyan
  git commit -m "Resolve conflicts (manual): accept user choices"
}
