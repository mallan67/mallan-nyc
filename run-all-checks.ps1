# run-all-checks.ps1
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-all-checks.ps1

$OutFile = "dependency-check-output.txt"
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

function Log($s) {
  $s | Tee-Object -FilePath $OutFile -Append
}

"=== mallan.nyc dependency & schema quick-check - $(Get-Date) ===" | Out-File $OutFile

# --- 1) Declared versions in package.json files
Log "`n--- Declared versions (package.json files) ---`n"
function ShowPkgVersion($path) {
  if (Test-Path $path) {
    try {
      $json = Get-Content $path -Raw | ConvertFrom-Json
      $next = $json.dependencies.next
      $react = $json.dependencies.react
      Log "$path -> next: $($next -ne $null ? $next : '(not declared)')"
      Log "$path -> react: $($react -ne $null ? $react : '(not declared)')"
    } catch {
      Log "$path -> (error reading JSON): $_"
    }
  } else {
    Log "$path -> (not found)"
  }
}
ShowPkgVersion ".\package.json"
ShowPkgVersion ".\frontend\package.json"
ShowPkgVersion ".\app\package.json"

# --- 2) Installed versions in node_modules (npm ls) ---
Log "`n--- Installed (npm ls) top-level versions (root) ---`n"
try {
  npm ls next react --depth=0 2>&1 | Tee-Object -FilePath $OutFile -Append
} catch {
  Log "npm ls at repo root failed: $_"
}

if (Test-Path .\frontend) {
  Log "`n--- Installed (npm ls) top-level versions (frontend/) ---`n"
  Push-Location .\frontend
  try { npm ls next react --depth=0 2>&1 | Tee-Object -FilePath "..\$OutFile" -Append } catch { Log "frontend npm ls failed: $_" }
  Pop-Location
}

# --- 3) Lockfile scan for React 19 or Next 15/16 ---
Log "`n--- Scan package-lock.json (root & frontend) for React 19 or Next 15/16 ---`n"
if (Test-Path .\package-lock.json) {
  Select-String -Path .\package-lock.json -Pattern '"react"\s*:\s*"[^\d]*19' -AllMatches | Tee-Object -FilePath $OutFile -Append
  Select-String -Path .\package-lock.json -Pattern '"next"\s*:\s*"[^\d]*(15|16)\.' -AllMatches | Tee-Object -FilePath $OutFile -Append
} else { Log "No root package-lock.json found." }

if (Test-Path .\frontend\package-lock.json) {
  Select-String -Path .\frontend\package-lock.json -Pattern '"react"\s*:\s*"[^\d]*19' -AllMatches | Tee-Object -FilePath $OutFile -Append
  Select-String -Path .\frontend\package-lock.json -Pattern '"next"\s*:\s*"[^\d]*(15|16)\.' -AllMatches | Tee-Object -FilePath $OutFile -Append
} else { Log "No frontend/package-lock.json found." }

# --- 4) npm outdated & npm audit (quick) ---
Log "`n--- npm outdated (root) ---`n"
try { npm outdated --depth=0 2>&1 | Tee-Object -FilePath $OutFile -Append } catch { Log "npm outdated failed: $_" }

Log "`n--- npm audit summary (root, level moderate) ---`n"
try { npm audit --audit-level=moderate 2>&1 | Tee-Object -FilePath $OutFile -Append } catch { Log "npm audit failed: $_" }

# --- 5) Prisma schema checks for Building/Listing/Document/Showing/AuditLog/Commission closing fields ---
Log "`n--- Prisma schema scans (prisma/schema.prisma & prisma/schema.local.prisma) ---`n"
$prismaFiles = @('.\prisma\schema.prisma', '.\prisma\schema.local.prisma')
foreach ($f in $prismaFiles) {
  if (Test-Path $f) {
    Log "`n$f present - scanning for key models/fields..."
    # Check for model Building
    Select-String -Path $f -Pattern 'model\s+Building' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'accessPolicy|access_policy' -AllMatches | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'model\s+Showing' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'model\s+KeyCustody' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'model\s+ManagementConfirmation' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'model\s+AuditLog' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    # Document fields
    Select-String -Path $f -Pattern 'model\s+Document' -SimpleMatch | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'origin' -AllMatches | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'encrypted' -AllMatches | Tee-Object -FilePath $OutFile -Append
    Select-String -Path $f -Pattern 'redactedUrl|redacted_url' -AllMatches | Tee-Object -FilePath $OutFile -Append
    # Commission closing fields
    Select-String -Path $f -Pattern 'closingConfirmedBy|closing_confirmed_by|closingConfirmedAt|closing_confirmed_at' -AllMatches | Tee-Object -FilePath $OutFile -Append
  } else {
    Log "$f not found"
  }
}

# --- 6) Quick sniff for common secrets (non-exhaustive) ---
Log "`n--- Quick secret sniff (search for AWS/OPENAI/SECRET patterns) ---`n"
$patterns = @('AWS_SECRET_ACCESS_KEY','AWS_ACCESS_KEY_ID','OPENAI_API_KEY','NEXTAUTH_SECRET','JWT_SECRET','DOCUSIGN_CLIENT_SECRET','TWILIO_AUTH_TOKEN')
foreach ($p in $patterns) {
  $matches = Select-String -Path .\* -Pattern $p -SimpleMatch -Recurse -ErrorAction SilentlyContinue | Select-Object -First 20
  if ($matches) {
    Log "FOUND possible secret token marker '$p' in repo (first 20 matches):"
    $matches | ForEach-Object { Log ("  " + $_.Path + ":" + $_.LineNumber) }
  } else {
    Log "No occurrences of '$p' found."
  }
}

# --- 7) Quick grep for lockbox mention (sanity) and showings mention -->
Log "`n--- Quick repo scan for 'lockbox' and 'escort' and 'showing' keywords ---`n"
Select-String -Path .\* -Pattern 'lockbox' -SimpleMatch -Recurse -ErrorAction SilentlyContinue | Tee-Object -FilePath $OutFile -Append
Select-String -Path .\* -Pattern 'escort' -SimpleMatch -Recurse -ErrorAction SilentlyContinue | Tee-Object -FilePath $OutFile -Append
Select-String -Path .\* -Pattern 'showing' -SimpleMatch -Recurse -ErrorAction SilentlyContinue | Tee-Object -FilePath $OutFile -Append

# --- Final summary show last 80 lines ---
Log "`n--- End of checks. Tail of output ---`n"
Get-Content $OutFile | Select-Object -Last 80 | ForEach-Object { $_ }

# Print brief guidance
Write-Host "`nChecks complete. Output saved to $OutFile"
Write-Host "If you see any lines referencing React 19 or Next 15/16 in the output, paste those lines here."
Write-Host "If you see 'FOUND possible secret token marker' lines, please remove keys from repo and notify me; I will provide git-filter commands."
