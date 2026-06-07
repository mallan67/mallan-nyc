/**
 * Canonical Neon production-target guard (FAIL-CLOSED).
 *
 * Single source of truth for "is this the canonical production Neon project /
 * host?" — used to refuse any credential-rotation or branch-prune action that
 * targets the wrong project/host. This is *code*, not a comment: the 2026-06-02
 * cross-project DB incident showed that prose warnings do not stop an automated
 * job from writing a stale project's URI into production env.
 *
 * Canonical production (CLAUDE.md AGENT STOP / NEON.md §canonical):
 *   project  = hidden-mountain-87248164  ("neon-green-school")
 *   host     = ep-cold-waterfall-adno3ao2
 * Stale / do-not-serve (must be refused):
 *   project  = morning-bread-68708332    ("mallandb")
 *   host     = ep-royal-dawn-ad6eh8t2
 *
 * Consumers:
 *   - app/api/cron/neon-branch-prune/route.ts (refuse prune on wrong project)
 *   - scripts/ci/assert-canonical-neon-target.mjs (rotate-db-keys workflow guard;
 *     keeps these constants in sync — see that file's header)
 *
 * Design: STRICT allow-list. Anything that is not exactly the canonical project /
 * does not contain the canonical host substring is refused (fail-closed). The
 * forbidden lists are defense-in-depth + clearer error messages, not the primary
 * gate.
 *
 * @module lib/ops/canonical-neon-target
 */

export const CANONICAL_NEON_PROJECT_ID = 'hidden-mountain-87248164';
export const CANONICAL_NEON_HOST_SUBSTRING = 'ep-cold-waterfall-adno3ao2';

/** Known stale / do-not-serve projects + hosts — refused explicitly. */
export const FORBIDDEN_NEON_PROJECT_IDS: readonly string[] = ['morning-bread-68708332'];
export const FORBIDDEN_NEON_HOST_SUBSTRINGS: readonly string[] = ['ep-royal-dawn-ad6eh8t2'];

/** True only for the exact canonical production project id (trimmed). Fail-closed. */
export function isCanonicalNeonProject(projectId: string | null | undefined): boolean {
  if (typeof projectId !== 'string') return false;
  const id = projectId.trim();
  if (id.length === 0) return false;
  if (FORBIDDEN_NEON_PROJECT_IDS.includes(id)) return false;
  return id === CANONICAL_NEON_PROJECT_ID;
}

/**
 * True only when the connection URI / host contains the canonical production host
 * substring AND none of the forbidden host substrings. Fail-closed on empty/null.
 */
export function isCanonicalNeonHost(uriOrHost: string | null | undefined): boolean {
  if (typeof uriOrHost !== 'string' || uriOrHost.length === 0) return false;
  if (FORBIDDEN_NEON_HOST_SUBSTRINGS.some((h) => uriOrHost.includes(h))) return false;
  return uriOrHost.includes(CANONICAL_NEON_HOST_SUBSTRING);
}

/** Throw unless `projectId` is the canonical production project. */
export function assertCanonicalNeonProject(projectId: string | null | undefined): void {
  if (!isCanonicalNeonProject(projectId)) {
    throw new Error(
      `Refusing Neon mutation: project "${projectId ?? '(unset)'}" is not the canonical ` +
        `production project (${CANONICAL_NEON_PROJECT_ID}).`,
    );
  }
}

/**
 * Throw unless the URI/host is the canonical production host. The offending value
 * is NOT included in the message (a connection URI carries credentials).
 */
export function assertCanonicalNeonHost(uriOrHost: string | null | undefined): void {
  if (!isCanonicalNeonHost(uriOrHost)) {
    throw new Error(
      `Refusing Neon mutation: target host is not the canonical production host ` +
        `(${CANONICAL_NEON_HOST_SUBSTRING}).`,
    );
  }
}
