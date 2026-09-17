#!/usr/bin/env node
/**
 * One-shot UCBA rule migration helper. Reads compliance/rules/ucba-audit-checklist.json,
 * adds `validation_v2` blocks to a specified batch of rule IDs, writes back.
 *
 * The batch + per-rule v2 shape is hard-coded here so the migration is
 * deterministic and reviewable as a code diff. Idempotent: re-running on
 * a rule that already has v2 is a no-op.
 *
 * Usage:
 *   node scripts/migrate-ucba-rules-to-v2.js
 *   node scripts/migrate-ucba-rules-to-v2.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PATH_CHECKLIST = path.join(ROOT, 'compliance', 'rules', 'ucba-audit-checklist.json');

const dryRun = process.argv.includes('--dry-run');

const V2_BATCH = {
  A1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['helper', 'cron'],
    evidence: {
      helper: ['lib/compliance/dom-tracker.ts'],
      cron: ['app/api/cron/dom-reset/route.ts'],
    },
    surface_patterns: {
      helper: 'DOM_RESET_DAYS\\s*=\\s*30|shouldResetDom',
      cron: 'dom-reset|resetDom',
    },
    expected_aggregate: 'PASS',
    notes: 'DOM reset constant + helper + cron job all required. UCBA Art. I §11.',
  },
  A4: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['helper', 'gate'],
    evidence: {
      helper: ['lib/compliance/dom-tracker.ts'],
      gate: ['lib/compliance/dom-tracker.ts'],
    },
    surface_patterns: {
      helper: 'DOM_ACCRUING_STATUSES|ComingSoon',
      gate: 'DOM_SUPPRESSING_PERMISSIONS|ParticipantOnly',
    },
    expected_aggregate: 'PASS',
  },
  C3: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['ui_form', 'schema', 'gate'],
    evidence: {
      ui_form: ['public/crm/SALE-FORM-REDESIGN.html', 'public/crm/RENTAL-FORM-REDESIGN.html'],
      schema: ['prisma/schema.prisma'],
      gate: ['lib/compliance/rls-enforcement.ts'],
    },
    surface_patterns: {
      ui_form: 'OptOut|opt-out',
      schema: 'owner_opt_out|optout',
      gate: 'OwnerOptOut|owner_opt_out',
    },
    expected_aggregate: 'PASS',
    notes: 'Opt-out requires CRM form file upload, schema column, AND distribution gate enforcement.',
  },
  C4: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'dto', 'schema'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts', 'lib/idx/trestle-mapper.ts'],
      dto: ['lib/compliance/dto.ts'],
      schema: ['prisma/schema.prisma'],
    },
    surface_patterns: {
      gate: 'OwnerOptOut|owner_opt_out',
      dto: 'OwnerOptOut|opt.out',
      schema: 'owner_opt_out',
    },
    expected_aggregate: 'PASS',
    notes: 'Opt-out hides listing from ALL public surfaces (search, listing detail, portal, syndication).',
  },
  C7: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'content_restrictions'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      content_restrictions: ['compliance/rules/content-restrictions.json'],
    },
    surface_patterns: {
      gate: 'AGENT_INFO_PATTERNS',
      content_restrictions: 'agent.info|R1',
    },
    expected_aggregate: 'PASS',
  },
  C8: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'content_restrictions'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      content_restrictions: ['compliance/rules/content-restrictions.json'],
    },
    surface_patterns: {
      gate: 'OFF_MARKET_PATTERNS',
      content_restrictions: 'off.market|Off-Market',
    },
    expected_aggregate: 'PASS',
  },
  C9: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'content_restrictions', 'dto'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      content_restrictions: ['compliance/rules/content-restrictions.json'],
      dto: ['lib/compliance/dto.ts', 'lib/idx/trestle-mapper.ts'],
    },
    surface_patterns: {
      gate: 'COMPENSATION_PATTERNS',
      content_restrictions: 'compensation|broker.fee|R3',
      dto: 'BuyerAgencyCompensation|stripPrivateFields',
    },
    expected_aggregate: 'PASS',
    notes: 'Compensation must be stripped from descriptions AND from public DTOs.',
  },
  C13: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['cron', 'mapper', 'schema'],
    evidence: {
      cron: ['app/api/cron/data-retention/route.ts'],
      mapper: ['lib/idx/trestle-mapper.ts'],
      schema: ['prisma/schema.prisma'],
    },
    surface_patterns: {
      cron: 'idx_display_yn.*false|Closed.*24',
      mapper: 'CloseDate|isClosedPast24Hours',
      schema: 'status_changed_at|idx_display_yn',
    },
    expected_aggregate: 'PASS',
    notes: 'REBNY §2.05: closed listings removed/hidden within 24h. Cron + Trestle mapper both enforce.',
  },
  C16: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['ui_form', 'frontend_display'],
    evidence: {
      ui_form: ['public/crm/SALE-FORM-REDESIGN.html', 'public/crm/RENTAL-FORM-REDESIGN.html'],
      frontend_display: ['app/search/page.tsx'],
    },
    surface_patterns: {
      ui_form: 'negotiable|not set by law',
      frontend_display: 'negotiable|not set by law',
    },
    expected_aggregate: 'PASS',
  },
  C18: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'data'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      data: ['data/compliance/prohibited-terms.json'],
    },
    surface_patterns: {
      gate: 'FAIR_HOUSING_HARD_BLOCKS',
      data: 'demographics|familial_status|religion|disability',
    },
    expected_aggregate: 'PASS',
    notes: 'Hard block. Penalty: $250 first offense, $500 + RLS termination second.',
  },

  // ─── Batch 2 — 6 Distribution Gates (REBNY core compliance) ───────────
  'GATE-1': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['mapper', 'dto', 'route'],
    evidence: {
      mapper: ['lib/idx/trestle-mapper.ts'],
      dto: ['lib/compliance/dto.ts'],
      route: ['app/api/listings/route.ts'],
    },
    surface_patterns: {
      mapper: 'OwnerOptOut|owner_opt_out',
      dto: 'OwnerOptOut|opt.out',
      route: 'checkDistributionGates|OwnerOptOut',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 1: Owner Opt-Out — listing hidden from ALL public surfaces.',
  },
  'GATE-2': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['mapper', 'dto', 'route'],
    evidence: {
      mapper: ['lib/idx/trestle-mapper.ts'],
      dto: ['lib/compliance/dto.ts'],
      route: ['app/api/listings/route.ts'],
    },
    surface_patterns: {
      mapper: 'ParticipantOnly|participant_only',
      dto: 'ParticipantOnly|participant_only',
      route: 'checkDistributionGates|ParticipantOnly',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 2: Participant Only — RLS participants only, never public.',
  },
  'GATE-3': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['mapper', 'route', 'dto'],
    evidence: {
      mapper: ['lib/idx/trestle-mapper.ts'],
      route: ['app/api/listings/route.ts'],
      dto: ['lib/idx/db-to-public-dto.ts'],
    },
    surface_patterns: {
      mapper: 'InternetEntireListingDisplayYN|idx_display_yn',
      route: 'idx_display_yn|InternetEntireListingDisplay',
      dto: 'InternetEntireListingDisplayYN|isAddressDisplayable',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 3: IDX display master toggle. Cascades to address + AVM + comments.',
  },
  'GATE-4': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
    },
    surface_patterns: {
      gate: 'SyndicateTo|syndicate',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 4: Syndication opt-in is per-portal (not boolean). Validate SyndicateTo array.',
  },
  'GATE-5': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'route', 'frontend_display'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      route: ['app/api/portal/showings/route.ts'],
      frontend_display: ['app/components/SearchListingCard.tsx'],
    },
    surface_patterns: {
      gate: 'ComingSoon|coming.soon',
      route: 'ComingSoon|coming.soon|StandardStatus',
      frontend_display: 'Coming\\s+Soon|comingSoon',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 5: Coming Soon = badge + no showings + no open houses.',
  },
  'GATE-6': {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['cron', 'mapper'],
    evidence: {
      cron: ['app/api/cron/data-retention/route.ts'],
      mapper: ['lib/idx/trestle-mapper.ts'],
    },
    surface_patterns: {
      cron: 'idx_display_yn.*false|Closed.*24',
      mapper: 'CloseDate|isClosedPast24Hours',
    },
    expected_aggregate: 'PASS',
    notes: 'Gate 6: Closed >24h must be removed. Cron + mapper both enforce.',
  },

  // ─── Batch 3 — H-series public display rules ───────────────────────────
  H1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['frontend_display'],
    evidence: {
      frontend_display: [
        'app/listing/[id]/page.tsx',
        'app/components/SearchListingCard.tsx',
        'app/components/PropertySearch.tsx',
      ],
    },
    surface_patterns: {
      frontend_display: 'Listing\\s+Courtesy\\s+of|REBNY|listing_courtesy',
    },
    expected_aggregate: 'PASS',
    notes: 'Attribution on every listing display. UCBA Art. III §2(C).',
  },
  H3: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['mapper', 'dto', 'route'],
    evidence: {
      mapper: ['lib/idx/trestle-mapper.ts'],
      dto: ['lib/compliance/dto.ts'],
      route: ['app/api/listings/route.ts'],
    },
    surface_patterns: {
      mapper: 'OwnerOptOut|owner_opt_out',
      dto: 'OwnerOptOut|opt.out',
      route: 'OwnerOptOut|owner_opt_out',
    },
    expected_aggregate: 'PASS',
  },
  H4: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['mapper', 'dto', 'route'],
    evidence: {
      mapper: ['lib/idx/trestle-mapper.ts'],
      dto: ['lib/compliance/dto.ts'],
      route: ['app/api/listings/route.ts'],
    },
    surface_patterns: {
      mapper: 'ParticipantOnly|participant_only',
      dto: 'ParticipantOnly|participant_only',
      route: 'ParticipantOnly|participant_only',
    },
    expected_aggregate: 'PASS',
  },
  H7: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['frontend_display'],
    evidence: {
      frontend_display: [
        'app/components/SearchListingCard.tsx',
        'app/listing/[id]/page.tsx',
        'app/components/neighborhoods/LiveListingsWidget.tsx',
      ],
    },
    surface_patterns: {
      frontend_display: 'Coming\\s+Soon|comingSoon',
    },
    expected_aggregate: 'PASS',
  },
  H10: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['dto'],
    evidence: {
      dto: ['lib/compliance/dto.ts', 'lib/idx/trestle-mapper.ts'],
    },
    surface_patterns: {
      dto: 'PrivateRemarks|ShowingInstructions|stripPrivateFields',
    },
    expected_aggregate: 'PASS',
    notes: 'PrivateRemarks, ShowingInstructions, agent direct contact must NEVER reach public/portal DTOs.',
  },
  H11: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['dto'],
    evidence: {
      dto: ['lib/compliance/dto.ts'],
    },
    surface_patterns: {
      dto: 'BuyerAgencyCompensation|SubAgencyCompensation|stripCompensation',
    },
    expected_aggregate: 'PASS',
  },
  F6: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['frontend_display'],
    evidence: {
      frontend_display: [
        'app/listing/[id]/page.tsx',
        'app/components/SearchListingCard.tsx',
      ],
    },
    surface_patterns: {
      frontend_display: 'Listing\\s+Courtesy\\s+of|REBNY|listing_courtesy',
    },
    expected_aggregate: 'PASS',
  },

  // ─── Batch 4 — D-series Coming Soon rules ──────────────────────────────
  D1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
    },
    surface_patterns: {
      gate: 'PropertyType.*[Ss]ale|sale.*only|coming.*soon.*sale',
    },
    expected_aggregate: 'PASS',
    notes: 'Coming Soon is sales-only — rentals never use it (UCBA Art. I §16).',
  },
  D7: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['frontend_display'],
    evidence: {
      frontend_display: [
        'app/components/SearchListingCard.tsx',
        'app/listing/[id]/page.tsx',
      ],
    },
    surface_patterns: {
      frontend_display: 'Coming\\s+Soon|comingSoon',
    },
    expected_aggregate: 'PASS',
  },
  D9: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['route'],
    evidence: {
      route: ['app/api/crm/listings/route.ts', 'app/api/crm/listings/[id]/status/route.ts'],
    },
    surface_patterns: {
      route: 'ComingSoon|coming.soon',
    },
    expected_aggregate: 'PASS',
    notes: 'Coming Soon is one-time-use per address (60-day reset window).',
  },

  // ─── Batch 5 — Protected period series ────────────────────────────────
  A6: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['schema', 'route', 'ui'],
    evidence: {
      schema: ['prisma/schema.prisma'],
      route: ['app/api/crm/protected-periods/route.ts'],
      ui: ['public/crm/js/crm/protected-periods.js'],
    },
    surface_patterns: {
      schema: 'model ProtectedPeriod|protected_period',
      route: 'ProtectedPeriod|protected_period',
      ui: 'protected.*period|ProtectedPeriod',
    },
    expected_aggregate: 'PASS',
  },
  A7: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['schema', 'route'],
    evidence: {
      schema: ['prisma/schema.prisma'],
      route: ['app/api/crm/protected-periods/[id]/convert/route.ts'],
    },
    surface_patterns: {
      schema: 'model ProtectedPeriod|protected_period',
      route: 'protected.*period|90.*day',
    },
    expected_aggregate: 'PASS',
  },
  A8: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['route', 'ui'],
    evidence: {
      route: ['app/api/crm/protected-periods/[id]/route.ts'],
      ui: ['public/crm/js/crm/protected-periods.js'],
    },
    surface_patterns: {
      route: 'ProtectedPeriod|protected_period',
      ui: 'protected.*period|notify',
    },
    expected_aggregate: 'PASS',
  },

  // ─── Batch 6 — Other high-value PASS rules ─────────────────────────────
  C1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'data'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      data: ['lib/compliance/rebny-ucba-rules.ts'],
    },
    surface_patterns: {
      gate: 'ListingAgreement|exclusive',
      data: 'ListingAgreement|enumValues',
    },
    expected_aggregate: 'PASS',
  },
  C12: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['route'],
    evidence: {
      route: ['app/api/crm/listings/[id]/status/route.ts'],
    },
    surface_patterns: {
      route: 'ClosePrice|close.price.*24',
    },
    expected_aggregate: 'PASS',
  },
  G1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['dto', 'gate'],
    evidence: {
      dto: ['lib/compliance/dto.ts'],
      gate: ['lib/compliance/rls-enforcement.ts'],
    },
    surface_patterns: {
      dto: 'BuyerAgencyCompensation|SubAgencyCompensation',
      gate: 'compensation|COMPENSATION',
    },
    expected_aggregate: 'PASS',
  },
  G3: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['frontend_display'],
    evidence: {
      frontend_display: ['app/components/IDXDisclaimer.tsx'],
    },
    surface_patterns: {
      frontend_display: 'negotiable|fully.negotiable|not.set.by.law',
    },
    expected_aggregate: 'PASS',
  },
  F1: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['middleware', 'robots'],
    evidence: {
      middleware: ['middleware.ts'],
      robots: ['app/robots.ts'],
    },
    surface_patterns: {
      middleware: 'middleware|allowlist|disallow',
      robots: 'noindex|disallow|robots',
    },
    expected_aggregate: 'PASS',
  },
  F12: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'data'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      data: ['lib/compliance/rebny-ucba-rules.ts'],
    },
    surface_patterns: {
      gate: 'validate|REQUIRED_COTALITY_FIELDS',
      data: 'live-contract|liveEnumMembers',
    },
    expected_aggregate: 'PASS',
  },

  // ─── Batch 7 — Mechanical single-surface migrations ────────────────────
  A3: {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['helper'],
    evidence: { helper: ['lib/compliance/dom-tracker.ts'] },
    surface_patterns: { helper: 'Sold|Rented|onClose|terminal' },
    expected_aggregate: 'PASS',
  },
  D2: {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate'],
    evidence: { gate: ['lib/compliance/rls-enforcement.ts'] },
    surface_patterns: { gate: 'COMING_SOON_MAX_DAYS|14' },
    expected_aggregate: 'PASS',
    notes: 'Coming Soon max 14 calendar days (UCBA Art. I §16(B)).',
  },
  D3: {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['route'],
    evidence: { route: ['app/api/portal/showings/route.ts'] },
    surface_patterns: { route: 'ComingSoon|coming.soon|StandardStatus' },
    expected_aggregate: 'PASS',
    notes: 'No showings allowed while listing is in Coming Soon status.',
  },
  D12: {
    validation_mode: 'workflow',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['gate', 'route'],
    evidence: {
      gate: ['lib/compliance/rls-enforcement.ts'],
      route: ['app/api/crm/listings/[id]/status/route.ts'],
    },
    surface_patterns: {
      gate: 'ActivationDate|first_active_date|immutable',
      route: 'ActivationDate|first_active_date|status',
    },
    expected_aggregate: 'PASS',
    notes: 'Coming Soon → Active activation date is immutable once set.',
  },
  E7: {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: true,
    required_surfaces: ['route'],
    evidence: { route: ['app/api/portal/showings/route.ts'] },
    surface_patterns: { route: 'BuyerRep|buyer.rep|agreement' },
    expected_aggregate: 'PASS',
    notes: 'Showing requires executed Buyer Rep agreement (UCBA Art. II §16).',
  },
  'EXHA-49': {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: false,
    required_surfaces: ['ui_form'],
    evidence: { ui_form: ['public/crm/SALE-FORM-REDESIGN.html'] },
    surface_patterns: { ui_form: 'NumberOfShares|number.of.shares|saleNumberOfShares' },
    expected_aggregate: 'PASS',
    notes: 'Co-op listings must collect NumberOfShares.',
  },
  'EXHA-52': {
    validation_mode: 'pattern',
    ci_policy: 'must_pass',
    release_blocking: false,
    required_surfaces: ['ui_form'],
    evidence: { ui_form: ['public/crm/SALE-FORM-REDESIGN.html'] },
    surface_patterns: { ui_form: 'TaxMonthlyAmount|saleTaxMonthly' },
    expected_aggregate: 'PASS',
    notes: 'Condo listings must collect TaxMonthlyAmount (auto-calculated from annual).',
  },

  // ─── Batch 8 — Semantic rules (manual mode, expect UNVERIFIED) ─────────
  // These rules can't be reduced to a binary surface check. Marking them
  // v2 with validation_mode='manual' makes the runner report UNVERIFIED
  // (truthful) rather than the misleading PASS/EVALUATE_CLOSELY they
  // had under v1.
  A2: {
    validation_mode: 'manual',
    ci_policy: 'advisory',
    release_blocking: false,
    manual_review_required: true,
    required_surfaces: ['helper'],
    evidence: { helper: ['lib/compliance/dom-tracker.ts'] },
    surface_patterns: { helper: 'first_active_date|status_changed_at' },
    expected_aggregate: 'UNVERIFIED',
    notes: 'Semantic rule: DOM must START at RLS transmission, not listing contract date. Runner can confirm the helper exists; can NOT confirm the timestamp semantically equals "RLS transmission moment". Manual review required.',
  },
  A5: {
    validation_mode: 'manual',
    ci_policy: 'advisory',
    release_blocking: false,
    manual_review_required: true,
    required_surfaces: ['helper'],
    evidence: { helper: ['lib/compliance/dom-tracker.ts'] },
    surface_patterns: { helper: 'circumvent|reset|same.address' },
    expected_aggregate: 'UNVERIFIED',
    notes: 'Semantic rule: cannot circumvent DOM by re-naming or re-listing same address. Detection requires same-address windowed query — needs human review of edge cases.',
  },
  C2: {
    validation_mode: 'manual',
    ci_policy: 'advisory',
    release_blocking: false,
    manual_review_required: true,
    required_surfaces: ['route'],
    evidence: { route: ['app/api/crm/listings/route.ts'] },
    surface_patterns: { route: 'STATUS_INITIAL|simultaneous|publish' },
    expected_aggregate: 'UNVERIFIED',
    notes: 'Semantic rule: listing must be submitted to RLS simultaneously with ANY public dissemination. Runner can confirm initial status defaults to Draft; can NOT confirm runtime simultaneity. Manual review of every public-publish path required.',
  },
};

const checklist = JSON.parse(fs.readFileSync(PATH_CHECKLIST, 'utf-8'));

let migrated = 0;
let alreadyMigrated = 0;

for (const sectionKey of Object.keys(checklist.sections)) {
  for (const rule of checklist.sections[sectionKey].rules) {
    if (!V2_BATCH[rule.id]) continue;
    if (rule.validation_v2) {
      alreadyMigrated++;
      console.log(`  · ${rule.id} already has validation_v2 — skipping`);
      continue;
    }
    rule.validation_v2 = V2_BATCH[rule.id];
    migrated++;
    console.log(`  ✓ ${rule.id} — added validation_v2 (${Object.keys(V2_BATCH[rule.id].evidence).length} surfaces)`);
  }
}

console.log('');
console.log(`Migrated ${migrated} rules. Already migrated: ${alreadyMigrated}.`);

if (dryRun) {
  console.log('--dry-run: no file written.');
  process.exit(0);
}

if (migrated === 0) {
  console.log('Nothing to write.');
  process.exit(0);
}

fs.writeFileSync(PATH_CHECKLIST, JSON.stringify(checklist, null, 2) + '\n');
console.log(`Wrote ${PATH_CHECKLIST}`);
