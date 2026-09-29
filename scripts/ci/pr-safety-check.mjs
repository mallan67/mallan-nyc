#!/usr/bin/env node
/**
 * Mallan PR safety check.
 *
 * Guards database, provider and destructive-infrastructure changes on every pull request,
 * whatever its branch is called. It reads nothing from the Execution State. The workflow
 * (.github/workflows/pr-safety.yml) runs it on pull_request_target from the PR BASE and reads
 * the proposed change only through the GitHub API, so a pull request can neither run its own
 * code here nor weaken the check that judges it.
 *
 * The rules were carried over from the retired execution controller on 2026-09-29, when the
 * branch restriction, the State-authorization modes and the three-PR cycle were removed:
 *
 *   1. retired direct-Neon paths may never return, not even as a fail-only stub;
 *   2. no changed runnable file may carry direct Neon control-plane capability, under any name;
 *   3. each of Maya's authorization boundaries (CHANGE_CLASSES) needs her authorized:* label on
 *      the pull request. A class is detected from the changed paths and from the code lines the
 *      pull request INTRODUCES (comments stripped), so it follows what a change does rather than
 *      one historical filename, and editing near an existing operation does not trip it;
 *   4. the safety root (this check, its workflow, pr-check, Release Truth and their tests) and
 *      ruleset/branch-protection code change only with Maya's authorized:safety-root label;
 *   5. a database-shaped change must declare the full database chain in the PR description.
 *
 * An authorization label counts only when the account that added it is listed in
 * MALLAN_SAFETY_AUTHORIZERS (default: mallan67).
 *
 * LIMITATION, stated so nobody overstates it: while agents operate through Maya's own GitHub
 * account (mallan67), an authorized:* label cannot cryptographically distinguish Maya from an
 * agent. The label records an authorization; it does not prove who gave it. Once agents have
 * their own GitHub identity and it is left out of MALLAN_SAFETY_AUTHORIZERS, a label that
 * identity adds is refused here.
 *
 * Usage:
 *   node scripts/ci/pr-safety-check.mjs           CI: reads the pull request through `gh`
 *                                                 (GITHUB_REPOSITORY, PR_NUMBER, BASE_SHA, HEAD_SHA)
 *   node scripts/ci/pr-safety-check.mjs --stdin   tests: evaluates a JSON fixture from stdin
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------
// Rule tables
// ---------------------------------------------------------------------------------------

// One label per explicit Maya authorization boundary (Master §27.21).
export const AUTH_LABELS = {
  schema_migration: "authorized:schema-migration",
  production_database: "authorized:production-database",
  preview_neon: "authorized:preview-neon",
  environment: "authorized:environment",
  credential_rotation: "authorized:credential-rotation",
  destructive_data: "authorized:destructive-data",
  manual_cron: "authorized:manual-cron",
  production_deploy: "authorized:production-deploy",
  provider_publishing: "authorized:provider-publishing",
  safety_root: "authorized:safety-root",
};

// The safety check, the required PR checks and the tests that prove them. A pull request that
// changes any of these needs AUTH_LABELS.safety_root, so an agent cannot quietly weaken them.
export const SAFETY_ROOT_PATHS = new Set([
  "scripts/ci/pr-safety-check.mjs",
  ".github/workflows/pr-safety.yml",
  ".github/workflows/pr-check.yml",
  ".github/workflows/release-truth.yml",
  "scripts/validate-release-status.js",
  "scripts/release-safety/release-truth-verdict.js",
  "tests/runtime/pr-safety-check.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  "scripts/ops-health.js",
  "vercel.json",
]);

// PR #632 DELETED the direct-Neon control plane. Mallan reaches Neon only through the
// Vercel-managed Marketplace resource, so these paths must never come back - not as a
// re-implementation and not as a fail-only stub, because a tombstone is still a Mallan
// path: it keeps the retired architecture in the tree and in every catalog that scans it.
export const DELETED_DIRECT_NEON_PATHS = new Set([
  ".github/workflows/cleanup-neon-preview-branch.yml",
  ".github/workflows/rotate-db-keys.yml",
  "app/api/cron/neon-branch-prune/route.ts",
  "lib/neon/branches.ts",
  "scripts/neon-prune-branches.ts",
  "scripts/branch-prune-health.js",
  "tests/runtime/neon-branch-prune-route.test.ts",
  "tests/runtime/neon-prune-cli.test.ts",
  "tests/runtime/branch-prune-health.test.ts",
  "tests/runtime/neon-branch-prunability.test.ts",
  "scripts/neon-verify.ts"
]);

// The retired capability, derived from the code #632 deleted rather than guessed.
// rotate-db-keys.yml called console.neon.tech/api/v2/projects/<id>/branches/<id>/roles/
// <role>/reset_password with a bearer NEON_API_KEY. cleanup-neon-preview-branch.yml listed
// and DELETEd branches through the same host. neon-verify.ts and the health probe shelled
// out to neonctl. Those are the signatures of direct Neon control.
//
// Blocking filenames is not enough: the same capability returns under any new name. This
// set is matched against FILE CONTENT, so scripts/neon-control.ts, a neon-rotation-v2
// workflow and a lib/ helper are all refused for what they do rather than what they are called.
const DIRECT_NEON_CAPABILITY_SIGNALS = [
  "console.neon.tech",
  "api.neon.tech",
  "neonctl",
  "NEON_API_KEY",
  "NEON_PREVIEW_API_KEY",
  "NEON_ADMIN_KEY",
  "NEON_ROTATION_ADMIN"
];

// The check and its tests must name the signals in order to enforce and prove them. All three
// are in SAFETY_ROOT_PATHS, so the exemption itself cannot be widened without Maya's label.
const NEON_CAPABILITY_EXEMPT = new Set([
  "scripts/ci/pr-safety-check.mjs",
  "tests/runtime/pr-safety-check.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts"
]);

// Every format in this repository that can run, configure a run, or carry a connection.
const EXECUTABLE_EXTENSIONS = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".bat", ".cmd", ".tf", ".tfvars", ".hcl", ".ipynb",
  ".yml", ".yaml", ".toml",
  ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".py", ".rb", ".go", ".rs", ".java", ".php",
  ".sql", ".prisma", ".dockerfile"
];

// Extensionless runnables. package.json runs npm scripts, so it is a program that happens to
// be JSON. Other .json files are data unless they declare a command (see below).
const EXECUTABLE_BASENAMES = ["dockerfile", "makefile", "procfile", "justfile", "package.json"];

// Directories whose contents run by definition, whatever the files are called.
const EXECUTABLE_PREFIXES = [".githooks/", ".husky/"];

// ---------------------------------------------------------------------------------------
// Authorization classes (one per Maya boundary)
// ---------------------------------------------------------------------------------------
//
// A class fires when a changed PATH matches one of its path rules (any change: add, modify or
// delete), or when a code line the pull request INTRODUCES matches one of its content rules.
// Content rules read only runnable/configuration files, with comments stripped, and skip test
// files (tests cannot mutate production) and the check's own files (they must name the
// patterns; changing them already needs authorized:safety-root).
//
// `where` narrows a content rule to the surfaces where the pattern means an operation is being
// run rather than served: OPERATOR = scripts, tools, workflows, hooks, package.json and shell
// files, where a line executes against real infrastructure when someone runs it.

const TEST_PATH = /(^|\/)(?:tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const OPERATOR = (p) =>
  /^(?:scripts|tools|\.github\/workflows|\.githooks|\.husky)\//.test(p) || p === "package.json" ||
  /\.(?:sh|bash|zsh|ps1|psm1|bat|cmd)$/i.test(p);

// The canonical Production database identity (repository CLAUDE.md, "Canonical Production DB
// identity"). Naming it in code points that code at Production.
const PRODUCTION_DB_IDENTITY = /\b(?:neon-green-school|store_K9l79ICRUTMsiRh2|hidden-mountain-87248164|br-crimson-frog-adr7g9gt|ep-cold-waterfall-adno3ao2)\b/;

export const CHANGE_CLASSES = {
  schema_migration: {
    boundary: "schema / migration / backfill",
    paths: [
      ["Prisma schema", /^prisma\/schema\.prisma$/],
      ["Prisma migration", /^prisma\/migrations\//],
      ["SQL file under sql/", /^sql\//],
      ["backfill or migration program", /(?:^|\/)[^/]*(?:backfill|migrat)[^/]*\.(?:[cm]?[jt]sx?|py|sh|sql|ps1)$/i],
    ],
    content: [
      ["prisma migrate / db push", /\bprisma\s+(?:migrate\s+(?:dev|deploy|reset|resolve)|db\s+push)\b/],
      // SQL keywords in upper case, or the exact lower-case statement, so UI text such as
      // "Create view" does not read as DDL.
      ["schema DDL", /\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|INDEX|COLUMN|SCHEMA|VIEW|TYPE|EXTENSION|MATERIALIZED\s+VIEW)\b|\b(?:alter|create|drop)\s+(?:table|index|schema|extension|materialized\s+view)\b/],
      ["backfill run from an operator surface or cron", /\bbackfill/i, (p) => OPERATOR(p) || p.startsWith("app/api/cron/")],
    ],
  },
  production_database: {
    boundary: "Production database / Neon mutation",
    paths: [
      ["Production database target selection", /^lib\/ops\/(?:db-target|canonical-neon-target)\.[cm]?[jt]s$/],
      ["Production database target assertion", /^scripts\/ci\/assert-canonical-neon-target\.mjs$/],
    ],
    content: [
      ["canonical Production database identity", PRODUCTION_DB_IDENTITY],
      ["Neon connection host", /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech\b/i],
      ["prisma migrate deploy", /\bprisma\s+migrate\s+deploy\b/],
      ["data-loss flag", /\baccept-data-loss\b/],
      ["database URL taken from a stored secret", /\b(?:ASSISTANT_)?DATABASE_URL(?:_UNPOOLED)?\b\s*[:=]\s*["']?\$\{\{\s*secrets\./],
    ],
  },
  preview_neon: {
    boundary: "Development / Preview Neon creation or control",
    paths: [
      ["Neon library", /^lib\/neon\//],
    ],
    content: [
      // A branch/endpoint/project/compute lifecycle call reached through Neon (for example
      // integrations.neon.createBranch), or the same operation written out in words.
      ["Neon branch/endpoint lifecycle call", /\bneon\b[^\n]{0,60}\b(?:create|delete|reset|restore|prune|provision)[A-Za-z]*(?:Branch|Branches|Endpoint|Project|Database|Compute)\b/i],
      ["Neon branch/endpoint lifecycle operation", /\b(?:create|delete|reset|restore|prune|provision)\w*\s+(?:a\s+|the\s+)?(?:neon\s+)?(?:preview\s+|dev(?:elopment)?\s+)?(?:branch|branches|endpoint|compute)\b[^\n]{0,60}\bneon\b|\bneon\b[^\n]{0,60}\b(?:branch|branches|endpoint|compute)\b[^\n]{0,30}\b(?:create|delete|reset|restore|prune|provision)/i],
      ["Vercel integration install/remove", /\bvercel\s+integration\s+(?:add|remove|install|uninstall)\b/],
    ],
  },
  environment: {
    boundary: "Vercel environment / resource mutation",
    paths: [
      ["vercel.json", /^vercel\.json$/],
      ["Vercel project link", /^\.vercel\//],
    ],
    content: [
      ["vercel CLI environment/resource mutation", /\bvercel\s+(?:env|domains|dns|certs|secrets|project|projects|git|blob|edge-config|integration)\s+(?:add|rm|remove|update|connect|disconnect|create|delete|install|uninstall)\b/],
      ["Vercel API environment/resource endpoint", /api\.vercel\.com\/v\d+\/(?:projects\/[^\s'"`]+\/(?:env|domains)|env\b|domains\b|edge-config|storage|integrations)/],
    ],
  },
  credential_rotation: {
    boundary: "credential rotation",
    paths: [
      ["rotation/revocation program or workflow", /^(?:scripts|tools|\.github\/workflows)\/(?:[^/]+\/)*[^/]*(?:rotat|rekey|revok)[^/]*$/i],
    ],
    content: [
      ["password reset", /\breset_password\b/i],
      ["credential rotation/revocation", /\b(?:rotat|regenerat|revok|rekey)\w*[^\n]{0,60}\b(?:keys?|secrets?|passwords?|credentials?|tokens?)\b|\b(?:keys?|secrets?|passwords?|credentials?|tokens?)\b[^\n]{0,60}\b(?:rotat|regenerat|revok|rekey)\w*/i],
      ["GitHub secret write", /\bgh\s+secret\s+(?:set|delete|remove)\b|\/actions\/secrets\b/],
      ["database role password change", /\bALTER\s+(?:ROLE|USER)\b[^\n]*\bPASSWORD\b/i],
    ],
  },
  destructive_data: {
    boundary: "destructive data / R2 / storage operations",
    paths: [
      ["purge/wipe/prune/delete/cleanup operator", /^(?:scripts|tools|\.github\/workflows|app\/api\/cron)\/(?:[^/]+\/)*[^/]*(?:purge|wipe|prune|truncate|drop|delete|cleanup|clean-up)[^/]*$/i],
    ],
    content: [
      ["object-storage delete (R2/S3)", /\bDelete(?:Object|Objects|Bucket)Command\b|\.delete(?:Object|Objects|Bucket)\s*\(|\bwrangler\s+r2\s+(?:object|bucket)\s+delete\b|\baws\s+s3\s+(?:rm|rb)\b|\bs3api\s+delete-|\brclone\s+(?:delete|purge|deletefile)\b/i],
      // Upper-case SQL, or the exact lower-case statement: the Tailwind class `truncate` and UI
      // text such as "Delete from favorites" are not SQL.
      ["destructive SQL", /\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?["`\w.]+|\bDROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN|INDEX|VIEW)\b|\bDELETE\s+FROM\b|\btruncate\s+table\b|\bdrop\s+(?:table|schema|database)\b|\bdelete\s+from\s+["`\w.]+\s+where\b/],
      ["unconditional deleteMany", /\.deleteMany\s*\(\s*(?:\{\s*\}\s*)?\)/],
      ["data-loss reset", /\baccept-data-loss\b|\bprisma\s+migrate\s+reset\b|--force-reset\b/],
    ],
  },
  manual_cron: {
    boundary: "manual cron / reconciliation execution",
    paths: [
      ["reconcile/replay/run-cron operator", /^(?:scripts|tools)\/(?:[^/]+\/)*[^/]*(?:reconcil|run-cron|trigger-cron|replay|resync)[^/]*$/i],
    ],
    content: [
      ["cron endpoint called from an operator surface", /\/api\/cron\/[\w-]+/, OPERATOR],
      ["cron secret sent from an operator surface", /\bCRON_SECRET\b/, OPERATOR],
      ["reconciliation run from an operator surface", /\breconcil\w*/i, OPERATOR],
      ["manual workflow trigger", /\bworkflow_dispatch\b/, (p) => p.startsWith(".github/workflows/")],
    ],
  },
  production_deploy: {
    boundary: "Production deployment / alias mutation",
    paths: [
      ["vercel.json", /^vercel\.json$/],
    ],
    content: [
      ["vercel --prod", /\bvercel\b[^\n]*\s--prod(?:uction)?\b/],
      ["vercel deploy/promote/rollback/redeploy/alias", /\bvercel\s+(?:deploy|promote|rollback|redeploy|alias|rolling-release)\b/],
      ["Vercel alias/promote/rollback endpoint", /api\.vercel\.com\/v\d+\/(?:aliases|projects\/[^\s'"`]+\/(?:promote|rollback)|deployments\/[^\s'"`]+\/aliases)/],
      ["deploy hook", /\/v1\/integrations\/deploy\/|\bVERCEL_DEPLOY_HOOK\w*/],
      ["third-party Vercel deploy action", /\bamondnet\/vercel-action\b/],
    ],
  },
  provider_publishing: {
    boundary: "provider publishing / syndication",
    paths: [
      ["syndication surface", /^(?:app|lib|scripts)\/(?:[^/]+\/)*(?:syndication|syndicate|publish(?:ing|er)?)(?:\/|[-_.])/i],
      ["outbound feed API route", /^app\/api\/(?:[^/]+\/)*feeds?(?:\/|-[\w-]+\/)/i],
    ],
    content: [
      // A portal is only a publishing target when the code reaches its feed/upload/API surface;
      // a profile link or a testimonial that names the portal is not publishing.
      ["listing-portal feed/upload/API endpoint", /\b(?:streeteasy|zillow|trulia|renthop|nakedapartments|hotpads|apartments)\.(?:com|net)\/[^\s'"`]*\b(?:feeds?|upload|ingest|api|syndication)\b/i],
      ["feed delivery over FTP/SFTP", /['"](?:ssh2-sftp-client|basic-ftp|ftp)['"]|\bs?ftp:\/\//],
      ["RLS/REBNY submission call", /\b(?:submit|publish|transmit|syndicate|push)\w*(?:Rls|RLS|Rebny|REBNY)\w*\s*\(/],
      ["write to the Cotality/Trestle provider", /\btrestle\b[^\n]{0,80}\b(?:POST|PUT|PATCH|DELETE)\b|\b(?:POST|PUT|PATCH|DELETE)\b[^\n]{0,80}\btrestle/i],
    ],
  },
  safety_root: {
    boundary: "safety root / ruleset and branch-protection changes",
    paths: [], // SAFETY_ROOT_PATHS are checked by name in evaluate()
    content: [
      ["ruleset / branch-protection API", /\/rulesets\b|\/branches\/[^\s'"`]+\/protection\b|\brequired_status_checks\b|\bbypass_actors\b|\benforce_admins\b/],
      ["privileged workflow trigger or permission", /\bpull_request_target\b|\bpermissions:\s*write-all\b|\badministration:\s*write\b/, (p) => p.startsWith(".github/workflows/")],
    ],
  },
};

const HASH_COMMENT_FILE = (p) => {
  const lower = p.toLowerCase(), base = lower.split("/").pop();
  return /\.(?:ya?ml|sh|bash|zsh|py|rb|toml|ps1|psm1|tf|tfvars|hcl)$/.test(lower) ||
    ["dockerfile", "makefile", "procfile", "justfile"].some((n) => base === n || base.startsWith(n + ".")) || base.startsWith(".env");
};

// Code lines of a file, comments stripped. A # opens a comment only in formats where it does.
function codeLines(filePath, body) {
  if (typeof body !== "string") return [];
  let stripped;
  try { stripped = stripSourceComments(body, { hashComments: HASH_COMMENT_FILE(filePath) }); } catch { stripped = body; }
  let lines = stripped.split(/\r?\n/);
  // SQL line comments.
  if (/\.sql$/i.test(filePath)) lines = lines.map((l) => l.replace(/--.*$/, ""));
  return lines.map((l) => l.trim()).filter(Boolean);
}

// Lines present in the proposed file but not in the base file (a multiset difference), so a line
// that moves into a file counts as introduced there, and an untouched existing line does not.
export function introducedLines(filePath, base, head) {
  const remaining = new Map();
  for (const l of codeLines(filePath, base)) remaining.set(l, (remaining.get(l) || 0) + 1);
  const out = [];
  for (const l of codeLines(filePath, head)) {
    const n = remaining.get(l) || 0;
    if (n > 0) remaining.set(l, n - 1); else out.push(l);
  }
  return out;
}

// The classes one change needs, each with the rule that fired.
export function classifyChange(change, readBase, readHead) {
  const hits = new Map();
  const p = change.path;
  if (TEST_PATH.test(p) || NEON_CAPABILITY_EXEMPT.has(p)) return hits;
  for (const [cls, def] of Object.entries(CHANGE_CLASSES)) {
    for (const [name, re] of def.paths) if (re.test(p)) { hits.set(cls, name); break; }
  }
  const base = change.status === "A" ? null : readBase(p);
  const head = change.status === "D" ? null : readHead(p);
  if (head === null) return hits;
  const scannable = isExecutablePath(p, head) || carriesDatabaseConfig(p);
  if (!scannable) return hits;
  const added = introducedLines(p, base, head);
  if (!added.length) return hits;
  for (const [cls, def] of Object.entries(CHANGE_CLASSES)) {
    if (hits.has(cls)) continue;
    for (const [name, re, where] of def.content) {
      if (where && !where(p)) continue;
      if (added.some((line) => re.test(line))) { hits.set(cls, name); break; }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------------------
// Database chain (Master §27.16.1)
// ---------------------------------------------------------------------------------------

export const DATABASE_IMPACT_STATIONS = [
  "vercel_integration",
  "env_resolution",
  "db_target",
  "prisma_pg",
  "migrations",
  "workflows_crons",
  "preview",
  "production",
  "downstream_readers_writers",
  "tests"
];

// A changed path is database-shaped when it matches any of these. Deliberately broad:
// a false positive costs one declaration, a false negative lets a database change ship
// without a chain.
const DATABASE_PATH_PREFIXES = ["prisma/", "sql/", "lib/db/", "lib/ops/", "lib/retention/", "app/api/cron/"];
const DATABASE_PATH_EXACT = ["lib/prisma.ts", "vercel.json"];
const DATABASE_PATH_SUBSTRINGS = ["neon", "database", "db-target", "database_url"];

// Content signals for the database chain. Derived from a census of every tracked reader:
// 55 files read DATABASE_URL, construct a Prisma client or construct a pg pool, and 52 of
// them matched none of the path patterns above.
const DATABASE_CONTENT_SIGNALS = [
  "process.env.DATABASE_URL",
  "process.env.DATABASE_URL_UNPOOLED",
  "process.env.ASSISTANT_DATABASE_URL",
  "lib/ops/db-target",
  "canonical-neon-target"
];

const DATABASE_CONTENT_PATTERNS = [
  /new\s+(?:[A-Za-z_$][\w$]*\.)*(?:PrismaClient|Pool|Client)\s*\(/,
  /['\"][^'\"]*\blib\/(?:prisma|db)(?:\/[\w.-]+)?['\"]/,
  /^\s*(?:ASSISTANT_)?DATABASE_URL(?:_UNPOOLED)?\s*:/m,
  // Language-neutral: naming the variable at all is what makes a file part of the story.
  /\bDATABASE_URL\b/,
  /\bPOSTGRES(?:_PRISMA)?_URL(?:_NON_POOLING|_NO_SSL)?\b/,
  /\bconnectionString\b/,
  // A connection URL is database involvement whatever the variable is called.
  /\bpostgres(?:ql)?:\/\//,
  // A client that arrives as a PARAMETER is still a client.
  /\b(?:prisma|db|tx|client)\s*\.\s*\$?(?:transaction|queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe|connect|disconnect)\b/,
  /\b(?:prisma|db|tx)\s*\.\s*[a-z][\w]*\s*\.\s*(?:findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(/,
  // A Prisma where-fragment is a database query even when it never names the client.
  /\b(?:idx_display_yn|internet_[a-z_]*display_yn|participant_only|owner_opt_out)\b/,
  // SQL that changes data or shape, wherever the file lives.
  /\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+(?:TABLE|INDEX|COLUMN|SCHEMA|DATABASE|VIEW)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM)\b/i,
  // A migrate or push command is a schema change wherever it is written down.
  /\bprisma\s+(?:migrate|db\s+push|generate)\b/,
  // The serverless driver, alongside pg and the Prisma client.
  /['"]@neondatabase\/serverless['"]/
];

// ---------------------------------------------------------------------------------------
// Detection helpers (carried over unchanged from the retired controller)
// ---------------------------------------------------------------------------------------

// Literal matching is necessary but not sufficient: the same capability survives being
// assembled from fragments. The body and the needles must be normalised IDENTICALLY.
function collapseForCapabilityScan(body) {
  return decodeSourceEscapes(body).replace(/[\s'\"`+\\\[\],\.,_${}()-]/g, "").toLowerCase();
}

// Remove comments while leaving everything else byte for byte. A string may contain //,
// a regex literal may contain //, and a template EXPRESSION is code; each of those was a
// live bypass before it was handled.
function stripSourceComments(body, options) {
  const hashComments = !options || options.hashComments !== false;
  const text = String(body);
  let out = "";
  let i = 0;
  let last = "";
  let inTemplate = false;
  const expressionDepths = [];
  let braceDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inTemplate) {
      if (ch === String.fromCharCode(92)) { out += ch; if (i + 1 < text.length) out += text[i + 1]; i += 2; continue; }
      if (ch === "$" && next === "{") {
        out += "${";
        expressionDepths.push(braceDepth);
        braceDepth += 1;
        inTemplate = false;
        last = "{";
        i += 2;
        continue;
      }
      if (ch === String.fromCharCode(96)) { out += ch; inTemplate = false; last = ch; i += 1; continue; }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '\"') {
      const quote = ch;
      last = quote;
      out += ch;
      i += 1;
      while (i < text.length) {
        out += text[i];
        if (text[i] === String.fromCharCode(92)) { if (i + 1 < text.length) out += text[i + 1]; i += 2; continue; }
        if (text[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }

    if (ch === String.fromCharCode(96)) { out += ch; inTemplate = true; i += 1; continue; }

    // A slash where a VALUE may begin opens a regex literal, not a comment.
    if (ch === "/" && next !== "/" && next !== "*" && regexMayStart(last, text, i)) {
      out += ch;
      i += 1;
      let inClass = false;
      while (i < text.length && text[i] !== String.fromCharCode(10)) {
        out += text[i];
        if (text[i] === String.fromCharCode(92)) { if (i + 1 < text.length) out += text[i + 1]; i += 2; continue; }
        if (text[i] === "[") { inClass = true; i += 1; continue; }
        if (text[i] === "]") { inClass = false; i += 1; continue; }
        if (text[i] === "/" && !inClass) { i += 1; break; }
        i += 1;
      }
      last = "/";
      continue;
    }

    // ECMA-262 Annex B.1.1 HTML-like comments in sloppy-mode script.
    if (ch === "<" && text.startsWith("<!--", i)) {
      while (i < text.length && text[i] !== String.fromCharCode(10)) i += 1;
      out += " ";
      continue;
    }
    if (ch === "-" && text.startsWith("-->", i) && (i === 0 || text[i - 1] === String.fromCharCode(10))) {
      while (i < text.length && text[i] !== String.fromCharCode(10)) i += 1;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== String.fromCharCode(10)) i += 1;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
      out += " ";
      continue;
    }
    // A shell, Python or YAML comment; the hashComments:false reading takes the opposite view.
    if (hashComments && ch === "#") {
      while (i < text.length && text[i] !== String.fromCharCode(10)) i += 1;
      out += " ";
      continue;
    }

    if (ch === "{") braceDepth += 1;
    if (ch === "}") {
      braceDepth -= 1;
      if (expressionDepths.length && braceDepth === expressionDepths[expressionDepths.length - 1]) {
        expressionDepths.pop();
        out += ch;
        inTemplate = true;
        i += 1;
        continue;
      }
    }

    out += ch;
    if (!/\s/.test(ch)) last = ch;
    i += 1;
  }
  return out;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await"
]);

// Where a slash could be a regex or division, answer regex: regex handling copies text
// through, comment handling deletes it, so this side can never hide a signature.
function regexMayStart(last, text, index) {
  if (!last) return true;
  if ("(),=:[]!&|?{};+-*%~^<>".includes(last)) return true;
  if (!/[A-Za-z_$]/.test(last)) return false;
  if (typeof text !== "string" || typeof index !== "number") return false;
  let end = index - 1;
  while (end >= 0 && /\s/.test(text[end])) end -= 1;
  let start = end;
  while (start >= 0 && /[\w$]/.test(text[start])) start -= 1;
  return REGEX_PRECEDING_KEYWORDS.has(text.slice(start + 1, end + 1));
}

function stripBlockCommentsOnly(body) {
  return String(body).replace(/\/\*[\s\S]*?\*\//g, " ");
}

// FOUR readings of the same file; a signature must be invisible in ALL of them to pass.
function capabilityScanReadings(body) {
  return [
    collapseForCapabilityScan(body),
    collapseForCapabilityScan(stripSourceComments(body)),
    collapseForCapabilityScan(stripBlockCommentsOnly(body)),
    collapseForCapabilityScan(stripSourceComments(body, { hashComments: false }))
  ];
}

function capabilityNeedles() {
  return DIRECT_NEON_CAPABILITY_SIGNALS.map((signal) => ({
    signal,
    collapsed: signal.replace(/[\s.\-_]/g, "").toLowerCase(),
  }));
}

function isExecutablePath(filePath, body) {
  const lower = String(filePath).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (EXECUTABLE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  if (EXECUTABLE_BASENAMES.some((name) => base === name || base.startsWith(name + "."))) return true;
  if (lower.endsWith(".json") && declaresRunnableCommand(body)) return true;
  return hasShebang(body);
}

function hasShebang(body) {
  if (typeof body !== "string") return false;
  return body.replace(/^﻿/, "").slice(0, 2) === "#!";
}

// Configuration that names a command LAUNCHES something. Keys are read from the PARSED
// document, because a JSON key may be escaped.
const RUNNABLE_JSON_KEY = /^(?:scripts|commands?|.*(?:command|cmd))$/i;

function declaresRunnableCommand(body) {
  if (typeof body !== "string") return false;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return true; // unreadable configuration fails CLOSED: it gets scanned
  }
  return jsonDeclaresKey(parsed, 0);
}

function jsonDeclaresKey(node, depth) {
  if (depth > 12) return true;
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => jsonDeclaresKey(child, depth + 1));
  for (const key of Object.keys(node)) {
    if (RUNNABLE_JSON_KEY.test(key)) return true;
    if (jsonDeclaresKey(node[key], depth + 1)) return true;
  }
  return false;
}

// A file is database-shaped if EITHER its base version or its proposed version carries a
// database signal: removing database behaviour, or deleting the file, is a database change.
function fileCarriesDatabaseSignal(body) {
  if (!body) return false;
  if (DATABASE_CONTENT_SIGNALS.some((signal) => body.includes(signal))) return true;
  if (DATABASE_CONTENT_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (loadsDatabaseDriver(body)) return true;
  for (const alias of databaseClientAliases(body)) {
    if (new RegExp("new\\s+" + alias + "\\s*\\(").test(body)) return true;
    if (new RegExp("new\\s+[A-Za-z_$][\\w$]*\\." + alias + "\\s*\\(").test(body)) return true;
  }
  return false;
}

const DB_SPECIFIER = "(?:pg|@prisma\\/client)";
const DB_NAMED_IMPORT = new RegExp("import\\s+(?!type\\s)\\{([^}]*)\\}\\s*from\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_DEFAULT_IMPORT = new RegExp("import\\s+(?!type\\s)([A-Za-z_$][\\w$]*)\\s*(?:,|from)[^;]*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_PLAIN_REQUIRE = new RegExp("(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_DESTRUCTURED_REQUIRE = new RegExp("(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*require\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_VALUE_IMPORT = new RegExp("import\\s+(?!type\\s)[^;]*?from\\s*['\"]" + DB_SPECIFIER + "['\"]");
const DB_BARE_IMPORT = new RegExp("import\\s*['\"]" + DB_SPECIFIER + "['\"]");
const DB_ANY_REQUIRE = new RegExp("require\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]");
const DB_DYNAMIC_IMPORT = new RegExp("import\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]");

function loadsDatabaseDriver(body) {
  return DB_VALUE_IMPORT.test(body) || DB_BARE_IMPORT.test(body) ||
    DB_ANY_REQUIRE.test(body) || DB_DYNAMIC_IMPORT.test(body);
}

function addBindingNames(list, into) {
  for (const part of String(list).split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const renamed = piece.split(/\s+as\s+|\s*:\s*/);
    const local = (renamed[1] || renamed[0]).split("=")[0].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(local)) into.add(local);
  }
}

function databaseClientAliases(body) {
  const aliases = new Set();
  let match;
  for (const re of [DB_NAMED_IMPORT, DB_DESTRUCTURED_REQUIRE]) {
    re.lastIndex = 0;
    while ((match = re.exec(body)) !== null) addBindingNames(match[1], aliases);
  }
  for (const re of [DB_DEFAULT_IMPORT, DB_PLAIN_REQUIRE]) {
    re.lastIndex = 0;
    while ((match = re.exec(body)) !== null) {
      if (/^[A-Za-z_$][\w$]*$/.test(match[1])) aliases.add(match[1]);
    }
  }
  return aliases;
}

const DATABASE_CONFIG_SUFFIXES = [".env", ".env.local", ".env.example", ".env.production", ".env.development", ".ini", ".cfg", ".conf", ".properties"];

function carriesDatabaseConfig(filePath) {
  const base = String(filePath).toLowerCase().split("/").pop();
  return DATABASE_CONFIG_SUFFIXES.some((s) => base === s.slice(1) || base.endsWith(s)) || base.startsWith(".env");
}

function touchesDatabaseTarget(filePath, readHead, readBase) {
  if (DATABASE_PATH_EXACT.includes(filePath)) return true;
  if (DATABASE_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return true;
  const head = readHead(filePath);
  const base = readBase(filePath);
  const openable =
    isExecutablePath(filePath, head) || isExecutablePath(filePath, base) || carriesDatabaseConfig(filePath);
  if (openable && (fileCarriesDatabaseSignal(head) || fileCarriesDatabaseSignal(base))) return true;
  // The filename substring is the LAST resort, and only for a file that could execute or
  // configure, so a prose document named neon-*.md does not demand all ten stations.
  if (!openable) return false;
  const lower = filePath.toLowerCase();
  return DATABASE_PATH_SUBSTRINGS.some((needle) => lower.includes(needle));
}

// String escapes evaluate at runtime, so "console\x2eneon\x2etech" IS the prohibited host.
function codePoint(hex) {
  const code = parseInt(hex, 16);
  return code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeSourceEscapes(body) {
  return String(body)
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => codePoint(hex))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => codePoint(hex))
    .replace(/\\([0-7]{1,3})/g, (_, oct) => {
      const code = parseInt(oct, 8);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

// A station is not satisfied by pointing at prose. A document records a claim; the station
// must name the thing that does the work.
function stationIsDocumentationOnly(entries) {
  return entries.every((entry) => {
    const value = String(entry).trim().toLowerCase();
    return value.endsWith(".md") || value.endsWith(".txt");
  });
}

// Station content is judged with comments stripped: a file whose only claim to a station is
// a sentence about it is describing the station, not evidencing it.
function stationBody(body) {
  if (typeof body !== "string") return "";
  try {
    return stripSourceComments(body);
  } catch {
    return body;
  }
}

// Path existence is not evidence. Each station requires BOTH a path shape AND content that
// actually concerns that station.
const DATABASE_STATION_EVIDENCE = {
  vercel_integration: {
    describes: "the Vercel surface that binds the resource, and it must mention Vercel",
    accepts: (p, body) =>
      (p === "vercel.json" || p.startsWith(".github/workflows/")) && /vercel/i.test(stationBody(body)),
  },
  env_resolution: {
    describes: "where the connection variables are resolved, and it must name one",
    accepts: (p, body) =>
      /DATABASE_URL|POSTGRES(?:_PRISMA)?_URL|connectionString|postgres(?:ql)?:\/\//i.test(stationBody(body)),
  },
  db_target: {
    describes: "the module that classifies or selects the database target",
    accepts: (p, body) =>
      fileCarriesDatabaseSignal(stationBody(body)) || /canonical-neon-target|db-target|isCanonicalNeon/i.test(stationBody(body)),
  },
  prisma_pg: {
    describes: "the Prisma schema or a module that constructs a client",
    accepts: (p, body) =>
      (p.startsWith("prisma/") && /datasource|generator|model\s/i.test(stationBody(body))) ||
      fileCarriesDatabaseSignal(stationBody(body)),
  },
  migrations: {
    describes: "the migration surface: a migration file, sql/, or the Prisma schema",
    accepts: (p, body) =>
      ((p.startsWith("prisma/migrations/") || p.startsWith("sql/")) &&
        /\b(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|SELECT|BEGIN|COMMIT)\b/i.test(stationBody(body))) ||
      (p === "prisma/schema.prisma" && /datasource|model\s/i.test(stationBody(body))),
  },
  workflows_crons: {
    describes: "a workflow, schedule or cron route that touches the database",
    accepts: (p, body) =>
      (p.startsWith(".github/workflows/") || p === "vercel.json" || p.startsWith("app/api/cron/")) &&
      /DATABASE_URL|cron|schedule|prisma|migrat/i.test(stationBody(body)),
  },
  preview: {
    describes: "the machinery that produces PREVIEW proof, and it must name preview specifically",
    accepts: (p, body) =>
      (p.startsWith(".github/workflows/") || p.startsWith("scripts/release-safety/")) &&
      /\bpreview\b/i.test(stationBody(body)),
  },
  production: {
    describes: "the machinery that produces PRODUCTION proof, and it must name production specifically",
    accepts: (p, body) =>
      (p.startsWith(".github/workflows/") || p.startsWith("scripts/release-safety/")) &&
      /\bproduction\b|\bprod\b/i.test(stationBody(body)),
  },
  downstream_readers_writers: {
    describes: "code that actually consumes the database",
    accepts: (p, body) => fileCarriesDatabaseSignal(stationBody(body)),
  },
  tests: {
    describes: "a test file that exercises the changed database behaviour",
    accepts: (p, body) =>
      (p.startsWith("tests/") || p.includes("__tests__/") || /\.(test|spec)\.[tj]sx?$/.test(p)) &&
      (fileCarriesDatabaseSignal(stationBody(body)) ||
        /\b(?:database|prisma|neon|DATABASE_URL|migration|schema)\b/i.test(stationBody(body))),
  },
};

// The chain is declared in the pull-request description as a fenced block whose info string
// is database-chain, holding a JSON object: { "<station>": ["<repo path>", ...], ... }.
export function parseDatabaseChain(body) {
  const match = String(body || "").match(/(?:^|\n)[ \t]*(```|~~~)[ \t]*database-chain[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1/);
  if (!match) return { chain: null, error: null };
  try {
    const chain = JSON.parse(match[2]);
    if (!chain || typeof chain !== "object" || Array.isArray(chain)) return { chain: null, error: "the database-chain block is not a JSON object" };
    return { chain, error: null };
  } catch (error) {
    return { chain: null, error: "the database-chain block is not valid JSON: " + error.message };
  }
}

function checkDatabaseChain(ctx, databaseChanges, failures) {
  const stationList = DATABASE_IMPACT_STATIONS.join(" → ");
  const { chain, error } = parseDatabaseChain(ctx.body);
  if (!chain) {
    failures.push({
      rule: "database-chain",
      message: (error ? error + ". " : "") +
        "This pull request changes database-shaped paths, so its description must declare every station of the database chain " +
        "(Master §27.16.1) in a fenced ```database-chain block holding a JSON object of station → repo paths:\n  " + stationList,
      items: databaseChanges,
    });
    return;
  }

  const incomplete = DATABASE_IMPACT_STATIONS.filter((s) => !Array.isArray(chain[s]) || chain[s].length === 0);
  if (incomplete.length) {
    failures.push({ rule: "database-chain", message: "The database chain is incomplete. Every station is required for a database change:", items: incomplete.map((s) => "missing: " + s) });
  }

  const addedHere = new Set(ctx.changes.filter((c) => c.status === "A").map((c) => c.path));
  const unverified = [], freeText = [], proseOnly = [], unresolved = [], offClass = [];
  for (const station of DATABASE_IMPACT_STATIONS) {
    const entries = chain[station];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    if (stationIsDocumentationOnly(entries)) proseOnly.push(station);
    for (const entry of entries) {
      if (typeof entry !== "string") { freeText.push(station + ": " + JSON.stringify(entry)); continue; }
      const value = entry.trim();
      if (value.toUpperCase().startsWith("UNVERIFIED")) { unverified.push(station + ": " + value); continue; }
      if (!value.includes("/") && !value.includes(".")) { freeText.push(station + ": " + value); continue; }
      const baseKind = ctx.baseKind(value);
      if (baseKind === null) {
        if (!addedHere.has(value) || ctx.headKind(value) !== "blob") {
          unresolved.push(station + ": " + value);
          continue;
        }
      } else if (baseKind !== "blob") {
        offClass.push(station + ": " + value + "  (a directory is not evidence; name the file)");
        continue;
      }
      const evidence = DATABASE_STATION_EVIDENCE[station];
      const body = baseKind === "blob" ? ctx.readBase(value) : ctx.readHead(value);
      if (!evidence.accepts(value, body)) offClass.push(station + ": " + value + "  (station wants " + evidence.describes + ")");
    }
  }
  if (unverified.length) failures.push({ rule: "database-chain", message: "A database-chain station is UNVERIFIED. That is an honest state and it BLOCKS the change: establish it, or stop the change here:", items: unverified });
  if (freeText.length) failures.push({ rule: "database-chain", message: "A database-chain station carries free text rather than a repo path:", items: freeText });
  if (proseOnly.length) failures.push({ rule: "database-chain", message: "A database-chain station may not be satisfied by a document alone; name what does the work:", items: proseOnly });
  if (unresolved.length) failures.push({ rule: "database-chain", message: "The database chain names paths that exist neither on the PR base nor as files added by this pull request:", items: unresolved });
  if (offClass.length) failures.push({ rule: "database-chain", message: "A database-chain station names a real path that is not evidence FOR THAT STATION:", items: offClass });
}

// ---------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------

/**
 * ctx = {
 *   changes:   [{ status: "A" | "M" | "D", path }]   renames arrive as D + A
 *   readBase:  (path) => text | null                  file at the PR base
 *   readHead:  (path) => text | null                  file at the PR head
 *   baseKind:  (path) => "blob" | "tree" | null
 *   headKind:  (path) => "blob" | "tree" | null
 *   labels:    [{ name, addedBy }]                    labels currently on the pull request
 *   authorizers: Set<string>                          accounts whose labels count
 *   body:      string                                 pull-request description
 * }
 */
export function evaluate(ctx) {
  const failures = [];
  const changedPaths = [...new Set(ctx.changes.map((c) => c.path))];
  const authorized = new Set(ctx.labels.filter((l) => ctx.authorizers.has(l.addedBy)).map((l) => l.name));
  const ignoredLabels = ctx.labels.filter((l) => Object.values(AUTH_LABELS).includes(l.name) && !ctx.authorizers.has(l.addedBy));
  const labelNote = (label) => {
    const ignored = ignoredLabels.find((l) => l.name === label);
    return ignored ? " (the label is present but was added by " + ignored.addedBy + ", who is not an authorizer)" : "";
  };

  // 1. Retired direct-Neon paths may not return in any form.
  const revived = changedPaths.filter((p) => DELETED_DIRECT_NEON_PATHS.has(p) && ctx.headKind(p) !== null);
  if (revived.length) {
    failures.push({ rule: "retired-neon-path", message: "Deleted direct-Neon control paths may not return. Mallan reaches Neon only through the Vercel-managed Marketplace resource. No label authorizes this:", items: revived });
  }

  // 2. Direct Neon control-plane capability, judged on content, not on the filename.
  const capability = [];
  for (const filePath of changedPaths) {
    if (NEON_CAPABILITY_EXEMPT.has(filePath)) continue;
    const body = ctx.readHead(filePath);
    if (!body) continue;
    if (!isExecutablePath(filePath, body)) continue;
    const readings = capabilityScanReadings(body);
    const found = capabilityNeedles()
      .filter((n) => body.includes(n.signal) || readings.some((r) => r.includes(n.collapsed)))
      .map((n) => n.signal);
    if (found.length) capability.push(filePath + "  ->  " + found.join(", "));
  }
  if (capability.length) {
    failures.push({ rule: "neon-capability", message: "Direct Neon control-plane capability is prohibited, whatever the file is called. Mallan reaches Neon only through the Vercel-managed Marketplace resource. No label authorizes this:", items: capability });
  }

  // 3 + 4. Each authorization boundary needs its own label; the safety root is named by path.
  const needed = new Map();
  const need = (cls, item) => { if (!needed.has(cls)) needed.set(cls, []); needed.get(cls).push(item); };
  for (const p of changedPaths) if (SAFETY_ROOT_PATHS.has(p)) need("safety_root", p + "  (safety-root file)");
  for (const change of ctx.changes) {
    for (const [cls, why] of classifyChange(change, ctx.readBase, ctx.readHead)) need(cls, change.path + "  (" + why + ")");
  }
  for (const [cls, items] of needed) {
    const label = AUTH_LABELS[cls];
    if (!authorized.has(label)) {
      failures.push({
        rule: "authorization:" + cls,
        message: "This pull request makes a " + CHANGE_CLASSES[cls].boundary + " change. It needs Maya's explicit authorization, the label " + label + labelNote(label) + ". No other label authorizes it:",
        items,
      });
    }
  }

  // 5. Database-shaped changes declare the full chain.
  const databaseChanges = changedPaths.filter((p) => touchesDatabaseTarget(p, ctx.readHead, ctx.readBase));
  if (databaseChanges.length) checkDatabaseChain(ctx, databaseChanges, failures);

  return {
    ok: failures.length === 0,
    failures,
    changed: changedPaths.length,
    sensitiveClasses: [...needed.keys()],
    databaseChanges,
    authorizedLabels: [...authorized],
  };
}

// ---------------------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------------------

function fixtureContext(input) {
  const base = input.base || {}, head = input.head || {};
  const baseDirs = new Set(input.baseDirs || []), headDirs = new Set(input.headDirs || []);
  const kind = (files, dirs) => (p) => (typeof files[p] === "string" ? "blob" : dirs.has(p) ? "tree" : null);
  return {
    changes: input.changes || [],
    readBase: (p) => (typeof base[p] === "string" ? base[p] : null),
    readHead: (p) => (typeof head[p] === "string" ? head[p] : null),
    baseKind: kind(base, baseDirs),
    headKind: kind(head, headDirs),
    labels: input.labels || [],
    authorizers: new Set(input.authorizers || ["mallan67"]),
    body: input.body || "",
  };
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
}

function githubContext() {
  const repo = process.env.GITHUB_REPOSITORY;
  const number = process.env.PR_NUMBER;
  if (!repo || !number) throw new Error("GITHUB_REPOSITORY and PR_NUMBER are required");
  const pr = JSON.parse(gh(["api", `repos/${repo}/pulls/${number}`]));
  const baseSha = process.env.BASE_SHA || pr.base.sha;
  const headSha = process.env.HEAD_SHA || pr.head.sha;

  const changes = [];
  const rows = gh(["api", "--paginate", `repos/${repo}/pulls/${number}/files?per_page=100`, "--jq", '.[] | [.status, .filename, (.previous_filename // "")] | @tsv'])
    .split("\n").filter(Boolean).map((line) => line.split("\t"));
  for (const [status, filename, previous] of rows) {
    if (status === "added" || status === "copied") changes.push({ status: "A", path: filename });
    else if (status === "removed") changes.push({ status: "D", path: filename });
    else if (status === "renamed") { changes.push({ status: "D", path: previous }); changes.push({ status: "A", path: filename }); }
    else if (status !== "unchanged") changes.push({ status: "M", path: filename });
  }

  const cache = new Map();
  const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
  function readAt(sha, p) {
    const key = sha + ":" + p;
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      const meta = JSON.parse(gh(["api", `repos/${repo}/contents/${encodePath(p)}?ref=${sha}`]));
      if (Array.isArray(meta)) result = { kind: "tree", text: null };
      else if (meta.type !== "file") result = { kind: meta.type, text: null };
      else {
        const b64 = meta.encoding === "base64" && meta.content ? meta.content : JSON.parse(gh(["api", `repos/${repo}/git/blobs/${meta.sha}`])).content;
        result = { kind: "blob", text: Buffer.from(b64, "base64").toString("utf8") };
      }
    } catch (error) {
      const stderr = String(error.stderr || error.message);
      if (!/Not Found|HTTP 404/.test(stderr)) throw error; // anything but "absent" fails closed
      result = { kind: null, text: null };
    }
    cache.set(key, result);
    return result;
  }

  const lastLabeler = new Map();
  gh(["api", "--paginate", `repos/${repo}/issues/${number}/events?per_page=100`, "--jq", '.[] | select(.event == "labeled") | [.label.name, .actor.login] | @tsv'])
    .split("\n").filter(Boolean).forEach((line) => { const [name, actor] = line.split("\t"); lastLabeler.set(name, actor); });
  const labels = (pr.labels || []).map((l) => ({ name: l.name, addedBy: lastLabeler.get(l.name) || "unknown" }));

  const authorizers = new Set(String(process.env.MALLAN_SAFETY_AUTHORIZERS || "mallan67").split(",").map((s) => s.trim()).filter(Boolean));
  return {
    info: { repo, number, baseSha, headSha },
    changes,
    readBase: (p) => readAt(baseSha, p).text,
    readHead: (p) => readAt(headSha, p).text,
    baseKind: (p) => readAt(baseSha, p).kind,
    headKind: (p) => readAt(headSha, p).kind,
    labels,
    authorizers,
    body: pr.body || "",
  };
}

function report(result, info) {
  const lines = [];
  if (info) lines.push(`PR #${info.number} ${info.repo}  base ${info.baseSha}  head ${info.headSha}`);
  lines.push(`changed paths: ${result.changed}; sensitive classes: ${result.sensitiveClasses.join(", ") || "none"}; database-shaped: ${result.databaseChanges.length}; authorized labels: ${result.authorizedLabels.join(", ") || "none"}`);
  if (result.ok) {
    lines.push("\n[MALLAN PR SAFETY] PASS");
  } else {
    lines.push("\n[MALLAN PR SAFETY] FAIL");
    for (const f of result.failures) {
      lines.push("\n" + f.rule + ": " + f.message);
      for (const item of f.items || []) lines.push("  - " + item);
    }
  }
  return lines.join("\n") + "\n";
}

function main() {
  if (process.argv.includes("--stdin")) {
    const result = evaluate(fixtureContext(JSON.parse(fs.readFileSync(0, "utf8"))));
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  const ctx = githubContext();
  const result = evaluate(ctx);
  const out = report(result, ctx.info);
  if (result.ok) process.stdout.write(out);
  else { process.stderr.write(out); process.exitCode = 1; }
}

// Run only when executed, not when imported.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
