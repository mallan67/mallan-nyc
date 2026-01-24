#!/usr/bin/env bash
set -euo pipefail
OUT="dependency-check-output.txt"
: > "$OUT"
echo "=== mallan.nyc dependency & schema quick-check - $(date) ===" >> "$OUT"

echo -e "\n--- Declared versions (package.json files) ---" >> "$OUT"
node -e "try{const p=require('./package.json'); console.log('root -> next:', p.dependencies?.next||'(not declared)'); console.log('root -> react:', p.dependencies?.react||'(not declared)')}catch(e){console.error('root json error',e)}" >> "$OUT" 2>&1 || true
if [ -f frontend/package.json ]; then
  node -e "try{const p=require('./frontend/package.json'); console.log('frontend -> next:', p.dependencies?.next||'(not declared)'); console.log('frontend -> react:', p.dependencies?.react||'(not declared)')}catch(e){console.error('frontend json error',e)}" >> "$OUT" 2>&1 || true
fi
if [ -f app/package.json ]; then
  node -e "try{const p=require('./app/package.json'); console.log('app -> next:', p.dependencies?.next||'(not declared)'); console.log('app -> react:', p.dependencies?.react||'(not declared)')}catch(e){console.error('app json error',e)}" >> "$OUT" 2>&1 || true
fi

echo -e "\n--- npm ls next react (root) ---" >> "$OUT"
npm ls next react --depth=0 2>&1 | sed -n '1,200p' >> "$OUT" || true

if [ -d frontend ]; then
  echo -e "\n--- npm ls next react (frontend) ---" >> "$OUT"
  (cd frontend && npm ls next react --depth=0 2>&1 | sed -n '1,200p') >> "$OUT" || true
fi

echo -e "\n--- Scan package-lock.json for React 19 or Next 15/16 ---" >> "$OUT"
if [ -f package-lock.json ]; then
  grep -nE '\"react\"\s*:\s*\"[[:space:]]*19' package-lock.json || true >> "$OUT"
  grep -nE '\"next\"\s*:\s*\"[[:space:]]*(15|16)\.' package-lock.json || true >> "$OUT"
else
  echo "No root package-lock.json found." >> "$OUT"
fi
if [ -f frontend/package-lock.json ]; then
  echo "=== frontend package-lock.json scan ===" >> "$OUT"
  grep -nE '\"react\"\s*:\s*\"[[:space:]]*19' frontend/package-lock.json || true >> "$OUT"
  grep -nE '\"next\"\s*:\s*\"[[:space:]]*(15|16)\.' frontend/package-lock.json || true >> "$OUT"
fi

echo -e "\n--- npm outdated (root) ---" >> "$OUT"
npm outdated --depth=0 2>&1 | sed -n '1,200p' >> "$OUT" || true

echo -e "\n--- npm audit (moderate level) ---" >> "$OUT"
npm audit --audit-level=moderate 2>&1 | sed -n '1,200p' >> "$OUT" || true

echo -e "\n--- Prisma schema scans (prisma/*.prisma) ---" >> "$OUT"
for f in prisma/schema.prisma prisma/schema.local.prisma; do
  if [ -f "$f" ]; then
    echo -e "\n$f present - scanning for key items..." >> "$OUT"
    grep -nE 'model\s+Building' "$f" || true >> "$OUT"
    grep -nE 'accessPolicy|access_policy' "$f" || true >> "$OUT"
    grep -nE 'model\s+Showing' "$f" || true >> "$OUT"
    grep -nE 'model\s+KeyCustody' "$f" || true >> "$OUT"
    grep -nE 'model\s+ManagementConfirmation' "$f" || true >> "$OUT"
    grep -nE 'model\s+AuditLog' "$f" || true >> "$OUT"
    grep -nE 'model\s+Document' "$f" || true >> "$OUT"
    grep -nE 'origin|encrypted|redactedUrl|redacted_url' "$f" || true >> "$OUT"
    grep -nE 'closingConfirmedBy|closing_confirmed_by|closingConfirmedAt|closing_confirmed_at' "$f" || true >> "$OUT"
  else
    echo "$f not found" >> "$OUT"
  fi
done

echo -e "\n--- Quick secret sniff ---" >> "$OUT"
patterns=(AWS_SECRET_ACCESS_KEY AWS_ACCESS_KEY_ID OPENAI_API_KEY NEXTAUTH_SECRET JWT_SECRET DOCUSIGN_CLIENT_SECRET TWILIO_AUTH_TOKEN)
for p in "${patterns[@]}"; do
  echo "Searching for $p ..." >> "$OUT"
  grep -R --line-number --exclude-dir=node_modules --exclude-dir=.git "$p" . || echo "No occurrences of $p found." >> "$OUT"
done

echo -e "\n--- Quick grep for lockbox/escort/showing keywords ---" >> "$OUT"
grep -R --line-number --exclude-dir=node_modules --exclude-dir=.git -E "lockbox|escort|showing" . || true >> "$OUT"

echo -e "\n--- End of checks. Tail of output ---\n" >> "$OUT"
tail -n 80 "$OUT" >> "$OUT"
echo "Checks complete. Output saved to $OUT"
