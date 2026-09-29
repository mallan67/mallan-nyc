#!/usr/bin/env node
/**
 * Mallan PR safety check — the complete security model.
 *
 * WHERE IT RUNS. .github/workflows/pr-safety.yml runs this file on pull_request_target from the
 * PR BASE. It reads the proposed change only through the GitHub API: the pull request's own code
 * is never checked out or run, so a pull request cannot change the check that judges it. It reads
 * nothing from the Execution State and does not care what the branch is called.
 *
 * 1. TRUST BOUNDARY — fail closed before any content is inspected.
 *    a. Same-repository pull requests only (head repository = this repository).
 *    b. The changed-file list must be complete: the files the API returns, each counted once, must
 *       equal the pull request's changed_files and stay under the API limit.
 *    c. Every changed path must read as a regular file on each side where it exists. A failed read,
 *       a symlink, a submodule or a directory fails; a missing file is never treated as harmless.
 *       A runnable file that is binary or too large to read fails.
 *    d. An authorized:* label counts only if an authorizer added it AFTER GitHub first saw the
 *       current head commit (and after any change of the base branch). On a new push the workflow
 *       removes the labels the pull request carried at that moment, and that evaluation ignores
 *       labels, so a label never authorizes code pushed after it was given.
 * 2. ABSOLUTE PROHIBITIONS — no label authorizes them.
 *    The retired direct-Neon paths; the direct Neon control-plane tokens in any changed text file
 *    (escaped, concatenated, percent-encoded or full-width forms included); and a workflow, action
 *    or status call, other than the canonical workflow, that uses a required check name.
 * 3. AUTHORIZATION BOUNDARIES — decided by WHERE the change is. Each needs its own label.
 *    SENSITIVE_SURFACES lists the places that can perform an operation: the database schema and
 *    target, Neon control, Vercel configuration, cron routes, publishing surfaces, storage clean-up
 *    helpers, and every operator program (scripts/, tools/, shell, containers, infrastructure).
 *    The safety root is everything that decides what is checked or who decides: this check and
 *    its tests, everything under .github/, the npm, TypeScript, Jest and Babel configuration, the
 *    compliance rules (compliance/), every file the required pr-check runs and every data/ file it
 *    names (resolved from the BASE), the Master, and the agent instructions and agent tool
 *    configuration.
 * 4. CONTENT TRIPWIRES — a short list of well-known operations (SIGNATURES), matched in runnable
 *    non-test files. One counts when the pull request's version of a file contains it more often
 *    than the base version, with whitespace and line breaks collapsed. No language is parsed.
 *    They catch the usual spellings in application code; they cannot prove a file is harmless.
 * 5. DECLARATIONS bound to the diff — every new runnable file is named in the PR description
 *    (Master §27.15), and a database change declares the ten-station chain (§27.16.1), which must
 *    name each changed database file and is proven on the proposed head.
 *
 * LIMITS, stated so nobody overstates them. Content tripwires are not a boundary: an equivalent
 * API, an unusual spelling, a value built far away, a runtime-decoded string, or a guard removed
 * without changing the operation's text is not seen in application code; only the path rules and
 * review cover it. A required check can be reported by any GitHub Actions job with that name, on
 * any branch, so this check flags a same-named job only inside the pull request. While agents
 * operate through Maya's own account (mallan67), a label cannot prove that Maya added it; it
 * records an authorization for the commit it was given on.
 *
 * Usage:
 *   node scripts/ci/pr-safety-check.mjs           CI: judges the pull request through `gh`
 *   node scripts/ci/pr-safety-check.mjs --stdin   tests: evaluates a JSON fixture from stdin
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------
// Labels, reserved checks, safety root
// ---------------------------------------------------------------------------------------

// One label per explicit Maya authorization boundary (Master §27.21), plus operator programs.
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
  operator: "authorized:operator",
  safety_root: "authorized:safety-root",
};

export const BOUNDARIES = {
  schema_migration: "schema / migration / backfill",
  production_database: "Production database / Neon mutation",
  preview_neon: "Development / Preview Neon creation or control",
  environment: "Vercel environment / resource mutation",
  credential_rotation: "credential rotation",
  destructive_data: "destructive data / R2 / storage operations",
  manual_cron: "manual cron / reconciliation execution",
  production_deploy: "Production deployment / alias mutation",
  provider_publishing: "provider publishing / syndication",
  operator: "operator program: code a person runs by hand against real systems",
  safety_root: "safety root: the checks, their rules, and the system authority",
};

// The required checks and the only workflow allowed to declare each of them.
export const RESERVED_CHECKS = {
  "pr-check": ".github/workflows/pr-check.yml",
  "pr-safety": ".github/workflows/pr-safety.yml",
};

// The safety root. Compared case-insensitively: on Windows `claude.md` and `CLAUDE.md` are one file.
export const SAFETY_ROOT_FILES = new Set([
  "scripts/ci/pr-safety-check.mjs",
  "tests/runtime/pr-safety-check.test.ts",
  "tests/runtime/reserved-check-names.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  "vercel.json",
  "package.json",
  "package-lock.json",
  ".npmrc",
  "tsconfig.json",
  "next.config.js",
  "mallan-platform-master-plan.md",
  ".mcp.json",
].map((p) => p.toLowerCase()));
const SAFETY_ROOT_PATTERNS = [
  ["GitHub configuration, workflow or action", /^\.github\//i],
  ["test-runner configuration", /(?:^|\/)jest\.config\.(?:[cm]?[jt]s|json)$/i],
  ["compiler configuration", /^tsconfig(?:\.[\w-]+)?\.json$|(?:^|\/)(?:babel\.config\.(?:[cm]?js|json)|\.babelrc(?:\.[cm]?js|\.json)?|\.swcrc)$/i],
  ["agent instructions or agent tool configuration", /(?:^|\/)(?:claude|agents|gemini)\.md$|^\.claude\//i],
  ["compliance rules", /^compliance\//i],
];

// ---------------------------------------------------------------------------------------
// Absolute prohibitions (unchanged from the retired controller)
// ---------------------------------------------------------------------------------------

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
// out to neonctl. Those are the signatures of direct Neon control, matched against file content
// (four readings, escapes decoded), so a new name does not help.
const DIRECT_NEON_CAPABILITY_SIGNALS = [
  "console.neon.tech",
  "api.neon.tech",
  "neonctl",
  "NEON_API_KEY",
  "NEON_PREVIEW_API_KEY",
  "NEON_ADMIN_KEY",
  "NEON_ROTATION_ADMIN"
];

// The check and its tests must name the signals and patterns in order to enforce and prove them.
// All three are in the safety root, so the exemption itself cannot change without Maya's label.
const NEON_CAPABILITY_EXEMPT = new Set([
  "scripts/ci/pr-safety-check.mjs",
  "tests/runtime/pr-safety-check.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts"
]);

// Prose is not scanned for Neon tokens: documents record the retired architecture.
const PROSE = /\.(?:md|mdx|rst|adoc)$/i;

// Every format in this repository that can run, configure a run, or carry a connection.
const EXECUTABLE_EXTENSIONS = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".bat", ".cmd", ".tf", ".tfvars", ".hcl", ".ipynb",
  ".yml", ".yaml", ".toml",
  ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".py", ".rb", ".go", ".rs", ".java", ".php",
  ".sql", ".prisma", ".dockerfile"
];
const EXECUTABLE_BASENAMES = ["dockerfile", "makefile", "procfile", "justfile", "package.json"];
const EXECUTABLE_PREFIXES = [".githooks/", ".husky/"];

// ---------------------------------------------------------------------------------------
// Authorization boundaries: where the change is
// ---------------------------------------------------------------------------------------

const TEST_PATH = /(^|\/)(?:tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

// [class, description, path pattern, also applies when the file is deleted]
export const SENSITIVE_SURFACES = [
  ["schema_migration", "Prisma schema, migrations, seed or SQL", /^prisma\//, true],
  ["schema_migration", "SQL under sql/", /^sql\//, true],
  ["schema_migration", "Prisma CLI configuration", /^prisma\.config\.[cm]?[jt]s$/, true],
  ["production_database", "Production database target and client", /^lib\/ops\/(?:db-target|canonical-neon-target)\.[cm]?[jt]s$|^lib\/(?:db|prisma)\.[cm]?[jt]s$|^scripts\/ci\/assert-canonical-neon-target\.mjs$/, true],
  ["preview_neon", "Neon control library", /^lib\/neon\//, false],
  ["environment", "Vercel project configuration", /^vercel\.json$|^\.vercel\//, true],
  ["production_deploy", "Vercel build, cron and deployment configuration", /^vercel\.json$/, true],
  ["destructive_data", "storage or retention clean-up helper", /^lib\/retention\/|^lib\/(?:[^/]+\/)*[^/]*(?:purge|wipe|prune|orphan|cleanup)[^/]*\.[cm]?[jt]s$/i, false],
  ["manual_cron", "cron execution route", /^app\/api\/cron\//, false],
  ["provider_publishing", "syndication or publishing surface", /^(?:app|lib)\/(?:[^/]+\/)*(?:syndication|syndicate|publish(?:ing|er)?)(?:\/|[-_.])/i, false],
  ["provider_publishing", "outbound feed route", /^app\/api\/(?:[^/]+\/)*feeds?(?:\/|-[\w-]+\/)/i, false],
  ["operator", "operator program under scripts/, tools/ or bin/", /^(?:scripts|tools|bin)\//, false],
  ["operator", "shell, container or infrastructure program", /\.(?:sh|bash|zsh|ps1|psm1|bat|cmd|tf|tfvars|hcl)$|(?:^|\/)(?:makefile|justfile|procfile|containerfile|dockerfile(?:\.[\w-]+)?|[\w.-]+\.dockerfile|(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml)$|^\.githooks\/|^\.husky\//i, false],
];

// ---------------------------------------------------------------------------------------
// Content tripwires: well-known operations, in any runnable non-test file
// ---------------------------------------------------------------------------------------

// The canonical Production database identity (repository CLAUDE.md). Naming it in code points
// that code at Production.
const PRODUCTION_DB_IDENTITY = /\b(?:neon-green-school|store_K9l79ICRUTMsiRh2|hidden-mountain-87248164|br-crimson-frog-adr7g9gt|ep-cold-waterfall-adno3ao2)\b/;

// Program tokens tolerate a pinned version (vercel@39) and global options before the subcommand
// (quoted values, ${{ }} expressions, variables). Every gap is bounded, so no signature can span
// a whole file and none can backtrack badly.
const VERCEL = String.raw`\b(?:vercel|vc)(?:@[\w.^~-]+)?(?![\w-])`;
const OPT_VALUE = String.raw`(?:"[^"]*"|'[^']*'|\$\{\{[^}]*\}\}|[^\s"'-]\S*)`;
const OPTS = String.raw`(?:\s+(?:-{1,2}(?!-)\w[\w-]*(?:[= ]${OPT_VALUE})?|"?\$\{?[\w@[\]]+\}?"?|\$\{\{[^}]*\}\}|_ARG_)){0,20}`;
const PRISMA = String.raw`\bprisma(?:@[\w.^~-]+)?`;
const PROD_VALUE = String.raw`(?:["']?production\b|\$\{\{[^}]{0,120}production[^}]{0,120}\}\})`;
const PROD_FLAG = String.raw`(?:--prod(?:uction)?\b|--target[= ]${PROD_VALUE})`;
const METHOD_W = String.raw`(?:method\s*[:=]\s*["'](?:PUT|PATCH|DELETE)["']|request\s*\(\s*["'](?:PUT|PATCH|DELETE)["']|(?:-X|--request)\s+["']?(?:PUT|PATCH|DELETE)\b|-Method\s+["']?(?:Put|Patch|Delete)\b)`;
const METHOD_POST = String.raw`(?:method\s*[:=]\s*["']POST["']|request\s*\(\s*["']POST["']|(?:-X|--request)\s+["']?POST\b|-Method\s+["']?Post\b)`;
const HTTP_WRITE = String.raw`(?:${METHOD_W}|\b(?:axios|got|ky|httpx|requests|session|http|client|api)\s*\.\s*(?:put|patch|delete)\s*\()`;
const ANY_WRITE = String.raw`(?:${METHOD_W}|${METHOD_POST}|\.\s*(?:put|patch|delete|post)\s*\()`;
const GAP = String.raw`[\s\S]{0,200}?`;
const rx = (source, flags = "") => new RegExp(source, flags);

// [name, pattern, requires (optional: the file must also contain this)]
export const SIGNATURES = {
  schema_migration: [
    ["prisma migrate / db push", rx(`${PRISMA}\\s+(?:migrate\\s+(?:dev|deploy|reset|resolve|\\$)|db\\s+(?:push|execute))`)],
    // Upper-case SQL keywords, or the exact lower-case statement: UI text such as "Create view"
    // is not DDL.
    ["schema DDL", /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+|TEMP(?:ORARY)?\s+|UNLOGGED\s+)?(?:TABLE|INDEX|COLUMN|SCHEMA|VIEW|TYPE|EXTENSION|MATERIALIZED\s+VIEW|FUNCTION|TRIGGER|SEQUENCE|POLICY|DATABASE|DOMAIN)\b|\b(?:alter|create|drop)\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:table|index|schema|extension|materialized\s+view|function|trigger|sequence|policy)\b(?!-)/],
  ],
  production_database: [
    ["canonical Production database identity", PRODUCTION_DB_IDENTITY],
    ["Neon connection host", /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech\b/i],
    ["prisma migrate deploy", rx(`${PRISMA}\\s+migrate\\s+(?:deploy\\b|\\$)`)],
    ["data-loss flag", /\baccept-data-loss\b/],
    ["database URL taken from a stored secret", /\b\w*(?:DATABASE_URL|DIRECT_URL|POSTGRES\w*URL)\w*\b["']?\s*[:=]\s*(?:[|>][-+]?\s*)?["']?\$\{\{[^}]{0,200}\bsecrets\s*[.[]/],
    ["Production environment pulled locally", rx(`${VERCEL}${OPTS}\\s+(?:env\\s+)?pull\\b[^\\n]{0,200}?(?:--environment[= ]${PROD_VALUE}|\\s-e\\s+production|\\sproduction\\b)`)],
  ],
  preview_neon: [
    ["Neon branch/endpoint lifecycle call", /\bneon\b[\s\S]{0,60}?\b(?:create|delete|reset|restore|prune|provision)[A-Za-z]*(?:Branch|Branches|Endpoint|Project|Database|Compute)\b/i],
    ["Neon branch/endpoint lifecycle operation", /\b(?:create|delete|reset|restore|prune|provision)\w*\s+(?:a\s+|the\s+)?(?:neon\s+)?(?:preview\s+|dev(?:elopment)?\s+)?(?:branch|branches|endpoint|compute)\b[\s\S]{0,60}?\bneon\b/i],
    ["Neon management SDK call", /\.(?:create|delete|restore|reset|update|start|suspend|restart)Project(?:Branch|Endpoint|Database|Role)\w*\s*\(|\b(?:start|suspend|restart)ProjectEndpoint\b/],
    ["Neon management API client", /['"]@neondatabase\/api-client['"]|\bNeonAPI\b|\bneon_api\b/],
    ["Vercel integration install/remove", rx(`${VERCEL}${OPTS}\\s+integration\\s+(?:add|remove|install|uninstall)\\b`)],
    ["Terraform Neon resource", /\bresource\s+"neon_\w+"/],
  ],
  environment: [
    ["vercel CLI environment/resource mutation", rx(`${VERCEL}${OPTS}\\s+(?:env|domains|dns|certs|secrets|project|projects|git|blob|edge-config|integration)\\s+(?:add|rm|remove|update|connect|disconnect|create|delete|install|uninstall)\\b`)],
    ["Vercel API environment/resource endpoint", /api\.vercel\.com\/v\d+\/(?:env\b|domains\b|edge-config|storage|integrations)|\/v\d+\/projects\/[^\s'"`]+\/(?:env|domains)\b/],
    ["Vercel SDK environment/resource call", /\.(?:createProjectEnv|editProjectEnv|removeProjectEnv|addProjectDomain|removeProjectDomain|createEdgeConfig\w*|updateEdgeConfig\w*|patchEdgeConfig\w*|createProject|updateProject|deleteProject)\s*\(/],
    ["Terraform Vercel resource", /\bresource\s+"vercel_(?:project_environment_variable|shared_environment_variable|project_domain|dns_record|project|edge_config\w*)"/],
  ],
  credential_rotation: [
    ["password reset", /\breset_password\b/i],
    ["GitHub secret write", /\bgh\s+secret\s+(?:set|delete|remove)\b|\/(?:actions|dependabot|codespaces|environments\/[^/\s'"`]+)\/secrets\b|\b(?:createOrUpdate|delete)\w*Secret\s*\(/],
    ["database role password change", /\bALTER\s+(?:ROLE|USER)\b[\s\S]{0,200}?\bPASSWORD\b/i],
  ],
  destructive_data: [
    ["object-storage delete (R2/S3 SDK)", /\bDelete(?:Object|Objects|Bucket)Command\b|\.delete(?:Object|Objects|Bucket)\s*\(|\.delete_(?:object|objects|bucket)\s*\(/],
    ["object-storage delete (CLI)", rx(`\\bwrangler${OPTS}\\s+r2\\s+(?:object|bucket)\\s+delete\\b|\\baws${OPTS}\\s+s3\\s+(?:rm|rb)\\b|\\baws${OPTS}\\s+s3api\\s+delete-|\\brclone${OPTS}\\s+(?:delete|purge|deletefile)\\b`)],
    ["R2 binding delete", /\benv\s*\.\s*[A-Z][A-Z0-9_]*\s*\.\s*delete\s*\(/],
    ["Vercel Blob delete", /\bdel\s*\(/, /@vercel\/blob/],
    // Upper-case SQL, or the exact lower-case statement: the Tailwind classes `truncate` /
    // `table-cell` and UI text such as "Delete from favorites" are not SQL.
    ["destructive SQL", /\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?["`\w.]+|\bDROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN|INDEX|VIEW)\b|\bDELETE\s+FROM\b|\btruncate\s+table\b(?!-)|\bdrop\s+(?:table|schema|database)\b(?!-)|\bdelete\s+from\s+["`\w.]+\s*(?:where\b|;|["'`)]|$)/],
    ["unconditional deleteMany", /\.deleteMany\s*\(\s*(?:\{\s*(?:where\s*:\s*(?:\{\s*\}|undefined)\s*,?\s*)?\}\s*)?\)/],
    ["data-loss reset", rx(`\\baccept-data-loss\\b|${PRISMA}\\s+migrate\\s+reset\\b|--force-reset\\b`)],
  ],
  manual_cron: [
    ["workflow run dispatched", /\bcreateWorkflowDispatch\b|\/actions\/workflows\/[^\s'"`]+\/dispatches\b|\bgh\s+workflow\s+run\b|\brepository_dispatch\b|\/dispatches\b/],
  ],
  production_deploy: [
    // `vercel deploy` without --prod makes a Preview deployment; Production needs --prod or
    // --target=production, or a promote/rollback/redeploy/alias of an existing deployment.
    ["vercel --prod", rx(`${VERCEL}[^\\n]{0,200}?[\\s'"\`\\[,(=]${PROD_FLAG}|${PROD_FLAG}[^\\n]{0,80}?${VERCEL}`)],
    ["vercel promote/rollback/redeploy/alias", rx(`${VERCEL}${OPTS}\\s+(?:promote|rollback|redeploy|alias|rolling-release)\\b`)],
    ["Vercel alias/promote/rollback endpoint", /\/v\d+\/(?:aliases\b|projects\/[^\s'"`]+\/(?:promote|rollback)\b|deployments\/[^\s'"`]+\/aliases\b)/],
    ["Production deployment through the Vercel SDK or REST API", rx(`(?:\\bcreateDeployment\\s*\\(|\\/v\\d+\\/deployments\\b)${GAP}\\btarget["']?\\s*[:=]\\s*["'\`]production\\b|\\btarget["']?\\s*[:=]\\s*["'\`]production\\b${GAP}(?:\\bcreateDeployment\\s*\\(|\\/v\\d+\\/deployments\\b)`)],
    ["Vercel SDK alias/promote call", /\.(?:assignAlias|deleteAlias|requestPromote|requestRollback)\s*\(|\bdeployments\s*\.\s*(?:promote|rollback)\w*\s*\(/],
    ["deploy hook", /\/v1\/integrations\/deploy\/|\b\w*DEPLOY_HOOK\w*\b/],
    ["third-party Vercel deploy action", /\bamondnet\/vercel-action\b/],
  ],
  provider_publishing: [
    // A portal is a publishing target only when the code reaches its feed/upload/API surface; a
    // profile link or a testimonial that names the portal is not publishing.
    ["listing-portal feed/upload/API endpoint", /\b(?:streeteasy|zillow|trulia|renthop|nakedapartments|hotpads|apartments)\.(?:com|net)\/[^\s'"`]*\b(?:feeds?|upload|ingest|api|syndication)\b|\b(?:api|feeds?|upload|partner|ftp|sftp|syndication)\.(?:streeteasy|zillow|trulia|renthop|nakedapartments|hotpads|apartments)\.(?:com|net)\b/i],
    ["feed delivery over FTP/SFTP", /['"](?:ssh2-sftp-client|basic-ftp|ftp|ssh2)['"]|\bs?ftp:\/\/|\bftplib\b|\bFTP_TLS\b|\bstorbinary\b|\bparamiko\b|\bpysftp\b|\b(?:lftp|sftp|scp)\s+(?:-\w|\S+@)/],
    ["RLS/REBNY submission call", /\b(?:submit|publish|transmit|syndicate|push|post|upload|send)\w*(?:Rls|RLS|Rebny|REBNY)\w*\s*\(|\b(?:rls|rebny)\w*\s*\.\s*(?:submit|publish|transmit|send|push|post|upload)\w*\s*\(/],
    // Cotality/Trestle is read-only for Mallan: a PUT/PATCH/DELETE toward it, or any write
    // (including POST) to its OData resources. The OAuth token request is not a write.
    ["write to the Cotality/Trestle provider", rx(`\\b(?:trestle|cotality)\\w*${GAP}${HTTP_WRITE}|${HTTP_WRITE}${GAP}\\b(?:trestle|cotality)|\\/odata\\/${GAP}${ANY_WRITE}|${ANY_WRITE}${GAP}\\/odata\\/`, "i")],
  ],
  safety_root: [
    ["ruleset / branch-protection API", /\/rulesets\b|\/branches\/[^\s'"`]+\/protection\b|["'`]\/protection\b|\brequired_status_checks\b|\bbypass_actors\b|\benforce_admins\b/],
    ["ruleset / branch-protection SDK call", /\b(?:update|delete|set|remove|add|create)(?:Admin)?(?:BranchProtection|StatusCheck\w*|RepoRuleset|OrgRuleset|Ruleset|PullRequestReviewProtection|CommitSignatureProtection)\b|\b(?:create|update|delete)(?:BranchProtectionRule|RepositoryRuleset)\b/],
    ["Terraform branch-protection or ruleset resource", /\bresource\s+"github_(?:branch_protection\w*|repository_ruleset|organization_ruleset)"/],
  ],
};

// ---------------------------------------------------------------------------------------
// Introduced = occurs more often in the PR's version than in the base version
// ---------------------------------------------------------------------------------------

// Three readings of a whole file, all with whitespace and line breaks collapsed:
//   flat    as written, with shell/JS (\), PowerShell (`) and batch (^) line continuations
//           joined the way those languages join them: with nothing in between;
//   joined  string concatenations joined: "a" + "b" -> "ab", "a" + x + "b" -> "a${x}b", and
//           Python's adjacent literals "a" "b" -> "ab";
//   argv    command argument lists read as the command line they build:
//           ("vercel", ["deploy", "--prod"]) -> ("vercel deploy --prod").
export function readingsOf(filePath, text) {
  let flat = String(text).replace(/\\\r?\n/g, "");
  if (/\.(?:ps1|psm1)$/i.test(filePath)) flat = flat.replace(/`\r?\n/g, "");
  if (/\.(?:bat|cmd)$/i.test(filePath)) flat = flat.replace(/\^\r?\n/g, "");
  flat = flat.replace(/\s+/g, " ");
  let joined = flat;
  for (let k = 0; k < 4; k += 1) {
    const next = joined
      .replace(/(["'`]) ?\+ ?(["'`])/g, "")
      .replace(/(["'`]) ?\+ ?([\w$.[\]()?!]+) ?\+ ?(["'`])/g, "${$2}");
    if (next === joined) break;
    joined = next;
  }
  if (/\.py$/i.test(filePath)) joined = joined.replace(/(["']) [rRbBuUfF]{0,2}(["'])/g, "");
  const argv = joined
    .replace(/["'`] ?, ?\[? ?["'`]/g, " ")
    .replace(/["'`] ?, ?(?:\.\.\.)?[\w$.[\]()]+ ?, ?["'`]/g, " _ARG_ ");
  return [flat, joined, argv];
}

const GLOBALS = new Map();
function occurrences(re, text) {
  if (!GLOBALS.has(re)) GLOBALS.set(re, new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
  const g = GLOBALS.get(re);
  g.lastIndex = 0;
  let n = 0, m;
  while ((m = g.exec(text)) !== null) { n += 1; if (!m[0].length) g.lastIndex += 1; }
  return n;
}

function introduces(re, headReadings, baseReadings) {
  for (let i = 0; i < headReadings.length; i += 1) {
    if (!re.test(headReadings[i])) continue;
    if (occurrences(re, headReadings[i]) > occurrences(re, baseReadings[i])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Files the required pr-check executes (resolved from the BASE, which the PR cannot change)
// ---------------------------------------------------------------------------------------

function normalizePath(p) {
  const out = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return out.join("/");
}

export function requiredCheckFiles(readBase) {
  const workflow = readBase(RESERVED_CHECKS["pr-check"]);
  const pkgText = readBase("package.json");
  if (typeof workflow !== "string" || typeof pkgText !== "string") return { files: new Set(), error: "the base pr-check workflow or package.json could not be read" };
  let scripts;
  try { scripts = JSON.parse(pkgText).scripts || {}; } catch { return { files: new Set(), error: "the base package.json is not valid JSON" }; }
  const files = new Set();
  const seen = new Set();
  // npm ci runs the install lifecycle scripts; every `npm run X` runs preX, X and postX.
  const commands = [workflow, ...["preinstall", "install", "postinstall", "prepare"].map((h) => scripts[h]).filter(Boolean)];
  while (commands.length) {
    const cmd = commands.shift();
    for (const m of cmd.matchAll(/\bnpm\s+run(?:-script)?\s+([\w:.-]+)/g)) {
      for (const name of ["pre" + m[1], m[1], "post" + m[1]]) {
        if (typeof scripts[name] === "string" && !seen.has(name)) { seen.add(name); commands.push(scripts[name]); }
      }
    }
    for (const m of cmd.matchAll(/(?:^|[\s"'=])(?:\.\/)?((?:scripts|tools|prisma|compliance|config)\/[\w./-]+\.(?:[cm]?[jt]s|json|sql))\b/g)) files.add(normalizePath(m[1]));
  }
  // Files the Jest configuration loads (setup files, environments, transforms). Jest configs are
  // themselves in the safety root by name.
  const jestQueue = ["jest.config.js"], jestSeen = new Set();
  while (jestQueue.length && jestSeen.size < 100) {
    const config = jestQueue.shift();
    if (jestSeen.has(config)) continue;
    jestSeen.add(config);
    const text = readBase(config);
    if (typeof text !== "string") continue;
    const dir = config.split("/").slice(0, -1).join("/");
    for (const m of text.matchAll(/["']<rootDir>\/([\w./-]+\.\w+)["']|["'](\.{1,2}\/[\w./-]+\.\w+)["']/g)) {
      for (const candidate of m[1] ? [m[1], normalizePath(dir + "/" + m[1])] : [normalizePath(dir + "/" + m[2])]) {
        if (typeof readBase(candidate) !== "string") continue;
        if (/jest\.config\.\w+$/.test(candidate)) jestQueue.push(candidate); else files.add(candidate);
        break;
      }
    }
  }
  // The local modules those scripts load, followed to the end: every relative require, import
  // (including a bare `import "./x"`) or dynamic import that stays inside scripts/, tools/,
  // compliance/ or config/. Product code under lib/ and app/ is covered by the tests themselves;
  // compliance/ is rooted as a whole, and the data/ files the validators read are added below.
  const queue = [...files];
  while (queue.length && files.size < 2000) {
    const f = queue.shift();
    const text = readBase(f);
    if (typeof text !== "string") continue;
    const dir = f.split("/").slice(0, -1).join("/");
    for (const m of text.matchAll(/(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = normalizePath(dir + "/" + m[1]);
      if (!/^(?:scripts|tools|compliance|config)\//.test(target)) continue;
      for (const candidate of [target, target + ".js", target + ".mjs", target + ".cjs", target + ".ts", target + ".json", target + "/index.js", target + "/index.ts"]) {
        if (typeof readBase(candidate) !== "string") continue;
        if (!files.has(candidate)) { files.add(candidate); queue.push(candidate); }
        break;
      }
    }
  }
  // The data/ files those checks read: every data/ path a rooted file names, written whole
  // ('data/rls-x.json') or as path.join pieces ('data', 'rls-x.json'). A name without an extension
  // is a directory, and everything under it is rooted. A file name built at run time is not seen.
  const data = new Set();
  for (const f of files) {
    const text = readBase(f);
    if (typeof text !== "string") continue;
    for (const m of text.matchAll(/["'`](data\/[\w./-]+)["'`]/g)) data.add(normalizePath(m[1]));
    for (const m of text.matchAll(/["']data["']((?:\s*,\s*["'][\w.-]+["'])+)/g)) data.add("data/" + [...m[1].matchAll(/["']([\w.-]+)["']/g)].map((x) => x[1]).join("/"));
  }
  for (const d of data) files.add(d);
  return { files, error: null };
}

// Whether a path is a file the required check runs or reads, or lies under a data/ directory it reads.
export function inRequiredRoot(files, p) {
  if (files.has(p)) return true;
  for (const f of files) if (f.startsWith("data/") && !/\.\w+$/.test(f) && p.startsWith(f + "/")) return true;
  return false;
}

// ---------------------------------------------------------------------------------------
// One change: the boundaries it crosses
// ---------------------------------------------------------------------------------------

function pathSurfaces(p, deleted) {
  const out = [];
  for (const [cls, why, re, onDelete] of SENSITIVE_SURFACES) if (re.test(p) && (onDelete || !deleted)) out.push([cls, why]);
  return out;
}

export function isSafetyRoot(p) {
  const lower = p.toLowerCase();
  return SAFETY_ROOT_FILES.has(lower) || SAFETY_ROOT_PATTERNS.some(([, re]) => re.test(p));
}

/**
 * The authorization classes one change needs, each with the rule that fired: [[class, why], ...].
 * readBase/readHead return a file's text on the base/head side, or null. `executable` is the
 * head file's Git executable bit.
 */
export function classifyChange(change, readBase, readHead, executable = false) {
  const out = [];
  const deleted = change.status === "D";
  const head = deleted ? null : readHead(change.path);
  // Where the change is. A rename changes both its old and its new path.
  const surfaces = pathSurfaces(change.path, deleted);
  if (change.status === "R") surfaces.push(...pathSurfaces(change.previousPath, true).map(([c, w]) => [c, w + " (moved from " + change.previousPath + ")"]));
  if (!deleted && (executable || hasShebang(head))) surfaces.push(["operator", "a program marked executable or started with #!"]);
  // Tests and the safety root carry their own rules; they are not operator programs.
  const skipOperator = TEST_PATH.test(change.path) || isSafetyRoot(change.path);
  out.push(...surfaces.filter(([cls]) => cls !== "operator" || !skipOperator));
  if (deleted) return out;

  // Content tripwires: runnable, non-test files only.
  if (typeof head !== "string" || TEST_PATH.test(change.path) || !isExecutablePath(change.path, head)) return out;
  const base = change.status === "A" ? "" : readBase(change.previousPath || change.path) || "";
  const hr = readingsOf(change.path, head), br = readingsOf(change.path, base);
  for (const [cls, sigs] of Object.entries(SIGNATURES)) {
    for (const [name, re, requires] of sigs) {
      if (requires && !requires.test(hr[0])) continue;
      if (introduces(re, hr, br)) { out.push([cls, name]); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Direct-Neon capability scan (carried over from the retired controller)
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
        // A quoted JS string cannot span a raw line break, so a mis-read quote ends at the line
        // end instead of swallowing the rest of the file.
        if (text[i] === String.fromCharCode(10)) break;
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
function neonCapabilitySignals(body) {
  const readings = [
    collapseForCapabilityScan(body),
    collapseForCapabilityScan(stripSourceComments(body)),
    collapseForCapabilityScan(stripBlockCommentsOnly(body)),
    collapseForCapabilityScan(stripSourceComments(body, { hashComments: false }))
  ];
  return DIRECT_NEON_CAPABILITY_SIGNALS.filter((signal) => {
    const collapsed = signal.replace(/[\s.\-_]/g, "").toLowerCase();
    return body.includes(signal) || readings.some((r) => r.includes(collapsed));
  });
}

// String escapes evaluate at runtime, so "console\x2eneon\x2etech" IS the prohibited host; so do
// URL percent-escapes, and full-width letters that URL parsers fold to ASCII (NFKC).
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
    })
    .replace(/%([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .normalize("NFKC");
}

// ---------------------------------------------------------------------------------------
// Which files can run
// ---------------------------------------------------------------------------------------

export function isExecutablePath(filePath, body) {
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
// document, because a JSON key may be escaped. JSON that cannot be read is treated as runnable.
const RUNNABLE_JSON_KEY = /^(?:scripts|commands?|.*(?:command|cmd))$/i;

function declaresRunnableCommand(body) {
  if (typeof body !== "string") return true;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return true;
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

// A change is database-shaped when it changes the database's infrastructure (these paths), or
// changes how a file connects to the database: the connection variables, URLs, clients and
// drivers it names (DATABASE_CONNECTION). Queries made through the existing canonical client are
// reviewed through the impact graph (§27.16), not this chain.
const DATABASE_PATHS = /^(?:prisma|sql|lib\/db|lib\/ops|lib\/neon|lib\/retention|app\/api\/cron)\/|^(?:lib\/(?:prisma|db)\.[cm]?[jt]s|vercel\.json|prisma\.config\.[cm]?[jt]s)$|(?:^|\/)\.env(?:\.[\w.-]+)?$/;
const DATABASE_CONNECTION = /\b(?:ASSISTANT_)?DATABASE_URL\w*|\bPOSTGRES\w*_URL\w*|\bDIRECT_URL\b|\bconnectionString\b|\bpostgres(?:ql)?:\/\/[^\s'"`]*|\bnew\s+(?:[A-Za-z_$][\w$]*\.)*(?:PrismaClient|Pool)\s*\(|['"](?:pg|postgres|@neondatabase\/serverless)['"]|\blib\/ops\/db-target\b|\bcanonical-neon-target\b/g;
const connectionTokens = (text) => (String(text).match(DATABASE_CONNECTION) || []).sort().join("\n");

function databaseShaped(change, readBase, readHead) {
  if (DATABASE_PATHS.test(change.path) || (change.previousPath && DATABASE_PATHS.test(change.previousPath))) return true;
  const head = change.status === "D" ? "" : readHead(change.path) || "";
  const base = change.status === "A" ? "" : readBase(change.previousPath || change.path) || "";
  if (TEST_PATH.test(change.path) || !isExecutablePath(change.path, head || base)) return false;
  return connectionTokens(readingsOf(change.path, head)[0]) !== connectionTokens(readingsOf(change.path, base)[0]);
}

// Station evidence: what makes a file relevant to the database at all.
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
  /\bDATABASE_URL\b/,
  /\bPOSTGRES(?:_PRISMA)?_URL(?:_NON_POOLING|_NO_SSL)?\b/,
  /\bconnectionString\b/,
  /\bpostgres(?:ql)?:\/\//,
  /\b(?:prisma|db|tx|client)\s*\.\s*\$?(?:transaction|queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe|connect|disconnect)\b/,
  /\b(?:prisma|db|tx)\s*\.\s*[a-z][\w]*\s*\.\s*(?:findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(/,
  /\b(?:idx_display_yn|internet_[a-z_]*display_yn|participant_only|owner_opt_out)\b/,
  /\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+(?:TABLE|INDEX|COLUMN|SCHEMA|DATABASE|VIEW)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM)\b/i,
  /\bprisma\s+(?:migrate|db\s+push|generate)\b/,
  /['"]@neondatabase\/serverless['"]/,
  /['"](?:pg|@prisma\/client)['"]/,
];

function fileCarriesDatabaseSignal(body) {
  if (!body) return false;
  return DATABASE_CONTENT_SIGNALS.some((signal) => body.includes(signal)) || DATABASE_CONTENT_PATTERNS.some((pattern) => pattern.test(body));
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

// Every station is judged on the PROPOSED HEAD: the named file must be a regular file there
// and its head content must do the station's work. A station deleted or gutted by the pull
// request fails; a station the pull request adds or replaces counts when its head content does.
// The chain must also name every database-shaped file the pull request changes and keeps, so it
// describes this change rather than any ten files.
function checkDatabaseChain(ctx, databaseChanges, fail) {
  const stationList = DATABASE_IMPACT_STATIONS.join(" → ");
  const { chain, error } = parseDatabaseChain(ctx.body);
  if (!chain) {
    fail("database-chain",
      (error ? error + ". " : "") +
        "This pull request changes the database's infrastructure or its connections, so its description must declare every station of the database chain " +
        "(Master §27.16.1) in a fenced ```database-chain block holding a JSON object of station → repo paths:\n  " + stationList,
      databaseChanges);
    return;
  }

  const incomplete = DATABASE_IMPACT_STATIONS.filter((s) => !Array.isArray(chain[s]) || chain[s].length === 0);
  if (incomplete.length) fail("database-chain", "The database chain is incomplete. Every station is required for a database change:", incomplete.map((s) => "missing: " + s));

  const named = new Set();
  const unverified = [], freeText = [], proseOnly = [], absent = [], offClass = [];
  for (const station of DATABASE_IMPACT_STATIONS) {
    const entries = chain[station];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    if (stationIsDocumentationOnly(entries)) proseOnly.push(station);
    for (const entry of entries) {
      if (typeof entry !== "string") { freeText.push(station + ": " + JSON.stringify(entry)); continue; }
      const value = entry.trim();
      if (value.toUpperCase().startsWith("UNVERIFIED")) { unverified.push(station + ": " + value); continue; }
      if (!value.includes("/") && !value.includes(".")) { freeText.push(station + ": " + value); continue; }
      named.add(value);
      const head = ctx.entry("head", value);
      if (head.error) { absent.push(station + ": " + value + "  (could not be read on the proposed head: " + head.error + ")"); continue; }
      if (head.kind === null) { absent.push(station + ": " + value + "  (not on the proposed head: deleted, moved or never added)"); continue; }
      if (head.kind !== "blob") { absent.push(station + ": " + value + "  (a " + head.kind + " on the proposed head, not a file)"); continue; }
      const evidence = DATABASE_STATION_EVIDENCE[station];
      if (!evidence.accepts(value, head.text)) offClass.push(station + ": " + value + "  (on the proposed head it is not " + evidence.describes + ")");
    }
  }
  const unnamed = databaseChanges.filter((p) => ctx.entry("head", p).kind === "blob" && !named.has(p));
  if (unverified.length) fail("database-chain", "A database-chain station is UNVERIFIED. That is an honest state and it BLOCKS the change: establish it, or stop the change here:", unverified);
  if (freeText.length) fail("database-chain", "A database-chain station carries free text rather than a repo path:", freeText);
  if (proseOnly.length) fail("database-chain", "A database-chain station may not be satisfied by a document alone; name what does the work:", proseOnly);
  if (absent.length) fail("database-chain", "A database-chain station must be a regular file on the proposed head:", absent);
  if (offClass.length) fail("database-chain", "A database-chain station names a file whose proposed-head content is not evidence FOR THAT STATION:", offClass);
  if (unnamed.length) fail("database-chain", "The database chain must place every database file this pull request changes in a station:", unnamed);
}

// ---------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------

export const MAX_INSPECT_BYTES = 5 * 1024 * 1024;
export const FILE_API_LIMIT = 3000;
const RESERVED_TOKEN = new RegExp("(?<![\\w.-])(" + Object.keys(RESERVED_CHECKS).join("|") + ")(?![\\w.-])", "g");
const STATUS_API = /\/statuses\/|\/check-runs\b|\bcheck_runs\b|\bchecks\s*\.\s*create\b|\bcreateCommitStatus\b|\bcreate_status\b/;
const RESERVED_NAME_EXEMPT = new Set([
  "scripts/ci/pr-safety-check.mjs",
  "tests/runtime/pr-safety-check.test.ts",
  "tests/runtime/reserved-check-names.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts",
]);

// The reserved check names a file uses without owning them: in a workflow or action, any use; in
// other runnable code, a use next to the commit-status / check-run API.
export function reservedCheckSpoofs(filePath, text) {
  if (typeof text !== "string" || RESERVED_NAME_EXEMPT.has(filePath)) return [];
  const inWorkflow = /^\.github\/(?:workflows|actions)\//.test(filePath);
  if (!inWorkflow && !(isExecutablePath(filePath, text) && STATUS_API.test(text))) return [];
  const found = new Set();
  for (const m of text.matchAll(RESERVED_TOKEN)) if (RESERVED_CHECKS[m[1]] !== filePath) found.add(m[1]);
  return [...found];
}

// Whether an authorization label counts for THIS head commit.
function labelVerdict(ctx, name, seenAt) {
  const label = ctx.labels.find((l) => l.name === name);
  if (!label) return { ok: false, why: "" };
  if (!ctx.authorizers.has(label.addedBy)) return { ok: false, why: " (present, but added by " + label.addedBy + ", who is not an authorizer)" };
  if (ctx.event === "synchronize" || ctx.baseChanged) return { ok: false, why: " (a new commit was pushed or the base branch changed; labels given before that never authorize it)" };
  const seen = seenAt();
  if (!seen) return { ok: false, why: " (when this head commit was pushed could not be established, so the label cannot be shown to be newer than it)" };
  if (!(Date.parse(label.addedAt) > Date.parse(seen))) return { ok: false, why: " (added " + label.addedAt + ", before the current head commit or base was set at " + seen + ")" };
  return { ok: true, why: "" };
}

/**
 * ctx = {
 *   repo, headRepo       "owner/name" of this repository and of the pull request's head
 *   changedFiles         the pull request's own changed_files count
 *   changes              [{ status: "A" | "M" | "D" | "R", path, previousPath }]   R = rename
 *   entry(side, path)    side "base" (merge base) or "head" ->
 *                        { kind: "blob" | "tree" | "symlink" | "submodule" | null, text, binary, size, executable, error }
 *   readBaseTip(path)    text on the base branch tip (the trusted checkout), or null; throws on a read error
 *   event, baseChanged   the pull_request_target action, and whether it changed the base branch
 *   labels               [{ name, addedBy, addedAt }]   current labels, with their latest labeled event
 *   headSeenAt()         when the current head commit (or base) was set on this pull request, or null
 *   authorizers          Set of accounts whose labels count
 *   body                 the pull-request description
 * }
 */
export function evaluate(ctx) {
  const failures = [];
  const fail = (rule, message, items) => failures.push({ rule, message, items: items || [] });
  const summary = { changed: ctx.changes.length, sensitiveClasses: [], databaseChanges: [], authorizedLabels: [] };

  // 1. Trust boundary. Nothing is inspected on a pull request that fails it.
  if (!ctx.repo || ctx.headRepo !== ctx.repo) {
    fail("trust:repository", "Only pull requests from a branch of " + (ctx.repo || "this repository") + " are evaluated. The head of this one is " + (ctx.headRepo || "unknown") + "; fork and cross-repository pull requests are rejected before any content is read.");
    return { ok: false, failures, ...summary };
  }
  const listed = ctx.changes.map((c) => c.path);
  const unique = new Set(listed);
  if (unique.size !== listed.length || unique.size !== ctx.changedFiles || ctx.changedFiles >= FILE_API_LIMIT || ctx.changes.some((c) => !["A", "M", "D", "R"].includes(c.status) || !c.path || (c.status === "R" && !c.previousPath))) {
    fail("trust:file-census", "The changed-file list is incomplete or inconsistent, so nothing is judged: the API returned " + listed.length + " entries (" + unique.size + " distinct paths) and the pull request reports " + ctx.changedFiles + " changed files" + (ctx.changedFiles >= FILE_API_LIMIT ? "; the API lists at most " + FILE_API_LIMIT + " files, so split the pull request" : "") + ".");
    return { ok: false, failures, ...summary };
  }
  const unreadable = [];
  for (const c of ctx.changes) {
    const sides = c.status === "D" ? [["base", c.path]] : c.status === "A" ? [["head", c.path]] : [["head", c.path], ["base", c.previousPath || c.path]];
    for (const [side, p] of sides) {
      const e = ctx.entry(side, p);
      if (e.error) unreadable.push(side + " " + p + ": could not be read (" + e.error + ")");
      else if (e.kind === null) unreadable.push(side + " " + p + ": listed as changed but absent");
      else if (e.kind !== "blob") unreadable.push(side + " " + p + ": a " + e.kind + ", not a regular file");
    }
  }
  if (unreadable.length) {
    fail("trust:unreadable", "Every changed path must read as a regular file. Symlinks, submodules, directories and files that cannot be read are never judged innocent:", unreadable);
    return { ok: false, failures, ...summary };
  }

  const text = (side, p) => { const e = ctx.entry(side, p); return e.kind === "blob" ? e.text : null; };
  const readBase = (p) => text("base", p), readHead = (p) => text("head", p);
  const changedPaths = [...new Set(ctx.changes.flatMap((c) => [c.path, c.previousPath].filter(Boolean)))];
  const present = ctx.changes.filter((c) => c.status !== "D");

  // A runnable file that cannot be inspected fails closed.
  const opaque = present.filter((c) => {
    const e = ctx.entry("head", c.path);
    const unreadableText = e.binary || e.size > MAX_INSPECT_BYTES || typeof e.text !== "string";
    return unreadableText && (e.executable || pathSurfaces(c.path, false).some(([cls]) => cls === "operator") || isExecutablePath(c.path, e.binary ? null : e.text));
  }).map((c) => c.path);
  if (opaque.length) fail("trust:uninspectable", "A runnable file that is binary or larger than " + MAX_INSPECT_BYTES / 1048576 + " MB cannot be inspected, so it fails:", opaque);

  // 2. Absolute prohibitions. No label authorizes these.
  const revived = present.filter((c) => DELETED_DIRECT_NEON_PATHS.has(c.path)).map((c) => c.path);
  if (revived.length) fail("retired-neon-path", "Deleted direct-Neon control paths may not return. Mallan reaches Neon only through the Vercel-managed Marketplace resource. No label authorizes this:", revived);
  const capability = [];
  for (const c of present) {
    const e = ctx.entry("head", c.path);
    if (NEON_CAPABILITY_EXEMPT.has(c.path) || PROSE.test(c.path) || e.binary || typeof e.text !== "string") continue;
    const found = neonCapabilitySignals(e.text);
    if (found.length) capability.push(c.path + "  ->  " + found.join(", "));
  }
  if (capability.length) fail("neon-capability", "Direct Neon control-plane capability is prohibited, whatever the file is called. Mallan reaches Neon only through the Vercel-managed Marketplace resource. No label authorizes this:", capability);
  const spoofs = [];
  for (const c of present) for (const name of reservedCheckSpoofs(c.path, readHead(c.path))) spoofs.push(c.path + "  uses the reserved check name " + name + " (only " + RESERVED_CHECKS[name] + " may)");
  if (spoofs.length) fail("reserved-check-name", "The required check names are reserved for their canonical workflows. No label authorizes this:", spoofs);

  // 3 + 4. Authorization boundaries: where the change is, then the content tripwires.
  const needed = new Map();
  const need = (cls, item) => { if (!needed.has(cls)) needed.set(cls, new Set()); needed.get(cls).add(item); };
  let root;
  try { root = requiredCheckFiles(ctx.readBaseTip); } catch (error) { root = { files: new Set(), error: String(error.message || error) }; }
  if (root.error) fail("trust:required-check-root", "The files the required pr-check runs could not be resolved from the base (" + root.error + "), so the safety root is unknown and nothing is authorized.");
  for (const p of changedPaths) {
    if (SAFETY_ROOT_FILES.has(p.toLowerCase())) need("safety_root", p + "  (safety root)");
    else if (inRequiredRoot(root.files, p)) need("safety_root", p + "  (run or read by the required pr-check)");
    else for (const [why, re] of SAFETY_ROOT_PATTERNS) if (re.test(p)) { need("safety_root", p + "  (" + why + ")"); break; }
  }
  for (const c of ctx.changes) {
    if (opaque.includes(c.path)) continue;
    const executable = c.status !== "D" && ctx.entry("head", c.path).executable;
    const inRoot = inRequiredRoot(root.files, c.path) || isSafetyRoot(c.path);
    for (const [cls, why] of classifyChange(c, readBase, readHead, executable)) {
      if (cls === "operator" && inRoot) continue;
      need(cls, c.path + "  (" + why + ")");
    }
  }

  let seen;
  const seenAt = () => (seen === undefined ? (seen = ctx.headSeenAt()) : seen);
  for (const [cls, items] of needed) {
    const label = AUTH_LABELS[cls];
    const verdict = labelVerdict(ctx, label, seenAt);
    if (verdict.ok) { summary.authorizedLabels.push(label); continue; }
    fail("authorization:" + cls,
      "This pull request crosses Maya's authorization boundary \"" + BOUNDARIES[cls] + "\". It needs the label " + label +
        ", added by an authorizer after the current head commit was pushed" + verdict.why + ". No other label authorizes it:",
      [...items]);
  }
  summary.sensitiveClasses = [...needed.keys()];

  // 5. Declarations bound to the diff.
  const undeclared = ctx.changes
    .filter((c) => (c.status === "A" || c.status === "R") && !TEST_PATH.test(c.path) && isExecutablePath(c.path, readHead(c.path)) && !String(ctx.body || "").includes(c.path))
    .map((c) => c.path);
  if (undeclared.length) fail("scope:new-files", "Every new file is stated in the pull request's scope with the reason it is needed (Master §27.15, §27.17). Name each of these in the description:", undeclared);
  summary.databaseChanges = ctx.changes.filter((c) => databaseShaped(c, readBase, readHead)).map((c) => c.path);
  if (summary.databaseChanges.length) checkDatabaseChain(ctx, summary.databaseChanges, fail);

  return { ok: failures.length === 0, failures, ...summary };
}

// ---------------------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------------------

// Test fixtures: { base: {path: text}, head: {path: text}, changes, ... }. The head tree is the
// base tree with the changes applied, as on GitHub.
function fixtureContext(input) {
  const changes = input.changes || [];
  const files = { base: { ...(input.base || {}) }, head: { ...(input.base || {}) } };
  for (const c of changes) {
    if (c.status === "D") delete files.head[c.path];
    if (c.status === "R") delete files.head[c.previousPath];
  }
  Object.assign(files.head, input.head || {});
  const types = { base: input.baseTypes || {}, head: input.headTypes || {} };
  const errors = { base: new Set(input.baseErrors || []), head: new Set(input.headErrors || []) };
  const executable = new Set(input.executable || []);
  const tip = input.baseTip || files.base;
  const repo = input.repo === undefined ? "mallan67/mallan-nyc" : input.repo;
  return {
    repo,
    headRepo: input.headRepo === undefined ? repo : input.headRepo,
    changedFiles: input.changedFiles === undefined ? changes.length : input.changedFiles,
    changes,
    entry: (side, p) => {
      if (errors[side].has(p)) return { kind: null, text: null, error: "read failed" };
      if (types[side][p]) return { kind: types[side][p], text: null };
      const t = files[side][p];
      if (typeof t !== "string") return { kind: null, text: null };
      return { kind: "blob", text: t, binary: t.includes("\u0000"), size: t.length, executable: side === "head" && executable.has(p) };
    },
    readBaseTip: (p) => (typeof tip[p] === "string" ? tip[p] : null),
    event: input.event || "opened",
    baseChanged: Boolean(input.baseChanged),
    labels: (input.labels || []).map((l) => ({ addedBy: "mallan67", addedAt: "2100-01-01T00:00:00Z", ...l })),
    headSeenAt: () => (input.headSeenAt === undefined ? "2000-01-01T00:00:00Z" : input.headSeenAt),
    authorizers: new Set(input.authorizers || ["mallan67"]),
    body: input.body || "",
  };
}

// `gh` with two retries for transient failures; a 404 or 422 is an answer, not a failure.
function gh(args) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      if (attempt >= 2 || /HTTP 40[0-4]|HTTP 422|Not Found/.test(String(error.stderr || ""))) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * (attempt + 1));
    }
  }
}
const ghJson = (args) => JSON.parse(gh(["api", ...args]));
// Every page of a list endpoint, as one array (gh --slurp wraps each page in an outer array).
const ghPages = (endpoint, key) => JSON.parse(gh(["api", "--paginate", "--slurp", endpoint])).flatMap((page) => (key ? page[key] : page));
const errorText = (error) => String(error.stderr || error.message || error).trim().split("\n").pop().slice(0, 200);

// The current labels, each with the account and time of its latest labeled event, and the time
// of the latest change of the pull request's base branch.
function labelsAndBaseChange(repo, number, prLabels) {
  const lastLabeled = new Map();
  let baseChangedAt = null;
  for (const e of ghPages(`repos/${repo}/issues/${number}/events?per_page=100`)) {
    if (e.event === "labeled" && e.label) lastLabeled.set(e.label.name, { addedBy: e.actor ? e.actor.login : "unknown", addedAt: e.created_at });
    if (e.event === "base_ref_changed") baseChangedAt = e.created_at;
  }
  const labels = prLabels.map((l) => ({ name: l.name, addedBy: "unknown", addedAt: "", ...lastLabeled.get(l.name) }));
  return { labels, baseChangedAt };
}

// When the current head was pushed: the first pr-safety run for it after the last run for a
// different head. Runs are created by GitHub, so a commit cannot supply their times. A later
// change of the base branch moves the time forward.
function headSeenAt(repo, number, headRef, headSha, baseChangedAt) {
  try {
    const runs = ghPages(`repos/${repo}/actions/workflows/pr-safety.yml/runs?event=pull_request_target&branch=${encodeURIComponent(headRef)}&per_page=100`, "workflow_runs")
      .filter((r) => (r.pull_requests || []).some((p) => String(p.number) === String(number)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let start = 0;
    runs.forEach((r, i) => { if (r.head_sha !== headSha) start = i + 1; });
    const first = runs.slice(start).find((r) => r.head_sha === headSha);
    if (!first) return null;
    return baseChangedAt && Date.parse(baseChangedAt) > Date.parse(first.created_at) ? baseChangedAt : first.created_at;
  } catch {
    return null;
  }
}

function githubContext() {
  const repo = process.env.GITHUB_REPOSITORY;
  const number = process.env.PR_NUMBER;
  const headSha = process.env.HEAD_SHA;
  const baseSha = process.env.BASE_SHA;
  if (!repo || !number || !headSha || !baseSha) throw new Error("GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA and BASE_SHA are required");
  const pr = ghJson([`repos/${repo}/pulls/${number}`]);
  const info = { repo, number, baseSha, headSha, headRepo: pr.head.repo ? pr.head.repo.full_name : null };
  const common = { repo, headRepo: info.headRepo, changedFiles: pr.changed_files, event: process.env.PR_EVENT_ACTION || "", baseChanged: Boolean(process.env.PR_BASE_CHANGED), body: pr.body || "" };

  // Checked before anything else is read.
  if (info.headRepo !== repo) return { info, ...common, changes: [], labels: [], entry: () => ({ kind: null }), readBaseTip: () => null, headSeenAt: () => null, authorizers: new Set() };
  if (pr.head.sha !== headSha) throw new Error("the pull request head moved to " + pr.head.sha + " after this run started for " + headSha + "; the newer commit is judged by its own run");

  const STATUS = { added: "A", copied: "A", modified: "M", changed: "M", removed: "D", renamed: "R" };
  const changes = ghPages(`repos/${repo}/pulls/${number}/files?per_page=100`).map((f) => ({
    status: STATUS[f.status] || "?" + f.status,
    path: f.filename,
    previousPath: f.status === "renamed" ? f.previous_filename : undefined,
  }));
  // "Before" is the merge base: the same comparison GitHub's own diff (and file list) uses.
  const mergeBase = ghJson([`repos/${repo}/compare/${baseSha}...${headSha}`]).merge_base_commit.sha;

  // Git object type and mode come from the commit's tree (one recursive read, or the file's own
  // directory when GitHub truncates a large tree); content comes from the blob.
  const trees = new Map(), listings = new Map(), entries = new Map();
  function wholeTree(sha) {
    if (!trees.has(sha)) {
      let value;
      try {
        const tree = ghJson([`repos/${repo}/git/trees/${sha}?recursive=1`]);
        value = tree.truncated ? null : { tree: new Map(tree.tree.map((t) => [t.path, t])) };
      } catch (error) {
        value = { error: errorText(error) };
      }
      trees.set(sha, value);
    }
    return trees.get(sha);
  }
  function listing(sha, dir) {
    const key = sha + ":" + dir;
    if (!listings.has(key)) {
      let value;
      try {
        const tree = ghJson([`repos/${repo}/git/trees/${sha}${dir ? ":" + encodeURIComponent(dir) : ""}`]);
        value = tree.truncated ? { error: "directory listing truncated" } : { tree: new Map(tree.tree.map((t) => [t.path, t])) };
      } catch (error) {
        value = /HTTP 404|Not Found/.test(errorText(error)) ? { tree: new Map() } : { error: errorText(error) };
      }
      listings.set(key, value);
    }
    return listings.get(key);
  }
  function entryAt(sha, p) {
    const key = sha + ":" + p;
    if (entries.has(key)) return entries.get(key);
    const slash = p.lastIndexOf("/");
    const whole = wholeTree(sha);
    const dir = whole || listing(sha, slash === -1 ? "" : p.slice(0, slash));
    let result;
    const item = dir.tree && dir.tree.get(whole ? p : p.slice(slash + 1));
    if (dir.error) result = { kind: null, text: null, error: dir.error };
    else if (!item) result = { kind: null, text: null };
    else if (item.mode === "120000") result = { kind: "symlink", text: null };
    else if (item.mode === "160000" || item.type === "commit") result = { kind: "submodule", text: null };
    else if (item.type === "tree") result = { kind: "tree", text: null };
    else if (item.type !== "blob") result = { kind: item.type, text: null };
    else if (item.size > MAX_INSPECT_BYTES) result = { kind: "blob", text: null, size: item.size, executable: item.mode === "100755" };
    else {
      try {
        const blob = ghJson([`repos/${repo}/git/blobs/${item.sha}`]);
        const bytes = Buffer.from(blob.content || "", "base64");
        result = { kind: "blob", text: bytes.toString("utf8"), binary: bytes.includes(0), size: bytes.length, executable: item.mode === "100755" };
      } catch (error) {
        result = { kind: null, text: null, error: errorText(error) };
      }
    }
    entries.set(key, result);
    return result;
  }

  const { labels, baseChangedAt } = labelsAndBaseChange(repo, number, pr.labels || []);
  return {
    info,
    ...common,
    changes,
    entry: (side, p) => entryAt(side === "base" ? mergeBase : headSha, p),
    readBaseTip: (p) => { const e = entryAt(baseSha, p); if (e.error) throw new Error(p + ": " + e.error); return e.kind === "blob" ? e.text : null; },
    labels,
    headSeenAt: () => headSeenAt(repo, number, pr.head.ref, headSha, baseChangedAt),
    authorizers: new Set(String(process.env.MALLAN_SAFETY_AUTHORIZERS || "mallan67").split(",").map((s) => s.trim()).filter(Boolean)),
  };
}

function report(result, info) {
  const lines = [];
  if (info) lines.push(`PR #${info.number} ${info.repo}  base ${info.baseSha}  head ${info.headSha}`);
  lines.push(`changed paths: ${result.changed}; boundaries crossed: ${result.sensitiveClasses.join(", ") || "none"}; database-shaped: ${result.databaseChanges.length}; authorizations counted: ${result.authorizedLabels.join(", ") || "none"}`);
  lines.push("\n[MALLAN PR SAFETY] " + (result.ok ? "PASS" : "FAIL"));
  for (const f of result.failures) {
    lines.push("\n" + f.rule + ": " + f.message);
    for (const item of f.items) lines.push("  - " + item);
  }
  return lines.join("\n") + "\n";
}

function main() {
  if (process.argv.includes("--stdin")) {
    const result = evaluate(fixtureContext(JSON.parse(fs.readFileSync(0, "utf8"))));
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  let ctx, result;
  try {
    ctx = githubContext();
    result = evaluate(ctx);
  } catch (error) {
    // Anything the check cannot establish fails closed.
    result = { ok: false, failures: [{ rule: "trust:error", message: String(error.message || error), items: [] }], changed: 0, sensitiveClasses: [], databaseChanges: [], authorizedLabels: [] };
  }
  const out = report(result, ctx && ctx.info);
  if (result.ok) process.stdout.write(out);
  else { process.stderr.write(out); process.exitCode = 1; }
}

// Run only when executed, not when imported.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
