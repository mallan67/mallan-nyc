/**
 * Exercise the workflow shell and the actual provider-read functions.
 * These tests prove failure handling, not a successful live-provider audit.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const AUDITS = [
  ['scripts/audit-form-trestle-coverage.ts', 'getMetadataXml'],
  ['scripts/audit-server-trestle-coverage.ts', 'getAllLiveFields'],
  ['scripts/audit-trestle-non-property-resources.ts', 'getResourceFields'],
] as const;

function providerFunctions(relative: string, fetch: jest.Mock) {
  const source = ts.createSourceFile(relative, read(relative), ts.ScriptTarget.Latest, true);
  const functions = source.statements
    .filter(ts.isFunctionDeclaration)
    .map((statement) => statement.getFullText(source))
    .join('\n');
  const javascript = ts.transpileModule(functions, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new vm.Script(javascript + '\n({ getToken, ' +
    (relative.includes('audit-form-') ? 'getMetadataXml, getCustomPropertyFieldsFromSample' :
      relative.includes('audit-server-') ? 'getAllLiveFields' : 'getResourceFields') +
    ' })').runInNewContext({
    fetch, URLSearchParams, TRESTLE_BASE: 'https://api.cotality.com/trestle',
    CLIENT_ID: 'test-client', CLIENT_SECRET: 'test-secret',
  }) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

const response = (status: number, body: string) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => JSON.parse(body),
  text: async () => body,
});
const token = () => response(200, '{"access_token":"test-token"}');
const metadata = '<Schema><EntityType Name="Property"><Property Name="ListingKey" Type="Edm.String" /></EntityType></Schema>';

describe.each(AUDITS)('%s live-provider failure handling', (relative, reader) => {
  test('rejects a failed OAuth request before metadata access', async () => {
    const fetch = jest.fn().mockResolvedValue(response(401, '{"error":"denied"}'));
    await expect(providerFunctions(relative, fetch).getToken()).rejects.toThrow('token request failed (401)');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects a successful HTTP response without an access token', async () => {
    const fetch = jest.fn().mockResolvedValue(response(200, '{}'));
    await expect(providerFunctions(relative, fetch).getToken()).rejects.toThrow('no usable access_token');
  });

  test('rejects failed metadata even when its body resembles a schema', async () => {
    const fetch = jest.fn();
    if (reader !== 'getMetadataXml') fetch.mockResolvedValueOnce(token());
    fetch.mockResolvedValueOnce(response(503, metadata));
    await expect(providerFunctions(relative, fetch)[reader]('test-token')).rejects.toThrow('metadata request failed (503)');
  });

  test.each(['', '<html>Sign in</html>', '<Schema />'])('rejects unreadable metadata: %p', async (body) => {
    const fetch = jest.fn();
    if (reader !== 'getMetadataXml') fetch.mockResolvedValueOnce(token());
    fetch.mockResolvedValueOnce(response(200, body));
    await expect(providerFunctions(relative, fetch)[reader]('test-token')).rejects.toThrow('UNVERIFIED');
  });

  test('accepts a successful metadata response containing entity fields', async () => {
    const fetch = jest.fn();
    if (reader !== 'getMetadataXml') fetch.mockResolvedValueOnce(token());
    fetch.mockResolvedValueOnce(response(200, metadata));
    if (reader === 'getAllLiveFields') fetch.mockResolvedValueOnce(response(200, '{"value":[]}'));
    await expect(providerFunctions(relative, fetch)[reader]('test-token')).resolves.toBeDefined();
  });
});

test.each(AUDITS.slice(0, 2))('%s rejects a failed CustomProperty sample', async (relative, reader) => {
  const fetch = jest.fn();
  if (reader === 'getAllLiveFields') {
    fetch.mockResolvedValueOnce(token()).mockResolvedValueOnce(response(200, metadata));
  }
  fetch.mockResolvedValueOnce(response(503, '{"error":"unavailable"}'));
  const functions = providerFunctions(relative, fetch);
  await expect(functions[reader === 'getMetadataXml' ? 'getCustomPropertyFieldsFromSample' : reader]('test-token'))
    .rejects.toThrow('CustomProperty request failed (503)');
});

function workflowStep(name: string): string {
  const block = read('.github/workflows/trestle-live-audit.yml')
    .split('      - name: ' + name + '\n')[1]?.split('\n      - name:')[0];
  const script = block?.split('        run: |\n')[1];
  if (!script) throw new Error('Missing workflow shell step: ' + name);
  return script.split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
}

function runStep(script: string, values: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotality-audit-'));
  const output = path.join(dir, 'output');
  const summary = path.join(dir, 'summary');
  try {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: { ...process.env, ...values, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    if (result.error) throw result.error;
    return {
      status: result.status, stdout: result.stdout, stderr: result.stderr,
      output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
      summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('live audit workflow cannot pass without live checks', () => {
  test.each([['', ''], ['test-client', ''], ['', 'test-secret']])(
    'fails when either required credential is absent', (id, secret) => {
      const result = runStep(workflowStep('Verify Trestle secrets are configured'), {
        IDX_CLIENT_ID: id, IDX_CLIENT_SECRET: secret,
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain('is_configured=false');
      expect(result.summary).toContain('UNVERIFIED');
      expect(result.stdout).not.toContain('test-client');
      expect(result.stdout).not.toContain('test-secret');
    },
  );

  test('allows live checks when both credentials are present without printing them', () => {
    const result = runStep(workflowStep('Verify Trestle secrets are configured'), {
      IDX_CLIENT_ID: 'test-client', IDX_CLIENT_SECRET: 'test-secret',
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain('is_configured=true');
    expect(result.stdout).not.toContain('test-client');
    expect(result.stdout).not.toContain('test-secret');
  });

  test.each([
    ['success', 'success', 'success', '0'],
    ['success', 'failure', 'success', '1'],
    ['skipped', 'skipped', 'skipped', '3'],
    ['', '', '', '3'],
  ])('counts %s/%s/%s as %s incomplete audits', (forms, server, resources, expected) => {
    const outcomes: Record<string, string> = { forms, server, resources };
    const script = workflowStep('Aggregate result')
      .replace(/\$\{\{ steps\.audit-(forms|server|resources)\.outcome \}\}/g, (_, key) => outcomes[key]);
    const result = runStep(script, {});
    expect(result.status).toBe(0);
    expect(result.output).toContain('failed_audits=' + expected);
  });

  test.each(['', '1', '3', 'unexpected'])('rejects an incomplete aggregate: %p', (value) => {
    expect(runStep(workflowStep('Require all live audits to pass'), { FAILED_AUDITS: value }).status).toBe(1);
  });

  test('accepts only an explicit zero-failure aggregate', () => {
    expect(runStep(workflowStep('Require all live audits to pass'), { FAILED_AUDITS: '0' }).status).toBe(0);
  });

  test('aggregation and the final gate still run when an earlier step fails', () => {
    const workflow = read('.github/workflows/trestle-live-audit.yml');
    expect(workflow).toMatch(/id: aggregate\n        if: \$\{\{ always\(\) \}\}/);
    expect(workflow).toMatch(/name: Require all live audits to pass\n        if: \$\{\{ always\(\) \}\}/);
  });
});
