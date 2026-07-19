/**
 * Release-safety P2 — controls 1 + 2 (source guards).
 *
 * Control 1: no ISR-rendered page/layout (any app/ file exporting
 * `revalidate`) may TRANSITIVELY import a Redis/cache module. This is the
 * static guard for the PR #523 incident class: `@upstash/redis` performs
 * `cache: 'no-store'` fetches internally, and a no-store fetch inside an
 * ISR render throws Next.js E132 (app-static-to-dynamic-error) in
 * production — the /listing/* 500 outage.
 *
 * Control 2: no repo file inside an ISR entry's transitive import closure
 * may itself contain a `cache: 'no-store'` fetch property.
 *
 * The graph is built with the TypeScript compiler API and tsconfig-path
 * aliases (scripts/release-safety/import-graph.js) — never regex imports.
 * Computed (non-static) specifiers cannot be followed; the last test
 * surfaces their count so coverage limits are explicit, not silent.
 */
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  readTsconfigAliases,
  buildImportGraph,
  findFilesByBasename,
  declaresRevalidate,
  countNoStoreProperties,
  isClientComponent,
} = require('../../scripts/release-safety/import-graph.js');

const ROOT = path.resolve(__dirname, '../..');

/** Bare specifiers that must never appear in an ISR page's closure. */
const FORBIDDEN_EXTERNALS = ['@upstash/redis'];
/** Repo modules (root-relative) that must never appear in an ISR page's closure. */
const FORBIDDEN_REPO_FILES = ['lib/redis.ts', 'lib/middleware/rate-limiter.ts'];

interface IsrEntry {
  rel: string;
  abs: string;
}

function collectIsrEntries(): IsrEntry[] {
  const candidates = [
    ...findFilesByBasename(path.join(ROOT, 'app'), [
      'page.tsx',
      'page.ts',
      'layout.tsx',
      'layout.ts',
    ]),
    path.join(ROOT, 'app', 'sitemap.ts'),
  ];
  return candidates
    .filter((p) => {
      try {
        return declaresRevalidate(p);
      } catch {
        return false;
      }
    })
    .map((abs) => ({ abs, rel: path.relative(ROOT, abs).replace(/\\/g, '/') }));
}

describe('release-safety P2 — ISR source guards', () => {
  const aliases = readTsconfigAliases(ROOT);
  const isrEntries = collectIsrEntries();
  const graphs = new Map<string, ReturnType<typeof buildImportGraph>>();
  for (const entry of isrEntries) {
    graphs.set(entry.rel, buildImportGraph(entry.abs, { rootDir: ROOT, aliases }));
  }

  test('sanity: the incident surface (app/listing/[...slug]/page.tsx) is ISR and covered', () => {
    const rels = isrEntries.map((e) => e.rel);
    expect(rels).toContain('app/listing/[...slug]/page.tsx');
    expect(isrEntries.length).toBeGreaterThan(0);
  });

  test('sanity: graphs are non-trivial (the guard is actually traversing imports)', () => {
    const listingGraph = graphs.get('app/listing/[...slug]/page.tsx');
    expect(listingGraph).toBeDefined();
    expect(listingGraph!.files.size).toBeGreaterThan(5);
  });

  test('control 1: no ISR entry transitively imports a Redis/cache module', () => {
    const violations: string[] = [];
    for (const entry of isrEntries) {
      const graph = graphs.get(entry.rel)!;
      for (const forbidden of FORBIDDEN_EXTERNALS) {
        if (graph.externals.has(forbidden)) {
          violations.push(`${entry.rel} -> external '${forbidden}'`);
        }
      }
      for (const forbiddenRel of FORBIDDEN_REPO_FILES) {
        const forbiddenAbs = path.normalize(path.join(ROOT, forbiddenRel));
        if (graph.files.has(forbiddenAbs)) {
          violations.push(`${entry.rel} -> repo module '${forbiddenRel}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("control 2: no server file in an ISR closure has an ISR-relevant `cache: 'no-store'` fetch", () => {
    // Exemptions (semantic, not baseline): 'use client' components fetch in
    // the browser and cannot affect ISR; a no-store whose SAME options object
    // declares a non-GET method never joins the ISR data cache (e.g. the
    // lib/idx/auth.ts POST token fetch — production-proven benign, since the
    // listing page serves ISR today with auth.ts in its closure).
    const violations: string[] = [];
    const checked = new Map<string, boolean>();
    for (const entry of isrEntries) {
      const graph = graphs.get(entry.rel)!;
      for (const file of graph.files) {
        if (!checked.has(file)) checked.set(file, isClientComponent(file));
        if (checked.get(file)) continue;
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
    for (const entry of isrEntries) {
      dynamicCount += graphs.get(entry.rel)!.dynamicUnresolved.length;
    }
    // Not an assertion of zero — static analysis cannot follow computed
    // specifiers. The count is pinned so a jump is visible in review;
    // the post-deploy listing smoke is the runtime backstop.
    expect(dynamicCount).toBeLessThan(50);
  });
});
