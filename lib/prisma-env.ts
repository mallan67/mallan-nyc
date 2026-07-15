// lib/prisma-env.ts
//
// Pure, SIDE-EFFECT-FREE resolution of the Prisma database connection strings.
//
// Why this exists (compute repair PR #511, Preview verification):
//   The Vercel–Neon integration exposes its connection strings under the PREFIXED
//   names `database_DATABASE_URL` / `database_DATABASE_URL_UNPOOLED` to ALL
//   environments, while the BARE Prisma names `DATABASE_URL` /
//   `DATABASE_URL_UNPOOLED` are Production-only. Prisma's schema reads the bare
//   names (`url = env("DATABASE_URL")`, `directUrl = env("DATABASE_URL_UNPOOLED")`),
//   so on Preview the bare names can be absent and Prisma would connect to the wrong
//   place (or not at all). This resolves the bare name FIRST and falls back to the
//   integration-managed prefixed name only when the bare one is absent.
//
// Guarantees:
//   - Production is unaffected: the bare DATABASE_URL is present there and WINS.
//   - Fail-closed: throws a clear error naming the variables (NOT their values) when
//     no pooled URL can be resolved — we never start against an unknown database.
//   - No credential is ever logged, printed, hashed, or returned beyond the raw
//     connection string the caller already needs to open the connection.
//
// This module has NO side effects (no PrismaClient, no env mutation, no dotenv, no
// throw at import time) so it is safe to unit-test in isolation.

export interface ResolvedPrismaEnv {
  /** Pooled connection string — Prisma schema `datasource.url`. */
  url: string;
  /** Direct/unpooled connection string — Prisma schema `datasource.directUrl`.
   *  Undefined when neither the bare nor the integration direct var is set
   *  (runtime queries use the pooled URL; the direct URL is only required by
   *  Prisma Migrate / introspection). */
  directUrl?: string;
  /** Which variable supplied the pooled URL. Non-sensitive — a NAME, never a value.
   *  Safe to log for diagnostics. */
  urlSource: "DATABASE_URL" | "database_DATABASE_URL";
  /** Which variable supplied the direct URL, or null when none was resolvable. */
  directUrlSource: "DATABASE_URL_UNPOOLED" | "database_DATABASE_URL_UNPOOLED" | null;
}

/** Treat empty / whitespace-only values as absent (Vercel can surface a defined-but-blank var). */
function firstNonBlank(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Resolve the pooled + direct database URLs with BARE-first, integration-fallback
 * precedence. Throws (fail-closed) when no pooled URL is resolvable.
 *
 * @param env defaults to `process.env`; injectable for tests.
 */
export function resolvePrismaEnv(
  env: Record<string, string | undefined> = process.env,
): ResolvedPrismaEnv {
  const bareUrl = firstNonBlank(env.DATABASE_URL);
  const integrationUrl = firstNonBlank(env.database_DATABASE_URL);
  const url = bareUrl ?? integrationUrl;

  if (!url) {
    // Fail closed. Name the variables (there are no values to leak) so the fix is
    // obvious and we never silently connect to an unintended database.
    throw new Error(
      "Prisma database URL is not configured: set DATABASE_URL (bare Prisma name) " +
        "or, on environments where only the Vercel–Neon integration variables are " +
        "present, database_DATABASE_URL. Refusing to start without a database connection.",
    );
  }

  const bareDirect = firstNonBlank(env.DATABASE_URL_UNPOOLED);
  const integrationDirect = firstNonBlank(env.database_DATABASE_URL_UNPOOLED);
  const directUrl = bareDirect ?? integrationDirect;

  return {
    url,
    directUrl,
    urlSource: bareUrl ? "DATABASE_URL" : "database_DATABASE_URL",
    directUrlSource: bareDirect
      ? "DATABASE_URL_UNPOOLED"
      : integrationDirect
        ? "database_DATABASE_URL_UNPOOLED"
        : null,
  };
}
