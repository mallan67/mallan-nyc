#!/usr/bin/env node
/**
 * CI Compliance Check — runs on every PR
 *
 * Verifies:
 * 1. No client-side Trestle/IDX API calls
 * 2. No NEXT_PUBLIC_ env vars containing secrets
 * 3. toPublicDTO() used in public API endpoints
 * 4. checkDistributionGates() used in public API endpoints
 *
 * Exit code 0 = pass, 1 = fail
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let passes = 0;

function pass(name) {
  console.log(`  PASS: ${name}`);
  passes++;
}

function fail(name, detail) {
  console.error(`  FAIL: ${name}`);
  if (detail) console.error(`        ${detail}`);
  failures++;
}

/**
 * Recursively find files matching a pattern
 */
function findFiles(dir, ext, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findFiles(full, ext, results);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function fileContains(filePath, pattern) {
  const content = fs.readFileSync(filePath, 'utf8');
  return pattern.test(content);
}

console.log('=== CI Compliance Check ===\n');

// ── 1. No Trestle URLs in client components ──
const TRESTLE_PATTERN = /api\.cotality\.com|api-trestle\.corelogic\.com|api-prod\.corelogic\.com/;
const componentFiles = findFiles(path.join(ROOT, 'app', 'components'), '.tsx');
const clientTrestleCalls = componentFiles.filter(f => fileContains(f, TRESTLE_PATTERN));
if (clientTrestleCalls.length === 0) {
  pass('No Trestle URLs in client components');
} else {
  fail('Trestle URLs found in client components', clientTrestleCalls.join(', '));
}

// ── 2. No client components importing from lib/idx/ (except display-adapter which is safe) ──
const USE_CLIENT = /['"]use client['"]/;
// Match lib/idx imports EXCEPT display-adapter (pure display utility, no API calls)
const IDX_IMPORT_UNSAFE = /from\s+['"]@\/lib\/idx\/(?!display-adapter)/;
const allTsx = findFiles(path.join(ROOT, 'app'), '.tsx');
const clientIdxImports = allTsx.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  return USE_CLIENT.test(content) && IDX_IMPORT_UNSAFE.test(content);
});
if (clientIdxImports.length === 0) {
  pass('No client components importing IDX modules');
} else {
  fail('Client components import IDX modules', clientIdxImports.map(f => path.relative(ROOT, f)).join(', '));
}

// ── 3. No NEXT_PUBLIC_ secrets ──
const SECRET_PATTERN = /NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|CREDENTIAL|API_KEY)/i;
for (const envFile of ['.env', '.env.local', '.env.production']) {
  const envPath = path.join(ROOT, envFile);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const secrets = lines.filter(l => SECRET_PATTERN.test(l) && !l.startsWith('#'));
    if (secrets.length === 0) {
      pass(`No secrets in NEXT_PUBLIC_ vars (${envFile})`);
    } else {
      fail(`Secrets in NEXT_PUBLIC_ vars (${envFile})`, secrets.join('; '));
    }
  }
}

// ── 4. toPublicDTO used in public listing endpoints ──
const publicEndpoints = [
  path.join(ROOT, 'app', 'api', 'listings', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'listings', '[id]', 'route.ts'),
];
for (const ep of publicEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /toPublicDTO/)) {
      pass(`toPublicDTO used in ${rel}`);
    } else {
      fail(`toPublicDTO missing in ${rel}`);
    }
  }
}

// ── 5. checkDistributionGates used in public listing endpoints ──
for (const ep of publicEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /checkDistributionGates/)) {
      pass(`checkDistributionGates used in ${rel}`);
    } else {
      fail(`checkDistributionGates missing in ${rel}`);
    }
  }
}

// ── 6. No compensation fields in public API responses ──
const apiFiles = findFiles(path.join(ROOT, 'app', 'api'), '.ts');
const COMP_PATTERN = /BuyerAgencyCompensation|SubAgencyCompensation/;
const compViolations = apiFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Skip if the reference is in a "removed" or "strip" context
  if (!COMP_PATTERN.test(content)) return false;
  const lines = content.split('\n');
  return lines.some(l => COMP_PATTERN.test(l) && !/remove|strip|deleted|REMOVED|\/\//.test(l));
});
if (compViolations.length === 0) {
  pass('No compensation fields in public APIs');
} else {
  fail('Compensation fields found', compViolations.map(f => path.relative(ROOT, f)).join(', '));
}

// ── 7. escapeHtml used in all email-sending endpoints ──
const SEND_EMAIL_PATTERN = /sendEmail|sendgrid/;
const ESCAPE_HTML_PATTERN = /escapeHtml/;
const emailEndpoints = apiFiles.filter(f => fileContains(f, SEND_EMAIL_PATTERN));
for (const ep of emailEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fileContains(ep, ESCAPE_HTML_PATTERN) || !rel.startsWith('app')) {
    pass(`escapeHtml used in ${rel}`);
  } else {
    fail(`escapeHtml missing in email endpoint ${rel}`);
  }
}

// ── 8. Distribution gates on Trestle fallback endpoints ──
const trestleFallbackEndpoints = [
  path.join(ROOT, 'app', 'api', 'market', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'buildings', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'listings', 'building', 'route.ts'),
  path.join(ROOT, 'app', 'api', 'open-houses', 'route.ts'),
];
for (const ep of trestleFallbackEndpoints) {
  const rel = path.relative(ROOT, ep);
  if (fs.existsSync(ep)) {
    if (fileContains(ep, /checkDistributionGates/)) {
      pass(`Distribution gates in ${rel}`);
    } else {
      fail(`Distribution gates missing in ${rel}`);
    }
  }
}

// ── 9. Agency Disclosure on substantive lead-capture forms (NYS RPL §443, DOS-1736) ──
// Accepts either a literal mention OR a rendered <AgencyDisclosure /> component import.
const LEAD_CAPTURE_FORMS = [
  'app/components/InquiryForm.tsx',
  'app/components/InquiryModal.tsx',
  'app/components/HomeValueWidget.tsx',
  'app/components/CalculatorLeadCapture.tsx',
  'app/components/OpenHouseRSVP.tsx',
  'app/components/RegistrationGate.tsx',
  'app/contact/page.tsx',
  'app/sign-up/page.tsx',
];
const AGENCY_DISCLOSURE_PATTERN = /AgencyDisclosure|DOS-1736|agency disclosure|Agency Disclosure|dos-1736/i;
for (const rel of LEAD_CAPTURE_FORMS) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full) && fileContains(full, AGENCY_DISCLOSURE_PATTERN)) {
    pass(`Agency disclosure on ${rel}`);
  } else if (fs.existsSync(full)) {
    fail(`Agency disclosure missing on ${rel}`);
  }
}

// ── 10. REBNY §2.05 address-display gate in search-alerts cron ──
// Must filter on InternetAddressDisplayYN (not just InternetEntireListingDisplayYN)
// because a listing can be IDX-displayable while the specific address is suppressed.
const searchAlertsPath = path.join(ROOT, 'app/api/cron/search-alerts/route.ts');
if (fs.existsSync(searchAlertsPath)) {
  if (fileContains(searchAlertsPath, /internet_address_display_yn|InternetAddressDisplay/)) {
    pass('Address-display gate in search-alerts cron (REBNY §2.05)');
  } else {
    fail('Address-display gate missing in search-alerts cron — emails may leak suppressed addresses (REBNY §2.05 violation)');
  }
}

// ── 11. Content-Security-Policy + HSTS in security-headers middleware (NY SHIELD Act §899-aa) ──
// Canonical source is `lib/middleware/security-headers.ts` — applied per-request via proxy.ts.
// NOTE: These headers were previously in vercel.json but that created a split-brain policy
// where the edge CSP competed with the middleware's stronger nonce-based CSP. Single-source-of-truth.
const vercelJsonPath = path.join(ROOT, 'vercel.json');
const securityHeadersPath = path.join(ROOT, 'lib/middleware/security-headers.ts');
if (fs.existsSync(securityHeadersPath)) {
  if (fileContains(securityHeadersPath, /Content-Security-Policy/)) {
    pass('Content-Security-Policy configured in lib/middleware/security-headers.ts');
  } else {
    fail('Content-Security-Policy missing in lib/middleware/security-headers.ts (NY SHIELD Act §899-aa)');
  }
  if (fileContains(securityHeadersPath, /Strict-Transport-Security/)) {
    pass('Strict-Transport-Security configured in lib/middleware/security-headers.ts');
  } else {
    fail('Strict-Transport-Security missing in lib/middleware/security-headers.ts (NY SHIELD Act §899-aa)');
  }
  // Guard against regression — vercel.json should NOT contain these headers
  // (would create the split-brain state we removed on 2026-04-19)
  if (fs.existsSync(vercelJsonPath)) {
    if (fileContains(vercelJsonPath, /"Content-Security-Policy"/)) {
      fail('Content-Security-Policy duplicated in vercel.json — creates split-brain CSP with security-headers.ts (remove from vercel.json)');
    } else {
      pass('No duplicate CSP in vercel.json (single source of truth preserved)');
    }
  }
}

// ── 12. IDX sync cron cadence (REBNY UCBA Art. I §6 — 24-hour data freshness) ──
// Any cadence up to daily (24h) satisfies REBNY. Flag only if truly stale (>24h).
if (fs.existsSync(vercelJsonPath)) {
  const vercelJson = fs.readFileSync(vercelJsonPath, 'utf8');
  const idxSyncMatch = vercelJson.match(/"\/api\/cron\/idx-sync",\s*"schedule":\s*"([^"]+)"/);
  if (idxSyncMatch) {
    const cron = idxSyncMatch[1];
    // Valid cadences: */N where N <= 60 (minutes), OR anything with hour field <= 23
    const everyNmin = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    const everyNhour = cron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
    const dailyAtHour = cron.match(/^\d+\s+\d+\s+\*\s+\*\s+\*$/);
    if (everyNmin || (everyNhour && Number(everyNhour[1]) <= 24) || dailyAtHour) {
      pass(`idx-sync cadence '${cron}' satisfies REBNY 24h freshness rule`);
    } else {
      fail(`idx-sync cadence '${cron}' does not guarantee 24h data freshness (REBNY UCBA Art. I §6)`);
    }
  }
}

// ── 13. CAN-SPAM unsubscribe in shared email footer ──
// Every email-sending template route into wrapEmail() / FOOTER, which must contain /unsubscribe.
const emailTemplatesPath = path.join(ROOT, 'lib/email/templates.ts');
if (fs.existsSync(emailTemplatesPath)) {
  const content = fs.readFileSync(emailTemplatesPath, 'utf8');
  // Check that FOOTER (shared across all emails via wrapEmail) contains unsubscribe
  const footerMatch = content.match(/const\s+FOOTER\s*=\s*`([\s\S]*?)`;/);
  if (footerMatch && /unsubscribe/i.test(footerMatch[1])) {
    pass('CAN-SPAM unsubscribe present in shared email FOOTER (all emails inherit via wrapEmail)');
  } else {
    fail('CAN-SPAM unsubscribe missing from lib/email/templates.ts FOOTER');
  }
}

// ── 14. REBNY DOM tracker present (UCBA Art. I §11 — 30-day DOM reset) ──
const domTrackerPath = path.join(ROOT, 'lib/compliance/dom-tracker.ts');
if (fs.existsSync(domTrackerPath)) {
  pass('REBNY DOM tracker present (UCBA Art. I §11)');
} else {
  fail('REBNY DOM tracker missing at lib/compliance/dom-tracker.ts');
}

// ── 15. Data retention cron present (NY SHIELD Act §899-aa + REBNY 2-yr audit) ──
const retentionCronPath = path.join(ROOT, 'app/api/cron/data-retention/route.ts');
if (fs.existsSync(retentionCronPath)) {
  const content = fs.readFileSync(retentionCronPath, 'utf8');
  if (/auditEvent\.deleteMany/.test(content)) {
    pass('Data retention cron actively purges audit events >2yr (REBNY + NY SHIELD)');
  } else {
    fail('Data retention cron does not actively delete audit events (only counts)');
  }
  if (/idx_display_yn\s*:\s*false|idx_display_yn:\s*false/.test(content)) {
    pass('Data retention cron flips idx_display_yn=false on terminal listings (REBNY §2.05)');
  } else {
    fail('Data retention cron missing terminal listing IDX-off step (REBNY §2.05)');
  }
}

// ── 16. Lifecycle triggers cron present + wired in vercel.json ──
// The engine in lib/lifecycle/engine.ts handles 8 trigger types:
// conviction_threshold, ghost_detected, momentum_drop, inquiry_stale,
// lease_expiring_{180d,90d,30d}, quarterly_nurture. Without the cron,
// the engine is unreachable and all these automations silently no-op.
const lifecycleCronPath = path.join(ROOT, 'app/api/cron/lifecycle-triggers/route.ts');
if (fs.existsSync(lifecycleCronPath)) {
  const content = fs.readFileSync(lifecycleCronPath, 'utf8');
  if (/evaluateAllTriggers/.test(content)) {
    pass('Lifecycle triggers cron calls evaluateAllTriggers()');
  } else {
    fail('Lifecycle triggers cron exists but does not call evaluateAllTriggers() from lib/lifecycle/engine.ts');
  }
} else {
  fail('Lifecycle triggers cron missing — lib/lifecycle/engine.ts is unreachable, 8 automation triggers silently no-op');
}

if (fs.existsSync(vercelJsonPath)) {
  const vercelJson = fs.readFileSync(vercelJsonPath, 'utf8');
  if (/\/api\/cron\/lifecycle-triggers/.test(vercelJson)) {
    pass('Lifecycle triggers cron wired in vercel.json');
  } else {
    fail('Lifecycle triggers cron missing from vercel.json crons list (route exists but never fires)');
  }
}

// ── 17. No MlsStatus in OData $filter strings (REBNY-level provider block) ──
// Live Trestle returns HTTP 400 on $filter=MlsStatus eq 'X'. Must use StandardStatus.
// Only scans app/api/**.
const trestleFilterFiles = findFiles(path.join(ROOT, 'app/api'), '.ts');
const mlsStatusFilterViolations = trestleFilterFiles.filter((f) => {
  const content = fs.readFileSync(f, 'utf8');
  // Match "MlsStatus eq " inside a string that also contains $filter or OData context
  return /["'`][^"'`]*\$filter[^"'`]*MlsStatus eq/.test(content)
      || /["'`][^"'`]*MlsStatus eq [^"'`]*["'`]\s*[,}]/.test(content);
});
if (mlsStatusFilterViolations.length === 0) {
  pass('No MlsStatus in Trestle $filter (REBNY provider-level restriction respected)');
} else {
  fail('MlsStatus used in Trestle $filter — REBNY returns HTTP 400. Replace with StandardStatus: ' + mlsStatusFilterViolations.map(f => path.relative(ROOT, f)).join(', '));
}

// ── 18. Gate function uses live Trestle field names (no dead field references) ──
const mapperPath = path.join(ROOT, 'lib/idx/trestle-mapper.ts');
if (fs.existsSync(mapperPath)) {
  const content = fs.readFileSync(mapperPath, 'utf8');
  // Dead fields that don't exist on live Trestle — must not appear in runtime checks
  const deadFields = [
    { pattern: /raw\.ParticipantOnlyYN/, name: 'ParticipantOnlyYN' },
    { pattern: /normalized\.ParticipantOnlyYN/, name: 'ParticipantOnlyYN (normalized)' },
    { pattern: /raw\.IDXParticipationYN/, name: 'IDXParticipationYN' },
    { pattern: /normalized\.IDXParticipationYN/, name: 'IDXParticipationYN (normalized)' },
    { pattern: /raw\.IDXEntireListingDisplayYN/, name: 'IDXEntireListingDisplayYN' },
    { pattern: /normalized\.IDXEntireListingDisplayYN/, name: 'IDXEntireListingDisplayYN (normalized)' },
  ];
  const hits = deadFields.filter(({ pattern }) => pattern.test(content));
  if (hits.length === 0) {
    pass('checkDistributionGates uses live Trestle field names (no dead-field references)');
  } else {
    fail('Dead Trestle field references in trestle-mapper.ts gate logic: ' + hits.map(h => h.name).join(', '));
  }
  // Participant Only gate must be present via Permission === 'Private'
  if (/Permission === ['"]Private['"]|permissions === ['"]Private['"]/.test(content)) {
    pass('Gate 2 (Participant Only) checks Permission === "Private" per compliance/IDX-VOW-DISPLAY-RULES.md:41');
  } else {
    fail('Gate 2 (Participant Only) missing — must check Permission === "Private" per REBNY RLS');
  }
}

// ── 19. NY DOS §175.28 Anti-Discrimination Notice on lead-capture forms ──
const LEAD_FORMS_REQUIRING_NOTICE = [
  'app/components/InquiryForm.tsx',
  'app/components/InquiryModal.tsx',
  'app/components/HomeValueWidget.tsx',
  'app/components/CalculatorLeadCapture.tsx',
  'app/contact/page.tsx',
];
const NOTICE_PATTERN = /AntiDiscriminationNotice|175\.28|Anti-Discrimination/i;
for (const rel of LEAD_FORMS_REQUIRING_NOTICE) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full) && fileContains(full, NOTICE_PATTERN)) {
    pass(`Anti-discrimination notice present on ${rel} (NY DOS §175.28)`);
  } else if (fs.existsSync(full)) {
    fail(`Anti-discrimination notice missing on ${rel} — required at first substantive contact (NY DOS §175.28)`);
  }
}

// ── 20. Open-houses route does not leak agent PII or misattribute listings ──
const openHousesPath = path.join(ROOT, 'app/api/open-houses/route.ts');
if (fs.existsSync(openHousesPath)) {
  const content = fs.readFileSync(openHousesPath, 'utf8');
  // The Trestle-facing path MUST NOT default to our brokerage name for third-party
  // listings. The `agentName: (prop.ListOfficeName as string) || X` pattern is the
  // Trestle branch; the local-DB path uses `s.listing.agent_info.ListOfficeName` or
  // similar (our own listings — defaulting to our name is correct there).
  const trestleMisattribution = /agentName:\s*\(prop\.ListOfficeName as string\)\s*\|\|\s*['"]Mallan Real Estate Inc\.['"]/.test(content);
  if (trestleMisattribution) {
    fail("Open-houses Trestle path falls back to 'Mallan Real Estate Inc.' — misattributes third-party listings (UCBA Art. III §2(C))");
  } else {
    pass('Open-houses Trestle-path attribution does not misattribute third-party listings');
  }
  // Local DB path should not expose agent.full_name or agent.phone publicly
  if (/agentName:\s*s\.agent\?\.full_name/.test(content) || /agentPhone:\s*s\.agent\?\.phone/.test(content)) {
    fail('Open-houses local DB path leaks agent full_name or phone in public response (REBNY IDX/VOW checklist)');
  } else {
    pass('Open-houses local DB path does not leak agent PII');
  }
}

// ── 21. Fair Housing text scan on neighborhood JSON data files ──
const NEIGHBORHOOD_DATA_GLOB = ['data/manhattan-neighborhoods.json', 'data/brooklyn-neighborhoods.json', 'data/queens-neighborhoods.json', 'data/bronx-neighborhoods.json', 'data/staten-island-neighborhoods.json'];
const FH_CRITICAL_TERMS = [
  /\bgood schools\b/i,
  /\bstrong schools\b/i,
  /\btop-rated schools\b/i,
  /\bprime school districts?\b/i,
  /\bperfect for families\b/i,
  /\bfamily-friendly\b/i,
  /\bno children\b/i,
  /\byoung professionals only\b/i,
  /\bno section 8\b/i,
  /\bno vouchers\b/i,
  /\bno welfare\b/i,
  /\bcriminal record\b/i,
  /\bex-con\b/i,
];
let fhViolations = [];
for (const rel of NEIGHBORHOOD_DATA_GLOB) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  for (const pat of FH_CRITICAL_TERMS) {
    if (pat.test(content)) {
      fhViolations.push(`${rel}: ${pat.source}`);
    }
  }
}
if (fhViolations.length === 0) {
  pass('Fair Housing scan clean on neighborhood JSON data files (no familial-status, income-source, or criminal-history terms)');
} else {
  fail('Fair Housing violations in neighborhood JSON data files: ' + fhViolations.join('; '));
}

// ── 22. Public agent endpoint must NOT expose phone/email (anti-harvest, REBNY Art. I §5(C)) ──
// Direct contact info belongs on the individual agent detail page (rate-limited by
// being per-slug HTML), not a bulk JSON API that bots can hit once to drain.
const agentsPublicPath = path.join(ROOT, 'app/api/agents/public/route.ts');
if (fs.existsSync(agentsPublicPath)) {
  const content = fs.readFileSync(agentsPublicPath, 'utf8');
  // Check the select block and the mapping for phone/email leakage.
  const selectsPhone = /select\s*:\s*\{[^}]*phone\s*:\s*true/s.test(content);
  const selectsEmail = /select\s*:\s*\{[^}]*email\s*:\s*true/s.test(content);
  const mapsPhone = /phone\s*:\s*a\.phone/.test(content);
  const mapsEmail = /email\s*:\s*a\.email/.test(content);
  if (selectsPhone || selectsEmail || mapsPhone || mapsEmail) {
    fail('Public agent directory exposes phone/email — bots can harvest (app/api/agents/public/route.ts). Strip from select + response.');
  } else {
    pass('Public agent directory does not expose phone/email (anti-harvest, REBNY Art. I §5(C))');
  }
}

// ── 23. Form inputs must have programmatic labels (WCAG 2.1 SC 1.3.1 / 3.3.2 / 4.1.2) ──
// Every <input type="text"|"email"|"tel"|"password"|"number"> in a form must have a
// corresponding <label htmlFor={id}> OR an aria-label. Placeholder alone is NOT a label.
const FORMS_TO_CHECK = [
  'app/sign-in/page.tsx',
  'app/sign-up/page.tsx',
  'app/components/InquiryForm.tsx',
  'app/components/InquiryModal.tsx',
  'app/components/HomeValueWidget.tsx',
  'app/components/CalculatorLeadCapture.tsx',
  'app/components/OpenHouseRSVP.tsx',
  'app/components/RegistrationGate.tsx',
  'app/components/NewsletterSignup.tsx',
  'app/components/HeroSearch.tsx',
  'app/unsubscribe/page.tsx',
  'app/contact/page.tsx',
];
// Walk each `<input` occurrence, consume the attribute span up to the tag's
// self-close (`/>`) or end-of-tag `>` while tracking JSX expression depth
// (braces) and string depth (double/single/backtick). Naive `[^>]*` misses
// attributes because JSX `onChange={(e) => ...}` contains `>` inside an expr.
function extractInputSpans(content) {
  const spans = [];
  let i = 0;
  while (true) {
    const start = content.indexOf('<input', i);
    if (start === -1) break;
    let pos = start + 6;
    let brace = 0;
    let strChar = null;
    while (pos < content.length) {
      const ch = content[pos];
      if (strChar) {
        if (ch === '\\' && pos + 1 < content.length) { pos += 2; continue; }
        if (ch === strChar) strChar = null;
        pos++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { strChar = ch; pos++; continue; }
      if (ch === '{') { brace++; pos++; continue; }
      if (ch === '}') { brace--; pos++; continue; }
      if (brace === 0 && ch === '>') { pos++; break; }
      pos++;
    }
    spans.push(content.slice(start, pos));
    i = pos;
  }
  return spans;
}

for (const rel of FORMS_TO_CHECK) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const spans = extractInputSpans(content);
  let totalInputs = 0;
  let unlabeledInputs = 0;
  const violations = [];
  for (const span of spans) {
    const type = (span.match(/type\s*=\s*"(\w+)"/) || [])[1] || 'text';
    if (!/^(text|email|tel|password|number|search|date)$/.test(type)) continue;
    if (/type\s*=\s*"hidden"/.test(span)) continue;
    totalInputs++;
    const hasAriaLabel = /aria-label\s*=/.test(span);
    const hasAriaLabelledBy = /aria-labelledby\s*=/.test(span);
    const idMatch = span.match(/\bid\s*=\s*"([^"]+)"/);
    const hasMatchingLabel = idMatch && new RegExp(`htmlFor\\s*=\\s*"${idMatch[1].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"`).test(content);
    if (!hasAriaLabel && !hasAriaLabelledBy && !hasMatchingLabel) {
      unlabeledInputs++;
      violations.push(`(type=${type}${idMatch ? ` id=${idMatch[1]}` : ''})`);
    }
  }
  if (totalInputs === 0) continue;
  if (unlabeledInputs === 0) {
    pass(`WCAG labels: ${rel} (${totalInputs} inputs checked)`);
  } else {
    fail(`WCAG label violation in ${rel}: ${unlabeledInputs}/${totalInputs} inputs lack <label htmlFor> or aria-label — ${violations.join(', ')}`);
  }
}

// ── 24. FARE Act disclosure present on rental card/search surfaces (NYC LL 119/2024) ──
const FARE_SURFACES = [
  'app/components/SearchListingCard.tsx',
  'app/search/page.tsx',
  'app/listing/[id]/page.tsx',
];
for (const rel of FARE_SURFACES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  if (/FareActFeeBadge|FARE Act|LL 119\/2024|tenantPaysDescription|moveInCosts/.test(content)) {
    pass(`FARE Act disclosure wired on ${rel}`);
  } else {
    fail(`FARE Act disclosure missing on ${rel} (NYC LL 119/2024 — disclose wherever rental fees are advertised)`);
  }
}

console.log(`\n=== Result: ${passes} passed, ${failures} failed ===`);
process.exit(failures > 0 ? 1 : 0);
