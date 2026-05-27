/**
 * Sentinel-L — workflow-structure regression test.
 *
 * Mirrors the shape of scripts/__tests__/sentinel-workflow-structure.test.js
 * (which protects Sentinel-D from the YAML-indentation class of bugs Codex
 * caught on PR #191), but pins the Sentinel-L workflow's invariants:
 *
 *   - prompt is an action input under with: (NOT a step-level env var)
 *   - PR_NUMBER + PR_HEAD_SHA are step env vars (sibling of with:)
 *   - No Write(...) or Edit(...) in claude_args allow-list
 *   - Bash allow-list is exactly the known compact set (no broadening)
 *   - The A–E checks + payload-budget + verdict + closing-line rules are
 *     all present in the prompt body
 *   - The workflow's PR-paths filter covers every surface Maya's
 *     Sentinel-L spec lists as mandatory
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const WORKFLOW_PATH = path.resolve(
  __dirname, '..', '..', '.github', 'workflows', 'sentinel-listing-readiness.yml',
);

describe('sentinel-listing-readiness.yml — Sentinel-L structure', () => {
  let doc;
  let invokeStep;

  beforeAll(() => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    doc = yaml.load(content);
    invokeStep = doc.jobs.audit.steps.find(
      (s) => s.name === 'Invoke Claude — Sentinel-L listing-readiness audit',
    );
  });

  describe('triggers', () => {
    test('runs on pull_request with the documented paths filter', () => {
      expect(doc.on.pull_request).toBeDefined();
      expect(doc.on.pull_request.types).toContain('opened');
      expect(doc.on.pull_request.types).toContain('synchronize');
      // Path filter must include every surface Maya's spec lists as
      // mandatory. Failing this assertion means a surface is no longer
      // gated by Sentinel-L.
      const paths = doc.on.pull_request.paths;
      expect(paths).toEqual(expect.arrayContaining([
        'public/crm/SALE-FORM-REDESIGN.html',
        'public/crm/RENTAL-FORM-REDESIGN.html',
        'public/crm/js/dashboard/**',
        'app/api/buildings/**',
        'app/api/crm/listings/**',
        'lib/idx/trestle-mapper.ts',
        'lib/idx/mapping.ts',
        'lib/idx/public-dto.ts',
        'lib/compliance/gates.ts',
        'lib/compliance/idx-display-gate.ts',
      ]));
    });

    test('supports manual workflow_dispatch with a pr_number input', () => {
      expect(doc.on.workflow_dispatch).toBeDefined();
      expect(doc.on.workflow_dispatch.inputs.pr_number).toBeDefined();
      expect(doc.on.workflow_dispatch.inputs.pr_number.required).toBe(true);
    });
  });

  describe('permissions', () => {
    test('grants only pull-requests:write + contents:read + id-token:write', () => {
      expect(doc.permissions).toEqual({
        contents: 'read',
        'pull-requests': 'write',
        'id-token': 'write',
      });
    });

    test('does NOT grant contents:write (Sentinel-L is report-only)', () => {
      expect(doc.permissions.contents).not.toBe('write');
    });
  });

  describe('invoke-Claude step structure', () => {
    test('the Invoke Claude step exists and uses claude-code-action@v1', () => {
      expect(invokeStep).toBeDefined();
      expect(invokeStep.uses).toBe('anthropics/claude-code-action@v1');
    });

    test('with.prompt is a non-empty string (action input, NOT env var)', () => {
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

    test('env contains exactly PR_NUMBER + PR_HEAD_SHA (no scope creep)', () => {
      expect(Object.keys(invokeStep.env).sort()).toEqual(['PR_HEAD_SHA', 'PR_NUMBER']);
    });

    test('env.prompt is undefined (regression for Codex P1 class bug)', () => {
      expect(invokeStep.env.prompt).toBeUndefined();
    });
  });

  describe('claude_args allow-list invariants', () => {
    const writeRe = /Write\([^)]+\)/g;
    const editRe = /Edit\([^)]+\)/g;
    const bashRe = /Bash\([^)]+\)/g;

    test('no Write(...) entries — Sentinel-L uses the script writer only', () => {
      expect(invokeStep.with.claude_args.match(writeRe) || []).toEqual([]);
    });

    test('no Edit(...) entries', () => {
      expect(invokeStep.with.claude_args.match(editRe) || []).toEqual([]);
    });

    test('Bash allow-list is exactly the known set (no broadening)', () => {
      const bashEntries = (invokeStep.with.claude_args.match(bashRe) || []).sort();
      expect(bashEntries).toEqual([
        'Bash(curl -fsSL *)',
        'Bash(curl -sS *)',
        'Bash(gh pr diff *)',
        'Bash(gh pr view *)',
        'Bash(git diff *)',
        'Bash(git log *)',
        'Bash(git status)',
        'Bash(node scripts/*)',
        'Bash(npm run compliance-check)',
        'Bash(npm run crm:check-build)',
        'Bash(npm run idx:validate)',
        'Bash(npm run lint)',
        'Bash(npm run rls:validate)',
        'Bash(npm run type-check)',
        'Bash(npm run ucba:audit)',
      ].sort());
    });

    test('node scripts/* allows invoking sentinel-write-listing-audit.mjs', () => {
      expect(invokeStep.with.claude_args).toMatch(/Bash\(node scripts\/\*\)/);
    });

    test('no gh pr comment / gh pr merge / gh pr close in allow-list', () => {
      // The workflow itself posts the PR comment after Claude finishes.
      // Claude should not have any state-mutating gh subcommand.
      expect(invokeStep.with.claude_args).not.toMatch(/gh pr comment/);
      expect(invokeStep.with.claude_args).not.toMatch(/gh pr merge/);
      expect(invokeStep.with.claude_args).not.toMatch(/gh pr close/);
      expect(invokeStep.with.claude_args).not.toMatch(/gh pr review/);
    });
  });

  describe('prompt content', () => {
    test('prompt forbids the Write and Edit tools explicitly', () => {
      // Whitespace-tolerant — YAML block-scalar wraps at column boundaries.
      expect(invokeStep.with.prompt).toMatch(/STRICT REPORT-ONLY MODE/);
      expect(invokeStep.with.prompt).toMatch(/may NOT use the Write\s+tool/);
      expect(invokeStep.with.prompt).toMatch(/may NOT use the Edit\s+tool/);
      // Also blocks filesystem-write Bash workarounds.
      expect(invokeStep.with.prompt).toMatch(/no `cat >`/);
      expect(invokeStep.with.prompt).toMatch(/no `sed -i`/);
      expect(invokeStep.with.prompt).toMatch(/no `python -c`\/`node -e`\s+with fs writes/);
    });

    test('prompt routes audit output through sentinel-write-listing-audit.mjs only', () => {
      expect(invokeStep.with.prompt).toMatch(/node scripts\/sentinel-write-listing-audit\.mjs/);
    });

    test('prompt forbids Claude from posting PR comments directly', () => {
      // Whitespace-tolerant for YAML block-scalar wraps (e.g. "Do\n    NOT").
      expect(invokeStep.with.prompt).toMatch(/Do\s+NOT\s+attempt\s+`gh pr comment`\s+yourself/i);
    });

    test('prompt declares the 6 KB / 6,144-byte payload budget (Sentinel-D.1.1 cap)', () => {
      expect(invokeStep.with.prompt).toMatch(/PAYLOAD BUDGET RULE/);
      expect(invokeStep.with.prompt).toMatch(/6\s*KB/);
      expect(invokeStep.with.prompt).toMatch(/6,144\s*bytes/);
      expect(invokeStep.with.prompt).toMatch(/Parser aborted/);
    });

    test('prompt mandates compact-report format (one paragraph per A–E section)', () => {
      expect(invokeStep.with.prompt).toMatch(/One concise paragraph per A.E section/);
      expect(invokeStep.with.prompt).toMatch(/No giant evidence dumps/);
      expect(invokeStep.with.prompt).toMatch(/No new tables anywhere/);
      expect(invokeStep.with.prompt).toMatch(/No repeated command outputs/);
      expect(invokeStep.with.prompt).toMatch(/No verbose raw logs/);
    });

    test('prompt requires first script call to be a compact COMPLETE audit', () => {
      expect(invokeStep.with.prompt).toMatch(/FIRST-CALL = COMPACT COMPLETE AUDIT/);
      expect(invokeStep.with.prompt).toMatch(/safety net/);
      expect(invokeStep.with.prompt).toMatch(/STRUCTURALLY COMPLETE report/);
    });

    test('prompt requires the LIMITED fallback when content exceeds budget', () => {
      expect(invokeStep.with.prompt).toMatch(/LIMITED FALLBACK RULE/);
      expect(invokeStep.with.prompt).toMatch(/do NOT expand the heredoc/);
    });

    test('prompt requires the STOP-EXPAND + POST-ABORT RECOVERY discipline', () => {
      expect(invokeStep.with.prompt).toMatch(/STOP-EXPAND \+ POST-ABORT RECOVERY RULE/);
      expect(invokeStep.with.prompt).toMatch(/at least 40% smaller/);
      expect(invokeStep.with.prompt).toMatch(/Never retry with larger content after a parser abort/);
    });

    test('prompt enumerates all A–E checks from Maya\'s spec', () => {
      expect(invokeStep.with.prompt).toMatch(/A\. Address \/ Cotality \/ RESO/);
      expect(invokeStep.with.prompt).toMatch(/B\. Sale listing workflow/);
      expect(invokeStep.with.prompt).toMatch(/C\. Draft workflow/);
      expect(invokeStep.with.prompt).toMatch(/D\. Media workflow/);
      expect(invokeStep.with.prompt).toMatch(/E\. Final verdict/);
    });

    test('prompt lists the canonical Sentinel-L check numbering (A.1, B.1, C.1, …)', () => {
      // Spot-check at least one numbered sub-bullet from each section to
      // protect against an over-eager prompt trim dropping the checklist.
      expect(invokeStep.with.prompt).toMatch(/A\.1\.\s+Confirm which RESO resources/);
      expect(invokeStep.with.prompt).toMatch(/B\.4\.\s+Web Only forces IDX\/RLS\/Syndication OFF/);
      expect(invokeStep.with.prompt).toMatch(/C\.1\.\s+Save Draft creates DB record/);
      expect(invokeStep.with.prompt).toMatch(/D\.4\.\s+Save Draft creates listing ID before upload/);
    });

    test('prompt requires explicit GREEN | YELLOW | RED verdict line', () => {
      // Each verdict label must appear with its documented semantics so
      // Claude can pattern-match the decision.
      expect(invokeStep.with.prompt).toMatch(/Final verdict: GREEN/);
      expect(invokeStep.with.prompt).toMatch(/Final verdict: YELLOW/);
      expect(invokeStep.with.prompt).toMatch(/Final verdict: RED/);
      expect(invokeStep.with.prompt).toMatch(/broker can use flow end-to-end/);
      expect(invokeStep.with.prompt).toMatch(/usable with named caveats/);
      expect(invokeStep.with.prompt).toMatch(/do not use/);
    });

    test('prompt enforces the "code exists is not proof" hard rule', () => {
      // Whitespace-tolerant for YAML block-scalar wraps (e.g. "Code\nexists").
      expect(invokeStep.with.prompt).toMatch(/"Tests pass" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/"CI green" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/"Code\s+exists" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/live user\s+path is proven/);
    });

    test('prompt requires the literal closing line Sentinel-L: report-only — no changes made.', () => {
      // Closing line must be present so the script's MISSING_CLOSING_LINE
      // gate matches the workflow's contract.
      expect(invokeStep.with.prompt).toMatch(/Sentinel-L: report-only — no changes made\./);
    });
  });

  describe('post-Claude verification + comment posting', () => {
    test('a post-Claude verification step exists', () => {
      const step = doc.jobs.audit.steps.find(
        (s) => s.name === 'Verify Claude actually updated the audit (post-invocation diagnostic)',
      );
      expect(step).toBeDefined();
      // Must check skeleton SHA inequality (Sentinel-D zero-write guard).
      expect(step.run).toMatch(/SKELETON_SHA/);
      expect(step.run).toMatch(/current_sha/);
    });

    test('a comment-posting step exists and uses gh pr comment with --body-file', () => {
      const step = doc.jobs.audit.steps.find(
        (s) => s.name === 'Post audit summary as PR comment',
      );
      expect(step).toBeDefined();
      expect(step.run).toMatch(/gh pr comment.*--body-file/);
      // Must run even on failure so a RED verdict still surfaces on the PR.
      expect(step.if).toMatch(/always\(\)/);
    });

    test('the audit artifact is uploaded even on failure', () => {
      const step = doc.jobs.audit.steps.find(
        (s) => s.name === 'Upload audit artifact (always, when audit exists)',
      );
      expect(step).toBeDefined();
      expect(step.if).toMatch(/always\(\)/);
      expect(step.uses).toBe('actions/upload-artifact@v4');
    });
  });

  describe('concurrency + timeout posture', () => {
    test('concurrency group is keyed by PR number with cancel-in-progress', () => {
      expect(doc.concurrency.group).toMatch(/sentinel-l-/);
      expect(doc.concurrency['cancel-in-progress']).toBe(true);
    });

    test('audit job timeout is bounded (<= 35 min, matching Sentinel-D budget)', () => {
      expect(doc.jobs.audit['timeout-minutes']).toBeLessThanOrEqual(35);
    });
  });
});
