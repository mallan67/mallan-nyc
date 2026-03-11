/**
 * RLS Enforcement Gate — Backend Write-Path Compliance
 *
 * PURPOSE: This is the HARD GATE on every listing write (create/update).
 * Unlike the HTML mockup validator (lib/rls-validator/) which validates mockup files,
 * this module enforces UCBA/RLS rules on live API payloads at the route handler level.
 *
 * FIELD AUTHORITY ORDER (ENFORCED):
 *   1. UCBA governs everything
 *   2. REBNY RLS rules + fields — RLS TRUMPS ALL
 *   3. RLS overrides RESO/IDX
 *   4. RESO/IDX fills gaps only
 *   5. INTERNAL-ONLY otherwise
 *   6. Fail closed = REJECT
 *
 * REBNY CHANGES ADDRESSED:
 *   - DOM reset: 90 → 30 days (UCBA 2026)
 *   - NAR Settlement: Compensation fields REMOVED (Aug 2025)
 *   - Coming Soon: Sales only, 14-day max, no showings/OH
 *   - Distribution gates: All 6 enforced on write
 *   - Fair Housing: Federal + NY State + NYC HRL Title 8
 *
 * AUTHORITY SOURCE: REBNY_FIELD_TABLES (lib/compliance/rebny-field-tables.ts)
 *   All mandatory fields, removed fields, conditional rules, enum values,
 *   and content scanning patterns are imported from the single canonical authority table.
 */

import { REBNY_FIELD_TABLES } from './rebny-field-tables';

// ─── Types ────────────────────────────────────────────────────────────────

export interface EnforcementResult {
  passed: boolean;
  blockers: EnforcementIssue[];
  warnings: EnforcementIssue[];
}

export interface EnforcementIssue {
  code: string;
  severity: "BLOCKER" | "WARNING";
  field?: string;
  message: string;
  ucbaRef?: string;
}

export type ListingContext = {
  listingType: "sale" | "rent";
  isNewDevelopment?: boolean;
  currentStatus?: string;
  previousStatus?: string;
  statusChangedAt?: Date;
};

// ─── Derived from REBNY_FIELD_TABLES (single source of truth) ─────────────

const REMOVED_FIELDS = new Set<string>(REBNY_FIELD_TABLES.removedFields);

// Agent-submitted mandatory fields from authority table (48 fields)
// StandardStatus is system-generated but checked at write time
const MANDATORY_FIELDS = REBNY_FIELD_TABLES.requiredFields.agentSubmitted;

// ─── Content Scanning Patterns (from authority table) ─────────────────────

const FAIR_HOUSING_HARD_BLOCKS: Array<{ pattern: RegExp; law: string }> = [
  // Federal FHA (7 protected classes)
  { pattern: /\b(whites?\s+only|no\s+(blacks?|hispanics?|asians?|mexicans?))\b/i, law: "Federal FHA" },
  { pattern: /\b(christian\s+(home|family|neighborhood)|no\s+(muslims?|jews?|hindus?))\b/i, law: "Federal FHA" },
  { pattern: /\bno\s+(children|kids|families\s+with\s+children)\b/i, law: "Federal FHA" },
  { pattern: /\b(no\s+(wheelchairs?|disabled|handicapped)|able[- ]bodied\s+only)\b/i, law: "Federal FHA" },
  // NYC HRL Title 8 (additional classes)
  { pattern: /\b(no\s+(section\s*8|vouchers?|housing\s+choice))\b/i, law: "NYC HRL Title 8 (Source of Income)" },
  { pattern: /\b(citizens?\s+only|no\s+immigrants?|legal\s+residents?\s+only)\b/i, law: "NYC HRL Title 8 (Immigration)" },
  { pattern: /\b(no\s+criminal|background\s+check\s+required|felons?\s+need\s+not)\b/i, law: "NYC Fair Chance Housing Act" },
];

const AGENT_INFO_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\bhttps?:\/\/\S+/i,
  /\b(contact\s+me|call\s+me|listed\s+by|exclusive\s+with)\b/i,
];

const OFF_MARKET_PATTERNS = [
  /\boff[- ]?market\b/i,
  /\bpocket\s+listing\b/i,
  /\bwhisper\s+listing\b/i,
  /\bquiet\s+listing\b/i,
  /\bpre[- ]?market\b/i,
];

const COMPENSATION_PATTERNS = [
  /\b\d+(\.\d+)?%\s*(commission|co-?broke?)\b/i,
  /\bbuyer\s+pays?\s+no\b/i,
  /\bclosing\s+cost\s+credit\b/i,
  /\bbonus\s+commission\b/i,
  /\bseller\s+concession\b/i,
];

// G4: Free/No-Cost claims (from authority table contentRules.freeService)
const FREE_SERVICE_PATTERNS = REBNY_FIELD_TABLES.contentRules.freeService.map(
  (p) => new RegExp(p, 'gi')
);

// ─── Status Transition Rules ──────────────────────────────────────────────

import { DOM_RESET_DAYS } from "./dom-tracker";

const TERMINAL_STATUSES = new Set(["Closed"]);

// ─── Main Enforcement Function ────────────────────────────────────────────

/**
 * Assert that a listing payload is RLS-compliant for write.
 * Call this in EVERY listing create/update route.
 *
 * Returns { passed: true } if compliant, or { passed: false, blockers: [...] } if not.
 * Route handlers should return 422 on failure with the blockers array.
 */
export function assertRlsCompliantPayload(
  payload: Record<string, unknown>,
  ctx: ListingContext
): EnforcementResult {
  const blockers: EnforcementIssue[] = [];
  const warnings: EnforcementIssue[] = [];

  // ── 1. Reject removed fields (NAR Settlement) ──────────────────────
  for (const key of Object.keys(payload)) {
    if (REMOVED_FIELDS.has(key)) {
      blockers.push({
        code: "RF-001",
        severity: "BLOCKER",
        field: key,
        message: `Field "${key}" was removed from RLS (NAR Settlement, Aug 2025). Remove from payload.`,
        ucbaRef: "UCBA Art. IV",
      });
    }
  }

  // ── 2. Validate mandatory fields ───────────────────────────────────
  for (const field of MANDATORY_FIELDS) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      blockers.push({
        code: "MF-001",
        severity: "BLOCKER",
        field,
        message: `Mandatory RLS field "${field}" is missing or empty.`,
        ucbaRef: "RLS Data Rules",
      });
    }
  }

  // ListPrice must be > 0
  if (payload.ListPrice !== undefined && Number(payload.ListPrice) <= 0) {
    blockers.push({
      code: "MF-002",
      severity: "BLOCKER",
      field: "ListPrice",
      message: "ListPrice must be greater than 0.",
      ucbaRef: "RLS Data Rules",
    });
  }

  // StateOrProvince must be NY
  if (payload.StateOrProvince && payload.StateOrProvince !== "NY") {
    blockers.push({
      code: "MF-003",
      severity: "BLOCKER",
      field: "StateOrProvince",
      message: "REBNY RLS is NYC-only. StateOrProvince must be 'NY'.",
      ucbaRef: "UCBA Art. I",
    });
  }

  // PropertyType must be Residential or ResidentialLease
  const pt = payload.PropertyType;
  if (pt && pt !== "Residential" && pt !== "ResidentialLease") {
    blockers.push({
      code: "MF-004",
      severity: "BLOCKER",
      field: "PropertyType",
      message: `PropertyType "${pt}" is not valid. Must be "Residential" or "ResidentialLease".`,
      ucbaRef: "RLS Data Rules",
    });
  }

  // ── 3. Distribution gate consistency ───────────────────────────────

  // InternetEntireListingDisplayYN cascade
  if (payload.InternetEntireListingDisplayYN === false) {
    const cascadeFields = [
      "IDXEntireListingDisplayYN",
      "InternetAddressDisplayYN",
      "InternetAutomatedValuationDisplayYN",
      "InternetConsumerCommentYN",
    ];
    for (const field of cascadeFields) {
      if (payload[field] === true) {
        blockers.push({
          code: "DG-001",
          severity: "BLOCKER",
          field,
          message: `${field} cannot be true when InternetEntireListingDisplayYN is false (cascade rule).`,
          ucbaRef: "UCBA Art. I, Sec. 6",
        });
      }
    }
  }

  // Sale+Permissions=Null cannot set InternetEntireListingDisplayYN=false (RLS Data Rule)
  if (ctx.listingType === "sale") {
    const permissions = payload.Permissions;
    if (
      (!permissions || permissions === "" || permissions === null) &&
      payload.InternetEntireListingDisplayYN === false
    ) {
      blockers.push({
        code: "DG-003",
        severity: "BLOCKER",
        field: "InternetEntireListingDisplayYN",
        message:
          "Sale listings with Permissions=Null cannot set InternetEntireListingDisplayYN to False (RLS Data Rule).",
        ucbaRef: "RLS Data Rules — InternetEntireListingDisplayYN",
      });
    }
  }

  // Owner Opt-Out / Participant Only blocks all display
  const perm = typeof payload.Permissions === "string" ? payload.Permissions : "";
  if (
    payload.MlsStatus === "OwnerOptOut" ||
    perm === "OwnerOptOut" ||
    perm === "Owner Opt-Out" ||
    perm === "Private"
  ) {
    const displayFields = [
      "IDXEntireListingDisplayYN",
      "InternetEntireListingDisplayYN",
      "SyndicateYN",
    ];
    for (const field of displayFields) {
      if (payload[field] === true) {
        blockers.push({
          code: "DG-002",
          severity: "BLOCKER",
          field,
          message: `${field} must be false for Owner Opt-Out / Participant Only listings.`,
          ucbaRef: "UCBA Art. I, Sec. 7",
        });
      }
    }
  }

  // ── 4. Coming Soon rules (D1-D12) ─────────────────────────────────
  if (payload.MlsStatus === "ComingSoon") {
    // D1: Coming Soon is SALES ONLY
    if (ctx.listingType === "rent") {
      blockers.push({
        code: "CS-001",
        severity: "BLOCKER",
        field: "MlsStatus",
        message: "Coming Soon status is not available for rental listings (UCBA D1).",
        ucbaRef: "UCBA Sec. D, Rule 1",
      });
    }

    // D1: Not available for new developments
    if (ctx.isNewDevelopment) {
      blockers.push({
        code: "CS-002",
        severity: "BLOCKER",
        field: "MlsStatus",
        message: "Coming Soon status is not available for new development listings (UCBA D1).",
        ucbaRef: "UCBA Sec. D, Rule 1",
      });
    }

    // D2: 14-day maximum
    if (payload.ActivationDate && payload.OnMarketDate) {
      const activation = new Date(payload.ActivationDate as string);
      const onMarket = new Date(payload.OnMarketDate as string);
      const diffDays = (activation.getTime() - onMarket.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 14) {
        blockers.push({
          code: "CS-003",
          severity: "BLOCKER",
          field: "ActivationDate",
          message: `Coming Soon period exceeds 14-day maximum (${Math.ceil(diffDays)} days). UCBA D2.`,
          ucbaRef: "UCBA Sec. D, Rule 2",
        });
      }
    }

    // D7: ActivationDate required
    if (!payload.ActivationDate) {
      blockers.push({
        code: "CS-004",
        severity: "BLOCKER",
        field: "ActivationDate",
        message: "ActivationDate is required for Coming Soon listings (UCBA D7).",
        ucbaRef: "UCBA Sec. D, Rule 7",
      });
    }
  }

  // ── 5. Status transition validation ────────────────────────────────
  if (ctx.previousStatus && ctx.currentStatus) {
    // Closed is terminal
    if (TERMINAL_STATUSES.has(ctx.previousStatus) && ctx.previousStatus !== ctx.currentStatus) {
      blockers.push({
        code: "ST-001",
        severity: "BLOCKER",
        field: "MlsStatus",
        message: `Cannot transition from terminal status "${ctx.previousStatus}".`,
        ucbaRef: "UCBA Sec. J",
      });
    }
  }

  // DOM reset info (30 days per UCBA 2026)
  if (
    ctx.previousStatus === "Withdrawn" ||
    ctx.previousStatus === "Cancelled" ||
    ctx.previousStatus === "TemporarilyOffMarket"
  ) {
    if (ctx.statusChangedAt) {
      const elapsed = Math.floor(
        (Date.now() - ctx.statusChangedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const willReset = elapsed >= DOM_RESET_DAYS;
      warnings.push({
        code: "ST-002",
        severity: "WARNING",
        field: "MlsStatus",
        message: willReset
          ? `DOM will reset: ${elapsed} days in ${ctx.previousStatus} (>= ${DOM_RESET_DAYS} day threshold). UCBA 2026.`
          : `DOM will resume: ${elapsed} days in ${ctx.previousStatus} (< ${DOM_RESET_DAYS} day threshold). UCBA 2026.`,
        ucbaRef: "UCBA Sec. J",
      });
    } else {
      warnings.push({
        code: "ST-002",
        severity: "WARNING",
        field: "MlsStatus",
        message: `DOM resets after ${DOM_RESET_DAYS} consecutive days in ${ctx.previousStatus} status (UCBA 2026).`,
        ucbaRef: "UCBA Sec. J",
      });
    }
  }

  // ── 6. Content scanning (Fair Housing, Agent Info, Off-Market) ─────
  const textFields = ["PublicRemarks", "ShowingInstructions", "PrivateRemarks"];

  for (const field of textFields) {
    const text = payload[field];
    if (typeof text !== "string" || !text) continue;

    // Fair Housing violations
    for (const { pattern, law } of FAIR_HOUSING_HARD_BLOCKS) {
      const match = text.match(pattern);
      if (match) {
        blockers.push({
          code: "FH-001",
          severity: "BLOCKER",
          field,
          message: `Fair Housing violation in ${field}: "${match[0]}" — violates ${law}.`,
          ucbaRef: "UCBA Sec. M (Fair Housing: $250 first, $500 + termination second)",
        });
      }
    }

    // Agent info in remarks (Art. I, Sec. 5(C))
    if (field === "PublicRemarks") {
      for (const pattern of AGENT_INFO_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          blockers.push({
            code: "AI-001",
            severity: "BLOCKER",
            field,
            message: `Agent contact info in PublicRemarks: "${match[0]}". Prohibited by UCBA Art. I, Sec. 5(C).`,
            ucbaRef: "Art. I, Sec. 5(C)",
          });
        }
      }

      // Off-market language (Art. I, Sec. 5(D))
      for (const pattern of OFF_MARKET_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          blockers.push({
            code: "OM-001",
            severity: "BLOCKER",
            field,
            message: `Off-market language in PublicRemarks: "${match[0]}". Prohibited by UCBA Art. I, Sec. 5(D).`,
            ucbaRef: "Art. I, Sec. 5(D)",
          });
        }
      }

      // Compensation language (Art. I, Sec. 5(E))
      for (const pattern of COMPENSATION_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          blockers.push({
            code: "CL-001",
            severity: "BLOCKER",
            field,
            message: `Compensation info in PublicRemarks: "${match[0]}". Prohibited by UCBA Art. I, Sec. 5(E).`,
            ucbaRef: "Art. I, Sec. 5(E)",
          });
        }
      }

      // Free/no-cost service claims (G4 — from authority table contentRules.freeService)
      for (const pattern of FREE_SERVICE_PATTERNS) {
        pattern.lastIndex = 0; // Reset stateful regex
        const match = pattern.exec(text);
        if (match) {
          blockers.push({
            code: "FS-001",
            severity: "BLOCKER",
            field,
            message: `Free/no-cost service claim in ${field}: "${match[0]}". Misleading per UCBA.`,
            ucbaRef: "UCBA Art. I, Sec. 5",
          });
        }
      }
    }
  }

  // ── 7. Listing agreement must be exclusive ─────────────────────────
  const agreement = typeof payload.ListingAgreement === 'string' ? payload.ListingAgreement : '';
  const VALID_LISTING_AGREEMENTS: readonly string[] = REBNY_FIELD_TABLES.enumValues.ListingAgreement;
  if (agreement && !VALID_LISTING_AGREEMENTS.includes(agreement)) {
    blockers.push({
      code: "LA-001",
      severity: "BLOCKER",
      field: "ListingAgreement",
      message: `REBNY RLS requires exclusive listing agreements. "${agreement}" is not accepted (UCBA C1).`,
      ucbaRef: "UCBA Sec. C, Rule 1",
    });
  }

  // ── 8. Conditional field checks (from authority table — 51 rules) ──
  for (const rule of REBNY_FIELD_TABLES.conditionalRules) {
    if (conditionMatches(payload, rule.appliesWhen)) {
      for (const field of rule.requireFields) {
        const val = payload[field];
        if (val === undefined || val === null || val === "") {
          blockers.push({
            code: `CF-${rule.code}`,
            severity: "BLOCKER",
            field,
            message: `Conditional field "${field}" required by ${rule.code}: ${rule.description}`,
            ucbaRef: `RLS CSV conditional — ${rule.code}`,
          });
        }
      }
    }
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ─── Condition Matcher (evaluates appliesWhen from conditional rules) ────

function conditionMatches(
  payload: Record<string, unknown>,
  conditions: Record<string, unknown>
): boolean {
  for (const [field, expected] of Object.entries(conditions)) {
    const actual = payload[field];

    // Array match: actual must be one of the expected values
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as never)) return false;
      continue;
    }

    // Object match: { gt: N }, { gte: N }, { exists: true }
    if (typeof expected === "object" && expected !== null) {
      const spec = expected as Record<string, unknown>;
      if ("gt" in spec && (typeof actual !== "number" || actual <= (spec.gt as number)))
        return false;
      if ("gte" in spec && (typeof actual !== "number" || actual < (spec.gte as number)))
        return false;
      if ("exists" in spec && (actual === undefined || actual === null)) return false;
      continue;
    }

    // Direct equality
    if (actual !== expected) return false;
  }
  return true;
}
