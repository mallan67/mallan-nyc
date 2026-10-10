/**
 * Release Truth waits for the other required checks before it audits a pull request, and it has to wait
 * as long as the slowest of them takes.
 *
 * It did not. The step "Wait for PR release dependencies to settle" asked 60 times with a 10 second sleep
 * (about 12 minutes) while pr-check ran 18.0 to 23.9 minutes (11 of the last 12 heads of PR #647), so
 * Release Truth expired and posted a failure status on the first run of every push, and turned green only
 * when someone re-ran it after pr-check had finished. The pins in release-safety-release-truth.test.ts
 * held the old spelling ("seq 1 60", "sleep 10") and could not tell a wait that is long enough from one
 * that is not. These tests read the numbers out of the shipped workflow and compare them with the measured
 * run time of the check the wait exists for.
 *
 * They also pin what the wait must keep: it still fails when a required check fails or never settles, and
 * it audits the commit of its own run. scripts/validate-release-status.js answers for the PR head as it is
 * when it asks unless it is given --sha, so without the pin a newer push would change what an older run is
 * waiting for.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
const read = (rel: string): string => normalize(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const workflow = read('.github/workflows/release-truth.yml');
const validator = read('scripts/validate-release-status.js');

// pr-check, job start to job end, on PR #647 (2026-10-09/10): 18.0 to 23.9 minutes on 11 of the last 12 heads.
const SLOWEST_PR_CHECK_MINUTES = 24;
// One attempt is the sleep plus one validator run; the log of the run for 8e6a21c6 shows 12.2 seconds per
// attempt with a 10 second sleep.
const VALIDATOR_SECONDS_PER_ATTEMPT = 2.2;
// The wait must be bounded: a wait that never ends is a check that never reports.
const LONGEST_ACCEPTABLE_WAIT_MINUTES = 75;

function waitStep(): string {
  const start = workflow.indexOf('- name: Wait for PR release dependencies to settle');
  if (start < 0) throw new Error('the wait step is missing from .github/workflows/release-truth.yml');
  const next = workflow.indexOf('\n      - name:', start + 1);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, next);
}

function waitNumbers(): { attempts: number; sleepSeconds: number; ceilingMinutes: number; waitMinutes: number } {
  const step = waitStep();
  const attempts = Number(/seq 1 (\d+)/.exec(step)?.[1]);
  const sleepSeconds = Number(/DEPLOY_PENDING\|DEPLOY_UNKNOWN\) sleep (\d+)/.exec(step)?.[1]);
  const ceilingMinutes = Number(/^\s+timeout-minutes: (\d+)\s*$/m.exec(workflow)?.[1]);
  const waitMinutes = (attempts * (sleepSeconds + VALIDATOR_SECONDS_PER_ATTEMPT)) / 60;
  return { attempts, sleepSeconds, ceilingMinutes, waitMinutes };
}

describe('Release Truth: the PR dependency wait outlasts the check it waits for', () => {
  test('the attempts, the sleep and the job ceiling can be read from the workflow', () => {
    const n = waitNumbers();
    expect(Number.isInteger(n.attempts) && n.attempts > 0).toBe(true);
    expect(Number.isInteger(n.sleepSeconds) && n.sleepSeconds > 0).toBe(true);
    expect(Number.isInteger(n.ceilingMinutes) && n.ceilingMinutes > 0).toBe(true);
  });

  test('the wait is at least 1.5 times the slowest pr-check seen, so a slow run does not expire it', () => {
    const { waitMinutes } = waitNumbers();
    expect(waitMinutes).toBeGreaterThanOrEqual(SLOWEST_PR_CHECK_MINUTES * 1.5);
  });

  test('the job ceiling does not cut the wait off (it left the wait at 12 minutes under a 22 minute ceiling before)', () => {
    const { waitMinutes, ceilingMinutes } = waitNumbers();
    expect(ceilingMinutes).toBeGreaterThanOrEqual(waitMinutes + 5);
  });

  test('the wait is still bounded', () => {
    const { waitMinutes, ceilingMinutes } = waitNumbers();
    expect(waitMinutes).toBeLessThanOrEqual(LONGEST_ACCEPTABLE_WAIT_MINUTES);
    expect(ceilingMinutes).toBeLessThanOrEqual(90);
  });
});

describe('Release Truth: the longer wait keeps failing when it should', () => {
  test('a required check that fails ends the wait at once: the validator exits 1 on DEPLOY_FAIL and the step runs under set -e', () => {
    const step = waitStep();
    expect(step).toContain('set -euo pipefail');
    expect(step).toMatch(/DEPLOY_PREVIEW\|DEPLOY_FAIL\) break/);
    expect(validator).toMatch(/DEPLOY_FAIL:\s*1\b/);
  });

  test('an unknown verdict from the validator fails the step instead of being waited on', () => {
    expect(waitStep()).toContain('Unexpected deploy validator verdict');
  });

  test('a wait that expires fails the job and posts a failure status on the audited commit, never a success', () => {
    const step = waitStep();
    expect(step).toMatch(/if \[ "\$final" = "DEPLOY_PENDING" \] \|\| \[ "\$final" = "DEPLOY_UNKNOWN" \]; then/);
    expect(step).toContain('-f state=failure');
    expect(step).not.toMatch(/-f state=success/);
    // the context the aggregator's status step and the PR page use, exactly (not a longer name that starts with it)
    expect(step).toMatch(/-f context=release-truth(?![\w-])/);
    expect(step).toContain('statuses/${{ steps.target.outputs.sha }}');
    expect(step).toContain('dependency wait expired; exact-head proof incomplete');
    expect(step).toMatch(/\n\s+exit 1\n/);
  });
});

describe('Release Truth: the wait audits the commit of its own run', () => {
  test('the step is given the commit under audit and passes it to the validator together with --pr', () => {
    const step = waitStep();
    expect(step).toContain('TARGET_SHA: ${{ steps.target.outputs.sha }}');
    expect(step).toContain('validate-release-status.js --sha "$TARGET_SHA" --pr "$PR_NUMBER" --json');
  });

  // The shipped resolveSha is lifted out of the script and run against a stub of gh, the way
  // release-safety-ruleset-discovery.test.ts runs the ruleset functions.
  function loadResolveSha(
    sha: string | null,
    prNum: string | null,
    gh: (command: string) => string | null,
    git: (command: string) => string | null,
  ): () => string {
    const start = validator.indexOf('function resolveSha() {');
    const end = validator.indexOf('function resolveRepo() {');
    if (start < 0 || end < 0 || end <= start) {
      throw new Error('resolveSha not found in scripts/validate-release-status.js');
    }
    // eslint-disable-next-line no-new-func
    return new Function('sha', 'prNum', 'gh', 'git', validator.slice(start, end) + '\nreturn resolveSha;')(
      sha,
      prNum,
      gh,
      git,
    ) as () => string;
  }

  const AUDITED = 'a'.repeat(40);
  const NEWER_HEAD = 'b'.repeat(40);

  test('--sha with --pr audits the commit it was given and never asks GitHub for the PR head', () => {
    const asked: string[] = [];
    const resolve = loadResolveSha(
      AUDITED,
      '647',
      (command) => {
        asked.push(command);
        return JSON.stringify({ headRefOid: NEWER_HEAD });
      },
      () => null,
    );
    expect(resolve()).toBe(AUDITED);
    expect(asked).toEqual([]);
  });

  test('--pr alone audits whatever the PR head is when it asks, which is why the workflow must pass --sha', () => {
    const asked: string[] = [];
    const resolve = loadResolveSha(
      null,
      '647',
      (command) => {
        asked.push(command);
        return JSON.stringify({ headRefOid: NEWER_HEAD });
      },
      () => null,
    );
    expect(resolve()).toBe(NEWER_HEAD);
    expect(asked).toEqual(['pr view 647 --json headRefOid']);
  });

  test('--sha with --pr keeps the preview cap, so a pull request can still never reach DEPLOY_PASS', () => {
    expect(validator).toContain("verdict = prNum ? 'DEPLOY_PREVIEW' : 'DEPLOY_PASS'");
  });
});
