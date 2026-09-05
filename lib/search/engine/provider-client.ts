/**
 * PROVIDER CLIENT — one thin, fail-loud reader over the Cotality API.
 *
 * Read-only GET. Credentials come from the environment through the existing
 * token cache; they are never logged. Every non-2xx response is an error with
 * its status and body, never an empty result. A walk stops on an empty page
 * or a short page; `@odata.nextLink` alone is NOT proof of more rows, because
 * the provider emits it even when every row was returned (Builder probe c).
 */

import { getAccessToken, invalidateToken } from '@/lib/idx/auth';

export class ProviderError extends Error {
  constructor(message: string, readonly status: number | null, readonly body: string, readonly url: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

function base(): string {
  return (process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle').replace(/\/$/, '');
}

export interface ProviderQueryOptions {
  resource: 'Property' | 'Media' | 'OpenHouse';
  select?: readonly string[];
  filter?: string;
  orderby?: string;
  top?: number;
  skip?: number;
  count?: boolean;
}

export interface ProviderPage<T = Record<string, unknown>> {
  value: T[];
  count: number | null;
  nextLink: string | null;
}

export function buildUrl(o: ProviderQueryOptions): string {
  const url = new URL(`${base()}/odata/${o.resource}`);
  if (o.select?.length) url.searchParams.set('$select', o.select.join(','));
  if (o.filter) url.searchParams.set('$filter', o.filter);
  if (o.orderby) url.searchParams.set('$orderby', o.orderby);
  if (o.top != null) url.searchParams.set('$top', String(o.top));
  if (o.skip) url.searchParams.set('$skip', String(o.skip));
  if (o.count) url.searchParams.set('$count', 'true');
  return url.toString();
}

async function getJson(url: string, attempt = 0): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && attempt === 0) {
    invalidateToken();
    return getJson(url, 1);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(`Cotality ${res.status} for ${new URL(url).pathname}`, res.status, text.slice(0, 2000), url);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError('Cotality returned non-JSON', res.status, text.slice(0, 500), url);
  }
}

export async function queryProvider<T = Record<string, unknown>>(o: ProviderQueryOptions): Promise<ProviderPage<T>> {
  const json = await getJson(buildUrl(o));
  const value = Array.isArray(json.value) ? (json.value as T[]) : null;
  if (value === null) throw new ProviderError('Cotality response has no value array', 200, JSON.stringify(json).slice(0, 500), buildUrl(o));
  const rawCount = json['@odata.count'];
  return {
    value,
    count: rawCount == null ? null : Number(rawCount),
    nextLink: typeof json['@odata.nextLink'] === 'string' ? (json['@odata.nextLink'] as string) : null,
  };
}

export interface WalkResult<T> {
  rows: T[];
  /** `@odata.count` from the first page, when requested. */
  count: number | null;
  pages: number;
  /** false when the page cap was reached before the walk ended — the caller must not claim exactness. */
  complete: boolean;
}

/**
 * Walk every page of a query. Stops when a page is empty, shorter than `top`,
 * or has no nextLink; never trusts nextLink alone. Bounded by `maxPages`.
 */
export async function walkProvider<T = Record<string, unknown>>(
  o: ProviderQueryOptions & { top: number },
  maxPages = 25
): Promise<WalkResult<T>> {
  const rows: T[] = [];
  let next: string | null = buildUrl({ ...o, count: true });
  let count: number | null = null;
  let pages = 0;
  while (next) {
    if (pages >= maxPages) return { rows, count, pages, complete: false };
    const json = await getJson(next);
    pages++;
    const batch = Array.isArray(json.value) ? (json.value as T[]) : [];
    if (count === null && json['@odata.count'] != null) count = Number(json['@odata.count']);
    rows.push(...batch);
    if (batch.length === 0 || batch.length < o.top) break;
    next = typeof json['@odata.nextLink'] === 'string' ? (json['@odata.nextLink'] as string) : null;
  }
  return { rows, count, pages, complete: true };
}
