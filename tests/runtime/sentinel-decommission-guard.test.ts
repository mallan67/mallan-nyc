/// <reference types="jest" />
/**
 * Sentinel decommission guard (2026-07-25).
 *
 * The removed Sentinel repo-audit-bot subsystem must stay absent. This test is
 * intentionally independent of AI session-memory, handoff, or agent-routing
 * documents. Mallan project authority lives in the Master Plan and Continuous
 * Execution State.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const abs = (rel: string) => path.join(ROOT, rel);
const read = (rel: string) => fs.readFileSync(abs(rel), 'utf8');
const exists = (rel: string) => fs.existsSync(abs(rel));

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

const GOVERNANCE_DIRS = [
  'docs/engineering',
  'docs/architecture',
  'docs/operations',
  'docs/superpowers/plans',
];
const GOVERNANCE_FILES = [
  'MALLAN-PLATFORM-MASTER-PLAN.md',
  'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md',
  '.gitignore',
  '.github/workflows/release-truth.yml',
  '.github/pull_request_template.md',
  'docs/PLATFORM-ISSUE-REGISTRY.md',
];
const SCAN_EXT = new Set(['.md', '.yml', '.yaml', '.ts', '.js', '.mjs']);

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
  return [...new Set(files)].filter((f) => exists(f));
}

describe('Sentinel decommission — the bot subsystem stays gone', () => {
  it('every deleted bot file/dir is actually absent', () => {
    for (const p of DELETED_BOT_PATHS) {
      expect({ path: p, exists: exists(p) }).toEqual({ path: p, exists: false });
    }
  });

  it('no active governance file references a deleted bot path', () => {
    const scanned = activeGovernanceFiles();
    expect(scanned).toEqual(
      expect.arrayContaining([
        'MALLAN-PLATFORM-MASTER-PLAN.md',
        'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md',
      ]),
    );
    expect(scanned.some((f) => f.startsWith('docs/operations/'))).toBe(true);

    const offenders: string[] = [];
    for (const file of scanned) {
      const src = read(file);
      for (const bad of DELETED_BOT_PATHS) {
        if (src.includes(bad)) offenders.push(`${file} -> ${bad}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
