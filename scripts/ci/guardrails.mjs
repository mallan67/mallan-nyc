#!/usr/bin/env node
/**
 * CI Guardrails Script - Phase 3 Extended
 *
 * Enforces:
 * 1. No legacy directories (frontend/, pages/)
 * 2. No .bak files outside archive/
 * 3. No backup_* directories outside archive/
 * 4. App Router root layout required
 * 5. README.md governance markers
 * 6. Private pages noindex check
 * 7. [NEW] Protected routes (neighborhoods, boroughs) have noindex + feature flag
 * 8. [NEW] Sitemap does not include protected routes
 * 9. [NEW] Navigation does not link to protected routes
 * 10. [NEW] No Fair Housing prohibited terms in content
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
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel"]);

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
// 7) Protected routes must have noindex layout
// ===========================================================================
const PROTECTED_ROUTES = ["neighborhoods", "boroughs"];

for (const route of PROTECTED_ROUTES) {
  const layoutPath = `app/${route}/layout.tsx`;
  if (exists(layoutPath)) {
    const content = readFile(layoutPath);
    // Check for noindex in metadata
    if (!content.includes("index: false") && !content.includes("index:false")) {
      fail(
        `Protected route "${route}" layout missing noindex metadata. ` +
          `Add robots: { index: false, follow: false } to ${layoutPath}`
      );
    }
    // Check for feature flag gating
    const featureFlagPattern = new RegExp(
      `NEXT_PUBLIC_FEATURE_${route.toUpperCase()}`,
      "i"
    );
    if (!featureFlagPattern.test(content)) {
      fail(
        `Protected route "${route}" layout missing feature flag gating. ` +
          `Add notFound() check for NEXT_PUBLIC_FEATURE_${route.toUpperCase()} !== 'true'`
      );
    }
  } else if (exists(`app/${route}/page.tsx`) || exists(`app/${route}`)) {
    // Route exists but no layout - check individual pages
    const pagePath = `app/${route}/page.tsx`;
    if (exists(pagePath)) {
      const content = readFile(pagePath);
      if (
        !content.includes("index: false") &&
        !content.includes("noindex")
      ) {
        fail(
          `Protected route "${route}" exists without noindex layout. ` +
            `Create ${layoutPath} with robots: { index: false, follow: false }`
        );
      }
    }
  }
}

// ===========================================================================
// 8) Sitemap must NOT include protected routes
// ===========================================================================
const sitemapPath = "app/sitemap.ts";
if (exists(sitemapPath)) {
  const sitemapContent = readFile(sitemapPath);
  for (const route of PROTECTED_ROUTES) {
    // Check for URL pattern like `${BASE_URL}/neighborhoods` not in a comment
    const urlPattern = new RegExp(`\\$\\{BASE_URL\\}\\/${route}[^/]`, "g");
    const literalPattern = new RegExp(`['"\`].*/${route}['"\`]`, "g");

    // Extract non-comment lines
    const nonCommentLines = sitemapContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

    if (urlPattern.test(nonCommentLines) || literalPattern.test(nonCommentLines)) {
      // Double check it's not in a comment
      const match = sitemapContent.match(new RegExp(`.*/${route}.*`, "g"));
      const activeMatch = match?.find(
        (m) => !m.trim().startsWith("//") && !m.trim().startsWith("*")
      );
      if (activeMatch && !activeMatch.includes("EXCLUDED") && !activeMatch.includes("NOTE:")) {
        fail(
          `Sitemap includes protected route "/${route}". ` +
            `Remove from app/sitemap.ts until Phase 4 approval.`
        );
      }
    }
  }
}

// ===========================================================================
// 9) Navigation must NOT link to protected routes (when not in comments)
// ===========================================================================
const NAV_FILES = [
  "app/components/Header.tsx",
  "app/components/Footer.tsx",
  "app/components/Navigation.tsx",
  "app/components/Nav.tsx",
];

for (const navFile of NAV_FILES) {
  if (!exists(navFile)) continue;
  const content = readFile(navFile);

  for (const route of PROTECTED_ROUTES) {
    // Look for href="/neighborhoods" or href="/boroughs" patterns
    const hrefPattern = new RegExp(`href=["'\`]/${route}["'\`]`, "gi");
    const linkPattern = new RegExp(`['"\`]/${route}['"\`]`, "gi");

    // Check non-comment lines
    const nonCommentLines = content
      .split("\n")
      .filter(
        (line) =>
          !line.trim().startsWith("//") &&
          !line.trim().startsWith("*") &&
          !line.trim().startsWith("{/*")
      )
      .join("\n");

    if (hrefPattern.test(nonCommentLines) || linkPattern.test(nonCommentLines)) {
      fail(
        `Navigation file "${navFile}" contains link to protected route "/${route}". ` +
          `Remove link until Phase 4 approval and feature flag is enabled.`
      );
    }
  }
}

// ===========================================================================
// 10) Scan for prohibited Fair Housing terms
// ===========================================================================
const prohibitedTermsPath = "data/compliance/prohibited-terms.json";
let prohibitedTerms = [];

if (exists(prohibitedTermsPath)) {
  try {
    const data = JSON.parse(readFile(prohibitedTermsPath));
    prohibitedTerms = data.flatList || [];
  } catch (e) {
    warn(`Could not parse ${prohibitedTermsPath}: ${e.message}`);
  }
}

if (prohibitedTerms.length > 0) {
  // Files to scan for prohibited terms
  const scanPatterns = [
    /^app\/.*\.(tsx?|jsx?|json)$/,
    /^data\/.*\.json$/,
    /^content\/.*\.(md|mdx|json)$/,
  ];

  const filesToScan = allFiles.filter((f) => {
    // Skip _templates directories (work in progress)
    if (f.includes("/_templates/")) return false;
    // Skip _drafts directories
    if (f.includes("/_drafts/")) return false;
    // Skip test files
    if (f.includes(".test.") || f.includes(".spec.")) return false;
    // Skip the prohibited-terms.json itself
    if (f === norm(prohibitedTermsPath)) return false;
    // Match scan patterns
    return scanPatterns.some((p) => p.test(f));
  });

  for (const file of filesToScan) {
    const content = readFile(file).toLowerCase();
    for (const term of prohibitedTerms) {
      const termLower = term.toLowerCase();
      if (content.includes(termLower)) {
        // Check if it's in a code comment or string that's clearly metadata
        const lines = readFile(file).split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          if (line.includes(termLower)) {
            // Skip if clearly a comment explaining the term
            if (
              line.trim().startsWith("//") ||
              line.trim().startsWith("*") ||
              line.trim().startsWith("<!--")
            ) {
              continue;
            }
            // Skip if in prohibited-terms reference
            if (line.includes("prohibited") && line.includes("term")) {
              continue;
            }
            fail(
              `Prohibited Fair Housing term "${term}" found in ${file}:${i + 1}. ` +
                `Remove or rephrase to comply with Fair Housing Act.`
            );
            break; // Only report first occurrence per file
          }
        }
      }
    }
  }
}

// ===========================================================================
// 11) Private listings noindex hint (warning only)
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
  console.error(`\n${errors.length} error(s) found. CI blocked.\n`);
  process.exit(1);
}

console.log("\n[PASS] ✅ Guardrails passed.\n");
