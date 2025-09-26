// lib/soda.ts
export type SodaResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; body?: any };

function buildUrl(datasetId: string, params?: Record<string, string | number | boolean | undefined>) {
  const u = new URL(`https://data.cityofnewyork.us/resource/${datasetId}.json`);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    u.searchParams.set(k, String(v));
  });
  return u.toString();
}

async function fetchJSON(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const txt = await r.text();
  let j: any = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
  return { ok: r.ok, status: r.status, json: j };
}

/**
 * Robust Socrata GET:
 * - Tries with NYC_SODA_APP_TOKEN header if present.
 * - If 403 permission_denied (invalid app_token), retries WITHOUT a token.
 */
export async function sodaGet<T = any>(
  datasetId: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<SodaResult<T>> {
  const url = buildUrl(datasetId, params);
  const token = process.env.NYC_SODA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || undefined;

  const doFetch = async (withToken: boolean) =>
    fetchJSON(url, withToken && token ? { headers: { "X-App-Token": token } } : undefined);

  // 1) with token (if provided)
  let r = await doFetch(true);

  // 403 with "permission_denied" → try again without token
  if (!r.ok && r.status === 403 && typeof r.json === "object" && r.json?.code === "permission_denied") {
    r = await doFetch(false);
  }

  if (r.ok) return { ok: true, data: r.json as T };
  return {
    ok: false,
    error: `SODA ${datasetId} ${r.status}: ${typeof r.json === "string" ? r.json : JSON.stringify(r.json, null, 2)}`,
    status: r.status,
    body: r.json,
  };
}
