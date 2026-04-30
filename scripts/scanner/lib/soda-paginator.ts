/**
 * scripts/scanner/lib/soda-paginator.ts
 *
 * Streaming paginator for NYC OpenData (Socrata) datasets. Wraps the
 * existing `lib/soda.ts` helper with offset-based pagination so we can
 * iterate large datasets (PLUTO, ACRIS) without buffering the full
 * result set in memory.
 *
 * Socrata limits:
 *   - $limit max 50,000 per request
 *   - X-App-Token is auto-applied by lib/soda when configured
 *   - 5xx responses get retried with exponential backoff
 */
import { soda } from "@/lib/soda";

export interface SodaPaginatorOptions {
  /** Dataset id (e.g. "bnx9-e6tj") OR a full URL. */
  resource: string;
  /** Optional SoQL $where clause. */
  where?: string;
  /** Optional SoQL $select. */
  select?: string;
  /** Optional SoQL $order — defaults to ":id" for stable paging. */
  order?: string;
  /** Page size (max 50000). Default 10000. */
  pageSize?: number;
  /** Hard cap on total rows pulled. Default Infinity. */
  maxRows?: number;
  /** Retries on transient errors. Default 3. */
  retries?: number;
  /** Optional progress callback per page. */
  onPage?: (info: { offset: number; pageRows: number; totalSoFar: number }) => void;
}

const DEFAULT_PAGE_SIZE = 10000;
const SOCRATA_HARD_LIMIT = 50000;

async function withRetry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const wait = Math.min(2000, 250 * Math.pow(2, attempt));
      console.warn(`[soda-paginator] ${label} attempt ${attempt + 1}/${retries} failed: ${(err as Error).message} — retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Async iterator over Socrata rows. Pages by `$offset` with a stable
 * `$order=:id` so we don't miss or duplicate rows on data updates
 * during a long pull.
 */
export async function* iterateSoda<T = Record<string, unknown>>(
  options: SodaPaginatorOptions,
): AsyncGenerator<T, void, unknown> {
  const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, SOCRATA_HARD_LIMIT);
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const retries = options.retries ?? 3;
  const order = options.order ?? ":id";

  let offset = 0;
  let totalSoFar = 0;

  while (totalSoFar < maxRows) {
    const remaining = maxRows - totalSoFar;
    const limit = Math.min(pageSize, remaining);

    const rows = await withRetry(
      () => soda<T>({
        resource: options.resource,
        where: options.where,
        select: options.select,
        order,
        limit,
        offset,
      }),
      retries,
      `${options.resource}@${offset}`,
    );

    if (!rows || rows.length === 0) return;

    for (const row of rows) {
      yield row;
      totalSoFar++;
      if (totalSoFar >= maxRows) break;
    }

    options.onPage?.({ offset, pageRows: rows.length, totalSoFar });

    if (rows.length < limit) return; // last page
    offset += rows.length;
  }
}

/** Convenience: collect into an array. Use sparingly — defeats streaming. */
export async function collectSoda<T = Record<string, unknown>>(
  options: SodaPaginatorOptions,
): Promise<T[]> {
  const out: T[] = [];
  for await (const row of iterateSoda<T>(options)) out.push(row);
  return out;
}

/** Required env vars + dataset-id resolver. */
export function resolveDatasetId(
  envVarNames: string[],
  fallback?: string,
): { id: string; from: string } | null {
  for (const name of envVarNames) {
    const v = process.env[name];
    if (v && v.trim()) return { id: v.trim(), from: name };
  }
  if (fallback) return { id: fallback, from: "fallback-default" };
  return null;
}
