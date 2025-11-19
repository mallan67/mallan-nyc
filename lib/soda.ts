// lib/soda.ts — robust Socrata/SODA helper (safe stub)
const BASE = "https://data.cityofnewyork.us";

export function getSocrataToken(): string | undefined {
  return (
    process.env.NYC_SODA_APP_TOKEN ||
    process.env.SOCRATA_APP_TOKEN ||          // alternate name you may have created
    process.env.NYC_SODA_TOKEN ||             // legacy fallback
    undefined
  );
}

export function sodaTokenMasked(): string | null {
  const t = getSocrataToken();
  return t ? `${t.slice(0,4)}…${t.slice(-4)}` : null;
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
 * Returns parsed JSON, or null on error.
 */
export async function sodaFetch(
  pathOrUrl: string,
  opts?: { query?: Record<string, any>; init?: RequestInit }
): Promise<any | null> {
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

  try {
    const r = await fetch(url.toString(), init);
    if (!r.ok) return null;
    try {
      return await r.json();
    } catch {
      // fallback to text parse
      const txt = await r.text();
      if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    }
  } catch {
    return null;
  }
}

/** Convenience wrapper to match previous API */
export async function soda(datasetId: string, opts?: { query?: Record<string, any> }) {
  return sodaFetch(datasetId, opts);
}
