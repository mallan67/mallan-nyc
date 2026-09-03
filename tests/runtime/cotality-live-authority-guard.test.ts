import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const oldReference = resolve(root, 'docs/architecture/COTALITY-COMPLETE-REFERENCE.md');
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
    // RETARGETED 2026-08-24. This asserted `existsSync(MALLAN-PLATFORM-MASTER-PLAN.md)`
    // at the repo root plus a 'WORKING WITH THE COTALITY API' heading inside it.
    // Neither is satisfiable in a clean checkout: the document is NOT tracked
    // (`git ls-files` has no match) and its working copy lives under `.cache/`,
    // which .gitignore:102 excludes — so CI can never see it, and the only
    // available copy does not contain that heading either.
    //
    // A guard may only assert repository state. What is actually in the repo,
    // and is the invariant worth guarding, is the POINTER: CLAUDE.md must keep
    // naming the Master Plan as the single product/system authority, so the
    // split between "Cotality decides provider facts" and "Maya decides Mallan
    // product" cannot be quietly dropped.
    //
    // Existence is deliberately NOT asserted in either direction: the document
    // is Maya's to track or keep local, and this guard must not turn that
    // choice into a build failure. If it is ever tracked at the repo root,
    // restore the existence and heading assertions here.
    const claudeMd = text(resolve(root, 'CLAUDE.md'));
    expect(claudeMd).toContain('MALLAN-PLATFORM-MASTER-PLAN.md');
    // Tolerates the markdown blockquote wrap: the phrase spans a newline and a
    // leading '> ' in CLAUDE.md.
    expect(claudeMd).toMatch(/single Mallan product\/system[\s>]+authority/);
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
