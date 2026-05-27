/**
 * Sentinel-L.2 — scripts/sentinel-compliance-language-audit.mjs tests.
 *
 * Deterministic copy/label/literal scanner that surfaces Fair Housing,
 * NY/NYC advertising, and REBNY/RLS/IDX compliance signals from changed
 * files. The script does NOT make final judgments — it surfaces signals
 * that Claude's audit then evaluates in context. These tests pin the
 * rule catalog + severity rollup behavior.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'sentinel-compliance-language-audit.mjs');

function runScript({ env = {}, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH], { cwd, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.stdin.end();
  });
}

function makeTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-l2-compliance-'));
}

function writeFile(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

describe('sentinel-compliance-language-audit.mjs', () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = makeTmpdir();
  });

  afterEach(() => {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('source-level guardrails', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    test('no child_process / eval / new Function', () => {
      expect(codeOnly).not.toMatch(/child_process/);
      expect(codeOnly).not.toMatch(/\beval\s*\(/);
      expect(codeOnly).not.toMatch(/new\s+Function\s*\(/);
    });
  });

  describe('schema + empty input', () => {
    test('emits valid JSON with schema_version when CHANGED_FILES is empty', async () => {
      const { code, stdout, stderr } = await runScript({ env: { CHANGED_FILES: '' }, cwd: tmpdir });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const out = JSON.parse(stdout);
      expect(out.schema_version).toBe('sentinel-l.2-compliance-language-v1');
      expect(out.violations).toEqual([]);
      expect(out.summary.total_violations).toBe(0);
      expect(out.summary.highest_severity).toBe('none');
      expect(out.rules_total).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Fair Housing rules', () => {
    test('flags FH-FAMILIAL-STATUS-PREFERENCE on "perfect for families"', async () => {
      writeFile(
        tmpdir,
        'public/crm/SALE-FORM-REDESIGN.html',
        '<p>This co-op is perfect for families with kids.</p>\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.violations.length).toBeGreaterThanOrEqual(1);
      const fh = out.violations.find((v) => v.rule_id === 'FH-FAMILIAL-STATUS-PREFERENCE');
      expect(fh).toBeDefined();
      expect(fh.category).toBe('fair_housing');
      expect(fh.severity).toBe('P1');
      expect(out.summary.fair_housing_count).toBeGreaterThanOrEqual(1);
    });

    test('flags FH-SOURCE-OF-INCOME-EXCLUSION on "no section 8"', async () => {
      writeFile(
        tmpdir,
        'public/crm/RENTAL-FORM-REDESIGN.html',
        '<p>No section 8 vouchers accepted at this property.</p>\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/RENTAL-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'FH-SOURCE-OF-INCOME-EXCLUSION');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
      expect(out.summary.highest_severity).toBe('P0');
    });

    test('flags FH-CRIMINAL-HISTORY on "background check required"', async () => {
      writeFile(
        tmpdir,
        'app/listing/[id]/page.tsx',
        'const desc = "Background check required for all tenants";\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/listing/[id]/page.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'FH-CRIMINAL-HISTORY');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
    });

    test('flags FH-DISABILITY-EXCLUSION on "no service animals"', async () => {
      writeFile(tmpdir, 'app/components/ListingDescription.tsx', '<p>No service animals allowed.</p>\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/components/ListingDescription.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'FH-DISABILITY-EXCLUSION');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
    });

    test('flags FH-NATIONAL-ORIGIN-PREFERENCE on "US citizens only"', async () => {
      writeFile(tmpdir, 'public/crm/SALE-FORM-REDESIGN.html', '<p>US citizens only.</p>\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'FH-NATIONAL-ORIGIN-PREFERENCE');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
    });
  });

  describe('Advertising rules', () => {
    test('flags AD-MISLEADING-AVAILABILITY on "off-market" claim', async () => {
      writeFile(tmpdir, 'app/components/Listing.tsx', '<p>Off-market opportunity exclusive to our brokerage</p>\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/components/Listing.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'AD-MISLEADING-AVAILABILITY');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P1');
      expect(out.summary.advertising_count).toBeGreaterThanOrEqual(1);
    });

    test('flags AD-NO-FEE-WHEN-FEE-EXISTS as P0 (FARE Act risk)', async () => {
      writeFile(tmpdir, 'app/components/FeaturedListings.tsx', 'const tag = "No-fee rental";\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/components/FeaturedListings.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'AD-NO-FEE-WHEN-FEE-EXISTS');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
    });

    test('flags AD-FALSE-VERIFIED on "100% verified"', async () => {
      writeFile(tmpdir, 'app/listing/[id]/page.tsx', 'const blurb = "100% verified by our team";\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/listing/[id]/page.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'AD-FALSE-VERIFIED');
      expect(v).toBeDefined();
    });
  });

  describe('REBNY/RLS/IDX rules', () => {
    test('flags IDX-DISPLAY-FLAG-BYPASS on a comment that says "ignore display"', async () => {
      writeFile(
        tmpdir,
        'lib/idx/trestle-mapper.ts',
        '// ignore display YN for this listing\nconst flag = true;\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'lib/idx/trestle-mapper.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'IDX-DISPLAY-FLAG-BYPASS');
      expect(v).toBeDefined();
      expect(v.severity).toBe('P0');
    });

    test('flags IDX-LISTING-KEY-CONFUSION on ListingId usage in lib/idx', async () => {
      writeFile(tmpdir, 'lib/idx/mapping.ts', 'const id = record.ListingId;\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'lib/idx/mapping.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'IDX-LISTING-KEY-CONFUSION');
      expect(v).toBeDefined();
    });

    test('does NOT flag IDX-LISTING-KEY-CONFUSION outside lib/idx/, app/api/listings, lib/search/', async () => {
      // Same content but in a docs file — rule's requires_path_match
      // restricts the scan surface.
      writeFile(tmpdir, 'app/components/SomeUnrelatedComponent.tsx', 'const id = record.ListingId;\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/components/SomeUnrelatedComponent.tsx' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const v = out.violations.find((x) => x.rule_id === 'IDX-LISTING-KEY-CONFUSION');
      expect(v).toBeUndefined();
    });
  });

  describe('severity rollup', () => {
    test('highest_severity reflects the most severe violation found', async () => {
      writeFile(
        tmpdir,
        'public/crm/RENTAL-FORM-REDESIGN.html',
        '<p>Off-market listing</p>\n<p>No section 8 vouchers accepted</p>\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/RENTAL-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      // P1 (off-market) + P0 (no section 8) → P0 rollup
      expect(out.summary.highest_severity).toBe('P0');
    });

    test('highest_severity is "none" when no violations found', async () => {
      writeFile(tmpdir, 'public/crm/SALE-FORM-REDESIGN.html', '<p>2BR co-op, garden view, south-facing.</p>\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.violations).toEqual([]);
      expect(out.summary.highest_severity).toBe('none');
    });
  });

  describe('scan surface restriction', () => {
    test('ignores files outside public/crm, app/, lib/idx/, lib/compliance/, lib/search/', async () => {
      writeFile(tmpdir, 'README.md', 'No section 8 vouchers accepted\n');
      writeFile(tmpdir, 'docs/x.md', 'No section 8 vouchers accepted\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'README.md\ndocs/x.md' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      // These paths are not public surfaces so they are not scanned.
      expect(out.scanned_files).toEqual([]);
      expect(out.violations).toEqual([]);
    });

    test('ignores non-text extensions', async () => {
      writeFile(tmpdir, 'public/crm/asset.png', 'binary blob with No section 8\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/asset.png' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.scanned_files).toEqual([]);
    });
  });
});
