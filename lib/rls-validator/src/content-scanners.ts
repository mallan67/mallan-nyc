/**
 * REBNY RLS Validator — Content Scanners
 *
 * 5 scanner suites, each sourced from specific UCBA rules + NYC/NYS law:
 *   S1: Fair Housing (Federal FHA + NY State HRL + NYC HRL Title 8 + Fair Chance Housing)
 *   S2: Agent Info in Descriptions (Art. I, Sec. 5(C))
 *   S3: Off-Market Language (Art. I, Sec. 5(D))
 *   S4: Compensation in Descriptions (Art. I, Sec. 5(E))
 *   S5: Free Services Claims (Art. III, Sec. 5)
 *
 * Fair Housing covers ALL 17+ protected classes across 4 laws:
 *   Federal FHA: Race, Color, National Origin, Religion, Sex, Familial Status, Disability
 *   NY State HRL: + Age, Marital Status, Military Status, Sexual Orientation, Gender Identity
 *   NYC HRL Title 8: + Lawful Occupation, Lawful Source of Income, Immigration Status,
 *                       Caregiver Status, Partnership Status, Alienage/Citizenship
 *   NYC Fair Chance Housing (LL 24/2023): + Criminal History
 */

import type { ValidationIssue, ListingPayload, ContentViolation, ContentScanResult, Severity } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────

function getString(payload: ListingPayload, field: string): string {
  const val = payload[field];
  return typeof val === 'string' ? val : '';
}

function issue(
  code: string,
  severity: Severity,
  category: ValidationIssue['category'],
  message: string,
  extra?: Partial<ValidationIssue>,
): ValidationIssue {
  return { code, severity, category, message, ...extra };
}

// ═══════════════════════════════════════════════════════════════════════
// S1: FAIR HOUSING SCANNER
//     Federal Fair Housing Act (42 USC 3601-3619)
//     NY State Human Rights Law (Executive Law Article 15)
//     NYC Human Rights Law (Title 8, Admin Code 8-107)
//     NYC Fair Chance Housing Act (LL 24/2023)
//
//     ALL 17+ protected classes covered.
//     Severity: SOFT_WARNING (agent can review) — but 2nd offense = termination
// ═══════════════════════════════════════════════════════════════════════

interface FairHousingPattern {
  pattern: RegExp;
  protectedClass: string;
  law: string;
  description: string;
}

const FAIR_HOUSING_PATTERNS: FairHousingPattern[] = [
  // ── Race / Color / National Origin (Federal FHA) ──
  { pattern: /\b(whites?\s+only|no\s+(blacks?|hispanics?|asians?|latinos?|africans?))\b/i,
    protectedClass: 'Race', law: 'Federal FHA', description: 'Racial exclusion' },
  { pattern: /\b(caucasian|negro|oriental|colored\s+people)\b/i,
    protectedClass: 'Race', law: 'Federal FHA', description: 'Racial terminology' },
  { pattern: /\b(no\s+immigrants?|citizens?\s+only|american\s+born)\b/i,
    protectedClass: 'National Origin', law: 'Federal FHA', description: 'National origin exclusion' },
  { pattern: /\b(english\s+only|must\s+speak\s+english|no\s+foreign)\b/i,
    protectedClass: 'National Origin', law: 'Federal FHA', description: 'Language discrimination' },

  // ── Religion (Federal FHA) ──
  { pattern: /\b(no\s+(muslims?|jews?|christians?|hindus?|buddhists?)|christian\s+only|near\s+(church|mosque|synagogue|temple))\b/i,
    protectedClass: 'Religion', law: 'Federal FHA', description: 'Religious exclusion/preference' },

  // ── Sex / Gender (Federal FHA) ──
  { pattern: /\b(males?\s+only|females?\s+only|men\s+only|women\s+only|no\s+(men|women|males?|females?))\b/i,
    protectedClass: 'Sex', law: 'Federal FHA', description: 'Sex-based exclusion' },
  { pattern: /\b(bachelor\s+pad|man\s+cave|girls?\s+only)\b/i,
    protectedClass: 'Sex', law: 'Federal FHA', description: 'Gender-suggestive language' },

  // ── Familial Status (Federal FHA) ──
  { pattern: /\b(no\s+(children|kids|infants?|toddlers?|minors?)|adults?\s+only|no\s+families|child[\s-]?free)\b/i,
    protectedClass: 'Familial Status', law: 'Federal FHA', description: 'Familial status exclusion' },
  { pattern: /\b(singles?\s+only|couples?\s+only|empty\s+nesters?\s+only)\b/i,
    protectedClass: 'Familial Status', law: 'Federal FHA', description: 'Household composition restriction' },
  // Note: "no pets" is NOT familial status — pets ≠ children

  // ── Disability (Federal FHA) ──
  { pattern: /\b(no\s+(wheelchairs?|disabled|handicapped)|able[\s-]?bodied\s+only)\b/i,
    protectedClass: 'Disability', law: 'Federal FHA', description: 'Disability exclusion' },
  { pattern: /\b(no\s+mental\s+(illness|health)|no\s+emotional\s+support\s+animals?)\b/i,
    protectedClass: 'Disability', law: 'Federal FHA', description: 'Disability/ESA exclusion' },
  // Note: "walk-up" is OK (describing building), "walking distance" is OK (describing location)

  // ── Age (NY State HRL) ──
  { pattern: /\b(no\s+(seniors?|elderly|young\s+people)|over\s+\d+\s+only|under\s+\d+\s+only|age\s+\d+\+?\s+only|retirees?\s+only)\b/i,
    protectedClass: 'Age', law: 'NY State HRL', description: 'Age-based exclusion' },
  // Note: "senior living" for 55+ communities is a legal exception (HOPA)

  // ── Marital Status (NY State HRL) ──
  { pattern: /\b(married\s+(couples?\s+only|only)|no\s+(single|unmarried)|divorced?\s+not\s+allowed)\b/i,
    protectedClass: 'Marital Status', law: 'NY State HRL', description: 'Marital status exclusion' },

  // ── Military / Veteran Status (NY State HRL) ──
  { pattern: /\b(no\s+(military|veterans?|service\s+members?))\b/i,
    protectedClass: 'Military/Veteran Status', law: 'NY State HRL', description: 'Military status exclusion' },

  // ── Sexual Orientation (NY State HRL) ──
  { pattern: /\b(no\s+(gays?|lesbians?|homosexuals?|lgbtq?)|straight\s+(only|couples?))\b/i,
    protectedClass: 'Sexual Orientation', law: 'NY State HRL', description: 'Sexual orientation exclusion' },

  // ── Gender Identity / Expression (NY State HRL) ──
  { pattern: /\b(no\s+(transgender|trans\s+people|non[\s-]?binary)|cisgender\s+only)\b/i,
    protectedClass: 'Gender Identity/Expression', law: 'NY State HRL', description: 'Gender identity exclusion' },

  // ── Lawful Occupation (NYC HRL Title 8) ──
  { pattern: /\b(no\s+(students?|artists?|musicians?|actors?|freelancers?)|professionals?\s+only|employed\s+applicants?\s+only)\b/i,
    protectedClass: 'Lawful Occupation', law: 'NYC HRL Title 8', description: 'Occupation-based exclusion' },

  // ── Lawful Source of Income (NYC HRL 8-107) ──
  { pattern: /\b(no\s+(vouchers?|section\s+8|housing\s+assistance|hasa|fheps?|cityfheps?|programs?)|private\s+pay\s+only)\b/i,
    protectedClass: 'Source of Income', law: 'NYC HRL 8-107', description: 'Source of income exclusion' },
  { pattern: /\b(no\s+(government\s+assistance|public\s+assistance|welfare|ssi|social\s+security\s+income))\b/i,
    protectedClass: 'Source of Income', law: 'NYC HRL 8-107', description: 'Government assistance exclusion' },

  // ── Immigration Status / Alienage (NYC HRL Title 8) ──
  { pattern: /\b(no\s+(undocumented|illegal\s+aliens?|non[\s-]?citizens?)|us\s+citizens?\s+only|green\s+card\s+required)\b/i,
    protectedClass: 'Immigration/Alienage', law: 'NYC HRL Title 8', description: 'Immigration status exclusion' },

  // ── Caregiver Status (NYC HRL Title 8) ──
  { pattern: /\b(no\s+caregivers?|no\s+home\s+(health\s+)?aides?)\b/i,
    protectedClass: 'Caregiver Status', law: 'NYC HRL Title 8', description: 'Caregiver status exclusion' },

  // ── Partnership Status (NYC HRL Title 8) ──
  { pattern: /\b(no\s+(domestic\s+partners?|civil\s+unions?|unmarried\s+couples?))\b/i,
    protectedClass: 'Partnership Status', law: 'NYC HRL Title 8', description: 'Partnership status exclusion' },

  // ── Criminal History (NYC Fair Chance Housing Act LL 24/2023) ──
  { pattern: /\b(background\s+check\s+required|criminal\s+(record|history|background)\s+(check|required|screening)|no\s+(felons?|convictions?|criminals?|ex[\s-]?cons?)|clean\s+record\s+required)\b/i,
    protectedClass: 'Criminal History', law: 'NYC Fair Chance Housing LL 24/2023', description: 'Criminal history inquiry' },
  { pattern: /\b(arrest\s+record|conviction\s+history|felon(y|ies)?)\b/i,
    protectedClass: 'Criminal History', law: 'NYC Fair Chance Housing LL 24/2023', description: 'Criminal history reference' },
];

/** Fields to scan for fair housing violations */
const FAIR_HOUSING_SCAN_FIELDS = [
  'PublicRemarks',
  'PrivateRemarks',
  'ShowingInstructions',
  'ListingDescription',
  'InternetRemarks',
  'SyndicationRemarks',
  'BuildingPetsAllowedComments',
  'ViewRemarks',
  'MaximumFinancingRemarks',
  'FlipTaxRemarks',
  'TaxAbatementComments',
  'MoveInCostsComments',
];

export function scanFairHousing(payload: ListingPayload): ContentScanResult[] {
  const results: ContentScanResult[] = [];

  for (const field of FAIR_HOUSING_SCAN_FIELDS) {
    const text = getString(payload, field);
    if (!text) continue;

    const violations: ContentViolation[] = [];

    for (const pattern of FAIR_HOUSING_PATTERNS) {
      const match = text.match(pattern.pattern);
      if (match) {
        violations.push({
          pattern: pattern.pattern.source,
          matchedText: match[0],
          position: match.index || 0,
          severity: 'SOFT_WARNING',
          protectedClass: pattern.protectedClass,
          law: pattern.law,
        });
      }
    }

    if (violations.length > 0) {
      results.push({ scanner: 'FAIR_HOUSING', field, violations });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// S2: AGENT INFO IN DESCRIPTIONS (Art. I, Sec. 5(C)) — HARD BLOCK
//     No agent name, contact info, or URL in property description,
//     photos, comments, or internet remarks.
// ═══════════════════════════════════════════════════════════════════════

const AGENT_INFO_PATTERNS: RegExp[] = [
  // Phone numbers (various formats)
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  // URLs
  /\bhttps?:\/\/[^\s]+/i,
  /\bwww\.[^\s]+/i,
  // Common agent self-references
  /\b(call|contact|reach|text|email)\s+(me|us|the?\s+(agent|broker|listing\s+agent))\b/i,
  // "Listing by" or "Listed by" in descriptions
  /\b(list(ed|ing)\s+by|presented\s+by|offered\s+by|brought\s+to\s+you\s+by)\b/i,
];

/** Fields where agent info is PROHIBITED */
const AGENT_INFO_SCAN_FIELDS = [
  'PublicRemarks',
  'InternetRemarks',
  'SyndicationRemarks',
  'ShowingInstructions', // Agent-only field but still should not have personal contact
];

export function scanAgentInfo(payload: ListingPayload): ContentScanResult[] {
  const results: ContentScanResult[] = [];

  for (const field of AGENT_INFO_SCAN_FIELDS) {
    const text = getString(payload, field);
    if (!text) continue;

    const violations: ContentViolation[] = [];

    for (const pattern of AGENT_INFO_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          pattern: pattern.source,
          matchedText: match[0],
          position: match.index || 0,
          severity: 'HARD_BLOCK',
        });
      }
    }

    if (violations.length > 0) {
      results.push({ scanner: 'AGENT_INFO', field, violations });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// S3: OFF-MARKET LANGUAGE (Art. I, Sec. 5(D)) — HARD BLOCK
//     Cannot describe or promote any Exclusive Listing as "Off-Market"
// ═══════════════════════════════════════════════════════════════════════

const OFF_MARKET_PATTERNS: RegExp[] = [
  /\boff[\s-]?market\b/i,
  /\bpocket\s+listing\b/i,
  /\bexclusive\s+pocket\b/i,
  /\bnot\s+(on|in)\s+(the\s+)?(market|mls|rls)\b/i,
  /\bpre[\s-]?market\s+opportunity\b/i,
  /\bquiet\s+listing\b/i,
  /\bwhisper\s+listing\b/i,
  /\bunder[\s-]?the[\s-]?radar\b/i,
];

const OFF_MARKET_SCAN_FIELDS = [
  'PublicRemarks', 'PrivateRemarks', 'InternetRemarks', 'SyndicationRemarks',
];

export function scanOffMarket(payload: ListingPayload): ContentScanResult[] {
  const results: ContentScanResult[] = [];

  for (const field of OFF_MARKET_SCAN_FIELDS) {
    const text = getString(payload, field);
    if (!text) continue;

    const violations: ContentViolation[] = [];

    for (const pattern of OFF_MARKET_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          pattern: pattern.source,
          matchedText: match[0],
          position: match.index || 0,
          severity: 'HARD_BLOCK',
        });
      }
    }

    if (violations.length > 0) {
      results.push({ scanner: 'OFF_MARKET', field, violations });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// S4: COMPENSATION IN DESCRIPTIONS (Art. I, Sec. 5(E)) — HARD BLOCK
//     No broker fees, closing costs, or compensation info
// ═══════════════════════════════════════════════════════════════════════

const COMPENSATION_PATTERNS: RegExp[] = [
  /\b\d+(\.\d+)?%?\s*(commission|broker\s*fee|co[\s-]?broke?)\b/i,
  /\b(buyer('?s?)?\s*(pays?\s*)?no\s*(commission|fee|closing\s*costs?))\b/i,
  /\b(seller\s*(pays?\s*)?buyer('?s?)?\s*(closing\s*costs?|commission))\b/i,
  /\b(commission|broker\s*fee|co[\s-]?broke?\s*fee)\s*[:=]?\s*\$?\d/i,
  /\b(bonus\s*(commission|to\s*(buyer|co[\s-]?broker)))\b/i,
  /\b(compensation\s*(offered?|available|included?))\b/i,
  /\b(closing\s+cost\s+(credit|assistance|paid|covered))\b/i,
  /\b(fee\s+split|split\s+commission|rebate)\b/i,
];

const COMPENSATION_SCAN_FIELDS = [
  'PublicRemarks', 'PrivateRemarks', 'InternetRemarks', 'SyndicationRemarks',
  'ShowingInstructions',
];

export function scanCompensation(payload: ListingPayload): ContentScanResult[] {
  const results: ContentScanResult[] = [];

  for (const field of COMPENSATION_SCAN_FIELDS) {
    const text = getString(payload, field);
    if (!text) continue;

    const violations: ContentViolation[] = [];

    for (const pattern of COMPENSATION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          pattern: pattern.source,
          matchedText: match[0],
          position: match.index || 0,
          severity: 'HARD_BLOCK',
        });
      }
    }

    if (violations.length > 0) {
      results.push({ scanner: 'COMPENSATION', field, violations });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// S5: FREE SERVICES CLAIMS (Art. III, Sec. 5) — SOFT WARNING
//     Cannot claim services are free unless zero compensation from any source
// ═══════════════════════════════════════════════════════════════════════

const FREE_SERVICES_PATTERNS: RegExp[] = [
  /\b(free\s+(service|listing|commission|no\s+fee|broker(age)?))\b/i,
  /\b(zero\s+(commission|fee|cost|broker(age)?\s+fee))\b/i,
  /\b(no\s+(commission|broker(age)?\s+fee|cost\s+to\s+(buyer|seller|tenant|landlord|you)))\b/i,
  /\b(commission[\s-]?free|fee[\s-]?free)\b/i,
];

const FREE_SERVICES_SCAN_FIELDS = [
  'PublicRemarks', 'InternetRemarks', 'SyndicationRemarks',
];

export function scanFreeServices(payload: ListingPayload): ContentScanResult[] {
  const results: ContentScanResult[] = [];

  for (const field of FREE_SERVICES_SCAN_FIELDS) {
    const text = getString(payload, field);
    if (!text) continue;

    const violations: ContentViolation[] = [];

    for (const pattern of FREE_SERVICES_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          pattern: pattern.source,
          matchedText: match[0],
          position: match.index || 0,
          severity: 'SOFT_WARNING',
        });
      }
    }

    if (violations.length > 0) {
      results.push({ scanner: 'FREE_SERVICES', field, violations });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// COMBINED CONTENT SCANNER — Runs all 5 suites
// ═══════════════════════════════════════════════════════════════════════

export function runAllContentScanners(payload: ListingPayload): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // S1: Fair Housing
  const fhResults = scanFairHousing(payload);
  for (const result of fhResults) {
    for (const v of result.violations) {
      issues.push(issue(
        'FH-' + (v.protectedClass || 'unknown').replace(/[^A-Za-z]/g, ''),
        'ERROR',
        'CONTENT_FAIR_HOUSING',
        `Fair Housing violation in ${result.field}: "${v.matchedText}" — ${v.protectedClass} (${v.law})`,
        { field: result.field, ruleId: 'C18', ucbaRef: 'Exhibit C' },
      ));
    }
  }

  // S2: Agent Info
  const aiResults = scanAgentInfo(payload);
  for (const result of aiResults) {
    for (const v of result.violations) {
      issues.push(issue(
        'AI-AgentInfo',
        'BLOCKER',
        'CONTENT_AGENT_INFO',
        `Agent info in ${result.field}: "${v.matchedText}" — No agent name/contact/URL in descriptions`,
        { field: result.field, ruleId: 'C7', ucbaRef: 'Art. I, Sec. 5(C)' },
      ));
    }
  }

  // S3: Off-Market
  const omResults = scanOffMarket(payload);
  for (const result of omResults) {
    for (const v of result.violations) {
      issues.push(issue(
        'OM-OffMarket',
        'BLOCKER',
        'CONTENT_OFF_MARKET',
        `Off-Market language in ${result.field}: "${v.matchedText}" — Cannot describe listings as "off-market"`,
        { field: result.field, ruleId: 'C8', ucbaRef: 'Art. I, Sec. 5(D)' },
      ));
    }
  }

  // S4: Compensation
  const compResults = scanCompensation(payload);
  for (const result of compResults) {
    for (const v of result.violations) {
      issues.push(issue(
        'CO-Compensation',
        'BLOCKER',
        'CONTENT_COMPENSATION',
        `Compensation info in ${result.field}: "${v.matchedText}" — No broker fees/compensation in descriptions`,
        { field: result.field, ruleId: 'C9', ucbaRef: 'Art. I, Sec. 5(E)' },
      ));
    }
  }

  // S5: Free Services
  const fsResults = scanFreeServices(payload);
  for (const result of fsResults) {
    for (const v of result.violations) {
      issues.push(issue(
        'FS-FreeServices',
        'WARNING',
        'CONTENT_FREE_SERVICES',
        `Free services claim in ${result.field}: "${v.matchedText}" — Cannot claim free unless zero compensation from any source`,
        { field: result.field, ruleId: 'F13', ucbaRef: 'Art. III, Sec. 5' },
      ));
    }
  }

  return issues;
}
