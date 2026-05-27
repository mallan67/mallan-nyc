// Probe: verify Sentinel-L triggers after PR #216 merge (2026-05-27)

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
        'lib/compliance/gates.ts',
        'lib/compliance/idx-display-gate.ts',
      ]));
    });

    // Codex P0 #5 — additional path surfaces must all be covered.
    test('paths filter includes every Codex P0 #5 surface', () => {
      const paths = doc.on.pull_request.paths;
      expect(paths).toEqual(expect.arrayContaining([
        // media surfaces
        'lib/media/**',
        'app/api/media/**',
        'app/api/cron/media-sync/**',
        'app/api/cron/media-backfill/**',
        // syndication
        'lib/syndication/**',
        // public-listing filter + readers + projection
        'lib/compliance/public-listing-filter.ts',
        'lib/search/public-listing-db.ts',
        'lib/search/public-listing-trestle.ts',
        'lib/search/listing-search-projection.ts',
        // lib/idx (broader — covers all Cotality/Trestle mapping)
        'lib/idx/**',
        // listing detail page + display components
        'app/listing/**',
        'app/components/Listing*.tsx',
        'app/components/FeaturedListings.tsx',
        'app/components/IDX*.tsx',
        // Sentinel-L self-paths (any change to L infra re-runs L)
        '.github/workflows/sentinel-listing-readiness.yml',
        'scripts/sentinel-write-listing-audit.mjs',
        'scripts/__tests__/sentinel-listing-readiness-workflow.test.js',
        'scripts/__tests__/sentinel-write-listing-audit.test.js',
      ]));
    });

    test('supports manual workflow_dispatch with a pr_number input', () => {
      expect(doc.on.workflow_dispatch).toBeDefined();
      expect(doc.on.workflow_dispatch.inputs.pr_number).toBeDefined();
      expect(doc.on.workflow_dispatch.inputs.pr_number.required).toBe(true);
    });
  });

  describe('permissions', () => {
    // Codex P0 #6 — `gh pr comment` posts via the issues-comments
    // endpoint, so `issues: write` is required alongside
    // `pull-requests: write`. Both are scoped to commenting; neither
    // permits merging, closing, reopening, or assigning.
    test('grants contents:read + pull-requests:write + issues:write + id-token:write', () => {
      expect(doc.permissions).toEqual({
        contents: 'read',
        'pull-requests': 'write',
        issues: 'write',
        'id-token': 'write',
      });
    });

    test('does NOT grant contents:write (Sentinel-L is report-only)', () => {
      expect(doc.permissions.contents).not.toBe('write');
    });

    test('issues: write is present (gh pr comment requirement — Codex P0 #6)', () => {
      expect(doc.permissions.issues).toBe('write');
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

    test('Bash allow-list is exactly the known narrow set (Codex P0 #7)', () => {
      const bashEntries = (invokeStep.with.claude_args.match(bashRe) || []).sort();
      expect(bashEntries).toEqual([
        'Bash(curl -fsSL *)',
        'Bash(curl -sS *)',
        'Bash(gh pr diff *)',
        'Bash(gh pr view *)',
        'Bash(git diff *)',
        'Bash(git log *)',
        'Bash(git status)',
        // Codex P0 #7 — narrowed from Bash(node scripts/*) to the exact
        // writer-command prefix. Any `node scripts/<other>` invocation is
        // now denied; the no-arg form proves the exact command is allowed,
        // while trailing ` *` allows the heredoc-redirect tail.
        'Bash(node scripts/sentinel-write-listing-audit.mjs)',
        'Bash(node scripts/sentinel-write-listing-audit.mjs *)',
        'Bash(npm run compliance-check)',
        'Bash(npm run crm:check-build)',
        'Bash(npm run idx:validate)',
        'Bash(npm run lint)',
        'Bash(npm run rls:validate)',
        'Bash(npm run type-check)',
        'Bash(npm run ucba:audit)',
      ].sort());
    });

    test('writer-script Bash pattern is the narrow form (NOT Bash(node scripts/*))', () => {
      // Codex P0 #7 — the broader `Bash(node scripts/*)` would permit
      // invoking any node script under scripts/. We pin the exact writer.
      expect(invokeStep.with.claude_args).toMatch(/Bash\(node scripts\/sentinel-write-listing-audit\.mjs\)/);
      expect(invokeStep.with.claude_args).toMatch(/Bash\(node scripts\/sentinel-write-listing-audit\.mjs \*\)/);
      // The broad form must be absent.
      expect(invokeStep.with.claude_args).not.toMatch(/Bash\(node scripts\/\*\)/);
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

    test('prompt mandates compact-report format (Sentinel-L.2 A–L)', () => {
      // Sentinel-L.2 — paragraph rule applies to the 12-lens A–L body.
      expect(invokeStep.with.prompt).toMatch(/one concise paragraph/i);
      expect(invokeStep.with.prompt).toMatch(/No giant evidence dumps/);
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

    // Sentinel-L.2 — enumerated 12 lenses (A–L), not 5 (A–E). Each lens
    // must appear in the prompt with its canonical name.
    test('prompt enumerates all 12 A–L lenses (Sentinel-L.2)', () => {
      expect(invokeStep.with.prompt).toMatch(/A\.\s+Syntax \/ structural correctness/);
      expect(invokeStep.with.prompt).toMatch(/B\.\s+Field contract correctness/);
      expect(invokeStep.with.prompt).toMatch(/C\.\s+Business logic correctness/);
      expect(invokeStep.with.prompt).toMatch(/D\.\s+Broker \/ agent usability/);
      expect(invokeStep.with.prompt).toMatch(/E\.\s+Client-facing usability/);
      expect(invokeStep.with.prompt).toMatch(/F\.\s+REBNY \/ RLS \/ RESO \/ IDX Plus compliance/);
      expect(invokeStep.with.prompt).toMatch(/G\.\s+Trestle \/ Cotality Web API contract/);
      expect(invokeStep.with.prompt).toMatch(/H\.\s+NYC \/ NYS real estate advertising law/);
      expect(invokeStep.with.prompt).toMatch(/I\.\s+Fair Housing \/ advertising language/);
      expect(invokeStep.with.prompt).toMatch(/J\.\s+Data persistence and media integrity/);
      expect(invokeStep.with.prompt).toMatch(/K\.\s+Security \/ privacy \/ role access/);
      expect(invokeStep.with.prompt).toMatch(/L\.\s+Evidence quality/);
    });

    test('prompt requires the Sentinel-L.2 Finding matrix with 10 documented columns', () => {
      expect(invokeStep.with.prompt).toMatch(/FINDING MATRIX \(REQUIRED — Sentinel-L\.2\)/);
      const tenCols = [
        'file', 'changed lines', 'affected workflow', 'field contracts touched',
        'user role affected', 'compliance surface', 'risk', 'proof level',
        'finding', 'required action',
      ];
      for (const col of tenCols) {
        expect(invokeStep.with.prompt).toMatch(new RegExp(col.replace(/ /g, '\\s+'), 'i'));
      }
    });

    test('prompt references the 3 deterministic JSON inputs (Sentinel-L.2)', () => {
      expect(invokeStep.with.prompt).toMatch(/steps\.deterministic\.outputs\.field_contract_path/);
      expect(invokeStep.with.prompt).toMatch(/steps\.deterministic\.outputs\.compliance_language_path/);
      expect(invokeStep.with.prompt).toMatch(/steps\.deterministic\.outputs\.listing_flow_path/);
    });

    test('prompt requires explicit GREEN | YELLOW | RED verdict line', () => {
      expect(invokeStep.with.prompt).toMatch(/Final verdict: GREEN/);
      expect(invokeStep.with.prompt).toMatch(/Final verdict: YELLOW/);
      expect(invokeStep.with.prompt).toMatch(/Final verdict: RED/);
    });

    test('prompt enforces the "code exists is not proof" hard rule', () => {
      // Whitespace-tolerant for YAML block-scalar wraps (e.g. "Code\nexists").
      expect(invokeStep.with.prompt).toMatch(/"Tests pass" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/"CI green" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/"Code\s+exists" is not proof/);
      expect(invokeStep.with.prompt).toMatch(/live user\s+path is proven on production/);
    });


    test('prompt requires production-only live proof and treats preview as unreliable', () => {
      expect(invokeStep.with.prompt).toMatch(/PRODUCTION-ONLY LIVE PROOF RULE/);
      expect(invokeStep.with.prompt).toMatch(/mallan\.nyc/);
      expect(invokeStep.with.prompt).toMatch(/current production deployment/);
      expect(invokeStep.with.prompt).toMatch(/preview URLs are unreliable/);
      expect(invokeStep.with.prompt).toMatch(/Preview-only\s+evidence[\s\S]{0,80}never enough for GREEN/);
    });

    test('prompt requires the literal closing line Sentinel-L: report-only — no changes made.', () => {
      // Closing line must be present so the script's MISSING_CLOSING_LINE
      // gate matches the workflow's contract.
      expect(invokeStep.with.prompt).toMatch(/Sentinel-L: report-only — no changes made\./);
    });
  });

  describe('post-Claude verification + comment posting', () => {
    let postclaudeStep;
    let commentStep;

    beforeAll(() => {
      postclaudeStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Verify Claude audit OR write fallback report (always runs)',
      );
      commentStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Post audit summary as PR comment',
      );
    });

    // Codex P0 #1 — post-Claude verification must run even when Claude
    // fails / aborts / times out. The previous version had no `if:`
    // condition, so a Claude failure would short-circuit GitHub Actions'
    // default fail-fast behavior and skip verification + comment + RED.
    test('post-Claude verification step exists and has if: always()', () => {
      expect(postclaudeStep).toBeDefined();
      expect(postclaudeStep.if).toMatch(/always\(\)/);
      expect(postclaudeStep.id).toBe('postclaude');
    });

    test('post-Claude step reads steps.claude.outcome via env (Codex P0 #1 wiring)', () => {
      // The Invoke Claude step must have id: claude so steps.claude.outcome
      // is queryable, and the post-Claude step must consume it (here via
      // a step-level env var so the run-script can inspect it cleanly).
      const claudeStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Invoke Claude — Sentinel-L listing-readiness audit',
      );
      expect(claudeStep.id).toBe('claude');
      // The step's env must wire steps.claude.outcome through to the script.
      expect(postclaudeStep.env).toBeDefined();
      const envValues = Object.values(postclaudeStep.env).join('\n');
      expect(envValues).toMatch(/steps\.claude\.outcome/);
      // The run-script must reference the env var name it expects.
      expect(postclaudeStep.run).toMatch(/CLAUDE_OUTCOME/);
    });

    // Codex P0 #2 — when Claude does not produce a valid audit (missing
    // file, SHA unchanged, missing verdict, duplicate verdict, missing
    // closing line), the workflow must write a fallback RED report so
    // the PR comment + artifact upload still surface a meaningful result.
    test('post-Claude step writes a fallback report (Codex P0 #2 + Sentinel-L.2)', () => {
      expect(postclaudeStep.run).toMatch(/write_fallback_report/);
      // Fallback report must include the verdict marker so downstream
      // extraction works against the fallback content too.
      expect(postclaudeStep.run).toMatch(/Final verdict: RED/);
      // Fallback report must satisfy the closing-line contract.
      expect(postclaudeStep.run).toMatch(/Sentinel-L: report-only — no changes made\./);
      // Sentinel-L.2 — fallback must satisfy the 12-section + Finding
      // matrix shape so the writer's strict gates pass on the fallback.
      expect(postclaudeStep.run).toMatch(/## Finding matrix/);
      expect(postclaudeStep.run).toMatch(/## A\. Syntax \/ structural correctness/);
      expect(postclaudeStep.run).toMatch(/## F\. REBNY \/ RLS \/ RESO \/ IDX Plus compliance/);
      expect(postclaudeStep.run).toMatch(/## L\. Evidence quality/);
    });

    // Sentinel-L.2 (improvement) — fallback must embed deterministic
    // findings so the PR comment surfaces real signals (touched fields,
    // workflow risks, compliance violations) instead of generic boilerplate.
    test('post-Claude step embeds the deterministic summary in the fallback (L.2 improvement)', () => {
      expect(postclaudeStep.env).toBeDefined();
      expect(postclaudeStep.env.DETERMINISTIC_SUMMARY_MD).toBe('${{ steps.deterministic.outputs.summary_md }}');
      expect(postclaudeStep.env.FIELD_TOUCHED_COUNT).toBeDefined();
      expect(postclaudeStep.env.FLOW_HIGHEST_RISK).toBeDefined();
      expect(postclaudeStep.env.LANGUAGE_HIGHEST_SEVERITY).toBeDefined();
      // The fallback body must reference the deterministic summary marker.
      expect(postclaudeStep.run).toMatch(/\$\{DETERMINISTIC_SUMMARY_MD\}/);
      // The fallback Finding matrix should include a deterministic-signals row.
      expect(postclaudeStep.run).toMatch(/deterministic summary/i);
      // Section L must cite the specific deterministic-only evidence quality.
      expect(postclaudeStep.run).toMatch(/deterministic static-code signals only/);
      // Sections B, F, H, I, J should reference the deterministic findings
      // (not the generic "could not complete its investigation" boilerplate
      // that was there pre-improvement).
      expect(postclaudeStep.run).toMatch(/Deterministic field-contract scan/);
      expect(postclaudeStep.run).toMatch(/Deterministic compliance-language scan/);
      expect(postclaudeStep.run).toMatch(/Deterministic listing-flow scan/);
    });

    test('deterministic step emits summary_md as a multi-line output (L.2 improvement)', () => {
      const detStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Run Sentinel-L.2 deterministic audit scripts',
      );
      expect(detStep).toBeDefined();
      // Must compute summary_md from the 3 JSON files and emit it as a
      // multi-line GITHUB_OUTPUT using the heredoc-delimited syntax.
      expect(detStep.run).toMatch(/summary_md=\$\(node -e/);
      expect(detStep.run).toMatch(/summary_md<<SENTINEL_L2_MD_EOF/);
      expect(detStep.run).toMatch(/SENTINEL_L2_MD_EOF/);
      // The node-built summary must include all three deterministic
      // dimensions so downstream consumers (the fallback report + the
      // PR comment) have a meaningful payload.
      expect(detStep.run).toMatch(/Field contract/);
      expect(detStep.run).toMatch(/Compliance language/);
      expect(detStep.run).toMatch(/Listing flow/);
    });

    // Sentinel-L.2 patch (Maya's C+D) — prompt must explicitly tell Claude
    // the writer is allowed and required. Previously the "report-only"
    // framing was ambiguous; this pin asserts the explicit FIRST ACTION.
    test('prompt has explicit FIRST REQUIRED ACTION naming the writer script', () => {
      expect(invokeStep.with.prompt).toMatch(/FIRST REQUIRED ACTION/);
      expect(invokeStep.with.prompt).toMatch(/You MUST call the writer script/);
      expect(invokeStep.with.prompt).toMatch(/BOTH ALLOWED\s+AND REQUIRED/);
      // The script name must be cited verbatim in the FIRST ACTION block.
      expect(invokeStep.with.prompt).toMatch(/scripts\/sentinel-write-listing-audit\.mjs/);
    });

    test('prompt includes a worked example of the writer invocation', () => {
      // The example uses the canonical heredoc shape so Claude can
      // pattern-match it verbatim.
      expect(invokeStep.with.prompt).toMatch(/WORKED EXAMPLE/);
      expect(invokeStep.with.prompt).toMatch(/node scripts\/sentinel-write-listing-audit\.mjs <<'AUDIT_EOF'/);
      expect(invokeStep.with.prompt).toMatch(/AUDIT_EOF/);
      // The example must contain Finding matrix + 12 sections + verdict +
      // closing line so Claude has a complete template to fill in.
      expect(invokeStep.with.prompt).toMatch(/## Finding matrix/);
      expect(invokeStep.with.prompt).toMatch(/Sentinel-L: report-only — no changes made/);
    });

    test('prompt clarifies that "report-only" does NOT mean "do not write audit"', () => {
      // The previous prompt was ambiguous about what "report-only" meant.
      // The L.2 patch makes the distinction explicit.
      expect(invokeStep.with.prompt).toMatch(/"Report-only" means "do NOT modify production code"/);
      expect(invokeStep.with.prompt).toMatch(/does NOT mean "do not write the audit report file"/);
    });

    test('prompt does not use zero-Write language that could confuse Claude', () => {
      expect(invokeStep.with.prompt).not.toMatch(/zero-Write/i);
    });

    // Sentinel-L.2 patch (Maya's spec point 10) — when Claude does not
    // write, the workflow must compute a deterministic verdict from the
    // JSON facts. Any P0 risk => RED. No P0 risk + Claude exited
    // success => YELLOW. Anything else => RED (fail-closed).
    test('post-Claude step computes a deterministic verdict when SHA == skeleton', () => {
      // The synthesis logic must inspect all 3 deterministic JSONs.
      expect(postclaudeStep.run).toMatch(/deterministic synthesis/i);
      expect(postclaudeStep.run).toMatch(/Sentinel-L\.2 deterministic synthesis inputs:/);
      // P0-or-no-coverage policy must be cited explicitly.
      expect(postclaudeStep.run).toMatch(/lang_max.*P0/);
      expect(postclaudeStep.run).toMatch(/flow_max.*P0/);
      expect(postclaudeStep.run).toMatch(/field_no_cov/);
      // YELLOW path must be guarded by CLAUDE_OUTCOME=success AND no-P0.
      expect(postclaudeStep.run).toMatch(/CLAUDE_OUTCOME.*=.*success/);
      expect(postclaudeStep.run).toMatch(/det_verdict="YELLOW"/);
      // Default must remain RED — explicit assignment proves it.
      expect(postclaudeStep.run).toMatch(/det_verdict="RED"/);
      // Exact failure-class taxonomy: skip/fail/no-write/invalid-output must be
      // surfaced in fallback reports instead of generic "zero-write".
      expect(postclaudeStep.run).toMatch(/claude_action_skipped_workflow_validation/);
      expect(postclaudeStep.run).toMatch(/claude_action_failed/);
      expect(postclaudeStep.run).toMatch(/writer_not_called_or_no_effect/);
      expect(postclaudeStep.run).toMatch(/writer_rejected_or_invalid_output/);
      // The verdict swap (RED -> YELLOW) when synthesis chooses YELLOW
      // must happen via sed on the fallback file.
      expect(postclaudeStep.run).toMatch(/sed -i 's\/\^Final verdict: RED\$\/Final verdict: YELLOW\//);
    });

    test('post-Claude step emits deterministic-synthesis outputs for downstream visibility', () => {
      expect(postclaudeStep.run).toMatch(/deterministic_synthesis=true/);
      expect(postclaudeStep.run).toMatch(/deterministic_lang_max/);
      expect(postclaudeStep.run).toMatch(/deterministic_flow_max/);
      expect(postclaudeStep.run).toMatch(/deterministic_field_no_cov/);
    });

    // Sentinel-L.2 patch (Maya's spec point 9) — breadcrumbs around the
    // major phases so the workflow log makes forensic investigation
    // self-service.
    test('workflow has log breadcrumbs around deterministic + pre-Claude phases', () => {
      const detStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Run Sentinel-L.2 deterministic audit scripts',
      );
      const breadcrumbStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Sentinel-L.2 breadcrumb — pre-Claude',
      );
      // Deterministic step has start + end breadcrumbs.
      expect(detStep.run).toMatch(/Sentinel-L\.2 breadcrumb: BEGIN deterministic scripts/);
      expect(detStep.run).toMatch(/Sentinel-L\.2 breadcrumb: END deterministic scripts/);
      // Pre-Claude breadcrumb step exists with if: always().
      expect(breadcrumbStep).toBeDefined();
      expect(breadcrumbStep.if).toMatch(/always\(\)/);
      expect(breadcrumbStep.run).toMatch(/BEFORE Claude invocation/);
      expect(breadcrumbStep.run).toMatch(/Claude action outcome \(post-invoke\)/);
      expect(breadcrumbStep.run).toMatch(/Claude workflow-validation expected_skip/);
      expect(breadcrumbStep.run).toMatch(/Claude workflow-validation reason/);
    });

    test('workflow preflights claude-code-action self-modifying workflow skip', () => {
      const preflightStep = doc.jobs.audit.steps.find(
        (s) => s.name === 'Detect Claude workflow-validation skip risk',
      );
      const claudeIndex = doc.jobs.audit.steps.findIndex(
        (s) => s.name === 'Invoke Claude — Sentinel-L listing-readiness audit',
      );
      const preflightIndex = doc.jobs.audit.steps.findIndex(
        (s) => s.name === 'Detect Claude workflow-validation skip risk',
      );
      expect(preflightStep).toBeDefined();
      expect(preflightIndex).toBeGreaterThan(-1);
      expect(preflightIndex).toBeLessThan(claudeIndex);
      expect(preflightStep.id).toBe('claude_preflight');
      expect(preflightStep.run).toMatch(/origin\/main/);
      expect(preflightStep.run).toMatch(/workflow_file_missing_on_default_branch/);
      expect(preflightStep.run).toMatch(/workflow_file_differs_from_default_branch/);
      expect(preflightStep.run).toMatch(/expected_skip=.*GITHUB_OUTPUT/);
      expect(preflightStep.run).toMatch(/reason=.*GITHUB_OUTPUT/);
    });

    // Codex P0 #3 — extraction must reject duplicate verdict lines and
    // collapse to fallback RED.
    test('post-Claude step rejects duplicate verdict lines (Codex P0 #3)', () => {
      // verdict_count must be checked for !=1 — covers both zero and >1.
      expect(postclaudeStep.run).toMatch(/verdict_count[^\n]*-ne 1/);
    });

    test('comment-posting step uses gh pr comment with --body-file and if: always()', () => {
      expect(commentStep).toBeDefined();
      expect(commentStep.run).toMatch(/gh pr comment.*--body-file/);
      // Must run even on failure so a RED verdict still surfaces on the PR.
      expect(commentStep.if).toMatch(/always\(\)/);
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
