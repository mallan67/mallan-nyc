// GET /api/diag/oidc — DIAGNOSTIC ONLY, lives and dies with diag/neon-preview-provision-2026-09-17.
// Never merge to main or to the implementation branch.
//
// WHY THIS IS THE SECOND VERSION. The first probe checked only process.env.VERCEL_OIDC_TOKEN, found
// it absent, and I concluded the project had no deployment OIDC. That was an overreach: Vercel's
// Functions API documents getVercelOidcToken() as retrieving the token "from the request context OR
// the environment variable", so the environment variable is ONE access path of two and its absence
// cannot establish the capability's absence. Testing one path and concluding about the capability is
// precisely the inference this project keeps having to retract.
//
// WHAT THIS MEASURES, as three independent signals:
//   1. process.env.VERCEL_OIDC_TOKEN                    - the path already measured
//   2. await getVercelOidcToken()                        - the SUPPORTED platform path
//   3. request header NAMES and OIDC-ish env var NAMES   - a dependency-free cross-check, in case
//      the platform supplies the token by a channel neither of the above exposes
//
// Signal 3 exists because signals 1 and 2 are both "ask the API"; if both say absent, an
// enumeration of what the platform actually delivered distinguishes "not supplied" from
// "supplied by a channel we did not ask about".
//
// It never returns, logs, or derives anything from a token value, and it contacts no database.
// Only the non-secret claims the owner authorised are reported.
import { NextResponse } from "next/server";
import { getVercelOidcToken } from "@vercel/oidc";
import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from "jose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Json = Record<string, unknown>;

/** Names only. A value is never read, so this cannot leak a secret. */
function envNamesMatching(re: RegExp): string[] {
  return Object.keys(process.env).filter((k) => re.test(k)).sort();
}

export async function GET(req: Request) {
  // ── Signal 1: the environment variable.
  const envToken = process.env.VERCEL_OIDC_TOKEN;

  // ── Signal 2: the supported retrieval API. A throw is Case C and is reported as itself,
  //    never reinterpreted as absence.
  let helperToken: string | undefined;
  let helperError: Json | null = null;
  try {
    helperToken = await getVercelOidcToken();
  } catch (err) {
    helperError = {
      class: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // ── Signal 3: what the platform actually delivered. NAMES ONLY.
  const headerNames = [...req.headers.keys()].sort();
  const signal3: Json = {
    oidc_ish_env_var_names: envNamesMatching(/OIDC/i),
    vercel_env_var_names: envNamesMatching(/^VERCEL_/),
    oidc_ish_header_names: headerNames.filter((h) => /oidc|identity|token/i.test(h)),
    total_header_count: headerNames.length,
  };

  const token = helperToken ?? envToken;
  const base: Json = {
    context: "preview-runtime",
    probe_version: 2,
    measured_at: new Date().toISOString(),
    // Reported for comparison only. VERCEL_ENV is a mutable string, never attestation.
    vercel_env_hint: process.env.VERCEL_ENV ?? null,
    node_env_hint: process.env.NODE_ENV ?? null,
    signal_1_env_token_present: Boolean(envToken),
    signal_2_helper_token_present: Boolean(helperToken),
    signal_2_helper_error: helperError,
    signal_3_platform_surface: signal3,
  };

  if (!token) {
    return NextResponse.json(
      {
        ...base,
        case: helperError ? "C — helper errored; absence NOT established" : "B — both paths absent",
        conclusion: helperError
          ? "getVercelOidcToken() threw; this is not evidence of token absence"
          : "neither process.env nor the supported helper yielded a token in this runtime",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── A token exists. Verify it the documented way: jose against the issuer's JWKS.
  //    The issuer comes from the token's own unverified payload only in order to LOCATE the JWKS;
  //    jwtVerify then enforces it. aud and sub are REPORTED rather than asserted, because the
  //    expected team slug and project name are exactly what this probe exists to discover.
  let claims: Json | null = null;
  let header: Json | null = null;
  let verification: Json;
  try {
    claims = decodeJwt(token) as Json;
    header = decodeProtectedHeader(token) as unknown as Json;
  } catch (err) {
    return NextResponse.json(
      { ...base, case: "A — token present but undecodable", decode_error: String(err) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const iss = typeof claims.iss === "string" ? claims.iss : null;
  if (!iss) {
    verification = { attempted: false, reason: "no iss claim — cannot locate JWKS" };
  } else {
    const jwksUrl = new URL("/.well-known/jwks", iss).toString();
    try {
      const JWKS = createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(token, JWKS, { issuer: iss });
      verification = {
        attempted: true,
        jwksUrl,
        signature_verified: true,
        issuer_enforced: iss,
        payload_matches_decoded: payload.sub === claims.sub,
      };
    } catch (err) {
      // Distinguish an INVALID token from an UNREACHABLE verifier. Collapsing the two is how a
      // verification gate becomes a rubber stamp, so the error class is reported verbatim.
      verification = {
        attempted: true,
        jwksUrl,
        signature_verified: false,
        error_class: err instanceof Error ? err.constructor.name : typeof err,
        error_message: err instanceof Error ? err.message : String(err),
        note: "an unreachable JWKS and an invalid signature are different outcomes; read error_class",
      };
    }
  }

  return NextResponse.json(
    {
      ...base,
      case:
        Boolean(helperToken) && !envToken
          ? "A — helper yields a token the environment variable does not expose"
          : "token available",
      token_source: helperToken ? "getVercelOidcToken()" : "process.env",
      alg: header?.alg ?? null,
      kid: header?.kid ?? null,
      claims: {
        iss,
        aud: claims.aud ?? null,
        sub: claims.sub ?? null,
        owner: claims.owner ?? null,
        owner_id: claims.owner_id ?? null,
        project: claims.project ?? null,
        project_id: claims.project_id ?? null,
        environment: claims.environment ?? null,
        iat: claims.iat ?? null,
        nbf: claims.nbf ?? null,
        exp: claims.exp ?? null,
        lifetime_seconds:
          typeof claims.exp === "number" && typeof claims.iat === "number"
            ? claims.exp - claims.iat
            : null,
      },
      // The fact the authority rule needs and that cannot be guessed from project settings.
      issuer_mode: iss
        ? new URL(iss).pathname.replace(/\/$/, "") === ""
          ? "global"
          : "team-scoped"
        : null,
      verification,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
