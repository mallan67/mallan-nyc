#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

OUT="$HOME/Desktop/verify-output.txt"
: > "$OUT"

entities=(
  Building
  CustomProperty
  DataSystem
  Enumeration
  Field
  Lookup
  Media
  Member
  Model
  Office
  OpenHouse
  Property
  PropertyGreenVerification
  PropertyRooms
  PropertyUnitTypes
  TeamMembers
  Teams
)

step(){ printf "\n\n=== %s ===\n\n" "$1" | tee -a "$OUT"; }

echo "RUN START $(date)" | tee -a "$OUT"

step "env (.env.local check)"
if [ -f .env.local ]; then
  echo ".env.local found" | tee -a "$OUT"
else
  echo "WARNING: .env.local not found" | tee -a "$OUT"
fi

mkdir -p artifacts

for e in "${entities[@]}"; do
  step "fetch entity: $e"
  OUTFILE="artifacts/trestle-${e}.ndjson"
  LOGFILE="artifacts/fetch-${e}.log"
  rm -f "$OUTFILE" "$LOGFILE"
  if node scripts/fetch-entity-ndjson.js --entity="$e" --top=500 --out="$OUTFILE" >"$LOGFILE" 2>&1; then
    echo "OK: $e -> $OUTFILE" | tee -a "$OUT"
    wc -l "$OUTFILE" 2>/dev/null | tee -a "$OUT"
  else
    echo "FAIL: $e (see $LOGFILE). Continuing." | tee -a "$OUT"
  fi
done

if [ -f scripts/extract-field-catalog.js ]; then
  for f in artifacts/trestle-*.ndjson; do
    [ -f "$f" ] || continue
    ent=$(basename "$f" .ndjson | sed 's/^trestle-//')
    step "extract fields for: $ent"
    FIELDOUT="artifacts/fields-${ent}.json"
    EXTRACT_LOG="artifacts/extract-${ent}.log"
    rm -f "$FIELDOUT" "$EXTRACT_LOG"
    if node scripts/extract-field-catalog.js "$f" > "$FIELDOUT" 2>"$EXTRACT_LOG"; then
      echo "OK: fields for $ent -> $FIELDOUT" | tee -a "$OUT"
      jq -r '.fields | length' "$FIELDOUT" 2>/dev/null | awk '{print "fields:",$0}' | tee -a "$OUT" || true
    else
      echo "FAIL: extract $ent (see $EXTRACT_LOG)" | tee -a "$OUT"
    fi
  done
else
  echo "SKIP: scripts/extract-field-catalog.js missing" | tee -a "$OUT"
fi

step "merge into artifacts/fields-master.json"
node -e "
const fs = require('fs');
const path = require('path');
const out = {};
const files = fs.readdirSync('artifacts').filter(f => f.startsWith('fields-') && f.endsWith('.json'));
for (const file of files) {
  const ent = file.replace('fields-','').replace('.json','');
  try {
    const j = JSON.parse(fs.readFileSync(path.join('artifacts', file), 'utf8'));
    if (j && j.fields) out[ent] = j.fields;
    else if (Array.isArray(j)) out[ent] = j;
    else out[ent] = j;
  } catch(e) { console.error('ERR loading', file, e.message); }
}
fs.writeFileSync('artifacts/fields-master.json', JSON.stringify(out, null, 2));
console.log('WROTE artifacts/fields-master.json');
" 2>&1 | tee -a "$OUT"
echo "MASTER_FIELDS_SIZE: $(wc -c < artifacts/fields-master.json 2>/dev/null || echo 0) bytes" | tee -a "$OUT"

step "find-rebny-fields-in-trestle.js"
if [ -f scripts/find-rebny-fields-in-trestle.js ]; then
  if [ -f data/rebny-fields.txt ]; then
    node scripts/find-rebny-fields-in-trestle.js artifacts/fields-master.json data/rebny-fields.txt > artifacts/rebny-trestle-compare.json 2> artifacts/find-rebny.log || {
      echo "find-rebny failed, trying fallback" | tee -a "$OUT"
      node scripts/find-rebny-fields-in-trestle.js > artifacts/rebny-trestle-compare.json 2> artifacts/find-rebny.log || true
    }
  else
    node scripts/find-rebny-fields-in-trestle.js artifacts/fields-master.json > artifacts/rebny-trestle-compare.json 2> artifacts/find-rebny.log || true
  fi
  echo "WROTE artifacts/rebny-trestle-compare.json" | tee -a "$OUT"
else
  echo "SKIP: find-rebny-fields-in-trestle.js missing" | tee -a "$OUT"
fi

step "generate-mapping-report.js"
if [ -f scripts/generate-mapping-report.js ]; then
  node scripts/generate-mapping-report.js artifacts/rebny-trestle-compare.json > artifacts/generate-mapping-report.log 2>&1 || {
    echo "generate-mapping-report.js failed; see artifacts/generate-mapping-report.log" | tee -a "$OUT"
    tail -n 100 artifacts/generate-mapping-report.log 2>/dev/null | tee -a "$OUT"
  }
  echo "Check Desktop for REBNY-Full-Mapping-Test.csv or artifacts/" | tee -a "$OUT"
else
  echo "SKIP: generate-mapping-report.js missing" | tee -a "$OUT"
fi

if [ -f scripts/map-customproperty-sample.js ]; then
  step "map-customproperty-sample.js"
  node scripts/map-customproperty-sample.js 2>&1 | tee -a "$OUT"
fi

step "artifacts listing"
ls -la artifacts 2>&1 | tee -a "$OUT"

step "mapping-summary.json (head)"
if [ -f artifacts/mapping-summary.json ]; then
  sed -n '1,240p' artifacts/mapping-summary.json | tee -a "$OUT"
else
  echo "(mapping-summary.json missing)" | tee -a "$OUT"
fi

echo "RUN FINISHED $(date)" | tee -a "$OUT"
