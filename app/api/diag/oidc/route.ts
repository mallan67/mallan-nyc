// GET /api/diag/oidc — DIAGNOSTIC ONLY. Lives on diag/neon-preview-provision-2026-09-17 and is
// deleted with that branch. Never merge this to main or to the implementation branch.
//
// PURPOSE. Measure the Vercel OIDC contract a Preview RUNTIME actually receives, so the database
// authority design rests on the real issuer mode and claim shape rather than on a guess.
//
// WHAT IT NEVER DOES. It never returns, logs, or derives anything from the token value, and it
// never touches a database. Only the non-secret claims the owner authorised are reported:
// present / verified / iss / aud / sub / owner / owner_id / project / project_id / environment /
// iat / exp. The signature itself is never echoed.
//
// WHY NO `jose`. Adding a dependency means a package.json plus lockfile change, and Vercel builds
// with `npm ci` — a lockfile mismatch fails the build. Node imports JWK keys natively and verifies
// RS256 directly, so verification here is standards-compliant with zero dependencies. The PRODUCT
// implementation should still use `jose`; this is a throwaway measurement.
import { NextResponse } from "next/server";
import { createPublicKey, verify as cryptoVerify } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Claims = Record<string, unknown>;

function b64urlToBuf(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Decode header+payload WITHOUT trusting them. Decoding is not verification. */
function decode(token: string): { header: Claims; payload: Claims } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64urlToBuf(parts[0]).toString("utf8")) as Claims,
      payload: JSON.parse(b64urlToBuf(parts[1]).toString("utf8")) as Claims,
    };
  } catch {
    return null;
  }
}

/**
 * Verify the RS256 signature against the issuer's published JWKS.
 *
 * Reports the JWKS URL and the outcome separately, because the authority design has to know
 * whether an unreachable JWKS is distinguishable from an invalid signature. Those must never
 * collapse into one verdict: an invalid token is a refusal, an unreachable verifier is an
 * indeterminate result, and treating the second as the first (or worse, as a pass) is how a
 * verification gate turns into a rubber stamp.
 */
async function verifySignature(token: string, iss: string, kid: string) {
  const jwksUrl = new URL("/.well-known/jwks", iss).toString();
  const started = Date.now();
  try {
    const res = await fetch(jwksUrl, { cache: "no-store" });
    if (!res.ok) {
      return { jwksUrl, jwks_fetch: `HTTP ${res.status}`, verified: null as boolean | null, ms: Date.now() - started };
    }
    const jwks = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    const jwk = (jwks.keys ?? []).find((k) => k.kid === kid);
    if (!jwk) {
      return { jwksUrl, jwks_fetch: "ok", key_for_kid: false, verified: false, ms: Date.now() - started };
    }
    const parts = token.split(".");
    const key = createPublicKey({ key: jwk as never, format: "jwk" });
    const ok = cryptoVerify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      b64urlToBuf(parts[2]),
    );
    return { jwksUrl, jwks_fetch: "ok", key_for_kid: true, verified: ok, ms: Date.now() - started };
  } catch (err) {
    // Network/DNS/TLS failure — INDETERMINATE, explicitly not "false".
    return {
      jwksUrl,
      jwks_fetch: `error: ${err instanceof Error ? err.message : String(err)}`,
      verified: null as boolean | null,
      ms: Date.now() - started,
    };
  }
}

export async function GET() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  const base = {
    context: "preview-runtime",
    measured_at: new Date().toISOString(),
    // Reported for comparison only. VERCEL_ENV is a mutable string, not attestation.
    vercel_env_hint: process.env.VERCEL_ENV ?? null,
    node_env_hint: process.env.NODE_ENV ?? null,
    token_present: Boolean(token),
  };

  if (!token) {
    return NextResponse.json(
      { ...base, conclusion: "NO OIDC TOKEN IN THIS RUNTIME" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const decoded = decode(token);
  if (!decoded) {
    return NextResponse.json(
      { ...base, malformed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const p = decoded.payload;
  const iss = typeof p.iss === "string" ? p.iss : null;
  const kid = typeof decoded.header.kid === "string" ? decoded.header.kid : null;

  const sig = iss && kid ? await verifySignature(token, iss, kid) : { verified: null, note: "no iss or kid" };

  return NextResponse.json(
    {
      ...base,
      alg: decoded.header.alg ?? null,
      kid,
      claims: {
        iss,
        aud: p.aud ?? null,
        sub: p.sub ?? null,
        owner: p.owner ?? null,
        owner_id: p.owner_id ?? null,
        project: p.project ?? null,
        project_id: p.project_id ?? null,
        environment: p.environment ?? null,
        iat: p.iat ?? null,
        nbf: p.nbf ?? p.nfb ?? null,
        exp: p.exp ?? null,
        lifetime_seconds:
          typeof p.exp === "number" && typeof p.iat === "number" ? p.exp - p.iat : null,
        expired: typeof p.exp === "number" ? p.exp * 1000 < Date.now() : null,
      },
      // Issuer mode is derivable from iss: a team-scoped issuer carries a path segment,
      // the Global mode does not. This is the fact the authority rule needs and cannot guess.
      issuer_mode: iss ? (new URL(iss).pathname.replace(/\/$/, "") === "" ? "global" : "team-scoped") : null,
      signature: sig,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
