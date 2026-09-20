#!/usr/bin/env node
/**
 * Mallan Execution Control Gate
 *
 * Authorization is read from the PR BASE branch, never from HEAD.
 * A PR therefore cannot widen its own execution envelope.
 *
 * PR #632 is the one-time bootstrap exception because main did not yet
 * contain the Master/Execution State when this control plane was introduced.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const STATE_PATH = "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md";
const MASTER_PATH = "MALLAN-PLATFORM-MASTER-PLAN.md";
const CONTROL_START = "<!-- MALLAN_EXECUTION_CONTROL_V1_START -->";
const CONTROL_END = "<!-- MALLAN_EXECUTION_CONTROL_V1_END -->";
const BOOTSTRAP_PR = "632";

const IMMUTABLE_CONTROL_PATHS = new Set([
  "scripts/ci/mallan-execution-control.mjs",
  ".github/workflows/authority-root.yml",
  ".github/workflows/branch-authority.yml",
  ".github/workflows/pr-check.yml",
  ".github/workflows/release-truth.yml",
  "scripts/validate-release-status.js",
  "scripts/release-safety/release-truth-verdict.js",
  "tests/runtime/mallan-execution-control.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  ".github/workflows/cleanup-neon-preview-branch.yml",
  ".github/workflows/rotate-db-keys.yml",
  "app/api/cron/neon-branch-prune/route.ts",
  "scripts/neon-prune-branches.ts",
  "tests/runtime/neon-branch-prune-route.test.ts",
  "tests/runtime/neon-prune-cli.test.ts",
  "scripts/ops-health.js",
  "scripts/branch-prune-health.js",
  "tests/runtime/branch-prune-health.test.ts",
  "vercel.json"
]);

const NONDELETABLE_CONTROL_ROOT_PATHS = new Set([
  "scripts/ci/mallan-execution-control.mjs",
  ".github/workflows/authority-root.yml",
  ".github/workflows/pr-check.yml",
  ".github/workflows/branch-authority.yml"
]);

// PR #632 DELETED the direct-Neon control plane. Mallan reaches Neon only through the
// Vercel-managed Marketplace resource, so these paths must never come back - not as a
// re-implementation and not as a fail-only stub, because a tombstone is still a Mallan
// path: it keeps the retired architecture in the tree and in every catalog that scans it.
const DELETED_DIRECT_NEON_PATHS = new Set([
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

// The retired capability, derived from the code this packet deleted rather than guessed.
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

// Every format in this repository that can run, configure a run, or carry a connection.
// The previous list was JavaScript and YAML only, which silently exempted the tracked
// shell, PowerShell, Python and Docker files from both the database classifier and the
// capability scan. A guard that does not open the file cannot refuse what is in it.
const EXECUTABLE_EXTENSIONS = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  // This repository is developed on Windows, and infrastructure-as-code is a shell by
  // another name.
  ".bat", ".cmd", ".tf", ".tfvars", ".hcl", ".ipynb",
  ".yml", ".yaml", ".toml",
  ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".py", ".rb", ".go", ".rs", ".java", ".php",
  ".sql", ".prisma", ".dockerfile"
];

// Extensionless runnables. Matched on the basename so backend/Dockerfile and
// Dockerfile.worker are both covered.
// package.json runs npm scripts, so it is a program that happens to be JSON. Other
// .json files are data and stay out: broadening to all JSON would sweep in fixtures,
// contracts and catalogs, and a scan that cries wolf gets ignored.
const EXECUTABLE_BASENAMES = ["dockerfile", "makefile", "procfile", "justfile", "package.json"];

// Directories whose contents run by definition, whatever the files are called.
const EXECUTABLE_PREFIXES = [".githooks/", ".husky/"];

// The gate and its negative tests must name the signals in order to enforce and prove
// them. Nothing else in the repository may contain one.
const NEON_CAPABILITY_EXEMPT = new Set([
  "scripts/ci/mallan-execution-control.mjs",
  "tests/runtime/mallan-execution-control.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts"
]);

// Content signals for the database chain. Derived from a census of every tracked reader:
// 55 files read DATABASE_URL, construct a Prisma client or construct a pg pool, and 52 of
// them matched none of the path patterns below. lib/db.ts is the clearest case, building a
// pg Pool straight from process.env.DATABASE_URL while lib/db/ does not match lib/db.ts.
const DATABASE_CONTENT_SIGNALS = [
  "process.env.DATABASE_URL",
  "process.env.DATABASE_URL_UNPOOLED",
  "process.env.ASSISTANT_DATABASE_URL",
  "lib/ops/db-target",
  "canonical-neon-target"
];

// Patterns cover the spellings a literal cannot: a client constructed through an alias or
// namespace, the canonical singleton imported by any relative or aliased specifier, and a
// workflow or compose file that SETS the target as a YAML key rather than reading it in JS.
// A workflow that repoints DATABASE_URL changes the database story as surely as application
// code does, and previously escaped because YAML never writes process.env.
const DATABASE_CONTENT_PATTERNS = [
  /new\s+(?:[A-Za-z_$][\w$]*\.)*(?:PrismaClient|Pool|Client)\s*\(/,
  /['\"][^'\"]*\blib\/(?:prisma|db)(?:\/[\w.-]+)?['\"]/,
  /^\s*(?:ASSISTANT_)?DATABASE_URL(?:_UNPOOLED)?\s*:/m,
  // Language-neutral: os.environ["DATABASE_URL"] in Python and $DATABASE_URL in shell
  // are the same participation in the database story as process.env.DATABASE_URL, and
  // naming the variable at all is what makes a file part of it.
  /\bDATABASE_URL\b/,
  // The connection-variable families this repository actually sees. The station table
  // already accepted POSTGRES_URL and connectionString as env-resolution evidence while
  // the classifier refused to treat them as database involvement at all.
  /\bPOSTGRES(?:_PRISMA)?_URL(?:_NON_POOLING|_NO_SSL)?\b/,
  /\bconnectionString\b/,
  // A connection URL is database involvement whatever the variable is called. A9 in the
  // review repointed the canonical endpoint to the stale DO-NOT-SERVE one and passed,
  // because only the variable NAME was a signal.
  /\bpostgres(?:ql)?:\/\//,
  // A client that arrives as a PARAMETER is still a client. `prisma.listing.findMany(`
  // and `db.query(` are what a database consumer DOES, and dependency injection is the
  // idiomatic way to write a testable one — so the type-only-import exclusion was hiding
  // the normal case, not an exotic one.
  /\b(?:prisma|db|tx|client)\s*\.\s*\$?(?:transaction|queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe|connect|disconnect)\b/,
  /\b(?:prisma|db|tx)\s*\.\s*[a-z][\w]*\s*\.\s*(?:findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(/,
  // A Prisma where-fragment is a database query even when it never names the client. This
  // is the display-gate shape: an exported object of column predicates that every public
  // query spreads.
  /\b(?:idx_display_yn|internet_[a-z_]*display_yn|participant_only|owner_opt_out)\b/,
  // SQL that changes data or shape, wherever the file lives. The repo's two tracked .sql
  // files classify today only because each carries a psql comment an author may omit.
  /\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+(?:TABLE|INDEX|COLUMN|SCHEMA|DATABASE|VIEW)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM)\b/i,
  // A migrate or push command is a schema change wherever it is written down. NEON.md
  // governs these explicitly; package.json is where they live and was not classified.
  /\bprisma\s+(?:migrate|db\s+push|generate)\b/,
  // The serverless driver, alongside pg and the Prisma client.
  /['"]@neondatabase\/serverless['"]/
];


// Literal matching is necessary but not sufficient: the same capability survives being
// assembled from fragments. The body and the needles must be normalised IDENTICALLY,
// otherwise a fragment that retains a separator matches neither pass. Both sides drop
// whitespace, quotes, concatenation, brackets, commas, dots, underscores and hyphens.
function collapseForCapabilityScan(body) {
  return decodeSourceEscapes(body).replace(/[\s'\"`+\\\[\],\.,_${}()-]/g, "").toLowerCase();
}

// A comment can sit between the fragments of a concatenated signature, and the collapse
// keeps the comment text, so the needle never becomes contiguous. Removing comments is
// the obvious answer and is unsafe on its own: a line-comment strip cuts
// "https://console.neon.tech" at its own "//" and erases the signature it is looking for.
// So both readings are scanned. A signature has to survive BOTH to stay hidden, and it
// cannot: the seam form needs the comments gone, the plain URL form needs them kept.
// Remove comments while leaving everything else byte for byte. Three things make this
// harder than a regex, and each of them was a live bypass before it was handled:
//   a string may contain //           "x//" is not a comment
//   a regex literal may contain //    /x\/\// is not a comment
//   a template EXPRESSION is code     `a${ "" // seam
//                                     }b` really does concatenate a and b
// The last one is why a backtick literal cannot be treated as opaque text. Everything
// between ${ and its matching } is ordinary code and gets ordinary comment handling,
// including nested templates.
function stripSourceComments(body, options) {
  const hashComments = !options || options.hashComments !== false;
  const text = String(body);
  let out = "";
  let i = 0;
  let last = "";            // last significant char in code, for the regex test
  let inTemplate = false;   // inside the TEXT of a template literal
  const expressionDepths = [];  // brace depth at which each open ${ closes
  let braceDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inTemplate) {
      if (ch === String.fromCharCode(92)) { out += ch; if (i + 1 < text.length) out += text[i + 1]; i += 2; continue; }
      if (ch === "$" && next === "{") {
        // Back into code. Remember the depth this expression returns at.
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

    // A quoted string. Copy it through, honouring escapes so an escaped quote does not
    // end it early.
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
      // A character class may contain unescaped slashes, so /[///]/ is ONE regex. Reading
      // the first of them as the terminator left the remaining two to be taken for a
      // comment, which deleted the rest of the line.
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

    // ECMA-262 Annex B.1.1: <!-- opens a single-line comment in sloppy-mode script, and a
    // line-initial --> closes one. This package declares no module type, so every tracked
    // .js file is such a script and both forms are live comment syntax there.
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
    // A shell, Python or YAML comment. Python does not require whitespace before the #,
    // so requiring it left `("a"# seam` uncommented. JavaScript meanwhile opens a private
    // field name with the same character, so treating every # as a comment is wrong there.
    // One character, two languages, opposite answers, and nothing in the text decides it.
    //
    // So neither reading has to be right on its own. THIS reading takes the aggressive
    // view that any # outside a string opens a comment; the hashComments:false reading
    // takes the opposite view that none does. A signature has to be invisible in BOTH.
    if (hashComments && ch === "#") {
      while (i < text.length && text[i] !== String.fromCharCode(10)) i += 1;
      out += " ";
      continue;
    }

    if (ch === "{") braceDepth += 1;
    if (ch === "}") {
      braceDepth -= 1;
      if (expressionDepths.length && braceDepth === expressionDepths[expressionDepths.length - 1]) {
        // This } closes a ${ }, so the template TEXT resumes after it.
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
// Where a value may begin, a slash is a regex. After an identifier, a number or a
// closing bracket it is division. Start of file counts as a place a value may begin.
//
// A keyword is the case a single character cannot decide: the last character of
// `return` is an ordinary identifier character, so `return /x/` looked like division
// and the regex's own slashes were then read as a comment. The preceding TOKEN is what
// the grammar cares about, so that is what gets tested.
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await"
]);

// The ambiguity is decided on the SAFE side, and which side that is follows from what
// the two branches do. Regex handling COPIES characters through; comment handling
// DELETES them. Calling division a regex therefore preserves text and can never hide a
// signature; calling a regex a comment deletes to end of line and has hidden one four
// separate times. So where a slash could be either, this answers regex.
//
// That is why ) and ] are in this set even though both commonly precede division: the
// ) that closes an `if (...)` condition legitimately precedes a regex, and guessing
// wrong in the other direction blinded every reading at once.
function regexMayStart(last, text, index) {
  if (!last) return true;
  if ("(),=:[]!&|?{};+-*%~^<>".includes(last)) return true;
  if (!/[A-Za-z_$]/.test(last)) return false;
  // The last character was part of a word. Read the whole word back and ask whether it
  // is a keyword a value may follow.
  if (typeof text !== "string" || typeof index !== "number") return false;
  let end = index - 1;
  while (end >= 0 && /\s/.test(text[end])) end -= 1;
  let start = end;
  while (start >= 0 && /[\w$]/.test(text[start])) start -= 1;
  return REGEX_PRECEDING_KEYWORDS.has(text.slice(start + 1, end + 1));
}

// Block comments removed without touching line comments. This reading cannot be affected
// by any line-comment misjudgement, which is where both previous blind spots came from.
function stripBlockCommentsOnly(body) {
  return String(body).replace(/\/\*[\s\S]*?\*\//g, " ");
}

// FOUR readings of the same file, and a signature must be invisible in ALL of them to
// pass. They are chosen so that each removes a different comment family, which means a
// mistake in handling one family cannot blind the readings that leave that family alone.
// Every blind spot found so far came from two readings sharing one language judgement:
//
//   as written        a host written plainly needs its comments KEPT
//   all comments off  a seam needs them GONE
//   block only        immune to every line-comment question, // and # alike
//   no hash comments  immune to the # question, which JavaScript answers differently
//                     because #x is a private field and not a comment at all
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

// The path is a fast answer, not the only one. An extensionless file with a shebang is
// a program no list of names could have predicted, so the body gets the last word.
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
  // A UTF-8 BOM is what PowerShell writes by default, and this repository is developed on
  // Windows. The kernel would not honour the shebang, but `bash tools/x` does, and that is
  // how a package script or a CI step invokes it.
  return body.replace(/^\uFEFF/, "").slice(0, 2) === "#!";
}

// Configuration that names a command or a script LAUNCHES something, which makes it a
// program however it is spelled. .mcp.json declares mcpServers.<name>.command;
// package.json declares scripts. Data files declare neither, which is what keeps this
// from sweeping in every fixture and catalog in the repository.
//
// The keys are read from the PARSED document, not from the source text. A JSON key may
// be escaped, and "\\u0063ommand" is the command key by the time anything runs it, so a
// spelling test can be written around and a parse cannot.
// Any key that NAMES a command. vercel.json declares buildCommand and installCommand and
// runs both on every deploy; renovate declares commands; semantic-release declares
// prepareCmd. Matching only the exact word "command" missed all of them.
const RUNNABLE_JSON_KEY = /^(?:scripts|commands?|.*(?:command|cmd))$/i;

function declaresRunnableCommand(body) {
  if (typeof body !== "string") return false;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Unreadable configuration fails CLOSED. Being wrong here only means the file gets
    // scanned, which is the cheap direction to be wrong in.
    return true;
  }
  return jsonDeclaresKey(parsed, 0);
}

function jsonDeclaresKey(node, depth) {
  // Too deep to walk is not the same as "declares nothing". The sibling branch (a JSON
  // document that will not parse) already fails closed; this one used to fail open.
  if (depth > 12) return true;
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => jsonDeclaresKey(child, depth + 1));
  for (const key of Object.keys(node)) {
    if (RUNNABLE_JSON_KEY.test(key)) return true;
    if (jsonDeclaresKey(node[key], depth + 1)) return true;
  }
  return false;
}

const BOOTSTRAP_ALLOWED = new Set([
  "AGENTS.md", "CLAUDE.md", "MALLAN-PLATFORM-MASTER-PLAN.md", "NEON.md",
  ".mcp.json", "mcp/trestle-fields/index.ts", "mcp/trestle-fields/README.md",
  "docs/architecture/NEON-COST-CONTROL-POLICY.md",
  "docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md",
  "docs/audits/zero-billing-neon-vercel-2026-06-12.md",
  "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md",
  "docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md",
  "docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md",
  "scripts/ci/mallan-execution-control.mjs", "scripts/validate-release-status.js",
  "scripts/release-safety/release-truth-verdict.js",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/mallan-execution-control.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  "tests/runtime/neon-branch-prune-route.test.ts", "tests/runtime/neon-prune-cli.test.ts",
  ".github/workflows/pr-check.yml", ".github/workflows/branch-authority.yml",
  ".github/workflows/authority-root.yml", ".github/workflows/release-truth.yml",
  ".github/workflows/cleanup-neon-preview-branch.yml", ".github/workflows/rotate-db-keys.yml",
  "app/api/cron/neon-branch-prune/route.ts", "scripts/neon-prune-branches.ts", "vercel.json",
  "scripts/ops-health.js", "scripts/branch-prune-health.js", "tests/runtime/branch-prune-health.test.ts",
  "lib/neon/branches.ts", "tests/runtime/neon-branch-prunability.test.ts",
  "package.json", "artifacts/api-route-catalog.json",
  "lib/ops/canonical-neon-target.ts",
  "scripts/media-image-health.js", "scripts/r2-retry-health.js",
  "scripts/neon-verify.ts", "scripts/health/probe.ts",
  "docs/PROJECT-HEALTH-DASHBOARD.md",
  "docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md",
  "artifacts/api-route-catalog.md", "scripts/reso/route-catalog.js",
  "lib/ops/db-target.ts", "scripts/ci/assert-canonical-neon-target.mjs",
  "tests/runtime/canonical-neon-target.test.ts", "docs/PLATFORM-ISSUE-REGISTRY.md",
  "docs/audits/green-baseline-2026-06-07.md",
  "docs/superpowers/plans/2026-06-07-systematic-fix-plan.md",
  "lib/idx/__tests__/coverage-backfill-preview.test.ts.disabled",
  "tests/runtime/release-safety-ruleset-discovery.test.ts",
  // Corrections that followed the independent review of b873d4f2.
  ".gitignore",
  "docs/operations/one-cycle-w2-schedule-design-2026-07-23.md",
  "docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md",
  "memory/NEXT-SESSION-2026-04-28.md",
  "scripts/health/health-status.ts",
  "tests/runtime/health-probe-status.test.ts"
]);

// Maya's mandatory database chain. Any change that can move, name, resolve or consume the
// database target must declare EVERY station below before it can pass. The generic impact
// graph is not sufficient here: a database change reaches env resolution, migrations,
// schedules, both deployment environments and every downstream reader, and a packet that
// names only the file it edited has described a file, not a change.
const DATABASE_IMPACT_STATIONS = [
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

// A file is database-shaped if EITHER its base version or its proposed version carries a
// database signal. Reading only HEAD meant that REMOVING the database behaviour from a
// neutral-path file, or deleting the file, erased the signal before classification.
function fileCarriesDatabaseSignal(body) {
  if (!body) return false;
  if (DATABASE_CONTENT_SIGNALS.some((signal) => body.includes(signal))) return true;
  if (DATABASE_CONTENT_PATTERNS.some((pattern) => pattern.test(body))) return true;
  // Loading the driver as a value IS the dependency. This subsumes every naming
  // spelling, including ones nobody has written yet.
  if (loadsDatabaseDriver(body)) return true;
  // Constructors reached through an alias or a namespace. Literal names are not enough:
  // `import { Pool as PgPool } from "pg"` and `const { Pool: PgPool } = require("pg")`
  // are the same consumer under a different binding.
  for (const alias of databaseClientAliases(body)) {
    if (new RegExp("new\\s+" + alias + "\\s*\\(").test(body)) return true;
    if (new RegExp("new\\s+[A-Za-z_$][\\w$]*\\." + alias + "\\s*\\(").test(body)) return true;
  }
  return false;
}

// Local binding names for database client constructors, from every ordinary spelling:
// named ES import with or without `as`, default ES import, plain require, and destructured
// require with or without renaming. A type-only import does not itself load the driver,
// so it is not a DRIVER-LOAD signal. It is no longer treated as evidence of nothing,
// though: a file that imports the client as a TYPE and then calls a model method through
// an injected parameter is a database writer, and the behaviour patterns above catch it.
// The earlier note here called type-only imports common and inert in this repository.
// lib/media/crm-media.ts disproves the inert half: its only driver reference is a type,
// and it creates and updates rows through a client it receives as an argument.
const DB_SPECIFIER = "(?:pg|@prisma\\/client)";
const DB_NAMED_IMPORT = new RegExp("import\\s+(?!type\\s)\\{([^}]*)\\}\\s*from\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_DEFAULT_IMPORT = new RegExp("import\\s+(?!type\\s)([A-Za-z_$][\\w$]*)\\s*(?:,|from)[^;]*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_PLAIN_REQUIRE = new RegExp("(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");
const DB_DESTRUCTURED_REQUIRE = new RegExp("(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*require\\s*\\(\\s*['\"]" + DB_SPECIFIER + "['\"]", "g");

// Any value-load of the driver, by any syntax: static import, bare side-effect import,
// require, and dynamic import. `import type` is excluded by the negative lookahead.
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
    // `Pool as PgPool` (ES) and `Pool: PgPool` (destructuring) both rename.
    const renamed = piece.split(/\s+as\s+|\s*:\s*/);
    // A default value is part of the destructuring pattern, not part of the name:
    // `{ Pool: PgPool = FallbackPool }` binds PgPool. Keeping the initializer made the
    // whole thing fail the identifier test, so the binding was dropped and every use of
    // it became invisible.
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

// Formats that CARRY a database target without being programs. A dotenv file exists to
// set the connection variable, and it was the one format never opened.
const DATABASE_CONFIG_SUFFIXES = [".env", ".env.local", ".env.example", ".env.production", ".env.development", ".ini", ".cfg", ".conf", ".properties"];

function carriesDatabaseConfig(filePath) {
  const base = String(filePath).toLowerCase().split("/").pop();
  return DATABASE_CONFIG_SUFFIXES.some((s) => base === s.slice(1) || base.endsWith(s)) || base.startsWith(".env");
}

function touchesDatabaseTarget(filePath, readHead, readBase) {
  if (DATABASE_PATH_EXACT.includes(filePath)) return true;
  if (DATABASE_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return true;
  // Read first: an extensionless script announces itself in its first two characters, a
  // dotenv file announces itself by name, and the deciding version may be either side of
  // the change.
  const head = typeof readHead === "function" ? readHead(filePath) : null;
  const base = typeof readBase === "function" ? readBase(filePath) : null;
  const openable =
    isExecutablePath(filePath, head) || isExecutablePath(filePath, base) || carriesDatabaseConfig(filePath);
  if (openable && (fileCarriesDatabaseSignal(head) || fileCarriesDatabaseSignal(base))) return true;
  // The filename substring is the LAST resort, and only for a file that could execute or
  // configure. Running it first made a one-line edit to a prose document named
  // neon-write-amplification-forensic-2026-07-25.md demand all ten stations, which is the
  // kind of noise that gets a rule worked around rather than obeyed.
  if (!openable) return false;
  const lower = filePath.toLowerCase();
  return DATABASE_PATH_SUBSTRINGS.some((needle) => lower.includes(needle));
}

// String escapes evaluate at runtime, so "console\x2eneon\x2etech" IS the prohibited host.
// Decode the ordinary numeric escapes before normalising, otherwise stripping backslashes
// leaves x2e in place of the separator and the needle can never match.
function codePoint(hex) {
  const code = parseInt(hex, 16);
  return code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeSourceEscapes(body) {
  return String(body)
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Braced form: 1 to 6 digits, terminated by the brace.
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => codePoint(hex))
    // Unbraced form: EXACTLY four digits. Greedy matching here mis-decoded innocent text
    // as well as hiding hostile text.
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => codePoint(hex))
    // Python and shell octal, alongside the hex forms. \056 is a dot and \137 an
    // underscore, which is enough to spell every host and credential name here.
    .replace(/\\([0-7]{1,3})/g, (_, oct) => {
      const code = parseInt(oct, 8);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

// A station is not satisfied by pointing at prose. A document records a claim; the station
// must name the thing that does the work, or say UNVERIFIED so the gap stays visible.
function stationIsDocumentationOnly(entries) {
  return entries.every((entry) => {
    const value = entry.trim().toLowerCase();
    return value.endsWith(".md") || value.endsWith(".txt");
  });
}

const MUTATION_FLAGS = [
  "production_mutation_authorized", "schema_migration_authorized",
  "environment_mutation_authorized", "neon_mutation_authorized",
  "destructive_data_authorized", "manual_cron_authorized",
  "new_canonical_system_authorized"
];

const REQUIREMENT_KEYS = [
  "impact_graph_required", "all_readers_writers_required", "negative_tests_required",
  "integration_proof_required", "downstream_proof_required",
  "compliance_proof_required_when_applicable", "no_parallel_path_proof_required"
];

const FLAG_DOMAINS = {
  production_mutation_authorized: "production-mutation",
  schema_migration_authorized: "schema",
  environment_mutation_authorized: "environment",
  neon_mutation_authorized: "neon-control-plane",
  destructive_data_authorized: "destructive-data",
  manual_cron_authorized: "manual-cron"
};

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function fail(message) {
  process.stderr.write("\n[MALLAN EXECUTION CONTROL] FAIL\n");
  process.stderr.write(message + "\n");
  process.exit(1);
}

function pass(message) {
  process.stdout.write("\n[MALLAN EXECUTION CONTROL] PASS\n");
  process.stdout.write(message + "\n");
}

function parseControl(markdown) {
  const start = markdown.indexOf(CONTROL_START);
  const end = markdown.indexOf(CONTROL_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("execution-control markers are missing or malformed");
  }
  const body = markdown.slice(start + CONTROL_START.length, end);
  const fence = body.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
  if (!fence) throw new Error("execution-control JSON fence is missing");
  const control = JSON.parse(fence[1]);
  if (control.version !== 1) throw new Error("unsupported execution-control version");
  return control;
}

function readBaseFile(baseRef, filePath) {
  try {
    return git(["show", baseRef + ":" + filePath]);
  } catch {
    return null;
  }
}

function changedFiles(baseRef) {
  const out = git(["diff", "--name-status", baseRef + "...HEAD"]);
  if (!out) return [];
  return out.split("\n").filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const status = parts[0];

    if (status.startsWith("R") || status.startsWith("C")) {
      return {
        status,
        sourcePath: parts[1],
        path: parts[2],
      };
    }

    return { status, sourcePath: null, path: parts[1] };
  });
}

function pathAllowed(filePath, allowed) {
  return allowed.some((entry) => {
    if (entry.endsWith("/**")) return filePath.startsWith(entry.slice(0, -2));
    if (entry.endsWith("/")) return filePath.startsWith(entry);
    return filePath === entry;
  });
}

function refPatternMatches(pattern, ref) {
  if (pattern === "~ALL") return true;
  if (pattern === "~DEFAULT_BRANCH") return ref === "refs/heads/main";
  if (typeof pattern !== "string") return false;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp("^" + escaped + "$").test(ref);
}

function rulesetAppliesToMain(ruleset) {
  if (!ruleset || ruleset.enforcement !== "active" || ruleset.target !== "branch") return false;
  const refName = ruleset.conditions?.ref_name;
  const includes = Array.isArray(refName?.include) ? refName.include : [];
  const excludes = Array.isArray(refName?.exclude) ? refName.exclude : [];
  const targetRef = "refs/heads/main";
  return includes.some((p) => refPatternMatches(p, targetRef)) &&
    !excludes.some((p) => refPatternMatches(p, targetRef));
}

function rulesetRequiresAuthorityRoot(ruleset) {
  return Array.isArray(ruleset?.rules) && ruleset.rules.some(
    (rule) =>
      rule?.type === "required_status_checks" &&
      Array.isArray(rule?.parameters?.required_status_checks) &&
      rule.parameters.required_status_checks.some((check) => check?.context === "authority-root")
  );
}

function loadRulesetsForAuthorityProbe() {
  if (process.env.NODE_ENV === "test" && process.env.MALLAN_RULESET_FIXTURE_JSON) {
    return JSON.parse(process.env.MALLAN_RULESET_FIXTURE_JSON);
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required for the authority-root ruleset probe");
  const list = JSON.parse(execFileSync(
    "gh",
    ["api", "repos/" + repository + "/rulesets?includes_parents=true"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ));
  const details = [];
  for (const item of list) {
    if (item?.enforcement !== "active" || item?.target !== "branch") continue;
    const raw = execFileSync(
      "gh",
      ["api", "repos/" + repository + "/rulesets/" + item.id],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    details.push(JSON.parse(raw));
  }
  return details;
}

function probeAuthorityRootRequiredMain() {
  let required = false;
  try {
    required = loadRulesetsForAuthorityProbe().some(
      (ruleset) => rulesetAppliesToMain(ruleset) && rulesetRequiresAuthorityRoot(ruleset)
    );
  } catch (error) {
    process.stderr.write("[MALLAN EXECUTION CONTROL] authority-root ruleset probe unavailable: " + error.message + "\n");
    required = false;
  }
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, "MALLAN_AUTHORITY_ROOT_REQUIRED=" + String(required) + "\n");
  }
  process.stdout.write("authority-root required on main: " + String(required) + "\n");
  return required;
}

function validateControl(control) {
  const allowedModes = new Set(["control-update", "implementation", "control-root-maintenance"]);
  if (!allowedModes.has(control.mode)) throw new Error("unsupported execution-control mode: " + control.mode);

  for (const key of ["mode", "authorized_branch", "base_branch", "packet_id", "objective"]) {
    if (typeof control[key] !== "string" || !control[key].trim()) throw new Error("control." + key + " must be a non-empty string");
  }
  for (const key of ["authorized_paths", "allowed_new_files", "impact_domains", "provider_proof_required"]) {
    if (!Array.isArray(control[key])) throw new Error("control." + key + " must be an array");
    for (const entry of control[key]) {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error("control." + key + " entries must be non-empty strings");
      }
    }
  }

  // The chain is optional in the contract SHAPE because most packets are not
  // database-shaped. When present it must be complete. Whether it is REQUIRED is
  // decided at evaluation time from the actual changed paths.
  if (control.impact_graph.database_impact_chain !== undefined) {
    const chain = control.impact_graph.database_impact_chain;
    if (!chain || typeof chain !== "object" || Array.isArray(chain)) {
      throw new Error("control.impact_graph.database_impact_chain must be an object");
    }
    for (const station of DATABASE_IMPACT_STATIONS) {
      if (!Array.isArray(chain[station]) || chain[station].length === 0) {
        throw new Error("database_impact_chain." + station + " must be a non-empty array");
      }
      for (const entry of chain[station]) {
        if (typeof entry !== "string" || !entry.trim()) {
          throw new Error("database_impact_chain." + station + " entries must be non-empty strings");
        }
      }
    }
    const unknown = Object.keys(chain).filter((key) => !DATABASE_IMPACT_STATIONS.includes(key));
    if (unknown.length) {
      throw new Error("database_impact_chain has unknown stations: " + unknown.join(", "));
    }
  }
  for (const key of MUTATION_FLAGS) {
    if (typeof control[key] !== "boolean") throw new Error("control." + key + " must be boolean");
  }

  if (!control.requirements || typeof control.requirements !== "object") throw new Error("control.requirements must be an object");
  for (const key of REQUIREMENT_KEYS) {
    if (typeof control.requirements[key] !== "boolean") throw new Error("control.requirements." + key + " must be boolean");
  }
  for (const key of ["impact_graph_required", "all_readers_writers_required", "no_parallel_path_proof_required"]) {
    if (control.requirements[key] !== true) throw new Error("control.requirements." + key + " must remain true");
  }

  if (!control.impact_graph || typeof control.impact_graph !== "object") throw new Error("control.impact_graph must be an object");
  for (const key of ["root_owner_paths","writer_paths","reader_paths","publisher_paths","downstream_surfaces","test_paths","compliance_surfaces"]) {
    if (!Array.isArray(control.impact_graph[key]) || control.impact_graph[key].length === 0) {
      throw new Error("control.impact_graph." + key + " must be a non-empty array");
    }
    for (const entry of control.impact_graph[key]) {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error("control.impact_graph." + key + " entries must be non-empty strings");
      }
    }
  }

  if (control.mode === "implementation" || control.mode === "control-root-maintenance") {
    if (control.authorized_paths.length === 0) throw new Error(control.mode + " mode requires authorized_paths");
    if (control.impact_domains.length === 0) throw new Error(control.mode + " mode requires impact_domains");
  }
  if (control.mode === "control-root-maintenance") {
    const invalid = control.authorized_paths.filter((p) => !IMMUTABLE_CONTROL_PATHS.has(p));
    if (invalid.length) throw new Error("control-root-maintenance may authorize only protected control paths:\n" + invalid.map((p)=>"  - "+p).join("\n"));
  }
  for (const [flag, domain] of Object.entries(FLAG_DOMAINS)) {
    if (control[flag] === true && !control.impact_domains.includes(domain)) {
      throw new Error("control." + flag + "=true requires impact_domains to include " + domain);
    }
  }
}

function csvSet(name) {
  return new Set(String(process.env[name] || "").split(",").map((v)=>v.trim()).filter(Boolean));
}

function mutationRequirementsForPath(filePath) {
  const out = new Set();
  if (filePath === "prisma/schema.prisma" || filePath.startsWith("prisma/migrations/") || filePath.startsWith("sql/")) out.add("schema_migration_authorized");
  if (filePath === "vercel.json" || filePath === ".github/workflows/rotate-db-keys.yml") out.add("environment_mutation_authorized");
  if ([
    ".github/workflows/cleanup-neon-preview-branch.yml",
    ".github/workflows/rotate-db-keys.yml",
    "app/api/cron/neon-branch-prune/route.ts",
    "scripts/neon-prune-branches.ts"
  ].includes(filePath) || filePath.startsWith("lib/neon/")) out.add("neon_mutation_authorized");
  if ([
    ".github/workflows/cleanup-neon-preview-branch.yml",
    ".github/workflows/rotate-db-keys.yml",
    "app/api/cron/neon-branch-prune/route.ts",
    "scripts/neon-prune-branches.ts"
  ].includes(filePath)) out.add("destructive_data_authorized");
  if (filePath === ".github/workflows/rotate-db-keys.yml") {
    out.add("production_mutation_authorized");
    out.add("manual_cron_authorized");
  }
  return [...out];
}

function headPathExists(filePath) {
  try {
    git(["cat-file", "-e", "HEAD:" + filePath]);
    return true;
  } catch {
    return false;
  }
}

function validateExecutionEvidence(control, changes) {
  const providerProofs = csvSet("MALLAN_PROVIDER_PROOFS");
  const missingProvider = control.provider_proof_required.filter((proof)=>!providerProofs.has(proof));
  if (missingProvider.length) throw new Error("required provider proof is absent from the base-controlled workflow:\n" + missingProvider.map((p)=>"  - "+p).join("\n"));

  const failures = [];
  for (const change of changes) {
    for (const requiredFlag of mutationRequirementsForPath(change.path)) {
      if (control[requiredFlag] !== true) failures.push(change.path + " requires " + requiredFlag + "=true");
    }
  }
  if (failures.length) throw new Error("sensitive change class is not authorized by the base Execution State:\n" + failures.map((v)=>"  - "+v).join("\n"));

  if (control.requirements.negative_tests_required) {
    const declaredTests = new Set(control.impact_graph.test_paths);
    const deletedDeclaredTests = changes
      .filter((change) => change.status.startsWith("D") && declaredTests.has(change.path))
      .map((change) => change.path);
    if (deletedDeclaredTests.length) {
      throw new Error(
        "negative_tests_required=true but declared test paths were deleted:\n" +
        deletedDeclaredTests.map((p) => "  - " + p).join("\n")
      );
    }

    const changedLiveTest = changes.some(
      (change) =>
        declaredTests.has(change.path) &&
        !change.status.startsWith("D") &&
        headPathExists(change.path)
    );
    if (!changedLiveTest) {
      throw new Error(
        "negative_tests_required=true but no changed impact_graph.test_paths remains present at HEAD"
      );
    }
  }

  if ((process.env.MALLAN_CONTROL_PHASE || "preflight") === "final") {
    const proofs = csvSet("MALLAN_EXECUTION_PROOFS");
    const needed = [];
    if (control.requirements.negative_tests_required) needed.push("negative-tests");
    if (control.requirements.integration_proof_required) needed.push("integration");
    if (control.requirements.downstream_proof_required) needed.push("downstream");
    if (control.requirements.compliance_proof_required_when_applicable) needed.push("compliance");
    if (control.requirements.no_parallel_path_proof_required) needed.push("no-parallel-path");
    const missing = needed.filter((p)=>!proofs.has(p));
    if (missing.length) throw new Error("final execution proof is incomplete:\n" + missing.map((p)=>"  - "+p).join("\n"));
  }
}
function checkCreatedBranch() {
  const createdBranch = process.argv[3] || process.env.CREATED_BRANCH || "";
  if (!createdBranch) fail("Created branch name was not provided.");

  let state;
  try {
    state = fs.readFileSync(STATE_PATH, "utf8");
  } catch {
    fail("Canonical Execution State is missing on the checked-out main branch.");
  }

  let control;
  try {
    control = parseControl(state);
    validateControl(control);
  } catch (error) {
    fail("Canonical Execution State is invalid: " + error.message);
  }

  if (createdBranch === "main" || createdBranch === control.authorized_branch) {
    pass("Created branch is authorized: " + createdBranch);
    return;
  }

  fail(
    "Unauthorized branch creation: " + createdBranch +
    ". The only active work branch is " + control.authorized_branch + "."
  );
}

// Evidence must be a FILE. `git cat-file -e ref:some/dir` resolves the tree, so path
// existence alone accepted a directory, and a directory can satisfy any station whose
// rule is a path shape. Asking for the object TYPE settles it for every station at once.
// Same question asked of the proposed tree rather than the base.
function headPathIsFile(filePath) {
  try {
    return git(["cat-file", "-t", "HEAD:" + filePath]).trim() === "blob";
  } catch {
    return false;
  }
}

function basePathIsFile(baseRef, filePath) {
  try {
    return git(["cat-file", "-t", baseRef + ":" + filePath]).trim() === "blob";
  } catch {
    return false;
  }
}

function basePathExists(baseRef, filePath) {
  try {
    git(["cat-file", "-e", baseRef + ":" + filePath]);
    return true;
  } catch {
    return false;
  }
}

function validateImpactPaths(control, baseRef) {
  const pathKeys = [
    "root_owner_paths",
    "writer_paths",
    "reader_paths",
    "publisher_paths",
    "test_paths"
  ];

  const missing = [];
  for (const key of pathKeys) {
    for (const filePath of control.impact_graph[key]) {
      if (basePathExists(baseRef, filePath)) continue;
      if (control.allowed_new_files.includes(filePath)) continue;
      missing.push(key + ": " + filePath);
    }
  }

  if (missing.length) {
    throw new Error(
      "impact graph names repo paths that do not exist on the PR base and are not authorized new files:\n" +
      missing.map((item) => "  - " + item).join("\n")
    );
  }
}

// Path existence is not evidence, and neither is directory membership. A workflow that
// geocodes addresses satisfied five stations purely by living under .github/workflows/.
// Each station therefore requires BOTH a path shape AND content that actually concerns
// that station. The content test is a keyword set rather than a parse: the goal is to
// refuse a file that has nothing to do with the station, not to grade its quality.
// Station content is judged with comments stripped. A file whose only claim to a station
// is a sentence about it is describing the station, not evidencing it.
function stationBody(body) {
  if (typeof body !== "string") return "";
  try {
    return stripSourceComments(body);
  } catch {
    return body;
  }
}

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
      // "chain" and "pool" are ordinary English and matched unrelated assertions, so the
      // test station now wants a database term or a real database signal in the CODE.
      (fileCarriesDatabaseSignal(stationBody(body)) ||
        /\b(?:database|prisma|neon|DATABASE_URL|migration|schema)\b/i.test(stationBody(body))),
  },
};

// ONE PRE-SUCCESS INVARIANT. The chain used to run only on the implementation path, so a
// control-update or control-root-maintenance packet could change a database-shaped file and
// return success without it. This is called before EVERY successful return that can carry
// database-shaped changes, so adding a future mode cannot silently reopen the hole.
function assertDatabaseChain(control, changedPaths, readHead, readBase, baseRef) {
  const databaseChanges = changedPaths.filter((filePath) => touchesDatabaseTarget(filePath, readHead, readBase));
  if (databaseChanges.length === 0) return;

  const chain = control?.impact_graph?.database_impact_chain;
  if (!chain || typeof chain !== "object" || Array.isArray(chain)) {
    fail([
      "This packet changes database-shaped paths, so impact_graph.database_impact_chain",
      "is required and is absent. Declare every station:",
      "  " + DATABASE_IMPACT_STATIONS.join(String.fromCharCode(32, 8594, 32)),
      "Database-shaped paths changed here:",
      ...databaseChanges.map((filePath) => "  - " + filePath)
    ].join(String.fromCharCode(10)));
  }

  const incomplete = DATABASE_IMPACT_STATIONS.filter(
    (station) => !Array.isArray(chain[station]) || chain[station].length === 0
  );
  if (incomplete.length) {
    fail([
      "The database chain is incomplete. Every station is required for a database change,",
      "because a database change reaches all of them whether or not the packet looked:",
      ...incomplete.map((station) => "  - missing: " + station)
    ].join(String.fromCharCode(10)));
  }

  // A station must be GROUNDED. Three things that are not evidence, each refused by name:
  //   UNVERIFIED  an honest truth state, and honestly a blocker. It records that the station
  //               was not established, so it cannot also report that it was.
  //   free text   a bare word such as checked asserts a conclusion and carries no locator.
  //   prose       a .md or .txt file records a claim; it is not the thing that does the work.
  const unverified = [];
  const freeText = [];
  const proseOnly = [];
  const unresolved = [];
  const offClass = [];
  for (const station of DATABASE_IMPACT_STATIONS) {
    const entries = chain[station];
    if (stationIsDocumentationOnly(entries)) proseOnly.push(station);
    for (const entry of entries) {
      const value = entry.trim();
      if (value.toUpperCase().startsWith("UNVERIFIED")) { unverified.push(station + ": " + value); continue; }
      if (!value.includes("/") && !value.includes(".")) { freeText.push(station + ": " + value); continue; }
      const exists = basePathExists(baseRef, value);
      const isNew = (control.allowed_new_files || []).includes(value);
      if (!exists && !isNew) { unresolved.push(station + ": " + value); continue; }
      // Being ALLOWED to add a file is not the same as having added it. A station that
      // cites a path this packet never produced is citing nothing at all.
      if (!exists && !headPathIsFile(value)) {
        unresolved.push(station + ": " + value + "  (declared new, but not present at HEAD)");
        continue;
      }
      // A tree is not evidence. A packet that names a folder has named a place to look,
      // which is what the station was asking the packet to have already done.
      if (exists && !basePathIsFile(baseRef, value)) {
        offClass.push(station + ": " + value + "  (a directory is not evidence; name the file)");
        continue;
      }
      // The path is real. It must also be the RIGHT KIND of thing for this station.
      const klass = DATABASE_STATION_EVIDENCE[station];
      const body = exists ? readBase(value) : readHead(value);
      if (klass && !klass.accepts(value, body)) {
        offClass.push(station + ": " + value + "  (station wants " + klass.describes + ")");
      }
    }
  }

  if (unverified.length) {
    fail([
      "A database-chain station is UNVERIFIED. That is an honest state and it BLOCKS the",
      "packet: a station that was not established cannot also serve as the evidence that it",
      "was. Establish it, or stop the change here:",
      ...unverified.map((item) => "  - " + item)
    ].join(String.fromCharCode(10)));
  }
  if (freeText.length) {
    fail([
      "A database-chain station carries free text rather than evidence. A bare word asserts a",
      "conclusion and names nothing that can be checked:",
      ...freeText.map((item) => "  - " + item)
    ].join(String.fromCharCode(10)));
  }
  if (proseOnly.length) {
    fail([
      "A database-chain station may not be satisfied by a document citation alone. A document",
      "records a claim; the station must name what does the work:",
      ...proseOnly.map((station) => "  - documentation-only: " + station)
    ].join(String.fromCharCode(10)));
  }
  if (unresolved.length) {
    fail([
      "The database chain names repo paths that do not exist on the PR base and are not",
      "authorized new files. A fabricated station is not proof:",
      ...unresolved.map((item) => "  - " + item)
    ].join(String.fromCharCode(10)));
  }
  if (offClass.length) {
    fail([
      "A database-chain station names a real file that is not evidence FOR THAT STATION.",
      "Path existence alone is not proof: any repository file exists. Each station must",
      "name the kind of thing it is about:",
      ...offClass.map((item) => "  - " + item)
    ].join(String.fromCharCode(10)));
  }
}

function main() {
  const baseBranch = process.env.MALLAN_BASE_BRANCH || process.env.GITHUB_BASE_REF || "main";
  const headBranch =
    process.env.MALLAN_HEAD_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    git(["branch", "--show-current"]);
  const prNumber = process.env.MALLAN_PR_NUMBER || process.env.GITHUB_PR_NUMBER || "";
  const baseRef = process.env.MALLAN_BASE_REF || "origin/" + baseBranch;

  const changes = changedFiles(baseRef);

  const renameOrCopyChanges = changes.filter(
    (item) => item.status.startsWith("R") || item.status.startsWith("C")
  );
  if (renameOrCopyChanges.length) {
    fail(
      "Renames/copies are not permitted by the Mallan execution gate because both source and destination authority must be reviewed explicitly.\n" +
      renameOrCopyChanges
        .map((item) => "  - " + item.status + ": " + item.sourcePath + " -> " + item.path)
        .join("\n")
    );
  }

  const changedPaths = changes.map((item) => item.path);

  // A deleted direct-Neon control path may be touched only to keep it deleted.
  // If it still exists at HEAD it has been revived, and revival is refused in every mode.
  const revivedNeonPaths = changedPaths.filter((filePath) => {
    if (!DELETED_DIRECT_NEON_PATHS.has(filePath)) return false;
    try { git(["cat-file", "-e", "HEAD:" + filePath]); return true; } catch { return false; }
  });
  if (revivedNeonPaths.length) {
    fail([
      "Deleted direct-Neon control paths may not return. Mallan reaches Neon only",
      "through the Vercel-managed Marketplace resource. A re-added file, or a",
      "fail-only stub, is still a Mallan path:",
      ...revivedNeonPaths.map((filePath) => "  - " + filePath)
    ].join(String.fromCharCode(10)));
  }

  // Read a changed file as it stands in the proposed HEAD. Deleted paths return null,
  // which is the correct answer: a deletion cannot introduce a capability.
  const readHead = (filePath) => {
      try { return git(["show", "HEAD:" + filePath]); } catch { return null; }
    };

  // The base version matters as much as the proposed one: removing a database reader is
  // itself a database change, and a deleted file has no HEAD content at all.
  const readBase = (filePath) => readBaseFile(baseRef, filePath);

  // CAPABILITY, NOT FILENAME. The retired direct-Neon control plane may not return under
  // any new name. A file is refused for reaching the Neon control plane, whatever it is
  // called, so scripts/neon-control.ts and a neon-rotation-v2 workflow are equally refused
  // and are refused for what they do, not for containing the word neon.
  const neonCapabilityViolations = [];
  for (const filePath of changedPaths) {
    if (NEON_CAPABILITY_EXEMPT.has(filePath)) continue;
    const body = readHead(filePath);
    if (!body) continue;
    if (!isExecutablePath(filePath, body)) continue;
    const readings = capabilityScanReadings(body);
    const found = capabilityNeedles()
      .filter((n) => body.includes(n.signal) || readings.some((r) => r.includes(n.collapsed)))
      .map((n) => n.signal);
    if (found.length) neonCapabilityViolations.push(filePath + "  ->  " + found.join(", "));
  }
  if (neonCapabilityViolations.length) {
    fail([
      "Direct Neon control-plane capability is prohibited. Mallan reaches Neon only through",
      "the Vercel-managed Marketplace resource. This is refused on CAPABILITY, not on the",
      "filename, so renaming the file does not help:",
      ...neonCapabilityViolations.map((item) => "  - " + item)
    ].join(String.fromCharCode(10)));
  }

  const baseMaster = readBaseFile(baseRef, MASTER_PATH);
  const baseState = readBaseFile(baseRef, STATE_PATH);

  if (!baseMaster || !baseState) {
    if (prNumber !== BOOTSTRAP_PR) {
      fail(
        "Base " + baseBranch +
        " is missing the canonical Master and/or Execution State. " +
        "Only bootstrap PR #" + BOOTSTRAP_PR + " may establish them."
      );
    }

    const unexpected = changedPaths.filter((filePath) => !BOOTSTRAP_ALLOWED.has(filePath));
    if (unexpected.length) {
      fail(
        "Bootstrap PR #" + BOOTSTRAP_PR +
        " contains paths outside its fixed governance allowlist:\n" +
        unexpected.map((filePath) => "  - " + filePath).join("\n")
      );
    }

    if (!changedPaths.includes(MASTER_PATH) || !changedPaths.includes(STATE_PATH)) {
      fail(
        "Bootstrap PR #" + BOOTSTRAP_PR +
        " must add both " + MASTER_PATH + " and " + STATE_PATH + "."
      );
    }

    const headState = git(["show", "HEAD:" + STATE_PATH]);
    const control = parseControl(headState);
    validateControl(control);

      // RECORDED EXCEPTION: the bootstrap PR is not chain-gated, because base main carries no
      // Execution State to declare a chain in. The exception is bounded to one hard-coded PR
      // number and closes the moment that PR merges; no later packet can reach this branch.
    pass(
      "Bootstrap PR #" + BOOTSTRAP_PR +
      " is limited to the fixed governance/control-plane allowlist."
    );
    return;
  }

  let control;
  try {
    control = parseControl(baseState);
    validateControl(control);
  } catch (error) {
    fail("Base execution contract is invalid: " + error.message);
  }

  if (baseBranch !== control.base_branch) {
    fail("PR base is " + baseBranch + "; execution contract requires " + control.base_branch + ".");
  }
  if (headBranch !== control.authorized_branch) {
    fail("PR head is " + headBranch + "; only authorized branch " + control.authorized_branch + " may execute.");
  }

  if (control.mode === "control-update") {
    const onlyState = changedPaths.length > 0 && changedPaths.every((filePath)=>filePath===STATE_PATH);
    if (!onlyState) fail("Execution contract is in control-update mode. Only " + STATE_PATH + " may change.\n" + changedPaths.map((p)=>"  - "+p).join("\n"));
    let proposedControl;
    try {
      proposedControl = parseControl(git(["show","HEAD:"+STATE_PATH]));
      validateControl(proposedControl);
      validateImpactPaths(proposedControl, baseRef);
    } catch (error) {
      fail("Proposed execution contract is invalid: " + error.message);
    }
    if (proposedControl.base_branch !== baseBranch) fail("Proposed execution contract targets base " + proposedControl.base_branch + "; control updates must remain anchored to " + baseBranch + ".");
    // Pre-success invariant: a database-shaped change cannot exit through this mode either.
    assertDatabaseChain(control, changedPaths, readHead, readBase, baseRef);
    pass("Control-update PR is limited to a valid canonical Execution State.");
    return;
  }

  if (control.mode === "control-root-maintenance") {
    const onlyState = changedPaths.length > 0 && changedPaths.every((filePath)=>filePath===STATE_PATH);
    if (onlyState) {
      try {
        const proposed = parseControl(git(["show","HEAD:"+STATE_PATH]));
        validateControl(proposed);
        validateImpactPaths(proposed, baseRef);
        if (proposed.mode !== "control-update") throw new Error("root maintenance may exit only to control-update mode");
      } catch (error) {
        fail("Control-root maintenance exit contract is invalid: " + error.message);
      }
      // Pre-success invariant: a database-shaped change cannot exit through this mode either.
      assertDatabaseChain(control, changedPaths, readHead, readBase, baseRef);
      pass("Control-root maintenance exited through a state-only control update.");
      return;
    }
    if (process.env.MALLAN_AUTHORITY_ROOT_REQUIRED !== "true") fail("Control-root maintenance is blocked until live GitHub rules prove authority-root is a required main-branch status check.");
    const outsideRoot = changedPaths.filter((p)=>!IMMUTABLE_CONTROL_PATHS.has(p));
    if (outsideRoot.length) fail("Control-root maintenance contains paths outside the protected control root:\n" + outsideRoot.map((p)=>"  - "+p).join("\n"));
    const outsideEnvelope = changedPaths.filter((p)=>!pathAllowed(p,control.authorized_paths));
    if (outsideEnvelope.length) fail("Control-root maintenance changed paths outside its base-state envelope:\n" + outsideEnvelope.map((p)=>"  - "+p).join("\n"));

    const deletedEssential = changes
      .filter((change) => change.status.startsWith("D") && NONDELETABLE_CONTROL_ROOT_PATHS.has(change.path))
      .map((change) => change.path);
    if (deletedEssential.length) {
      fail(
        "Control-root maintenance may modify essential authority files in place but may not delete them:\n" +
        deletedEssential.map((p) => "  - " + p).join("\n")
      );
    }

    try {
      validateImpactPaths(control, baseRef);
      validateExecutionEvidence(control, changes);
    } catch (error) {
      fail("Control-root maintenance proof failed: " + error.message);
    }
    const added = changes.filter((i)=>i.status.startsWith("A")).map((i)=>i.path);
    const unapproved = added.filter((p)=>!control.allowed_new_files.includes(p));
    if (unapproved.length) fail("Control-root maintenance created unapproved files:\n" + unapproved.map((p)=>"  - "+p).join("\n"));
    // Pre-success invariant: a database-shaped change cannot exit through this mode either.
    assertDatabaseChain(control, changedPaths, readHead, readBase, baseRef);
    pass("Control-root maintenance is base-authorized and authority-root is required.");
    return;
  }

  if (control.mode !== "implementation") fail("Unsupported execution mode: " + control.mode);

  const controlRootChanges = changedPaths.filter((p)=>IMMUTABLE_CONTROL_PATHS.has(p));
  if (controlRootChanges.length) {
    fail("Implementation PR attempts to modify the protected execution/proof root:\n" + controlRootChanges.map((p)=>"  - "+p).join("\n") + "\nUse a prior state-only control update to authorize control-root-maintenance.");
  }
  try {
    validateImpactPaths(control, baseRef);
    validateExecutionEvidence(control, changes);
  } catch (error) {
    fail("Implementation proof is not grounded in the base authority: " + error.message);
  }

  // MANDATORY DATABASE CHAIN. A database-shaped change must declare every station
  // before it can pass. This is enforced from the changed paths, not from the packet's
  // own opinion of its scope, so a packet cannot escape the chain by declining to
  // mention that it touched the database.
  assertDatabaseChain(control, changedPaths, readHead, readBase, baseRef);

  for (const protectedPath of [STATE_PATH, MASTER_PATH]) {
    if (changedPaths.includes(protectedPath)) {
      fail("Implementation PR may not modify authority file " + protectedPath + ".");
    }
  }

  const outOfScope = changedPaths.filter(
    (filePath) => !pathAllowed(filePath, control.authorized_paths)
  );
  if (outOfScope.length) {
    fail(
      "Changed paths outside the base-state authorization envelope:\n" +
      outOfScope.map((filePath) => "  - " + filePath).join("\n")
    );
  }

  const added = changes
    .filter((item) => item.status.startsWith("A"))
    .map((item) => item.path);

  const unapprovedNew = added.filter(
    (filePath) => !control.allowed_new_files.includes(filePath)
  );
  if (unapprovedNew.length) {
    fail(
      "New files were created without explicit base-state authorization:\n" +
      unapprovedNew.map((filePath) => "  - " + filePath).join("\n")
    );
  }

  if (control.new_canonical_system_authorized !== true) {
    const suspicious = added.filter((filePath) =>
      /(?:^|\/)(?:canonical|registry|engine|service|store|model|mapper|authority|system)(?:[-_.\/]|$)/i.test(filePath)
    );
    if (suspicious.length) {
      fail(
        "New system-shaped files were added while new_canonical_system_authorized=false:\n" +
        suspicious.map((filePath) => "  - " + filePath).join("\n")
      );
    }
  }

  pass(
    "Implementation is inside the base-state envelope: branch=" +
    headBranch + ", changed=" + changedPaths.length + ", new=" + added.length + "."
  );
}

if (process.argv[2] === "--branch-created") {
  checkCreatedBranch();
} else if (process.argv[2] === "--authority-root-required-main") {
  probeAuthorityRootRequiredMain();
} else {
  main();
}
