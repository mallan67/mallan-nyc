/**
 * Sentinel-D.1 — workflow-structure regression test.
 *
 * Codex P1 finding (2026-05-25) on PR #191 caught a YAML structure bug
 * where adding the step-level `env:` block between `claude_args:` and
 * `prompt: |` caused `prompt` to be nested under `env:` (so it became
 * a no-op environment variable) instead of remaining a sibling action
 * input under `with:`. The action would have run without the strict
 * Sentinel prompt — script-only write rule, A–S section structure,
 * Coverage Matrix requirements, call-after-each-area discipline — all
 * silently absent.
 *
 * This test parses the workflow YAML and asserts the action-input vs
 * step-env shape. If the bug ever recurs the assertion fails before
 * the workflow is dispatched, not after a costly silent-skip audit run.
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const WORKFLOW_PATH = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'repo-audit-bot.yml');

describe('repo-audit-bot.yml — Sentinel-D.1 structure', () => {
  let doc;
  let invokeStep;

  beforeAll(() => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    doc = yaml.load(content);
    invokeStep = doc.jobs.audit.steps.find((s) => s.name === 'Invoke Claude repo-audit-bot');
  });

  test('"Invoke Claude" step exists and uses claude-code-action@v1', () => {
    expect(invokeStep).toBeDefined();
    expect(invokeStep.uses).toBe('anthropics/claude-code-action@v1');
  });

  describe('action inputs (must live under with:)', () => {
    test('with.prompt is a non-empty string', () => {
      expect(typeof invokeStep.with.prompt).toBe('string');
      expect(invokeStep.with.prompt.length).toBeGreaterThan(1000);
    });

    test('with.claude_args is a non-empty string', () => {
      expect(typeof invokeStep.with.claude_args).toBe('string');
      expect(invokeStep.with.claude_args.length).toBeGreaterThan(100);
    });

    test('with.show_full_output is true (boolean, not string)', () => {
      expect(invokeStep.with.show_full_output).toBe(true);
    });

    test('with.claude_code_oauth_token is wired to the secret', () => {
      expect(typeof invokeStep.with.claude_code_oauth_token).toBe('string');
      expect(invokeStep.with.claude_code_oauth_token).toMatch(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
    });

    test('prompt contains the strict Sentinel-D.1 instructions', () => {
      // These markers prove the full strict prompt was passed as an
      // action input, not silently dropped to an env var.
      expect(invokeStep.with.prompt).toMatch(/STRICT REPORT-ONLY MODE/);
      expect(invokeStep.with.prompt).toMatch(/node scripts\/sentinel-write-audit\.mjs/);
      expect(invokeStep.with.prompt).toMatch(/Report-only: no changes made\./);
      expect(invokeStep.with.prompt).toMatch(/Coverage Matrix/);
      expect(invokeStep.with.prompt).toMatch(/You must NOT use the Write tool/);
      expect(invokeStep.with.prompt).toMatch(/You must NOT use the Edit tool/);
    });

    // Sentinel-D.1.1 — payload-budget + compact-report rules added to
    // prevent the Claude SDK tool-input "Parser aborted (over-length)"
    // failure mode observed in run 26434727016 (2026-05-26). Each marker
    // assertion below pins one of the rules Maya specified.

    test('prompt declares the PAYLOAD BUDGET RULE (Sentinel-D.1.1)', () => {
      expect(invokeStep.with.prompt).toMatch(/PAYLOAD BUDGET RULE/);
      // The 6 KB / 6,144-byte cap must be stated as the hard limit.
      expect(invokeStep.with.prompt).toMatch(/6\s*KB/);
      expect(invokeStep.with.prompt).toMatch(/6,144\s*bytes/);
      // The SDK abort error must be cited so Claude knows the failure mode.
      expect(invokeStep.with.prompt).toMatch(/Parser aborted/);
    });

    test('prompt forbids giant heredoc / oversized final payload', () => {
      // "longer payloads will be parser-aborted" or equivalent prohibition.
      expect(invokeStep.with.prompt).toMatch(/parser-aborted/i);
      // Explicit "no giant evidence dumps" rule.
      expect(invokeStep.with.prompt).toMatch(/No giant evidence dumps/);
      // No new pipe-tables outside the Coverage Matrix.
      expect(invokeStep.with.prompt).toMatch(/No new tables outside.*Coverage Matrix/);
      // No verbose raw logs / no repeated command outputs.
      expect(invokeStep.with.prompt).toMatch(/No repeated command outputs/);
      expect(invokeStep.with.prompt).toMatch(/No verbose raw logs/);
    });

    test('prompt mandates compact-report format (one paragraph per section)', () => {
      expect(invokeStep.with.prompt).toMatch(/Compact-report rules/);
      expect(invokeStep.with.prompt).toMatch(/One concise paragraph per A.S section/);
      // Evidence via file:line, not pasted source/output blobs.
      expect(invokeStep.with.prompt).toMatch(/file:line.*references/);
    });

    test('prompt requires first script call to be a compact COMPLETE audit (not a smoke test)', () => {
      expect(invokeStep.with.prompt).toMatch(/FIRST-CALL = COMPACT COMPLETE AUDIT/);
      // Explicit "first call already produces a complete audit, not a placeholder"
      // (whitespace-tolerant — the YAML block-scalar inserts hard newlines
      // at arbitrary positions within sentences, including between "not a"
      // and "placeholder").
      expect(invokeStep.with.prompt).toMatch(/must already produce a compact complete audit,\s+not\s+a\s+placeholder/);
      // The safety-net framing — even if a later call aborts, the artifact is usable.
      expect(invokeStep.with.prompt).toMatch(/safety net/);
    });

    test('prompt requires LIMITED fallback when content exceeds budget', () => {
      expect(invokeStep.with.prompt).toMatch(/LIMITED FALLBACK RULE/);
      // "Do NOT expand the heredoc body" — must shrink, not grow.
      expect(invokeStep.with.prompt).toMatch(/do NOT[\s\S]{0,40}expand the heredoc body/);
      // LIMITED is the documented fallback label, not silent dropout.
      expect(invokeStep.with.prompt).toMatch(/Change the Coverage Matrix row to .LIMITED/);
    });

    test('prompt cross-references payload budget from runtime budget policy', () => {
      // Ensures the 6 KB cap is positioned as taking PRECEDENCE over the
      // 35-min runtime budget — i.e. shrink before you race the clock.
      expect(invokeStep.with.prompt).toMatch(/payload budget[\s\S]{0,80}takes precedence over runtime budget/i);
    });

    test('prompt forbids retry-with-larger-content after parser abort + requires 40% reduction', () => {
      // STOP-EXPAND + POST-ABORT RECOVERY RULE (Sentinel-D.1.1 extension):
      // codifies the three lifecycle rules Maya specified.
      expect(invokeStep.with.prompt).toMatch(/STOP-EXPAND \+ POST-ABORT RECOVERY RULE/);
      // Rule 1: stop expanding once the compact report passes.
      expect(invokeStep.with.prompt).toMatch(/Stop expanding once the compact report passes/);
      // Rule 2: never retry with larger content after a parser abort.
      expect(invokeStep.with.prompt).toMatch(/Never retry with larger content after a parser abort/);
      // Rule 3: 40% minimum reduction after parser abort.
      expect(invokeStep.with.prompt).toMatch(/40%\s+minimum reduction after parser abort/);
      // Sanity — the rule is anchored to the specific SDK abort string so
      // Claude knows exactly which event triggers the recovery procedure.
      expect(invokeStep.with.prompt).toMatch(/Parser aborted \(timeout, resource limit, or over-length\)/);
    });
  });

  describe('step-level env (sibling of with:)', () => {
    test('env.AUDIT_DATE is wired from steps.paths.outputs.report_date', () => {
      expect(invokeStep.env).toBeDefined();
      expect(invokeStep.env.AUDIT_DATE).toBe('${{ steps.paths.outputs.report_date }}');
    });

    test('env.prompt is undefined (regression for Codex finding)', () => {
      // If `prompt` ends up under env, it becomes an env var named "prompt"
      // and the action loses its instructions. This must never recur.
      expect(invokeStep.env.prompt).toBeUndefined();
    });

    test('env block contains only AUDIT_DATE (no scope creep)', () => {
      expect(Object.keys(invokeStep.env)).toEqual(['AUDIT_DATE']);
    });
  });

  describe('claude_args allow-list invariants', () => {
    const writeRe = /Write\([^)]+\)/g;
    const editRe = /Edit\([^)]+\)/g;
    const bashRe = /Bash\([^)]+\)/g;

    test('no Write(...) entries (Sentinel-D.1 removed Write dependency)', () => {
      const args = doc.jobs.audit.steps.find((s) => s.name === 'Invoke Claude repo-audit-bot').with.claude_args;
      expect(args.match(writeRe) || []).toEqual([]);
    });

    test('no Edit(...) entries', () => {
      const args = invokeStep.with.claude_args;
      expect(args.match(editRe) || []).toEqual([]);
    });

    test('Bash allow-list is exactly the known set (no broadening)', () => {
      const args = invokeStep.with.claude_args;
      const bashEntries = args.match(bashRe) || [];
      expect(bashEntries.sort()).toEqual([
        'Bash(curl -fsSL *)',
        'Bash(curl -sS *)',
        'Bash(gh issue list*)',
        'Bash(gh pr list*)',
        'Bash(git diff)',
        'Bash(git log *)',
        'Bash(git status)',
        'Bash(node scripts/*)',
        'Bash(npm run compliance-check)',
        'Bash(npm run crm:check-build)',
        'Bash(npm run idx:validate)',
        'Bash(npm run lint)',
        'Bash(npm run ops:health)',
        'Bash(npm run ops:system-audit)',
        'Bash(npm run repo:hygiene)',
        'Bash(npm run rls:validate)',
        'Bash(npm run type-check)',
        'Bash(npm run ucba:audit)',
      ].sort());
    });

    test('node scripts/* permission still covers the writer script (Sentinel-D.1 path)', () => {
      const args = invokeStep.with.claude_args;
      expect(args).toMatch(/Bash\(node scripts\/\*\)/);
    });
  });
});
