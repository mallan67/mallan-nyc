import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const oldReference = resolve(root, 'docs/architecture/COTALITY-COMPLETE-REFERENCE.md');
const masterPlan = resolve(root, 'MALLAN-PLATFORM-MASTER-PLAN.md');
const liveClient = resolve(root, 'scripts/cotality/live-client.mjs');
const queryCli = resolve(root, 'scripts/cotality/query-live.mjs');
const compiler = resolve(root, 'scripts/cotality/compile-live-contract.mjs');
const verifier = resolve(root, 'scripts/cotality/verify-search-live.mjs');
const mcp = resolve(root, 'mcp/trestle-fields/index.ts');

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Cotality live authority guard', () => {
  it('does not retain the old competing complete-reference document', () => {
    expect(existsSync(oldReference)).toBe(false);
  });

  it('retains the Master Plan as the product/system authority', () => {
    expect(existsSync(masterPlan)).toBe(true);
    expect(text(masterPlan)).toContain('WORKING WITH THE COTALITY API');
  });

  it('has one shared live-only Cotality client with explicit evidence states', () => {
    expect(existsSync(liveClient)).toBe(true);
    const source = text(liveClient);
    expect(source).toContain("SUPPORTED: 'SUPPORTED'");
    expect(source).toContain("PROVIDER_REJECTED: 'PROVIDER_REJECTED'");
    expect(source).toContain("UNVERIFIED: 'UNVERIFIED'");
    expect(source).toContain('/odata/$metadata');
    expect(source).toContain("page('Lookup'");
    expect(source).not.toContain('metadata.xml');
    expect(source).not.toContain('local_fallback');
  });

  it('exposes the shared live client to agents rather than maintaining a second MCP reader', () => {
    expect(existsSync(queryCli)).toBe(true);
    expect(existsSync(mcp)).toBe(true);
    const source = text(mcp);
    expect(source).toContain('scripts/cotality/query-live.mjs');
    expect(source).toContain('trestle_query_resource');
    expect(source).toContain('trestle_lookup_values');
    expect(source).toContain('trestle_probe_field');
    expect(source).toContain('trestle_probe_relationship');
    expect(source).not.toContain('metadata.xml');
    expect(source).not.toContain('local_fallback');
  });

  it('has both a full contract compiler and a current Search live verifier', () => {
    expect(existsSync(compiler)).toBe(true);
    expect(existsSync(verifier)).toBe(true);
    const full = text(compiler);
    expect(full).toContain('client.fieldCatalog()');
    expect(full).toContain('client.lookupCatalog()');
    expect(full).toContain('client.dataSystem()');
    expect(full).toContain('client.probeField');
    expect(full).toContain('client.probeRelationship');

    const search = text(verifier);
    expect(search).toContain('SEARCH_SELECT_FIELDS');
    expect(search).toContain('crm-idx-filter.ts');
    expect(search).toContain('field-registry.ts');
    expect(search).toContain('client.probeField');
  });

  it('parses every executable Cotality .mjs entrypoint with the repository Node runtime', () => {
    for (const file of [liveClient, queryCli, compiler, verifier]) {
      const result = spawnSync(process.execPath, ['--check', file], {
        cwd: root,
        encoding: 'utf8',
      });
      expect({ file, status: result.status, stderr: result.stderr }).toEqual({
        file,
        status: 0,
        stderr: '',
      });
    }
  });
});
