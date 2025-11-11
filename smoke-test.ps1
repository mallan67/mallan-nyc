Write-Host "Simple smoke-test (host -> Next /api/_proxy-health)" -ForegroundColor Cyan
docker compose up -d --build
Start-Sleep -Seconds 5
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/api/_proxy-health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Proxy health response: $($r.Content)" -ForegroundColor Green
} catch {
  Write-Host "Proxy health check failed: $_" -ForegroundColor Red
  docker compose logs frontend --tail 200
  docker compose logs api --tail 200
  exit 1
}
Write-Host "Smoke test OK"
