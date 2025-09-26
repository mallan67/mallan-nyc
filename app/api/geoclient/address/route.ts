import { NextResponse } from "next/server";
export const runtime = "nodejs";

async function fetchGeoclient(input: string) {
  const SUB_KEY = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || "";
  const APP_ID  = process.env.NYC_GEOCLIENT_APP_ID || "";
  const APP_KEY = process.env.NYC_GEOCLIENT_APP_KEY || "";

  // Try new host with subscription header first
  if (SUB_KEY) {
    const u = new URL("https://api.nyc.gov/geo/geoclient/v1/search.json");
    u.searchParams.set("input", input);
    const r = await fetch(u.toString(), {
      headers: { "Ocp-Apim-Subscription-Key": SUB_KEY },
      cache: "no-store",
    });
    // If not authorized, throw to surface the real error
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Geoclient ${r.status}: ${t}`);
    }
    return r.json();
  }

  // Legacy fallback (older credentials)
  if (APP_ID && APP_KEY) {
    const u = new URL("https://api.cityofnewyork.us/geoclient/v1/search.json");
    u.searchParams.set("input", input);
    u.searchParams.set("app_id", APP_ID);
    u.searchParams.set("app_key", APP_KEY);
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Geoclient-legacy ${r.status}: ${t}`);
    }
    return r.json();
  }

  // Neither auth method provided
  throw new Error(
    "Missing NYC Geoclient credentials. Provide NYC_GEOCLIENT_SUBSCRIPTION_KEY (preferred) or NYC_GEOCLIENT_APP_ID + NYC_GEOCLIENT_APP_KEY."
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = (url.searchParams.get("input") || url.searchParams.get("q") || "").trim();
    if (!input) return NextResponse.json({ ok: false, error: "missing input" }, { status: 400 });

    const json = await fetchGeoclient(input);

    const first = json?.results?.[0]?.response || {};
    const bin = first?.buildingIdentificationNumber || undefined;
    const bbl =
      first?.bbl ||
      (first?.bblBoroughCode && first?.bblBlock && first?.bblLot
        ? `${first.bblBoroughCode}${first.bblBlock}${first.bblLot}`
        : undefined);

    return NextResponse.json({ ok: true, input, bin, bbl, raw: json });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
  }
}
