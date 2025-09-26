const SODA_HOST = process.env.NYC_SODA_DOMAIN || 'data.cityofnewyork.us';
const APP_TOKEN = process.env.NYC_SODA_APP_TOKEN || '';

export type SodaQuery = {
  resource: string;                  // dataset id
  select?: string;
  where?: string;
  limit?: number;
  offset?: number;
  order?: string;
  params?: Record<string, string | number | boolean>;
};

export async function soda<T = any>({
  resource, select, where, limit = 50, offset = 0, order, params = {},
}: SodaQuery): Promise<T[]> {
  const u = new URL(`https://${SODA_HOST}/resource/${resource}.json`);
  if (select) u.searchParams.set('$select', select);
  if (where)  u.searchParams.set('$where', where);
  if (order)  u.searchParams.set('$order', order);
  u.searchParams.set('$limit', String(limit));
  u.searchParams.set('$offset', String(offset));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));

  const r = await fetch(u.toString(), {
    headers: APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : undefined,
    cache: 'no-store', next: { revalidate: 0 },
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`SODA ${resource} ${r.status}: ${text}`);
  }
  return r.json() as Promise<T[]>;
}
