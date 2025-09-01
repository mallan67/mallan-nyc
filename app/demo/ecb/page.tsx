$p = (Get-ChildItem -Recurse -File -Path "app" -Filter *.tsx | Select-String -Pattern 'ECB Violations \(demo\)' -List | ForEach-Object Path) 
if (-not $p) { 
  New-Item -ItemType Directory -Force -Path "app\demo\ecb" | Out-Null
  $p = "app\demo\ecb\page.tsx"
}
$p
