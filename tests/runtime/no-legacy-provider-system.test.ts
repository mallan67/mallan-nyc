/// <reference types="jest" />
/**
 * The replaced provider system cannot come back (owner ruling 2026-09-08).
 *
 * Cotality (Trestle) is the only provider authority: Cotality raw contract → verified mapping → Mallan storage →
 * Mallan business rules → consumers. The old RLS / RESO / RealPlus reference system — field catalogues, enums,
 * mappings, snapshots, the generators and validators that read them, the runtime fallback, the agent
 * instructions that pointed at them, the legacy provider names in commands and form bindings — was removed.
 *
 * This ratchet proves nothing can override or regenerate it:
 *   1. none of the removed reference files, generators or validators exists;
 *   2. no code, config, test, form or agent instruction names one of them (outside the guards that keep them out);
 *   3. no npm command runs them and the daily diff runs the Cotality authority CLI;
 *   4. the MCP field tool has no snapshot fallback;
 *   5. the forms carry the current binding names only (data-cotality-field / data-mallan-field / data-mallan-ignore);
 *   6. the rule manifest and the agent instructions point at the live contract.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const REMOVED_PATHS = [
  'data/rebny-rls-property-fields.csv', 'data/rebny-rls-property-lookup.csv', 'data/rebny-idx-plus-3.15.26.xlsx',
  'data/RLS-FIELD-REGISTRY.md', 'data/MASTER_REGISTRY.json', 'data/FIELD_REGISTRY.json', 'data/SEARCH_CONTROL_MAP.json',
  'data/rls-form-bindings.json', 'data/rls-crm-overlays.json', 'data/rebny-fields.txt', 'data/rebny-all-fields.txt',
  'data/Trestle_Data_Dictionary.xml', 'data/RLS-Syndication-Research.md', 'data/rls-field-aliases.json', 'data/rls-internal-only.json',
  'artifacts/metadata.xml', 'artifacts/reso-drift', 'artifacts/reso-snapshots', 'artifacts/schema-audit.json', 'artifacts/schema-audit.md',
  'artifacts/api-route-catalog.md', 'artifacts/api-route-catalog.json',
  'compliance/fields.json', 'compliance/lookups.json', 'compliance/rules/rls-required.json', 'compliance/rules/reso-rls-renames.json',
  'SALE-FORM-MASTER-REFERENCE.md',
  'scripts/generate-master-registry.js', 'scripts/patch-master-registry.js', 'scripts/audit-form-fields.js', 'scripts/inject-rls-attributes.js',
  'scripts/annotate-search-rls-ignore.js', 'scripts/compliance-test.js', 'scripts/validate-field-mapping.js', 'scripts/refresh-trestle-csv.ts',
  'scripts/trestle-live-vs-csv.ts', 'scripts/lib/csv-residue.ts', 'lib/idx/__tests__/csv-residue.test.ts', 'scripts/get-metadata.js',
  'scripts/generate-mapping-report.js', 'run-fetch-and-map.sh', 'verify-rebny-mapping.sh', 'scripts/reso',
  'scripts/fix-stale-form-bindings.ts', 'scripts/fix-search-form-ui-only-ids.ts', 'scripts/validate-standalone.js',
  'public/crm/tests/validate-standalone.js', 'public/crm/scripts/validate-rls-picklists.js',
  'public/crm/js/compliance/rental-field-rules.js', 'public/crm/js/compliance/form-shared.js', 'scripts/test-full-mapping.js',
];

/** Names that only the old system used; any live mention is a recreate path. */
const REMOVED_NAMES = [
  'rebny-rls-property-fields', 'rebny-rls-property-lookup', 'rebny-idx-plus-3.15.26', 'RLS-FIELD-REGISTRY', 'MASTER_REGISTRY.json',
  'FIELD_REGISTRY.json', 'SEARCH_CONTROL_MAP', 'rls-form-bindings.json', 'rls-crm-overlays', 'rebny-all-fields', 'rebny-fields.txt',
  'Trestle_Data_Dictionary', 'RLS-Syndication-Research', 'rls-field-aliases', 'rls-internal-only', 'artifacts/metadata.xml',
  'reso-drift', 'reso-snapshots', 'schema-audit.json', 'compliance/fields.json', 'compliance/lookups.json', 'rls-required.json',
  'reso-rls-renames', 'SALE-FORM-MASTER-REFERENCE', 'generate-master-registry', 'patch-master-registry', 'audit-form-fields.js',
  'inject-rls-attributes', 'annotate-search-rls-ignore', 'compliance-test.js', 'validate-field-mapping', 'refresh-trestle-csv',
  'trestle-live-vs-csv', 'csv-residue', 'get-metadata.js', 'generate-mapping-report', 'run-fetch-and-map', 'verify-rebny-mapping',
  'scripts/reso/', 'fix-stale-form-bindings', 'fix-search-form-ui-only-ids', 'validate-standalone', 'validate-rls-picklists',
  'rental-field-rules', 'form-shared.js', 'RESO_TO_RLS_RENAMES', 'LOCAL_METADATA_FALLBACK', 'local_fallback',
];

/** Files whose mentions keep the old system OUT (guards, removal records) — every other mention is a violation. */
const GUARDS = new Set([
  'tests/runtime/no-legacy-provider-system.test.ts',
  'tests/runtime/cotality-contract-facts.ts',
  'tests/runtime/guardrails-prohibited-terms-single-source.test.ts',
  'tests/runtime/provider-authority-census.test.ts',
  'tests/runtime/rls-form-bindings-canonical.test.ts',
  'tests/runtime/rls-validator-canonical-reporter.test.ts',
  'tests/runtime/cotality-live-authority-guard.test.ts',
  'scripts/validate-rls-compliance.js',
  'scripts/validate-form-rls.js',
  'scripts/idx-validate.js',
  'scripts/cotality/search-coverage-matrix.mjs',
]);

const SCAN_ROOTS = ['lib', 'app', 'scripts', 'tests', 'mcp/trestle-fields', 'public/crm', 'compliance', 'data', '.claude/skills', '.claude/agents'];
const SCAN_FILES = ['package.json', 'CLAUDE.md', 'AGENTS.md', 'README.md', 'vercel.json', 'jest.config.js', 'tsconfig.json'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage']);
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|yml|yaml|sh)$/;

function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.test(name) && !/validator-results\.json$|rls-report\.html$/.test(name)) out.push(rel);
  }
  return out;
}

describe('1. the removed provider reference files, generators and validators do not exist', () => {
  it.each(REMOVED_PATHS)('%s is gone', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false);
  });
  it('the live Cotality contract is what remains', () => {
    for (const p of ['lib/cotality/live-contract.ts', 'lib/cotality/generated/contract.ts', 'data/cotality-contract/contract.compact.json', 'data/cotality-contract/lookups.live.json', 'data/cotality-enums.live.json', 'scripts/cotality/authority/cli.mjs']) {
      expect(existsSync(join(ROOT, p))).toBe(true);
    }
  });
});

describe('2. nothing names the removed system (outside the guards that keep it out)', () => {
  const files = [...SCAN_ROOTS.flatMap((d) => walk(d)), ...SCAN_FILES.filter((f) => existsSync(join(ROOT, f)))];
  it('scans a real corpus', () => { expect(files.length).toBeGreaterThan(500); });
  it('no live mention of a removed file, generator, validator, mapping constant or fallback', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (GUARDS.has(relative(ROOT, join(ROOT, rel)).replace(/\\/g, '/'))) continue;
      const text = read(rel);
      for (const name of REMOVED_NAMES) if (text.includes(name)) offenders.push(`${rel}: ${name}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('3. no command runs the old system; the daily diff is the Cotality authority CLI', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  it('the generator / toolkit / snapshot commands are gone', () => {
    for (const k of ['generate:registry', 'rls:generate', 'rls:inject', 'trestle:refresh-csv', 'validate:standalone', 'backup:standalone']) expect(pkg.scripts).not.toHaveProperty(k);
    expect(Object.keys(pkg.scripts).filter((k) => k.startsWith('reso:'))).toEqual([]);
  });
  it('trestle:diff detects live drift through the authority CLI (the workflow that runs it is unchanged)', () => {
    expect(pkg.scripts['trestle:diff']).toMatch(/scripts\/cotality\/authority\/cli\.mjs detect$/);
    expect(read('.github/workflows/trestle-live-audit.yml')).toMatch(/npm run trestle:diff/);
  });
  it('no workflow RUNS a removed command (the workflow files are held read-only; stale prose in them is recorded, not executed)', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(join(ROOT, '.github/workflows')).filter((n) => /\.ya?ml$/.test(n))) {
      const lines = read(`.github/workflows/${f}`).split(/\r?\n/).filter((l) => /^\s*(-\s*)?run:|^\s+(npm|npx|node|tsx)\s/.test(l));
      for (const l of lines) {
        for (const name of REMOVED_NAMES) if (l.includes(name)) offenders.push(`${f}: ${l.trim()}`);
        if (/npm run (generate:registry|rls:generate|rls:inject|reso:|trestle:refresh-csv|validate:standalone|backup:standalone)/.test(l)) offenders.push(`${f}: ${l.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('no script reads or writes a provider catalogue file (a CSV / workbook / XML named for REBNY, RLS, RESO, Trestle, Cotality, a registry or a metadata snapshot)', () => {
    const catalogue = new RegExp("['\"`][^'\"`\\r\\n]*(?:rebny|rls|reso|trestle|cotality|metadata|registry|dictionary)[^'\"`\\r\\n]*\\.(?:csv|xlsx|xml)['\"`]", 'i');
    const offenders = walk('scripts').filter((f) => /\.(ts|js|mjs)$/.test(f) && catalogue.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('4. the MCP field tool is live-only', () => {
  it('has no snapshot fallback and fails loudly', () => {
    const src = read('mcp/trestle-fields/index.ts');
    expect(src).not.toMatch(/metadata\.xml|local_fallback|LOCAL_METADATA_FALLBACK|existsSync|readFileSync/);
    expect(src).toMatch(/no snapshot fallback/);
  });
});

describe('5. the forms carry the current binding names only', () => {
  const forms = ['SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html', 'SALE-FORM-WITH-TOOLS.html', 'RENTAL-FORM-WITH-TOOLS.html', 'html/search-form-and-results.html', 'index-built.html'];
  it.each(forms)('public/crm/%s has no data-rls-field / data-rls-ignore', (f) => {
    const html = read(`public/crm/${f}`);
    expect(html.includes('data-rls-field=')).toBe(false);
    expect(html.includes('data-rls-ignore=')).toBe(false);
  });
  it('the entry forms bind ≥ 150 / ≥ 200 controls with data-cotality-field; the viewers keep data-rls-viewer (pinned by the held workflow)', () => {
    expect((read('public/crm/SALE-FORM-REDESIGN.html').match(/data-cotality-field="/g) || []).length).toBeGreaterThanOrEqual(150);
    expect((read('public/crm/RENTAL-FORM-REDESIGN.html').match(/data-cotality-field="/g) || []).length).toBeGreaterThanOrEqual(200);
    expect(read('public/crm/SALE-FORM-WITH-TOOLS.html')).toContain('data-rls-viewer="true"');
    expect(read('.github/workflows/crm-validate.yml')).toContain('data-rls-viewer="true"');
  });
  it('the validator refuses the legacy spelling', () => {
    expect(read('scripts/validate-rls-compliance.js')).toMatch(/legacy "\$\{legacy\.slice\(0, -1\)\}" attribute/);
  });
});

describe('6. the rule manifest and the agent instructions point at the live contract', () => {
  it('compliance/rules/active.json carries no field catalogue, rename table or generator', () => {
    const active = JSON.parse(read('compliance/rules/active.json')) as Record<string, Record<string, string>>;
    expect(active.enforcedRules).not.toHaveProperty('rlsRequired');
    expect(active.enforcedRules).not.toHaveProperty('resoRlsRenames');
    expect(active).not.toHaveProperty('fieldData');
    expect(active.validator).not.toHaveProperty('bindings');
    expect(active.validator).not.toHaveProperty('injector');
    expect(JSON.stringify(active)).not.toMatch(/RealPlus|lmp/);
    expect(active.formControlConfig.controlAliases).toBe('data/mallan-form-control-aliases.json');
  });
  it('the REBNY skill names the live contract as the only field authority and no snapshot command', () => {
    const skill = read('.claude/skills/rebny-compliance/SKILL.md');
    expect(skill).toMatch(/COTALITY LIVE CONTRACT/);
    expect(skill).toMatch(/npm run cotality:authority -- refresh/);
    expect(skill).not.toMatch(/RLS TRUMPS ALL|RESO\/IDX fills gaps|get-metadata|rebny-field-tables|ALL_RLS_FIELDS|IDX_PLUS_SELECT_FIELDS/);
  });
  it('CLAUDE.md §H points at the live contract, not a registry, CSV or snapshot', () => {
    const cc = read('CLAUDE.md');
    expect(cc).toMatch(/Cotality live provider contract/);
    expect(cc).not.toMatch(/RLS-FIELD-REGISTRY|rebny-rls-property|artifacts\/metadata\.xml/);
  });
});
