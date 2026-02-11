#!/usr/bin/env node
/**
 * CI Guardrails Script - Phase 3 Parallel-Safe
 *
 * HARD FAILURES (block CI):
 * 1. No legacy directories (frontend/, pages/)
 * 2. No .bak files outside archive/
 * 3. No backup_* directories outside archive/
 * 4. App Router root layout required
 * 5. README.md governance markers
 * 6. [CRITICAL] No app/boroughs/ routes (page.tsx, route.ts)
 * 8. [CRITICAL] No app/resources/_drafts/ routes
 * 8. [CRITICAL] Sitemap must NOT include boroughs
 * 9. [CRITICAL] Navigation must NOT link to boroughs
 * 11. [CRITICAL] No Fair Housing prohibited terms in content
 *
 * Phase 3 work MUST live in src/templates/, src/data/, src/compliance/
 * NOT in app/ directories.
 */

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

// Normalize to forward slashes for consistent matching
const norm = (p) => p.replace(/\\/g, "/");

const exists = (p) => fs.existsSync(path.join(repoRoot, p));

const readFile = (p) => {
  try {
    return fs.readFileSync(path.join(repoRoot, p), "utf8");
  } catch {
    return "";
  }
};

// Directories to skip during recursive walk
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "archive"]);

const walkFiles = (dir) => {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
};

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

console.log("\n[GUARDRAILS] Running Phase 3 parallel-safe checks...\n");

// ===========================================================================
// 1) Forbid legacy app roots at repo root
// ===========================================================================
for (const d of ["frontend", "pages"]) {
  const full = path.join(repoRoot, d);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    fail(`Forbidden directory exists: "${d}/" (must be deleted or moved to archive/).`);
  }
}

// ===========================================================================
// 2) Collect all files (excluding SKIP_DIRS)
// ===========================================================================
const allFiles = walkFiles(repoRoot).map((f) => norm(path.relative(repoRoot, f)));

// ===========================================================================
// 3) Forbid *.bak and *.bak.* files outside archive/
// ===========================================================================
const isBakFile = (f) => {
  const base = f.split("/").pop();
  return /\.bak$/.test(base) || /\.bak\./.test(base);
};

const bakFilesOutsideArchive = allFiles.filter(
  (f) => isBakFile(f) && !f.startsWith("archive/")
);

if (bakFilesOutsideArchive.length) {
  fail(
    `Forbidden .bak file(s) in active path:\n    - ${bakFilesOutsideArchive.join("\n    - ")}`
  );
}

// ===========================================================================
// 4) Forbid backup_* DIRECTORIES outside archive/
// ===========================================================================
for (const f of allFiles) {
  if (f.startsWith("archive/")) continue;
  const segments = f.split("/");
  const dirSegments = segments.slice(0, -1);
  const badDir = dirSegments.find((seg) => seg.startsWith("backup_"));
  if (badDir) {
    fail(
      `Forbidden backup_* directory in active path: "${badDir}" (found in "${f}").`
    );
  }
}

// ===========================================================================
// 5) Require App Router root layout
// ===========================================================================
if (!exists("app/layout.tsx") && !exists("app/layout.jsx")) {
  fail("Missing App Router root layout: app/layout.tsx or app/layout.jsx.");
}

// ===========================================================================
// 6) README.md governance markers
// ===========================================================================
if (!exists("README.md")) {
  fail("README.md missing at repo root.");
} else {
  const readme = readFile("README.md");
  const requiredMarkers = [
    "Immediate Cleanup & MVP Lock",
    "Compliance Requirements",
    "Listings: Types, Visibility, Distribution",
    "Last Work Completed",
  ];
  const missingMarkers = requiredMarkers.filter((m) => !readme.includes(m));
  if (missingMarkers.length) {
    fail(
      `README.md missing required section marker(s):\n    - ${missingMarkers.join("\n    - ")}`
    );
  }
}

// ===========================================================================
// 7-8) CRITICAL: No routable pages in protected routes
// Phase 3 content MUST live in src/templates, src/data, src/compliance
// ===========================================================================
const PROTECTED_ROUTE_PATTERNS = [
  { pattern: /^app\/boroughs\/.*\.(tsx?|jsx?)$/, name: "boroughs" },
  { pattern: /^app\/resources\/_drafts\/.*\.(tsx?|jsx?)$/, name: "resources/_drafts" },
];

const ROUTABLE_FILES = ["page.tsx", "page.jsx", "route.ts", "route.js", "layout.tsx", "layout.jsx"];

for (const { pattern, name } of PROTECTED_ROUTE_PATTERNS) {
  const matchingFiles = allFiles.filter((f) => pattern.test(f));

  // Check for any routable files
  const routableFiles = matchingFiles.filter((f) => {
    const filename = f.split("/").pop();
    return ROUTABLE_FILES.includes(filename);
  });

  if (routableFiles.length > 0) {
    fail(
      `[PHASE 3 VIOLATION] Routable files found in protected path "app/${name}/":\n` +
      `    - ${routableFiles.join("\n    - ")}\n` +
      `    Phase 3 content must live in src/templates/, src/data/, or src/compliance/.\n` +
      `    Remove these files to unblock CI.`
    );
  }
}

// Also check if the directory itself exists (even if empty or with only non-routable files)
const PROTECTED_DIRS = ["app/boroughs", "app/resources/_drafts"];

for (const dir of PROTECTED_DIRS) {
  const fullPath = path.join(repoRoot, dir);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    // Check if it contains any .tsx, .ts, .jsx, .js files
    const dirFiles = allFiles.filter((f) => f.startsWith(norm(dir) + "/"));
    const codeFiles = dirFiles.filter((f) => /\.(tsx?|jsx?)$/.test(f));

    if (codeFiles.length > 0) {
      fail(
        `[PHASE 3 VIOLATION] Protected directory "${dir}/" contains code files:\n` +
        `    - ${codeFiles.join("\n    - ")}\n` +
        `    Phase 3 content must live in src/templates/, src/data/, or src/compliance/.`
      );
    } else {
      // Directory exists but no code - just warn
      warn(
        `Protected directory "${dir}/" exists but contains no code files. Consider removing.`
      );
    }
  }
}

// ===========================================================================
// 9) CRITICAL: Sitemap must NOT include protected routes
// ===========================================================================
const sitemapPath = "app/sitemap.ts";
if (exists(sitemapPath)) {
  const sitemapContent = readFile(sitemapPath);
  const PROTECTED_ROUTES = ["boroughs"];

  for (const route of PROTECTED_ROUTES) {
    // Check for URL pattern like `${BASE_URL}/neighborhoods` or literal '/neighborhoods'
    const urlPattern = new RegExp(`['"\`\\/]${route}['"\`\\/]`, "g");

    // Extract non-comment lines
    const lines = sitemapContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }

      // Check for route reference
      if (urlPattern.test(line)) {
        // Allow if it's clearly an exclusion comment
        if (line.includes("EXCLUDED") || line.includes("NOTE:") || line.includes("not included")) {
          continue;
        }

        fail(
          `[PHASE 3 VIOLATION] Sitemap includes protected route "/${route}" at line ${i + 1}.\n` +
          `    Remove from app/sitemap.ts until Phase 4 approval.\n` +
          `    Line: ${line.trim()}`
        );
        break;
      }
    }
  }
}

// ===========================================================================
// 10) CRITICAL: Navigation must NOT link to protected routes
// ===========================================================================
const NAV_FILES = [
  "app/components/Header.tsx",
  "app/components/Footer.tsx",
  "app/components/Navigation.tsx",
  "app/components/Nav.tsx",
];

const PROTECTED_ROUTES_NAV = ["boroughs"];

for (const navFile of NAV_FILES) {
  if (!exists(navFile)) continue;
  const content = readFile(navFile);
  const lines = content.split("\n");

  for (const route of PROTECTED_ROUTES_NAV) {
    // Look for href="/neighborhoods" or href="/boroughs" patterns
    const hrefPattern = new RegExp(`href=["'\`]/${route}`, "gi");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("{/*")
      ) {
        continue;
      }

      if (hrefPattern.test(line)) {
        fail(
          `[PHASE 3 VIOLATION] Navigation file "${navFile}" contains link to "/${route}" at line ${i + 1}.\n` +
          `    Remove link until Phase 4 approval and feature flag is enabled.\n` +
          `    Line: ${line.trim()}`
        );
        break;
      }
    }
  }
}

// ===========================================================================
// 11) CRITICAL: Scan for prohibited Fair Housing terms
// ===========================================================================
const prohibitedTermsPaths = [
  "src/compliance/prohibited-terms.json",
  "data/compliance/prohibited-terms.json",
];

let prohibitedTerms = [];
let prohibitedTermsSource = null;

for (const p of prohibitedTermsPaths) {
  if (exists(p)) {
    try {
      const data = JSON.parse(readFile(p));
      prohibitedTerms = data.flatList || [];
      prohibitedTermsSource = p;
      break;
    } catch (e) {
      warn(`Could not parse ${p}: ${e.message}`);
    }
  }
}

if (prohibitedTerms.length > 0) {
  console.log(`[INFO] Loaded ${prohibitedTerms.length} prohibited terms from ${prohibitedTermsSource}`);

  // Files to scan for prohibited terms
  const scanPatterns = [
    /^app\/.*\.(tsx?|jsx?|json)$/,
    /^src\/.*\.(tsx?|jsx?|json)$/,
    /^data\/.*\.json$/,
    /^content\/.*\.(md|mdx|json)$/,
  ];

  // Exclusion patterns
  const excludePatterns = [
    /_templates\//,
    /_drafts\//,
    /\.test\./,
    /\.spec\./,
    /prohibited-terms\.json$/,
    /rls-rules\.json$/,
  ];

  const filesToScan = allFiles.filter((f) => {
    // Must match a scan pattern
    if (!scanPatterns.some((p) => p.test(f))) return false;
    // Must not match exclusion pattern
    if (excludePatterns.some((p) => p.test(f))) return false;
    return true;
  });

  for (const file of filesToScan) {
    const content = readFile(file).toLowerCase();

    for (const term of prohibitedTerms) {
      const termLower = term.toLowerCase();

      if (content.includes(termLower)) {
        const lines = readFile(file).split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();

          if (line.includes(termLower)) {
            const originalLine = readFile(file).split("\n")[i];

            // Skip if in a comment
            if (
              originalLine.trim().startsWith("//") ||
              originalLine.trim().startsWith("*") ||
              originalLine.trim().startsWith("<!--") ||
              originalLine.trim().startsWith("{/*")
            ) {
              continue;
            }

            // Skip if referencing prohibited terms metadata
            if (
              line.includes("prohibited") && line.includes("term") ||
              line.includes("flatlist") ||
              line.includes("categories")
            ) {
              continue;
            }

            fail(
              `[FAIR HOUSING VIOLATION] Prohibited term "${term}" found in ${file}:${i + 1}.\n` +
              `    Remove or rephrase to comply with Fair Housing Act.\n` +
              `    Line: ${originalLine.trim().substring(0, 100)}${originalLine.length > 100 ? "..." : ""}`
            );
            break; // Only report first occurrence per file
          }
        }
      }
    }
  }
} else {
  warn("No prohibited-terms.json found. Fair Housing term scanning disabled.");
}

// ===========================================================================
// 12) Private listings noindex hint (warning only)
// ===========================================================================
const privateCandidates = [
  "app/member-listings/page.tsx",
  "app/(protected)/member-listings/page.tsx",
  "app/client-access/page.tsx",
];

const metadataPattern = /noindex|nofollow|robots|metadata|generateMetadata/;

const foundPrivate = privateCandidates.find((p) => exists(p));
if (foundPrivate) {
  const pageContent = readFile(foundPrivate);
  const dir = foundPrivate.substring(0, foundPrivate.lastIndexOf("/"));
  const layoutPath = `${dir}/layout.tsx`;
  const layoutContent = exists(layoutPath) ? readFile(layoutPath) : "";

  if (!metadataPattern.test(pageContent) && !metadataPattern.test(layoutContent)) {
    warn(`"${foundPrivate}" may be missing noindex/nofollow metadata.`);
  }
}

// ===========================================================================
// Output Results
// ===========================================================================
if (warnings.length > 0) {
  console.warn("\n[WARN] Guardrails warnings:");
  for (const w of warnings) {
    console.warn(`  ⚠️  ${w}`);
  }
}

if (errors.length > 0) {
  console.error("\n[FAIL] Guardrails violations:");
  for (const e of errors) {
    console.error(`  ❌ ${e}`);
  }
  console.error(`\n${errors.length} error(s) found. CI BLOCKED.\n`);
  console.error("Phase 3 content must live in src/templates/, src/data/, or src/compliance/.");
  console.error("See docs/PHASE3_PARALLEL_SAFE.md for guidance.\n");
  process.exit(1);
}

console.log("\n[PASS] ✅ Guardrails passed. Phase 3 parallel-safe requirements met.\n");
