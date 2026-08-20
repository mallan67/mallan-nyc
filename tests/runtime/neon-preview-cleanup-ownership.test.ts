/// <reference types="jest" />
/**
 * Neon preview-branch cleanup — OWNERSHIP MODEL + PRODUCTION REFUSAL.
 *
 * Why this test exists
 * --------------------
 * `.github/workflows/cleanup-neon-preview-branch.yml` deletes Neon branches.
 * Until 2026-08-20 it declared the INVERSE of system truth: it called
 * `hidden-mountain-87248164` "the PREVIEW project" and
 * `morning-bread-68708332` "PRODUCTION". Live Neon control-plane verification
 * on 2026-08-20 shows:
 *
 *   hidden-mountain-87248164 ("neon-green-school")
 *     - holds production branch `main` = br-crimson-frog-adr7g9gt
 *       (primary=true, default=true, PROTECTED=FALSE, ~627 MB logical,
 *       compute ep-cold-waterfall-adno3ao2 ACTIVE)
 *     - ALSO holds the PR preview branches
 *       (e.g. preview/fix/neon-p0-event-driven-wake-2026-08-16 =
 *       br-spring-mouse-adfywa55, parent br-crimson-frog-adr7g9gt)
 *   morning-bread-68708332 ("mallandb")
 *     - main = br-old-tree-admdlb9z, state `archived`, cpu_used_sec 0 -> STALE
 *
 * So the workflow deletes branches FROM THE PROJECT THAT HOLDS PRODUCTION, and
 * `main` is NOT flagged `protected` in Neon. Production must therefore be
 * refused DELIBERATELY, by NAME and by ID.
 *
 * What each layer proves — and only that:
 *   A. identity pins   -> the workflow's DECLARED identities match the repo's
 *                         single source of truth (lib/ops/canonical-neon-target).
 *                         Static text; proves declaration, not execution.
 *   B/C. executed bash -> the guard and the production-refusal steps are run
 *                         for real under `bash` with injected env, and their
 *                         EXIT CODES are asserted. This is behavior, not text.
 *   D. preserved pins  -> every pre-existing protection is still present.
 *   E. doc pin         -> the ownership doc row describing this workflow's
 *                         variables does not repeat the inversion.
 *
 * None of this proves a workflow RUN happened; that is GitHub Actions runtime
 * evidence, not a unit test.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CANONICAL_NEON_PROJECT_ID,
  FORBIDDEN_NEON_PROJECT_IDS,
} from '@/lib/ops/canonical-neon-target';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW_REL = '.github/workflows/cleanup-neon-preview-branch.yml';
const WORKFLOW_ABS = path.join(ROOT, WORKFLOW_REL);

/** Production branch identity — live-verified on the Neon control plane 2026-08-20. */
const PRODUCTION_BRANCH_NAME = 'main';
const PRODUCTION_BRANCH_ID = 'br-crimson-frog-adr7g9gt';
const STALE_LEGACY_PROJECT_ID = 'morning-bread-68708332';

/** Working-tree checkouts on Windows are CRLF; bash needs LF. */
const readWorkflow = (): string =>
  fs.readFileSync(WORKFLOW_ABS, 'utf8').replace(/\r\n/g, '\n');

/**
 * Strip whole-line comments. "No X here" written in a header comment must never
 * satisfy — or violate — an assertion about whether X is actually configured.
 */
const codeOnly = (src: string): string =>
  src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

// ---------------------------------------------------------------------------
// Minimal, deterministic YAML helpers. We deliberately do NOT pull in a YAML
// parser: js-yaml is only a transitive dep here, and a committed CI-safety test
// must not depend on hoisting luck.
// ---------------------------------------------------------------------------

/** Parse the job-level `env:` mapping into KEY -> literal value. */
function parseJobEnv(src: string): Record<string, string> {
  const lines = src.split('\n');
  const envIdx = lines.findIndex((l) => /^\s{4}env:\s*$/.test(l));
  if (envIdx === -1) throw new Error(`No job-level env: block found in ${WORKFLOW_REL}`);
  const out: Record<string, string> = {};
  for (let i = envIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= 4) break; // left the env block
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  if (Object.keys(out).length === 0) throw new Error('job env: block parsed empty');
  return out;
}

/**
 * Extract the literal `run: |` block scalar of the step whose `name:` contains
 * `marker`. Throws loudly when the step is absent — an absent safety step is a
 * FAILURE, never a silent skip.
 */
function extractRunBlock(src: string, marker: string): string {
  const lines = src.split('\n');
  const stepIdx = lines.findIndex(
    (l) => /^\s*-\s+name:\s/.test(l) && l.toLowerCase().includes(marker.toLowerCase()),
  );
  if (stepIdx === -1) {
    throw new Error(
      `No step whose name contains "${marker}" exists in ${WORKFLOW_REL} — ` +
        `the protection it should provide is ABSENT.`,
    );
  }
  let runIdx = -1;
  for (let i = stepIdx + 1; i < lines.length; i++) {
    if (/^\s*-\s+name:\s/.test(lines[i])) break; // next step reached, no run: found
    if (/^\s*run:\s*\|\s*$/.test(lines[i])) {
      runIdx = i;
      break;
    }
  }
  if (runIdx === -1) throw new Error(`Step "${marker}" has no run block`);
  const runIndent = lines[runIdx].length - lines[runIdx].trimStart().length;
  const body: string[] = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= runIndent) break;
    body.push(line);
  }
  const widths = body
    .filter((l) => l.trim() !== '')
    .map((l) => l.length - l.trimStart().length);
  const dedent = widths.length ? Math.min(...widths) : 0;
  const script = body.map((l) => (l.trim() === '' ? '' : l.slice(dedent))).join('\n');
  if (script.trim() === '') throw new Error(`Step "${marker}" run block is empty`);
  return script;
}

type RunResult = { status: number; stdout: string; stderr: string; output: string };

/**
 * Execute an extracted step under real bash with a CLEAN env: the workflow's own
 * job-level literals as the base (so the script under test sees what CI gives
 * it), plus the test's overrides. GitHub expressions become '' — tests supply
 * those explicitly. A clean env also stops any real credential in the developer
 * environment from leaking into the child process.
 */
function runStep(marker: string, overrides: Record<string, string>): RunResult {
  const src = readWorkflow();
  const script = extractRunBlock(src, marker);
  const jobEnv = parseJobEnv(src);

  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(jobEnv)) {
    base[k] = v.startsWith('${{') ? '' : v.replace(/^['"]|['"]$/g, '');
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-cleanup-guard-'));
  const scriptPath = path.join(dir, 'step.sh');
  const outPath = path.join(dir, 'github_output');
  fs.writeFileSync(scriptPath, script, 'utf8');
  fs.writeFileSync(outPath, '', 'utf8');

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PATH: process.env.PATH ?? '',
    SYSTEMROOT: process.env.SYSTEMROOT ?? '',
    GITHUB_OUTPUT: outPath.replace(/\\/g, '/'),
    ...base,
    ...overrides,
  };

  const r = spawnSync('bash', [scriptPath.replace(/\\/g, '/')], { env, encoding: 'utf8' });
  if (r.error) throw r.error;
  const output = fs.readFileSync(outPath, 'utf8');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort cleanup */
  }
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', output };
}

// ===========================================================================
// A. Declared-identity pins — the ownership model must match system truth.
// ===========================================================================
describe('A. cleanup-neon-preview-branch declares the TRUE ownership model', () => {
  test('the canonical PRODUCTION project id is declared under a PRODUCTION-named variable, never a PREVIEW-named one', () => {
    const env = parseJobEnv(readWorkflow());
    const keys = Object.entries(env)
      .filter(([, v]) => v === CANONICAL_NEON_PROJECT_ID)
      .map(([k]) => k);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      // hidden-mountain IS production. Naming it "the preview project" is the
      // exact inversion that made the old guard useless.
      expect(k).toMatch(/PRODUCTION/);
      expect(k).not.toMatch(/PREVIEW/);
    }
  });

  test('the STALE legacy project is declared as STALE/LEGACY — never as production', () => {
    const env = parseJobEnv(readWorkflow());
    const keys = Object.entries(env)
      .filter(([, v]) => v === STALE_LEGACY_PROJECT_ID)
      .map(([k]) => k);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).toMatch(/STALE|LEGACY/);
      expect(k).not.toMatch(/PROD/);
    }
  });

  test('the production BRANCH identity (name + id) is declared, so it can be refused deliberately', () => {
    const env = parseJobEnv(readWorkflow());
    expect(Object.values(env)).toContain(PRODUCTION_BRANCH_ID);
    const nameKeys = Object.entries(env)
      .filter(([k, v]) => v === PRODUCTION_BRANCH_NAME && /BRANCH/.test(k))
      .map(([k]) => k);
    expect(nameKeys.length).toBeGreaterThan(0);
  });

  test('declared identities agree with lib/ops/canonical-neon-target (no second source of truth)', () => {
    expect(CANONICAL_NEON_PROJECT_ID).toBe('hidden-mountain-87248164');
    expect(FORBIDDEN_NEON_PROJECT_IDS).toContain(STALE_LEGACY_PROJECT_ID);
    const src = readWorkflow();
    expect(src).toContain(CANONICAL_NEON_PROJECT_ID);
    expect(src).toContain(STALE_LEGACY_PROJECT_ID);
  });

  test('the header no longer claims this job never touches production (it runs INSIDE the production project)', () => {
    const src = readWorkflow();
    expect(src).not.toMatch(/EXCLUSIVELY on the PREVIEW Neon project/i);
    expect(src).not.toMatch(/MUST NEVER touch production/i);
    expect(src).toMatch(/CANONICAL PRODUCTION/);
  });
});

// ===========================================================================
// B. Executed guard — real bash, real exit codes.
// ===========================================================================
describe('B. guard step (executed under bash) fails closed on project identity', () => {
  const GUARD = 'Guard';
  const ok = {
    CONFIGURED_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
    PREVIEW_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
  };

  test('accepts the canonical production project + an ordinary feature branch', () => {
    const r = runStep(GUARD, { ...ok, HEAD_REF: 'fix/some-work-2026-08-20' });
    expect(r.status).toBe(0);
  });

  test('refuses the STALE legacy project', () => {
    const r = runStep(GUARD, {
      CONFIGURED_PROJECT_ID: STALE_LEGACY_PROJECT_ID,
      PREVIEW_PROJECT_ID: STALE_LEGACY_PROJECT_ID,
      HEAD_REF: 'fix/some-work',
    });
    expect(r.status).not.toBe(0);
  });

  test('refuses any project that is not the canonical production project', () => {
    const r = runStep(GUARD, {
      CONFIGURED_PROJECT_ID: 'round-recipe-12208101',
      PREVIEW_PROJECT_ID: 'round-recipe-12208101',
      HEAD_REF: 'fix/some-work',
    });
    expect(r.status).not.toBe(0);
  });

  test('refuses an unset / whitespace-only project id', () => {
    expect(
      runStep(GUARD, { CONFIGURED_PROJECT_ID: '', PREVIEW_PROJECT_ID: '', HEAD_REF: 'fix/x' })
        .status,
    ).not.toBe(0);
    expect(
      runStep(GUARD, { CONFIGURED_PROJECT_ID: '   ', PREVIEW_PROJECT_ID: '   ', HEAD_REF: 'fix/x' })
        .status,
    ).not.toBe(0);
  });

  test('tolerates a trailing newline pasted into the project id (PR #316 smoke case) — preserved', () => {
    const r = runStep(GUARD, {
      CONFIGURED_PROJECT_ID: `${CANONICAL_NEON_PROJECT_ID}\n`,
      PREVIEW_PROJECT_ID: `${CANONICAL_NEON_PROJECT_ID}\n`,
      HEAD_REF: 'fix/x',
    });
    expect(r.status).toBe(0);
  });
});

describe('B2. guard step refuses production-shaped branch refs', () => {
  const GUARD = 'Guard';
  const ok = {
    CONFIGURED_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
    PREVIEW_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
  };

  test.each(['main', 'master', 'production', 'preview/main'])(
    'refuses protected branch name %s (preserved)',
    (ref) => {
      expect(runStep(GUARD, { ...ok, HEAD_REF: ref }).status).not.toBe(0);
    },
  );

  test('refuses the PRODUCTION BRANCH ID used as a head_ref', () => {
    expect(runStep(GUARD, { ...ok, HEAD_REF: PRODUCTION_BRANCH_ID }).status).not.toBe(0);
  });

  test('refuses an empty head_ref (preserved)', () => {
    expect(runStep(GUARD, { ...ok, HEAD_REF: '' }).status).not.toBe(0);
  });

  test.each(['a..b', 'a~b', 'a^b', 'a:b', 'a\\b', 'a[b', 'a]b', 'a{b', 'a}b', 'a b'])(
    'refuses metacharacter ref %s (preserved)',
    (ref) => {
      expect(runStep(GUARD, { ...ok, HEAD_REF: ref }).status).not.toBe(0);
    },
  );
});

// ===========================================================================
// C. Executed production-refusal step — pure shell, no network, real exit codes.
// ===========================================================================
describe('C. production refusal step (executed under bash) protects main by NAME and by ID', () => {
  const SAFETY = 'Refuse production';
  const base = {
    CONFIGURED_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
    PRODUCTION_BRANCH_ID,
    PRODUCTION_BRANCH_NAME,
  };

  test('refuses by ID even when the NAME looks like an innocent preview branch', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: PRODUCTION_BRANCH_ID,
      BRANCH_NAME: 'preview/fix/whatever',
      TARGET: 'preview/fix/whatever',
    });
    expect(r.status).not.toBe(0);
    expect(r.output).not.toMatch(/proceed=true/);
  });

  test('refuses by NAME even when the ID is some other branch', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: 'br-some-other-id',
      BRANCH_NAME: PRODUCTION_BRANCH_NAME,
      TARGET: PRODUCTION_BRANCH_NAME,
    });
    expect(r.status).not.toBe(0);
    expect(r.output).not.toMatch(/proceed=true/);
  });

  test('refuses a resolved branch that does not carry the preview/ prefix', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: 'br-some-other-id',
      BRANCH_NAME: 'vercel-dev',
      TARGET: 'vercel-dev',
    });
    expect(r.status).not.toBe(0);
    expect(r.output).not.toMatch(/proceed=true/);
  });

  test('refuses when the resolved name does not exactly equal the computed target', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: 'br-some-other-id',
      BRANCH_NAME: 'preview/fix/other',
      TARGET: 'preview/fix/mine',
    });
    expect(r.status).not.toBe(0);
    expect(r.output).not.toMatch(/proceed=true/);
  });

  test('an absent branch is the ONLY tolerated no-op: exit 0, proceed=false (preserved)', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: '',
      BRANCH_NAME: '',
      TARGET: 'preview/fix/mine',
    });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/proceed=false/);
  });

  test('allows a genuine preview branch', () => {
    const r = runStep(SAFETY, {
      ...base,
      BRANCH_ID: 'br-spring-mouse-adfywa55',
      BRANCH_NAME: 'preview/fix/neon-p0-event-driven-wake-2026-08-16',
      TARGET: 'preview/fix/neon-p0-event-driven-wake-2026-08-16',
    });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/proceed=true/);
  });
});

// ===========================================================================
// D. Every pre-existing protection is still present (add, do not subtract).
// ===========================================================================
describe('D. pre-existing protections preserved', () => {
  test('fork PRs are skipped', () => {
    expect(readWorkflow()).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  test('least privilege: contents: read, and no repo checkout (PR code never runs with the Neon key)', () => {
    const code = codeOnly(readWorkflow());
    expect(code).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    // No checkout, and in fact no third-party action at all runs while the Neon
    // key is in scope. Prose about checkout in a comment is not a violation.
    expect(code).not.toMatch(/^\s*uses:\s*actions\/checkout/m);
    expect(code).not.toMatch(/^\s*-?\s*uses:\s*\S/m);
  });

  test('HTTP failures hard-fail and are never masked', () => {
    const src = readWorkflow();
    // The DIRECTIVE must be absent — prose about it in a comment is not a violation.
    expect(codeOnly(src)).not.toMatch(/^\s*continue-on-error\s*:/m);
    expect(src).toMatch(/list-branches returned HTTP/);
    expect(src).toMatch(/not masking/i);
  });

  test('a missing preview API key hard-fails instead of silently no-opping', () => {
    expect(readWorkflow()).toMatch(/NEON_PREVIEW_API_KEY is not set/);
  });

  test('secrets are never traced or printed', () => {
    const code = codeOnly(readWorkflow());
    expect(code).not.toMatch(/set\s+-[a-z]*x/);
    expect(code).not.toMatch(/curl[^\n]*\s(--verbose|-[A-Za-z]*v[A-Za-z]*)(\s|$)/);
    expect(code).not.toMatch(/echo[^\n]*\$\{?KEY/);
    expect(code).not.toMatch(/echo[^\n]*\$\{?NEON_API_KEY/);
  });

  test('the branch selector still excludes primary and protected, AND now excludes production by id and name', () => {
    const src = readWorkflow();
    expect(src).toMatch(/\.primary\s*==\s*false/);
    expect(src).toMatch(/\.protected\s*==\s*false/);
    expect(src).toMatch(/\.id\s*!=\s*\$prod_id/);
    expect(src).toMatch(/\.name\s*!=\s*\$prod_name/);
    expect(src).toMatch(/startswith\("preview\/"\)/);
  });

  test('the job verifies it is really in the expected project using LIVE data, not just a string compare', () => {
    const src = readWorkflow();
    expect(src).toMatch(/PRODUCTION_BRANCH_ID/);
    expect(src).toMatch(/not the expected project/i);
  });
});

// ===========================================================================
// E. The ownership doc that describes THIS workflow must not repeat the inversion.
// ===========================================================================
describe('E. NEON-VERCEL-OWNERSHIP-MAP does not label hidden-mountain "the PREVIEW project"', () => {
  test('the NEON_PREVIEW_* rows describe hidden-mountain as production-hosting, not as a separate preview project', () => {
    const doc = fs
      .readFileSync(path.join(ROOT, 'docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md'), 'utf8')
      .replace(/\r\n/g, '\n');
    const rows = doc.split('\n').filter((l) => /NEON_PREVIEW_(PROJECT_ID|API_KEY)/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toMatch(/the PREVIEW project/);
      expect(row).not.toMatch(/production-pointing/);
    }
  });
});
