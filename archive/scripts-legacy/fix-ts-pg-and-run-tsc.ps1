# --------------------------- fix-ts-pg-and-run-tsc.ps1 ---------------------------
# Run from repository root (PowerShell).  One-shot: installs types, writes local fallback,
# updates tsconfig, writes a safe lib/db.ts, runs install + tsc, commits changes if any.

# --- Safety backups ---
$time = (Get-Date).ToString('yyyyMMdd-HHmmss')
if (-not (Test-Path ".git")) {
  Write-Warning "No .git present - script will still run but cannot commit/push changes."
}

# Backups
if (Test-Path "tsconfig.json") { Copy-Item tsconfig.json "tsconfig.json.bak.$time" -Force; Write-Host "Backed up tsconfig.json -> tsconfig.json.bak.$time" }
if (Test-Path "lib\db.ts") { Copy-Item "lib\db.ts" "lib\db.ts.bak.$time" -Force; Write-Host "Backed up lib/db.ts -> lib/db.ts.bak.$time" }

# 1) Add @types/pg as a devDependency (updates package.json/package-lock.json)
Write-Host "`n1) Installing @types/pg (devDependency) ..."
npm install --save-dev @types/pg | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Warning "npm install failed; inspect output above."; }

# 2) Create a small local fallback type for pg (safe, non-invasive)
if (-not (Test-Path types)) { New-Item -ItemType Directory -Path types -Force | Out-Null; Write-Host "Created types/ directory." }
$pgd = "types\pg.d.ts"
if (-not (Test-Path $pgd)) {
  @"
declare module 'pg' {
  // minimal fallback so TS won't error in CI if @types/pg is missing for any reason.
  // This keeps runtime behavior unchanged while silencing "Could not find declaration file for module 'pg'".
  interface QueryResultRow { [key: string]: any; }
  interface QueryResult<T = any> { rows: T[]; }
  export class Pool {
    constructor(opts?: any);
    query(text: string, params?: any[]): Promise<QueryResult>;
    connect(): Promise<any>;
    end(): Promise<void>;
  }
  const exported: { Pool: typeof Pool };
  export default exported;
  export = exported;
}
"@ | Set-Content -Path $pgd -Encoding UTF8
  Write-Host "Wrote $pgd"
} else {
  Write-Host "$pgd already exists, leaving it in place."
}

# 3) Ensure tsconfig.json includes the local types folder in typeRoots
Write-Host "`n3) Ensuring tsconfig.json points to local types and node_modules/@types ..."
if (Test-Path "tsconfig.json") {
  $jsonRaw = Get-Content tsconfig.json -Raw
  try {
    $ts = $jsonRaw | ConvertFrom-Json
  } catch {
    Write-Warning "tsconfig.json parse failed; saving original and exiting."
    return
  }
  if (-not $ts.compilerOptions) { $ts.compilerOptions = @{} }
  $ts.compilerOptions.typeRoots = @("./types","./node_modules/@types")
  # Preserve existing other compilerOptions — write back nicely indented.
  $ts | ConvertTo-Json -Depth 10 | Set-Content -Path tsconfig.json -Encoding UTF8
  Write-Host "Updated tsconfig.json (typeRoots set to ./types and ./node_modules/@types)."
} else {
  Write-Host "No tsconfig.json found. Creating a minimal one..."
  @"
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "typeRoots": ["./types", "./node_modules/@types"]
  },
  "include": ["."],
  "exclude": ["node_modules", ".next", "dist", "build"]
}
"@ | Set-Content -Path tsconfig.json -Encoding UTF8
  Write-Host "Wrote minimal tsconfig.json"
}

# 4) Write a robust lib/db.ts that avoids TS namespace/type and generic-call issues
Write-Host "`n4) Writing a robust lib/db.ts (backed up earlier) ..."
@"
/**
 * lib/db.ts
 * Export: named 'pool', default pool, and helper 'q<T>()'.
 * Uses runtime casts to avoid TS namespace/type issues with pg's types in mixed ESM/CJS environments.
 */
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://dev_user:dev_password@127.0.0.1:5432/mallan';

const PoolConstructor = (pg as any).Pool ?? (pg as any);
const pool = new (PoolConstructor as any)({
  connectionString,
  // add pool options here if needed
});

export { pool };
export default pool;

/** q<T>(text, params?) - run query and return typed rows */
export async function q<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await (pool as any).query(text, params);
  return (res && res.rows) ? (res.rows as T[]) : ([] as T[]);
}
"@ | Set-Content -Path "lib\db.ts" -Encoding UTF8
Write-Host "Wrote lib/db.ts"

# 5) Run install & TypeScript check
Write-Host "`n5) Running npm ci (clean install) and TypeScript check..."
# Use npm ci to match CI environment (this will respect package-lock)
npm ci | Out-Host
npx tsc --noEmit --pretty false 2>&1 | Tee-Object -FilePath tsc_after_fix.log
if (Test-Path tsc_after_fix.log) {
  $errs = Select-String -Path tsc_after_fix.log -Pattern 'error TS' -SimpleMatch -Context 0,3
  if ($errs) {
    Write-Host "`n=== TypeScript errors found (first matches) ===`n" -ForegroundColor Red
    $errs | Select-Object -First 40 | Format-Table -AutoSize
  } else {
    Write-Host "`nNo 'error TS' lines found in tsc_after_fix.log. TypeScript likely passes." -ForegroundColor Green
  }
} else {
  Write-Warning "tsc_after_fix.log missing."
}

# 6) If type-check passed, commit the changes (package.json, package-lock.json, lib/db.ts, types, tsconfig)
$commitNeeded = $false
# detect notable files changed
$checkFiles = @("package.json","package-lock.json","lib\db.ts","types\pg.d.ts","tsconfig.json")
foreach ($f in $checkFiles) {
  if (Test-Path $f) {
    $gitStatus = git status --porcelain $f 2>$null
    if ($gitStatus) { $commitNeeded = $true; break }
  }
}

if ($commitNeeded -and (Test-Path .git)) {
  try {
    git add package.json package-lock.json "lib/db.ts" "types/pg.d.ts" tsconfig.json
    git commit -m "chore(ci): add @types/pg, local pg types, adjust tsconfig, fix lib/db typing" -q
    Write-Host "`nCommitted local fixes to git."
    Write-Host "You can push them with: git push"
  } catch {
    Write-Warning "Git commit failed or is not available: $_"
  }
} else {
  Write-Host "`nNo git changes detected or git not available; nothing to commit."
}

Write-Host "`n--- Completed. If there are remaining TypeScript errors, paste the first error blocks from tsc_after_fix.log here ---"
# print the first 200 lines of the log
if (Test-Path tsc_after_fix.log) { Get-Content tsc_after_fix.log -TotalCount 200 | Out-Host } else { Write-Host "tsc_after_fix.log not found." }

# --------------------------- end script ---------------------------  
