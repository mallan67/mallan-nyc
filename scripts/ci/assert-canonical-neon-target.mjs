#!/usr/bin/env node
/**
 * Fail-closed canonical-Neon-target guard for the `rotate-db-keys` workflow.
 *
 * Usage (exits NON-ZERO = refuse, 0 = allow):
 *   node scripts/ci/assert-canonical-neon-target.mjs --project "$PROJECT_ID"
 *   node scripts/ci/assert-canonical-neon-target.mjs --host "$connection_uri"
 *   node scripts/ci/assert-canonical-neon-target.mjs --project X --host Y
 *
 * Called BEFORE any mutation in rotate-db-keys.yml: the --project check gates the
 * Neon password reset; the --host checks gate the gh-secret / Vercel-env writes.
 *
 * PRE-BOOTSTRAP EXECUTION MIRROR — not a second authority.
 *
 * This file runs in `rotate-db-keys.yml` BEFORE any dependency install, so it cannot import
 * lib/ops/db-target.ts and must carry its own copy of the host rule. That constraint is real and
 * is preserved deliberately. It is NOT a licence to hold a different rule:
 *
 *   lib/ops/db-target.ts  = canonical application target semantics (the authority)
 *   this file             = pre-bootstrap execution mirror of those semantics
 *
 * Behavioural parity is enforced by tests, not by good intentions — see the CLI ↔ TS parity block
 * in tests/runtime/canonical-neon-target.test.ts, which asserts both sides AND asserts they agree
 * on every case. This file is not permitted to hold a different interpretation of canonical /
 * stale / unknown host identity.
 *
 * WHY THE HOST CHECK IS NOT A SUBSTRING TEST (corrected in DB Safety Packet 1). It used to be
 * `uri.includes(CANONICAL_HOST)`, and a URI merely MENTIONING the canonical endpoint passed:
 *
 *   --host 'postgresql://u:p@evil.example.com:5432/db?application_name=ep-cold-waterfall-adno3ao2'
 *   => OK — target host is the canonical production host.   EXIT 0
 *
 * The canonical id can appear in a query parameter, the password or the path, none of which
 * determine where the connection goes. The hostname is parsed instead, and its first label — the
 * Neon endpoint id — compared by equality, with `-pooler` normalised and the `.neon.tech` suffix
 * required. This matters here more than anywhere: the guard gates the Neon role password reset,
 * the `gh secret set DATABASE_URL` writes, the Vercel production environment writes, and the
 * production redeploy that follows them.
 *
 * Canonical production: project hidden-mountain-87248164 / host ep-cold-waterfall-adno3ao2
 * Forbidden (stale):    project morning-bread-68708332   / host ep-royal-dawn-ad6eh8t2
 *
 * The guard NEVER prints the supplied host/URI (it can carry credentials) — only
 * a pass/refuse line referencing the canonical endpoint id.
 */

const CANONICAL_PROJECT = 'hidden-mountain-87248164';
const CANONICAL_HOST = 'ep-cold-waterfall-adno3ao2';
const FORBIDDEN_PROJECTS = ['morning-bread-68708332'];
const FORBIDDEN_HOSTS = ['ep-royal-dawn-ad6eh8t2'];
const NEON_HOST_SUFFIX = '.neon.tech';
const POOLER_SUFFIX = '-pooler';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function projectIsCanonical(projectId) {
  if (typeof projectId !== 'string') return false;
  const id = projectId.trim();
  if (id.length === 0) return false;
  if (FORBIDDEN_PROJECTS.includes(id)) return false;
  return id === CANONICAL_PROJECT;
}

/**
 * Mirror of classifyDbHost/classifyDbUrl in lib/ops/db-target.ts, and of the `uriOrHost`
 * discrimination in lib/ops/canonical-neon-target.ts. Accepts a full connection URI or a bare
 * hostname, because the TypeScript guard does and the two must not diverge.
 *
 * Fail-closed at every step: unparseable, hostless, stale, off-Neon and unrecognised all return
 * false. "Not obviously wrong" is never treated as right.
 */
function hostIsCanonical(uri) {
  if (typeof uri !== 'string' || uri.trim().length === 0) return false;

  // Retained belt-and-braces, matching the TypeScript guard: a forbidden endpoint id appearing
  // ANYWHERE in the value — even somewhere a driver would ignore — refuses. Over-refusal on the
  // stale morning-bread database is the safe direction.
  if (FORBIDDEN_HOSTS.some((h) => uri.includes(h))) return false;

  const value = uri.trim();
  let host;
  if (value.includes('://')) {
    try {
      host = new URL(value).hostname;
    } catch {
      return false; // malformed — undeterminable is refused, never assumed
    }
  } else {
    host = value; // bare hostname, the legacy calling convention
  }
  if (!host) return false;

  host = host.toLowerCase();
  const endpoint = host.split('.')[0];
  if (endpoint.length === 0) return false;

  const identity = endpoint.endsWith(POOLER_SUFFIX)
    ? endpoint.slice(0, -POOLER_SUFFIX.length)
    : endpoint;

  if (FORBIDDEN_HOSTS.includes(identity)) return false;
  if (identity !== CANONICAL_HOST) return false;
  return host.endsWith(NEON_HOST_SUFFIX);
}

const project = argValue('--project');
const host = argValue('--host');
let refused = false;

if (project !== undefined) {
  if (projectIsCanonical(project)) {
    console.log('OK — Neon project is the canonical production project.');
  } else {
    console.error(`::error::REFUSED — Neon project is NOT the canonical production project (${CANONICAL_PROJECT}). Aborting before any mutation.`);
    refused = true;
  }
}

if (host !== undefined) {
  if (hostIsCanonical(host)) {
    console.log('OK — target host is the canonical production host.');
  } else {
    console.error(`::error::REFUSED — target host is NOT the canonical production host (${CANONICAL_HOST}). Aborting before any env write.`);
    refused = true;
  }
}

if (project === undefined && host === undefined) {
  console.error('::error::REFUSED — no --project or --host supplied (fail-closed).');
  refused = true;
}

process.exit(refused ? 1 : 0);
