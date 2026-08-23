#!/usr/bin/env node
/**
 * scripts/cotality/route-catalog.js — Static-analysis catalog of every
 * API route under app/api/. Emits a single Markdown table mapping
 * each route to its HTTP methods, auth posture, distribution-gate
 * usage, and other compliance signals.
 *
 * Output:
 *   - artifacts/api-route-catalog.md (Markdown table — committable)
 *   - artifacts/api-route-catalog.json (programmatic shape)
 *
 * Read-only. Fast. No DB, no Trestle. Useful as a shareable artifact
 * + an input for future audit tools.
 *
 * Usage:
 *   npm run cotality:route-catalog
 *   npm run cotality:route-catalog -- --json
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const API_ROOT = path.join(REPO_ROOT, 'app', 'api');
const OUT_MD = path.join(REPO_ROOT, 'artifacts', 'api-route-catalog.md');
const OUT_JSON = path.join(REPO_ROOT, 'artifacts', 'api-route-catalog.json');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const AUTH_PATTERNS = [
  { name: 'broker-required', pattern: /requireBroker\b|requireRole\(['"]BROKER/i },
  { name: 'agent-or-broker', pattern: /requireAgentOrBroker\b/i },
  { name: 'portal-role', pattern: /requirePortalRole\b/i },
  { name: 'session-required', pattern: /requireSession\b|requireUser\b/i },
  { name: 'cron-secret', pattern: /CRON_SECRET\b/ },
  { name: 'admin-key', pattern: /ADMIN_KEY\b/ },
  { name: 'rate-limited', pattern: /checkRouteRateLimit\b|rateLimiter\b/ },
];

const GATE_PATTERNS = [
  'idx_display_yn',
  'internet_entire_listing_display_yn',
  'internet_address_display_yn',
  'internet_automated_valuation_display_yn',
  'internet_consumer_comment_yn',
  'participant_only',
  'owner_opt_out',
  'SEARCH_DISPLAY_GATE',
  'PROJECTION_DISPLAY_GATE',
  'isListingDisplayable',
  'canDisplayListingAddress',
  'checkDistributionGates',
  'filterDisplayableDbListings',
];

const COMPLIANCE_PATTERNS = [
  { name: 'audit-event', pattern: /logAuditEvent\b|auditEvent\.create\b/ },
  { name: 'fair-housing-scan', pattern: /scanTextForFairHousing\b/ },
  { name: 'attribution', pattern: /generateAttributionText\b|REBNY RLS/i },
  { name: 'consent-capture', pattern: /consent_captured_at\b/ },
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx' || entry.name === 'route.js') {
      out.push(full);
    }
  }
  return out;
}

function relRoute(routeFile) {
  // app/api/foo/[id]/bar/route.ts → /api/foo/[id]/bar
  const rel = path.relative(API_ROOT, path.dirname(routeFile));
  if (rel === '') return '/api';
  return '/api/' + rel.split(path.sep).join('/');
}

function detectMethods(text) {
  const found = [];
  for (const m of HTTP_METHODS) {
    const re = new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\s*\\(|export\\s+const\\s+${m}\\s*=`);
    if (re.test(text)) found.push(m);
  }
  return found;
}

function detectMatches(text, patterns) {
  return patterns.filter((p) => p.pattern.test(text)).map((p) => p.name);
}

function detectGates(text) {
  return GATE_PATTERNS.filter((g) => text.includes(g));
}

function classifyAuth(authMatches, routePath) {
  if (authMatches.includes('cron-secret')) return 'cron';
  if (authMatches.includes('admin-key')) return 'admin-key';
  if (authMatches.includes('broker-required')) return 'broker';
  if (authMatches.includes('agent-or-broker')) return 'agent/broker';
  if (authMatches.includes('portal-role')) return 'portal';
  if (authMatches.includes('session-required')) return 'session';
  // Heuristic by path
  if (routePath.startsWith('/api/cron/')) return 'cron (path)';
  if (routePath.startsWith('/api/crm/')) return 'agent/broker (path)';
  if (routePath.startsWith('/api/portal/')) return 'portal (path)';
  if (routePath.startsWith('/api/auth/')) return 'public (auth)';
  return 'public';
}

(async () => {
  const json = process.argv.includes('--json');
  const routes = walk(API_ROOT).sort();

  const catalog = routes.map((file) => {
    const text = fs.readFileSync(file, 'utf-8');
    const routePath = relRoute(file);
    const methods = detectMethods(text);
    const auth = detectMatches(text, AUTH_PATTERNS);
    const compliance = detectMatches(text, COMPLIANCE_PATTERNS);
    const gates = detectGates(text);
    return {
      route: routePath,
      file: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
      methods,
      auth_class: classifyAuth(auth, routePath),
      auth_signals: auth,
      compliance_signals: compliance,
      distribution_gate_signals: gates,
      gate_enforced: gates.length > 0,
    };
  });

  // Aggregate stats
  const stats = {
    total_routes: catalog.length,
    by_auth_class: {},
    public_routes_with_gate: 0,
    public_routes_without_gate: 0,
  };
  for (const r of catalog) {
    stats.by_auth_class[r.auth_class] = (stats.by_auth_class[r.auth_class] || 0) + 1;
    const isPublic = r.auth_class === 'public' || r.auth_class === 'public (auth)';
    const listingAdjacent = r.route.includes('/api/listings') ||
      r.route.includes('/api/buildings') ||
      r.route.includes('/api/market') ||
      r.route.includes('/api/open-houses');
    if (isPublic && listingAdjacent && r.methods.includes('GET')) {
      // Listing-display-adjacent public routes — should have gates.
      if (r.gate_enforced) stats.public_routes_with_gate++;
      else stats.public_routes_without_gate++;
    }
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ stats, catalog }, null, 2));

  // Markdown
  const lines = [];
  lines.push('# API route catalog');
  lines.push('');
  lines.push(`> Static analysis of every \`route.ts\` under \`app/api/\`. Generated by \`npm run cotality:route-catalog\`.`);
  lines.push(`> Captured: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Stats');
  lines.push('');
  lines.push(`- **Total routes**: ${stats.total_routes}`);
  lines.push(`- **By auth class**:`);
  for (const [k, v] of Object.entries(stats.by_auth_class)) {
    lines.push(`  - \`${k}\`: ${v}`);
  }
  lines.push(`- Listing-adjacent public routes WITH gate enforcement: ${stats.public_routes_with_gate}`);
  lines.push(`- Listing-adjacent public routes WITHOUT gate enforcement: ${stats.public_routes_without_gate}`);
  lines.push('');
  lines.push('## Catalog');
  lines.push('');
  lines.push('| Route | Methods | Auth | Gates | Compliance | File |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of catalog) {
    const methods = r.methods.length ? r.methods.join(',') : '—';
    const gates = r.distribution_gate_signals.length
      ? `${r.distribution_gate_signals.length} ✓`
      : '—';
    const comp = r.compliance_signals.length ? r.compliance_signals.join(',') : '—';
    lines.push(`| \`${r.route}\` | ${methods} | ${r.auth_class} | ${gates} | ${comp} | \`${r.file}\` |`);
  }
  lines.push('');

  fs.writeFileSync(OUT_MD, lines.join('\n'));

  if (json) {
    console.log(JSON.stringify({ stats, catalog }, null, 2));
    return;
  }

  console.log(`[route-catalog] saved → ${path.relative(REPO_ROOT, OUT_MD)}`);
  console.log(`[route-catalog] saved → ${path.relative(REPO_ROOT, OUT_JSON)}`);
  console.log(`[route-catalog] total routes: ${stats.total_routes}`);
  console.log(`[route-catalog] by auth class:`);
  for (const [k, v] of Object.entries(stats.by_auth_class)) {
    console.log(`    ${k.padEnd(28)}: ${v}`);
  }
  console.log(`[route-catalog] listing-adjacent public routes: ${stats.public_routes_with_gate} with gate / ${stats.public_routes_without_gate} without`);
})().catch((err) => {
  console.error('[route-catalog] fatal:', err);
  process.exit(1);
});
