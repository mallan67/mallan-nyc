/**
 * Release-safety P2 — controls 1 + 2 (source guards), FAIL-CLOSED.
 *
 * Control 1 — forbidden cache/Redis import guard. Roots: EVERY
 * app/**\/page.{ts,tsx} and app/**\/layout.{ts,tsx}. Forbidden modules:
 * @upstash/redis, lib/redis, lib/cache/durable-cache (the incident module —
 * currently absent from main; the guard trips the moment it is
 * reintroduced), plus lib/middleware/rate-limiter as additional protection.
 *
 * Control 2 — revalidate/no-store contract. Roots: files declaring
 * `export const revalidate` (incl. app/sitemap.ts). NO blanket exemptions:
 * the ONLY allowlisted no-store fetches are
 *   - app/components/IDXDisclaimer.tsx, AST-proven inside a useEffect
 *     callback (browser-side effect fetch);
 *   - lib/idx/auth.ts, AST-proven non-GET (the OAuth client-credentials
 *     token POST).
 * Both allowlists are SOURCE-CLASSIFIED (facts derived from the AST) —
 * never "production-proven". Any other no-store fetch in an ISR closure
 * fails, including other 'use client' files and other non-GET requests.
 *
 * Fail-closed graph rules (asserted here):
 *   - read/parse errors fail the guard;
 *   - unresolved relative imports fail the guard;
 *   - unresolved tsconfig-alias imports fail the guard;
 *   - computed import()/require() callsites must match the EXACT reviewed
 *     baseline below (currently EMPTY — main has zero computed imports in
 *     any page/layout closure; adding one requires review here).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  readTsconfigAliases,
  buildImportGraph,
  findForbiddenReached,
  findFilesByBasename,
  declaresRevalidate,
  analyzeNoStoreProperties,
} = require('../../scripts/release-safety/import-graph.js');

const ROOT = path.resolve(__dirname, '../..');

const FORBIDDEN_EXTERNALS = ['@upstash/redis'];
const FORBIDDEN_REPO_MODULES = [
  'lib/redis',
  'lib/cache/durable-cache',
  'lib/middleware/rate-limiter',
];

/** EXACT reviewed baseline of files allowed to contain computed
 *  import()/require() specifiers inside page/layout closures.
 *  Verified EMPTY on main @ 94eef36b (2026-07-19 probe). */
const COMPUTED_IMPORT_ALLOWLIST: Record<string, number> = {};

/** SOURCE-CLASSIFIED no-store allowlist: repo-relative file -> predicate
 *  the AST facts of EVERY match in that file must satisfy. */
const NO_STORE_ALLOWLIST: Record<string, (m: { nonGetMethod: boolean; insideUseEffect: boolean }) => boolean> = {
  // Client watermark fetch — allowed ONLY while it stays inside useEffect:
  'app/components/IDXDisclaimer.tsx': (m) => m.insideUseEffect === true,
  // OAuth token request — allowed ONLY while it stays non-GET:
  'lib/idx/auth.ts': (m) => m.nonGetMethod === true,
};

interface Entry {
  rel: string;
  abs: string;
}

function collectPageLayoutRoots(): Entry[] {
  return findFilesByBasename(path.join(ROOT, 'app'), [
    'page.tsx',
    'page.ts',
    'layout.tsx',
    'layout.ts',
  ]).map((abs: string) => ({ abs, rel: path.relative(ROOT, abs).replace(/\\/g, '/') }));
}

function collectRevalidateEntries(roots: Entry[]): Entry[] {
  const candidates = [...roots];
  const sitemap = path.join(ROOT, 'app', 'sitemap.ts');
  if (fs.existsSync(sitemap)) {
    candidates.push({ abs: sitemap, rel: 'app/sitemap.ts' });
  }
  return candidates.filter((e) => {
    try {
      return declaresRevalidate(e.abs);
    } catch {
      return false;
    }
  });
}

describe('release-safety P2 — source guards (repo scan, fail-closed)', () => {
  const aliases = readTsconfigAliases(ROOT);
  const allRoots = collectPageLayoutRoots();
  const revalidateEntries = collectRevalidateEntries(allRoots);
  const graphs = new Map<string, ReturnType<typeof buildImportGraph>>();
  const graphFor = (e: Entry) => {
    if (!graphs.has(e.rel)) {
      graphs.set(e.rel, buildImportGraph(e.abs, { rootDir: ROOT, aliases }));
    }
    return graphs.get(e.rel)!;
  };
  const relOf = (abs: string) => path.relative(ROOT, abs).replace(/\\/g, '/');

  test('sanity: every page/layout is a guard root, and the incident surface is present', () => {
    const rels = allRoots.map((e) => e.rel);
    expect(rels).toContain('app/listing/[...slug]/page.tsx');
    expect(rels).toContain('app/layout.tsx');
    expect(allRoots.length).toBeGreaterThan(10);
    expect(revalidateEntries.map((e) => e.rel)).toContain('app/listing/[...slug]/page.tsx');
    expect(revalidateEntries.length).toBeGreaterThan(0);
  });

  test('fail-closed: zero read/parse errors across every page/layout closure', () => {
    const all: string[] = [];
    for (const entry of allRoots) {
      for (const e of graphFor(entry).errors) all.push(`${entry.rel}: ${relOf(e.file)} — ${e.error}`);
    }
    expect(all).toEqual([]);
  });

  test('fail-closed: zero unresolved relative or alias imports across every closure', () => {
    const all: string[] = [];
    for (const entry of allRoots) {
      for (const u of graphFor(entry).unresolved) {
        all.push(`${entry.rel}: ${relOf(u.file)} -> '${u.spec}' (${u.kind})`);
      }
    }
    expect(all).toEqual([]);
  });

  test('fail-closed: computed imports match the EXACT reviewed baseline (currently empty)', () => {
    const counts = new Map<string, number>();
    for (const entry of allRoots) {
      for (const d of graphFor(entry).dynamicUnresolved) {
        const rel = relOf(d.file);
        counts.set(rel, (counts.get(rel) || 0) + 1);
      }
    }
    const observed = Object.fromEntries([...counts.entries()].sort());
    expect(observed).toEqual(COMPUTED_IMPORT_ALLOWLIST);
  });

  test('control 1: NO page or layout transitively imports a forbidden cache/Redis module', () => {
    const violations: string[] = [];
    for (const entry of allRoots) {
      const hits = findForbiddenReached(graphFor(entry), {
        rootDir: ROOT,
        forbiddenExternals: FORBIDDEN_EXTERNALS,
        forbiddenRepoModules: FORBIDDEN_REPO_MODULES,
      });
      for (const hit of hits) violations.push(`${entry.rel} -> ${hit}`);
    }
    expect(violations).toEqual([]);
  });

  test('control 2: every no-store fetch in a revalidate closure is on the exact source-classified allowlist', () => {
    const violations: string[] = [];
    const analyzed = new Map<string, ReturnType<typeof analyzeNoStoreProperties>>();
    for (const entry of revalidateEntries) {
      const graph = graphFor(entry);
      for (const file of graph.files) {
        const rel = relOf(file);
        if (rel.endsWith('.css') || rel.endsWith('.json')) continue;
        if (!analyzed.has(rel)) analyzed.set(rel, analyzeNoStoreProperties(file));
        const result = analyzed.get(rel)!;
        if (result.error) {
          violations.push(`${entry.rel}: ${rel} — analysis error: ${result.error}`);
          continue;
        }
        const predicate = NO_STORE_ALLOWLIST[rel];
        for (const m of result.matches) {
          if (!predicate || !predicate(m)) {
            violations.push(
              `${entry.rel}: ${rel} — no-store fetch not on the allowlist (nonGetMethod=${m.nonGetMethod}, insideUseEffect=${m.insideUseEffect})`
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('the allowlisted files still satisfy their AST predicates directly', () => {
    const idx = analyzeNoStoreProperties(path.join(ROOT, 'app/components/IDXDisclaimer.tsx'));
    expect(idx.error).toBeNull();
    expect(idx.matches.length).toBe(1);
    expect(idx.matches[0].insideUseEffect).toBe(true);
    const auth = analyzeNoStoreProperties(path.join(ROOT, 'lib/idx/auth.ts'));
    expect(auth.error).toBeNull();
    expect(auth.matches.length).toBe(1);
    expect(auth.matches[0].nonGetMethod).toBe(true);
  });
});

describe('release-safety P2 — source-guard fixtures (the guard detects real violations)', () => {
  let tmp: string;
  const aliases = [{ prefix: '@/', targets: ['./'] }];

  const write = (rel: string, content: string) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return abs;
  };

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-guard-fixtures-'));
    write('lib/cache/durable-cache.ts', "export const cacheGetJson = async () => null;\n");
    write('lib/util/index.ts', "export const util = 1;\n");
  });

  const guard = (entryAbs: string) =>
    findForbiddenReached(buildImportGraph(entryAbs, { rootDir: tmp, aliases }), {
      rootDir: tmp,
      forbiddenExternals: FORBIDDEN_EXTERNALS,
      forbiddenRepoModules: FORBIDDEN_REPO_MODULES,
    });

  test('fixture 1: an ordinary page WITHOUT revalidate transitively reaching durable-cache FAILS', () => {
    write('app/plain/helpers.ts', "import { cacheGetJson } from '@/lib/cache/durable-cache';\nexport const helper = cacheGetJson;\n");
    const page = write(
      'app/plain/page.tsx',
      "import { helper } from './helpers';\nexport default function Page() { return null; }\n"
    );
    expect(guard(page).some((h: string) => h.includes('lib/cache/durable-cache'))).toBe(true);
  });

  test('fixture 2: a layout WITHOUT revalidate transitively reaching @upstash/redis FAILS', () => {
    write('app/section/client.ts', "import { Redis } from '@upstash/redis';\nexport const r = Redis;\n");
    const layout = write(
      'app/section/layout.tsx',
      "import { r } from './client';\nexport default function Layout() { return null; }\n"
    );
    expect(guard(layout).some((h: string) => h.includes('@upstash/redis'))).toBe(true);
  });

  test('fixture 3: a clean page/layout graph PASSES with zero errors/unresolved', () => {
    write('app/clean/data.ts', "export const data = { ok: true };\n");
    const page = write(
      'app/clean/page.tsx',
      "import { data } from './data';\nexport default function Page() { return data.ok ? null : null; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    expect(guard(page)).toEqual([]);
    expect(graph.errors).toEqual([]);
    expect(graph.unresolved).toEqual([]);
  });

  test('fixture 4: index-file and @/-alias resolution both traverse correctly', () => {
    const page = write(
      'app/alias/page.tsx',
      "import { util } from '@/lib/util';\nexport default function Page() { return util; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    const rels = [...graph.files].map((f: string) => path.relative(tmp, f).replace(/\\/g, '/'));
    expect(rels).toContain('lib/util/index.ts');
    write('lib/cache2/durable-cache/index.ts', "export const x = 1;\n");
    const page2 = write(
      'app/alias2/page.tsx',
      "import { x } from '@/lib/cache2/durable-cache';\nexport default function Page() { return x; }\n"
    );
    const hits = findForbiddenReached(buildImportGraph(page2, { rootDir: tmp, aliases }), {
      rootDir: tmp,
      forbiddenExternals: [],
      forbiddenRepoModules: ['lib/cache2/durable-cache'],
    });
    expect(hits).toEqual(["repo module 'lib/cache2/durable-cache'"]);
  });

  test('fixture 5 (fail-closed): a parse failure is RETURNED as an error, never swallowed', () => {
    write('app/broken/garbage.ts', "import { from\nexport const = ;;;\n");
    const page = write(
      'app/broken/page.tsx',
      "import './garbage';\nexport default function Page() { return null; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    expect(graph.errors.length).toBeGreaterThan(0);
    expect(graph.errors[0].error).toContain('parse diagnostics');
  });

  test('fixture 6 (fail-closed): an unresolved RELATIVE import is recorded', () => {
    const page = write(
      'app/missing-rel/page.tsx',
      "import { x } from './does-not-exist';\nexport default function Page() { return null; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    expect(graph.unresolved).toEqual([
      expect.objectContaining({ spec: './does-not-exist', kind: 'relative' }),
    ]);
  });

  test('fixture 7 (fail-closed): an unresolved ALIAS import is recorded', () => {
    const page = write(
      'app/missing-alias/page.tsx',
      "import { x } from '@/lib/no-such-module';\nexport default function Page() { return null; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    expect(graph.unresolved).toEqual([
      expect.objectContaining({ spec: '@/lib/no-such-module', kind: 'alias' }),
    ]);
  });

  test('fixture 8 (fail-closed): an unauthorized computed import violates the empty baseline', () => {
    const page = write(
      'app/computed/page.tsx',
      "const mod = 'x' + 'y';\nconst p = import(mod);\nexport default function Page() { return null; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    expect(graph.dynamicUnresolved.length).toBe(1);
    // The repo-scan test compares observed counts to COMPUTED_IMPORT_ALLOWLIST
    // (empty) — a callsite like this one in the real tree would fail there.
    expect(Object.keys(COMPUTED_IMPORT_ALLOWLIST)).toHaveLength(0);
  });
});
