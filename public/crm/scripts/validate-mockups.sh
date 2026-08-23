#!/bin/bash
# =============================================================================
# validate-mockups.sh — Pre-commit validation for search-modular mockups
# Run: bash scripts/validate-mockups.sh
# Exit code: 0 = pass, 1 = fail
# =============================================================================

set -euo pipefail

FAIL=0
WARN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "================================================================"
echo "  MOCKUP VALIDATION — search-modular"
echo "================================================================"
echo ""

# ── Locate files ──
# Resolve CRM root relative to this script (scripts/ lives inside public/crm/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VIEWER_FILES=(
  "$CRM_DIR/SALE-FORM-WITH-TOOLS.html"
  "$CRM_DIR/RENTAL-FORM-WITH-TOOLS.html"
)

ALL_HTML_FILES=(
  "$CRM_DIR/MALLAN-NYC-CRM-FINAL2.html"
  "$CRM_DIR/index-built.html"
  "$CRM_DIR/SALE-FORM-REDESIGN.html"
  "$CRM_DIR/RENTAL-FORM-REDESIGN.html"
  "$CRM_DIR/SALE-FORM-WITH-TOOLS.html"
  "$CRM_DIR/RENTAL-FORM-WITH-TOOLS.html"
  "$CRM_DIR/BUYER-DEAL-FORM.html"
  "$CRM_DIR/TENANT-DEAL-FORM.html"
)

# ── Section 1: PII Check ──
echo -e "${CYAN}  Section 1: PII Strings${NC}"

# Hard-fail PII patterns (real personal/broker data)
PII_PATTERNS=(
  "Maya Allan"
  "maya@"
  "10311201806"
  "ui-avatars.com"
  "broker2024"
)

PII_FAIL=0
for pattern in "${PII_PATTERNS[@]}"; do
  for file in "${ALL_HTML_FILES[@]}"; do
    if [ -f "$file" ]; then
      count=$(grep -c "$pattern" "$file" 2>/dev/null || true)
      if [ "$count" -gt 0 ]; then
        echo -e "    ${RED}FAIL${NC}: $file contains '$pattern' ($count occurrences)"
        FAIL=1
        PII_FAIL=1
      fi
    fi
  done
done

# POLICY DECISION (2026-03-01): Brokerage phone 646-258-4460 is ALLOWED.
# It's the company business number required for NY DOS advertising compliance
# in print/email footers. Whitelisted — not personal PII.
# If policy changes, remove this comment and add "646-258-4460" to PII_PATTERNS.

if [ "$PII_FAIL" -eq 0 ]; then
  echo -e "    ${GREEN}PASS${NC}: No personal PII strings found"
fi

# ── Section 2: Viewer Safety ──
echo ""
echo -e "${CYAN}  Section 2: Viewer File Safety${NC}"

for vfile in "${VIEWER_FILES[@]}"; do
  if [ ! -f "$vfile" ]; then
    echo -e "    ${YELLOW}SKIP${NC}: $vfile not found"
    continue
  fi

  # Check for form tags with action/method
  form_count=$(grep -cE '<form[^>]+(action=|method=)' "$vfile" 2>/dev/null || true)
  if [ "$form_count" -gt 0 ]; then
    echo -e "    ${RED}FAIL${NC}: $vfile has $form_count <form> tags with action/method"
    FAIL=1
  fi

  # Check for type="submit" buttons
  submit_count=$(grep -c 'type="submit"' "$vfile" 2>/dev/null || true)
  if [ "$submit_count" -gt 0 ]; then
    echo -e "    ${RED}FAIL${NC}: $vfile has $submit_count type=\"submit\" buttons"
    FAIL=1
  fi

  # Check for setInterval (autosave timers)
  interval_count=$(grep -c 'setInterval' "$vfile" 2>/dev/null || true)
  if [ "$interval_count" -gt 0 ]; then
    echo -e "    ${RED}FAIL${NC}: $vfile has $interval_count setInterval() calls (autosave timers)"
    FAIL=1
  fi

  # Check VIEWER_MODE = true
  viewer_mode=$(grep -c 'VIEWER_MODE = true' "$vfile" 2>/dev/null || true)
  if [ "$viewer_mode" -eq 0 ]; then
    echo -e "    ${RED}FAIL${NC}: $vfile missing VIEWER_MODE = true"
    FAIL=1
  fi

  # Check data-mallan-viewer="true"
  rls_viewer=$(grep -c 'data-mallan-viewer="true"' "$vfile" 2>/dev/null || true)
  if [ "$rls_viewer" -eq 0 ]; then
    echo -e "    ${RED}FAIL${NC}: $vfile missing data-mallan-viewer=\"true\""
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo -e "    ${GREEN}PASS${NC}: Viewer files are read-only safe"
fi

# ── Section 3: Alert Count (burn-down metric) ──
echo ""
echo -e "${CYAN}  Section 3: alert() Burn-Down${NC}"

for file in "${ALL_HTML_FILES[@]}"; do
  if [ -f "$file" ]; then
    alert_count=$(grep -c "alert(" "$file" 2>/dev/null || true)
    if [ "$alert_count" -gt 50 ]; then
      echo -e "    ${YELLOW}WARN${NC}: $file has $alert_count alert() calls"
      WARN=$((WARN + 1))
    else
      echo -e "    ${GREEN}INFO${NC}: $file — $alert_count alert() calls"
    fi
  fi
done

# ── Section 4: URL Param PII Check ──
# Only flag actual URL parameter usage (params.get / URLSearchParams), not JS variables
echo ""
echo -e "${CYAN}  Section 4: URL Parameter Safety${NC}"

# Regex patterns: only match URL param access (params.get, URLSearchParams, href construction)
URL_PII_REGEX_PATTERNS=(
  "params\.get\(['\"]agentName"
  "params\.get\(['\"]agentEmail"
  "params\.get\(['\"]agentPhone"
  "params\.get\(['\"]agentLicense"
  "params\.get\(['\"]brokerName"
  "URLSearchParams.*agentName"
  "URLSearchParams.*agentEmail"
)

URL_FAIL=0
for pattern in "${URL_PII_REGEX_PATTERNS[@]}"; do
  for file in "${ALL_HTML_FILES[@]}"; do
    if [ -f "$file" ]; then
      count=$(grep -cE "$pattern" "$file" 2>/dev/null || true)
      if [ "$count" -gt 0 ]; then
        echo -e "    ${RED}FAIL${NC}: $file reads PII from URL: '$pattern' ($count)"
        FAIL=1
        URL_FAIL=1
      fi
    fi
  done
done

if [ "$URL_FAIL" -eq 0 ]; then
  echo -e "    ${GREEN}PASS${NC}: No PII in URL parameters"
fi

# ── Summary ──
echo ""
echo "================================================================"
if [ "$FAIL" -eq 1 ]; then
  echo -e "  ${RED}RESULT: FAIL${NC} — Fix errors before committing"
  echo "================================================================"
  exit 1
else
  if [ "$WARN" -gt 0 ]; then
    echo -e "  ${GREEN}RESULT: PASS${NC} (with $WARN warnings)"
  else
    echo -e "  ${GREEN}RESULT: PASS${NC}"
  fi
  echo "================================================================"
  exit 0
fi
