#!/usr/bin/env node
/**
 * Release-safety P2 — transitive import-graph builder.
 *
 * Builds the static import closure of a repo source file using the
 * TypeScript compiler API (real AST — never regex import parsing), so the
 * source guards in tests/runtime/release-safety-source-guards.test.ts can
 * prove that ISR-rendered pages/layouts cannot transitively reach a
 * cache/Redis module (the PR #523 E132 defect class).
 *
 * Coverage: static `import ... from 'x'`, `export ... from 'x'`,
 * static-string `import('x')`, and static-string `require('x')`.
 * Alias resolution is read from tsconfig.json `compilerOptions.paths`
 * (currently `@/*` -> `./*`) — never hardcoded.
 *
 * Limits (reported, not hidden): computed/dynamic specifiers cannot be
 * followed statically; they are returned in `dynamicUnresolved` so the
 * caller can surface them instead of silently claiming full coverage.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** Read `compilerOptions.paths` aliases from tsconfig.json (JSONC-safe). */
function readTsconfigAliases(rootDir) {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (read.error) {
    throw new Error(`Cannot read tsconfig.json at ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`);
  }
  const paths = (read.config.compilerOptions && read.config.compilerOptions.paths) || {};
  // Normalize "@/*": ["./*"] into [{ prefix: "@/", targets: ["./"] }]
  const aliases = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!pattern.endsWith('*')) continue;
    aliases.push({
      prefix: pattern.slice(0, -1),
      targets: targets.map((t) => t.replace(/\*$/, '')),
    });
  }
  return aliases;
}

/** Resolve a specifier candidate path to an existing file, trying extensions and index files. */
function resolveFileCandidate(basePath) {
  const stat = (p) => {
    try {
      return fs.statSync(p);
    } catch {
      return null;
    }
  };
  const s = stat(basePath);
  if (s && s.isFile()) return basePath;
  for (const ext of RESOLVE_EXTENSIONS) {
    const p = basePath + ext;
    const st = stat(p);
    if (st && st.isFile()) return p;
  }
  if (s && s.isDirectory()) {
    for (const ext of RESOLVE_EXTENSIONS) {
      const p = path.join(basePath, 'index' + ext);
      const st = stat(p);
      if (st && st.isFile()) return p;
    }
  }
  return null;
}

/** Extract every static module specifier from a source file's AST. */
function extractSpecifiers(sourceFile) {
  const specifiers = [];
  const dynamic = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          specifiers.push(arg.text);
        } else if (arg) {
          dynamic.push({ kind: isDynamicImport ? 'import()' : 'require()' });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { specifiers, dynamic };
}

function parseSourceFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const kind = absPath.endsWith('.tsx') || absPath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, kind);
}

/** Non-code assets: included in the graph as leaves, never parsed/traversed. */
const ASSET_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.json', '.woff', '.woff2', '.txt', '.md'];
function isAssetFile(p) {
  const lower = p.toLowerCase();
  return ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Build the transitive static import closure of `entryAbs`. FAIL-CLOSED:
 * read/parse errors and unresolved repo imports are RETURNED, not swallowed —
 * callers must treat non-empty `errors`/`unresolved` as guard failures.
 * Returns:
 *   files             Set<string> repo files reached (absolute, normalized)
 *   externals         Set<string> bare module specifiers reached (e.g. '@upstash/redis')
 *   dynamicUnresolved Array<{file, kind}> computed specifiers that could NOT be followed
 *   errors            Array<{file, error}> read failures + parse diagnostics
 *   unresolved        Array<{file, spec, kind:'relative'|'alias'}> repo imports
 *                     that failed to resolve to an existing file
 */
function buildImportGraph(entryAbs, { rootDir, aliases }) {
  const files = new Set();
  const externals = new Set();
  const dynamicUnresolved = [];
  const errors = [];
  const unresolved = [];
  const queue = [path.normalize(entryAbs)];

  while (queue.length > 0) {
    const current = queue.pop();
    if (files.has(current)) continue;
    files.add(current);
    if (isAssetFile(current)) continue; // leaf: no code to traverse

    let parsed;
    try {
      parsed = parseSourceFile(current);
    } catch (err) {
      errors.push({ file: current, error: `read/parse failure: ${err && err.message}` });
      continue;
    }
    // TS's parser is lenient; surface real syntax errors instead of silently
    // analyzing a half-parsed file.
    const diags = parsed.parseDiagnostics || [];
    if (diags.length > 0) {
      const first = diags[0];
      errors.push({
        file: current,
        error: `parse diagnostics (${diags.length}): ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`,
      });
      continue;
    }
    const { specifiers, dynamic } = extractSpecifiers(parsed);
    for (const d of dynamic) dynamicUnresolved.push({ file: current, kind: d.kind });

    for (const spec of specifiers) {
      let candidate = null;
      let kind = null;
      if (spec.startsWith('.')) {
        kind = 'relative';
        candidate = path.resolve(path.dirname(current), spec);
      } else {
        const alias = (aliases || []).find((a) => spec.startsWith(a.prefix));
        if (alias) {
          kind = 'alias';
          const rest = spec.slice(alias.prefix.length);
          for (const target of alias.targets) {
            const probe = path.resolve(rootDir, target, rest);
            if (resolveFileCandidate(probe)) {
              candidate = probe;
              break;
            }
          }
          if (!candidate) candidate = path.resolve(rootDir, alias.targets[0] || '.', rest);
        } else {
          externals.add(spec);
          continue;
        }
      }
      const resolved = resolveFileCandidate(candidate);
      if (resolved) {
        const norm = path.normalize(resolved);
        if (!files.has(norm)) queue.push(norm);
      } else {
        // FAIL-CLOSED: an unresolvable repo import means the graph is
        // incomplete — recorded for the caller to fail on.
        unresolved.push({ file: current, spec, kind });
      }
    }
  }

  return { files, externals, dynamicUnresolved, errors, unresolved };
}

/** Recursively list files under `dir` matching one of `basenames`. */
function findFilesByBasename(dir, basenames) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(p);
      } else if (basenames.includes(e.name)) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

/** True when the file statically declares `export const revalidate = ...` (ISR). */
function declaresRevalidate(absPath) {
  const sf = parseSourceFile(absPath);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isVariableStatement(node) &&
      (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'revalidate'
      )
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** True when the file starts with a `'use client'` directive (client component —
 *  its fetches run in the browser and cannot affect ISR rendering). */
function isClientComponent(absPath) {
  let sf;
  try {
    sf = parseSourceFile(absPath);
  } catch {
    return false;
  }
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteralLike(first.expression) &&
    first.expression.text === 'use client'
  );
}

/**
 * AST analysis of every `cache: 'no-store'` property assignment in a file.
 * NO exemption decisions are made here — this returns FACTS per match:
 *   nonGetMethod    the SAME options object declares a non-GET `method`
 *   insideUseEffect the match is lexically inside a useEffect(...) callback
 * The caller (source-guards test) applies its explicit per-file allowlists.
 * FAIL-CLOSED: a read/parse failure is returned as { error }, never as
 * "no matches".
 */
function analyzeNoStoreProperties(absPath) {
  let sf;
  try {
    sf = parseSourceFile(absPath);
  } catch (err) {
    return { error: `read/parse failure: ${err && err.message}`, matches: [] };
  }
  const matches = [];
  const propName = (p) =>
    ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
      ? p.name.text
      : null;
  const isInsideUseEffect = (node) => {
    let n = node.parent;
    while (n) {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'useEffect'
      ) {
        return true;
      }
      n = n.parent;
    }
    return false;
  };
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      propName(node) === 'cache' &&
      ts.isStringLiteralLike(node.initializer) &&
      node.initializer.text === 'no-store'
    ) {
      let nonGetMethod = false;
      if (node.parent && ts.isObjectLiteralExpression(node.parent)) {
        for (const sibling of node.parent.properties) {
          if (
            ts.isPropertyAssignment(sibling) &&
            propName(sibling) === 'method' &&
            ts.isStringLiteralLike(sibling.initializer) &&
            sibling.initializer.text.toUpperCase() !== 'GET'
          ) {
            nonGetMethod = true;
          }
        }
      }
      matches.push({ nonGetMethod, insideUseEffect: isInsideUseEffect(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { error: null, matches };
}

/**
 * Which forbidden modules does a built graph reach?
 * - forbiddenExternals: bare specifiers (exact or subpath, e.g. '@upstash/redis/x')
 * - forbiddenRepoModules: root-relative module ids WITHOUT extension
 *   (e.g. 'lib/cache/durable-cache' matches lib/cache/durable-cache.ts and
 *   lib/cache/durable-cache/index.ts) — so the guard trips the moment a
 *   forbidden module is (re)introduced under any resolvable shape.
 * Returns a list of human-readable hit descriptions (empty = clean).
 */
function findForbiddenReached(graph, { rootDir, forbiddenExternals = [], forbiddenRepoModules = [] }) {
  const hits = [];
  for (const ext of forbiddenExternals) {
    for (const spec of graph.externals) {
      if (spec === ext || spec.startsWith(ext + '/')) {
        hits.push(`external '${spec}'`);
      }
    }
  }
  const relFiles = [...graph.files].map((f) =>
    path.relative(rootDir, f).replace(/\\/g, '/').replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
  );
  for (const mod of forbiddenRepoModules) {
    for (const rel of relFiles) {
      if (rel === mod || rel === mod + '/index') {
        hits.push(`repo module '${mod}'`);
      }
    }
  }
  return [...new Set(hits)];
}

module.exports = {
  readTsconfigAliases,
  findForbiddenReached,
  buildImportGraph,
  findFilesByBasename,
  declaresRevalidate,
  analyzeNoStoreProperties,
  isClientComponent,
  isAssetFile,
  resolveFileCandidate,
};
