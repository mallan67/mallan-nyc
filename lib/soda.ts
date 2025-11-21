 // lib/soda.ts
const BASE = "https://data.cityofnewyork.us";

export function getSocrataToken(): string | undefined {
  return (
    process.env.NYC_SODA_APP_TOKEN ||
    process.env.SOCRATA_APP_TOKEN ||
    process.env.NYC_SODA_TOKEN ||
    undefined
  );
}

export function sodaTokenMasked(): string | null {
  const t = getSocrataToken();
  return t ? `${t.slice(0, 4)}…${t.slice(-4)}` : null;
}

function buildUrl(pathOrUrl: string, query?: Record<string, any>) {
  const url =
    /^https?:\/\//i.test(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(`/resource/${pathOrUrl}`, BASE);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url;
}

/**
 * Generic JSON fetcher for Socrata/SODA. Returns parsed JSON, or throws on non-OK.
 *
 * Supports two calling forms:
 *  - sodaFetch<T>(datasetIdOrUrl, { query: { "$where": "...", "$select": "...", ... } })
 *  - sodaFetch<T>({ resource: datasetId, where, select, order, limit, query, init })
 */
export async function sodaFetch<T = any>(
  pathOrUrlOrOpts: string | {
    resource?: string;
    where?: string;
    select?: string;
    order?: string;
    limit?: number;
    query?: Record<string, any>;
    init?: RequestInit;
  },
  opts?: { query?: Record<string, any>; init?: RequestInit }
): Promise<T> {
  // normalize arguments so callers can supply either a string+opts or a single options object
  let pathOrUrl = typeof pathOrUrlOrOpts === "string" ? pathOrUrlOrOpts : (pathOrUrlOrOpts?.resource || "");
  let finalQuery: Record<string, any> | undefined = opts?.query;
  let finalInit: RequestInit | undefined = opts?.init;

  if (typeof pathOrUrlOrOpts === "object") {
    const o: any = pathOrUrlOrOpts;
    // if caller provided a query object, start from that
    finalQuery = { ...(o.query || {}) };

    // map common helpers to Socrata-style params
    if (o.where) finalQuery["$where"] = o.where;
    if (o.select) finalQuery["$select"] = o.select;
    if (o.order) finalQuery["$order"] = o.order;
    if (o.limit !== undefined && o.limit !== null) finalQuery["$limit"] = String(o.limit);

    // init may be present on either place
    finalInit = o.init || finalInit;
  }

  const token = getSocrataToken();
  const url = buildUrl(pathOrUrl, finalQuery);

  const init: RequestInit = {
    ...(finalInit || {}),
    headers: {
      accept: "application/json",
      ...(token ? { "X-App-Token": token } : {}),
      ...((finalInit && (finalInit as any).headers) || {}),
    },
  };

  const r = await fetch(url.toString(), init);
  const text = await r.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // ignore parse error, we'll handle below
  }

  if (!r.ok) {
    const body = json ?? text;
    const code = (json && (json.code || json.message)) || `${r.status} ${r.statusText}`;
    throw new Error(
      `SODA ${code}: ${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`
    );
  }

  return json as T;
}

// Back-compat aliases
export const soda = sodaFetch;
export default { sodaFetch, getSocrataToken, sodaTokenMasked };
