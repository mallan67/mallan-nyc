/// <reference types="jest" />
/**
 * scripts/validate-rls-compliance.js is a COVERAGE / ASSERTION REPORTER over the canonical contracts —
 * never a parallel authority (Packet 2 closure, blocker round).
 *
 *   provider fields / enums      → lib/cotality/live-contract.ts
 *   required / conditional rules → lib/compliance/rebny-ucba-rules.ts (REBNY_UCBA_RULES)
 *   Mallan-internal facts        → lib/listings/mallan-form-contract.ts (MALLAN_INTERNAL_KEYS)
 *   legacy phantom names         → lib/compliance/legacy-form-keys.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/validate-rls-compliance.js');
const src = readFileSync(SCRIPT, 'utf8');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('the RLS validator consumes the canonical contracts and recreates none of them', () => {
  it('loads the live contract, the REBNY/UCBA rules, the Mallan form contract and the legacy phantom list', () => {
    expect(code).toMatch(/require\(path\.join\(REPO_ROOT, 'lib', 'cotality', 'live-contract'\)\)/);
    expect(code).toMatch(/require\(path\.join\(REPO_ROOT, 'lib', 'compliance', 'rebny-ucba-rules'\)\)/);
    expect(code).toMatch(/require\(path\.join\(REPO_ROOT, 'lib', 'listings', 'mallan-form-contract'\)\)/);
    expect(code).toMatch(/require\(path\.join\(REPO_ROOT, 'lib', 'compliance', 'legacy-form-keys'\)\)/);
    expect(code).toMatch(/REBNY_UCBA_RULES\.requiredFields\.agentSubmitted/);
    expect(code).toMatch(/REBNY_UCBA_RULES\.conditionalRules/);
    expect(code).toMatch(/liveEnumMembers\(/);
  });
  it('reads no REBNY CSV and carries no CSV-derived rule set, rename table or picklist parser', () => {
    expect(code).not.toMatch(/rebny-rls-property-(fields|lookup)\.csv/);
    expect(code).not.toMatch(/loadRequiredFields|loadAllRLSFields|loadPicklistMap|parseSimpleCSV/);
    expect(code).not.toMatch(/RESO_TO_RLS_RENAMES|CRITICAL_RENAMES|rls-crm-overlays/);
    expect(src).not.toMatch(/Sources? of truth:\s*\n\/\/\s+data\//);
  });
  it('makes no provider decision on a phantom name: the phantom set is imported, never hand-typed as a gate pattern', () => {
    expect(code).not.toMatch(/patterns:\s*\[[^\]]*(IDXEntireListingDisplayYN|SyndicateYN)/);
    expect(code).not.toMatch(/['"]SyndicateYN['"]\s*[,)]/);
    expect(code).toMatch(/LEGACY_MALLAN_FORM_CONTROL_KEYS/);
    // the gate assertions name only live fields (verified live 2026-09-06)
    for (const f of ['InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'InternetAutomatedValuationDisplayYN', 'InternetConsumerCommentYN', 'Permission', 'SyndicateTo', 'StandardStatus']) {
      expect(code).toContain(`field: '${f}'`);
    }
  });
  it('the alias / UI-id configs stay Mallan UI configuration: every accepted alias target is canonical', () => {
    const aliases = JSON.parse(readFileSync(join(ROOT, 'data/rls-field-aliases.json'), 'utf8')) as Record<string, string>;
    for (const target of Object.values(aliases)) expect(['SyndicateYN', 'IDXEntireListingDisplayYN', 'ParticipantOnlyYN']).not.toContain(target);
    expect(code).toMatch(/PHANTOMS\.has\(target\)/);
    expect(code).toMatch(/isCanonical\(target\)/);
  });
  it('npm run rls:validate runs the reporter under tsx', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['rls:validate']).toBe('tsx scripts/validate-rls-compliance.js');
  });
});

describe('no runtime surface leans on the phantom distribution names', () => {
  const phantomRe = /(?<![A-Za-z0-9_$])(IDXEntireListingDisplayYN|SyndicateYN|ParticipantOnlyYN)(?![A-Za-z0-9_$])/;
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (!['node_modules', '.next', '__tests__'].includes(n)) out.push(...walk(p)); }
      else if (/\.(ts|tsx|js|html)$/.test(n) && !/\.test\./.test(n)) out.push(p);
    }
    return out;
  }
  const codeOnly = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join('\n');
  it('browser code, the CRM forms, the write routes and the compliance gates name no phantom in active code', () => {
    const files = [
      ...walk(join(ROOT, 'public/crm/js')),
      join(ROOT, 'public/crm/SALE-FORM-REDESIGN.html'), join(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'),
      ...walk(join(ROOT, 'app/api/crm')),
      join(ROOT, 'lib/compliance/rls-enforcement.ts'), join(ROOT, 'lib/compliance/idx-display-gate.ts'), join(ROOT, 'lib/idx/trestle-mapper.ts'),
    ].filter(existsSync);
    const hits: string[] = [];
    for (const f of files) {
      codeOnly(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        const m = line.match(phantomRe);
        if (m) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${m[1]}`);
      });
    }
    // the legacy-key module (classification only) and the form contract's alias TABLE (which redirects the
    // legacy key to the Mallan decision) are the only places a phantom may be spelled
    expect(hits).toEqual([]);
  });
  it('the write path reads the Mallan IDX-display decision, never a provider-named key', () => {
    const patch = readFileSync(join(ROOT, 'app/api/crm/listings/[id]/route.ts'), 'utf8');
    expect(patch).toMatch(/const idxDisplayControl = body\._mallanIdxDisplay \?\? body\.saleIdxDisplayYN \?\? body\.rentalIdxDisplayYN;/);
    const contract = readFileSync(join(ROOT, 'lib/listings/mallan-form-contract.ts'), 'utf8');
    expect(contract).toMatch(/IDXEntireListingDisplayYN: '_mallanIdxDisplay'/);
    expect(contract).toMatch(/'_mallanIdxDisplay'/);
    const rental = readFileSync(join(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
    expect(rental).toMatch(/data\._mallanIdxDisplay = data\.rentalDist_IDX !== false/);
    expect(rental).not.toMatch(/data\.(IDXEntireListingDisplayYN|SyndicateYN)\s*=/);
  });
});

describe('the reporter runs green over the canonical contracts', () => {
  it('exits 0 with zero errors and zero UNKNOWN controls, and reports canonical coverage', () => {
    const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const r = spawnSync(process.execPath, [tsx, SCRIPT], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    expect(out).toMatch(/TOTAL: 0 ERRORS, \d+ WARNINGS?, 0 MISSING/);
    expect(out).toMatch(/UNKNOWN: 0 \(MUST be 0\)/);
    expect(out).toMatch(/RESULT: PASS/);
    expect(out).toMatch(/Section {2}7: CONDITIONAL RULES \(REBNY\/UCBA\) \.+ PASS/);
    expect(out).toMatch(/REBNY contract \d+\/\d+ collectable/);
    expect(out).toMatch(/live Cotality Property fields: \d+ \(pull /);
    expect(r.status).toBe(0);
  }, 200000);
  it('CLI exit and HTML PASS use the same predicate: errors, UNKNOWN and MISSING all block', () => {
    expect(code).toMatch(/const passAll = totalErrors === 0 && totalMissing === 0 && classification\.unknown === 0;[\s\S]*process\.exit\(passAll \? 0 : 1\)/);
    expect(code).not.toMatch(/process\.exit\(\(totalErrors > 0 \|\| classification\.unknown > 0\)/);
    // an applicable conditional gap is an ERROR (never an informational MISSING)
    expect(code).toMatch(/error\(7, `\$\{data\.fname\}: \$\{rule\.code\} \(\$\{rule\.description\}\) applies to this form but cannot be satisfied/);
    expect(code).not.toMatch(/missing\(`/);
  });
});
