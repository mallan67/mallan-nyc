<<<<<<< HEAD
﻿// lib/soda.ts
=======
// lib/soda.ts
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
const BASE = "https://data.cityofnewyork.us";

export function getSocrataToken(): string | undefined {
  return (
    process.env.NYC_SODA_APP_TOKEN ||
<<<<<<< HEAD
    process.env.NYC_SOCRATA_APP_TOKEN ||
    process.env.SOCRATA_APP_TOKEN ||
    process.env.SODA_APP_TOKEN ||
=======
    process.env.SOCRATA_APP_TOKEN ||
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
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
<<<<<<< HEAD
 * Generic JSON fetcher for Socrata/SODA. Returns parsed JSON array, or throws on non-OK.
 *
 * Supports:
 *  - sodaFetch<T>(datasetIdOrUrl, { query: { "$where": "...", "$select": "...", ... } })
 *  - sodaFetch<T>({ resource, where, select, order, limit, query, init })
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
): Promise<T[]> {
  // normalize arguments
  let pathOrUrl = typeof pathOrUrlOrOpts === "string" ? pathOrUrlOrOpts : (pathOrUrlOrOpts?.resource || "");
  let finalQuery: Record<string, any> = opts?.query ? { ...opts.query } : {};
  let finalInit: RequestInit | undefined = opts?.init;

  if (typeof pathOrUrlOrOpts === "object" && pathOrUrlOrOpts !== null) {
    const o: any = pathOrUrlOrOpts;
    finalQuery = { ...(o.query || {}) };

    if (o.where) finalQuery["$where"] = o.where;
    if (o.select) finalQuery["$select"] = o.select;
    if (o.order) finalQuery["$order"] = o.order;
    if (o.limit !== undefined && o.limit !== null) finalQuery["$limit"] = String(o.limit);

    finalInit = o.init || finalInit;
  }

=======
 * Generic JSON fetcher for Socrata/SODA. Returns parsed JSON, or throws on non-OK.
 */
export async function sodaFetch<T = any>(
  pathOrUrl: string,
  opts?: { query?: Record<string, any>; init?: RequestInit }
): Promise<T> {
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
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
<<<<<<< HEAD
    // ignore parse error; we'll handle below
=======
    // ignore parse error, we'll handle below
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
  }

  if (!r.ok) {
    const body = json ?? text;
    const code = (json && (json.code || json.message)) || `${r.status} ${r.statusText}`;
<<<<<<< HEAD
    throw new Error(`SODA ${code}: ${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`);
  }

  // normalize to array
  if (json === undefined || json === null) return [] as T[];
  if (Array.isArray(json)) return json as T[];
  // sometimes SODA returns an object for a single record; normalize to an array
  return [json] as T[];
=======
    throw new Error(
      `SODA ${code}: ${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`
    );
  }

  return json as T;
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
}

// Back-compat aliases
export const soda = sodaFetch;
export default { sodaFetch, getSocrataToken, sodaTokenMasked };
<<<<<<< HEAD

=======
>>>>>>> 42ece2aa7ea9f775c94370cc19c2489e2ad4b000
