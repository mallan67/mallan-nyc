// /diag/oidc-build — DIAGNOSTIC ONLY, deleted with diag/neon-preview-provision-2026-09-17.
//
// PURPOSE. Measure whether a Vercel OIDC token exists during `next build` / static generation,
// as a fact separate from runtime availability. Runtime availability must NOT be used to infer
// build availability — that inference is exactly the kind this project keeps having to retract.
//
// HOW IT MEASURES. This page is deliberately STATIC: no force-dynamic, no cookies(), no headers(),
// no request access. So Next.js prerenders it during the build, and whatever it renders is what
// the BUILD process saw. Fetching the deployed page later reads the baked-in answer.
//
// WHY IT MATTERS HERE. /agents is behaviourally proven to execute prisma.agent.findMany() during
// static generation, catch the failure, and let the build exit 0 — publishing an empty roster
// rather than failing. So if a database authority gate ever refuses during build, the symptom is
// a silently empty public page. Knowing whether the build can verify platform identity at all
// decides whether the gate can even be applied in that context.
//
// It never prints the token, and it never touches a database.
import { createPublicKey, verify as cryptoVerify } from "crypto";

export const revalidate = 3600;

type Claims = Record<string, unknown>;

function b64urlToBuf(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

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

async function measure() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  const out: Record<string, unknown> = {
    context: "preview-build-prerender",
    built_at: new Date().toISOString(),
    vercel_env_hint: process.env.VERCEL_ENV ?? null,
    node_env_hint: process.env.NODE_ENV ?? null,
    token_present_at_build: Boolean(token),
  };
  if (!token) {
    out.conclusion = "NO OIDC TOKEN DURING BUILD";
    return out;
  }
  const d = decode(token);
  if (!d) {
    out.malformed = true;
    return out;
  }
  const p = d.payload;
  const iss = typeof p.iss === "string" ? p.iss : null;
  const kid = typeof d.header.kid === "string" ? d.header.kid : null;
  out.claims = {
    iss,
    aud: p.aud ?? null,
    sub: p.sub ?? null,
    owner: p.owner ?? null,
    owner_id: p.owner_id ?? null,
    project: p.project ?? null,
    project_id: p.project_id ?? null,
    environment: p.environment ?? null,
    iat: p.iat ?? null,
    exp: p.exp ?? null,
    lifetime_seconds:
      typeof p.exp === "number" && typeof p.iat === "number" ? p.exp - p.iat : null,
  };
  out.issuer_mode = iss
    ? new URL(iss).pathname.replace(/\/$/, "") === ""
      ? "global"
      : "team-scoped"
    : null;

  // Can the BUILD reach the JWKS endpoint and verify? Network egress during build is a separate
  // capability from network egress at runtime, so it is measured rather than assumed.
  if (iss && kid) {
    const jwksUrl = new URL("/.well-known/jwks", iss).toString();
    try {
      const res = await fetch(jwksUrl, { cache: "no-store" });
      if (!res.ok) {
        out.signature = { jwksUrl, jwks_fetch: `HTTP ${res.status}`, verified: null };
      } else {
        const jwks = (await res.json()) as { keys?: Array<Record<string, unknown>> };
        const jwk = (jwks.keys ?? []).find((k) => k.kid === kid);
        if (!jwk) {
          out.signature = { jwksUrl, jwks_fetch: "ok", key_for_kid: false, verified: false };
        } else {
          const parts = token.split(".");
          const key = createPublicKey({ key: jwk as never, format: "jwk" });
          out.signature = {
            jwksUrl,
            jwks_fetch: "ok",
            key_for_kid: true,
            verified: cryptoVerify(
              "RSA-SHA256",
              Buffer.from(`${parts[0]}.${parts[1]}`),
              key,
              b64urlToBuf(parts[2]),
            ),
          };
        }
      }
    } catch (err) {
      out.signature = {
        jwksUrl,
        jwks_fetch: `error: ${err instanceof Error ? err.message : String(err)}`,
        verified: null,
      };
    }
  }
  return out;
}

export default async function Page() {
  const result = await measure();
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 24 }}>
      <h1 style={{ fontSize: 16 }}>OIDC build-time probe (diagnostic)</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        Rendered during static generation. Values reflect what the BUILD observed. No token value
        is included and no database is contacted.
      </p>
      <pre id="oidc-build-probe" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </main>
  );
}
