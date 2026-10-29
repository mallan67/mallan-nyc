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

// ── Listing viewer live loader (Sales Tools / Rental Tools read-only pages) ────────────
//
// public/crm/js/core/listing-viewer-live.js is the ONE loader both viewers call from both of
// their blocks (the initial MallanAPI.onReady fetch and the postMessage handler). It reads an
// RLS listing live from Cotality through the agent search route and a Mallan-only SL-/RL-
// listing from the CRM record. The tests execute that file as the browser would, with the only
// globals it touches stubbed, instead of regex-pinning hydration lines inside the viewer HTML.
import { readFileSync } from 'fs';
import { join } from 'path';
import { createContext, runInContext } from 'vm';

export interface ViewerLiveHarness {
  /** window.viewerLiveListing(id, side) → the CRM-shaped record of a live RLS listing (rejects when live Cotality has none) */
  viewerLiveListing: (id: string, side: 'sale' | 'rental') => Promise<Record<string, any>>;
  /** window.viewerLiveRecord(mapped, raw, id, side) — the shaping alone */
  viewerLiveRecord: (l: Record<string, unknown>, raw: Record<string, unknown>, id: string, side: 'sale' | 'rental') => Record<string, any>;
  /** window.viewerLiveMedia(id) → { photos, plans } from /api/media/batch */
  viewerLiveMedia: (id: string) => Promise<{ photos: string[]; plans: string[] }>;
  /** window.viewerMallanSide(id): SL- → 'sale', RL- → 'rental', anything else → null */
  viewerMallanSide: (id: string) => 'sale' | 'rental' | null;
  /** MallanAPI.idx.search → GET /api/idx/search (live Cotality through the agent search route) */
  idxSearch: jest.Mock;
  /** MallanAPI.listings.get → GET /api/crm/listings/:id (Mallan-only SL-/RL- records) */
  listingsGet: jest.Mock;
  /** fetch → GET /api/media/batch (photos and floor plans) */
  fetch: jest.Mock;
}

export const LISTING_VIEWER_LIVE_PATH = join(process.cwd(), 'public', 'crm', 'js', 'core', 'listing-viewer-live.js');

export function loadListingViewerLive(opts: {
  /** what /api/idx/search answers (already mapped by lib/search/crm-idx-mapper) */
  liveListings?: unknown[];
  /** what /api/crm/listings/:id answers */
  crmRecord?: Record<string, unknown>;
  /** what /api/media/batch answers, keyed by listing id */
  media?: Record<string, unknown[]>;
  /** a document stub ({ getElementById }) for the functions that fill the viewer's controls */
  document?: unknown;
} = {}): ViewerLiveHarness {
  const src = readFileSync(LISTING_VIEWER_LIVE_PATH, 'utf8');
  const idxSearch = jest.fn(async () => ({ listings: opts.liveListings || [] }));
  const listingsGet = jest.fn(async () => opts.crmRecord || {});
  const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ media: opts.media || {} }) }));
  const ctx: Record<string, unknown> = {
    console,
    fetch,
    MallanAPI: { idx: { search: idxSearch }, listings: { get: listingsGet } },
  };
  if (opts.document) ctx.document = opts.document;
  ctx.window = ctx;
  createContext(ctx);
  runInContext(src, ctx, { filename: 'listing-viewer-live.js' });
  return {
    viewerLiveListing: ctx.viewerLiveListing as ViewerLiveHarness['viewerLiveListing'],
    viewerLiveRecord: ctx.viewerLiveRecord as ViewerLiveHarness['viewerLiveRecord'],
    viewerLiveMedia: ctx.viewerLiveMedia as ViewerLiveHarness['viewerLiveMedia'],
    viewerMallanSide: ctx.viewerMallanSide as ViewerLiveHarness['viewerMallanSide'],
    idxSearch,
    listingsGet,
    fetch,
  };
}
