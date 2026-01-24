const BASE = "https://data.cityofnewyork.us";

export function getSocrataToken(): string | undefined {
  return (
    process.env.NYC_SODA_APP_TOKEN ||
    process.env.NYC_SOCRATA_APP_TOKEN ||
    process.env.SOCRATA_APP_TOKEN ||
    process.env.SODA_APP_TOKEN ||
    process.env.NYC_SODA_TOKEN
  );
}

export function sodaTokenMasked(): string | null {
  const t = getSocrataToken();
  return t ? `${t.slice(0, 4)}…${t.slice(-4)}` : null;
}

function buildUrl(pathOrUrl: string, query?: Record<string, string | number | undefined>) {
  // Ensure resource has .json suffix
  const resource = pathOrUrl.endsWith(".json") ? pathOrUrl : `${pathOrUrl}.json`;
  const url =
    /^https?:\/\//i.test(resource)
      ? new URL(resource)
      : new URL(`/resource/${resource}`, BASE);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url;
}

/** Options object for soda() calls */
export interface SodaOptions {
  resource: string;
  where?: string;
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
  /** Additional RequestInit options for fetch */
  init?: RequestInit;
}

/**
 * Fetch JSON from Socrata. Automatically adds X-App-Token when available.
 * Returns an array of rows (Socrata always returns arrays).
 *
 * Usage (options object - preferred for route handlers):
 *   const rows = await soda<{ id: string }>({ resource: "3h2n-5cm9", where: "...", limit: 10 });
 *   // rows is { id: string }[]
 *
 * Usage (legacy string path):
 *   const rows = await sodaFetch("3h2n-5cm9.json", { query: { "$limit": 1 } });
 */
export async function soda<T = Record<string, unknown>>(options: SodaOptions): Promise<T[]>;
export async function soda<T = Record<string, unknown>>(
  pathOrUrl: string,
  opts?: { query?: Record<string, string | number | undefined>; init?: RequestInit }
): Promise<T[]>;
export async function soda<T = Record<string, unknown>>(
  arg1: string | SodaOptions,
  arg2?: { query?: Record<string, string | number | undefined>; init?: RequestInit }
): Promise<T[]> {
  const token = getSocrataToken();

  let url: URL;
  let init: RequestInit;

  if (typeof arg1 === "string") {
    // Legacy signature: soda(pathOrUrl, opts?)
    url = buildUrl(arg1, arg2?.query);
    init = {
      ...(arg2?.init || {}),
      // Server-side: revalidate every 60s by default
      next: { revalidate: 60 },
      headers: {
        accept: "application/json",
        ...(token ? { "X-App-Token": token } : {}),
        ...(arg2?.init?.headers || {}),
      },
    } as RequestInit;
  } else {
    // Options object signature: soda({ resource, where, select, order, limit, offset })
    const { resource, where, select, order, limit, offset, init: customInit } = arg1;
    const query: Record<string, string | number | undefined> = {};
    if (where) query["$where"] = where;
    if (select) query["$select"] = select;
    if (order) query["$order"] = order;
    if (limit !== undefined) query["$limit"] = limit;
    if (offset !== undefined) query["$offset"] = offset;

    url = buildUrl(resource, query);
    init = {
      ...(customInit || {}),
      // Server-side: revalidate every 60s by default
      next: { revalidate: 60 },
      headers: {
        accept: "application/json",
        ...(token ? { "X-App-Token": token } : {}),
        ...(customInit?.headers || {}),
      },
    } as RequestInit;
  }

  const r = await fetch(url.toString(), init);
  const text = await r.text();
  let json: T[] | undefined = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // JSON parse failed, will use text in error
  }

  if (!r.ok) {
    const body = json ?? text;
    const errJson = json as unknown as Record<string, unknown> | undefined;
    const code =
      (errJson && ("code" in errJson || "message" in errJson)
        ? errJson.code || errJson.message
        : null) || `${r.status} ${r.statusText}`;
    throw new Error(
      `SODA ${code}: ${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`
    );
  }

  return json ?? [];
}

// Back-compat alias
export const sodaFetch = soda;

export default { soda, sodaFetch, getSocrataToken, sodaTokenMasked };
