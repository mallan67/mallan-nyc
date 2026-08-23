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
 *   3. RLS overrides Cotality/IDX
 *   4. Cotality/IDX fills gaps only
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
import prohibitedTermsJson from '../../data/compliance/prohibited-terms.json';

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
  existingActivationDate?: string; // For D12 immutability check
  rlsEligible?: boolean; // false = website-only (commercial), skip RLS-specific type checks
  /** True if this is a mixed-use unit in a ≤5 unit building (UCBA Sec. 5(F)) */
  mixedUseSmallBuilding?: boolean;
};

// ─── Derived from REBNY_FIELD_TABLES (single source of truth) ─────────────

const REMOVED_FIELDS = new Set<string>(REBNY_FIELD_TABLES.removedFields);

// Agent-submitted mandatory fields from authority table
const MANDATORY_FIELDS = REBNY_FIELD_TABLES.requiredFields.agentSubmitted;

// System-generated fields — NEVER block agent payloads for these.
// Backend populates them before Trestle submission.
const SYSTEM_GENERATED_FIELDS = new Set<string>(
  REBNY_FIELD_TABLES.requiredFields.systemGenerated
);

// Fields with documented RLS defaults — warn if missing, don't block.
// LMPs MUST default these to true per RLS rules, so the backend can auto-fill.
// Note: IDXEntireListingDisplayYN and SyndicateYN do NOT exist on live Trestle
// (verified 2026-04-19 against $metadata). Use InternetEntireListingDisplayYN
// and SyndicateTo (multi-select) respectively.
const DEFAULTABLE_FIELDS = new Set<string>([
  "InternetEntireListingDisplayYN",   // Default: true
  "InternetAddressDisplayYN",         // Default: true
  "InternetAutomatedValuationDisplayYN", // Default: true
  "InternetConsumerCommentYN",        // Default: true
]);

// ─── Content Scanning Patterns (from authority table) ─────────────────────

// Fair Housing scanner — hard-coded "obvious" patterns kept as a safety net,
// MERGED with data/compliance/prohibited-terms.json (~80 terms in 8 categories).
// The JSON file is the canonical source maintained by compliance. Loading it at
// module init means a rules update requires no code change.
const HARDCODED_FH_PATTERNS: Array<{ pattern: RegExp; law: string }> = [
  // Federal FHA (7 protected classes)
  { pattern: /\b(whites?\s+only|no\s+(blacks?|hispanics?|asians?|mexicans?|africans?))\b/i, law: "Federal FHA (Race)" },
  { pattern: /\b(christian\s+(home|family|neighborhood)|no\s+(muslims?|jews?|hindus?|buddhists?))\b/i, law: "Federal FHA (Religion)" },
  { pattern: /\bno\s+(children|kids|families\s+with\s+children)\b/i, law: "Federal FHA (Familial Status)" },
  { pattern: /\b(no\s+(wheelchairs?|disabled|handicapped)|able[- ]bodied\s+only)\b/i, law: "Federal FHA (Disability)" },
  { pattern: /\b(males?\s+only|females?\s+only|no\s+(men|women)|men\s+only|women\s+only)\b/i, law: "Federal FHA (Sex)" },
  // NY State HRL
  { pattern: /\b(no\s+(seniors?|elderly|retirees?|young\s+people)|seniors?\s+only|under\s+\d+\s+only|over\s+\d+\s+only)\b/i, law: "NY HRL (Age)" },
  { pattern: /\b(no\s+(married|single|divorced)|married\s+(couples?\s+)?only|singles?\s+only)\b/i, law: "NY HRL (Marital Status)" },
  { pattern: /\b(no\s+(gay|lesbian|homosexual|lgbtq?)|straight\s+(couples?\s+)?only|heterosexual\s+only)\b/i, law: "NY HRL (Sexual Orientation)" },
  { pattern: /\b(no\s+(veterans?|military|service\s*members?)|civilians?\s+only)\b/i, law: "NY HRL (Military/Veteran Status)" },
  // NYC HRL Title 8
  { pattern: /\b(no\s+(section\s*8|vouchers?|housing\s+choice))\b/i, law: "NYC HRL Title 8 (Source of Income)" },
  { pattern: /\b(citizens?\s+only|no\s+immigrants?|legal\s+residents?\s+only)\b/i, law: "NYC HRL Title 8 (Citizenship/Immigration)" },
  { pattern: /\b(no\s+criminal|background\s+check\s+required|felons?\s+need\s+not)\b/i, law: "NYC Fair Chance Housing Act" },
  { pattern: /\b(no\s+(transgender|trans\s+people|non[- ]?binary)|cisgender\s+only)\b/i, law: "NYC HRL Title 8 (Gender Identity)" },
  { pattern: /\b(no\s+(students?|freelancers?|self[- ]employed|gig\s+workers?))\b/i, law: "NYC HRL Title 8 (Lawful Occupation)" },
  { pattern: /\b(no\s+(domestic\s+partners?|unmarried\s+couples?))\b/i, law: "NYC HRL Title 8 (Partnership Status)" },
  { pattern: /\b(no\s+(caregivers?|parents?\s+with))\b/i, law: "NYC HRL Title 8 (Caregiver Status)" },
];

// Compile terms from the JSON authority into regex form. We escape regex
// metacharacters but wrap with word boundaries where the term is alphanumeric,
// so "family-friendly" matches inside a sentence but not inside "joined-family-friendly-neighborhood".
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ProhibitedCategory = { severity: string; reason: string; terms: string[] };
type ProhibitedTermsFile = { categories: Record<string, ProhibitedCategory> };

const jsonCategories = (prohibitedTermsJson as unknown as ProhibitedTermsFile).categories ?? {};
const JSON_FH_PATTERNS: Array<{ pattern: RegExp; law: string }> = [];
for (const [categoryName, cat] of Object.entries(jsonCategories)) {
  // Only "critical" and "high" severities become HARD BLOCKS. Anything at
  // "warning" severity would go to the warnings array; the JSON file has none
  // of those today, so we treat every term as a blocker.
  for (const term of cat.terms) {
    const escaped = escapeRegExp(term);
    // \b at both ends when term starts/ends with a letter/digit; otherwise use (?:^|\W) sentinels.
    const startBoundary = /^\w/.test(term) ? '\\b' : '';
    const endBoundary = /\w$/.test(term) ? '\\b' : '';
    JSON_FH_PATTERNS.push({
      pattern: new RegExp(`${startBoundary}${escaped}${endBoundary}`, 'i'),
      law: `${cat.reason} [${categoryName}]`,
    });
  }
}

const FAIR_HOUSING_HARD_BLOCKS: Array<{ pattern: RegExp; law: string }> = [
  ...HARDCODED_FH_PATTERNS,
  ...JSON_FH_PATTERNS,
];

/**
 * Scan a free-text string for Fair Housing violations.
 *
 * Use this on any agent- or user-entered text that is NOT a listing field —
 * e.g. client `notes`, saved-search `name`, internal comments, templates.
 * Listing fields (PublicRemarks, ShowingInstructions, etc.) are already
 * scanned by `assertRlsCompliantPayload`.
 *
 * Returns an array of violation objects. Empty array = clean. Treat any
 * violation as a hard block (HTTP 422) — Federal FHA, NY HRL, NYC HRL, and
 * Fair Chance Housing Act all apply to internal records, not just public ads.
 */
export function scanTextForFairHousing(
  text: string | null | undefined,
  fieldLabel = "text"
): EnforcementIssue[] {
  if (!text || typeof text !== "string") return [];
  const issues: EnforcementIssue[] = [];
  for (const { pattern, law } of FAIR_HOUSING_HARD_BLOCKS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        code: "FH-001",
        severity: "BLOCKER",
        field: fieldLabel,
        message: `Fair Housing violation in ${fieldLabel}: "${match[0]}" — violates ${law}.`,
        ucbaRef: "UCBA Sec. M (Fair Housing: $250 first, $500 + termination second)",
      });
    }
  }
  return issues;
}

/**
 * Scan a record of free-text fields at once (convenience wrapper).
 * Returns a flat list of violations across all fields.
 */
export function scanRecordForFairHousing(
  record: Record<string, string | null | undefined>
): EnforcementIssue[] {
  const out: EnforcementIssue[] = [];
  for (const [field, value] of Object.entries(record)) {
    out.push(...scanTextForFairHousing(value, field));
  }
  return out;
}

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
  // Only check agent-submitted fields. System-generated fields are populated by
  // the backend before Trestle submission — never block agent payloads for them.
  // Defaultable fields (distribution gates) get a warning, not a blocker,
  // because the backend auto-fills RLS-mandated defaults before submission.
  for (const field of MANDATORY_FIELDS) {
    // Skip any system-generated field that leaked into the agent list
    if (SYSTEM_GENERATED_FIELDS.has(field)) continue;

    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      if (DEFAULTABLE_FIELDS.has(field)) {
        // Warn but don't block — backend will apply RLS-mandated default
        warnings.push({
          code: "MF-001W",
          severity: "WARNING",
          field,
          message: `Field "${field}" not provided — backend will apply RLS default.`,
          ucbaRef: "RLS Data Rules",
        });
      } else {
        blockers.push({
          code: "MF-001",
          severity: "BLOCKER",
          field,
          message: `Mandatory RLS field "${field}" is missing or empty.`,
          ucbaRef: "RLS Data Rules",
        });
      }
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

  // PropertyType validation — REBNY RLS only accepts "Residential" or "ResidentialLease".
  // Website-only listings (commercial, rls_eligible=false) can use any Cotality PropertyType.
  const pt = payload.PropertyType as string | undefined;
  if (pt) {
    const RLS_PROPERTY_TYPES = ["Residential", "ResidentialLease"];
    const COTALITY_PROPERTY_TYPES = [
      "Residential", "ResidentialLease", "ResidentialIncome",
      "Commercial", "CommercialLease", "CommercialSale",
      "Land", "Farm", "MultiFamily",
    ];
    if (ctx.rlsEligible === false) {
      // Website-only: accept any Cotality type, warn on unknown
      if (!COTALITY_PROPERTY_TYPES.includes(pt)) {
        warnings.push({
          code: "MF-004W",
          severity: "WARNING",
          field: "PropertyType",
          message: `PropertyType "${pt}" is non-standard. Expected one of: ${COTALITY_PROPERTY_TYPES.join(", ")}.`,
          ucbaRef: "Cotality Data Dictionary",
        });
      }
    } else {
      // RLS-eligible: must be Residential or ResidentialLease
      if (!RLS_PROPERTY_TYPES.includes(pt)) {
        blockers.push({
          code: "MF-004",
          severity: "BLOCKER",
          field: "PropertyType",
          message: `PropertyType "${pt}" is not valid for RLS submission. Must be "Residential" or "ResidentialLease". For commercial listings, set rls_eligible=false.`,
          ucbaRef: "RLS Data Rules",
        });
      }
    }
  }

  // UCBA Sec. 5(F): Mixed-use small building — inform agent that full RLS rules apply
  if (ctx.mixedUseSmallBuilding) {
    warnings.push({
      code: "MU-001",
      severity: "WARNING",
      field: "PropertySubType",
      message: "Mixed-use unit in a building with 5 or fewer units. All UCBA/RLS rules apply to this listing per Art. I, Sec. 5(F).",
      ucbaRef: "UCBA Art. I, Sec. 5(F)",
    });
  }

  // ── 3. Distribution gate consistency ───────────────────────────────

  // InternetEntireListingDisplayYN cascade — when master is false, all subordinate
  // Internet-* gates must also be false.
  //
  // IDXEntireListingDisplayYN does NOT exist on live Trestle (verified 2026-04-19),
  // but it IS retained in this list as a defensive guard: legacy form payloads
  // and third-party API callers may still include the dead field name. If they
  // submit IDXEntireListingDisplayYN=true while InternetEntireListingDisplayYN=false,
  // that is a contradictory opt-out intent and we block it rather than silently drop.
  if (payload.InternetEntireListingDisplayYN === false) {
    const cascadeFields = [
      "IDXEntireListingDisplayYN", // legacy guard — see comment above
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
    const permissions = payload.Permission ?? payload.Permissions; // A2: canonical + legacy
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
  const permRaw = payload.Permission ?? payload.Permissions; // A2: canonical + legacy
  const perm = typeof permRaw === "string" ? permRaw : "";
  if (
    payload.MlsStatus === "OwnerOptOut" ||
    perm === "OwnerOptOut" ||
    perm === "Owner Opt-Out" ||
    perm === "Private"
  ) {
    // Check boolean display flags. InternetEntireListingDisplayYN is the canonical
    // gate on live Trestle (verified 2026-04-19). IDXEntireListingDisplayYN does
    // NOT exist on Trestle but is retained here as a defensive guard: a legacy
    // payload submitting IDXEntireListingDisplayYN=true on an Owner Opt-Out
    // listing is still a contradiction we block (don't silently drop intent).
    const booleanDisplayFields = [
      "InternetEntireListingDisplayYN",
      "IDXEntireListingDisplayYN", // legacy guard — see comment above
    ];
    for (const field of booleanDisplayFields) {
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
    // Syndication: SyndicateTo (multi-select picker) is the only valid field on
    // live Trestle. SyndicateYN is retained as a defensive guard: legacy form
    // payloads may submit SyndicateYN=true (boolean) intending to syndicate
    // everywhere — we block that on opted-out listings rather than silently drop.
    if (payload.SyndicateYN === true) {
      blockers.push({
        code: "DG-002",
        severity: "BLOCKER",
        field: "SyndicateYN",
        message: "SyndicateYN must be false for Owner Opt-Out / Participant Only listings (legacy field — use SyndicateTo).",
        ucbaRef: "UCBA Art. I, Sec. 7",
      });
    }
    const syndicateTo = payload.SyndicateTo;
    if (syndicateTo && (syndicateTo === true || (typeof syndicateTo === "string" && syndicateTo.length > 0) || (Array.isArray(syndicateTo) && syndicateTo.length > 0))) {
      blockers.push({
        code: "DG-002",
        severity: "BLOCKER",
        field: "SyndicateTo",
        message: "SyndicateTo must be empty for Owner Opt-Out / Participant Only listings.",
        ucbaRef: "UCBA Art. I, Sec. 7",
      });
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

    // D12: ActivationDate is immutable once set on a Coming Soon listing
    if (
      ctx.existingActivationDate &&
      payload.ActivationDate &&
      String(payload.ActivationDate) !== String(ctx.existingActivationDate)
    ) {
      blockers.push({
        code: "CS-005",
        severity: "BLOCKER",
        field: "ActivationDate",
        message: "ActivationDate cannot be changed once set on a Coming Soon listing (UCBA D12).",
        ucbaRef: "UCBA Sec. D, Rule 12",
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
  const textFields = ["PublicRemarks", "ShowingInstructions", "PrivateRemarks", "SyndicationRemarks"];

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

  // ── 9. Auction listing requirements (UCBA Art. I exception path — C3b) ─
  // Closes C15 [low] in compliance/rules/ucba-audit-checklist.json:
  //   "Auction Listing Requirements — Must include: minimum bid, date/time/
  //    location, registration, inspection, buyer's premium"
  // We enforce the structural minimum: when auction_yn=true on a listing,
  // both auction_type and auction_end_date are mandatory. The detailed
  // disclosure fields (minimum bid, registration, inspection, buyer's
  // premium) are captured via the auction_terms_url document — operators
  // post a public terms doc rather than encoding every detail as a column.
  // The schema for these fields lives in PR #50 (master refactor C3a).
  const auctionYn = payload.auction_yn ?? payload.AuctionYN;
  if (auctionYn === true || auctionYn === "true" || auctionYn === "True") {
    const auctionType = payload.auction_type ?? payload.AuctionType;
    const auctionEndDate = payload.auction_end_date ?? payload.AuctionEndDate;
    const auctionTermsUrl = payload.auction_terms_url ?? payload.AuctionTermsUrl;

    if (!auctionType || (typeof auctionType === "string" && auctionType.trim() === "")) {
      blockers.push({
        code: "AU-001",
        severity: "BLOCKER",
        field: "auction_type",
        message:
          'Auction listings (auction_yn=true) must specify auction_type. ' +
          'Allowed: "Absolute" | "WithReserve" | "Minimum".',
        ucbaRef: "UCBA Art. I — auction exception",
      });
    } else if (
      typeof auctionType === "string" &&
      !["Absolute", "WithReserve", "Minimum"].includes(auctionType)
    ) {
      blockers.push({
        code: "AU-002",
        severity: "BLOCKER",
        field: "auction_type",
        message:
          `auction_type "${auctionType}" is invalid. ` +
          'Allowed: "Absolute" | "WithReserve" | "Minimum".',
        ucbaRef: "UCBA Art. I — auction exception",
      });
    }

    if (!auctionEndDate) {
      blockers.push({
        code: "AU-003",
        severity: "BLOCKER",
        field: "auction_end_date",
        message:
          "Auction listings (auction_yn=true) must specify auction_end_date " +
          "(the bidding-ends timestamp). UCBA Art. I requires a substantive end date.",
        ucbaRef: "UCBA Art. I — auction exception",
      });
    }

    // Auction terms URL is a strong recommendation (warn, don't block) —
    // the document captures the minimum-bid / registration / inspection /
    // buyer's-premium details that UCBA expects to be disclosed.
    if (!auctionTermsUrl) {
      warnings.push({
        code: "AU-004W",
        severity: "WARNING",
        field: "auction_terms_url",
        message:
          "Auction listings should include auction_terms_url pointing to the " +
          "public terms document (minimum bid, registration, inspection, " +
          "buyer's premium). Recommended by UCBA Art. I auction-exception path.",
        ucbaRef: "UCBA Art. I — auction exception",
      });
    } else if (typeof auctionTermsUrl === "string") {
      // Block unsafe URL schemes — the public listing page renders this
      // value as <a href>. Without this gate a `javascript:` (or `data:` /
      // `vbscript:` / etc.) URL would become a clickable XSS vector on
      // every visitor's browser.
      let scheme = "";
      try {
        scheme = new URL(auctionTermsUrl.trim()).protocol.toLowerCase();
      } catch {
        scheme = "";
      }
      if (scheme !== "http:" && scheme !== "https:") {
        blockers.push({
          code: "AU-006",
          severity: "BLOCKER",
          field: "auction_terms_url",
          message:
            `auction_terms_url must be an absolute http(s):// URL. ` +
            `Got: ${JSON.stringify(auctionTermsUrl)}.`,
          ucbaRef: "UCBA Art. I — auction exception",
        });
      }
    }
  } else if (auctionYn !== undefined && auctionYn !== null && auctionYn !== false && auctionYn !== "false" && auctionYn !== "False") {
    // Defensive: non-boolean garbage value provided. Block.
    blockers.push({
      code: "AU-005",
      severity: "BLOCKER",
      field: "auction_yn",
      message: `auction_yn must be a boolean (true|false), got: ${JSON.stringify(auctionYn)}.`,
      ucbaRef: "UCBA Art. I — auction exception",
    });
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
