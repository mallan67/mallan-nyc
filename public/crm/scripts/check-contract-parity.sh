#!/bin/bash
# =============================================================================
# check-contract-parity.sh — Verify contract files match mallan-nyc canonical copies
#
# Source of truth: mallan-nyc repo
# This script stores expected SHA256 hashes. When mallan-nyc bumps the contract
# version, update the hashes here and commit.
#
# Run: bash scripts/check-contract-parity.sh
# Exit code: 0 = match, 1 = drift detected
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# ── Expected SHA256 hashes (from mallan-nyc canonical copies) ──
# Update these when mallan-nyc bumps the contract version
EXPECTED_CONTRACT="2fca792c9c9fd6f3e2b13a710a30e31c863f49db3e7cda64b73c609cd402efa7"
EXPECTED_COMPLIANCE="dbf21cf000feb4212411d4e991788d990c18788080702be4500d8d5300ca1a17"
CONTRACT_VERSION="1.0.0"

echo ""
echo "================================================================"
echo "  CONTRACT PARITY CHECK — v${CONTRACT_VERSION}"
echo "  Source of truth: mallan-nyc"
echo "================================================================"
echo ""

FAIL=0

# ── Check api-contract.v1.md ──
CONTRACT_FILE="CONTRACTS/api-contract.v1.md"
if [ ! -f "$CONTRACT_FILE" ]; then
  echo -e "  ${RED}FAIL${NC}: $CONTRACT_FILE not found"
  FAIL=1
else
  ACTUAL=$(sha256sum "$CONTRACT_FILE" | cut -d' ' -f1)
  if [ "$ACTUAL" = "$EXPECTED_CONTRACT" ]; then
    echo -e "  ${GREEN}PASS${NC}: $CONTRACT_FILE matches canonical (v${CONTRACT_VERSION})"
  else
    echo -e "  ${RED}FAIL${NC}: $CONTRACT_FILE has drifted from canonical"
    echo "        Expected: ${EXPECTED_CONTRACT:0:16}..."
    echo "        Actual:   ${ACTUAL:0:16}..."
    echo "        Either sync from mallan-nyc or update the expected hash"
    FAIL=1
  fi
fi

# ── Check pii-and-distribution-checklist.md ──
COMPLIANCE_FILE="COMPLIANCE/pii-and-distribution-checklist.md"
if [ ! -f "$COMPLIANCE_FILE" ]; then
  echo -e "  ${RED}FAIL${NC}: $COMPLIANCE_FILE not found"
  FAIL=1
else
  ACTUAL=$(sha256sum "$COMPLIANCE_FILE" | cut -d' ' -f1)
  if [ "$ACTUAL" = "$EXPECTED_COMPLIANCE" ]; then
    echo -e "  ${GREEN}PASS${NC}: $COMPLIANCE_FILE matches canonical (v${CONTRACT_VERSION})"
  else
    echo -e "  ${RED}FAIL${NC}: $COMPLIANCE_FILE has drifted from canonical"
    echo "        Expected: ${EXPECTED_COMPLIANCE:0:16}..."
    echo "        Actual:   ${ACTUAL:0:16}..."
    echo "        Either sync from mallan-nyc or update the expected hash"
    FAIL=1
  fi
fi

echo ""
echo "================================================================"
if [ "$FAIL" -eq 1 ]; then
  echo -e "  ${RED}RESULT: DRIFT DETECTED${NC} — sync contract files from mallan-nyc"
  echo "================================================================"
  exit 1
else
  echo -e "  ${GREEN}RESULT: PARITY CONFIRMED${NC} (contract v${CONTRACT_VERSION})"
  echo "================================================================"
  exit 0
fi
