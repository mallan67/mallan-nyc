/// <reference types="jest" />
/**
 * Sentinel decommission guard (2026-07-25).
 *
 * The Mallan "Sentinel" repo-audit-bot subsystem was removed (#566) and its
 * governance footprint scrubbed (this PR). This guard FAILS if a bot-specific
 * PATH or live routing instruction reappears in an ACTIVE governance file — the
 * real hazard is a live doc pointing an agent at a deleted file.
 *
 * It is PATH/instruction-based on purpose: it does NOT flag the bare word
 * "sentinel" (a generic programming term) nor bare historical mentions of the
 * bot in DATED audit records — only concrete references to files that #566
 * deleted, appearing in files that agents treat as current truth.
 *
 * ALLOWLISTED: the durable decommission record + dated audit dirs legitimately
 * name the deleted paths as "removed".
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

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

// Files agents treat as CURRENT sources of truth / actionable instruction.
const ACTIVE_GOVERNANCE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.gitignore',
  '.github/workflows/release-truth.yml',
  '.github/pull_request_template.md',
  'docs/agents/AGENT-ROUTING-MANDATE-2026-05-28.md',
  'docs/engineering/pr-verification-checklist.md',
  'docs/engineering/vercel-preview-proof-rules.md',
  'docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md',
  'docs/architecture/NEON-COST-CONTROL-POLICY.md',
  'docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md',
  'docs/PROJECT-HEALTH-DASHBOARD.md',
  'docs/PLATFORM-ISSUE-REGISTRY.md',
  'docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md',
  'docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md',
];

describe('Sentinel decommission — the bot subsystem stays gone', () => {
  it('every deleted bot file/dir is actually absent', () => {
    for (const p of DELETED_BOT_PATHS) {
      expect({ path: p, exists: exists(p) }).toEqual({ path: p, exists: false });
    }
  });

  it('no ACTIVE governance file references a deleted bot PATH', () => {
    const offenders: string[] = [];
    for (const file of ACTIVE_GOVERNANCE_FILES) {
      if (!exists(file)) continue;
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
