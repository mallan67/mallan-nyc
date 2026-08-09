/**
 * ARCHITECTURE DRIFT GUARDRAIL — Maya's Mallan-local-canonical rule.
 *
 * The repository previously carried the REVERSED reconciliation model in two
 * ACTIVE architecture documents: "withdraw SL-*, pin official RLS*, update
 * RealPlus Listing Url", plus a live runtime comment saying "the Trestle version
 * takes precedence". Under the standing architecture the LOCAL Mallan listing is
 * canonical and the returned Cotality RLS copy is publicly suppressed but
 * retained internally.
 *
 * This fails if any ACTIVE authority file reintroduces the old instructions.
 *
 * HISTORY IS NOT A FAILURE. Audit/evidence documents may accurately record the
 * superseded model — they are excluded by path, and a doc may also opt out by
 * carrying an explicit SUPERSEDED marker. The point is to protect CURRENT
 * authority, not to rewrite the past.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..');

/** Phrases that express the REVERSED model as current behaviour. */
const REVERSED_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /withdraw\s+`?SL-\*?`?/i, why: 'local SL-* must NOT be withdrawn when the RLS copy arrives' },
  { re: /pin\s+official\s+`?RLS/i, why: 'the RLS return-copy must NOT be pinned in place of the local listing' },
  { re: /replace\s+`?SL-\*?`?\s+with\s+`?RLS/i, why: 'the RLS copy must NOT replace the local listing' },
  { re: /Trestle\s+version\s+takes\s+precedence/i, why: 'local Mallan row is canonical, not the Trestle version' },
  { re: /update\s+RealPlus\s+Listing\s+Url/i, why: 'RealPlus URL handling is OUTSIDE this system' },
  { re: /submitted\s+to\s+(REBNY\s+)?RLS\s+via\s+Cotality/i, why: 'submission goes through RealPlus/RLS; Cotality is the INBOUND return path' },
];

/** Paths whose job is to record history — excluded by design. */
const HISTORY_PREFIXES = [
  'docs/audits/',
  'docs/superpowers/',
  'memory/',
  'docs/support/',
  'docs/operations/',
];

/** An explicit opt-out marker a doc may carry if it deliberately quotes the old model. */
const SUPERSEDED_MARKER = /SUPERSEDED|HISTORICAL RECORD|superseded model/i;

function activeAuthorityFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => /^(docs\/architecture\/|lib\/|app\/)/.test(f))
    .filter((f) => /\.(md|ts|tsx|js)$/.test(f))
    .filter((f) => !HISTORY_PREFIXES.some((p) => f.startsWith(p)))
    .filter((f) => !f.includes('__tests__') && !f.includes('/tests/'));
}

describe('active authority never reintroduces the reversed RLS-replaces-local model', () => {
  const files = activeAuthorityFiles();

  it('finds active authority files at all (guards a broken scan)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md');
    expect(files).toContain('docs/architecture/COTALITY-COMPLETE-REFERENCE.md');
  });

  it('contains NO reversed-model instruction outside superseded/history files', () => {
    const violations: string[] = [];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const { re, why } of REVERSED_PATTERNS) {
        if (!re.test(src)) continue;
        // Per-line check so one SUPERSEDED banner cannot excuse a whole file,
        // and so the charter may QUOTE a forbidden phrase while forbidding it.
        for (const [i, line] of src.split(/\r?\n/).entries()) {
          if (!re.test(line)) continue;
          if (SUPERSEDED_MARKER.test(line)) continue;
          // The charter and this guardrail legitimately name the phrases in
          // order to prohibit them; a prohibition line is not an instruction.
          if (/\bDO NOT\b|\bmust NOT\b|\bnever\b|OVERRIDES|forbidden/i.test(line)) continue;
          violations.push(`${rel}:${i + 1} — ${why}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the charter states the canonical rule affirmatively', () => {
    const charter = fs.readFileSync(
      path.join(ROOT, 'docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md'),
      'utf8',
    );
    expect(charter).toMatch(/Section 1A/);
    expect(charter).toMatch(/Mallan RLS return-copy/);
    expect(charter).toMatch(/never writes back/i);
    // agent_id must not be ownership.
    expect(charter).toMatch(/`agent_id` is NOT ownership/i);
  });
});
