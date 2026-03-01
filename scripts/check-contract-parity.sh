#!/bin/bash
# =============================================================================
# check-contract-parity.sh — Verify contract files are present and versioned
#
# mallan-nyc is the source of truth. This script just confirms the files exist
# and prints their hashes for syncing to search-modular.
#
# Run: bash scripts/check-contract-parity.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "================================================================"
echo "  CONTRACT PARITY CHECK — mallan-nyc (source of truth)"
echo "================================================================"
echo ""

FAIL=0

for file in "CONTRACTS/api-contract.v1.md" "compliance/pii-and-distribution-checklist.md"; do
  if [ -f "$file" ]; then
    HASH=$(sha256sum "$file" | cut -d' ' -f1)
    echo -e "  ${GREEN}FOUND${NC}: $file"
    echo "         SHA256: $HASH"
  else
    echo -e "  ${RED}MISSING${NC}: $file"
    FAIL=1
  fi
done

echo ""
echo "  Copy these hashes to search-modular/scripts/check-contract-parity.sh"
echo "  when syncing contract updates."
echo ""
echo "================================================================"
exit $FAIL
