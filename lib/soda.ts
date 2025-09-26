// lib/soda.ts  (copy all / replace all)
const SODA_TOKEN =
  process.env.NYC_SODA_APP_TOKEN ||
  process.env.SOCRATA_APP_TOKEN ||      // NYC portal name
  process.env.SODA_APP_TOKEN ||          // common alt
  "";

export async function sodaFetch(dataset: string, qs: Record<string, string | number> = {}, init: RequestInit = {}) {
  const base = `https://data.cityofnewyork.us/resource/${dataset}.json`;

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) if (v !== undefined && v !== null) search.set(k, String(v));
  const url = `${base}${search.toString() ? "?" + search.toString() : ""}`;

  const headers: Record<string, string> = {
    ...(init.headers as any),
    ...(SODA_TOKEN ? { "X-App-Token": SODA_TOKEN } : {}),
  };

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();

  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    throw new Error(
      `SODA ${dataset} ${res.status}: ${text || res.statusText}`
    );
  }
  return json;
}
