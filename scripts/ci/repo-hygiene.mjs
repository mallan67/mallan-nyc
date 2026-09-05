#!/usr/bin/env node
/**
 * Repo Hygiene Gate — enforcement script
 *
 * Runs the discipline rules established by the Repo Hygiene Gate
 * directive (2026-05-06, second-layer companion to the .gitignore
 * patterns committed in 794ac6ce).
 *
 * Per directive, fails on:
 *   1. Unstaged tracked changes              (bypass: ALLOW_DIRTY=1)
 *   2. Untracked non-ignored files           (no bypass — fix .gitignore)
 *   3. Schema changes                        (bypass: ALLOW_SCHEMA_CHANGE=1)
 *   4. PR 4 / media-batch paths touched      (bypass: ALLOW_PR4_TOUCH=1)
 *   5. Telemetry block removed               (bypass: ALLOW_TELEMETRY_REMOVE=1)
 *   6. CRM bundle stale (source dirty,
 *      bundle not regenerated)               (no bypass — run npm run crm:build)
 *   7. CRM bundle changed without any
 *      source change                         (no bypass — fix the change)
 *   8. Forbidden temp/debug/report files
 *      visible to git                        (no bypass — fix .gitignore)
 *
 * Output:
 *   - PASS / FAIL summary
 *   - tracked files changed, staged, untracked, ignored diagnostics
 *   - blocked paths per failed rule
 *   - remediation steps per failed rule
 *
 * Exit code:
 *   - 0 on PASS
 *   - 1 on FAIL
 *
 * Usage:
 *   npm run repo:hygiene                  (must be clean to PASS)
 *   ALLOW_DIRTY=1 npm run repo:hygiene    (allow unstaged work-in-progress)
 *   ALLOW_PR4_TOUCH=1 ...                 (allow master plan PR 4 work when
 *                                          the user has explicitly authorized)
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── Bypass flags (per-rule) ─────────────────────────────────────────
const ALLOW_DIRTY = process.env.ALLOW_DIRTY === "1";
const ALLOW_SCHEMA_CHANGE = process.env.ALLOW_SCHEMA_CHANGE === "1";
const ALLOW_PR4_TOUCH = process.env.ALLOW_PR4_TOUCH === "1";
const ALLOW_TELEMETRY_REMOVE = process.env.ALLOW_TELEMETRY_REMOVE === "1";
const REPO_HYGIENE_BASE = (process.env.REPO_HYGIENE_BASE || "").trim();

if (REPO_HYGIENE_BASE && !/^[A-Za-z0-9._/@-]+$/.test(REPO_HYGIENE_BASE)) {
  process.stderr.write("[repo-hygiene] REPO_HYGIENE_BASE contains unsupported characters\n");
  process.exit(2);
}

// ─── Paths the gate guards ───────────────────────────────────────────
const SCHEMA_PATHS = ["prisma/schema.prisma", "prisma/migrations/"];

// Master plan PR 4 (`refactor/04-media-batch-rewrite`) targets — see
// memory/REFACTOR-2026-04-25.md and memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md.
// Conservative set: anything that, if changed, would either start PR 4 or
// invalidate its prerequisites.
const PR4_PATHS = [
  "lib/idx/sync.ts",
  "app/api/idx/sync/",
  "app/api/idx/sync-historical/",
  "lib/media/",
  "app/api/media/",
  "public/crm/js/render/photo-loader.js",
];

const TELEMETRY_FILE = "app/api/idx/search/route.ts";
const TELEMETRY_KEYWORD = "idx_search_telemetry";

const CRM_BUNDLE = "public/crm/index-built.html";
const CRM_SOURCE_PATTERNS = [
  /^public\/crm\/index\.html$/,
  /^public\/crm\/html\//,
  /^public\/crm\/css\//,
  /^public\/crm\/js\//,
  /^public\/crm\/build\.js$/,
];

// ─── Forbidden patterns (Repo Hygiene Gate rule 4 / 8) ───────────────
// These match operator-side diagnostic / scratch files. Any tracked
// or untracked-non-ignored file matching one of these patterns is a
// violation. The .gitignore covers most of these for new files, but
// this rule catches the case where a forbidden file slipped through
// (e.g., already tracked, or matches a pattern not yet in .gitignore).
const FORBIDDEN_PATTERNS = [
  { name: ".telem-pull*", regex: /^\.telem-pull/ },
  { name: ".vercel-*", regex: /^\.vercel-/ },
  { name: "*.tmp", regex: /\.tmp$/ },
  { name: "*.log (root)", regex: /^[^/]+\.log$/ },
  { name: "debug-*", regex: /^debug-/ },
  { name: "scratch-*", regex: /^scratch-/ },
  { name: "report-*", regex: /^report-/ },
  { name: "out.txt", regex: /^out\.txt$/ },
  { name: "dump-*", regex: /^dump-/ },
];

// ─── Helpers ─────────────────────────────────────────────────────────
function git(args) {
  try {
    // 64MB buffer — `git ls-files --others --ignored` can return many
    // megabytes when node_modules / .next / build outputs are present.
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (err) {
    // Print the underlying git error so the failure isn't opaque
    process.stderr.write(`[repo-hygiene] git ${args} failed: ${err.message}\n`);
    process.exit(2);
  }
}

function lines(s) {
  return s ? s.split("\n").filter(Boolean) : [];
}

function startsWithAny(file, prefixes) {
  return prefixes.some((p) => file === p || file.startsWith(p));
}

function matchesAny(file, patterns) {
  return patterns.some((p) => p.test(file));
}

function fileBaseName(file) {
  const idx = file.lastIndexOf("/");
  return idx === -1 ? file : file.slice(idx + 1);
}

// ─── Failure accumulator ─────────────────────────────────────────────
const failures = [];
function fail(category, message, files, remediation) {
  failures.push({ category, message, files: [...files], remediation });
}

// ─── Snapshots ───────────────────────────────────────────────────────
const unstaged = lines(git("diff --name-only"));
const staged = lines(git("diff --cached --name-only"));
const workingChanged = lines(git("diff HEAD --name-only"));
const baseChanged = REPO_HYGIENE_BASE ? lines(git(`diff --name-only ${REPO_HYGIENE_BASE}...HEAD`)) : [];
const allChanged = [...new Set([...workingChanged, ...baseChanged])].sort();
const untracked = lines(git("ls-files --others --exclude-standard"));
const tracked = lines(git("ls-files"));
const ignored = lines(git("ls-files --others --ignored --exclude-standard"));

// ─── Rule 1: unstaged tracked changes ────────────────────────────────
if (unstaged.length > 0 && !ALLOW_DIRTY) {
  fail(
    "unstaged tracked changes",
    `${unstaged.length} unstaged tracked file(s) — every batch must commit cleanly`,
    unstaged,
    "Stage them (git add <files>) or stash (git stash). To bypass for legitimate WIP: ALLOW_DIRTY=1",
  );
}

// ─── Rule 2: untracked non-ignored files ─────────────────────────────
if (untracked.length > 0) {
  fail(
    "untracked non-ignored files",
    `${untracked.length} untracked file(s) visible to git`,
    untracked,
    "Either commit (git add), delete, or add a pattern to .gitignore. No bypass flag.",
  );
}

// ─── Rule 3: schema changes ──────────────────────────────────────────
const schemaChanged = allChanged.filter((f) => startsWithAny(f, SCHEMA_PATHS));
if (schemaChanged.length > 0 && !ALLOW_SCHEMA_CHANGE) {
  fail(
    "schema change",
    `Prisma schema or migration touched`,
    schemaChanged,
    "Schema changes require explicit approval per CLAUDE.md NEON.md. To bypass: ALLOW_SCHEMA_CHANGE=1",
  );
}

// ─── Rule 4: PR 4 / media-batch paths ────────────────────────────────
const pr4Touched = allChanged.filter((f) => PR4_PATHS.some((p) => f === p || f.startsWith(p)));
if (pr4Touched.length > 0 && !ALLOW_PR4_TOUCH) {
  fail(
    "PR 4 / media-batch paths",
    `Master plan PR 4 (refactor/04-media-batch-rewrite) paths touched without authorization`,
    pr4Touched,
    "PR 4 is gated per memory/REFACTOR-2026-04-25.md and memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md. To bypass: ALLOW_PR4_TOUCH=1",
  );
}

// ─── Rule 5: telemetry block removed ─────────────────────────────────
if (allChanged.includes(TELEMETRY_FILE)) {
  const path = resolve(process.cwd(), TELEMETRY_FILE);
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (!content.includes(TELEMETRY_KEYWORD) && !ALLOW_TELEMETRY_REMOVE) {
    fail(
      "telemetry removed",
      `${TELEMETRY_FILE} no longer contains the "${TELEMETRY_KEYWORD}" emit`,
      [TELEMETRY_FILE],
      `Restore the telemetry block (lines 342-414, see CLAUDE.md). To bypass: ALLOW_TELEMETRY_REMOVE=1`,
    );
  }
}

// ─── Rule 6/7: CRM bundle drift ──────────────────────────────────────
const sourceChanged = allChanged.some((f) => matchesAny(f, CRM_SOURCE_PATTERNS));
const bundleChanged = allChanged.includes(CRM_BUNDLE);
if (sourceChanged && !bundleChanged) {
  fail(
    "CRM bundle stale",
    `CRM source changed but ${CRM_BUNDLE} was not regenerated`,
    [CRM_BUNDLE, ...allChanged.filter((f) => matchesAny(f, CRM_SOURCE_PATTERNS))],
    "Run: npm run crm:build  (no bypass — must be in sync)",
  );
}
if (bundleChanged && !sourceChanged) {
  fail(
    "CRM bundle changed without source",
    `${CRM_BUNDLE} changed but no CRM source file was touched`,
    [CRM_BUNDLE],
    "Either revert the bundle change (git checkout HEAD -- " + CRM_BUNDLE + ") or include the matching source change.",
  );
}

// ─── Rule 8: forbidden temp/debug/report files visible to git ─────────
//
// Scope: UNTRACKED-non-ignored only. Tracked files matching these
// patterns (e.g. public/crm/html/modals/report-preview.html, the
// CRM Reports product code, or rotation-history.log) were committed
// deliberately and are not hygiene violations — they take precedence
// over the pattern. The point of this rule is to catch operator-side
// debug/scratch dumps that slipped past .gitignore. If a forbidden
// file is untracked AND not covered by .gitignore, that's a real
// hygiene violation; it should either be deleted or .gitignore should
// be patched (option C of the gate).
//
// Rule 2 already flags untracked-non-ignored generically; rule 8 adds
// a more specific failure message and pattern attribution so the
// remediation step is unambiguous.
function findForbidden(fileList) {
  const hits = [];
  for (const f of fileList) {
    const base = fileBaseName(f);
    for (const pat of FORBIDDEN_PATTERNS) {
      // Match base name (catches root-level files) OR full path
      // (catches operator-side dumps in subdirs the patterns target).
      if (pat.regex.test(base) || pat.regex.test(f)) {
        hits.push({ file: f, pattern: pat.name });
        break;
      }
    }
  }
  return hits;
}
const forbiddenUntracked = findForbidden(untracked);
if (forbiddenUntracked.length > 0) {
  fail(
    "forbidden diagnostic files (untracked, not ignored)",
    `${forbiddenUntracked.length} untracked file(s) match Repo Hygiene forbidden patterns`,
    forbiddenUntracked.map((h) => `${h.file}  (matches ${h.pattern})`),
    "Add a pattern to .gitignore (preferred — extends the gate) or delete the file. No bypass flag.",
  );
}

// ─── Output ──────────────────────────────────────────────────────────
const passed = failures.length === 0;

console.log("");
console.log("─────────────────────────────────────────────────────────────");
console.log(`[repo-hygiene] ${passed ? "PASS" : "FAIL"}`);
console.log("─────────────────────────────────────────────────────────────");
console.log("");
console.log(`  tracked files changed:   ${allChanged.length}`);
console.log(`  base ref:                ${REPO_HYGIENE_BASE || "(not set)"}`);
console.log(`  working diff files:      ${workingChanged.length}`);
console.log(`  base diff files:         ${baseChanged.length}`);
console.log(`  staged files:            ${staged.length}`);
console.log(`  unstaged tracked files:  ${unstaged.length}`);
console.log(`  untracked files:         ${untracked.length}`);
console.log(`  ignored diagnostics:     ${ignored.length}`);
console.log(`  blocked paths:           ${failures.reduce((acc, f) => acc + f.files.length, 0)}`);
console.log("");

if (allChanged.length > 0) {
  console.log("  Changed files:");
  for (const f of allChanged) console.log(`    ${f}`);
  console.log("");
}

if (passed) {
  console.log("  ✅ Repo is clean for commit/push.");
  console.log("");
  process.exit(0);
}

console.log("  Failures:");
for (const f of failures) {
  console.log("");
  console.log(`  ✘ ${f.category} — ${f.message}`);
  for (const file of f.files) console.log(`      ${file}`);
  console.log(`    Remediation: ${f.remediation}`);
}
console.log("");
console.log(`  ❌ ${failures.length} violation(s). Fix above or use the named ALLOW_* env var to bypass per item.`);
console.log("");
process.exit(1);
