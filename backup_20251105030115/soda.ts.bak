// lib/soda.ts
const BASE = "https://data.cityofnewyork.us";

export function getSocrataToken(): string | undefined {
  return (
    process.env.NYC_SODA_APP_TOKEN ||
    process.env.SOCRATA_APP_TOKEN ||          // alternate name you created
    process.env.NYC_SODA_TOKEN ||             // legacy fallback
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
 * Fetch JSON from Socrata. Automatically adds X-App-Token when available.
 *
 * Usage:
 *   const rows = await sodaFetch("3h2n-5cm9.json", { query: { "$limit": 1 } });
 */
export async function sodaFetch(
  pathOrUrl: string,
  opts?: { query?: Record<string, any>; init?: RequestInit }
) {
  const token = getSocrataToken();
  const url = buildUrl(pathOrUrl, opts?.query);

  const init: RequestInit = {
    ...(opts?.init || {}),
    headers: {
      accept: "application/json",
      ...(token ? { "X-App-Token": token } : {}),
      ...(opts?.init?.headers || {}),
    },
  };

  const r = await fetch(url.toString(), init);
  const text = await r.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {}

  if (!r.ok) {
    const body = json ?? text;
    const code =
      (json && (json.code || json.message)) || `${r.status} ${r.statusText}`;
    throw new Error(
      `SODA ${code}: ${
        typeof body === "string" ? body : JSON.stringify(body, null, 2)
      }`
    );
  }

  return json;
}

// Back-compat aliases so older imports don't break
export const soda = sodaFetch;
export default { sodaFetch, getSocrataToken, sodaTokenMasked };
