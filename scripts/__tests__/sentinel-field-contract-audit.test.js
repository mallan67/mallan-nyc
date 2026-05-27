/**
 * Sentinel-L.2 — scripts/sentinel-field-contract-audit.mjs tests.
 *
 * Deterministic field-contract scanner. Given CHANGED_FILES (newline-
 * separated) it produces JSON classifying which of the 29 listing-contract
 * RESO fields appear in the changed files, by category (form_html /
 * dashboard_js / api_route / idx_mapping / dto_sanitizer / display_gate /
 * public_reader / listing_page / display_component / db_schema / test /
 * script / other), and a 5-dimension coverage matrix per field
 * (source_form / form_api / api_db / db_reload / display_public).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'sentinel-field-contract-audit.mjs');

function runScript({ env = {}, cwd, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}

function makeTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-l2-field-'));
}

function writeFile(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

describe('sentinel-field-contract-audit.mjs', () => {
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
      expect(out.schema_version).toBe('sentinel-l.2-field-contract-v1');
      expect(out.scanned_files).toEqual([]);
      expect(out.fields).toEqual({});
      expect(out.summary.touched_count).toBe(0);
      // 29 fields per Maya's spec (4+4+3+2+2+2+2+2+5+3).
      expect(out.summary.contract_fields_total).toBe(29);
    });

    test('JSON output is a single, parseable object on stdout', async () => {
      const { stdout } = await runScript({ env: { CHANGED_FILES: '' }, cwd: tmpdir });
      // Must end with newline + parse cleanly.
      expect(stdout.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });

  describe('field detection — form HTML', () => {
    test('detects data-rls-field="StreetNumber" in SALE-FORM-REDESIGN.html', async () => {
      writeFile(
        tmpdir,
        'public/crm/SALE-FORM-REDESIGN.html',
        '<input data-rls-field="StreetNumber" name="StreetNumber" />\n<input data-rls-field="StreetName" />\n',
      );
      const { code, stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      expect(code).toBe(0);
      const out = JSON.parse(stdout);
      expect(out.fields.StreetNumber.touched).toBe(true);
      expect(out.fields.StreetNumber.categories).toContain('form_html');
      expect(out.fields.StreetNumber.coverage.source_form).toBe(true);
      expect(out.fields.StreetNumber.occurrences.length).toBeGreaterThan(0);
      // type must be html_attr for the data-rls-field reference
      const types = out.fields.StreetNumber.occurrences.map((o) => o.type);
      expect(types).toContain('html_attr');
    });

    test('detects StreetName + StreetSuffix together', async () => {
      writeFile(
        tmpdir,
        'public/crm/SALE-FORM-REDESIGN.html',
        '<input data-rls-field="StreetName" />\n<input data-rls-field="StreetSuffix" />\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.fields.StreetName.touched).toBe(true);
      expect(out.fields.StreetSuffix.touched).toBe(true);
      expect(out.summary.touched_count).toBe(2);
    });
  });

  describe('field detection — api_route + idx_mapping', () => {
    test('detects InternetEntireListingDisplayYN in trestle-mapper.ts', async () => {
      writeFile(
        tmpdir,
        'lib/idx/trestle-mapper.ts',
        'const flag = raw.InternetEntireListingDisplayYN;\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'lib/idx/trestle-mapper.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.fields.InternetEntireListingDisplayYN.touched).toBe(true);
      expect(out.fields.InternetEntireListingDisplayYN.categories).toContain('idx_mapping');
      expect(out.fields.InternetEntireListingDisplayYN.coverage.api_db).toBe(true);
    });

    test('detects StandardStatus in api/crm/listings route', async () => {
      writeFile(
        tmpdir,
        'app/api/crm/listings/route.ts',
        'const status = body.StandardStatus;\nawait prisma.listing.create({ data: { StandardStatus: status } });\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/api/crm/listings/route.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.fields.StandardStatus.touched).toBe(true);
      expect(out.fields.StandardStatus.categories).toContain('api_route');
    });
  });

  describe('coverage matrix derivation', () => {
    test('full coverage when field touched in form_html + dashboard_js + api_route + display_component', async () => {
      writeFile(tmpdir, 'public/crm/SALE-FORM-REDESIGN.html', '<input data-rls-field="StandardStatus" />\n');
      writeFile(tmpdir, 'public/crm/js/dashboard/panels.js', 'const status = formData.StandardStatus;\n');
      writeFile(tmpdir, 'app/api/crm/listings/route.ts', 'body.StandardStatus;\n');
      writeFile(tmpdir, 'app/components/ListingCard.tsx', 'const { StandardStatus } = listing;\n');
      const { stdout } = await runScript({
        env: {
          CHANGED_FILES: [
            'public/crm/SALE-FORM-REDESIGN.html',
            'public/crm/js/dashboard/panels.js',
            'app/api/crm/listings/route.ts',
            'app/components/ListingCard.tsx',
          ].join('\n'),
        },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      const c = out.fields.StandardStatus.coverage;
      expect(c.source_form).toBe(true);
      expect(c.form_api).toBe(true);
      expect(c.api_db).toBe(true);
      expect(c.display_public).toBe(true);
      // db_reload is the implication (api_db + dashboard_js form-side)
      expect(c.db_reload).toBe(true);
      // 5/5 -> fields_with_full_coverage = 1
      expect(out.summary.fields_with_full_coverage).toBe(1);
    });

    test('partial coverage when field touched in only api_route', async () => {
      writeFile(tmpdir, 'app/api/crm/listings/route.ts', 'body.PostalCode;\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'app/api/crm/listings/route.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.fields.PostalCode.coverage.api_db).toBe(true);
      expect(out.fields.PostalCode.coverage.source_form).toBe(false);
      expect(out.fields.PostalCode.coverage.display_public).toBe(false);
      expect(out.fields.PostalCode.concerns).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/not in any form HTML/),
        ]),
      );
    });

    test('proof_level is "deterministic test" when field appears in a test file', async () => {
      writeFile(tmpdir, 'tests/runtime/foo.test.ts', 'expect(record.StandardStatus).toBe("Active");\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'tests/runtime/foo.test.ts' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.fields.StandardStatus.proof_level).toBe('deterministic test');
    });
  });

  describe('summary rollup', () => {
    test('summary.touched_count counts only fields actually present', async () => {
      writeFile(
        tmpdir,
        'public/crm/SALE-FORM-REDESIGN.html',
        '<input data-rls-field="StreetNumber" />\n<input data-rls-field="MediaURL" />\n',
      );
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      expect(out.summary.touched_count).toBe(2);
    });

    test('does not classify untouched fields', async () => {
      writeFile(tmpdir, 'public/crm/SALE-FORM-REDESIGN.html', '<input data-rls-field="StreetNumber" />\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'public/crm/SALE-FORM-REDESIGN.html' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      // Only StreetNumber appears in the output
      expect(Object.keys(out.fields)).toEqual(['StreetNumber']);
    });
  });

  describe('robustness', () => {
    test('skips deleted/missing files gracefully', async () => {
      const { code, stdout, stderr } = await runScript({
        env: { CHANGED_FILES: 'does/not/exist.html\nalso/missing.ts' },
        cwd: tmpdir,
      });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const out = JSON.parse(stdout);
      expect(out.scanned_files).toEqual([]);
    });

    test('ignores files outside the category-pattern set as "other"', async () => {
      writeFile(tmpdir, 'README.md', 'StreetNumber appears in this README\n');
      const { stdout } = await runScript({
        env: { CHANGED_FILES: 'README.md' },
        cwd: tmpdir,
      });
      const out = JSON.parse(stdout);
      // README still gets scanned but its category is "other" — no
      // coverage flag is set, so the field is "touched" but limited.
      if (out.fields.StreetNumber) {
        expect(out.fields.StreetNumber.categories).toContain('other');
        expect(out.fields.StreetNumber.coverage.source_form).toBe(false);
        expect(out.fields.StreetNumber.coverage.api_db).toBe(false);
      }
    });
  });
});
