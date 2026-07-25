/// <reference types="jest" />
/**
 * Sentinel decommission guard (2026-07-25).
 *
 * The Mallan "Sentinel" repo-audit-bot subsystem was removed (#566) and its
 * governance footprint scrubbed. This guard FAILS if a bot-specific PATH or live
 * routing instruction reappears in an ACTIVE governance file — the real hazard is
 * a live doc pointing an agent at a deleted file.
 *
 * DERIVED set (not a hand-maintained list — Codex #568): it recursively walks
 * the active-governance roots (incl. the living + canonical HANDOFF sources) plus
 * a few explicit top-level files, and checks every one. It is PATH-based on
 * purpose: it does NOT flag the bare word "sentinel" (a generic programming
 * term) nor bare historical mentions — only concrete references to files #566
 * deleted.
 *
 * ALLOWLISTED: the durable decommission record + this guard itself legitimately
 * name the deleted paths.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const abs = (rel: string) => path.join(ROOT, rel);
const read = (rel: string) => fs.readFileSync(abs(rel), 'utf8');
const exists = (rel: string) => fs.existsSync(abs(rel));

// Files/dirs #566 deleted — a live reference to any of these is broken.
const DELETED_BOT_PATHS = [
  'tools/sentinel-g/run-sentinel-g.ts',
  'tools/sentinel-g',
  '.github/workflows/repo-audit-bot.yml',
  '.claude/agents/repo-audit-bot.md',
  'docs/agents/SENTINEL-G-MANDATE-2026-05-28.md',
  'docs/compliance/sentinel-l-retention-matrix-2026-07-21.md',
  'docs/sentinel-v2-redesign-plan-2026-05-16.md',
  'scripts/sentinel-compliance-language-audit.mjs',
  'scripts/sentinel-field-contract-audit.mjs',
  'scripts/sentinel-listing-flow-static-audit.mjs',
  'scripts/sentinel-write-audit.mjs',
  'scripts/sentinel-write-listing-audit.mjs',
];

// Directories agents treat as CURRENT governance / actionable instruction —
// walked recursively so the set can never be "incomplete".
const GOVERNANCE_DIRS = [
  'docs/agents',
  'docs/engineering',
  'docs/architecture',
  'docs/operations', // includes the canonical site-audit-handoff-*.md
  'docs/superpowers/plans',
];
// Explicit top-level governance files (incl. the LIVING handoff memory/HANDOFF.md).
const GOVERNANCE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.gitignore',
  '.github/workflows/release-truth.yml',
  '.github/pull_request_template.md',
  'docs/PROJECT-HEALTH-DASHBOARD.md',
  'docs/PLATFORM-ISSUE-REGISTRY.md',
  'memory/HANDOFF.md',
];
const SCAN_EXT = new Set(['.md', '.yml', '.yaml', '.ts', '.js', '.mjs']);
// Files that may legitimately NAME the deleted paths (the record of the removal).
const ALLOWLIST = new Set([
  'memory/SENTINEL-DECOMMISSION-2026-07-25.md',
  'tests/runtime/sentinel-decommission-guard.test.ts',
]);

function walk(relDir: string, out: string[]): void {
  const dir = abs(relDir);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(relDir, entry.name).split(path.sep).join('/');
    if (entry.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.has(path.extname(entry.name))) out.push(rel);
  }
}

function activeGovernanceFiles(): string[] {
  const files: string[] = [...GOVERNANCE_FILES];
  for (const d of GOVERNANCE_DIRS) walk(d, files);
  return [...new Set(files)].filter((f) => exists(f) && !ALLOWLIST.has(f));
}

describe('Sentinel decommission — the bot subsystem stays gone', () => {
  it('every deleted bot file/dir is actually absent', () => {
    for (const p of DELETED_BOT_PATHS) {
      expect({ path: p, exists: exists(p) }).toEqual({ path: p, exists: false });
    }
  });

  it('no ACTIVE governance file (derived set, incl. living + canonical handoffs) references a deleted bot PATH', () => {
    const scanned = activeGovernanceFiles();
    // Sanity: the derived set actually includes the handoff sources Codex flagged.
    expect(scanned).toEqual(expect.arrayContaining(['memory/HANDOFF.md']));
    expect(scanned.some((f) => f.startsWith('docs/operations/'))).toBe(true);

    const offenders: string[] = [];
    for (const file of scanned) {
      const src = read(file);
      for (const bad of DELETED_BOT_PATHS) {
        if (src.includes(bad)) offenders.push(`${file} → ${bad}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the agent-routing mandate carries no live Sentinel-G routing section', () => {
    const mandate = read('docs/agents/AGENT-ROUTING-MANDATE-2026-05-28.md');
    expect(mandate).not.toMatch(/^##\s*Sentinel-G\b/m);
    expect(mandate).not.toContain('run-sentinel-g');
    expect(mandate).not.toContain('SENTINEL-G-MANDATE');
  });

  it('the durable decommission record still exists (the allowlisted place the paths may be named)', () => {
    expect(exists('memory/SENTINEL-DECOMMISSION-2026-07-25.md')).toBe(true);
  });
});
