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
 * Design: STRICT allow-list. Anything that is not exactly the canonical project, or whose parsed
 * host is not the canonical endpoint, is refused (fail-closed). The forbidden lists are
 * defense-in-depth + clearer error messages, not the primary gate.
 *
 * HOST CHECKING NO LONGER USES A SUBSTRING (DB Safety Packet 1). `isCanonicalNeonHost` used
 * `uriOrHost.includes(CANONICAL)`, which any URL could satisfy by carrying the canonical endpoint
 * id in a query parameter, the password or the path — none of which determine where the connection
 * actually goes. lib/retention/drain-core.ts had already recorded that hazard and parsed the
 * hostname instead; this module, which backs the neon-branch-prune route and
 * recover-stale-property-listings, had not. Both now delegate to the single classifier in
 * lib/ops/db-target.ts.
 *
 * One copy of the rule legitimately remains: scripts/ci/assert-canonical-neon-target.mjs runs
 * before any dependency install in `rotate-db-keys.yml` and cannot import TypeScript. It is a
 * pre-bootstrap EXECUTION MIRROR of db-target.ts's semantics, held to behavioural parity by the
 * CLI ↔ TS parity tests — not a second authority, and not free to disagree.
 *
 * The exported constant is still named `…_HOST_SUBSTRING` because callers, the rotate-db-keys CLI
 * guard and its drift test all reference that name. Its VALUE is unchanged; only the comparison
 * that consumes it got stricter. It is an endpoint id, not a substring to search for.
 *
 * @module lib/ops/canonical-neon-target
 */
import {
  CANONICAL_PRODUCTION_ENDPOINT,
  FORBIDDEN_STALE_ENDPOINT,
  classifyDbHost,
  classifyDbUrl,
  type DbTargetClassification,
} from '@/lib/ops/db-target';

export const CANONICAL_NEON_PROJECT_ID = 'hidden-mountain-87248164';
/** The canonical production endpoint id. Re-exported from the core so the two cannot drift. */
export const CANONICAL_NEON_HOST_SUBSTRING = CANONICAL_PRODUCTION_ENDPOINT;

/** Known stale / do-not-serve projects + hosts — refused explicitly. */
export const FORBIDDEN_NEON_PROJECT_IDS: readonly string[] = ['morning-bread-68708332'];
export const FORBIDDEN_NEON_HOST_SUBSTRINGS: readonly string[] = [FORBIDDEN_STALE_ENDPOINT];

/** True only for the exact canonical production project id (trimmed). Fail-closed. */
export function isCanonicalNeonProject(projectId: string | null | undefined): boolean {
  if (typeof projectId !== 'string') return false;
  const id = projectId.trim();
  if (id.length === 0) return false;
  if (FORBIDDEN_NEON_PROJECT_IDS.includes(id)) return false;
  return id === CANONICAL_NEON_PROJECT_ID;
}

/**
 * Classify a value that may be EITHER a full connection URI or a bare hostname.
 *
 * The dual shape is this module's long-standing calling convention — the parameter is literally
 * named `uriOrHost` and live callers pass both. The discrimination lives here, in the legacy
 * wrapper, rather than in the core: a core function takes one input shape, or it starts guessing.
 */
function classifyUriOrHost(value: string): DbTargetClassification {
  return value.includes('://') ? classifyDbUrl(value) : classifyDbHost(value);
}

/**
 * True only when the PARSED host is the canonical production endpoint. Fail-closed on
 * empty/null/malformed, and on anything the classifier does not positively recognise.
 */
export function isCanonicalNeonHost(uriOrHost: string | null | undefined): boolean {
  if (typeof uriOrHost !== 'string' || uriOrHost.length === 0) return false;
  // Retained belt-and-braces: if a forbidden endpoint id appears ANYWHERE in the value — even in a
  // fragment or query parameter a driver would ignore — refuse. This over-refuses by design, it is
  // pinned by the "forbidden wins" case in tests/runtime/canonical-neon-target.test.ts, and
  // over-refusal on the stale morning-bread database is the safe direction.
  if (FORBIDDEN_NEON_HOST_SUBSTRINGS.some((h) => uriOrHost.includes(h))) return false;
  return classifyUriOrHost(uriOrHost).class === 'canonical-production';
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
