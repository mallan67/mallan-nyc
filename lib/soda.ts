// lib/soda.ts
const SODA_HOST = "https://data.cityofnewyork.us";
const RAW_TOKEN =
  (process.env.NYC_SODA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || "").trim();

const HEADERS: Record<string, string> = RAW_TOKEN
  ? { "X-App-Token": RAW_TOKEN, Accept: "application/json" }
  : { Accept: "application/json" };

const mask = (s?: string | null) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : null);

export function sodaTokenMasked() {
  return mask(RAW_TOKEN);
}

export async function sodaFetch(dataset: string, qs: Record<string, any> = {}) {
  if (!dataset) {
    return { ok: false, error: "Missing dataset id" };
  }
  if (!RAW_TOKEN) {
    return { ok: false, error: "Missing NYC_SODA_APP_TOKEN" };
  }

  const url = new URL(`${SODA_HOST}/resource/${dataset}.json`);
  // default limit if caller didn't set one
  if (!("$limit" in qs)) qs["$limit"] = "50";
  for (const [k, v] of Object.entries(qs)) {
    url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: HEADERS,
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {}

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        url: url.toString(),
        error: `SODA ${dataset} ${res.status}: ${text.slice(0, 400)}`,
      };
    }
    return { ok: true, url: url.toString(), data: json };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
