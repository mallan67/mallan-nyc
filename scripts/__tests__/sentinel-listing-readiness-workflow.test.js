const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'sentinel-listing-readiness.yml',
);

describe('sentinel-listing-readiness.yml - platform actionable scanner', () => {
  let doc;
  let steps;

  beforeAll(() => {
    doc = yaml.load(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
    steps = doc.jobs.scan.steps;
  });

  test('uses the deterministic Sentinel-L scanner, not Claude narrative audit', () => {
    expect(doc.name).toBe('Sentinel-L - Platform Actionable Error Scanner');
    expect(doc.jobs.scan).toBeDefined();
    expect(JSON.stringify(doc)).not.toMatch(/anthropics\/claude-code-action/);
    expect(JSON.stringify(doc)).not.toMatch(/Final verdict:\s*YELLOW/);
    expect(JSON.stringify(doc)).not.toMatch(/LIMITED\s+/);

    const scannerStep = steps.find((step) => step.name === 'Run Sentinel-L actionable scanner');
    expect(scannerStep).toBeDefined();
    expect(scannerStep.run).toMatch(/npm run sentinel:l/);
  });

  test('PR comments stay disabled (anti-spam) and the summary is top-5 P0/P1 only', () => {
    const buildSummary = steps.find(
      (step) => step.name === 'Build short actionable summary (top 5 P0/P1)',
    );
    const postComment = steps.find(
      (step) => step.name === 'Post actionable PR comment (disabled — anti-spam per PR 266)',
    );
    const failStep = steps.find((step) => step.name === 'Fail on actionable errors');

    // Summary is built only when there are findings.
    expect(buildSummary).toBeDefined();
    expect(buildSummary.if).toBe("steps.scanner.outputs.count != '0'");
    expect(failStep.if).toBe("steps.scanner.outputs.count != '0'");

    // PR-comment posting is hard-disabled (if: false) to prevent mailbox spam
    // per PR #266. The step is preserved for a one-line re-enable flip.
    expect(postComment).toBeDefined();
    expect(postComment.if === false || postComment.if === '${{ false }}').toBe(true);

    // The summary is trimmed to TOP-5 P0/P1 only — no green/yellow essays,
    // no P2/P3 noise, no "found N" narrative.
    expect(buildSummary.run).toMatch(/P0\/P1/);
    expect(buildSummary.run).toMatch(/severity === 'P0' \|\| e\.severity === 'P1'/);
    expect(buildSummary.run).toMatch(/\.slice\(0, 5\)/);
    expect(buildSummary.run).not.toMatch(/errors\.slice\(0, 10\)/);
    expect(buildSummary.run).toMatch(/GITHUB_STEP_SUMMARY/);

    // The disabled post step must still target the trimmed comment file, never
    // a long narrative report.
    expect(postComment.run).toMatch(/gh pr comment/);
    expect(postComment.run).toMatch(/sentinel-l-comment\.md/);
  });

  test('hot trigger surfaces include full platform listing/search/CRM paths', () => {
    const paths = doc.on.pull_request.paths;
    expect(paths).toContain('public/crm/**');
    expect(paths).toContain('app/api/listings/**');
    expect(paths).toContain('app/api/buildings/**');
    expect(paths).toContain('app/api/crm/**');
    expect(paths).toContain('app/api/email/**');
    expect(paths).toContain('app/api/reports/**');
    expect(paths).toContain('lib/search/**');
    expect(paths).toContain('lib/idx/**');
    expect(paths).toContain('lib/crm/**');
    expect(paths).toContain('lib/media/**');
    expect(paths).toContain('lib/compliance/**');
    expect(paths).toContain('lib/address/**');
    expect(paths).toContain('lib/email/**');
    expect(paths).toContain('lib/reports/**');
    expect(paths).toContain('lib/market-report/**');
    expect(paths).toContain('lib/cma/**');
    expect(paths).toContain('tools/sentinel-l/**');
  });

  test('uploads JSON/Markdown artifacts and fails the check on scanner errors', () => {
    const artifactStep = steps.find((step) => step.name === 'Upload Sentinel-L artifacts');
    const failStep = steps.find((step) => step.name === 'Fail on actionable errors');

    expect(artifactStep.uses).toBe('actions/upload-artifact@v4');
    expect(artifactStep.with.path).toBe('ops/audit/sentinel-l/*-errors.*');
    expect(failStep.run).toMatch(/exit 1/);
  });
});
