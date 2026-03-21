#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

OUT="$HOME/Desktop/verify-output.txt"
# start fresh capture
: > "$OUT"

# helper
step() { printf "\n\n=== %s ===\n\n" "$1" | tee -a "$OUT"; }

echo "VERIFY REBNY MAPPING START $(date)" | tee -a "$OUT"

# show what scripts exist
step "scripts/ listing"
ls -la scripts 2>&1 | tee -a "$OUT"

# 1) get trestle metadata (writes artifacts/metadata.xml)
if [ -f scripts/get-metadata.js ]; then
  step "get-metadata.js"
  node -e "require('dotenv').config({path:'.env.local'});" 2>&1 | tee -a "$OUT" || true
  node scripts/get-metadata.js 2>&1 | tee -a "$OUT"
else
  echo "SKIP: scripts/get-metadata.js missing" | tee -a "$OUT"
fi

# 2) fetch entities NDJSON (if script exists)
if [ -f scripts/fetch-entity-ndjson.js ]; then
  step "fetch-entity-ndjson.js"
  node scripts/fetch-entity-ndjson.js 2>&1 | tee -a "$OUT"
else
  echo "SKIP: scripts/fetch-entity-ndjson.js missing" | tee -a "$OUT"
fi

# 3) fallback / other fetchers (fetch-all-properties-ndjson, fetch-custom-media)
for s in scripts/fetch-all-properties-ndjson.js scripts/fetch-custom-media.js scripts/fetch-entity-ndjson.js; do
  if [ -f "$s" ]; then
    step "running $s"
    node "$s" 2>&1 | tee -a "$OUT"
  else
    echo "NOT FOUND: $s" | tee -a "$OUT"
  fi
done

# 4) build field catalogs / extract fields
if [ -f scripts/extract-field-catalog.js ]; then
  step "extract-field-catalog.js"
  node scripts/extract-field-catalog.js 2>&1 | tee -a "$OUT"
else
  echo "SKIP: scripts/extract-field-catalog.js missing" | tee -a "$OUT"
fi

# 5) find REBNY fields in trestle
if [ -f scripts/find-rebny-fields-in-trestle.js ]; then
  step "find-rebny-fields-in-trestle.js"
  node scripts/find-rebny-fields-in-trestle.js 2>&1 | tee -a "$OUT"
else
  echo "SKIP: scripts/find-rebny-fields-in-trestle.js missing" | tee -a "$OUT"
fi

# 6) produce mapping sample/summary (optional)
for s in scripts/map-customproperty-sample.js scripts/compare-repo-trestle.js scripts/find-repo-only-in-customproperty.js; do
  if [ -f "$s" ]; then
    step "running $s"
    node "$s" 2>&1 | tee -a "$OUT"
  else
    echo "NOT FOUND: $s" | tee -a "$OUT"
  fi
done

# 7) show artifacts & mapping summary
step "artifacts listing"
ls -la artifacts 2>&1 | tee -a "$OUT"

step "mapping-summary.json (head)"
if [ -f artifacts/mapping-summary.json ]; then
  sed -n '1,240p' artifacts/mapping-summary.json | tee -a "$OUT"
else
  echo "(mapping-summary.json missing)" | tee -a "$OUT"
fi

step "mapped-sample.json (head)"
if [ -f artifacts/mapped-sample.json ]; then
  sed -n '1,200p' artifacts/mapped-sample.json | tee -a "$OUT"
else
  echo "(mapped-sample.json missing)" | tee -a "$OUT"
fi

step "REBNY CSV on Desktop (head)"
if [ -f "$HOME/Desktop/REBNY-Full-Mapping-Test.csv" ]; then
  head -n 8 "$HOME/Desktop/REBNY-Full-Mapping-Test.csv" | tee -a "$OUT"
  echo "Total rows (minus header): $(tail -n +2 "$HOME/Desktop/REBNY-Full-Mapping-Test.csv" | wc -l)" | tee -a "$OUT"
else
  echo "(REBNY-Full-Mapping-Test.csv not found on Desktop)" | tee -a "$OUT"
fi

echo "VERIFY FINISHED $(date)" | tee -a "$OUT"
