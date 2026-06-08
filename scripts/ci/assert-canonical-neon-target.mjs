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
 * Self-contained on purpose (no import/transpile step in CI). The canonical
 * constants MUST stay in sync with lib/ops/canonical-neon-target.ts — a unit test
 * (tests/runtime/canonical-neon-target.test.ts) asserts both definitions agree.
 *
 * Canonical production: project hidden-mountain-87248164 / host ep-cold-waterfall-adno3ao2
 * Forbidden (stale):    project morning-bread-68708332   / host ep-royal-dawn-ad6eh8t2
 *
 * The guard NEVER prints the supplied host/URI (it can carry credentials) — only
 * a pass/refuse line referencing the canonical substring.
 */

const CANONICAL_PROJECT = 'hidden-mountain-87248164';
const CANONICAL_HOST = 'ep-cold-waterfall-adno3ao2';
const FORBIDDEN_PROJECTS = ['morning-bread-68708332'];
const FORBIDDEN_HOSTS = ['ep-royal-dawn-ad6eh8t2'];

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

function hostIsCanonical(uri) {
  if (typeof uri !== 'string' || uri.length === 0) return false;
  if (FORBIDDEN_HOSTS.some((h) => uri.includes(h))) return false;
  return uri.includes(CANONICAL_HOST);
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
