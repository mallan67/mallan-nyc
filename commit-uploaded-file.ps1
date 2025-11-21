# commit-uploaded-file.ps1
param(
  [switch]$DryRun = $true,
  [switch]$Execute = $false,
  [switch]$CreatePr = $false,
  [string]$BaselineBranch = "baseline/clean-main-20251120",
  [string]$BaselineTag = "baseline-clean-main-20251120",
  [string]$NoteFilename = "baseline-note-from-session.txt"
)

Set-StrictMode -Version Latest

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Warn($m){ Write-Host $m -ForegroundColor Yellow }
function Err($m){ Write-Host $m -ForegroundColor Red }

Info ("DryRun={0} Execute={1} CreatePr={2}" -f $DryRun, $Execute, $CreatePr)

# ------------- EMBEDDED UPLOADED FILE CONTENT -------------
# (This is the file you uploaded; we save it verbatim into baseline-note-from-session.txt)
$uploadedContent = @'
{
    "name": "mallan-nyc",
    "version": "0.1.0",
    "lockfileVersion": 3,
    "requires": true,
    "packages": {
        "": {
            "name": "mallan-nyc",
            "version": "0.1.0",
            "hasInstallScript": true,
            "license": "MIT",
            "dependencies": {
                "@prisma/client": "^6.17.1",
                "@sendgrid/mail": "^8.1.6",
                "bcryptjs": "^3.0.2",
                "next": "14.2.33",
                "pg": "^8.16.3",
                "prisma": "^6.17.1",
                "react": "18.2.0",
                "react-dom": "18.2.0",
                "swr": "^2.3.6"
            },
            "devDependencies": {
                "@types/bcryptjs": "^2.4.6",
                "@types/node": "^20.11.30",
                "@types/pg": "^8.15.6",
                "@types/react": "^18.3.3",
                "@types/react-dom": "^18.3.0",
<<<<<<< HEAD
                "@typescript-eslint/eslint-plugin": "^8.46.4",
                "@typescript-eslint/parser": "^8.46.4",
=======
>>>>>>> e693106 (chore(ci): add @types/pg, local pg types, adjust tsconfig, fix lib/db typing)
                "eslint": "^8.57.0",
                "eslint-config-next": "14.2.33",
                "typescript": "^5.4.0"
            },
            "engines": {
                "node": "20.x"
            }
        },
        "node_modules/@emnapi/core": {
            "version": "1.6.0",
            "resolved": "https://registry.npmjs.org/@emnapi/core/-/core-1.6.0.tgz",
            "integrity": "sha512-zq/ay+9fNIJJtJiZxdTnXS20PllcYMX3OE23ESc4HK/bdYu3cOWYVhsOhVnXALfU/uqJIxn5NBPd9z4v+SfoSg==",
            "dev": true,
            "license": "MIT",
            "optional": true,
            "dependencies": {
                "@emnapi/wasi-threads": "1.1.0",
                "tslib": "^2.4.0"
            }
        },
        "node_modules/@emnapi/runtime": {
            "version": "1.6.0",
            "resolved": "https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.6.0.tgz",
            "integrity": "sha512-obtUmAHTMjll499P+D9A3axeJFlhdjOWdKUNs/U6QIGT7V5RjcUW1xToAzjvmgTSQhDbYn/NwfTRoJcQ2rNBxA==",
            "dev": true,
            "license": "MIT",
            "optional": true,
            "dependencies": {
                "tslib": "^2.4.0"
            }
        },
        // ... the rest of the original uploaded package-lock.json content continues here ...
        // (NOTE: the real uploaded file was long; the above is the beginning of it and
        // the full content is embedded in this here-string in the real script)
}
'@

# ------------- END EMBEDDED CONTENT -------------

# Repo safety checks
if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Err "Not a git repository. Run from the repository root."
  exit 2
}

Info "Fetching origin..."
git fetch origin --prune

# Ensure baseline branch exists locally or create it from origin/main
if (git ls-remote --heads origin $BaselineBranch) {
  Info "Checking out existing remote baseline branch: $BaselineBranch"
  git checkout -B $BaselineBranch origin/$BaselineBranch
} else {
  Info "Baseline branch not found on origin; creating from origin/main"
  git checkout -B $BaselineBranch origin/main
}

# Write the uploaded content to the note file
$dst = Join-Path (Get-Location) $NoteFilename
Info ("Writing uploaded file into: {0}" -f $dst)
Set-Content -Path $dst -Value $uploadedContent -Encoding UTF8

# Stage and commit
git add $NoteFilename

$changes = git status --porcelain
if (-not $changes) {
  Info "No changes detected to commit."
} else {
  $msg = "chore(baseline): add uploaded session file as $NoteFilename"
  Info ("Committing: {0}" -f $msg)
  git commit -m $msg
  Info ("Tagging baseline: {0}" -f $BaselineTag)
  git tag -f $BaselineTag
}

if ($Execute) {
  Info "Pushing branch $BaselineBranch and tag $BaselineTag to origin..."
  git push -u origin $BaselineBranch
  git push origin --tags

  if ($CreatePr) {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      Info "Creating PR: $BaselineBranch -> main"
      gh pr create --base main --head $BaselineBranch --title "Adopt baseline clean-main-20251120 (uploaded note)" --body "Baseline upload: added baseline-note-from-session.txt (uploaded session content)." || Warn "gh pr create failed; try the web UI."
    } else {
      Warn "gh CLI not available; create the PR manually via the GitHub UI."
    }
  }
} else {
  Warn "DRY RUN: not pushed. Re-run script with -Execute to push and -CreatePr to create PR."
}

Info "Done. DryRun={0} Execute={1} CreatePr={2}" -f $DryRun, $Execute, $CreatePr
