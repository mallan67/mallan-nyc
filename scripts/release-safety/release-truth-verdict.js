#!/usr/bin/env node
/**
 * Release-safety P2 — control 5: Release-Truth verdict core (pure, testable).
 *
 * Extracted from scripts/release-truth-check.js so the verdict semantics are
 * unit-testable without spawning the validator chain.
 *
 * HARDENING vs the pre-P2 aggregator (the defect that let the PR #523
 * revert look "shippable" while production still served the broken build):
 *
 *   BEFORE: deploy verdict DEPLOY_PENDING / DEPLOY_UNKNOWN => CODE_VALID,
 *           exit 0 ("clean enough to ship").
 *   AFTER:  a deploy target that cannot be PROVEN deployed => UNVERIFIED.
 *           CODE_VALID remains ONLY for runs with no deploy target at all
 *           (an honestly static-only claim).
 *
 *   NEW:    --require-deploy-proof mode — exit 0 ONLY on PROD_PROVEN;
 *           every unproven verdict exits nonzero. OFF by default (wired but
 *           not enabled in CI until Maya turns the repo variable on).
 */

/**
 * Identity binding between the production-alias deploy proof and the smoke
 * evidence. PROD_PROVEN requires the smoke to have targeted the SAME
 * deployment: matching SHA, matching deployment id, a base_url whose
 * hostname is the proven alias host, an observation timestamp, and all
 * required listing probes present and successful (the open-houses probe
 * stays HTTP/JSON-CONTRACT-PROVEN only and is covered by `passed`).
 * Returns a list of mismatch descriptions (empty = fully bound).
 */
function smokeIdentityMismatches(proof, smoke) {
  const mismatches = [];
  const proofSha = (proof.deployed_sha || '').toLowerCase();
  const smokeSha = (smoke.expected_sha || '').toLowerCase();
  if (!proofSha || !smokeSha || proofSha !== smokeSha) {
    mismatches.push(`smoke sha '${smoke.expected_sha || 'none'}' does not equal the proven deployed sha '${proof.deployed_sha || 'none'}'`);
  }
  if (!proof.deployment_id || !smoke.deployment_id || proof.deployment_id !== smoke.deployment_id) {
    mismatches.push(`smoke deployment '${smoke.deployment_id || 'none'}' does not equal the proven deployment '${proof.deployment_id || 'none'}'`);
  }
  let smokeHost = null;
  try {
    smokeHost = new URL(smoke.base_url).hostname.toLowerCase();
  } catch {
    smokeHost = null;
  }
  if (!proof.alias_host || !smokeHost || smokeHost !== proof.alias_host.toLowerCase()) {
    mismatches.push(`smoke base_url host '${smokeHost || 'none'}' is not the proven alias host '${proof.alias_host || 'none'}'`);
  }
  if (!smoke.observed_at) {
    mismatches.push('smoke evidence has no observed_at timestamp');
  }
  if (smoke.required_probes_ok !== true) {
    mismatches.push('required listing probes (discovery, canonical-detail, id-alias, similar-api) are not all present and successful');
  }
  return mismatches;
}


/**
 * Evaluate one GitHub required-check specification against current Check Runs
 * and legacy Commit Statuses.
 *
 * If a ruleset pins integration_id, only a Check Run emitted by that exact
 * GitHub App id can satisfy the requirement. A same-named legacy status has no
 * app identity and therefore cannot substitute for an integration-bound check.
 *
 * Without an integration binding, current check-run + legacy-status evidence is
 * evaluated conservatively: any present pending/failing source prevents success.
 */
function evaluateRequiredCheckRequirement(requirement, checkRuns, statuses) {
  const context = requirement?.context;
  const integrationId = Number.isInteger(requirement?.integration_id)
    ? requirement.integration_id
    : null;

  const candidates = (checkRuns || []).filter((c) => c?.name === context);
  const eligibleRuns = integrationId === null
    ? candidates
    : candidates.filter((c) => c?.appId === integrationId);

  // FAIL CLOSED BEFORE ORDERING. GitHub can return a queued rerun carrying neither
  // started_at nor completed_at. Any comparator gives such a run timestamp 0, so it
  // sorts behind an older completed success and the requirement reads as satisfied
  // while the rerun is still pending. The presence of ANY incomplete eligible run is
  // therefore pending on its own, whatever the ordering decides.
  const incompleteRuns = eligibleRuns.filter((c) => c?.status !== 'completed');

  const cr = eligibleRuns
    .slice()
    .sort((a, b) => {
      const at = Date.parse(a?.createdAt || a?.startedAt || a?.completedAt || '') || 0;
      const bt = Date.parse(b?.createdAt || b?.startedAt || b?.completedAt || '') || 0;
      if (bt !== at) return bt - at;
      // Equal or absent timestamps: GitHub check-run ids increase monotonically.
      return (b?.id || 0) - (a?.id || 0);
    })[0] || null;

  // Legacy Statuses cannot prove a GitHub App integration binding.
  const statusContext = integrationId === null
    ? (statuses || []).find((s) => s?.context === context) || null
    : null;

  if (!cr && !statusContext) {
    return {
      record: {
        name: context,
        integration_id: integrationId,
        present: false,
        state: 'absent',
      },
      pending: true,
      failure: null,
    };
  }

  const sources = [];
  let pending = false;
  let failure = null;

  if (incompleteRuns.length > 0) {
    pending = true;
  }

  if (cr) {
    const crState = cr.status === 'completed' ? cr.conclusion : cr.status;
    sources.push({
      source: 'check-run',
      state: crState,
      url: cr.url,
      app_id: cr.appId ?? null,
    });
    if (cr.status !== 'completed') {
      pending = true;
    } else if (!['success', 'neutral', 'skipped'].includes(cr.conclusion)) {
      failure = { detail: `check-run conclusion=${cr.conclusion}`, url: cr.url };
    }
  }

  if (statusContext) {
    sources.push({
      source: 'commit-status',
      state: statusContext.state,
      url: statusContext.target_url,
    });
    if (statusContext.state === 'pending') {
      pending = true;
    } else if (statusContext.state !== 'success') {
      failure = {
        detail: `commit-status state=${statusContext.state}`,
        url: statusContext.target_url,
      };
    }
  }

  return {
    record: {
      name: context,
      integration_id: integrationId,
      present: true,
      state: failure ? 'failure' : pending ? 'pending' : 'success',
      sources,
    },
    pending: !failure && pending,
    failure,
  };
}

/** Aggregate validator layers into a single verdict. Pure function. */
function aggregate(layers) {
  const reasons = [];

  // REGRESSION first — anything that was passing and broke
  if ((layers.ucba?.regressions || 0) > 0) {
    return { verdict: 'REGRESSION', reasons: [`UCBA regression count: ${layers.ucba.regressions}`] };
  }

  // DEPLOY_INVALID — merge or PR with failed deploy
  if (layers.deploy?.verdict === 'DEPLOY_FAIL') {
    return { verdict: 'DEPLOY_INVALID', reasons: ['deploy validator reports DEPLOY_FAIL'] };
  }

  // CLAIM_OVERSTATED — UCBA reports overstatement OR claim verifier flags it
  if ((layers.ucba?.claim_overstated || 0) > 0) {
    reasons.push(`UCBA claim_overstated count: ${layers.ucba.claim_overstated}`);
    return { verdict: 'CLAIM_OVERSTATED', reasons };
  }
  if (layers.claim?.verdict === 'CLAIM_OVERSTATED') {
    return { verdict: 'CLAIM_OVERSTATED', reasons: layers.claim.reasons || ['PR claim verifier flagged overstatement'] };
  }

  // PARTIAL — workflow blocking failures, UCBA blocking failures, or migration FAIL
  if ((layers.workflows?.blocking_failures || 0) > 0) {
    reasons.push(`workflow blocking failures: ${layers.workflows.blocking_failures}`);
  }
  if ((layers.ucba?.blocking_failures || 0) > 0) {
    reasons.push(`UCBA blocking failures: ${layers.ucba.blocking_failures}`);
  }
  if ((layers.migration?.summary?.fail || 0) > 0) {
    reasons.push(`migration discipline FAIL: ${layers.migration.summary.fail}`);
  }
  if (reasons.length > 0) {
    return { verdict: 'PARTIAL', reasons };
  }

  // Live-site failures block PROD_PROVEN even when deploy passed
  if ((layers.live_site?.summary?.fail || 0) > 0) {
    return { verdict: 'PARTIAL', reasons: [`live-site failures: ${layers.live_site.summary.fail}`] };
  }

  // Failed smoke evidence blocks everything downstream
  if (layers.smoke && layers.smoke.passed === false) {
    return { verdict: 'PARTIAL', reasons: [`listing smoke failed: ${layers.smoke.reason || 'see smoke evidence'}`] };
  }

  // PROD_PROVEN — ONLY production-alias proof (verify-deployment-sha MATCH on
  // mallan.nyc) PLUS successful runtime smoke evidence BOUND TO THAT EXACT
  // DEPLOYMENT. Nothing else reaches PROD_PROVEN — green CI checks, preview
  // deployments, and smoke evidence from a different deployment never do.
  if (layers.deploy?.verdict === 'DEPLOY_PROD_PROVEN') {
    if (layers.smoke?.passed !== true) {
      return {
        verdict: 'UNVERIFIED',
        reasons: ['production alias proof present but runtime smoke evidence missing — fail-closed'],
      };
    }
    const mismatches = smokeIdentityMismatches(layers.deploy, layers.smoke);
    if (mismatches.length > 0) {
      return {
        verdict: 'UNVERIFIED',
        reasons: mismatches.map((m) => `smoke evidence identity mismatch: ${m}`),
      };
    }
    return {
      verdict: 'PROD_PROVEN',
      reasons: [
        `production alias serves the expected SHA (deployment ${layers.deploy.deployment_id}) + listing smoke bound to that exact deployment passed`,
      ],
    };
  }

  // PREVIEW_PROVEN — a PR target whose checks + preview deployment are green.
  // Explicitly NOT production proof (P2: Preview readiness was previously
  // conflated with deployment proof).
  if (layers.deploy?.verdict === 'DEPLOY_PREVIEW') {
    return { verdict: 'PREVIEW_PROVEN', reasons: ['PR checks + preview deployment green — production NOT proven'] };
  }

  // DEPLOY_PASS (checks-green on a push/sha target, but no production-alias
  // proof): fail-closed to UNVERIFIED — green checks are not production.
  if (layers.deploy?.verdict === 'DEPLOY_PASS') {
    return {
      verdict: 'UNVERIFIED',
      reasons: ['CI checks green but production-alias proof missing (was PROD_PROVEN before P2 — fail-closed now)'],
    };
  }

  // P2 HARDENING (fail-closed): a deploy target whose runtime proof is
  // pending/unknown is UNVERIFIED — never "CODE_VALID / clean enough to ship".
  if (layers.deploy?.verdict === 'DEPLOY_PENDING' || layers.deploy?.verdict === 'DEPLOY_UNKNOWN') {
    return {
      verdict: 'UNVERIFIED',
      reasons: [`deploy ${layers.deploy.verdict.toLowerCase()} — runtime proof missing (fail-closed; was CODE_VALID before P2)`],
    };
  }

  // CODE_VALID — static layers clean AND no deploy target was requested
  if (!layers.deploy) {
    return { verdict: 'CODE_VALID', reasons: ['no deploy target specified — code valid by static layers only'] };
  }

  return { verdict: 'UNVERIFIED', reasons: [`deploy verdict unrecognized (${layers.deploy?.verdict}) — fail-closed`] };
}

/**
 * Map the final verdict to an exit code.
 * Default mode preserves the historical contract (CODE_VALID/PROD_PROVEN=0,
 * UNVERIFIED=0 unless --strict). --require-deploy-proof makes every verdict
 * except PROD_PROVEN nonzero.
 */
function decideExitCode(verdict, { strict = false, requireDeployProof = false } = {}) {
  if (requireDeployProof) {
    switch (verdict) {
      case 'PROD_PROVEN':
        return 0;
      case 'REGRESSION':
      case 'DEPLOY_INVALID':
        return 1;
      case 'PARTIAL':
        return 2;
      case 'CLAIM_OVERSTATED':
        return 3;
      default:
        // UNVERIFIED, CODE_VALID, PREVIEW_PROVEN (not production), anything new
        return 4;
    }
  }
  switch (verdict) {
    case 'REGRESSION':
    case 'DEPLOY_INVALID':
      return 1;
    case 'PARTIAL':
      return 2;
    case 'CLAIM_OVERSTATED':
      return 3;
    case 'UNVERIFIED':
      return strict ? 4 : 0;
    default:
      return 0; // PROD_PROVEN, PREVIEW_PROVEN, CODE_VALID — advisory-clean
  }
}

module.exports = { aggregate, decideExitCode, smokeIdentityMismatches, evaluateRequiredCheckRequirement };
