/// <reference types="jest" />
// Test helpers for runtime side-effect tests.
//
// These tests verify that high-risk routes actually produce the side
// effects they claim — the "silent no-op" blind spot in the previous
// validator suite.
//
// Strategy: import each route's POST/GET handler directly, invoke with a
// mock NextRequest, assert response shape AND assert that mocked Prisma
// methods were called with expected args.
//
// File-scoped jest type reference: Next.js's build-time TypeScript check
// scans this file regardless of tsconfig `exclude` patterns. The triple-
// slash directive at line 1 tells tsc to include @types/jest typings just
// for this file, keeping jest globals resolved without polluting the
// project-wide types whitelist (`compilerOptions.types`).

import type { NextRequest } from 'next/server';

/**
 * Create a minimal NextRequest mock with JSON body + headers.
 * Avoids spinning up an HTTP server.
 */
export function makeRequest(opts: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}): NextRequest {
  const { method = 'POST', url = 'http://localhost/api/test', body, headers = {} } = opts;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
    // Wire-realism: real incoming requests always carry Content-Length for
    // fixed-size bodies (undici's constructed Request does not store it).
    // Routes with declared-length gates (Codex #473 r2) depend on it.
    headers['content-length'] = String(Buffer.byteLength(init.body));
  }
  // NextRequest extends Request; the cast lets us bypass NextRequest-specific
  // fields the route handlers don't actually read in tests.
  return new Request(url, init) as unknown as NextRequest;
}

/**
 * Build a Jest-compatible chained mock for prisma.<model>.<method>.
 * Returns ({ prisma, calls }) where prisma is the mock object and calls is a
 * map of "model.method" → array of call args.
 */
export function buildPrismaMock(seed: Record<string, Record<string, unknown>> = {}) {
  const calls: Record<string, unknown[][]> = {};

  function recordCall(modelName: string, methodName: string, args: unknown[]) {
    const key = `${modelName}.${methodName}`;
    (calls[key] ??= []).push(args);
  }

  function makeModel(modelName: string) {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        // Default behavior: return null for find*, return seed[modelName] for create/update,
        // return [] for findMany. Tests can override with seed[modelName].
        const fn = jest.fn(async (...args: unknown[]) => {
          recordCall(modelName, prop, args);
          if (prop === 'findUnique' || prop === 'findFirst') return null;
          if (prop === 'findMany') return [];
          if (prop === 'count') return 0;
          if (prop === 'create' || prop === 'update' || prop === 'upsert') {
            return (seed[modelName] as Record<string, unknown>)?.[prop] ?? args[0];
          }
          if (prop === 'delete' || prop === 'deleteMany') return { count: 0 };
          return null;
        });
        target[prop] = fn;
        return fn;
      },
    };
    const target: Record<string, unknown> = (seed[modelName] as Record<string, unknown>) || {};
    return new Proxy(target, handler);
  }

  // Cache one model proxy per model name so override assignments stick.
  const modelCache = new Map<string, Record<string, unknown>>();

  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_, modelName: string) {
      if (modelName.startsWith('$')) {
        return jest.fn(async (cb: (tx: unknown) => unknown) => {
          if (modelName === '$transaction' && typeof cb === 'function') {
            return cb(prisma);
          }
          return null;
        });
      }
      const cached = modelCache.get(modelName);
      if (cached) return cached;
      const fresh = makeModel(modelName);
      modelCache.set(modelName, fresh);
      return fresh;
    },
  });

  return { prisma, calls };
}

/**
 * Pull the JSON body out of a Response. Wraps the .json() call for type ergonomics.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
