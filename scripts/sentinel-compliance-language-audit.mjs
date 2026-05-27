#!/usr/bin/env node
// Sentinel-L.2 — deterministic compliance-language audit.
//
// Scans changed listing-related files for compliance-risk patterns in
// user-facing copy, labels, alt text, and string literals. Emits a JSON
// report. Three categories of risk:
//
//   - fair_housing       : protected-class steering, discriminatory
//                          preference, source-of-income/familial-status/
//                          disability exclusion, "ideal for <X>" framing
//   - advertising        : brokerage identity, misleading availability,
//                          false "verified" claims, hidden fees/price,
//                          public display of internal-only listings
//   - rebny_idx          : display flags ignored, attribution missing,
//                          address suppression bypass, ListingKey vs
//                          ListingId confusion, RESO mismatch
//
// This is deterministic static analysis — it surfaces signals. Claude's
// audit decides whether each signal is a true violation in context.
//
// Pure Node fs/path. No child_process, no eval, no shell.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── Rule catalog (id, category, severity, regex, description) ────────────
// Severity: P0 (critical: must fix before merge) / P1 (high) /
// P2 (medium) / P3 (informational signal).
const RULES = [
  // ── Fair Housing ─────────────────────────────────────────────────────
  {
    id: 'FH-FAMILIAL-STATUS-PREFERENCE',
    category: 'fair_housing',
    severity: 'P1',
    description: 'Phrase implies preference based on familial status (protected under FHA + NY State + NYC HRL).',
    re: /\b(perfect|ideal|great|best)\s+for\s+(famil(y|ies)|young\s+couples?|empty\s+nesters?|singles?|professionals?|retirees?|seniors?|students?)\b/i,
  },
  {
    id: 'FH-SOURCE-OF-INCOME-EXCLUSION',
    category: 'fair_housing',
    severity: 'P0',
    description: 'NYC + NY State Source of Income protected class — vouchers/Section 8 cannot be excluded.',
    re: /\b(no\s+(section\s*8|vouchers?|government\s+assistance|housing\s+assistance|HRA|CityFHEPS|FHEPS)|vouchers?\s+not\s+accepted|cash\s+only|no\s+programs?)\b/i,
  },
  {
    id: 'FH-CRIMINAL-HISTORY',
    category: 'fair_housing',
    severity: 'P0',
    description: 'NYC Fair Chance Housing Act (LL 24/2023) — criminal history inquiry/preference prohibited.',
    re: /\b(no\s+(felons?|criminals?|conviction|record|background)|background\s+check\s+required|clean\s+record)\b/i,
  },
  {
    id: 'FH-DISABILITY-EXCLUSION',
    category: 'fair_housing',
    severity: 'P0',
    description: 'Disability is a protected class — reasonable-accommodation/ESA refusal is unlawful.',
    re: /\b(no\s+(wheelchair|disabled|service\s+animals?|emotional\s+support|ESA)|fully\s+abled?\s+only|no\s+special\s+needs)\b/i,
  },
  {
    id: 'FH-NATIONAL-ORIGIN-PREFERENCE',
    category: 'fair_housing',
    severity: 'P0',
    description: 'National-origin / immigration-status preference prohibited under FHA + NYC HRL.',
    re: /\b(citizens?\s+only|english\s+speaking\s+only|no\s+foreign|US\s+citizens?\s+preferred|legal\s+residents?\s+only)\b/i,
  },
  {
    id: 'FH-SEX-PREFERENCE',
    category: 'fair_housing',
    severity: 'P1',
    description: 'Sex/gender preference language — narrow same-sex roommate exception does not apply to housing ads.',
    re: /\b(male\s+only|female\s+only|men\s+preferred|women\s+preferred|no\s+(men|women|trans))\b/i,
  },
  {
    id: 'FH-RELIGION-PREFERENCE',
    category: 'fair_housing',
    severity: 'P1',
    description: 'Religion preference prohibited.',
    re: /\b(christian|jewish|muslim|hindu|buddhist|catholic|orthodox)\s+(only|preferred|community|family)\b/i,
  },

  // ── Advertising / NYC / NYS ──────────────────────────────────────────
  {
    id: 'AD-MISLEADING-AVAILABILITY',
    category: 'advertising',
    severity: 'P1',
    description: '19 NYCRR §175.25 — misleading availability claims (off-market displayed as active).',
    re: /\b(off[\s-]?market|exclusive\s+access|unlisted\s+pocket|secret\s+listing|private\s+listing)\b/i,
  },
  {
    id: 'AD-FALSE-VERIFIED',
    category: 'advertising',
    severity: 'P1',
    description: 'False or unsubstantiated "verified" / "guaranteed" / "100%" claims violate §175.25.',
    re: /\b(100%\s+verified|guaranteed\s+best\s+price|fully\s+vetted\s+landlords?|risk[\s-]?free)\b/i,
  },
  {
    id: 'AD-NO-FEE-WHEN-FEE-EXISTS',
    category: 'advertising',
    severity: 'P0',
    description: 'NYC FARE Act (LL 119/2024) — "no fee" cannot appear if any broker fee is charged to the tenant.',
    re: /\b(no[\s-]?fee\s+rental|fee[\s-]?free|0%\s+fee)\b/i,
  },
  {
    id: 'AD-HIDDEN-PRICE',
    category: 'advertising',
    severity: 'P2',
    description: '§175.25 — price obfuscation ("price upon request" on residential active listings is risky).',
    re: /\b(price\s+(upon|on)\s+request|POR|call\s+for\s+price)\b/i,
  },

  // ── REBNY / RLS / IDX ────────────────────────────────────────────────
  {
    id: 'IDX-DISPLAY-FLAG-BYPASS',
    category: 'rebny_idx',
    severity: 'P0',
    description: 'Bypassing InternetEntireListingDisplayYN / InternetAddressDisplayYN gates is a UCBA + REBNY violation.',
    re: /\/\/\s*ignor(e|ing)\s+(internet|display).*YN|bypass.*display.*gate|skip.*display.*check/i,
  },
  {
    id: 'IDX-LISTING-KEY-CONFUSION',
    category: 'rebny_idx',
    severity: 'P1',
    description: 'Trestle uses ListingKey (UUID) as the stable primary identifier — ListingId is broker-MLS-local and not stable across MLSes.',
    re: /\bListingId\b(?!.*ListingKey|.*comment)/,
    requires_path_match: /^(lib\/idx\/|app\/api\/(crm\/)?listings\/|lib\/search\/)/,
  },
  {
    id: 'IDX-PROPERTY-AS-BUILDING-SOURCE',
    category: 'rebny_idx',
    severity: 'P1',
    description: 'Trestle Building resource is the authoritative building source — treating Property as the only building source can produce mismatched canonicalization.',
    re: /\bbuildingFrom(Listing|Property)\b|\bnormaliz(e|ed)BuildingFromProperty\b/,
    requires_path_match: /^(lib\/idx\/|app\/api\/buildings\/)/,
  },
  {
    id: 'IDX-ATTRIBUTION-MISSING',
    category: 'rebny_idx',
    severity: 'P0',
    description: 'REBNY RLS attribution ("Listing Courtesy of <brokerage>") missing on a public listing surface.',
    re: /(<(IDXDisclaimer|Attribution|ListingCourtesy)\b[^>]*\/>|courtesy[A-Za-z]*\s*[:=]\s*null)/,
    requires_path_match: /^(app\/listing\/|app\/components\/(Listing|Featured|IDX))/,
    invert: true, // P0 if the marker is MISSING — handled below as a separate file-level pass
  },
];

// ── Path filter for category-relevant scanning ───────────────────────────
// Only scan files where the rule's risk is contextually meaningful.
const SCANNABLE_EXTENSIONS = new Set(['.html', '.tsx', '.ts', '.js', '.jsx', '.mjs', '.md']);

function isPublicSurface(filePath) {
  const p = filePath.replace(/\\/g, '/');
  return (
    /^public\/crm\//.test(p) ||
    /^app\//.test(p) ||
    /^lib\/idx\//.test(p) ||
    /^lib\/compliance\//.test(p) ||
    /^lib\/search\//.test(p)
  );
}

function severityRank(s) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[s] ?? 99;
}

// ── Read changed files from env or stdin ─────────────────────────────────
async function readChangedFiles() {
  const fromEnv = process.env.CHANGED_FILES || '';
  let raw = fromEnv;
  if (!raw && process.argv.length > 2 && process.argv[2] === '--from-stdin') {
    raw = await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.on('data', (c) => { buf += c.toString(); });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const changedFiles = await readChangedFiles();
  const repoRoot = process.cwd();
  const violations = [];
  const scannedFiles = [];

  for (const relPath of changedFiles) {
    if (!isPublicSurface(relPath)) continue;
    const ext = path.extname(relPath).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;
    const absPath = path.resolve(repoRoot, relPath);
    let content;
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) continue;
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    scannedFiles.push(relPath);
    const lines = content.split('\n');

    for (const rule of RULES) {
      if (rule.invert) continue; // skip the attribution-missing pseudo-rule for now (TODO v2)
      if (rule.requires_path_match && !rule.requires_path_match.test(relPath.replace(/\\/g, '/'))) {
        continue;
      }
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (rule.re.test(line)) {
          // Trim the matched line for reporting (cap at 120 chars).
          const snippet = line.trim().slice(0, 120);
          violations.push({
            file: relPath,
            line: i + 1,
            category: rule.category,
            severity: rule.severity,
            rule_id: rule.id,
            rule: rule.description,
            matched_snippet: snippet,
          });
        }
      }
    }
  }

  // Summary counts + highest-severity rollup
  const summary = {
    fair_housing_count: violations.filter((v) => v.category === 'fair_housing').length,
    advertising_count: violations.filter((v) => v.category === 'advertising').length,
    rebny_idx_count: violations.filter((v) => v.category === 'rebny_idx').length,
    total_violations: violations.length,
    highest_severity:
      violations.length === 0
        ? 'none'
        : violations.reduce(
          (acc, v) => (severityRank(v.severity) < severityRank(acc) ? v.severity : acc),
          'P3',
        ),
  };

  const output = {
    schema_version: 'sentinel-l.2-compliance-language-v1',
    generated_at: new Date().toISOString(),
    scanned_files: scannedFiles,
    scanned_files_count: scannedFiles.length,
    rules_total: RULES.length,
    violations,
    summary,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`sentinel-compliance-language-audit: ERROR ${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
