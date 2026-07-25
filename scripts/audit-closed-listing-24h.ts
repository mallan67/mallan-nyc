#!/usr/bin/env tsx
// Closed-listing 24h removal verification (UCBA Art. I §6).
//
// REBNY rule: closed listings must be removed or marked closed within 24 hours
// of CloseDate. Penalty: 0/K/0K + RLS termination ladder.
//
// Verification:
//   1. The runtime gate function isClosedPast24Hours() exists in lib/compliance/gates.ts
//      and handles status === Closed/Expired with CloseDate > 24h-old.
//   2. Every public listing API route calls one of the gate functions:
//        - filterDisplayableDbListings (db reads)
//        - checkDistributionGates (Trestle reads)
//        - evaluateDisplayGate (canonical)
//   3. The IDX-sync cron runs frequently enough to propagate Closed status.
//
// Read-only.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_API = path.join(ROOT, 'app', 'api');

const GATE_FUNCTIONS = [
  /\bfilterDisplayableDbListings\b/,
  /\bcheckDistributionGates\b/,
  /\bevaluateDisplayGate\b/,
];

interface Finding {
  file: string;
  kind: 'NO_GATE_CALL' | 'CRON_FREQUENCY' | 'GATE_MISSING_CLOSED_24H';
  detail: string;
}

const findings: Finding[] = [];

// 1. Verify isClosedPast24Hours exists in gates.ts
const gatesFile = path.join(ROOT, 'lib/compliance/gates.ts');
const gatesContent = fs.readFileSync(gatesFile, 'utf-8');
if (!/isClosedPast24Hours/.test(gatesContent)) {
  findings.push({
    file: 'lib/compliance/gates.ts',
    kind: 'GATE_MISSING_CLOSED_24H',
    detail: 'isClosedPast24Hours() function not found — UCBA Art. I §6 not enforced at runtime',
  });
}
// Verify the 24-hour math is correct
if (!/hoursSince\s*>\s*24/.test(gatesContent)) {
  findings.push({
    file: 'lib/compliance/gates.ts',
    kind: 'GATE_MISSING_CLOSED_24H',
    detail: '24-hour comparison (`hoursSince > 24`) not found in gates.ts',
  });
}

// 2. Walk every API route returning listing data and verify it calls a gate
function listRoutes(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip private surfaces
      if (entry.name === 'crm' || entry.name === 'admin' || entry.name === 'portal') continue;
      // Skip cron — they run on data, not user-facing displays
      if (entry.name === 'cron') continue;
      out.push(...listRoutes(full));
    } else if (entry.isFile() && /^route\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const routes = listRoutes(APP_API);

// Tokens that suggest the route returns listing-like data (price/beds/etc.)
const RETURNS_LISTINGS = [
  /\bListPrice\b/, /\blistPrice\b/, /\blist_price\b/,
  /\bBedroomsTotal\b/, /\bbedroomsTotal\b/, /\bbedrooms_total\b/,
  /\bMlsStatus\b/, /\bmlsStatus\b/,
  /\bStandardStatus\b/, /\bstandardStatus\b/,
  /\bListingKey\b/, /\bmls_id\b/, /\bmlsId\b/,
];
// Filter to routes that actually return listings
const listingRoutes = routes.filter((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  let hits = 0;
  for (const re of RETURNS_LISTINGS) if (re.test(content)) hits++;
  return hits >= 2;
});

let gatedCount = 0, ungatedCount = 0;
for (const route of listingRoutes) {
  const rel = path.relative(ROOT, route);
  const content = fs.readFileSync(route, 'utf-8');
  const hasGate = GATE_FUNCTIONS.some((re) => re.test(content));

  // Special carve-outs for routes that LEGITIMATELY don't need the listing-display gate:
  //   - /api/buildings/search returns building structural data (no per-listing display)
  //   - /api/auth — separate auth boundary
  //   - any route gated by agent/broker/portal auth (not a public IDX surface;
  //     authenticated agents see closed listings as part of their workflow)
  //   - any route that only writes data (POST/PUT) — gates apply on read
  const buildingsSearch = /buildings[\\/]search[\\/]route/.test(rel);
  const isAuth = /\bauth\b/.test(rel);
  const authGated =
    /requireAgentOrBroker|requireBroker|requirePortalAuth|requireSession|verifyClientPortal/.test(content);
  if (hasGate || buildingsSearch || isAuth || authGated) {
    gatedCount++;
    continue;
  }

  // Check if the file even exports a GET handler (read endpoint)
  const isGetEndpoint = /export\s+(async\s+)?function\s+GET\b/.test(content) ||
                       /\bGET\s*[:=]/.test(content);
  if (!isGetEndpoint) {
    gatedCount++;
    continue;
  }

  ungatedCount++;
  findings.push({
    file: rel,
    kind: 'NO_GATE_CALL',
    detail: 'Public listing endpoint returns listing data but does not call filterDisplayableDbListings / checkDistributionGates / evaluateDisplayGate. UCBA Art. I §6 (closed >24h) and Gates 1-6 may not be enforced.',
  });
}

// 3. Verify cron frequency for idx-sync (closed-status propagation).
// One Cycle W2 (2026-07-24): idx-sync is no longer a standalone cron — it is
// the FIRST sequential member of /api/cron/one-cycle. So the frequency that
// governs REBNY RLS §2.05 (closed within 24h) is now the one-cycle schedule.
// Accept either the legacy standalone idx-sync cron OR the one-cycle
// orchestrator (which drives idx-sync every run), and enforce the ≤30-min
// freshness bound against whichever is present.
const vercelJson = path.join(ROOT, 'vercel.json');
if (fs.existsSync(vercelJson)) {
  const vercel = JSON.parse(fs.readFileSync(vercelJson, 'utf-8'));
  const crons = (vercel.crons || []) as Array<{ path: string; schedule: string }>;
  const idxSync = crons.find((c) => /idx-sync/.test(c.path));
  const oneCycle = crons.find((c) => /one-cycle/.test(c.path));
  const driver = idxSync ?? oneCycle;
  if (!driver) {
    findings.push({
      file: 'vercel.json',
      kind: 'CRON_FREQUENCY',
      detail:
        'No idx-sync cron and no one-cycle orchestrator found — Trestle status changes will not propagate to DB',
    });
  } else {
    // Schedule must run at least every 30 minutes for closed-status freshness.
    const schedule = driver.schedule;
    // Crude check: must include `*/N * * * *` with N <= 30
    const m = schedule.match(/^\*\/(\d+)\s/);
    if (!m || parseInt(m[1], 10) > 30) {
      const label = idxSync ? 'idx-sync' : 'one-cycle (drives idx-sync)';
      findings.push({
        file: 'vercel.json',
        kind: 'CRON_FREQUENCY',
        detail: `${label} cron schedule "${schedule}" runs less often than every 30 min — closed listings may exceed 24h before sync`,
      });
    }
  }
}

console.log('═══ CLOSED-LISTING 24H AUDIT ═══');
console.log(`Listing API routes scanned: ${listingRoutes.length}`);
console.log(`  Gated (OK):                 ${gatedCount}`);
console.log(`  Ungated (✗):                ${ungatedCount}`);
console.log('');
if (findings.length === 0) {
  console.log('✓ Runtime gate exists, all public listing endpoints filter via gates, IDX sync runs frequently enough.');
} else {
  console.log(`✗ ${findings.length} findings:`);
  for (const f of findings) {
    console.log(`   [${f.kind}] ${f.file}`);
    console.log(`     ${f.detail}`);
  }
}
process.exit(findings.length > 0 ? 1 : 0);
