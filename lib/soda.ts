export const SODA_APP_TOKEN =
  process.env.NYC_SODA_APP_TOKEN ||
  process.env.SOCRATA_APP_TOKEN || ""; // accept either name

const BASE = "https://data.cityofnewyork.us/resource";

function err(msg: string, body?: any) {
  return {
    ok: false,
    error: body ? `${msg}: ${JSON.stringify(body, null, 2)}` : msg,
  };
}

export async function soda(dataset: string, params: Record<string, string> = {}) {
  if (!dataset) return err("Missing dataset id");
  const url = new URL(`${BASE}/${dataset}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {};
  if (SODA_APP_TOKEN) headers["X-App-Token"] = SODA_APP_TOKEN;

  const r = await fetch(url.toString(), { headers });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!r.ok) return err(`SODA ${dataset} ${r.status}`, json ?? text);
  return { ok: true, data: json, source: url.toString() };
}
