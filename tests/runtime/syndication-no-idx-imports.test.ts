/// <reference types="jest" />
/**
 * Source-regex test pin: lib/syndication/** must NOT import from
 * lib/idx/**, lib/search/**, ListingSearchProjection, or app/api/listings.
 *
 * Why: the syndication lane has to remain independent of the public
 * MLS-display lane (IDX). The Syndication Plan v2 (§G.2) requires that
 * a future code change cannot accidentally couple the two surfaces.
 * This test fails if anyone adds such an import.
 *
 * Mirrors the pattern from earlier test pins (PR #112 / #113 for the
 * idx-sync dual-write guards, PR #156 for the V2 stale-alias probe).
 */

import * as fs from "node:fs";
import * as path from "node:path";

const SYNDICATION_ROOT = path.resolve(__dirname, "..", "..", "lib", "syndication");

// Patterns we forbid. Each pattern is paired with a human-readable
// explanation that appears in the assertion failure message so a future
// developer sees exactly which line they violated.
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; explanation: string }> = [
  {
    pattern: /from\s+["']@?\/?lib\/idx\//,
    explanation: "lib/idx/** is the Trestle/REBNY IDX pipeline — syndication must not import it",
  },
  {
    pattern: /from\s+["']@?\/?lib\/search\//,
    explanation: "lib/search/** contains the public listing-search projection — syndication must not import it",
  },
  {
    pattern: /from\s+["']@?\/?app\/api\/listings/,
    explanation: "app/api/listings is the public MLS-display reader — syndication must not import it",
  },
  {
    pattern: /from\s+["']@?\/?app\/api\/idx\//,
    explanation: "app/api/idx/** is the IDX/Trestle API — syndication must not import it",
  },
  {
    pattern: /ListingSearchProjection/,
    explanation: "ListingSearchProjection is the public-display projection table — syndication must not reference it",
  },
  // Defensive: catch a relative-path version too. lib/syndication/X.ts
  // shouldn't be reaching up into ../idx/ or ../search/ either.
  {
    pattern: /from\s+["']\.\.\/idx\//,
    explanation: "Relative ../idx/ import detected — syndication must remain decoupled",
  },
  {
    pattern: /from\s+["']\.\.\/search\//,
    explanation: "Relative ../search/ import detected — syndication must remain decoupled",
  },
];

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("Syndication lane — no IDX/projection imports (structural defense)", () => {
  const files = walk(SYNDICATION_ROOT);

  it("finds at least one syndication file (sanity check on the test itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Strip JS comments from a line so test pins don't trigger on
  // documentation that intentionally MENTIONS forbidden symbols (as
  // this very test file does in its own header).
  //
  // Limitations: this strips only the simplest single-line `//`
  // comments and any leading whitespace before them. It does NOT
  // attempt to parse `/* … */` blocks or string-quoted comment-like
  // text. That tradeoff is acceptable because the forbidden patterns
  // are all import-syntax shaped — they don't legitimately appear
  // inside multi-line comments in production code, and they would be
  // suspicious if they did.
  function stripLineComment(line: string): string {
    // Strip the part after the first `//` UNLESS the `//` is inside
    // a string literal. We use a tiny scan rather than a regex to
    // be safe with quotes.
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      const n = line[i + 1];
      if (c === "\\") {
        i++; // skip escaped char
        continue;
      }
      if (!inDouble && !inBacktick && c === "'") inSingle = !inSingle;
      else if (!inSingle && !inBacktick && c === '"') inDouble = !inDouble;
      else if (!inSingle && !inDouble && c === "`") inBacktick = !inBacktick;
      else if (!inSingle && !inDouble && !inBacktick && c === "/" && n === "/") {
        return line.slice(0, i);
      }
    }
    return line;
  }

  // Generate one test per file × pattern so failures are precise.
  for (const file of files) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const text = fs.readFileSync(file, "utf8");

    for (const { pattern, explanation } of FORBIDDEN_PATTERNS) {
      it(`${relPath} does not match /${pattern.source}/ — ${explanation}`, () => {
        // Match line by line so the failure message can show the
        // offending text precisely. Comments are stripped first so
        // doc-mentions of forbidden symbols don't false-positive.
        const offending: Array<{ line: number; text: string }> = [];
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const codePortion = stripLineComment(lines[i]);
          if (pattern.test(codePortion)) {
            offending.push({ line: i + 1, text: lines[i].trim() });
          }
        }
        if (offending.length > 0) {
          const detail = offending
            .map((o) => `  line ${o.line}: ${o.text}`)
            .join("\n");
          throw new Error(
            `${relPath} matches forbidden pattern /${pattern.source}/ (${explanation}).\nOffending lines:\n${detail}`,
          );
        }
      });
    }
  }
});
