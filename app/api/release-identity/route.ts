// GET /api/release-identity
//
// PUBLIC, deployment-bound identity proof — exposes ONLY non-secret Vercel
// system values so CI (release-truth.yml) can verify WHICH commit + deployment
// is currently serving THIS host, with NO Vercel API token. Read-only; no
// secrets, no DB, no PII.
//
//   commitSha    ← VERCEL_GIT_COMMIT_SHA   (the git SHA this deployment built from)
//   deploymentId ← VERCEL_DEPLOYMENT_ID    (the dpl_… id — smoke evidence binds to it)
//   targetEnv    ← VERCEL_TARGET_ENV        ('production' | 'preview')
//
// FAIL-CLOSED: the values are not merely required to EXIST, they are shape-
// validated. If the system env vars are unexposed (Vercel project setting
// "Automatically expose System Environment Variables" disabled, or running
// off-Vercel) or malformed, this returns 503 — the verifier then treats the
// alias as UNPROVEN rather than assuming ok.
//
// DYNAMIC + revalidate 0 + no-store: the proof MUST reflect the deployment
// serving THIS request. A cached response could report an older deployment's
// identity and let an alias-switch race publish a false proof — never cache it.
//
// Deliberately NOT exposed: VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL — those
// are present on PREVIEW deployments too, so they are not production identity.
// Production is asserted ONLY via VERCEL_TARGET_ENV === 'production', which the
// verifier requires when it probes the production alias (mallan.nyc).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Shape guards — a present-but-malformed value is as untrustworthy as an absent
// one, so validate rather than merely existence-check.
const SHA_RE = /^[0-9a-f]{40}$/i;
const DEPLOYMENT_RE = /^dpl_[A-Za-z0-9]+$/;

export async function GET() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || null;
  const targetEnv = process.env.VERCEL_TARGET_ENV || null;

  const headers = {
    // Never cache — always reflect the deployment serving this request.
    "Cache-Control": "no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
  };

  const shaOk = !!commitSha && SHA_RE.test(commitSha);
  const deploymentOk = !!deploymentId && DEPLOYMENT_RE.test(deploymentId);
  const targetOk = targetEnv === "production" || targetEnv === "preview";

  // Fail closed: identity cannot be proven without a valid SHA + deployment id
  // + a known environment. 503 (not 200) so the verifier never reads a partial
  // or malformed proof.
  if (!shaOk || !deploymentOk || !targetOk) {
    return NextResponse.json(
      {
        error: "release identity unavailable or malformed",
        commitSha,
        deploymentId,
        targetEnv,
        hint: 'requires the Vercel project setting "Automatically expose System Environment Variables"',
      },
      { status: 503, headers },
    );
  }

  return NextResponse.json({ commitSha, deploymentId, targetEnv }, { headers });
}
