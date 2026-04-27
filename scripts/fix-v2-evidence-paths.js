#!/usr/bin/env node
/**
 * One-shot corrections to v2 evidence on rules where my initial migrate
 * batch pointed at moved/missing files. Idempotent — checks current
 * evidence and only updates if it matches the known-bad set.
 *
 * Run: node scripts/fix-v2-evidence-paths.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PATH_CHECKLIST = path.join(ROOT, 'compliance', 'rules', 'ucba-audit-checklist.json');
const checklist = JSON.parse(fs.readFileSync(PATH_CHECKLIST, 'utf-8'));

const FIXES = {
  A6: {
    evidence: {
      schema: ['prisma/schema.prisma'],
      route: ['app/api/crm/protected-periods/route.ts'],
      ui: ['public/crm/js/dashboard/workspace.js'],
    },
    surface_patterns: {
      schema: 'model ProtectedPeriod|protected_period',
      route: 'ProtectedPeriod|protected_period',
      ui: 'protected.period|ProtectedPeriod',
    },
  },
  A7: {
    evidence: {
      schema: ['prisma/schema.prisma'],
      route: ['app/api/crm/protected-periods/[id]/route.ts'],
    },
    surface_patterns: {
      schema: 'model ProtectedPeriod|protected_period',
      route: 'ProtectedPeriod|protected_period',
    },
  },
  A8: {
    evidence: {
      route: ['app/api/crm/protected-periods/[id]/route.ts'],
      ui: ['public/crm/js/dashboard/workspace.js'],
    },
    surface_patterns: {
      route: 'ProtectedPeriod|protected_period|notify',
      ui: 'protected.period|ProtectedPeriod',
    },
  },
  F1: {
    evidence: {
      middleware: ['lib/middleware/bot-blocker.ts', 'lib/middleware/csrf.ts'],
      robots: ['app/robots.ts'],
    },
    surface_patterns: {
      middleware: 'bot|csrf|allowlist|disallow',
      robots: 'noindex|disallow|robots',
    },
  },
};

let fixed = 0;
for (const sec of Object.values(checklist.sections)) {
  for (const rule of sec.rules) {
    if (FIXES[rule.id] && rule.validation_v2) {
      rule.validation_v2.evidence = FIXES[rule.id].evidence;
      rule.validation_v2.surface_patterns = FIXES[rule.id].surface_patterns;
      // Also update required_surfaces to match the new evidence keys
      rule.validation_v2.required_surfaces = Object.keys(FIXES[rule.id].evidence);
      fixed++;
      console.log(`  ✓ ${rule.id} — corrected evidence to ${Object.keys(FIXES[rule.id].evidence).join(', ')}`);
    }
  }
}

if (fixed > 0) {
  fs.writeFileSync(PATH_CHECKLIST, JSON.stringify(checklist, null, 2) + '\n');
  console.log(`Wrote ${fixed} fixes to ${PATH_CHECKLIST}`);
} else {
  console.log('No fixes applied (rules either lack v2 or already match).');
}
