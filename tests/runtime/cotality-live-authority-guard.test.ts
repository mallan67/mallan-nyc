import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Cotality live-authority guard.
 *
 * Ported 2026-09-08 from d19c03cd:tests/runtime/cotality-live-authority-guard.test.ts and
 * re-targeted at this lane. The invariant it protects is the one that produced a false-green
 * verification path in this repository: a provider reader that silently serves a stale local
 * snapshot as if it were live. The client ported here refuses to do that by construction, and
 * this guard fails the build if that refusal is ever softened.
 *
 * What was DROPPED from the d19 version, and why:
 *   - "COTALITY-COMPLETE-REFERENCE.md must not exist" — that document exists on this lane
 *     (1,223 lines) and its removal is a documentation decision, not a build invariant.
 *   - "CLAUDE.md must name MALLAN-PLATFORM-MASTER-PLAN.md" — CLAUDE.md is Maya's; a guard may
 *     not turn an authority-file edit into a red build.
 *   - assertions on verify-search-live.mjs — that script hardcodes the OTHER lane's executor
 *     path (lib/search/crm-idx-filter.ts, absent here) and is not ported; it is being replaced by
 *     a verifier written against this lane's engine.
 * What is deliberately recorded but NOT enforced yet: see the MCP block at the bottom.
 */

const root = resolve(__dirname, '../..');
const liveClient = resolve(root, 'scripts/cotality/live-client.mjs');
const queryCli = resolve(root, 'scripts/cotality/query-live.mjs');
const compiler = resolve(root, 'scripts/cotality/compile-live-contract.mjs');
const mcp = resolve(root, 'mcp/trestle-fields/index.ts');

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Comment-stripped source. The guard inspects CODE, not prose: an explanatory comment that names
 * a banned token (e.g. the constant that was removed, or "metadata.xml" in a sentence about why
 * it is banned) is legitimate history; branching on it is the defect. Same rule as
 * lib/compliance/__tests__/dom-canonical-permission.test.ts.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/[ \t]+\/\/.*$/gm, ' ');
}

describe('Cotality live authority guard', () => {
  it('has one shared live-only Cotality client with explicit evidence states', () => {
    expect(existsSync(liveClient)).toBe(true);
    const source = codeOnly(text(liveClient));
    expect(source).toContain("SUPPORTED: 'SUPPORTED'");
    expect(source).toContain("PROVIDER_REJECTED: 'PROVIDER_REJECTED'");
    expect(source).toContain("UNVERIFIED: 'UNVERIFIED'");
    expect(source).toContain('/odata/$metadata');
    expect(source).toContain("page('Lookup'");
    // The refusal that makes this client trustworthy. If either string appears, a snapshot has
    // been wired in as a fallback and the client can no longer say UNVERIFIED honestly.
    expect(source).not.toContain('metadata.xml');
    expect(source).not.toContain('local_fallback');
  });

  it('reads quota from provider headers and budgets retries by time, not attempt count', () => {
    // Measured live 2026-09-08: minute-quota-limit 280 / hour-quota-limit 8400 are advertised on
    // every response. The original client hardcoded retries=2 and exhausted under a real quota
    // window. This lane's port must keep reading the headers and must not reintroduce a fixed
    // retry count as the sole policy.
    const source = codeOnly(text(liveClient));
    expect(source).toContain("'minute-quota-available'");
    expect(source).toContain('DEFAULT_RETRY_BUDGET_MS');
    expect(source).not.toContain('DEFAULT_RETRIES');
  });

  it('resolves field existence from $metadata, never from the platform-wide Field catalogue alone', () => {
    // $metadata describes THIS subscription; the Field resource lists 2,249 rows across resources
    // and fields we cannot select (e.g. Media.MediaURLDirect). probeField must resolve `declared`
    // from $metadata when the caller does not supply it.
    const source = codeOnly(text(liveClient));
    expect(source).toContain('resolveFieldInfo');
    expect(source).toMatch(/if \(fieldInfo == null\) fieldInfo = await resolveFieldInfo\(resource, field\);/);
  });

  it('exposes the shared client as a CLI rather than a second reader', () => {
    expect(existsSync(queryCli)).toBe(true);
    const source = codeOnly(text(queryCli));
    expect(source).toContain("from './live-client.mjs'");
    expect(source).not.toContain('metadata.xml');
  });

  it('has a full contract compiler that fingerprints its evidence', () => {
    expect(existsSync(compiler)).toBe(true);
    const full = codeOnly(text(compiler));
    expect(full).toContain('client.fieldCatalog()');
    expect(full).toContain('client.lookupCatalog()');
    expect(full).toContain('client.dataSystem()');
    expect(full).toContain('client.probeField');
    expect(full).toContain('client.probeRelationship');
    // A Search proof must be able to name the exact contract it was verified against.
    expect(full).toContain('evidence_sha256');
    expect(full).toContain('repo_git_sha');
  });

  it('parses every executable Cotality .mjs entrypoint with the repository Node runtime', () => {
    for (const file of [liveClient, queryCli, compiler]) {
      const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
      expect({ file, status: result.status, stderr: result.stderr }).toEqual({ file, status: 0, stderr: '' });
    }
  });

  it('MCP trestle-fields never falls back to a local metadata snapshot (live-only authority; corrected 2026-09-08)', () => {
    expect(existsSync(mcp)).toBe(true);
    const src = text(mcp);
    expect(src).not.toContain('metadata.xml');
    expect(src).not.toContain('local_fallback');
    expect(codeOnly(src)).not.toMatch(/existsSync|readFileSync/);
    expect(src).toContain('$metadata');
  });
});
