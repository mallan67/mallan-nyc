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
