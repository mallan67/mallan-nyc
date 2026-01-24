<#
apply-fixes-stable.ps1 — minimal safe repo fixes
#>

param([string]$RepoRoot = ".")

Push-Location $RepoRoot

function Bak($p){
  if (Test-Path $p) {
    Copy-Item -Path $p -Destination "$p.bak" -Force
    Write-Host "[bak]" $p
  }
}

# route: tolerant q/query
$route = "app/api/ai/nyc/route.ts"
if (Test-Path $route) {
  $orig = Get-Content -Raw $route
  $pattern = 'const body = await safeJson\<\{[^\}]*\}\>\(req\);\s*const q = [^\r\n]*;'
  $replacement = "const body = await safeJson<{ q?: string; query?: string }>(req);`n  const raw = body?.q ?? body?.query ?? \"\";`n  const q = typeof raw === 'string' ? raw.trim() : \"\";"
  $new = [System.Text.RegularExpressions.Regex]::Replace($orig, $pattern, $replacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($new -ne $orig) { Bak $route; Set-Content -Path $route -Value $new -Encoding UTF8; Write-Host "[patched]" $route }
} else { Write-Host "[skip]" $route "missing" }

# page.tsx: send q and improve handling
$page = "app/page.tsx"
if (Test-Path $page) {
  $orig = Get-Content -Raw $page
  $new = $orig -replace 'JSON.stringify\(\{\s*query\s*:\s*q\s*,\s*ecbOpen\s*:\s*openOnly\s*,\s*debug\s*:\s*debugOn\s*\}\s*\)', 'JSON.stringify({ q: q, ecbOpen: openOnly, debug: debugOn })'
  if ($new -ne $orig) { Bak $page; Set-Content -Path $page -Value $new -Encoding UTF8; Write-Host "[patched]" $page }
} else { Write-Host "[skip]" $page "missing" }

# next.config.js: enforce TS/ESLint checks (best-effort)
$nc = "next.config.js"
if (Test-Path $nc) {
  $orig = Get-Content -Raw $nc
  $new = $orig -replace 'ignoreBuildErrors\s*:\s*true', 'ignoreBuildErrors: false' -replace 'ignoreDuringBuilds\s*:\s*true', 'ignoreDuringBuilds: false'
  if ($new -ne $orig) { Bak $nc; Set-Content -Path $nc -Value $new -Encoding UTF8; Write-Host "[patched]" $nc }
} else { Write-Host "[skip]" $nc "missing" }

# README: small helpful skeleton if missing/empty
$readme = "README.md"
if ((-not (Test-Path $readme)) -or ((Get-Content $readme | Measure-Object -Line).Lines -eq 0)) {
  @"
# Mallan NYC

Local development
1. Copy `.env.example` to `.env.local` and fill in secrets.
2. Install:
   ```bash
   npm ci
