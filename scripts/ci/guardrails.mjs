#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

// Normalize to forward slashes for consistent matching
const norm = (p) => p.replace(/\\/g, "/");

const exists = (p) => fs.existsSync(path.join(repoRoot, p));

// Directories to skip during recursive walk
const SKIP_DIRS = new Set(["node_modules", ".git", ".next"]);

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

const fail = (msg) => {
  console.error(`\n[FAIL] Guardrails:\n  ${msg}\n`);
  process.exit(1);
};

const warn = (msg) => console.warn(`\n[WARN] Guardrails:\n  ${msg}\n`);

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
  // Matches: foo.bak, foo.bak.123, foo.bak.anything
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
// 4) Forbid backup_* DIRECTORIES outside archive/ (not files)
// ===========================================================================
for (const f of allFiles) {
  if (f.startsWith("archive/")) continue;
  const segments = f.split("/");
  // Check directory segments only (all except the last one, which is the filename)
  const dirSegments = segments.slice(0, -1);
  const badDir = dirSegments.find((seg) => seg.startsWith("backup_"));
  if (badDir) {
    fail(
      `Forbidden backup_* directory in active path: "${badDir}" (found in "${f}"). ` +
        `Move to archive/ or delete.`
    );
  }
}

// ===========================================================================
// 5) Require App Router root layout
// ===========================================================================
if (!exists("app/layout.tsx") && !exists("app/layout.jsx")) {
  fail("Missing App Router root layout: app/layout.tsx or app/layout.jsx (required).");
}

// ===========================================================================
// 6) README.md must exist and contain required governance markers
// ===========================================================================
if (!exists("README.md")) {
  fail("README.md missing at repo root.");
}

const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");

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

// ===========================================================================
// 7) Private listings noindex hint (warning only)
// ===========================================================================
const privateCandidates = [
  "app/member-listings/page.tsx",
  "app/(protected)/member-listings/page.tsx",
  "app/client-access/page.tsx",
];

const metadataPattern = /noindex|nofollow|robots|metadata|generateMetadata/;

const foundPrivate = privateCandidates.find((p) => exists(p));
if (foundPrivate) {
  const pageContent = fs.readFileSync(path.join(repoRoot, foundPrivate), "utf8");
  // Also check sibling layout.tsx for metadata (App Router pattern)
  const dir = foundPrivate.substring(0, foundPrivate.lastIndexOf("/"));
  const layoutPath = `${dir}/layout.tsx`;
  const layoutContent = exists(layoutPath)
    ? fs.readFileSync(path.join(repoRoot, layoutPath), "utf8")
    : "";

  if (!metadataPattern.test(pageContent) && !metadataPattern.test(layoutContent)) {
    warn(`"${foundPrivate}" may be missing noindex/nofollow metadata.`);
  }
}

console.log("\n[PASS] Guardrails passed.\n");
