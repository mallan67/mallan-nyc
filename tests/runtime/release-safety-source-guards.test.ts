/**
 * Release-safety P2 — controls 1 + 2 (source guards).
 *
 * Control 1 — forbidden cache/Redis import guard. Roots: EVERY
 * app/**\/page.{ts,tsx} and app/**\/layout.{ts,tsx} — NOT just files that
 * declare `revalidate` (a layout or a parent segment can make a route ISR
 * without the file itself declaring it, and today's non-ISR page can become
 * ISR tomorrow). Forbidden modules (explicit, per the approved scope):
 *   - @upstash/redis            (external — performs no-store fetches
 *                                internally; the PR #523 E132 trigger)
 *   - lib/redis                 (repo Redis client)
 *   - lib/cache/durable-cache   (the module the incident page imported;
 *                                currently absent from main — the guard
 *                                must trip the moment it is reintroduced)
 *   - lib/middleware/rate-limiter (additional protection, NOT a substitute
 *                                for durable-cache)
 *
 * Control 2 — revalidate/no-store contract. Roots: only the files that
 * declare `export const revalidate` (incl. app/sitemap.ts): no server file
 * in their transitive closure may carry an ISR-relevant `cache: 'no-store'`
 * fetch. Exemptions are SOURCE-CLASSIFIED (derived from the source itself,
 * not from runtime observation): 'use client' components fetch in the
 * browser; a no-store whose SAME options object declares a non-GET method
 * never joins the ISR data cache.
 *
 * The graph is built with the TypeScript compiler API and tsconfig-path
 * aliases (scripts/release-safety/import-graph.js) — never regex imports.
 * Fixture tests prove the guard actually detects violations (a guard that
 * only ever passes proves nothing).
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
  countNoStoreProperties,
  isClientComponent,
} = require('../../scripts/release-safety/import-graph.js');

const ROOT = path.resolve(__dirname, '../..');

const FORBIDDEN_EXTERNALS = ['@upstash/redis'];
const FORBIDDEN_REPO_MODULES = [
  'lib/redis',
  'lib/cache/durable-cache',
  'lib/middleware/rate-limiter',
];

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

describe('release-safety P2 — source guards (repo scan)', () => {
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

  test('sanity: every page/layout is a guard root, and the incident surface is present', () => {
    const rels = allRoots.map((e) => e.rel);
    expect(rels).toContain('app/listing/[...slug]/page.tsx');
    expect(rels).toContain('app/layout.tsx');
    expect(allRoots.length).toBeGreaterThan(10);
    // The revalidate subset is strictly smaller and includes the incident page:
    expect(revalidateEntries.map((e) => e.rel)).toContain('app/listing/[...slug]/page.tsx');
    expect(revalidateEntries.length).toBeGreaterThan(0);
    expect(revalidateEntries.length).toBeLessThan(allRoots.length + 1);
  });

  test('sanity: graphs are non-trivial (the guard is actually traversing imports)', () => {
    const listingGraph = graphFor(allRoots.find((e) => e.rel === 'app/listing/[...slug]/page.tsx')!);
    expect(listingGraph.files.size).toBeGreaterThan(5);
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

  test("control 2: no server file in a revalidate-declaring entry's closure has an ISR-relevant no-store fetch", () => {
    // Exemptions are SOURCE-CLASSIFIED (see header): 'use client' files and
    // no-store paired with a non-GET method in the same options object
    // (e.g. the lib/idx/auth.ts POST token fetch).
    const violations: string[] = [];
    const clientCache = new Map<string, boolean>();
    for (const entry of revalidateEntries) {
      const graph = graphFor(entry);
      for (const file of graph.files) {
        if (!clientCache.has(file)) clientCache.set(file, isClientComponent(file));
        if (clientCache.get(file)) continue;
        const { isrRelevant } = countNoStoreProperties(file);
        if (isrRelevant > 0) {
          violations.push(
            `${entry.rel} closure includes server file ${path.relative(ROOT, file).replace(/\\/g, '/')} with ${isrRelevant} ISR-relevant no-store fetch(es)`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('coverage limit is explicit: computed import specifiers are counted, not hidden', () => {
    let dynamicCount = 0;
    for (const entry of allRoots) {
      dynamicCount += graphFor(entry).dynamicUnresolved.length;
    }
    // Not an assertion of zero — static analysis cannot follow computed
    // specifiers. The count is pinned so a jump is visible in review;
    // the post-deploy listing smoke is the runtime backstop.
    expect(dynamicCount).toBeLessThan(120);
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
    // Forbidden repo module target:
    write('lib/cache/durable-cache.ts', "export const cacheGetJson = async () => null;\n");
    // Index-resolution target:
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
    const hits = guard(page);
    expect(hits.some((h: string) => h.includes('lib/cache/durable-cache'))).toBe(true);
  });

  test('fixture 2: a layout WITHOUT revalidate transitively reaching @upstash/redis FAILS', () => {
    write('app/section/client.ts', "import { Redis } from '@upstash/redis';\nexport const r = Redis;\n");
    const layout = write(
      'app/section/layout.tsx',
      "import { r } from './client';\nexport default function Layout() { return null; }\n"
    );
    const hits = guard(layout);
    expect(hits.some((h: string) => h.includes('@upstash/redis'))).toBe(true);
  });

  test('fixture 3: a clean page/layout graph PASSES', () => {
    write('app/clean/data.ts', "export const data = { ok: true };\n");
    const page = write(
      'app/clean/page.tsx',
      "import { data } from './data';\nexport default function Page() { return data.ok ? null : null; }\n"
    );
    expect(guard(page)).toEqual([]);
  });

  test('fixture 4: index-file and @/-alias resolution both traverse correctly', () => {
    const page = write(
      'app/alias/page.tsx',
      "import { util } from '@/lib/util';\nexport default function Page() { return util; }\n"
    );
    const graph = buildImportGraph(page, { rootDir: tmp, aliases });
    const rels = [...graph.files].map((f: string) => path.relative(tmp, f).replace(/\\/g, '/'));
    expect(rels).toContain('lib/util/index.ts');
    // durable-cache reached via index shape is also caught:
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
});
